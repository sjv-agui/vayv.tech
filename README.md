# vayv.tech

Monorepo for [vayv.tech](https://www.vayv.tech) — a personal site and product lab.
Contains three independent subprojects sharing one deployment (Netlify, static) and one backend (Node.js + Supabase).

---

## Subprojects

### 1. Main page — `vayv.tech/`
Personal site for Sean Aguinaldo. Intro, links, and a disco ball.
Built with vanilla HTML/CSS/JS. No framework.

### 2. Admin — `vayv.tech/admin/`
Content management interface powered by [Netlify CMS](https://www.netlifycms.org/).
Used to edit site content without touching code.

### 3. Soki — `vayv.tech/soki/`
A collective mystery game played in physical space with digital infrastructure.
Players uncover a shared truth across 3 rounds of conversation, voting, and deduction.
The system rewards honest collective reasoning and punishes groupthink.

| Page | URL | Description |
|---|---|---|
| Landing | `/soki/public/` | Marketing + Luma calendar booking |
| Lobby | `/soki/join/` | Create or join a game session |
| Game | `/soki/play/` | Active round UI |
| API | `localhost:3000` (dev) | Node.js backend |

---

## Folder Structure

```
vayv.tech/
│
├── index.html              # Main personal page
├── cv-data.json            # CV content (JSON-driven)
├── assets/                 # Main page assets
│   └── images/
├── CNAME                   # vayv.tech domain
├── netlify.toml            # Netlify build config
│
├── admin/                  # Netlify CMS
│   ├── index.html
│   └── config.yml
│
├── soki/                   # Soki game subproject
│   ├── public/             # Static landing page + shared CSS/JS
│   │   ├── index.html
│   │   ├── style.css
│   │   ├── app.js
│   │   ├── lobby.js
│   │   └── images/
│   ├── join/               # Lobby UI (create / join session)
│   │   └── index.html
│   ├── play/               # Game round UI
│   │   └── index.html
│   ├── server.js           # Node.js API server
│   ├── db.js               # PostgreSQL pool (Supabase)
│   ├── migrate.js          # Schema migrations (21 tables)
│   ├── seed-haraya.js      # Haraya realm seed data
│   ├── indexes.js          # DB index definitions
│   ├── package.json
│   ├── .env                # See .env.example
│   └── .gitignore
│
├── :docs/                  # Project documentation
│   ├── MEMORY.md           # Operational brain — read first every session
│   ├── PHILOSOPHY.md       # Vision, design principles, game mechanics
│   ├── SCHEMA.md           # DB entity reference
│   ├── DECISIONS.md        # Locked architectural decisions
│   ├── STACK.md            # Env, services, commands
│   ├── AGENTS.md           # Agent rules and session start protocol
│   └── TESTING.md          # Local test guide
│
└── _archive/               # Old drafts (not deployed, gitignored)
```

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Hosting | Netlify | Static deploy from repo root |
| Database | Supabase (PostgreSQL) | 21 tables, aws-0-eu-west-1 |
| Auth | Supabase guest auth | UUID per session, no login |
| Realtime | Supabase Realtime | game_state sync (Phase 6) |
| Fast state | Upstash Redis | GameState + timers only |
| Backend | Node.js (no framework) | `pg` + `dotenv`, port 3000 |
| Frontend | Vanilla HTML/CSS/JS | No build step |

---

## Local Development

### Prerequisites
- Node.js 18+
- A Supabase project (free tier works)
- `.env` file in `soki/` (copy from `.env.example`)

### Run the backend

```bash
cd soki
npm install
DEMO_MODE=true node server.js
```

`DEMO_MODE=true` lowers the player minimum to 2 and enables the `/api/admin/reset` endpoint for testing.

### Run the frontend

Open `soki/join/index.html` with [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) (VS Code) or any static file server.

### First-time DB setup

```bash
cd soki
node migrate.js       # create all 21 tables
node indexes.js       # apply indexes
node seed-haraya.js   # seed Haraya realm (⚠ requires approval — see DECISIONS.md)
```

### Key local URLs

| URL | Description |
|---|---|
| `http://localhost:3000` | API health check |
| `http://localhost:3000/api/config` | Runtime config (MIN_PLAYERS etc.) |
| `http://127.0.0.1:5500/vayv.tech/soki/join/` | Lobby (Live Server) |
| `http://127.0.0.1:5500/vayv.tech/soki/play/` | Game screen (Live Server) |

---

## Soki — Build Status

| Phase | Status | Description |
|---|---|---|
| 1 — Foundation | ✅ | Schema, migrations, Haraya seed, indexes |
| 2 — Auth + Lobby | ✅ | Guest auth, session codes, lobby UI, polling |
| 3 — Game Loop | 🔄 | Round start, character assignment, fragments |
| 4 — Sequence Mechanic | ⬜ | Reveal, collective ordering, evaluation |
| 5 — Soki Injection | ⬜ | Vote tally, trigger rules, penalty scoring |
| 6 — Realtime | ⬜ | Supabase Realtime replacing polling |
| 7 — Full UI | ⬜ | Lobby, round, sequence ordering, score screen |

---

## Documentation

All project docs live in `:docs/`. Agents and contributors should read `MEMORY.md` first — it contains current build status, decisions log, and next tasks.

| Doc | Purpose |
|---|---|
| `MEMORY.md` | Operational brain — status, log, next steps |
| `PHILOSOPHY.md` | Vision, game design, what Soki is |
| `SCHEMA.md` | All 21 DB entities, fields, indexes |
| `DECISIONS.md` | Locked decisions — do not override without flagging |
| `STACK.md` | Env vars, services, run commands |
| `TESTING.md` | Manual test guide for a full round |

---

## Links

- Site: [vayv.tech](https://www.vayv.tech)
- LinkedIn: [seanjra](https://www.linkedin.com/in/seanjra/)
- Notion brain: [Soki docs](https://www.notion.so/34e765c28f1e800f8110f2ca66b3a861)

---

Made with [Claude](https://claude.ai)
