# DECISIONS.md
> Locked architectural decisions. Never override without flagging in MEMORY.md first.
> Index: [AUTH] [STACK] [MECHANICS] [CONTENT] [SCOPE] [LOBBY] [ROUND_STRUCTURE] [SEQUENCE_LOCK] [R1_FRAGMENT_GROUPS] [R1_SPEED_BUCKETS] [UNLOCKS_PER_ROUND] [HARAYA_NARRATIVE] [MINIMAL_UI] [R2_RIDDLES] [R3_ORDERING] [LEAD_CAPTURE] [HOST_AS_FACILITATOR] [HOST_DASHBOARD] [SUBMISSION_LIMITS]

---

## [AUTH]
- Guest UUID only. No login, no accounts for MVP.
- player row inserted on join. UUID auto-generated server-side.

## [STACK]
- PostgreSQL via Supabase. Relational. No MongoDB, no NoSQL.
- Supabase Realtime for live phase sync. No Socket.io.
- Upstash Redis for game_state and timers only. Nothing else.
- Node.js server. pg + dotenv. Port 3000.

## [MECHANICS]
- Soki trigger: binary. Agreement measured via Shannon entropy H over Q1 4-option distribution. H ≤ 1.2 → Soki injected. H > 1.2 → Truth shown. (Max H = log₂(4) = 2.0; min = 0.)
- **TODO (post-MVP):** expose threshold as `realm_config.soki_entropy_threshold` to tune Soki difficulty per realm. Future dimension for iteration.
- Individual Sequence: shared collective reality. Not per-player private.
- Personal Fragment: a character's backstory is split into N pieces and distributed RANDOMLY to OTHER players (never to the character's own player). Owner does not see their own fragments. Not scored. ⚠️ Current code (round/start in server.js) writes the full backstory to the character's own player — needs refactor in S1 task T6 / round-start logic.
- Vote events: Q1 pre-game, Q2 post-R1, Q3 post-R2, Q4 final ordering = score.
- Score: collective only. Never individual. Final shown as %.

## [CONTENT]
- Realms: creator-built for MVP. Host-built in v2.
- Sequences: algorithm-generated. No AI.
- 04 Haraya Realm is DRAFT. SQL seeding requires explicit human approval.

## [LOBBY]
- Min players to start: 10 in prod. `DEMO_MODE=true` env flag → 1 non-host player (host + 1 joiner is enough). Count excludes host per [HOST_AS_FACILITATOR]. Hardcoded as MIN_PLAYERS in server.js, gated by env.
- Creator dashboard (v2+) will expose this as an editable realm_config field.
- Session state: localStorage, 3 fields {c, p, h}. Survives tab closure so host/player can jump in and out. Cleared on 404 (game gone) or status='finished'. (Was sessionStorage; overridden 2026-04-29 — see MEMORY [LOG].)
- API URL: auto-detected by hostname. localhost → port 3000. Production → soki-api.vayv.tech.

## [SCOPE]
- Riddles, Puzzles, Clues: schema exists, not active in MVP.
- No analytics, no event log, no PlayerVisibility in MVP.
- Game State lives in Redis, not written to Postgres per tick.

---

## [ROUND_STRUCTURE] — added 2026-04-29
- 4 phases per session: R0 (pre-game) + R1 + R2 + R3. See ROUNDS.md.
- R0 maps to existing `vote_questions.phase='pre_game'`. No `rounds` row needed.
- R1/R2/R3 = `rounds.round_number` 1/2/3. Existing constraint `BETWEEN 1 AND 3` stays.
- The "5 rounds (full)" line in PHILOSOPHY [GAME_MECHANICS] is a future-version note; MVP stays at 3 gameplay rounds + R0.

## [SEQUENCE_LOCK] — added 2026-04-29
- Top-bar UI on /play. Shared host + player view. See SEQUENCE_LOCK.md.
- Two states only: unlocked (bright grey gradient) / locked (dashed dark grey). Type (truth/soki) NEVER revealed visually.
- 10-piece puzzle silhouette library in `:lib/puzzle-pieces.js`. Server picks random index per unlock; persisted in `sequence_unlock.puzzle_piece_index`.

## [R1_FRAGMENT_GROUPS] — ⚠ FLAG: overrides prior [MECHANICS] line
- **Prior** (PHILOSOPHY + this file [MECHANICS]): fragments distributed RANDOMLY to OTHER players.
- **New**: realm pre-assigns groups (avg ~4 players). Each player holds fragments about OTHER members of their assigned group only.
- **Why**: enables R1 group-discovery mechanic + group continuity into R2.
- **Preserved**: rule "never holds fragments of own character" stays.
- **Action**: server.js `startRound` distribution (lines ~282-296) must be refactored before R1 ships. Tracked in MEMORY [NEXT].

## [R1_SPEED_BUCKETS] — added 2026-04-29
- Bucket determines unlock type mix at end of R1.
- all_fast (every group ≤ fast threshold) → 2 truth.
- some_fast → 1 truth + 1 soki (favors truth on odd counts).
- none_fast (timer expires OR all slow) → 2 soki.
- Threshold per realm: `realm_config.r1_speed_thresholds JSONB` (proposed).
- Logic lives in `:lib/scoring.js` (`speedBucket`, `r1UnlockTypes`).

## [UNLOCKS_PER_ROUND] — added 2026-04-29
- Variable per realm. Proposed field: `realm_config.unlocks_per_round JSONB`, e.g. `{"0":1,"1":2,"2":1,"3":1}` = 5 tiles total.
- Demo realm: 5 total slots (R0=1, R1=2, R2+R3=2 — split TBD).

## [MINIMAL_UI] — added 2026-04-30
> Reaffirms PHILOSOPHY [DESIGN_PRINCIPLES] #4: "Minimal UI, maximum presence — the app supports the room, it does not replace it."

The /play web app is for **state, votes, and sequence-lock** — not conversation. Q&A between players happens **in the physical room**.

### Removed from /play
- `ask-panel` — "ask another player" form (target dropdown + question textarea + ask_ btn)
- `qlist-panel` — "questions this round" list
- `open chat_` button in host-panel

### Removed from server.js
- `POST /api/games/:code/questions` (postQuestion)
- `GET /api/games/:code/questions` (listQuestions)
- `chatting` from `VALID_PHASES` (kept: `voting`, `ended`)

### Default phase
- Round starts in `voting` (was `chatting`). Vote panel renders immediately when host starts the round (or when realm content for that round is a vote).
- Host controls collapse to: `open vote_` (if not yet open) + `end round_`.

### Kept
- Sequence-lock top bar
- Character + fragments view (informational; players reason about fragments IRL)
- Vote / fragment-guess / ordering panels (these are app actions, not conversations)
- `questions` table in schema — orphan for now; do not drop. Future-version feature might re-introduce a "submit a written clue" mechanic; cheap to keep.

### Migration note
- Existing UI files: `soki/play/index.html` panels + JS to be deleted.
- Phase enum simplification can wait — just remove `chatting` from `VALID_PHASES` and update `current_phase` default to `voting` in the boot migration.

### Player view — per-round panel visibility (revised 2026-05-01 from user CSV)
**❌ = the entire DOM block is unmounted.** No section title (`// label`), no header, no subtext, no empty placeholder, no container border.

| element | R0 (0/3) | R1 (1/3) | R2 (2/3) | R3 (3/3) | End |
|---|---|---|---|---|---|
| top row: `@username · id` (left) · `ROUND N/3` (right) | ✅ | ✅ | ✅ | ✅ | ✅ |
| sequence-lock tiles + `X/N unlocked` caption | ✅ (all locked) | ✅ (if any unlocked) | ✅ (if any unlocked) | ❌ (tiles distributed to groups — see R3 row) | ❌ |
| `// you are` — character name | ✅ | ✅ | ✅ | ✅ | ❌ |
| character description (one-liner only, **no culture prefix**) | ✅ | ✅ | ✅ | ✅ | ❌ |
| character ability (italic) — **removed for MVP** | ❌ | ❌ | ❌ | ❌ | ❌ |
| edit username field | ✅ | ❌ | ❌ | ❌ | ❌ |
| `// fragments you hold` panel | ❌ | ✅ (3 fragments) | ❌ | ❌ | ❌ |
| location header (name + description) | ❌ | ❌ | ✅ | ❌ | ❌ |
| `// answer this…` + 2×2 option grid | ✅ (Q1 oracle) | ❌ | ❌ | ❌ | ❌ |
| `submit` button — 1.5s hold-to-confirm; locks panel after submit | ✅ | ✅ (per fragment guess) | ❌ (captain has own submit inside riddle) | ❌ | ❌ |
| fragment-guess form — match each fragment to a player **from the full non-host roster** | ❌ | ✅ | ❌ | ❌ | ❌ |
| captain badge (`you are captain` / passive viewer) | ❌ | ❌ | ✅ | ❌ | ❌ |
| riddle quiz (question + 4-option 2×2; captain submits, others read-only) | ❌ | ❌ | ✅ | ❌ | ❌ |
| round timer countdown | ❌ | ✅ | ✅ | ✅ | ❌ |
| R3 group tile cards (player's assigned subset only — what was distributed to their group) | ❌ | ❌ | ❌ | ✅ | ❌ |
| drag-to-order canvas | ❌ | ❌ | ❌ | ❌ (host operates) | ❌ |
| final % screen (karaoke-style) | ❌ | ❌ | ❌ | ❌ | ✅ |
| lead-capture iframe (Typeform/Airtable) | ❌ | ❌ | ❌ | ❌ | ✅ |
| `// how it works` collapsible (bottom) | ✅ | ✅ | ✅ | ✅ | ❌ |
| game-paused overlay (when `games.is_paused=true`) | conditional | conditional | conditional | conditional | ❌ |

### Player view — vote/oracle panel polish (added 2026-05-01)
- **Title**: `answer this...` only. Remove `// oracle question`, `// phase: pre_game/post_round_1/...`, vote_question_id, and any backend identifier from the player's view.
- **Options layout**: 2×2 grid of boxes (not a vertical list). Each option is a clickable card. Selected option visually distinct (e.g. neon border).
- **Submit button**: label = `submit` (not "submit vote_" or "ask_"). One-time action — once submitted, options + button grey out; no resubmit.
- **Hold-to-confirm**: all player submit actions require **1.5-second hold** to commit. Same visual as host hold-to-activate (green `::before scaleX(0→1)` fill, cancel on early pointerup). Applies to R0 oracle submit, R1 fragment-guess submit, R2 riddle-answer submit (captain). Host submits stay at 2.5s; player submits at 1.5s.

---

## [R2_RIDDLES] — added 2026-04-30
- R2 task: each group solves 1 bundle of 3 ascending-difficulty riddles together. See ROUNDS.md [R2].
- **Captain mechanic**: in-group "most suspicious" vote at R1 end → top per group = `groups.captain_player_id`. Captain locks the group's submitted answer for each riddle. All members see the riddle; only captain submits.
- **Riddle source**: global open-source pool. NOT realm-linked (`riddles.realm_id` becomes nullable). Text-based for MVP. Categories: logic / pattern / verbal. Visual / Mensa-style v2+.
- **Source candidates evaluated** (see ACKNOWLEDGEMENTS.md [PENDING_REVIEW]):
  - `crawsome/riddles` — on hold (no LICENSE; open-ended format needs distractor generation).
  - Open Trivia DB (CC-BY-SA, multiple-choice native, has difficulty + category) — preferred fallback for starter pool.
- **Attribution rule**: every external dataset that ships seeded data must be listed in `:docs/ACKNOWLEDGEMENTS.md [DATA]` before code lands. Surface a "Credits / Riddles" line on the post-game screen.
- Bundle = 3 riddles, ascending difficulty. Backend assigns one bundle per group at R2 start. Different groups get different bundles.
- Bundle timer: all 3 riddles within `realm_config.r2_timer_seconds`. Once submitted, no changes.
- **Bucket math** (collective room-wide → unlock types):

| condition | unlocks |
|---|---|
| all-correct + fast room avg | 2 truth |
| all-correct + slow | 1 truth + 1 soki |
| mixed correctness + fast | 1 truth + 1 soki |
| mixed slow / timeout | 2 soki |

- Logic in `:lib/scoring.js r2BucketTypes` (to add — same shape as `r1UnlockTypes`).

## [R3_ORDERING] — added 2026-04-30
- R3 = pure ordering. **0 new unlocks**. See ROUNDS.md [R3].
- All R0/R1/R2 unlocked tiles redistributed across groups by random shuffle (`total / N groups`; uneven OK). Stored in `sequence_unlocks.assigned_to_group_id`.
- Each group sees only their assigned subset; discussion happens IRL.
- **Host operates** the drag-to-order UI for the single collective ordering. Captains are not relevant.
- Timer cap: `realm_config.r3_timer_seconds` (default 1200 = 20 min, adjustable).
- **Scoring** (`:lib/scoring.js r3Score` — to add):
  - Each correctly-placed truth tile (matches `truth_sequences.order_index`): `+1`
  - Each soki placed anywhere in the order: `−1`
  - Final %: `max(0, score) / max_possible × 100`
- Vision (not required for MVP): karaoke-style number-up animation.
- **Reveal gating**: if `score ≥ realm_config.r3_pass_threshold` (default 85), host sees `individual_sequences.content` matching `games.killer_path`. Players always see only %. If below, host gets "try again" CTA.

## [HOST_AS_FACILITATOR] — added 2026-04-30
> Host is a **facilitator**, NOT a player. (Future v2+ may reconsider; not now.)

### Host has none of:
- Character, character one-liner, ability
- Fragments
- Group / group membership
- Vote ballot (Q1, Q2, Q3 — host does not vote)
- R1 captain election (host is not eligible)
- R2 riddle answer (host does not participate)

### Host view (/play when `is_host=true`) shows ONLY:
1. **Player count line** — `// X of N players` (always visible)
2. **Roster toggle** — button `show roster ▾` / `hide roster ▴`. Expanded panel shows a 3-column table only: `username · player_id · character_name`. Default: collapsed.
3. **Sequence-lock top bar** — same visual as players (per [SEQUENCE_LOCK]).
4. **Active timer** — countdown for current round.
5. **Round controls** (horizontal row, all visible) — `end round` / `next round` / `pause` / `restart` / `swap`. All **hold-to-activate** (see below).
6. **R3 only** — drag-to-order canvas (host operates the ordering for the room).
7. **R3 reveal screen** — if `score ≥ realm_config.r3_pass_threshold`, killer-path narrative (host-only).
8. **End-of-session** — `download CSV` button + embedded Typeform/Airtable iframe.

### Removed from host view (per 2026-05-01 simplification)
- **Round outcome / results panel** — no per-round entropy/bucket/tally surfaced in UI. Same data available **only via post-session CSV export** (`GET /api/games/:code/export.csv`). The `GET /results` endpoint stays as the CSV builder's data source; just unrendered.
- **`open vote` button** — vote opens automatically when round starts. Players see the vote on `current_phase='voting'` (the only active phase).
- **Round overview list** — replaced by the running sequence-lock top bar (already conveys progress).
- **Outcome banner / soki-truth label** — host doesn't see truth/soki classification of unlocks (consistent with players, per [SEQUENCE_LOCK] state-hidden rule).

### Hold-to-activate buttons
- **Host destructive actions** (`end round`, `next round`, `pause`, `restart`, `swap`): **2.5-second hold**.
- **Player submit actions** (R0 oracle, R1 guess, R2 riddle): **1.5-second hold**. Revised 2026-05-01.
- Mechanic: `pointerdown` starts the timer. A green fill animates left→right inside the button via `::before` overlay with `transform: scaleX(0→1)`. JS sets `setTimeout(commit, ms)` on pointerdown; clears on pointerup if early. Release before complete → cancel + reset. Reach 100% → fire action.
- Once a player submit fires, the panel locks (options + button grey out, no resubmit).

### Host view does NOT show:
- Location name / description
- "You are X" character panel
- "Fragments you hold" panel
- Vote panel (Q1/Q2/Q3 are for players)
- Riddle quiz (for groups)

### Code implications
- `startRound` and group formation: filter `WHERE players.is_host = false` when assigning characters, distributing fragments, and forming groups.
- `MIN_PLAYERS` semantics: counts **non-host** players (i.e. participants). Currently MIN_PLAYERS=10 prod / 2 demo — interpret as "actual players excluding host". `startGame` count check: `WHERE NOT is_host`.
- Vote endpoints (`POST /vote`, R0/R1/R2 captain-vote, R2 riddle-answer): reject if `player.is_host = true` with 403.
- `/play` UI: split into two render paths driven by `state.isHost`. Most existing player panels become host-hidden.
- Sequence-lock top bar: shared rendering path; host's username row reads `@username · HOST` (already in mockup).

### Migration note
- No schema change required — `players.is_host` already exists. Existing host rows in `character_assignments` from old games are orphaned/harmless; new rounds simply skip host insertion.

---

## [LEAD_CAPTURE] — added 2026-04-30 (revised)
- Lead-capture form available **after every session** (not gated on R3 score).
- Form fields: `email` (required), `name`, `would_recommend_to_who`, `comment`.
- **Hosting** (revised): **external embed** (Typeform / Airtable / similar). Not a Soki table. Simplest possible.
- Surface: end-of-game screen, both above and below the threshold. Iframe or link.
- `r3_lead_capture` table → **dropped from SCHEMA [PROPOSED]** (no DB write needed).

## [SUBMISSION_LIMITS] — added 2026-05-01
> Each player gets **one submission per actionable surface per round**. Backend-enforced. Frontend cannot rely on UI lockout alone.

| round | surface | unique on | enforcement |
|---|---|---|---|
| R0 | oracle vote | `votes UNIQUE (game_id, player_id, vote_question_id)` | already in schema; postVote returns 409 on 23505 |
| R1 (end) | captain ballot ("most suspicious in your group") | `group_captain_votes UNIQUE (game_id, group_id, voter_player_id)` | **verify constraint exists** in migration 003; if missing, add via ALTER TABLE |
| R1 | fragment-guess (one per held fragment) | `fragment_guesses UNIQUE (fragment_id, guesser_player_id)` | **verify** in migration 002 |
| R2 | riddle-answer (captain only) | `riddle_answers UNIQUE (assignment_id, riddle_id)` | **verify** in migration 003. Reject if `caller.player_id != groups.captain_player_id` |
| R3 | host ordering | n/a — host action; idempotent overwrite into `r3_orderings` | host-only |

### Server enforcement rules
- Every submission endpoint must guard:
  1. caller is not host (`is_host = false`) — already mandated by [HOST_AS_FACILITATOR]
  2. caller has the right role for the action (e.g. captain for riddle answer)
  3. `INSERT … ON CONFLICT DO NOTHING` is **not** acceptable for these — must surface 409 so the client can show "already submitted"
- Frontend lock (grey out + disable) is a UX nicety, never the only safeguard.

### Action items if any constraint is missing
- Code: audit migration 002 + 003 for the UNIQUE clauses above. If missing, add a small migration 005a (ALTER TABLE … ADD CONSTRAINT). Idempotent.

---

## [HOST_DASHBOARD] — added 2026-04-30
> Phase 7 — host facilitator UI. Run-time control only. Realm authoring stays v2+.

### Location
- Embedded in `/play` when `is_host=true` (extends current host view; same render path). Confirmed 2026-04-30.

### Reveal text source
- `individual_sequences.content` keyed by `games.killer_path`. **Authored at realm-seed time** (see HARAYA_NARRATIVE). Host does NOT compose live. Host triggers the reveal screen when score ≥ `realm_config.r3_pass_threshold`.

### Live moderation tools
| MVP | Deferred |
|---|---|
| pause game / resume | kick player |
| restart current round | override score |
| swap player (rename / re-seat an existing player_id) | override killer_path |

### Post-game export
- Single CSV per session, **≤ half A4** (≈ 30 lines max).
- Suggested columns: session_code, started_at, ended_at, player_count, killer_path, r0_outcome, r0_unlocks, r1_speed_bucket, r1_unlocks, r2_speed_bucket, r2_unlocks, r3_score_percent, r3_reveal_unlocked.
- Endpoint: `GET /api/games/:code/export.csv` (host-only).

### Lead capture in dashboard
- External embed (Typeform / Airtable). Host does NOT see submissions in-app. Submissions live with whichever provider is chosen.

### Schema additions for Phase 7
- `games.is_paused BOOL NOT NULL DEFAULT false`
- `games.paused_at TIMESTAMPTZ`
- New endpoints (no new tables needed beyond pause flags).

---

## [HARAYA_NARRATIVE] — added 2026-04-29 (revised 2026-04-30, 2026-05-01)
- `characters.description` = **one-liner only** (no culture prefix) — player-facing tagline. Player sees this in `/round/me`. Revised 2026-05-01: culture (Hiwaga / Salawahi / Munda) dropped from description; remains in narrative flavor of backstory only. Has no mechanical role since R1_FRAGMENT_GROUPS are random.
- `characters.special_ability` — **not used in MVP**. Field stays in schema but not rendered or seeded.
- `characters.backstory` = ~60-word omniscient riddle. Splittable into 3 fragments (~20 words each) — distributed to 3 group-mates per R1 group composition.
- Fragments use **referential hints, not character names**. Backstory must NOT reuse the one-liner's words (or the riddle becomes the answer).
- Tone: omniscient narrator. Past tense.
- **Random killer path per game**: backend rolls `games.killer_path ∈ {A,B,C}` at game start. Path A = Root Singer (tonic). Path B = Shadow Cartographer (Veil fracture). Path C = Exile's Child (revenge). All 3 backstories carry plausible threads regardless of which is rolled.
- **`individual_sequences` are NOT tiles** (revised). They are the **host-only reveal narrative** shown when `r3 score ≥ realm_config.r3_pass_threshold`. Keyed by `games.killer_path` via `unlock_condition='killer_path:{A|B|C}'`. Players never see them.
- Sequence-lock tiles (R0/R1/R2 unlocks) are drawn from `truth_sequences` and `soki_sequences` only.
- 4 `soki_sequence` rows seeded: misdirections injected when `soki_trigger_rule` fires "soki" outcome.
- `truth_sequences[4]` stays path-agnostic ("Incident occurs (path-dependent)"). The path-specific resolution lives in the matching `individual_sequence`.
- Players see only success % at game end. **Full reveal text** is host-only, gated by score ≥ threshold.
- Proposed schema: `games.killer_path TEXT CHECK (killer_path IN ('A','B','C'))` (applied 2026-04-30).
