-- Inventory summary by category and status (all items).
-- Read-only SELECT. All tables schema-qualified (no SET search_path).
--
-- Retail is derived per item: latest RetagLog.retail_amt by SKU, else ManifestRow.retail_value.

WITH item_retail AS (
  SELECT
    COALESCE(NULLIF(TRIM(i.category), ''), '(uncategorized)') AS category,
    i.status,
    i.price::numeric AS price,
    COALESCE(
      (
        SELECT r.retail_amt
        FROM ecothrift.inventory_retaglog r
        WHERE r.new_item_sku = i.sku
        ORDER BY r.retagged_at DESC
        LIMIT 1
      ),
      (
        SELECT m.retail_value
        FROM ecothrift.inventory_manifestrow m
        WHERE m.id = i.manifest_row_id
      )
    )::numeric AS retail_price
  FROM ecothrift.inventory_item i
)
SELECT
  CASE WHEN GROUPING(category) = 1 THEN '(TOTAL)' ELSE category END AS category,
  CASE
    WHEN GROUPING(category) = 1 AND GROUPING(status) = 1 THEN '(grand total)'
    WHEN GROUPING(status) = 1 THEN '(all statuses)'
    ELSE status
  END AS status_label,
  COUNT(*)::bigint AS item_count,
  ROUND(AVG(retail_price)::numeric, 2) AS avg_retail,
  ROUND(AVG(price)::numeric, 2) AS avg_price,
  MIN(price) AS min_price,
  MAX(price) AS max_price,
  ROUND(
    PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY price)::numeric,
    2
  ) AS p05_price,
  ROUND(
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY price)::numeric,
    2
  ) AS p95_price
FROM item_retail
GROUP BY GROUPING SETS ((category, status), (category), ())
ORDER BY
  CASE WHEN GROUPING(category) = 1 THEN 2 ELSE 0 END,
  category,
  CASE WHEN GROUPING(status) = 1 AND GROUPING(category) = 0 THEN 1 ELSE 0 END,
  status;
