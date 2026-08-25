<!-- Last updated: 2026-08-13 (renamed from sql.0.UpdateSchema) -->
# Protocol: Update SQL schema snapshot (`schema.csv`)

Refresh **`.ai/extended/sql/schema.csv`** so agents and humans have a current **`ecothrift`** column listing from Postgres (`information_schema`).

## When

- User asks to refresh schema / `schema.csv`, or
- `apps/*/models.py` or migrations changed and raw SQL or reporting needs accurate columns, or
- `schema.csv` is missing or known stale.

## Steps

1. Read [`.ai/extended/sql/README.md`](../extended/sql/README.md).
2. Read [`.ai/extended/sql/cli.md`](../extended/sql/cli.md) — `psql` via `.env` `DATABASE_*`. Never invent credentials.
3. Run [`.ai/extended/sql/schema_columns_ecothrift.sql`](../extended/sql/schema_columns_ecothrift.sql) against the target DB (default: local `ecothrift_v3` unless the user specifies otherwise).
4. Overwrite **`.ai/extended/sql/schema.csv`**.

Use the `psql` example in `README.md` (`--csv`, `-f`, `-o`). If `psql --csv` is unavailable, follow `cli.md` fallbacks.

## Guardrails

- Read-only (`SELECT` only).
- Prefer local DB unless the user requests another host.
- `schema.csv` is generated and **intentionally committed**.

Related: [`.ai/extended/databases.md`](../extended/databases.md). On-demand — not part of [`load-context.md`](load-context.md).
