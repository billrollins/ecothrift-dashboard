<!-- Archived 2026-03-28: disposition=backlog parked off main index -->
<!-- initiative: slug=category-taxonomy-from-history status=backlog updated=2026-03-28 -->
<!-- Last updated: 2026-03-28T15:00:00-05:00 -->
# Category taxonomy from historical sales & inventory

## Objective

Define a **best-fit category set** (and hierarchy) for V3 using evidence from **past sales and inventory**: frequency, revenue, margin proxies, and coexistence of legacy labels (DB1 `product_attrs`, DB2 manifest rows, etc.).

## Motivation

- Retag and new inventory flows need a stable, learnable taxonomy.
- Raw legacy strings are noisy; consolidate into a smaller set of **canonical categories** (and subcategories if needed) aligned to how the store actually sells.

## Inputs (available)

- Pickles under `workspace/notebooks/historical-data/pickle/` (`product_attrs`, `manifest_rows`, sold joins, etc.).
- Optional: current `inventory.Category` seeds in V3.

## Acceptance (draft)

- [ ] Quantitative report: top categories/subcategories by volume and revenue (legacy definitions).
- [ ] Proposal: merged taxonomy (map old → new) with explicit “other / misc” buckets.
- [ ] Stakeholder sign-off process (even if just you) before locking seeds.
- [ ] Follow-on: seed `Category` (or equivalent) + mapping table for imports.

## See also

- [historical_data_export.md](../_pending/historical_data_export.md)
- `apps/inventory/management/commands/seed_categories.py` (if present)
