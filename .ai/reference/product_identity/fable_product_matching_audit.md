<!-- Last updated: 2026-06-10 (Fable 5 — post-ship audit of Sessions 4–8 / P2–P6; answers fable_product_matching_review.md Q1+Q2; staff playbook (Q3) deliberately omitted per owner) -->

# Product matching — Fable 5 post-ship audit

**Answers:** [`fable_product_matching_review.md`](./fable_product_matching_review.md) Q1 (how it works) + Q2 (is it coded correctly) + prioritized fixes.
**Omitted by owner instruction:** Q3 staff playbook (separate deliverable if requested later).
**Method:** every claim below verified against working-tree source on 2026-06-10; the cited regression suite (`test_product_matching`, `test_processing_identity`, `test_processing_collapse`, `test_processing_split`, `test_processing_deprecation`) runs **45 passed** in ~15s.
**Authority:** [`product_identity_design.md`](./product_identity_design.md). Owner decisions recorded 2026-06-10 in §"Owner rulings" below.

---

## 1. Executive summary (for Bill)

1. **The shipped code matches the design.** All four of Composer's session resolution logs (5–8) check out against source — nothing claimed-but-missing, no aspirational entries. The three-level ladder (candidates → decided match → Item fact) is implemented as designed.
2. **Matching is deliberately conservative.** Only three matchers run: UPC exact (score 100), prior vendor item number (90), exact title+brand (80). Only a UPC-exact hit auto-selects, and only when you haven't decided; **your decisions are never overwritten** (verified by tests).
3. **"No match" means "new product at check-in"** — nothing is created until a physical unit is checked in. Shorted/disputed lines never pollute the catalog.
4. **The destructive merge is gone.** `processing_merge_rows`, `MergeModal`, and the merge hook are fully deleted; legacy `match-products` returns 410. Collapse is now: *Assign shared product* (align the hint) → *Check in together* (one form, per-row items).
5. **One real Rule 1 violation found:** editing row defaults in the Item Processor **silently overwrites the linked ManifestRow** (title, brand, retail, condition, …) via `_sync_manifest_row_from_processing_defaults`. The manifest is supposed to be the frozen vendor claim — this corrupts the evidence the `manifestEvidence` "Vendor claim" block displays. Fix is a small deletion (F1).
6. **One leftover writer:** the legacy `undo-product-matching` endpoint still clears deprecated ManifestRow match columns. No page calls it, and it does **not** undo anything in the current flow (your real undo paths are listed in §4). Remove or repurpose (F2).
7. **Your "two rows, same item, no product yet" case is still unsolved** — *Assign shared product* only accepts an existing catalog product. Owner has approved the fix: a full **Collapse rows** wizard (F3, spec below) that handles unmatched/partial/contradicting states, re-points already-checked-in items, detects orphaned products, and ends in a basic Product create/confirm form.
8. **Mixed-row safety is enforced server-side:** once a row has units of ≥2 products, quick check-in is rejected with a 400 unless you name the product explicitly — the API cannot be bypassed by the UI.
9. **Search works in both vocabularies:** the queue search blob keeps row/manifest wording *and* matched-product tokens, so "hdbnd red" and "Red Headband" both find the row (tested).
10. **Docs lag the code:** CHANGELOG `[Unreleased]` and the initiative file still describe P1–P2-era behavior; Sessions 5–8 have no session blocks. Cheap cleanup (F4).

---

## 2. Technical appendix — Q1: how matching is done

### 2.1 Level 1 — candidates (staging)

**Engine:** [`apps/inventory/services/product_matching.py`](../../../apps/inventory/services/product_matching.py) — `generate_match_candidates_for_order` (batched: one IN-query per tier, per-miss `iexact` sweeps).

**Triggers:**
- Auto, after **apply-cleanup-csv** succeeds — `views.py:4496–4498`.
- Manual **`POST …/regenerate-match-candidates/`** — `views.py:4829–4831` (409 if already finalized). Safe to re-run any time.

**Matchers, strongest first (max 5 candidates/row, deduped by product):**

| Tier | Score | Source key | Auto-select? |
|------|-------|------------|--------------|
| UPC exact (case-insensitive) | 100 | `upc` | **Yes**, iff row is *undecided* |
| `VendorProductRef` (vendor item number, same vendor) | 90 | `vendor_ref` | No |
| Exact title (+brand when present), case-insensitive | 80 | `text` | No |

Inputs come from **effective preprocessing layers** (`effective_preprocessing_title` / `_triple` — i.e. post-cleanup `ai_*`/`final_*`, not raw vendor text). *Undecided* is exactly `final_matched_product_id is None and match_source != 'staff'` (`product_matching.py:176`) — so a staff "this is new" (null + `staff`) survives every regenerate.

### 2.2 Level 2 — decided match (staging → finalize)

- Staff decisions: `PATCH …/preprocessing-review/` with `final_matched_product: <id|null>` sets `match_source='staff'` for both set **and** clear (`views.py:785–803`; unknown product ids rejected).
- Peer signal: `same_product_row_numbers` on review GET; "Same as row N" copies the FK — the shared FK *is* the link.
- **Finalize projection:** `processing_finalize.py:238` — `ProcessingRow.matched_product_id = final_matched_product_id`. **Candidates do not cross finalize** (no candidates field exists on `ProcessingRow`); post-finalize product changes use live product search.
- `preprocessing-review-reset-final` (`views.py:4834`) rebuilds `final_*` listing fields from `ai_*`/`standard_*` but does **not** touch match decisions.

### 2.3 Read-time precedence (workspace)

- **One helper:** `coalesce_processing_row_identity` (`processing_workspace.py:417`) — first-non-empty per identity field, tier order **product → row bookmark → manifest row**, display-only ("never writes back to DB" and verified: no saves). Identity = title, brand, model, category, description, specifications, UPC — exactly the Session 5 corrected list; tags/taxonomy stay row-owned.
- **List:** `_workspace_row_core_fields` (`processing_workspace.py:507`) emits coalesced title/brand/category; minimal nested `product` (5 fields, `_minimal_list_product:463`) hydrated **only when matched**; `sameProductRowNumbers` from `_same_product_peers_for_order:473` (hint FK only, never Items; capped at 10 peers).
- **Detail:** `build_processing_row_detail` (`processing_workspace.py:1109`) — `prod = bk.matched_product` **only** (no manifest fallback, P6); read-only `manifestEvidence` block from the ManifestRow (`:497`).
- **Search:** base blob from **raw row fields** + product tokens appended (`augment_…`) — both names searchable (Session 5 G1 correction honored; `test_search_string_keeps_row_and_product_tokens`).

### 2.4 Level 3 — check-in (`processing_ops.py`)

`_check_in_processing_row` (`:361`), the shared core for single, quick, and together paths:

1. **Mixed guard** (`:404–409`): if the row's Items span ≥2 products and the request would *implicitly* reuse a product (`product_mode` empty/`keep` with no explicit id — `_implicit_check_in_product_reuse:195`), raise → HTTP 400.
2. **Prefill ladder:** latest check-in batch's product (`:411–420`, promoted to explicit `existing`) → `row.matched_product` via `keep` (`:421`) → row bookmark fields seed a **new** Product (`_resolve_product_for_processing:289`, create path uses `find_or_create_product_for_manual_item` fill-blanks policy).
3. **Fact alignment** (`:436–438`): `row.matched_product` is updated to the product actually used — Level 3 informing Level 2, allowed by design.
4. Items created with `manifest_row_id` + `product_id`, product-wins title/brand snapshot (`:450–451`); `ProcessingCheckInBatch` records product + `defaults_snapshot` (`:482`).
5. **No `ManifestRow.matched_product` write anywhere** (`test_check_in_does_not_write_manifest_matched_product`).

### 2.5 Split (P4) and collapse (P5/P6)

- **Split** (one row → N products): per-batch check-ins; denorm (`refresh_processing_rows_denorm:647`) maintains `distinct_product_count` and recomputes the **primary** hint as most-units product (`:736–742`); queue shows "N products" chip; remap (`remap_check_in_batch_product:696`) atomically re-points a whole batch's Items + the batch FK, with ItemHistory rows. Crayons scenario (10+14) automated (`test_crayons_scenario_totals`).
- **Collapse** (N rows → one product): `processing_check_in_together` (`:527`) — requires ≥2 manifest-backed rows, all sharing the *same* non-null hint equal to the explicit `product_id`, none added-kind, none mixed, per-row qty ≤ remaining; loops the shared core with batch-prefill and mixed-guard off (validated up front), one batch per row, one denorm pass. `processing_assign_shared_product` (`:634`) aligns hints first — **`existing` only today**, refuses rows already holding checked-in units of a different product (denorm would silently revert — good catch by Composer).
- **Denorm never reads manifest match** (`:724–727` preserves the row-owned hint; `test_denorm_does_not_adopt_manifest_match_when_pr_hint_set`). The only manifest→ProcessingRow copy left is `link_processing_rows_to_manifest_rows:797` — legacy repair, gated on row hint being null, never writes the manifest side.

---

## 3. Technical appendix — Q2: audit checklist

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Rule 1 — no backwards sync | **FAIL (one site)** | `_sync_manifest_row_from_processing_defaults` (`processing_ops.py:246`, called from `processing_row_patch:1397`) mirrors staff row-default edits onto the linked **ManifestRow** (title, brand, model, category, description, notes, identifiers, search_tags, unit_retail, condition). Introduced in commit `fefa548`, same day the design was approved; design Rule 1: "never write row decisions onto the manifest." Product→row direction is clean (coalesce is read-only). See **F1**. |
| 2 | Rule 2 — FK is the identity reference; row `final_*` preserved | **PASS** | Coalesce never writes; clearing/changing `matched_product` reverts display to row data instantly (`test_product_wins_over_row_and_manifest`, `test_refresh_preserves_match_*`). |
| 3 | Rule 3 — no production writes to deprecated ManifestRow match columns | **PARTIAL** | All staff-reachable flows clean (check-in, patch, assign, together, remap, denorm, finalize). Two leftovers: `undo_product_matching` (`views.py:3945`) clears the deprecated columns — endpoint live, frontend hook exists but **no page mounts it**; `match-products` POST is 410 (`views.py:5254`) ✅. See **F2**. |
| 4 | Products created at Level 3 only | **PASS** | Creation paths: `_resolve_product_for_processing` (check-in / remap / add-item) and standalone Add Item — all physical-fact contexts. Matching, review PATCH, and finalize never create (`product_matching.py` docstring + code; finalize copies an FK only). |
| 5 | Staff decisions sticky across regenerate | **PASS** | `product_matching.py:176`; `test_staff_decision_never_overridden_on_regenerate`, `test_regenerate_respects_staff_null`. |
| 6 | UPC auto-select only when undecided | **PASS** | `product_matching.py:176–181`; `test_upc_exact_match_creates_candidate_and_auto_selects`, `test_auto_selection_updates_when_rerun_and_still_undecided`. |
| 7 | Candidates do not cross finalize | **PASS** | Projection copies `matched_product_id` only (`processing_finalize.py:238`); no candidates column on `ProcessingRow`. |
| 8 | Collapse without destructive merge | **PASS** | `processing_merge_rows` / `MergeModal` / `useProcessingMergeRows`: **zero grep hits** repo-wide; `test_merge_endpoint_removed`; assign+together cover the flow (`test_after_assign_check_in_together_succeeds`). |
| 9 | Split without breaking manifest 1:1 | **PASS** | Rows never merged; remap is whole-batch atomic with same-manifest-row validation (`processing_ops.py:729–734`); mixed guard server-enforced (`test_implicit_check_in_on_mixed_row_returns_400`). |
| 10 | Test coverage of the above | **PASS** | 45 tests across the five files map to every invariant above; suite green 2026-06-10. |

**UX-lie audit:** one real candidate — the `manifestEvidence` block is captioned **"Vendor claim"** but because of finding #1, any row whose defaults were edited after intake shows *staff-edited* values there, not the vendor's. No other surface misrepresents backend behavior: queue/detail titles are server-coalesced (no client re-merge drift), quick check-in's reuse is now explicit-or-blocked, and the Final Decisions grid intentionally shows row columns beside the product column (Session 4 A1 ruling).

**Legacy panels:** `ProductMatchingPanel.tsx` / `MatchReviewPanel.tsx` — confirmed not imported by any current page (stepper uses `PreprocessingMatchCell`); dead files, safe to delete with F2's sweep.

---

## 4. Undo paths (current, verified — context for owner question (a))

| Stage | How to undo a match decision |
|-------|------------------------------|
| Final Decisions (pre-finalize) | Per row: clear to "New product" or pick a different product (PATCH sets `match_source='staff'`, sticky). Regenerate candidates is always safe. |
| Post-finalize, pre-check-in | *Assign shared product* to re-point the hint; or detailed check-in with explicit product at the moment of truth. |
| Post-check-in | *Remap batch* re-points the batch's Items (+ history rows); denorm recomputes the primary hint. |

The legacy `undo-product-matching` endpoint participates in **none** of these — it only blanks the deprecated ManifestRow columns the current flow no longer reads.

---

## 5. Owner rulings (2026-06-10)

1. **(a) `undo-product-matching`:** owner wants undo to *work* — the endpoint doesn't undo anything real (see §4), so remove it (and the dead hook), optionally replacing with a true bulk reset (F2).
2. **(b) Shared-new-product gap:** approved. Direction: not a product-picking moment but a **"collapse these rows" decision**, available at any time, with the wizard logic in F3 (owner's spec, recorded verbatim in intent): assess all-unmatched / partial / all-matched; surface contradictions for resolution; when items already carry products and the decision changes, re-point them, then detect **orphaned products** and ask before deleting; finish with explicit approval of the final product via a basic Product CRUD form (new or existing).
   - Design consequence (accepted): a collapse decision may **create a Product before check-in** — a deliberate, owner-approved softening of the Level-3-only rule (§2 of the design) for this one flow, since the staff member is making an explicit catalog decision in a CRUD form, not a side effect.

---

## 6. Recommended fixes, prioritized

### F1 — Stop overwriting the vendor claim (Rule 1 violation) — **P1, small** — ✅ SHIPPED 2026-06-10

Delete `_sync_manifest_row_from_processing_defaults` (`processing_ops.py:246–277`) and its call (`:1397`). Post-P3 every display path coalesces from `ProcessingRow`/`Product`, so nothing needs the mirror; the only thing it still "feeds" is the evidence block it corrupts.
- **Check before deleting:** the manual-review / manifest pricing-audit surfaces read ManifestRow — confirm they want the frozen claim (they should).
- **Data repair — DONE 2026-06-10:** measured divergence vs `standard_*`: **production never affected** (`fefa548` never deployed). Local dev DB had **6 tainted rows on PO 323** (row 3 brand `St. Jude`→`Generic`; rows 740–744 condition/notes) — restored from staging originals; re-check 0 diverged (`workspace/check_manifest_taint.py` / `repair_manifest_taint.py`).
- **Test:** patch row defaults → assert linked `ManifestRow` fields unchanged (extend `test_processing_validation_matrix.py`).

### F2 — Remove the dead legacy undo writer — **P2, tiny** — ✅ SHIPPED 2026-06-10 (panels `ProductMatchingPanel`/`MatchReviewPanel`/`FinalizePanel` + full frontend match API surface removed; optional bulk-reset replacement NOT built — owner can request later)

Delete `undo_product_matching` (`views.py:3945–3955`), `undoProductMatching` (`inventory.api.ts:672`), `useUndoProductMatching` (`useInventory.ts:657`), and the unmounted `ProductMatchingPanel.tsx` / `MatchReviewPanel.tsx`. Optional replacement (genuinely useful): `POST …/preprocessing-reset-matches/` that clears `final_matched_product`/`match_source` on selected staging rows and re-runs candidate generation — a real bulk undo for Final Decisions.

### F3 — "Collapse rows" wizard (P7 / Session 9) — **P2, the substantive feature**

Owner-approved replacement for the half-path that exists today. One entry point — select ≥2 rows → **Collapse rows…** — then the wizard branches on assessed state:

1. **Assess** (server): for the selected rows return match states (all-unmatched / partial / all-matched), distinct hint products, per-row checked-in units by product. Mostly existing denorm data.
2. **Contradiction step** (only when ≥2 distinct hints or checked-in products): staff picks the surviving product from the contenders, or searches the catalog. This is the owner's "resolve: select correct product."
3. **Already-checked-in items, changed mind:** re-point affected batches to the survivor (reuse `remap_check_in_batch_product` semantics per batch — never bulk Item mutation across rows outside batch boundaries). Then compute **orphans**: products that now have zero Items and no remaining row/staging references — present a "remove these orphaned products?" confirm list (soft-delete or hard-delete per owner; Products are permanent records, so default to asking).
4. **Final product approval:** a basic Product CRUD modal — prefilled from the survivor (existing) or coalesced row identity (new). `product_mode: new` here **creates the Product at decision time** (owner-approved §5 ruling). On confirm: set `matched_product_id` on all selected rows, denorm, workspace patch.

Backend building blocks already exist: extend `processing_assign_shared_product` to accept `product_mode: 'new'` (+ identity payload via `_resolve_product_for_processing`) and add an assess + orphan-check pair (or one orchestrating `processing-collapse-rows` endpoint). The current assign guard ("checked-in units of a different product → error") becomes wizard step 3 instead of a dead end. Estimated one focused session; sketch UI before building (design §10 #3 precedent).

### F4 — Documentation catch-up — **P3, cheap**

CHANGELOG `[Unreleased]`: add P3–P6 bullets (coalesced identity reads, check-in ladder + manifest-write stop, split chip/guard/remap, collapse peers/together, merge retirement + 410 + assign). Fix the stale "quick check-in reuses latest batch product" wording (now: only when un-mixed). Add Sessions 5–8 blocks to the initiative file and update `_index.md`; touch `inventory-pipeline.md` per its maintenance rule.

### F5 — Minor hygiene — **P4, opportunistic**

- Drop the dead `manifest_row__matched_product` joins in `processing_row_check_in` (`processing_ops.py:512`) — the fallback they served was removed in P6.
- `together` and `assign` build their state from `matched_product_id` equality checks before validating `row_kind` — harmless, but validating kind first gives staff better error messages on mixed selections.

---

**Parent index:** [`README.md`](./README.md) · **Review request:** [`fable_product_matching_review.md`](./fable_product_matching_review.md)
