<!-- Last updated: 2026-05-06 -->

# Protocol: Update SQL schema snapshot (`schema.csv`)

Refresh **`.ai/extended/sql/schema.csv`** so agents and humans have a current **`ecothrift`** column listing from Postgres (**`information_schema`**).

---

## When

- User asks to refresh schema / **`schema.csv`**, or  
- **`apps/*/models.py`** or migrations changed and raw SQL or reporting work needs accurate columns, or  
- **`schema.csv`** is missing or known stale.

---

## Steps

1. **Read** [`.ai/extended/sql/README.md`](../extended/sql/README.md) — conventions, **`schema.csv`** output path, commit vs local-only note.  
2. **Read** [`.ai/extended/sql/cli.md`](../extended/sql/cli.md) — **`psql`** connection (**`.env`** **`DATABASE_*`**); **never** invent credentials.  
3. **Run** [`.ai/extended/sql/schema_columns_ecothrift.sql`](../extended/sql/schema_columns_ecothrift.sql) against the target DB (default: **local** **`ecothrift_v3`** unless the user specifies otherwise).  
4. **Write** results to **`.ai/extended/sql/schema.csv`** (overwrite).

Use the **`psql`** example in **`README.md`** (e.g. **`--csv`**, **`-f`** SQL path, **`-o`** output path). If **`psql --csv`** is unavailable, follow **`cli.md`** / **`README.md`** fallbacks (e.g. pgAdmin export of the same SQL).

---

## Guardrails

- **Read-only** introspection (`SELECT` only).  
- Prefer **local** DB unless the user explicitly requests another host (e.g. Heroku).  
- Do **not** commit **`schema.csv`** unless the team wants it tracked — see **`README.md`**.

---

## Related

- [`.ai/extended/databases.md`](../extended/databases.md) — **`ecothrift`** vs **`public`**, **`search_path`**.  
- [`.ai/protocols/code.0.Startup.md`](code.0.Startup.md) — session load order (this protocol is **on demand**, not every startup).
