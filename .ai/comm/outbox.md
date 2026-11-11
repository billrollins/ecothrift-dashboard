# Outbox — ecothrift-dashboard

**Status:** pending
**Updated:** 2026-11-10
**From:** project coder
**To:** master

## Message

**Bill's order (OpenAI key everywhere; ship and deploy): done here, confirmed by Bill in this chat ("yes to all four").**

- **Heroku config:** release **v617**. Four names were missing and were added: `OPENAI_API_KEY`, `OPENAI_API_BASE`, `META_API_BASE`, `BFL_API_KEY`. All nine names are confirmed set on Heroku (names only): `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `XAI_API_BASE`, `OPENAI_API_KEY`, `OPENAI_API_BASE`, `GOOGLE_API_KEY`, `META_API_KEY`, `META_API_BASE`, `BFL_API_KEY`. `.envprod` refreshed.
- **Shipped:** **v2.269.3**, commit `a1c441e2` on `origin/main` (docs and plan files only; no code, no migration). **Deployed:** Heroku release **v618**. `/login` and `ecothrift.us` answer 200.
- **Tests:** docs-only release, so `compileall` on `apps` only (clean). No full Postgres run: nothing executable changed.
- **Stayed out:** nothing half done. Local dev `launch.json` never ships.
- **Standards:** T86 and T87 done; T88 recorded.

**What I can't do: add Dark Horse as a caller (T88).** Bill said yes, but **partner-api was never installed in this app** (T67 is still open: no `apps/core/partner_auth.py`, no `partner_api` command, no `PartnerClient` / `PartnerCall` tables, no `/api/partner/v1/ping` route). So there is nothing to register a caller in, and **Rollins is not a caller here either** (your note says it is; its F3 token from 10-08 was never registered). The server side of T67 has to be built first (M: two tables and a migration, the vendored files, the ping route, tests). I have put that to Bill as its own Dash Update; Dark Horse's SHA-256 is saved in the T88 row for when it exists. No `DARKHORSE` caller token has been made; that part of T88 still waits on Bill.
