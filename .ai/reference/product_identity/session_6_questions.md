<!-- Last updated: 2026-06-09 (Composer — Session 6 working log; no Fable review pass) -->

# Session 6 handoff — questions & working notes (P4)

**From:** Composer (implementer, Session 6)  
**For:** Future me + owner — **not** a Fable teaching/review doc  
**Goal:** Record what is unclear, what was hard, and how I resolved it while implementing P4. Update **Answer** blocks as I decide; append to **Resolution log** when code lands.

**Authority stack:**

1. [`product_identity_design.md`](./product_identity_design.md) §7 (split), §10 #5 — wins on architecture  
2. This file — Session 6 working intent and honest unknowns  
3. [`session_5_questions.md`](./session_5_questions.md) — frozen P3 spec (do not reopen unless bug)

**P4 gate (initiative):** "N products" chip; quick check-in confirms product on mixed-product rows; row detail groups Items/batches by product; batch product remap. **Crayons scenario** works end-to-end without workarounds.

---

## How to use this doc (Composer-only)

1. Before coding a slice, skim **Open questions** — if still unanswered, pick a default and note it in **Answer**.  
2. When stuck, add a row to **Difficulties encountered** with what you tried.  
3. When a question is settled in code, append **Resolution log** (one line + test or file pointer).  
4. Do **not** wait for Fable — owner can override in chat; reflect overrides here in one line.  
5. Session 5 Fable corrections (G1 search base, B1/B2 field split) still apply; do not regress.

---

## Session 5 recap — what P4 builds on

| Shipped (P3) | Relevance to P4 |
|--------------|-----------------|
| `coalesce_processing_row_identity` on list/detail | Queue title is **one** display string from `ProcessingRow.matched_product` hint — split rows may need chip + grouped detail, not a second title column |
| Check-in ladder: batch → row match → row bookmark; no manifest writes | Second product on same row = **new check-in batch**, not a new manifest line |
| `manifestEvidence` on detail when matched | Still valid when one "primary" product; mixed rows may show vendor claim once |
| Denorm rebuilds `products_by_id` after legacy backfill | Good place to add **distinct product count** or **primary product recompute** (design §10 #5) |
| `distinctProductCount()` in frontend (`checkedInHistory.ts`) | Detail-only today — list has no batches/items |

**Known tension entering P4:** CHANGELOG / initiative still say quick check-in "reuses latest batch `product_id`" — design §7 says that must **stop** once a row has ≥2 products. P4 explicitly changes this.

---

## A. P4 scope fence

### A1. What Session 6 must include

**Answer (working):** Initiative P4 gate only:

1. **"N products" chip** on workspace queue (and/or active row header) when one `ProcessingRow` has check-in batches with **≥2 distinct products**.
2. **Quick check-in guard** — do not silently POST with latest batch's product when mixed; force explicit product choice (likely open detailed check-in or inline confirm).
3. **Row detail grouping** — checked-in history / batches **grouped by product** (not only chronological batch list).
4. **Batch product remap** — staff can re-point a batch's Items to a different Product (design §7: "remapping later = re-point batch Items' product FK").
5. **Primary `ProcessingRow.matched_product` recompute** in denorm (design §10 #5 leaning: most-units product) — at least document behavior in tests.
6. Tests + docs + initiative Session 6 close.

### A2. What Session 6 must NOT include

**Answer (working):**

- Collapse / group-by-product across rows (P5)
- `MergeModal` rework (P6)
- Final Decisions stepper changes
- New tables or `ManifestRow` split (Rule 3: line stays one row)
- Full shared `ProductPicker` extract (unless remap UI forces it — keep minimal)

### A3. Crayons acceptance (manual + automated)

**Answer (working):** One manifest line qty 24, two physical products:

1. Check in 10 × Product A (detailed or quick with explicit product).
2. Check in 14 × Product B (different price OK).
3. Queue shows **2 products** chip; quick check-in does **not** assume A or B without prompt.
4. Detail shows two product groups; totals reconcile to 24 dispositioned.
5. Remap one batch from B → B′; Items update; row still one manifest line.

Automated: extend `test_processing_validation_matrix.py` or new `test_processing_split.py` for two-batch-two-product + remap API.

---

## B. Detecting "mixed product" — server vs client

### B1. Where does the queue learn batch product diversity?

**Question:** List payload (`build_processing_workspace`) has no `checkInBatches` and no item list. `distinctProductCount` needs checked-in Items or batch products.

**Working options:**

| Option | Pros | Cons |
|--------|------|------|
| **B1a.** Denorm fields on `ProcessingRow`: `distinct_product_count`, `is_mixed_product` | O(1) on list; chip without detail fetch | Schema change? (initiative says no new tables — JSON/denorm ints may be OK) |
| **B1b.** Compute in list serializer via aggregate query on batches/items per row | No new columns | N+1 or heavy join on large POs |
| **B1c.** Chip only on detail/active card; list unchanged | Smallest diff | Fails P4 gate if gate requires **queue** chip |

**Answer (leaning B1a):** Add denormalized `distinct_product_count` (int, default 0) updated in `refresh_processing_rows_denorm` from Items on the row's manifest line (+ added-row item_ids). List serializer exposes `mixedProducts: count >= 2` or raw count for chip text `"N products"`.

**Difficulty:** Confirm with owner whether a migration for one integer denorm field is acceptable — design said "no new entities," not "no new columns."

### B2. What counts as "distinct product"?

**Answer (working):** Same rule as `productKeyForItem` in `checkedInHistory.ts` — distinct `Item.product_id` among dispositioned items for the row. Empty product_id items (shouldn't happen post-check-in) count as their own key.

**Open:** Include pending intake items or only dispositioned? **Leaning:** only dispositioned (`isCheckedInItem`), matching header stat today.

---

## C. "N products" chip — UX

### C1. List vs detail placement

**Question:** Initiative says queue chip; `ProcessingActiveCard` already shows **Products** stat tile from `distinctProductCount(priorCheckIns)`.

**Answer (working):**

- **List:** Chip next to status/dispatch when `distinct_product_count >= 2` (text `"2 products"` / `"N products"`).
- **Detail:** Keep stat tile; optional chip in header for consistency.
- Do not replace coalesced title with product names (too wide).

### C2. Chip when `matched_product` hint disagrees with batches

Example: finalize carried Product A; staff checked in Product B only.

**Answer (working):** Chip reflects **actual Items**, not hint. Denorm primary recompute (§10 #5) may set `matched_product` to B if B has more units — document in resolution log.

---

## D. Quick check-in when mixed

### D1. Current behavior (pre-P4)

`resolveQuickCheckInProduct` in `ProcessingActiveCard.tsx`:

```typescript
row.checkInBatches?.[0]?.product?.id ?? row.productId ?? …
→ { product_mode: 'existing', product_id: recentProductId }
```

Backend `processing_row_check_in` also prefers `_latest_check_in_product_for_row` over `row.matched_product`.

**Problem:** Second product on same row silently reuses latest batch — violates design §7.

### D2. Desired behavior

**Answer (working):**

- If `distinct_product_count >= 2` (or client equivalent on detail): **disable quick check-in** OR open detailed check-in with product picker required (no default `existing` from latest batch).
- If count is 0 or 1: keep current quick path.

**Open:** Disable vs auto-open dialog — **leaning** disable with tooltip "Multiple products on this row — use Detailed check-in."

### D3. Backend guard?

**Answer (leaning yes):** If request is quick-style (`product_mode` empty + implicit latest batch) and row has ≥2 distinct products on Items, return **400** with message to pick product explicitly. Prevents API bypass.

**Difficulty:** Distinguish intentional `keep` with `product_id` from silent reuse — only block when product not specified and row is mixed.

---

## E. Row detail — group by product

### E1. Current structure

`buildCheckedInHistoryRows` — chronological batches, then unbatched items. `CheckedInItemsTable` renders flat history rows.

**Answer (working):** Add grouping layer:

- Either extend `buildCheckedInHistoryRows` → `groupHistoryByProduct()`  
- Or new section **"By product"** above chronological table  
- Each group: product title/number, unit count, expand to batches/items

**Open:** Collapse batches inside product group or show batch sub-rows — **leaning** product header + existing batch rows nested.

### E2. Coalesced row title vs per-product labels

**Answer:** Row defaults / header keep P3 coalesced identity from primary hint; groups use live `Product` title from Items/batches.

---

## F. Batch product remap

### F1. No API today

**Question:** Greenfield. Design: re-point batch Items' `product_id` (+ update `ProcessingCheckInBatch.product`?).

**Working shape:**

```
POST …/processing-check-in-batch/{id}/remap-product/
{ "product_id": <existing or create via mode>, "product_mode": "existing"|"new", …identity fields }
```

Or PATCH batch — prefer explicit action for audit.

**Open questions:**

1. Remap all Items in batch only, or allow subset? **Leaning:** whole batch atomic.  
2. Update `ProcessingCheckInBatch.product_id` + all `Item.product_id` in batch.  
3. Trigger denorm + search_string refresh for row.  
4. Permissions: same as check-in (Manager)?  
5. UI: link from grouped batch row — minimal modal, reuse `getProducts` / `useProductSearch`.

**Difficulty:** Product identity edits on remap — follow `manual_item.py` fill-blanks policy, don't PATCH catalog aggressively.

### F2. Interaction with `ProcessingRow.matched_product`

**Answer (leaning):** After remap, denorm recomputes primary product (most units). Do not write manifest match.

---

## G. Denorm primary product recompute (§10 #5)

### G1. When to run

**Answer (working):** Inside `refresh_processing_rows_denorm` after item/batch linkage:

- If row has checked-in Items: set `matched_product_id` to product with **max item count** on that manifest line (tie → lowest product_id or most recent batch — **pick one, test it**).
- If no Items yet: preserve finalize-carried hint (P1/P3 behavior).
- Staff explicit null on preprocessing? N/A post-finalize on ProcessingRow — don't auto-clear to null.

**Open:** Owner may want hint **frozen** until manually changed — design leaning "probably yes" recompute. **Default: recompute when ≥1 checked-in item exists.**

### G2. Coalesce display after recompute

List/detail coalesce uses updated primary — title may shift when majority product changes. Acceptable per design.

---

## H. Files I expect to touch

| Layer | Files |
|-------|-------|
| Denorm / list | `processing_workspace.py` — distinct count, primary recompute, list chip fields |
| Remap API | `processing_ops.py`, `views.py`, urls |
| Tests | `test_processing_validation_matrix.py`, new `test_processing_split.py` |
| Queue UI | `ProcessingQueueTable.tsx`, `processingQueueCellText.ts`, types |
| Quick check-in | `ProcessingActiveCard.tsx`, `ProcessingQuickCheckInFooter.tsx` |
| Detail grouping | `checkedInHistory.ts`, `CheckedInItemsTable.tsx`, remap modal (new small component) |
| Docs | CHANGELOG, `inventory-pipeline.md`, initiative Session 6 block |

---

## I. Open questions for owner (not blocking if default OK)

| # | Question | Composer default if silent |
|---|----------|----------------------------|
| 1 | Is one denorm int column (`distinct_product_count`) OK? | Yes — migration |
| 2 | Quick check-in when mixed: disable or auto-open detailed? | Disable + tooltip |
| 3 | Primary product recompute: always most-units or only when mixed? | Whenever ≥1 checked-in item |
| 4 | Remap: whole batch only? | Yes, atomic |
| 5 | Chip on list required or detail-only enough? | List + detail per initiative |

---

## J. Difficulties encountered (fill during Session 6)

| Date | Difficulty | What I tried | Outcome |
|------|------------|--------------|---------|
| 2026-06-09 | PostgreSQL `select_for_update` + `select_related('product')` on nullable FK | Removed join from lock query; lock batch + row separately | Remap tests pass |

---

## K. Resolution log (fill during Session 6)

| Date | Question ref | Decision | Proof |
|------|--------------|----------|-------|
| 2026-06-09 | B1 / I-1 | Denorm `distinct_product_count` on `ProcessingRow`; expose `distinctProductCount` on list | migration 0058; `processing_workspace.py`; `test_processing_split.py` |
| 2026-06-09 | B2 / I-2 | Disable quick check-in + backend 400 on implicit reuse when mixed | `processing_ops.py`; `ProcessingQuickCheckInFooter.tsx` |
| 2026-06-09 | B3 / I-3 | Primary `matched_product` = most-units product when dispositioned items exist | `primary_product_id_for_items`; denorm tests |
| 2026-06-09 | D / I-4 | Whole-batch atomic remap API | `remap_check_in_batch_product`; `RemapBatchProductDialog` |
| 2026-06-09 | E / I-5 | N-products chip on queue status column + detail header | `ProcessingQueueTable.tsx`; `ProcessingRowHeader` |
| 2026-06-09 | A3 | Crayons 10+14 automated | `test_crayons_scenario_totals` |

---

## L. Acceptance checklist (P4 gate)

Session 6 done when:

1. Row with two check-in batches (two products) shows **N products** chip in queue.
2. Quick check-in on that row does **not** silently reuse latest batch product.
3. Row detail groups checked-in units **by product**.
4. Staff can **remap** a batch to a different product; Items update.
5. Crayons scenario (10 + 14) works manually.
6. Denorm primary product + distinct count covered by tests.
7. P1–P3 regressions still green.

---

## M. Top mistakes to avoid

1. Splitting or merging **ManifestRow** (Rule 3).
2. Re-introducing **manifest match writes** on check-in or remap.
3. Computing mixed state **only on frontend** — list chip needs server signal.
4. Quick check-in bypass — backend must enforce mixed guard.
5. Pulling **collapse / check-in together** (P5) into this session.

---

## N. Sign-off

**Composer:** This doc records **working hypotheses**, not Fable-approved spec. Implement Session 6 against [`product_identity_design.md`](./product_identity_design.md) §7 + initiative P4 gate; update **Answer** / **Resolution log** as you go.

**Date opened:** 2026-06-09
