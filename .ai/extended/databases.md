<!-- Last updated: 2026-04-06T21:00:00-05:00 -->

# Databases — Three Generations

Eco-Thrift has three PostgreSQL databases in play: **Old Production** (archive), **Production** (current v2 app), and **Dev** (this repo / v3 schema). Names are easy to confuse because the **dev** database is still called `ecothrift_v2` locally.

---

## Names in this doc vs servers

| Label here | Generation | Typical database name | Role |
|------------|------------|----------------------|------|
| **Old Production** | 1st (DB1) | `old_production_db` | Archive / migration source |
| **Production** | 2nd (DB2) | Heroku DB name (e.g. `d4op06smk6i192`) or local restore `db2` | Live store until v3 cutover |
| **Dev** | 3rd (DB3) | `ecothrift_v2` (local) | This Django project — **not** the same as “v2 generation” |

**Local dev after `scripts/deploy/0_pull_prod_to_local.bat`:** One database (`ecothrift_v2`) holds a **full production restore**, including **`public`** (legacy / V2-era tables) and **`ecothrift`** (V3 app). Django connects with `search_path=ecothrift` — ORM uses **`ecothrift.*`**. Category research SQL reads **`public.*`** and **`ecothrift.*`** explicitly for exports; **`public`** is not the Django default schema.

---

## Where credentials live (never commit secrets)

| Use case | File / pattern |
|----------|----------------|
| **Jupyter / pandas** | `workspace/notebooks/_shared/config_local.py` — aligns with root `.env`; see `config.example.py` |
| **Django app** | Root `.env` — `DATABASE_*` (see `.env.example` and `.ai/extended/development.md`) |
| **psql / multi-DB INI (optional)** | Local file under `workspace/` if you maintain one (e.g. `workspace/database-audits/.config`) — gitignored; never commit secrets |

Do **not** put passwords or production hosts in `.ai/extended/*.md` or in committed notebook files.

---

## Where full schema / audits live

Long-form audit markdown for DB1/DB2/DB3 is **not committed** in this repo. Keep exports under **`workspace/database-audits/`** (or similar) locally if you maintain them; this file is the **routing doc** and does not duplicate column lists (those drift). For **DB3**, the source of truth is `apps/*/models.py` plus exploratory SQL in `workspace/notebooks/`.

---

## Connection keys for notebooks

`workspace/notebooks/_shared/config_local.py` should define a dict `CONNECTIONS` with these keys (see `_shared/config.example.py`):

- `old_production` — DB1 archive
- `production` — DB2 (Heroku or local snapshot)
- `dev` — DB3 / this project

Each entry: `host`, `port`, `database`, `user`, `password`, and optional `schema` (default `public`) for `search_path` / introspection.

---

## Django vs raw SQL

- **Dev** schema matches `apps/*/models.py` (and `.ai/extended/backend.md` if present) for the **current** app only.
- **DB1/DB2** use different table names and generations — use audits + exploratory SQL in notebooks; do not assume Django models apply.

---

## Category research (`export_category_bins`)

The management command **`export_category_bins`** uses Django’s **`default`** connection only. It does **not** require a second database alias. In a typical production restore, **V2-era** tables live under **`public`** and **V3** app tables under **`ecothrift`** in the **same** Postgres database; SQL files use schema-qualified names (`public.*`, `ecothrift.*`). See **`workspace/notebooks/category-research/README.md`** and the archived initiative [`.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md`](../initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md).

---

## Related

- `.ai/extended/backend.md` — backend / ORM notes when maintained
- `workspace/notebooks/_shared/README.md` — setup; **`db-explorer/db_explorer.ipynb`** — multi-DB exploration
- Optional deps: `workspace/notebooks/_shared/requirements-notebooks.txt` (Jupyter/DB stack + pandas/SQLAlchemy/psycopg2; also ML libs used by pricing commands)
