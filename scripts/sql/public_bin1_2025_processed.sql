-- Bin 1 — Items processed in calendar year 2025 (`public` schema; V2-era tables, same DB as ecothrift).
-- Read-only SELECT. Schema-qualified `public.*` (no SET search_path).
-- Shared taxonomy_input columns first (see workspace/notebooks/category-research/docs/taxonomy_input_schema.md).

SELECT
  'bin1'::text AS bin,
  i.id::text AS row_key,
  i.id AS item_id,
  i.sku,
  i.manifest_row_id,
  (i.manifest_row_id IS NOT NULL) AS manifest_has_row,
  COALESCE(TRIM(m.category), '') AS manifest_category,
  COALESCE(TRIM(m.subcategory), '') AS manifest_subcategory,
  COALESCE(TRIM(m.description), '') AS manifest_description,
  m.retail_value AS manifest_retail_value,
  COALESCE(TRIM(p.title), '') AS product_title,
  COALESCE(TRIM(p.brand), '') AS product_brand,
  COALESCE(TRIM(p.model), '') AS product_model,
  i.retail_amt AS item_retail_amt,
  i.starting_price AS item_starting_price,
  i.processing_completed_at,
  i.on_shelf_at,
  i.inventory_purchase_order_id,
  i.product_id,
  i.sold_at,
  i.sold_for
FROM public.inventory_item i
LEFT JOIN public.inventory_manifest_rows m ON m.id = i.manifest_row_id
LEFT JOIN public.inventory_product p ON p.id = i.product_id
WHERE i.processing_completed_at IS NOT NULL
  AND i.processing_completed_at >= TIMESTAMP '2025-01-01 00:00:00'
  AND i.processing_completed_at < TIMESTAMP '2026-01-01 00:00:00'
ORDER BY i.processing_completed_at;
