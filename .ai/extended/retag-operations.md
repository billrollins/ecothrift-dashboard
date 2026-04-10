<!-- Last updated: 2026-04-10T12:00:00-05:00 -->

# Retag operations (AI reference)

Single place for **day-of** and **post-cutover** pointers. Technical detail lives in [`.ai/extended/inventory-pipeline.md`](inventory-pipeline.md) (models, APIs, commands).

## Before retag day

- Refresh staging: `python manage.py import_db2_staging --update-existing` (after a current DB2 snapshot). Default import includes **sold + active** legacy rows; use `--active-only` for floor inventory only.
- Staging table: `inventory_templegacyitem` (`TempLegacyItem`).

## During retag day

- **Bulk shelf units:** Retag UI **Labels / qty** (1–50) maps to **`POST /api/inventory/retag/v2/create/`** body **`quantity`**; each unit is a new DB3 `Item` with a unique SKU. Labels print via the local print server one job at a time (staggered **`POST /print/label`**). After a multi-unit success, the qty control resets to **1**.

## After retag day (cleanup)

1. `DROP TABLE inventory_retaglog; DROP TABLE inventory_templegacyitem;` (or equivalent migration after removing models).
2. Remove `TempLegacyItem` and `RetagLog` model classes from `apps/inventory/models.py`.
3. `makemigrations` + `migrate`.
4. Remove `import_db2_staging` command if no longer needed.
5. Remove `retag_v2_*` API routes, `RetagPage.tsx`, sidebar link.

Retag v2 endpoints are documented under **Retag v2 API Endpoints** in `inventory-pipeline.md`.

### Retag history (`GET /api/inventory/retag/v2/history/`)

- **`RetagLog.retagged_by`** references **`accounts.User`** (`AbstractBaseUser` + `PermissionsMixin`, **not** `AbstractUser`). In serializers/views use **`user.full_name`** (property: `first_name` + `last_name`) — **not** **`get_full_name()`**, which Django only defines on **`AbstractUser`**. Calling **`get_full_name()`** incorrectly can yield **HTTP 500**.
- Frontend **`RetagPage.tsx`**: history fetch defaults and **`since`** query behavior.

## E2E manual test checklist

See [`workspace/testing/e2e_retag_pos_sales_verification.md`](../../workspace/testing/e2e_retag_pos_sales_verification.md).
