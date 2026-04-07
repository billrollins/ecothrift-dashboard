-- Bin 3 — V3 inventory items excluding **sold** (`ecothrift` schema). Sold rows are kept in DB for
-- sales reporting but are omitted from this extract. Manifest + product for taxonomy_input.
-- `item_category_db_not_for_taxonomy` is audit-only — do not use as proxy for manifest categories.
-- Schema-qualified `ecothrift.*` (no SET search_path).

SELECT
  'bin3'::text AS bin,
  i.id::text AS row_key,
  i.id AS item_id,
  i.sku,
  i.manifest_row_id,
  (i.manifest_row_id IS NOT NULL) AS manifest_has_row,
  COALESCE(TRIM(m.category), '') AS manifest_category,
  ''::text AS manifest_subcategory,
  COALESCE(NULLIF(TRIM(m.description), ''), NULLIF(TRIM(m.title), ''), '') AS manifest_description,
  m.retail_value AS manifest_retail_value,
  COALESCE(TRIM(p.title), '') AS product_title,
  COALESCE(TRIM(p.brand), '') AS product_brand,
  COALESCE(TRIM(p.model), '') AS product_model,
  COALESCE(
    (
      SELECT r.retail_amt
      FROM ecothrift.inventory_retaglog r
      WHERE r.new_item_sku = i.sku
      ORDER BY r.retagged_at DESC
      LIMIT 1
    ),
    (
      SELECT m2.retail_value
      FROM ecothrift.inventory_manifestrow m2
      WHERE m2.id = i.manifest_row_id
    )
  )::numeric AS item_retail_amt,
  NULL::numeric AS item_starting_price,
  i.title AS item_title,
  i.brand AS item_brand,
  i.category AS item_category_db_not_for_taxonomy,
  i.status,
  i.price,
  i.cost,
  i.condition,
  i.location,
  i.listed_at,
  i.sold_at,
  i.sold_for,
  i.product_id,
  i.purchase_order_id,
  i.created_at,
  i.updated_at
FROM ecothrift.inventory_item i
LEFT JOIN ecothrift.inventory_manifestrow m ON m.id = i.manifest_row_id
LEFT JOIN ecothrift.inventory_product p ON p.id = i.product_id
WHERE i.status <> 'sold'
ORDER BY i.status, i.sku;
