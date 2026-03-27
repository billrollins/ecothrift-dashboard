<!-- Archived 2026-03-28: disposition=backlog parked off main index -->
<!-- initiative: slug=schema-public-to-ecothrift status=backlog updated=2026-03-28 -->
<!-- Last updated: 2026-03-28T15:00:00-05:00 -->
# Move Django app schema: `public` → `ecothrift`

## Objective

Run the Eco-Thrift (V3) Django app against PostgreSQL schema **`ecothrift`** instead of **`public`**, so a **single database instance** can host multiple businesses: e.g. **`darkhorse`** (existing other business) and **`ecothrift`** (this dashboard), each isolated by schema.

## Motivation

- One Postgres server / Heroku add-on, multiple logical apps.
- Clear separation of migrations, search_path, and backups per brand.

## Acceptance (draft)

- [ ] `DATABASES['default']['OPTIONS']` (or connection) sets `search_path` / schema to `ecothrift` (or equivalent Django 5 pattern).
- [ ] Migrations apply into `ecothrift`; no accidental writes to `public` for app tables.
- [ ] Documented local + production steps (create schema, grants, migrate).
- [ ] Verified coexistence with `darkhorse` schema (read-only cross-schema queries out of scope unless needed).

## Risks / notes

- Existing `public` data on dev must be migrated or dumped before cutover.
- Heroku/external: confirm role has `CREATE` on schema and `USAGE` on database.

## See also

- [`databases.md`](../../../extended/databases.md)
- Django: `OPTIONS`: `options: '-c search_path=ecothrift,public'`
