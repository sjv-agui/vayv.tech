# AGENTS.md
> Protocol for Chat, Code, and Cowork. Read at session start.
> Index: [RULES] [RESPONSE] [SESSION] [INDEX_MAP] [TOKEN_SAVINGS]

---

## [RULES]
- No filler. No pleasantries. No summaries of the question.
- No code unless prompted with `code now`.
- No screenshots unless prompted with `screenshot`.
- Append to MEMORY.md [LOG] after every session.
- Never override a [DECISIONS] entry without flagging it first.
- Quality output required — correctness > brevity, but never verbose.

---

## [RESPONSE]
- Max ~50 words unless task requires more (code, schema, data).
- Prefer bullets over prose. Prefer tables over bullets when structured.
- No bold headers unless clarity demands it.
- No repeating the question. No "Great question!" No closing remarks.
- One word or one line answers are valid and preferred when sufficient.

---

## [SESSION]
Start of every session:
1. Read MEMORY.md → [STATUS] + [NEXT]
2. If directional decision → read PHILOSOPHY.md
3. If touching DB → read SCHEMA.md
4. If unsure about architecture → read DECISIONS.md
5. If setting up env → read STACK.md

End of every session:
- Append `[DATE] | [Agent] | [status] — summary` to MEMORY.md [LOG]

---

## [INDEX_MAP]
| Prompt | Read | Section |
|---|---|---|
| "What's next?" | MEMORY.md | [NEXT] |
| "What did we decide about X?" | DECISIONS.md | relevant |
| "Build this feature" | MEMORY.md + SCHEMA.md | [NEXT] + [GAME_LOOP] |
| "Is this aligned with vision?" | PHILOSOPHY.md | [DESIGN_PRINCIPLES] |
| "Set up on new machine" | STACK.md | [ENV] [COMMANDS] |
| "Should we add X mechanic?" | PHILOSOPHY.md + DECISIONS.md | [BOUNDARIES] |
| "What tables exist?" | SCHEMA.md | [CORE] [GAME_LOOP] [PROPOSED] |
| "Phase checklist?" | MEMORY.md | [CHECKLIST] |
| "Which routes are implemented?" | run `node soki/lib/audit-routes.js` | (auto-derived from server.js) |
| "Build order?" | MEMORY.md | [BUILD_ORDER] |
| "Who does what?" | STACK.md | [AGENT_RULES] |
| "What does each round do?" | ROUNDS.md | [R0] [R1] [R2] [R3] |
| "How does sequence lock UI work?" | SEQUENCE_LOCK.md | [STATES] [PUZZLE_LIBRARY] |
| "Where is entropy / speed bucket math?" | soki/lib/scoring.js | exports |
| "Where are puzzle silhouettes?" | soki/lib/puzzle-pieces.js | PUZZLE_PIECES |
| "What 3rd-party data are we using?" | ACKNOWLEDGEMENTS.md | [DATA] [PENDING_REVIEW] |

---

## [TOKEN_SAVINGS]
- [INDEX] tags at top of each file — jump to section, never read full file unless needed
- Estimated 70–80% fewer tokens per session vs reading Notion pages cold
- Correctness > brevity — full output required for code, schema, data tasks
