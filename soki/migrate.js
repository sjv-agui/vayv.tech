require('dotenv').config();
const { query } = require('./db');

const sql = `
CREATE TABLE IF NOT EXISTS realms (
  realm_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  max_players   INT NOT NULL DEFAULT 6,
  min_players   INT NOT NULL DEFAULT 2,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS realm_config (
  config_id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id                    UUID NOT NULL REFERENCES realms(realm_id) ON DELETE CASCADE,
  rounds_total                INT NOT NULL DEFAULT 3,
  max_active_soki_sequences   INT NOT NULL DEFAULT 3,
  scoring_weight_positive     NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  scoring_weight_negative     NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  sequence_reveal_mode        TEXT NOT NULL CHECK (sequence_reveal_mode IN ('simultaneous','one-by-one'))
);

CREATE TABLE IF NOT EXISTS locations (
  location_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id      UUID NOT NULL REFERENCES realms(realm_id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  image_url     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS games (
  game_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id        UUID NOT NULL REFERENCES realms(realm_id),
  session_code    TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','playing','finished')),
  host_player_id  UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS players (
  player_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  username      TEXT NOT NULL,
  avatar_url    TEXT,
  is_host       BOOLEAN NOT NULL DEFAULT FALSE,
  is_connected  BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE games
  ADD CONSTRAINT fk_host_player
  FOREIGN KEY (host_player_id) REFERENCES players(player_id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS characters (
  character_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id          UUID NOT NULL REFERENCES realms(realm_id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  backstory         TEXT,
  special_ability   TEXT,
  image_url         TEXT
);

CREATE TABLE IF NOT EXISTS rounds (
  round_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  location_id   UUID NOT NULL REFERENCES locations(location_id),
  round_number  INT NOT NULL CHECK (round_number BETWEEN 1 AND 3),
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  UNIQUE (game_id, round_number)
);

CREATE TABLE IF NOT EXISTS character_assignments (
  assignment_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  round_id        UUID NOT NULL REFERENCES rounds(round_id),
  player_id       UUID NOT NULL REFERENCES players(player_id),
  character_id    UUID NOT NULL REFERENCES characters(character_id),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, round_id, player_id)
);

CREATE TABLE IF NOT EXISTS vote_questions (
  vote_question_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id          UUID NOT NULL REFERENCES realms(realm_id) ON DELETE CASCADE,
  phase             TEXT NOT NULL CHECK (phase IN ('pre_game','post_round_1','post_round_2','final')),
  question_text     TEXT NOT NULL,
  option_a          TEXT NOT NULL,
  option_b          TEXT NOT NULL,
  option_c          TEXT NOT NULL,
  option_d          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS votes (
  vote_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  round_id          UUID REFERENCES rounds(round_id),
  player_id         UUID NOT NULL REFERENCES players(player_id),
  vote_question_id  UUID NOT NULL REFERENCES vote_questions(vote_question_id),
  selected_option   TEXT NOT NULL CHECK (selected_option IN ('a','b','c','d')),
  cast_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, player_id, vote_question_id)
);

CREATE TABLE IF NOT EXISTS soki_trigger_rules (
  rule_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id              UUID NOT NULL REFERENCES realms(realm_id) ON DELETE CASCADE,
  vote_question_id      UUID NOT NULL REFERENCES vote_questions(vote_question_id),
  agreement_threshold   NUMERIC(4,3) NOT NULL,
  result_if_agree       TEXT NOT NULL CHECK (result_if_agree IN ('soki','truth')),
  result_if_disagree    TEXT NOT NULL CHECK (result_if_disagree IN ('soki','truth'))
);

CREATE TABLE IF NOT EXISTS truth_sequences (
  truth_sequence_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id            UUID NOT NULL REFERENCES realms(realm_id) ON DELETE CASCADE,
  order_index         INT NOT NULL,
  statement           TEXT NOT NULL,
  is_key_event        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (realm_id, order_index)
);

CREATE TABLE IF NOT EXISTS individual_sequences (
  individual_sequence_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id                UUID NOT NULL REFERENCES realms(realm_id) ON DELETE CASCADE,
  content                 TEXT NOT NULL,
  round_unlocked          INT,
  unlock_condition        TEXT,
  order_index             INT,
  revealed_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS soki_sequences (
  soki_sequence_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id                      UUID NOT NULL REFERENCES realms(realm_id) ON DELETE CASCADE,
  content                       TEXT NOT NULL,
  triggered_by_vote_question_id UUID REFERENCES vote_questions(vote_question_id),
  is_active                     BOOLEAN NOT NULL DEFAULT FALSE,
  penalty_score                 NUMERIC(6,2) NOT NULL DEFAULT 0,
  activated_at_round            INT
);

CREATE TABLE IF NOT EXISTS personal_fragments (
  fragment_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  round_id      UUID NOT NULL REFERENCES rounds(round_id),
  player_id     UUID NOT NULL REFERENCES players(player_id),
  character_id  UUID NOT NULL REFERENCES characters(character_id),
  content       TEXT NOT NULL,
  is_shared     BOOLEAN NOT NULL DEFAULT FALSE,
  shared_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS clues (
  clue_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id          UUID NOT NULL REFERENCES realms(realm_id) ON DELETE CASCADE,
  round_id          UUID REFERENCES rounds(round_id),
  content           TEXT NOT NULL,
  unlock_condition  TEXT,
  is_unlocked       BOOLEAN NOT NULL DEFAULT FALSE,
  unlocked_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS questions (
  question_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id          UUID NOT NULL REFERENCES rounds(round_id) ON DELETE CASCADE,
  asker_player_id   UUID NOT NULL REFERENCES players(player_id),
  target_player_id  UUID NOT NULL REFERENCES players(player_id),
  content           TEXT NOT NULL,
  asked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS riddles (
  riddle_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id       UUID NOT NULL REFERENCES realms(realm_id) ON DELETE CASCADE,
  location_id    UUID REFERENCES locations(location_id),
  question_text  TEXT NOT NULL,
  answer_text    TEXT NOT NULL,
  difficulty     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS puzzles (
  puzzle_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id     UUID NOT NULL REFERENCES realms(realm_id) ON DELETE CASCADE,
  location_id  UUID REFERENCES locations(location_id),
  type         TEXT NOT NULL CHECK (type IN ('cipher','code','object')),
  description  TEXT NOT NULL,
  solution     TEXT NOT NULL,
  hint         TEXT,
  difficulty   TEXT
);

CREATE TABLE IF NOT EXISTS sequence_evaluations (
  evaluation_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  truth_sequence_id   UUID NOT NULL REFERENCES truth_sequences(truth_sequence_id),
  match_accuracy      NUMERIC(5,4),
  score_delta         NUMERIC(8,2),
  soki_penalty_total  NUMERIC(8,2),
  evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scores (
  score_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  round_id          UUID REFERENCES rounds(round_id),
  collective_score  NUMERIC(8,2) NOT NULL DEFAULT 0,
  positive_delta    NUMERIC(8,2),
  negative_delta    NUMERIC(8,2),
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function migrate() {
  try {
    await query(sql);
    console.log('Migration complete — all 21 tables created.');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    process.exit();
  }
}

migrate();
