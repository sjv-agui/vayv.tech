# PHILOSOPHY.md
> Soki — directional brain. Read when making decisions that affect vision, scope, or player experience.
> Index: [VISION] [EXPERIENCE] [DESIGN_PRINCIPLES] [GAME_MECHANICS] [VERSIONING] [BOUNDARIES]

---

## [VISION]
Soki is a collective truth-finding game played in physical space with digital infrastructure.
Players don't compete against each other — they compete against confusion, deception, and their own assumptions.
The system rewards honest collective reasoning and punishes groupthink.

---

## [EXPERIENCE]
- Players feel they are uncovering a shared mystery, not solving a puzzle
- No one knows who to trust — including themselves
- The game is designed to be played once per Realm and feel complete
- The scoring is a mirror: it reflects how well the group thought together
- Confusion is a feature, not a bug — Soki Sequences are sanctions, not punishments

---

## [DESIGN_PRINCIPLES]
1. **Collective over individual** — score is always group score, never personal
2. **Ambiguity is intentional** — Truth and Soki are not labelled. Players must discern.
3. **Consequence over chance** — Soki injection is triggered by player behavior, not randomness
4. **Minimal UI, maximum presence** — the app supports the room, it does not replace it
5. **Scalable simplicity** — MVP must be playable with 4 players and no instructions
6. **Token efficiency** — all agent docs must be scannable in <10 seconds

---

## [GAME_MECHANICS]
**Structure:** 3 rounds (MVP) / 5 rounds (full)
**Players:** 4–12 per session (MVP: 2–4)
**Auth:** Guest only — UUID per session, no accounts

**Vote Events:**
- Q1 (pre-game): Oracle question, 4 options. Discrepancy math → binary: high agreement = Soki, high disagreement = Truth
- Q2 (post-R1): Suspicion vote. Affects sequence reveal.
- Q3 (post-R2): TBD mechanic. Affects sequence reveal.
- Q4 (post-R3): Collective sequence ordering. This IS the final score.

**Sequences:**
- Truth Sequence: canonical ordered events. Ground truth.
- Individual Sequences: shared realities revealed collectively via clue-solving. Not inherently true or false.
- Personal Fragments: each character's backstory is split into N pieces and **distributed randomly to *other* players** (never to the character's own player). A player therefore holds fragments belonging to other people's characters and learns about them only through conversation. This is the engine of the social game: no one holds their own truth, everyone holds pieces of someone else's.
- Soki Sequences: false sequences injected as sanctions. Deduct from collective score.

**Scoring:** match accuracy of collective ordering vs Truth Sequence + Soki penalties = final % score

---

## [VERSIONING]
| Version | Scope |
|---|---|
| MVP | 1 Realm (Haraya), 2–4 players, hardcoded sequences, guest auth, basic UI |
| v2 | Multiple Realms, host-created Realms, 12 players, Clues/Riddles/Puzzles active |
| v3 | Realm builder UI, plug-and-play content, realm ownership + versioning |
| v4+ | Open creative parameters, community Realms, analytics |

---

## [BOUNDARIES]
**Never in MVP:**
- AI-generated content
- Personal scores or leaderboards
- Riddles, Puzzles, Clues (schema exists, not active)
- Multiple Realms
- Account creation or login
- Realm creation by users

**Never in any version:**
- Individual blame or public accusation scores
- Pay-to-win mechanics
- Content that removes player agency from the group dynamic
