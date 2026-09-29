-- sell_curve_daily: the share of items sold by each day on the floor, per category (Kaplan-Meier, so items
-- still on the floor count while they are there instead of being dropped or counted as unsold).
-- Only intervals with a known start (on_shelf move or listed_at, ITM-02/03) that began since
-- 2026-04-12 (V3 stock, not the retag carry-over). Ends other than a sale (lost, scrapped) are censored.
-- Register: ITM-01 (Mixed lots is its own category), ITM-12 (new categories have little history).
CREATE OR REPLACE TABLE sell_curve_daily AS
WITH base AS (
    SELECT
        coalesce(category, 'Mixed lots & uncategorized') AS category,
        least(date_diff('day', start_at::DATE, coalesce(end_at::DATE, (SELECT max(day) FROM floor_daily))), 365) AS age,
        end_reason IN ('sold', 'sold_at') AS sold
    FROM floor_interval
    WHERE in_daily AND start_known AND start_at >= TIMESTAMPTZ '2026-04-12 00:00:00-05'
      AND start_at::DATE <= (SELECT max(day) FROM floor_daily)
),
cats AS (
    SELECT category, count(*) AS n FROM base GROUP BY 1
    UNION ALL SELECT '(all)', count(*) FROM base
),
events AS (  -- per category and age: how many sold that day, and how many left the risk set
    SELECT category, age, count(*) FILTER (WHERE sold) AS sold, count(*) AS out FROM base GROUP BY 1, 2
    UNION ALL
    SELECT '(all)', age, count(*) FILTER (WHERE sold), count(*) FROM base GROUP BY 2
),
risk AS (
    SELECT e.category, e.age, e.sold, e.out,
           c.n - coalesce(sum(e.out) OVER (PARTITION BY e.category ORDER BY e.age ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS at_risk
    FROM events e JOIN cats c USING (category)
),
km AS (
    SELECT category, age, at_risk,
           1 - exp(sum(ln(greatest(1 - sold / at_risk, 1e-12))) OVER (PARTITION BY category ORDER BY age)) AS share_sold
    FROM risk
)
SELECT category, age, at_risk, share_sold FROM km;

-- sell_curve: sell_curve_daily at the marks that matter (day 43 = Black Friday and 77 = Dec 31 for stock
-- put out Oct 15).
CREATE OR REPLACE TABLE sell_curve AS
WITH km AS (SELECT * FROM sell_curve_daily),
cats AS (SELECT category, max(at_risk) AS n FROM sell_curve_daily GROUP BY 1),
marks AS (SELECT unnest([7, 14, 30, 43, 60, 77, 90]) AS day_mark)
SELECT
    k.category,
    m.day_mark,
    round(max(k.share_sold) FILTER (WHERE k.age <= m.day_mark), 3) AS share_sold,
    min(k.at_risk) FILTER (WHERE k.age <= m.day_mark) AS still_counted,
    any_value(c.n) AS items
FROM marks m
CROSS JOIN cats c
JOIN km k ON k.category = c.category
GROUP BY k.category, m.day_mark
ORDER BY k.category, m.day_mark;

-- category_supply: each category's floor and sales by week, with weeks of cover
-- (items on the floor at the week's end / items sold per week over the last 4 weeks).
CREATE OR REPLACE TABLE category_supply AS
WITH weeks AS (
    SELECT DISTINCT date_trunc('week', day)::DATE AS week FROM floor_daily
),
week_end AS (
    SELECT w.week, least(w.week + 6, (SELECT max(day) FROM floor_daily)) AS last_day FROM weeks w
),
on_floor AS (
    SELECT w.week, coalesce(f.category, 'Mixed lots & uncategorized') AS category, count(*) AS items, sum(f.price) AS tag_value
    FROM week_end w
    JOIN floor_interval f ON f.in_daily AND f.start_at::DATE <= w.last_day
        AND (f.end_at IS NULL OR f.end_at::DATE > w.last_day)
    GROUP BY 1, 2
),
sold AS (
    SELECT date_trunc('week', s.day)::DATE AS week, coalesce(s.category, '(no item)') AS category,
           sum(s.quantity) AS units, sum(s.line_total) AS revenue
    FROM sale_line s
    WHERE s.cart_status = 'completed' AND NOT s.backfill_duplicate AND s.line_kind IN ('item', 'manual')
      AND s.day >= DATE '2026-04-01'
    GROUP BY 1, 2
)
SELECT
    coalesce(o.week, s.week) AS week,
    coalesce(o.category, s.category) AS category,
    coalesce(o.items, 0) AS items_on_floor,
    o.tag_value,
    coalesce(s.units, 0) AS units_sold,
    coalesce(s.revenue, 0) AS revenue,
    round(coalesce(o.items, 0) / nullif(avg(coalesce(s.units, 0)) OVER (
        PARTITION BY coalesce(o.category, s.category) ORDER BY coalesce(o.week, s.week)
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW), 0), 1) AS weeks_of_cover
FROM on_floor o
FULL JOIN sold s ON s.week = o.week AND s.category = o.category
ORDER BY 1, 2;

-- floor_now: every item on the floor at the pull, with its age and the chance it sells in the next 30
-- days, from its category's curve: (F(age + 30) - F(age)) / (1 - F(age)). Ages past the curve's end use
-- its last point, so a very old item gets ~0. Register: SHR-01 (never counted: old items may be gone),
-- SAL-07 (items sold without a scan stay "on the shelf" in the data).
CREATE OR REPLACE TABLE floor_now AS
WITH f AS (
    SELECT f.item_id, coalesce(f.category, 'Mixed lots & uncategorized') AS category, f.price, f.retail,
           f.start_source, f.start_known,
           date_diff('day', f.start_at::DATE, (SELECT max(day) FROM floor_daily)) AS age
    FROM floor_interval f
    WHERE f.in_daily AND f.end_at IS NULL AND f.start_at::DATE <= (SELECT max(day) FROM floor_daily)
),
curve AS (
    SELECT c.category, c.age, c.share_sold FROM sell_curve_daily c
),
pt AS (
    SELECT f.item_id,
           (SELECT max(share_sold) FROM curve c WHERE c.category = f.category AND c.age <= f.age) AS f_now,
           (SELECT max(share_sold) FROM curve c WHERE c.category = f.category AND c.age <= f.age + 30) AS f_next
    FROM f
)
SELECT f.*,
       CASE WHEN f.age <= 30 THEN '0-30' WHEN f.age <= 60 THEN '31-60' WHEN f.age <= 90 THEN '61-90'
            WHEN f.age <= 180 THEN '91-180' ELSE '180+' END AS age_band,
       round(greatest(coalesce(a.f_next, 0) - coalesce(a.f_now, 0), 0) / nullif(1 - coalesce(a.f_now, 0), 0), 3) AS sell_next_30
FROM f JOIN pt a USING (item_id);
