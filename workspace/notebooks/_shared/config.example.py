"""
Copy this file to config_local.py and fill in real values.
config_local.py is gitignored.

Prefer the repo’s generated config_local.py (reads DATABASE_* from root .env).

Keys match db_explorer.ipynb: old_production, production, dev

**dev** — Use the same database name as Django (`DATABASE_NAME`, usually ecothrift_v3).
Django’s default PostgreSQL `search_path` is **ecothrift** (app models). The **public**
schema in that same database holds legacy/V2 data used only for category-bin SQL exports,
not for the ORM.
"""

CONNECTIONS = {
    "old_production": {
        "label": "DB1 — Old Production (archive)",
        "host": "localhost",
        "port": 5432,
        "database": "ecothrift_v1",
        "user": "postgres",
        "password": "CHANGE_ME",
        "schema": "public",
    },
    "production": {
        "label": "DB2 — V2 archive (local frozen snapshot, public schema)",
        "host": "localhost",
        "port": 5432,
        "database": "ecothrift_v2",
        "user": "postgres",
        "password": "CHANGE_ME",
        "schema": "public",
    },
    "dev": {
        "label": "Django dev — same DB as DATABASE_NAME; ORM uses ecothrift schema",
        "host": "localhost",
        "port": 5432,
        "database": "ecothrift_v3",
        "user": "postgres",
        "password": "CHANGE_ME",
        "schema": "ecothrift",
    },
}
