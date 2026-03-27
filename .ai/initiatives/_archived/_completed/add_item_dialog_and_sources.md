<!-- Archived 2026-03-28: disposition=completed initiative=add-item-dialog-and-sources -->
<!-- initiative: slug=add-item-dialog-and-sources status=completed updated=2026-03-28 -->
<!-- Last updated: 2026-03-28T19:00:00-05:00 -->
# Initiative: Add Item — UX, AI title assist, estimated retail, and source provenance

**Status:** **Completed** (archived 2026-03-28). Core scope shipped: Items page add/edit flow, AI suggest, sources, dev logging. **Estimated retail** remains a future product decision (not blocking).

**Scope:** The **Add Item** flow (**Inventory → Items** → **Add Item** / item detail panel), create-item API, `Item` sourcing (`misc` vs purchased/consignment), and optional AI-assisted fields.

---

## Detour: central dev logging (2026-03)

Before / alongside product work we added **hierarchical dev logging** so Add Item and AI prompts are inspectable locally without polluting production:

| Piece | Location |
|-------|----------|
| Config (cascade, comments, AI instructions) | **`.ai/debug/log.config`** |
| Resolver (parent chain → targets `off` / `django` / `browser` / `file` / `both` / `all`) | `apps/core/log_config.py` |
| `AppLogger` (stdlib log + optional stderr + `debug.log`) | `apps/core/logging.py` |
| Add Item **AI** (prompt + raw model response) | Area **`LOG_ADD_ITEM_AI`** — `suggest_item` in `apps/inventory/views.py` |
| Add Item **form** (dialog open, Generate, create submit) | Area **`LOG_ADD_ITEM_FORM`** — `ItemForm.tsx` + optional **`POST /api/core/dev-log/line/`** when `file` is enabled |
| Umbrella | **`LOG_ADD_ITEM`** → parent **`LOG_INVENTORY`** |

**Default in repo:** `LOG_ADD_ITEM = file` so **`.ai/debug/debug.log`** receives backend AI logs; the frontend can append form lines via the dev-log line endpoint when the same target includes `file`.

**Browser console:** Set **`VITE_DEV_LOG=true`** in root `.env` and ensure **`browser`** appears in resolved targets for the area (e.g. `LOG_ADD_ITEM = all` or `LOG_ADD_ITEM_FORM = browser`). **`GET /api/core/dev-log/config/`** (DEBUG, staff) supplies resolved targets to the UI.

---

## Context

- **Current UI:** Items list + detail panel (`ItemListPage.tsx`, `ItemFormWithActions`, `ItemForm.tsx`): **AI assist** (per-field toggles, **AI Suggest**), source **Purchased / Consignment / Miscellaneous**, optional PO + consignment agreement pickers, specifications JSON, notes.
- **Current data model (`Item`):** `source` includes `misc`; `purchase_order` FK; consignment path can create `ConsignmentItem` after create when configured.
- **AI suggest:** `POST /api/inventory/items/suggest/` — Claude (default `claude-sonnet-4-6`), store examples from `retrieve_listing_examples_for_prompt`, structured JSON suggestions; optional **low-confidence** flow with user confirm.

---

## Objectives

1. **Floating label / layout** — Title and fields: labels not clipped; consistent with MUI patterns.
2. **AI assist** — **AI Suggest** improves listing fields using project listing standards + few-shots; errors surfaced in UI.
3. **Estimated retail** — *Deferred:* distinct field vs `price` pending business decision (out of initiative scope until product asks).
4. **Sources and provenance** — **Misc** label, PO picker for purchased, agreement picker for consignment; backend aligned.

---

## Workstream A — Dialog UX and Title field

| Step | Action |
|------|--------|
| A1 | Reproduce clipping (if any) in `Dialog` + `TextField`. |
| A2 | Fix with MUI-appropriate padding / `slotProps` / label props. |
| A3 | Regression: create flow and validation. |

---

## Workstream B — AI “better item” (Generate)

| Step | Action |
|------|--------|
| B1 | Payload: `fields` + `context` + server-side standards / few-shots (`prompts.py`, `ai_listing_context.py`). |
| B2 | Backend: `POST …/inventory/items/suggest/` — implemented. |
| B3 | Frontend: `useAISuggestItem`, loading/error, apply suggestions with flip chips. |
| B4 | Dev logging: **`LOG_ADD_ITEM_AI`** — prompt blob + **raw AI response** text to stderr / file per `log.config`. |

---

## Workstream C — Estimated retail

*Deferred (future initiative or product decision).*

---

## Workstream D — Source types and backend

| Step | Action |
|------|--------|
| D1 | **`misc`** migration + UI copy **Miscellaneous**. |
| D2 | PO autocomplete when source purchased. |
| D3 | Consignment + `createConsignmentItem` when agreement selected. |
| D4 | Filters / types / Retag source options aligned. |

---

## Risks / constraints

- **Semver / API:** New fields and enums need coordinated deploy.
- **AI cost:** Staff-facing; timeouts and fallbacks on suggest failures.
- **Dev logs:** `.ai/debug/debug.log` is gitignored; do not commit secrets in prompts.

---

## Related code

- Add / edit item: `frontend/src/pages/inventory/ItemListPage.tsx`, `ItemFormWithActions.tsx`, `ItemForm.tsx`, `ItemActionBar.tsx`.
- Suggest API: `apps/inventory/views.py` (`suggest_item`), `apps/inventory/prompts.py`, `apps/inventory/services/ai_listing_context.py`.
- Dev log API: `apps/core/views.py` (`dev_log_config`, `dev_log_line`), `frontend/src/hooks/useDevLog.ts`, `frontend/src/api/core.api.ts`.
- Initiative index: [`.ai/initiatives/_index.md`](../../_index.md).

---

## Acceptance (refined)

- [x] Add Item dialog usable with floating labels and AI Generate.
- [x] Source **misc** + PO / consignment pickers as implemented.
- [x] Dev logging for Add Item AI + form actions configurable via **`.ai/debug/log.config`**.
- [ ] Estimated retail — pending decision (tracked outside this initiative).

---

## See also

- `.ai/extended/inventory-pipeline.md` — processing vs standalone add item.
- `.ai/protocols/review_bump.md` — release / context hygiene.
