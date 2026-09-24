# R-018 · Can our Postgres hold vectors?
- **Runner:** Grok 4.7 · **Started:** 2026-09-23 15:59 CT · **Status:** done
- **Finished:** 2026-09-23 16:03 CT

## 1. Heroku Postgres

The addon is not on app `ecothrift-dashboard`. `heroku addons`, `heroku pg:info`, and `heroku pg:psql` on that app report no database. `heroku addons --all` shows the Postgres addon on app `ecothrift-database`. `DATABASE_URL` on `ecothrift-dashboard` is the same host and database as that addon (name `d4op06smk6i192`, host on `amazonaws.com`). The figures below are from that database.

| Fact | Value |
|---|---|
| Plan | Premium 0 (`heroku-postgresql:premium-0`, addon `postgresql-animated-38252`) |
| Attachments | `ecothrift-database::DATABASE`, `darkhorse-dashboard::DATABASE` |
| Version | 15.18 (pg:info marks it deprecating; Postgres 15 EOL 2027-02-28) |
| Data size | 1.84 GB / 64 GB (2.87%) |
| `vector` | available, default 0.8.1, not installed |
| `pg_trgm` | available 1.6, installed 1.6 |

Query (read-only, `heroku pg:psql --app ecothrift-database`): `SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name IN ('vector','pg_trgm') ORDER BY name`.

| name | default_version | installed_version |
|---|---|---|
| pg_trgm | 1.6 | 1.6 |
| vector | 0.8.1 | |

`vector.installed_version` was null. The extension was not created.

## 2. Local dev DB

Same query, Django default connection (`manage.py shell`), database `local_shared`, server 18.6.

| name | default_version | installed_version |
|---|---|---|
| pg_trgm | 1.6 | 1.6 |

`vector` returned no row. It is not available to install on this local server.

## 3. Space for 200k vectors

Plan limit from `pg:info`: **64 GB**. In use now: **1.84 GB**.

Estimate is the pgvector `vector` value (float4) plus one HNSW index at the defaults in pgvector 0.8.1 (`m=16`). Layout from that version's `src/hnsw.h`: element tuple `MAXALIGN(72 + 8 + 4*dim)` (10 heap tids in the header), level-0 neighbor tuple 200 bytes, 8 KB pages (24-byte page header, 8-byte opaque). Higher HNSW levels are omitted (about 1/16 of rows).

| | 384 dimensions | 768 dimensions |
|---|---:|---:|
| Float4 payload (`n * dim * 4`) | 307,200,000 bytes (0.31 GB) | 614,400,000 bytes (0.61 GB) |
| pgvector value (`n * (8 + 4*dim)`) | 308,800,000 bytes (0.31 GB) | 616,000,000 bytes (0.62 GB) |
| HNSW index, packed pages | 368,640,000 bytes (0.37 GB) | 860,160,000 bytes (0.86 GB) |
| Value + index | 677,440,000 bytes (0.68 GB) | 1,476,160,000 bytes (1.48 GB) |
| Share of the 64 GB cap | 1.1% | 2.3% |
| Database after adding it (on top of 1.84 GB) | ~2.5 GB (3.9%) | ~3.3 GB (5.2%) |

GB here is bytes / 1e9, set next to the 64 GB cap `pg:info` prints. A 768-dimension value is 3,080 bytes, over Postgres's ~2 KB toast threshold, so the heap copy is stored out of line. That is about the same 0.62 GB plus chunk headers, not a second full copy. The index already stores its own copy of each vector.

## 4. Python packages in `venv`

`C:\Coding\ecothrift-dashboard\venv\Scripts\python.exe`, `importlib.metadata.version`. `pip list --format=freeze` had no matching names. None of the five are installed.

| Package | Installed | Version |
|---|---|---|
| sentence-transformers | no | |
| torch | no | |
| fasttext | no | |
| scikit-learn | no | |
| numpy | no | |
