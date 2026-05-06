/*
  Intake pipeline diagnostics — read-only SELECTs for one Purchase Order.

  Schema: ecothrift.* (README.md / cli.md).

  Usage:
    Replace every ``319::bigint`` below with your PO primary key (Find/Replace),
    or run in psql after:

      \\set po_id 319

    and substitute manually — plain PostgreSQL has no session variables.

  Heavy JSON (manifest_preview, raw_row, identifiers) omitted or sampled;
  widen SELECT lists if you need full payloads.
*/

-- =====================================================================
-- 0) Resolve PO primary key (optional — run alone, then set po_id below)
-- =====================================================================
-- SELECT id, order_number, status, manifest_id, item_count, updated_at
-- FROM ecothrift.inventory_purchaseorder
-- WHERE order_number = 'TRGET-O2R-1K40';

-- Recent POs (pick id):
-- SELECT id, order_number, status, updated_at
-- FROM ecothrift.inventory_purchaseorder
-- ORDER BY id DESC
-- LIMIT 30;

-- =====================================================================
-- Order header + preview metadata (no full manifest_preview blob)
-- =====================================================================
WITH intake AS (
  SELECT 319::bigint AS po_id  -- <<< change PO id here (replace all 319::bigint in file)
)
SELECT
  po.id,
  po.order_number,
  po.status,
  po.vendor_id,
  po.manifest_id,
  po.item_count,
  po.retail_value,
  po.total_cost,
  po.est_shrink,
  po.ai_cleanup_generation,
  (po.manifest_preview ->> 'row_count')::text AS preview_row_count,
  (po.manifest_preview ->> 'signature')::text AS preview_signature,
  (po.manifest_preview ->> 'template_name')::text AS preview_template_name,
  (po.manifest_preview ? 'headers') AS preview_has_headers_key,
  po.updated_at
FROM ecothrift.inventory_purchaseorder AS po
JOIN intake ON po.id = intake.po_id;

-- Uploaded manifest file pointer
WITH intake AS (SELECT 319::bigint AS po_id)
SELECT f.id, f.key, f.filename, f.size, f.content_type, f.uploaded_at
FROM ecothrift.core_s3file AS f
JOIN ecothrift.inventory_purchaseorder AS po ON po.manifest_id = f.id
JOIN intake ON po.id = intake.po_id;

-- CSV template linked from preprocessing (when template_id set)
WITH intake AS (SELECT 319::bigint AS po_id)
SELECT t.id, t.name, t.header_signature, t.is_default, t.vendor_id
FROM ecothrift.inventory_preprocessingorder AS prep
JOIN ecothrift.inventory_purchaseorder AS po ON prep.purchase_order_id = po.id
JOIN intake ON po.id = intake.po_id
LEFT JOIN ecothrift.inventory_csvtemplate AS t ON t.id = prep.template_id;

-- Preprocessing session
WITH intake AS (SELECT 319::bigint AS po_id)
SELECT
  prep.id AS preprocessing_id,
  prep.workflow_status,
  prep.current_step,
  prep.template_id,
  prep.template_name,
  prep.header_signature,
  prep.row_count,
  prep.standardized_at,
  prep.last_ai_import_at,
  prep.review_saved_at,
  prep.finalized_at,
  prep.updated_at
FROM ecothrift.inventory_preprocessingorder AS prep
JOIN ecothrift.inventory_purchaseorder AS po ON prep.purchase_order_id = po.id
JOIN intake ON po.id = intake.po_id;

-- Preprocessing rows: counts + price coverage
WITH intake AS (SELECT 319::bigint AS po_id)
SELECT
  COUNT(*) AS rows_total,
  COUNT(*) FILTER (WHERE unit_retail IS NOT NULL) AS with_unit_retail,
  COUNT(*) FILTER (WHERE proposed_price IS NOT NULL) AS with_proposed_price,
  COUNT(*) FILTER (WHERE final_price IS NOT NULL) AS with_final_price,
  COUNT(*) FILTER (WHERE final_title IS NOT NULL AND btrim(final_title) <> '') AS with_final_title,
  COUNT(*) FILTER (WHERE ai_title IS NOT NULL AND btrim(ai_title) <> '') AS with_ai_title
FROM ecothrift.inventory_preprocessingrow AS pr
JOIN ecothrift.inventory_purchaseorder AS po ON pr.purchase_order_id = po.id
JOIN intake ON po.id = intake.po_id;

-- Preprocessing rows sample
WITH intake AS (SELECT 319::bigint AS po_id)
SELECT
  pr.id,
  pr.row_number,
  pr.quantity,
  pr.unit_retail,
  pr.proposed_price,
  pr.final_price,
  pr.pricing_stage,
  left(pr.standard_description, 80) AS standard_description_80,
  left(pr.final_title, 60) AS final_title_60,
  left(pr.ai_title, 60) AS ai_title_60,
  pr.ai_status
FROM ecothrift.inventory_preprocessingrow AS pr
JOIN ecothrift.inventory_purchaseorder AS po ON pr.purchase_order_id = po.id
JOIN intake ON po.id = intake.po_id
ORDER BY pr.row_number
LIMIT 25;

-- Canonical manifest rows (counts + sample)
WITH intake AS (SELECT 319::bigint AS po_id)
SELECT COUNT(*) AS manifest_row_count
FROM ecothrift.inventory_manifestrow AS mr
JOIN ecothrift.inventory_purchaseorder AS po ON mr.purchase_order_id = po.id
JOIN intake ON po.id = intake.po_id;

WITH intake AS (SELECT 319::bigint AS po_id)
SELECT
  mr.id,
  mr.row_number,
  mr.quantity,
  mr.unit_retail,
  mr.proposed_price,
  mr.final_price,
  mr.pricing_stage,
  mr.match_status,
  left(mr.title, 60) AS title_60
FROM ecothrift.inventory_manifestrow AS mr
JOIN ecothrift.inventory_purchaseorder AS po ON mr.purchase_order_id = po.id
JOIN intake ON po.id = intake.po_id
ORDER BY mr.row_number
LIMIT 25;

-- Processing bookmarks
WITH intake AS (SELECT 319::bigint AS po_id)
SELECT COUNT(*) AS processing_row_count
FROM ecothrift.inventory_processingrow AS bk
JOIN ecothrift.inventory_purchaseorder AS po ON bk.purchase_order_id = po.id
JOIN intake ON po.id = intake.po_id;

WITH intake AS (SELECT 319::bigint AS po_id)
SELECT
  bk.id,
  bk.row_number,
  bk.quantity,
  bk.unit_retail,
  bk.proposed_price,
  bk.final_price,
  bk.pricing_stage,
  bk.manifest_row_id,
  bk.queue_status,
  bk.pending_item_count,
  left(bk.title, 60) AS title_60
FROM ecothrift.inventory_processingrow AS bk
JOIN ecothrift.inventory_purchaseorder AS po ON bk.purchase_order_id = po.id
JOIN intake ON po.id = intake.po_id
ORDER BY bk.row_number
LIMIT 25;

-- Chunked processing-data build
WITH intake AS (SELECT 319::bigint AS po_id)
SELECT
  b.id,
  b.status,
  b.generation,
  b.total_rows,
  b.processed_rows,
  b.total_items,
  b.created_items,
  b.current_row_number,
  b.error_count,
  left(b.last_error, 200) AS last_error_200,
  b.started_at,
  b.completed_at
FROM ecothrift.inventory_processingdatabuild AS b
JOIN intake ON b.purchase_order_id = intake.po_id;

-- Legacy-style processing batches
WITH intake AS (SELECT 319::bigint AS po_id)
SELECT pb.id, pb.status, pb.total_rows, pb.processed_count, pb.items_created, pb.started_at, pb.completed_at
FROM ecothrift.inventory_processingbatch AS pb
JOIN intake ON pb.purchase_order_id = intake.po_id
ORDER BY pb.started_at DESC NULLS LAST;

-- Batch groups tied to PO
WITH intake AS (SELECT 319::bigint AS po_id)
SELECT bg.id, bg.batch_number, bg.status, bg.product_id, bg.manifest_row_id, bg.total_qty, bg.unit_price, bg.unit_cost
FROM ecothrift.inventory_batchgroup AS bg
JOIN intake ON bg.purchase_order_id = intake.po_id
ORDER BY bg.id;

-- Items: status histogram + sample lines
WITH intake AS (SELECT 319::bigint AS po_id)
SELECT i.status, COUNT(*) AS n
FROM ecothrift.inventory_item AS i
JOIN intake ON i.purchase_order_id = intake.po_id
GROUP BY i.status
ORDER BY n DESC;

WITH intake AS (SELECT 319::bigint AS po_id)
SELECT
  i.id,
  i.sku,
  i.status,
  i.price,
  i.unit_retail,
  i.cost,
  i.manifest_row_id,
  i.batch_group_id
FROM ecothrift.inventory_item AS i
JOIN intake ON i.purchase_order_id = intake.po_id
ORDER BY i.id
LIMIT 50;

-- Receiving record
WITH intake AS (SELECT 319::bigint AS po_id)
SELECT
  r.id,
  r.received_date,
  r.completed_at,
  r.pallet_count,
  r.condition,
  r.draft_version,
  r.updated_at
FROM ecothrift.inventory_receiving AS r
JOIN intake ON r.purchase_order_id = intake.po_id;
