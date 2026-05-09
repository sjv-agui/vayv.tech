const path = require('path');
require(path.join(__dirname, '../soki/node_modules/dotenv')).config({ path: path.join(__dirname, '../soki/.env') });
const { query } = require('../soki/db');

const sql = `
BEGIN;

-- r3_orderings: host's tile placement (one row per position in the final order)
CREATE TABLE IF NOT EXISTS r3_orderings (
  ordering_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  position          INT NOT NULL,
  sequence_unlock_id UUID NOT NULL REFERENCES sequence_unlocks(unlock_id),
  ordered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, position),
  UNIQUE (game_id, sequence_unlock_id)
);

-- r3_results: final score per game
CREATE TABLE IF NOT EXISTS r3_results (
  result_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE UNIQUE,
  score_percent   INT NOT NULL,
  reveal_unlocked BOOLEAN NOT NULL DEFAULT false,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- r3_lead_captures: post-session lead form (any score)
CREATE TABLE IF NOT EXISTS r3_lead_captures (
  capture_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  player_id              UUID REFERENCES players(player_id),
  email                  TEXT NOT NULL,
  name                   TEXT,
  would_recommend_to_who TEXT,
  comment                TEXT,
  submitted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- realm_config: R3 timer + pass threshold
ALTER TABLE realm_config
  ADD COLUMN IF NOT EXISTS r3_timer_seconds   INT NOT NULL DEFAULT 1200,
  ADD COLUMN IF NOT EXISTS r3_pass_threshold  INT NOT NULL DEFAULT 85;

-- sequence_unlocks: group assignment for R3 tile redistribution
ALTER TABLE sequence_unlocks
  ADD COLUMN IF NOT EXISTS assigned_to_group_id UUID REFERENCES groups(group_id);

COMMIT;
`;

(async () => {
  try {
    await query(sql);
    console.log('Migration 004 applied.');
  } catch (err) {
    console.error('Migration 004 failed:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
