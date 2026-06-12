<!-- Last updated: 2026-06-09 — post Session 8 (P6) -->
<!-- Purpose: exhaustive verification for Sessions 4–8 (P2–P6 product identity phases) -->

# Sessions 4–8 verification checklist (P2–P6)

**Use this doc** after any change touching preprocessing match decisions, processing workspace identity, split/collapse, or manifest match deprecation. Work top-to-bottom: automated gates first, then static review, then manual QA on a real PO.

**Authority:** [`product_identity_design.md`](./product_identity_design.md) → session handoffs [`session_4_handoff_questions.md`](./session_4_handoff_questions.md) through [`session_8_questions.md`](./session_8_questions.md).

**Phase map:**

| Session | Phase | Theme |
|---------|-------|--------|
| 4 | P2 | Final Decisions UI + match decisions on staging |
| 5 | P3 | Product-wins reads + check-in ladder; stop manifest writes at check-in |
| 6 | P4 | Split — one row → N products |
| 7 | P5 | Collapse — N rows → 1 product (check in together) |
| 8 | P6 | Manifest match deprecation + assign shared product |

---

## 0. Quick pass (≈5 min)

Run these before any deeper review:

```bash
# Backend — product-identity regression bundle (132+ tests)
pytest apps/inventory/tests/test_product_matching.py \
  apps/inventory/tests/test_preprocessing_redesign.py \
  apps/inventory/tests/test_processing_identity.py \
  apps/inventory/tests/test_processing_split.py \
  apps/inventory/tests/test_processing_collapse.py \
  apps/inventory/tests/test_processing_deprecation.py \
  apps/inventory/tests/test_processing_validation_matrix.py \
  -q

# Frontend types
cd frontend && npx tsc --noEmit
```

**Pass criteria:** zero failures; tsc exit 0.

Optional wider net (if you touched unrelated inventory):

```bash
pytest apps/inventory/tests/ -q --ignore=apps/inventory/tests/test_intake_undo.py
```

---

## 1. Cross-session invariants (must never regress)

These apply across **all** Sessions 4–8. Treat any violation as a release blocker.

### 1.1 Rule 3 — manifest match is not staff identity

| # | Invariant | How to verify |
|---|-----------|---------------|
| I-1 | **`POST …/processing-row-check-in/`** never sets `ManifestRow.matched_product_id` | `CheckInManifestWriteTests::test_check_in_does_not_write_manifest_matched_product` |
| I-2 | **`POST …/processing-check-in-together/`** never sets manifest match | `CheckInTogetherTests::test_together_check_in_creates_items_with_distinct_manifest_rows` |
| I-3 | **`POST …/processing-assign-shared-product/`** never sets manifest match | `test_assign_aligns_processing_rows_without_manifest_write` |
| I-4 | **`POST …/match-products/`** returns **410** and writes nothing | `test_match_products_returns_410` |
| I-5 | **`POST …/processing-merge-rows/`** is gone (404) | `test_merge_endpoint_removed` |
| I-6 | Denorm does **not** adopt manifest match when PR hint is set | `test_denorm_does_not_adopt_manifest_match_when_pr_hint_set` |
| I-7 | Denorm does **not** backfill PR hint from manifest (P6) | `test_denorm_backfill_includes_product_tokens_same_pass` — first pass asserts `pr.matched_product_id is None` |
| I-8 | Row detail identity uses **`ProcessingRow.matched_product` only** (not manifest FK) | `ProcessingRowDetailMatchTests::test_detail_uses_processing_row_match_over_manifest`; `WorkspaceListDetailTests::test_detail_coalesces_and_includes_manifest_evidence` |

### 1.2 Precedence — product wins identity, row wins transaction

| # | Invariant | How to verify |
|---|-----------|---------------|
| I-9 | List/detail title/brand/category coalesce from product when matched | `test_product_wins_over_row_and_manifest`, `test_list_shows_coalesced_product_title`, `test_api_list_returns_coalesced_title` |
| I-10 | `manifestEvidence` on detail is vendor claim, separate from product chip | `test_detail_coalesces_and_includes_manifest_evidence` |
| I-11 | `search_string` keeps **both** row tokens and product augment (G1) | `test_search_string_keeps_row_and_product_tokens`; search workspace by manifest wording **and** product title |
| I-12 | Row-default **`PATCH …/processing-row-patch/`** writes bookmark columns only (not Product) | `test_processing_row_patch_updates_defaults_without_creating_items` |

### 1.3 Split vs collapse semantics

| # | Invariant | How to verify |
|---|-----------|---------------|
| I-13 | Never merge/delete **`ProcessingRow`** or **`ManifestRow`** for collapse | Code review: no bulk delete of PR/MR in together/assign paths |
| I-14 | Collapse check-in creates **one Item set per manifest line** with correct `manifest_row_id` | `test_together_check_in_creates_items_with_distinct_manifest_rows` |
| I-15 | Split rows reject implicit quick check-in when ≥2 products | `test_implicit_check_in_on_mixed_row_returns_400` |
| I-16 | Batch remap is atomic per batch, not cross-row | `test_remap_batch_updates_items_and_denorm` |

### 1.4 Preprocessing match authority

| # | Invariant | How to verify |
|---|-----------|---------------|
| I-17 | Staff `final_matched_product` survives **`regenerate-match-candidates`** | `test_staff_decision_never_overridden_on_regenerate` |
| I-18 | Finalize copies **`final_matched_product` → `ProcessingRow.matched_product`** | `test_finalize_copies_decided_match_to_processing_row` |
| I-19 | Staff-null (cleared match) respected on regenerate | `test_regenerate_respects_staff_null` |
| I-20 | UPC exact auto-selects with `match_source='auto'` | `test_upc_exact_match_creates_candidate_and_auto_selects` |

---

## 2. Static code review (grep gates)

Run from repo root. **Review every hit manually** — not all matches are bugs (tests, model defs, read-only selects, legacy bootstrap).

### 2.1 Manifest match **writers** (should be none on staff paths)

```bash
# ManifestRow matched_product assignment in production code (exclude tests/migrations)
rg "mr\.matched_product\s*=|ManifestRow.*matched_product\s*=" apps/inventory \
  --glob '*.py' --glob '!**/tests/**' --glob '!**/migrations/**'

# match_status / ai_match_decision writes on ManifestRow
rg "match_status\s*=|ai_match_decision\s*=" apps/inventory/views.py \
  --glob '*.py' --glob '!**/tests/**'

# bulk_update on manifest match fields
rg "bulk_update.*matched_product|'match_status'|'ai_match_decision'" apps/inventory \
  --glob '*.py' --glob '!**/tests/**'
```

**Expected after P6:**

- No `mr.matched_product =` in `views.py` check-in / together / assign / ensure_manifest paths.
- `match_products` handler body is 410-only (no save loop).
- `processing_merge_rows` **absent** from `processing_ops.py` and `views.py`.
- Acceptable: `ManifestRow.objects.create(..., matched_product=None, match_status='pending')` on **new row creation** only.
- Acceptable: **one-way bootstrap** `pr.matched_product_id = mr.matched_product_id` when PR hint is null in `link_processing_rows_to_manifest_rows` / finalize link helper.

### 2.2 Manifest match **readers** in processing identity paths

```bash
rg "mr\.matched_product|m_match|matched_product or mr" \
  apps/inventory/services/processing_workspace.py

rg "bk\.matched_product or mr\.matched_product" apps/inventory --glob '*.py'
```

**Expected after P6:**

- `build_processing_row_detail`: `prod = bk.matched_product` (no `or mr.matched_product`).
- `refresh_processing_rows_denorm`: no `m_match` dict / manifest fallback block.

### 2.3 Frontend dead code (P6)

```bash
rg "MergeModal|processingMergeRows|useProcessingMergeRows" frontend/src
rg "processing-merge-rows" frontend/src apps/inventory
```

**Expected:** zero hits.

### 2.4 Required endpoints exist

```bash
rg "processing-assign-shared-product|processing-check-in-together|regenerate-match-candidates" \
  apps/inventory/views.py frontend/src/api/inventory.api.ts
```

**Expected:** all three wired in views + API client + hooks.

### 2.5 ProcessingRow match writes (should exist)

```bash
rg "ProcessingRow.*matched_product|pr\.matched_product" apps/inventory/processing_ops.py \
  apps/inventory/services/processing_workspace.py apps/inventory/views.py \
  --glob '*.py' --glob '!**/tests/**'
```

**Expected:** check-in, together, assign, ensure_manifest, finalize copy — all touch **ProcessingRow** only.

---

## 3. Session 4 — P2 Final Decisions UI

**Gate doc:** [`session_4_handoff_questions.md`](./session_4_handoff_questions.md) §L.

### 3.1 Automated tests

| Test file | Tests to run / spot-check |
|-----------|---------------------------|
| `test_product_matching.py` | All 18 tests — core P1+P2 backend |
| `test_preprocessing_redesign.py` | `test_finalize_preprocessing_*`, `test_preprocessing_review_patch_*`, finalize preserves staff review |

```bash
pytest apps/inventory/tests/test_product_matching.py -q
pytest apps/inventory/tests/test_preprocessing_redesign.py -k "finalize or review_patch or matched" -q
```

**High-value individual tests:**

- `test_patch_sets_final_matched_product_as_staff`
- `test_patch_clears_match_as_staff_decision`
- `test_regenerate_returns_summary`
- `test_matched_product_detail_hydrated`
- `test_same_product_row_numbers`
- `test_finalize_copies_decided_match_to_processing_row`
- `test_detail_uses_processing_row_match_over_manifest`

### 3.2 Code review checklist

- [ ] Stepper label **Final Decisions** in `PreprocessingStepper.tsx` / `PreprocessingPage.tsx` STEP 3.
- [ ] `PreprocessingMatchCell.tsx` implements five chip states (auto, staff, candidates, new, empty).
- [ ] Review GET exposes `match_candidates`, `final_matched_product`, `match_source`, `matched_product_detail`, `same_product_row_numbers`.
- [ ] Review PATCH sets `match_source='staff'` on match decisions; match-only PATCH does not clear `ai_status`.
- [ ] `POST …/regenerate-match-candidates/` exists and preserves staff decisions.
- [ ] Bulk pricing: scale % / target total / % of retail — **never writes $0.00** over rows without base (see session 4 §P).
- [ ] `build_processing_row_detail` prefers `bk.matched_product` (P2 server fix — still valid in P6 as **only** bk, no manifest).
- [ ] Dead panels `ProductMatchingPanel.tsx` / `MatchReviewPanel.tsx` not wired to current flow.

### 3.3 Manual QA — Final Decisions (use staging PO)

Prep: PO with cleanup applied, not finalized.

1. Open **Preprocessing → Step 3 Final Decisions**.
2. Confirm every row shows a match chip (one of five states).
3. Click top UPC candidate → chip turns staff-green → **refresh page** → still green.
4. Inline catalog search → pick product → chip updates.
5. Clear to **New product** → run **Refresh matches** → row stays undecided (no auto re-select).
6. On order skipped cleanup: **Refresh matches** populates candidates.
7. Two rows same product → **also rows N, M** badge on both (paginate if needed).
8. Bulk pricing: run Adjust % and Target total — relative prices preserved; % of retail skips unpriced rows.
9. **Finalize preprocessing** → open Item Processor → list **and** row detail show same `productId` for matched rows.

### 3.4 API spot checks (curl / Django shell / browser network)

```http
GET  /api/inventory/orders/{id}/preprocessing-review/
PATCH /api/inventory/orders/{id}/preprocessing-review/  { row patches with final_matched_product }
POST /api/inventory/orders/{id}/regenerate-match-candidates/
POST /api/inventory/orders/{id}/finalize-preprocessing/
```

After finalize, verify in DB:

```sql
SELECT pr.row_number, pr.matched_product_id, ppr.final_matched_product_id
FROM inventory_processingrow pr
JOIN inventory_preprocessingrow ppr ON ppr.manifest_row_id = pr.manifest_row_id
WHERE pr.purchase_order_id = :po_id
ORDER BY pr.row_number;
```

**Expect:** `pr.matched_product_id = ppr.final_matched_product_id` for decided rows.

---

## 4. Session 5 — P3 Precedence reads + check-in ladder

**Gate doc:** [`session_5_questions.md`](./session_5_questions.md) §K.

### 4.1 Automated tests

```bash
pytest apps/inventory/tests/test_processing_identity.py -q
pytest apps/inventory/tests/test_processing_validation_matrix.py -k "check_in or augment_search or coalesce" -q
```

**Must pass:**

- `test_product_wins_over_row_and_manifest`
- `test_search_string_keeps_row_and_product_tokens`
- `test_check_in_does_not_write_manifest_matched_product`
- `test_processing_row_check_in_reuses_latest_batch_product` (≤1 product rows)
- `test_augment_search_string_includes_product_and_item_sku`

### 4.2 Code review checklist

- [ ] `coalesce_processing_row_identity` (or equivalent) used for list + detail serializers.
- [ ] Workspace list hydrates minimal nested `product` when matched.
- [ ] Check-in product resolution: prior batch → **`ProcessingRow.matched_product`** — no manifest match in ladder.
- [ ] `_check_in_processing_row` / `processing_row_check_in` syncs `ProcessingRow.matched_product_id` when product resolved — **not** `ManifestRow`.
- [ ] `ProcessingCheckInDialog` defaults to **`keep`** when row has decided product.
- [ ] No `PreprocessingPage` changes required for P3 (regression: stepper still works).

### 4.3 Manual QA — precedence

Use a finalized PO where manifest title ≠ product title (e.g. manifest "hdbnd red", product "Red Headband").

1. **Queue:** row shows product title, not manifest wording.
2. **Row detail:** same coalesced title; manifest wording visible in evidence section only.
3. **Row default pills:** show coalesced values.
4. **Detailed check-in:** product fields prefilled from matched product; price/qty from row.
5. **Quick check-in** on row with one prior batch → reuses batch product.
6. **Search workspace** by manifest wording → row found.
7. **Search workspace** by product title → row found.
8. After check-in, re-search by Item SKU → row found.

### 4.4 DB assertion script

```python
# Django shell — after any check-in on manifest-backed row
from apps.inventory.models import ManifestRow, ProcessingRow, Item
mr = ManifestRow.objects.get(pk=...)
pr = ProcessingRow.objects.get(manifest_row_id=mr.id)
assert mr.matched_product_id is None  # or unchanged from before check-in
assert Item.objects.filter(manifest_row_id=mr.id).exists()
```

---

## 5. Session 6 — P4 Split (1 row → N products)

**Gate doc:** [`session_6_questions.md`](./session_6_questions.md) §L.

### 5.1 Automated tests

```bash
pytest apps/inventory/tests/test_processing_split.py -q
```

**Must pass (all 6):**

- `test_two_check_ins_two_products_updates_denorm`
- `test_primary_matched_product_is_most_units_product`
- `test_implicit_check_in_on_mixed_row_returns_400`
- `test_explicit_product_on_mixed_row_succeeds`
- `test_remap_batch_updates_items_and_denorm`
- `test_crayons_scenario_totals`

### 5.2 Code review checklist

- [ ] `ProcessingRow.distinct_product_count` denormalized in `refresh_processing_rows_denorm`.
- [ ] List payload includes `distinctProductCount`; queue shows **N products** chip when ≥2.
- [ ] Quick check-in blocked on mixed rows in **backend** (not UI-only).
- [ ] `ProcessingActiveCard` / checked-in history groups units by product.
- [ ] `POST …/processing-check-in-batch/{id}/remap-product/` exists; updates all Items in batch atomically.
- [ ] Primary `matched_product_id` on denorm = most-units product among dispositioned items.
- [ ] `RemapBatchProductDialog.tsx` wired in workspace.

### 5.3 Manual QA — crayons scenario

1. One manifest line qty 24 (or use test PO).
2. Detailed check-in qty 10 → product A.
3. Detailed check-in qty 14 → product B.
4. Queue shows **2 products** chip.
5. Quick check-in button disabled or 400 with clear message.
6. Row detail: two product groups in checked-in history.
7. Remap first batch from A → C → all 10 Items point to C; denorm updates.
8. Totals: 10 + 14 Items, distinct products correct.

### 5.4 API negative test

```http
POST /api/inventory/orders/{id}/processing-row-check-in/
{ "processing_row_id": <mixed_row>, "quantity": 1 }
# Expect 400 without explicit product_mode + product_id
```

---

## 6. Session 7 — P5 Collapse (N rows → 1 product)

**Gate doc:** [`session_7_questions.md`](./session_7_questions.md) §L.

### 6.1 Automated tests

```bash
pytest apps/inventory/tests/test_processing_collapse.py -q
```

**Must pass (all 5):**

- `test_list_includes_peer_row_numbers_excluding_self`
- `test_together_check_in_creates_items_with_distinct_manifest_rows`
- `test_together_rejects_single_row`
- `test_together_rejects_mismatched_product_id`
- `test_together_rejects_mixed_row`

### 6.2 Code review checklist

- [ ] `_same_product_peers_for_order` keys on **`ProcessingRow.matched_product_id`** (not live Item product).
- [ ] List field `sameProductRowNumbers` populated; peer chips in `ProcessingQueueTable`.
- [ ] **Group by product** toggle in `ProcessingFilterRow` (client-side grouping by `productId`).
- [ ] `ProcessingBulkActionBar` shows **Check in together** when ≥2 selected + same `productId`.
- [ ] **No** merge CTA when same-product selected (P5); merge fully removed in P6.
- [ ] `processing_check_in_together` creates **one batch per row**; Items keep per-row `manifest_row_id`.
- [ ] Together POST rejects `distinct_product_count >= 2`.

### 6.3 Manual QA — same-hint collapse

Prep: two manifest lines, same `ProcessingRow.matched_product_id` (from Final Decisions or assign — see Session 8).

1. Both rows show peer chips ("Same as row N").
2. Enable **Group by product** → rows cluster under product header.
3. Multi-select both → **Check in together** visible.
4. Submit shared condition/price; per-row qty 1 each.
5. DB: 2 Items, different `manifest_row_id`, same `product_id`.
6. `ManifestRow.matched_product_id` unchanged on both lines.

### 6.4 Manual QA — guard rails

- Select 1 row → together action disabled or 400.
- Select 2 rows with **different** `productId` → together hidden (P5); assign shown (P6).
- Select mixed split row + any other → together blocked.

---

## 7. Session 8 — P6 Manifest match deprecation

**Gate doc:** [`session_8_questions.md`](./session_8_questions.md) §L.

### 7.1 Automated tests

```bash
pytest apps/inventory/tests/test_processing_deprecation.py -q
pytest apps/inventory/tests/test_preprocessing_redesign.py -k "ensure_manifest" -q
```

**Must pass:**

- `test_assign_aligns_processing_rows_without_manifest_write`
- `test_after_assign_check_in_together_succeeds`
- `test_merge_endpoint_removed`
- `test_match_products_returns_410`
- `test_denorm_does_not_adopt_manifest_match_when_pr_hint_set`
- `test_ensure_manifest_products_and_items_is_idempotent`

### 7.2 Code review checklist

- [ ] `processing_assign_shared_product` in `processing_ops.py` — validates ≥2 rows, not mixed, not added-only.
- [ ] Sets **`ProcessingRow.matched_product_id` only**; calls `refresh_processing_rows_denorm` + workspace patch.
- [ ] `match_products` view returns **410 Gone** with helpful message.
- [ ] `ensure_manifest_products_and_items` — no manifest `bulk_update` on match fields; syncs PR hints.
- [ ] `_build_check_in_queue_from_manifest` — no `row.matched_product = product` save on ManifestRow.
- [ ] `ManifestRow.matched_product` / `match_status` / `match_candidates` / `ai_match_decision` have deprecated **`help_text`** in `models.py`.
- [ ] `ProductMergeAudit` model retained; no new audits from merge API.
- [ ] Docs: CHANGELOG, `inventory-pipeline.md`, initiative Session 8 **Done**, resolution log in `session_8_questions.md`.

### 7.3 Manual QA — diff-hint collapse (P6 staff story)

1. Two manifest lines with **different** finalize hints (different `productId` in queue).
2. Multi-select both → **Assign shared product** (not together).
3. Pick existing catalog product → both rows show same `productId` + peer chips.
4. **Check in together** → Items created; manifest match FKs **unchanged**.
5. Optional: attempt legacy merge URL → 404.

### 7.4 Manual QA — deprecated endpoints

```http
POST /api/inventory/orders/{id}/match-products/     → 410
POST /api/inventory/orders/{id}/processing-merge-rows/ → 404
```

### 7.5 Legacy bootstrap edge case

For old orders where `ManifestRow.matched_product_id` was set historically but PR hint is null:

- `link_processing_rows_to_manifest_rows` may copy MR → PR **once** (bootstrap only).
- Denorm must **not** overwrite an explicit PR hint from manifest.
- Verify with unit test + manual order if you maintain legacy cohort data.

---

## 8. Full regression matrix (by file)

Use when you need traceability from test file → sessions.

| Test file | Sessions covered | Count (approx) |
|-----------|------------------|----------------|
| `test_product_matching.py` | P1 backend + P2 API | 18 |
| `test_preprocessing_redesign.py` | Intake + finalize + ensure_manifest | 50+ |
| `test_processing_identity.py` | P3 precedence + P6 denorm | 7 |
| `test_processing_split.py` | P4 split | 6 |
| `test_processing_collapse.py` | P5 collapse | 5 |
| `test_processing_deprecation.py` | P6 deprecation | 5 |
| `test_processing_validation_matrix.py` | Workspace baseline + check-in | 40+ |

**Suggested pytest markers by session:**

```bash
# Session 4 focus
pytest apps/inventory/tests/test_product_matching.py \
  apps/inventory/tests/test_preprocessing_redesign.py -k "finalize or review or regenerate" -q

# Session 5 focus
pytest apps/inventory/tests/test_processing_identity.py -q

# Session 6 focus
pytest apps/inventory/tests/test_processing_split.py -q

# Session 7 focus
pytest apps/inventory/tests/test_processing_collapse.py -q

# Session 8 focus
pytest apps/inventory/tests/test_processing_deprecation.py \
  apps/inventory/tests/test_processing_identity.py::SearchStringIdentityTests::test_denorm_backfill_includes_product_tokens_same_pass -q
```

---

## 9. Frontend review checklist

### 9.1 Preprocessing (Session 4)

- [ ] `PreprocessingPage.tsx` — STEP 3 title **Final Decisions**.
- [ ] `PreprocessingReviewTable.tsx` — match column + pricing toolbar.
- [ ] `PreprocessingMatchCell.tsx` — candidate chips, confirm, clear, inline search.
- [ ] Types in `inventory.api.ts` — `PreprocessingReviewRow` includes match fields.
- [ ] Regenerate matches button calls correct endpoint.

### 9.2 Processing workspace (Sessions 5–8)

- [ ] `ProcessingQueueTable.tsx` — peer chips, N-products chip, coalesced title.
- [ ] `ProcessingFilterRow.tsx` — Group by product toggle.
- [ ] `ProcessingBulkActionBar.tsx` — together vs assign branching.
- [ ] `CheckInTogetherDialog.tsx` — per-row qty, shared fields.
- [ ] `AssignSharedProductDialog.tsx` — product search, submit patch.
- [ ] `ProcessingCheckInDialog.tsx` — keep mode default when matched; mixed row guard in UI.
- [ ] `RemapBatchProductDialog.tsx` — P4 remap still works.
- [ ] `useProcessingWorkspace.ts` — hooks for together + assign; **no** merge hook.
- [ ] `inventory.api.ts` — `processingAssignSharedProduct`, `processingCheckInTogether`; no `processingMergeRows`.

### 9.3 Frontend smoke (manual, ~15 min)

1. Finalize a PO → open workspace → no console errors.
2. Toggle group mode → layout updates.
3. Select rows → bulk bar buttons match state (same vs different product).
4. Assign dialog → search → submit → queue refreshes via workspace patch.
5. Together dialog → check-in → print flow optional.
6. Mixed row → quick check-in disabled with tooltip/message.

### 9.4 Frontend unit tests (if present)

```bash
cd frontend && npm test -- --run checkedInHistory 2>/dev/null || npx vitest run src/pages/inventory/processing/checkedInHistory.test.ts
```

---

## 10. Documentation consistency audit

After code changes, confirm docs match behavior:

| Doc | What to verify |
|-----|----------------|
| `CHANGELOG.md` [Unreleased] | P2–P6 bullets accurate |
| `.ai/extended/inventory-pipeline.md` | Step 6 Final Decisions; step 9 P4/P5/P6; no MergeModal |
| `.ai/extended/frontend.md` | Workspace mentions Assign + Together, not Merge |
| `.ai/initiatives/intake_processing_improvements.md` | Sessions 4–8 **Done** with Result blocks |
| `session_*_questions.md` | Resolution logs filled for closed sessions |
| `product_identity_design.md` §8 | Audit items ticked / P6 note |
| `bulk_raise_line_prices_by_po.sql` | Deprecation comment on `mr.matched_product_id` |

---

## 11. Extended scenarios (optional deep QA)

Run when preparing release or after large refactors.

### 11.1 End-to-end happy path (new-flow PO)

1. Upload manifest → standardize → cleanup CSV apply (candidates auto-generate).
2. Final Decisions: decide matches for 10 rows including 2 same-product siblings.
3. Bulk price with % of retail.
4. Finalize → workspace: coalesced titles, peer chips on siblings.
5. Check in 3 rows individually (quick + detailed).
6. Split one row into 2 products (P4).
7. Assign shared product on 2 diff-hint rows → together check-in (P6).
8. Mark order complete when all dispositioned.

### 11.2 Edge cases

| Scenario | Expected |
|----------|----------|
| Added row (`row_kind=added`) | Excluded from together/assign |
| Bookmark-only order (no manifest link) | Legacy build flag; assign/together require manifest-backed |
| Overage check-in qty > manifest qty | Allowed; `test_check_in_overage_beyond_manifest_qty` |
| Regenerate after staff clear | Stays null |
| Manual review PATCH on manifest row | Does not write manifest match fields (read/display only) |
| Re-open workspace after assign | `sameProductRowNumbers` updated |
| Print multiple + dispute + bulk disposition | Still row-first; matrix tests pass |

### 11.3 Performance / query sanity

From `test_processing_validation_matrix.py`:

- `test_lazy_workspace_list_queries_skip_manifest_reads`
- `test_processing_row_detail_query_count_bounded_no_manifest_bulk_load`
- `test_purchase_order_retrieve_bounded_queries_no_live_stats`

Re-run if you change workspace serializers or prefetch graphs.

### 11.4 Report / SQL audit (deferred but flag)

```bash
rg "mr\.matched_product|manifestrow.*matched_product" .ai/extended/sql apps/inventory --glob '*.{sql,py}'
```

Document any remaining readers; plan migration before column drop.

---

## 12. Sign-off template

Copy into PR description or session close notes:

```markdown
## Sessions 4–8 verification

- [ ] Master pytest bundle green (§0)
- [ ] tsc green
- [ ] Cross-session invariants I-1–I-20 spot-checked
- [ ] Grep gates §2 — no unexpected manifest writers
- [ ] Session 4 manual Final Decisions pass
- [ ] Session 5 precedence + search pass
- [ ] Session 6 crayons / mixed guard pass
- [ ] Session 7 together + peers pass
- [ ] Session 8 assign → together + 410/404 pass
- [ ] Docs audit §10

Notes:
```

---

## 13. When something fails — triage map

| Symptom | Likely session | First file to inspect |
|---------|----------------|------------------------|
| Match lost after finalize | P2 / P1 | `processing_finalize.py`, `test_finalize_copies_*` |
| Detail shows wrong product | P2/P3/P6 | `build_processing_row_detail` |
| List title not coalesced | P3 | `coalesce_processing_row_identity`, list serializer |
| Manifest match set after check-in | P3/P6 regression | `processing_ops.py` `_check_in_processing_row` |
| Quick check-in wrong product on mixed row | P4 | `processing_ops.py` mixed guard |
| No peer chips | P5 | `_same_product_peers_for_order` |
| Together 400 unexpected | P5/P4 | together validation, `distinct_product_count` |
| Assign not visible | P6 | `ProcessingWorkspacePage` `canAssignSharedProduct` |
| Manifest match changed after assign | P6 blocker | `processing_assign_shared_product` |
| match-products still writes | P6 blocker | `views.py` `match_products` |
| search missing product tokens | P3/G1 | `processing_search_string.py`, denorm refresh |

---

## See also

- Design: [`product_identity_design.md`](./product_identity_design.md)
- Initiative: [`.ai/initiatives/intake_processing_improvements.md`](../../initiatives/intake_processing_improvements.md)
- Pipeline: [`.ai/extended/inventory-pipeline.md`](../../extended/inventory-pipeline.md)
- Session handoffs: `session_4_handoff_questions.md` … `session_8_questions.md`
