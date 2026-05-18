WITH p AS (
  SELECT
    NULL::bigint AS vendor_id,
    NULL::text[] AS status_in,
    NULL::text AS status_exact,
    NULL::text AS search_raw,
    NULL::date AS ordered_date_after,
    NULL::date AS ordered_date_before,
    50::int AS limit_,
    0::int AS offset_
)
SELECT
  po.id,
  po.vendor_id,
  po.vendor_name_cache,
  po.vendor_code_cache,
  po.order_number,
  po.status,
  po.ordered_date,
  po.expected_delivery,
  po.delivered_date,
  po.condition,
  po.description,
  po.item_count,
  po.order_pallet_count,
  po.total_cost,
  po.retail_value,
  (po.manifest_id IS NOT NULL) AS has_manifest,
  po.created_at,
  po.updated_at
FROM ecothrift.inventory_purchaseorder po
CROSS JOIN p
WHERE po.vendor_name_cache IN (
  'Walmart', 'Target', 'Costco', 'Essendant', 'Wayfair', 'Home Depot', 'Amazon'
)
  AND (p.vendor_id IS NULL OR po.vendor_id = p.vendor_id)
  AND (p.status_exact IS NULL OR po.status = p.status_exact)
  AND (p.status_in IS NULL OR po.status = ANY (p.status_in))
  AND (p.ordered_date_after IS NULL OR po.ordered_date >= p.ordered_date_after)
  AND (p.ordered_date_before IS NULL OR po.ordered_date <= p.ordered_date_before)
  AND (
    p.search_raw IS NULL
    OR trim(p.search_raw) = ''
    OR NOT EXISTS (
      SELECT 1
      FROM (
        SELECT word
        FROM regexp_split_to_table(lower(trim(p.search_raw)), '\s+') AS s(word)
        WHERE word <> ''
        LIMIT 20
      ) tok
      WHERE po.search_text NOT ILIKE '%' || tok.word || '%'
    )
  )
ORDER BY po.ordered_date DESC
LIMIT (SELECT limit_ FROM p)
OFFSET (SELECT offset_ FROM p);
