#!/usr/bin/env node
// smoke-test.js — happy-path API walkthrough (requires server running on localhost:3000)
// Usage: node soki/smoke-test.js

const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    pass++;
  } else {
    console.error(`  ✗  ${label}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

(async () => {
  console.log('\n── Soki API smoke test ──\n');

  // Health
  const health = await req('GET', '/');
  assert('GET / → 200', health.status === 200);

  const config = await req('GET', '/api/config');
  assert('GET /api/config → 200', config.status === 200);
  assert('demo_mode is boolean', typeof config.data.demo_mode === 'boolean');

  // Create game (host)
  const cg = await req('POST', '/api/games', { username: 'smoke-host' });
  assert('POST /api/games → 201', cg.status === 201);
  const { session_code: code, player_id: hostId } = cg.data;
  assert('session_code returned', !!code);

  // Join as players (need MIN_PLAYERS non-host players)
  const minPlayers = config.data.min_players ?? 2;
  const players = [];
  for (let i = 0; i < minPlayers; i++) {
    const jp = await req('POST', '/api/games/join', { session_code: code, username: `player${i + 1}` });
    assert(`join player${i + 1} → 201`, jp.status === 201);
    players.push(jp.data.player_id);
  }

  // Lobby
  const lobby = await req('GET', `/api/games/${code}`);
  assert('GET /api/games/:code → 200', lobby.status === 200);

  // Roster (host endpoint)
  const roster = await req('GET', `/api/games/${code}/roster`);
  assert('GET /roster → 200', roster.status === 200);
  assert('roster has host + players', roster.data.players?.length === minPlayers + 1);

  // Start game
  const sg = await req('POST', `/api/games/${code}/start`, { player_id: hostId });
  assert('POST /start → 200', sg.status === 200);
  assert('killer_path A|B|C', ['A','B','C'].includes(sg.data.killer_path));

  // Non-host player cannot start (409 if already started, 403 if still waiting)
  const sg2 = await req('POST', `/api/games/${code}/start`, { player_id: players[0] });
  assert('non-host start → rejected', sg2.status === 403 || sg2.status === 409);

  // Start round
  const sr = await req('POST', `/api/games/${code}/round/start`, { player_id: hostId });
  assert('POST /round/start → 201', sr.status === 201);

  // Public round state
  const rd = await req('GET', `/api/games/${code}/round`);
  assert('GET /round → 200', rd.status === 200);
  assert('round has location', !!rd.data.round?.location);

  // Host has no character assignment
  const hostMe = await req('GET', `/api/games/${code}/round/me?player_id=${hostId}`);
  assert('host /round/me → 404 or no character', hostMe.status === 404 || !hostMe.data.character);

  // Player has character
  const p1Me = await req('GET', `/api/games/${code}/round/me?player_id=${players[0]}`);
  assert('player /round/me → 200', p1Me.status === 200);
  assert('player has character', !!p1Me.data.character);

  // Host cannot vote
  const vq = await req('GET', `/api/games/${code}/vote-questions/pre_game`);
  if (vq.status === 200) {
    const hv = await req('POST', `/api/games/${code}/vote`, {
      player_id: hostId,
      vote_question_id: vq.data.vote_question_id,
      selected_option: 'a',
    });
    assert('host vote → 403', hv.status === 403);

    // Player can vote
    const pv = await req('POST', `/api/games/${code}/vote`, {
      player_id: players[0],
      vote_question_id: vq.data.vote_question_id,
      selected_option: 'b',
    });
    assert('player vote → 201', pv.status === 201);
  } else {
    console.log('  —  no pre_game vote question seeded, skipping vote checks');
  }

  // Results (host endpoint)
  const results = await req('GET', `/api/games/${code}/results`);
  assert('GET /results → 200', results.status === 200);
  assert('results.rounds is array', Array.isArray(results.data.rounds));

  // Sequence lock
  const sl = await req('GET', `/api/games/${code}/sequence-lock`);
  assert('GET /sequence-lock → 200', sl.status === 200);

  // Groups
  const grps = await req('GET', `/api/games/${code}/groups`);
  assert('GET /groups → 200', grps.status === 200);

  console.log(`\n── ${pass} passed · ${fail} failed ──\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
