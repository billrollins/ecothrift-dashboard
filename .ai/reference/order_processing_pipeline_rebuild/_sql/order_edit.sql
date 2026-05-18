WITH p AS (SELECT NULL::bigint AS po_id)
SELECT
  po.id,
  po.vendor_id,
  po.order_number,
  po.status,
  po.description,
  po.notes,
  po.condition,
  po.item_count,
  po.order_pallet_count,
  po.purchase_cost,
  po.shipping_cost,
  po.fees,
  po.total_cost,
  po.retail_value,
  po.est_shrink,
  po.ordered_date,
  po.paid_date,
  po.shipped_date,
  po.expected_delivery,
  po.delivered_date,
  po.manifest_id,
  (po.manifest_preview ->> 'row_count')::text AS manifest_preview_row_count,
  (po.manifest_preview ->> 'signature')::text AS manifest_preview_signature,
  po.vendor_name_cache,
  po.vendor_code_cache,
  left(po.search_text, 160) AS search_text_head,
  po.updated_at
FROM ecothrift.inventory_purchaseorder po
CROSS JOIN p
WHERE p.po_id IS NOT NULL AND po.id = p.po_id;
