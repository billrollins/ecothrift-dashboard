<!-- Last updated: 2026-07-14 -->
# Personal App Stack Mirror — Handoff Pack

**For:** Another AI building a **local-only** personal web app for Bill.  
**Do:** Mirror Eco-Thrift’s Django + Postgres + Vite + React/TS + LLM router patterns.  
**Don’t:** Invent a different stack, put API keys in the frontend, or use SQLite as the app DB.

## Start here (read order)

0. **[`PROMPT_for_other_ai.md`](./PROMPT_for_other_ai.md)** — paste-ready prompt (initiatives setup + create `stack_mirror_local`).
1. **[`00_stack_mirror_brief.md`](./00_stack_mirror_brief.md)** — full rundown.
2. **[`docs/env_and_ai.md`](./docs/env_and_ai.md)** — `.env` keys + AI purpose models.
3. **[`docs/databases.md`](./docs/databases.md)** — Postgres notes (simplify to one DB).
4. **[`docs/frontend_layering.md`](./docs/frontend_layering.md)** — Vite / React Query layering.
5. **[`source_patterns/`](./source_patterns/)** — copy-ready reference code.
6. **[`SOURCE_MAP.md`](./SOURCE_MAP.md)** — where each snapshot came from.

## Success criteria

- Local Postgres via root `.env` `DATABASE_*`
- Django 5.2 + DRF at repo root; Vite SPA in `frontend/`
- Vite proxies `/api` → `http://127.0.0.1:8000`
- Frontend: `types` → `api` → `hooks` → `pages`
- All LLM calls through one router; keys only in `.env`
- Local-only for now
