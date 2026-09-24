# R-040 · Production: where do Postgres extensions live?
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 09:44 · **Finished:** 2026-09-24 09:50 · **Status:** done

Read-only `heroku pg:psql --app ecothrift-database` (addon `postgresql-animated-38252`). SELECT only.

**Opinion:** `CREATE EXTENSION IF NOT EXISTS vector SCHEMA "ecothrift"` will likely succeed. `heroku_ext` and event triggers do not stand in the way. The open risk is permissions: `vector` is not trusted and this role is not a superuser, which stock Postgres would reject. Heroku's pgvector doc shows this same `heroku pg:psql` credential running `CREATE EXTENSION vector`, and the `heroku_ext`-only rule was removed in August 2023. I did not run CREATE.

## 1. Installed extensions

`SELECT e.extname, e.extversion, n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY 1;`

| extname | extversion | nspname |
|---|---|---|
| pg_stat_statements | 1.10 | public |
| pg_trgm | 1.6 | ecothrift |
| plpgsql | 1.0 | pg_catalog |

## 2. Schemas

`SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1;`

| nspname |
|---|
| darkhorse |
| ecothrift |
| heroku_ext |
| public |

## 3. User, search_path, role

`SELECT current_user, current_setting('search_path');`

| current_user | current_setting |
|---|---|
| u4lpm5bu1q2uan | `"$user", public, heroku_ext` |

`SELECT rolname, rolsuper, rolcreatedb FROM pg_roles WHERE rolname = current_user;`

| rolname | rolsuper | rolcreatedb |
|---|---|---|
| u4lpm5bu1q2uan | f | f |

This is the `heroku pg:psql` session. Django on Heroku sets `search_path=ecothrift` (`ecothrift/settings_production.py:15`). The CLI path does not include `ecothrift`. A `SCHEMA "ecothrift"` clause does not depend on that path. A type created in `ecothrift` is what that Django path can see.

## 4. vector and pg_trgm

`SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name IN ('vector', 'pg_trgm');`

| name | default_version | installed_version |
|---|---|---|
| pg_trgm | 1.6 | 1.6 |
| vector | 0.8.1 | (null) |

`vector` is available and not installed.

## 5. Event triggers

`SELECT evtname, evtevent, evtfoid::regproc FROM pg_event_trigger;`

0 rows.

## Extra (still SELECT)

| Check | Result |
|---|---|
| `vector` 0.8.1 `superuser` / `trusted` | t / f |
| `pg_trgm` 1.6 `superuser` / `trusted` | t / t |
| Extension owner | `postgres` for plpgsql, pg_stat_statements, and pg_trgm |
| `has_schema_privilege(..., 'ecothrift', 'CREATE')` | t |
| Objects in `heroku_ext` | none |
