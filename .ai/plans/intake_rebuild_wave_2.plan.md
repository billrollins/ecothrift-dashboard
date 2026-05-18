---
name: Intake rebuild Wave 2
overview: Read-side cutover — no application logic reads PreprocessingOrder.workflow_status Or current_step; PO preprocess_status and rollups drive preprocessing_status (completed_step enum), preprocessing_queue filter/order (PO-only tie-break and finalize gate), and synthetic legacy echo. Writes stay dual until Wave 3.
todos:
  - id: a
    content: "A. preprocessing_status: enum completed_step; synthetic echo from PO; stop row-count heuristic for step"
    status: pending
  - id: b
    content: "B. preprocessing_queue: PO finalized_at filter; Case/When preprocess_status ordering; tie-break -PurchaseOrder.updated_at"
    status: pending
  - id: c
    content: "C. Other backend: grep sweep; PreprocessingOrderSerializer/dead paths; no prep-column ordering/filters remain"
    status: pending
  - id: d
    content: "D. Frontend: deprecate PreprocessingSessionInfo workflow_status/current_step in inventory.api.ts; regression PreprocessingPage"
    status: pending
  - id: e
    content: "E. Tests: drift test; assertNumQueries baseline; parallel PO assertions; table-driven synthetic echo for all preprocess_status values"
    status: pending
isProject: false
---

# Intake pipeline rebuild — Wave 2 (plan only; do not execute without go-ahead)

## Field map + roadmap (authoritative)

- [`.ai/reference/order_processing_pipeline_rebuild/intake_field_map.md`](../reference/order_processing_pipeline_rebuild/intake_field_map.md)
- [`.ai/reference/order_processing_pipeline_rebuild/data_flow_plan.md`](../reference/order_processing_pipeline_rebuild/data_flow_plan.md) — §5 stage modeling, §10 Wave 2 scope

If this plan conflicts with `intake_field_map.md`, **the field map wins**.

---

## Recon (grep — Wave 2 touchpoints)

### Pre-execution: FinalizePanel and `completedStep >= 3`

**Investigation (Feb 2026 codebase):**

- [`frontend/src/components/inventory/FinalizePanel.tsx`](../../frontend/src/components/inventory/FinalizePanel.tsx) uses `completedStep >= 3` for “Preprocessing complete” / “Go to Processing” messaging (~239, ~566, ~581).
- **No file under `frontend/src` imports `FinalizePanel`** (only the component file references itself). The component is **unused / dead in the current SPA**.

**Conclusion:** The `>= 3` condition is **not load-bearing** for shipping behavior today. [`preprocessing_status`](../../apps/inventory/views.py) and [`PreprocessingPage.tsx`](../../frontend/src/pages/inventory/PreprocessingPage.tsx) treat the manifest preprocessing train as **steps 0–2** (`completed_step` ∈ {-1, 0, 1, 2}).

**Wave 2 mapping decision:** Keep **`finalized` → `completed_step = 2`** (0–2 mapping). Do **not** introduce `3` for finalized to satisfy FinalizePanel unless the product revives that component and passes a different contract.

**Optional follow-up (not Wave 2 scope):** delete `FinalizePanel` or re-home it if a legacy manifest route still needs it.

### Backend reads to remove for business logic

| Location | What | Wave 2 action |
|----------|------|----------------|
| [`apps/inventory/views.py`](../../apps/inventory/views.py) ~4283–4286 | `preprocessing_status` sets `workflow_status` / `current_step` from **`prep`** | Derive **synthetic echo** from `order.preprocess_status` only (see A). |
| [`apps/inventory/views.py`](../../apps/inventory/views.py) ~2002–2004 | `preprocessing_queue` filter + **`order_by('-preprocessing__current_step', '-preprocessing__updated_at', ...)`** | See B: PO `finalized_at` filter, PO `updated_at` tie-break, no prep columns for ordering. |

### Backend writes (unchanged in Wave 2)

[`views.py`](../../apps/inventory/views.py), [`processing_finalize.py`](../../apps/inventory/services/processing_finalize.py), [`intake_undo.py`](../../apps/inventory/services/intake_undo.py) continue dual-writing `workflow_status` / `current_step` until Wave 3.

### Frontend today

- [`PreprocessingPage.tsx`](../../frontend/src/pages/inventory/PreprocessingPage.tsx) uses **`preprocessing?.row_count`** / **`finalized_at`**, not legacy workflow fields.
- [`OrderIntakeTimelineDrawer.tsx`](../../frontend/src/components/inventory/orderDetail/OrderIntakeTimelineDrawer.tsx) uses **`order.preprocess_status`** from detail surface.
- [`inventory.api.ts`](../../frontend/src/api/inventory.api.ts) `PreprocessingSessionInfo` still types `workflow_status` / `current_step` — deprecate in D.

### Tests / migrations

- Extend [`test_preprocessing_redesign.py`](../../apps/inventory/tests/test_preprocessing_redesign.py), [`test_intake_undo.py`](../../apps/inventory/tests/test_intake_undo.py) per E.
- **Do not** edit historical migrations (e.g. 0046 reads `workflow_status` for backfill).

---

## A. `preprocessing_status` endpoint cutover

**File:** [`apps/inventory/views.py`](../../apps/inventory/views.py) `preprocessing_status`.

1. **`completed_step`** — replace row-count / pricing heuristic with **`order.preprocess_status`** mapping:

   | `preprocess_status` | `completed_step` |
   |---------------------|------------------|
   | `not_started` | `-1` |
   | `standardized` | `0` |
   | `cleaned` | `1` |
   | `reviewing` | `1` |
   | `finalized` | `2` |

   **Rationale:** `FinalizePanel`’s `>= 3` path is dead; keep 0–2 contract for live Preprocessing UI.

2. **Keep** aggregates (`preprocessing_status_counts_aggregate` / manifest branch) for counts and summary blocks; only **step index** becomes PO-driven.

3. **Synthetic echo** in `payload['preprocessing']` — do **not** read `prep.workflow_status` / `prep.current_step`. Helper maps **`order.preprocess_status` → legacy strings** (for backward compatibility until Wave 3):

   | `preprocess_status` | synthetic `workflow_status` | synthetic `current_step` |
   |---------------------|----------------------------|---------------------------|
   | `not_started` | `draft` | `0` |
   | `standardized` | `standardized` | `1` |
   | `cleaned` | `ai_imported` | `1` |
   | `reviewing` | `review` | `2` |
   | `finalized` | `finalized` | `2` |

   Document in code comment: **Wave 3** removes these keys when `PreprocessingOrder` is dropped.

---

## B. `preprocessing_queue` ordering and filtering

**File:** [`apps/inventory/views.py`](../../apps/inventory/views.py) `preprocessing_queue`.

1. **Filter:** Replace  
   `Q(preprocessing__isnull=True) | Q(preprocessing__finalized_at__isnull=True)`  
   with **PO-native** gate: orders that are **not** preprocess-finalized on the PO, e.g. **`Q(finalized_at__isnull=True)`** (preprocess finalize dual-writes `PurchaseOrder.finalized_at`; same wave goal as data flow plan).  
   Keep `manifest_id__isnull=False`, `exclude(status='cancelled')`.  
   **Re-evaluate** `preprocessing__isnull=True`: if “no prep session yet” must still appear in queue, express as **`preprocess_status='not_started'`** or equivalent PO state instead of joining prep for existence — confirm no order lacks prep row but has manifest (edge case).

2. **Ordering:** Replace `-preprocessing__current_step` and **`-preprocessing__updated_at`** with:
   - Primary: `Case`/`When` numeric rank on **`PurchaseOrder.preprocess_status`** (descending “progress”).
   - Tie-break: **`-PurchaseOrder.updated_at`** (per Wave 3 prep deprecation — do not rely on `preprocessing.updated_at`).

3. **Select related:** Drop `select_related('preprocessing')` from the queue queryset **if** serializer no longer needs prep for the list response. Today [`PreprocessingQueueOrderSerializer`](../../apps/inventory/serializers.py) uses **`prep.row_count`** — either keep a minimal join **only** for `row_count` until a PO denormalized row count exists, or add a cheap annotation; document tradeoff in PR. **Do not** use prep fields for ordering/filter finalize gate after B.1.

---

## C. Other backend readers

- Re-grep before merge: no **`prep.workflow_status`** / **`prep.current_step`** reads for decisions or response fields except writes/tests/migrations.
- [`PreprocessingOrderSerializer`](../../apps/inventory/serializers.py): confirm still unused in views; if dead, optional cleanup note for Wave 3.

---

## D. Frontend

- [`inventory.api.ts`](../../frontend/src/api/inventory.api.ts): JSDoc **`@deprecated`** on `PreprocessingSessionInfo.workflow_status` and `current_step`; point authors to `order.preprocess_status`.
- Smoke **PreprocessingPage** after API change.
- **FinalizePanel:** no mapping change required; optional dead-code ticket.

---

## E. Tests

1. **Dual-write drift:** PO `preprocess_status='cleaned'`, prep `workflow_status='draft'` → GET `preprocessing-status` → **`completed_step`** and **order** block reflect PO; synthetic echo reflects PO mapping (not prep DB columns read for echo).

2. **`assertNumQueries`:** baseline before/after on `preprocessing_status`; assert **≤** baseline (or equal with justification if join changes).

3. **Parallel assertions:** wherever API responses are asserted on prep workflow fields, add **`preprocess_status`** / **`completed_step`** expectations; keep legacy prep assertions until Wave 3.

4. **Synthetic echo table (mandatory):** parameterized test over all five `preprocess_status` values — for each, assert response `preprocessing.workflow_status` and `preprocessing.current_step` match the A.3 table (when `preprocessing` object is present; when no prep row, define expected behavior — null vs omit vs still echo from PO only).

---

## Won’t do in Wave 2

- Dropping `PreprocessingOrder` or stopping dual-writes (Wave 3).
- S3 parse reduction (Wave 4).
- New receiving/processing/disputes features.

---

## Verification

- Full suite + `test_preprocessing_redesign`, `test_intake_undo`.
- Manual: queue order and membership; preprocessing tabs 0–2; timeline drawer.
- Final grep: no prep **read** of workflow/current_step for app logic.
