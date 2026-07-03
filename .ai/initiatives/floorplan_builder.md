<!-- initiative: slug=floorplan-builder status=active updated=2026-07-02 -->
<!-- Last updated: 2026-07-02 (Session 1 — DB element kinds & shape control) -->

# Initiative: Floorplan Builder

**Status:** **Active** — core editor shipped **v2.39.0**; now moving the element catalog to the database.

**Routes:** `/floor-ops/floorplans` (list), `/floor-ops/floorplans/:id` (editor). Backend: `apps/floorplan/` at `/api/floorplan/`.

---

## Finish line (initiative)

Staff design store layouts in a browser editor (elements, zones, paths, labels, info blocks, export). Super Admin manages a reusable element-type catalog (name, category, default size, color/image, shape) stored in the database instead of hardcoded frontend code.

## Context

- v2.39.0 shipped the editor: `FloorPlan` + `FloorPlanAsset` models, optimistic-lock saves, SVG canvas, palette of ~19 hardcoded kinds in `frontend/src/features/floorplan/palette.ts`.
- Detailed plan for the catalog work: [`apps/floorplan/PLAN_element_kinds.md`](../../apps/floorplan/PLAN_element_kinds.md).

---

## Sessions

### Session 1 — 2026-07-02

**Goal:** Implement `PLAN_element_kinds.md` — `FloorPlanElementKind` model + seeded catalog, Super Admin CRUD API + in-editor management UI, shape control (sharp rect / corner radius / circle), dynamic palette + legend.

**Finish line:** All plan verification checklist items pass — seeded built-ins render existing plans unchanged, Super Admin can create kinds (color or image) that appear in the staff palette, non-superusers get 403 on writes, Django + tsc + vitest green.

**Scope:** Backend model/serializer/viewset/seed migration/tests; frontend types/api/hook, palette rework, kind-map threading through canvas/legend, Super Admin dialog in the editor sidebar, legacy "Custom" asset palette section removed.

**Out of scope:** Per-instance shape/fill overrides, location-scoped catalogs, plan JSON schema bump.

**Decisions (per plan §Open decisions):** A global catalog; B in-editor management only; C system kinds editable-not-deletable with immutable slug; D auto slug from label with uniqueness suffix; E free-text category with autocomplete of existing; F `rect`+`corner_radius` / `circle`; G kind-level fill/image only; H legacy Custom palette section removed; I no schema bump; J legend swatch from `fill_color`.

**Est:** half day. **Start:** 2026-07-02

**Updates (2026-07-02):**

- Backend: `FloorPlanElementKind` + migrations `0003` (schema) / `0004` (seed of 19 legacy palette kinds, `column`/`rackRound` as circles); serializer validation (hex color, dims 1–12,000", radius ≤ 60", circle→radius 0, slug immutable + auto-slugify); `FloorPlanElementKindViewSet` (staff read / `IsSuperAdmin` write, system kinds undeletable, soft delete); 12 new tests in `test_element_kinds_api.py` — `apps.floorplan` suite 43 OK.
- Frontend: `useFloorPlanElementKinds` + api/types; `palette.ts` reworked (`elementKindToPaletteEntry`, `buildPaletteIndex`, static array demoted to loading placeholder); `kindIndex` threaded page → canvas → `ElementShape`/legend; sharp corners default (`rx = cornerRadius || 0`), circle footprints from kind data; placement ghost matches shape; `ElementKindDialog` + palette-sidebar manage affordances (Super Admin); legacy "Custom" asset section removed.
- Verified: tsc clean, vitest 205 OK (new `palette.test.ts`), `npm run build` green, dev DB migrated + seeded. Plan file checklist all checked (one manual UI click-through suggested).

**Result:** Plan implemented end-to-end; element images stretch on resize (`preserveAspectRatio: none`). Released **v2.40.0** (2026-07-02).

**Updates (2026-07-02, later):**

- **v2.40.1** — Heroku stack **heroku-22 → heroku-24** (`stack:set` + redeploy, release v280 verified); root `engines` Node 18.x → 22.x / npm 10.x.
- **Editor precision pass (v2.41.0):** align (6 modes) + equal-gap distribute on multi-select (`alignObjects`/`distributeObjects` in `editorState.ts`, toolbar buttons); arrow-key nudge 1"/1'; element strokes inset inside the footprint; rotated elements — handles on visual corners, resize in visual space via `rawRectFromVisual`, properties panel shows visual X/Y/W/Depth; move snapping absolute (position, not delta). 8 new vitest cases; tsc + build green.
- **Drafting aids (v2.45.0, 2026-07-03):** Shift = axis-locked move/resize (dominant axis only); multi-select **group scale** handles (`scaleObjects` — thin elements aspect ≥ 3 keep their depth, so room outlines lengthen walls without fattening); flip H/V (`flipObjects`, `element.flipH/flipV` content mirror, rotation-aware); **`PrintDialog.tsx`** — live preview + toggles (B&W, image/fill/outline, labels, zones, drawings, grid, border weight, plan border, inactive) + Outline preset, prints via dedicated window. 5 new vitest cases (222 OK). Mid-session note: D: drive dropped and was restored by reboot; all edits verified intact after recovery.
- **Power tools (v2.44.0):** JSON export (wrapped `ecothrift-floorplan` file) + JSON/YAML import — list-page Import creates a plan, editor **Load from file** replaces the draft (`planFile.ts`, tolerant parse + schema migration); **configuration tabs** (`configStore` + `settings.configs`, active config in top-level collections, `ConfigTabs.tsx` overlay); rotate-each-in-place (Shift+R); `element.labelHidden` single + bulk; `locked` objects (pointer-events none, marquee skip, toolbar unlock popover); wheel pans / Ctrl+wheel zooms. 4 new vitest suites (217 OK).
- **Image lifecycle + bulk selection (v2.42.0):** Ctrl+A select all; multi-element image tools (set from library/file, clear, **reset to kind's current default**); per-element reset; `purge_orphan_assets` service (referenced = active plans' `element.image` + active kinds' `default_image`; 24h upload grace; soft-deleted rows exempt) wired to plan save / kind writes / asset delete; asset-picker cache invalidation on save + kind writes. 7 new backend tests (51 OK). Note: floorplan images are Postgres data-URI rows, not S3 objects — "delete from files" = row deletion.
