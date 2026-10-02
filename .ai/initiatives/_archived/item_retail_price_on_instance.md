<!-- Archived 2026-04-06: disposition=backlog parked off main index -->
<!-- initiative: slug=item-retail-price-on-instance status=backlog updated=2026-04-06 -->
<!-- Last updated: 2026-04-06T12:00:00-05:00 -->
# Item retail / estimated retail on the instance

## Objective

Put **retail** (or **estimated retail**) on **`Item`**, as a first-class field every sellable unit carries. Use it consistently for reporting, POS context, labels, and **future data science** (margin, pricing models, demand signals).

## Why this belongs on Item (not Product or ManifestRow alone)

1. **Product** maps to many **Items** from different purchase orders; each unit can have a **different** manifested or assessed retail value.
2. **Manifest rows** sometimes have **no retail**, or values that are **wrong** (vendor over/under-estimates, sale prices mistaken for MSRP, etc.).
3. **Item processors** must be able to **correct** retail during processing/check-in when manifests are off.
4. **Add Item** (manual or ad hoc) must capture **retail or estimated retail** so every instance is comparable in analytics.

## Scope (when activated)

- Add `retail_price` (nullable `DecimalField`) on `Item` in `apps/inventory/models.py`.
- Schema migration + **data migration** backfill from best available sources (order TBD; likely RetagLog first, then ManifestRow).
- Expose on `ItemSerializer`; simplify `ItemPublicSerializer` to prefer `Item.retail_price` over manifest-only logic.
- Frontend: `Item` type + Add Item / processing flows to **set or edit** retail.
- Document nullability rules (legacy rows) vs **required** on new creates if product policy demands it.

## Backfill SQL (draft — run inside a data migration)

```sql
UPDATE inventory_item i
SET retail_price = COALESCE(
    (SELECT r.retail_amt FROM inventory_retaglog r
     WHERE r.new_item_sku = i.sku ORDER BY r.retagged_at DESC LIMIT 1),
    (SELECT m.retail_value FROM inventory_manifestrow m
     WHERE m.id = i.manifest_row_id)
)
WHERE i.retail_price IS NULL;
```

## Acceptance (draft)

- [ ] `inventory_item.retail_price` exists and is indexed only if query patterns require it.
- [ ] Backfill completes without violating constraints; counts documented.
- [ ] API returns `retail_price` on item CRUD where appropriate.
- [ ] Customer-facing / staff UIs use item-level retail for “estimated retail” and savings where applicable.
- [ ] SQL/reporting can use `i.retail_price` without joining RetagLog/ManifestRow for the common case.

## See also

- `scripts/sql/inventory_summary_by_category.sql` — interim reporting using COALESCE(RetagLog, ManifestRow).
- `scripts/sql/sold_items_summary.sql` — same.
- `apps/inventory/serializers.py` — `ItemPublicSerializer.get_estimated_retail_value` today reads manifest only.

## Notes

- **Parked** in `_backlog` until inventory summary SQL and buying priorities allow implementation time.
- Does **not** replace manifest retail for vendor reconciliation; it **anchors truth on the item** for operations and analytics.
