-- sale_line_po: completed register lines with no item, assigned to purchase orders (owner, 2026-09-29;
-- .ai/extended/backfill-plan.md). One row per line and PO, with the line's share (shares sum to 1 per line).
-- method:
--   express_code  "Express: WAL129206": rung against that order; the whole line goes to the PO with that number.
--   weekly_share  Unknown Item and other manual lines: split across the POs whose items sold that same week,
--                 in proportion to those sales.
--   bin_pink      cashier bins and pink tag: their own group, no PO (mostly Feb 2023 to Mar 2024, before any
--                 PO is in the system; the rest is retag stock, which has no PO).
--   before_pos    no PO sold anything that week (before March 2024): unassigned.
-- Register: SAL-07.
CREATE OR REPLACE TABLE sale_line_po AS
WITH lines AS (
    SELECT s.line_id, s.day, date_trunc('week', s.day)::DATE AS week, s.description, s.line_total,
           regexp_extract(s.description, 'Express:\s*([A-Za-z]+[0-9]+)', 1) AS code
    FROM sale_line s
    WHERE s.cart_status = 'completed' AND s.item_id IS NULL AND s.line_kind IN ('item', 'manual')
),
kind AS (
    SELECT l.*,
           CASE
               WHEN l.code <> '' AND p.purchase_order_id IS NOT NULL THEN 'express_code'
               WHEN l.description ILIKE '%bin%' OR l.description ILIKE '%pink%' THEN 'bin_pink'
               ELSE 'weekly'
           END AS k,
           p.purchase_order_id AS express_po
    FROM lines l
    LEFT JOIN po p ON upper(p.order_number) = upper(l.code) AND l.code <> ''
),
po_week AS (  -- each PO's share of the week's item sales
    SELECT date_trunc('week', s.day)::DATE AS week, i.purchase_order_id,
           sum(s.line_total) / sum(sum(s.line_total)) OVER (PARTITION BY date_trunc('week', s.day)::DATE) AS share
    FROM sale_line s JOIN item i USING (item_id)
    WHERE s.cart_status = 'completed' AND NOT s.backfill_duplicate AND i.purchase_order_id IS NOT NULL
      AND s.line_total > 0
    GROUP BY 1, 2
)
SELECT line_id, day, line_total, express_po AS purchase_order_id, 1.0 AS share, 'express_code' AS method
FROM kind WHERE k = 'express_code'
UNION ALL
SELECT line_id, day, line_total, NULL, 1.0, 'bin_pink' FROM kind WHERE k = 'bin_pink'
UNION ALL
SELECT k.line_id, k.day, k.line_total, w.purchase_order_id, w.share, 'weekly_share'
FROM kind k JOIN po_week w ON w.week = k.week
WHERE k.k = 'weekly'
UNION ALL
SELECT k.line_id, k.day, k.line_total, NULL, 1.0, 'before_pos'
FROM kind k
WHERE k.k = 'weekly' AND NOT EXISTS (SELECT 1 FROM po_week w WHERE w.week = k.week);
