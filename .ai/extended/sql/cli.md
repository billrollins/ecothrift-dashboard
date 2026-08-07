<!-- Last updated: 2026-08-04 (env key list lives in development.md) -->

# Command line — run SQL (humans + AI agents)

Use this when you want **`ecothrift`** queries **without pgAdmin**. Credentials live in repo-root **`.env`** (**`DATABASE_*`** keys; full key list in **[`../development.md`](../development.md)** → "Environment Variables"). Never commit secrets or paste production passwords into chat logs.

---

## Prerequisites

- **PostgreSQL client** — `psql` on your **`PATH`** (ships with PostgreSQL install on Windows, or use WSL).
- Repo root **`.env`** with **`DATABASE_HOST`**, **`DATABASE_PORT`**, **`DATABASE_NAME`**, **`DATABASE_USER`**, **`DATABASE_PASSWORD`** (same DB Django uses).

---

## Option A — `psql` (direct)

**Windows PowerShell** (from repo root; set password only for the current shell):

```powershell
$env:PGPASSWORD = "<from .env DATABASE_PASSWORD>"
psql -h localhost -p 5432 -U postgres -d ecothrift_v3 -c "SELECT COUNT(*) FROM ecothrift.pos_cart;"
```

Replace host/port/user/database with your **`.env`** values.

**One-shot file**:

```powershell
psql -h localhost -p 5432 -U postgres -d ecothrift_v3 -f "path\to\report.sql"
```

**Machine-friendly rows** (no alignment headers — handy for scripts):

```powershell
psql -h localhost -p 5432 -U postgres -d ecothrift_v3 -At -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'ecothrift' AND table_type = 'BASE TABLE' ORDER BY 1;"
```

**bash / zsh**:

```bash
export PGPASSWORD="$DATABASE_PASSWORD"
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c 'SELECT current_schema();'
```

**URI form** (password with special characters must be URL-encoded):

```bash
psql "postgresql://USER:PASSWORD@HOST:5432/DATABASE_NAME" -c "SELECT 1;"
```

---

## Option B — Django `dbshell`

Uses **`DATABASES['default']`** from Django settings (including **`search_path`** toward **`ecothrift`**), so **`SELECT * FROM pos_cart`** may work **without** the **`ecothrift.`** prefix depending on server session defaults.

```powershell
cd "E:\Cursor Projects\ecothrift-dashboard"
.\venv\Scripts\Activate.ps1
python manage.py dbshell
```

Then paste SQL at the `=>` prompt, or exit with `\q`.

Non-interactive one-liners are awkward through `dbshell`; prefer **`psql`** for **` -c`** / **`-f`** automation.

---

## Listing `ecothrift` tables from CLI

```powershell
psql -h localhost -p 5432 -U postgres -d ecothrift_v3 -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'ecothrift' AND table_type = 'BASE TABLE' ORDER BY table_name;"
```

See **[`README.md`](README.md)** (**Update schema**) — run **[`schema_columns_ecothrift.sql`](schema_columns_ecothrift.sql)** → **`schema.csv`** for full column metadata.


---

## Guidance for AI agents

1. **Default target:** assume **local** **`ecothrift_v3`** unless the user explicitly asks for **Heroku** or another host.
2. **Credentials:** variable names are documented in **[`../development.md`](../development.md)** ("Environment Variables"). Load values from the user’s **`.env`** on disk; do not invent hosts/passwords.
3. **Safety:** use **read-only** `SELECT` / introspection unless the user requests writes; avoid **`DELETE`/`UPDATE`** on production without explicit approval.
4. **Heroku:** `heroku pg:psql -a <app>` opens a remote session — confirm intent before running; expect latency and real data policies.
5. **Qualify schema:** in raw **`psql`**, prefer **`ecothrift.table_name`** so behavior matches **[`README.md`](README.md)** / **[`../databases.md`](../databases.md)** regardless of **`search_path`**.

---

## Related

- **[`README.md`](README.md)** — **`schema.csv`** refresh workflow (**Update schema**)  
- **[`inventory_daily_migration.sql`](inventory_daily_migration.sql)** — v4 flat columns → **`daily_migration.csv`** via **`psql --csv`** (**README**)  
- **[`schema_columns_ecothrift.sql`](schema_columns_ecothrift.sql)** — column dump SQL  

- **[`../databases.md`](../databases.md)** — **`ecothrift`** vs **`public`**, restores, test DB  
