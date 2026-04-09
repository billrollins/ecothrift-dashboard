<!-- Last updated: 2026-04-09T18:30:00-05:00 -->

# Databases — Three Generations

Eco-Thrift uses **multiple PostgreSQL databases** locally: frozen archives for V1 and V2, and an **active dev** database for this Django app (V3). **Remote production** on Heroku still uses whatever database name Heroku assigns (unchanged here).

---

## Names in this doc vs servers

| Label here | Generation | Typical local database name | Role |
|------------|------------|----------------------------|------|
| **Old Production** | 1st (DB1) | `ecothrift_v1` | Frozen V1 archive / migration source (formerly `old_production_db`) |
| **V2 archive** | 2nd (DB2) | `ecothrift_v2` | Frozen snapshot: **`public`** schema only (legacy / V2-era tables) |
| **Dev** | 3rd (DB3) | `ecothrift_v3` | This Django project — full local prod restore target; **not** the same as “v2 generation” |
| **Production (Heroku)** | live | Heroku-assigned name (e.g. `d4op06smk6i192`) | Current hosted DB until cutover; **not** renamed by local conventions |

**Local dev after `scripts/deploy/0_pull_prod_to_local.bat`:** The script restores a **full production dump** into **`ecothrift_v3`**, including **`public`** (legacy / V2-era tables), **`ecothrift`** (V3 app), **`darkhorse`**, etc. Django connects with `search_path=ecothrift` — ORM uses **`ecothrift.*`**. Category research SQL reads **`public.*`** and **`ecothrift.*`** explicitly for exports (same database as **`DATABASE_*`**); **`public`** is not the Django default schema.

**Separate frozen DBs:** **`ecothrift_v1`** and **`ecothrift_v2`** are optional local archives for introspection and commands that connect to DB1/DB2 **by name** (e.g. historical imports). They are **not** the Django `default` connection.

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

- `old_production` — DB1 archive (`ecothrift_v1` locally)
- `production` — DB2 local frozen snapshot (`ecothrift_v2`)
- `dev` — DB3 / this project (`ecothrift_v3`, same as `DATABASE_NAME`)

Each entry: `host`, `port`, `database`, `user`, `password`, and optional `schema` (default `public`) for `search_path` / introspection.

---

## Django vs raw SQL

- **Dev** schema matches `apps/*/models.py` (and `.ai/extended/backend.md` if present) for the **current** app only.
- **DB1/DB2** use different table names and generations — use audits + exploratory SQL in notebooks; do not assume Django models apply.

---

## Category research (`export_category_bins`)

The management command **`export_category_bins`** uses Django’s **`default`** connection only. It does **not** require a second database alias. In a typical production restore into **`ecothrift_v3`**, **V2-era** tables live under **`public`** and **V3** app tables under **`ecothrift`** in the **same** Postgres database; SQL files use schema-qualified names (`public.*`, `ecothrift.*`). See **`workspace/notebooks/category-research/README.md`** and the archived initiative [`.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md`](../initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md).

---

## Related

- `.ai/extended/backend.md` — backend / ORM notes when maintained
- `workspace/notebooks/_shared/README.md` — setup; **`db-explorer/db_explorer.ipynb`** — multi-DB exploration
- Optional deps: `workspace/notebooks/_shared/requirements-notebooks.txt` (Jupyter/DB stack + pandas/SQLAlchemy/psycopg2; also ML libs used by pricing commands)
- **Historical PO extract (V1/V2/V3 by DB name):** `python workspace/notes/to_consultant/extract_po_descriptions.py` — see [`.ai/initiatives/historical_sell_through_analysis.md`](../initiatives/historical_sell_through_analysis.md) and **`CHANGELOG`** **[2.7.1]**; uses **`ecothrift_v1`**, **`ecothrift_v2`**, **`ecothrift_v3`** with credentials from root **`.env`** (not Django `DATABASE_NAME` alone).
