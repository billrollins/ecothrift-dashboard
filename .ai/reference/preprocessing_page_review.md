# Preprocessing page review (`/inventory/preprocessing/:orderId`)

**Scope:** Staff workflow at e.g. `http://localhost:5173/inventory/preprocessing/316` — **316** is the **PurchaseOrder** primary key. This doc describes what data you see, where it lives (React vs PostgreSQL), performance characteristics, UI choices, and the job-to-be-done for users.

---

## 1. What you are looking at (full data picture)

### 1.1 Page shell

- **Header** — Order picker (from preprocessing queue + current order), **Back to order**, **total units**, **estimated retail** (ideal-price rollup from status endpoint).
- **Stepper** — Three steps: **Standardize Manifest** → **AI Cleanup** → **Final Review**. `completedStep` (0–2) is derived from server counts; `activeStep` is what the user clicked.
- **Body** — One of three panels depending on `activeStep`.

### 1.2 Step 1 — Standardize Manifest

| Data | Meaning | Source |
|------|---------|--------|
| **Manifest preview** | CSV **headers**, up to **10 sample raw rows**, delimiter, row_count, header **signature** | `PurchaseOrder.manifest_preview` (JSON, written at manifest upload) |
| **Template** | Selected `CSVTemplate` id/name, **column_mappings** / formulas | Mixed: preview JSON + **`GET /api/inventory/templates/:id/`** when user picks a template |
| **Standard column definitions** | Bucket + flat field metadata for the formula UI | **`GET /api/inventory/manifest-fields/`** (cached almost forever in React Query) |
| **Formulas** | Per-target expressions (`[Header]`, `TRIM(...)`, etc.) | **React state** (`useStandardManifest`) seeded from preview mappings; edits are local until **Standardize** runs |
| **AI formula suggestions** | Optional LLM-proposed formulas + reasonings | **`POST …/suggest-formulas/`** → local state |
| **Counts** | `standardized_rows`, `cleaned_rows`, etc. | **`GET …/preprocessing-status/`** |

**Commit action:** **`POST …/process-manifest/`** — reads full CSV from S3, creates/updates **`PreprocessingOrder`** + **`PreprocessingRow`** rows (`standard_*` layer), bumps staging metadata.

### 1.3 Step 2 — AI Cleanup

| Data | Meaning | Source |
|------|---------|--------|
| **Expected row ids / row numbers** | Validates cleanup CSV / JSON apply covers exactly staged rows | **`GET …/preprocessing-review/?full=true`** (one full fetch when session is active and standardized) |
| **Validated apply payload** | Parsed wide/narrow cleanup rows + optional `ai_status` | **React state** after user uploads or builds rows in UI |
| **Soft warnings** | Non-fatal validation messages from server | **`POST …/apply-cleanup-csv/`** response |

**Apply action:** **`POST …/apply-cleanup-csv/`** — writes **`ai_*`**, **`ai_title`**, optional **`ai_status`** on **`PreprocessingRow`**.

### 1.4 Step 3 — Final Review

| Data | Meaning | Source |
|------|---------|--------|
| **Review rows** | Full staged listing: triple layers (`standard_*`, `ai_*`, `final_*`), coalesced **aliases** (`title`, `brand`, …), pricing, `ai_status`, linked product hints as exposed by serializer | **`GET …/preprocessing-review/?full=true`** once when user enters Step 3 with an active session |
| **Summary chips** | Paid vs ideal vs set totals, deltas — for **filtered** slice | **Client-computed** from `filteredReviewRows` + order total paid from status |
| **Search / missing price / pagination** | Filter and page the grid | **Client-side** on `reviewRowsFull` (debounced search 300ms) |
| **Dirty rows** | Unsaved edits | **React state** inside **`PreprocessingReviewTable`** |
| **Baseline patches** | “What AI suggested” for diff/baseline UX | **React state** (`reviewBaselineByRowId`) built from first full fetch |

**Save:** **`PATCH …/preprocessing-review/`** with `{ rows: [{ id, patch }] }` — persists to **`PreprocessingRow`**. Server may clear **`ai_status`** when certain fields change.

**Finalize:** **`POST …/finalize-preprocessing/`** — coalesces **`final_*`**, rebuilds canonical **`ManifestRow`** rows, closes staging session.

### 1.5 Effective “row” the user edits (Final Review)

The API serializer exposes **both**:

- **Coalesced fields** — `title`, `description`, `brand`, `model`, `condition`, `notes`, `category`, JSON blobs (`identifiers`, `taxonomy`, …), etc. These follow the **standard → AI → final** visibility rules implemented in **`PreprocessingReviewRowSerializer`** and helpers.
- **Explicit layers** — e.g. `standard_description`, `ai_description`, `final_description`, `ai_title`, `final_title`, …

What staff type in the grid is written through the review **patch** into the appropriate staging columns; **`final_*`** for many fields stays **null** until finalize (see initiative / pipeline docs).

---

## 2. Session state vs database

### 2.1 Django models (persisted)

| Model | Role |
|-------|------|
| **`PurchaseOrder`** | Order header; **`manifest_preview`**, **`manifest_id`** (S3 file), costs, status |
| **`PreprocessingOrder`** | 1:1 with PO while preprocessing exists — `workflow_status`, `row_count`, `finalized_at`, formulas JSON, template FK, timestamps |
| **`PreprocessingRow`** | Many rows per session — `standard_*`, `ai_*`, `final_*`, pricing, `ai_status`, `raw_row`, quantity, `unit_retail`, product link fields, etc. |
| **`ManifestRow`** | Canonical manifest lines **after finalize** (and legacy paths); not the Step 3 editor target while staging is open |

No separate “browser session” store: the **source of truth** for staged data is **PostgreSQL**. React holds **working copies** for formulas, dirty review cells, and full review snapshot (`reviewRowsFull`).

### 2.2 React state (ephemeral, in-memory)

Non-exhaustive but important:

- Step navigation: `activeStep`, `stepDerived`
- Step 1: formulas, template selection, AI reasonings, preview toggles, `processResult`
- Step 2: `cleanupValidatedPayload`, `cleanupExpectedRowIds`, `cleanupRowNumberById`, soft warnings
- Step 3: `reviewRowsFull`, `reviewBaselineByRowId`, `reviewPage` / `reviewPageSize`, search inputs, `reviewDirtyCount`
- Modals: `confirmDialog`

**localStorage:** `lastPreprocessOrderId` — used when `/inventory/preprocessing` has no `:id` to redirect to a recent order.

### 2.3 React Query (client cache)

| Query key | Endpoint | Notes |
|-----------|----------|--------|
| `['preprocessingQueue']` | `GET …/orders/preprocessing-queue/` | Lean list for picker; **15s** `staleTime` |
| `['preprocessingStatus', orderId]` | `GET …/orders/{id}/preprocessing-status/` | **Refetches** on invalidation after mutations; default stale behavior (fresh on focus/mount per TanStack defaults) |
| `['inventory', 'manifest-fields']` | `GET …/manifest-fields/` | **`staleTime: Infinity`** |

**Note:** `usePreprocessingReview()` exists in **`useInventory.ts`** but **`PreprocessingPage` does not use it** for the table. Review data is loaded with **imperative** `getPreprocessingReview(..., { full: true })` + `useState`, not React Query — so automatic caching/refetch for review rows is limited to what mutations invalidate.

### 2.4 Read/write summary

| Operation | Direction |
|-----------|-----------|
| Load queue / status / manifest fields | DB → API → React |
| Standardize | React formulas → API → **`PreprocessingRow`** bulk create/update |
| Apply cleanup | CSV/JSON → API → **`PreprocessingRow`** `ai_*` / `ai_status` |
| Final Review load | DB → **`GET …/preprocessing-review/?full=true`** → `reviewRowsFull` |
| Review save | Dirty patches → **`PATCH …/preprocessing-review/`** → DB |
| Finalize | **`POST …/finalize-preprocessing/`** → DB (**`ManifestRow`**, session closed) |

---

## 3. Pagination

### 3.1 Final Review (what this page does)

- **All** staged rows are fetched in one response: **`GET …/preprocessing-review/?full=true`** (server cap **10,000** rows; otherwise **413**).
- **Pagination is client-side:** `filteredReviewRows` is sliced with `reviewPage` and `reviewPageSize` (default **50**). **`TablePagination`** in **`PreprocessingReviewTable`** drives those props.

### 3.2 Server-side pagination (available but unused by this page)

If `full` is **not** `true`, the same endpoint supports **`page`** and **`page_size`** (10–100), plus **`search`** and **`missing_price`** — **`build_preprocessing_review_queryset`** in **`apps/inventory/views.py`**. The current SPA prefers one fat payload + local filtering for Step 3.

---

## 4. Why page load can feel slow

Several costs stack:

1. **`preprocessing-status` loads every staged (or manifest) row into Python memory**  
   For an active **`PreprocessingOrder`**, the view does `rows = list(prep.rows.order_by('row_number'))` and iterates them multiple times to compute `cleaned_rows`, `final_rows`, `missing_price`, and dollar rollups. **Complexity is O(n) in row count** per request — fine for small manifests, noticeable for hundreds/thousands.

2. **Extra full review fetch on Step 2**  
   While preprocessing is active and standardized, the page calls **`preprocessing-review?full=true`** to build **`cleanupExpectedRowIds`** — a **second** full serialization of all rows (large JSON) even before the user opens Final Review.

3. **Final Review Step 3 fetches `full=true` again**  
   Third full payload when entering step 2 (activeStep === 2), with **`PreprocessingReviewRowSerializer`** expanding many computed fields per row.

4. **`manifest-fields` + queue + status** run on or shortly after mount** — parallel but still multiple round trips.

5. **Large JSON per row** — identifiers, taxonomy, specifications, tracking, search_tags, `ai_status` — multiply payload size.

6. **React work** — filtering and re-rendering a wide table; client-side slice still holds **full** `reviewRowsFull` in memory.

**Mitigation ideas (not implemented in this doc):** server-side aggregates for status without listing all rows; reuse a single cached review query; Step 2 row-id endpoint without full row bodies; virtualized grid; server pagination for review.

---

## 5. UI decisions (design & implementation)

- **Single page, three steps** — Avoids navigation churn; aligns with mental model “one PO, one pipeline.”
- **Stepper with explicit completed vs active** — `completedStep` from server prevents guessing whether cleanup is “really” done.
- **Cream background (`#F4F1EB`) + green CTAs** — Distinct preprocessing chrome vs generic MUI default.
- **Order dropdown from preprocessing queue** — Only POs with manifest and non-finalized preprocessing (plus current order injected if missing from list).
- **Step 1: StandardManifestBuilder + formula preview** — Heavy reliance on **sample rows** from `manifest_preview`, not the full CSV, for preview performance.
- **Step 2: File / payload validation before Run Cleanup** — Expected row id set must match; reduces partial applies.
- **Step 3: Dense table** — Inline edits, chips for `ai_status`, bulk actions over **filtered** ids, “missing price only” toggle, debounced search to limit re-filter churn.
- **Finalize gated** — Requires **no missing prices** and **no dirty review rows** (`reviewDirtyCount === 0`).
- **Confirm modals** — Undo standardization, re-standardize, finalize — destructive or hard-to-reverse actions are explicit.

---

## 6. UX: what we are helping the user do

**Primary job:** Turn a **raw vendor manifest** attached to a **purchase order** into **clean, priced, canonical** inventory lines ready for **processing/receiving**, with a clear audit path (standard → AI → human).

**Concrete outcomes:**

1. **Map** vendor columns to standard fields **repeatably** (templates + formulas).
2. **Commit** standardization once mappings are correct — seed staging rows without yet needing AI.
3. **Apply** offline or tool-generated cleanup (Grok CSV, etc.) **safely** — row coverage checks, warnings instead of hard fails where possible.
4. **Review** AI output in context — see coalesced values, **`ai_status`** when something was flagged, adjust copy and prices.
5. **Price** every line — ideal/sell guidance vs “missing price” blockers.
6. **Finalize** — promote staging to **`ManifestRow`** and hand off to the processing queue.

**Who it’s for:** Staff who understand PO + manifest context, not casual users; density is intentional to reduce clicks per hundred lines.

---

## 7. Key files (for maintainers)

| Layer | File(s) |
|-------|---------|
| Page | `frontend/src/pages/inventory/PreprocessingPage.tsx` |
| Final Review UI | `frontend/src/components/inventory/PreprocessingReviewTable.tsx` |
| Cleanup step | `frontend/src/components/inventory/preprocessing/CleanupStep.tsx`, `cleanupCsv.ts` |
| Hooks | `frontend/src/hooks/useInventory.ts` (`usePreprocessingStatus`, `usePreprocessingQueue`, mutations) |
| API types | `frontend/src/api/inventory.api.ts` |
| Backend status/review | `apps/inventory/views.py` — `preprocessing_status`, `preprocessing_review`, `build_preprocessing_review_queryset`, `update_preprocessing_review_rows` |
| Serializer | `apps/inventory/serializers.py` — `PreprocessingReviewRowSerializer` |
| Models | `apps/inventory/models.py` — `PreprocessingOrder`, `PreprocessingRow` |

---

*Last updated: 2026-05-01 — describes shipped behavior for Eco-Thrift Dashboard preprocessing.*
