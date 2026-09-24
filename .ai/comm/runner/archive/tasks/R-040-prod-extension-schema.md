> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-040 · Production: where do Postgres extensions live? (read-only)

- **Type:** recon · **Time box:** 15 min
- **Outside calls allowed for this task:** read-only `heroku pg:psql` queries against the production database (`--app ecothrift-database`, as in R-018). **SELECT only**: no CREATE, ALTER or SET that persists. Never print credentials.
- **Why:** the next release (`inventory/0099`) creates pgvector in the connection's schema. Django connects with `search_path=ecothrift`. Some Heroku databases force extensions into a `heroku_ext` schema. If the `vector` type isn't visible from `ecothrift`, the release-phase migrate fails and the deploy is blocked.

## Do
Run each of these and paste the output:
1. `SELECT e.extname, e.extversion, n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY 1;`
2. `SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1;`
3. `SELECT current_user, current_setting('search_path');`, plus `SELECT rolname, rolsuper, rolcreatedb FROM pg_roles WHERE rolname = current_user;`
4. `SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name IN ('vector', 'pg_trgm');`
5. Is there an event trigger that redirects extensions? `SELECT evtname, evtevent, evtfoid::regproc FROM pg_event_trigger;`

## Hand back
The outputs, and one line: will `CREATE EXTENSION IF NOT EXISTS vector SCHEMA "ecothrift"` likely succeed, or does something (`heroku_ext`, an event trigger, permissions) stand in the way? Mark it as your opinion.
