/*
  Set manifest + processing sell price from PREPROCESSING (read-only source).

  Source (never updated here):
    inventory_preprocessingrow.proposed_price
    filtered by purchase_order via inventory_preprocessingorder.

  Formula:
    new_price = round(preprocessing_row.proposed_price * price_mult, 2)
    Default price_mult = 1.19

  Targets:
    - inventory_manifestrow: final_price, proposed_price, pricing_stage = 'final'
      (only rows that exist AND match preprocessing row_number)
    - inventory_processingrow: same (+ updated_at)
      JOIN purchase_order_id + row_number (works even if manifest_row_id IS NULL)
    - inventory_item.price for lines linked to touched manifest rows (non-terminal)
    - inventory_product.default_price when manifest.matched_product_id set
      (DEPRECATED column — P6: prefer ProcessingRow.matched_product_id in new SQL;
       this script unchanged until a follow-up rewrite)

  This does NOT compound prior manifest/processing edits: each run derives from
  current preprocessing proposed_price only.

  Preconditions:
    - Preprocessing rows must still exist with trustworthy proposed_price.
    - Rows with proposed_price IS NULL are skipped.

  Params — edit in params CTE:
    po_id, price_mult

  Does NOT refresh ProcessingRow.search_string — run rebuild_processing_search_string if search looks stale.

  Schema: ecothrift.*
*/

BEGIN;

CREATE TEMP TABLE _derived_price_from_preprocessing AS
WITH params AS (
  SELECT
    319::bigint     AS po_id,       -- <<< CHANGE purchase_order.id
    1.19::numeric   AS price_mult   -- <<< CHANGE multiplier
)
SELECT
  pr.purchase_order_id,
  pr.row_number,
  round(pr.proposed_price * p.price_mult, 2) AS new_price
FROM ecothrift.inventory_preprocessingrow AS pr
INNER JOIN ecothrift.inventory_preprocessingorder AS ord ON ord.id = pr.preprocessing_order_id
CROSS JOIN params AS p
WHERE ord.purchase_order_id = p.po_id
  AND pr.proposed_price IS NOT NULL;

-- Canonical manifest lines (only where manifest row exists for that PO + row_number)
UPDATE ecothrift.inventory_manifestrow AS mr
SET
  final_price = s.new_price,
  proposed_price = s.new_price,
  pricing_stage = 'final'
FROM _derived_price_from_preprocessing AS s
WHERE mr.purchase_order_id = s.purchase_order_id
  AND mr.row_number = s.row_number;

-- Processing workspace bookmarks (PO + row_number)
UPDATE ecothrift.inventory_processingrow AS bk
SET
  final_price = s.new_price,
  proposed_price = s.new_price,
  pricing_stage = 'final',
  updated_at = now()
FROM _derived_price_from_preprocessing AS s
WHERE bk.purchase_order_id = s.purchase_order_id
  AND bk.row_number = s.row_number;

-- Shelf ticket price for items tied to updated manifest rows
UPDATE ecothrift.inventory_item AS i
SET
  price = s.new_price,
  updated_at = now()
FROM ecothrift.inventory_manifestrow AS mr
INNER JOIN _derived_price_from_preprocessing AS s
  ON mr.purchase_order_id = s.purchase_order_id
 AND mr.row_number = s.row_number
WHERE i.manifest_row_id = mr.id
  AND i.status NOT IN ('sold', 'scrapped', 'lost');

UPDATE ecothrift.inventory_product AS p
SET
  default_price = s.new_price,
  updated_at = now()
FROM ecothrift.inventory_manifestrow AS mr
INNER JOIN _derived_price_from_preprocessing AS s
  ON mr.purchase_order_id = s.purchase_order_id
 AND mr.row_number = s.row_number
WHERE p.id = mr.matched_product_id
  AND mr.matched_product_id IS NOT NULL;

DROP TABLE _derived_price_from_preprocessing;

COMMIT;
