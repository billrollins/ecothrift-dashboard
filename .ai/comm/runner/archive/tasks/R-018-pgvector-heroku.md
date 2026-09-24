> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-018 · recon · Can our Postgres hold vectors?

**Why:** product intelligence Phase 2 needs vector storage for about 200k products.

**This task may call Heroku, read-only:** `heroku addons`, `heroku pg:info`, and `heroku pg:psql -c "SELECT * FROM pg_available_extensions WHERE name IN ('vector','pg_trgm')"` on app `ecothrift-dashboard`. **Do not** create an extension, and do not change anything.

**Answer these:**

1. **Heroku Postgres:** the plan and version, whether `vector` is available (and its version), and the database size now.
2. **Local dev DB:** the same availability query.
3. **Space:** estimated storage for 200k vectors at 384 and at 768 dimensions (float4 plus an index), against the plan's limit.
4. **Python packages already in `venv`:** `sentence-transformers`, `torch`, `fasttext`, `scikit-learn`, `numpy`. Which are installed, and their versions?

**Result:** `results/R-018-pgvector-heroku.md`. Archive when done.
