-- item: one row per inventory item, current state, with its era and the fill-in flags.
-- Register: ERA-01 (era from notes), ITM-02/03 (timing only from V3 listed_at), ITM-06 (backfill scrapped
-- is not shrink), ITM-09 + VEN-01 + PO-09 (cost 0 or placeholder vendor = unknown), ITM-01 (Mixed lots),
-- ITM-13 (V1/V2 product category not trusted), ITM-04 (no PO).
CREATE OR REPLACE TABLE item AS
SELECT
    i.id AS item_id,
    i.sku,
    i.product_id,
    i.purchase_order_id,
    i.manifest_row_id,
    i.parent_item_id,
    CASE
        WHEN i.notes LIKE 'BACKFILL:v1%' THEN 'v1'
        WHEN i.notes LIKE 'BACKFILL:v2%' THEN 'v2'
        WHEN i.notes LIKE 'RETAGGED_FROM_DB2:%' THEN 'v3_retag'
        ELSE 'v3'
    END AS era,
    i.status,
    i.source,
    i.condition,
    i.location,
    p.title,
    p.brand,
    c.name AS category,
    c.name LIKE 'Mixed lots%' AS category_is_mixed,
    -- ITM-13: a V1/V2 product's category is near-random; treat it as unknown.
    (i.notes LIKE 'BACKFILL:v1%' OR i.notes LIKE 'BACKFILL:v2%') AS category_untrusted,
    v.code AS vendor_code,
    i.price,
    NULLIF(i.retail, 0) AS retail,
    CASE WHEN i.cost IS NULL OR i.cost = 0 OR v.code IN ('GEN', 'MIS') THEN NULL ELSE i.cost END AS cost,
    NOT (i.cost IS NULL OR i.cost = 0 OR v.code IN ('GEN', 'MIS')) AS cost_known,
    -- ITM-02: created_at is the load date on imports; listed_at / checked_in_at only on V3.
    CASE WHEN i.notes LIKE 'BACKFILL:%' THEN NULL ELSE i.listed_at END AS listed_at,
    CASE WHEN i.notes LIKE 'BACKFILL:%' THEN NULL ELSE i.checked_in_at END AS checked_in_at,
    i.sold_at,
    i.sold_for,
    i.created_at,
    i.purchase_order_id IS NULL AS no_po,
    v.code = 'MIS' AS misfit_po,
    (i.status = 'scrapped' AND i.notes LIKE 'BACKFILL:%') AS backfill_unsold,
    i.dispute_type,
    i.dispute_pct_loss
FROM pg.inventory_item i
LEFT JOIN pg.inventory_product p ON p.id = i.product_id
LEFT JOIN pg.inventory_category c ON c.id = p.category_id
LEFT JOIN pg.inventory_purchaseorder po ON po.id = i.purchase_order_id
LEFT JOIN pg.inventory_vendor v ON v.id = po.vendor_id;

-- po: purchase orders with their era money rules.
-- Register: PO-09 + VEN-01 ($0 before 2026 or placeholder vendor = unknown), PO-02/PO-08 (delivered_date
-- and expected_delivery are not arrival dates), PO-11 (backwards dates), AUC-01 (auction link).
CREATE OR REPLACE TABLE po AS
SELECT
    po.id AS purchase_order_id,
    po.order_number,
    v.code AS vendor_code,
    v.code IN ('GEN', 'MIS') AS placeholder_vendor,
    po.status,
    po.ordered_date,
    po.paid_date,
    po.shipped_date,
    po.receiving_done_at,
    po.processing_started_at,
    po.processing_done_at,
    po.purchase_cost,
    CASE WHEN (po.fees = 0 AND po.ordered_date < DATE '2026-01-01') OR v.code IN ('GEN', 'MIS') THEN NULL ELSE po.fees END AS fees,
    CASE WHEN (po.shipping_cost = 0 AND po.ordered_date < DATE '2026-01-01') OR v.code IN ('GEN', 'MIS') THEN NULL ELSE po.shipping_cost END AS shipping_cost,
    po.total_cost,
    po.retail_value,
    po.est_shrink,
    po.pallet_count,
    (po.paid_date < po.ordered_date OR po.delivered_date < po.ordered_date) AS dates_backwards,
    a.id AS auction_id
FROM pg.inventory_purchaseorder po
LEFT JOIN pg.inventory_vendor v ON v.id = po.vendor_id
LEFT JOIN (
    SELECT purchase_order_id, min(id) AS id FROM pg.buying_auction WHERE purchase_order_id IS NOT NULL GROUP BY 1
) a ON a.purchase_order_id = po.id;
