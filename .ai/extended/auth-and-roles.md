<!-- Last updated: 2026-02-13T16:00:00-06:00 -->

# Eco-Thrift Dashboard — Auth and Roles

## Auth Flow

1. **Login** (`POST /api/auth/login/`)
   - Email + password → `authenticate()`
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

5. **Forgot Password** (`POST /api/auth/forgot-password/`)
   - Body: `{ email }`
   - Returns: `{ detail, reset_token }` (token returned in response for dev; email delivery not yet implemented)

6. **Reset Password** (`POST /api/auth/reset-password/`)
   - Body: `{ token, new_password }`
   - Returns: `{ detail }`

7. **Admin Reset Password** (`POST /api/accounts/users/{id}/reset-password/`)
   - Admin only
   - Generates temporary password, returns `{ detail, temporary_password }`

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

Four roles, stored as **Django Group** names. A user can belong to **multiple groups** simultaneously (e.g., a user can be both an Employee and a Consignee).

| Role | Group Name | is_staff |
|------|------------|----------|
| Admin | `Admin` | True |
| Manager | `Manager` | True |
| Employee | `Employee` | True |
| Consignee | `Consignee` | False |

User's `role` property: first match in `['Admin','Manager','Employee','Consignee']` from `user.groups.values_list('name', flat=True)`.
User's `roles` property: returns **all** group names as a list (e.g. `['Employee', 'Consignee']`).

---

## Backend Permission Classes

| Class | Allowed Roles |
|-------|---------------|
| `IsAdmin` | Admin only |
| `IsManager` | Manager only |
| `IsManagerOrAdmin` | Manager or Admin |
| `IsEmployee` | Employee, Manager, Admin |
| `IsConsignee` | Consignee only |
| `IsStaff` | Employee, Manager, Admin (same as IsEmployee) |

---

## Frontend Route Guards

| Guard | Logic |
|-------|-------|
| **ProtectedRoute** | Requires `isAuthenticated`; else redirect to `/login` |
| **StaffRoute** | If `role === 'Consignee'` → redirect to `/consignee` |
| **ManagerRoute** | If `role` not in `['Admin','Manager']` → redirect to `/dashboard` |
| **AdminRoute** | If `role !== 'Admin'` → redirect to `/dashboard` |

Route nesting: `ProtectedRoute` → `StaffRoute` → `MainLayout` for staff; `ProtectedRoute` → `ConsigneeLayout` for consignees.

---

## hasRole() Hierarchy Logic

```ts
ROLE_HIERARCHY: { Admin: 3, Manager: 2, Employee: 1, Consignee: 0 }
hasRole(role) => userLevel >= requiredLevel
```

- `hasRole('Admin')` → true only for Admin
- `hasRole('Manager')` → true for Manager, Admin
- `hasRole('Employee')` → true for Employee, Manager, Admin
- `hasRole('Consignee')` → true for Consignee (and staff, since staff level > 0)

---

## What Each Role Can Access

### Admin

- All staff routes
- `/admin/users`, `/admin/permissions`, `/admin/settings`
- Consignment management (`/consignment/accounts`, `/consignment/items`, `/consignment/payouts`)

### Manager

- All staff routes except admin
- Consignment management
- No `/admin/*`

### Employee

- Dashboard, HR (time clock, time history, employees, sick leave)
- Inventory (vendors, orders, processing, products, items)
- POS (terminal, drawers, cash, transactions)
- No consignment management, no admin

### Consignee

- Redirected from staff routes to `/consignee`
- `/consignee` (summary), `/consignee/items`, `/consignee/payouts`
- Uses `ConsigneeLayout`; backend endpoints `my/items/`, `my/payouts/`, `my/summary/` scoped to own data
