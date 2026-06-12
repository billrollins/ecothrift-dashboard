<!-- Last updated: 2026-06-09 (ANSWERED by Fable 5 — Session 4 may proceed; includes new section P: pricing bug + fix spec) -->
<!-- Answers: Fable 5 fills each **Answer:** block. Composer 2.5 implements Session 4 from resolved answers only. -->

# Session 4 handoff — questions for Fable 5

**From:** Composer 2.5 (implementer, Session 4)  
**To:** Fable 5 (design author, [`product_identity_design.md`](./product_identity_design.md))  
**Goal:** Resolve every ambiguity so Session 4 (P2 — Final Decisions UI) can ship without re-opening architecture.

**P1 already shipped (do not re-litigate unless answer says otherwise):**

- `PreprocessingRow.match_candidates`, `final_matched_product`, `match_source`
- `services/product_matching.py` — UPC (100, auto-select) → VendorProductRef (90) → exact title/brand (80)
- Auto-run on staging `apply-cleanup-csv`; review GET/PATCH exposes match fields
- Finalize copies `final_matched_product` → `ProcessingRow.matched_product`
- Denorm refresh preserves `ProcessingRow.matched_product` (no longer overwritten from `ManifestRow`)

**Known gap Composer found (needs your ruling):**

- Processing **row detail** (`build_processing_row_detail` in `processing_workspace.py`) still sets `productId` / `product` from **`ManifestRow.matched_product`**, not `ProcessingRow.matched_product`. List payload uses ProcessingRow correctly. Detail merge in UI can wipe `productId`. Is fixing detail in **P2, P3, or out of scope for P2**?

> **Fable 5 ruling: fix it in P2.** It is a two-line server change and it sits directly on the P2 gate — staff will decide matches in the stepper, finalize, and immediately open the workspace; if detail wipes the chip they will report "matching is broken." In the manifest-backed branch of `build_processing_row_detail` change `prod = mr.matched_product` to `prod = bk.matched_product or mr.matched_product` (bk = the ProcessingRow; keep the manifest value as legacy fallback only). Same pattern in the added-row branch is already correct (`bk.matched_product` first). Add one test: detail returns `productId` from ProcessingRow when ManifestRow match is null. Do **not** touch anything else in the workspace (see A2).

**Primary UI surfaces for P2:**

- `frontend/src/pages/inventory/PreprocessingPage.tsx` — Step 3 (rename to Final Decisions)
- `frontend/src/components/inventory/PreprocessingReviewTable.tsx` — dense pricing/listing grid
- `frontend/src/api/inventory.api.ts` — `PreprocessingReviewRow` types (match fields **not typed yet**)
- Dead legacy (not wired): `ProductMatchingPanel.tsx`, `MatchReviewPanel.tsx` (ManifestRow-era)

---

## How to answer

- Be **decisive** — pick one option; note tradeoffs only if both are viable.
- Reference **exact field names / API keys / component names** where possible.
- If something belongs in **P3+**, say so explicitly so P2 does not creep.
- Fill every `**Answer:**` block. Leave blank only if truly blocked on owner input (say what to ask owner).

---

## A. P2 scope fence (what Session 4 must / must not include)

### A1. Precedence reads in Final Decisions grid

Design §3: when `final_matched_product` is set, **Product wins identity** (title, brand, model, UPC, category, description, specs) at **read/display** time — row `final_*` is not overwritten in DB.

For the **Final Decisions table**, when a row has `final_matched_product` set, should listing columns (`title`, `brand`, `model`, `category`, UPC from identifiers) show:

- (a) **Row effective coalesced values** (current behavior — `title`/`brand`/etc. from serializer effective fields),
- (b) **Live Product fields** (fetch/hydrate product on match), or
- (c) **Dual display** (e.g. row title muted + product title prominent)?

Staff still edit **row** listing fields in this step today. If (b), do edits go to row `final_*` only while product column is read-only reference?

**Answer:** **(a) plus a separate match column.** Keep all existing editable columns exactly as they are — they edit row `final_*` and that does not change. Add one new **Product** column (see C1) that displays the matched product's identity (`product_number` + title) as a read-only reference. Do **not** swap row cells to live product values in P2 — full "product wins at display time" precedence is **P3** (it touches the workspace and listing surfaces too, and doing it piecemeal here would make Step 3 behave differently from everywhere else for a session). The match column displaying product identity next to the editable row title gives staff the comparison they need without precedence machinery. Use `matched_product_detail` from the server (see A3/J1) for the chip text — never the candidate snapshot, which can be stale.

---

### A2. Is P2 allowed to touch processing workspace at all?

P2 gate says "staff can fully decide matches in the **stepper** without admin/API." Confirm: **zero** changes to `/inventory/processing/:id` in Session 4, even if detail `productId` bug causes confusion after finalize?

**Answer:** Zero **frontend** changes to the workspace page. The **only** workspace-side change allowed is the two-line server fix in `build_processing_row_detail` ruled on above (ProcessingRow match first, manifest fallback). No workspace UI, no check-in dialog changes, no denorm changes — those are P3/P5.

---

### A3. Backend work in P2

May Session 4 add any backend beyond frontend + types? Examples:

- New endpoint `POST …/regenerate-match-candidates/`
- Enrich review serializer with nested `matched_product` object (title, product_number, upc) to avoid N+1
- Bulk PATCH helper for "same as row N"
- Server field `same_product_row_numbers: number[]` for badges across pages

List **allowed** backend deltas for P2, or say **frontend-only**.

**Answer:** Four backend deltas are allowed, nothing else:

1. **Detail fix** in `build_processing_row_detail` (ruled above).
2. **Serializer hydration:** add `matched_product_detail` to `PreprocessingReviewRowSerializer` (and minimal variant): `{id, product_number, title, brand, upc, default_price}` or `null`. Implement with `select_related('final_matched_product')` on the review queryset — no N+1, no extra endpoint.
3. **Regenerate endpoint:** `POST /api/inventory/purchase-orders/{id}/regenerate-match-candidates/` — a thin wrapper that calls `generate_match_candidates_for_order(order)` and returns its summary dict. Reuse the existing permission/ownership checks of the other preprocessing actions in `views.py`. No parameters.
4. **`same_product_row_numbers`:** add to the review serializer (see C3) — computed once per request with a single aggregate over the PO's staging rows (`values('final_matched_product').annotate(...)` → dict in serializer context), not per-row queries.

No bulk-PATCH endpoint — "same as row N" is one ordinary PATCH (see F1). Plus the pricing fix in **section P**, which is frontend-only.

---

## B. Stepper rename and entry behavior

### B1. Copy / labels

Exact strings for Step 3:

- Stepper label: `Final Decisions` vs `Final Review & Product Match` vs other?
- Page heading / helper text (one sentence staff training line)?

**Answer:** Stepper label: **`Final Decisions`** (short, matches the design doc's stage name). Page heading: `Final Decisions`. Helper line (one sentence, under the heading): *"Confirm titles, prices, and product matches before finalizing — a linked product describes the item; the row describes this order's deal."* That sentence is the staff-facing version of Rule 2 and is reused in the column tooltip (section H).

---

### B2. When to run `generate_match_candidates_for_order`

Design §4: candidates auto-run on cleanup apply **or on entering Final Decisions**.

P1 only hooks **cleanup apply**. On first open of Step 3 (or every open), should UI:

- (a) **Never** re-run (cleanup only),
- (b) Re-run **once per PO visit** if `match_candidates` empty on any row,
- (c) Re-run **every time** Step 3 opens,
- (d) Re-run only via explicit **"Refresh matches"** button?

If (b/c/d), should re-run **respect** `match_source='staff'` rows (P1: yes for candidates refresh, never override staff decision)?

**Answer:** **(d) with one auto-run assist.** Primary mechanism is an explicit **"Refresh matches"** button in the Step 3 toolbar that calls the new regenerate endpoint (A3 #3). Assist: on entering Step 3, if the loaded page shows **zero rows with any `match_candidates`** and the order has staged rows, fire the regenerate call once automatically (guard with a ref so it runs at most once per mount). Do not re-run on every open — it's wasted DB work and causes chip flicker. Staff-decision safety is already guaranteed server-side by P1 (`match_source='staff'` rows keep their decision; candidates lists may still refresh) — the UI needs no extra guard, but after regenerate completes, invalidate the review query so chips update.

---

### B3. Orders that skipped cleanup

If staff goes Standardize → Final Decisions without cleanup CSV, candidates may be empty. Should Step 3:

- Show empty match UI and allow manual product search only,
- Block with message "Run cleanup first",
- Auto-run matcher against `standard_*` / ManifestRow only (needs backend call)?

**Answer:** **Never block.** The P1 matcher already reads the *effective* triple (final → ai → standard), so it works fine on standardize-only orders — the B2 auto-run + "Refresh matches" button cover this case with no special handling. Worst case the matcher finds nothing and staff use manual search. No extra code path for "skipped cleanup."

---

## C. Match column UX in `PreprocessingReviewTable`

The table is already wide (pricing, ideal delta, category, condition, etc.). Where does product matching live?

### C1. Layout option

Pick one (or specify hybrid):

1. **New column(s)** in the main grid (`Product`, `Match`, `Candidates`)
2. **Expandable row** panel (click row → match section below)
3. **Side drawer** on row select
4. **Sticky right column** with compact product chip + actions

Consider 100–500 rows, pagination, horizontal scroll pain.

**Answer:** **Hybrid of 1 + 4: one new compact `Product` column (~150px) containing a single chip, with a popover for everything else.** Place it between `Retail` and the price cluster. The cell renders exactly one chip (state per D1). Clicking the chip (or the search icon when empty) opens a **popover anchored to the cell** containing: the candidate list (D4), the inline product Autocomplete (E), the "New product / Clear" action (D3), the "Same as row…" action (F1), and the same-product row numbers (C3). No expandable rows (kills row-scanning density), no drawer (too heavy for a per-row decision staff make 100×). This keeps the grid one chip wider and puts all match interaction in one component (`PreprocessingMatchCell`, see M).

---

### C2. Minimum columns for match (if in grid)

Which fields must be visible **without hover** for staff to decide in under 3 seconds?

- Product number + title
- UPC (from candidate snapshot vs row identifiers)
- Score + source badge (`upc` / `vendor_ref` / `text`)
- `match_source` badge (`auto` / `staff` / undecided)
- Row title (manifest/cleaned) for comparison

List required vs optional.

**Answer:** Visible in the cell without hover (chip content only): **state color/icon (D1)** + **`product_number`** (e.g. `PRD-1042`); if space allows at the chosen width, a truncated product title after the number. Tooltip on the chip = full product title + brand + UPC. Everything else — score, source badge (`upc`/`vendor_ref`/`text`), `default_price`, row-title comparison — lives in the **popover**, where each candidate line shows: title (wraps), product_number, UPC, source badge, score, default_price. Row title is already on screen in the Title column, so no duplicate "comparison" rendering is needed.

---

### C3. Pagination vs same-product badge

Design §4: "also rows 14, 31" badge when multiple rows share `final_matched_product`.

With **server-side pagination**, peer rows may be on other pages. Should P2:

- (a) Compute badges **client-side from current page only** (cheap, incomplete),
- (b) Add server field e.g. `same_product_row_numbers: number[]` on review serializer,
- (c) Defer same-product badge to **P5** and only show match UI per row in P2?

**Answer:** **(b).** Incomplete badges (a) are worse than none — staff would trust them and miss duplicates on other pages. The cost is one aggregate query per request (see A3 #4): rows with the same non-null `final_matched_product` on the same PO, excluding self, as `row_number[]` sorted ascending, capped at 10. UI: small link-icon suffix on the chip when non-empty; full list ("Also rows 14, 31") in the popover. The *grouped batch actions* on shared products remain **P5** — P2 ships display only.

---

## D. Candidate chips and decided match states

### D1. Visual states (enumerate all)

For each row, which UI states must exist?

| State | `final_matched_product` | `match_source` | Required UI |
|-------|-------------------------|----------------|-------------|
| Undecided, no candidates | null | '' | Outlined grey chip, `SearchOutlined` icon, text `Match…` — reads as "nothing found, click to search" |
| Undecided, has candidates | null | '' | Outlined **info/blue** chip, text `? PRD-1042` (top candidate's product_number) + count suffix when >1 (e.g. `? PRD-1042 +2`) — reads as "suggestion, not decided" |
| Auto-selected | set | auto | **Filled info/blue** chip, `BoltOutlined` icon, text `PRD-1042` — reads as "machine decided (UPC), verify if unsure" |
| Staff confirmed | set | staff | **Filled success/green** chip, `CheckCircleOutline` icon, text `PRD-1042` |
| Staff "new product" | null | staff | Outlined **success/green** chip, `AddCircleOutline` icon, text `New product` |

All five chips are clickable and open the same popover. Color logic: grey = nothing, blue = machine, green = staff. Truncated product title may follow the number when column width allows.

**Answer:** filled in the table above.

---

### D2. Accept top candidate

"Accept" on candidate #1 — PATCH `final_matched_product=<id>` + `match_source='staff'` or leave `match_source='auto'`?

If auto-selected UPC match is already set, is **Accept** hidden, or does Accept mean "I verified this" and flip to `staff`?

**Answer:** Accept always PATCHes `final_matched_product=<id>` — server sets `match_source='staff'` (J2). For auto-selected rows, show a **`Confirm`** button in the popover that sends the same PATCH with the already-set product id, flipping the chip blue→green. Do not hide it: the green/blue distinction is how the owner audits which auto-matches were human-verified. No-op protection is unnecessary — the PATCH is idempotent.

---

### D3. Clear / "New product"

Clear action sets `final_matched_product: null`. Must it **always** set `match_source: 'staff'` (P1 PATCH behavior) so regen never auto-re-selects UPC?

Confirm staff-facing label: `New product` / `No match` / `Clear match`?

**Answer:** Yes — clear always goes through the same PATCH (`final_matched_product: null`), and the server stamps `match_source='staff'`, which is exactly what protects the row from auto re-selection on regenerate. Label: **`New product`** (primary meaning: "this line is a product we don't have yet"). In the popover, render it as a button with the `AddCircleOutline` icon; when a match is currently set, the same button reads `Clear match → New product` so staff understand it's also the undo.

---

### D4. Multiple candidates

Show all candidates (max 5) as chips, or only top 3 + "more"? Click candidate #2 to select — same as Accept?

**Answer:** The popover lists **all stored candidates** (P1 caps storage; ≤5) as rows, sorted by score, top one visually emphasized. No "more" folding needed at 5. Clicking any candidate row = select = identical PATCH path as Accept (`staff`). The grid cell chip only ever previews the **top** candidate.

---

## E. Inline product search

### E1. Component reuse

Use existing patterns from:

- `ProcessingCheckInDialog` product Autocomplete (`getProducts`),
- `AddProcessingItemDialog` product picker,
- New slim inline Autocomplete in table cell?

Specify component/file to extend vs copy.

**Answer:** **Copy the pattern, don't extend either dialog.** Build the Autocomplete inside the new `PreprocessingMatchCell.tsx` popover using the `AddProcessingItemDialog` product-picker pattern (it's the slimmer of the two) with `getProducts` from `inventory.api.ts`. Do not refactor the dialogs into a shared component in P2 — three near-copies are acceptable until P5/P6, when a shared `ProductPicker` can be extracted with the collapse/split work.

---

### E2. Search behavior

- Minimum chars before search?
- `getProducts` params (`search`, `page_size`)?
- After pick: PATCH immediately or mark row dirty with rest of grid saves?

**Answer:** Min **2 chars**, debounce **300 ms**, `getProducts({ search, page_size: 20 })`, show `product_number — title` (brand secondary) per option. After pick: **PATCH immediately** (see G1 — match decisions are not drafts). Close the popover on success; on failure keep it open and show the error inline.

---

### E3. Picking a product staff did not "confirm" from candidates

If row had UPC candidate A but staff searches and picks B, set `match_source: 'staff'` always?

**Answer:** Yes, always — any human action through the PATCH endpoint becomes `staff` (server-enforced; the client never sends `match_source`). Candidate A stays in `match_candidates` untouched; candidates are suggestions, not state.

---

## F. "Same as row N" action

Design §4: copies match to current row (shared FK, no link entity).

### F1. Interaction

- Where does action live (context menu, button, dropdown of row numbers)?
- Copy **only** `final_matched_product` + set `match_source: 'staff'`, or also copy nothing else?
- Allowed only when source row has non-null `final_matched_product`?
- One PATCH per target row, or batch endpoint?

**Answer:** Lives in the **popover**: a small `Same as row…` control with a number input (staff type the row number they're looking at). Resolution: look up that `row_number` in the currently loaded review data; if it's not on the current page, fetch it via the review endpoint's existing search/filter or simply show "Row N not on this page — search the product instead" (acceptable P2 limitation; don't build cross-page row lookup plumbing). Copies **only** `final_matched_product`; nothing else, ever (prices/condition are per-deal, Rule 1). Disabled with helper text when the source row's match is null. **One ordinary PATCH** to the *current* row — no batch endpoint (A3). If staff want to apply one product to many rows, that's the P5 grouped-action feature.

---

### F2. Same product without explicit copy

If staff sets row 12 and row 40 to the same product via search independently, is badge-only grouping enough (no forced "link" action)?

**Answer:** Yes — badge-only. The shared FK *is* the grouping (design §4: no link entity, ever). The `same_product_row_numbers` badge appears automatically once the server recomputes it.

---

## G. Save / dirty / PATCH integration

Table today: local drafts → `onSaveRows` → PATCH `preprocessing-review` with `{ id, ...fields }`.

### G1. Match fields in draft model

Extend `PreprocessingReviewRowPatch` with `final_matched_product?: number | null`?

Match changes: save **immediately** on Accept/Clear/Search pick, or batch with "Save changes" like listing fields?

**Answer:** **Immediately, and do NOT add `final_matched_product` to `PreprocessingReviewRowPatch` / the drafts map.** Match decisions and listing drafts are different beasts: a draft is "text I'm still composing"; a match decision is a discrete commit staff expect to stick the moment they click. Mixing them into the dirty system creates two failure modes: (1) staff decides matches, navigates away, loses decisions silently; (2) "Save Changes" replays a stale match captured in a draft over a newer decision. Implement a dedicated mutation in `useInventory.ts` (e.g. `useUpdatePreprocessingMatch`) that PATCHes `{ rows: [{ id, final_matched_product }] }` through the same `preprocessing-review` endpoint. Disable the popover's action buttons while the PATCH is in flight; the chip shows a small spinner overlay.

---

### G2. Interaction with `ai_status`

Listing edits clear `ai_status`. Confirm: **match-only PATCH must NOT clear `ai_status`** (P1 backend behavior). Any UI indication?

**Answer:** Confirmed — already enforced server-side in P1; the client does nothing special. No UI indication needed; the existing `ai_status` display simply stays as-is after a match decision. (Add one frontend-visible regression check to the manual test list: match a row, refresh, `ai_status` unchanged.)

---

### G3. Optimistic UI

After match PATCH, invalidate `['preprocessingReview', orderId]` only, or also refetch summary totals?

**Answer:** Invalidate `['preprocessingReview', orderId]` **only**. Match decisions do not affect pricing totals or the summary aggregate, so refetching summary is wasted load. (The invalidation also refreshes `same_product_row_numbers` for the current page, which is exactly what we want.) Optional polish, not required for P2 sign-off: optimistic `setQueryData` on the patched row so the chip flips before the refetch lands.

---

## H. Display of row vs product (training clarity)

Staff see manifest-ish title in row columns and maybe richer product title in match column. One-sentence tooltip or helper for Rule 2 on this screen?

Example copy approved?

**Answer:** Approved copy — tooltip on the `Product` column header: *"A linked product describes the item itself; this row's text describes what's in this order. Clearing the match makes this row a new product at check-in."* Same sentence family as the B1 helper line so staff hear one message everywhere.

---

## I. Legacy components

`ProductMatchingPanel.tsx` / `MatchReviewPanel.tsx` use **`ManifestRow`** shape (`matched_product`, `match_candidates` with `match_type`, `ai_match_decision`). Not imported anywhere.

P2 should:

- (a) Ignore / delete later,
- (b) Mine UX patterns only,
- (c) Rewire to preprocessing review (likely wrong layer)?

**Answer:** **(a).** Do not import, rewire, or refactor them — they're ManifestRow-era and the layer is wrong by Rule 3. Deletion happens in **P6** with the ManifestRow match-field deprecation. You may glance at them for chip styling ideas, but copy nothing structural.

---

## J. Types and API contract

### J1. `PreprocessingReviewRow` TS additions

Confirm exact shape:

```ts
match_candidates: Array<{
  product_id: number;
  score: number;
  source: 'upc' | 'vendor_ref' | 'text';
  snapshot: {
    title: string;
    brand: string;
    upc: string;
    default_price: string | null;
    product_number: string;
  };
}>;
final_matched_product: number | null;
match_source: '' | 'auto' | 'staff';
```

Add optional hydrated `matched_product_detail` from server in P2?

**Answer:** Shape confirmed exactly as written. Yes — add the hydrated field (A3 #2):

```ts
matched_product_detail: {
  id: number;
  product_number: string;
  title: string;
  brand: string;
  upc: string;
  default_price: string | null;
} | null;
```

The decided chip renders from `matched_product_detail` (live product data); candidate `snapshot` is used **only** inside the candidate list (it's a point-in-time copy and may drift from the real product).

---

### J2. PATCH payload

Confirm: `{ id, final_matched_product: number | null }` only — no separate `match_source` in client payload (server sets `staff` on PATCH).

**Answer:** Confirmed. The client must never send `match_source`; provenance is server-stamped. A match-only request body is `{ rows: [{ id, final_matched_product }] }` with no other fields, which is also what keeps `ai_status` untouched (G2).

---

## K. Resolve design doc §10 open questions for P2

| # | Question | Your ruling for Session 4 |
|---|----------|---------------------------|
| 1 | UPC auto-select vs candidate-only | **Keep P1 auto-select.** UPC-exact is high precision; the blue (auto) vs green (staff) chip distinction plus the Confirm action give the audit trail. Revisit only if owner reports bad UPC data. |
| 2 | Fuzzy/AI matching in P2? | **No.** Exact tiers only in P2. Fuzzy/AI scoring is a separate later enhancement after staff have used the exact matcher for a while and we know its miss patterns. |
| 3 | (Collapse UI — defer?) | **Defer to P5.** P2 ships only the read-only `same_product_row_numbers` badge (C3). No grouped views, no batch actions. |
| 4 | MergeModal — touch in P2? | **No.** Zero changes. Manifest-level merge is a different layer (Rule 3) and irrelevant to match decisions. |
| 5 | Denorm primary product recompute | **Defer to P4.** P1's preserve-if-set rule is sufficient for the P2 gate; recompute semantics get decided with the check-in surfaces work. |

---

## L. Acceptance checklist (P2 gate)

Composer will treat Session 4 done when staff can ___ without admin/API. Fill in **observable** checklist (5–8 bullets) you will sign off on.

**Answer:** Session 4 is done when, on a real PO in the dashboard:

1. Step 3 is labeled **Final Decisions** and every staged row shows a match chip in one of the five D1 states.
2. Staff can click a suggested candidate (or Confirm an auto match) and the chip flips to staff-green; it survives page refresh.
3. Staff can search any catalog product inline and set it as the match.
4. Staff can clear to **New product**, and clicking **Refresh matches** afterwards does *not* re-auto-select that row (staff-null respected).
5. **Refresh matches** populates candidates on an order that skipped cleanup.
6. Rows sharing a product show the "also rows N, M" indicator, correct across pages.
7. After finalize, the workspace **list and row detail** both show the matched product for those rows (detail fix verified).
8. Bulk pricing on Final Decisions works per **section P**: scaling anchored to AI prices preserves relative dynamics, retail-index mode works, and no action ever writes `$0.00` over unpriced rows.

---

## M. Files Composer should expect to touch (confirm or amend)

| Area | Files |
|------|-------|
| Types | `frontend/src/api/inventory.api.ts`, maybe `inventory.types.ts` |
| Table | `PreprocessingReviewTable.tsx` |
| Stepper | `PreprocessingPage.tsx`, `PreprocessingStepper.tsx`? |
| Hooks | `useInventory.ts` (review patch/mutation) |
| New component? | e.g. `PreprocessingMatchCell.tsx` — name & location |
| Tests | `frontend/...test.ts`? or manual-only for P2? |
| Backend | list allowed changes from A3 |

**Answer:** Confirmed with amendments:

| Area | Files |
|------|-------|
| Types | `frontend/src/api/inventory.api.ts` only (match fields + `matched_product_detail` + `same_product_row_numbers` on `PreprocessingReviewRow`; do **not** extend `PreprocessingReviewRowPatch`) |
| Table | `PreprocessingReviewTable.tsx` (new column + section P pricing toolbar rework) |
| Stepper | `PreprocessingPage.tsx` (label, helper line, auto-regenerate-once hook); `PreprocessingStepper.tsx` only if the label lives there |
| Hooks | `useInventory.ts` — new `useUpdatePreprocessingMatch`, new `useRegenerateMatchCandidates` |
| New component | `frontend/src/components/inventory/PreprocessingMatchCell.tsx` (chip + popover + Autocomplete + actions) — same folder as the table |
| Utils | `frontend/src/utils/preprocessingReviewTotals.ts` (pricing helpers per section P) |
| Tests | Backend: extend `test_product_matching.py` (regen endpoint, detail fix, hydration field). Frontend: vitest unit tests for the new pricing math in `preprocessingReviewTotals` (pure functions — cheap and worth it). Match UI: manual checklist (L) for P2. |
| Backend | `views.py` (regen action), `serializers.py` (hydration + same-product field), `processing_workspace.py` (detail fix) — nothing else |

---

## N. Anything Composer will get wrong without your guidance

Freeform: top 3 mistakes to avoid in Session 4 implementation.

**Answer:**

1. **Don't route match decisions through the dirty-drafts system.** If `final_matched_product` ever lands in `draftsById`, "Save Changes" can replay a stale match over a newer decision and unsaved-navigation silently drops decisions. Matches PATCH immediately via their own mutation; drafts stay listing/pricing-only.
2. **Don't render the decided chip from the candidate `snapshot`.** Snapshots are point-in-time copies for the suggestion list; the decided chip must use server-hydrated `matched_product_detail` so renamed products display correctly. Mixing these up produces "the chip shows the old title" bugs that look like data corruption.
3. **Don't anchor bulk pricing to `final_price` (the current bug — section P).** The scale base is the AI price (`proposed_price`); rows without a base get *skipped*, never written as `0.00`. Re-read section P before touching the toolbar; the ± buttons' current compound-on-final behavior is being removed, not preserved.

---

## O. Sign-off

**Fable 5:** All **Answer:** blocks are filled. Session 4 implementer may proceed.

**Date:** 2026-06-09

**Notes for owner (if any):** Section P (below) documents the preprocessing pricing bug you reported — what's wrong, the fix, and what working behavior looks like. It is in-scope for Session 4 (frontend-only) and is acceptance item L8.

---

## P. Preprocessing pricing — investigation, fix, and target behavior

### P.1 Intended behavior (owner's requirement)

1. AI price estimates come back from cleanup and live on **`PreprocessingRow.proposed_price`** (per unit). `ideal_price` is a separate cost-derived target (≈2× allocated unit cost) used for the "% vs ideal" health stat.
2. On Final Decisions, staff make **broad up/down adjustments** so the *order total* hits their goal, while **preserving the AI's relative structure** (expensive items stay proportionally expensive).
3. Staff can alternatively price the whole order on a **retail-indexed scale** (e.g. "everything at 30% of retail"), ignoring the AI structure entirely.

### P.2 What is actually wrong (root causes, with code refs)

**Bug 1 — the ±10% bulk buttons zero out unpriced rows and destroy the AI structure.**
`applyPctCompound` in `PreprocessingReviewTable.tsx` computes the new price from `currentFinalNumeric(row, draft)`, a helper that deliberately reads **only `final_price`** (its comment says "not proposed_price") and **returns `0` when final is unset**. On a fresh order the AI prices are in `proposed_price` and `final_price` is null — so clicking **+10%** writes `final_price = round(0 × 1.1) = "0.00"` onto every row. One click erases the entire AI pricing structure with zeros. (The totals helper `effectiveReviewSetPrice` in `preprocessingReviewTotals.ts` coalesces final→proposed correctly — the stat cards were right while the buttons were wrong, which is why this looked like "pricing randomly broken.")

**Bug 2 — compound semantics can't hit a goal and drift.**
Each click multiplies the *current* final price (0.9 / 1.1 factors, compounding). Clicking +10% then −10% lands at 0.99× — not back where you started. There is no way to enter "make the order total $X" or "set everything to AI −15%"; staff can only nudge blindly and watch the total. And once Bug 1 zeroes rows, compounding keeps them at zero forever.

**Bug 3 — no retail-indexed mode exists at all.** `unit_retail` is displayed but no action prices from it.

### P.3 The fix (frontend-only, in `PreprocessingReviewTable.tsx` + `preprocessingReviewTotals.ts`)

Replace the compound model with an **anchored scaling model**. All bulk pricing actions compute each row's price from a stable per-row **base**, never from the previous click's output:

```
Mode "Scale AI":      final_price = round2(base_ai × factor)
                      base_ai  = proposed_price (per unit). Row skipped if null/blank.
Mode "% of retail":   final_price = round2(unit_retail × pct / 100)
                      Row skipped if unit_retail null/zero.
```

**Toolbar (replaces the current −10% / +10% / All filtered = Ideal cluster):**

- Mode toggle: **`Scale AI prices`** | **`% of retail`** (ToggleButtonGroup).
- Scale AI mode inputs (either drives the same factor):
  - `Adjust %` numeric field (e.g. `-15` → factor 0.85), with −/+ stepper buttons that change the field by 5.
  - `Target total $` field: factor = target ÷ Σ(`proposed_price` × qty) over **all filtered rows that have a base** (reuse `ensureBulkTargetsLoaded`, qty via the existing `qtyEff` rule). Show the computed factor as "= AI −12.4%".
- % of retail mode input: `% of retail` numeric field (no default magic number; leave empty until staff type).
- **`Apply to filtered`** button executes the computation into drafts via the existing `mergeIntoDrafts`; persistence stays on **Save Changes** exactly as today (review-before-commit is a feature).
- Keep **`All = AI prices`** (rename of "All filtered = Ideal" — it copies `proposed_price`, which is the AI price, so name it honestly) and keep **Reset to AI** as-is.
- After apply, snackbar: "Priced 142 rows · skipped 3 with no AI price" (or "…no retail"). Skipped rows are **left untouched** — never written to 0.
- Set `pricing_notes` per row: `Bulk AI ×0.85` / `Bulk target $2,400 (×0.872)` / `Bulk 30% of retail`.

**Per-row − / + steppers:** keep them, but they operate on the row's **effective** price (`effectiveReviewSetPrice` — final else proposed, draft-aware) instead of `currentFinalNumeric`, in fixed 5% steps. If the row has no effective price, the buttons do nothing. Delete `currentFinalNumeric` entirely so the broken base can't be reused.

**Math helpers** (pure functions: `scaleFromAiBase`, `priceFromRetail`, `factorForTargetTotal`) go in `preprocessingReviewTotals.ts` with vitest coverage: zero-base skipping, rounding, target-total factor, idempotence (applying the same factor twice yields identical output).

### P.4 What working code looks like (acceptance for L8)

1. Fresh order, AI prices only: type `-15` in Scale AI mode → Apply → every row with an AI price shows `proposed × 0.85`; relative ordering and ratios between rows are exactly preserved; rows without AI prices are untouched and counted in the snackbar. **Nothing is ever set to 0.00.**
2. Type `Target total 2400` → Apply → "Set prices" stat card reads ≈$2,400 (rounding drift only); each row is the same uniform multiple of its AI price.
3. Apply is **idempotent**: clicking Apply twice with the same input changes nothing (anchored to base, not compounding).
4. Switch to `% of retail`, type `30` → Apply → each row with retail = `unit_retail × 0.30`, AI structure ignored; rows without retail untouched + counted.
5. Hand-edit one row's price afterwards → only that row changes; Save Changes persists everything; "% vs ideal" card updates live throughout.
6. Reset to AI still restores the AI baseline, from which any scaling can be re-applied.
