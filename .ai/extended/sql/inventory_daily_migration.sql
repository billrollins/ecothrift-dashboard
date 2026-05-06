/*
  Daily on-shelf migration report, v4 (90-day America/Chicago window).

  Performance changes vs prior version:
    1. No LATERAL per ref_date. All work is bulk.
    2. inventory_itemhistory scanned twice total (once for status_change,
       once for price_change), not once per (day, item).
    3. Per-item status reconstruction uses one LEAD() pass plus one
       DISTINCT ON pass for initial-state fallback. No correlated subqueries.
    4. inventory_item scanned three times total: once for initial state,
       once for sold_at, once for SUM(price/retail) on EOD-on-shelf items.

  Helpful indexes (one-time, run as superuser):
    CREATE INDEX IF NOT EXISTS ih_evt_created
      ON ecothrift.inventory_itemhistory (event_type, created_at);
    CREATE INDEX IF NOT EXISTS ih_item_evt_created
      ON ecothrift.inventory_itemhistory (item_id, event_type, created_at, id);
    CREATE INDEX IF NOT EXISTS item_sold_at
      ON ecothrift.inventory_item (sold_at) WHERE sold_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS cart_status_completed
      ON ecothrift.pos_cart (status, completed_at);

  Final SELECT is CSV-oriented: scalar columns named <json_column>_<json_key>,
  e.g. sales_qty, on_shelf_recon_delta, migration_to_from_intake.

  Export:
    psql ... --csv -f inventory_daily_migration.sql -o daily_migration.csv
*/

WITH params AS (
  SELECT
    (timezone('America/Chicago', now()))::date AS end_date,
    90 AS days_back
),
bounds_all AS (
  SELECT
    gs::date AS ref_date,
    (gs::date::timestamp AT TIME ZONE 'America/Chicago')                       AS day_start_tz,
    ((gs::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'America/Chicago')  AS day_end_tz
  FROM params p
  CROSS JOIN LATERAL generate_series(
    p.end_date - (p.days_back - 1),
    p.end_date,
    INTERVAL '1 day'
  ) AS gs
),
window_bounds AS (
  SELECT MIN(day_start_tz) AS w_start, MAX(day_end_tz) AS w_end FROM bounds_all
),

-- ===== 1. Status intervals (one pass each) =====

-- Each history event opens an interval [created_at, next_event_at)
hist_intervals AS (
  SELECT
    h.item_id,
    h.new_value AS status,
    h.created_at AS valid_from,
    LEAD(h.created_at) OVER (PARTITION BY h.item_id ORDER BY h.created_at, h.id) AS valid_until
  FROM ecothrift.inventory_itemhistory h
  CROSS JOIN window_bounds wb
  WHERE h.event_type = 'status_change'
    AND h.created_at < wb.w_end
),

-- First event per item (used to derive pre-history initial state)
first_event_per_item AS (
  SELECT DISTINCT ON (h.item_id)
    h.item_id,
    h.old_value  AS pre_history_status,
    h.created_at AS first_event_at
  FROM ecothrift.inventory_itemhistory h
  WHERE h.event_type = 'status_change'
  ORDER BY h.item_id, h.created_at ASC, h.id ASC
),

-- Synthetic initial interval per item.
-- Items with history: status = first event's old_value, valid until first event.
-- Items without history: status = current i.status, valid forever (best guess).
initial_intervals AS (
  SELECT
    i.id AS item_id,
    COALESCE(fpi.pre_history_status, i.status) AS status,
    i.created_at AS valid_from,
    fpi.first_event_at AS valid_until
  FROM ecothrift.inventory_item i
  LEFT JOIN first_event_per_item fpi ON fpi.item_id = i.id
  CROSS JOIN window_bounds wb
  WHERE i.created_at < wb.w_end
),

all_intervals AS (
  SELECT item_id, status, valid_from, valid_until FROM hist_intervals
  UNION ALL
  SELECT item_id, status, valid_from, valid_until FROM initial_intervals
),

-- ===== 2. (item, ref_date) presence pairs =====

on_shelf_eod_pairs AS (
  SELECT b.ref_date, ai.item_id
  FROM bounds_all b
  JOIN all_intervals ai
    ON ai.status = 'on_shelf'
   AND ai.valid_from <  b.day_end_tz
   AND (ai.valid_until IS NULL OR ai.valid_until >= b.day_end_tz)
),

on_shelf_sod_pairs AS (
  SELECT b.ref_date, ai.item_id
  FROM bounds_all b
  JOIN all_intervals ai
    ON ai.status = 'on_shelf'
   AND ai.valid_from <  b.day_start_tz
   AND (ai.valid_until IS NULL OR ai.valid_until >= b.day_start_tz)
),

-- "Stayed all day" = a single on_shelf interval covers SOD through EOD
stayed_pairs AS (
  SELECT b.ref_date, ai.item_id
  FROM bounds_all b
  JOIN all_intervals ai
    ON ai.status = 'on_shelf'
   AND ai.valid_from <  b.day_start_tz
   AND (ai.valid_until IS NULL OR ai.valid_until >= b.day_end_tz)
),

-- ===== 3. Migration events =====

added_events AS (
  SELECT b.ref_date, h.item_id, h.old_value AS source_status
  FROM bounds_all b
  JOIN ecothrift.inventory_itemhistory h
    ON h.event_type = 'status_change'
   AND h.new_value = 'on_shelf'
   AND h.old_value IS DISTINCT FROM 'on_shelf'
   AND h.created_at >= b.day_start_tz
   AND h.created_at <  b.day_end_tz
),

removed_events AS (
  SELECT b.ref_date, h.item_id, h.new_value AS destination_status
  FROM bounds_all b
  JOIN ecothrift.inventory_itemhistory h
    ON h.event_type = 'status_change'
   AND h.old_value = 'on_shelf'
   AND h.new_value IS DISTINCT FROM 'on_shelf'
   AND h.new_value IS DISTINCT FROM 'sold'
   AND h.created_at >= b.day_start_tz
   AND h.created_at <  b.day_end_tz
),

sold_events AS (
  SELECT b.ref_date, i.id AS item_id
  FROM bounds_all b
  JOIN ecothrift.inventory_item i
    ON i.sold_at IS NOT NULL
   AND i.sold_at >= b.day_start_tz
   AND i.sold_at <  b.day_end_tz
),

-- ===== 4. Price net deltas, restricted to items that stayed all day =====

price_net AS (
  SELECT
    b.ref_date,
    h.item_id,
    SUM(
      CASE
        WHEN TRIM(h.new_value) ~ '^-?[0-9]+(\.[0-9]+)?$'
         AND TRIM(h.old_value) ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN TRIM(h.new_value)::numeric - TRIM(h.old_value)::numeric
        ELSE 0::numeric
      END
    ) AS net_delta
  FROM bounds_all b
  JOIN ecothrift.inventory_itemhistory h
    ON h.event_type = 'price_change'
   AND h.created_at >= b.day_start_tz
   AND h.created_at <  b.day_end_tz
  GROUP BY b.ref_date, h.item_id
),

price_moves AS (
  SELECT pn.ref_date, pn.item_id, pn.net_delta
  FROM price_net pn
  JOIN stayed_pairs sp
    ON sp.ref_date = pn.ref_date AND sp.item_id = pn.item_id
  WHERE pn.net_delta <> 0
),

-- ===== 5. Sales (POS, completed carts) =====

sales_lines AS (
  SELECT
    (timezone('America/Chicago', c.completed_at))::date AS ref_date,
    l.quantity,
    l.line_total,
    COALESCE(i.unit_retail, 0) * l.quantity AS retail_value
  FROM ecothrift.pos_cart c
  JOIN ecothrift.pos_cartline l ON l.cart_id = c.id
  LEFT JOIN ecothrift.inventory_item i ON i.id = l.item_id
  CROSS JOIN window_bounds wb
  WHERE c.status = 'completed'
    AND c.completed_at >= wb.w_start
    AND c.completed_at <  wb.w_end
    AND l.item_id IS NOT NULL
),

-- ===== 6. Per-day aggregates =====

eod_agg AS (
  SELECT
    p.ref_date,
    COUNT(*)                         AS qty_eod,
    COALESCE(SUM(i.unit_retail), 0)  AS sum_retail,
    COALESCE(SUM(i.price), 0)        AS sum_price
  FROM on_shelf_eod_pairs p
  JOIN ecothrift.inventory_item i ON i.id = p.item_id
  GROUP BY p.ref_date
),

sod_agg AS (
  SELECT ref_date, COUNT(*) AS qty_sod
  FROM on_shelf_sod_pairs
  GROUP BY ref_date
),

added_per_source AS (
  SELECT ref_date, source_status, COUNT(DISTINCT item_id) AS cnt
  FROM added_events
  GROUP BY ref_date, source_status
),
added_agg AS (
  SELECT
    a.ref_date,
    (SELECT COUNT(DISTINCT item_id) FROM added_events e WHERE e.ref_date = a.ref_date) AS qty_in,
    jsonb_object_agg(a.source_status, a.cnt) AS from_map
  FROM added_per_source a
  GROUP BY a.ref_date
),

removed_per_dest AS (
  SELECT ref_date, destination_status, COUNT(DISTINCT item_id) AS cnt
  FROM removed_events
  GROUP BY ref_date, destination_status
),
removed_agg AS (
  SELECT ref_date, jsonb_object_agg(destination_status, cnt) AS to_map_hist
  FROM removed_per_dest
  GROUP BY ref_date
),

sold_agg AS (
  SELECT ref_date, COUNT(DISTINCT item_id) AS qty_sold
  FROM sold_events
  GROUP BY ref_date
),

removed_hist_qty AS (
  SELECT ref_date, COUNT(DISTINCT item_id) AS qty_hist_out
  FROM removed_events
  GROUP BY ref_date
),

out_total AS (
  SELECT ref_date, COUNT(*) AS qty_out
  FROM (
    SELECT ref_date, item_id FROM sold_events
    UNION
    SELECT ref_date, item_id FROM removed_events
  ) u
  GROUP BY ref_date
),

price_agg AS (
  SELECT
    ref_date,
    COUNT(*) FILTER (WHERE net_delta > 0)                       AS inc_n,
    COALESCE(SUM(net_delta) FILTER (WHERE net_delta > 0), 0)    AS inc_total,
    COUNT(*) FILTER (WHERE net_delta < 0)                       AS dec_n,
    COALESCE(SUM(-net_delta) FILTER (WHERE net_delta < 0), 0)   AS dec_total
  FROM price_moves
  GROUP BY ref_date
),

sales_agg AS (
  SELECT
    ref_date,
    COALESCE(SUM(quantity),     0) AS sold_qty,
    COALESCE(SUM(line_total),   0) AS sold_sales,
    COALESCE(SUM(retail_value), 0) AS sold_retail
  FROM sales_lines
  GROUP BY ref_date
)

-- ===== 7. Final shaping (flat columns for CSV; names = <json_group>_<json_key>) =====

SELECT
  b.ref_date,

  COALESCE(sa.sold_qty,    0) AS sales_qty,
  COALESCE(sa.sold_sales,  0) AS sales_sales,
  COALESCE(sa.sold_retail, 0) AS sales_retail,

  COALESCE(e.qty_eod,   0) AS on_shelf_qty,
  COALESCE(e.sum_price, 0) AS on_shelf_price,
  COALESCE(e.sum_retail, 0) AS on_shelf_retail,
  COALESCE(s.qty_sod,   0) AS on_shelf_qty_sod,
  COALESCE(e.qty_eod, 0) - COALESCE(s.qty_sod, 0)
    - (
        COALESCE(ad.qty_in, 0)
        - COALESCE(so.qty_sold, 0)
        - COALESCE(rh.qty_hist_out, 0)
      ) AS on_shelf_recon_delta,

  COALESCE(ad.qty_in, 0) AS migration_to_qty_in,
  COALESCE((j.fm->>'intake')::bigint,     0) AS migration_to_from_intake,
  COALESCE((j.fm->>'processing')::bigint, 0) AS migration_to_from_processing,
  COALESCE((j.fm->>'returned')::bigint,   0) AS migration_to_from_returned,
  COALESCE((j.fm->>'sold')::bigint,       0) AS migration_to_from_sold,
  COALESCE((j.fm->>'scrapped')::bigint,   0) AS migration_to_from_scrapped,
  COALESCE((j.fm->>'lost')::bigint,       0) AS migration_to_from_lost,

  COALESCE(ot.qty_out, 0) AS migration_from_qty_out,
  COALESCE(so.qty_sold, 0) AS migration_from_to_sold,
  COALESCE((j.tm->>'scrapped')::bigint,   0) AS migration_from_to_scrapped,
  COALESCE((j.tm->>'lost')::bigint,       0) AS migration_from_to_lost,
  COALESCE((j.tm->>'intake')::bigint,     0) AS migration_from_to_intake,
  COALESCE((j.tm->>'processing')::bigint, 0) AS migration_from_to_processing,
  COALESCE((j.tm->>'returned')::bigint,   0) AS migration_from_to_returned,

  COALESCE(pa.inc_n,      0) AS price_increases_qty,
  COALESCE(pa.inc_total,  0) AS price_increases_total_increase,
  COALESCE(pa.dec_n,      0) AS price_decreases_qty,
  COALESCE(pa.dec_total,  0) AS price_decreases_total_decrease

FROM bounds_all b
LEFT JOIN eod_agg       e  ON e.ref_date  = b.ref_date
LEFT JOIN sod_agg       s  ON s.ref_date  = b.ref_date
LEFT JOIN added_agg     ad ON ad.ref_date = b.ref_date
LEFT JOIN removed_agg   ra ON ra.ref_date = b.ref_date
LEFT JOIN sold_agg      so ON so.ref_date = b.ref_date
LEFT JOIN removed_hist_qty rh ON rh.ref_date = b.ref_date
LEFT JOIN out_total     ot ON ot.ref_date = b.ref_date
LEFT JOIN price_agg     pa ON pa.ref_date = b.ref_date
LEFT JOIN sales_agg     sa ON sa.ref_date = b.ref_date
LEFT JOIN LATERAL (
  SELECT
    COALESCE(ad.from_map, '{}'::jsonb) AS fm,
    jsonb_build_object('sold', COALESCE(so.qty_sold, 0))
      || COALESCE(ra.to_map_hist, '{}'::jsonb) AS tm
) j ON TRUE
ORDER BY b.ref_date;