<!-- initiative: slug=departments-admin status=completed updated=2026-09-22 -->
<!-- Archived 2026-09-22: disposition=completed shipped GitHub v2.95.0, Heroku with v2.96.0 (directory, hub, slug cutover) -->
<!-- Last updated: 2026-09-22 (moved to _completed) -->

# Initiative: Departments admin

**Status:** **Completed** (2026-09-22) — Phase 1 shipped GitHub **v2.95.0**; on Heroku with **v2.96.0**.

**Objective:** Managers can open a Departments directory and a per-department hub. Superusers can create, rename, deactivate, and delete (when nothing depends on the row). Grouping is `hr.Department` only; departments grant no permissions.

**Compass:** this file is not the compass; [`documents`](../_pending/documents.md) stays the compass.

---

## Finish line

A Manager opens Admin → Departments, sees every org department, and clicks through to home staff plus the roster that belongs to that department. A Superuser can add a department, deactivate one, and delete only a row with zero dependencies.

---

## Out of scope

- Dashboard Buying / Processing / Restoration / Retail cards
- Department-scoped capabilities
- Making `Department.manager` grant access
- Spanish department names
- Documents staff UI
- Punch-bucket taxonomy (Retail / Warehouse / Office)
- Heroku deploy (GitHub **v2.95.0** only)

---

## Phases

### Phase 1 — Directory, hub, and slug cutover
`hr.Department` has slug / icon / sort_order. Command Center, shift seed, and Sections key off slug. List + detail pages ship with two-tier writes.
**Gated by:** none.

Acceptance:
- [x] Operations is Office with slug `office`; Retail / Processing / Restoration have slugs and icons
- [x] Pickers hide inactive departments; delete 409s when dependencies exist
- [x] `/admin/departments` and `/admin/departments/:slug` match the spec
- [x] Superuser-only create / rename / deactivate / delete; Manager+ can edit description, location, manager

---

## Acceptance

- [x] Phase 1 directory, hub, and slug cutover
- [x] Out-of-scope items stay out

---

## Record

**2026-09-17 — Opened.** Admin Departments directory and hub.

**2026-09-18 — Shipped GitHub v2.95.0.** Directory, hub, slug/icon/sort, two-tier writes, Office display name. Not Heroku.

**2026-09-22 — Completed.** Moved to `_archived/_completed/`.

---

## See also

- Index: [`_index.md`](../../_index.md)
