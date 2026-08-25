<!-- initiative: slug=hr-time-clock-mvp status=completed updated=2026-06-23 -->
<!-- Archived 2026-06-23: disposition=completed (HR Time Clock MVP shipped v2.33.0–v2.33.1; Time & payroll polish local/unreleased) -->
<!-- Last updated: 2026-06-23 (archived → _completed/) -->

# Initiative: HR Time Clock MVP

**Status:** **Completed** (2026-06-23) — shipped in **v2.33.0** (MVP) and **v2.33.1** (my-shifts scoping fix). See [`CHANGELOG`](../../../../CHANGELOG.md) `[2.33.0]`, `[2.33.1]`.

**Supersedes:** scattered legacy HR pages (`TimeHistoryPage`, `EmployeeListPage`, `EmployeeDetailPage`, `SickLeavePage`) and overbuilt flows hidden since `web_ui_cleanup`.

---

## Finish line (session win)

Staff can **clock in / take break / clock out** with a **huge overtime warning** when weekly hours would exceed the limit; **Admin** manages employees and roles on a simple screen; employees submit **time modification requests**; **superadmin** views **payroll hours** for a pay period.

**Delivered.**

---

## MVP scope (shipped)

| Area | Deliver |
|------|---------|
| **Time clock** | `/hr/time-clock`: clock in, **Take break** / **End break**, clock out; live shift timer; weekly hours ring; **red overtime banner** (40h/week Mon–Sun — warn only). |
| **My time** | Employee recent entries + submit modification request on completed shifts. |
| **Modification review** | **Super Admin only** on `/admin/time-payroll` Change requests tab: edit, approve, **reject**, bulk actions. |
| **Employees** | Admin **Employees** (`/admin/users`): create/edit/deactivate, role, position, employment type, **pay rate**. |
| **Time & payroll** | Super Admin `/admin/time-payroll`: period controls, roster (CRUD, soft delete), by-employee payroll ($), change requests. |

---

## Out of scope (unchanged)

- Full HRIS, sick leave UI, granular ACL editor, email notifications, biometric/geo clock-in.
- CSV export on payroll grid (DataGrid is copy-friendly; no export button).
- Heroku Scheduler for `purge_soft_deleted_hr` (command exists; ops follow-up).

---

## Legacy cleanup (done)

- **Rebuilt:** `frontend/src/pages/hr/TimeClockPage.tsx`
- **Deleted:** `TimeHistoryPage`, `EmployeeListPage`, `EmployeeDetailPage`, `SickLeavePage`
- **Redirects:** `/hr/time-history` → time clock; `/hr/employees` → `/admin/users`; `/hr/sick-leave` → dashboard; `/admin/payroll-hours` → time-payroll

---

| **Overtime rule** | 40h/week calendar week (Mon–Sun); **red banner only** — clock-in never blocked. |
| **Modification review** | **Super Admin only** on Time & payroll; approve applies edits; **reject** marks denied without changing the time entry. |

---

## Acceptance

- [x] Time clock in nav (Essentials) with break button
- [x] Overtime warning impossible to miss when near/over 40h/week
- [x] Employee can submit mod request; **Super Admin** approves/rejects on Time & payroll
- [x] Admin **Employees** page covers create/edit/role/deactivate + pay rate
- [x] Superadmin Time & payroll with date range / biweekly periods
- [x] Legacy HR routes removed or redirected; no dead nav links

---

## See also

- Models: [`apps/hr/models.py`](../../../../apps/hr/models.py)
- HR API: [`apps/hr/views.py`](../../../../apps/hr/views.py)
- Accounts / roles: [`apps/accounts/models.py`](../../../../apps/accounts/models.py), [`.ai/extended/auth-and-roles.md`](../../../extended/auth-and-roles.md)
