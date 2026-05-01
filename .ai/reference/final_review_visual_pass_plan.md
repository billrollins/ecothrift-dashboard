# Plan: Final Review visual pass (mockup-first)

**Ground truth:** [`.ai/reference/final_review_visual_rebuild_directive.md`](final_review_visual_rebuild_directive.md)  
**Design (behavior / deferred features):** [`.ai/reference/consult_design_final_review.md`](consult_design_final_review.md)  
**Older spec-wide plan (follow-on):** [`.ai/reference/final_review_ui_rebuild_plan.md`](final_review_ui_rebuild_plan.md)

---

## 1. Authority and conflicts

| Topic | This pass (directive) | Deferred / follow-on |
|--------|----------------------|----------------------|
| Finalize control | Stays on **stepper** row; label **Finalize and Open Processing** + `ArrowForward` (MUI). | Separate `FinalReviewStatusBar` with Finalize (consult design §4). |
| Summary of PO money | **Six stat cards** (PAID, IDEAL, SET, % VS IDEAL, UNITS, MISSING PRICE). | Chip cluster; collapsible pricing accordion (consult §5). |
| Save Changes | **Toolbar** right group; label always `Save Changes (N)`. | Footer Save (consult §7.8 / §8.1). |
| Filters | **Missing price** button only; search placeholder **Search items...** | AI flagged / Unsaved filters; full identifier search string (defer partial per directive). |
| Bulk actions | **All rows in current filtered set** on the current page (same as today’s bulk semantics), no selection column. | Selection + ConfirmModal if N > 10 (consult §6). |
| Grid | **10 columns** per directive §4; combined Title/Description; ±10% **PRICE** icon buttons; **VS IDEAL** chip column. | Checkbox, expand, status column, `react-virtual` (directive §12). |
| Auto-save | Remove blur auto-save and 30s timer if still present (aligns with manual Save). | Navigation `useBlocker` deferred per directive §12. |
| Icons | `@mui/icons-material` (no `lucide-react` in repo). | — |

**Data correctness:** Keep a **single computation** for missing-price count / finalize blockers so the stepper Finalize tooltip and MISSING PRICE card never disagree (same work as earlier contradiction fix). Reuse or align with `summarizePreprocessingReviewRows` / `deriveFinalReviewIssues` if already introduced.

---

## 2. Code touchpoints (expected)

| Area | Files |
|------|--------|
| Step 3 label + Finalize CTA | [`frontend/src/components/inventory/preprocessing/PreprocessingStepper.tsx`](frontend/src/components/inventory/preprocessing/PreprocessingStepper.tsx) (or labels constant); [`frontend/src/pages/inventory/PreprocessingPage.tsx`](frontend/src/pages/inventory/PreprocessingPage.tsx) (props, finalize handler, tooltip). |
| Stat cards | New component e.g. `PreprocessingReviewStatCards.tsx` under `preprocessing/`; wired from `reviewRowsFull` + order `total_paid` / same aggregates as today’s summary. |
| Toolbar layout | [`frontend/src/components/inventory/PreprocessingReviewTable.tsx`](frontend/src/components/inventory/PreprocessingReviewTable.tsx) or extracted `PreprocessingReviewToolbar.tsx`. |
| Table body | Same table module: column defs, row layout, draft state, bulk helpers (operate on **filteredRowIds** for current view). |
| Pagination footer | Same; strip Save button if present in footer; enlarge prev/next hit targets. |
| Taxonomy | `Autocomplete` options from [`frontend/src/constants/taxonomyV1.ts`](frontend/src/constants/taxonomyV1.ts); **verify** backend `PATCH preprocessing-review` accepts the same category set (directive / prior plan hard requirement). |

---

## 3. Stat card metrics (wire-up)

Compute from **full PO staged rows** (`reviewRowsFull` or equivalent), not the filtered grid slice:

- **PAID:** `order.total_paid` / `preprocessingStatus.summary.total_paid` (existing).
- **IDEAL / SET / UNITS / MISSING PRICE:** match logic already used in [`reviewSummary.ts`](frontend/src/components/inventory/preprocessing/reviewSummary.ts) for consistency with finalize.
- **% VS IDEAL (card):** portfolio-level variance (same family as current ideal delta); **tolerance bands** per directive §2.5 (neutral within ±10%, warning 10–30% off, error >30% off — define “off” relative to ideal rollup).

**Row VS IDEAL chip** (directive §6.8): uses **price vs row `ideal_price`** with bands 90–110% success, 70–89% / 111–130% warning, else error; missing price shows `-`.

---

## 4. PR sequencing (directive §13)

- **PR A — Chrome + summary + toolbar:** Steps 1–3 (stepper copy, six cards, toolbar row + Save `(N)` + remove Select Visible / Clear Select + Missing Price + search placeholder). Remove success banner and chip row; remove accordion if it was started.
- **PR B — Table reshape:** Step 4 (column set, no h-scroll at 1280px, sticky headers).
- **PR C — Cells + polish:** Steps 5–9 (title/description column, PRICE steppers, category chip + condition menu, card color polish, spacing §9).

Each PR should leave the app shippable (no broken Step 3).

---

## 5. QA (must pass before merge)

- All **§11 defects** in the directive eliminated (screenshot check vs mockup).
- **1280px:** no horizontal scroll for **80** and **936** row POs.
- **Viewport density:** ~12–15 data rows visible on 1080p at default page size (directive §11.7).
- MISSING PRICE card **green** @ 0, **red** @ >0; **no** duplicate “all clear” banner.
- Save always **`Save Changes (0)`** or **`Save Changes (N)`**; primary only when `N > 0`.
- Apply on title only when AI title **differs** from current.

---

## 6. Out of scope reminder (directive §12)

Do **not** block PRs on: virtualization, row expand panel, status column, selection-based bulk, extra filter chips, keyboard shortcuts, `useBlocker` — schedule as **Pass 2** after visual sign-off.

---

## 7. CHANGELOG

When implementation lands, replace or narrow the existing **[Unreleased]** “planned” Final Review bullets in [`CHANGELOG.md`](CHANGELOG.md) with **shipped** notes that describe the stat cards, toolbar Save, column layout, and deferred items.

---

## 8. Review gate (blocking — read before sending screenshots)

Reviews compare the page to **[`fix_this.md`](fix_this.md)** / the directive. **Data-only deltas** (e.g. correct Set dollars, missing price count 0) are not sufficient if the layout is unchanged.

**Minimum before resurfacing for visual review:** complete directive **§13 steps 1 through 4** so they are **visible on the page**:

1. Stepper: **Manual Review** label; Finalize **Finalize and Open Processing** with `ArrowForward` (MUI).
2. **Six-card stat row** replaces the chip cluster (and remove redundant “all clear” banner if the MISSING PRICE card encodes it).
3. **Toolbar** restyle: single row, Save **`Save Changes (N)`** on the right, bulk actions grouped.
4. **Table column refactor** so **no horizontal scrollbar** at **1280px** for valid fixtures.

Do **not** send a screenshot for visual sign-off when **zero** of the §11 defects are fixed. If a step in the directive cannot be implemented as written, push back with a **specific** question on that step.

**Pointer for coders:** [`.ai/reference/fix_this.md`](fix_this.md).
