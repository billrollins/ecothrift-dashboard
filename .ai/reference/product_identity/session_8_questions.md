<!-- Last updated: 2026-06-09 (Composer — Session 8 working log; readiness audit added) -->

# Session 8 handoff — questions & working notes (P6)

**From:** Composer (implementer, Session 8 prep)  
**For:** Future me + owner — **not** a Fable teaching/review doc  
**Goal:** Record what is unclear, what was hard, and how I resolved it while implementing P6. Update **Answer** blocks as I decide; append to **Resolution log** when code lands.

**Authority stack:**

1. [`product_identity_design.md`](./product_identity_design.md) §8 (deprecations), §6 footnote (MergeModal superseded), Rule 3 — wins on architecture  
2. This file — Session 8 working intent and honest unknowns  
3. [`session_7_questions.md`](./session_7_questions.md) — frozen P5 spec (do not reopen unless bug)

**P6 gate (initiative):** Audit **`ManifestRow`** match-field readers; **stop all writes** to deprecated match columns; retire or re-scope **`MergeModal`** / **`processing_merge_rows`**; docs pass. Columns **flagged** for future drop — **no migration drop** in P6.

---

## How to use this doc (Composer-only)

1. Before coding a slice, skim **Open questions** — if still unanswered, pick a default and note it in **Answer**.  
2. When stuck, add a row to **Difficulties encountered** with what you tried.  
3. When a question is settled in code, append **Resolution log** (one line + test or file pointer).  
4. Do **not** wait for Fable — owner can override in chat; reflect overrides here in one line.  
5. P1–P5 invariants still apply: collapse = check-in together (not merge); split/mixed guards stay intact; no physical **`ProcessingRow`** merge.

---

## Session 7 recap — what P6 builds on

| Shipped (P5) | Relevance to P6 |
|--------------|-----------------|
| **`sameProductRowNumbers`** + peer chips | Collapse UX no longer needs merge for visibility |
| **Group by product** + **Check in together** | Correct collapse path when hints already match |
| **`processing_check_in_together`** | Same-hint multi-row check-in without manifest writes |
| Bulk bar hides **These are the same product** | Merge CTA already gone from happy path — P6 removes dead code |
| **`_check_in_processing_row`** core | Check-in ladder unchanged; P6 must not regress |

**Known debt entering P6:** Legacy **`processing_merge_rows`** still **writes `ManifestRow.matched_product`**, re-points **`Item.product`**, and creates **`ProductMergeAudit`**. **`MergeModal.tsx`** + **`useProcessingMergeRows`** remain in repo but are **unmounted** after P5. **`match-products`** POST still writes manifest match fields. **`refresh_processing_rows_denorm`** still **reads** `ManifestRow.matched_product_id` as fallback when `ProcessingRow.matched_product_id` is null. **`build_processing_row_detail`** still uses `bk.matched_product or mr.matched_product`.

**Design §8 explicit sites to audit:**

- `processing_row_check_in` — ✅ P3 stopped manifest writes at check-in  
- `match-products` + AI match flow in `views.py` — **still writes**  
- `refresh_processing_rows_denorm` — **still reads** manifest match  
- `manual-review` serializers — audit  
- Raw SQL in `.ai/extended/sql/` — audit  

---

## A. P6 scope fence

### A1. What Session 8 must include

**Answer (working):** Initiative P6 gate only:

1. **Writer audit + elimination** — no production code path writes `ManifestRow.matched_product`, `match_status`, `match_candidates`, or `ai_match_decision` after P6 (except data migrations / one-time repair commands explicitly scoped — none in P6 by default).
2. **Reader audit** — inventory every read of deprecated manifest match fields; switch processing/precedence paths to **`ProcessingRow.matched_product`** (+ Item product for dispositioned rows via existing denorm rules).
3. **Retire destructive merge** — remove or hard-disable **`processing_merge_rows`** from staff UI and document replacement; delete **`MergeModal`** wiring paths or the modal itself if unused.
4. **Non-destructive replacement (minimal)** — when staff selected rows with **different** hints need the same product **before** check-in: **`Assign shared product`** API that sets **`ProcessingRow.matched_product_id` only** (no manifest write, no Item FK mutation).
5. **Denorm + detail read paths** — stop falling back to `ManifestRow.matched_product` in `refresh_processing_rows_denorm` and `build_processing_row_detail` once ProcessingRow owns the hint.
6. **Tests + docs** — regression proves no manifest match writes from processing workspace flows; update CHANGELOG, `inventory-pipeline.md`, initiative Session 8 close; flag deprecated columns in model help_text or design doc.

### A2. What Session 8 must NOT include

**Answer (working):**

- **Dropping DB columns** on `ManifestRow` — flag only; drop is a later migration after production soak.
- **Product catalog merge** workflow (design §8 out of scope) — `ProductMergeAudit` may remain for historical rows but no new staff merge-via-manifest flow.
- **P4 / P5 behavior changes** — split chip, mixed guard, together check-in frozen unless regression bug.
- **Final Decisions stepper redesign** — preprocessing match UX stays; only retire duplicate **manifest-level** AI match if it conflicts with P1/P2.
- **Bulk data backfill** rewriting old `ManifestRow.matched_product` values — audit/read path only unless owner pulls a repair command forward.
- **Create Processing Data** retirement — separate legacy-path initiative item.

### A3. Acceptance scenario (staff story)

**Answer (working):**

1. Two manifest lines, **different** finalize hints, staff believes same physical product → multi-select → **Assign shared product** (pick existing catalog product) → both rows show same `productId` + peer chips → **Check in together** works.
2. No **`ManifestRow.matched_product`** changes in DB across the flow (assert in test).
3. Legacy **Merge** button/modal/API unavailable in Item Processor (404 or removed route).
4. **`match-products`** on an in-flight order either removed from UI or converted to read-only / no-op with clear deprecation — **no manifest match writes**.

---

## B. Retire `processing_merge_rows` / `MergeModal`

### B1. Delete vs deprecate endpoint

**Question:** Remove `POST …/processing-merge-rows/` entirely or return 410 with message?

| Option | Pros | Cons |
|--------|------|------|
| **B1a.** Delete view + frontend API | Clean | Breaks any hidden client |
| **B1b.** 410 Gone + log | Safer rollout | Dead code until delete |
| **B1c.** Keep for admin/scripts only | Escape hatch | Violates "no manifest writes" if used |

**Answer (leaning B1b → B1a in same session):** Return **410** with `"Use Assign shared product + Check in together instead."` for one release if worried; **prefer B1a** in greenfield repo — grep confirms **`MergeModal` unmounted** and only **`test_processing_validation_matrix`** calls merge in tests. Update/remove merge tests.

### B2. What merge did that P5 does not replace

| Merge behavior | P5 replacement |
|----------------|----------------|
| Set same product on N manifest rows | **Assign shared product** (ProcessingRow only) when hints differ |
| Re-point existing Items' `product_id` | **Remap batch** (P4) per row, or leave Items — **do not** bulk re-point Items across manifest lines in P6 |
| Create canonical Product from field picker | Final Decisions / Detailed check-in / explicit product pick on assign |
| Write `ManifestRow.matched_product` | **Forbidden** — Rule 3 |

**Answer (working):** P6 **does not** replicate Item re-point across rows. Staff remap per check-in batch if Items already exist with wrong product. Assign + together covers pre-check-in collapse.

### B3. `ProductMergeAudit`

**Answer:** Keep model/table for historical audits. **Stop creating** new rows via `processing_merge_rows`. No UI for audit in P6 unless trivial read-only link already exists.

### B4. Frontend cleanup

**Answer (working):**

- Delete **`MergeModal.tsx`** if no imports remain after workspace pass, **or** keep file but remove export from barrel — prefer **delete** + remove **`useProcessingMergeRows`** + **`processingMergeRows`** API helper if unused elsewhere.
- Confirm **`ProcessingBulkActionBar`** never reintroduces merge CTA (P5 ships **Check in together** only when `sameProduct`).

---

## C. Assign shared product (merge replacement)

### C1. When is it needed?

**Answer:** Selected ≥2 **`processing_row_id`s**, manifest-backed, not mixed (`distinctProductCount < 2`), **may have different `matched_product_id`**, none `row_kind=added` for v1.

Distinct from **Check in together** (requires **same** hint today) — assign is the **hint-alignment** step.

### C2. Backend shape

**Answer (leaning):**

```
POST /api/inventory/orders/{id}/processing-assign-shared-product/
{
  "processing_row_ids": [1, 2, 3],
  "product_mode": "existing",
  "product_id": 42
}
```

Atomic txn: validate rows on order; set **`ProcessingRow.matched_product_id = product_id`**; **`refresh_processing_rows_denorm`**; **`workspace_patch`**. **No** `ManifestRow` touch. **No** `Item` touch.

Optional **`product_mode: new`** with minimal title/brand — **defer** unless cheap reuse of `_resolve_product_for_processing`.

### C3. UI placement

**Answer (leaning):** Bulk bar secondary action when ≥2 rows selected **and not** `sameProduct` but staff intent is clear:

- **Assign shared product…** → small dialog (product search like Final Decisions) → on success, selection stays → staff can **Check in together**.

**Open:** Show assign when any two rows selected regardless of hint? **Leaning yes** — enabled when ≥2 manifest rows, not mixed; disabled for bookmark-only / added rows.

### C4. Final Decisions overlap

**Answer:** Preprocessing **Final Decisions** remains authoritative **before** finalize. Assign shared product is **processing workspace** correction when hints diverged post-finalize or staff skipped peer review — does not write preprocessing staging.

---

## D. ManifestRow match-field writer audit

### D1. Known writers (2026-06-09 grep)

| Site | Writes | P6 action |
|------|--------|-----------|
| **`processing_merge_rows`** | `ManifestRow.matched_product` | **Remove / 410** |
| **`match-products`** (`views.py` ~5213+) | `matched_product`, `match_status`, `ai_match_decision` | **Stop writes** — deprecate endpoint or restrict to read-only candidate preview |
| **`processing_row_check_in`** | — | ✅ Already stopped (P3) |
| **`link_processing_rows_to_manifest_rows`** (`processing_finalize.py`) | Copies `mr.matched_product_id` → `ProcessingRow` on legacy link | **Change:** copy only if `ProcessingRow.matched_product_id` null; **never** write manifest side |
| Manual review PATCH / confirm flows (`views.py` ~1185, ~5557) | Manifest match fields | **Stop writes** — manual review should not set manifest match; use ProcessingRow if anything |

**Answer (working):** Session 8 deliverable includes a **checked-in audit table** (in resolution log or comment block in `session_8_questions.md`) with file:line per writer, each either removed or guarded behind `if False` / deleted.

### D2. `match-products` endpoint fate

**Question:** Staff still use legacy AI manifest matching?

**Answer (leaning):** **Deprecate for new-flow orders** (have `PreprocessingRow` match candidates). Options:

| Option | Answer |
|--------|--------|
| Hide button in UI | Yes if button still exists on old preprocessing surfaces |
| POST returns 410 on orders with finalized preprocessing | Safer |
| Rewrite to populate **`PreprocessingRow`** only | Out of P6 scope |

**Composer default:** **`POST match-products`** returns **400/410** with message to use Final Decisions; remove manifest **`save()`** writes in handler; keep GET/list reads if needed for legacy order display.

---

## E. ManifestRow match-field reader audit

### E1. Processing workspace / denorm

| Site | Read | P6 action |
|------|------|-----------|
| **`refresh_processing_rows_denorm`** `m_match` dict (~667–668, fallback ~742–743) | `ManifestRow.matched_product_id` | **Remove fallback** — use `ProcessingRow.matched_product_id`, then `primary_product_id_for_items`, then null |
| **`build_processing_row_detail`** `prod = bk.matched_product or mr.matched_product` (~1201) | manifest match | **Use `bk.matched_product` only**; manifest evidence block stays vendor claim without match FK |
| **`link_processing_rows_to_manifest_rows`** | reads manifest match | See D1 — one-way copy only when PR null |

**Answer (working):** After P6, **`coalesce_processing_row_identity`** inputs should never prefer manifest **`matched_product`** over ProcessingRow decided match.

### E2. Other readers

| Site | P6 action |
|------|-----------|
| **`match-products` GET/stats** | Read-only OK temporarily |
| **`manual-review` serializers** | Display manifest match as **legacy read-only** badge or drop field from PATCH payload |
| **Admin `ManifestRow`** inline | Read-only display OK |
| **`.ai/extended/sql/`** | Grep + comment "deprecated column" in any report SQL touched |
| **`test_processing_validation_matrix` merge tests** | Replace with assign-shared + together tests; assert `mr.matched_product_id` unchanged |

### E3. `manifestEvidence` on row detail

**Answer:** Keep read-only vendor-side fields from **`ManifestRow`** (title, brand, unit_retail, etc.) — **not** the deprecated **`matched_product`** FK. If detail today exposes manifest matched product, rename to legacy or remove from JSON.

---

## F. Tests

### F1. New / updated tests

**Answer (working):** Extend **`test_processing_collapse.py`** or new **`test_processing_deprecation.py`**:

| Test | Covers |
|------|--------|
| Assign shared product on 2 rows with different hints → same `ProcessingRow.matched_product_id`, manifest FK unchanged | C2 / staff story |
| Merge endpoint 410/404 | B1 |
| Denorm refresh does not read manifest match when PR hint set | E1 |
| `match-products` POST does not mutate manifest match (or returns 410) | D2 |
| Together still works after assign | P5 regression |

Keep **`test_processing_split`**, **`test_processing_identity`**, **`test_processing_validation_matrix`** green — update matrix merge cases.

### F2. Grep gate (CI-friendly optional)

**Answer (optional script):** `rg "matched_product\s*=" apps/inventory --glob '*.py'` excludes migrations/tests comments — manual review in PR. Not required if tests cover writers.

---

## G. Docs + column flagging

### G1. Docs touch list

| Doc | Update |
|-----|--------|
| **`CHANGELOG.md`** | P6: merge retired, assign shared product, manifest match writes stopped |
| **`inventory-pipeline.md`** | Remove merge from processing step; note deprecated manifest match columns |
| **`product_identity_design.md`** | Tick §8 audit items if all sites addressed |
| **`session_8_questions.md`** | Resolution log |
| **Initiative Session 8 block** | Result when done |

### G2. Column deprecation flag

**Answer:** Add **`help_text`** on `ManifestRow.matched_product` (and related fields): "Deprecated — use PreprocessingRow.final_matched_product / ProcessingRow.matched_product. Do not write." **No drop migration.**

---

## H. Files I expect to touch

| Layer | Files |
|-------|-------|
| Merge removal | `processing_ops.py` — remove/guard `processing_merge_rows`; `views.py` — remove merge action |
| Assign shared product | `processing_ops.py`, `views.py` |
| Denorm / detail reads | `processing_workspace.py` — `refresh_processing_rows_denorm`, `build_processing_row_detail`, `link_processing_rows_to_manifest_rows` |
| Manifest AI match | `views.py` — `match-products`, manual-review PATCH writers |
| Frontend | Remove `MergeModal`, merge API/hook; bulk bar **Assign shared product** dialog; optional deprecation snackbar |
| Tests | `test_processing_validation_matrix.py`, new deprecation/collapse tests |
| Models | `models.py` help_text only |
| Docs | CHANGELOG, pipeline, initiative |

---

## O. Codebase readiness audit (2026-06-09 — pre-plan)

| Area | State | Session 8 implication |
|------|--------|------------------------|
| **P5 collapse** | Shipped: peers, group mode, together API, bulk bar | Frozen baseline |
| **Merge UI** | `MergeModal` exists; **unmounted** after P5 | Safe to delete API + modal |
| **`processing_merge_rows`** | Live; writes manifest + Items | Primary removal target |
| **Check-in together** | Handles same-hint collapse | Keep; add assign for diff-hint path |
| **Denorm manifest fallback** | Still reads `ManifestRow.matched_product_id` | Must remove in P6 |
| **Detail `mr.matched_product`** | Fallback in coalesce | Must remove in P6 |
| **`match-products`** | Writes manifest match | Deprecate/stop writes |
| **Tests** | Matrix includes merge success tests | Rewrite for new model |
| **P3 check-in** | No manifest write at check-in | Verify unchanged |

**Plan implication:** P6 is mostly **subtraction + read-path cleanup** plus one **small additive** API (assign shared product). Not a large UI phase like P5.

---

## P. Suggested plan phases (for next step — not binding)

1. **Writer elimination** — disable merge + match-products writes; grep audit table.  
2. **Reader cleanup** — denorm + row detail; finalize link helper.  
3. **Assign shared product** — API + bulk dialog + tests.  
4. **Frontend dead code removal** — MergeModal, hooks, merge tests update.  
5. **Docs + Session 8 close** — CHANGELOG, pipeline, help_text, resolution log.

---

## I. Open questions for owner (not blocking if default OK)

| # | Question | Composer default if silent |
|---|----------|----------------------------|
| 1 | Delete merge endpoint or 410 first? | **410** one commit then delete in same session if tests updated |
| 2 | Ship **Assign shared product** in P6? | **Yes** — minimal merge replacement |
| 3 | **`match-products`**: 410 vs silent no-op? | **410** with message pointing to Final Decisions |
| 4 | Re-point Items when hints aligned? | **No** — assign hint only; use P4 remap per batch if Items exist |
| 5 | Drop `MergeModal` file or keep unused? | **Delete** + remove API |
| 6 | Manual review manifest match PATCH? | **Stop writes**; display legacy value read-only if present |

---

## J. Difficulties encountered (fill during Session 8)

| Date | Difficulty | What I tried | Outcome |
|------|------------|--------------|---------|
| 2026-06-09 | `test_denorm_backfill_includes_product_tokens_same_pass` assumed manifest → PR backfill | Split test: assert no manifest backfill when PR hint null; set PR hint explicitly for token augment pass | Green under P6 reader rules |

---

## K. Resolution log (fill during Session 8)

| Date | Question ref | Decision | Proof |
|------|--------------|----------|-------|
| 2026-06-09 | B1 | Delete merge endpoint + tests (clean removal) | `processing_merge_rows` removed from `processing_ops.py` / `views.py`; merge tests removed from matrix |
| 2026-06-09 | C2 | **`POST …/processing-assign-shared-product/`** — `product_mode=existing` only | `test_assign_aligns_processing_rows_without_manifest_write` |
| 2026-06-09 | D2 | **`match-products`** POST → **410 Gone** | `test_match_products_returns_410` |
| 2026-06-09 | E1 | Denorm/detail no manifest match fallback | `test_denorm_does_not_adopt_manifest_match_when_pr_hint_set` |
| 2026-06-09 | D1 | `ensure_manifest_products_and_items`, check-in queue, finalize link — PR-only writes | `test_preprocessing_redesign` + assign/together tests |
| 2026-06-09 | G2 | **`help_text`** on deprecated ManifestRow match fields | `apps/inventory/models.py` |
| 2026-06-09 | A3 staff story | Assign → together; manifest FK unchanged | `test_after_assign_check_in_together_succeeds` |

---

## L. Acceptance checklist (P6 gate)

Session 8 done when:

1. **No production writer** sets `ManifestRow.matched_product` / related deprecated match fields (grep + tests).
2. **Processing denorm + detail** no longer fall back to manifest **`matched_product`** for identity.
3. **`processing_merge_rows`** unavailable to staff (removed or 410).
4. **`MergeModal`** / merge hook removed from frontend.
5. **Assign shared product** (or equivalent) lets staff align **`ProcessingRow.matched_product_id`** across rows without manifest/Item mutation.
6. **`match-products`** (and manual-review writers) audited — no manifest match writes on new paths.
7. Deprecated columns **documented** in model help_text / design doc; P1–P5 regressions green.

---

## M. Top mistakes to avoid

1. **Reintroducing manifest writes** in assign-shared or denorm "helpful" sync.  
2. **Bulk re-pointing Items** across manifest lines (old merge semantics) — use batch remap per row.  
3. **Dropping DB columns** in P6 without soak period.  
4. **Breaking check-in together** when changing denorm fallback order.  
5. **Leaving merge tests** that assert `ManifestRow.matched_product_id` equality — opposite of Rule 3.  
6. **Rewriting Final Decisions** instead of scoped manifest writer removal.

---

## N. Sign-off

**Composer:** This doc records **working hypotheses**, not Fable-approved spec. Implement Session 8 against [`product_identity_design.md`](./product_identity_design.md) §8 + initiative P6 gate; update **Answer** / **Resolution log** as you go.

**Date opened:** 2026-06-09
