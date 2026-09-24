> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-016 · recon · Every B-Stock category code we have seen, and where it lands

**Why:** product intelligence Phase 1 settles our category list (`.ai/initiatives/product_intelligence.md`). We need to know which seller categories have no good home in our 19.

**Answer these:**

1. **Every code** from these sources, with row or unit counts:
   - inventory `ManifestRow.category` (PO lines);
   - buying `ManifestRow` API rows (`raw_data` `categories` and `customAttributes.subCategory`);
   - `CategoryMapping.source_key` (the vendor prefix and slug);
   - `Auction.category` text.
2. **Where each one lands today:**
   - its `CategoryMapping` majority target, and how strongly it agrees;
   - the preprocessing `final_category` for PO lines that have one;
   - what `canonical_category_name()` in `apps/inventory/canonical_categories.py` returns for it.
3. **Weak fits.** List the codes that land in Mixed lots, or split across 2+ targets, or clearly don't fit their target: for example vacuums, fans or heaters into Kitchen; garden into Outdoor furniture; automotive into Mixed; arts and crafts. Give each one's units and retail from the last 12 months.
4. **Suggested new top-level categories,** each with the codes it would absorb and their volume. At most 8.

**Result:** `results/R-016-bstock-category-codes.md`. Read-only; no outside calls. Archive when done.
