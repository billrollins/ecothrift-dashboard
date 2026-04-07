-- Bin 2 — POS sales in calendar year 2026 (`public` schema; same DB as ecothrift).
-- Schema-qualified `public.*` (no SET search_path).
-- Shared taxonomy_input columns first (manifest + product; not ecothrift.item.category).

SELECT
  'bin2'::text AS bin,
  (c.id::text || '-' || cl.id::text) AS row_key,
  cl.item_id AS item_id,
  COALESCE(TRIM(i.sku), '') AS sku,
  i.manifest_row_id AS manifest_row_id,
  (i.manifest_row_id IS NOT NULL) AS manifest_has_row,
  COALESCE(TRIM(m.category), '') AS manifest_category,
  COALESCE(TRIM(m.subcategory), '') AS manifest_subcategory,
  COALESCE(TRIM(m.description), '') AS manifest_description,
  m.retail_value AS manifest_retail_value,
  COALESCE(TRIM(p.title), TRIM(cl.product_title), '') AS product_title,
  COALESCE(TRIM(p.brand), TRIM(cl.product_brand), '') AS product_brand,
  COALESCE(TRIM(p.model), TRIM(cl.product_model), '') AS product_model,
  i.retail_amt AS item_retail_amt,
  NULL::numeric AS item_starting_price,
  c.id AS cart_id,
  c.completed_at AS cart_completed_at,
  c.status AS cart_status,
  c.subtotal AS cart_subtotal,
  c.total AS cart_total,
  cl.id AS cart_line_id,
  cl.quantity,
  cl.unit_price,
  cl.line_total
FROM public.pos_cart c
INNER JOIN public.pos_cart_line cl ON cl.cart_id = c.id
LEFT JOIN public.inventory_item i ON i.id = cl.item_id
LEFT JOIN public.inventory_manifest_rows m ON m.id = i.manifest_row_id
LEFT JOIN public.inventory_product p ON p.id = i.product_id
WHERE c.status = 'completed'
  AND c.completed_at IS NOT NULL
  AND c.completed_at >= TIMESTAMP '2026-01-01 00:00:00'
  AND c.completed_at < TIMESTAMP '2027-01-01 00:00:00'
ORDER BY c.completed_at, cl.id;
