<!-- Last updated: 2026-11-13 (#121 Cannot sign in) -->

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
   - The refresh token renews while it is used (a fresh 7 days once the old one is a day old; J19, v2.186.0), so an active sign-in keeps going; an idle one ends sooner (below)
   - **Idle sign-out (D16, T69):** a staff login with no activity past its limit is refused: `401 { code: "IDLE", detail: "Signed out after 4 hours idle." }`, cookie cleared, token blacklisted

3. **Logout** (`POST /api/auth/logout/`)
   - Blacklists refresh token, clears cookie
   - Frontend clears in-memory access token

4. **Me** (`GET /api/auth/me/`) — requires auth
   - Returns current user with nested profiles (employee, consignee). The old `customer` profile is gone (T62).

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

### Customers (no passwords since 2026-10-16)

Customers have no password (rulebook J13: one customer account; only staff have passwords). A customer
signs in with an emailed link (website) or link and code (Thrift+ app); either one signs in to both, and
signing out of either ends both (`apps/thriftplus/services/one_account.py`; the website `refresh_token`
cookie and the app `tp_session` cookie are both set on ecothrift.us). `Person.user` links a Thrift+ person
to their website `User`.

- `POST /api/auth/login/` refuses a non-staff login (`401`, code `EMAIL_LINK`).
- `POST /api/auth/customer/set-password/` answers `410 PASSWORDS_GONE`; the Thrift+ app's `login/`,
  `session/reset/` and `session/reset/confirm/` do too. `session/password/` is the staff Dash login only.
- `POST /api/auth/customer/reset-password/` and the staff CS action
  `POST /api/accounts/customers/{id}/send-password-reset-link/` now send a **sign-in** link
  (`purpose='sign_in'`). A staff email still gets the Dash reset.
- A deactivated or revoked Thrift+ member is refused on the website too (`403 ACCOUNT_OFF`).
- **One customer system (T62, 2026-10-20).** `accounts.CustomerProfile` is retired (no reads, no writes; the model and
  table stay until a later release drops them). A website customer is a non-staff `User` in the `Customer` group (the
  login that holds, messages and orders hang on) and, once it has a name, a Thrift+ `Person` (`Person.user`; made
  pending by `one_account.person_for_user`). What the profile held now lives on the person: email confirmed =
  `Person.email_verified_at` (`magic_link.customer_email_verified`: a login with no name has no person, and counts as
  confirmed once it has signed in); notes = `Account.notes`; member number = the member code; since = the login's
  join date. An online-sales buyer is such a login (made when a hold is confirmed or a link is used); an unconfirmed
  guest hold stays a hold kept by email, with no login. Dash `/api/accounts/customers/` still serves the website logins (id = User id), now read from the
  person. The POS `CUS-nnn` scan and `customers/lookup/<number>/` are gone: the customer on a sale is the Thrift+
  member. `Consignee` is a staff-side role (a Dash login with a `ConsigneeProfile`), not a customer, and is untouched.
  The data move is `thriftplus.0026_carry_customer_profiles` (idempotent, deletes nothing).
- Existing accounts are linked, and every customer password removed, by the Requests-center request
  `thriftplus.one_account` (the owner approves it in production).

---

## Token Lifetimes

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access | 30 minutes | In-memory (frontend) |
| Refresh | 7 days | httpOnly cookie, path `/api/auth/` |
| Idle limit | 4 hours (staff), 24 hours (register) | AppSetting `auth.idle_hours`; see Idle sign-out |
| Blacklist | On logout and on an idle refusal | Spent refresh tokens are refused |

### Idle sign-out (4 hours, D16)

Code: `apps/accounts/services/idle.py`, `apps/accounts/authentication.py`. Tests: `apps/accounts/tests/test_idle_signout.py`.

| Piece | How |
|-------|-----|
| Activity | `User.last_active_at`. Stamped at login, at every refresh, and on any request with a good access token (`IdleStampJWTAuthentication`, at most one UPDATE per 5 minutes). One time per account, not per device. |
| Enforced | On the server, at refresh. Access tokens last 30 minutes, so a session cannot outlive the limit by more than that. |
| Limit | AppSetting `auth.idle_hours` = `{"staff": 4, "register": 24}` (Admin only; a missing or bad value falls back to these). |
| Registers | The browser sends `X-Device-Kind: register` on refresh when this computer's saved POS device type is `register` (`deviceKindHeaders()` in `client.ts`). That picks the longer `register` limit (never below the staff limit). |
| Thrift+ Staff (`/staff`, store phones) | Same Dash sign-in, so the 4-hour staff limit. |
| Not touched | Customers (website session) and the Thrift+ Member app (`tp_session`): only `is_staff_login` accounts are timed out. A session with no `last_active_at` yet (started before this shipped) is let in and stamped. |
| Browser | A refused refresh stores the message (`rememberIdleSignOut`), sends the person to `/login`, and the sign-in page shows it once (`login-idle-notice`). |

---

## Register PIN (2026-10-21)

One PIN per staff member for the register (manager approvals, Cover). Code: `apps/accounts/services/register_pin.py`. Tests: `apps/accounts/tests/test_register_pin.py`.

| Piece | How |
|-------|-----|
| Who | Any active staff login (Employee, Manager, Admin, owner). A switched-off login or ended employment has no working PIN. |
| Set | The person sets their own on the Me page (`POST /api/auth/me/pin/`, their password first): 4 to 6 digits. Too-easy PINs (1111, 1234, 9876) are refused. An Admin clears a forgotten one (Users → employee drawer → Register PIN → Clear PIN; `POST /api/accounts/users/{id}/clear-register-pin/`). Each set and clear is an `AccountEvent`. |
| Unique | A PIN alone says who it is. Stored as `User.register_pin_hash` (HMAC with the server secret, unique), never the PIN. A PIN someone else has: "Pick a different PIN"; five of those in an hour stop that person for the hour. |
| Check | `check_pin(pin, device=..., min_role=None)` answers the user or raises `PinError` (`PIN_WRONG`, `PIN_LOCKED`, `PIN_NEEDED`). A right PIN below `min_role` counts as wrong. `count_wrong(device)` counts a real PIN that isn't the one asked for (Cover's Back) as a wrong try. |
| Lockout | Five wrong tries in a row lock PIN entry **on that register or device** for 15 minutes (`device_key(request, register)`; REG-11: never store-wide). A right PIN clears the count. |
| Logging | Each caller logs what the PIN approved. |

## Me page and sign out on all devices (2026-10-21)

`/me` (account menu: the name row; Thrift+ Staff: the **Me** tab, `/staff/me`). Code: `apps/accounts/me_views.py`, `frontend/src/pages/me/MePage.tsx`. Tests: `apps/accounts/tests/test_me_page.py`, `MePage.test.tsx`.

| Endpoint | What |
|----------|------|
| `GET /api/auth/me/page/` | My details, employee facts, emergency contact, PIN status (never the PIN), my weekly shifts, and a `drawers` slot (null until the register's drawer life ships). Staff only (`IsTeamMember`). |
| `PATCH /api/auth/me/details/` | My phone and emergency contact (same rules as onboarding's). Name, email and job are a manager's to change. |
| `POST /api/auth/me/pin/` | `{ pin, password }`: set or change my register PIN. |
| `POST /api/auth/sign-out-everywhere/` | Blacklists every live refresh token of mine, stamps `User.sessions_ended_at` (access tokens issued before it are refused at once, `IdleStampJWTAuthentication`), clears this cookie, logs `signed_out_all`. |

---

## View as (owner, 2026-10-22)

The owner sees Dash exactly as one employee does, without signing out: their role, capabilities, nav, Today, Dashboard,
register landing and Thrift+ Staff. Code: `apps/accounts/services/view_as.py`, `middleware.py` (`ViewAsMiddleware`),
`authentication.py`, `view_as_views.py`; UI `frontend/src/components/viewAs/`. Tests: `apps/accounts/tests/test_view_as.py`,
`ViewAsBanner.test.tsx`.

| Piece | How |
|-------|-----|
| Who | Superusers only. Never as another superuser, as yourself, or as a switched-off or customer login. |
| Start | Account menu → **View as…** (a picker), the eye on each person in Users → Employees (desktop), or **View as** in the employee drawer (phones too). `POST /api/auth/view-as/start/ { user_id }` makes a `ViewAsSession` row and answers an access token with the claim `view_as` = its id; Dash then reloads at `/`. |
| Keeps going | The row holds the refresh token's `jti`; `refresh/` from that sign-in keeps handing out view-as tokens (other devices are not affected). The token never outlives the view. |
| On each request | `IdleStampJWTAuthentication` runs the request as the employee (`request.user`) and keeps the owner as `request.real_user` (audit). The owner is the one stamped active and charged for AI. `GET /api/auth/me/` carries `view_as` (who, job, who is signed in, ends at) for the banner. |
| Read only | `ViewAsMiddleware` refuses every POST, PUT, PATCH and DELETE: `403 { code: VIEW_AS_READ_ONLY, detail: "Viewing as Maria K: read only" }`. Allowed: Back, sign-out, refresh, and the searches sent as POST (`READ_POSTS`: Thrift+ register find and pending, returns find). Every read (and those searches) runs inside a transaction that is always rolled back, so nothing a page writes on open is kept (a message marked read, a stamp). |
| Ends | Back (`POST /api/auth/view-as/stop/`), sign-out (`logout/`, Sign out on all devices), after 2 hours, when the owner loses superuser, or when a new View as starts. Then any request with the old token answers `401 VIEW_AS_ENDED` and the browser reloads as the owner. |
| Audit | `AccountEvent` on the employee: `view_as_start` and `view_as_stop` (with why), the owner as actor. `ViewAsSession` keeps started, expires, ended and why. |
| Banner | `ViewAsBanner` (in `main.tsx`, on every screen): bright amber band, "Viewing as Maria K (Processing Associate) · signed in as Bill · read only · ends 3:40 PM · Back to Bill"; on phones two short lines. It sets `--view-as-band` so `MainLayout`, its sidebar and Thrift+ Staff start below it. The avatar shows the employee's initials with an eye badge; the menu's first row is Back. |

## Staff messages and one-time secrets (2026-10-21)

Messages in Dash between staff; never email or text. Code: `apps/accounts/services/staff_messages.py`, `messages_views.py`, `services/one_time_secret.py`; UI `frontend/src/pages/messages/MessagesPage.tsx`, `components/messages/MessagesEnvelope.tsx`. Tests: `apps/accounts/tests/test_staff_messages.py`, `MessagesPage.test.tsx`.

| Piece | How |
|-------|-----|
| Who | Every staff login reads and replies (`IsTeamMember`). The owner and managers start a thread, to one person or a whole department (its active staff at that time). |
| Models | `StaffThread`, `StaffThreadMember`, `StaffMessage`, `StaffMessageRead` (read receipts: who, when), `StaffMessageSecret`. |
| API | `GET/POST /api/accounts/messages/`, `messages/unread/` (the envelope), `messages/audiences/`, `messages/{id}/` (opening marks read), `messages/{id}/reply/`, `POST messages/secret/{message_id}/show/`. |
| One-time secret | Only on a message to one person. Sealed with the server key (HMAC keystream + tag, standard library). `show` answers it once to that person (`Cache-Control: no-store`), records `secret_shown_at` and the device (kind, address, browser), then deletes the secret row; the message then reads "Shown once on <date>; deleted". Never in a list, a thread payload, admin (not registered), notifications or logs. |
| Envelope | Dash top bar (`MainLayout`) and Thrift+ Staff's new top bar; unread count polled every minute. Me shows a Messages section. |
| Request kind | `accounts.issue_register_pins` (`apps/accounts/approval_kinds.py`): params `{"users": [id or email], "replace": false}`. Each person gets a random 4-digit PIN (not too easy, nobody else's), set with `set_pin`, and a one-time secret message from the approver. Preview shows names only; someone with a PIN is skipped unless `replace`; the approver is skipped. The PIN lives only in a local variable, the hash and the sealed secret. |

---



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
  5. On refresh failure: clears token, redirects to `/login` (an `IDLE` refusal leaves "Signed out after 4 hours idle." for the sign-in page)

---

## Staff permissions (People → Permissions, Dash Update #53, 2026-11-03)

One page, `/people/permissions` (People workspace; `/admin/permissions` redirects): **Levels · Departments · People · History**. Managers read it; only the owner changes it (`IsOwner`, never by a grant).

| Piece | How |
|-------|-----|
| Areas | The 10 sidebar workspaces: Buying, Processing, Restoration, Inventory, Cashier, Deliveries, Online Sales, Studios, People, Admin. |
| Dial | One per area: None 0 · View 1 · Work 2 · Manage 3 · Full 4. Each step includes the ones below it. |
| Items | `apps/accounts/capabilities.py` `ITEMS`: each sits on one step of one area (ids are the old capability ids). An item's step follows today's gate (View/Work = any staff, Manage = `IsManagerOrAdmin`, Full = owner). `locked` items (change permissions, View as, the Dash Updates line) are the owner's alone. `paths` = the API paths a single tick of that item opens. |
| Basics | On no dial, every staff login: the time clock, Today / Dashboard / Me, messages, assigned routines and documents, Dash Updates report. |
| Layers | **Level** (Employee, Manager; the Owner = superuser, locked at Full) sets the base → **Department** adds (a higher dial or single items; never takes away) → **Exception** for one person has the last word (a dial up or down, items added, items taken away; a personal "no" beats everything; optional end date and note). |
| Day one | `LEVEL_DEFAULTS` = exactly what each level had before #53: Employee Work in Buying, Processing, Restoration, Inventory, Cashier, Deliveries, Studios and None in Online Sales, People, Admin; Manager Manage everywhere. Department presets start empty. The retired Admin group counts as Manager; the old Admin-only things are Owner (Full). |
| Store | `AccessSet` (one row per layer: `level:Employee`, `department:<id>`, `person:<id>`; `areas` JSON `{area: {step, add, remove, until, note}}`) and `AccessEvent` (History: who, when, what, area, the change in words, note). A level with no row uses the defaults. |
| Resolve | `apps/accounts/services/access.py` `resolve(user)`: dial per area with its source, items held with their source, items denied. Kept on the user object for the request (`forget(user)` drops it). |
| API | `GET /api/accounts/access/` (the page), `PUT access/layer/` (one layer whole), `POST access/level/` (Employee ↔ Manager; never the owner), `GET access/history/`. `GET /api/auth/me/` and the sign-in answer carry `access` (item ids + dial steps reached, e.g. `admin:manage`); `GET /api/auth/capabilities/` answers the same list. |
| Server, phase 1 | **Giving more works.** `IsManagerOrAdmin`, `IsSuperAdmin`, `IsAdmin` and Keys' `IsOwnerOrAdmin` keep their old rule and also let in a staff login whose dial for the request's area reaches the gate's step (Manage / Full), or who holds an item at that step or higher naming the path (`capabilities.API_AREAS` maps each API prefix to an area; a test fails if a gated endpoint has none). Inline checks use `manager_or(user, need)`, `owner_or(user, need)`, `admin_or(user, need)`. A register approval PIN (`min_role='Manager'`) also takes the PIN of someone granted `pos.override:use`. Customers and consignees never hold anything. Someone granted staff accounts cannot make or change a Manager or Admin (`UserViewSet._levels_guard`). **Taking away** (a lower dial, an unticked item, a personal no) hides menus and pages now; the server enforces it in phase 2, area by area. |
| Frontend | `frontend/src/auth/access.ts` `canAccess(user, need)`: `need` lists the item(s) and the dial step, e.g. `['settings:write', 'admin:manage']`. With `access` the items decide; without it (an old sign-in, a test double) the dial step falls back to the old level rule. Sidebar entries carry `need` (else their area's View step); routes use `AccessRoute need=…`. |

## Roles (Django Groups)

Five roles, stored as **Django Group** names. A user can belong to **multiple groups** simultaneously (e.g., a user can be both an Employee and a Consignee). On the Permissions page the staff groups are levels: Employee and Manager (Admin is retired into the Owner, #53).

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

| Class | Allowed |
|-------|---------|
| `IsAdmin` | The owner, the retired Admin group, or a grant at Full for the area (#53) |
| `IsManagerOrAdmin` | Manager or Admin, any superuser, or a grant at Manage for the area (#53) |
| `IsEmployee` | Employee, Manager, Admin |
| `IsConsignee` | Consignee only |
| `IsCustomer` | Customer only (storefront account endpoints) |
| `IsStaff` | Alias of `IsEmployee` (staff floor) |
| `IsSuperAdmin` | Django superuser, or a grant at Full for the area (#53) (Blog Studio and other owner tooling; the B-Stock login hand-off **`/api/buying/bstock-login/`** and manifest pulls **`/api/buying/manifest-pulls/`**) |
| `IsOwner` | Django superuser only, never by a grant: changing permissions |

`IsManager` (Manager only) was unused and has been removed. Django's `Permission` table is not consulted. What each level, department and person can do: § Staff permissions above.

---

## Frontend Route Guards

| Guard | Logic |
|-------|-------|
| **ProtectedRoute** | Requires `isAuthenticated`; else redirect to `/login` |
| **StaffRoute** | Requires `Admin` / `Manager` / `Employee`. Consignee → `/consignee`. Anyone else (including `role === null`) → `/login` |
| **AccessRoute** | `need` (item ids + the dial step, #53) via `canAccess`; else redirect to `/dashboard`. Replaced ManagerRoute, SuperAdminRoute and OwnerOrAdminRoute. |

Route nesting: `ProtectedRoute` → `StaffRoute` → `MainLayout` for staff; `ProtectedRoute` → `ConsigneeLayout` for consignees.

---

## hasRole() Hierarchy Logic

Single table in `frontend/src/auth/roles.ts`. The sidebar, the page guards and most in-page buttons read `canAccess` instead (#53); `hasRole` stays for checks not moved yet.

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

- Dashboard, HR (**Today** at `/today`: punch, routines, Hours & pay)
- Inventory (vendors, orders, processing, products, items)
- POS (terminal, drawers, cash, transactions)
- No consignment management, no admin, no Time & payroll

### Consignee

- Redirected from staff routes to `/consignee`
- `/consignee` (summary), `/consignee/items`, `/consignee/payouts`
- Uses `ConsigneeLayout`; backend endpoints `my/items/`, `my/payouts/`, `my/summary/` scoped to own data

## Cannot sign in (Dash Update #121, 2026-11-13)

- **Lockout** (`services/lockout.py`): 5 wrong tries on one username or email (or 30 from one address) lock it for 15
  minutes from the last wrong try, in the database cache (every dyno sees it). The 5th logs `AccountEvent` `locked_out`.
  A new password from a reset link now ends the lockout (`sign_in_trouble.clear_lock`).
- **The list** (`services/sign_in_trouble.py`, `GET /api/accounts/sign-in-trouble/`, managers and the owner): active
  staff locked out now, locked out today, or with no password, each with a plain sentence of what happened and when
  (the lockouts, a link made or emailed, a new password, Unlock, signed in again). `locked_out_today` is on the Users
  stats strip.
- **Help:** `POST .../<id>/unlock/` (the owner and the Admin level; clears the username, the email and the address of
  the last lockout; logs `unlocked`); `.../<id>/email-link/` (managers; a one-hour emailed reset link, logs
  `reset_emailed`); `.../<id>/link/` (a 48-hour set-password link plus the person's phone, for Text it / Copy / QR; a
  manager gets it only for an Employee, never for a manager or the owner).
- **Screens:** Users → Employees: the LOCKED OUT number on the strip and the Cannot sign in toggle
  (`?show=cannot-sign-in`), the Access cell says Locked out. Managers: a one-line Sign-in bar on HR → Requests with Help.
- `GET /api/accounts/users/?staff=1` returns Admin, Manager and Employee logins only; the Employees list and the staff
  pickers (Time & payroll, Drawers, Transactions, delivery drivers) use it, since a page of 200 of every login by last
  name was filled by customers.
