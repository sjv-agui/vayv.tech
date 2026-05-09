# ROUNDS.md
> Canonical round-by-round spec. Read before touching round logic.
> Index: [STRUCTURE] [R0] [R1] [R2] [R3] [UNLOCKS]

---

## [STRUCTURE]
4 phases per session: R0 (pre-game setup + oracle) + R1 + R2 + R3 (gameplay).
Schema mapping: R0 = `vote_questions.phase='pre_game'` (no `rounds` row). R1/R2/R3 = `rounds.round_number` 1/2/3.

**Conversation happens in the physical room.** Per DECISIONS [MINIMAL_UI], the app handles state, votes, fragment-guesses, and ordering only — not chat between players. There is no "open chat" phase.

**Host is a facilitator, not a player.** Per DECISIONS [HOST_AS_FACILITATOR], the host has no character, no fragments, no group, and does not vote in any round. All "players" / "group members" references below mean `players WHERE is_host = false`. The host operates the R3 drag-to-order UI but does not participate in scoring.

| Phase | Vote phase tag | Round row? | Default unlocks |
|---|---|---|---|
| R0 | pre_game | no | 1 (truth or soki by entropy) |
| R1 | post_round_1 | yes (round_number=1) | 2 (split by speed bucket) |
| R2 | post_round_2 | yes (round_number=2) | 2 (collective bucket — riddles) |
| R3 | final | yes (round_number=3) | 0 (pure ordering) |

Demo realm total: **5** sequence tiles (R0=1, R1=2, R2=2, R3=0).

---

## [R0] — setup + oracle vote
1. Players join lobby; host starts game.
2. Each player can edit name; sees own character (name + one-liner only, no backstory).
3. Shared oracle question (4 options, designed by realm creator) appears.
4. All players vote.
5. Tally → Shannon H over 4-option distribution → `:lib/scoring.js evaluateOracle`.
6. Outcome unlocks 1 sequence (truth if `H ≤ threshold`, soki otherwise) per `soki_trigger_rule`.
7. After vote completes, each player sees fragments they hold (about other characters).

Unlock count: **1**.

---

## [R1] — find your group
1. Realm pre-assigns players into groups (avg `realm_config.group_size_avg`, default 4).
2. Each player holds fragments about the OTHER members of their assigned group only.
3. Goal: locate the players whose fragments you hold.
4. Holder submits a guess per fragment ("which player is this fragment about?") via questionnaire.
5. Round completes only when all groups are correctly resolved.
6. Timer measures speed.

**Speed → unlocks** (per `:lib/scoring.js speedBucket` + `r1UnlockTypes`):

| Bucket | Condition | Unlocks |
|---|---|---|
| all_fast | every group resolved ≤ fast threshold | 2 truth |
| some_fast | partial | 1 truth + 1 soki |
| none_fast | timer expires OR all slow | 2 soki |

Groups carry forward into R2.

Unlock count: **2**.

---

## [R2] — solve riddles together
1. Groups (formed in R1) carry over.
2. **Captain election**: in-group "most suspicious" vote at R1 end → top vote per group = `groups.captain_player_id`. Captain locks the group's submitted answer.
3. Each group receives one bundle of 3 ascending-difficulty riddles (logic / pattern / verbal). Different groups get different bundles.
4. All group members see the same riddle on their screen; only the captain submits the locked answer.
5. Bundle timer applies (all 3 riddles within `realm_config.r2_timer_seconds`).
6. Once submitted, answers cannot change.

**Riddle source**: global open-source pool. NOT realm-linked. Text-based for MVP; visual variants later (Mensa-style v2+).

**Bucket math** (collective across the whole room, per `:lib/scoring.js r2BucketTypes` — to add):

| condition (across all groups) | unlocks |
|---|---|
| all-correct + fast room avg | 2 truth |
| all-correct + slow | 1 truth + 1 soki |
| mixed correctness + fast | 1 truth + 1 soki |
| mixed slow / timeout | 2 soki |

Unlock count: **2**.

---

## [R3] — final ordering
1. All unlocked tiles redistributed across groups (random shuffle, `total / N groups`; uneven OK — last group may carry the remainder).
2. Each group sees only their assigned subset; discussion happens IRL.
3. **Host operates the drag-to-order UI** — single collective ordering of ALL tiles. (Host doesn't know the answer either.)
4. Captains are not relevant in R3.
5. Timer cap: `realm_config.r3_timer_seconds` (default 1200 = 20 min, adjustable).
6. **No new unlocks**.

**Scoring** (per `:lib/scoring.js r3Score` — to add):
- Each correctly-placed truth tile: `+1`
- Each soki placed anywhere in the order: `−1`
- Final percent: `max(0, score) / max_possible × 100`
- Vision: progressive karaoke-style number-up animation toward the final %.

**Reveal**:
- All players + host see the final %.
- If `score ≥ realm_config.r3_pass_threshold` (default 85): host sees the killer-path reveal narrative drawn from `individual_sequences.content WHERE unlock_condition = 'killer_path:'||games.killer_path`. Players still see only %.
- If `< threshold`: host gets "try again" CTA. No reveal.
- **Lead-capture form available after any session** (regardless of score). Fields: `email`, `name`, `would_recommend_to_who`, `comment`.

Unlock count: **0**.

---

## [UNLOCKS]
- Total per game = sum of `realm_config.unlocks_per_round` JSON, e.g. `{"0":1,"1":2,"2":1,"3":1}` = 5 tiles in top bar.
- Each unlock writes a `sequence_unlock` row with a `puzzle_piece_index` 1-10 (random pick from `:lib/puzzle-pieces.js`).
- UI: see SEQUENCE_LOCK.md.
- Type (truth/soki) is recorded in `sequence_unlock.sequence_type` but NEVER rendered visually.
