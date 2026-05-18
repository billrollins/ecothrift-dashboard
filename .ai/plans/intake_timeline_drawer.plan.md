---
name: Intake timeline drawer
overview: Add a URL-driven Order Detail timeline drawer (header, stages, preview, danger zone), centralize destructive flows via deep links, and implement GET/POST undo APIs backed by intake_undo service with §6 semantics for four stages, dual-writing PreprocessingOrder until Wave 2.
todos:
  - id: plan-file
    content: Write .ai/plans/intake_timeline_drawer.plan.md (frontmatter todos + sections)
    status: completed
  - id: svc-intake-undo
    content: "apps/inventory/services/intake_undo.py: compute_undo_preview + apply_undo + dual-write PreprocessingOrder"
    status: pending
  - id: api-undo-endpoints
    content: "PurchaseOrderViewSet: GET undo-preview, POST undo; wire permissions + detail-surface response"
    status: pending
  - id: refactor-manifest-remove
    content: Optionally extract remove_manifest core into shared helper called by view + intake_undo (manifest_upload)
    status: pending
  - id: fe-drawer
    content: "OrderIntakeTimelineDrawer: layout, preview, confirm UX, danger zone (purge-delete)"
    status: pending
  - id: fe-url-state
    content: "OrderDetailPage: useSearchParams drawer=timeline&undo&danger; default closed"
    status: pending
  - id: fe-launchers
    content: Replace destructive buttons on OrderDetailPage + PreprocessingPage with navigate-to-URL launchers
    status: pending
  - id: fe-api-hooks
    content: inventory.api.ts + useInventory hooks for undo-preview/post-undo
    status: pending
  - id: tests-intake-undo
    content: "apps/inventory/tests/test_intake_undo.py: preview/apply/blocked paths for 4 stages"
    status: pending
isProject: false
---

# Intake timeline drawer + universal undo

Canonical spec for this chunk. **Do not edit the user’s external plan file**; this file is the workspace copy.

## Context

- Undo/cascade rules: `data_flow_plan.md` §6 (`.ai/reference/order_processing_pipeline_rebuild/`).
- PO stage scalars: `intake_field_map.md`.
- Legacy: “Undo standardize” on Preprocessing used `clear-manifest-rows`; staging-first workflows use **`intake_undo`** (`standardize`) instead.

## URL contract (Mode A)

Base route: `/inventory/orders/:id`

| State | Example |
|--------|---------|
| Drawer closed | `/inventory/orders/123` |
| Drawer open | `/inventory/orders/123?drawer=timeline` |
| Preview armed | `/inventory/orders/123?drawer=timeline&undo=<stage>` |
| Danger zone | `/inventory/orders/123?drawer=timeline&danger=purge` |

**`undo` values:** `manifest_upload` | `standardize` | `ai_cleanup` | `finalize`

Closing the drawer strips `drawer`, `undo`, and `danger` while preserving other query params.

## Backend

- **`apps/inventory/services/manifest_remove.py`** — shared DB effects for removing manifest (used by `remove-manifest` and `manifest_upload` undo); storage delete remains outside transaction in callers.
- **`apps/inventory/services/intake_undo.py`** — `compute_undo_preview`, `apply_undo`, `UndoNotAllowed`, dual-write `PreprocessingOrder`.
- **Endpoints:** `GET …/undo-preview/?to_stage=` — preview dict; `POST …/undo/` body `{"to_stage": "…"}` — 400 if not `safe`, else apply and return `PurchaseOrderDetailSurfaceSerializer`.

## Frontend

- `OrderIntakeTimelineDrawer.tsx` — MUI Drawer ~480px; timeline; preview from GET; confirm; danger zone + `purge-delete`.
- `OrderDetailPage` — `useSearchParams`; launchers for remove manifest, delete order, optional “Intake timeline” entry.
- `PreprocessingPage` — deep links for undo standardize, reset-to-AI flow (`ai_cleanup`), optional finalize rewind.

## Tests

- `apps/inventory/tests/test_intake_undo.py` — preview shape, blocked paths, apply per stage.

## Won’t do (this chunk)

- Receiving/Processing/Dispute/Closeout undo (placeholders only).
- X-day purge boundary logic.
- Email deep links.
