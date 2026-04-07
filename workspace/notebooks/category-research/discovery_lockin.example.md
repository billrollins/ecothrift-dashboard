# Discovery lock-in (copy to `discovery_lockin.md` locally; gitignored)

Fill after running [`ai_scripts/sql/category_research_discovery.sql`](ai_scripts/sql/category_research_discovery.sql) via [`ai_scripts/ai_execute_sql.py`](ai_scripts/ai_execute_sql.py):

`python workspace/notebooks/category-research/ai_scripts/ai_execute_sql.py category_research_discovery.sql category_research_discovery`

| Field | Value |
|--------|--------|
| Manifest table | `public.inventory_manifest_rows` |
| Purchase order table | `public.inventory_purchase_order` |
| Vendor table | `public.inventory_vendor` |
| Join | `m.purchase_order_id = po.id` AND `po.vendor_id = v.id` AND `m.id = i.manifest_row_id` (also `i.inventory_purchase_order_id` → `inventory_purchase_order.id`) |
| Vendor column in unified SQL | `COALESCE(TRIM(v.name), TRIM(v.code), '')` as `vendor_name` |

Notes:

- The Django/Postgres table name uses **underscores**: `inventory_purchase_order`, not `inventory_purchaseorder`.
- Discovery CSV `category_research_discovery_5.csv`: FKs include `inventory_manifest_rows.purchase_order_id` → `inventory_purchase_order.id`) and `inventory_purchase_order.vendor_id` → `inventory_vendor.id`.
- Smoke test (`category_research_discovery_6.csv`, 2025 calendar year processed items): `items=53185`, `with_manifest=with_po=with_vendor=45024` for rows with manifest + PO linkage.
- Broader table search (`%purchase%`, `%order%`, `%po%`) lists many `pos_*` tables; PO for inventory is **`inventory_purchase_order`**.
- Bin 3 retag coverage (`category_research_discovery_7.csv`): `on_shelf=8585`, `on_shelf_with_retag_note=8584`.
