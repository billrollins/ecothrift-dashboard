-- auction: one row per B-Stock listing, with the outcome when we recorded one.
-- Register: AUC-02 (no outcomes before bstock Phase 6: `close_price` falls back to the last swept price,
-- a low estimate, with close_source), AUC-07 (has_manifest ignored; manifest rows counted), AUC-08
-- (ended = closed), AUC-12 (CONTRACT prices are not lot prices), AUC-04 (origin only since 2026-09-23).
CREATE OR REPLACE TABLE auction AS
SELECT
    a.id AS auction_id,
    a.marketplace_id,
    a.seller_id,
    a.title,
    a.category,
    a.condition_summary,
    a.listing_type,
    a.listing_type = 'CONTRACT' AS contract_listing,
    a.lot_size,
    a.pallet_count,
    a.origin_city,
    a.origin_zip,
    a.shipment_type,
    a.total_retail_value,
    a.starting_price,
    a.buy_now_price,
    a.bid_count,
    a.end_time,
    CASE WHEN a.status = 'open' AND a.end_time < now() THEN 'closed' ELSE a.status END AS status,
    a.first_seen_at,
    coalesce(o.hammer_price, a.current_price) AS close_price,
    CASE WHEN o.hammer_price IS NOT NULL THEN 'outcome' ELSE 'last_swept' END AS close_source,
    o.win,
    o.fees AS outcome_fees,
    o.shipping_cost AS outcome_shipping,
    o.total_cost AS outcome_total_cost,
    a.estimated_revenue,
    a.estimated_shipping,
    a.shipping_quote,
    a.expected_close,
    a.price_target,
    a.max_bid,
    a.need_score,
    a.priority,
    a.purchase_order_id,
    coalesce(m.n, 0) AS manifest_rows
FROM pg.buying_auction a
LEFT JOIN pg.buying_outcome o ON o.auction_id = a.id
LEFT JOIN (SELECT auction_id, count(*) AS n FROM pg.buying_manifestrow GROUP BY 1) m ON m.auction_id = a.id;

-- auction_price: the price over time from sweeps and watch polls (AUC-14: sparse before 2026-09).
CREATE OR REPLACE TABLE auction_price AS
SELECT auction_id, captured_at AS event_at, price, bid_count, time_remaining_seconds
FROM pg.buying_auctionsnapshot;

-- category_label: every category proposal on a product (rule, copy, vector, AI, human) with its decision.
-- Product.category changes are not logged (register PRD-04); these proposals are the label history.
CREATE OR REPLACE TABLE category_label AS
SELECT
    product_id,
    created_at AS event_at,
    CAST(value AS VARCHAR) AS value,
    source,
    confidence,
    status,
    batch,
    rules_version,
    decided_at
FROM pg.inventory_productproposal
WHERE field = 'category';
