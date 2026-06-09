<!-- initiative: slug=blog-studio status=completed updated=2026-06-06 -->
<!-- Archived 2026-06-06: disposition=completed (Blog Studio + DB-backed public blog shipped v2.27.0–v2.27.2) -->
<!-- Last updated: 2026-06-06 (archived → _completed/) -->

# Initiative: Blog Studio (luxury authoring + database-backed public blog)

**Status:** **Completed** (2026-06-06) — shipped **v2.27.0**–**v2.27.2**. See [`CHANGELOG`](../../../../CHANGELOG.md) `[2.27.0]`–`[2.27.2]`. One-time prod ops: `python manage.py seed_initial_blog_posts` (idempotent; noted in `[2.27.0]` Deploy).

Give the owner a private, premium place to write the Eco-Thrift blog from the staff dashboard
(`dash.ecothrift.us`), and make the public blog on `ecothrift.us` **database-backed** so posts can be
drafted, scheduled, and published without a code change.

- **Access (owner-confirmed):** Super Admin only — Django `is_superuser`, not merely the dashboard `Admin` role.
- **Design source of truth:** [`blog-studio-5-minimal.html`](../../../reference/blog-studio-5-minimal.html) for the three-pane studio layout, plus [`blog-studio-typography-explorations.html`](../../../reference/blog-studio-typography-explorations.html) option **05 Bold Modern** for blog/studio article typography (DM Serif Display + DM Sans, sage accents).
- **Plan of record:** the approved session plan (mirrored here).

---

## Current state (grounding facts)

| Area | Today | Implication |
|------|-------|-------------|
| Public blog | Static `POSTS` array in [`frontend-public/src/data/content.ts`](../../../../frontend-public/src/data/content.ts); rendered by `BlogPage`/`BlogPostPage`/`PostCard`/`HomePage`. | Replace static reads with a DB-backed API. |
| Sitemap | Hardcoded `_SITEMAP_BLOG_SLUGS` in [`apps/core/views.py`](../../../../apps/core/views.py). | Query live `BlogPost` slugs instead. |
| Roles | Groups Admin/Manager/Employee/Consignee; `is_superuser` not exposed on `GET /api/auth/me/`. | Add `IsSuperAdmin` + expose `is_superuser` end-to-end. |
| Editor | No rich-text editor in the staff app. | TipTap is net-new; code-split so the ~1.7MB staff bundle is unaffected. |
| Images | `core.S3File` + per-listing image proxy in `apps.webstore`. | Mirror the proxy pattern for blog hero + inline images. |

---

## Scope / phases

1. **Backend foundation** — new `apps.blog` at `/api/blog/`: `BlogSeries`, `BlogPost` (+ `live()` manager), `BlogPostRevision`, `BlogImage`; `IsSuperAdmin`; public + staff serializers; viewsets; image proxy + upload; server-side HTML sanitization (`bleach`); migrations; expose `is_superuser` on `me`. Seed command for the three existing posts under an `Early days` series (uploads existing hero art to S3). Tests: superuser gate, `live()` filtering, slug lock, sanitization.
2. **Public blog conversion** — `frontend-public` fetches from the API; render sanitized `body_html`; extend `.abody` article CSS; sitemap uses `BlogPost.objects.live()`; legacy Shopify blog handle redirects.
3. **Blog Studio (dashboard)** — standalone full-screen `/blog-studio` route outside `MainLayout`, opened in a new window from a superuser-only item at the bottom of the Admin workspace; three-pane studio matching the mockup; TipTap editor + autosave; series create/continue; schedule/publish/archive; in-studio preview.
4. **Verification + release** — migrations + checks, both frontend builds, seed locally, update docs + `CHANGELOG`.

---

## Acceptance

- Only Django superusers can see or call Blog Studio staff APIs (Admin non-superuser → 403).
- The `Blog studio` nav entry shows only for superusers (bottom of Admin) and opens full-screen in a new window matching the mockup.
- Owner can create a series, write in a WYSIWYG editor, upload hero art, preview, save draft, schedule, publish, and archive.
- Scheduled posts go live automatically after their time (request-time `live()` filter; no worker).
- The existing three posts stay live at their current URLs (`/blog/navigating-growth`, `/blog/turns-two`, `/blog/our-vision`).
- Public blog list, post pages, Home "Notes from Bill," SEO/JSON-LD, and sitemap all read DB-backed posts.

---

## Sessions

### Session 1 — 2026-05-30 (build)

- **Goal:** implement the full plan: `apps.blog` backend, DB-backed public blog, and the Super Admin Blog Studio page.
- **Scope:** all four phases above.
- **Status:** **built + verified locally.** Seeding deferred to deploy (see below).
- **Delivered:**
  - **Backend** (`apps.blog`): `BlogSeries`/`BlogPost`(+`live()`)/`BlogPostRevision`/`BlogImage`, `IsSuperAdmin`, split public/staff serializers, viewsets (CRUD + `publish-now`/`schedule`/`archive`/`duplicate`/`restore-revision`), public read endpoints, image proxy + Super Admin upload, `bleach` sanitization, migration `0001_initial`, `seed_initial_blog_posts`. `is_superuser` exposed on `GET /api/auth/me/`. **14 tests pass.**
  - **Public blog:** `frontend-public` reads the API (`fetchBlogPosts`/`fetchBlogPost`/`fetchBlogSeries`), renders sanitized `body_html`, extended `.abody` CSS; sitemap uses `BlogPost.objects.live()`; legacy Shopify blog handle → slug redirects in `apps/core/middleware.py`.
  - **Studio:** standalone `/blog-studio` route outside `MainLayout` (`ProtectedRoute` + `SuperAdminRoute`), lazy-loaded (**emits its own ~349 kB chunk — TipTap stays out of the main bundle**). Superuser-only `blogStudio` nav item at the bottom of the Admin group, `openInNewWindow`. Three-pane studio (`BlogStudioPage.tsx` + `StudioEditor.tsx` + `blogStudio.css`) faithful to the mockup: TipTap WYSIWYG + toolbar, debounced autosave (slug tracks title until first publish), hero/inline image upload, series create/continue, native date+time scheduling, social/SEO preview, publish/schedule/save/duplicate/archive.
- **Verification:** `makemigrations --check` clean; `migrate`/`check` OK; `apps.blog` tests green; staff `frontend` and `frontend-public` production builds both succeed.
- **Deferred — seeding:** `seed_initial_blog_posts` was **not run** from this session because local `USE_S3=True` (writes hero art to the shared S3 bucket; DB target also env-dependent). **Run once on prod after deploy:** `python manage.py seed_initial_blog_posts` (idempotent — skips existing slugs). Hero files confirmed present in `frontend-public/public/blog/`.

### Session 2 — 2026-06-01 (editor tools + typography)

- **Goal:** finish Blog Editor Tools Upgrade Phases 4/5 and lock the selected typography system before push.
- **Status:** **ready for v2.27.0 push.**
- **Delivered:**
  - **Authoring polish:** reader preview toggle, cleaned rich paste handling, character count + selection word count, and shortcut-hints popover.
  - **Magazine blocks:** callouts, tables, code/pull-quote/drop-cap/columns styling, safe no-iframe link cards with removable selected-card controls, and portal-safe color/highlight swatches.
  - **Rendering safety:** sanitizer allow-list and tests expanded for callouts, tables, and link cards; iframe/script remain stripped.
  - **Typography:** selected **05 Bold Modern** from the exploration file and applied it to Blog Studio plus public blog list/article rendering, so existing published posts update through CSS.
- **Verification:** `python manage.py test apps.blog` → **22 tests OK**; staff `frontend` and `frontend-public` production builds both succeed.

### Session 3 — 2026-06-01 (series rename + studio chrome)

- **Goal:** let owners rename an existing series without Django admin; align Blog Studio shell accents with Bold Modern sage.
- **Delivered:** inline series rename field beside the Publish-panel Series dropdown (`PATCH /api/blog/series/<id>/`, blur/Enter save); `updateBlogSeries` + `useUpdateBlogSeries`; studio chrome uses `--blog-accent` for links, buttons, kickers, and focus states.
- **Shipped:** **v2.27.1**.

### Session 4 — 2026-06-01 (blog copy + draft slug preview)

- **Goal:** tighten the public blog landing copy and stop new drafts from showing `/blog/untitled-post` after the title changes.
- **Delivered:** `/blog` hero copy changed to **Founder Notes / The Eco-Thrift Journal** with a transparency-focused description; Blog Studio draft/scheduled URL preview now derives from the current title until publish, and autosave continues clearing unpublished slugs so the backend regenerates them from title.
- **Shipped:** **v2.27.2**.

---

## See also

- Plan / mockup: [`.ai/reference/blog-studio-5-minimal.html`](../../../reference/blog-studio-5-minimal.html)
- Reuse patterns: [`apps/webstore/`](../../../../apps/webstore/) (image proxy, split serializers), [`apps/accounts/permissions.py`](../../../../apps/accounts/permissions.py)
- Public site: [`frontend-public/`](../../../../frontend-public/), sitemap [`apps/core/views.py`](../../../../apps/core/views.py), middleware [`apps/core/middleware.py`](../../../../apps/core/middleware.py)
