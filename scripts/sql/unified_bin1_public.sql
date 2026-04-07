-- Unified Bin 1 — processed in calendar year 2025 (`public` only).
-- Same column order as unified_bin2_public.sql / unified_bin3_public.sql (Tier A/B comments).
-- Tier A (AI): manifest_* , vendor_name , product_* , item_retail_amt
-- Tier B: bin, row_key, item_id, sku, keys; ecothrift_item_id NULL; POS columns NULL; item audit from i
-- Read-only SELECT. Schema-qualified public.* (no SET search_path).

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
  COALESCE(NULLIF(TRIM(v.name), ''), NULLIF(TRIM(v.code), ''), '') AS vendor_name,
  i.retail_amt AS item_retail_amt,
  i.starting_price AS item_starting_price,
  NULL::bigint AS ecothrift_item_id,
  NULL::bigint AS cart_id,
  NULL::timestamptz AS cart_completed_at,
  NULL::text AS cart_status,
  NULL::numeric AS cart_subtotal,
  NULL::numeric AS cart_total,
  NULL::bigint AS cart_line_id,
  NULL::numeric AS quantity,
  NULL::numeric AS unit_price,
  NULL::numeric AS line_total,
  i.processing_completed_at,
  i.on_shelf_at,
  i.inventory_purchase_order_id,
  i.product_id,
  i.sold_at,
  i.sold_for
FROM public.inventory_item i
LEFT JOIN public.inventory_manifest_rows m ON m.id = i.manifest_row_id
LEFT JOIN public.inventory_product p ON p.id = i.product_id
LEFT JOIN public.inventory_purchase_order po ON po.id = m.purchase_order_id
LEFT JOIN public.inventory_vendor v ON v.id = po.vendor_id
WHERE i.processing_completed_at IS NOT NULL
  AND i.processing_completed_at >= TIMESTAMP '2025-01-01 00:00:00'
  AND i.processing_completed_at < TIMESTAMP '2026-01-01 00:00:00'
ORDER BY i.processing_completed_at;
