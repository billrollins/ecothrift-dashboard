"""
Copy this file to config_local.py and fill in real values.
config_local.py is gitignored.

Keys must match db_explorer.ipynb: old_production, production, dev
"""

CONNECTIONS = {
    "old_production": {
        "label": "DB1 — Old Production (archive)",
        "host": "localhost",
        "port": 5432,
        "database": "old_production_db",
        "user": "postgres",
        "password": "CHANGE_ME",
        "schema": "public",
    },
    "production": {
        "label": "DB2 — Production (Heroku or local restore)",
        "host": "localhost",
        "port": 5432,
        "database": "db2",
        "user": "postgres",
        "password": "CHANGE_ME",
        "schema": "public",
    },
    "dev": {
        "label": "DB3 — This repo (Django dev)",
        "host": "localhost",
        "port": 5432,
        "database": "ecothrift_v2",
        "user": "postgres",
        "password": "CHANGE_ME",
        "schema": "public",
    },
}
