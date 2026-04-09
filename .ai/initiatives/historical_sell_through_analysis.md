<!-- initiative: slug=historical-sell-through-analysis status=active updated=2026-04-09 -->
# Initiative: Historical sell-through analysis

**Status:** Active

**Dependency for:** `bstock_auction_intelligence.md` Phase 5 (auction valuation). Phase 5 needs per-category sell-through rates that this initiative produces.

---

## Delivered tooling (partial — toward Phase 3)

- [x] **PO extract (app v2.7.1):** `python workspace/notes/to_consultant/extract_po_descriptions.py` — connects to **`ecothrift_v1`**, **`ecothrift_v2`**, **`ecothrift_v3`** (see script for V3 table guard). Writes **`workspace/notes/to_consultant/purchase_orders_all_details.csv`** (all POs, parsed description fields; consultant path), mirror **`workspace/data/po_descriptions_all.csv`**, **`po_category_distribution.csv`**, **`po_category_sell_through.csv`** (join **`workspace/data/sell_through_by_po.csv`**), **`workspace/notes/to_consultant/po_description_analysis.md`**. Documented in **`CHANGELOG`** **[2.7.1]**, **`.ai/consultant_context.md`**, **`.gitignore`** whitelist for the script path.

---

## Context

Eco-Thrift needs category-level sell-through rates to power auction valuation (suggested max bid, projected revenue). The formula is simple: `sum(sold_price) / sum(retail_value)` per `fast_cat_value` category. But the data lives across three database generations (V1, V2, V3) and hundreds of historical manifest CSVs that have never been processed through the fast-cat pipeline.

This initiative documents the legacy databases, builds reusable tooling to process historical data, and outputs a pricing rules table that Phase 5 consumes.

---

## Non-negotiables

- Legacy DB documentation is permanent reference material. Do it once, do it right.
- All database schema docs go in `.ai/extended/databases/` with metadata (date range, record counts, known quirks).
- Historical CSV processing reuses the existing fast-cat pipeline (ManifestTemplate detection, fast_cat_key composition, CategoryMapping lookup + AI for unknowns).
- The output is `sum(sold_price) / sum(retail_value)` per fast_cat_value. Not a fancy model. Simple and grounded in real data.
- Shrinkage, refunds, and disputes are handled separately as configurable factors, not baked into the sell-through rate.

---

## Phased plan

### Phase 1: Legacy database documentation

Document V1, V2, and V3 (current) database schemas. For each:
- Tables, columns, relationships, primary/foreign keys
- Where manifests, items, products, categories, carts, cart lines, sold prices live
- Date range of data (sales from X to Y)
- Record counts (approximate)
- Known quirks, inconsistencies, data quality issues
- How to connect (host, credentials pattern, Django config)

Output: `.ai/extended/databases/v1_schema.md`, `.ai/extended/databases/v2_schema.md`, `.ai/extended/databases/v3_schema.md`. Update `.ai/extended/databases.md` as the index.

V1 and V2 are frozen (no longer updated), so this documentation is permanent.

### Phase 2: Historical CSV processing

Process all historical manifest CSVs through the fast-cat pipeline:
- Inventory all available CSVs (local machine paths, counts, vendors)
- Detect or create ManifestTemplates for each unique header signature
- Generate fast_cat_keys for every row
- Map keys to canonical categories (seeded mappings + AI for unknowns)
- Build reusable tooling (management command or script) that can process a folder of CSVs

Output: a clean dataset with manifest line identifiers, retail_value, fast_cat_value for every historical manifest line.

### Phase 3: Sales join and sell-through computation

Join processed manifest lines to actual sold items across V1/V2/V3:
- Identify the join key(s) across databases (PO number + SKU, UPC, item identifier)
- Handle mismatches and data quality issues
- Compute `sum(sold_price) / sum(retail_value)` per fast_cat_value
- Document coverage gaps (items that sold but can't be traced to a manifest line, and vice versa)

Output: a PricingRule seed (category, sell_through_rate, sample_size, version_date) ready for Phase 5 to load into the database.

### Phase 4: Pricing rules table and Phase 5 handoff

- Create or populate the PricingRule model with computed rates
- Add admin-configurable factors: shrinkage_factor (default 0.10), profit_factor (default 2.0)
- Document the formula: `auction_value = sum(line_retail * category_rate) * (1 - shrinkage_factor)`, profitable when `auction_value >= profit_factor * (bid + fees + shipping)`
- Hand off to Phase 5 in bstock_auction_intelligence.md

---

## Open questions

- How many historical CSVs exist and across how many vendor formats?
- What are the join keys between manifest lines and sold items in V1 vs V2 vs V3?
- How complete is the sales data? What percentage of manifest lines can be matched to a sale?
- Are V1 and V2 databases accessible from the dev machine? Connection details?

---

## See also

- `bstock_auction_intelligence.md` Phase 5 (consumer of this data)
- `workspace/notebooks/category-research/` (prior Bin 2 analysis, taxonomy_v1)
- `.ai/extended/databases.md` (database connection reference)
