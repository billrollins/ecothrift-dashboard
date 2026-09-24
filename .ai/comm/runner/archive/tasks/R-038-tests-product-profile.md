> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-038 · Tests: product profile, brand aliases, proposals, review page

- **Type:** test · **Snapshot ref:** `refs/runner/R-038` (`4f619375`) · **Compare-to:** `41a77c23` (the v2.100.0 commit)
- **What changed:**
  - `inventory/0097` adds `ProductProfile`, `BrandAlias` and `ProductProposal`;
  - `inventory/0098` builds a title trigram index **concurrently**, with `atomic = False`;
  - `services/product_profile.py` and `api_product_review.py` (`/api/inventory/product-review/`);
  - three commands: `seed_brand_aliases`, `load_profile_proposals`, `apply_profile_proposals`;
  - `apps/inventory/data/brand_aliases.csv`;
  - frontend: `ProductReviewPage`, the route, and a nav item under Retail Floor.

## Run
1. `py: apps/inventory apps/pos`
2. `vitest`
3. `tsc`
4. `migrations-check`

## Expect
- `apps/inventory/tests/test_product_profile.py` passes, along with `ProductReviewPage.test.ts` and `slotCNavLayout.test.ts` (the new nav item).
- Report separately any NEW failure in `apps/pos` or inventory processing, check-in or preprocessing.
- Also report whether migration `0098` (concurrent index, non-atomic) applied cleanly in the test database.
