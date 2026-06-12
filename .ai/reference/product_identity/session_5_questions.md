<!-- Last updated: 2026-06-09 (Fable 5 reviewed all Composer self-answers; see "Fable 5 review verdict" below) -->
<!-- Answers: Composer 2.5 filled every **Answer:** block before implementing Session 5. Fable 5 reviewed 2026-06-09: 2 corrections (B1/B2 search_tags+taxonomy ownership, G1 reversed), all N items ruled, everything else approved. Composer answers left intact; corrections are inline **Fable 5 correction/ruling** blocks. -->

# Session 5 handoff — questions & self-answers (P3)

**From:** Composer 2.5 (implementer, Session 5)  
**For:** Fable 5 (design author, returning ~3 days) + future maintainers  
**Goal:** Resolve P3 ambiguities *without* Fable present; leave a paper trail so cleanup/refinement is fast.

**Authority stack (unchanged):**

1. [`product_identity_design.md`](./product_identity_design.md) — wins on architecture  
2. This file — Session 5 implementation intent  
3. [`session_4_handoff_questions.md`](./session_4_handoff_questions.md) — frozen P2 spec (do not reopen unless bug)

**P3 gate (initiative):** Product-wins coalescing in workspace + `search_string`; check-in prefill ladder (batch → product → row); **stop writing `ManifestRow.matched_product`** at check-in.

---

## Session 4 recap — what shipped and what we deliberately deferred

Composer implemented P2 per [`session_4_handoff_questions.md`](./session_4_handoff_questions.md). Fable should know these **intentional** choices (not bugs unless owner disagrees):

| Area | Session 4 behavior | Why deferred to P3 |
|------|-------------------|-------------------|
| Final Decisions listing columns | Row `final_*` / effective fields stay editable; **Product** column is read-only via `matched_product_detail` | Design §3 precedence at display time was scoped to **workspace + check-in**, not stepper (Session 4 A1 ruling) |
| Workspace list/detail identity | Queue still shows `ProcessingRow.title/brand/…` from bookmark columns; detail merges manifest-first in places | P3 gate explicitly |
| `build_processing_row_detail` | Fixed `productId` to prefer `ProcessingRow.matched_product` (P2) but **title/brand/model still coalesce manifest → product**, not product-wins | Partial fix only; full precedence is P3 |
| Check-in | Backend ladder exists in `processing_row_check_in` but still **writes `ManifestRow.matched_product`** (lines 407–408) | P3 gate item |
| Denorm | `refresh_processing_rows_denorm` preserves `ProcessingRow.matched_product` when set; still **falls back to manifest** when null | Acceptable until manifest writes stop |
| Pricing | Anchored AI scaling + retail mode in Final Decisions toolbar | In scope P2 (Section P) — done |

**Known Composer shortcuts Fable may want to tighten:**

- Match PATCH uses same `updatePreprocessingReview` endpoint as listing saves (works; could split for clarity).
- `getRowByNumber` for "Same as row N" only searches `reviewRowMap` (current page + bulk-prefetch), not cross-page lookup — per Session 4 F1 ruling.
- Auto-regen-once on Step 3 uses first loaded page only to detect "zero candidates" — edge case if page 1 empty but order has rows on page 2.

---

## How Fable should use this doc

1. **Before changing Session 5 code:** read **Answer** blocks — they record *why* Composer chose a path.  
2. **If an Answer conflicts with design §3:** design wins; note the fix in a Session 5 checkpoint comment in the initiative.  
3. **If owner rejects a UX choice:** update this file's Answer (one line) so the trail stays honest.  
4. Do **not** delete Session 4 answers — append P3 corrections here.

---

## Fable 5 review verdict (2026-06-09)

I verified every code citation against source before ruling: the manifest write is exactly `processing_ops.py:407-408`, the manifest fallback `processing_ops.py:379-380`, the detail builder's manifest branch is manifest-first at `processing_workspace.py:1005-1014` (violates design §3, as Composer flagged), the list path uses raw `values()` with no Product join, and the check-in dialog's open effect seeds `prior`/`new` only (`ProcessingCheckInDialog.tsx:466`) — ladder rung 2 is indeed missing. Composer's recon is accurate.

**Approved as written:** A (scope fence), B3, C1–C3, D1–D3, E1–E3, F1–F4, G2, H1–H2, I, J, M.

**Corrected (see inline blocks):**

1. **B1/B2 — `search_tags` and `taxonomy` are NOT identity fields.** Design §3 explicitly lists "row search tags" under **Transaction — always the row**. Independently, `Product` has neither field (`models.py:803` — title/brand/model/category/description/specifications/upc/default_price only), so coalescing them is a no-op at best and a §3 violation at worst. Final identity list: `title, brand, model, category, description, specifications, identifiers.upc`.
2. **G1 — reversed.** Base search string stays built from **raw row bookmark fields**; do not coalesce. Coalescing the base (product-wins, first-non-empty) would *drop the row's own title* from the blob for matched rows, while `augment_processing_row_search_string` re-adds product tokens — net effect: search by the row/manifest name breaks. Design §3 requires **both** names searchable. The augment already satisfies acceptance K5/K6; no base change needed.

**Bonus fix, in scope for Session 5** (found during review, ~2 lines): in `refresh_processing_rows_denorm`, `products_by_id` is built at `processing_workspace.py:495` from `matched_product_id` values **before** the loop backfills legacy manifest matches at lines 558-559. A legacy row whose match is backfilled in that run gets its `search_string` assigned via `assign_search_strings_for_instances` with no product in the map (and that function has no DB-fetch fallback, unlike the added-row branch) — so product tokens are missing until the *next* denorm. Fix: recompute/extend `products_by_id` after the backfill loop, before `assign_search_strings_for_instances`. Add to the F3 test: legacy row backfilled in same denorm run has product tokens in `search_string`.

**Section N rulings** — recorded inline in N; summary: (1) ship `manifestEvidence` server block, minimal caption UI; (2) skip the pill tooltip in P3; (3) keep the denorm manifest fallback; (4) hydrate `product` on list only when `matched_product_id` set.

---

## A. P3 scope fence

### A1. What Session 5 must include

**Answer:** Exactly the initiative P3 gate — no creep:

1. **Server-side identity coalescing** for workspace list + row detail payloads when `ProcessingRow.matched_product_id` is set (product wins identity fields per design §3; row wins transaction fields).
2. **`search_string` rebuild** so matched product identity is searchable even when bookmark title is stale manifest text (augment already exists — ensure coalesced identity is reflected; see H).
3. **Check-in prefill ladder** aligned server + client: batch defaults → decided product → row bookmark (design §5).
4. **Remove `ManifestRow.matched_product` write** in `processing_row_check_in` (and any other *new-flow* check-in path Composer finds in scope); add regression test.
5. Tests + docs + initiative Session 5 close.

### A2. What Session 5 must NOT include

**Answer:**

- **No** Final Decisions stepper precedence swap (still row-editable + Product column) — unless owner explicitly pulls it forward.
- **No** collapse UI (P5), split/N-products chip (P4), `MergeModal` rework (P6).
- **No** dropping `ManifestRow` match columns or legacy `match-products` endpoint.
- **No** denorm "primary product recompute from batches" (design §10 #5) — defer to P4 when split work lands.
- **No** rewriting `ProcessingCheckInDialog` into a shared `ProductPicker` — minimal ladder alignment only.
- **No** bulk migration of old orders.

### A3. Allowed backend surface area

**Answer:** Prefer **one coalescing helper** used by list serializer, detail builder, and (optionally) check-in prefill builder:

| Allowed | File(s) |
|---------|---------|
| New `coalesce_processing_row_identity(row, product) -> dict` (or similar) | `apps/inventory/services/processing_workspace.py` or new `processing_identity.py` |
| List + detail payload changes | `processing_workspace.py` (`_workspace_row_core_fields`, `build_processing_row_detail`, `serialize_*`) |
| Check-in: remove manifest write; optional explicit prefill endpoint **only if** frontend duplication is painful | `processing_ops.py`, `views.py` |
| Tests | `test_product_matching.py` or new `test_processing_identity.py`, extend `test_processing_validation_matrix.py` |
| Docs | `CHANGELOG`, `inventory-pipeline.md`, initiative Session 5 |

**Not allowed without Fable/owner:** new tables, changing `ProcessingRow` schema, manifest field deletion.

---

## B. Precedence rule — exact field split

Design §3: product wins **identity**; row wins **transaction**.

### B1. Identity fields (product wins when matched)

**Answer:** Coalesce at **read/serialize** time only:

`title`, `brand`, `model`, `category`, `description`, `specifications`, `identifiers` (UPC/GTIN keys), `search_tags`, `taxonomy` (display path/category string).

> **Fable 5 correction (2026-06-09):** Drop `search_tags` and `taxonomy` from this list. Design §3 puts "row search tags" explicitly in the **Transaction** family (always the row), and `Product` carries neither field anyway (`models.py:803`). Final identity set for the coalesce helper: **`title`, `brand`, `model`, `category`, `description`, `specifications`, `identifiers.upc`**. Product search-discoverability is handled by the `search_string` augment, not by coalescing tags.

Source order when `matched_product_id` set:

1. Live `Product` field if non-empty  
2. Else `ProcessingRow` bookmark field  
3. Else linked `ManifestRow` field (legacy fallback for unmigrated rows only in detail path)

Never write product values back onto `ProcessingRow` or `ManifestRow` during coalesce.

### B2. Transaction fields (always row)

**Answer:** Always from `ProcessingRow` (bookmark), never replaced by product:

`quantity`, `unit_retail`, `shelf_price` / list price, `condition`, `notes`, `pricing_notes`, `final_price`, `proposed_price`, queue status fields, `manifest_row_id`, row `row_number`.

> **Fable 5 correction (2026-06-09):** Add **`search_tags`** and **`taxonomy`** here (moved from B1 per design §3 "row search tags" and the fact `Product` has no such fields). Always row-owned.

Check-in **price** prefills: row `shelf_price` → `final_price` → `proposed_price` → `product.default_price` (design §5).

### B3. Empty product field behavior

If product is linked but `product.title` is blank, fall through to row title (don't show blank in queue).

**Answer:** Yes — coalesce is "first non-empty wins" with product tier first, not strict null-only.

---

## C. Workspace list payload

Today: `build_processing_workspace` uses `ProcessingRow.objects.values(*PROCESSING_WORKSPACE_ROW_VALUE_FIELDS)` — **no Product join**. List rows expose `productId` but `product` object is null on list.

### C1. Should list rows include nested `product` object?

**Answer:** **Minimal nested object on list** when `matched_product_id` set:

```json
"product": { "id", "product_number", "title", "brand", "upc" } | null
```

Rationale: frontend already does `row.title || row.product?.title` in `processingQueueCellText.ts` — list must hydrate enough for precedence without opening detail. Keep payload small (no description/specs blob on list).

### C2. Should list `title`/`brand`/`category` be coalesced server-side?

**Answer:** **Yes.** `_workspace_row_core_fields` should emit **display** title/brand/category already coalesced. Frontend should treat them as authoritative for queue display and **not** re-merge inconsistently.

### C3. Row defaults toolbar (ProcessingActiveCard pills)

Staff edit **row bookmark** fields via `PATCH …/processing-row-patch/`. When product is matched, should pills show product or row values?

**Answer:** **Show coalesced (product-wins) values** in pills for identity fields, but **PATCH still writes ProcessingRow** bookmark columns only (existing behavior). After save, coalesce recomputes display from row edits until product overrides non-empty fields. Tooltip: *"Editing this row's copy; linked product may still win display when its fields are filled."* — optional, P3 polish.

Do **not** add product PATCH from row defaults in P3.

---

## D. Workspace row detail payload

`build_processing_row_detail` (manifest branch) currently sets identity from **`mr.*` first**, then product fallback — **opposite of design §3**.

### D1. Fix strategy

**Answer:** After loading `bk` and `prod = bk.matched_product or mr.matched_product`:

- Build identity dict via shared coalesce helper using `(bk, prod, mr)` with product-wins order.
- Set `row_full['title'|'brand'|…]` from coalesced identity.
- Set `product` / `productId` from decided product (`bk.matched_product` first).
- **Transaction** fields (`qty`, `unitRetail`, `price`, `condition`, …) stay row/manifest deal fields per B2.

### D2. Manifest evidence for disputes

Staff still need vendor claim visible somewhere when product title differs.

**Answer:** P3 adds **read-only** `manifestEvidence` block on detail only (not list):

```json
"manifestEvidence": { "title", "brand", "description", "quantity", "unit_retail" }  // from ManifestRow
```

Small caption in UI: *"Vendor claim (read-only)"*. Do not merge into editable fields. If this bloats payload, Fable may collapse to tooltip on row # linking to order manifest — but server block is cheap and explicit.

### D3. List/detail merge in frontend

`useProcessingWorkspace` merges patch rows shallowly; detail query replaces active card row.

**Answer:** No frontend merge logic change required if server sends coalesced fields on both list and detail. Invalidate detail query after row patch + check-in (already happens).

---

## E. Check-in prefill ladder

Design §5 order:

1. Prior batch on this row (same product) → `defaults_snapshot`  
2. `matched_product` → product identity; qty/retail/condition/notes from row; price from row with product default fallback  
3. No match → row `final_*` / bookmark seeds new product  

Backend today (`processing_row_check_in`, ~374–402):

- Ladder partially implemented: `latest_batch_product` overrides `matched`; falls back to `manifest_row.matched_product` if processing match null — **remove manifest fallback in P3** (Rule 3).
- Still writes manifest match on save — **remove**.

Frontend today (`ProcessingCheckInDialog`, open effect ~462–488):

- Seed batch → `prior` mode; else `new`.
- Product fields: `seed → row → rowLinkedProduct` — **does not fully implement ladder #2** when no seed but `row.product` + `row.productId` exist.

### E1. Detailed check-in open behavior

**Answer:**

| Condition | `productMode` | Product fields source |
|-----------|---------------|----------------------|
| `seed.batch` exists | `prior` | Batch product + batch defaults for condition/price/retail |
| No seed, `row.productId` + `row.product` | `keep` (maps to backend `keep` / existing) | Coalesced product identity from detail; transaction from row |
| No seed, no product match | `new` | Row bookmark identity (coalesced display = row) |

Rename nothing in API — use existing `product_mode` values: `keep`, `existing`, `new`, `prior` (frontend `prior` → backend existing with batch product id).

### E2. Quick check-in (non-dialog)

**Answer:** Out of P3 scope unless it already sends empty product_mode — then ensure backend ladder uses ProcessingRow match only (same as detailed). Add one matrix test if quick path exists on active card.

### E3. After check-in, update ProcessingRow.matched_product

Already sets `row.matched_product = product` when different — **keep**.

**Answer:** Keep; this is Level 3 fact alignment, not manifest write.

---

## F. Stop ManifestRow.matched_product writes

### F1. Exact deletion

**Answer:** In `processing_row_check_in`, **delete** block:

```python
if row.manifest_row_id and row.manifest_row.matched_product_id != product.id:
    ManifestRow.objects.filter(pk=row.manifest_row_id).update(matched_product=product)
```

Do not replace with another manifest match field write.

### F2. Remove manifest fallback in matched resolution

**Answer:** Delete branch:

```python
elif matched is None and row.manifest_row and row.manifest_row.matched_product_id:
    matched = row.manifest_row.matched_product
```

Processing match + latest batch only.

### F3. Test that must exist

**Answer:** Extend `test_processing_validation_matrix.py`:

- PO with ProcessingRow match set, ManifestRow match null → check-in → assert `mr.matched_product_id` still null; Items have correct `product_id`; ProcessingRow.matched_product updated.

Update `test_processing_row_check_in_reuses_latest_batch_product` if it asserted manifest sync.

### F4. Legacy orders with only manifest match

Rows finalized before P1 may have manifest match but null ProcessingRow match.

**Answer:** **Read fallback only in coalesce/detail**, never write. Denorm may still copy manifest → ProcessingRow when ProcessingRow null (existing refresh behavior) — **do not remove in P3** (data repair, not identity rule). P6 audits readers.

---

## G. search_string

`assign_search_strings_for_instances` already appends product number/title/brand/upc when `matched_product_id` set.

### G1. Should base string use coalesced identity instead of raw bookmark?

**Answer:** **Yes.** When rebuilding search string during denorm, build base from **coalesced identity** (product-wins) so queue search matches what staff see. Implementation: call coalesce helper before `build_processing_row_search_string` or pass coalesced fields into a thin wrapper.

> **Fable 5 correction (2026-06-09): No — reversed.** Keep the base built from **raw row bookmark fields**. Design §3: `search_string` includes **both** row fields and matched-product fields so search hits *either* name. Coalescing the base would drop the row's own title/brand from the blob whenever the product's are non-empty, and the augment only re-adds *product* tokens — net result, searching by the manifest/row wording ("hdbnd red") stops finding the row. The existing `build_processing_row_search_string` (row) + `augment_processing_row_search_string` (product number/upc/model/title/brand) pair already implements §3 correctly; acceptance K5/K6 are satisfied by the augment alone. **Do fix instead:** the `products_by_id`-built-before-backfill gap in `refresh_processing_rows_denorm` (see review verdict at top) so legacy backfilled rows get product tokens in the same denorm pass.

### G2. Duplicate tokens

Product title + row title both in blob is OK for search recall.

**Answer:** Accept duplication; normalize whitespace only. Don't dedupe aggressively.

---

## H. Denorm refresh

### H1. Change manifest fallback in refresh_processing_rows_denorm?

Current: if `pr.matched_product_id is None`, copy from `ManifestRow.matched_product_id`.

**Answer:** **Keep for P3** — migrating legacy data onto ProcessingRow is compatible with Rule 3 (no manifest *writes*). Add comment citing P6 deprecation.

### H2. link_processing_rows_to_manifest_rows copies manifest match onto new bookmarks

**Answer:** **Leave** — runs at link/finalize repair time; Fable may revisit in P6. Not check-in path.

---

## I. Frontend files (expected touch list)

| Area | File | Change |
|------|------|--------|
| Types | `frontend/src/types/inventory.types.ts` | Optional `manifestEvidence` on row DTO |
| Detail card | `ProcessingActiveCard.tsx` | Trust server coalesced title; optional manifest evidence caption |
| Check-in | `ProcessingCheckInDialog.tsx` | Ladder E1 on open; prefer `row.product` when no seed |
| Queue text | `processingQueueCellText.ts` | Prefer server coalesced `row.title` (may simplify to `row.title` only after server coalesce) |
| Filters | `processingWorkspaceFilters.ts` | UPC from coalesced identifiers / product |
| Hooks | `useProcessingWorkspace.ts` | Only if prefill endpoint added (unlikely) |

**No** PreprocessingPage changes in P3.

---

## J. API contract additions

### J1. New endpoints?

**Answer:** **No** new endpoints unless implementation hits a wall. Prefer enriching existing:

- `GET …/processing-workspace/` list rows  
- `GET …/processing-row-detail/`  
- `POST …/processing-row-check-in/` behavior change only  

### J2. Breaking changes for frontend?

List row `title`/`brand`/`category` may change text when product matched (intended). Call out in CHANGELOG as visible behavior fix.

---

## K. Acceptance checklist (P3 gate)

Session 5 done when, on a real finalized PO in the dashboard:

1. Row with ProcessingRow match shows **product title** in queue and detail even when bookmark/manifest title differs (e.g. manifest "hdbnd red", product "Red Headband").
2. Row defaults pills and check-in dialog **prefill product identity** when matched; price/qty/retail from row.
3. Second check-in on same row with prior batch prefills batch defaults (existing — regression still passes).
4. Check-in **does not** set `ManifestRow.matched_product_id` (DB verify or test).
5. Search finds row by **product title** after match finalized from preprocessing.
6. `search_string` rebuild after check-in includes product tokens (test or manual).
7. Regression: P1/P2 tests + processing validation matrix still pass.
8. **(Fable 5 added)** Search by the **row/manifest wording** still finds a matched row (guards the G1 correction — base string must keep row tokens).

Optional manual: dispute view still shows manifest wording via `manifestEvidence` or manifest link.

---

## L. Files Composer expects to touch

| Layer | Files |
|-------|-------|
| Coalesce helper | `apps/inventory/services/processing_workspace.py` and/or `processing_identity.py` (new, only if helper > ~40 lines) |
| Workspace | `processing_workspace.py` — list core fields, detail builder |
| Check-in | `apps/inventory/processing_ops.py` |
| Search | `processing_search_string.py` — optional coalesce hook |
| Tests | `test_processing_validation_matrix.py`, `test_product_matching.py` or new file |
| Frontend | `ProcessingCheckInDialog.tsx`, `ProcessingActiveCard.tsx`, types, maybe `processingQueueCellText.ts` |
| Docs | `CHANGELOG.md`, `inventory-pipeline.md`, initiative Session 5 block |

---

## M. Top mistakes Composer (or Fable) should avoid

1. **Writing product fields onto ProcessingRow during coalesce** — display only; row bookmark stays staff/AI curated copy.
2. **Re-introducing manifest match write** "for compatibility" — breaks Rule 3; use read fallback instead.
3. **Implementing precedence only in frontend** — list payload comes from server values(); must coalesce server-side or list stays wrong before detail load.
4. **Pulling Final Decisions grid precedence into P3** — scope creep; Session 4 A1 ruling stands.
5. **Changing check-in to PATCH Product** when staff edit identity fields — still create/match via existing resolver; product catalog edits remain conservative (`manual_item.py` fill-blanks policy).

---

## N. Open items for Fable on return (explicitly unresolved)

Composer is **less confident** on these — Fable should decide quickly:

| # | Question | Composer lean | Why flagged | **Fable 5 ruling (2026-06-09)** |
|---|----------|---------------|-------------|--------------------------------|
| 1 | `manifestEvidence` block vs slimmer UX | Ship server block | Owner may not want extra UI noise | **Ship server block.** Detail-only, read-only, per D2. UI: one small "Vendor claim" caption — render only when a product is matched (otherwise it duplicates the editable fields). If owner objects to even that, the server block stays and UI collapses to nothing; cheap either way. |
| 2 | Row defaults pill tooltip about product-wins | Skip in P3 unless free | Copy approval | **Skip in P3.** Copy needs owner sign-off and the coalesced pills are self-explanatory in practice. Revisit only if staff confusion is actually reported. |
| 3 | Remove denorm manifest fallback in P3 | Keep fallback | P6 might prefer hard cutover | **Keep fallback** (Composer is right). It writes manifest→ProcessingRow (repair direction), never the reverse — compatible with Rule 3. It also covers the legacy-row hole F2's deletion opens (legacy rows with only a manifest match get repaired by denorm before check-in matters). Comment cites P6. |
| 4 | Hydrate `product` on list for all rows vs only matched | Only when `productId` set | Payload size | **Only when `matched_product_id` set** (Composer is right). Unmatched rows get `product: null`; the five-field shape in C1 is the cap — no description/specs on list. |

---

## O. Sign-off

**Composer 2.5:** All **Answer:** blocks above are filled to the best of my ability without Fable. Session 5 implementer (Composer or human) may proceed; Fable should skim **N** + **Session 4 recap** first on return.

**Date:** 2026-06-09

**Fable 5:** Reviewed all answers against `product_identity_design.md` and source (verified every cited line number). Two corrections — B1/B2 field ownership (`search_tags`/`taxonomy` are transaction, not identity) and G1 reversed (do **not** coalesce the search-string base; row tokens must survive). One bonus in-scope fix: `products_by_id` built before the legacy backfill loop in `refresh_processing_rows_denorm`. All four N items ruled (see table). Everything else approved as written — Composer's recon and scope fence were accurate. **Session 5 is cleared to implement** against this doc as corrected.

**Date:** 2026-06-09

**Notes for Fable:** Session 4 code is merged locally on branch/worktree you inherit — grep `PreprocessingMatchCell`, `regenerate-match-candidates`, `scaleFromAiBase`. P3 is mostly **server coalesce + delete two manifest lines in check-in + frontend ladder alignment**. The architectural heart is one helper, two serialize sites, one delete block, one test.
