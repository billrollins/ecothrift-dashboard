-- Intake PO recon (pre-migration-safe): target 316–319.
-- Run with: psql ... --csv -v ON_ERROR_STOP=1 -f this_file.sql -o recon_pre_migrate.csv
-- Omit or comment any column that does not exist on your DB (e.g. very old prod).

\echo '--- columns_probe ---'
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'ecothrift'
  AND table_name IN (
    'inventory_purchaseorder',
    'inventory_preprocessingrow',
    'inventory_processingrow',
    'inventory_manifestrow',
    'inventory_item',
    'inventory_processingdatabuild',
    'inventory_receiving',
    'inventory_receivingpallet',
    'inventory_product',
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
  po.manifest_id,
  po.manifest_filename,
  po.manifest_uploaded_at,
  po.manifest_row_count,
  po.manifest_category_count,
  po.created_at AS po_created_at,
  po.updated_at AS po_updated_at,
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
  (SELECT COUNT(*) FROM ecothrift.inventory_processingdatabuild b WHERE b.purchase_order_id = po.id) AS processing_build_rows,
  (SELECT COALESCE(MAX(b.status), '') FROM ecothrift.inventory_processingdatabuild b WHERE b.purchase_order_id = po.id) AS processing_build_status,
  (SELECT COUNT(*) FROM ecothrift.inventory_receiving r WHERE r.purchase_order_id = po.id) AS receiving_sessions,
  (SELECT COUNT(*) FROM ecothrift.inventory_receiving r WHERE r.purchase_order_id = po.id AND r.completed_at IS NOT NULL) AS receiving_completed_sessions
FROM po
ORDER BY po.id;
