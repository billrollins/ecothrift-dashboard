-- po_economics: one row per purchase order: what it cost, what it brought in, and where the rest went.
-- Owner rules (2026-09-29, .ai/extended/backfill-plan.md):
--   * cost is spread over the items that SOLD, by sale price (item_cost below); unsold items carry no cost;
--   * revenue = its items' sales + the no-item register lines assigned to it (sale_line_po);
--   * shrink buckets: unfulfilled/disputed (before processing), never checked in (manifest units with no item,
--     V3 only), after processing (lost, scrapped), unknown (old imports' "no recorded sale", ITM-06), and
--     still out (on the floor now).
-- Flags: placeholder_vendor / cost_unknown (VEN-01, PO-09), still_selling (a sale in the pull's last 30 days).
CREATE OR REPLACE TABLE po_economics AS
WITH items AS (
    SELECT i.purchase_order_id,
           count(*) AS items,
           count(*) FILTER (WHERE i.status = 'sold') AS sold,
           sum(i.sold_for) FILTER (WHERE i.status = 'sold') AS item_revenue,
           sum(i.retail) AS item_retail,
           count(*) FILTER (WHERE i.status IN ('on_shelf', 'intake', 'processing')) AS still_out,
           count(*) FILTER (WHERE i.status IN ('lost', 'scrapped') AND NOT i.backfill_unsold) AS lost_or_scrapped,
           count(*) FILTER (WHERE i.backfill_unsold) AS unknown_fate,
           count(*) FILTER (WHERE i.dispute_type <> '' AND i.dispute_type IS NOT NULL) AS disputed,
           max(i.sold_at)::DATE AS last_sale,
           min(i.sold_at)::DATE AS first_sale,
           min(i.checked_in_at)::DATE AS first_check_in
    FROM item i WHERE i.purchase_order_id IS NOT NULL
    GROUP BY 1
),
assigned AS (
    SELECT purchase_order_id, sum(line_total * share) AS assigned_revenue, count(DISTINCT line_id) AS assigned_lines
    FROM sale_line_po WHERE purchase_order_id IS NOT NULL GROUP BY 1
),
manifest AS (
    SELECT mr.purchase_order_id, sum(mr.quantity) AS manifest_units,
           sum(greatest(mr.quantity - coalesce(got.n, 0), 0)) AS never_checked_in
    FROM pg.inventory_manifestrow mr
    LEFT JOIN (SELECT manifest_row_id, count(*) AS n FROM pg.inventory_item WHERE manifest_row_id IS NOT NULL GROUP BY 1) got
        ON got.manifest_row_id = mr.id
    GROUP BY 1
)
SELECT
    p.purchase_order_id, p.order_number, p.vendor_code, p.ordered_date, p.status,
    p.total_cost, p.retail_value AS po_retail, p.placeholder_vendor,
    (p.total_cost IS NULL OR p.total_cost = 0 OR p.placeholder_vendor) AS cost_unknown,
    coalesce(i.items, 0) AS items, coalesce(i.sold, 0) AS sold, coalesce(i.still_out, 0) AS still_out,
    coalesce(i.lost_or_scrapped, 0) AS lost_or_scrapped, coalesce(i.unknown_fate, 0) AS unknown_fate,
    coalesce(i.disputed, 0) AS disputed,
    m.manifest_units, m.never_checked_in,
    coalesce(i.item_revenue, 0) AS item_revenue,
    coalesce(a.assigned_revenue, 0) AS assigned_revenue, coalesce(a.assigned_lines, 0) AS assigned_lines,
    coalesce(i.item_revenue, 0) + coalesce(a.assigned_revenue, 0) AS revenue,
    round((coalesce(i.item_revenue, 0) + coalesce(a.assigned_revenue, 0)) / nullif(p.total_cost, 0), 2) AS revenue_to_cost,
    round((coalesce(i.item_revenue, 0) + coalesce(a.assigned_revenue, 0)) / nullif(coalesce(i.item_retail, p.retail_value), 0), 3) AS recovery,
    round(coalesce(i.sold, 0) / nullif(coalesce(i.items, 0), 0), 3) AS sell_through,
    i.first_sale, i.last_sale,
    i.last_sale >= (SELECT max(day) FROM floor_daily) - 30 AS still_selling,
    -- received (owner heuristic, 2026-09-29; PO-02, PO-05): receiving done, else the first check-in, else the
    -- first sale - 5 days; never before the order date
    greatest(coalesce(p.receiving_done_at::DATE, i.first_check_in, i.first_sale - 5), p.ordered_date) AS received_est,
    CASE WHEN p.receiving_done_at IS NOT NULL THEN 'receiving_done'
         WHEN i.first_check_in IS NOT NULL THEN 'first_check_in'
         WHEN i.first_sale IS NOT NULL THEN 'first_sale_minus_5' END AS received_source
FROM po p
LEFT JOIN items i USING (purchase_order_id)
LEFT JOIN assigned a USING (purchase_order_id)
LEFT JOIN manifest m USING (purchase_order_id);

-- item_cost: the truck's cost on each sold item, by its share of the truck's sales (owner rule). The assigned
-- register lines take their share too, so a truck's item_cost sums to its total_cost x item share of revenue.
CREATE OR REPLACE TABLE item_cost AS
SELECT i.item_id, i.purchase_order_id, i.sold_for,
       -- refunds rung as manual lines can make the assigned share negative; it never raises an item's share
       round(e.total_cost * i.sold_for / nullif(e.item_revenue + greatest(e.assigned_revenue, 0), 0), 2) AS allocated_cost,
       e.cost_unknown
FROM item i
JOIN po_economics e USING (purchase_order_id)
WHERE i.status = 'sold' AND i.sold_for > 0;
