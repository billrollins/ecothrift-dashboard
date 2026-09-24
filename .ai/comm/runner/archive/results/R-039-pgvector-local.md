# R-039 · Can the local Postgres take pgvector?
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 08:46 CT · **Status:** done
- **Finished:** 2026-09-24 08:47 CT

## Facts

| Fact | Value |
|---|---|
| How Django connects | `DATABASE_URL` is unset. `ecothrift/settings.py:160-165` uses `DATABASE_NAME` / `DATABASE_USER` / `DATABASE_HOST` / `DATABASE_PORT`. |
| Dev database | `local_shared` on `localhost:5432` (user `postgres`) |
| Server version | PostgreSQL 18.6, x86_64-windows, compiled by msvc-19.44.35228, 64-bit |
| Install | Service `postgresql-x64-18` (Running, Auto). Binary `C:\Program Files\PostgreSQL\18\bin\postgres.exe`. Data directory `C:\Program Files\PostgreSQL\18\data`. Only version under `C:\Program Files\PostgreSQL` is 18. |
| `vector` | No row in `pg_available_extensions`. No `vector*` files in `share\extension` or `lib`. |
| `pg_trgm` | default 1.6, installed 1.6 |
| Test databases | Same cluster. Django's test DB (`test_local_shared`, `.ai/extended/databases.md:22`) sees the same extension list, so `CREATE EXTENSION vector` fails there too until the files are installed. |

Query (read-only, Django default connection): `SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name IN ('vector', 'pg_trgm') ORDER BY name`.

| name | default_version | installed_version |
|---|---|---|
| pg_trgm | 1.6 | 1.6 |

## Installing `vector` (nothing installed)

The [pgvector README](https://github.com/pgvector/pgvector/blob/master/README.md) Windows section does not offer a prebuilt binary. It says build v0.8.6 with Visual Studio C++ (`x64 Native Tools Command Prompt`, as administrator) and `nmake /F Makefile.win`, with `PGROOT=C:\Program Files\PostgreSQL\18` — this machine's install. Notes: [Windows installation notes](https://github.com/pgvector/pgvector/blob/master/README.md#installation-notes---windows). Linux/Mac text says Postgres 13+.

The same README also lists [Docker](https://github.com/pgvector/pgvector/blob/master/README.md#docker) (`pgvector/pgvector:pg18`) and [conda-forge](https://github.com/pgvector/pgvector/blob/master/README.md#conda-forge) (Conda Postgres only). Heroku's available build (R-018) is 0.8.1; the README's current pin is v0.8.6.

## Python libraries

| Package | `requirements*.txt` | venv (`pip` / `importlib.metadata`) |
|---|---|---|
| pgvector | not listed | not installed |
| sentence-transformers | not listed | not installed |
| numpy | `workspace/notebooks/_shared/requirements-notebooks.txt` only (`numpy>=1.26.0`) | not installed |
| torch | not listed | not installed |

`requirements.txt` and `printserver/requirements.txt` list none of the four.

**Opinion:** Least effort is the README's `nmake` build of v0.8.6 against this PostgreSQL 18 tree; there is no prebuilt Windows binary there, and Docker or conda-forge would be a different server than the one Django already uses.
