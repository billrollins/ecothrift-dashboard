WITH p AS (SELECT NULL::bigint AS po_id)
SELECT
  po.id,
  po.order_number,
  po.manifest_id,
  (po.manifest_preview ->> 'row_count')::text AS preview_row_count,
  (po.manifest_preview ->> 'signature')::text AS preview_signature,
  (po.manifest_preview ->> 'template_name')::text AS preview_template_name,
  (po.manifest_preview ? 'headers') AS preview_has_headers
FROM ecothrift.inventory_purchaseorder po
CROSS JOIN p
WHERE p.po_id IS NOT NULL AND po.id = p.po_id;

WITH p AS (SELECT NULL::bigint AS po_id)
SELECT
  f.id,
  f.key,
  f.filename,
  f.size,
  f.content_type,
  f.uploaded_by_id,
  f.uploaded_at
FROM ecothrift.core_s3file f
JOIN ecothrift.inventory_purchaseorder po ON po.manifest_id = f.id
CROSS JOIN p
WHERE p.po_id IS NOT NULL AND po.id = p.po_id;

WITH p AS (SELECT NULL::bigint AS po_id)
SELECT
  prep.id,
  prep.workflow_status,
  prep.current_step,
  prep.finalized_at
FROM ecothrift.inventory_preprocessingorder prep
CROSS JOIN p
WHERE p.po_id IS NOT NULL AND prep.purchase_order_id = p.po_id;
