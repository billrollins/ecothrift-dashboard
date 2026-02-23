<!-- Last updated: 2026-02-21T18:00:00-06:00 -->
# Architecture

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Django + Django REST Framework | 5.2 / 3.16 |
| Auth | SimpleJWT (httpOnly cookie refresh) | 5.4 |
| Database | PostgreSQL | 15+ |
| Frontend | React + TypeScript | 18.3 / 5.9 |
| UI | MUI (Material UI) v7 | 7.x |
| Tables | MUI X DataGrid | 8.x |
| Server State | TanStack React Query | 5.x |
| Forms | React Hook Form | 7.x |
| Routing | React Router | 7.x |
| Charts | Recharts | 3.x |
| Notifications | Notistack | 3.x |
| HTTP | Axios | 1.x |
| Bundler | Vite | 7.x |
| WSGI | Gunicorn | 23.x |
| Static Files | WhiteNoise | 6.x |
| File Storage | AWS S3 via django-storages | 1.14 |
| Deployment | Heroku | — |

## Project Layout

```
ecothrift-dashboard/
├── ecothrift/              # Django project config
│   ├── settings.py         # Base settings
│   ├── settings_production.py
│   ├── urls.py             # Root URL router
│   └── wsgi.py
├── apps/
│   ├── accounts/           # Users, profiles, auth, permissions
│   ├── ai/                  # Claude API proxy (chat, models)
│   ├── core/               # Locations, settings, files, print server
│   ├── hr/                 # Time clock, departments, sick leave
│   ├── inventory/          # Vendors, POs, products, items, processing
│   ├── pos/                # Registers, drawers, carts, receipts, cash
│   └── consignment/        # Agreements, consignment items, payouts
├── frontend/
│   ├── src/
│   │   ├── api/            # Axios service functions (one per backend app)
│   │   ├── components/     # Layout, common, feedback, forms
│   │   ├── contexts/       # AuthContext (JWT in-memory)
│   │   ├── hooks/          # React Query hooks (one per domain)
│   │   ├── pages/          # Route-level page components
│   │   ├── services/       # Local print server client
│   │   ├── theme/          # MUI theme config
│   │   ├── types/          # TypeScript interfaces (one per backend app)
│   │   ├── utils/          # Shared utilities (formatting, helpers)
│   │   ├── assets/         # Logo images
│   │   ├── App.tsx         # Router + route guards
│   │   └── main.tsx        # Entry point + providers
│   ├── vite.config.ts
│   └── package.json
├── docs/                   # This documentation
├── workspace/              # Personal scripts, notebooks, notes (gitignored)
├── manage.py
├── requirements.txt
├── Procfile                # Heroku process types
├── .env                    # Local env vars (gitignored)
└── .gitignore
```

## Authentication Flow

1. **Login** — `POST /api/auth/login/` returns `{ access, user }`. The refresh token is set as an **httpOnly cookie** (path `/api/auth/`, 7-day expiry).
2. **Access token** — Stored in memory (module variable in `client.ts`). Sent as `Authorization: Bearer <token>` on every API request.
3. **Silent refresh** — On page load, `AuthContext` calls `POST /api/auth/refresh/` with `credentials: include`. The cookie carries the refresh token. If valid, a new access token is returned.
4. **401 interceptor** — If any API call returns 401, the Axios interceptor attempts a refresh. Concurrent requests are queued. On failure, user is redirected to `/login`.
5. **Logout** — `POST /api/auth/logout/` blacklists the refresh token and clears the cookie.

## Role-Based Access

Four Django Groups define roles. A user can belong to **multiple groups** simultaneously (multi-role support). The `role` property returns the highest-priority group; the `roles` property returns all groups.

| Role | Access |
|------|--------|
| **Admin** | Everything. User management, settings, permissions. |
| **Manager** | All staff features + consignment management, cash management, approvals. Cannot manage users/settings. |
| **Employee** | Time clock, inventory, POS terminal, view-only on most lists. |
| **Consignee** | Consignee portal only (`/consignee/*`). Sees own items, payouts, summary. |

**Backend:** Permission classes in `apps/accounts/permissions.py` — `IsAdmin`, `IsManager`, `IsManagerOrAdmin`, `IsEmployee`, `IsConsignee`, `IsStaff`.

**Frontend:** `useAuth().hasRole()` uses a hierarchy (Admin > Manager > Employee > Consignee). Route guards: `ProtectedRoute`, `StaffRoute`, `ManagerRoute`, `AdminRoute` in `App.tsx`.

## Data Flow Pattern

```
Frontend Page
  └─ React Query hook (useXxx)
       └─ API service function (xxx.api.ts)
            └─ Axios client (client.ts) with Bearer token
                 └─ Vite proxy → Django REST Framework ViewSet
                      └─ Serializer ↔ Model ↔ PostgreSQL
```

## Key Design Decisions

- **Email-only auth** — No username field. `User.USERNAME_FIELD = 'email'`.
- **Pagination** — DRF `ConfigurablePageSizePagination` (default 50, client can override via `page_size` param). All list endpoints return `{ count, next, previous, results }`.
- **Soft deletes** — Vendors and Users use `is_active` flag; Consignee accounts use `status='closed'`.
- **SKU generation** — Auto-generated on Item creation (`ET-XXXXXX` format).
- **Timezone** — All timestamps are `America/Chicago`. Set in Django `TIME_ZONE`.
- **Print server** — Separate FastAPI app at `localhost:8888`. Frontend communicates directly via `localPrintService.ts`.
- **Cash denomination tracking** — Drawers, drops, handoffs, and supplemental all use JSON fields for bill/coin breakdowns.
