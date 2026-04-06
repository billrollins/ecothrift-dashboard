-- Sold items summary by category since 2026-01-01.
-- Read-only SELECT. Run in psql, pgAdmin, or DBeaver.
--
-- Retail is derived per item: latest RetagLog.retail_amt by SKU, else ManifestRow.retail_value.
-- sold_for / price come from inventory_item (actual sale and tagged shelf price at time of sale
-- is not versioned; price is current column value on the sold row).
--
-- Django uses schema "ecothrift" (see settings DATABASES OPTIONS search_path).

SET search_path TO ecothrift;

WITH item_retail AS (
  SELECT
    COALESCE(NULLIF(TRIM(i.category), ''), '(uncategorized)') AS category,
    i.price::numeric AS price,
    i.sold_for::numeric AS sold_for,
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
  WHERE i.status = 'sold'
    AND i.sold_at IS NOT NULL
    AND i.sold_for IS NOT NULL
    -- Calendar day in America/Chicago (store local); adjust if session TZ differs.
    AND (i.sold_at AT TIME ZONE 'America/Chicago')::date >= DATE '2026-01-01'
)
SELECT
  CASE WHEN GROUPING(category) = 1 THEN '(TOTAL)' ELSE category END AS category,
  COUNT(*)::bigint AS items_sold,
  ROUND(AVG(retail_price)::numeric, 2) AS avg_retail,
  ROUND(AVG(price)::numeric, 2) AS avg_price,
  ROUND(AVG(sold_for)::numeric, 2) AS avg_sold_for,
  MIN(sold_for) AS min_sold_for,
  MAX(sold_for) AS max_sold_for,
  ROUND(
    PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY sold_for)::numeric,
    2
  ) AS p05_sold_for,
  ROUND(
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY sold_for)::numeric,
    2
  ) AS p95_sold_for,
  ROUND(
    AVG(
      CASE
        WHEN retail_price IS NOT NULL AND retail_price > 0
        THEN (retail_price - sold_for) / retail_price * 100.0
      END
    )::numeric,
    2
  ) AS avg_discount_pct
FROM item_retail
GROUP BY GROUPING SETS ((category), ())
ORDER BY
  CASE WHEN GROUPING(category) = 1 THEN 1 ELSE 0 END,
  category;
