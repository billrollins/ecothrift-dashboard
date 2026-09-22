<!-- Last updated: 2026-09-22 (ai settings + floorplan AI) -->

# Eco-Thrift Dashboard — Auth and Roles

## Auth Flow

1. **Login** (`POST /api/auth/login/`)
   - Email + password → `authenticate()`, then `update_last_login` (this view mints JWT itself, so Django's login signal never fires)
   - Returns: `{ access: "<jwt>", user: {...} }`
   - **Access token**: returned in JSON, stored **in memory** on frontend
   - **Refresh token**: set as **httpOnly cookie** (`refresh_token`), path `/api/auth/`, SameSite=Lax, max-age 7 days

2. **Refresh** (`POST /api/auth/refresh/`)
   - No body; refresh token sent via cookie
   - Returns: `{ access: "<new_jwt>" }`
   - With `ROTATE_REFRESH_TOKENS`: new refresh token set in cookie; old one blacklisted

3. **Logout** (`POST /api/auth/logout/`)
   - Blacklists refresh token, clears cookie
   - Frontend clears in-memory access token

4. **Me** (`GET /api/auth/me/`) — requires auth
   - Returns current user with nested profiles (employee, consignee, customer)

5. **Change Password** (`POST /api/auth/change-password/`) — requires auth
   - Body: `{ old_password, new_password }`
   - UI: account menu → **Change password** (`components/users/ChangePasswordDialog.tsx`)

---

## Password Reset

Two audiences, two flows, one `MagicLinkToken` table. Staff tokens never travel
the customer consume path — that path creates customers and claims guest records.

### Staff

| Step | Endpoint | Notes |
|------|----------|-------|
| Ask | `POST /api/auth/forgot-password/` | Body `{ email }`. Always the same reply whether or not the address exists. Throttled. Non-staff and inactive accounts are silently ignored. |
| Email | Graph mail | Clickable `https://<STAFF_DASHBOARD_HOST>/reset-password?token=…`. Sent with `fail_silently=False` — a Graph failure returns 502 rather than stranding someone. |
| Set | `POST /api/auth/reset-password/` | Body `{ token, new_password }`. Throttled. |
| Admin-initiated | `POST /api/accounts/users/{id}/send-password-reset/` | Same token and email. No password is ever shown or returned. Refuses accounts with no email and inactive accounts. |

Token: `MagicLinkToken` with `purpose='staff_reset_password'`, one hour, single
use. Issuing a new one spends any outstanding token for that address. Issue and
consume live in `apps/accounts/services/staff_password.py`.

### Customers

`POST /api/auth/customer/reset-password/` (self-serve) or
`POST /api/accounts/customers/{id}/send-password-reset-link/` (staff CS action).
Both issue `purpose='reset_password'` and email a storefront magic link.

---

## Token Lifetimes

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access | 30 minutes | In-memory (frontend) |
| Refresh | 7 days | httpOnly cookie, path `/api/auth/` |
| Rotation | Enabled | New refresh on each refresh call |
| Blacklist | After rotation | Old refresh tokens blacklisted |

---

## Silent Refresh on Page Load

**AuthContext** (`frontend/src/contexts/AuthContext.tsx`):

1. On mount, calls `POST /api/auth/refresh/` with `credentials: 'include'` (sends cookie)
2. If OK: stores `access` in memory via `setAccessToken()`, then fetches `/api/auth/me/` for user
3. If fail: clears user and token, sets `isLoading = false`

---

## Axios Interceptor (401 → Refresh → Retry)

**client.ts** (`frontend/src/api/client.ts`):

- Request: adds `Authorization: Bearer <access_token>` from in-memory store
- Response: on **401**, if not already retrying:
  1. Calls `POST /api/auth/refresh/` with `withCredentials: true`
  2. Stores new access token
  3. Retries original request with new token
  4. Queues concurrent 401s until refresh completes, then retries all
  5. On refresh failure: clears token, redirects to `/login`

---

## Roles (Django Groups)

Five roles, stored as **Django Group** names. A user can belong to **multiple groups** simultaneously (e.g., a user can be both an Employee and a Consignee).

| Role | Group Name | is_staff |
|------|------------|----------|
| Admin | `Admin` | True |
| Manager | `Manager` | True |
| Employee | `Employee` | True |
| Consignee | `Consignee` | False |
| Customer | `Customer` | False |

User's `role` property: first match in `['Admin','Manager','Employee','Consignee','Customer']` from `user.groups.values_list('name', flat=True)`.
User's `roles` property: returns **all** group names as a list (e.g. `['Employee', 'Consignee']`).

---

## Backend Permission Classes

| Class | Allowed Roles |
|-------|---------------|
| `IsAdmin` | Admin only |
| `IsManagerOrAdmin` | Manager or Admin, or any Django superuser |
| `IsEmployee` | Employee, Manager, Admin |
| `IsConsignee` | Consignee only |
| `IsCustomer` | Customer only (storefront account endpoints) |
| `IsStaff` | Alias of `IsEmployee` (staff floor) |
| `IsSuperAdmin` | Django superuser (Blog Studio and other owner-only tooling) |

`IsManager` (Manager only) was unused and has been removed. Django's `Permission` table is not consulted. The live list of what each role can do is `apps/accounts/capabilities.py`, exposed as `GET /api/auth/capabilities/` (the caller's set) and `GET /api/accounts/capability-catalog/` (Admin, full matrix). Per-user extra grants are not implemented.

### Time kiosk (`/kiosk` hosted, `/clock` public)

- **Card token.** `EmployeeProfile.badge_token_hash` is `HMAC-SHA256(SECRET_KEY, token)` of a 10-char opaque Code 128 token; `badge_issued_at` / `badge_revoked_at`; `badge_status` = `none` / `active` / `revoked`. The plain token is returned exactly once by `POST /api/accounts/users/:id/badge/` (issue) or `.../badge/reprint/` (rotates; the old card dies at once); `.../badge/revoke/` sets `badge_revoked_at`. Admin only (`UserViewSet`). Employee number, PIN, and typed passwords are never accepted at the kiosk.
- **Hosted kiosk host.** `/api/hr/kiosk/*` requires a staff JWT with `hr.kiosk:use` (every staff role has it). The host is meant to be a dedicated **Employee** account left signed in on the tablet; `/kiosk` warns when a Manager or Admin is the host. Every punch acts as the *scanned card's* user, never the host; `KioskEvent` records host, subject, action, ip. Exit needs the host's own password via `POST /api/auth/verify-password/` (throttle scope `auth_verify_password`). The axios interceptor never redirects `/kiosk` to `/login` on refresh failure; it fires `kiosk:host-expired` and the page shows a manager sign-in overlay. A `401` with `code: card` is a bad card, not a dead host session, so it does not refresh.
- **Public clock.** `/api/hr/clock/*` is `AllowAny`. Identity is the card token only; a `clock_device` HTTP-only cookie plus IP key the throttle (10 failed identifies per 10 min, then 5 min lock); `AppSetting kiosk.public_allowed_ips` (JSON list of exact IP strings, empty = any) fences the surface. Board and preview are redacted (`name` "Maria R." only, no punch times, no break state, no Called in). Punch mutations on `/clock` are clock-in, clock-out, break, fix-stale; time edits stay hosted.
- **Identify throttle (hosted).** 20 failed identifies per host per 10 min, then 5 min cooldown; every failure returns the same generic message and is logged as `identify_fail` / `cooldown`. A successful identify clears that counter.

---

## Frontend Route Guards

| Guard | Logic |
|-------|-------|
| **ProtectedRoute** | Requires `isAuthenticated`; else redirect to `/login` |
| **StaffRoute** | Requires `Admin` / `Manager` / `Employee`. Consignee → `/consignee`. Anyone else (including `role === null`) → `/login` |
| **ManagerRoute** | If `role` not in `['Admin','Manager']` → redirect to `/dashboard` |
| **SuperAdminRoute** | If `!user.is_superuser` → redirect to `/dashboard` |

Route nesting: `ProtectedRoute` → `StaffRoute` → `MainLayout` for staff; `ProtectedRoute` → `ConsigneeLayout` for consignees.

---

## hasRole() Hierarchy Logic

Single table in `frontend/src/auth/roles.ts` (also used by nav):

```ts
ROLE_RANK: { Admin: 4, Manager: 3, Employee: 2, Consignee: 1, Customer: 0 }
hasRole(role) => roleRank(user.role) >= roleRank(role)
```

- `hasRole('Admin')` → true only for Admin
- `hasRole('Manager')` → true for Manager, Admin
- `hasRole('Employee')` → true for Employee, Manager, Admin
- `hasRole('Consignee')` → true for Consignee (and staff, since staff level > 1)

---

## What Each Role Can Access

### Admin

- All staff routes
- Settings house at `/admin/settings` (System, Printing, Store, Assumptions, Retail QA, Permissions, AI (superuser only))
- Departments directory + hub (`/admin/departments`); Shifts (`/admin/shifts`); Command Center (`/admin/retail-qa`). Superuser-only `hr.department:admin` (create / rename / deactivate / delete); Manager+ `hr.department:write` (description, location, manager).
- `/admin/users` — Admin workspace. Manager+ reach the page; the **Employees** tab is first and the default for Admin. Managers only see Customers (`?tab=customers`).
- **Django model admin** (superuser, raw ORM UI): **`/db-admin/`** — separate prefix from React **`/admin/*`**
- Consignment management (`/consignment/accounts`, `/consignment/items`, `/consignment/payouts`)

### Manager

- All staff routes except Admin-only pages (Employees tab, Permissions tab)
- Settings (System / Printing / Store / Assumptions / Retail QA), Users (Customers), Departments (soft fields), Shifts, Command Center, Studios, Routines, Online Sales (Messages)
- Consignment management
- POS setup

### Employee

- Dashboard, HR (**Today** punch at `/today`, **Pay** ledger at `/pay`), Routines
- Inventory (vendors, orders, processing, products, items)
- POS (terminal, drawers, cash, transactions)
- No consignment management, no admin, no Time & payroll

### Consignee

- Redirected from staff routes to `/consignee`
- `/consignee` (summary), `/consignee/items`, `/consignee/payouts`
- Uses `ConsigneeLayout`; backend endpoints `my/items/`, `my/payouts/`, `my/summary/` scoped to own data
