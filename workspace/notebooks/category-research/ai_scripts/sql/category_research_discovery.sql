-- Category research — DB discovery (run via ai_execute_sql.py).
-- Lock in names in discovery_lockin.md from output CSVs.

-- =============================================================================
-- 1) Resolve exact table names in public (inventory / manifest / PO / vendor / product)
-- =============================================================================
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name ILIKE ANY (ARRAY[
    '%inventory_item%',
    '%manifest%',
    '%purchaseorder%',
    '%vendor%',
    '%inventory_product%'
  ])
ORDER BY table_name;

-- =============================================================================
-- 2) Broader PO-like table names (%purchase%, %order%, %po%)
-- =============================================================================
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name ILIKE '%purchase%'
    OR table_name ILIKE '%order%'
    OR table_name ILIKE '%po%'
  )
ORDER BY table_name;

-- =============================================================================
-- 3) Columns: inventory_manifest_rows
-- =============================================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'inventory_manifest_rows'
ORDER BY ordinal_position;

-- =============================================================================
-- 4) Foreign keys involving inventory_manifest_rows (incoming or outgoing)
-- =============================================================================
SELECT
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND (
    tc.table_name = 'inventory_manifest_rows'
    OR ccu.table_name = 'inventory_manifest_rows'
  )
ORDER BY tc.table_name, kcu.column_name;

-- =============================================================================
-- 5) Foreign keys for core inventory tables (adjust list after step 1–2)
-- =============================================================================
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'inventory_item',
    'inventory_manifest_rows',
    'inventory_manifestrow',
    'inventory_purchase_order'
  )
ORDER BY tc.table_name, kcu.column_name;

-- =============================================================================
-- 6) Vendor join smoke test (adjust joins if discovery shows different PO/vendor tables)
-- =============================================================================
SELECT
  COUNT(*) AS items,
  COUNT(m.id) AS with_manifest,
  COUNT(po.id) AS with_po,
  COUNT(v.id) AS with_vendor
FROM public.inventory_item i
LEFT JOIN public.inventory_manifest_rows m ON m.id = i.manifest_row_id
LEFT JOIN public.inventory_purchase_order po ON po.id = m.purchase_order_id
LEFT JOIN public.inventory_vendor v ON v.id = po.vendor_id
WHERE i.processing_completed_at >= TIMESTAMP '2025-01-01'
  AND i.processing_completed_at < TIMESTAMP '2026-01-01';

-- =============================================================================
-- 7) Bin 3 retag coverage (ecothrift)
-- =============================================================================
SELECT
  COUNT(*) FILTER (WHERE status = 'on_shelf') AS on_shelf,
  COUNT(*) FILTER (WHERE status = 'on_shelf' AND notes LIKE 'RETAGGED_FROM_DB2:%') AS on_shelf_with_retag_note
FROM ecothrift.inventory_item;
