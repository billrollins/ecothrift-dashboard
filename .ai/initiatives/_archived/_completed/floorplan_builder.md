<!-- initiative: slug=floorplan-builder status=completed updated=2026-07-09 -->
<!-- Archived 2026-07-09: disposition=completed (editor + DB element kinds + walls/cut/print; shipped v2.39.0–v2.47.0) -->
<!-- Last updated: 2026-07-09 (archived → _completed/) -->

# Initiative: Floorplan Builder

**Status:** **Completed** (2026-07-09) — core editor **v2.39.0**; DB element kinds **v2.40.0**; drafting/walls/cut/print through **v2.47.0**. See [`CHANGELOG`](../../../../CHANGELOG.md) `[2.39.0]`–`[2.47.0]`.

**Routes:** `/floor-ops/floorplans` (list), `/floor-ops/floorplans/:id` (editor). Backend: `apps/floorplan/` at `/api/floorplan/`.

---

## Finish line (initiative)

Staff design store layouts in a browser editor (elements, zones, paths, labels, info blocks, export). Super Admin manages a reusable element-type catalog (name, category, default size, color/image, shape) stored in the database instead of hardcoded frontend code.

## Context

- v2.39.0 shipped the editor: `FloorPlan` + `FloorPlanAsset` models, optimistic-lock saves, SVG canvas, palette of ~19 hardcoded kinds in `frontend/src/features/floorplan/palette.ts`.
- Detailed plan for the catalog work: [`apps/floorplan/PLAN_element_kinds.md`](../../../../apps/floorplan/PLAN_element_kinds.md).
