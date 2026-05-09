# MEMORY.md
> Soki MVP — operational brain. Read first. Append after every session.
> Agents: Chat=claude.ai | Code=claude code | Cowork=cowork desktop
> Index: [STATUS] [STACK] [ENTITIES] [BUILD_ORDER] [LOG] [NEXT] [CHECKLIST]

---

## [STATUS]
Phase 1: ✅ complete
Phase 2: ✅ complete — Auth + Lobby (API + /join UI)
Phase 3: ✅ complete — Core Game Loop (all 5 routes done)
Phase 4: ✅ complete — Sequence Lock + R0/R1 mechanics (all tasks done)
Phase 5: ✅ complete — R2 riddles + captain election (migration + endpoints + UI + tests done)
Phase 6: ✅ complete — R3 final ordering + reveal gating + lead capture (migration + 4 endpoints + /play UI)
Phase 4.5: ✅ complete — HOST_AS_FACILITATOR (server + UI render split, roster + results routes)
Active agent last session: Code (2026-05-01)

---

## [STACK]
| Layer | Tool | Notes |
|---|---|---|
| DB | Supabase (PostgreSQL) | aws-0-eu-west-1, session pooler |
| Realtime | Supabase Realtime | on game_state table |
| Auth | Supabase (guest) | auto UUID per session, no login |
| Fast state | Upstash Redis | GameState + timers only |
| Server | Node.js port 3000 | server.js via db.js (pg + dotenv) |
| Editor | VS Code | Claude Code in terminal |

---

## [ENTITIES] — 21 tables, all created via migrate.js
realm, realm_config, location, character, game, player,
vote_question, soki_trigger_rule, round, character_assignment,
vote, question, clue, truth_sequence, individual_sequence,
soki_sequence, personal_fragment, score, game_state, sequence_evaluation, riddle, puzzle

---

## [BUILD_ORDER] — SQL migration sequence
1. realm, realm_config
2. location, character
3. game, player
4. vote_question, soki_trigger_rule
5. round, character_assignment
6. vote, question, clue
7. truth_sequence, individual_sequence, soki_sequence
8. personal_fragment
9. score, game_state, sequence_evaluation

---

## [LOG]
2026-04-26 | Chat | done — data model finalized, 21 entities, indexes, roadmap written
2026-04-26 | Chat | done — Haraya realm curated (DRAFT), 04 Haraya Realm page created
2026-04-26 | Code | done — .env set, server.js running, all 21 tables via migrate.js, deferred FK on games.host_player_id→players
2026-04-26 | Code | done — 23 indexes applied, Haraya seeded (1 realm, 1 config, 5 locations, 12 chars, 4 vote questions, 1 soki rule, 6 truth seqs, 10 clues). Phase 1 complete.
2026-04-26 | Code | done — repo reorganized: removed vayv.tech/vayv.tech/ nesting, soki v26 → soki/, old drafts → _archive/
2026-04-26 | Code | done — Phase 2 complete. server.js: 4 API routes (POST /api/games, POST /api/games/join, GET /api/games/:code, POST /api/games/:code/start). Guest UUID auth, session code generation, 4-player minimum enforced.
2026-04-26 | Code | done — lobby UI: vayv.tech/join (join/index.html). Create/join flow, player list polling every 2.5s, host start controls. Styled to soki design system (style.css classes, nav, footer, tone).
2026-04-26 | Code | done — participate_ links updated: all point to #participate section. Luma calendar embed (cal-MGWrnLUDmFgAsUG) dropped into CTA section. lobby.html removed, /join is canonical.
2026-04-26 | Code | done — Phase 2 hardened: (1) sessionStorage restore on page load — only 3 fields stored {c,p,h}, cleared on game start or stale game; (2) start button hidden until MIN_PLAYERS=10 reached; (3) API URL auto-detects hostname — localhost uses port 3000, production uses soki-api.vayv.tech. MIN_PLAYERS to be editable via creator dashboard in later version.
2026-04-27 | Code | done — Fixed critical bugs: all table names corrected to plural (games/players/rounds/characters/locations etc), game status 'active'→'playing' to match DB constraint. Phase 3 (1,2,3): POST /api/games/:code/round/start (creates round, picks unused location, Fisher-Yates shuffle assigns characters, writes personal_fragments from backstory); GET /api/games/:code/round (public — location + player→character name, no backstory); GET /api/games/:code/round/me?player_id= (private — character + backstory + fragment for that player only).
2026-04-27 | Code | done — Repo reorganized as subprojects: join/ and play/ moved into soki/ (now soki/join/ and soki/play/). soki/files/ renamed to soki/public/ earlier. All internal paths updated. Root .gitignore added. Structure: root=main page, admin/=admin subproject, soki/=soki subproject (public/ landing, join/ lobby, play/ game, server.js backend).
2026-04-27 | Code | done — README.md rewritten as full monorepo overview: subprojects, folder structure, tech stack, local dev setup, Soki build status table, docs index, links.
2026-04-29 | Cowork | done — Sequence Lock top-bar UI v3 specced. 5 tiles (4 unlocked, 1 locked w/ +10% visibility), 2 states only (unlocked / locked), type never revealed. Palette pulled from soki/public/style.css. Foundation written: ROUNDS.md (canonical 4-phase spec R0/R1/R2/R3), SEQUENCE_LOCK.md (UI + 10-piece puzzle library), DECISIONS.md (5 entries appended incl. ⚠ flag on R1_FRAGMENT_GROUPS overriding random distribution), SCHEMA.md ([PROPOSED] section: 4 new tables + 5 columns + 1 deferred rename). Code: soki/lib/scoring.js (extracted shannonEntropy + evaluateOracle + speedBucket + r1UnlockTypes — all pure), soki/lib/puzzle-pieces.js (10 SVG paths). No migrations applied. server.js untouched.
2026-04-29 | Cowork | done — Haraya realm bulked. seed-haraya.js: all 12 character.description rewritten to "Culture. One-liner." (player-facing); all 12 character.backstory now ~50–60-word omniscient riddles, splittable into 3 fragments (R1 distribution). Verified no one-liner word-reuse within own backstory. Added 3 individual_sequences (path-specific reveals A/B/C unlock at R3 via games.killer_path) + 4 soki_sequences (misdirections attached to Q1/Q2/Q3). ON CONFLICT clauses changed to DO UPDATE so re-running seed applies edits. DECISIONS.md [HARAYA_NARRATIVE] entry added; SCHEMA.md [CORE] convention note + games.killer_path appended to [PROPOSED]. Closing-payoff text deferred to host dashboard build.
2026-04-29 | Cowork | done — Drift fix: code is now source of truth for routes. Added 4 missing header comments to server.js (createGame, joinGame, getLobby, startGame). Wrote soki/lib/audit-routes.js — greps `// METHOD /path` headers, prints checklist. Replaced stale manual [CHECKLIST] in MEMORY.md with auto-derived note. AGENTS.md [INDEX_MAP] updated to point at audit script.
2026-04-29 | Code | done — Phase 4 task 1: server.js now imports `shannonEntropy`, `evaluateOracle`, `SOKI_ENTROPY_THRESHOLD` from `./lib/scoring`. Inline copies removed. No behavior change.
2026-04-30 | Code | done — Phase 4 task 1: refactored server.js endRound. Deleted inline shannonEntropy fn + SOKI_ENTROPY_THRESHOLD const. Now imports { shannonEntropy, evaluateOracle, SOKI_ENTROPY_THRESHOLD } from ./lib/scoring.js. Inline highAgreement/outcome logic replaced with evaluateOracle(H, rule). Syntax verified clean.
2026-04-30 | Code | done — Phase 4 task 2: migration 002 applied. Created :migrations/ folder + 002_phase4_tables.js. 4 new tables (groups, group_members, fragment_guesses, sequence_unlocks) + 6 columns (realm_config: unlocks_per_round/group_size_avg/r1_speed_thresholds; rounds: timer_seconds/speed_bucket; games: killer_path). All verified in DB. SCHEMA.md [PROPOSED]→[APPLIED].
2026-04-30 | Code | done — Phase 4 task 3: startRound fragment distribution refactored from random→group-based. Fetches realm_config.group_size_avg (default 4). Partitions shuffled players into groups, inserts groups+group_members rows. Pass 2 now distributes each character's backstory only to owner's group-mates. Rule "never hold own fragments" preserved. Resolves ⚠ DECISIONS [R1_FRAGMENT_GROUPS].
2026-04-30 | Code | done — Phase 4 task 4: POST /api/games/:code/round/0/end. Tallies pre_game votes, shannonEntropy → evaluateOracle, picks truth/soki sequence ref, picks non-colliding puzzle_piece_index 1-10, inserts into sequence_unlocks. Returns full unlock payload. Router handles 6-part path via parts[5]. 15 routes total, syntax clean.
2026-04-30 | Code | done — Phase 4 task 5: R1 endpoints. GET /api/games/:code/groups (group membership + per-group fragment resolution state). POST /api/games/:code/fragments/:id/guess (records guess, checks correctness via character_assignments). maybeResolveR1: fires after each correct guess, checks if all fragments resolved, computes per-group ms from round start, speedBucket → r1UnlockTypes → 2 sequence_unlocks + rounds.speed_bucket stamped. 17 routes total.
2026-04-30 | Code | done — Phase 4 tasks 6+7: GET /api/games/:code/sequence-lock (18th route). /play top bar: fixed .seq-lock-bar, SVG defs pz1–pz10, fetchSequenceLock() each tick, unlocked/locked tile states per spec. play-main padding-top bumped to 190px.
2026-04-30 | Code | done — Phase 4 tasks 8+9: MINIMAL_UI cleanup (ask/qlist panels + postQuestion/listQuestions routes removed, VALID_PHASES=['voting','ended'], default phase→voting). Vitest scaffold: 20 tests across shannonEntropy/evaluateOracle/speedBucket/r1UnlockTypes, all passing. Phase 4 complete. 16 routes.
2026-04-30 | Code | done — Phase 5: migration 003 applied (4 new tables, riddles column changes, realm_config + groups additions). seed-riddles.js: 3 bundles × 3 riddles. 5 new routes (captain-vote, round/2/start, round/2, riddle-answer, round/2/end). /play: captain-panel + riddle-panel, fetchR2State() on tick. scoring.js: r2Bucket+r2UnlockTypes+r3Score already added by Cowork; imported. Tests: 36 passing (r2Bucket×6, r2UnlockTypes×5, r3Score×5 added). 21 routes total.
2026-04-30 | Cowork | decision — DECISIONS [MINIMAL_UI] added. The /play app handles state/votes/sequence-lock only; conversation moved to the physical room. To remove from /play UI: ask-panel, qlist-panel, open-chat button. To remove from server.js: postQuestion + listQuestions routes; `chatting` from VALID_PHASES. Default round phase → `voting`. `questions` table kept in schema (orphan, cheap). ROUNDS.md updated. Code: pick this up in Phase 4 cleanup pass.
2026-04-30 | Code | done — Phase 6 complete. Migration 004 applied (r3_orderings, r3_results, r3_lead_captures + realm_config r3_timer_seconds/r3_pass_threshold + sequence_unlocks.assigned_to_group_id). 4 new routes: round/3/start (round-robin tile→group distribution), round/3/order (host ordering + r3Score → r3_results), GET /r3 (group tiles for players; full canvas + reveal gate for host), lead-capture. /play UI: HTML5 drag-to-order canvas (host); group tile grid (players); pass/fail score screen; reveal panel gated at r3_pass_threshold; lead form for all. 25 routes total. Phase 5+6 checklists updated.
2026-04-30 | Cowork | decision — R2 + R3 fully specced. ROUNDS.md [R2]/[R3] populated. DECISIONS [R2_RIDDLES], [R3_ORDERING], [LEAD_CAPTURE] added. [HARAYA_NARRATIVE] revised: individual_sequences are NOT tiles — host-only reveal text gated at score≥85. SCHEMA [PROPOSED] extended: 7 new tables (riddle_bundle, riddle_assignment, riddle_answer, group_captain_vote, r3_ordering, r3_result, r3_lead_capture) + 9 column changes (riddles options/category/bundle, realm_config r2/r3 timers + threshold, groups.captain_player_id, sequence_unlocks.assigned_to_group_id, riddles.realm_id nullable). soki/lib/scoring.js extended: r2Bucket, r2UnlockTypes, r3Score added (pure). Demo realm unlocks fixed: R0=1, R1=2, R2=2, R3=0 = 5 tiles total.
2026-04-30 | Cowork | decision — DECISIONS [HOST_AS_FACILITATOR] added. Host is no longer a player: no character, no fragments, no group, no vote. Host view shows ONLY: host controls, sequence-lock, round overview, active timer, player roster, results panel (per-round outcomes). MIN_PLAYERS now counts non-host. startRound + group formation must filter `WHERE is_host = false`. Vote endpoints must reject host with 403. /play UI splits into two render paths driven by state.isHost. ROUNDS.md updated with the same caveat.
2026-05-01 | Code | done — Phase 4.5 HOST_AS_FACILITATOR complete. server.js: startGame counts non-host players only; startRound filters `AND NOT is_host` from character/group/fragment assignment; postVote + postCaptainVote reject host with 403; killer_path rolled (A|B|C) at startGame; admin reset extended to include all Phase 4–6 tables; GET /roster + GET /results added (27 routes). /play: boot splits host/player initial panels; tick skips /round/me + vote-question for host; applyPhase gates vote panel to players; host top bar shows @username · HOST; fetchRoster + fetchResults added; lead form hidden for host; R3 tile cards show group label (A/B/C). smoke-test.js written covering full happy path.
2026-04-30 | Cowork | research — Reviewed crawsome/riddles for R2 source. Findings: no LICENSE in repo (legally unusable until clarified), open-ended Q→A format (R2 needs 4-option MCQ), no difficulty/category tags. On hold. Preferred fallback: Open Trivia DB (CC-BY-SA, MCQ native, has difficulty + category). Created :docs/ACKNOWLEDGEMENTS.md w/ [DATA], [LIBRARIES], [INSPIRATION], [PENDING_REVIEW] sections. DECISIONS [R2_RIDDLES] amended with attribution rule + source-evaluation note. AGENTS [INDEX_MAP] row added.
2026-04-30 | Cowork | decision — DECISIONS [HOST_DASHBOARD] (Phase 7) added. Lives in /play when is_host=true (user confirmed). Reveal text = individual_sequences.content (auto, authored at realm-seed time, no live composer). MVP moderation: pause/resume game, restart current round, swap player. Deferred: kick player, override score, override killer_path. Post-game export: GET /api/games/:code/export.csv (host-only, ≤ half-A4, ~13 columns). Lead capture: external embed (Typeform/Airtable) — r3_lead_capture table dropped from SCHEMA [PROPOSED]; games.is_paused + games.paused_at added. [LEAD_CAPTURE] revised.
2026-04-30 | Cowork | bugfix + blocked — Patched getR3State in server.js line 1569: `WHERE path_key=$1` → `WHERE unlock_condition = 'killer_path:' || $1` (column rename: seed uses unlock_condition='killer_path:A|B|C'). Verified seed file is staged correctly. **Could not run `node seed-haraya.js` or `node smoke-test.js` from Cowork sandbox** — Supabase host (aws-0-eu-west-1.pooler.supabase.com) not on workspace egress allowlist (EAI_AGAIN). User must run both from local terminal. SCHEMA.md [APPLIED] not updated until human-verified.
2026-05-01 | Cowork | decision — Host view simplified per user. DECISIONS [HOST_DASHBOARD] revised: removed round-outcome panel, removed `open vote` button (vote opens auto on round start), removed round-overview list. Replaced results panel with `// X of N players` count line + collapsible roster toggle showing only 3 cols (username · player_id · character_name). Round controls now horizontal row: end round / next round / pause / restart / swap — all **hold-to-activate** (2.5s pointerdown, green ::before scaleX fill, cancel on early pointerup). GET /results endpoint stays as the CSV-export data source, just unrendered. Player-side vote submit stays as normal click (no hold).
2026-05-01 | Cowork | decision — Player view cleaned. DECISIONS [MINIMAL_UI] extended with per-round panel visibility table: fragments panel ONLY in R1 (1/3); location header ONLY in R2 (2/3); character panel always; vote/riddle/R3 ordering as per round mechanic. Vote panel polish: title becomes "answer this..." (drop `// oracle question`, `// phase:`, vote_question_id, all backend identifiers); options render as 2×2 grid of clickable boxes (not vertical list); selected option visually distinct; locked when submitted.
2026-05-01 | Cowork | decision — ❌ in player visibility table now means **fully unmounted DOM block**: no `// label`, no placeholder, no container border. User reported regressed render of "no fragments yet" placeholder in R0/R2/R3 — added regression task. Submit buttons relabeled to `submit`; **player submit actions require 1.5-second hold-to-confirm** (host destructive actions stay at 2.5s). DECISIONS [SUBMISSION_LIMITS] added: each player gets one submission per actionable surface per round. UNIQUE constraints to verify: votes (✅ existing), group_captain_votes (verify), fragment_guesses (verify), riddle_answers (verify). Backend must surface 409, not silently swallow.
2026-05-02 | Code | done — Player UI cleanup (DECISIONS [MINIMAL_UI] 2026-05-01). /play: fragments panel (#frags-section) hidden unless round_number===1; location header (#round-panel) hidden unless round_number===2 (both enforced in tick after /round/me fetch); vote-panel title replaced with `// answer this...` (removed `// oracle question`, `// phase:`, vote_question_id); vote options rewritten as 2×2 `.vote-grid` of `.vote-card` divs (onclick selectVoteOption); selected card gets green neon border; locked on submit/409 (opacity 0.5, pointer-events none); state.voteSelected + state.voteLocked added; reset on round change detection in tick.
2026-05-02 | Code | done — Phase 7 host UI implemented in /play. Removed: outcome panel, open-vote button, round-overview list, roster-panel + host-results-panel divs, fetchResults() from tick. Added: `// X of N players` count line (live from /roster); roster toggle (show/hide ▾▴) → 3-col table (username · player_id[-8] · character); horizontal `.host-controls` bar with 5 hold-to-activate buttons (end round / next round / pause / restart / swap); `initHoldButtons()` — pointerdown starts 2.5s setTimeout + `.holding` class triggers CSS `::before scaleX(0→1)` green fill, pointerup/leave/cancel clears; pause/restart/swap stubs show "phase 7 endpoint pending". endRound + startNextRound wired to host-err. fetchResults() kept (CSV source), not called from tick.

---

## [NEXT]
Phase 4 — Sequence Lock + R0/R1 mechanics:
- [x] Refactor server.js `endRound` to import from `soki/lib/scoring.js` (drop inline shannonEntropy)
- [x] Migration 002: groups, group_members, fragment_guesses, sequence_unlocks + 6 columns. Applied via `:migrations/002_phase4_tables.js`.
- [x] Refactor server.js `startRound` fragment distribution: random → group-based. Resolves ⚠ DECISIONS [R1_FRAGMENT_GROUPS].
- [x] R0 endpoint: POST /api/games/:code/round/0/end → tally pre_game votes → unlock 1 sequence.
- [x] R1 endpoints: POST /api/games/:code/fragments/:id/guess; GET /api/games/:code/groups; auto-end → speedBucket → r1UnlockTypes → 2 unlocks.
- [x] GET /api/games/:code/sequence-lock — returns {total_tiles (SUM unlocks_per_round, default 5), unlocked[]}. 18 routes.
- [x] /play UI: fixed seq-lock-bar. SVG defs pz1–pz10 inline. fetchSequenceLock() each tick. @username + ROUND N/3 row 1. Unlocked tiles show gradient+piece, locked show dashed dark.
- [x] Apply DECISIONS [MINIMAL_UI]: removed ask-panel, qlist-panel, open-chat btn from play UI; dropped postQuestion + listQuestions from server.js; VALID_PHASES=['voting','ended']; default phase → 'voting'. 16 routes.
- [x] Test scaffold: soki/lib/scoring.test.js — 20 tests, 4 describe blocks (shannonEntropy, evaluateOracle, speedBucket, r1UnlockTypes). vitest added to devDependencies. All passing.

Phase 4.5 — Host-as-facilitator refactor (per DECISIONS [HOST_AS_FACILITATOR]):
- [x] startRound: filter `WHERE NOT is_host` for character_assignments + group formation + fragment distribution.
- [x] startGame: count check uses `WHERE NOT is_host`. killer_path rolled A|B|C at startGame.
- [x] postVote + postCaptainVote: 403 if player is host.
- [x] /play UI: split into two render paths by `state.isHost`. Host hides: location, character, fragments, vote, riddle, lead-form. Host shows: controls, seq-lock (@·HOST label), roster, results, R3 canvas. Group labels (A/B/C) on R3 tiles.
- [x] GET /api/games/:code/results — per-round tally + unlocks + R2 group correctness + R3 score.
- [x] GET /api/games/:code/roster — all players + is_host flag.
- [x] Admin reset extended to include all Phase 4–6 tables.
- [x] soki/smoke-test.js — happy-path curl script covering create→join→start→round→vote→roster→results.

Phase 5 — R2 (riddles + captain election):
- [x] Migration 003: riddle_bundles, riddle_assignments, riddle_answers, group_captain_votes + riddles columns (options/correct_option/category/bundle_id/order_in_bundle, realm_id nullable) + realm_config (r2_timer_seconds, r2_speed_thresholds) + groups.captain_player_id. Applied via :migrations/003_phase5_r2.js.
- [x] Seed: soki/seed-riddles.js — 3 bundles × 3 riddles (logic/pattern/verbal). Run and verified.
- [x] POST /api/games/:code/captain-vote — upsert vote, auto-tally when all members voted → groups.captain_player_id.
- [x] POST /api/games/:code/round/2/start — creates round_number=2, assigns unique bundles to R1 groups.
- [x] GET /api/games/:code/round/2?player_id= — riddle state (group-scoped for players, all groups for host).
- [x] POST /api/games/:code/riddle-answer — captain-only, upsert, auto-marks assignment completed.
- [x] POST /api/games/:code/round/2/end — r2Bucket + r2UnlockTypes → 2 sequence_unlocks, stamps speed_bucket.
- [x] /play UI: captain-panel (ballot), riddle-panel (quiz + lock buttons for captain, read-only for others). fetchR2State() each tick when round=2.
- [x] Tests: r2Bucket (6), r2UnlockTypes (5), r3Score (5) added. 36 total, all passing.

Phase 6 — R3 (final ordering + reveal gating):
- [x] Migration 004: 3 new tables (r3_ordering, r3_result, r3_lead_capture) + realm_config (r3_timer_seconds, r3_pass_threshold) + sequence_unlocks.assigned_to_group_id. Applied.
- [x] POST /api/games/:code/round/3/start — shuffle all unlocked tiles round-robin into groups, write assigned_to_group_id, create round_number=3.
- [x] POST /api/games/:code/round/3/order — host submits ordered_unlock_ids[], r3Score computed, r3_orderings + r3_results written.
- [x] GET /api/games/:code/r3?player_id= — group-subset tiles (player) or full canvas + r3_result + reveal (host).
- [x] POST /api/games/:code/lead-capture — email + name + would_recommend_to_who + comment, any score.
- [x] /play UI: drag-to-order canvas (host, HTML5 drag API); group tile display (players); final % screen pass/fail colour; reveal gate (host ≥ threshold sees individual_sequences.content); lead form for all.
- [x] Tests: r3Score (5 cases) in scoring.test.js — done in Phase 5 session.

Phase 7 — host dashboard (per DECISIONS [HOST_DASHBOARD], revised 2026-05-01):
- [ ] Migration 005: `games.is_paused BOOL NOT NULL DEFAULT false` + `games.paused_at TIMESTAMPTZ`. (No new tables — r3_lead_capture dropped per [LEAD_CAPTURE] external-embed decision.)
- [ ] POST /api/games/:code/pause + POST /api/games/:code/resume — host-only; sets is_paused / paused_at.
- [ ] POST /api/games/:code/round/:n/restart — host-only; wipes round-specific data and re-runs startRound for that n.
- [ ] POST /api/games/:code/players/:player_id/swap — host-only; rename existing player slot (keeps player_id + references).
- [ ] GET /api/games/:code/export.csv — host-only; one row, ≤ half-A4. Columns: session_code, started_at, ended_at, player_count, killer_path, r0_outcome, r0_unlocks, r1_speed_bucket, r1_unlocks, r2_speed_bucket, r2_unlocks, r3_score_percent, r3_reveal_unlocked.
- [x] /play host UI: replace existing host panels with the simplified layout (per DECISIONS [HOST_DASHBOARD]):
  - [x] `// X of N players` count line (always visible)
  - [x] roster toggle button → 3-col table (username · player_id · character_name); default collapsed
  - [x] horizontal control bar: end round / next round / pause / restart / swap
  - [x] hold-to-activate behavior on all 5 controls (2.5s pointerdown; green ::before scaleX fill; cancel on early pointerup; commit on full)
  - [x] remove the "open vote" button entirely (vote opens automatically on round start)
  - [x] remove the round-outcome / soki-truth banner from host view (data still flows to CSV via /results)
  - [x] remove the round overview list (sequence-lock already conveys progress)
  - [ ] "download CSV" button on end screen
  - [ ] embedded Typeform/Airtable iframe for lead capture
- [ ] Player UI: "game paused" overlay when games.is_paused=true.
- [ ] Choose external lead form host (Typeform vs Airtable). Capture URL in `realm_config.lead_capture_url TEXT` (or env var) and embed.
- [ ] Deprecate or simplify `setRoundPhase` endpoint and `current_phase` column — only `voting` is ever set now; column may become a constant. Defer rip-out; just stop calling from client.

Player UI cleanup (per DECISIONS [MINIMAL_UI] revisions 2026-05-01):
- [x] /play player view: hide `// fragments you hold` panel unless `round_number === 1`. Currently visible in R0/R2/R3 too (regression).
- [x] /play player view: hide location header (`#round-panel`'s location name + description) unless `round_number === 2`. Show only after groups have formed.
- [x] Vote panel title: replace `// oracle question · phase: <X>` with `// answer this...`. Drop `vote_question_id` and any backend phase string from the rendered DOM.
- [x] Vote panel options: render as 2×2 grid of clickable boxes (CSS grid `grid-template-columns: 1fr 1fr; gap: 8px`). Each option = bordered card; selected state = neon-accent border (use `--green` or `--red` per existing palette). Lock + grey out on submit.
- [x] Verify R0/R1/R2/R3 visibility table from DECISIONS [MINIMAL_UI] is fully respected by the player render path.

Player UI regression (reported 2026-05-01):
- [ ] User still sees `// fragments you hold (about other characters)` label + `no fragments yet — the round hasn't started or the host hasn't dealt them.` placeholder in R0/R2/R3. Per DECISIONS [MINIMAL_UI] revision: ❌ = entire DOM block unmounted — no `// label`, no placeholder, no container. Confirm whether the fragments sub-block of `#me-panel` is fully removed (not just `.classList.add('hidden')` on the list inside) when `round_number !== 1`. Same audit for location header (`#round-panel`).
- [ ] Same audit for vote panel: when ❌ (R1/R2/R3), the entire `#vote-panel` is unmounted — not even the `// answer this...` label visible.
- [ ] Submit-button rename + hold-to-confirm: relabel all player submit buttons to `submit` (not "submit vote_" or similar). Apply 1.5-second hold-to-confirm (green ::before scaleX fill, cancel on early pointerup). Applies to R0 oracle, R1 fragment-guess (one per fragment), R2 riddle-answer (captain only).
- [ ] Submission-limit audit per DECISIONS [SUBMISSION_LIMITS]: confirm UNIQUE constraints on (a) `group_captain_votes (game_id, group_id, voter_player_id)`, (b) `fragment_guesses (fragment_id, guesser_player_id)`, (c) `riddle_answers (assignment_id, riddle_id)`. If any missing, add migration 005a (ALTER TABLE … ADD CONSTRAINT). Endpoints must return 409 on duplicate (not 500, not silent INSERT … DO NOTHING).

---

## [CHECKLIST]
Routes are auto-derived from `server.js` header comments. Manual list removed (it drifted).
Run: `node soki/lib/audit-routes.js` — prints implemented routes.
For pending Phase work see `[NEXT]` above.

### Non-route milestones
- [x] Phase 1 — DB + Haraya seed
- [x] Phase 2 — Lobby UI (`soki/join/`)
- [x] Phase 3 — Core game loop (rounds + votes + entropy outcome)
- [x] Phase 4 — Sequence Lock + R0/R1 mechanics + minimal UI cleanup
- [x] Phase 4.5 — HOST_AS_FACILITATOR server + UI split
- [x] Phase 5 — R2 (riddles + captain election)
- [x] Phase 6 — R3 (final ordering + reveal gating + lead capture)
- [ ] Phase 7 — host dashboard + reveal authoring (deferred)

---

## [DECISIONS] — never override without flagging
- No login. Guest UUID only.
- Realms creator-built for MVP. Host-built in v2.
- Soki trigger: binary. High agreement = Soki. High disagreement = Truth.
- Individual Sequence: shared collective reality, not per-player private.
- Personal Fragment: private per-player, shared through conversation.
- Riddles/Puzzles/Clues: out of scope for MVP.
- Game State lives in Redis, not Postgres.
- 04 Haraya Realm is DRAFT — do not seed SQL without human approval.

---

## [REFS]
- Notion brain: https://www.notion.so/34e765c28f1e800f8110f2ca66b3a861
- 01 Data Model: https://www.notion.so/34c765c28f1e807d8c43dedcb250e06d
- 02 MVP Roadmap: https://www.notion.so/34c765c28f1e818e86d3e3219d2643ae
- 03 Index Definitions: https://www.notion.so/34d765c28f1e81b380b3edbf4b0b660c
- 04 Haraya Realm (DRAFT): https://www.notion.so/34e765c28f1e81729bc1dd1771ee503b
- 00 Dev Journal: https://www.notion.so/34e765c28f1e81a7b9b2c377a2b981be
