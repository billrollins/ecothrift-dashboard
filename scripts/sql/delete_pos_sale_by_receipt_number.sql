-- Delete a POS sale and reverse ALL side effects, keyed by receipt number.
-- All objects schema-qualified to ecothrift (no SET search_path).
-- Works in psql, pgAdmin, DBeaver: edit v_receipt only, then run the whole DO block.

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
  FROM ecothrift.pos_receipt r
  JOIN ecothrift.pos_cart c ON c.id = r.cart_id
  WHERE r.receipt_number = v_receipt;

  IF v_cart_id IS NULL THEN
    RAISE EXCEPTION 'No cart found for receipt_number=%', v_receipt;
  END IF;

  RAISE NOTICE 'cart_id=% status=% payment=%', v_cart_id, v_status, v_payment;

  SELECT ARRAY_AGG(l.item_id)
    INTO v_resale_item_ids
    FROM ecothrift.pos_cartline l
   WHERE l.cart_id = v_cart_id
     AND l.resale_source_sku IS NOT NULL
     AND l.resale_source_sku <> ''
     AND l.item_id IS NOT NULL;

  IF v_status = 'completed' AND v_payment IN ('cash', 'split') THEN
    v_cash_component := v_total;
    IF v_payment = 'split' AND v_card IS NOT NULL AND v_card <> 0 THEN
      v_cash_component := v_total - v_card;
    END IF;
    UPDATE ecothrift.pos_drawer
       SET cash_sales_total = cash_sales_total - v_cash_component + COALESCE(v_change, 0)
     WHERE id = v_drawer_id;
    RAISE NOTICE 'Adjusted drawer id=% cash_sales_total (reverted sale cash impact)', v_drawer_id;
  END IF;

  UPDATE ecothrift.inventory_item i
     SET status = 'on_shelf',
         sold_at = NULL,
         sold_for = NULL
    FROM ecothrift.pos_cartline l
   WHERE l.cart_id = v_cart_id
     AND l.item_id = i.id
     AND i.status = 'sold'
     AND (l.resale_source_sku IS NULL OR l.resale_source_sku = '');

  UPDATE ecothrift.consignment_consignmentitem ci
     SET status = 'listed',
         sold_at = NULL,
         sale_amount = NULL,
         store_commission = NULL,
         consignee_earnings = NULL
    FROM ecothrift.pos_cartline l
   WHERE l.cart_id = v_cart_id
     AND l.item_id = ci.item_id
     AND ci.status = 'sold';

  DELETE FROM ecothrift.inventory_itemscanhistory WHERE cart_id = v_cart_id;

  DELETE FROM ecothrift.pos_receipt WHERE cart_id = v_cart_id;
  DELETE FROM ecothrift.pos_cartline WHERE cart_id = v_cart_id;
  DELETE FROM ecothrift.pos_cart WHERE id = v_cart_id;

  RAISE NOTICE 'Deleted cart_id=% (receipt + lines + cart); cleaning up resale-copy inventory rows if any', v_cart_id;

  IF v_resale_item_ids IS NOT NULL AND cardinality(v_resale_item_ids) > 0 THEN
    DELETE FROM ecothrift.inventory_itemhistory WHERE item_id = ANY (v_resale_item_ids);
    DELETE FROM ecothrift.inventory_itemscanhistory WHERE item_id = ANY (v_resale_item_ids);
    DELETE FROM ecothrift.inventory_item WHERE id = ANY (v_resale_item_ids);
    GET DIAGNOSTICS v_resale_items_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % resale-copy item(s) from inventory', v_resale_items_deleted;
  END IF;
END
$body$;
