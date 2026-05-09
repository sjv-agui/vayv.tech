const path = require('path');
require(path.join(__dirname, '../soki/node_modules/dotenv')).config({ path: path.join(__dirname, '../soki/.env') });
const { query } = require('../soki/db');

const sql = `
BEGIN;

-- groups: R1 group-find mechanic; persists into R2
CREATE TABLE IF NOT EXISTS groups (
  group_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  formed_at_round INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- group_members: composition of each group
CREATE TABLE IF NOT EXISTS group_members (
  group_id   UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, player_id)
);

-- fragment_guesses: per-guess record for R1 questionnaire + speed tracking
CREATE TABLE IF NOT EXISTS fragment_guesses (
  guess_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fragment_id            UUID NOT NULL REFERENCES personal_fragments(fragment_id) ON DELETE CASCADE,
  guesser_player_id      UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  guessed_target_player_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  is_correct             BOOLEAN NOT NULL,
  guessed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- sequence_unlocks: top-bar event log; one row per tile unlocked
CREATE TABLE IF NOT EXISTS sequence_unlocks (
  unlock_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id            UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  round_number       INT NOT NULL,
  sequence_type      TEXT NOT NULL CHECK (sequence_type IN ('truth','soki','individual')),
  sequence_ref_id    UUID NOT NULL,
  puzzle_piece_index INT NOT NULL CHECK (puzzle_piece_index BETWEEN 1 AND 10),
  unlocked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- realm_config columns
ALTER TABLE realm_config
  ADD COLUMN IF NOT EXISTS unlocks_per_round   JSONB,
  ADD COLUMN IF NOT EXISTS group_size_avg      INT NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS r1_speed_thresholds JSONB;

-- rounds columns
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS timer_seconds INT,
  ADD COLUMN IF NOT EXISTS speed_bucket  TEXT CHECK (speed_bucket IN ('all_fast','some_fast','none_fast'));

-- games column
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS killer_path TEXT CHECK (killer_path IN ('A','B','C'));

COMMIT;
`;

(async () => {
  try {
    await query(sql);
    console.log('Migration 002 applied.');
  } catch (err) {
    console.error('Migration 002 failed:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
