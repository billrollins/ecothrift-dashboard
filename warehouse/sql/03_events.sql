-- item_event: everything that happened to an item, point in time, one row per event.
-- Sources: ItemHistory (status, price, location, lost/found...), POS carts (sold / sale voided; checkout
-- writes no ItemHistory row, and a void clears sold_at, so the cart is the record), scans at the
-- register or public lookup, and Thrift+ signals and reward state changes.
-- `at_estimated` is true where the time is a stand-in (a void's time is not stored: the cart's start).
CREATE OR REPLACE TABLE item_event AS
SELECT item_id, created_at AS event_at, false AS at_estimated, 'history' AS source, event_type AS kind,
       old_value, new_value, created_by_id AS actor_id
FROM pg.inventory_itemhistory
UNION ALL
SELECT item_id, completed_at, false, 'cart', 'sold', NULL,
       CAST(round(line_total / nullif(quantity, 0), 2) AS VARCHAR), cashier_id
FROM sale_line
WHERE cart_status = 'completed' AND item_id IS NOT NULL AND NOT backfill_duplicate
UNION ALL
SELECT item_id, cart_created_at, true, 'cart', 'sale_voided', NULL,
       CAST(round(line_total / nullif(quantity, 0), 2) AS VARCHAR), cashier_id
FROM sale_line
WHERE cart_status = 'voided' AND item_id IS NOT NULL
UNION ALL
SELECT item_id, scanned_at, false, 'scan:' || source, 'scan', NULL, outcome, created_by_id
FROM pg.inventory_itemscanhistory
WHERE item_id IS NOT NULL
UNION ALL
SELECT item_id, created_at, false, 'thriftplus', 'tp_' || kind, NULL, CAST(detail AS VARCHAR), NULL
FROM pg.thriftplus_scansignal
WHERE item_id IS NOT NULL
UNION ALL
SELECT r.item_id, e.created_at, false, 'thriftplus', 'tp_reward', NULL,
       e.status || ' ' || CAST(e.reward AS VARCHAR), NULL
FROM pg.thriftplus_rewardevent e
JOIN pg.thriftplus_itemreward r ON r.item_id = e.item_reward_id;

-- item_price: the tag price over time, as intervals [valid_from, valid_to).
-- Only ItemHistory `price_change` rows record a retag (register ITM-14: other price writes leave no
-- trace). Before the first change the price is that change's old value; with no change, today's price.
-- valid_from NULL = since the item's start (unknown); valid_to NULL = still the price.
CREATE OR REPLACE TABLE item_price AS
WITH changes AS (
    SELECT
        item_id,
        created_at AS event_at,
        TRY_CAST(regexp_replace(old_value, '[^0-9.]', '', 'g') AS DECIMAL(12, 2)) AS old_price,
        TRY_CAST(regexp_replace(new_value, '[^0-9.]', '', 'g') AS DECIMAL(12, 2)) AS new_price,
        row_number() OVER (PARTITION BY item_id ORDER BY created_at, id) AS n
    FROM pg.inventory_itemhistory
    WHERE event_type = 'price_change'
)
SELECT item_id, NULL::TIMESTAMPTZ AS valid_from, event_at AS valid_to, old_price AS price, 'before_first_retag' AS price_source
FROM changes WHERE n = 1
UNION ALL
SELECT item_id, event_at, lead(event_at) OVER (PARTITION BY item_id ORDER BY n), new_price, 'retag'
FROM changes
UNION ALL
SELECT i.item_id, NULL, NULL, i.price, 'no_retag_recorded'
FROM item i
WHERE NOT EXISTS (SELECT 1 FROM changes c WHERE c.item_id = i.item_id);
