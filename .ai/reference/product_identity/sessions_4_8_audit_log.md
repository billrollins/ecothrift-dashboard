<!-- Audit completed: 2026-06-09 -->
# Sessions 4–8 audit log

Systematic walkthrough of [`sessions_4_8_verification_checklist.md`](./sessions_4_8_verification_checklist.md).

**Auditor:** Composer  
**Result:** **PASS with fixes** — 153 backend tests green; tsc + vitest green; 4 code fixes applied.

---

## Summary table

| § | Area | Status | Action |
|---|------|--------|--------|
| 0 | Quick pass (pytest + tsc) | ✅ PASS | 153 passed (was 152; +1 new test) |
| 1 | Cross-session invariants I-1–I-20 | ✅ PASS | All covered by automated tests |
| 2 | Static grep gates | ⚠️ FINDINGS | Legacy readers remain (read-only OK); **writers fixed** in ensure/queue paths |
| 3 | Session 4 — P2 Final Decisions | ✅ PASS | Stepper, match cell, regenerate API present |
| 4 | Session 5 — P3 Precedence | ✅ PASS | Coalesce + check-in manifest write test green |
| 5 | Session 6 — P4 Split | ✅ PASS | All 6 split tests green |
| 6 | Session 7 — P5 Collapse | ✅ PASS | All 5 collapse tests green |
| 7 | Session 8 — P6 Deprecation | ✅ PASS | Assign/410/404/denorm tests green |
| 8 | Regression matrix | ✅ PASS | Full bundle |
| 9 | Frontend review | ✅ PASS | Components wired; vitest 3/3 |
| 10 | Docs consistency | ✅ PASS | Pipeline/frontend updated; checklist class names fixed |
| 11 | Extended scenarios | ⏭️ SKIP | Manual PO QA deferred (no live PO in CI) |
| 12 | Sign-off | ✅ READY | See bottom |

---

## §0 — Quick pass

```
pytest … (7 files) → 153 passed, 5 subtests passed
npx tsc --noEmit → exit 0
```

**Observation:** Count is 153 vs checklist’s “132+” because `test_product_matching.py` (18 tests) was included in full bundle — expected.

---

## §1 — Cross-session invariants

### §1.1 Rule 3 (I-1–I-8)

| ID | Result | Evidence |
|----|--------|----------|
| I-1 | ✅ | `CheckInManifestWriteTests::test_check_in_does_not_write_manifest_matched_product` |
| I-2 | ✅ | `CheckInTogetherTests::test_together_check_in_creates_items_with_distinct_manifest_rows` |
| I-3 | ✅ | `AssignSharedProductTests::test_assign_aligns_processing_rows_without_manifest_write` |
| I-4 | ✅ | `RetiredEndpointTests::test_match_products_returns_410` |
| I-5 | ✅ | `RetiredEndpointTests::test_merge_endpoint_removed` (404) |
| I-6 | ✅ | `DenormReaderTests::test_denorm_does_not_adopt_manifest_match_when_pr_hint_set` |
| I-7 | ✅ | `SearchStringIdentityTests::test_denorm_backfill_includes_product_tokens_same_pass` |
| I-8 | ✅ | `ProcessingRowDetailMatchTests::test_detail_uses_processing_row_match_over_manifest`; `build_processing_row_detail` uses `prod = bk.matched_product` only |

### §1.2 Precedence (I-9–I-12)

| ID | Result | Evidence |
|----|--------|----------|
| I-9 | ✅ | `CoalesceHelperTests`, `WorkspaceListDetailTests` |
| I-10 | ✅ | `test_detail_coalesces_and_includes_manifest_evidence` |
| I-11 | ✅ | `test_search_string_keeps_row_and_product_tokens` |
| I-12 | ✅ | `test_processing_row_patch_updates_defaults_without_creating_items` |

### §1.3 Split / collapse (I-13–I-16)

| ID | Result | Evidence |
|----|--------|----------|
| I-13 | ✅ | Code review: `processing_assign_shared_product`, `processing_check_in_together` — no PR/MR delete |
| I-14 | ✅ | Together test asserts distinct `manifest_row_id` per Item |
| I-15 | ✅ | `test_implicit_check_in_on_mixed_row_returns_400` |
| I-16 | ✅ | `test_remap_batch_updates_items_and_denorm` |

### §1.4 Preprocessing authority (I-17–I-20)

| ID | Result | Evidence |
|----|--------|----------|
| I-17 | ✅ | `test_staff_decision_never_overridden_on_regenerate` |
| I-18 | ✅ | `test_finalize_copies_decided_match_to_processing_row` |
| I-19 | ✅ | `test_regenerate_respects_staff_null` |
| I-20 | ✅ | `test_upc_exact_match_creates_candidate_and_auto_selects` |

---

## §2 — Static grep gates

### Manifest match writers

**Grep:** `mr.matched_product =` in production code  
**Result:** ✅ No production writes — only test fixtures (`test_processing_deprecation.py`).

**Grep:** `match_status` / `ai_match_decision` assignment in `views.py`  
**Result:** ✅ Only on new `ManifestRow` creation defaults (`matched_product=None`, `match_status='pending'`) — acceptable.

**Grep:** `processing_merge_rows`  
**Result:** ✅ Removed from codebase.

### Manifest match readers (processing identity)

| Site | Status | Notes |
|------|--------|-------|
| `refresh_processing_rows_denorm` | ✅ | No `m_match` fallback |
| `build_processing_row_detail` | ✅ | `prod = bk.matched_product` only |
| `link_processing_rows_to_manifest_rows` | ✅ | One-way bootstrap when PR hint null |
| `_find_or_create_manifest_product` L1060 | ⚠️ READ | Still reads MR match when PR null — legacy bootstrap only |
| `estimate_prices` L5349 | ⚠️ READ | Uses MR match for category hint — read-only |
| `sync_manifest_row_outputs_to_items` | ✅ FIXED | Now falls through PR → Item.product |
| `_build_check_in_queue_from_manifest` | ✅ FIXED | PR-first product resolution |
| `ensure_manifest_products_and_items` | ✅ FIXED | PR-first before `_find_or_create_manifest_product` |
| `create_items` batch groups | ✅ FIXED | Product from PR/Item when MR match null |

### Frontend dead code

**Grep:** `MergeModal|processingMergeRows|useProcessingMergeRows`  
**Result:** ✅ Zero hits in `frontend/src`.

**Note:** `matchProducts` API + `useMatchProducts` hook remain in `inventory.api.ts` / `useInventory.ts` but are **unreferenced** by pages — dead code, not a functional bug. Optional future cleanup.

---

## §3 — Session 4 (P2)

| Check | Result |
|-------|--------|
| Step 3 labeled **Final Decisions** | ✅ `PreprocessingPage.tsx` L1406 |
| `PreprocessingMatchCell` wired | ✅ `PreprocessingReviewTable.tsx` |
| Five chip states | ✅ `PreprocessingMatchCell.tsx` `ChipState` union |
| `POST …/regenerate-match-candidates/` | ✅ `views.py` L4806 |
| `test_product_matching.py` (18 tests) | ✅ All pass |
| Detail prefers ProcessingRow match | ✅ P2 server fix retained in P6 |

**Manual QA:** Not run in this audit (requires dashboard + staging PO).

---

## §4 — Session 5 (P3)

| Check | Result |
|-------|--------|
| Coalesce in list/detail | ✅ Tests + `coalesce_processing_row_identity` |
| Check-in no manifest write | ✅ I-1 test |
| Search G1 row + product tokens | ✅ I-11 test |
| `manifestEvidence` on detail | ✅ I-10 test |

---

## §5 — Session 6 (P4)

| Check | Result |
|-------|--------|
| All 6 `test_processing_split.py` | ✅ Pass |
| Crayons scenario | ✅ `test_crayons_scenario_totals` |
| Mixed guard backend | ✅ I-15 |
| Remap batch | ✅ I-16 |
| `RemapBatchProductDialog.tsx` | ✅ Present in workspace |

---

## §6 — Session 7 (P5)

| Check | Result |
|-------|--------|
| All 5 `test_processing_collapse.py` | ✅ Pass |
| Peer chips `sameProductRowNumbers` | ✅ List test |
| Group by product toggle | ✅ `ProcessingFilterRow.tsx` |
| Bulk together vs assign branching | ✅ `ProcessingWorkspacePage.tsx` L373–403 |
| No merge CTA | ✅ `ProcessingBulkActionBar` |

---

## §7 — Session 8 (P6)

| Check | Result |
|-------|--------|
| All 5 `test_processing_deprecation.py` | ✅ Pass |
| `processing_assign_shared_product` | ✅ Validated in code review |
| `match_products` → 410 | ✅ |
| Model `help_text` deprecated fields | ✅ `models.py` |
| Initiative Session 8 **Done** | ✅ |

---

## §8–§9 — Regression + frontend

| Check | Result |
|-------|--------|
| Full 7-file pytest bundle | ✅ 153 passed |
| `npx tsc --noEmit` | ✅ |
| `checkedInHistory.test.ts` | ✅ 3/3 |
| Assign + Together hooks | ✅ `useProcessingWorkspace.ts` |

---

## §10 — Docs

| Doc | Result |
|-----|--------|
| `CHANGELOG.md` | ✅ Updated with audit fix |
| `inventory-pipeline.md` | ✅ P6 assign + no MergeModal |
| `frontend.md` | ✅ AssignSharedProductDialog |
| `sessions_4_8_verification_checklist.md` | ✅ Fixed wrong pytest class names |
| Historical session docs mentioning MergeModal | ℹ️ Intentional historical context |

---

## Fixes applied during audit

### Fix 1 — `ensure_manifest_products_and_items` PR-first (P6 gap)

**Problem:** When `ManifestRow.matched_product_id` (legacy) differed from `ProcessingRow.matched_product_id` (decided hint), `_find_or_create_manifest_product` could resolve the legacy MR product and sync intake Items to the wrong catalog product.

**Change:** `views.py` — if linked PR has `matched_product_id`, use that product directly before calling `_find_or_create_manifest_product`.

**Proof:** New test `test_ensure_manifest_prefers_processing_row_match_over_manifest_legacy`.

### Fix 2 — `_build_check_in_queue_from_manifest` PR-first

**Problem:** Same precedence bug in legacy check-in queue builder — read MR match before PR hint; could overwrite PR hint.

**Change:** Prefetch `pr_by_mr_id`; resolve product PR → MR → create new.

### Fix 3 — `sync_manifest_row_outputs_to_items` product resolution

**Problem:** Manual review sync only updated Products linked via deprecated `ManifestRow.matched_product` — skipped new-flow rows where MR match is null but PR/Items have products.

**Change:** Fall through PR.matched_product → first non-terminal Item.product.

### Fix 4 — `create_items` batch group product

**Problem:** `BatchGroup.objects.create(product=row.matched_product)` could pass null on new-flow orders.

**Change:** Resolve product MR → PR → linked Item before create.

### Doc fix — verification checklist

Corrected pytest node class names (`CheckInManifestWriteTests`, `CheckInTogetherTests`, `ProcessingRowDetailMatchTests`).

---

## §12 — Sign-off

```markdown
## Sessions 4–8 verification

- [x] Master pytest bundle green (§0) — 153 passed
- [x] tsc green
- [x] Cross-session invariants I-1–I-20 spot-checked
- [x] Grep gates §2 — manifest writers clean; legacy readers documented
- [ ] Session 4 manual Final Decisions pass — deferred
- [ ] Session 5 precedence manual pass — deferred
- [ ] Session 6 crayons manual pass — deferred
- [ ] Session 7 together + peers manual pass — deferred
- [ ] Session 8 assign → together manual pass — deferred
- [x] Docs audit §10

Fixes: ensure_manifest / check-in queue / manual-review sync / create-items batch — PR-first product resolution.
```

**Recommendation:** Run manual §3–§7 QA on one real finalized PO before release tagging; automated gate is green.

---

## Holistic code review pass (2026-06-09, post-audit)

Independent line-by-line review of all P6 surfaces plus the four audit fixes. Suite after fixes: **155 passed** + tsc + vitest green.

### Bugs found and fixed

| # | Severity | Site | Problem | Fix |
|---|----------|------|---------|-----|
| R-1 | **High** | `processing_assign_shared_product` | Row with checked-in units of product X (distinct=1, passed guard) could be assigned product Y; the immediate `refresh_processing_rows_denorm` recomputes the hint from dispositioned items and **silently reverted Y → X** — API reported success, nothing changed | Reject with 400 ("checked-in units of a different product — remap that batch first") when `primary_product_id_for_items` ≠ target; test `test_assign_rejects_row_with_checked_in_units_of_other_product` |
| R-2 | **High** | `sync_manifest_row_outputs_to_items` (audit Fix 3 follow-on) | Item-product fallback re-pointed **all** of a row's non-terminal Items to the *first* item's product — would collapse a P4 split row on any manual-review save; also overwrote one product's identity fields with ambiguous row data on mixed rows | Removed item `product` re-point entirely (vestigial under P6 — no surface can change a decided match through this path); skip Product field sync when row has ≥2 distinct item products; test `test_sync_does_not_repoint_split_row_items` |
| R-3 | **High** | `processing_finalize.py` chunk build (~L824) | `bk.matched_product_id = mr.matched_product_id` ran **unconditionally** after `bulk_create` — fresh ManifestRows carry no match FK, so a legacy compatibility build **wiped the bookmark's decided match** from finalize | One-way bootstrap: copy only when `bk.matched_product_id is None and mr.matched_product_id` (mirrors `link_processing_rows_to_manifest_rows`) |
| R-4 | Medium | `create_items` batch groups | Precedence checked **MR match first**, PR second — backwards vs P6 (and vs the other three audit-fixed sites) | Flipped to PR-first, MR fallback |
| R-5 | Low (perf) | `ensure_manifest_products_and_items` | `pr_by_mr_id` built without `select_related('matched_product')` → N+1 when PR hints used; duplicate `pr_by_mr_id.get(row.id)` lookup | Added select_related; removed duplicate lookup |
| R-6 | Trivial | `build_processing_row_detail` | `select_related('matched_product')` on the ManifestRow query is vestigial since P6 (identity never reads it) | Removed the wasted join |

### Verified clean (no action)

- `processing_assign_shared_product` core: atomic, `select_for_update`, order scoping, added-row/manifest-link/mixed guards, PR-only writes, single denorm + patch.
- `processing_check_in_together` / `_check_in_processing_row`: per-row batches, no manifest writes, mixed guard intact.
- `refresh_processing_rows_denorm`: no manifest fallback; hint preserved for unlinked bookmarks; primary-product recompute per design §10-5.
- `link_processing_rows_to_manifest_rows`: correct one-way bootstrap.
- `match_products` 410 handler: no DB access, clean message.
- Frontend: `AssignSharedProductDialog` (state reset on open, submit guard ≥2 rows), `ProcessingBulkActionBar` (together/assign branching, `itemActionsBlocked`), `ProcessingWorkspacePage` (`bulkSelectionEligible` guards, selection kept after assign so the bar flips to "Check in together", error snackbars surface server `detail`), hooks apply `workspace_patch` + invalidate row details.
- `manual_review` POST: no manifest match fields accepted.
- Models: deprecated `help_text` on all four ManifestRow match fields.

## Optional follow-ups (not blockers)

1. Remove dead `useMatchProducts` / `matchProducts` from frontend (410 endpoint still documented).
2. `estimate_prices` could use ProcessingRow or Item product for category hint instead of MR match.
3. `_find_or_create_manifest_product` MR fallback at L1060 could be removed after legacy cohort migration.
4. Initiative roadmap table row P5 still lacks ✅ in phase map line 112 — cosmetic doc only.
