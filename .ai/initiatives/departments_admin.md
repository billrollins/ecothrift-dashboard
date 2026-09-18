<!-- initiative: slug=departments-admin status=active updated=2026-09-17 -->
<!-- Last updated: 2026-09-17 -->

# Initiative: Departments admin

**Status:** **Active** — Phase 1.

**Objective:** Managers can open a Departments directory and a per-department hub. Superusers can create, rename, deactivate, and delete (when nothing depends on the row). Grouping is `hr.Department` only; departments grant no permissions.

**Compass:** this file is not the compass; [`documents`](./documents.md) stays the compass.

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
- Shipping / version bump

---

## Phases

### Phase 1 — Directory, hub, and slug cutover
`hr.Department` has slug / icon / sort_order. Command Center, shift seed, and Sections key off slug. List + detail pages ship with two-tier writes.
**Gated by:** none.

Acceptance:
- [ ] Operations is Office with slug `office`; Retail / Processing / Restoration have slugs and icons
- [ ] Pickers hide inactive departments; delete 409s when dependencies exist
- [ ] `/admin/departments` and `/admin/departments/:slug` match the spec
- [ ] Superuser-only create / rename / deactivate / delete; Manager+ can edit description, location, manager

---

## Acceptance

- [ ] Phase 1 directory, hub, and slug cutover
- [ ] Out-of-scope items stay out

---

## Record

**2026-09-17 — Opened.** Admin Departments directory and hub.

---

## See also

- Index: [`_index.md`](./_index.md)
