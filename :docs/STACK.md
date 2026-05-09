# STACK.md
> Environment config and service reference. Read on new machine or new session setup.
> Index: [ENV] [SERVICES] [COMMANDS] [AGENT_RULES]

---

## [ENV] — .env in project root
```
DATABASE_URL=postgresql://...@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<key>
UPSTASH_REDIS_URL=<url>
UPSTASH_REDIS_TOKEN=<token>
PORT=3000
```

## [SERVICES]
| Service | URL | Notes |
|---|---|---|
| Supabase | https://supabase.com/dashboard | DB + Auth + Realtime |
| Upstash | https://console.upstash.com | Redis — GameState only |
| Notion brain | https://www.notion.so/34e765c28f1e800f8110f2ca66b3a861 | All docs |

## [COMMANDS]
```bash
node server.js          # start server
node migrate.js         # run migrations
node seed.js            # seed Haraya realm (requires human approval)
node indexes.js         # apply indexes
```

## [AGENT_RULES]
| Agent | Read | Write |
|---|---|---|
| Chat (claude.ai) | MEMORY, PHILOSOPHY, SCHEMA, DECISIONS | MEMORY (log entries via Notion) |
| Code (claude code) | ALL docs | MEMORY (log entries in file) |
| Cowork | MEMORY, PHILOSOPHY | MEMORY (log entries in file) |

**Session start rule for all agents:**
1. Read MEMORY.md → check [STATUS] and [NEXT]
2. Read PHILOSOPHY.md if making directional decisions
3. Read SCHEMA.md before touching DB
4. Read DECISIONS.md if unsure about architecture
5. Append to [LOG] in MEMORY.md after completing work
