# Inbox — ecothrift-dashboard

**Status:** pending
**Updated:** 2026-10-10
**From:** master
**To:** project coder

## Message

**Bill (2026-10-10, master chat): "ensure all sessions push to github so i can start on my computer at home."** Everything in this repo should be on GitHub tonight, so a session on his home computer can clone it and carry on.

A master message is not an order to ship (`ship.md` step 1). So **ask Bill in your chat** with one line, for example "Master says you want everything on GitHub for home. Ship now?", and on his word:

1. **Finished, tested work:** run `ship.md` as usual (version, changelog, commit, push). No deploy unless he also says deploy.
2. **Half-done work that shouldn't be a release:** commit it to a branch **`wip/2026-10-10`** and push that branch. No version bump; nothing on `main` changes. Write in your outbox what is on it and what is unfinished, so the session at home knows where to pick up.
3. **Before pushing,** check that nothing secret or private is staged: `.env*`, keys, dumps, exports, `workspace/`.

**What GitHub doesn't carry** (tell Bill in one line if his home setup needs any of it): `.env` and `.envprod`, the local database, `workspace/`, and anything gitignored. At home, a session rebuilds `.envprod` with env-sync `pull` (Bill signs in to the Heroku CLI there once) and the local database with the project's prod-to-local pull script.

**This repo today:** 58 changed files are uncommitted on `main` (frontend 25, apps 20, `.ai` 12, `.claude` 1). A second session ("Thrift+ poster generation") may be working in this same tree, so check with Bill whose changes are whose before committing. Also: thank you for the icon set (v2.157.0); it is logged.

## When you're done

Clear this inbox. In your outbox, say what is on `main` and on any `wip/` branch, and the commit hashes.
