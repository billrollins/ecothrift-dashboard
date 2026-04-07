-- Unified Bin 3 — current shelf stock linked to public via ecothrift retag notes.
-- ecothrift used only to filter SKUs and expose ecothrift_item_id; manifest/product/vendor from public.
-- Same column order as unified_bin1_public.sql / unified_bin2_public.sql.
-- Tier A (AI): manifest_* , vendor_name , product_* , item_retail_amt
-- Tier B: ecothrift_item_id; POS NULL; item audit from public i
-- Read-only SELECT. Schema-qualified public.* / ecothrift.* (no SET search_path).

WITH OnShelfItems AS (
  SELECT
    ei.id,
    TRIM(split_part(ei.notes, ':', 2)) AS old_sku
  FROM ecothrift.inventory_item ei
  WHERE ei.status = 'on_shelf'
    AND ei.notes LIKE 'RETAGGED_FROM_DB2:%'
)
SELECT
  'bin3'::text AS bin,
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
  os.id AS ecothrift_item_id,
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
FROM OnShelfItems os
INNER JOIN public.inventory_item i ON i.sku = TRIM(os.old_sku)
LEFT JOIN public.inventory_manifest_rows m ON m.id = i.manifest_row_id
LEFT JOIN public.inventory_product p ON p.id = i.product_id
LEFT JOIN public.inventory_purchase_order po ON po.id = m.purchase_order_id
LEFT JOIN public.inventory_vendor v ON v.id = po.vendor_id
WHERE os.old_sku IS NOT NULL
  AND os.old_sku <> ''
ORDER BY i.sku;
