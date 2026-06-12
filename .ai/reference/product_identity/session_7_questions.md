<!-- Last updated: 2026-06-09 (Composer — Session 7 working log; readiness audit added) -->

# Session 7 handoff — questions & working notes (P5)

**From:** Composer (implementer, Session 7)  
**For:** Future me + owner — **not** a Fable teaching/review doc  
**Goal:** Record what is unclear, what was hard, and how I resolved it while implementing P5. Update **Answer** blocks as I decide; append to **Resolution log** when code lands.

**Authority stack:**

1. [`product_identity_design.md`](./product_identity_design.md) §6 (collapse), §10 #3–#4 — wins on architecture  
2. This file — Session 7 working intent and honest unknowns  
3. [`session_6_questions.md`](./session_6_questions.md) — frozen P4 spec (do not reopen unless bug)

**P5 gate (initiative):** Group-by-product display; **"check in together"** multi-row action distributing per-row quantities. Grouped rows check in from one form; Items keep own `manifest_row_id`.

---

## How to use this doc (Composer-only)

1. Before coding a slice, skim **Open questions** — if still unanswered, pick a default and note it in **Answer**.  
2. When stuck, add a row to **Difficulties encountered** with what you tried.  
3. When a question is settled in code, append **Resolution log** (one line + test or file pointer).  
4. Do **not** wait for Fable — owner can override in chat; reflect overrides here in one line.  
5. P3/P4 invariants still apply: no `ManifestRow.matched_product` writes; split/mixed-row guards stay intact.

---

## Session 6 recap — what P5 builds on

| Shipped (P4) | Relevance to P5 |
|--------------|-----------------|
| `distinct_product_count` + N-products chip | Collapse is the **inverse** — many rows, one product; chip logic must not confuse "mixed on one row" with "same product across rows" |
| `primary_product_id_for_items` denorm | Rows partially checked in may have `matched_product` ≠ finalize hint; group-by should use **`ProcessingRow.matched_product_id`** (decided hint), not live Item majority, for **pre-check-in** grouping |
| Quick check-in guard when mixed | Group check-in must pass **explicit** `product_id`; never implicit latest-batch reuse across rows |
| `buildProductGroupedHistory` on **detail** | P5 grouping is **queue-level** (many rows → one product), not batch history inside one row |
| `RemapBatchProductDialog` / batch remap | Out of scope; collapse never merges Items across manifest lines |
| List `product_id` filter + header **This product** button | Partial collapse UX already exists — P5 may extend, not duplicate awkwardly |

**Known tension entering P5:** `processing_merge_rows` + `MergeModal` still **write `ManifestRow.matched_product`** and re-point Items — violates Rule 3 and design §6 ("never physically merge ProcessingRows"). P5 adds the **correct** collapse model; **retiring** destructive merge is **P6**, but P5 must not call legacy merge for check-in together.

**Symmetry reminder (design §7):**

```
Collapse:  many rows → one product   (same matched_product on N rows)
Split:     one row  → many products  (P4 — done)
```

---

## A. P5 scope fence

### A1. What Session 7 must include

**Answer (working):** Initiative P5 gate only:

1. **Group-by-product display** in Item Processor workspace — staff can see which manifest lines share the same decided product (`ProcessingRow.matched_product_id`).
2. **"Check in together"** — select ≥2 rows that share a product → one shared form (condition, price, dispatch, etc.) → on submit, create **per-row** check-ins with each row's **remaining qty** prefilled (editable per row in the form).
3. **Items keep `manifest_row_id`** — each row's check-in creates its own `ProcessingCheckInBatch` + Items; no row merge, no manifest line merge.
4. **Workspace peer signal** — expose which other rows share the product (extends P2 `same_product_row_numbers` idea to **processing** list/detail, not only Final Decisions).
5. Tests + docs + initiative Session 7 close.

### A2. What Session 7 must NOT include

**Answer (working):**

- **`MergeModal` / `processing_merge_rows` retirement or re-scope** (P6) — may **hide** merge button when group check-in ships, but do not rewrite merge audit/manifest writes in P5 unless blocking.
- **ManifestRow match-field cleanup** (P6).
- **Split / N-products chip changes** (P4 frozen unless regression).
- **Assigning same product across rows at preprocessing** — already via Final Decisions / same-as-row; P5 is **processing workspace** collapse only.
- **New tables / link entities** — shared FK only (design §6).
- **Physically merging `ProcessingRow` records** or changing `ManifestRow.quantity`.

### A3. Controllers acceptance (manual + automated)

**Answer (working):** Three manifest lines, same matched product (e.g. three "Xbox controller" lines, qty 1 each), zero checked in:

1. Workspace shows them as one **product group** (or filter/group view makes peers obvious).
2. Staff selects all three → **Check in together** → one form, qty 1 per row (editable).
3. Submit → three Items, each with **its own** `manifest_row_id`, same `product_id`, one batch per row (or one multi-row action creating three batches).
4. Rollups: expected 3, dispositioned 3; no row merge; queue status per line updates independently.

Automated: new `test_processing_collapse.py` (or extend validation matrix) for multi-row check-in + manifest_row_id preservation.

---

## B. Group-by-product display

### B1. View mode vs filter-only

**Question:** List already supports `product_id` query param + header chip **Product: …** (`ProcessingFilterRow`, `ProcessingWorkspacePage`). Is that enough?

**Working options:**

| Option | Pros | Cons |
|--------|------|------|
| **B1a.** Enhance existing product filter + peer badges on rows | Smallest diff; reuses API | Not a true "grouped" table (rows still flat) |
| **B1b.** New queue segment `group_by=product` — render product headers + nested rows | Matches design "group-by-product view" | More UI work; virtualized table complexity |
| **B1c.** Toggle: flat \| grouped | Best UX long-term | Scope risk |

**Answer (leaning B1b + keep filter):** Add optional **grouped queue mode** (toggle or segment) that clusters consecutive/sorted rows by `matched_product_id` (null = "Unmatched" group). Keep existing product filter as fast path. Peer badge on each row: **"Also rows 12, 40"** when `matched_product_id` shared (server-computed list).

### B2. Which product id defines a group?

**Answer (working):**

- **Before any check-in:** `ProcessingRow.matched_product_id` (finalize / Final Decisions hint).
- **After partial check-in:** still group by **`matched_product_id` hint**, not live Item majority — avoids rows jumping groups mid-session. (If hint was wrong, staff use P4 remap or row-level detailed check-in — out of P5 scope.)
- **Rows with null `matched_product_id`:** own group "No product decided" or ungrouped at bottom.

**Open:** Include rows where **checked-in Items** use product A but hint is B? **Leaning:** group by hint only; P4 primary recompute should align hint to majority over time.

### B3. Server payload for peers

**Question:** Preprocessing has `same_product_row_numbers` on review rows. Workspace list has no equivalent.

**Answer (leaning):** Add to list row payload (denorm or one aggregate per PO):

- `sameProductRowNumbers: number[]` — other `row_number`s with same non-null `matched_product_id` on this PO (exclude self).
- Compute in `build_processing_workspace` with one query: `values('matched_product_id').annotate(rows=ArrayAgg('row_number'))` or Python dict from full PO slice (list is capped at 10k rows — acceptable for v1).

**Do not** join Items for peer discovery — hint FK only.

---

## C. "Check in together" — behavior

### C1. Selection rules

**Answer (working):**

- Require **≥2 selected** `processing_row_id`s.
- Require **same non-null `matched_product_id`** across all selected (client + server validate).
- **Reject** selection if any selected row is `row_kind=added`? **Leaning:** allow only manifest-backed rows for v1 (same as quick check-in guard on added rows).
- **Reject** if any row has `distinct_product_count >= 2` (P4 mixed)? **Leaning yes** — mixed rows must use row-level detailed check-in; exclude from group action with message.
- **Reject** if any row lacks linked `manifest_row_id` (bookmark-only)? **Leaning yes** — `processing_data_required`.

### C2. Quantity model

Design §6: "each row's expected quantity prefilled (editable)".

**Answer (working):**

- Form shows a **table**: row #, title snippet, **qty remaining** (editable), shared condition/price/dispatch/notes.
- Default qty per row = `max(0, row.qty - row.qtyDispositioned)`; allow overage per existing row check-in rules (min 1, max 500 per row).
- **Shared** fields apply to all rows in the batch action; per-row qty differs.

**Open:** Allow different price per row in one form? **Leaning no for v1** — one shelf price for the action; staff can split into two group actions or use per-row detailed check-in if prices differ.

### C3. Backend shape

**Question:** Loop `processing_row_check_in` N times vs one atomic endpoint?

**Working options:**

| Option | Pros | Cons |
|--------|------|------|
| **C3a.** New `POST …/processing-check-in-together/` | Single txn; one audit story; one workspace_patch | New op to maintain |
| **C3b.** Client loops existing check-in | Reuses code | N round trips; partial failure messy; N label print flows |

**Answer (leaning C3a):** New `processing_check_in_together(user, order, data)` in `processing_ops.py`:

```json
{
  "processing_row_ids": [1, 2, 3],
  "rows": [{ "processing_row_id": 1, "quantity": 1 }, …],
  "product_mode": "existing",
  "product_id": 42,
  "condition": "good",
  "dispatch": "on_shelf",
  "price": "19.99",
  …shared fields…
}
```

Internally: validate same product hint, loop rows calling shared check-in core (extract from `processing_row_check_in` if needed), one `refresh_processing_rows_denorm` at end, merged `workspace_patch` + combined `printed_items_preview`.

**Still forbidden:** any `ManifestRow.matched_product` write.

### C4. Product resolution

**Answer (working):** Group action always uses **explicit** `product_mode: existing` + `product_id` = shared `matched_product_id` (or `keep` with that product loaded server-side). No silent create-new across rows unless staff opens detailed flow per row.

---

## D. UI placement (design §10 #3)

### D1. Where does the action live?

**Answer (leaning — hybrid):**

1. **Bulk strip** (`ProcessingBulkActionBar`): when ≥2 rows selected **and** same `productId` → show **Check in together** (bar must be **mounted** — see §O).
2. **Grouped view header:** optional **Check in all in group** when grouped mode shows a product section with multiple pending rows.

**Open:** Replace merge button vs add sibling button — **leaning** add **Check in together** when all selected share product **and** all have remaining qty; keep merge behind P6 deprecation (or hide merge in P5 if owner agrees — note in resolution log).

### D2. Dialog reuse

**Answer (working):** Extend `ProcessingCheckInDialog` with a **`together`** mode (multi-row qty table + shared fields) **or** new thin `CheckInTogetherDialog.tsx` that reuses field components. **Leaning:** new dialog wrapper to avoid breaking single-row dialog state machine.

---

## E. Relationship to existing UX

### E1. "This product" header filter

**Answer:** Group mode complements filter — filter shows flat subset; group mode shows structure. When user clicks **This product** on row detail, consider switching to group mode + product filter together (optional polish).

### E2. `ProcessingBulkActionBar.sameProduct`

**Question:** How is `sameProduct` computed today?

**Answer (verified 2026-06-09):** `ProcessingBulkActionBar` and `MergeModal` exist but are **not mounted** on `ProcessingWorkspacePage`. P5 adds queue multi-select, computes `sameProduct` as all selected rows share non-null `productId`, plus manifest-backed + not mixed (`distinctProductCount < 2`) + remaining qty > 0.

### E3. Final Decisions badges

Preprocessing already shows **Also rows N, M**. P5 adds workspace equivalent — **do not** share serializer; processing list uses `ProcessingRow.matched_product_id` peers, not `PreprocessingRow.final_matched_product`.

---

## F. Legacy merge — do not extend

### F1. `processing_merge_rows` today

Writes `ManifestRow.matched_product`, mutates Items, creates `ProductMergeAudit` — **not** the collapse model.

**Answer (P5):** Do **not** wire "Check in together" to merge. Optional: disable **These are the same product** when P5 ships if it confuses staff — defer full re-scope to P6.

### F2. Assign same product without merge

If staff selected rows with **different** hints but know they're the same physical product:

**Answer (defer):** P5 gate does not require cross-hint assignment. They use existing merge (legacy) or set matches in Final Decisions before processing. Optional future: **Assign shared product** that only sets `ProcessingRow.matched_product_id` (no manifest write) — **out of P5** unless owner pulls forward.

---

## G. Denorm / rollups

### G1. After group check-in

**Answer:** Call existing `refresh_processing_rows_denorm` for all touched row ids; progress/rollups unchanged (per-manifest-line truth).

### G2. Peer list invalidation

After check-in, `sameProductRowNumbers` unchanged (same hint). After hint change (future assign-product) — invalidate workspace query.

---

## H. Files I expect to touch

| Layer | Files |
|-------|-------|
| List peers / group | `processing_workspace.py` — peer map, optional group metadata on payload |
| Check-in together API | `processing_ops.py` — `processing_check_in_together`; refactor shared core from `processing_row_check_in` |
| View | `views.py` — `POST …/processing-check-in-together/` |
| Tests | new `test_processing_collapse.py`; extend `test_processing_validation_matrix.py` if needed |
| Queue UI | `ProcessingQueueTable.tsx`, new grouped renderer or segment; `processingQueueCellText.ts` |
| Bulk / dialog | `ProcessingBulkActionBar.tsx`, `ProcessingWorkspacePage.tsx`, new `CheckInTogetherDialog.tsx` (or extend check-in dialog) |
| Types / hooks | `inventory.types.ts`, `inventory.api.ts`, `useProcessingWorkspace.ts` |
| Docs | CHANGELOG, `inventory-pipeline.md`, initiative Session 7 block |

**Explicitly not required in P5:** `MergeModal.tsx`, `processing_merge_rows` rewrite.

---

## O. Codebase readiness audit (2026-06-09 — pre-plan)

| Area | State | Session 7 implication |
|------|--------|------------------------|
| **P4 split** | Shipped: `distinct_product_count`, mixed guard, remap API, queue chip, grouped detail | Frozen; regression-test in every phase |
| **Tests** | `test_processing_split.py` (6) + `test_processing_identity.py` pass | Baseline for plan verification |
| **List product filter** | `GET …/processing-workspace/?product_id=` + UI chip | Reuse; add group mode alongside |
| **Peer row numbers** | Preprocessing only (`same_product_row_numbers`) | New workspace list field required |
| **Multi-row select** | Queue selection = active detail row only | Add checkbox multi-select for P5 |
| **Bulk bar / merge UI** | Components exist, **unmounted** | Wire bar; check-in together replaces merge CTA |
| **Check-in together API** | Not present | New op + view action |
| **Single-row check-in** | `processing_row_check_in`, dialogs, P4 guards | Extract shared core for together path |
| **Legacy merge** | `processing_merge_rows` writes manifest match | Do not use for collapse check-in |

**Plan implication:** P5 adds multi-select, list peers, grouped view, new API, and new dialog — not a small toggle on existing UI.

---

## P. Suggested plan phases (for next step — not binding)

1. **Backend peers + together API** — list `sameProductRowNumbers`; `processing_check_in_together`; tests (controllers scenario).
2. **Queue multi-select + peers UI** — checkboxes, peer hint chip, group-by-product toggle.
3. **Check in together dialog + bulk bar** — mount `ProcessingBulkActionBar`; hide merge button; new dialog.
4. **Docs + Session 7 close** — CHANGELOG, pipeline, resolution log.

---

## I. Open questions for owner (not blocking if default OK)

| # | Question | Composer default if silent |
|---|----------|----------------------------|
| 1 | Grouped queue: toggle vs new segment tab? | Toggle **Group by product** in filter row |
| 2 | Check in together: bulk bar vs group header only? | Bulk bar primary when same-product multi-select |
| 3 | One shared price for all rows in group action? | Yes — single price field v1 |
| 4 | Hide legacy **Merge** button when same-product selected? | Hide merge CTA; show **Check in together** instead (merge code stays for P6) |
| 5 | Peer badges on flat list without group mode? | Yes — small "rows 12, 40" hint on each row |
| 6 | Include rows with mixed products in group action? | No — block with clear message |

---

## J. Difficulties encountered (fill during Session 7)

| Date | Difficulty | What I tried | Outcome |
|------|------------|--------------|---------|
| — | *(empty — append as work proceeds)* | | |

---

## K. Resolution log (fill during Session 7)

| Date | Question ref | Decision | Proof |
|------|--------------|----------|-------|
| 2026-06-09 | §B2 group key | Peers keyed on **`ProcessingRow.matched_product_id`** only (not live Item product) | `_same_product_peers_for_order` in `processing_workspace.py`; `test_processing_collapse.py` peer test |
| 2026-06-09 | §C3 together API | **`POST …/processing-check-in-together/`** with shared fields + per-row qty; explicit **`product_mode=existing`** + **`product_id`**; one batch per row | `processing_check_in_together` in `processing_ops.py`; collapse tests |
| 2026-06-09 | §E1 grouped queue | **Group by product** toggle in filter row (client-side headers by `productId`) | `ProcessingFilterRow` + `ProcessingQueueTable` |
| 2026-06-09 | §F1 bulk entry | Multi-select + bulk bar **Check in together** when ≥2 rows share product; hide merge CTA | `ProcessingBulkActionBar`, `ProcessingWorkspacePage` |
| 2026-06-09 | §G1 mixed guard | Reject rows with **`distinct_product_count >= 2`** on together POST | `test_together_rejects_mixed_row` |

---

## L. Acceptance checklist (P5 gate)

Session 7 done when:

1. Workspace can **display** rows grouped by shared `matched_product_id` (group mode or equivalent).
2. Rows show **peer row numbers** for same-product siblings on the processing queue.
3. Staff can select ≥2 same-product rows and **Check in together** from one form.
4. Submit creates Items with **correct per-row `manifest_row_id`** and shared product.
5. Per-row quantities respect remaining/overage rules independently.
6. Mixed-product rows (P4) are **excluded** from group check-in.
7. No new **ManifestRow.matched_product** writes; P1–P4 regressions green.

---

## M. Top mistakes to avoid

1. Calling **`processing_merge_rows`** for collapse check-in (manifest writes + wrong semantics).
2. **Merging ProcessingRow** records or collapsing manifest lines.
3. One combined check-in batch spanning multiple manifest rows (breaks batch/remap model from P4).
4. Grouping by **live Item product** instead of **`ProcessingRow.matched_product_id`** for pre-check-in UX.
5. Breaking **P4 mixed-row guard** by auto-picking product on group POST without explicit id.
6. Pulling **MergeModal retirement** (P6) into P5 without scope approval.

---

## N. Sign-off

**Composer:** This doc records **working hypotheses**, not Fable-approved spec. Implement Session 7 against [`product_identity_design.md`](./product_identity_design.md) §6 + initiative P5 gate; update **Answer** / **Resolution log** as you go.

**Date opened:** 2026-06-09
