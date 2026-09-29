-- item_outcome: one row per item that went on the floor, for modelling (data_platform Phase 5).
-- Features are only what was known the day it went out (point in time): no later price, no later
-- category proposal, supply from the week before. Outcomes: sold, days to sell, sold_for, recovery.
-- An item still on the floor (or lost) is `censored`: days_on_floor is how long it has been out so far.
-- Rows: V3 stock with a known start (ITM-02/03), since 2026-04-12. Register: ITM-01 (Mixed lots is a
-- category), ITM-14 (tag at start: the price then), ITM-08 (retail 0 = null), SAL-11 (sold above retail kept).
CREATE OR REPLACE TABLE item_outcome AS
WITH f AS (
    SELECT * FROM floor_interval
    WHERE in_daily AND start_known AND start_at >= TIMESTAMPTZ '2026-04-12 00:00:00-05'
      AND start_at::DATE <= (SELECT max(day) FROM floor_daily)  -- shelved after the pull's last sale day
),
tag_at_start AS (
    SELECT f.item_id, any_value(p.price) AS tag
    FROM f JOIN item_price p ON p.item_id = f.item_id
        AND (p.valid_from IS NULL OR p.valid_from <= f.start_at)
        AND (p.valid_to IS NULL OR p.valid_to > f.start_at)
    GROUP BY 1
),
retags AS (
    SELECT item_id, count(*) AS n FROM item_price WHERE price_source = 'retag' GROUP BY 1
),
same_product AS (  -- copies of the same product on the floor the moment this one went out (itself included)
    SELECT f.item_id, count(*) AS n
    FROM f
    JOIN floor_interval o ON o.product_id = f.product_id AND o.in_daily
        AND o.start_at <= f.start_at AND (o.end_at IS NULL OR o.end_at > f.start_at)
    GROUP BY 1
),
supply AS (  -- the category's floor and pace in the full week before the item went out
    SELECT week, category, items_on_floor, units_sold, weeks_of_cover FROM category_supply
)
SELECT
    f.item_id,
    f.start_at,
    f.start_at::DATE AS start_day,
    dayofweek(f.start_at::DATE) AS start_dow,
    month(f.start_at::DATE) AS start_month,
    coalesce(i.category, 'Mixed lots & uncategorized') AS category,
    i.brand,
    i.condition,
    i.vendor_code,
    i.source,
    i.purchase_order_id,
    i.product_id,
    i.retail,
    coalesce(t.tag, i.price) AS tag,
    t.tag IS NULL AS tag_filled_today,
    round(coalesce(t.tag, i.price) / i.retail, 3) AS tag_to_retail,
    i.cost,
    s.items_on_floor AS category_floor_prior_week,
    s.units_sold AS category_sold_prior_week,
    s.weeks_of_cover AS category_cover_prior_week,
    coalesce(sp.n, 1) AS same_product_on_floor,
    -- outcomes
    coalesce(f.end_reason IN ('sold', 'sold_at'), false) AS sold,
    NOT coalesce(f.end_reason IN ('sold', 'sold_at'), false) AS censored,
    date_diff('day', f.start_at::DATE, coalesce(f.end_at::DATE, (SELECT max(day) FROM floor_daily))) AS days_on_floor,
    CASE WHEN f.end_reason IN ('sold', 'sold_at') THEN i.sold_for END AS sold_for,
    CASE WHEN f.end_reason IN ('sold', 'sold_at') THEN round(i.sold_for / i.retail, 3) END AS recovery,
    coalesce(r.n, 0) AS retags_before_end
FROM f
JOIN item i ON i.item_id = f.item_id
LEFT JOIN tag_at_start t ON t.item_id = f.item_id
LEFT JOIN retags r ON r.item_id = f.item_id
LEFT JOIN same_product sp ON sp.item_id = f.item_id
LEFT JOIN supply s ON s.category = coalesce(i.category, 'Mixed lots & uncategorized')
    AND s.week = date_trunc('week', f.start_at::DATE)::DATE - 7;
