# Floorplan Builder

Store/room layout editor integrated into the staff dashboard.

- Backend: this app (`apps/floorplan`) — model, DRF API, document validation.
- Frontend: `frontend/src/features/floorplan/` (editor), `frontend/src/pages/floorplan/` (pages),
  `frontend/src/types/floorplan.types.ts` (document types), `frontend/src/api/floorplan.api.ts`.
- Routes: plan list at `/floor-ops/floorplans` (inside the dashboard layout, Floor Ops workspace);
  full-screen editor at `/floor-ops/floorplans/:id/edit` (lazy-loaded chunk).

## Units and coordinate system

- **Canonical unit: inches.** All coordinates, dimensions, snap increments, grid spacings, and
  path points in the plan document are inches. The UI displays feet + inches (e.g. `4' 6"`).
- Origin is the plan's top-left corner; y grows downward.
- The viewport maps world → screen with a single uniform scale (px per inch), so saved
  coordinates are identical at every zoom level (verified by tests in
  `frontend/src/features/floorplan/geometry.test.ts`).

## Data schema (plan document, `schema_version: 1`)

Stored in `FloorPlan.data` (Postgres `JSONField`):

```json
{
  "schema_version": 1,
  "settings": {
    "planWidth": 1200,
    "planHeight": 720,
    "grid": { "visible": true, "minor": 6, "major": 12 },
    "snap": 1
  },
  "elements":   [{ "id": "el_x", "kind": "gondola", "x": 120, "y": 48, "w": 48, "h": 144, "rotation": 90, "label": "", "active": true }],
  "zones":      [{ "id": "zn_x", "label": "Toys – Retail", "x": 0, "y": 0, "w": 240, "h": 180, "color": "#4caf50", "opacity": 0.25 }],
  "paths":      [{ "id": "pa_x", "points": [[0, 0], [10.5, 12.25]], "stroke": "#333", "width": 2 }],
  "labels":     [{ "id": "lb_x", "text": "Restrooms", "x": 100, "y": 200, "fontSize": 12, "color": "#263238" }],
  "infoBlocks": [{ "id": "ib_x", "type": "titleBlock", "x": 0, "y": 0, "w": 140, "h": 48, "props": { "title": "…" } }]
}
```

Notes:

- **Optional fields** (absent in older documents; defaulted on load, never required by the
  backend validator):
  - `settings.labels`: `{ "show": true, "fontSize": 8 }` — uniform element/zone caption
    visibility and size (inches).
  - `settings.grid.style`: `"faint" | "normal" | "strong"` — grid line contrast/weight
    (defaults to `"normal"`). Grid spacing presets and snap live in the toolbar's Grid popover.
  - `group` (string) on any object in `elements` / `zones` / `paths` / `labels` / `infoBlocks` —
    objects sharing a group id select, move, and delete together.
  - `image` (integer) on an element — id of a `FloorPlanAsset` whose picture renders inside the
    element footprint (`preserveAspectRatio: meet`). Missing/deleted assets fall back to the
    element's solid palette color.
- `rotation` is limited to 90° increments (0/90/180/270) about the element center.
- `infoBlocks.type` ∈ `titleBlock | notes | legend | northArrow | scaleBar`; block-specific data
  lives in `props` (title/subtitle/date, notes `text`, north `rotation`, scale-bar `length`).
- `labels.fontSize` is in world inches so text scales with zoom and export.
- Object `id`s are opaque strings, unique within the document.

### What is / is not persisted

| Persisted | Not persisted |
|---|---|
| All canvas content (elements, zones, paths, labels, info blocks) | Selection state |
| Grid visibility/spacing and snap increment (`settings`) | Undo/redo history |
| Plan dimensions | Viewport zoom/pan position |
| | Active tool, pending palette placement |

### Versioning / migration strategy

- `schema_version` lives inside the document (and is mirrored on the model row).
- Frontend: `frontend/src/features/floorplan/migrations.ts` holds a pure-function pipeline
  (`migratePlanDocument`) that upgrades old documents on load, one version at a time. Upgraded
  documents are written back on the next save. Documents *newer* than the client are refused
  (no silent data loss).
- Backend: `apps/floorplan/validation.py` accepts only the current version on save.
- To change the schema: bump `PLAN_SCHEMA_VERSION` (frontend) and `CURRENT_SCHEMA_VERSION`
  (backend), add a migration entry keyed by the old version, and update the validator.
  For bulk upgrades of stored rows, add a Django data migration.

## API contract

Base: `/api/floorplan/` — JWT auth (standard dashboard auth). All staff roles can read;
**Manager/Admin** can create/update/delete.

| Method | Path | Notes |
|---|---|---|
| GET | `plans/` | Paginated list, no `data` field. Filter: `?location=<id>` |
| POST | `plans/` | Body `{name, location}`; server seeds a default empty document |
| GET | `plans/{id}/` | Full document in `data` |
| PATCH/PUT | `plans/{id}/` | Saving `data` requires `revision` (see below). `name` alone needs no revision |
| DELETE | `plans/{id}/` | Soft delete (`is_active=False`) |
| GET | `assets/` | Image asset library. `?location=<id>` returns that location's assets plus shared (location-less) ones |
| POST | `assets/` | Multipart upload: `file` (SVG/PNG/JPEG, ≤512 KB) + optional `name`, `location`. Manager/Admin only |
| DELETE | `assets/{id}/` | Soft delete. Elements referencing a deleted asset fall back to solid color |

### Image assets

Uploaded element images live in `FloorPlanAsset` rows as **sanitized data URIs** (no media-file
serving required). SVG uploads are parsed and re-serialized server-side with `script` /
`foreignObject` elements, `on*` event attributes, external `href`s, and DOCTYPE/entity
declarations stripped; PNG/JPEG are verified with Pillow. In the editor, assets appear in a
"Custom" palette category (placing one creates a `genericRect` element with `image` preset) and
in the element properties panel (assign / upload / remove per instance). Because images are data
URIs, PNG export inlines them automatically.

### Concurrency: optimistic locking

Every plan has an integer `revision` (starts at 1, incremented on each content save).
Clients send the revision they loaded with each save:

- Match → save succeeds, response carries the new `revision`.
- Mismatch → `409 {"detail": …, "code": "revision_conflict", "current_revision": n}`.
  The editor shows a conflict dialog: *overwrite* (resend with the current revision) or
  *discard mine and reload*.
- Missing `revision` with `data` → `400 {"code": "revision_required"}`.

### Server-side validation

Saves are rejected (`400`, `code: invalid_document`) when the document is not an object, has the
wrong `schema_version`, exceeds ~1 MB or 5000 objects, is missing a collection, has objects
without string `id`s, or contains non-numeric / absurd (>100,000 in) coordinates.

## Editor shortcuts

Tools: V select, H pan (or hold Space), Z zone, D draw, T label. Actions: Ctrl+S save,
Ctrl+Z / Ctrl+Y undo/redo, Delete remove selection, R rotate 90°, G toggle grid, +/− zoom,
Ctrl+C / Ctrl+X / Ctrl+V copy/cut/paste (paste offsets 12" per repeat), Ctrl+D duplicate,
Ctrl+G group selection, Ctrl+Shift+G ungroup. Hold Shift while placing a palette element to
keep placing more. The clipboard is in-memory per editor session (not the OS clipboard).

## How to add a new palette element

Edit `frontend/src/features/floorplan/palette.ts` and append an entry:

```ts
{ kind: 'endCap', label: 'End cap', category: 'Fixtures', w: 48, h: 24, color: '#26a69a', resizable: true },
```

- `kind` must be unique and **stable forever** — it is persisted in saved plans.
- Sizes are in inches; `category` groups entries in the sidebar (new categories appear automatically).
- No backend change needed. Unknown `kind`s in old documents still render as generic rectangles,
  so removing an entry from the palette does not break saved plans.

## Testing

- Backend: `pytest apps/floorplan` — permissions, CRUD, optimistic-lock 409s, document
  validation, exact save/reload round-trip.
- Frontend: `cd frontend && npx vitest run src/features/floorplan` — world↔screen round-trip at
  multiple zooms (coordinate-drift guard), snapping, undo/redo + gesture semantics, migrations.

## Known limitations (v1)

- No real-time collaboration; concurrent edits resolve via the conflict dialog (last explicit
  choice wins).
- Rotation is 90° increments only; resize handles operate on the unrotated footprint.
- Freehand paths are straight polylines (no Bezier smoothing or path editing).
- PNG export rasterizes the full plan bounds at up to 4 px/inch (capped at 8192 px per side);
  it is for sharing/review, not print production.
- Designed for ≤ ~500 objects per plan; a warning chip appears beyond that. Hard server cap 5000.
- Internal navigation guard covers the editor's own Back button and browser refresh/close;
  browser back/forward while dirty is not intercepted (BrowserRouter, no data-router blocker).
- Desktop-first: touch works for basic pan/select but the editor is not optimized for mobile.
- Plan dimensions are editable in the properties panel (empty selection → "Plan settings",
  24"–1000 ft per side). Shrinking the plan keeps out-of-bounds objects; they stay selectable
  outside the frame border.
