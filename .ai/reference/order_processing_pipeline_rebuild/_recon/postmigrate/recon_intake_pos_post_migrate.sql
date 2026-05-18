-- Intake PO recon (post app migrations 0048+ / 0050+): target 316–319.
-- Requires PurchaseOrder intake train columns from wave migrations.

\echo '--- columns_probe ---'
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'ecothrift'
  AND table_name IN (
    'inventory_purchaseorder',
    'inventory_dispute',
    'inventory_preprocessingrow',
    'inventory_processingrow',
    'inventory_manifestrow',
    'inventory_item',
    'inventory_processingdatabuild',
    'inventory_receiving',
    'inventory_receivingpallet',
    'core_s3file'
  )
ORDER BY table_name, ordinal_position;

\echo '--- po_summary ---'
WITH po AS (
  SELECT *
  FROM ecothrift.inventory_purchaseorder
  WHERE id IN (316, 317, 318, 319)
)
SELECT
  po.id,
  po.order_number,
  po.status,
  po.preprocess_status,
  po.finalized_at,
  po.delivered_date,
  po.receiving_status,
  po.receiving_started_at,
  po.receiving_done_at,
  po.processing_status,
  po.processing_started_at,
  po.processing_done_at,
  po.uses_legacy_processing,
  po.intake_dispute_status,
  po.processing_dispute_status,
  po.manifest_id,
  po.manifest_filename,
  po.manifest_uploaded_at,
  po.manifest_row_count,
  po.manifest_category_count,
  (SELECT COUNT(*) FROM ecothrift.inventory_dispute d WHERE d.purchase_order_id = po.id) AS disputes,
  (SELECT COUNT(*) FROM ecothrift.inventory_preprocessingrow r WHERE r.purchase_order_id = po.id) AS preprocessing_rows,
  (SELECT COALESCE(SUM(r.quantity), 0)::bigint FROM ecothrift.inventory_preprocessingrow r WHERE r.purchase_order_id = po.id) AS preprocessing_qty_sum,
  (SELECT COUNT(*) FROM ecothrift.inventory_processingrow r WHERE r.purchase_order_id = po.id) AS processing_rows,
  (SELECT COUNT(*) FROM ecothrift.inventory_processingrow r WHERE r.purchase_order_id = po.id AND r.manifest_row_id IS NOT NULL) AS processing_rows_linked,
  (SELECT COALESCE(SUM(r.quantity), 0)::bigint FROM ecothrift.inventory_processingrow r WHERE r.purchase_order_id = po.id) AS processing_qty_sum,
  (SELECT COUNT(*) FROM ecothrift.inventory_manifestrow r WHERE r.purchase_order_id = po.id) AS manifest_rows,
  (SELECT COALESCE(SUM(r.quantity), 0)::bigint FROM ecothrift.inventory_manifestrow r WHERE r.purchase_order_id = po.id) AS manifest_qty_sum,
  (SELECT COUNT(*) FROM ecothrift.inventory_item r WHERE r.purchase_order_id = po.id) AS items,
  (SELECT COUNT(*) FROM ecothrift.inventory_item r WHERE r.purchase_order_id = po.id AND r.manifest_row_id IS NOT NULL) AS items_linked_manifest,
  (SELECT COUNT(*) FROM ecothrift.inventory_item r WHERE r.purchase_order_id = po.id AND r.manifest_row_id IS NULL) AS items_unlinked_manifest,
  (SELECT COUNT(*) FROM ecothrift.inventory_item r WHERE r.purchase_order_id = po.id AND r.status IN ('sold', 'scrapped', 'lost')) AS items_terminal,
  (SELECT COALESCE(MAX(b.status), '') FROM ecothrift.inventory_processingdatabuild b WHERE b.purchase_order_id = po.id) AS processing_build_status,
  (SELECT COUNT(*) FROM ecothrift.inventory_receiving r WHERE r.purchase_order_id = po.id) AS receiving_sessions,
  (SELECT COUNT(*) FROM ecothrift.inventory_receiving r WHERE r.purchase_order_id = po.id AND r.completed_at IS NOT NULL) AS receiving_completed_sessions
FROM po
ORDER BY po.id;
