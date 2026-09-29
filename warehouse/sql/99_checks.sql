-- checks: counts printed after every build. should_be NULL = for information (coverage, fill-ins).
CREATE OR REPLACE TABLE checks AS
SELECT * FROM (VALUES
    ('floor: end before start (left out)', (SELECT count(*) FROM floor_interval WHERE end_at < start_at), 0),
    ('floor: sold, no date (SAL-04, left out)', (SELECT count(*) FROM floor_interval WHERE end_reason = 'sold_no_date'), NULL),
    ('floor: start known (on_shelf / listed_at)', (SELECT count(*) FROM floor_interval WHERE start_known), NULL),
    ('floor: start filled in', (SELECT count(*) FROM floor_interval WHERE NOT start_known), NULL),
    -- The last day's floor against items on_shelf now that started by then; SHR-03 items (on the shelf
    -- and on a completed cart) are sold here, so they are the only expected difference.
    ('floor last day vs on_shelf now, less SHR-03',
        (SELECT items FROM floor_daily ORDER BY day DESC LIMIT 1)
        - (SELECT count(*) FROM item i JOIN floor_interval f USING (item_id)
           WHERE i.status = 'on_shelf' AND f.start_at::DATE <= (SELECT max(day) FROM floor_daily))
        + (SELECT count(*) FROM item i JOIN floor_interval f USING (item_id)
           WHERE i.status = 'on_shelf' AND f.end_reason IN ('sold', 'sold_at')
             AND f.start_at::DATE <= (SELECT max(day) FROM floor_daily)), 0),
    ('floor: SHR-03 on the shelf and sold', (SELECT count(*) FROM item i JOIN floor_interval f USING (item_id)
        WHERE i.status = 'on_shelf' AND f.end_reason IN ('sold', 'sold_at')), NULL),
    ('price: overlapping intervals',
        (SELECT count(*) FROM (SELECT item_id, valid_from, lag(valid_to) OVER (PARTITION BY item_id ORDER BY valid_from NULLS FIRST) AS prev_to
                               FROM item_price) WHERE valid_from < prev_to), 0),
    ('price: retag values not a number', (SELECT count(*) FROM item_price WHERE price IS NULL AND price_source <> 'no_retag_recorded'), 0),
    ('sales: backfill duplicates counted once (SAL-08)', (SELECT count(*) FROM sale_line WHERE backfill_duplicate), NULL),
    ('sales: completed item lines with no item row', (SELECT count(*) FROM sale_line s WHERE s.cart_status = 'completed' AND s.item_id IS NOT NULL AND s.era IS NULL), 0),
    ('misfit: no item (SAL-07)', (SELECT count(*) FROM misfit_sale WHERE reason = 'no_item'), NULL),
    ('misfit: MIS vendor', (SELECT count(*) FROM misfit_sale WHERE reason = 'misfit_po'), NULL),
    ('misfit: no PO (ITM-04)', (SELECT count(*) FROM misfit_sale WHERE reason = 'no_po'), NULL),
    ('misfit: V3, no manifest line', (SELECT count(*) FROM misfit_sale WHERE reason = 'no_manifest'), NULL),
    ('outcome: sold is null', (SELECT count(*) FROM item_outcome WHERE sold IS NULL OR censored IS NULL), 0),
    ('outcome: rows repeated', (SELECT count(*) - count(DISTINCT item_id) FROM item_outcome), 0),
    ('outcome: tag at start filled with today''s tag', (SELECT count(*) FROM item_outcome WHERE tag_filled_today), NULL),
    ('outcome: sold, no sold_for', (SELECT count(*) FROM item_outcome WHERE sold AND sold_for IS NULL), NULL),
    ('outcome: negative days on the floor', (SELECT count(*) FROM item_outcome WHERE days_on_floor < 0), 0),
    ('curve: share sold goes down with age',
        (SELECT count(*) FROM (SELECT share_sold < lag(share_sold) OVER (PARTITION BY category ORDER BY day_mark) AS down
                               FROM sell_curve) WHERE down), 0),
    ('auctions: close from an outcome (AUC-02)', (SELECT count(*) FROM auction WHERE close_source = 'outcome'), NULL)
) t(name, count, should_be);
