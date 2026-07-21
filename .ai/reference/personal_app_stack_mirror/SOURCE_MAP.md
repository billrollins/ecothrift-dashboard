<!-- Last updated: 2026-07-21 -->
# Source map — personal app stack mirror

Where the snapshots and excerpts in this handoff pack came from in the Eco-Thrift Dashboard repo.

| Pack path | Source in this repo | Notes |
|-----------|---------------------|-------|
| `docs/env_and_ai.md` | Root `.env.example` patterns + `apps/ai/` router notes | Keys stay server-side only. |
| `docs/databases.md` | `ecothrift/settings.py` `DATABASES` + Postgres usage | Personal apps can simplify to one DB. |
| `docs/frontend_layering.md` | `frontend/src/{types,api,hooks,pages}` | Vite proxies `/api` → Django. |
| `source_patterns/` | Selected excerpts from `apps/`, `frontend/`, `ecothrift/` | Reference only — not a runnable subtree. |
| `00_stack_mirror_brief.md` | Condensed from `.ai/context.md` + stack facts | Prefer live repo when unsure. |
| `PROMPT_for_other_ai.md` | Authored handoff prompt | Paste into a fresh agent session. |

**Rule:** This pack is documentation. Prefer the live Eco-Thrift paths above if anything drifts.
