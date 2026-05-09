# SCHEMA.md
> Compact entity reference. Read before touching DB. 21 tables, all created.
> Index: [CORE] [GAME_LOOP] [SEQUENCES] [SCORING] [INDEXES]

---

## [CORE]
| Table | Key Fields |
|---|---|
| realm | realm_id, name, max_players, min_players, is_active |
| realm_config | config_id, realm_id, rounds_total, max_active_soki_sequences, scoring_weight_positive, scoring_weight_negative |
| location | location_id, realm_id, name, is_active |
| character | character_id, realm_id, name, **description (= "Culture. One-liner.")**, **backstory (= ~60-word omniscient riddle, splits into 3 fragments)**, special_ability |

**Character content convention** (per DECISIONS [HARAYA_NARRATIVE]):
- `description` = player-facing tagline shown by `/round/me`.
- `backstory` = riddle text distributed as personal_fragments to 3 group-mates. Must not reuse one-liner words. Referential hints only (no character names).

## [GAME_LOOP]
| Table | Key Fields |
|---|---|
| game | game_id, realm_id, session_code, status(waiting/playing/finished), host_player_id |
| player | player_id, game_id, username, is_host, is_connected |
| round | round_id, game_id, location_id, round_number, status(active/completed) |
| character_assignment | assignment_id, game_id, round_id, player_id, character_id |
| vote_question | vote_question_id, realm_id, phase(pre_game/post_round_1/post_round_2/final), option_a/b/c/d |
| vote | vote_id, game_id, round_id, player_id, vote_question_id, selected_option |
| soki_trigger_rule | rule_id, realm_id, vote_question_id, agreement_threshold, result_if_agree, result_if_disagree |
| question | question_id, round_id, asker_player_id, target_player_id, content |
| clue | clue_id, realm_id, round_id, content, unlock_condition, is_unlocked |

## [SEQUENCES]
| Table | Key Fields |
|---|---|
| truth_sequence | truth_sequence_id, realm_id, order_index, statement, is_key_event |
| individual_sequence | individual_sequence_id, realm_id, content, round_unlocked, order_index |
| personal_fragment | fragment_id, game_id, round_id, player_id, character_id, content, is_shared |
| soki_sequence | soki_sequence_id, realm_id, content, triggered_by_vote_question_id, is_active, penalty_score |

## [SCORING]
| Table | Key Fields |
|---|---|
| score | score_id, game_id, round_id, collective_score, positive_delta, negative_delta |
| sequence_evaluation | evaluation_id, game_id, truth_sequence_id, match_accuracy, score_delta, soki_penalty_total |
| game_state | game_state_id, game_id, round_id, current_phase, timer_ends_at [REDIS] |

## [OUT_OF_SCOPE_MVP]
riddle, puzzle — schema exists, not active

## [INDEXES] — 23 applied
Hot composites: (game_id,status), (game_id,player_id), (game_id,round_id),
(realm_id,phase), (game_id,vote_question_id), (player_id,vote_question_id),
(realm_id,is_active), (game_id,is_unlocked)
Single: game_id on all major tables, realm_id on sequence tables

---

## [PROPOSED] — pending migration (not yet applied)

### R2 / R3 — new tables
| Table | Key Fields | Purpose |
|---|---|---|
| riddle_bundle | bundle_id, difficulty_level, category ('logic'\|'pattern'\|'verbal') | groups 3 riddles into a bundle |
| riddle_assignment | assignment_id, game_id, group_id, bundle_id, started_at, completed_at | which group got which bundle in this game |
| riddle_answer | answer_id, assignment_id, riddle_id, group_id, captain_player_id, selected_option, is_correct, answered_at | locked answers per riddle |
| group_captain_vote | vote_id, game_id, group_id, voter_player_id, voted_player_id, cast_at | in-group "most suspicious" vote at R1 end |
| r3_ordering | ordering_id, game_id, position, sequence_unlock_id, ordered_at | host's drag-to-order placements |
| r3_result | result_id, game_id, score_percent, reveal_unlocked, computed_at | final R3 outcome |
| ~~r3_lead_capture~~ | DROPPED — lead capture is an external embed (Typeform/Airtable). See DECISIONS [LEAD_CAPTURE]. | |

### R2 / R3 — column changes
- `riddles.realm_id` → **drop NOT NULL** (global pool, not realm-linked)
- `riddles` add: `option_a/b/c/d TEXT`, `correct_option CHAR(1) CHECK (correct_option IN ('a','b','c','d'))`, `category TEXT`, `bundle_id UUID`, `order_in_bundle INT`
- `realm_config.r2_timer_seconds INT NOT NULL DEFAULT 600` — bundle window for 3 riddles
- `realm_config.r2_speed_thresholds JSONB`
- `realm_config.r3_timer_seconds INT NOT NULL DEFAULT 1200`
- `realm_config.r3_pass_threshold INT NOT NULL DEFAULT 85` — % unlocking host reveal
- `groups.captain_player_id UUID REFERENCES players(player_id)`
- `sequence_unlocks.assigned_to_group_id UUID REFERENCES groups(group_id)` — for R3 redistribution

### Phase 7 — host dashboard
- `games.is_paused BOOL NOT NULL DEFAULT false`
- `games.paused_at TIMESTAMPTZ`
- (no new tables — moderation actions and CSV export use existing data)

### Renames (deferred — high risk)
- `personal_fragment.player_id` → `holder_player_id` (clarity vs character_id which is the subject)

---

## [APPLIED] — migration 002 (2026-04-30, :migrations/002_phase4_tables.js)

### New tables
| Table | Key Fields | Purpose |
|---|---|---|
| groups | group_id, game_id, formed_at_round | persist R1 groups; carries to R2 |
| group_members | group_id, player_id | composition |
| fragment_guesses | guess_id, fragment_id, guesser_player_id, guessed_target_player_id, is_correct, guessed_at | R1 questionnaire + per-guess speed |
| sequence_unlocks | unlock_id, game_id, round_number, sequence_type, sequence_ref_id, puzzle_piece_index (1-10), unlocked_at | top-bar event log |

### Column additions
- `realm_config.unlocks_per_round JSONB`
- `realm_config.group_size_avg INT NOT NULL DEFAULT 4`
- `realm_config.r1_speed_thresholds JSONB`
- `rounds.timer_seconds INT`
- `rounds.speed_bucket TEXT CHECK (speed_bucket IN ('all_fast','some_fast','none_fast'))`
- `games.killer_path TEXT CHECK (killer_path IN ('A','B','C'))`
