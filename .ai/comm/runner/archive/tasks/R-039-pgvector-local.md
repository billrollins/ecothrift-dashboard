> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-039 · Can the local Postgres take pgvector?

- **Type:** recon (read-only; no installs) · **Time box:** 20 min
- **Why:** product_intelligence Phase 2 step 6 (vectors). R-018 confirmed Heroku has pgvector 0.8.1. Local dev and the test database need it too, or the vector code needs a fallback.

## Do
1. Local Postgres: the version and where it's installed. Read `DATABASE_URL` / settings for the host; don't print secrets.
2. Run `SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name IN ('vector', 'pg_trgm');` on the dev database (read-only).
3. If `vector` is not available, say what installing it would take on this Windows machine (a prebuilt binary for this Postgres version, or building it), from the pgvector README. Links only; install nothing.
4. Python libraries: are `pgvector`, `sentence-transformers`, `numpy` or `torch` in `requirements*.txt` or installed in `venv` (`pip show`)?

## Hand back
A short table of facts, and one line on the least-effort path, marked as your opinion.
