-- Inventory summary by category and status (all items).
-- Read-only SELECT. Run in psql, pgAdmin, or DBeaver.
--
-- Retail is derived per item: latest RetagLog.retail_amt by SKU, else ManifestRow.retail_value.
-- When Item.retail_price exists in the future, prefer that column in this query instead.
--
-- Django uses schema "ecothrift" (see settings DATABASES OPTIONS search_path).

SET search_path TO ecothrift;

WITH item_retail AS (
  SELECT
    COALESCE(NULLIF(TRIM(i.category), ''), '(uncategorized)') AS category,
    i.status,
    i.price::numeric AS price,
    COALESCE(
      (
        SELECT r.retail_amt
        FROM inventory_retaglog r
        WHERE r.new_item_sku = i.sku
        ORDER BY r.retagged_at DESC
        LIMIT 1
      ),
      (
        SELECT m.retail_value
        FROM inventory_manifestrow m
        WHERE m.id = i.manifest_row_id
      )
    )::numeric AS retail_price
  FROM inventory_item i
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
