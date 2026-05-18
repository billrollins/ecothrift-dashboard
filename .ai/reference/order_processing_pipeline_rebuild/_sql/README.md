# `_sql/` — intake pipeline (table/column view)

SQL snippets for **one PO** live here or in **`.ai/extended/sql/`**.

**Run queries:** [`.ai/extended/sql/cli.md`](../../../extended/sql/cli.md) — use schema-qualified `ecothrift.*`.

**Column catalog:** [`.ai/extended/sql/schema_columns_ecothrift.sql`](../../../extended/sql/schema_columns_ecothrift.sql) → **`schema.csv`** per [`.ai/extended/sql/README.md`](../../../extended/sql/README.md).

**Intake diagnostics:** [`.ai/extended/sql/intake_pipeline_by_order.sql`](../../../extended/sql/intake_pipeline_by_order.sql).

**Order UI:** [`order_dashboard_surfaces.md`](../order_dashboard_surfaces.md).

| File | Maps to |
|------|--------|
| [`order_list.sql`](./order_list.sql) | `GET /api/inventory/orders/` (+ same filters as `…/summary/`) — vendor `IN` list must match [`apps/inventory/constants.py`](../../../../apps/inventory/constants.py) `PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES` |
| [`order_create_new.sql`](./order_create_new.sql) | `POST /api/inventory/orders/` — row after create (`:po_id`) |
| [`order_detail_get.sql`](./order_detail_get.sql) | `GET /api/inventory/orders/{id}/` — `_annotate_purchase_order_stats` + `select_related(vendor, created_by)` |
| [`order_edit.sql`](./order_edit.sql) | `PATCH /api/inventory/orders/{id}/` |
| [`order_upload_manifest.sql`](./order_upload_manifest.sql) | `upload-manifest` / `remove-manifest` — `inventory_purchaseorder`, `core_s3file`, `inventory_preprocessingorder` |
