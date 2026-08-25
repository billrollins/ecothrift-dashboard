<!-- Archived 2026-08-25: disposition=completed shipped=v2.71.0 GitHub only -->
<!-- initiative: slug=enhancement-requests status=completed updated=2026-08-25 -->
<!-- Last updated: 2026-08-25 -->

# Initiative: Enhancement requests

**Status:** **Completed** — shipped **v2.71.0** to GitHub. Not pushed to Heroku.

**Objective:** Mike and Ashley can file a Restoration or Processing ask without leaving the floor. Bill sees every ask, sets priority / target date / status, and the owner (or Bill) can add notes.

**Outside TARS.** The Requests sheet mounts on the Restoration bench and the Processing workspace. Triage lives on a superuser page. This is a staff tool, not a TARS stage.

---

## Finish line

Staff can file an ask from the bench or Processing in one motion. Everyone can read the list. Only the owner or a superuser can edit the ask or add a note. Superuser sets priority, target date, and status. Nothing on the page jumps when the sheet opens.

---

## Acceptance

- [x] Staff `POST /api/core/enhancement-requests/` with `area` (`restoration` | `processing`) and `body`
- [x] List is visible to all staff; `can_edit` / `can_note` only for the owner or a superuser
- [x] Superuser `POST …/triage/` sets `priority`, `status` (`open` / `planned` / `done` / `declined`), `target_date`
- [x] Bottom sheet on `/restoration/bench` and `/inventory/processing` (fixed grabber; does not shift the page)
- [x] Superuser board at `/admin/enhancement-requests` (Restoration guest nav: Enhancements)
- [x] Shipped **v2.71.0** (GitHub; not Heroku)

---

## Record

**2026-08-25 — Completed.** Shipped as **v2.71.0**.

**2026-08-25 — Filed and triaged.** Models `EnhancementRequest` + `EnhancementRequestNote` (migration `core.0002_enhancement_request`). Staff drawer (`RequestsDrawer`) is a bottom sheet: area + “What do you want changed?”, Enter files, list of everyone’s asks. Superuser page sets priority, date, and status on the same board. Grabber is `position: fixed` on the bottom edge and fades in near the pointer so the work surface never moves.

---

## See also

- API: `apps/core/views.py` `EnhancementRequestViewSet`
- UI: `frontend/src/components/enhancements/`, `frontend/src/pages/admin/EnhancementRequestsPage.tsx`
- Index: [`_index.md`](../../_index.md) · Context: [`.ai/context.md`](../../../context.md)
