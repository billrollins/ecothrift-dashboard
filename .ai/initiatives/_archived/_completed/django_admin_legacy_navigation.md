<!-- Archived 2026-03-30: disposition=completed (Django admin at /db-admin/; React /admin/*; shipped) -->
<!-- initiative: slug=django-admin-legacy-navigation status=completed updated=2026-03-30 -->
<!-- Last updated: 2026-03-30T15:00:00-05:00 -->
# Initiative: Legacy Django Admin — navigation and hard refresh

**Status: Completed** — Shipped 2026-03-30. See **`CHANGELOG.md`** `[Unreleased]` (routing / Django admin vs React).

## Shipped implementation (2026-03-30)

- **Cause:** URL prefix collision — React routes at `/admin/*` shared the same prefix as `path('admin/', admin.site.urls)`.
- **Change:** Django admin moved to **`/db-admin/`** in [`ecothrift/urls.py`](../../../../ecothrift/urls.py); production SPA fallback excludes **`db-admin/`** only (no longer **`admin/`**). Vite proxies **`/db-admin`** to Django, not **`/admin`**. Optional redirect: exact **`/admin`** / **`/admin/`** → **`/db-admin/`** for old bookmarks to Django’s root.
- **React routes** unchanged (`/admin/settings`, etc.).

## Problem

On some pages, **hard refresh** (**F5** or **Ctrl+R**) sent the user to **Django Admin** instead of the React dashboard when URLs used the **`/admin/`** prefix.

## Goals (met)

1. Documented collision; **`/db-admin/`** for `contrib.admin`, **`/admin/*`** for React.
2. Explained refresh behavior (server routing before SPA).
3. Fix implemented in URLconf, SPA fallback, and Vite proxy.

## Out of scope (follow-up)

- Removing Django Admin globally or migrating all model admin to React — separate product decision.

## Research checklist

- [x] Root URLconf: collision at `admin/` between SPA and `contrib.admin` (fixed by `db-admin/`).
- [x] Per-app `admin.py` — unchanged; entry URL is now `/db-admin/`.
- [x] Repro: production `/admin/login/?next=/admin/settings` — Django handled `/admin/*` first.
- [x] Vite: `/admin` proxy removed; `/db-admin` proxied for local Django admin access.

## Acceptance

- [x] **Fix:** Separate prefixes — React `/admin/*`, Django `/db-admin/*`.
- [x] **Manual verification** — confirm on production as needed (refresh `/admin/settings`, open `/db-admin/` for superusers).

## Related

- [`.ai/extended/frontend.md`](../../../extended/frontend.md) — proxy and `/admin` vs `/db-admin`.
- [`.ai/extended/development.md`](../../../extended/development.md) — Django admin URL for POS setup.
- [`.ai/extended/auth-and-roles.md`](../../../extended/auth-and-roles.md) — `/admin/*` vs React admin routes.
- [`.ai/initiatives/_index.md`](../../_index.md)
