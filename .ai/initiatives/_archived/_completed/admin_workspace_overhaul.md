<!-- initiative: slug=admin-workspace-overhaul status=completed updated=2026-09-08 -->
<!-- Archived 2026-09-08: disposition=completed shipped v2.74.0 (Studios, Settings house, capability catalog). Grants stay deferred. -->
<!-- Last updated: 2026-09-08 (completed → _completed/; grants stay out) -->

# Initiative: Admin workspace overhaul

**Status:** **Completed** (2026-09-08) — Phases 1–3 shipped **v2.74.0**. Per-user additive grants stay deferred (own initiative).

**Objective:** Pull every studio into a Studios workspace (`8` / `S`), leave every other page in its original workspace, fold Assumptions + Permissions + Settings into one tabbed Settings house (`0` / `A` Admin), and replace the fake Permissions page with a real capability catalog.

**Compass:** retired. Remaining Active work is on [`.ai/context.md`](../../context.md). [`universal_object_surfaces`](../../universal_object_surfaces.md) stays design-only; its capability taxonomy must not be reinvented here. The catalog in `apps/accounts/capabilities.py` cites that initiative so the two stay aligned.

---

## Finish line

A Manager or Admin opens Studios for labels, floorplans, QA forms, and the blog. Everything else stays where it was. Settings is one page with URL tabs. The Permissions tab is generated from a single source of truth that matches what the server actually enforces. Digits `1`–`8` and `0` (Admin) are assigned, not positional. `9` is unused.

---

## Acceptance

- [x] Workspaces: Studios (`8` / `S`); Admin is `0` / `A`. Users, Retail inbox, and Time & payroll stay on Admin. Messages stays on Online Sales.
- [x] Digit jumps are assigned, not positional; `0` is legal
- [x] Settings house at `/admin/settings?tab=` with System, Printing, Store, Assumptions, Permissions
- [x] `/admin/assumptions` and `/admin/permissions` redirect into that house
- [x] Capability catalog in `apps/accounts/capabilities.py` verified against `permissions.py` and every `get_permissions()` override
- [x] `GET /api/auth/capabilities/` and `GET /api/accounts/capability-catalog/`
- [x] Permissions tab is a read-only matrix including Customer and Super Admin
- [x] `IsManager` gone; `IsStaff` / `IsEmployee` aliased; one frontend rank table; `StaffRoute` requires a staff role; `UserUpdateSerializer` does not wipe extra groups
- [ ] Per-user grants **not** in this initiative

---

## Record

**2026-08-26 — Opened.** Plan accepted: new workspaces with pinned hotkeys, one Settings house, truthful Permissions screen. Phase 4 (additive grants) deferred.

**2026-08-26 — Phases 1–3 implemented.** Studios workspace (`9`), Admin (`0`) keeps Users / inbox / Settings / payroll. Settings house, capability catalog + APIs, Permissions matrix, permission-class cleanup. People and Mail workspaces reverted.

**2026-08-26 — Shipped v2.74.0.** Catalog lives on Floor; Inventory workspace removed; digits `1`–`8` + `0`. Settings tabs are System / Printing / Store / Assumptions / Permissions. Print Settings polished. Public home hours dot sits on the status line.
**2026-09-08 — Completed.** Owner retired the file. Additive grants stay out.

---

## See also

- Capability taxonomy (design, not this file): [`universal_object_surfaces`](../../universal_object_surfaces.md)
- Nav: `frontend/src/navigation/`
- Settings: `frontend/src/pages/admin/settings/`
- Auth: `.ai/extended/auth-and-roles.md`
- Index: [`_index.md`](../_index.md)
