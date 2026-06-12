<!-- Last updated: 2026-06-09 — handoff to Fable for product-matching audit + staff UX guidance -->

# Product matching — review request for Fable

**From:** Bill (owner) via Composer (implementer)  
**To:** Fable — please read this doc, then **walk the code** and answer the three question blocks below with sharper detail than Composer can give from memory alone.  
**Authority:** [`product_identity_design.md`](./product_identity_design.md) is the landmark design. Sessions 4–8 (P2–P6) shipped against it; this doc is a **post-ship audit + staff playbook** request, not a new architecture session unless you find a real violation.

---

## What the owner wants

Bill is using the intake pipeline on real POs (e.g. WLMRT-OJU-3V74, 744 lines) and needs a clear, honest picture of **product matching** — not just what we designed on paper, but what the shipped code actually does and how a human operator is supposed to participate at each stage.

He is asking Fable to answer three things:

### 1. How is product matching done?

End-to-end: when candidates are generated, what matchers run, what gets auto-selected, what crosses finalize, what happens at check-in, and how collapse (many rows → one product) and split (one row → many products) interact with matching.

### 2. Is it coded correctly?

Audit the implementation against [`product_identity_design.md`](./product_identity_design.md) — especially the three rules, the confidence ladder (candidates → decided match → Item fact), and the deprecation of `ManifestRow` match fields. Call out bugs, inconsistencies between surfaces, legacy paths still wired, and places where UI behavior could mislead staff.

### 3. As a user, how am I supposed to verify matches and weigh in?

Bill wants a **stage-by-stage staff guide** covering every surface where product identity is decided or confirmed:

| Stage / surface | What staff might need to do |
|-----------------|----------------------------|
| **Preprocessing — Final Decisions** | Review auto-matches, accept/clear/search, "same as row N", mark "new product" |
| **Processing — queue** | See product hints, peer badges, group-by-product, N-products chip |
| **Processing — row detail** | Understand matched product vs row defaults vs vendor evidence |
| **Processing — row defaults** | Edit title/brand/price — does this change the product match? Should it? |
| **Check-in (quick / detailed)** | Confirm or override product; `product_mode` ladder |
| **Check in together** | Multi-row collapse when hints already align |
| **Assign shared product** | Rows differ but staff believes same physical product — product may not exist yet in catalog, but rows need one shared **decision** before check-in |
| **Split / remap** | One row checked in as multiple products; fix wrong batch product after the fact |

The tricky case Bill cares about: **two manifest lines are the same physical thing, but no catalog Product exists yet.** The design says Products are created at check-in (Level 3), not at match time (Level 2). Staff still need a coherent way to say "these rows go together" and make **one** product decision — without destructive merge of manifest lines.

---

## From Composer — who I am and my best explanation (please verify in code)

**Who I am:** Composer, the agent that implemented Sessions 4–8 (P2–P6) of the product-identity initiative. I wrote or touched most of the matching backend, Final Decisions UI, processing workspace identity reads, split/collapse flows, and manifest-match deprecation. What follows is my working mental model — **treat it as a map, not gospel.** Fable should confirm every claim against the repo and correct me where I am wrong or incomplete.

### The model in one paragraph

Product matching is a **three-level ladder**, not a single FK:

1. **Level 1 — Candidates** (`PreprocessingRow.match_candidates`): cheap suggestions, recomputable, no side effects.
2. **Level 2 — Decided match** (`PreprocessingRow.final_matched_product` → copied to `ProcessingRow.matched_product` at finalize): "we believe this line is product X" or **null = we believe this is new**. Never creates a Product.
3. **Level 3 — Fact** (`Item.product`): physical units bound at check-in. **Only here** are Products created (or an existing Product reused via `product_mode`).

Staff decisions at Level 2 set `match_source='staff'` and are **never overwritten** by auto-matching — including an explicit staff "new product" (null FK + staff source).

### Backend: candidate generation

**File:** `apps/inventory/services/product_matching.py`  
**Entry points:**
- Auto-runs after staging **apply cleanup CSV** (`views.py` ~4496–4507)
- Manual **`POST …/regenerate-match-candidates/`** (`views.py` `regenerate_match_candidates`)

**Matchers (strongest first, max 5 candidates per row):**

| Tier | Score | Source key | Auto-select? |
|------|-------|------------|--------------|
| UPC exact | 100 | `upc` | **Yes** — sets `final_matched_product` + `match_source='auto'` if row is undecided |
| VendorProductRef | 90 | `vendor_ref` | No — candidate only |
| Exact title + brand | 80 | `text` | No — candidate only |

Row inputs come from **effective preprocessing layers** (`layer_helpers.effective_preprocessing_title`, `effective_preprocessing_triple`) — typically post-cleanup `ai_*` / coalesced `final_*`, not raw vendor CSV.

**Staff PATCH:** `PATCH …/preprocessing-review/` with `final_matched_product: <id|null>` sets `match_source='staff'` (`views.py` `update_preprocessing_review_rows` ~785–803).

### Backend: finalize carry

**File:** `apps/inventory/services/processing_finalize.py`  
`final_matched_product_id` is projected into `ProcessingRow.matched_product_id` when bookmarks are built. **`match_candidates` do not cross finalize** — processing uses live product search, not stale staging chips.

### Backend: processing mutations

**File:** `apps/inventory/processing_ops.py`

| Action | What it does to `matched_product` |
|--------|----------------------------------|
| `_check_in_processing_row` | Resolves Product via `product_mode` ladder; **updates** `ProcessingRow.matched_product` to the product actually used |
| `processing_check_in_together` | Requires all selected rows share same `matched_product_id`; per-row check-ins |
| `processing_assign_shared_product` | Sets same `matched_product_id` on 2+ rows — **no manifest write, no Item FK mutation** |
| `remap_check_in_batch_product` | Re-points Items in an existing batch to a different Product |
| `processing_row_patch` | Edits row **defaults** (title, brand, price, identifiers…) — **does not** accept `matched_product` |

### Frontend: where staff touch matching today

| Surface | Component / API | Composer's understanding |
|---------|-----------------|---------------------------|
| Final Decisions grid | `PreprocessingMatchCell.tsx` in `PreprocessingReviewTable.tsx` | Chip opens popover: accept candidate, search catalog, "New product", "Same as row N". Peer badge from `same_product_row_numbers`. |
| Regenerate | Preprocessing page → `POST regenerate-match-candidates` | Re-runs matchers; safe to repeat |
| Processing queue | `ProcessingQueueTable.tsx` | Shows `productId` / product chip, peer row numbers, "N products" for split rows |
| Row detail header | `ProcessingActiveCard.tsx` | Displays product-wins title (`product?.title \|\| row.title`); vendor evidence subtitle; same-product alert + Check in together |
| Row defaults | `ProcessingActiveCard.tsx` → `processing_row_patch` | Edits **row** listing/pricing fields only — **no product picker here** |
| Detailed check-in | `ProcessingCheckInDialog.tsx` | Full `product_mode` (`new` / `existing` / `keep` / …), product search, identity fields |
| Quick check-in | `ProcessingQuickCheckInFooter` / active card | Reuses latest batch product or row hint; blocked when row has ≥2 distinct products (mixed guard) |
| Collapse — together | `CheckInTogetherDialog.tsx` | Requires shared `productId` on selected rows |
| Collapse — assign hint | `AssignSharedProductDialog.tsx` | Pick existing catalog product for 2+ rows with **different** hints |
| Split remap | `RemapBatchProductDialog.tsx` | Manager remaps checked-in batch to different Product |

**Legacy still in repo (likely dead UI):** `ProductMatchingPanel.tsx`, `MatchReviewPanel.tsx` — ManifestRow-era matching; **not wired** to current stepper per Session 4 notes. Fable: confirm nothing still mounts them.

### Field precedence (what staff should see)

Design §3: **If a product is linked, the product describes the thing; the row describes the deal.**

- **Identity** (title, brand, model, UPC, category, description, specs): Product wins at read time when `matched_product` / `productId` is set.
- **Transaction** (qty, retail, shelf price, condition, notes, row tags): always the row.

P3 shipped product-wins reads in the processing workspace; Final Decisions grid still shows **editable row columns** plus a separate **Product** match column (Fable Session 4 ruling) — staff compare side by side before finalize.

### The "same rows, no catalog product yet" case (Composer's read)

Design intent:

- Level 2 null = "new product at check-in" — **not** "create Product now."
- Collapse before check-in: staff can align **decisions** by copying match (`Same as row N` in preprocessing) or **`Assign shared product`** in processing — but assign shared product currently requires picking an **existing** catalog product (`product_mode: 'existing'` only).
- If no Product exists yet, staff options today are probably:
  1. Leave both rows as "New product" and rely on check-in to create one Product on first row, then assign/search that Product on sibling rows — **awkward**.
  2. Check in first row (creates Product), then assign shared product on siblings — **works but backwards from ideal UX**.
  3. Preprocessing "Same as row N" with row 1 marked new — copies null, not a shared positive decision — **does not group them**.

**This is a gap I am not confident we solved well.** Fable: say whether this is a design hole, a missing feature ("shared new product" pseudo-hint), or acceptable workflow — and what staff should actually do.

---

## Questions for Fable (please answer after reading code)

### Q1 — How is it done? (technical walkthrough)

Please produce a concise but complete pipeline narrative, citing files/functions. Cover at minimum:

- Trigger points for `generate_match_candidates_for_order`
- What "undecided" means (`final_matched_product is None and match_source != 'staff'`)
- Exact finalize projection fields
- Check-in prefill order in `_check_in_processing_row` (prior batch → matched hint → row fields → product creation)
- How `refresh_processing_rows_denorm` and `build_processing_row_detail` resolve `productId` (and any remaining `ManifestRow.matched_product` fallback reads)
- Split (`distinct_product_count`, mixed guard) vs collapse (`sameProductRowNumbers`, check-in together, assign shared)

### Q2 — Is it coded correctly?

Audit checklist — mark each **pass / fail / partial** with file pointers:

- [ ] Rule 1: no backwards sync (product → row overwrite; row decision → manifest)
- [ ] Rule 2: Product FK is the identity reference; row `final_*` preserved when matched
- [ ] Rule 3: no production writes to deprecated `ManifestRow` match columns from current UI flows
- [ ] Level 3 only: Products created at check-in / add-item, not at match or finalize
- [ ] Staff decisions sticky across regenerate
- [ ] UPC auto-select only when undecided
- [ ] Candidates do not cross finalize; processing search is the change path
- [ ] Collapse without destructive merge (`MergeModal` retired; assign shared + together)
- [ ] Split without breaking manifest 1:1 (`ProcessingRow` never physically merged)
- [ ] Tests in `test_product_matching.py`, `test_processing_identity.py`, `test_processing_collapse.py`, `test_processing_deprecation.py` actually cover the above

Call out **any bug or UX lie** (UI shows X but backend does Y).

### Q3 — Staff playbook: verify and weigh in

Write this for Bill as the operator, not for engineers. For **each surface in the table above**, answer:

1. **What you see** (1–2 sentences)
2. **What decision you are making** (match vs new vs defer)
3. **Recommended action** (click path)
4. **What persists** (which table/field after save)
5. **Common mistakes** to avoid

Include a dedicated subsection: **"Two manifest lines, same physical item, no catalog Product yet — what do I do?"**

Include another subsection: **"I matched wrong — how do I undo at each stage?"**

---

## Code map (starting points for Fable)

| Area | Primary files |
|------|----------------|
| Design | `.ai/reference/product_identity/product_identity_design.md` |
| Match engine | `apps/inventory/services/product_matching.py` |
| Staging decisions | `apps/inventory/views.py` — `update_preprocessing_review_rows`, `regenerate_match_candidates`, cleanup apply |
| Models | `apps/inventory/models.py` — `PreprocessingRow.final_matched_product`, `match_candidates`, `match_source`; `ProcessingRow.matched_product` |
| Finalize | `apps/inventory/services/processing_finalize.py` |
| Check-in / collapse / assign | `apps/inventory/processing_ops.py` |
| Workspace reads | `apps/inventory/services/processing_workspace.py` — `build_processing_row_detail`, denorm |
| Final Decisions UI | `frontend/src/components/inventory/PreprocessingMatchCell.tsx`, `PreprocessingReviewTable.tsx` |
| Processing UI | `frontend/src/pages/inventory/processing/ProcessingActiveCard.tsx`, `ProcessingCheckInDialog.tsx`, `AssignSharedProductDialog.tsx`, `CheckInTogetherDialog.tsx`, `RemapBatchProductDialog.tsx` |
| Tests | `apps/inventory/tests/test_product_matching.py`, `test_processing_identity.py`, `test_processing_collapse.py`, `test_processing_split.py`, `test_processing_deprecation.py` |
| QA checklist | `.ai/reference/product_identity/sessions_4_8_verification_checklist.md` |
| Session audit | `.ai/reference/product_identity/sessions_4_8_audit_log.md` |

**Regression command:**

```bash
pytest apps/inventory/tests/test_product_matching.py \
  apps/inventory/tests/test_processing_identity.py \
  apps/inventory/tests/test_processing_collapse.py \
  apps/inventory/tests/test_processing_split.py \
  apps/inventory/tests/test_processing_deprecation.py \
  -q
```

---

## Composer's known uncertainties (please resolve)

1. **Assign shared product requires existing Product** — is there an approved workflow when catalog entry does not exist yet?
2. **Row defaults vs matched product** — editing title in row defaults does not change `matched_product`; does display precedence confuse staff who edit title expecting to "unmatch"?
3. **Legacy panels** — are `ProductMatchingPanel` / `MatchReviewPanel` fully unreachable? Any `match-products` POST still writing manifest fields?
4. **Denorm legacy fallback** — does `refresh_processing_rows_denorm` still backfill from `ManifestRow.matched_product` on old POs in a way that contradicts P6?
5. **Final Decisions display** — row columns still show row `final_*` while match column shows product; is that sufficient for verification or should Fable recommend a UX change?

---

## Deliverable format requested

Fable: please append (or create a sibling doc) with:

1. **Executive summary** (≤10 bullets) for Bill
2. **Technical appendix** (Q1 + Q2)
3. **Staff playbook** (Q3) — suitable to paste into internal training docs
4. **Recommended fixes** — prioritized if anything is wrong or missing

---

**Parent index:** [`.ai/reference/product_identity/README.md`](./README.md)
