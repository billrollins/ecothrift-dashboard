-- Delete a POS sale and reverse ALL side effects, keyed by receipt number.
-- Works in psql, pgAdmin, DBeaver: edit v_receipt only, then run the whole DO block.
-- Suggested: BEGIN;  ... paste DO block ...  COMMIT;  or ROLLBACK to dry-run.
--
-- What it does (as if the cart never happened):
--   1. Reverts pos_drawer.cash_sales_total for completed cash/split sales
--   2. Sets sold inventory items back to on_shelf (non-resale lines only; resale copies are removed later)
--   3. Clears consignment_consignmentitem sale fields for those items
--   4. Deletes inventory_itemscanhistory rows for this cart
--   5. DELETE pos_receipt, pos_cartline, then pos_cart (DB FKs may not CASCADE)
--   6. Deletes resale-copy Items (ItemHistory + ItemScanHistory, then inventory_item)
--
-- Django uses schema "ecothrift" (see settings DATABASES OPTIONS search_path). Clients
-- like pgAdmin/psql default to "public"; without this, unqualified tables may resolve
-- to wrong/stale objects and columns like payment_method will not exist.

SET search_path TO ecothrift;

DO $body$
DECLARE
  -- ============ EDIT THIS ============
  v_receipt text := 'R-20260406-003';
  -- ===================================

  v_cart_id integer;
  v_drawer_id integer;
  v_status text;
  v_payment text;
  v_total numeric(10,2);
  v_card numeric(10,2);
  v_change numeric(10,2);
  v_cash_component numeric(10,2);
  v_resale_items_deleted integer;
  v_resale_item_ids integer[];
BEGIN
  SELECT c.id, c.drawer_id, c.status, c.payment_method, c.total,
         COALESCE(c.card_amount, 0), COALESCE(c.change_given, 0)
    INTO v_cart_id, v_drawer_id, v_status, v_payment, v_total, v_card, v_change
  FROM pos_receipt r
  JOIN pos_cart c ON c.id = r.cart_id
  WHERE r.receipt_number = v_receipt;

  IF v_cart_id IS NULL THEN
    RAISE EXCEPTION 'No cart found for receipt_number=%', v_receipt;
  END IF;

  RAISE NOTICE 'cart_id=% status=% payment=%', v_cart_id, v_status, v_payment;

  -- Resale copy item_ids (add-resale-copy lines). Must snapshot before cart delete.
  SELECT ARRAY_AGG(l.item_id)
    INTO v_resale_item_ids
    FROM pos_cartline l
   WHERE l.cart_id = v_cart_id
     AND l.resale_source_sku IS NOT NULL
     AND l.resale_source_sku <> ''
     AND l.item_id IS NOT NULL;

  -- 1. Revert drawer cash_sales_total (only completed + cash/split)
  IF v_status = 'completed' AND v_payment IN ('cash', 'split') THEN
    v_cash_component := v_total;
    IF v_payment = 'split' AND v_card IS NOT NULL AND v_card <> 0 THEN
      v_cash_component := v_total - v_card;
    END IF;
    UPDATE pos_drawer
       SET cash_sales_total = cash_sales_total - v_cash_component + COALESCE(v_change, 0)
     WHERE id = v_drawer_id;
    RAISE NOTICE 'Adjusted drawer id=% cash_sales_total (reverted sale cash impact)', v_drawer_id;
  END IF;

  -- 2. Revert sold items -> on_shelf (lines that are NOT resale copies; copies are deleted below)
  UPDATE inventory_item i
     SET status = 'on_shelf',
         sold_at = NULL,
         sold_for = NULL
    FROM pos_cartline l
   WHERE l.cart_id = v_cart_id
     AND l.item_id = i.id
     AND i.status = 'sold'
     AND (l.resale_source_sku IS NULL OR l.resale_source_sku = '');

  -- 3. Revert consignment sale fields
  UPDATE consignment_consignmentitem ci
     SET status = 'listed',
         sold_at = NULL,
         sale_amount = NULL,
         store_commission = NULL,
         consignee_earnings = NULL
    FROM pos_cartline l
   WHERE l.cart_id = v_cart_id
     AND l.item_id = ci.item_id
     AND ci.status = 'sold';

  -- 4. Delete scan audit rows for this cart
  DELETE FROM inventory_itemscanhistory WHERE cart_id = v_cart_id;

  -- 5. Delete receipt and lines, then cart (DB may use DEFERRABLE NO ACTION, not CASCADE)
  DELETE FROM pos_receipt WHERE cart_id = v_cart_id;
  DELETE FROM pos_cartline WHERE cart_id = v_cart_id;
  DELETE FROM pos_cart WHERE id = v_cart_id;

  RAISE NOTICE 'Deleted cart_id=% (receipt + lines + cart); cleaning up resale-copy inventory rows if any', v_cart_id;

  -- 6. Delete resale-copy Items (after cart so cartlines do not reference item_id)
  IF v_resale_item_ids IS NOT NULL AND cardinality(v_resale_item_ids) > 0 THEN
    DELETE FROM inventory_itemhistory WHERE item_id = ANY (v_resale_item_ids);
    DELETE FROM inventory_itemscanhistory WHERE item_id = ANY (v_resale_item_ids);
    DELETE FROM inventory_item WHERE id = ANY (v_resale_item_ids);
    GET DIAGNOSTICS v_resale_items_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % resale-copy item(s) from inventory', v_resale_items_deleted;
  END IF;
END
$body$;

-- Notes
-- -----
-- Open carts (no receipt yet): use pos_cart.id directly instead of receipt lookup.
-- Card-only completed sales: drawer block is skipped (matches app behavior).
-- Resale-copy items: delete pos_receipt and pos_cartline before pos_cart so cart FKs
-- succeed; then ItemHistory + ItemScanHistory + inventory_item (avoids FK errors from
-- cartlines and from missing CASCADE on history tables).
-- Original items that were on the cart are reverted to on_shelf, NOT deleted.
--
-- Re-run the script in a transaction (BEGIN … COMMIT / ROLLBACK). If a prior run
-- failed partway through in a way that left a half-applied state (unusual unless
-- statements were auto-committed separately), confirm whether you need to fix
-- drawer totals or stray rows manually, then run the updated script once.
