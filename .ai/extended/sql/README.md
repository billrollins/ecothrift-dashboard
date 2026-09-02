<!-- Last updated: 2026-08-27 (schema refresh lives here; sql-schema protocol removed) -->

# SQL (`extended/sql/`)

PostgreSQL snippets for **pgAdmin**, **`psql`**, and automation. **[`cli.md`](cli.md)** — terminal connection patterns.

**Schema:** App tables live under **`ecothrift.*`** after a normal prod restore into **`ecothrift_v3`**. Django uses **`search_path=ecothrift`**; ad hoc SQL should still qualify **`ecothrift.`** when using raw **`psql`**. Legacy / V2-era tables may sit under **`public`** — see **[`../databases.md`](../databases.md)**.

| File | Purpose |
|------|---------|
| [`cli.md`](cli.md) | **`psql`** / **`manage.py dbshell`** — humans and AI agents. |
| [`schema_columns_ecothrift.sql`](schema_columns_ecothrift.sql) | **`information_schema`** column listing for **`ecothrift`**. |
| [`inventory_daily_migration.sql`](inventory_daily_migration.sql) | **v4** bulk interval reconstruction → flat columns **`prefix_suffix`**. Writes **[`daily_migration.csv`](daily_migration.csv)** via **`psql --csv`**. |
| [`daily_migration.csv`](daily_migration.csv) | Generated report; gitignored unless you choose to commit snapshots. |
| **`schema.csv`** | Generated snapshot (not hand-edited). **Intentionally committed.** Refresh with the steps under **Update schema** below. |

---

## Daily migration (`inventory_daily_migration.sql`) — v4 / CSV

**`params`:** **`end_date`** = Chicago calendar date (`timezone('America/Chicago', now())::date`); **`days_back`** = inclusive span backward from **`end_date`**.

**Export with header row** (repo root; load **`DATABASE_*`** from **`.env`** — avoid assigning **`$Host`** in PowerShell; use **`$pgHost`**):

```powershell
$eb = @{}
Get-Content ".env" | ForEach-Object {
  if ($_ -match '^\s*DATABASE_(\w+)\s*=\s*(.*)\s*$') { $eb[$matches[1]] = $matches[2].Trim() }
}
$env:PGPASSWORD = $eb['PASSWORD']
$pgHost = if ($eb['HOST']) { $eb['HOST'] } else { 'localhost' }
$pgPort = if ($eb['PORT']) { $eb['PORT'] } else { '5432' }
psql -h $pgHost -p $pgPort -U $eb['USER'] -d $eb['NAME'] -v ON_ERROR_STOP=1 `
  --csv -f ".ai/extended/sql/inventory_daily_migration.sql" `
  -o ".ai/extended/sql/daily_migration.csv"
```

**Flattened column names** (`json_group` + `_` + `json_key`; nested bucket keys use `_from_*` / `_to_*`):

| Prefix | Fields |
|--------|--------|
| **`sales_`** | **`qty`**, **`sales`**, **`retail`** |
| **`on_shelf_`** | **`qty`**, **`price`**, **`retail`**, **`qty_sod`**, **`recon_delta`** |
| **`migration_to_`** | **`qty_in`**, **`from_intake`**, **`from_processing`**, **`from_returned`**, **`from_sold`**, **`from_scrapped`**, **`from_lost`** |
| **`migration_from_`** | **`qty_out`**, **`to_sold`**, **`to_scrapped`**, **`to_lost`**, **`to_intake`**, **`to_processing`**, **`to_returned`** |
| **`price_increases_`** | **`qty`**, **`total_increase`** |
| **`price_decreases_`** | **`qty`**, **`total_decrease`** |

Only listed **`from_*` / `to_*`** status buckets appear as columns; add keys to the SQL if probes show other non-zero statuses.

**Semantics:** On-shelf SOD/EOD from merged **`status_change`** intervals plus synthetic pre-history interval; POS **`sales_*`** from completed carts that calendar day; **`sold`** exits use **`sold_at`** (history rows **`→ sold`** excluded); **`recon_delta`** flow check as in SQL header. **`on_shelf` dollar** fields use **current** row **`price`/`unit_retail`** when joining **`inventory_item`**.

**Indexes:** See comment block at top of **`inventory_daily_migration.sql`**.

### One-time probes (calibrate buckets / assumptions)

**Removal destinations** (expand explicit **`to.*`** keys if **`hist_other`**-style volume shows up inside dynamic JSON):

```sql
SELECT new_value, COUNT(*)
FROM ecothrift.inventory_itemhistory
WHERE event_type = 'status_change'
  AND old_value = 'on_shelf'
  AND created_at >= now() - INTERVAL '90 days'
GROUP BY 1
ORDER BY 2 DESC;
```

**Items with no `status_change` history** (fallback is **`inventory_item.status`**):

```sql
SELECT COUNT(*)
FROM ecothrift.inventory_item i
WHERE NOT EXISTS (
  SELECT 1 FROM ecothrift.inventory_itemhistory h
  WHERE h.item_id = i.id AND h.event_type = 'status_change'
);
```

---

## Update schema (AI + humans)

After **migrations**, **new models**, or whenever SQL needs an accurate column list:

1. Run **[`schema_columns_ecothrift.sql`](schema_columns_ecothrift.sql)** against **local** **`ecothrift_v3`** (or the DB you are documenting).
2. Write CSV output next to this README as **`schema.csv`** (overwrite).

**Example — PowerShell** (repo root; fill connection flags from **`.env`** — see **`cli.md`**):

```powershell
$env:PGPASSWORD = "<DATABASE_PASSWORD from .env>"
psql -h localhost -p 5432 -U postgres -d ecothrift_v3 --csv -f ".ai/extended/sql/schema_columns_ecothrift.sql" -o ".ai/extended/sql/schema.csv"
```

**AI agents:** perform that dump when the user asks to refresh schema, when **`apps/*/models.py`** or migrations changed and ad hoc SQL is in scope, or when **`schema.csv`** is missing/stale. Use **`cli.md`** for credentials (**never** invent hosts/passwords). Prefer **read-only** `SELECT` against **local** DB unless the user specifies otherwise.

If **`psql --csv`** is unavailable (very old client), use **`cli.md`** alternatives or pgAdmin export from the same SQL file.

**`schema.csv`** is generated and **intentionally committed** as a snapshot. Refresh it when columns change; do not hand-edit.

---

## Timestamps

**`completed_at`** / **`created_at`** are **`timestamp with time zone`**. **`date_trunc('month', …)`** follows session **`TIME ZONE`** unless you pin reporting with **`AT TIME ZONE 'America/Chicago'`** (or equivalent).
