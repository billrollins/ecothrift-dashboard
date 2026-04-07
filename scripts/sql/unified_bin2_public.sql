-- Unified Bin 2 — POS sales calendar year 2026 (`public` only).
-- Same column order as unified_bin1_public.sql / unified_bin3_public.sql.
-- Tier A (AI): manifest_* , vendor_name , product_* (line fallbacks), item_retail_amt
-- Tier B: bin, row_key, item_id, sku; ecothrift_item_id NULL; POS columns; item audit from i where joined
-- Read-only SELECT. Schema-qualified public.* (no SET search_path).

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
  COALESCE(NULLIF(TRIM(v.name), ''), NULLIF(TRIM(v.code), ''), '') AS vendor_name,
  i.retail_amt AS item_retail_amt,
  NULL::numeric AS item_starting_price,
  NULL::bigint AS ecothrift_item_id,
  c.id AS cart_id,
  c.completed_at AS cart_completed_at,
  c.status AS cart_status,
  c.subtotal AS cart_subtotal,
  c.total AS cart_total,
  cl.id AS cart_line_id,
  cl.quantity,
  cl.unit_price,
  cl.line_total,
  i.processing_completed_at,
  NULL::timestamptz AS on_shelf_at,
  NULL::bigint AS inventory_purchase_order_id,
  NULL::bigint AS product_id,
  NULL::timestamptz AS sold_at,
  NULL::numeric AS sold_for
FROM public.pos_cart c
INNER JOIN public.pos_cart_line cl ON cl.cart_id = c.id
LEFT JOIN public.inventory_item i ON i.id = cl.item_id
LEFT JOIN public.inventory_manifest_rows m ON m.id = i.manifest_row_id
LEFT JOIN public.inventory_product p ON p.id = i.product_id
LEFT JOIN public.inventory_purchase_order po ON po.id = m.purchase_order_id
LEFT JOIN public.inventory_vendor v ON v.id = po.vendor_id
WHERE c.status = 'completed'
  AND c.completed_at IS NOT NULL
  AND c.completed_at >= TIMESTAMP '2026-01-01 00:00:00'
  AND c.completed_at < TIMESTAMP '2027-01-01 00:00:00'
ORDER BY c.completed_at, cl.id;
