<!-- Last updated: 2026-03-26T21:00:00-05:00 -->

# Retag operations (AI reference)

Single place for **day-of** and **post-cutover** pointers. Technical detail lives in [`.ai/extended/inventory-pipeline.md`](inventory-pipeline.md) (models, APIs, commands).

## Before retag day

- Refresh staging: `python manage.py import_db2_staging --update-existing` (after a current DB2 snapshot). Default import includes **sold + active** legacy rows; use `--active-only` for floor inventory only.
- Staging table: `inventory_templegacyitem` (`TempLegacyItem`).

## After retag day (cleanup)

1. `DROP TABLE inventory_retaglog; DROP TABLE inventory_templegacyitem;` (or equivalent migration after removing models).
2. Remove `TempLegacyItem` and `RetagLog` model classes from `apps/inventory/models.py`.
3. `makemigrations` + `migrate`.
4. Remove `import_db2_staging` command if no longer needed.
5. Remove `retag_v2_*` API routes, `RetagPage.tsx`, sidebar link.

Retag v2 endpoints are documented under **Retag v2 API Endpoints** in `inventory-pipeline.md`.

## E2E manual test checklist

See [`workspace/testing/e2e_retag_pos_sales_verification.md`](../../workspace/testing/e2e_retag_pos_sales_verification.md).
