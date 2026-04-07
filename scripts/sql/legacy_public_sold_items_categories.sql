-- Legacy DB (schema: public) — sold items with categories for remapping work.
-- Read-only SELECT. All tables schema-qualified (no SET search_path).
-- Run against the OLD production database (not ecothrift V3).
--
-- Date window: Jan 1 of the current calendar year through today (sold_at::date).

-- ============ 1) Detail: one row per sold item =================================
WITH params AS (
  SELECT
    date_trunc('year', CURRENT_DATE)::date AS v_start,
    CURRENT_DATE AS v_end
)
SELECT
  i.id AS item_id,
  i.sku,
  i.sold_at,
  i.sold_for,
  i.retail_amt,
  m.id AS manifest_row_id,
  m.category AS manifest_category,
  m.subcategory AS manifest_subcategory,
  m.description AS manifest_description,
  p.id AS product_id,
  p.title AS product_title,
  p.brand AS product_brand,
  p.model AS product_model
FROM public.inventory_item i
CROSS JOIN params pr
LEFT JOIN public.inventory_manifest_rows m ON m.id = i.manifest_row_id
LEFT JOIN public.inventory_product p ON p.id = i.product_id
WHERE i.sold_at IS NOT NULL
  AND i.sold_for IS NOT NULL
  AND i.sold_at::date >= pr.v_start
  AND i.sold_at::date <= pr.v_end
ORDER BY i.sold_at DESC;
