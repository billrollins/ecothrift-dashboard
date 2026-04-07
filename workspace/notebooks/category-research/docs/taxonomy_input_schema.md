# Taxonomy input — unified extracts (notebook) vs legacy CLI

Two parallel contracts exist:

1. **Unified notebook extracts** — [`scripts/sql/unified_bin1_public.sql`](../../../../scripts/sql/unified_bin1_public.sql), [`unified_bin2_public.sql`](../../../../scripts/sql/unified_bin2_public.sql), [`unified_bin3_public.sql`](../../../../scripts/sql/unified_bin3_public.sql). All three share the **same column order** from **`public`** `inventory_item` + manifest + product + **vendor** (PO → vendor). Bin 3 filters SKUs via **ecothrift** retag notes (`RETAGGED_FROM_DB2:%`) only; manifest/product text still comes from **public**. Loaded by [`cr`](../cr/) / [`category_research.ipynb`](../category_research.ipynb).

2. **Legacy `export_category_bins`** — older files such as [`public_bin1_2025_processed.sql`](../../../../scripts/sql/public_bin1_2025_processed.sql) and [`ecothrift_bin3_all_items_detail.sql`](../../../../scripts/sql/ecothrift_bin3_all_items_detail.sql) (ecothrift-shaped Bin 3). Prefer the **unified** path for new category intelligence work.

**Do not** use `ecothrift.inventory_item.category` as a taxonomy proxy; use manifest + product (+ `vendor_name` in unified extracts).

## Unified column list (identical across bins; NULL where N/A)

| Column | Role |
|--------|------|
| `bin` | `bin1` / `bin2` / `bin3` |
| `row_key` | Stable per bin |
| `item_id`, `sku`, `manifest_row_id`, `manifest_has_row` | Keys / traceability |
| `manifest_category`, `manifest_subcategory`, `manifest_description`, `manifest_retail_value` | Tier A — manifest |
| `product_title`, `product_brand`, `product_model` | Tier A — product (`public`) |
| `vendor_name` | Tier A — `COALESCE` of vendor `name` / `code` via manifest PO |
| `item_retail_amt`, `item_starting_price` | Tier A — retail |
| `ecothrift_item_id` | Bin 3 only; NULL on Bin 1/2 |
| `cart_*`, `quantity`, `unit_price`, `line_total` | Bin 2 POS; NULL on Bin 1/3 |
| `processing_completed_at`, `on_shelf_at`, `inventory_purchase_order_id`, `product_id`, `sold_at`, `sold_for` | Bin 1/3 item audit; NULL on Bin 2 |

Run [`scripts/sql/category_research_discovery.sql`](../../../../scripts/sql/category_research_discovery.sql) if table names differ on your DB (`inventory_manifest_rows` vs `inventory_manifestrow`).

## Legacy shared columns (CLI exports only)

Older exports used a shorter shared prefix without `vendor_name`. See git history or legacy `public_bin*.sql` if you still join to those CSVs.
