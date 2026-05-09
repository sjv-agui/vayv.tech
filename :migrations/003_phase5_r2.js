const path = require('path');
require(path.join(__dirname, '../soki/node_modules/dotenv')).config({ path: path.join(__dirname, '../soki/.env') });
const { query } = require('../soki/db');

const sql = `
BEGIN;

-- riddle_bundles: groups 3 riddles; global pool, not realm-linked
CREATE TABLE IF NOT EXISTS riddle_bundles (
  bundle_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  difficulty_level INT NOT NULL CHECK (difficulty_level BETWEEN 1 AND 5),
  category         TEXT NOT NULL CHECK (category IN ('logic','pattern','verbal')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- riddle_assignments: which group gets which bundle in this game
CREATE TABLE IF NOT EXISTS riddle_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  group_id      UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  bundle_id     UUID NOT NULL REFERENCES riddle_bundles(bundle_id),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  UNIQUE (game_id, group_id)
);

-- riddle_answers: captain's locked answer per riddle
CREATE TABLE IF NOT EXISTS riddle_answers (
  answer_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id     UUID NOT NULL REFERENCES riddle_assignments(assignment_id) ON DELETE CASCADE,
  riddle_id         UUID NOT NULL REFERENCES riddles(riddle_id),
  group_id          UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  captain_player_id UUID NOT NULL REFERENCES players(player_id),
  selected_option   CHAR(1) NOT NULL CHECK (selected_option IN ('a','b','c','d')),
  is_correct        BOOLEAN NOT NULL,
  answered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, riddle_id)
);

-- group_captain_votes: in-group "most suspicious" vote at R1 end
CREATE TABLE IF NOT EXISTS group_captain_votes (
  vote_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  group_id         UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  voter_player_id  UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  voted_player_id  UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  cast_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, group_id, voter_player_id)
);

-- riddles: add MVP columns (global pool + MC options)
ALTER TABLE riddles
  ALTER COLUMN realm_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS option_a        TEXT,
  ADD COLUMN IF NOT EXISTS option_b        TEXT,
  ADD COLUMN IF NOT EXISTS option_c        TEXT,
  ADD COLUMN IF NOT EXISTS option_d        TEXT,
  ADD COLUMN IF NOT EXISTS correct_option  CHAR(1) CHECK (correct_option IN ('a','b','c','d')),
  ADD COLUMN IF NOT EXISTS category        TEXT CHECK (category IN ('logic','pattern','verbal')),
  ADD COLUMN IF NOT EXISTS bundle_id       UUID REFERENCES riddle_bundles(bundle_id),
  ADD COLUMN IF NOT EXISTS order_in_bundle INT;

-- realm_config: R2 timer + speed thresholds
ALTER TABLE realm_config
  ADD COLUMN IF NOT EXISTS r2_timer_seconds    INT NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS r2_speed_thresholds JSONB;

-- groups: captain election result
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS captain_player_id UUID REFERENCES players(player_id);

COMMIT;
`;

(async () => {
  try {
    await query(sql);
    console.log('Migration 003 applied.');
  } catch (err) {
    console.error('Migration 003 failed:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
