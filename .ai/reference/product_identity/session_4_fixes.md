<!-- Last updated: 2026-06-09 (Fable 5 — Session 4 review findings; fix BEFORE starting Session 5) -->

# Session 4 fix list — review findings (pre-Session-5)

**From:** Fable 5 (design author, reviewed Session 4 working-tree diff 2026-06-09)
**For:** Composer (implementer)
**Gate:** All three bugs fixed + tests green **before** any Session 5 / P3 work begins. Cleanups are optional but cheap — do them if they take < 30 min total.

**Authority stack:** [`product_identity_design.md`](./product_identity_design.md) → this file → [`session_5_questions.md`](./session_5_questions.md) (do not start its work yet).

**Verdict context:** Session 4 is otherwise approved — G2 (`ai_status` untouched by match PATCH), staff-never-overridden, A1 read-only Product column, and F1 page-scoped "Same as row" were all verified correct. Do **not** change those behaviors while fixing the items below.

---

## Bug 1 — Bulk pricing can write $0.00 or negative prices (MUST FIX)

**Where:** `frontend/src/utils/preprocessingReviewTotals.ts:57-68` (`scaleFromAiBase`, `priceFromRetail`).

**Problem:** Both helpers guard the *base* (`base <= 0` → null) but not the *factor/pct*:

- Adjust % = `-100` → `factor = 0` → `scaleFromAiBase('10.00', 0)` returns `'0.00'` — written to every row with an AI base.
- Adjust % = `-150` → negative factor → negative price string.
- % of retail = `0` → `'0.00'`; negative pct → negative price.

This violates the helpers' own doc comments ("null = skip row (never write 0)") and the CHANGELOG entry for this feature ("never writes `$0.00`").

**Fix (in the helpers, not the toolbar):**

- `scaleFromAiBase`: return `null` when `factor <= 0` (extend the existing guard on line 59).
- `priceFromRetail`: return `null` when `pct <= 0` (extend line 66).

Toolbar (`PreprocessingReviewTable.tsx` `applyBulkPricing`) needs no logic change — null already counts as skipped. Optionally improve the skip message when 0 rows priced because of a non-positive factor ("Adjust % must be above −100" / "% of retail must be positive"), but the helper guard is the required fix.

**Tests:** extend `frontend/src/utils/preprocessingReviewTotals.test.ts`:

- `scaleFromAiBase('10.00', 0)` → `null`; `scaleFromAiBase('10.00', -0.5)` → `null`; `scaleFromAiBase('10.00', 1.1)` → `'11.00'` (regression).
- `priceFromRetail('100.00', 0)` → `null`; `priceFromRetail('100.00', -50)` → `null`; `priceFromRetail('100.00', 25)` → `'25.00'` (regression).

---

## Bug 2 — Finalized rows not searchable by matched product name (MUST FIX)

**Where:** `apps/inventory/services/processing_finalize.py:263-264` (in `finalize_preprocessing_to_bookmarks`):

```python
for obj in objs:
    obj.search_string = build_processing_row_search_string(obj)
```

**Problem:** Finalize copies `final_matched_product` → `ProcessingRow.matched_product` but builds `search_string` with the **bare base builder** — no product tokens (product_number / UPC / model / title / brand). Workspace search for the product name misses freshly finalized rows until `refresh_processing_rows_denorm` happens to run. Violates design §3 ("`search_string` includes **both** row fields and matched-product fields") and is Session-5 acceptance criterion K5 — fix it now so Session 5 lands on a correct base.

**Fix:** replace the bare loop with the existing helper that already does this in denorm:

```python
product_ids = {o.matched_product_id for o in objs if o.matched_product_id}
products_by_id = {p.id: p for p in Product.objects.filter(pk__in=product_ids)} if product_ids else {}
assign_search_strings_for_instances(objs, products_by_id=products_by_id)
```

(`assign_search_strings_for_instances` is in `apps/inventory/services/processing_search_string.py`; `items_by_manifest_row` is not needed — no Items exist at finalize.) Do **not** coalesce or change the base builder itself — the base must keep raw row tokens (see Session 5 G1 correction).

**Tests:** in `apps/inventory/tests/test_product_matching.py` (or the finalize test module): finalize a PreprocessingRow with `final_matched_product` set to a product whose title differs from the row title → assert the created `ProcessingRow.search_string` contains the product title **and** still contains the row's own title.

---

## Bug 3 — Invalid `final_matched_product` PATCH is a silent no-op (MUST FIX)

**Where:** `apps/inventory/views.py:774` (preprocessing-review PATCH handling):

```python
if pid is not None and Product.objects.filter(pk=pid).exists():
```

**Problem (two parts):**

1. A nonexistent product id (e.g. a stale candidate chip after the product was deleted) is silently dropped — the request returns 200, the refetch shows the row still unmatched, and the user gets no error anywhere. They will click Confirm repeatedly with no feedback.
2. The `exists()` check runs **once per patched row** inside the rows loop — N queries on a bulk patch.

**Fix:**

- Before the rows loop, collect all non-null `final_matched_product` ids from the payload and validate them in **one** query: `valid_ids = set(Product.objects.filter(pk__in=ids).values_list('pk', flat=True))`.
- Inside the loop, an id not in `valid_ids` → return a validation error (HTTP 400) naming the row and the bad id, following this endpoint's existing error-response convention (match how it reports other invalid row payloads — do not invent a new error shape). Clearing a match (`final_matched_product: null`) must keep working unchanged.

**Frontend:** no change required — the existing mutation error path (`onError` snackbar) will surface the 400. Verify `useUpdatePreprocessingMatch` / `handleSetMatch` shows an error snackbar on failure; add one if it currently swallows errors.

**Tests:** extend the preprocessing-review PATCH tests: (a) PATCH with a nonexistent product id → 400, row unchanged, `match_source` unchanged; (b) PATCH with a valid id → row updated, `match_source = 'staff'` (regression); (c) bulk PATCH of N rows with matches → assert no per-row Product query (use `assertNumQueries` bound or just verify the single-validation-query shape).

---

## Cleanups (optional, in priority order — skip any that snowball)

1. **Unify the product snapshot builder.** The 5-field shape `{title, brand, upc, default_price, product_number}` is built independently in `product_matching._product_snapshot` and the serializer's `matched_product_detail` (`apps/inventory/serializers.py:~284`). Make the serializer import and reuse `_product_snapshot` (rename to public `product_snapshot` if needed). Chips and confirmed-match display must never disagree.
2. **One loop in `applyBulkPricing`** (`PreprocessingReviewTable.tsx:~319/356`): the retail and AI branches duplicate the same per-id loop. Pick the pricer fn by mode, run one loop.
3. **Chip lookup table** (`PreprocessingMatchCell.tsx:~130`): replace the three parallel ternary chains (color/variant/icon over five `chipState` values) with one `Record<chipState, {color, variant, icon}>`.
4. **Shared `useProductSearch` hook:** `PreprocessingMatchCell`, `AddProcessingItemDialog`, and `ProcessingCheckInDialog` each hand-roll the same `getProducts` query. Extract only if it stays a mechanical move — do not redesign the dialogs (that's P-later per Session 5 A2).

---

## Explicitly NOT in scope

- Anything from `session_5_questions.md` (coalesce helper, check-in ladder, manifest-write removal, `manifestEvidence`). Session 5 starts only after this list is done.
- The `refresh_processing_rows_denorm` `products_by_id`-before-backfill gap — that is queued **inside** Session 5 (see the review verdict in `session_5_questions.md`); don't fix it here to keep this diff small.
- Any change to `ai_status` semantics, staff-override guard, A1 column behavior, or legacy `match-products` flow.

## Done when

1. All three bugs fixed with the tests above green, plus existing suites: `test_product_matching.py`, preprocessing review PATCH tests, `preprocessingReviewTotals.test.ts`.
2. Frontend typecheck/lint pass.
3. CHANGELOG: no new entry needed (Session 4 is unreleased); just confirm the existing "never writes `$0.00`" claim is now true.
4. One-line note appended to the Session 4 block in `.ai/initiatives/intake_processing_improvements.md`: "Fable review fixes applied (pricing zero-guard, finalize search tokens, match PATCH validation)."
