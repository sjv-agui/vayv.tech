const http = require('http');
const url = require('url');
const crypto = require('crypto');
const { query } = require('./db');
const { shannonEntropy, evaluateOracle, SOKI_ENTROPY_THRESHOLD, speedBucket, r1UnlockTypes, r2Bucket, r2UnlockTypes, r3Score } = require('./lib/scoring');

const PORT = process.env.PORT || 3000;
const DEMO_MODE = process.env.DEMO_MODE === 'true';
const MIN_PLAYERS = DEMO_MODE ? 1 : 10;
const VALID_PHASES = ['voting', 'ended'];

// Idempotent migration on boot — adds current_phase if missing.
(async function ensureSchemaExtras() {
  try {
    await query(`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS current_phase TEXT NOT NULL DEFAULT 'voting'`);
  } catch (e) { console.error('schema migration warning:', e.message); }
})();

function generateSessionCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Split text into n roughly-equal chunks. Tries sentence boundaries first,
// falls back to character-length slicing. Returns n strings (some may be empty).
function splitIntoChunks(text, n) {
  if (n <= 0) return [];
  if (!text) return Array(n).fill('');
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length >= n) {
    const buckets = Array.from({ length: n }, () => []);
    sentences.forEach((s, i) => buckets[i % n].push(s));
    return buckets.map(b => b.join(' '));
  }
  // Fallback: even character split
  const len = text.length;
  const chunkLen = Math.ceil(len / n);
  const chunks = [];
  for (let i = 0; i < n; i++) {
    chunks.push(text.slice(i * chunkLen, (i + 1) * chunkLen).trim());
  }
  return chunks;
}

// ── PHASE 2 ──────────────────────────────────────────────────

// POST /api/games — create game + host player
async function createGame(req, res) {
  const { username } = await parseBody(req);
  if (!username?.trim()) return json(res, 400, { error: 'username required' });

  const gameId = crypto.randomUUID();
  const playerId = crypto.randomUUID();
  const sessionCode = generateSessionCode();

  const realmRes = await query(`SELECT realm_id FROM realms WHERE is_active = true LIMIT 1`);
  if (!realmRes.rows.length) return json(res, 500, { error: 'no active realm' });
  const realmId = realmRes.rows[0].realm_id;

  await query(
    `INSERT INTO games (game_id, realm_id, session_code, status, created_at)
     VALUES ($1, $2, $3, 'waiting', NOW())`,
    [gameId, realmId, sessionCode]
  );
  await query(
    `INSERT INTO players (player_id, game_id, username, is_host, is_connected, joined_at)
     VALUES ($1, $2, $3, true, true, NOW())`,
    [playerId, gameId, username.trim()]
  );
  await query(`UPDATE games SET host_player_id = $1 WHERE game_id = $2`, [playerId, gameId]);

  json(res, 201, { game_id: gameId, session_code: sessionCode, player_id: playerId, is_host: true });
}

// POST /api/games/join — join existing game by session_code
async function joinGame(req, res) {
  const { session_code, username } = await parseBody(req);
  if (!session_code?.trim() || !username?.trim())
    return json(res, 400, { error: 'session_code and username required' });

  const gameRes = await query(
    `SELECT game_id, status FROM games WHERE session_code = $1`,
    [session_code.trim().toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });

  const game = gameRes.rows[0];
  if (game.status !== 'waiting') return json(res, 409, { error: 'game already started' });

  const countRes = await query(`SELECT COUNT(*) FROM players WHERE game_id = $1`, [game.game_id]);
  if (parseInt(countRes.rows[0].count) >= 12)
    return json(res, 409, { error: 'game is full' });

  const playerId = crypto.randomUUID();
  await query(
    `INSERT INTO players (player_id, game_id, username, is_host, is_connected, joined_at)
     VALUES ($1, $2, $3, false, true, NOW())`,
    [playerId, game.game_id, username.trim()]
  );

  json(res, 201, {
    game_id: game.game_id,
    session_code: session_code.trim().toUpperCase(),
    player_id: playerId,
    is_host: false,
  });
}

// GET /api/games/:code — lobby state (host sees full roster, others see counts)
async function getLobby(req, res, sessionCode) {
  const { query: qs } = url.parse(req.url, true);
  const callerPlayerId = qs.player_id || null;

  const gameRes = await query(
    `SELECT game_id, realm_id, session_code, status, host_player_id FROM games WHERE session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });

  const game = gameRes.rows[0];
  const playersRes = await query(
    `SELECT player_id, username, is_host, is_connected, joined_at
     FROM players WHERE game_id = $1 ORDER BY joined_at`,
    [game.game_id]
  );

  const isHost = callerPlayerId && callerPlayerId === game.host_player_id;
  const playerCount = playersRes.rows.length;
  const hostPresent = playersRes.rows.some(p => p.is_host && p.is_connected);

  if (isHost) {
    return json(res, 200, { game, players: playersRes.rows, player_count: playerCount, host_present: hostPresent });
  }

  // Non-host: only counts + their own row (so they can see themselves)
  const me = callerPlayerId
    ? playersRes.rows.find(p => p.player_id === callerPlayerId) || null
    : null;
  json(res, 200, {
    game: {
      game_id: game.game_id,
      session_code: game.session_code,
      status: game.status,
      // host_player_id intentionally omitted for non-hosts
    },
    players: me ? [me] : [],
    player_count: playerCount,
    host_present: hostPresent,
  });
}

// POST /api/games/:code/start — host starts the game (transitions waiting → playing)
async function startGame(req, res, sessionCode) {
  const { player_id } = await parseBody(req);
  if (!player_id) return json(res, 400, { error: 'player_id required' });

  const gameRes = await query(
    `SELECT game_id, status, host_player_id FROM games WHERE session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });

  const game = gameRes.rows[0];
  if (game.status !== 'waiting') return json(res, 409, { error: 'game already started' });
  if (game.host_player_id !== player_id) return json(res, 403, { error: 'only the host can start' });

  const countRes = await query(`SELECT COUNT(*) FROM players WHERE game_id = $1 AND NOT is_host`, [game.game_id]);
  if (parseInt(countRes.rows[0].count) < MIN_PLAYERS)
    return json(res, 409, { error: `need at least ${MIN_PLAYERS} players to start` });

  const killerPath = ['A', 'B', 'C'][Math.floor(Math.random() * 3)];
  await query(
    `UPDATE games SET status = 'playing', killer_path = $1 WHERE game_id = $2`,
    [killerPath, game.game_id]
  );

  json(res, 200, { status: 'playing', killer_path: killerPath });
}

// ── PHASE 3 ──────────────────────────────────────────────────

// POST /api/games/:code/round/start
async function startRound(req, res, sessionCode) {
  const { player_id } = await parseBody(req);
  if (!player_id) return json(res, 400, { error: 'player_id required' });

  const gameRes = await query(
    `SELECT g.game_id, g.realm_id, g.host_player_id, g.status,
            COALESCE(rc.group_size_avg, 4) AS group_size_avg
     FROM games g
     LEFT JOIN realm_config rc ON rc.realm_id = g.realm_id
     WHERE g.session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });

  const game = gameRes.rows[0];
  if (game.status !== 'playing') return json(res, 409, { error: 'game not in playing state' });
  if (game.host_player_id !== player_id) return json(res, 403, { error: 'only the host can start a round' });

  // Check no round is currently active
  const activeRound = await query(
    `SELECT round_id FROM rounds WHERE game_id = $1 AND status = 'active'`,
    [game.game_id]
  );
  if (activeRound.rows.length) return json(res, 409, { error: 'a round is already active' });

  // Determine next round number
  const roundCountRes = await query(
    `SELECT COUNT(*) FROM rounds WHERE game_id = $1`,
    [game.game_id]
  );
  const nextRoundNumber = parseInt(roundCountRes.rows[0].count) + 1;
  if (nextRoundNumber > 3) return json(res, 409, { error: 'all rounds complete' });

  // Pick a random active location (not used in a previous round of this game)
  const locationRes = await query(
    `SELECT location_id, name, description FROM locations
     WHERE realm_id = $1 AND is_active = true
       AND location_id NOT IN (
         SELECT location_id FROM rounds WHERE game_id = $2
       )
     ORDER BY RANDOM() LIMIT 1`,
    [game.realm_id, game.game_id]
  );
  if (!locationRes.rows.length) return json(res, 500, { error: 'no available locations' });
  const location = locationRes.rows[0];

  // Create round
  const roundId = crypto.randomUUID();
  await query(
    `INSERT INTO rounds (round_id, game_id, location_id, round_number, started_at, status)
     VALUES ($1, $2, $3, $4, NOW(), 'active')`,
    [roundId, game.game_id, location.location_id, nextRoundNumber]
  );

  // Get non-host players only (host is facilitator, not assigned a character)
  const playersRes = await query(
    `SELECT player_id FROM players WHERE game_id = $1 AND NOT is_host`,
    [game.game_id]
  );
  const charsRes = await query(
    `SELECT character_id, name, backstory FROM characters WHERE realm_id = $1`,
    [game.realm_id]
  );

  const players = shuffle(playersRes.rows);
  const characters = shuffle(charsRes.rows);

  // Pass 1: assign characters
  const ownerships = []; // { player, character }
  const assignments = [];
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const character = characters[i % characters.length];
    await query(
      `INSERT INTO character_assignments (assignment_id, game_id, round_id, player_id, character_id, assigned_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [crypto.randomUUID(), game.game_id, roundId, player.player_id, character.character_id]
    );
    ownerships.push({ player, character });
    assignments.push({ player_id: player.player_id, character_name: character.name });
  }

  // Form groups of group_size_avg players; persist to DB.
  // players array is already shuffled so slicing gives random groups.
  const groupSize = Math.max(2, parseInt(game.group_size_avg));
  const groupChunks = [];
  for (let i = 0; i < players.length; i += groupSize) {
    groupChunks.push(players.slice(i, i + groupSize));
  }
  // Map player_id → group index for O(1) lookup
  const playerGroupMap = new Map();
  for (let gi = 0; gi < groupChunks.length; gi++) {
    const groupId = crypto.randomUUID();
    await query(
      `INSERT INTO groups (group_id, game_id, formed_at_round) VALUES ($1, $2, $3)`,
      [groupId, game.game_id, nextRoundNumber]
    );
    for (const p of groupChunks[gi]) {
      await query(
        `INSERT INTO group_members (group_id, player_id) VALUES ($1, $2)`,
        [groupId, p.player_id]
      );
      playerGroupMap.set(p.player_id, gi);
    }
  }

  // Pass 2: split each character's backstory and distribute to owner's group-mates only.
  // Rule: a player never holds fragments of their own character (per DECISIONS [R1_FRAGMENT_GROUPS]).
  for (const { player: owner, character } of ownerships) {
    const gi = playerGroupMap.get(owner.player_id);
    const groupMates = groupChunks[gi].filter(p => p.player_id !== owner.player_id);
    if (!groupMates.length) continue;
    const chunks = splitIntoChunks(character.backstory || '', groupMates.length);
    for (let j = 0; j < groupMates.length; j++) {
      const content = chunks[j] || '';
      if (!content.trim()) continue;
      await query(
        `INSERT INTO personal_fragments (fragment_id, game_id, round_id, player_id, character_id, content, is_shared)
         VALUES ($1, $2, $3, $4, $5, $6, false)`,
        [crypto.randomUUID(), game.game_id, roundId, groupMates[j].player_id, character.character_id, content]
      );
    }
  }

  json(res, 201, {
    round_id: roundId,
    round_number: nextRoundNumber,
    location: { id: location.location_id, name: location.name, description: location.description },
    assignments, // public: player → character name only
  });
}

// GET /api/games/:code/round — public round state
async function getRound(req, res, sessionCode) {
  const gameRes = await query(
    `SELECT game_id FROM games WHERE session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });

  const gameId = gameRes.rows[0].game_id;

  const roundRes = await query(
    `SELECT r.round_id, r.round_number, r.status, r.started_at, r.current_phase,
            l.name AS location_name, l.description AS location_description
     FROM rounds r
     JOIN locations l ON l.location_id = r.location_id
     WHERE r.game_id = $1 AND r.status = 'active'
     LIMIT 1`,
    [gameId]
  );
  if (!roundRes.rows.length) return json(res, 404, { error: 'no active round' });

  const round = roundRes.rows[0];

  // Public assignments: player username → character name (no backstory)
  const assignmentsRes = await query(
    `SELECT p.player_id, p.username, c.name AS character_name, p.is_host
     FROM character_assignments ca
     JOIN players p ON p.player_id = ca.player_id
     JOIN characters c ON c.character_id = ca.character_id
     WHERE ca.round_id = $1
     ORDER BY p.joined_at`,
    [round.round_id]
  );

  json(res, 200, {
    round: {
      round_id: round.round_id,
      round_number: round.round_number,
      status: round.status,
      started_at: round.started_at,
      current_phase: round.current_phase || 'voting',
      location: { name: round.location_name, description: round.location_description },
    },
    assignments: assignmentsRes.rows,
  });
}

// GET /api/games/:code/round/me?player_id=xxx — private: my character + fragment
async function getMyCharacter(req, res, sessionCode) {
  const { query: qs } = url.parse(req.url, true);
  const playerId = qs.player_id;
  if (!playerId) return json(res, 400, { error: 'player_id required' });

  const gameRes = await query(
    `SELECT game_id FROM games WHERE session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });

  const gameId = gameRes.rows[0].game_id;

  const roundRes = await query(
    `SELECT round_id FROM rounds WHERE game_id = $1 AND status = 'active' LIMIT 1`,
    [gameId]
  );
  if (!roundRes.rows.length) return json(res, 404, { error: 'no active round' });

  const roundId = roundRes.rows[0].round_id;

  // Character (no backstory — that's split into fragments held by other players)
  const charRes = await query(
    `SELECT c.character_id, c.name, c.description, c.special_ability
     FROM character_assignments ca
     JOIN characters c ON c.character_id = ca.character_id
     WHERE ca.round_id = $1 AND ca.player_id = $2`,
    [roundId, playerId]
  );
  if (!charRes.rows.length) return json(res, 404, { error: 'assignment not found' });

  // Fragments held by this player — about OTHER characters.
  // Source character_id intentionally NOT returned: holders shouldn't know which character
  // each fragment is about (per PHILOSOPHY: "ambiguity is intentional").
  const fragsRes = await query(
    `SELECT fragment_id, content, is_shared
     FROM personal_fragments
     WHERE round_id = $1 AND player_id = $2
     ORDER BY fragment_id`,
    [roundId, playerId]
  );

  json(res, 200, {
    character: charRes.rows[0],
    fragments_held: fragsRes.rows,
  });
}



// POST /api/games/:code/vote — submit a vote on a vote_question
async function postVote(req, res, sessionCode) {
  const { player_id, vote_question_id, selected_option } = await parseBody(req);
  if (!player_id || !vote_question_id || !selected_option)
    return json(res, 400, { error: 'player_id, vote_question_id, selected_option required' });
  if (!['a', 'b', 'c', 'd'].includes(selected_option))
    return json(res, 400, { error: 'selected_option must be a, b, c, or d' });

  const gameRes = await query(
    `SELECT game_id FROM games WHERE session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });
  const gameId = gameRes.rows[0].game_id;

  const playerRes = await query(
    `SELECT player_id, is_host FROM players WHERE player_id = $1 AND game_id = $2`,
    [player_id, gameId]
  );
  if (!playerRes.rows.length) return json(res, 403, { error: 'player not in this game' });
  if (playerRes.rows[0].is_host) return json(res, 403, { error: 'host cannot vote' });

  // Active round (nullable in votes table, attach if any)
  const roundRes = await query(
    `SELECT round_id FROM rounds WHERE game_id = $1 AND status = 'active' LIMIT 1`,
    [gameId]
  );
  const roundId = roundRes.rows[0]?.round_id || null;

  try {
    const voteId = crypto.randomUUID();
    await query(
      `INSERT INTO votes (vote_id, game_id, round_id, player_id, vote_question_id, selected_option, cast_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [voteId, gameId, roundId, player_id, vote_question_id, selected_option]
    );
    return json(res, 201, { vote_id: voteId });
  } catch (e) {
    if (e.code === '23505') return json(res, 409, { error: 'already voted on this question' });
    throw e;
  }
}

// GET /api/games/:code/vote-questions/:phase — fetch active vote question for phase
async function getVoteQuestion(req, res, sessionCode, phase) {
  const validPhases = ['pre_game', 'post_round_1', 'post_round_2', 'final'];
  if (!validPhases.includes(phase)) return json(res, 400, { error: 'invalid phase' });

  const gameRes = await query(
    `SELECT realm_id FROM games WHERE session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });

  const vqRes = await query(
    `SELECT vote_question_id, question_text, option_a, option_b, option_c, option_d
     FROM vote_questions WHERE realm_id = $1 AND phase = $2 LIMIT 1`,
    [gameRes.rows[0].realm_id, phase]
  );
  if (!vqRes.rows.length) return json(res, 404, { error: 'no vote question for phase' });

  json(res, 200, vqRes.rows[0]);
}

// POST /api/games/:code/round/0/end — host closes R0 oracle vote, unlocks 1 sequence
async function endR0(req, res, sessionCode) {
  const { player_id } = await parseBody(req);
  if (!player_id) return json(res, 400, { error: 'player_id required' });

  const gameRes = await query(
    `SELECT game_id, realm_id, host_player_id FROM games WHERE session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });
  const game = gameRes.rows[0];
  if (game.host_player_id !== player_id) return json(res, 403, { error: 'only the host can close R0' });

  // Fetch pre_game vote_question
  const vqRes = await query(
    `SELECT vq.vote_question_id, vq.option_a, vq.option_b, vq.option_c, vq.option_d,
            str.result_if_agree, str.result_if_disagree
     FROM vote_questions vq
     LEFT JOIN soki_trigger_rules str ON str.vote_question_id = vq.vote_question_id
     WHERE vq.realm_id = $1 AND vq.phase = 'pre_game'
     LIMIT 1`,
    [game.realm_id]
  );
  if (!vqRes.rows.length) return json(res, 409, { error: 'no pre_game vote_question for this realm' });
  const vq = vqRes.rows[0];

  // Tally votes (R0 has no round_id — votes were cast with round_id = null)
  const tallyRes = await query(
    `SELECT selected_option, COUNT(*)::int AS n
     FROM votes WHERE game_id = $1 AND vote_question_id = $2
     GROUP BY selected_option`,
    [game.game_id, vq.vote_question_id]
  );
  const counts = { a: 0, b: 0, c: 0, d: 0 };
  for (const row of tallyRes.rows) counts[row.selected_option] = row.n;
  const total = counts.a + counts.b + counts.c + counts.d;

  const H = shannonEntropy([counts.a, counts.b, counts.c, counts.d]);
  const rule = { result_if_agree: vq.result_if_agree ?? 'truth', result_if_disagree: vq.result_if_disagree ?? 'soki' };
  const { outcome, highAgreement } = total > 0
    ? evaluateOracle(H, rule)
    : { outcome: rule.result_if_disagree, highAgreement: false };

  // Pick a sequence ref to unlock
  let seqRefId;
  if (outcome === 'truth') {
    const tsRes = await query(
      `SELECT truth_sequence_id FROM truth_sequences WHERE realm_id = $1 ORDER BY order_index LIMIT 1`,
      [game.realm_id]
    );
    seqRefId = tsRes.rows[0]?.truth_sequence_id;
  } else {
    const ssRes = await query(
      `SELECT soki_sequence_id FROM soki_sequences WHERE realm_id = $1 ORDER BY RANDOM() LIMIT 1`,
      [game.realm_id]
    );
    seqRefId = ssRes.rows[0]?.soki_sequence_id;
  }
  if (!seqRefId) return json(res, 409, { error: `no ${outcome}_sequence available for unlock` });

  // Avoid reusing a puzzle_piece_index already taken in this game
  const usedRes = await query(
    `SELECT puzzle_piece_index FROM sequence_unlocks WHERE game_id = $1`,
    [game.game_id]
  );
  const used = new Set(usedRes.rows.map(r => r.puzzle_piece_index));
  const available = Array.from({ length: 10 }, (_, i) => i + 1).filter(i => !used.has(i));
  if (!available.length) return json(res, 409, { error: 'all puzzle pieces already assigned' });
  const puzzlePieceIndex = available[Math.floor(Math.random() * available.length)];

  const unlockId = crypto.randomUUID();
  await query(
    `INSERT INTO sequence_unlocks (unlock_id, game_id, round_number, sequence_type, sequence_ref_id, puzzle_piece_index, unlocked_at)
     VALUES ($1, $2, 0, $3, $4, $5, NOW())`,
    [unlockId, game.game_id, outcome, seqRefId, puzzlePieceIndex]
  );

  json(res, 200, {
    unlock_id: unlockId,
    round_number: 0,
    sequence_type: outcome,
    sequence_ref_id: seqRefId,
    puzzle_piece_index: puzzlePieceIndex,
    tally: counts,
    total_votes: total,
    entropy: Number(H.toFixed(4)),
    high_agreement: highAgreement,
  });
}

// POST /api/games/:code/round/end — host ends round, evaluates votes
async function endRound(req, res, sessionCode) {
  const { player_id, vote_question_id } = await parseBody(req);
  if (!player_id) return json(res, 400, { error: 'player_id required' });

  const gameRes = await query(
    `SELECT game_id, realm_id, host_player_id FROM games WHERE session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });
  const game = gameRes.rows[0];
  if (game.host_player_id !== player_id) return json(res, 403, { error: 'only the host can end a round' });

  const roundRes = await query(
    `SELECT round_id, round_number FROM rounds WHERE game_id = $1 AND status = 'active' LIMIT 1`,
    [game.game_id]
  );
  if (!roundRes.rows.length) return json(res, 409, { error: 'no active round' });
  const round = roundRes.rows[0];

  // Resolve which vote_question to evaluate against
  let vqId = vote_question_id;
  if (!vqId) {
    // Default: pre_game (Q1) for round 1, post_round_N for later
    const phaseMap = { 1: 'pre_game', 2: 'post_round_1', 3: 'post_round_2' };
    const phase = phaseMap[round.round_number] || 'pre_game';
    const vqRes = await query(
      `SELECT vote_question_id FROM vote_questions WHERE realm_id = $1 AND phase = $2 LIMIT 1`,
      [game.realm_id, phase]
    );
    if (!vqRes.rows.length) return json(res, 409, { error: `no vote_question for phase ${phase}` });
    vqId = vqRes.rows[0].vote_question_id;
  }

  // Tally votes
  const tallyRes = await query(
    `SELECT selected_option, COUNT(*)::int AS n
     FROM votes WHERE game_id = $1 AND vote_question_id = $2
     GROUP BY selected_option`,
    [game.game_id, vqId]
  );
  const counts = { a: 0, b: 0, c: 0, d: 0 };
  for (const row of tallyRes.rows) counts[row.selected_option] = row.n;
  const total = counts.a + counts.b + counts.c + counts.d;

  // Shannon entropy → trigger
  const H = shannonEntropy([counts.a, counts.b, counts.c, counts.d]);
  const lookupRule = await query(
    `SELECT result_if_agree, result_if_disagree FROM soki_trigger_rules
     WHERE vote_question_id = $1 LIMIT 1`,
    [vqId]
  );
  const rule = lookupRule.rows[0];
  const { outcome, highAgreement } = total > 0
    ? evaluateOracle(H, rule)
    : { outcome: rule?.result_if_disagree ?? 'truth', highAgreement: false };

  // Pick a truth_sequence row to record evaluation against (first by order_index)
  const tsRes = await query(
    `SELECT truth_sequence_id FROM truth_sequences WHERE realm_id = $1 ORDER BY order_index LIMIT 1`,
    [game.realm_id]
  );
  if (tsRes.rows.length) {
    await query(
      `INSERT INTO sequence_evaluations (evaluation_id, game_id, truth_sequence_id, match_accuracy, score_delta, soki_penalty_total, evaluated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        crypto.randomUUID(),
        game.game_id,
        tsRes.rows[0].truth_sequence_id,
        highAgreement ? 1 - (H / 2.0) : H / 2.0, // rough proxy; full math post-MVP
        outcome === 'truth' ? 1.0 : -1.0,
        outcome === 'soki' ? 1.0 : 0,
      ]
    );
  }

  // Mark round completed
  await query(
    `UPDATE rounds SET status = 'completed' WHERE round_id = $1`,
    [round.round_id]
  );

  // If final round, mark game finished
  if (round.round_number >= 3) {
    await query(`UPDATE games SET status = 'finished' WHERE game_id = $1`, [game.game_id]);
  }

  json(res, 200, {
    round_id: round.round_id,
    round_number: round.round_number,
    vote_question_id: vqId,
    tally: counts,
    total_votes: total,
    entropy: Number(H.toFixed(4)),
    threshold: SOKI_ENTROPY_THRESHOLD,
    high_agreement: highAgreement,
    outcome, // 'soki' | 'truth'
    game_status: round.round_number >= 3 ? 'finished' : 'playing',
  });
}

// PATCH /api/players/:player_id — rename
async function patchPlayer(req, res, playerId) {
  const { username } = await parseBody(req);
  if (!username?.trim()) return json(res, 400, { error: 'username required' });
  const trimmed = username.trim().slice(0, 32);

  const upd = await query(
    `UPDATE players SET username = $1 WHERE player_id = $2
     RETURNING player_id, username, is_host`,
    [trimmed, playerId]
  );
  if (!upd.rows.length) return json(res, 404, { error: 'player not found' });
  json(res, 200, upd.rows[0]);
}

// POST /api/games/:code/round/phase — host sets current phase
async function setRoundPhase(req, res, sessionCode) {
  const { player_id, phase } = await parseBody(req);
  if (!player_id || !phase) return json(res, 400, { error: 'player_id and phase required' });
  if (!VALID_PHASES.includes(phase)) return json(res, 400, { error: `phase must be one of ${VALID_PHASES.join(', ')}` });

  const gameRes = await query(
    `SELECT game_id, host_player_id FROM games WHERE session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });
  const game = gameRes.rows[0];
  if (game.host_player_id !== player_id) return json(res, 403, { error: 'only the host can change phase' });

  const upd = await query(
    `UPDATE rounds SET current_phase = $1
     WHERE game_id = $2 AND status = 'active'
     RETURNING round_id, round_number, current_phase`,
    [phase, game.game_id]
  );
  if (!upd.rows.length) return json(res, 409, { error: 'no active round' });

  json(res, 200, upd.rows[0]);
}

// GET /api/games/:code/sequence-lock — unlocked tiles for /play top bar
async function getSequenceLock(req, res, sessionCode) {
  const gameRes = await query(
    `SELECT g.game_id,
            COALESCE(
              (SELECT SUM(value::int) FROM jsonb_each_text(rc.unlocks_per_round)),
              5
            )::int AS total_tiles
     FROM games g
     LEFT JOIN realm_config rc ON rc.realm_id = g.realm_id
     WHERE g.session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });
  const { game_id: gameId, total_tiles: totalTiles } = gameRes.rows[0];

  const unlocksRes = await query(
    `SELECT round_number, sequence_type, puzzle_piece_index, unlocked_at
     FROM sequence_unlocks
     WHERE game_id = $1
     ORDER BY unlocked_at ASC`,
    [gameId]
  );

  json(res, 200, {
    total_tiles: totalTiles,
    unlocked: unlocksRes.rows,
  });
}

// GET /api/games/:code/groups — group membership + resolution state for current round
async function getGroups(req, res, sessionCode) {
  const gameRes = await query(
    `SELECT game_id FROM games WHERE session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });
  const gameId = gameRes.rows[0].game_id;

  const roundRes = await query(
    `SELECT round_id, started_at FROM rounds WHERE game_id = $1 AND status = 'active' LIMIT 1`,
    [gameId]
  );
  if (!roundRes.rows.length) return json(res, 409, { error: 'no active round' });
  const { round_id: roundId, started_at: startedAt } = roundRes.rows[0];

  // Groups formed in this round
  const groupsRes = await query(
    `SELECT g.group_id,
            array_agg(gm.player_id) AS member_ids
     FROM groups g
     JOIN group_members gm ON gm.group_id = g.group_id
     WHERE g.game_id = $1 AND g.formed_at_round = (
       SELECT round_number FROM rounds WHERE round_id = $2
     )
     GROUP BY g.group_id`,
    [gameId, roundId]
  );

  // For each group: count total fragments held by members, count correctly guessed
  const result = await Promise.all(groupsRes.rows.map(async (g) => {
    const memberIds = g.member_ids;
    const fragStats = await query(
      `SELECT pf.fragment_id,
              pf.player_id AS holder_id,
              pf.character_id,
              EXISTS (
                SELECT 1 FROM fragment_guesses fg
                WHERE fg.fragment_id = pf.fragment_id AND fg.is_correct = true
              ) AS resolved
       FROM personal_fragments pf
       WHERE pf.round_id = $1 AND pf.player_id = ANY($2)`,
      [roundId, memberIds]
    );
    const total = fragStats.rows.length;
    const resolved = fragStats.rows.filter(r => r.resolved).length;
    return {
      group_id: g.group_id,
      member_ids: memberIds,
      fragments_total: total,
      fragments_resolved: resolved,
      complete: total > 0 && resolved === total,
    };
  }));

  json(res, 200, { round_id: roundId, groups: result });
}

// POST /api/games/:code/fragments/:id/guess — R1 fragment identity guess
async function postFragmentGuess(req, res, sessionCode, fragmentId) {
  const { player_id, guessed_target_player_id } = await parseBody(req);
  if (!player_id || !guessed_target_player_id)
    return json(res, 400, { error: 'player_id and guessed_target_player_id required' });

  const gameRes = await query(
    `SELECT g.game_id, g.realm_id, COALESCE(rc.r1_speed_thresholds, '{"fast":300000}'::jsonb) AS speed_thresholds
     FROM games g
     LEFT JOIN realm_config rc ON rc.realm_id = g.realm_id
     WHERE g.session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });
  const { game_id: gameId, realm_id: realmId, speed_thresholds: speedThresholds } = gameRes.rows[0];

  // Fragment must belong to this player in this game
  const fragRes = await query(
    `SELECT pf.fragment_id, pf.character_id, pf.round_id, r.started_at, r.round_number
     FROM personal_fragments pf
     JOIN rounds r ON r.round_id = pf.round_id
     WHERE pf.fragment_id = $1 AND pf.game_id = $2 AND pf.player_id = $3 AND r.status = 'active'`,
    [fragmentId, gameId, player_id]
  );
  if (!fragRes.rows.length) return json(res, 404, { error: 'fragment not found or not yours' });
  const { character_id: characterId, round_id: roundId, started_at: startedAt, round_number: roundNumber } = fragRes.rows[0];

  // Correct answer: who was assigned this character in this round?
  const assignRes = await query(
    `SELECT player_id FROM character_assignments WHERE round_id = $1 AND character_id = $2`,
    [roundId, characterId]
  );
  const correctPlayerId = assignRes.rows[0]?.player_id;
  const isCorrect = guessed_target_player_id === correctPlayerId;

  const guessId = crypto.randomUUID();
  await query(
    `INSERT INTO fragment_guesses (guess_id, fragment_id, guesser_player_id, guessed_target_player_id, is_correct, guessed_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [guessId, fragmentId, player_id, guessed_target_player_id, isCorrect]
  );

  let autoResolved = null;
  if (isCorrect) {
    autoResolved = await maybeResolveR1(gameId, realmId, roundId, roundNumber, startedAt, speedThresholds);
  }

  json(res, 201, { guess_id: guessId, is_correct: isCorrect, correct_player_id: correctPlayerId, auto_resolved: autoResolved });
}

// Called after each correct guess — checks if all groups done, then fires R1 unlock sequence.
async function maybeResolveR1(gameId, realmId, roundId, roundNumber, startedAt, speedThresholds) {
  // Any fragment in this round still unresolved?
  const unresolvedRes = await query(
    `SELECT COUNT(*)::int AS n FROM personal_fragments pf
     WHERE pf.round_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM fragment_guesses fg WHERE fg.fragment_id = pf.fragment_id AND fg.is_correct = true
       )`,
    [roundId]
  );
  if (unresolvedRes.rows[0].n > 0) return null; // not done yet

  // All resolved — compute per-group completion time
  const groupsRes = await query(
    `SELECT g.group_id, array_agg(gm.player_id) AS member_ids
     FROM groups g
     JOIN group_members gm ON gm.group_id = g.group_id
     WHERE g.game_id = $1 AND g.formed_at_round = $2
     GROUP BY g.group_id`,
    [gameId, roundNumber]
  );

  const fastThresholdMs = speedThresholds?.fast ?? 300000;
  const groupTimesMs = await Promise.all(groupsRes.rows.map(async (g) => {
    const lastGuessRes = await query(
      `SELECT MAX(fg.guessed_at) AS last_correct
       FROM fragment_guesses fg
       JOIN personal_fragments pf ON pf.fragment_id = fg.fragment_id
       WHERE pf.round_id = $1 AND pf.player_id = ANY($2) AND fg.is_correct = true`,
      [roundId, g.member_ids]
    );
    const lastCorrect = lastGuessRes.rows[0]?.last_correct;
    return lastCorrect ? new Date(lastCorrect) - new Date(startedAt) : null;
  }));

  const bucket = speedBucket(groupTimesMs, fastThresholdMs);
  const types = r1UnlockTypes(bucket, 2);

  // Pick already-used puzzle piece indices
  const usedRes = await query(
    `SELECT puzzle_piece_index FROM sequence_unlocks WHERE game_id = $1`,
    [gameId]
  );
  const used = new Set(usedRes.rows.map(r => r.puzzle_piece_index));
  const available = Array.from({ length: 10 }, (_, i) => i + 1).filter(i => !used.has(i));

  const unlocks = [];
  for (const seqType of types) {
    let seqRefId;
    if (seqType === 'truth') {
      const tsRes = await query(
        `SELECT truth_sequence_id FROM truth_sequences WHERE realm_id = $1
         AND truth_sequence_id NOT IN (
           SELECT sequence_ref_id FROM sequence_unlocks WHERE game_id = $2
         ) ORDER BY order_index LIMIT 1`,
        [realmId, gameId]
      );
      seqRefId = tsRes.rows[0]?.truth_sequence_id;
    } else {
      const ssRes = await query(
        `SELECT soki_sequence_id FROM soki_sequences WHERE realm_id = $1
         AND soki_sequence_id NOT IN (
           SELECT sequence_ref_id FROM sequence_unlocks WHERE game_id = $2
         ) ORDER BY RANDOM() LIMIT 1`,
        [realmId, gameId]
      );
      seqRefId = ssRes.rows[0]?.soki_sequence_id;
    }
    if (!seqRefId || !available.length) continue;

    const pieceIndex = available.shift();
    used.add(pieceIndex);
    const unlockId = crypto.randomUUID();
    await query(
      `INSERT INTO sequence_unlocks (unlock_id, game_id, round_number, sequence_type, sequence_ref_id, puzzle_piece_index, unlocked_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [unlockId, gameId, roundNumber, seqType, seqRefId, pieceIndex]
    );
    unlocks.push({ unlock_id: unlockId, sequence_type: seqType, puzzle_piece_index: pieceIndex });
  }

  // Stamp round with speed_bucket + mark completed
  await query(
    `UPDATE rounds SET speed_bucket = $1, status = 'completed' WHERE round_id = $2`,
    [bucket, roundId]
  );

  return { bucket, unlocks };
}

// POST /api/games/:code/captain-vote — in-group "most suspicious" vote; tallies when all group members voted
async function postCaptainVote(req, res, sessionCode) {
  const { voter_player_id, voted_player_id } = await parseBody(req);
  if (!voter_player_id || !voted_player_id)
    return json(res, 400, { error: 'voter_player_id and voted_player_id required' });

  const gameRes = await query(
    `SELECT game_id FROM games WHERE session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });
  const gameId = gameRes.rows[0].game_id;

  const voterRes = await query(
    `SELECT is_host FROM players WHERE player_id = $1 AND game_id = $2`,
    [voter_player_id, gameId]
  );
  if (voterRes.rows[0]?.is_host) return json(res, 403, { error: 'host cannot vote in captain election' });

  // Find voter's group (most recent formed)
  const groupRes = await query(
    `SELECT g.group_id FROM groups g
     JOIN group_members gm ON gm.group_id = g.group_id
     WHERE g.game_id = $1 AND gm.player_id = $2
     ORDER BY g.formed_at_round DESC LIMIT 1`,
    [gameId, voter_player_id]
  );
  if (!groupRes.rows.length) return json(res, 404, { error: 'voter not in any group' });
  const groupId = groupRes.rows[0].group_id;

  // Voted player must be in same group
  const sameGroupRes = await query(
    `SELECT 1 FROM group_members WHERE group_id = $1 AND player_id = $2`,
    [groupId, voted_player_id]
  );
  if (!sameGroupRes.rows.length) return json(res, 400, { error: 'voted player not in same group' });

  try {
    await query(
      `INSERT INTO group_captain_votes (vote_id, game_id, group_id, voter_player_id, voted_player_id, cast_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (game_id, group_id, voter_player_id) DO UPDATE SET voted_player_id=$5, cast_at=NOW()`,
      [crypto.randomUUID(), gameId, groupId, voter_player_id, voted_player_id]
    );
  } catch (e) { throw e; }

  // Tally if all group members have voted
  const memberCount = await query(
    `SELECT COUNT(*)::int AS n FROM group_members WHERE group_id = $1`, [groupId]
  );
  const voteCount = await query(
    `SELECT COUNT(*)::int AS n FROM group_captain_votes WHERE group_id = $1 AND game_id = $2`,
    [groupId, gameId]
  );
  let captain = null;
  if (voteCount.rows[0].n >= memberCount.rows[0].n) {
    const tallyRes = await query(
      `SELECT voted_player_id, COUNT(*)::int AS n
       FROM group_captain_votes WHERE group_id = $1 AND game_id = $2
       GROUP BY voted_player_id ORDER BY n DESC LIMIT 1`,
      [groupId, gameId]
    );
    if (tallyRes.rows.length) {
      captain = tallyRes.rows[0].voted_player_id;
      await query(
        `UPDATE groups SET captain_player_id = $1 WHERE group_id = $2`,
        [captain, groupId]
      );
    }
  }

  json(res, 201, {
    group_id: groupId,
    votes_cast: voteCount.rows[0].n,
    members: memberCount.rows[0].n,
    captain_elected: captain,
  });
}

// POST /api/games/:code/round/2/start — assign riddle bundles to groups, start R2
async function startR2(req, res, sessionCode) {
  const { player_id } = await parseBody(req);
  if (!player_id) return json(res, 400, { error: 'player_id required' });

  const gameRes = await query(
    `SELECT game_id, realm_id, host_player_id, status FROM games WHERE session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });
  const game = gameRes.rows[0];
  if (game.host_player_id !== player_id) return json(res, 403, { error: 'only the host can start R2' });
  if (game.status !== 'playing') return json(res, 409, { error: 'game not in playing state' });

  const active = await query(
    `SELECT round_id FROM rounds WHERE game_id = $1 AND status = 'active'`, [game.game_id]
  );
  if (active.rows.length) return json(res, 409, { error: 'a round is already active' });

  // R1 must be completed
  const r1 = await query(
    `SELECT round_id FROM rounds WHERE game_id = $1 AND round_number = 1 AND status = 'completed'`,
    [game.game_id]
  );
  if (!r1.rows.length) return json(res, 409, { error: 'R1 not yet completed' });

  // Pick location (reuse R1 logic — unused location)
  const locationRes = await query(
    `SELECT location_id FROM locations
     WHERE realm_id = $1 AND is_active = true
       AND location_id NOT IN (SELECT location_id FROM rounds WHERE game_id = $2)
     ORDER BY RANDOM() LIMIT 1`,
    [game.realm_id, game.game_id]
  );
  if (!locationRes.rows.length) return json(res, 500, { error: 'no available locations' });

  const roundId = crypto.randomUUID();
  await query(
    `INSERT INTO rounds (round_id, game_id, location_id, round_number, started_at, status, current_phase)
     VALUES ($1,$2,$3,2,NOW(),'active','voting')`,
    [roundId, game.game_id, locationRes.rows[0].location_id]
  );

  // Get groups from R1 (formed_at_round=1)
  const groupsRes = await query(
    `SELECT g.group_id FROM groups g WHERE g.game_id = $1 AND g.formed_at_round = 1`,
    [game.game_id]
  );

  // Assign one unique bundle per group
  const bundlesRes = await query(
    `SELECT bundle_id FROM riddle_bundles ORDER BY RANDOM() LIMIT $1`,
    [groupsRes.rows.length]
  );
  const assignments = [];
  for (let i = 0; i < groupsRes.rows.length; i++) {
    const assignmentId = crypto.randomUUID();
    const bundleId = bundlesRes.rows[i % bundlesRes.rows.length].bundle_id;
    await query(
      `INSERT INTO riddle_assignments (assignment_id, game_id, group_id, bundle_id, started_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (game_id, group_id) DO NOTHING`,
      [assignmentId, game.game_id, groupsRes.rows[i].group_id, bundleId]
    );
    assignments.push({ group_id: groupsRes.rows[i].group_id, bundle_id: bundleId });
  }

  json(res, 201, { round_id: roundId, round_number: 2, assignments });
}

// GET /api/games/:code/round/2 — riddle state for current group (player) or all groups (host)
async function getR2State(req, res, sessionCode) {
  const { player_id } = url.parse(req.url, true).query;
  const gameRes = await query(
    `SELECT g.game_id, g.host_player_id FROM games g WHERE g.session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });
  const { game_id: gameId, host_player_id: hostId } = gameRes.rows[0];
  const isHost = player_id === hostId;

  const roundRes = await query(
    `SELECT round_id FROM rounds WHERE game_id = $1 AND round_number = 2 ORDER BY started_at DESC LIMIT 1`,
    [gameId]
  );
  if (!roundRes.rows.length) return json(res, 404, { error: 'R2 not started' });

  // Build assignment rows with riddles and answers
  const assignRes = await query(
    `SELECT ra.assignment_id, ra.group_id, ra.bundle_id, ra.started_at, ra.completed_at,
            g.captain_player_id
     FROM riddle_assignments ra
     JOIN groups g ON g.group_id = ra.group_id
     WHERE ra.game_id = $1`,
    [gameId]
  );

  // If player scoped, return only their group; host sees all
  let rows = assignRes.rows;
  if (player_id && !isHost) {
    const playerGroup = await query(
      `SELECT group_id FROM group_members WHERE player_id = $1
       AND group_id IN (SELECT group_id FROM groups WHERE game_id = $2 AND formed_at_round = 1)`,
      [player_id, gameId]
    );
    const gid = playerGroup.rows[0]?.group_id;
    rows = rows.filter(r => r.group_id === gid);
  }

  const result = await Promise.all(rows.map(async (a) => {
    const riddlesRes = await query(
      `SELECT r.riddle_id, r.question_text, r.option_a, r.option_b, r.option_c, r.option_d,
              r.order_in_bundle, ra2.selected_option, ra2.is_correct, ra2.answered_at
       FROM riddles r
       LEFT JOIN riddle_answers ra2 ON ra2.riddle_id = r.riddle_id AND ra2.assignment_id = $1
       WHERE r.bundle_id = $2
       ORDER BY r.order_in_bundle`,
      [a.assignment_id, a.bundle_id]
    );
    return {
      group_id: a.group_id,
      assignment_id: a.assignment_id,
      captain_player_id: a.captain_player_id,
      started_at: a.started_at,
      completed_at: a.completed_at,
      riddles: riddlesRes.rows.map(r => ({
        riddle_id: r.riddle_id,
        question_text: r.question_text,
        options: { a: r.option_a, b: r.option_b, c: r.option_c, d: r.option_d },
        order_in_bundle: r.order_in_bundle,
        answered: !!r.selected_option,
        selected_option: r.selected_option || null,
        is_correct: isHost ? r.is_correct : (r.selected_option ? null : null), // hidden from players
      })),
    };
  }));

  json(res, 200, { groups: result });
}

// POST /api/games/:code/riddle-answer — captain submits locked answer for one riddle
async function postRiddleAnswer(req, res, sessionCode) {
  const { player_id, assignment_id, riddle_id, selected_option } = await parseBody(req);
  if (!player_id || !assignment_id || !riddle_id || !selected_option)
    return json(res, 400, { error: 'player_id, assignment_id, riddle_id, selected_option required' });
  if (!['a','b','c','d'].includes(selected_option))
    return json(res, 400, { error: 'selected_option must be a, b, c, or d' });

  const gameRes = await query(
    `SELECT game_id FROM games WHERE session_code = $1`, [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });
  const gameId = gameRes.rows[0].game_id;

  // Assignment must belong to this game; player must be captain of that group
  const assignRes = await query(
    `SELECT ra.group_id, g.captain_player_id
     FROM riddle_assignments ra
     JOIN groups g ON g.group_id = ra.group_id
     WHERE ra.assignment_id = $1 AND ra.game_id = $2`,
    [assignment_id, gameId]
  );
  if (!assignRes.rows.length) return json(res, 404, { error: 'assignment not found' });
  const { group_id: groupId, captain_player_id } = assignRes.rows[0];
  if (captain_player_id !== player_id)
    return json(res, 403, { error: 'only the group captain can submit answers' });

  // Fetch correct option
  const riddleRes = await query(
    `SELECT correct_option FROM riddles WHERE riddle_id = $1`, [riddle_id]
  );
  if (!riddleRes.rows.length) return json(res, 404, { error: 'riddle not found' });
  const isCorrect = riddleRes.rows[0].correct_option === selected_option;

  try {
    const answerId = crypto.randomUUID();
    await query(
      `INSERT INTO riddle_answers (answer_id, assignment_id, riddle_id, group_id, captain_player_id, selected_option, is_correct, answered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (assignment_id, riddle_id) DO UPDATE SET selected_option=$6, is_correct=$7, answered_at=NOW()`,
      [answerId, assignment_id, riddle_id, groupId, player_id, selected_option, isCorrect]
    );
  } catch (e) { throw e; }

  // Mark assignment completed if all 3 riddles answered
  const answeredCount = await query(
    `SELECT COUNT(*)::int AS n FROM riddle_answers WHERE assignment_id = $1`, [assignment_id]
  );
  const totalRiddles = await query(
    `SELECT COUNT(*)::int AS n FROM riddles r
     JOIN riddle_assignments ra ON ra.bundle_id = r.bundle_id
     WHERE ra.assignment_id = $1`,
    [assignment_id]
  );
  if (answeredCount.rows[0].n >= totalRiddles.rows[0].n) {
    await query(
      `UPDATE riddle_assignments SET completed_at = NOW() WHERE assignment_id = $1 AND completed_at IS NULL`,
      [assignment_id]
    );
  }

  json(res, 201, { is_correct: isCorrect, answers_submitted: answeredCount.rows[0].n });
}

// POST /api/games/:code/round/2/end — tally R2 collective bucket → 2 sequence_unlocks
async function endR2(req, res, sessionCode) {
  const { player_id } = await parseBody(req);
  if (!player_id) return json(res, 400, { error: 'player_id required' });

  const gameRes = await query(
    `SELECT g.game_id, g.realm_id, g.host_player_id,
            COALESCE(rc.r2_speed_thresholds->>'fast', '480000')::int AS fast_threshold_ms
     FROM games g LEFT JOIN realm_config rc ON rc.realm_id = g.realm_id
     WHERE g.session_code = $1`,
    [sessionCode.toUpperCase()]
  );
  if (!gameRes.rows.length) return json(res, 404, { error: 'game not found' });
  const { game_id: gameId, realm_id: realmId, host_player_id: hostId, fast_threshold_ms: fastMs } = gameRes.rows[0];
  if (hostId !== player_id) return json(res, 403, { error: 'only the host can end R2' });

  const roundRes = await query(
    `SELECT round_id FROM rounds WHERE game_id = $1 AND round_number = 2 AND status = 'active' LIMIT 1`,
    [gameId]
  );
  if (!roundRes.rows.length) return json(res, 409, { error: 'no active R2 round' });
  const roundId = roundRes.rows[0].round_id;

  // Build per-group result objects for r2Bucket
  const assignRes = await query(
    `SELECT ra.assignment_id, ra.group_id, ra.started_at, ra.completed_at,
            (SELECT COUNT(*)::int FROM riddle_answers WHERE assignment_id = ra.assignment_id AND is_correct = true) AS correct_count,
            (SELECT COUNT(*)::int FROM riddle_answers WHERE assignment_id = ra.assignment_id) AS total_answered,
            (SELECT COUNT(*)::int FROM riddles WHERE bundle_id = ra.bundle_id) AS total_riddles
     FROM riddle_assignments ra WHERE ra.game_id = $1`,
    [gameId]
  );

  const groupResults = assignRes.rows.map(r => ({
    correctCount: r.correct_count,
    totalCount: r.total_riddles,
    ms: r.completed_at ? new Date(r.completed_at) - new Date(r.started_at) : null,
  }));

  const bucket = r2Bucket(groupResults, fastMs);
  const types = r2UnlockTypes(bucket, 2);

  // Pick unused puzzle pieces
  const usedRes = await query(
    `SELECT puzzle_piece_index FROM sequence_unlocks WHERE game_id = $1`, [gameId]
  );
  const used = new Set(usedRes.rows.map(r => r.puzzle_piece_index));
  const available = Array.from({ length: 10 }, (_, i) => i + 1).filter(i => !used.has(i));

  const unlocks = [];
  for (const seqType of types) {
    if (!available.length) break;
    let seqRefId;
    if (seqType === 'truth') {
      const r = await query(
        `SELECT truth_sequence_id FROM truth_sequences WHERE realm_id = $1
         AND truth_sequence_id NOT IN (SELECT sequence_ref_id FROM sequence_unlocks WHERE game_id = $2)
         ORDER BY order_index LIMIT 1`, [realmId, gameId]
      );
      seqRefId = r.rows[0]?.truth_sequence_id;
    } else {
      const r = await query(
        `SELECT soki_sequence_id FROM soki_sequences WHERE realm_id = $1
         AND soki_sequence_id NOT IN (SELECT sequence_ref_id FROM sequence_unlocks WHERE game_id = $2)
         ORDER BY RANDOM() LIMIT 1`, [realmId, gameId]
      );
      seqRefId = r.rows[0]?.soki_sequence_id;
    }
    if (!seqRefId) continue;
    const pieceIndex = available.shift();
    used.add(pieceIndex);
    const unlockId = crypto.randomUUID();
    await query(
      `INSERT INTO sequence_unlocks (unlock_id, game_id, round_number, sequence_type, sequence_ref_id, puzzle_piece_index, unlocked_at)
       VALUES ($1,$2,2,$3,$4,$5,NOW())`,
      [unlockId, gameId, seqType, seqRefId, pieceIndex]
    );
    unlocks.push({ unlock_id: unlockId, sequence_type: seqType, puzzle_piece_index: pieceIndex });
  }

  await query(
    `UPDATE rounds SET speed_bucket = $1, status = 'completed' WHERE round_id = $2`,
    [bucket, roundId]
  );

  json(res, 200, { bucket, unlocks, group_results: groupResults });
}

// GET /api/games/:code/roster — all players + host flag
async function getRoster(req, res, sessionCode) {
  const gameR = await query(
    `SELECT game_id FROM games WHERE session_code=$1`, [sessionCode.toUpperCase()]
  );
  if (!gameR.rows.length) return json(res, 404, { error: 'game not found' });
  const playersR = await query(
    `SELECT player_id, username, is_host, joined_at
     FROM players WHERE game_id=$1 ORDER BY joined_at`,
    [gameR.rows[0].game_id]
  );
  json(res, 200, { players: playersR.rows });
}

// GET /api/games/:code/results — per-round outcome summary for host dashboard
async function getResults(req, res, sessionCode) {
  const gameR = await query(
    `SELECT game_id, realm_id FROM games WHERE session_code=$1`, [sessionCode.toUpperCase()]
  );
  if (!gameR.rows.length) return json(res, 404, { error: 'game not found' });
  const { game_id: gameId, realm_id: realmId } = gameR.rows[0];

  const roundsR = await query(
    `SELECT round_number, status, speed_bucket, started_at FROM rounds WHERE game_id=$1 ORDER BY round_number`,
    [gameId]
  );

  const unlocksR = await query(
    `SELECT round_number, sequence_type FROM sequence_unlocks WHERE game_id=$1`,
    [gameId]
  );
  const unlocksByRound = {};
  for (const u of unlocksR.rows) {
    (unlocksByRound[u.round_number] ||= []).push(u.sequence_type);
  }

  const phaseMap = { 1: 'pre_game', 2: 'post_round_1', 3: 'post_round_2' };
  const rounds = [];
  for (const r of roundsR.rows) {
    const phase = phaseMap[r.round_number];
    let tally = null;
    if (phase) {
      const vqR = await query(
        `SELECT vote_question_id FROM vote_questions WHERE realm_id=$1 AND phase=$2 LIMIT 1`,
        [realmId, phase]
      );
      if (vqR.rows.length) {
        const tallyR = await query(
          `SELECT selected_option, COUNT(*)::int AS n
           FROM votes WHERE game_id=$1 AND vote_question_id=$2 GROUP BY selected_option`,
          [gameId, vqR.rows[0].vote_question_id]
        );
        tally = { a: 0, b: 0, c: 0, d: 0 };
        for (const row of tallyR.rows) tally[row.selected_option] = row.n;
      }
    }
    rounds.push({
      round_number: r.round_number,
      status: r.status,
      speed_bucket: r.speed_bucket || null,
      unlocks: unlocksByRound[r.round_number] || [],
      tally,
    });
  }

  const r2R = await query(
    `SELECT ra.group_id,
            COUNT(ans.answer_id)::int AS answered,
            COUNT(CASE WHEN ans.is_correct THEN 1 END)::int AS correct
     FROM riddle_assignments ra
     LEFT JOIN riddle_answers ans ON ans.assignment_id = ra.assignment_id
     WHERE ra.game_id=$1 GROUP BY ra.group_id`,
    [gameId]
  );

  const r3R = await query(
    `SELECT score_percent, reveal_unlocked FROM r3_results WHERE game_id=$1`, [gameId]
  );

  json(res, 200, { rounds, r2_groups: r2R.rows, r3_result: r3R.rows[0] ?? null });
}

// POST /api/games/:code/round/3/start — distribute unlocked tiles to groups, open R3
async function startR3(req, res, code) {
  const gameR = await query(`SELECT game_id FROM games WHERE session_code=$1`, [code]);
  if (!gameR.rows.length) return json(res, 404, { error: 'game not found' });
  const gameId = gameR.rows[0].game_id;

  // get all unlocked tiles
  const tilesR = await query(
    `SELECT unlock_id FROM sequence_unlocks WHERE game_id=$1 ORDER BY unlocked_at`,
    [gameId]
  );
  const tileIds = shuffle(tilesR.rows.map(r => r.unlock_id));

  // get groups formed in R1 (they persist through R2 and R3)
  const groupsR = await query(
    `SELECT group_id FROM groups WHERE game_id=$1 AND formed_at_round=1 ORDER BY created_at`,
    [gameId]
  );
  const groups = groupsR.rows.map(r => r.group_id);
  if (!groups.length) return json(res, 400, { error: 'no groups found' });

  // assign tiles round-robin across groups
  for (let i = 0; i < tileIds.length; i++) {
    const groupId = groups[i % groups.length];
    await query(
      `UPDATE sequence_unlocks SET assigned_to_group_id=$1 WHERE unlock_id=$2`,
      [groupId, tileIds[i]]
    );
  }

  // create round_number=3
  const roundR = await query(
    `INSERT INTO rounds (game_id, round_number, status, current_phase)
     VALUES ($1, 3, 'active', 'voting')
     ON CONFLICT (game_id, round_number) DO UPDATE SET status='active'
     RETURNING round_id`,
    [gameId]
  );

  json(res, 200, { round_id: roundR.rows[0].round_id, tile_count: tileIds.length, group_count: groups.length });
}

// POST /api/games/:code/round/3/order — host submits final ordering; compute + write r3_result
async function submitR3Order(req, res, code) {
  const { ordered_unlock_ids } = await parseBody(req);
  if (!Array.isArray(ordered_unlock_ids) || !ordered_unlock_ids.length)
    return json(res, 400, { error: 'ordered_unlock_ids required' });

  const gameR = await query(`SELECT game_id FROM games WHERE session_code=$1`, [code]);
  if (!gameR.rows.length) return json(res, 404, { error: 'game not found' });
  const gameId = gameR.rows[0].game_id;

  // fetch tile details: type + canonical_index (from truth_sequences if type=truth)
  const detailsR = await query(
    `SELECT su.unlock_id, su.sequence_type,
            ts.canonical_index
     FROM sequence_unlocks su
     LEFT JOIN truth_sequences ts
       ON ts.sequence_id = su.sequence_ref_id AND su.sequence_type = 'truth'
     WHERE su.game_id=$1 AND su.unlock_id = ANY($2::uuid[])`,
    [gameId, ordered_unlock_ids]
  );
  const byId = Object.fromEntries(detailsR.rows.map(r => [r.unlock_id, r]));

  // build ordering array in submitted order
  const ordering = ordered_unlock_ids.map(id => ({
    type: byId[id]?.sequence_type ?? 'soki',
    canonical_index: byId[id]?.canonical_index ?? null,
  }));

  const { score, max, percent } = r3Score(ordering);

  // write r3_orderings rows
  for (let i = 0; i < ordered_unlock_ids.length; i++) {
    await query(
      `INSERT INTO r3_orderings (game_id, position, sequence_unlock_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (game_id, position) DO UPDATE SET sequence_unlock_id=EXCLUDED.sequence_unlock_id`,
      [gameId, i + 1, ordered_unlock_ids[i]]
    );
  }

  // upsert r3_results
  await query(
    `INSERT INTO r3_results (game_id, score_percent)
     VALUES ($1,$2)
     ON CONFLICT (game_id) DO UPDATE SET score_percent=EXCLUDED.score_percent, computed_at=NOW()`,
    [gameId, percent]
  );

  json(res, 200, { score, max, percent });
}

// GET /api/games/:code/r3?player_id= — group tile subset (player) or full state + reveal (host)
async function getR3State(req, res, code) {
  const { player_id } = url.parse(req.url, true).query;
  const gameR = await query(
    `SELECT g.game_id, g.host_player_id, g.killer_path FROM games g WHERE g.session_code=$1`,
    [code]
  );
  if (!gameR.rows.length) return json(res, 404, { error: 'game not found' });
  const { game_id: gameId, host_player_id, killer_path } = gameR.rows[0];
  const isHost = player_id === host_player_id;

  const resultR = await query(
    `SELECT score_percent, reveal_unlocked FROM r3_results WHERE game_id=$1`,
    [gameId]
  );
  const result = resultR.rows[0] ?? null;

  let tiles;
  if (isHost) {
    const r = await query(
      `SELECT su.unlock_id, su.sequence_type, su.puzzle_piece_index, su.assigned_to_group_id
       FROM sequence_unlocks su WHERE su.game_id=$1 ORDER BY su.unlocked_at`,
      [gameId]
    );
    tiles = r.rows;
  } else if (player_id) {
    const r = await query(
      `SELECT su.unlock_id, su.sequence_type, su.puzzle_piece_index, su.assigned_to_group_id
       FROM sequence_unlocks su
       JOIN groups g ON g.group_id = su.assigned_to_group_id
       JOIN group_members gm ON gm.group_id = g.group_id
       WHERE su.game_id=$1 AND gm.player_id=$2`,
      [gameId, player_id]
    );
    tiles = r.rows;
  } else {
    return json(res, 400, { error: 'player_id required' });
  }

  // fetch r3_orderings if host submitted
  const orderR = await query(
    `SELECT ro.position, ro.sequence_unlock_id FROM r3_orderings ro WHERE ro.game_id=$1 ORDER BY ro.position`,
    [gameId]
  );

  // reveal gate: host + score >= threshold
  let reveal = null;
  if (isHost && result) {
    const cfgR = await query(
      `SELECT rc.r3_pass_threshold FROM realm_config rc
       JOIN games g ON g.realm_id = rc.realm_id WHERE g.game_id=$1`,
      [gameId]
    );
    const threshold = cfgR.rows[0]?.r3_pass_threshold ?? 85;
    if (result.score_percent >= threshold && killer_path) {
      const seqR = await query(
        `SELECT content FROM individual_sequences WHERE unlock_condition = 'killer_path:' || $1`,
        [killer_path]
      );
      reveal = seqR.rows[0]?.content ?? null;
    }
  }

  json(res, 200, { tiles, result, ordering: orderR.rows, reveal });
}

// POST /api/games/:code/lead-capture — post-session lead form (any score)
async function postLeadCapture(req, res, code) {
  const { player_id, email, name, would_recommend_to_who, comment } = await parseBody(req);
  if (!email) return json(res, 400, { error: 'email required' });

  const gameR = await query(`SELECT game_id FROM games WHERE session_code=$1`, [code]);
  if (!gameR.rows.length) return json(res, 404, { error: 'game not found' });
  const gameId = gameR.rows[0].game_id;

  await query(
    `INSERT INTO r3_lead_captures (game_id, player_id, email, name, would_recommend_to_who, comment)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [gameId, player_id || null, email, name || null, would_recommend_to_who || null, comment || null]
  );

  json(res, 201, { captured: true });
}

// ── ROUTER ───────────────────────────────────────────────────

async function requestHandler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    });
    return res.end();
  }

  const { pathname } = url.parse(req.url);
  const parts = pathname.split('/').filter(Boolean);
  const [, , code, seg, sub] = parts; // api, games, :code, :seg, :sub

  if (req.method === 'GET' && pathname === '/') return json(res, 200, { status: 'ok', service: 'soki-backend' });
  if (req.method === 'GET' && pathname === '/now') {
    const r = await query('SELECT NOW()');
    return json(res, 200, { now: r.rows[0].now });
  }
  if (req.method === 'GET' && pathname === '/api/config') {
    return json(res, 200, { min_players: MIN_PLAYERS, demo_mode: DEMO_MODE });
  }
  if (req.method === 'POST' && pathname === '/api/admin/reset') {
    if (!DEMO_MODE) return json(res, 403, { error: 'admin reset disabled (set DEMO_MODE=true)' });
    // Wipe all game-runtime data. Realm/character/location/vote_question seeds remain.
    const before = await query(`SELECT
      (SELECT COUNT(*)::int FROM games) AS games,
      (SELECT COUNT(*)::int FROM players) AS players,
      (SELECT COUNT(*)::int FROM rounds) AS rounds`);
    await query(`TRUNCATE games, players, rounds, character_assignments,
                          personal_fragments, votes, questions,
                          sequence_evaluations, scores,
                          groups, group_members, fragment_guesses, sequence_unlocks,
                          group_captain_votes, riddle_assignments, riddle_answers,
                          r3_orderings, r3_results, r3_lead_captures
                          RESTART IDENTITY CASCADE`);
    return json(res, 200, { reset: true, wiped: before.rows[0] });
  }

  // /api/players/:player_id (PATCH only)
  if (parts[0] === 'api' && parts[1] === 'players' && parts[2] && req.method === 'PATCH') {
    return patchPlayer(req, res, parts[2]);
  }

  if (parts[0] !== 'api' || parts[1] !== 'games') return json(res, 404, { error: 'not found' });

  if (req.method === 'POST' && !code)            return createGame(req, res);
  if (req.method === 'POST' && code === 'join')  return joinGame(req, res);
  if (req.method === 'GET'  && code && !seg)     return getLobby(req, res, code);
  if (req.method === 'POST' && code && seg === 'start') return startGame(req, res, code);

  // round routes
  if (code && seg === 'round') {
    if (req.method === 'POST' && sub === '0' && parts[5] === 'end') return endR0(req, res, code);
    if (req.method === 'POST' && sub === '2' && parts[5] === 'start') return startR2(req, res, code);
    if (req.method === 'POST' && sub === '2' && parts[5] === 'end')   return endR2(req, res, code);
    if (req.method === 'GET'  && sub === '2' && !parts[5])            return getR2State(req, res, code);
    if (req.method === 'POST' && sub === '3' && parts[5] === 'start') return startR3(req, res, code);
    if (req.method === 'POST' && sub === '3' && parts[5] === 'order') return submitR3Order(req, res, code);
    if (req.method === 'POST' && sub === 'start') return startRound(req, res, code);
    if (req.method === 'POST' && sub === 'end')   return endRound(req, res, code);
    if (req.method === 'POST' && sub === 'phase') return setRoundPhase(req, res, code);
    if (req.method === 'GET'  && sub === 'me')    return getMyCharacter(req, res, code);
    if (req.method === 'GET'  && !sub)            return getRound(req, res, code);
  }

  // r3 state
  if (code && seg === 'r3' && req.method === 'GET' && !sub) return getR3State(req, res, code);

  // lead capture
  if (code && seg === 'lead-capture' && req.method === 'POST' && !sub) return postLeadCapture(req, res, code);

  // roster + results (host dashboard)
  if (code && seg === 'roster' && req.method === 'GET' && !sub) return getRoster(req, res, code);
  if (code && seg === 'results' && req.method === 'GET' && !sub) return getResults(req, res, code);

  // captain vote
  if (code && seg === 'captain-vote' && req.method === 'POST' && !sub) return postCaptainVote(req, res, code);

  // riddle answers
  if (code && seg === 'riddle-answer' && req.method === 'POST' && !sub) return postRiddleAnswer(req, res, code);

  // sequence-lock
  if (code && seg === 'sequence-lock' && req.method === 'GET' && !sub) return getSequenceLock(req, res, code);

  // groups
  if (code && seg === 'groups' && req.method === 'GET' && !sub) return getGroups(req, res, code);

  // fragment guesses
  if (code && seg === 'fragments' && sub && parts[5] === 'guess' && req.method === 'POST')
    return postFragmentGuess(req, res, code, sub);

  // votes
  if (code && seg === 'vote') {
    if (req.method === 'POST' && !sub) return postVote(req, res, code);
  }
  if (code && seg === 'vote-questions' && sub) {
    if (req.method === 'GET') return getVoteQuestion(req, res, code, sub);
  }

  json(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  requestHandler(req, res).catch(err => {
    console.error(err);
    json(res, 500, { error: err.message });
  });
});

server.listen(PORT, () => console.log(`soki backend → http://localhost:${PORT}`));
