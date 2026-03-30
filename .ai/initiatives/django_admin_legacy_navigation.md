<!-- initiative: slug=django-admin-legacy-navigation status=active updated=2026-03-30 -->
<!-- Last updated: 2026-03-30T14:30:00-05:00 -->
# Initiative: Legacy Django Admin — navigation and hard refresh

**Status: Active** — **fix shipped 2026-03-30** (see below). Archive when you confirm production verification.

## Shipped implementation (2026-03-30)

- **Cause:** URL prefix collision — React routes at `/admin/*` shared the same prefix as `path('admin/', admin.site.urls)`.
- **Change:** Django admin moved to **`/db-admin/`** in [`ecothrift/urls.py`](../../ecothrift/urls.py); production SPA fallback excludes **`db-admin/`** only (no longer **`admin/`**). Vite proxies **`/db-admin`** to Django, not **`/admin`**. Optional redirect: exact **`/admin`** / **`/admin/`** → **`/db-admin/`** for old bookmarks to Django’s root.
- **React routes** unchanged (`/admin/settings`, etc.).

## Problem

On some pages, **hard refresh** (**F5** or **Ctrl+R**) sends the user to an **unexpected legacy Django Admin** experience (not the React dashboard). The desired end state is that **normal app use never lands staff on that surface by accident** — especially not on refresh.

## Goals

1. **Document** which URLs still serve **Django’s `contrib.admin`**, **custom admin-adjacent routes**, and how the **Vite dev proxy** / production routing forwards `/admin` and related paths.
2. **Explain** why refresh triggers the behavior (e.g. `window.location` vs SPA history, `next=` / login redirects, session, missing client route fallback to server root, etc.) — **hypotheses to verify in code and in the browser**.
3. **Produce a short fix plan** (separate from this file once research is done): routing rules, redirects, deprecating or hiding legacy admin for non-superuser workflows, or **replacing** remaining tasks with React **Settings / admin** screens — aligned with product intent.

## Out of scope (follow-up)

- Removing Django Admin globally or migrating all model admin to React — separate product decision.

## Research checklist

- [x] Root URLconf: collision at `admin/` between SPA and `contrib.admin` (fixed by `db-admin/`).
- [x] Per-app `admin.py` — unchanged; entry URL is now `/db-admin/`.
- [x] Repro: production ` /admin/login/?next=/admin/settings` — Django handled `/admin/*` first.
- [x] Vite: `/admin` proxy removed; `/db-admin` proxied for local Django admin access.

## Acceptance (research — done)

- **Verified:** Full load to `/admin/settings` hit Django admin login; `next` pointed at React path.
- **Fix:** Separate prefixes — React `/admin/*`, Django `/db-admin/*`.

## Acceptance (implementation)

- [ ] **Manual:** Refresh `/admin/settings` on production → React app (after session login), not Django admin login.
- [ ] **Manual:** Open `/db-admin/` → Django admin login for superusers.

## Related

- [`.ai/extended/frontend.md`](../extended/frontend.md) — proxy and `/admin`.
- [`.ai/extended/development.md`](../extended/development.md) — Django admin mentions for POS setup.
- [`.ai/extended/auth-and-roles.md`](../extended/auth-and-roles.md) — `/admin/*` vs React admin routes.
- [`.ai/initiatives/_index.md`](./_index.md)
