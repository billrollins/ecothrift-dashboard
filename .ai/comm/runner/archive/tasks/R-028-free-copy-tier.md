> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-028 · Size the free-copy tier for Mixed products

- **Type:** recon (dev DB read-only) · **Time box:** 45 min
- **Why:** product_intelligence's cheapest-first ladder starts with free copies: a category we already have somewhere else. Size it before paying for AI. Read register ITM-11 and ITM-13 in `.ai/extended/data-quality.md` first. **V1/V2 product categories are noise and must not count as a source.**

## Do
Products in Mixed lots (bucketed as in R-021) with at least one item. Split V3 from V1/V2 using the R-021 tag. For each source below, count the products, their items, and their sold dollars:

1. **Manifest name:** a linked manifest row whose category is already one of the 23 names.
2. **Manifest code:** a linked manifest row whose code maps through `BSTOCK_CODE_TO_CANONICAL` (`apps/inventory/canonical_categories.py`) to a non-Mixed name.
3. **Preprocessing or processing:** a `PreprocessingRow.final_category` or `ProcessingRow.category` that is a real name.
4. **Sibling:** a **V3** product with the same normalized title (lowercase, no punctuation, spaces collapsed) and a non-Mixed category.
5. **Any of 1–4,** and **none of 1–4** (what's left for rules, vectors or AI).
6. **Conflicts:** where two sources disagree, count them and show 10 examples.

## Hand back
- A table of source × era: products, items, sold dollars.
- The conflict count and examples.
- One line on which source looks most trustworthy, with the evidence.
