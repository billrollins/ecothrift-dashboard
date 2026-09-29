-- sale_line: every POS cart line on a completed or voided cart (voids kept: they are events too).
-- Days are store days (America/Chicago; the build sets the session time zone).
-- Register: SAL-07 (lines with no item), SAL-08 (a backfill item on several carts counts once),
-- SAL-09 (quantity > 1), SAL-13 (a return is a negative discount line), SAL-01 (every sale is POS).
CREATE OR REPLACE TABLE sale_line AS
WITH lines AS (
    SELECT
        l.id AS line_id,
        l.cart_id,
        k.status AS cart_status,
        k.completed_at,
        k.created_at AS cart_created_at,
        coalesce(k.completed_at, k.created_at)::DATE AS day,
        k.cashier_id,
        k.payment_method,
        l.item_id,
        l.line_kind,
        l.description,
        l.quantity,
        l.unit_price,
        l.line_total,
        l.sale_label,
        l.sale_percent,
        l.thrift_savings,
        i.era,
        i.category,
        i.price AS item_price_now,
        i.retail AS item_retail
    FROM pg.pos_cartline l
    JOIN pg.pos_cart k ON k.id = l.cart_id
    LEFT JOIN item i ON i.item_id = l.item_id
    WHERE k.status IN ('completed', 'voided')
)
SELECT
    *,
    -- SAL-08: the same BACKFILL item on several completed carts is an import artifact; the first counts.
    (cart_status = 'completed' AND item_id IS NOT NULL AND era IN ('v1', 'v2')
        AND row_number() OVER (PARTITION BY item_id, cart_status ORDER BY completed_at, line_id) > 1) AS backfill_duplicate,
    line_kind = 'discount' AND line_total < 0 AND item_id IS NULL AS return_or_discount
FROM lines;

-- misfit_sale: completed sales that can't be placed on a product, a manifest or a PO.
-- One row per line; `reason` is the first that applies. Register: SAL-07, ITM-04, VEN-01 (MIS vendor).
CREATE OR REPLACE TABLE misfit_sale AS
SELECT
    s.line_id,
    s.cart_id,
    s.day,
    s.item_id,
    s.description,
    s.quantity,
    s.line_total,
    CASE
        WHEN s.item_id IS NULL THEN 'no_item'
        WHEN i.misfit_po THEN 'misfit_po'
        WHEN i.no_po THEN 'no_po'
        WHEN i.manifest_row_id IS NULL AND i.era = 'v3' THEN 'no_manifest'
    END AS reason,
    i.era
FROM sale_line s
LEFT JOIN item i ON i.item_id = s.item_id
WHERE s.cart_status = 'completed'
  AND s.line_kind IN ('item', 'manual')
  AND NOT s.backfill_duplicate
  AND (s.item_id IS NULL OR i.misfit_po OR i.no_po OR (i.manifest_row_id IS NULL AND i.era = 'v3'));
