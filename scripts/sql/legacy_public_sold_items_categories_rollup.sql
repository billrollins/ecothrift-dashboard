-- Legacy public — rollup: counts by manifest category / subcategory (companion to legacy_public_sold_items_categories.sql).
-- Schema-qualified (no SET search_path).

WITH params AS (
  SELECT
    date_trunc('year', CURRENT_DATE)::date AS v_start,
    CURRENT_DATE AS v_end
)
SELECT
  COALESCE(NULLIF(TRIM(m.category), ''), '(blank)') AS manifest_category,
  COALESCE(NULLIF(TRIM(m.subcategory), ''), '(blank)') AS manifest_subcategory,
  COUNT(*)::bigint AS items_sold,
  ROUND(AVG(i.sold_for::numeric), 2) AS avg_sold_for,
  ROUND(SUM(i.sold_for::numeric), 2) AS sum_sold_for
FROM public.inventory_item i
CROSS JOIN params pr
LEFT JOIN public.inventory_manifest_rows m ON m.id = i.manifest_row_id
WHERE i.sold_at IS NOT NULL
  AND i.sold_for IS NOT NULL
  AND i.sold_at::date >= pr.v_start
  AND i.sold_at::date <= pr.v_end
GROUP BY m.category, m.subcategory
ORDER BY items_sold DESC, manifest_category, manifest_subcategory;
