-- floor_interval: when each item was on the sales floor, [start_at, end_at).
-- One interval per item: the first time on the floor to the first end after it (an item returned and
-- re-shelved keeps its first interval; rare).
-- Start, best first: the ItemHistory move to on_shelf, V3 listed_at, V3 checked_in_at, then for an item
--   that sold: its order's first sale + 5 days, never after its own sale (the owner's rule, 2026-09-29;
--   on V3, where the real date is known, items went out a median 4 days after their order's first sale),
--   then V3 created_at (a stand-in, earlier than the floor), or the 2026-04-12 import date for BACKFILL
--   items still on the shelf. V1/V2 items get their start from the order rule (ITM-02) but stay out of
--   floor_daily: what happened to their unsold siblings is unknown (ITM-06), so an old floor would be short.
-- End, best first: the completed sale, sold_at, the first lost/scrapped move in ItemHistory (SHR-04).
-- Register: ITM-02/03, ITM-06 (backfill scrapped are unsold imports, not shrink), SAL-04 (sold, no date:
-- `in_daily` false), SHR-01 (stale: flagged in floor_daily).
CREATE OR REPLACE TABLE floor_interval AS
WITH shelf AS (
    SELECT item_id, min(created_at) AS event_at FROM pg.inventory_itemhistory
    WHERE event_type = 'status_change' AND new_value = 'on_shelf' GROUP BY 1
),
sold AS (
    SELECT item_id, min(event_at) AS event_at FROM item_event WHERE kind = 'sold' GROUP BY 1
),
order_first_sale AS (
    SELECT purchase_order_id, min(sold_at) AS first_sale
    FROM item WHERE status = 'sold' AND sold_at IS NOT NULL AND purchase_order_id IS NOT NULL
    GROUP BY 1
),
gone AS (
    SELECT item_id, min(created_at) AS event_at,
           arg_min(CASE WHEN event_type IN ('lost', 'scrapped') THEN event_type ELSE new_value END, created_at) AS why
    FROM pg.inventory_itemhistory
    WHERE event_type = 'lost' OR (event_type = 'status_change' AND new_value IN ('lost', 'scrapped'))
    GROUP BY 1
),
base AS (
    SELECT
        i.item_id, i.product_id, i.era, i.status, i.category, i.price, i.retail, i.cost,
        CASE
            WHEN s.event_at IS NOT NULL THEN s.event_at
            WHEN i.listed_at IS NOT NULL THEN i.listed_at
            WHEN i.era IN ('v3', 'v3_retag') AND i.checked_in_at IS NOT NULL THEN i.checked_in_at
            WHEN i.status = 'sold' AND i.sold_at IS NOT NULL AND o.first_sale IS NOT NULL
                THEN least(o.first_sale + INTERVAL 5 DAY, coalesce(sd.event_at, i.sold_at))  -- never after the sale used as the end
            WHEN i.era IN ('v3', 'v3_retag') AND i.status IN ('on_shelf', 'sold', 'lost') THEN i.created_at
            WHEN i.era IN ('v1', 'v2') AND i.status = 'on_shelf' THEN TIMESTAMPTZ '2026-04-12 00:00:00-05'
        END AS start_at,
        CASE
            WHEN s.event_at IS NOT NULL THEN 'on_shelf_event'
            WHEN i.listed_at IS NOT NULL THEN 'listed_at'
            WHEN i.era IN ('v3', 'v3_retag') AND i.checked_in_at IS NOT NULL THEN 'checked_in_at'
            WHEN i.status = 'sold' AND i.sold_at IS NOT NULL AND o.first_sale IS NOT NULL THEN 'order_first_sale'
            WHEN i.era IN ('v3', 'v3_retag') AND i.status IN ('on_shelf', 'sold', 'lost') THEN 'created_at'
            WHEN i.era IN ('v1', 'v2') AND i.status = 'on_shelf' THEN 'import_date'
        END AS start_source,
        coalesce(sd.event_at, i.sold_at, g.event_at) AS end_at,
        CASE
            WHEN sd.event_at IS NOT NULL THEN 'sold'
            WHEN i.sold_at IS NOT NULL THEN 'sold_at'
            WHEN g.event_at IS NOT NULL THEN coalesce(g.why, 'lost')
            WHEN i.status = 'on_shelf' THEN NULL
            WHEN i.status = 'sold' THEN 'sold_no_date'
            ELSE 'ended_no_date'
        END AS end_reason
    FROM item i
    LEFT JOIN shelf s ON s.item_id = i.item_id
    LEFT JOIN sold sd ON sd.item_id = i.item_id
    LEFT JOIN gone g ON g.item_id = i.item_id
    LEFT JOIN order_first_sale o ON o.purchase_order_id = i.purchase_order_id
    WHERE NOT i.backfill_unsold
)
SELECT
    *,
    start_source IN ('on_shelf_event', 'listed_at') AS start_known,
    start_at IS NOT NULL
        AND coalesce(end_reason, '') NOT IN ('sold_no_date', 'ended_no_date')
        AND (end_at IS NULL OR end_at >= start_at)
        AND NOT (era IN ('v1', 'v2') AND start_source = 'order_first_sale') AS in_daily
FROM base
WHERE start_at IS NOT NULL;

-- floor_daily: the floor on each store day since V3 (2026-04-01) to the last sale in the pull.
-- Counted at the end of the day: started on or before the day and not ended by then.
-- tag_value is the tag on that day (item_price, ITM-14), summed from +price / -price steps on the days
-- an item arrives, is retagged or leaves (a range join over every day was too slow); tag_value_today
-- uses today's tag. Register: SHR-01 (stale = on the floor over 90 days; never counted), SHR-02.
CREATE OR REPLACE TABLE floor_daily AS
WITH days AS (
    SELECT unnest(generate_series(DATE '2026-04-01', (SELECT max(day) FROM sale_line WHERE cart_status = 'completed'), INTERVAL 1 DAY))::DATE AS day
),
f AS (
    SELECT item_id, start_at::DATE AS start_day, end_at::DATE AS end_day, price, retail, category, start_known
    FROM floor_interval WHERE in_daily
),
counts AS (
    SELECT
        d.day,
        count(f.item_id) AS items,
        sum(f.price) AS tag_value_today,
        sum(f.retail) AS retail_value,
        count(f.item_id) FILTER (WHERE d.day - f.start_day > 90) AS stale_items,
        count(f.item_id) FILTER (WHERE f.start_known) AS start_known_items,
        count(f.item_id) FILTER (WHERE f.category IS NULL OR f.category LIKE 'Mixed lots%') AS mixed_items,
        count(f.item_id) FILTER (WHERE f.start_day = d.day) AS added
    FROM days d
    LEFT JOIN f ON f.start_day <= d.day AND (f.end_day IS NULL OR f.end_day > d.day)
    GROUP BY d.day
),
segments AS (  -- the part of each floor interval under each price: [seg_from, seg_to)
    SELECT
        greatest(f.start_day, coalesce(p.valid_from::DATE, f.start_day)) AS seg_from,
        least(coalesce(f.end_day, DATE '9999-12-31'), coalesce(p.valid_to::DATE, DATE '9999-12-31')) AS seg_to,
        p.price
    FROM f JOIN item_price p ON p.item_id = f.item_id
),
steps AS (
    SELECT seg_from AS day, sum(price) AS delta FROM segments WHERE seg_from < seg_to GROUP BY 1
    UNION ALL
    SELECT seg_to, -sum(price) FROM segments WHERE seg_from < seg_to AND seg_to < DATE '9999-12-31' GROUP BY 1
),
value AS (
    SELECT d.day, (SELECT sum(delta) FROM steps s WHERE s.day <= d.day) AS tag_value FROM days d
)
SELECT c.day, c.items, v.tag_value, c.tag_value_today, c.retail_value, c.stale_items, c.start_known_items,
       c.mixed_items, c.added
FROM counts c JOIN value v USING (day)
ORDER BY c.day;
