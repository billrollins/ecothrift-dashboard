<!-- initiative: slug=hr-time-clock-mvp status=active updated=2026-06-22 -->
<!-- Last updated: 2026-06-23 — My recent shifts scoped to logged-in user -->

# Initiative: HR Time Clock MVP

**Status:** **Active** — rebuild time clock, user permissions, modification requests, and payroll hours view. Replace legacy HR UI; keep backend only where the skeleton is clean.

**Supersedes:** scattered legacy HR pages (`TimeClockPage`, `TimeHistoryPage`, `EmployeeListPage`, `EmployeeDetailPage`, `SickLeavePage`) and overbuilt flows hidden since `web_ui_cleanup`.

---

## Finish line (session win)

Staff can **clock in / take break / clock out** with a **huge overtime warning** when weekly hours would exceed the limit; **Admin** manages users and roles on a simple screen; employees submit **time modification requests**; **superadmin** views **payroll hours** for a pay period.

---

## MVP scope (today)

| Area | Deliver |
|------|---------|
| **Time clock** | Single staff page: clock in, **Take break** / **End break**, clock out; live shift timer; weekly hours tally; **prominent overtime banner** (40h/week default — no OT allowed). |
| **My time** | Employee sees recent entries + submit modification request (reuse `TimeEntryModificationRequest` API). |
| **Modification review** | Admin/Manager queue: approve/deny mod requests. |
| **Users & permissions** | Simple Admin **Users** screen (create/edit/deactivate, assign role). Permissions = role cards or inline help — **not** granular ACL editor. |
| **Payroll hours** | Superadmin-only page: date-range grid, per-employee total hours (approved + pending), export-friendly table. |

---

## Out of scope (this initiative)

- Full HRIS (onboarding workflows, departments admin, termination types, emergency contacts UI).
- Sick leave accrual UI (backend may remain; no new sick-leave pages).
- Complex permission matrix / per-route ACL editor.
- Email notifications for time approvals.
- Biometric / geo-fenced clock-in.

---

## Legacy cleanup

**Remove or replace** (no compromise reuse of bad UX):

- `frontend/src/pages/hr/TimeClockPage.tsx` → rebuilt
- `TimeHistoryPage.tsx` → fold into time clock / my time or delete route
- `EmployeeListPage.tsx` / `EmployeeDetailPage.tsx` → replace with Admin Users or slim staff list if needed
- `SickLeavePage.tsx` → remove route (keep models until explicit drop migration)

**Reuse if clean:**

- `TimeEntry`, `TimeEntryModificationRequest` models (extend for break-on-shift if needed)
- `TimeEntryViewSet` clock in/out/current + mod-request viewset
- `UserListPage` / accounts user API for user CRUD
- Role groups: Admin, Manager, Employee, Consignee

---

| **Overtime rule (MVP)** | 40h/week calendar week; **red banner only** — clock-in never blocked. |
| **Modification review** | **Super Admin only**: Edit pending request, then Approve (applies to time entry). **No deny.** No shift-approval workflow. |

---

## Acceptance

- [ ] Time clock in nav (Essentials or HR workspace) with break button
- [ ] Overtime warning impossible to miss when near/over 40h/week
- [ ] Employee can submit mod request; manager can approve/deny
- [ ] Admin Users page covers create/edit/role/deactivate
- [ ] Superadmin payroll hours page with date range
- [ ] Legacy HR routes removed or redirected; no dead nav links

---

## Sessions

### Session 1 — 2026-06-22

**Started:** 2026-06-22T~09:00-05:00 (America/Chicago)

**Goal:** Ship MVP time clock (in/out + break + overtime banner), simplified user/permissions UX, modification requests UI, and superadmin payroll hours — after stripping legacy HR pages.

**Finish line:** Same as initiative finish line above.

**Scope:** MVP table only; reuse clean backend skeletons; rebuild frontend pages.

**Out of scope:** Full HRIS, sick leave UI, granular permissions, email.

**Estimated time:** ~1 day

**Updates:**

- Backend: mod requests — Super Admin PATCH + approve only (deny removed); clock-in never blocked at 40h.
- Frontend: red-only overtime banner; mod requests Edit/Approve (no deny); payroll past-period presets; deleted legacy HR pages.
- **Time & payroll** — consolidated superadmin page (`/admin/time-payroll`): period calendar + quick select, roster with pay $, filters, row/bulk CRUD, change requests tab (approve + **reject**).
- **Employees** — Admin **Users** renamed to **Employees**; add/edit includes status, contact, role, position, employment type, **pay rate**.
- **Soft delete** — `TimeEntry` + `TimeEntryModificationRequest` `deleted_at`/`deleted_by`; migration `0004`; `purge_soft_deleted_hr` management command (30-day retention).

### Session 2 — 2026-06-23

**Started:** 2026-06-23T~14:00-05:00 (America/Chicago)

**Goal:** Fix Time clock **My recent shifts** listing all staff instead of the logged-in user.

**Finish line:** Managers/admins on `/hr/time-clock` see only their own recent shifts; roster on Time & payroll unchanged.

**Scope:** `TimeEntryViewSet` list/summary queryset + `TimeClockPage` / `useTimeEntries`.

**Estimated time:** ~15m

**Updates:**

- **Backend** — `list` / `summary` on `TimeEntryViewSet` filter to `request.user` unless manager passes `?employee=`.
- **Frontend** — `TimeClockPage` passes `employee: user.id`; `useTimeEntries` supports `enabled` guard.

---

## See also

- Models: [`apps/hr/models.py`](../../apps/hr/models.py)
- HR API: [`apps/hr/views.py`](../../apps/hr/views.py)
- Accounts / roles: [`apps/accounts/models.py`](../../apps/accounts/models.py), [`.ai/extended/auth-and-roles.md`](../extended/auth-and-roles.md)
- Prior inventory initiative (archived): [`product_item_crud_and_processing`](./_archived/_completed/product_item_crud_and_processing.md) — **v2.29.0–v2.32.0**
