WITH p AS (SELECT NULL::bigint AS po_id)
SELECT
  po.id,
  po.order_number,
  po.status,
  po.manifest_id,
  po.manifest_preview,
  po.vendor_id,
  po.created_by_id,
  v.name AS vendor_name,
  v.code AS vendor_code,
  trim(both from cb.first_name || ' ' || cb.last_name) AS created_by_full_name,
  (SELECT COUNT(DISTINCT i.id) FROM ecothrift.inventory_item i
   WHERE i.purchase_order_id = po.id AND i.status = 'intake') AS _items_intake,
  (SELECT COUNT(DISTINCT i.id) FROM ecothrift.inventory_item i
   WHERE i.purchase_order_id = po.id AND i.status = 'processing') AS _items_processing,
  (SELECT COUNT(DISTINCT i.id) FROM ecothrift.inventory_item i
   WHERE i.purchase_order_id = po.id AND i.status = 'on_shelf') AS _items_on_shelf,
  (SELECT COUNT(DISTINCT i.id) FROM ecothrift.inventory_item i
   WHERE i.purchase_order_id = po.id AND i.status = 'sold') AS _items_sold,
  (SELECT COUNT(DISTINCT i.id) FROM ecothrift.inventory_item i
   WHERE i.purchase_order_id = po.id AND i.status = 'returned') AS _items_returned,
  (SELECT COUNT(DISTINCT i.id) FROM ecothrift.inventory_item i
   WHERE i.purchase_order_id = po.id AND i.status = 'scrapped') AS _items_scrapped,
  (SELECT COUNT(DISTINCT i.id) FROM ecothrift.inventory_item i
   WHERE i.purchase_order_id = po.id AND i.status = 'lost') AS _items_lost,
  (SELECT COUNT(DISTINCT mr.id) FROM ecothrift.inventory_manifestrow mr
   WHERE mr.purchase_order_id = po.id) AS _manifest_row_count,
  (SELECT COUNT(DISTINCT bg.id) FROM ecothrift.inventory_batchgroup bg
   WHERE bg.purchase_order_id = po.id) AS _batch_groups_total,
  (SELECT COUNT(DISTINCT bg.id) FROM ecothrift.inventory_batchgroup bg
   WHERE bg.purchase_order_id = po.id AND bg.status <> 'complete') AS _batch_groups_pending,
  po.updated_at
FROM ecothrift.inventory_purchaseorder po
JOIN ecothrift.inventory_vendor v ON v.id = po.vendor_id
LEFT JOIN ecothrift.accounts_user cb ON cb.id = po.created_by_id
CROSS JOIN p
WHERE p.po_id IS NOT NULL AND po.id = p.po_id;
