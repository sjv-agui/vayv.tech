# SEQUENCE_LOCK.md
> Top-bar progression UI on /play. Same view for host + all players.
> Index: [LAYOUT] [STATES] [PUZZLE_LIBRARY] [BACKEND] [HANDBOOK]

---

## [LAYOUT]
Fixed top bar above the game viewport. Identical on host + player views.

| Row | Content | Style |
|---|---|---|
| 1 (top) | `@username · id_xxxx` (left) · `ROUND N / 3` (right, `--red`) | Share Tech Mono, 11px, letterspacing 3px |
| 2 | label `// SEQUENCE LOCK` | Share Tech Mono, 10px, opacity 0.55 |
| 3 | row of N tiles, centered, gap 14px | tile = 78×78px, radius 12px |
| 4 | caption `X / N SEQUENCES UNLOCKED` | Share Tech Mono, 10px, `#818181` |

N = sum of `realm_config.unlocks_per_round`.

---

## [STATES]
Two states only. Type (truth/soki) is **never** revealed visually — even to the host.

| State | Border | Background | Icon |
|---|---|---|---|
| unlocked | 1px solid `#c8c8c8` | `linear-gradient(145deg, #2a2a2a, #6a6a6a)` | `fill: #e8e8e8`, `stroke: #0a0a0a` |
| locked | 1.5px dashed `#383838` | `#0a0a0a` | `fill: none`, `stroke: #383838` |

---

## [PUZZLE_LIBRARY]
10 SVG silhouettes — different knob/notch combos on top/right/bottom/left edges. Source: `:lib/puzzle-pieces.js`.
- Server picks an index 1-10 at unlock time and persists it in `sequence_unlock.puzzle_piece_index`.
- Client renders that index by `<use href="#pzN"/>` with the same path defs.
- viewBox `2 2 28 28`. Knobs extend ±3px outside the 6,6→26,26 box.

---

## [BACKEND]
| Concern | Where |
|---|---|
| Unlock event log | new table `sequence_unlock` (game_id, round_number, sequence_type, sequence_ref_id, puzzle_piece_index, unlocked_at) |
| Tile state | derived: row exists → unlocked; row missing → locked |
| Total tiles | computed: `SUM(value) FROM JSONB realm_config.unlocks_per_round` |
| Random piece pick | `:lib/puzzle-pieces.js randomPieceIndex()` |
| Type assignment | `:lib/scoring.js evaluateOracle` (R0) or `r1UnlockTypes` (R1) |

---

## [HANDBOOK]
Collapsible `// HOW IT WORKS` block at bottom of /play. Single line for now (full text in v2):
> unlock sequences that will help you solve the case during the final round. find the story.

Legend (icons only):
- bright grey gradient tile = unlocked
- dashed dark tile = locked

No mention of truth/soki to players — that's the whole point.
