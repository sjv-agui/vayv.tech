require('dotenv').config();
const { query } = require('./db');

const sql = `
CREATE INDEX IF NOT EXISTS idx_game_status       ON games (status);
CREATE INDEX IF NOT EXISTS idx_game_realm_id     ON games (realm_id);
CREATE INDEX IF NOT EXISTS idx_game_created_at   ON games (created_at);

CREATE INDEX IF NOT EXISTS idx_player_game_id      ON players (game_id);
CREATE INDEX IF NOT EXISTS idx_player_is_connected ON players (game_id, is_connected);

CREATE INDEX IF NOT EXISTS idx_round_game_id ON rounds (game_id);
CREATE INDEX IF NOT EXISTS idx_round_status  ON rounds (game_id, status);

CREATE INDEX IF NOT EXISTS idx_vote_game_id  ON votes (game_id);
CREATE INDEX IF NOT EXISTS idx_vote_question ON votes (game_id, vote_question_id);
CREATE INDEX IF NOT EXISTS idx_vote_player   ON votes (player_id, vote_question_id);

CREATE INDEX IF NOT EXISTS idx_vote_question_realm_phase ON vote_questions (realm_id, phase);

CREATE INDEX IF NOT EXISTS idx_individual_seq_realm ON individual_sequences (realm_id);
CREATE INDEX IF NOT EXISTS idx_individual_seq_round ON individual_sequences (round_unlocked);

CREATE INDEX IF NOT EXISTS idx_fragment_game_player ON personal_fragments (game_id, player_id);
CREATE INDEX IF NOT EXISTS idx_fragment_round       ON personal_fragments (game_id, round_id);

CREATE INDEX IF NOT EXISTS idx_soki_realm_active ON soki_sequences (realm_id, is_active);
CREATE INDEX IF NOT EXISTS idx_soki_trigger      ON soki_sequences (triggered_by_vote_question_id);

CREATE INDEX IF NOT EXISTS idx_soki_rule_realm_question ON soki_trigger_rules (realm_id, vote_question_id);

CREATE INDEX IF NOT EXISTS idx_assignment_game_player ON character_assignments (game_id, player_id);
CREATE INDEX IF NOT EXISTS idx_assignment_round       ON character_assignments (game_id, round_id);

CREATE INDEX IF NOT EXISTS idx_score_game  ON scores (game_id);
CREATE INDEX IF NOT EXISTS idx_score_round ON scores (game_id, round_id);

CREATE INDEX IF NOT EXISTS idx_eval_game ON sequence_evaluations (game_id);
`;

async function runIndexes() {
  try {
    await query(sql);
    console.log('Indexes applied.');
  } catch (err) {
    console.error('Index migration failed:', err.message);
  } finally {
    process.exit();
  }
}

runIndexes();
