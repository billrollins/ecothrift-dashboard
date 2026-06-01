<!-- Line 1 release: ## [2.27.0] — 2026-06-01 (Blog Studio) -->
<!-- Last reviewed: 2026-06-01 (review.0.Bump — Blog Studio push prep) -->
# Changelog

All notable changes to this project are documented here at the **version level**.
Commit-level detail belongs in commit messages, not here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.27.0] — 2026-06-01

User-facing theme: **Blog Studio** — a Super Admin-only writing room in the staff dashboard, plus a database-backed public blog so posts can be drafted, scheduled, and published without a code change. Begins initiative [`blog_studio.md`](.ai/initiatives/blog_studio.md).

### Added

- **Backend / blog** — new app **`apps.blog`** (`/api/blog/`): models `BlogSeries`, `BlogPost`, `BlogPostRevision`, and `BlogImage` (backed by `core.S3File`). A single **`BlogPost.objects.live()`** manager (published, or scheduled with a past time) is the one visibility source shared by the public list, detail, Home, and sitemap, so **scheduling works at request time with no worker/cron**. Slugs auto-generate from the title and **lock once a post is first published** (protects live URLs). `body_html` is **sanitized server-side at save time with `bleach`** (explicit tag/attribute allow-list) before it is ever rendered with `dangerouslySetInnerHTML`; TipTap `body_json` stays the editable source of truth and `body_text` is derived for word/read counts. Public `AllowAny` read endpoints (live list, detail-by-slug, active series) + a host-agnostic **image proxy** (`images/<id>/`, keeps S3 private). Each staff save snapshots a **revision**.
- **Backend / auth** — new permission **`IsSuperAdmin`** (Django `is_superuser`) and `is_superuser` now exposed (read-only) on `GET /api/auth/me/`, gating owner-only tooling.
- **Backend / seeding** — `python manage.py seed_initial_blog_posts` (idempotent) imports the three founder posts (`navigating-growth`, `turns-two`, `our-vision`) under an **Early days** series, uploading their hero art to storage.
- **Frontend / staff** — **Blog Studio** at a standalone full-screen route **`/blog-studio`** (outside `MainLayout`; `ProtectedRoute` + new `SuperAdminRoute`), **lazy-loaded so the net-new TipTap editor ships as its own chunk and never enters the main staff bundle**. A superuser-only **`Blog studio`** item sits at the bottom of the Admin workspace and **opens in a new window** (`openInNewWindow`; `superuserOnly` nav filtering). The three-pane studio (Library · writing desk · Publish cabinet) follows the refined Blog Studio layout with the **Bold Modern** typography group (DM Serif Display + DM Sans): WYSIWYG TipTap editor with formatting toolbar + inline image upload, debounced **autosave** (slug tracks the title until first publish), hero image replace, excerpt, series **create/continue**, native date+time **scheduling**, social/SEO preview, and **publish / schedule / save draft / duplicate / archive** actions.
- **Frontend / staff authoring tools** — Blog Studio now has reader preview, rich paste cleanup, selection-aware word/character counts, shortcut hints, callouts, tables, safe no-iframe link cards with removable selected-card controls, image alignment/size controls, code/pull-quote/drop-cap/columns blocks, and portal-safe color/highlight swatches.
- **Frontend / public blog** — the blog is now **database-backed**: `frontend-public` fetches via `fetchBlogPosts` / `fetchBlogPost` / `fetchBlogSeries`; `BlogPage`, `BlogPostPage`, `HomePage` ("Notes from Bill"), and `PostCard` read the API with loading/empty states. Post bodies render the sanitized `body_html` with extended `.abody` article CSS (h2/h3, blockquote, lists, links, images), and SEO/JSON-LD use API data.

### Changed

- **Backend / sitemap** — `/sitemap.xml` blog URLs are now generated from `BlogPost.objects.live()` (the hardcoded `_SITEMAP_BLOG_SLUGS` list is gone).
- **Backend / redirects** — `apps.core.middleware.rewrite_legacy_path` maps the known legacy Shopify blog article handles (e.g. `…/what-we-have-accomplished-so-far` → `/blog/navigating-growth`) to their new slugs instead of the generic `/blog` list.
- **Frontend / public** — static `BlogPost`/`POSTS` content removed from `frontend-public/src/data/content.ts` (now DB-backed).
- **Frontend / blog typography** — public blog list/article rendering and Blog Studio preview/editor styling now use the **Bold Modern** group (DM Serif Display + DM Sans, sage accent/drop cap, soft green highlight wash), updating old published blog posts through CSS without rewriting their stored HTML.
- **Dependencies** — added `bleach` (Python, server-side HTML sanitization) and TipTap packages to the staff app (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `extension-link`, `extension-image`, `extension-placeholder`, `extension-underline`, `extension-table`, `extension-table-row`, `extension-table-header`, `extension-table-cell`).

### Fixed

- **Frontend / Blog Studio** — color/highlight picker chips now render inside MUI popovers (portal-safe swatches), and selected link cards no longer navigate in edit mode before the owner can remove them.

### Deploy

- After deploy, run **`python manage.py seed_initial_blog_posts` once on production** to import the three existing posts (idempotent; skips slugs that already exist). Until then the public blog will be empty.

### Documentation

- **`public_website`** initiative parked in [`.ai/initiatives/_archived/_pending/public_website.md`](.ai/initiatives/_archived/_pending/public_website.md) (Session 7 closed; no active initiative on index). Resume notes: deploy, prod `seed_shop_categories`, Helcim + email.

---

## [2.26.0] — 2026-05-30

User-facing theme: **Public website — Phases 0–4** (hostname split + marketing site + curated catalog + in-store-pickup checkout + launch hardening). The public domains (`ecothrift.us`, `www.ecothrift.us`) now serve the new public Eco-Thrift storefront — marketing pages, a live hand-curated **Shop** (browse, product detail, cart), and **online checkout** (in-store pickup at Canfield) with staff order management — instead of the staff dashboard login; the staff dashboard stays on `dash.ecothrift.us`. Launch hardening includes SEO metadata, a sitemap, redirects from old Shopify URLs, and code-split loading. (Card charging is stubbed pending a payment processor; orders are placed end-to-end and payment is arranged by staff.)

### Added

- **Backend / public site** — `apps.core.middleware.PublicSiteMiddleware` host-based routing: serves the public site on the public hosts (the built public SPA when present, else a Django-rendered holding page at `apps/core/templates/public/holding.html`), enforces a canonical host with a **301 redirect** (`www` → apex), and passes `/api/`, `/static/`, `/assets/`, `/media/`, `/db-admin/` through untouched. New settings **`PUBLIC_SITE_HOSTS`** / **`PUBLIC_SITE_CANONICAL_HOST`** (production defaults to apex + www; empty in local dev so the dashboard is unaffected). Begins initiative [`public_website.md`](.ai/initiatives/public_website.md).
- **Frontend / public site** — new **`frontend-public/`** Vite + React + TypeScript app (separate build from the staff dashboard, so shoppers never download the staff bundle). Marketing pages built from real store copy: **Home, Blog list + post**, **Visit, Sell**, and a branded **404**, with the storefront design system (Spectral/Manrope, brand greens), shared header/category-subnav/footer, and per-page titles + meta description for SEO. Built assets are served at `/static/site/*`; the SPA `index.html` is served on the public hosts via `PublicSiteMiddleware`.
- **Backend / web catalog** — new app **`apps.webstore`** (`/api/webstore/`): models `WebListing` + `WebListingImage` for a hand-curated catalog (optional links to `inventory.Category` / `inventory.Item`; condition, price, compare-at, stock, draft/published/archived, featured). Public `AllowAny` API — catalog list (category/search/sort/featured/on-sale/available filters), detail-by-slug, category counts — plus an **image proxy** (`images/<id>/`) that keeps S3 private (302 → short-lived presigned URL, streams in local dev). Staff `IsStaff` CRUD via `WebListingViewSet` with multipart photo upload / reorder / delete.
- **Frontend / staff** — new **Web store** admin area (Admin workspace, `storefront` icon, `/admin/web-store`, Manager/Admin): DataGrid list + create/edit dialog (category, condition, price/compare-at, stock, status, featured, SKU, description) with inline photo upload and delete.
- **Frontend / public shop** — the Shop is now a live catalog: category sidebar with counts, sort + search, sale/sold-out badges, product **detail** pages (`/shop/:slug`) with image gallery and quantity, and a persistent **client-side cart** (drawer + header button, `localStorage`).
- **Backend / orders + checkout** — `apps.webstore` gains `Order` + `OrderLine` (auto `ETW#####` numbers; statuses pending/paid/fulfilled/cancelled; payment provider/status/reference; pickup/ship + address; money snapshot). Public `AllowAny` **`POST checkout/`** validates the cart, **atomically reserves stock** (409 on oversell), computes flat-rate shipping + Nebraska sales tax, creates the order, and runs a **provider-agnostic payment layer** (`payments.py`) — a `manual` stub records the order awaiting payment now, with a `Helcim` provider ready to wire by config (no Stripe). **`GET order-status/<number>/`** for public lookup. Best-effort **order-confirmation email** (console backend by default). Staff `IsStaff` `OrderViewSet` (list/retrieve, editable payment status/reference + staff note) with a `set-status` action that **restocks** on cancel. New settings `WEBSTORE_PAYMENT_PROVIDER`, `WEBSTORE_SALES_TAX_RATE`, `WEBSTORE_SHIP_FLAT`, `WEBSTORE_ORDER_NOTIFY_EMAIL`, `EMAIL_BACKEND`, `DEFAULT_FROM_EMAIL`.
- **Frontend / public checkout** — new **`/checkout`** (contact, in-store pickup summary, order summary) and **`/order/:number`** confirmation (status, totals, fulfillment, emailed-to). The cart drawer's primary action is now **Checkout** (replacing reserve-by-email).
- **Frontend / staff** — new **Web orders** admin area (Admin workspace, `receiptLong` icon, `/admin/web-orders`, Manager/Admin): DataGrid (order/date/customer/status/payment/fulfillment/total with filters + search) and a detail dialog with line items, totals, customer/shipping info, status action buttons (mark paid / fulfilled / cancel), and editable payment status/reference + internal staff note.
- **Public site / SEO + launch hardening** — per-route metadata via a new `useSeo` hook (title, description, **canonical** URL, **Open Graph** + **Twitter** cards, `robots`) with **JSON-LD** structured data (Store/LocalBusiness on Home + Visit, Product on listing pages); **`/sitemap.xml`** (marketing pages + blog posts + every published listing) and **`/robots.txt`** served on the public host; **301 redirects from old Shopify URLs** (`/products`, `/collections`, `/blogs`, `/pages/*`, `/cart`, `/account`) merged with the canonical-host redirect so legacy links resolve in one hop; an SVG **favicon** + `theme-color`; and **route code-splitting** (smaller initial download). Checkout, order, and 404 pages are `noindex`. Optional privacy-friendly **Plausible analytics**, off unless `VITE_PLAUSIBLE_DOMAIN` is set at build.

### Changed

- **Build / deploy** — root `heroku-postbuild` now also installs and builds `frontend-public/` (`STATICFILES_DIRS` collects it under `STATIC_ROOT/site`); `.gitignore` ignores `frontend-public/{node_modules,dist,.vite}`.
- **Public site / store facts** — retail location updated to **Eco-Thrift — Canfield** (8425 W Center Rd, Omaha NE 68124; Mon–Sat 9–6, closed Sun; (402) 881-9861); removed the closed **8072 H St** warehouse block from Visit + holding page.
- **Public site / shop categories** — storefront taxonomy aligned to **`TAXONOMY_V1_CATEGORY_NAMES`** (19 categories); `apps/webstore/shop_categories.py` + `manage.py seed_shop_categories`; legacy Shopify `/collections/*` 301s map to taxonomy slugs.
- **Public site / checkout UX** — pickup-only on the storefront (removed ship option and nationwide-shipping copy); **Sell** page is a “coming this summer” placeholder; prominent sticky **under construction** banner; high-res header/footer logos; embedded **Google Maps** on Visit; three founder blog posts with photos; dev **`start_servers.bat`** also runs public Vite on **:5174**.
- **Public site / pre-deploy polish** — removed global category **subnav** (shop categories only on `/shop` sidebar — fixes horizontal scroll); removed outdated **daily markdown / 5%** pricing copy sitewide; **Get directions** uses the Google **place pin** (`retailMapsDirectionsUrl`, not street-address search); Visit address block uses stacked labels; dropped “Near S 84th…” line; holding page aligned (see [`public_website.md`](.ai/initiatives/public_website.md) Session 7).

### Documentation

- Initiative **[`public_website.md`](.ai/initiatives/public_website.md)** (Phases 0–4 code-complete); steering in **`.ai/context.md`**, **`.ai/extended/frontend.md`**.

---

## [2.25.0] — 2026-05-30

User-facing theme: **Staff nav workspace sidebar** — lifecycle workspaces replace the accordion nav; shared links stay in the workspace you clicked from; unused staff pages trimmed.

### Added

- **Frontend / staff nav** — **Slot C workspace sidebar** (252px): pinned Essentials (Dashboard, Employees) + lifecycle workspaces **Buying → Processing → Restoration → Floor → Cashier → Admin**; **Alt+1..6** shortcuts; workspace persistence (`ecothrift.navC.workspace.v1`). Shared module: `frontend/src/navigation/`. Bake-off switcher and Classic/Composer/Slot B variants removed. See archived initiative [`staff_nav_redesign.md`](.ai/initiatives/_archived/_completed/staff_nav_redesign.md).
- **Frontend / restoration** — TARS placeholder at `/restoration/tars` (Test, Assemble, Repair, Salvage workflows coming later).

### Changed

- **Frontend / staff nav** — Sticky workspace: sidebar clicks pass `navFromSidebar` and keep `selectedWorkspaceId`; external URL entry (bookmark, refresh, address bar) resolves the **lowest lifecycle #** workspace via `resolveWorkspaceForRoute` in `slotCNavLayout.ts` (e.g. `/inventory/items` → Floor, not Cashier).
- **Frontend / staff nav** — Hidden from sidebar: HR Time Clock, Time History, Sick Leave; staff Consignment block (routes remain). Removed Inventory Admin subgroup from nav.

### Removed

- **Frontend / routes** — Deleted pages/routes: `/inventory/admin/categories`, `/inventory/legacy` (+ orders, admin redirect), `/inventory/processing-legacy`, `/inventory/products`, `/inventory/templates`, `/pricing` (public SKU lookup). **`ProcessingPage`**, **`ProcessingSettingsModal`**, legacy hub pages, product list, templates splash, public lookup page files deleted. Backend product/template/lookup APIs unchanged.

### Fixed

- **Frontend / staff nav** — Cashier → Search items no longer auto-switches workspace to Floor when both workspaces list the same catalog link.

### Documentation

- **Initiatives** — Archived **[`staff_nav_redesign.md`](.ai/initiatives/_archived/_completed/staff_nav_redesign.md)**; active **[`web_ui_cleanup.md`](.ai/initiatives/web_ui_cleanup.md)**. Steering in **`.ai/context.md`**, **`.ai/extended/frontend.md`**, **`frontend/src/navigation/README.md`**.

### Tests

- **`frontend`**: **`npm run build`**.

---

## [2.24.2] — 2026-05-19

User-facing theme: **Order hot-path fix** — opening and editing purchase orders stays fast on large POs; production no longer wedges when debounced field saves run.

### Fixed

- **Inventory / PO hot path** — `GET` retrieve, `detail-surface`, and `PATCH` use a single-row PO queryset (no multi-`Count` annotations on items). `PATCH` returns the same lean shape as detail-surface.
- **Inventory / processing stats** — New `GET …/orders/{id}/processing-stats/` runs one grouped count on items plus batch-group aggregates; removed live `processing_stats` from default retrieve.
- **Inventory / Order Detail** — Debounced PATCHes are serialized (one in-flight per tab) to avoid exhausting Gunicorn workers.
- **Buying / category stats** — Taxonomy bucket SQL uses `product.category` and `manifest_row.category` (dropped `item.category` column).

### Changed

- **Inventory** — Composite index on `Item (purchase_order, status)` for grouped status counts.
- **Frontend** — Processing and Receiving pages use detail-surface + processing-stats instead of heavy retrieve.

### Tests

- **`python -m pytest apps/inventory/tests/test_po_manifest_meta_surface.py apps/buying/tests/test_taxonomy_bucket_sql.py apps/buying/tests/test_phase5_category_need.py -q --tb=short`** — **16 passed**.
- **`frontend`**: **`npm run build`**.

---

## [2.24.1] — 2026-05-18

User-facing theme: **Processing gate hotfix** — staff can run **Orders → upload manifest → Preprocessing → Processing** while **Receiving** and **Disputes** remain independent until trained.

### Fixed

- **Inventory / Processing data build** — `build-processing-data`, chunk polling, and clear-processing-data normalize Django validation errors into structured API responses instead of leaking 500s.
- **Inventory / Processing gate** — Processing now requires finalized preprocessing only; it no longer requires `receiving_status='done'`. This keeps Receiving operationally independent for now while allowing staff to create processing data, print, check in, merge, and dispute from Processing.

### Tests

- **`python -m pytest apps/inventory/tests/test_preprocessing_redesign.py apps/inventory/tests/test_processing_validation_matrix.py apps/inventory/tests/test_receiving_api.py -q --tb=short`** — **98 passed**.
- **`frontend`**: **`npm run build`**.

---

## [2.24.0] — 2026-05-18

User-facing theme: **Inbound intake stabilization** — purchase orders can move more safely through **Orders → Preprocessing → Receiving → Processing handoff → Disputes / repair**, with schema rails, repair tooling, dashboard fallbacks, and frontend guardrails for business-hours release.

### Added

- **Inventory / intake schema wave** — Migrations **`0045_purchase_order_manifest_meta`** … **`0051_rename_inventory_d_purchas_2f1e4c_idx_inventory_d_purchas_c3911a_idx_and_more`** add purchase-order manifest metadata, preprocessing/receiving/processing/dispute status rails, timestamp rollups, **`Dispute`** persistence, and processing track compatibility. **`0047`** removes the legacy **`PreprocessingOrder`** intermediary.
- **Inventory / intake services** — Added deterministic intake repair / verification (**`repair_intake_pipeline_pos`**, **`intake_po_repair`**), intake gates, undo/reset helpers, manifest metadata/remove helpers, and dispute rollups for operational recovery.
- **Frontend / order detail** — Added the intake timeline drawer for order lifecycle visibility and undo/purge previews.

### Changed

- **Inventory / Orders dashboard** — Dashboard/list vendor filtering now falls back across **`vendor_name_cache`** and **`vendor__name`** so stale-empty cache rows still appear.
- **Inventory / Receiving and Processing** — Receiving statuses/timestamps, pallet counts, processing track fields, and legacy-processing flags are aligned for the rebuilt intake path.
- **Inventory / Preprocessing** — Preprocessing rows link directly to **`PurchaseOrder`** after **`0047`**, with final snapshot/backfill behavior documented for the rebuild wave.

### Fixed

- **Inventory / rollout repair** — Rollout PO identity mapping for ids **316–319** is canonicalized across migration expectations, repair verification, and tests: **`316=AMZ0N-OQL-CCP4`**, **`317=C5TC0-OM1-A8R3`**, **`318=TRGET-O4U-QP68`**, **`319=TRGET-O2R-1K40`**.
- **Inventory / Item Processor** — **`processing_dispute`** now commits item mutation, denorm refresh, and dispute row creation in one atomic unit so downstream failures roll back disputed item status.
- **Frontend / Orders** — Debounced order-detail PATCHes no longer silently discard pending edits when the detail cache is absent; failed PATCHes restore the pending snapshot.
- **Frontend / Receiving** — Desktop receiving renders a clear missing-order-detail fallback instead of crashing on an unsafe **`po.data!`** access.

### Operations

- **Deploy / verification** — Rehearsed **`python manage.py migrate`**, **`repair_intake_pipeline_pos --verify`**, targeted inventory pytest matrix (**121 passed**), and **`frontend npm run build`** before release.
- **Reference docs** — Intake recon SQL, order API SQL references, deep-dive reports, and Session 15 steering updates are captured under **`.ai/reference/order_processing_pipeline_rebuild/`** and **`.ai/reference/deep_dive/latest/`**.

---

## [2.23.0] — 2026-05-06

User-facing theme: **Item Processor workspace search** — substring search spans listing fields plus flattened **`identifiers`**, **`specifications`**, **`tracking`**, **`taxonomy`**, and **`search_tags`** via a persisted lowercased **`ProcessingRow.search_string`**; **`POST …/manual-review/`** mirrors edited manifest lines onto linked bookmarks so renamed titles stay findable.

### Added

- **Inventory / Item Processor** — **`ProcessingRow.search_string`** (migration **`0043_processingrow_search_string`**) rebuilt on every ORM **`save()`** (`update_fields` automatically includes **`search_string`**) plus explicit **`bulk_update`** paths; **`manage.py rebuild_processing_search_string`** (`--purchase-order-id`, `--dry-run`, `--batch-size`; excludes **`complete`**/**`cancelled`** POs by default).
- **Inventory / Item Processor (API)** — Workspace list rows expose **`searchString`** (from **`search_string`**); **`POST …/manual-review/`** updates linked **`ProcessingRow`** searchable fields after manifest saves (**`mirror_manifest_rows_into_processing_bookmarks`**).
- **Frontend / Item Processor** — **`processingWorkspaceSearchBlob`** reads API **`searchString`** (canonical blob); legacy **`buildProcessingSearchBlob`** retained for tests only — [`processingWorkspaceFilters.ts`](frontend/src/pages/inventory/processing/processingWorkspaceFilters.ts); [`inventory.types.ts`](frontend/src/types/inventory.types.ts).

### Changed

- **Inventory / Item Processor** — **`processing-workspace`** **`search`** param matches **`search_string__contains`** (tokens lowercased); pure-digit / **`rowNNN`** tokens still resolve **`row_number`** exactly — [`processing_workspace.py`](apps/inventory/services/processing_workspace.py).

### Documentation

- **`.ai/extended/development.md`** — optional periodic **`rebuild_processing_search_string`** note for bulk/SQL bypass safety net.

### Tests

- **`python manage.py test apps.inventory.tests.test_processing_validation_matrix apps.inventory.tests.test_preprocessing_redesign --noinput`** — **82 tests OK**.
- **`frontend`**: **`npx vitest run`** — **`processingWorkspaceFilters.test.ts`** (14).

### Build

- **`frontend`**: **`npm run build`**.

---

## [2.22.1] — 2026-05-02

User-facing theme: **Item Processor timeout hotfix** — row detail and purchase order loads avoid heavy manifest prefetch storms.

### Fixed

- **Inventory / Item Processor** — **`GET …/processing-row-detail/`** uses the slim **`PurchaseOrderViewSet`** queryset path by including **`processing_row_detail`** in slim actions (**no** annotate-stats + prefetch of all manifest rows on **`get_object`**).
- **Inventory** — **`GET /api/inventory/orders/{id}/`** retrieval no longer runs **`prefetch_related('manifest_rows')`** while keeping **`processing_stats`** and manifest row count annotations.
- **Frontend / Item Processor** — Removed **`onPointerEnter`** hover prefetch from **`ProcessingQueueTable`** (**no** **`processing-row-detail`** requests while moving the mouse across rows).
- **Frontend / Item Processor** — **`useProcessingRowDetail`** uses **`retry: false`** and **`refetchOnWindowFocus: false`** so failed detail loads do not loop.

### Tests

- **`python manage.py test apps.inventory.tests.test_processing_validation_matrix apps.inventory.tests.test_preprocessing_redesign --noinput`** — **79 tests OK**.

### Build

- **`frontend`**: **`npm run build`**.

---

## [2.22.0] — 2026-05-02

User-facing theme: **Item Processor row identity** — workspace selection and bulk flows use **`processing_row_id` / `processing_row_ids`** consistently; the server maps to manifest lines and items; unlinked bookmarks get a clear **`processing_data_required`** error.

### Added

- **Inventory / Item Processor** — **`processing_rows`** dispute scope and **`processing_row_ids`** (or **`ids`**) for bulk dispute; **`processing_row_id`** for print-multiple; **`processing_row_ids`** for merge and bulk disposition (**`POST …/processing-dispute/`**, **`processing-print-multiple/`**, **`processing-merge-rows/`**, **`processing-bulk-disposition/`**) — [`apps/inventory/processing_ops.py`](apps/inventory/processing_ops.py); [`apps/inventory/views.py`](apps/inventory/views.py). Legacy **`manifest_row_*`** fields remain accepted during transition; if both forms are sent they must agree or the request is rejected.
- **Inventory** — **`ProcessingDataBuild`** model and migration **`0042_processing_data_build`** for resumable chunked processing-data creation ([`apps/inventory/models.py`](apps/inventory/models.py); [`apps/inventory/migrations/0042_processing_data_build.py`](apps/inventory/migrations/0042_processing_data_build.py)).

### Changed

- **Inventory / Item Processor** — Merge mutations refresh **`ProcessingRow`** denorm only for manifest lines involved in the merge (not every row on the PO) ([`apps/inventory/processing_ops.py`](apps/inventory/processing_ops.py)).
- **Inventory / Item Processor (frontend)** — Modals and bulk bar send row-first payloads; bulk actions are disabled when selection includes rows with no linked manifest line, with on-bar copy ([`ProcessingWorkspacePage.tsx`](frontend/src/pages/inventory/processing/ProcessingWorkspacePage.tsx); [`ProcessingBulkActionBar.tsx`](frontend/src/pages/inventory/processing/ProcessingBulkActionBar.tsx); modal files under [`frontend/src/pages/inventory/processing/modals/`](frontend/src/pages/inventory/processing/modals/)). **`BulkDispositionModal`** uses **`pendingItemCount`** when **`items`** is empty on workspace list rows ([`BulkDispositionModal.tsx`](frontend/src/pages/inventory/processing/modals/BulkDispositionModal.tsx)).

### Fixed

- **Frontend** — Restored **`processingBulkDisposition`** export in [`inventory.api.ts`](frontend/src/api/inventory.api.ts) (Vite import error with **`useProcessingWorkspace.ts`**).

### Tests

- **`python manage.py test apps.inventory.tests.test_preprocessing_redesign apps.inventory.tests.test_processing_validation_matrix --noinput`** — extended row-first coverage; **77 tests OK** ([`test_processing_validation_matrix.py`](apps/inventory/tests/test_processing_validation_matrix.py)).

---

## [2.21.1] — 2026-05-02

User-facing theme: **Processing data hotfix** — large finalized POs can enter Item Processor without the heavy product-matching build path timing out on Heroku.

### Fixed

- **Inventory / Item Processor** — **`POST /api/inventory/orders/{id}/build-processing-data/`** now uses a fast minimal build from **`ProcessingRow`** bookmarks: bulk creates **`ManifestRow`** + **`Item`** rows, pre-generates SKUs, sets item search text before **`bulk_create`**, preserves the existing response shape, and defers Product matching / Product rollups / BatchGroup creation so large POs avoid router timeouts ([`apps/inventory/services/processing_finalize.py`](apps/inventory/services/processing_finalize.py); [`apps/inventory/tests/test_preprocessing_redesign.py`](apps/inventory/tests/test_preprocessing_redesign.py)).
- **Inventory / Item Processor workspace** — Removed the full-PO duplicate UPC JSON scan from **`processing-workspace`** list and mutation patch payloads; duplicate hints are intentionally blank during this hotfix so large PO pages and patches stay bounded by visible/touched rows ([`apps/inventory/services/processing_workspace.py`](apps/inventory/services/processing_workspace.py); [`apps/inventory/tests/test_processing_validation_matrix.py`](apps/inventory/tests/test_processing_validation_matrix.py)).

### Tests

- **`python manage.py test apps.inventory.tests.test_preprocessing_redesign apps.inventory.tests.test_processing_validation_matrix --noinput`** — **66 tests OK**.

---

## [Unreleased]

### Added (bake-off history)

- **Frontend / staff nav** — Multi-variant sidebar bake-off: shared `frontend/src/navigation/` module (`navItemCatalog`, hooks, registry); **Classic** (extracted baseline) and **Composer** (workflow-grouped, auto-collapse, 248px) variants; Admin-only **Nav Variant** switcher (`ecothrift.navVariant` in `localStorage`); Slot B/C placeholders for additional designs. See archived initiative [`staff_nav_redesign.md`](.ai/initiatives/_archived/_completed/staff_nav_redesign.md).
- **Frontend / staff nav (Slot B "quick-nav")** — Filter-first sidebar variant (256px): header-less pinned rows (Dashboard, Employees), **single-open accordion** (Inbound, Catalog, Point of sale, Buying) with the active route's section auto-opening (`ecothrift.navB.openSection.v1`), Administration pinned to the bottom, and a **Ctrl/Cmd+K jump-to filter** (arrow/enter/escape keyboard nav) as the fast path. Adds reusable `navResolve.ts` (`resolveNavItem`/`resolveNavGroups`) and a `slotB` `NavItemRow` style (neutral-pill active, no left rail).
- **Frontend / staff nav (Slot C "workspace")** — Workspace-first sidebar variant (252px): persistent Essentials (Dashboard, Employees), compact domain selector (Inbound, Catalog, Store, Buying, Admin), exactly one active workspace panel, manual workspace persistence (`ecothrift.navC.workspace.v1`), and **Alt+1..5** switching for visible workspaces. Adds `slotCNavLayout.ts` and a `slotC` `NavItemRow` style (compact active pill with right-side green marker).

### Changed

- **Visual authority:** **[`final_review_visual_rebuild_directive.md`](.ai/reference/final_review_visual_rebuild_directive.md)** is mockup ground truth for Pass 1; **[`fix_this.md`](.ai/reference/fix_this.md)** is the short pointer. **[`consult_design_final_review.md`](.ai/reference/consult_design_final_review.md)** and **[`final_review_ui_rebuild_plan.md`](.ai/reference/final_review_ui_rebuild_plan.md)** stay useful for behavior notes; where they **disagree on visuals**, the **directive** wins for the first pass.
- **Pass 1 (directive):** Stepper labels (**Manual Review** / **Finalize and Open Processing**), six summary stats, toolbar **Save Changes** tied to the active filter, dense table columns without horizontal scroll, bulk pricing on **filtered rows** (not a row-selection gate). **No** `@tanstack/react-virtual` in Pass 1. Count-based indicators **hidden at zero** and variance **tolerance bands** per **[`.ai/extended/ux-spec.md`](.ai/extended/ux-spec.md)**.
- **Later / Pass 2 (broader plan):** Explicit row selection for bulk, single `deriveFinalReviewIssues` source of truth, remove blur/interval auto-save in favor of **Save Changes** + `useBlocker`, keyboard cheatsheet, virtualization — see **`final_review_ui_rebuild_plan.md`** (banner: directive precedes conflicting items). Checklist and review gate (section 8 in that doc): **`final_review_visual_pass_plan.md`**.

**Out of scope for this rebuild:** Step 1 Standardize Manifest and Step 2 AI Cleanup panels unchanged; API contract, `PreprocessingRow` model, and serializers unchanged.

### Added

- **Core / LLM** — **`apps/core/services/llm_chat.py`**: single-turn **`llm_chat_completion_text`** routes to Anthropic or xAI Grok from **`AI_PROVIDER`** (`auto` / `anthropic` / `xai`) and model id (`grok*` → xAI when **`auto`**). Dependency **`openai`** ([`requirements.txt`](requirements.txt)).
- **Tests** — **`test_preprocessing_redesign`** covers dict **`ai_status`**, bad CSV cell → **`{}`**, review **`PATCH`** clears **`ai_status`**, **`GET`** includes **`ai_status`**, **`batch_flag`**-only preserve ([`apps/inventory/tests/test_preprocessing_redesign.py`](apps/inventory/tests/test_preprocessing_redesign.py)).

### Changed
- **Inventory / Preprocessing finalize** — **`ensure_manifest_products_and_items`** defers per-item **`PurchaseOrder.recompute_item_costs`** during bulk item sync (**`Item.save(..., defer_po_cost_recompute=True)`**), runs a **single** PO-wide recompute at the end, **`ManifestRow`** link fields via **`bulk_update`**, batched **`Product`** aggregate/count updates, prefetch **`batch_groups`** on finalize's batch-detection loop, and in-request Product lookup caches (UPC / vendor ref / exact match) to reduce Heroku request timeouts on large manifests ([`apps/inventory/models.py`](apps/inventory/models.py); [`apps/inventory/views.py`](apps/inventory/views.py)).
- **Inventory / Preprocessing staging** — **`PreprocessingRow`** is three-layer (**`standard_*`**, **`ai_*`**, **`final_*`**, **`ai_title`** / **`final_title`**); **`final_*`** stay **`NULL`** until finalize; re-standardize after confirm clears **`ai_*`** and resets **`final_*`** on staging; **`GET …/download-cleanup-csv/`** reads **`standard_*`** only; narrow cleanup apply writes **`ai_*`**; preprocessing review search **`OR`**s text across standard/AI/final tiers (title uses **`ai_title`** / **`final_title`**); **`ManifestRow`** drops **`ai_suggested_*`** (canonical **`title`** / **`brand`** / **`model`** after finalize). Offline Grok CSV wire remains unprefixed; Django maps import/export ([`apps/inventory/models.py`](apps/inventory/models.py); migration **`0036_preprocessing_three_layer`**; [`apps/inventory/views.py`](apps/inventory/views.py); [`apps/inventory/serializers.py`](apps/inventory/serializers.py)).
- **Inventory / Preprocessing** — **`POST /api/inventory/orders/{id}/suggest-formulas/`** uses **`llm_chat_completion_text`** instead of Anthropic-only SDK calls; missing credentials return **`LLMConfigError`** as HTTP 503 ([`apps/inventory/views.py`](apps/inventory/views.py)).
- **Settings** — **`XAI_API_KEY`** (alias **`GROK_API_KEY`**), **`XAI_API_BASE`**, **`AI_PROVIDER`**; **`_normalize_anthropic_model_id`** passes through Grok model ids ([`ecothrift/settings.py`](ecothrift/settings.py)).
- **Manifest mapping** — **`MANIFEST_SOURCE_ALIASES`** adds **`title`** and **`condition`** synonyms; vendor item column label notes cleanup CSV **`sku`** ([`apps/inventory/views.py`](apps/inventory/views.py)).
- **Tests** — **`test_default_column_mappings_maps_lean_cleanup_csv_headers`** covers **`download-cleanup-csv`** headers → standard targets ([`apps/inventory/tests/test_preprocessing_redesign.py`](apps/inventory/tests/test_preprocessing_redesign.py)).
- **Inventory / Preprocessing** — **`GET /api/inventory/orders/{id}/download-cleanup-csv/`** exports a pre-AI CSV: **`row_id`**, **`row_number`**, **`quantity`**, **`unit_retail`**, **`base_cost`** (**`PurchaseOrder.compute_item_cost`**), **`ideal_price`** (2× **`base_cost`**), then **`description`**, **`brand`**, **`model`**, **`condition`**, **`notes`**, **`identifiers_json`**, **`taxonomy_json`**, **`specifications_json`**, **`tracking_json`**, **`search_tags_json`**. Omit **`title`**, flat **`category`** / **`sku`** / **`upc`**, and staging pricing columns (use JSON cells + **`unit_retail`**). **`POST …/apply-cleanup-csv/`** / **`upload-cleanup-csv`**: **wide** staging rows accept optional **`ai_status`** JSON (stored on **`PreprocessingRow`**; migration **`0038_preprocessingrow_ai_status`**) and use **`block_on_quality=False`** so most quality checks surface in **`soft_warnings`** instead of **`400`** ([`apps/inventory/views.py`](apps/inventory/views.py); [`cleanup_csv_validate.py`](apps/inventory/cleanup_csv_validate.py)). **Narrow** seven-column apply unchanged.
- **Inventory / Preprocessing — Step 2 (client)** — Parses optional trailing **`ai_status`** on Grok **`.cleaned.csv`** (12 or **13** columns); JSON **`rows`** payloads pass object or string **`ai_status`**; after **Run Cleanup**, server **`soft_warnings`** list is visible and dismissible ([`cleanupCsv.ts`](frontend/src/components/inventory/preprocessing/cleanupCsv.ts); [`RowProcessingPanel.tsx`](frontend/src/components/inventory/RowProcessingPanel.tsx); [`PreprocessingPage.tsx`](frontend/src/pages/inventory/PreprocessingPage.tsx)).
- **Inventory / Preprocessing — apply path** — Malformed or empty per-row **`ai_status`** from CSV/JSON normalizes to **`{}`** before save ([`apps/inventory/views.py`](apps/inventory/views.py)).
- **Inventory / Preprocessing — Final Review** — **`PreprocessingReviewTable`** shows per-row **`ai_status`** state/issue chips; **`PATCH …/preprocessing-review/`** clears **`ai_status`** when staff change listing or price fields (**not** **`batch_flag`** or **`pricing_notes`** alone); client **`mergeReviewPatches`** mirrors that clear for optimistic UI ([`PreprocessingReviewTable.tsx`](frontend/src/components/inventory/PreprocessingReviewTable.tsx); [`PreprocessingPage.tsx`](frontend/src/pages/inventory/PreprocessingPage.tsx); [`apps/inventory/views.py`](apps/inventory/views.py)).
- **Inventory / routing (frontend)** — **`/inventory/processing`** → **`ProcessingEntryRedirect`**; **`/inventory/processing/:id`** → **`ProcessingWorkspacePage`**; legacy **`/inventory/processing-legacy`** → **`ProcessingPage`**. **Order detail** and **Preprocessing** handoff navigate to **`/inventory/processing/{id}`** ([`App.tsx`](frontend/src/App.tsx); [`OrderDetailPage.tsx`](frontend/src/pages/inventory/OrderDetailPage.tsx); [`PreprocessingPage.tsx`](frontend/src/pages/inventory/PreprocessingPage.tsx)).
- **Inventory / Item Processor** — **`ProcessingRow.shelf_price`** is the **workspace** single source for list + merged detail **`price`** (**`final_price`** fallback only when **`shelf_price`** is unset); **`refresh_processing_rows_denorm`** no longer copies **`Item.price`** onto **`shelf_price`** for manifest-linked bookmarks (**bookmark-only / no-Items rows** still seed from **`final_price`**/**`proposed_price`**). **`processing-print-and-check-in`**, **`processing-print-multiple`**, **`processing-bulk-disposition`**, and **`PATCH …/processing-patch/`** set **`shelf_price`** + **`final_price`** on the bookmark before **`Item.price`** ([`processing_workspace.py`](apps/inventory/services/processing_workspace.py) **`push_shelf_price_to_bookmark`**, [`processing_ops.py`](apps/inventory/processing_ops.py)). **`ProcessingActiveCard`** initializes shelf **`price`** from **`row.price`**. Migration **`0044_rename_processingrow_list_unit_price_shelf_price`** renames **`list_unit_price`** → **`shelf_price`** and updates field help text.

### Documentation

- **AI steering / audits (`review.0` / `review.1` / `review.9`)** — Realigned **`.ai/`** tree (initiative = plan; version/changelog at repo root only); **[`.ai/reference/deep_dive/latest/`](.ai/reference/deep_dive/latest/)** refreshed post-**`v2.24.1`**.
- **Docs / reference** — **[`.ai/reference/cleanup_csv_contract.md`](.ai/reference/cleanup_csv_contract.md)** summarizes **`apply-cleanup-csv`** / **`upload-cleanup-csv`**: wide vs narrow rows, optional **`ai_status`**, staging-wide **relaxed** validation (quality **`HARD_*`** folded into **`soft_warnings`**), validation **`rule`** ids, and **`rejected_rows`** / **`soft_warnings`** response shape. **Historical:** a committed Jupyter tree under **`workspace/notebooks/ai-cleanup/`** was removed from the repo (**2026-05**); use **`workspace/ai-cleanup-grok/data/upload-pipeline-handoff.md`** (gitignored unless whitelisted) plus the contract doc for CSV semantics.
- **Inventory pipeline (extended)** — [`.ai/extended/inventory-pipeline.md`](.ai/extended/inventory-pipeline.md): Item Processor workspace (**`processing-workspace`** API, **`ProcessingWorkspacePage`**, legacy grid route); optional adjunct **`workspace/ai-cleanup-grok/helpers/clean-grok.mjs`** for offline xAI cleanup (strict JSON Schema enums, **`.cleaned.csv`** + **`ai_status`**, optional **`--batch-api`**).
- **Environment template** — xAI Grok (**`XAI_API_KEY`** / **`GROK_API_KEY`**, **`AI_PROVIDER`**, **`XAI_API_BASE`**) aligned with Django settings ([`.env.example`](.env.example); [`.ai/extended/development.md`](.ai/extended/development.md)).
- **AI steering** — Preprocessing: Step 2 **`apply-cleanup-csv`** → staging **`ai_*`** / **`ai_title`** / optional **`ai_status`** (13-col client + **`soft_warnings`**); Step 3 **Final Review** — **`ai_status`** chips + clear-on-edit (`preprocessing-review`, **`finalize-preprocessing`**); Step 3 **mockup visual rebuild** (**[`fix_this.md`](.ai/reference/fix_this.md)** et al.) **pending** — **`order_processing_pipeline_rebuild`** ([`.ai/initiatives/order_processing_pipeline_rebuild.md`](.ai/initiatives/order_processing_pipeline_rebuild.md)).
- **Steering / process** — **`review.0.Bump`** (**2026-05-02** housekeeping): committed **`.ai/reference/`** Final Review pointers (**`fix_this.md`**, **`final_review_*`**, **`processing_data_lifecycle.md`**) so **`[Unreleased]`** links resolve; **`frontend/package.json`** **`0.0.0`** unchanged (**Part 2A**).
- **Steering / process** — **`review.0.Bump`** (**2026-05-01** release): semver **`v2.21.0`** (**.version** + root **`package.json`**); **`CHANGELOG [2.21.0]`** + **`extended/`** steering sync for paginated Item Processor (**no swap**).
- **Steering / protocol** — **`review.9.Deep.md`**: preprocessing-through–Final Review trace (models, views, `cleanup_csv_validate`, Grok adjunct, FE) for full audits; output under **`.ai/reference/deep_dive/latest/`** including GitHub / Heroku / prod DB gap (commit vs push vs `release:` migrate).
- **Reference** — **[`.ai/reference/fix_this.md`](.ai/reference/fix_this.md)** (pointer to Final Review visual rebuild spec); **[`.ai/reference/preprocessing_page_review.md`](.ai/reference/preprocessing_page_review.md)** (API-aligned review checklist); **`consult_design_final_review.md`** (Final Review UX spec); **[`.ai/reference/final_review_ui_rebuild_plan.md`](.ai/reference/final_review_ui_rebuild_plan.md)** (implementation plan, amended 2026-05-02); **[`.ai/reference/final_review_visual_rebuild_directive.md`](.ai/reference/final_review_visual_rebuild_directive.md)** (mockup ground truth, visual pass); **[`.ai/reference/final_review_visual_pass_plan.md`](.ai/reference/final_review_visual_pass_plan.md)** (execution plan for visual pass; includes review gate section 8).
- **Initiative** — **[`order_processing_pipeline_rebuild.md`](.ai/initiatives/order_processing_pipeline_rebuild.md)** preprocessing rollup links **`apps/inventory/cleanup_csv_validate.py`** (`validate_cleanup_row_values`, **`rule`** / **`rejected_rows`**).
- **Dev hygiene** — [`.gitignore`](.gitignore): **`frontend/.vite/`**, **`.pytest_cache/`**; **`scripts/deploy/2_push_github.bat`** uses **`git add .`** — **`.ai/reference/files.zip`**, **`Processor Mockups/`**, **`deep_dive/_runs/`** stay ignored.

---

## [2.21.0] — 2026-05-01

User-facing theme: **Item Processor workspace** stabilized with **`ProcessingRow`** bookmarks, **lazy row detail**, and **paginated workspace lists** (**25 rows** default slice).

### Added

- **Inventory / Item Processor (data model)** — **`ProcessingRow`** model and migrations **`0040_processing_row_bookmarks`** / **`0041_processing_row_canonical_denorm`** — per-PO queue bookmarks with denormalized **`queue_*`** / **`list_*`** fields, optional **`manifest_row`** / **`matched_product`** links, **`item_ids`** snapshot for lazy detail ([`apps/inventory/models.py`](apps/inventory/models.py); [`apps/inventory/migrations/0040_processing_row_bookmarks.py`](apps/inventory/migrations/0040_processing_row_bookmarks.py); [`apps/inventory/migrations/0041_processing_row_canonical_denorm.py`](apps/inventory/migrations/0041_processing_row_canonical_denorm.py)).
- **Inventory / Item Processor (API)** — **`GET /api/inventory/orders/{id}/processing-row-detail/`** — full row (**manifest**, **product**, **items**) by **`processing_row_id`** without building the entire PO-wide graph per click ([`apps/inventory/views.py`](apps/inventory/views.py); [`apps/inventory/services/processing_workspace.py`](apps/inventory/services/processing_workspace.py)).

### Changed

- **Inventory / Item Processor (workspace list)** — **`GET …/processing-workspace/`** serves a slim **`rows`** slice from **`ProcessingRow.values()`**; query params **`limit`** (default **25**), **`offset`**, **`segment`**, **`product_id`**, **`search`**, **`hide_checked_in`**; **`row_count_filtered`**, **`row_count_total_po`**, aggregated **`manifest_qty_dispositioned_total`**, **`order.total_manifest_qty`**, prefetch for active-row duplicate hint ([`processing_workspace.py`](apps/inventory/services/processing_workspace.py); [`inventory.api.ts`](frontend/src/api/inventory.api.ts)).
- **Inventory / Item Processor (frontend)** — **`ProcessingWorkspacePage`** infinite scroll / paging via **`useProcessingWorkspace`** (**`flattenRows`**, client merge of paginated **`rows`**); processing mutations consume **`workspace_patch`** for React Query merges; **`PreprocessingPage`** finalize handoff aligns with **`/inventory/processing/{id}`** ([`ProcessingWorkspacePage.tsx`](frontend/src/pages/inventory/processing/ProcessingWorkspacePage.tsx); [`useProcessingWorkspace.ts`](frontend/src/hooks/useProcessingWorkspace.ts); [`inventory.api.ts`](frontend/src/api/inventory.api.ts); [`PreprocessingPage.tsx`](frontend/src/pages/inventory/PreprocessingPage.tsx)).
- **Inventory / Item Processor (pricing UX)** — Read-only **Manifest pricing audit** accordion (**`manual-review`**) and **`ProcessingActiveCard`** manifest **unit retail** / over-MSRP warning unchanged in scope ([`ManualReviewPanel.tsx`](frontend/src/components/inventory/ManualReviewPanel.tsx); [`ProcessingWorkspacePage.tsx`](frontend/src/pages/inventory/processing/ProcessingWorkspacePage.tsx); [`ProcessingActiveCard.tsx`](frontend/src/pages/inventory/processing/ProcessingActiveCard.tsx)).

### Removed

- **Inventory / Item Processor** — **`POST …/processing-swap/`** and **`SwapModal`** UI — cut from shipping scope for stability (**`ItemSwapAudit`** remains in DB for any historical rows) ([`apps/inventory/views.py`](apps/inventory/views.py); [`apps/inventory/processing_ops.py`](apps/inventory/processing_ops.py)).

### Fixed

- **Inventory / Item Processor** — Row detail avoids per-request full-PO duplicate-UPC scan; list-row duplicate hint preserved on merge ([`processing_workspace.py`](apps/inventory/services/processing_workspace.py)).

### Tests

- **`apps/inventory/tests/test_processing_validation_matrix.py`** — **V-02**, **V-26–V-31**, **V-35**, **V-42** against workspace + ops ([`processing_workspace.py`](apps/inventory/services/processing_workspace.py); [`processing_ops.py`](apps/inventory/processing_ops.py)).

### Documentation

- **`.ai/`** — **`review.0.Bump`** sync for **`v2.21.0`**: **`CHANGELOG.md`**, **`context.md`**, **`initiatives/_index.md`**, **`order_processing_pipeline_rebuild.md`**, **`consultant_context.md`**, **`extended/frontend.md`**, **`extended/inventory-pipeline.md`**, **`extended/backend.md`** (**2026-05-01**).

---

## [2.20.0] — 2026-04-29

User-facing theme: **Inventory inbound** — purchase order dashboard + preprocessing + **Receiving** entry from sidebar and orders table (tiered **`for-receiving`** ordering).

### Added

- **Inventory / Orders** — **Create Purchase Order** dialog (**Ctrl/Cmd+N** from list or detail): dashboard vendors only, tier-one fields plus collapsible details/costs, keyboard/tab UX; successful create navigates to the new order detail ([`CreatePurchaseOrderDialog.tsx`](frontend/src/components/inventory/CreatePurchaseOrderDialog.tsx); [`OrderListPage.tsx`](frontend/src/pages/inventory/OrderListPage.tsx); [`OrderDetailPage.tsx`](frontend/src/pages/inventory/OrderDetailPage.tsx)).
- **Inventory / Orders** — **Purchase Orders dashboard** refresh: denormalized **`vendor_name_cache`**, **`vendor_code_cache`**, **`search_text`** on **`PurchaseOrder`**; **`GET /api/inventory/orders/summary/`** KPI aggregates matching list filters; redesigned **`OrderListPage`** (KPI cards, debounced search, status segments, lightweight rows, **Receive** truck to `/inventory/receiving/:id` when status eligible) ([`apps/inventory/models.py`](apps/inventory/models.py); [`apps/inventory/views.py`](apps/inventory/views.py); [`frontend/src/pages/inventory/OrderListPage.tsx`](frontend/src/pages/inventory/OrderListPage.tsx)).
- **Inventory / Orders** — Purchase order detail **Raw Manifest**: upload or replace CSV via existing `POST /api/inventory/orders/{id}/upload-manifest/`; unlocks **Preprocessing** when saved ([`OrderDetailPage.tsx`](frontend/src/pages/inventory/OrderDetailPage.tsx); [`inventory.api.ts`](frontend/src/api/inventory.api.ts)).
- **Inventory / Preprocessing** — New 3-step flow: **Standardize Manifest → AI Cleanup → Final Review** (stepper labels). Standardization always previews, creates deterministic Product links and early `Item` records; AI cleanup has preprocessing model add/verify/default controls; Final Review provides searchable staging editing, pricing summaries, and individual/bulk ideal-price adjustments before **`finalize-preprocessing`**.
- **Inventory / Receiving** — **`GET /api/inventory/orders/for-receiving/`** orders purchase orders by **expected_delivery** tiers (today/future ascending, overdue descending, null **`expected_delivery`** by **`ordered_date`** descending); tests in **`test_for_receiving_orders_by_expected_delivery_tiers`** ([`apps/inventory/views.py`](apps/inventory/views.py); [`apps/inventory/tests/test_receiving_api.py`](apps/inventory/tests/test_receiving_api.py)).

### Changed

- **Inventory / Orders** — **Order detail** redesigned as a workspace panel (2×2 **Lifecycle / Costs / Details / Manifest**), header financial strip, debounced inline **PATCH** edits, lifecycle-derived **status** when PO is ordered→delivered, **Escape** to list when no focused control, bottom bar **Preprocessing / Processing / Delete** ([`OrderDetailPage.tsx`](frontend/src/pages/inventory/OrderDetailPage.tsx); [`InlineEditableValue.tsx`](frontend/src/components/inventory/orderDetail/InlineEditableValue.tsx)). **`POST …/upload-manifest/`** stores raw file + **10-row** `manifest_preview` sample only (drops preprocessing staging side effects; **`process-manifest`** seeds staging on demand); **`POST …/remove-manifest/`** clears file + preview ([`apps/inventory/views.py`](apps/inventory/views.py)).
- **Inventory / routing** — **`/inventory/receiving`** (`ReceivingEntryRedirect`) loads the next eligible PO from **`GET /api/inventory/orders/for-receiving/`** (**`page_size=1`**) or falls back to **`/inventory/orders`**; **`/inventory/receiving/:id`** is **`ReceivingOrderPage`**; list page **`ReceivingListPage`** removed. Back controls on receiving use **`/inventory/orders`** ([`ReceivingEntryRedirect.tsx`](frontend/src/pages/inventory/ReceivingEntryRedirect.tsx); [`App.tsx`](frontend/src/App.tsx)).
- **Inventory / routing** — **Orders** sidebar link targets **`/inventory/orders`** (dashboard); legacy hub lives at **`/inventory/legacy`** with **`/inventory/legacy/orders`** for legacy workflows; **`/inventory/inbound?view=orders`** redirects to **`/inventory/orders`**; **`/inventory/admin/legacy`** redirects to **`/inventory/legacy`** ([`App.tsx`](frontend/src/App.tsx); [`Sidebar.tsx`](frontend/src/components/layout/Sidebar.tsx)).
- **Inventory / Orders** — **`GET /api/inventory/orders/`** and **`GET /api/inventory/orders/summary/`** only include purchase orders whose cached vendor display name is one of **Walmart**, **Target**, **Costco**, **Essendant**, **Wayfair**, **Home Depot**, **Amazon** ([`apps/inventory/constants.py`](apps/inventory/constants.py); [`apps/inventory/views.py`](apps/inventory/views.py)). Other vendors remain reachable via order detail and non-list APIs.
- **Inventory / API** — `upload-manifest` returns structured `code` on common errors (**`missing_file`**, **`decode_error`**, **`empty_csv`**, **`storage_error`**, **`save_error`**); writes new **`S3File`** + PO link before deleting prior storage object; **`process-manifest`** row replace uses **`transaction.atomic()`** ([`apps/inventory/views.py`](apps/inventory/views.py)).
- **Inventory / Preprocessing** — Product Matching is no longer staff-facing; exact deterministic product reuse happens during Product/Item preparation, and `create-items` now opens processing for existing early Items without duplicating them.

### Documentation

- **Workspace (gitignored)** — Adjunct preprocessing manifest experimentation: **`workspace/ai-cleanup-grok/`** (Grok **`helpers/clean-grok.mjs`** runner + prompts; **`prompts/amazon-examples.json`** few-shot regeneration via **`helpers/build-amazon-examples.mjs`** — **not tracked** unless `.gitignore` whitelists explicitly). Steering: [.ai/initiatives/order_processing_pipeline_rebuild.md](.ai/initiatives/order_processing_pipeline_rebuild.md) Sessions 2–5 (**2026-04-29**).
- **`.ai/`** — **`review_bump`** sync for **`v2.20.0`**: **`context.md`**, **`initiatives/_index.md`**, **`order_processing_pipeline_rebuild.md`**, **`consultant_context.md`**, **`extended/frontend.md`**, **`extended/inventory-pipeline.md`** (**2026-04-29**).

## [2.19.1] — 2026-04-21

User-facing theme: **Buying auction detail** — **valuation overrides** (fees, shipping, shrinkage, profit goal, pre-/post-shrink revenue) save **reliably**; invalid manifest-mapping refreshes no longer clobber in-flight **PATCH** responses; **invalid decimal input** returns **400** with a clear `detail` instead of **500**. Inline **Costs & revenue** fields **select all on focus** for replace-on-type.

### Fixed

- **Buying / React Query** — `useBuyingValuationInputsMutation` cancels in-flight detail queries, applies **`setQueryData`** before a **predicate** `invalidateQueries` (list/summary and other `buying/auctions/*` keys **excluding** the current detail) so a stale **GET** cannot overwrite a successful **PATCH** ([`useBuyingValuationInputsMutation.ts`](frontend/src/hooks/useBuyingValuationInputsMutation.ts)). Errors from **`PATCH …/valuation-inputs/`** show a **notistack** message via **`onError`**.

- **Buying / detail / manifest** — Debounced `map_fast_cat_batch` progress only invalidates **`manifest_rows`** and **auction summary**; it no longer invalidates the auction **detail** or full **list** on every tick, avoiding races with staff editing valuation inputs ([`AuctionDetailPage.tsx`](frontend/src/pages/buying/AuctionDetailPage.tsx)). Final `refetchQueries` after mapping workers still refresh the detail.

- **Buying / API** — `PATCH /api/buying/auctions/{id}/valuation-inputs/` normalizes string decimals (`strip`, leading `$`, commas), tolerates pastes like **`$12.34`**, and returns **400** `{"detail": "<field> must be a decimal number."}` on invalid input instead of an uncaught **InvalidOperation** ([`api_views.py`](apps/buying/api_views.py) `valuation_inputs`).

### Changed

- **Buying / `AuctionValuationCard`** — While the valuation mutation is **pending**, readouts prefer **local** state where applicable so the UI does not flash stale server values; **Fees / Shipping / Revenue** (empty local still shows table **estimated**). **`ValuationInlineField`** text inputs **`select()` on focus** (fees, shipping, shrinkage, profit, pre-shrink revenue, after-shrink revenue) ([`AuctionValuationCard.tsx`](frontend/src/components/buying/AuctionValuationCard.tsx)).

### Documentation

- **`.ai/`** — `context.md`, `consultant_context.md`, `extended/frontend.md`, `extended/backend.md` — v2.19.1 notes.

## [2.19.0] — 2026-04-21

User-facing theme: **Buying auction thumbs are per-user** — list and detail show **`my_thumbs_up`** (you voted) and **`thumbs_up_count`** (distinct staff voters). Legacy **`buying_auction.thumbs_up`** removed; votes remain in **`AuctionThumbsVote`**.

### Changed

- **Buying / API** — Auction list & detail JSON: **`thumbs_up`** replaced by **`my_thumbs_up`**; **`thumbs_up_count`** unchanged. **`POST`/`DELETE /api/buying/auctions/{id}/thumbs-up/`** response body uses **`my_thumbs_up`** instead of **`thumbs_up`**. List & watchlist **`ordering`** allow **`thumbs_up_count`** (replacing model field **`thumbs_up`**). Query filter **`thumbs_up`** (current user has a vote) unchanged — [`apps/buying/filters.py`](apps/buying/filters.py), [`apps/buying/serializers.py`](apps/buying/serializers.py), [`apps/buying/api_views.py`](apps/buying/api_views.py).
- **Buying / React** — Grid and mobile use **`my_thumbs_up`** for highlight; default list ordering **`-watchlist_sort,-thumbs_up_count,-priority,-need_score`**; **`normalizeBuyingListOrdering`** maps legacy **`thumbs_up`** sort tokens — [`frontend/src/utils/buyingAuctionList.ts`](frontend/src/utils/buyingAuctionList.ts), [`frontend/src/pages/buying/AuctionListDesktop.tsx`](frontend/src/pages/buying/AuctionListDesktop.tsx).

### Removed

- **Buying / schema** — Field **`Auction.thumbs_up`**; migration [`0020_remove_auction_thumbs_up`](apps/buying/migrations/0020_remove_auction_thumbs_up.py). Raw sweep upsert no longer inserts **`thumbs_up`** — [`apps/buying/services/sweep_upsert.py`](apps/buying/services/sweep_upsert.py).

### Fixed

- **Buying / auction list** — Thumbs icon filled only when the **logged-in** staff user voted; count reflects **all** voters (eliminates serializer fallback to a global flag).

### Documentation

- **`.ai/`** — `context.md`, `consultant_context.md`, `extended/backend.md`, `extended/bstock.md`, `extended/frontend.md` — thumbs API and schema.

## [2.18.2] — 2026-04-17

User-facing theme: **Buying UX polish** — snappier **active auctions** list (optimistic cache, no full-list refetch on toggles, archive **2s** cancel window), **auction detail** clarity (max-bid gauge **0 → break-even**, shared tooltips, category mix **Units**), and **filters / layout** refinements (two-column filter grid, pagination with results, category-need **ABA** rhythm). UI patterns: **`.ai/extended/ux-spec.md`**.

### Added

- **Buying / valuation** — Category mix table: **Units** column and footer total from `category_distribution` / `manifest_row_count` (`AuctionValuationCard`).
- **Buying / detail** — Max bid at each target: gauge scale **0 → break-even**; compact chart labels **Tgt / Mod / BE**; shared max-bid tooltip on bid tiles and gauge (`AuctionSecondaryCard`).

### Changed

- **Buying / auction list** — React Query trusts optimistic list cache: no `invalidateQueries` on thumbs/watch/archive bulk actions; `refetchOnMount: false` and `staleTime` on list hooks; single-row archive **2s grace** with cancel and row removal before POST (`useBuyingArchiveGrace`, `buyingOptimisticCache`); neighbor page prefetch; pagination controls moved to results header; **ABA** section rhythm for category need; search/filters **two-column** layout (Clear / All / Clear per row); desktop row render polish (`AuctionListPage`, `AuctionListDesktop`).

### Fixed

- **Buying / auction list** — Non-admin thumbs cell **stopPropagation** so row click does not navigate to detail.

## [2.18.1] — 2026-04-17

User-facing theme: **Managers see Settings** — canonical roles from Django groups (`/api/auth/me/`), rank-based sidebar visibility, **`/admin/settings`** on **`ManagerRoute`**. Fixes login **500** from redundant `source='roles'` on **`UserSerializer`**.

### Fixed

- **Auth / API** — **`UserSerializer.roles`** no longer uses redundant DRF `source` (restores **`POST /api/auth/login/`**).
- **Staff / Settings** — Managers get **Settings** in the nav and can open the page; **`GET /api/auth/me/`** includes **`roles`** and stable **`role`** when group names differ in casing or whitespace.

---

## [2.18.0] — 2026-04-17

User-facing theme: **Buying manifests are CSV-only** — anonymous order-process pulls, related REST actions, and server commands are removed. **Auction list** gains **Top category %**, **P/R %**, a richer **category** hover (full retail-weighted mix + source), **expand-all** on the detail column, and **tighter, vertically centered** grid rows.

### Added

- **Buying / auction list (desktop)** — **`Top category %`** (first word of lead category + rounded share), **`P/R %`** (current price ÷ list retail, integer %), **Category** column with hover showing **From Manifest** or **AI Estimate** and the full mix sorted by % desc; **expand** column header expands or collapses **all rows on the page**; cells and headers use compact padding with **vertical centering**.
- **Buying / auction list (mobile)** — Same category + price/retail line treatment where applicable.
- **Utilities** — [`frontend/src/utils/buyingCategoryList.ts`](frontend/src/utils/buyingCategoryList.ts), [`AuctionCategoryListBlock`](frontend/src/components/buying/AuctionCategoryListBlock.tsx).

### Fixed

- **Buying / React Query** — After **`DELETE …/manifest/`**, invalidate **`['buying','auctions']`** and **`['buying','auctions','summary']`** so list **`has_manifest`** and counts refresh without a full reload ([`AuctionDetailPage.tsx`](frontend/src/pages/buying/AuctionDetailPage.tsx)).

### Removed

- **Buying / manifests (breaking for automation using these endpoints or commands)** — Staff REST: `pull_manifest`, `manifest_pull_progress`, `manifest_queue`, `pull_manifests_budget`, `manifest_pull_log`. Management commands: `pull_manifests`, `pull_manifests_nightly`, `pull_manifests_budget`, `benchmark_manifest_pull`. Services: `manifest_api_pipeline` and related order-process client code. **Ingestion is CSV upload only** (`POST …/upload_manifest/`, `DELETE …/manifest/`). **Ops:** remove any Heroku Scheduler job that ran `pull_manifests_nightly`.

### Documentation

- **`.ai/extended/`** — `bstock.md`, `backend.md`, `development.md`; bookmarklet no longer references `pull_manifests`.

---

## [2.17.1] — 2026-04-17

User-facing theme: **Manifest retail invariant fixed** — **`ManifestRow.retail_value`** is now **canonically per-unit MSRP** across ingest (CSV upload; `normalize_manifest_row` still normalizes legacy stored API-shaped `raw_data` when present), aggregates (auction list, valuation, manifest mix, detail card), and tests. Extended retail = **`SUM(Coalesce(quantity, 1) × retail_value)`** at query time, never stored. Resolves auctions where multi-qty rows showed inflated **Manifest retail** (e.g. listing **102 units / $7,129** displayed **$15,012**).

### Fixed

- **Buying / aggregates qty-weighted** — [`valuation._manifest_retail_sum`](apps/buying/services/valuation.py), [`valuation.compute_and_save_manifest_distribution`](apps/buying/services/valuation.py), [`api_views.annotate_auction_list_extras`](apps/buying/api_views.py) (`_manifest_retail_sum` annotation), and [`serializers.AuctionDetailSerializer.get_manifest_extended_retail_total`](apps/buying/serializers.py) now use **`SUM(Coalesce(quantity, 1) × retail_value)`**. Auction `estimated_revenue` and the **Manifest retail** detail card field move in lockstep; no model migration.
- **Buying / CSV ingest** — [`manifest_template.standardize_row`](apps/buying/services/manifest_template.py) divides extended-retail columns by **`quantity`** when only `extended_retail` is mapped, logs a warning if both `retail_value` (unit) and `extended_retail` disagree by **>2%**, and warns when an extended value is stored as-is because qty is missing.
- **Buying / API ingest** — [`normalize.normalize_manifest_row`](apps/buying/services/normalize.py) keeps `unitRetail` preferred and now divides `extRetail` by `quantity` when only `extRetail` is present.
- **Buying / category-need** — Distribution bars no longer clip at **20%**. **`bar_scale_max`** is now **`max(max(shelf_pct, sold_pct) across categories, 20%)`** so the tallest bar fills the column while small distributions keep a 20% reference (**`apps/buying/services/category_need.py`**).

### Added

- **`apps/buying/management/commands/diagnose_manifest_retail.py`** — Read-only audit: per-auction `total_units`, `sum_retail`, `sum_ext`, `auction.total_retail_value`, ratio, and a flag (`UNIT_OK` / `EXTENDED_LIKELY` / `AMBIGUOUS` / `NO_LISTING`). Supports `--auction <id>`, `--database`, `--limit`, `--only`.
- **`apps/buying/management/commands/normalize_stored_manifest_retail.py`** — Per-auction backfill (gated by `--auction`): for rows with `quantity ≥ 2`, divides stored `retail_value` by `quantity`. Default-safe `--dry-run`; runs `recompute_auction_full` after writes (skip with `--skip-recompute`).

### Tests

- [`apps/buying/tests/test_normalize_manifest.py`](apps/buying/tests/test_normalize_manifest.py): API extRetail-only row with `qty=3, ext=$90` → `retail_value = $30`; `unitRetail` preferred over `extRetail` when both present; extRetail-only with no qty stored as-is.
- [`apps/buying/tests/test_manifest_upload.py`](apps/buying/tests/test_manifest_upload.py) `StandardizeRowRetailValueTests`: same matrix for CSV templates.
- [`apps/buying/tests/test_valuation.py`](apps/buying/tests/test_valuation.py) `ManifestDistributionTests.test_manifest_distribution_qty_weighted` and `test_manifest_retail_sum_qty_weighted`.

### Documentation

- **Inventory / `PurchaseOrder.retail_value`** — Some backfills store listing total incorrectly (e.g. **~100×** low vs **`notes`** JSON **`ext_retail`**). **`compute_item_cost`** divides by **`PO.retail_value × (1 − est_shrink)`**; a bad listing total inflates **`Item.cost`** and distorts **`CategoryStats`** good-data **`recovery_cost_amount`**, **`avg_cost`**, **`profit_margin`**, and panel **`n`** until corrected. Compare **`ecothrift.inventory_purchaseorder.retail_value`** to **`(regexp_replace(notes, '^[^{]*', ''))::jsonb ->> 'ext_retail'`** when **`notes`** contains **`BACKFILL:`** + JSON; fix **`retail_value`**, then **`python manage.py recompute_all_item_costs`** (optional **`--database production`**) and **`python manage.py compute_daily_category_stats`**.

### Operations (post-deploy — production)

- `python manage.py migrate` (no model changes; safety check).
- `python manage.py diagnose_manifest_retail --database production` — review flagged auctions; compare `sum_ext` vs `auction.total_retail_value`.
- For each affected auction (case by case):
  - **Re-upload** — CSV via the UI (the new `standardize_row` divides extended by qty), OR
  - **In-place fix** — `python manage.py normalize_stored_manifest_retail --auction <id> --dry-run` first, then drop `--dry-run`.
- `python manage.py compute_daily_category_stats --database production` — refresh **`CategoryStats`** + **`category_need_panel`** cache once any backfill completes.

---

## [2.17.0] — 2026-04-16

User-facing theme: **Good-data cohort for recovery and profitability** — **`CategoryStats.recovery_rate`** and dollar amounts now require **sold** rows where **`sold_for`**, **`retail_value`**, and **`cost`** are each between **0.01 and 9999** (all-time). **`avg_sold_price`** / **`avg_retail`** / **`avg_cost`** are means over that same cohort; **`recovery_cost_amount`** and **`good_data_sample_size`** are stored. Category-need API renames **`profit_per_item`** → **`avg_profit`**, **`profit_sales_ratio`** → **`profit_margin`** (dollar-weighted); drops **`return_on_cost`**. Auction list **category need** table: **Avg $** column → **Margin** (%); detail card adds a **Profitability** section (avg retail / sale / profit, recovery, margin, **n**).

### Changed

- **Buying / `CategoryStats`** — Migration **`0019_categorystats_good_data_cohort`**: **`recovery_cost_amount`**, **`good_data_sample_size`**; **`recovery_rate`** / **`avg_*`** help_text. SQL **`_profitability_aggregates()`** replaces **`_recovery_dollars`** + windowed **`_want_avg_rows`**.
- **Buying / category-need** — [`category_need.py`](apps/buying/services/category_need.py): payload fields above.
- **Frontend** — [`buying.types.ts`](frontend/src/types/buying.types.ts), [`CategoryNeedBars.tsx`](frontend/src/components/buying/CategoryNeedBars.tsx), [`CategoryNeedDetail.tsx`](frontend/src/components/buying/CategoryNeedDetail.tsx).

### Documentation

- **`.ai/`** — context, consultant, **`extended/backend.md`**, **`extended/frontend.md`** — good-data cohort and UI column list.

### Operations (post-deploy — production)

- After **`migrate`**, run **`python manage.py compute_daily_category_stats`** (or wait for the daily scheduler) so **`CategoryStats`** and **`category_need_panel`** cache reflect the stricter cohort before staff rely on recovery/margin. **`estimated_revenue`** may shift vs **v2.16.0** for categories where many sold rows lack cost in range.
- Still run once after deploy when shipping **v2.16.0+** cost work: **`python manage.py recompute_all_item_costs`** — see **[2.16.0]** Operations.

---

## [2.16.0] — 2026-04-16

User-facing theme: **Recovery rate replaces sell-through on CategoryStats** — daily SQL now stores **`recovery_rate`** = `SUM(sold_for) / SUM(retail_value)` (all-time qualifying sold rows per taxonomy bucket) and dollar numerators; auction **`estimated_revenue`** uses this ratio in the mix × retail formula. Category need API and UI rename **Thru** → **Recovery**; valuation mix table color bands adjusted for typical thrift recovery (green ≥35%, amber ≥20%).

### Changed

- **Buying / `CategoryStats`** — Migrations **`0017_categorystats_recovery_rename`**, **`0018_alter_categorystats_recovery_rate`**: `sell_through_rate` → **`recovery_rate`**, `sell_through_numerator` / `sell_through_denominator` → **`recovery_sold_amount`** / **`recovery_retail_amount`**. Legacy **`PricingRule.sell_through_rate`** unchanged (CSV seed only).
- **Buying / SQL** — [`category_stats_sql`](apps/buying/services/category_stats_sql.py): `_recovery_dollars()` replaces unit shelf/sold ratio.
- **Buying / valuation** — [`valuation.py`](apps/buying/services/valuation.py): `_recovery_rate_for_category`.
- **Buying / category-need API** — [`category_need.py`](apps/buying/services/category_need.py): `recovery_pct`, `recovery_rate` in row payload.
- **Frontend** — [`buying.types.ts`](frontend/src/types/buying.types.ts), [`CategoryNeedBars.tsx`](frontend/src/components/buying/CategoryNeedBars.tsx), [`CategoryNeedDetail.tsx`](frontend/src/components/buying/CategoryNeedDetail.tsx), [`AuctionValuationCard.tsx`](frontend/src/components/buying/AuctionValuationCard.tsx).

### Documentation

- **`.ai/extended/backend.md`**, **`.ai/extended/ux-spec.md`**, **`.ai/context.md`**, **`.ai/consultant_context.md`**, **`.ai/extended/frontend.md`**, **workspace** `buying-auctions-list-ux/CONTEXT.md` — recovery semantics and UI labels; root **`package.json`** `"version"` aligned with **`.version`** (review_bump).

### Operations (post-deploy — production)

- After **`migrate`** on Heroku (or any host), run **once**: `python manage.py recompute_all_item_costs` — backfills **`Item.cost`** from **`PurchaseOrder.compute_item_cost`** (listing retail × shrink × `total_cost` allocation) for every PO that has items. Idempotent if data already matches; use whenever deploy ships or data fixes require cost realignment. See **`apps/inventory/management/commands/recompute_all_item_costs.py`**.

---

## [2.15.4] — 2026-04-16

User-facing theme: **AI steering and repository hygiene** — consolidate `.ai/` docs, archive initiative files, remove obsolete scripts and env-template clutter; fix `2_push_github.bat` so `git commit -F` uses the full `commit_message.txt` and the batch file parses under `cmd.exe`.

### Documentation

- **Workspace** — Cleared **`workspace/data/`** (generated CSV/JSON; **`.gitkeep`** only). Removed notebook **`README.md`** files; Jupyter setup consolidated in **`.ai/extended/development.md`**. Pruned notebook temp artifacts (**`.csv`**, **`.pkl`**, caches, empty **`bstock-intelligence/`**). Dropped **`workspace/testing/`** gitignore exceptions (folder unused). Updated cross-links in **`README`**, **`databases.md`**, initiatives, **`CHANGELOG`** history where cited.

- **AI steering** — Added [`.ai/protocols/review.0.Bump.md`](.ai/protocols/review.0.Bump.md): docs-audit checklist (steering + extended TOC), semver bump matrix, `CHANGELOG` update rules, drift-check shell snippets; Part 5 documents **`commit_message.txt`** + **`2_push_github.bat`**. Cross-links from `.ai/context.md`, **`README`** AI steering table, and `startup` / `session_checkpoint` / `session_close` protocol relationship tables.
- **Consultant handoff** — Removed **`.ai/protocols/consult_retire_charlie.md`** and **`.ai/protocols/consult_retire_scout.md`**. Advisor bundle procedure is only [`.ai/extended/consultant_handoff.md`](.ai/extended/consultant_handoff.md) (**`workspace/to_consultant/files-update/`**).
- **Personas** — Removed **`.ai/personas/`** (Scout / Christina role prompts). Updated [`.ai/context.md`](.ai/context.md), [`.ai/extended/consultant_handoff.md`](.ai/extended/consultant_handoff.md), and [`.ai/protocols/code.1.Bearing.md`](.ai/protocols/code.1.Bearing.md) so docs do not reference those paths.
- **Workspace hygiene** — Removed **`workspace/notes/`** ignore whitelist for a non-existent tracked script; **`scripts/data/build_sell_through_rates.py`** reads **`workspace/data/historical_keys_mapped.csv`**. Session drop **`workspace/4-16-26 Collection/`** and temp **`workspace/file_cleanup.md`** deleted from disk when present.

- **Env templates** — Removed **`template.env`** and **`extract-env-vars.bat`** from repo root; use **`.env.example`** as the committed template (copy to **`.env`** locally).

- **Initiatives index** — [`.ai/initiatives/_index.md`](.ai/initiatives/_index.md) **Active initiatives** table cleared (no rows); initiative markdown may live under **`_archived/_completed/`** (e.g. buying / UI polish) with session history preserved.

- **AI steering (review_bump)** — Extended TOC parity (**`context.md`** ↔ **`consultant_context.md`**); **`<!-- Last updated -->`** on line 1 of every **`.ai/extended/*.md`** (including **`consultant_handoff.md`**).

### Changed

- **Deploy** — [`scripts/deploy/2_push_github.bat`](scripts/deploy/2_push_github.bat): `git commit -F` on the full [`commit_message.txt`](scripts/deploy/commit_message.txt); validate first line only; reset to `---` on success when not `--called`; avoid `(` in `set /p` prompt and unparenthesized `::` comments that broke **`cmd.exe`**.

---

## [2.15.3] — 2026-04-16

User-facing theme: **AI title category estimate yield and sweep ergonomics** — restored high save rate from **`estimate_batch`** by removing the redundant **`title_echo`** check (rows already match via **`auction_id`**); padded the cached system block past the Haiku **2048**-token minimum so repeated batches can use **`cache_read`** pricing; **`estimate_auction_categories --missing-both`** for robust backfills.

### Changed

- **Buying / AI title category estimate** — **`ai_title_category_estimate.estimate_batch`**: no **`title_echo`** field or verification; system prompt adds edge-case and worked-example sections. **`python manage.py estimate_auction_categories`**: **`--missing-both`** (open/closing, no AI mix and no manifest mix), default **500** cap when used (**`--limit`** overrides).

---

## [2.15.2] — 2026-04-16

User-facing theme: **Retail-weighted category mix and need score** — manifest **`manifest_category_distribution`** is built from **retail value** share per **`fast_cat_value`** (fallback to row counts when all retail is null/zero). While fast-cat mapping is partial, the **Mixed lots & uncategorized** bucket is **redistributed** using existing **`ai_category_estimates`** (same weights used for **`need_score`** SUMPRODUCT). Discovery sweep **no longer caps** AI title estimates at 25 auctions per run; auctions that **already have** **`ai_category_estimates`** are skipped to avoid repeat API calls.

### Changed

- **Buying / valuation** — **`compute_and_save_manifest_distribution`**: retail-weighted percentages; count-weight fallback; **`_mix_for_auction`**: blend Mixed lots with AI when both exist; **`run_ai_estimate_for_swept_auctions`**: no per-sweep cap; skip when AI estimates already present. **`recompute_auction_full`**: when **`has_manifest`**, refreshes manifest distribution from **`ManifestRow`** before recomputing revenue and **`need_score`** (so **`python manage.py recompute_buying_valuations`** backfills retail-weighted mixes for open/closing auctions).
- **Buying / AI title category estimate** — **`ai_title_category_estimate.estimate_batch`**: taxonomy + rules + JSON schema moved into the **cached system block** (Haiku `cache_control=ephemeral`); per-vendor **`_few_shot_block`** now drops rows where **`Mixed lots & uncategorized` ≥ 80%** (treated as incomplete **`fast_cat`** mapping, not a real distribution) and returns an empty block (no literal "no examples" string) when the vendor has none so the user message stays lean.

---

## [2.15.1] — 2026-04-16

User-facing theme: **Manifest pipeline optimizations** — 7 targeted changes to the B-Stock manifest download and post-processing path. Dev timing infrastructure (`manifest_dev_timelog`) for benchmarking pull speed. Benchmark baseline: **~38 s / 1010 rows / ~26 rows/s** via SOCKS5. B-Stock page-size hard cap confirmed at **10 items/page** (ignores `limit` above 10).

### Changed

- **Buying / scraper** — `_fetch_manifest_paginated` now uses a **lazy singleton `requests.Session`** (`_manifest_http_session()`) for TLS connection reuse across paginated manifest GETs (Opt 1). Each page no longer creates a fresh TCP+TLS handshake to `order-process.bstock.com`.
- **Buying / pipeline** — **`CategoryStats`** preloaded **once** before the auction loop in `run_manifest_pull` and passed via `stats=` to `recompute_auction_valuation`, eliminating repeated full-table loads (Opt 2). **`_has_manifest_rows`** `Exists` annotation added to `manifest_pull_queue_queryset` — per-auction `.exists()` DB call removed (Opt 3). **`bulk_create(batch_size=500)`** on `ManifestRow` inserts (Opt 6). **1-deep `ThreadPoolExecutor` prefetch** — fetches next auction's manifest (HTTP) while processing current auction's DB writes; controlled by `MANIFEST_PULL_PREFETCH` setting and `--no-prefetch` flag (Opt 5).
- **Buying / commands** — `pull_manifests_budget` and `pull_manifests_nightly` default `--delay` lowered from **3.0 s** to **1.0 s** (Opt 4).

### Added

- **Dev timing** — `apps/buying/services/manifest_dev_timelog.py`: writes per-pull JSONL to `workspace/…/B-Manifest API/.timelogs/` and appends to `time_summary.md` when `ENVIRONMENT=development`. Version string `MANIFEST_API_PULL_VERSION` bumped per code change.
- **Benchmark command** — `python manage.py benchmark_manifest_pull`: warm-up + AI mapping, N baseline runs, per-auction timing against the dev timelog. Flags `--auction-id`, `--baseline-runs`, `--skip-warmup`.
- **Probe script** — `workspace/…/B-Manifest API/probe_manifest_speed.py`: standalone HTTP timing comparison (shared session vs bare requests) for page-size ceiling validation. **Use with caution** — default args make ~600 API calls; always pass `--limits <single_value>`.

### Removed

- **Buying — staff category-want vote:** **`CategoryWantVote`** model and **`GET`/`POST` `/api/buying/category-want/`**; frontend **`useBuyingCategoryWant`** hook and API helpers; **`apps/buying/services/want_vote.py`** and **`get_want_vote_decay_per_day()`**; **`seed_pricing_rules`** no longer seeds **`buying_want_vote_decay_per_day`**. **Category need** detail card redesigned (raw need-score inputs, **sold-items window since** date). Migration **`0016_remove_categorywantvote`**.

---

## [2.15.0] — 2026-04-15

User-facing theme: **Auction detail UX v3** — restructure the page around the user's decision process instead of data categories. Urgency strip, decision summary, bid reference card, multi-tick gauge, costs input/output split, sell-through color coding, condition chips, compact manifest view. Driven by external UX consultant critique (49/100 → comprehensive overhaul). See **`.ai/extended/ux-spec.md`** for the design spec.

### Added

- **AuctionUrgencyStrip** — full-width `Paper` banner above the analysis grid: hero countdown (h4, pulsing animation under 1h), current price (h5), bid count with "No competition" signal, status chip. Background tints by urgency tier. Replaces the time/price/bids/status section of the old `AuctionEndDetailsCard`.
- **AuctionDecisionSummary** — synthesized deal-assessment banner with left color border (green/amber/red). Margin ratio text ("Current price is X% of breakeven"), inline chips for risk flags (low sell-through categories, low inventory demand) and opportunity signals (no competition + wide margin). Auto-hides when insufficient data.
- **AuctionBiddingCard** — new grid cell (1,2) for static bid-reference data: priority (editable), need score (color-coded), buy now, starting price (moved from AuctionDetailsInfoCard), est. profit (green/red), profitability ratio (green/amber/red thresholds).
- **UX design spec** — `.ai/extended/ux-spec.md`: full specification capturing design philosophy, component specs, color system, typography rules, interaction patterns, and implementation status. Applies project-wide.

### Changed

- **ValuationMaxBidCard** — replaced thin progress bar with a **multi-tick gauge** (10px track, tick marks at breakeven/moderate/target, current price dot marker, labeled positions). Tile boxes now have **color-differentiated left borders** (error.light / warning.light / success.light). Margin text shows computed ratio instead of "Strong margin" chip.
- **ValuationCostsCard** — restructured into **Inputs** (tinted `action.hover` background) and **Calculated** (default background) sections with a `Divider`. Inputs section groups: current price, fees, shipping, shrinkage, profit goal, revenue pre-shrink. Calculated section shows: total cost, expected revenue, **est. profit** (new, color-coded), **margin %** (new, derived).
- **AuctionDetailsInfoCard** — **condition** renders as a color-coded `Chip` (New/Like New → success, Used Good → primary, Used Fair → warning, Salvage → error). **Avg retail per item** shown next to lot size. **Starting price** removed (moved to AuctionBiddingCard).
- **ValuationCategoryTableCard** — **sell-through column** color-coded: >= 75% green, 50-75% amber, < 50% red.
- **AuctionDetailPage** — manifest card: when manifest loaded, shows **compact metadata** (row count, categorized, template, manifest retail) + single-line "Replace manifest" / "Remove" zone instead of a large drag area. Urgency strip + decision summary inserted above the 6-cell grid. Cell 1,2 swapped to `AuctionBiddingCard`.

### Removed

- **AuctionEndDetailsCard** — replaced by `AuctionUrgencyStrip` (real-time data) + `AuctionBiddingCard` (static reference).

---

## [2.14.1] — 2026-04-15

User-facing theme: **SOCKS5 proxy hardened for all B-Stock HTTP** — PIA `socks5://` (local DNS) as default; optional resolved-IP override; step-based diagnostic script; dev audit logging.

### Changed

- **Buying / scraper** — **All** `*.bstock.com` requests (not just search) route through SOCKS5 when `BUYING_SOCKS5_PROXY_ENABLED=True` via `_request_json`. New `BUYING_SOCKS5_PROXY_IP` (optional resolved IP override) and `BUYING_SOCKS5_LOCAL_DNS` (default recommendation **`True`** for PIA — `socks5://` local DNS; `socks5h://` remote DNS fails with PIA 0x04). `BUYING_SOCKS5_DEV_AUDIT` logs redacted proxy URLs and periodic egress IP probes to `logs/bstock_api.log`.
- **`.env.example`** — `BUYING_SOCKS5_LOCAL_DNS` documented with `True` as recommended default for PIA; `BUYING_SOCKS5_PROXY_IP` added.
- **`ecothrift/settings.py`** — reads `BUYING_SOCKS5_PROXY_IP` (optional).

### Added

- **Diagnostic** — `workspace/tests/socks5_egress_probe.py` rewritten as 6-step Grok-informed diagnostic: resolve proxy hostname, direct egress, `socks5://` + hostname, `socks5://` + IP, `socks5h://` + hostname, optional B-Stock search (`--bstock`). Clear PASS/FAIL per step; scraper-config verdict at bottom.
- **Extended docs** — `.ai/extended/vpn-socks5.md`: full reference for PIA SOCKS5 setup, `.env` keys, `socks5://` vs `socks5h://`, known PIA behavior, diagnostic usage, IP rotation.

---

## [2.14.0] — 2026-04-15

User-facing theme: **Simpler buying NEED scores + inventory item cost** — ratio-based **1–99** category need (daily SQL), auction **`need_score`** / auto **`priority`** as weighted mix of those scores; **PO `est_shrink`** drives **`Item.cost`** from listing retail and total cost (no legacy nightly vendor→PO→sold-only pipeline).

### Added

- **Buying / category need** — `CategoryStats.need_score_1to99` (1–99, min–max across taxonomy buckets from sold vs shelf ratios); auction `need_score` / auto `priority` are the manifest/AI **SUMPRODUCT** of those scores (no profit/time blend). **`compute_daily_category_stats`** drives SQL + open-auction full recompute.
- **Inventory / item cost** — `PurchaseOrder.est_shrink` (default **0.15**); `item_cost = (item.retail / (PO.retail × (1 − est_shrink))) × PO.total_cost` on intake and when `est_shrink` / PO cost / listing retail change. Management command **`recompute_all_item_costs`** for one-shot backfill.
- **Documentation** — **`.ai/context.md`**, **`.ai/consultant_context.md`**, **`.ai/extended/backend.md`**, **`.ai/extended/development.md`**, **`.ai/extended/bstock.md`** updated for the new behavior; deploy scripts use **`recompute_all_item_costs`** instead of **`recompute_cost_pipeline`**.

### Removed

- **Inventory — legacy cost pipeline** — `compute_vendor_metrics`, `compute_po_cost_analysis`, **`compute_item_cost`** (management command), **`recompute_cost_pipeline`**, and related `Vendor` / `PurchaseOrder` analytics fields (`shrinkage_rate`, `misfit_rate`, `avg_sell_through`, `avg_fulfillment`, `shrink_retail_est`, `mistracked_retail`, `misfit_sales_amt`). Nightly scheduler must **not** run the deleted wrapper; use **`recompute_all_item_costs`** only when backfilling costs after deploy.

---

## [2.13.1] — 2026-04-15

User-facing theme: **Buying desktop auction list — snappy interactions + inline row detail** ([`.ai/initiatives/_archived/_completed/ui_ux_polish.md`](.ai/initiatives/_archived/_completed/ui_ux_polish.md), Session 5 follow-up) — stable DataGrid columns, optimistic watch row patch, microtask-friendly query cancel.

### Changed

- **Frontend / buying — desktop list** — `AuctionListDesktop` (**`/buying/auctions`**, `md+`): expand/collapse **chevron** column moved to the **last** column (right of **Time left**); **inline detail** strip under the expanded row via DataGrid **`slots.row`** + **`getRowHeight`** (compact pipe-separated metrics; **Shift+click** row still toggles); theme trims perceived lag — **`MuiIconButton`** / **`MuiCheckbox`**: `disableRipple` + **`transition: none`**; bulk column sort affordance without opacity **transition**; header **`Tooltip`** **`enterDelay={200}`**.
- **Frontend / buying — performance** — Column definitions are **referentially stable**: frequently changing state (**`watchlistIds`**, **`rows`**, selection, sort model, expand id) held in a **`MutableRefObject`** read inside **`renderCell` / `renderHeader`** so optimistic toggles **do not** rebuild all **`GridColDef`** closures and **do not** force a full-grid re-render; **`TimeRemainingCell`** runs its own 1 s interval when under the live countdown threshold (parent **`countdownTick`** no longer invalidates columns every second); custom **row** slot reads expand state from the same ref (stable **`slots.row`**).
- **Frontend / mutations** — **`useBuyingWatchlistToggleMutation`**: optimistic **`patchAllBuyingAuctionLists`** sets **`watchlist_sort`** on the toggled auction so the grid row reference updates with star state; **`void queryClient.cancelQueries`** (non-blocking) instead of **`await`** — same for **`useBuyingThumbsUpMutation`** and **`archiveMutation`** in **`AuctionListPage`**.

---

## [2.13.0] — 2026-04-15

User-facing theme: **Fast auction sweep** + **optional SOCKS5 for search** ([`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md)) — parallel B-Stock search, raw SQL upsert, richer sweep API, single-request Refresh UX.

### Added

- **Buying / sweep** — Parallel **POST** `search.bstock.com` pagination per marketplace (`ThreadPoolExecutor`), default **`limit=200`**, configurable **`BUYING_REQUEST_DELAY_SECONDS`** (default **0**). Raw PostgreSQL **`INSERT … ON CONFLICT`** upsert ([`sweep_upsert`](apps/buying/services/sweep_upsert.py)) preserving **`first_seen_at`** and staff fields; shared **[`listing_mapping`](apps/buying/services/listing_mapping.py)** for listing JSON → auction fields.
- **API** — `POST /api/buying/sweep/` response extensions: **`total_seconds`**, **`total_listings`**, **`by_marketplace`** (per-MP HTTP timing, insert/update/skip/db error counts), **`inserted`**, **`updated`** (alongside **`upserted`**).
- **Frontend** — **Refresh auctions**: one **`POST`** for all active marketplaces (no per-MP loop); loading copy **“Sweeping all marketplaces…”**; [`BuyingSweepResponse`](frontend/src/types/buying.types.ts) types extended.
- **Ops / proxy** — Optional **SOCKS5** for search only (`socks5h`), env **`BUYING_SOCKS5_*`**, **`PySocks`**; URL-encoded credentials in **[`scraper._socks_proxies_for_search`](apps/buying/services/scraper.py)**. **[`workspace/sweep_fast.py`](workspace/sweep_fast.py)** documented as ops-only fallback (no Django).

### Changed

- **`sweep_auctions`** default **`--page-limit`** **200** (was 20).
- **`.env.example`** — buying delay, sweep workers, SOCKS placeholders (Bill: copy to local **`.env`** as needed; not committed).

### Added (dev tooling / workspace — folded in with v2.13.0 release)

- **Dev tooling** — **`scripts/dev/daily_scheduled_tasks.bat`** runs **`compute_daily_category_stats`**, **`scheduled_sweep`**, and **`watch_auctions`** for local parity with Heroku scheduled buying work; optional **`SKIP_BSTOCK=1`** for offline stats-only. Documented in **`.ai/extended/development.md`** and **`.ai/context.md`**.
- **Workspace (consultant):** B-Stock API research — [`.ai/reference/bstock_api_research.md`](.ai/reference/bstock_api_research.md) and probe script [`workspace/test_bstock_endpoints.py`](workspace/test_bstock_endpoints.py) (anonymous + optional JWT; samples under `workspace/data/bstock_api_samples/`).
- **Workspace:** [`workspace/sweep_fast.py`](workspace/sweep_fast.py) — standalone sweep (parallel GET search, `psycopg2` upsert, `workspace/logs/`).
- **Steering:** [`.ai/extended/consultant_handoff.md`](.ai/extended/consultant_handoff.md); [`.ai/reference/handoff_prompt.md`](.ai/reference/handoff_prompt.md); [`.ai/reference/status_board.md`](.ai/reference/status_board.md) (consultant status board template).

### Documentation

- **Consultant handoff bundle** — **`workspace/to_consultant/files-update/`** is **flat** (no subfolders). Canonical procedure: [`.ai/extended/consultant_handoff.md`](.ai/extended/consultant_handoff.md).
- **`.ai/consultant_context.md`**, **`.ai/extended/bstock.md`:** B-Stock search **GET or POST**, **max `limit` 200**; auction/manifest anonymous behavior cross-linked to **`bstock_api_research.md`**; **`_apply_auction_list_visibility`** (live default; **Completed** = last 24h ended).
- **`.ai/extended/backend.md`:** Django DB cache TTLs (**`item_stats_global`**, **`category_need_panel`**, **`item_list_total_count`**); **`suggest_item`** / **`ai_cleanup_rows`** → **`AI_MODEL_FAST`**; category retry + fallback.
- **`.ai/personas/Scout.md`**, **`.ai/personas/Christina.md`:** **Ask / Plan / Agent** rules; **present_files** for consultant `.md` prompts and `.txt` command scripts.

---

## [2.12.1] — 2026-04-14

User-facing theme: **Auction list & detail polish** (Phase 3A, [`.ai/initiatives/_archived/_completed/ui_ux_polish.md`](.ai/initiatives/_archived/_completed/ui_ux_polish.md)) — staff buying UI and buying API filters for active-auctions workflow, manifest truth from uploads, and detail recompute without B-Stock tokens.

### Changed

- **Auction list** — Column reorder (Watch, Thumbs, read-only Priority, raw Need, Vendor, Title, Price, Retail, Cost/retail %, time left); **`estimated_revenue`** / **`profitability_ratio`** removed from list; **manifest** Yes/No from **`ManifestRow`** (uploaded CSV), not B-Stock flag; **`q`** search (AND across title + marketplace); **Completed** chip + **`completed`** param (last-24h ended vs live default). **`_apply_auction_list_visibility`** for live vs completed.
- **Auction detail** — Manifest grid columns (**Ext Retail**, **% of Manifest**); action row under title (Watch → Update → B-Stock); **`POST …/recompute_valuation/`** for local recompute.

---

## [2.12.0] — 2026-04-13

User-facing theme: **Memory/performance**, **buying category need**, **inventory & POS UX** (Phase 1–2), and **faster item list** — ops tuning, caches, lean APIs, enter-to-commit search, Add Item taxonomy, AI fast defaults, plus **cached total count** for unfiltered item lists.

### Added

- **Inventory / POS — Phase 2 polish** ([`.ai/initiatives/_archived/_completed/ui_ux_polish.md`](.ai/initiatives/_archived/_completed/ui_ux_polish.md)) — Item list (`ItemListPanel`) and POS **transactions** receipt search commit on **Enter** / **Search** (draft text does not refetch lists). **Orders list API** — `PurchaseOrderListSerializer` with **`has_manifest`**; list queryset skips heavy PO stats annotations; no `processing_stats` or nested `manifest_file` on list. **Add Item** — category **taxonomy `Autocomplete`**, **retail (MSRP)** + validation, brand default **Generic**; **`PurchaseOrderListRow`** type for list responses. **AI** — `suggest_item` and `ai_cleanup_rows` default **`AI_MODEL_FAST`**; suggest-item includes canonical category list, **one retry** if category invalid, fallback to **Mixed lots & uncategorized**.
- **Item list API — cached total count** — For **unfiltered** list requests (no `q`, `search`, status/condition/source, filterset fields, or `updated_after`), DRF pagination **`count`** uses **`cache.get_or_set('item_list_total_count', …, 300)`** so large-table **`COUNT(*)`** is not repeated every request (`ItemListPagination` + `CachedTotalCountPaginator`). Filtered lists still run a normal count.
- **Heroku memory ops** — [`docs/operations/heroku-memory.md`](docs/operations/heroku-memory.md): `log-runtime-metrics`, tail web dyno, rollback note (pairs Procfile/Gunicorn + cache deploy).
- **Consignment agreements** — `SearchFilter` on list API so Add Item agreement autocomplete can search by number / consignee fields.

### Changed

- **Pagination** — DRF `max_page_size` **200** (was 1000); **Gunicorn** explicit `--workers 2`, `--max-requests` + jitter (Procfile).
- **Cache** — Django **database** cache backend (`django_cache_table`; tests use LocMem); **TTL-only** cache for item **global** stats block and **category-need** API response (no signal invalidation).
- **Purchase orders (list)** — Annotated item/batch counts for `processing_stats`; **list** no longer prefetches all `manifest_rows` / `batch_groups` (detail still prefetches manifest rows).
- **Item stats API** — `_item_stats_payload` uses a **single aggregate** query where applicable.
- **Buying / category need** — Metric windowing: all-time financials and `sell_through_pct` denominator; 90-day **`sold_count`** / **`sold_pct`** unchanged semantically; [`CategoryNeedBars`](frontend/src/components/buying/CategoryNeedBars.tsx) layered bars (see [`.ai/initiatives/_archived/_completed/ui_ux_polish.md`](.ai/initiatives/_archived/_completed/ui_ux_polish.md)).
- **Frontend lists** — **Server-side** DataGrid pagination for orders, items (`ItemListPanel`), POS transactions; **`useItemsAllPages`** for Processing page when a PO has many items; item list **`q`** and POS receipt filter use **committed** search (Enter/Search/Clear), not live-typing refetch.
- **Add Item form** — Purchase order and agreement pickers: **async** search (small page size) instead of loading hundreds of rows.

---

## [2.11.1] — 2026-04-12

User-facing theme: **Production deployment patch** — backfill data live on Heroku, cost pipeline and inventory ID generation hardened for remote DB.

### Added

- **Optional `DATABASES['production']`** — configure via **`PROD_DATABASE_*`** (see **`ecothrift/settings.py`**). Inventory management commands accept **`--database default|production`** and **`--no-input`** for scripted runs (e.g. **`scripts/deploy/run_production_backfill.bat`**).

### Changed

- **`Product.generate_product_number`** / **`Item.generate_sku`** — when saving with **`using=`**, sequence queries target that database (avoids **`PRD-*` / `ITM*` collisions** when backfilling to a non-default alias).
- **`backfill_phase2_products_manifests`** — **`IntegrityError`** around product saves; **bulk_create** with **`ignore_conflicts`** and smaller batches for remote; **`ManifestRow`** / **`Item`** **`bulk_create`** use **`.using(db)`** (not invalid **`using=`** kwarg).
- **`backfill_phase5_categories`** **`--map-v1`** — progress logging + **`stdout.flush()`**; batch size **500** on **`production`**; **`.only()`** on item querysets to reduce payload over the wire.
- **`classify_v2_iterate`**, **`classify_v2_status`**, **`classify_v2_validate`** — **`--database`** / **`--no-input`** ( **`command_db`** pattern).

### Fixed

- **Data migrations:** PO retail/cost corrections (**WAL135287**, **TGT126675**, **WFR10979**, **CST423585**, **AMZ24714**); **retag category inheritance** for **`RETAGGED_FROM_DB2:`** notes.
- **Pink-tag loads** — **`compute_item_cost`** uses alternate allocation when PO fulfillment rate is below **0.15**.
- **Production hygiene:** legacy **HISTORICAL** rows removed; **`Item.retail_value`** populated; **cost pipeline** (**vendor metrics**, **PO analysis**, **item cost**) run on production.

---

## [2.11.0] — 2026-04-11

User-facing theme: **Acquisition cost pipeline hardened** — vendor merge, shrink vs misfit decomposition, nightly recompute on Heroku.

### Added

- **`Vendor.misfit_rate`** — Estimated share of PO retail gap from untracked/misfit sales (marketplace vendors only); **`shrinkage_rate`** now means **true** shrink after that share is removed. **`compute_vendor_metrics`** uses global decomposition (orphan POS lines vs missing retail) for codes `AMZ`, `CST`, `ESS`, `HMD`, `TRGET`, `WAL`, `WFR`; other vendors keep legacy composite shrinkage with `misfit_rate` null.
- **Data migration** [`0018_merge_tgt_into_trget`](apps/inventory/migrations/0018_merge_tgt_into_trget.py) — Reassigns `PurchaseOrder`, `CSVTemplate`, and `VendorProductRef` from duplicate Target vendor **TGT** to canonical **TRGET**; **`TGT`** row retained with **`is_active=False`**.

### Changed

- **v2.10.0 cleanup (themes in this release notes bundle):** SKU / product number sequencing fix, retag scaffolding removal, historical transaction HT filter, AI cleanup cancel race, vendor prefix investigation.
- **`Item.retail_value`** field (populated from legacy DBs via **`populate_item_retail_value`**); **`Item.cost`** repurposed as **allocated acquisition cost** (was incorrectly used for retail in older flows).
- **Cost pipeline:** **`compute_vendor_metrics`**, **`compute_po_cost_analysis`**, **`compute_item_cost`**, wrapper **`recompute_cost_pipeline`**; Heroku Scheduler runs **`python manage.py recompute_cost_pipeline`** nightly.

---

## [2.10.0] — 2026-04-11

User-facing theme: **Buying dashboards and category need reflect ~3 years of real historical inventory and sales** after the V1/V2 backfill and taxonomy pipeline (local database where the backfill was run).

### Added

- **Data backfill — Phase 5 (V2 classification + pricing):** [`backfill_phase5_categories`](apps/inventory/management/commands/backfill_phase5_categories.py) — V1 `--map-v1`; V2 CSV export/import; conservative **`--preclassify-v2`**; **[`classify_v2_iterate`](apps/inventory/management/commands/classify_v2_iterate.py)** (`--sample`, `--apply`, `--status`, `--apply-manual`) for iterative regex rules + manual `product_id` overrides; **`PricingRule`** recomputation from sold BACKFILL items. See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 6.
- **Phase 5 (continued):** All **19** `PricingRule` categories with data-backed sell-through; `recompute_buying_valuations` over backfilled auctions.
- **Phase 6 (verification):** Category-need API and admin counts verified against loaded data; release gate `manage.py check` + `tsc --noEmit`.

### Added (Phases 0–4, same release)

- **Data backfill (Phase 4):** [`backfill_phase4_sales`](apps/inventory/management/commands/backfill_phase4_sales.py) — load V1/V2 `cart` / `cart_line` and V2 `pos_cart` / `pos_cart_line` into V3 **`Cart`** / **`CartLine`**; `WorkLocation` "Eco-Thrift Main", Register **`BACKFILL`**, system user `backfill@system.local`, one **`Drawer`** per Chicago sale date; payment aggregation; V2 cashier map via legacy `core_user.email`; update BACKFILL **`Item`** `sold_at` / `sold_for` / `status=sold` from lines; flags `--clean`, `--reset-item-sales`, `--delete-historical-transactions`, `--dry-run`, `--limit`, `--skip-v1` / `--skip-v2`, `--skip-item-updates`. See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 5.
- **Data backfill (Phase 3):** [`backfill_phase3_items`](apps/inventory/management/commands/backfill_phase3_items.py) — load V1/V2 historical `Item` rows from **`ecothrift_v1`** / **`ecothrift_v2`** (`psycopg2`); lookup maps from Phase 1–2 `Product` / `PurchaseOrder`; `bulk_create` with precomputed `search_text`; idempotent `BACKFILL:v1:{code}` / `BACKFILL:v2:{id}` notes; Misfit PO fallbacks; V2 numeric `ITM…` SKUs prefixed `V2-`; `--dry-run`, `--limit`, `--skip-v1` / `--skip-v2`. See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 4.
- **Data backfill (Phase 2):** [`backfill_phase2_products_manifests`](apps/inventory/management/commands/backfill_phase2_products_manifests.py) — load V1/V2 `Product` and `ManifestRow` from **`ecothrift_v1`** / **`ecothrift_v2`**; products via `save()` for `PRD-*`; manifest rows `bulk_create`; PO linkage; `category` + `specifications` legacy fields; idempotent on `BACKFILL:` tags. See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 3.
- **Data backfill (Phase 1):** [`backfill_phase1_vendors_pos`](apps/inventory/management/commands/backfill_phase1_vendors_pos.py) — load V1/V2 vendors and purchase orders from legacy PostgreSQL databases **`ecothrift_v1`** / **`ecothrift_v2`** (raw `psycopg2`, same `DATABASE_*` as V3); idempotent `get_or_create`; inline description metadata as JSON on the last line of `notes` (after optional legacy V2 plain-text lines). See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 2.
- **Data backfill (Phase 0):** [`setup_misfit_backfill_pos`](apps/inventory/management/commands/setup_misfit_backfill_pos.py) — vendor **MIS** (“The Island of Misfit Items”) and placeholder POs **MISFIT-V1-2024** / **MISFIT-V2-2025** for orphan items. [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) — removed ~146.9k `HISTORICAL:db1:`/`HISTORICAL:db2:` `inventory_item` rows; preserved 9,009 real V3 items; `pos_cart` / `pos_cartline` counts unchanged.

### Changed

- **POS reporting:** [`historical_revenue`](apps/pos/views.py) excludes carts on register **`BACKFILL`** from db3 aggregates while **`HistoricalTransaction`** rows exist for db1/db2 (avoids double-counting legacy totals vs `import_historical_transactions`). After deleting db1/db2 historical rows or loading only via Phase 4, totals reflect Carts.
- **Data backfill initiative (Phase 0 close / consultant pass):** Production deployment strategy (export CSVs + `import_backfill`); Phase 1–5 text corrections (inline PO enrichment, verify `PurchaseOrder` mappings before code, product dedup evaluation, backfilled items never `on_shelf`, taxonomy label count unverified). [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md). Added [`workspace/scripts/convert_pickles_to_csv.py`](workspace/scripts/convert_pickles_to_csv.py) — pickle→CSV using `pickle/manifest.json` (run in notebook venv if `read_pickle` fails).
- **AI steering / protocols:** Replaced **`review.0.Bump.md`** with **`session.9.Close.md`**; rewrote **`code.0.Startup.md`** (session entry step) and **`code.1.Bearing.md`** (progress vs written session). Generalized consultant bundle workflow (today: **`extended/consultant_handoff.md`**). [`.ai/initiatives/_index.md`](.ai/initiatives/_index.md) uses **Phase** + **Notes** columns; session detail lives in initiative files only. [`.ai/context.md`](.ai/context.md) **Working** section is short capability pointers (detail in **`.ai/extended/`**). Cross-links updated (README, lifecycle protocols, CHANGELOG history where cited). Django admin vs React **`/admin/*`** and retag history serializer guardrails moved to [`.ai/extended/frontend.md`](.ai/extended/frontend.md) and [`.ai/extended/retag-operations.md`](.ai/extended/retag-operations.md).
- **Initiative archiving:** [docs_restructure](.ai/initiatives/_archived/_completed/docs_restructure.md) archived as **completed**; [historical_sell_through_analysis](.ai/initiatives/_archived/_pending/historical_sell_through_analysis.md) moved to **pending** (initial rates seeded manually v2.8.0; data-backed refinement deferred). Session history seeded in initiative files.
- **AI steering / protocols (follow-up):** Added [`.ai/protocols/session.1.Checkpoint.md`](.ai/protocols/session.1.Checkpoint.md) for **mid-session** pulses (session updates, **`[Unreleased]`**, light extended-doc sync). **`code.0.Startup.md`** now includes **framing questions** (success, intent, time, owner, out-of-scope, ship expectation) and points to checkpoints vs **`session_close`**. **`README`**, **`context`**, **`get_bearing`**, **`session_close`** cross-links updated.

### Fixed

- **Data backfill (Phase 3):** [`backfill_phase3_items`](apps/inventory/management/commands/backfill_phase3_items.py) — V1 `SELECT` no longer `JOIN`s `product` on `code` when multiple legacy `product` rows share a code (use `LATERAL … LIMIT 1`); avoids duplicate result rows and bogus `skipped_exists`. Dry-run reports **`would_create`** instead of inflating **`created`**; **`bulk_create`** errors are logged and re-raised. [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 4 close.

### Initiative

- [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) — Phases **0–6** complete on loaded DB (**v2.10.0**); production CSV export / `import_backfill` deployment still deferred.

---

## [2.9.0] — 2026-04-09

### Added

- **Buying — Phase 5 (React UI):** [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — **Auction list** (`/buying/auctions`): valuation **DataGrid** columns — **Profitability** / **Need** pills, **Est. revenue**, **Retail** (manifest vs listing tooltip), **Priority** with Admin **steppers**, **Thumbs up** toggle (Admin), **Time left** with color bands; default server sort **`-priority,end_time`**. **Filter chips** (server-side **`AuctionFilter`** / **`WatchlistAuctionFilter`**): **Profitable**, **Needed**, **Thumbs up**, **Watched**, **Has manifest** — multi-select with Ctrl/⌘ (plain click isolates / clears per row semantics); **marketplace** chips: **All** first, Ctrl/⌘ multi-vendor; layout: **Filters** + **Clear all**, then marketplace row, then filter row; mobile-scaled chips. **Category need panel** (desktop **`md+`**): **Min** / **Window** / **Full** sizing, bar charts, category detail, staff **want vote** slider (debounced). **Auction detail:** **AuctionValuationCard** (full computation breakdown, revenue/fees/shipping/shrinkage/profit-target/priority overrides, **max bid** line), **AiManifestComparisonStrip** when both AI and manifest mix exist. **Watchlist** row tint on main list (≤**100** watchlist IDs for tint query). **Mobile** list: scaled chips, time formatting, infinite scroll. **React Query:** `placeholderData: keepPreviousData` on auction + watchlist list queries so **server pagination** stays stable when the page param changes. **API:** **`GET /api/buying/category-need/`** category rows include **`sell_through_rate`**; list params **`profitable`**, **`needed`**; **`GET /api/buying/watchlist/`** accepts **`marketplace`**, **`status`**, **`has_manifest`**, **`profitable`**, **`needed`**, **`thumbs_up`** (watchlist filter parity with main list). **Backend:** `WatchlistAuctionFilter` extended for **`profitable`**, **`needed`**, **`thumbs_up`**; manifest-based **`has_manifest`** filtering aligned with list queryset.

### Fixed

- **Buying:** Pagination **snap-back** on alternate “next page” clicks (grid saw **`rowCount: 0`** while the next page was loading); **has_manifest** filter uses manifest-row existence consistently; **category distribution** mix math; want-vote slider **debouncing**.

### Changed

- **Buying — B-Stock JWT calls:** Token-backed **HTTP from the REST API** is **disabled** (`501` / `token_backed_bstock_disabled` on **`pull_manifest`**, **`poll`**, etc.) — **CSV upload** and soft-touch sweep remain; ban-risk mitigation (see [`apps/buying/api_views.py`](apps/buying/api_views.py)). **Management commands** may still be run manually where applicable.

### Notes (documentation)

- **Parking lot** entries in the initiative file (data backfill, **Groq** cost idea, **`ai_key_mapping.py`** → **`AI_MODEL_FAST`** one-liner, **`ai_key_mapping.py`** model-discussion follow-up). **AI steering:** tooltips on multi-select chips are one short platform-aware line (**`multiSelectChipTooltip`**).

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — Phase **5** **React UI** shipped (**v2.9.0**); **Phase 6** (outcomes) next.

---

## [2.8.0] — 2026-04-09

### Added

- **Buying — Phase 5 (auction valuation):** **`PricingRule`** (flat **`sell_through_rate`** per taxonomy_v1 category — **19** categories; **no** vendor × category matrix; model shape unchanged) and **`CategoryWantVote`** (staff **`value`** 1–10 per category, **`voted_at`**). **`Auction`** valuation fields: **`ai_category_estimates`**, **`manifest_category_distribution`**, **`estimated_revenue`**, **`revenue_override`**, **`fees_override`**, **`shipping_override`**, **`estimated_fees`**, **`estimated_shipping`**, **`estimated_total_cost`**, **`profitability_ratio`**, **`need_score`**, **`shrinkage_override`**, **`profit_target_override`**, **`priority`**, **`priority_override`**, **`thumbs_up`**. **`Marketplace`** defaults: **`default_fee_rate`**, **`default_shipping_rate`**. Migrations **`0009_phase5_auction_valuation`**, **`0010_auction_fee_shipping_overrides`**.
- **Valuation engine:** **`apps/buying/services/valuation.py`** — **`recompute_auction_valuation`**, **`recompute_all_open_auctions`**, **`compute_and_save_manifest_distribution`**, **`get_valuation_source`**, **`run_ai_estimate_for_swept_auctions`**; retail base from manifest sum or **`total_retail_value`**; **`estimated_revenue`** stored **pre-shrinkage**; **`profitability_ratio`** uses **effective revenue after shrinkage** vs **`estimated_total_cost`**; **`revenue_override`** / **`fees_override`** / **`shipping_override`** semantics per initiative (**`coalesce`** for revenue; fee/shipping overrides **USD** only when set).
- **AI title category estimation:** **`apps/buying/services/ai_title_category_estimate.py`** — **`estimate_batch`** with **`AI_MODEL_FAST`**, few-shot from marketplace, batch rows keyed by **`auction_id`** (historical **`title_echo`** check removed in v2.15.3).
- **Category need / want:** **`GET /api/buying/category-need/`**; **`GET`/`POST /api/buying/category-want/`** with **`effective_value`** (step decay toward **5** per **`buying_want_vote_decay_per_day`**). **`apps/buying/services/category_need.py`**, **`want_vote.py`**, **`buying_settings.py`**.
- **Staff controls & serializers:** **`POST`/`DELETE /api/buying/auctions/{id}/thumbs-up/`** (Admin); **`PATCH /api/buying/auctions/{id}/valuation-inputs/`** (Admin) — **recompute** on change. **`AuctionFilter`** **`thumbs_up`**; list **`ordering`** includes **`priority`**, **`estimated_revenue`**, **`profitability_ratio`**, **`need_score`**; list/detail serializers expose **`valuation_source`**, **`has_revenue_override`**, **`effective_revenue_after_shrink`**, etc.
- **Seeds & management commands:** **`python manage.py seed_pricing_rules`** (CSV + **`AppSetting`** keys); **`python manage.py seed_marketplace_pricing_defaults`**; **`python manage.py estimate_auction_categories`**; **`python manage.py recompute_buying_valuations`**.
- **Manifest upload hooks:** **`manifest_upload`** computes **`manifest_category_distribution`** and triggers valuation **recompute** when mapping completes (**`upload_manifest`**, **`map_fast_cat_batch`** when queue clears, **`DELETE …/manifest/`**); **`pipeline`** sweep runs limited AI estimate batch + **`recompute_all_open_auctions`**.
- **Tests:** **`apps/buying/tests/test_valuation.py`**, **`apps/buying/tests/test_phase5_category_need.py`**.
- **Documentation & AI steering:** New protocol [`.ai/protocols/code.1.Bearing.md`](.ai/protocols/code.1.Bearing.md); consultant bundle procedure now [`.ai/extended/consultant_handoff.md`](.ai/extended/consultant_handoff.md); personas [`.ai/personas/Scout.md`](.ai/personas/Scout.md), [`.ai/personas/Christina.md`](.ai/personas/Christina.md); updates to **`.ai/context.md`**, **`.ai/extended/backend.md`**, **`.ai/extended/bstock.md`**, **`.ai/extended/frontend.md`**, **`.ai/consultant_context.md`**, **`.ai/initiatives/_index.md`**, **`bstock_auction_intelligence.md`**.

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — Phase **5** backend/API shipped; **next:** Phase **5** React valuation columns (optional) or **Phase 6** outcomes.

---

## [2.7.1] — 2026-04-09

### Added

- **Historical sell-through — consultant PO export:** `python workspace/notes/to_consultant/extract_po_descriptions.py` reads Purchase Orders from local **V1** (`ecothrift_v1`), **V2** (`ecothrift_v2`), and **V3** when `public.inventory_purchaseorder` exists; writes **`workspace/notes/to_consultant/purchase_orders_all_details.csv`** (full PO-level rows, same columns as **`workspace/data/po_descriptions_all.csv`**), plus category distribution / sell-through join outputs and **`po_description_analysis.md`**. Requires root **`.env`** `DATABASE_*`; V3 yields zero rows until inventory migrations / correct DB. Script is tracked in git (see **`.gitignore`** whitelist under **`workspace/notes/to_consultant/`**).

### Changed

- **`.gitignore`:** Whitelist **`workspace/notes/to_consultant/extract_po_descriptions.py`** so the consultant extract is versioned; generated CSV/Markdown under that folder remain ignored.

### Initiative

- [`.ai/initiatives/_archived/_pending/historical_sell_through_analysis.md`](.ai/initiatives/_archived/_pending/historical_sell_through_analysis.md) — tooling toward Phase **3** (sales join); consultant deliverable path documented.

**Note (2026-04-16):** The **`workspace/notes/to_consultant/`** layout and **`.gitignore`** whitelist in the bullets above matched **v2.7.1** at release; later cleanup moved consultant procedures to **`extended/consultant_handoff.md`** and dropped **`workspace/notes/`** tracking. CSV outputs are **`workspace/data/`**.

---

## [2.7.0] — 2026-04-08

### Added

- **Buying — Phase 4.1B (AI template creation, AI key mapping, upload progress):** Unknown CSV headers → Claude proposes **`column_map`** and **`category_fields`**; new or matched **`ManifestTemplate`** saved with **`is_reviewed=True`**; upload continues in one flow. **`POST /api/buying/auctions/{id}/map_fast_cat_batch/`** processes up to **10** unmapped **`fast_cat_key`** values per request; persists **`CategoryMapping`** with **`rule_origin='ai'`** and updates **`ManifestRow.fast_cat_value`**. **`POST …/upload_manifest/`** Stage **1** (template + rows, synchronous) returns **`unmapped_key_count`** and **`total_batches`**. **`DELETE /api/buying/auctions/{id}/manifest/`** deletes manifest rows only (**`ManifestTemplate`** and **`CategoryMapping`** retained). **`fast_cat_key`** values containing **`__no_key__`** (no category fields on the row) are excluded from AI batches and from unmapped counts. See initiative.
- **AI usage logging:** Append-only **`workspace/logs/ai_usage.jsonl`** with **input** / **output** / **cache_creation** / **cache_read** token fields, **Decimal** cost from **`AI_PRICING`** in **`ecothrift/settings.py`**; **`log_ai_usage`** and **`log_ai_usage_from_response`** in **`apps/core/services/ai_usage_log.py`**; retrofitted across AI call sites (chat proxy, inventory AI, buying **`category_ai`**, management commands, 4.1B services). **`scripts/ai/summarize_ai_usage.py`** and **`scripts/ai/summarize_ai_usage.bat`** — totals, by source, by marketplace, by date, last **10** calls, cache stats, interactive clear.
- **Frontend — Buying:** **`ManifestUploadProgress`** and Stage **2** driver (**four** concurrent **`map_fast_cat_batch`** workers); progress bar, running estimated cost, latest mapping label, cancel; **debounced** React Query invalidation (~**1** s) for live **Manifest Rows** and category mix; **Remove manifest** inside manifest card with confirmation; drop/replace controls hidden while **`mapping`**; two-column layout aligned with flex (**`flex: 1`** manifest content card). **`frontend/src/components/buying/ManifestUploadProgress.tsx`**, **`AuctionDetailPage`**.

### Changed

- **Settings / pricing:** **`AI_MODEL`**, **`AI_MODEL_FAST`** (from **`.env`** with defaults in **`ecothrift/settings.py`**); **`AI_PRICING`** per-model rates (Sonnet, Opus, Haiku — input, output, cache write, cache read per million tokens); **`BUYING_CATEGORY_AI_MODEL`** unified as alias to **`AI_MODEL`**. Prompt caching via **`cache_control: {"type": "ephemeral"}`** on system content blocks. **`.env.example`** updated.

### Notes (documented, non-blocking)

- **`DELETE manifest`:** TODO on wrong-marketplace CSV leaving stale AI **`CategoryMapping`** prefixes after row removal — future admin tooling or **`purge_ai_mappings`** option ([`apps/buying/api_views.py`](apps/buying/api_views.py)).
- **Cache hit rate ~0** on fast-cat key batches: prompts under Sonnet **2048**-token minimum cache threshold; no action required.

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — Phase **4.1B** shipped; **next: Phase 5** (auction valuation).

---

## [2.6.1] — 2026-04-10

### Added

- **Buying — Phase 4.1A (manifest templates, `fast_cat_key`, static seed):** `ManifestTemplate` model; **`POST /api/buying/auctions/{id}/upload_manifest/`** (multipart CSV); template detection + **`python manage.py seed_fast_cat_mappings`** (343 vendor `fast_cat_key` → taxonomy_v1 rows, fully inlined — no workspace file dependency). See initiative.

### Changed

- **Buying — auction list UI:** All DataGrid columns sortable (including marketplace, title, condition, status, manifest); **Total retail** shows whole dollars with **manifest sum vs listing sweep** via API fields **`total_retail_display`** / **`retail_source`** (tooltip); **Manifest** column shows row count when present; marketplace chip UX: single-click isolates one vendor, **Ctrl/⌘+click** multi-select, helper copy + info tooltip; React Query **refetchOnMount** for auction list and summary so returning from detail shows fresh manifest flags.
- **Buying — auction detail UI:** Two-column layout (metadata card | manifest card); **Open on B-Stock** link lives under manifest drop zone; **Has manifest** badge driven by row count; category mix bar shows **all** canonical categories (no rolled-up “Other”); manifest table **search** + **fast category** filter (server-side **`search`** / **`category`** on **`GET …/manifest_rows/`**).
- **Buying — API:** List queryset annotates manifest retail sum and **`retail_sort`** for ordering; auction detail **`category_distribution`** returns full category list; successful CSV upload sets **`Auction.has_manifest`**.

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — Phase **4.1A** manifest upload + fast-cat seed shipped; Phase **5** (valuation) still next.

---

## [2.6.0] — 2026-04-10

### Added

- **Buying — Phase 3 (watchlist polling, snapshots, price history):** **`python manage.py watch_auctions`**; **`GET /api/buying/auctions/{id}/snapshots/`**; **`POST /api/buying/auctions/{id}/poll/`**; auction detail price chart (Recharts) / table on small screens; **`AuctionSnapshot`** time series.

- **Buying — Phase 4 (fast categorization):** **`CategoryMapping`** model; **`ManifestRow.canonical_category`** / **`category_confidence`**; **`apps/buying/taxonomy_v1.py`**; **`seed_category_mappings`**, **`categorize_manifests`** (tier 1 + 3; **`--ai`** / **`--ai-limit`** for Claude tier 2); **`categorize_manifest_rows`** after manifest pull; API **`category_distribution`**; auction detail **category bar** + **chips**.

### Fixed

- **Buying — manifest retail:** **`normalize.py`** converts B-Stock minor-unit integers to dollars where applicable (**`_manifest_retail_to_dollars`**); **`renormalize_manifest_rows`** reapplies to existing rows.

### Changed

- **Initiative** [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md): Phases **3–4** acceptance complete; **Phase 7** removed from phased plan; **Operational notes** (soft-touch vs invasive sweep, manual manifest path, ban mitigation); **Open questions** updated (ban risk, retrospective deferred). **Consultant:** [`.ai/consultant_context.md`](.ai/consultant_context.md) aligned.

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — **Phases 3–4 complete.** **Next: Phase 5** (auction valuation).

---

## [2.5.0] — 2026-04-08

### Added

- **Buying — Phase 2 close-out (2B auction detail, 2C watchlist page, manifest normalization):** Staff React routes **`/buying/auctions/:id`** (`AuctionDetailPage`) and **`/buying/watchlist`** (`WatchlistPage`); sidebar **Buying** links **Auctions** + **Watchlist**. Detail: metadata, pull manifest, star watchlist toggle, manifest **DataGrid** (server pagination, 50/page) or mobile cards + load more. **Watchlist:** **`GET /api/buying/watchlist/`** (auction list shape + nested **`watchlist_entry`**, filters **`priority`** / **`watchlist_status`**, ordering **`end_time`**, **`current_price`**, **`total_retail_value`**, **`added_at`**; default **`end_time`** ascending); remove via existing **`DELETE /api/buying/auctions/:id/watchlist/`** with list invalidation. **Manifest normalization:** **`apps/buying/services/normalize.py`** maps B-Stock order-process JSON (nested **`attributes`**, **`attributes.ids`**, **`uniqueIds`**, **`categories`**, **`itemCondition`**, etc.); optional unmapped-key warnings; **`python manage.py renormalize_manifest_rows`** (no JWT). Unit tests: **`apps/buying/tests/test_normalize_manifest.py`**.

### Changed

- **Phase 2A** (auction list UI) shipped in **v2.4.1**; this minor release completes **Phase 2** under [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md).

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — **Phase 2 (2A–2C) complete.** Next: **Phase 3** (watchlist polling, **`AuctionSnapshot`**, price history).

---

## [2.4.1] — 2026-04-08

### Added

- **Buying — auction list API (staff):** **`GET /api/buying/auctions/`** (paginated, filters, ordering), **`GET /api/buying/auctions/:id/`**, **`GET /api/buying/marketplaces/`**, **`GET /api/buying/auctions/summary/`** (global `last_refreshed_at` + per-marketplace counts), **`POST /api/buying/sweep/`** (runs `pipeline.run_discovery`). **`AuctionFilter`:** `marketplace` accepts comma-separated slugs (`__in`). Contract listings (`listingType` **CONTRACT**) excluded from default list queryset; detail by id still allowed. Model fields **`listing_type`**, **`total_retail_value`** (from B-Stock search `listingType` / `retailPrice`); migration **`0004_auction_listing_type_total_retail`**.

### Changed

- **Frontend — Buying:** Staff routes **`/buying/auctions`** — DataGrid (desktop) + card list with infinite scroll (below **`md`**); marketplace chips as toggle filters with **All** reset (tap last-only chip resets all); global summary counts; last-refreshed label; sequential **Refresh auctions** per marketplace with progress text, spinner, snackbar (partial failures listed); **Load more (N remaining)** on mobile. Shared helpers **`frontend/src/utils/buyingAuctionList.ts`**; split **`AuctionListDesktop`**, **`AuctionListMobile`**, **`AuctionMarketplaceChips`**; **`useBuyingAuctionsInfinite`**. Removed unused **`useBuyingSweep`** hook (sweep calls **`postBuyingSweep`** directly).

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — Phase 2A auction list shipped; Phase 2B detail / manifests / watchlist next.

---

## [2.4.0] — 2026-04-07

### Added

- **Buying / B-Stock (Phase 1 complete):** Django app **`apps/buying/`** with models, services (**`scraper`**, **`pipeline`**, **`normalize`**), management commands **`sweep_auctions`**, **`pull_manifests`**, **`bstock_token`**; **`POST /api/buying/token/`** (DEBUG or localhost) writes **`workspace/.bstock_token`**; rejects JWE cookie tokens (`eyJhbGciOiJSU0EtT0FF`). **`scripts/refresh_bstock.bat`**. Bookmarklet and docs: **`apps/buying/bookmarklet/bstock_elt_bookmarklet.md`**. Notebook workbench: **`.ai/extended/development.md (Jupyter)`**. Initiative: [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md).

### Changed

- **Buying / B-Stock scraper:** Microservice URLs (`search.bstock.com`, `auction.bstock.com`, `listing.bstock.com`, `order-process.bstock.com`, `shipment.bstock.com`). Settings: **`BSTOCK_AUTH_TOKEN`**, **`BUYING_REQUEST_DELAY_SECONDS`**, **`BSTOCK_MAX_RETRIES`**, **`BSTOCK_SEARCH_MAX_PAGES`**. **`DEBUG`** CORS adds **`https://bstock.com`** / **`https://www.bstock.com`** for bookmarklet **`fetch`**. **`get_manifest`**: **`limit`** capped at **1000** per request; paginates with **`offset`** until **`total`** rows. Search listing mapping: **`categories`**, **`winningBidAmount`**, **`numberOfBids`**, **`auctionUrl`**, **`has_manifest`** when **`lotId`** is set; **`merge_auction_state_into_fields`** fills **`startPrice`**, **`buyNow.price`**, **`winningBidAmount`**; money helper treats integers **>= 10000** as cents.

- **Docs / env:** **`.env.example`**, **`.ai/extended/backend.md`**, **`.ai/extended/development.md`**, **`.ai/context.md`**, **`README.md`**, **`.ai/extended/development.md`** (Jupyter), **`.ai/initiatives/_index.md`** (B-Stock row).

### Baseline (release verification)

- **`python manage.py sweep_auctions`:** **97** listing rows upserted across **6** active marketplaces (full pagination run).
- **`python manage.py pull_manifests`:** ran; **0** new manifest rows written in this run (existing rows already present for eligible auctions).
- **Postgres snapshot after sweep:** **98** `Auction` rows, **67,276** `ManifestRow` rows (cumulative across this and prior sessions).

---

## [2.3.0] — 2026-04-07

### Added

- **Buying / B-Stock (Phase 1):** New Django app **`apps/buying/`** for auction intelligence: models `Marketplace`, `Auction`, `AuctionSnapshot`, `ManifestRow`, `WatchlistEntry`, `Bid`, `Outcome`; server-side services **`discover_auctions`**, **`get_auction_detail`**, **`get_manifest`** (manifest URL optional until DevTools capture); **`python manage.py sweep_auctions`** and **`python manage.py pull_manifests`**; Postgres-backed persistence; Django admin registration. Configuration via **`BSTOCK_*`** and **`BUYING_REQUEST_DELAY_SECONDS`** in `.env` (see **`.env.example`**). Explicit **`requests`** dependency in **`requirements.txt`**. Notebook workbench: **`.ai/extended/development.md (Jupyter)`**. Initiative: [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md).

---

## [2.2.10] — 2026-04-07

### Changed

- **Category research — single-database exports:** **`export_category_bins`** uses Django’s **`default`** connection only. Bins 1–2 run schema-qualified SQL against **`public.*`** (V2-era inventory/POS); Bin 3 uses **`ecothrift.*`**. Removed optional **`DATABASES['legacy']`** / **`CATEGORY_LEGACY_DATABASE_NAME`** from settings — one Postgres database can hold both schemas. SQL script headers and **`workspace/testing/Category Research/`** docs updated accordingly. Initiative (now archived): [`.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md`](.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md).

---

## [2.2.9] — 2026-04-06

### Added

- **POS — unscannable (pink tag) line:** **`POST /api/pos/carts/{id}/add-manual-line/`** adds a cart line **without** an inventory item (`item` null): `description` (required), optional `unit_price` (default **0.50**), optional `quantity` (default 1). Rejects non-open carts. No `ItemScanHistory` row. Terminal: **Unscannable item** button, dialog (defaults **Pink Tag Item** / **0.50**), description field selected on open, **OK** / Enter submits; cart lines show a **Pink tag** chip when `item` is null. Tests: `apps/pos/tests/test_cart_manual_line.py`. Initiative: [`.ai/initiatives/_archived/_completed/pos_unscannable_manual_line.md`](.ai/initiatives/_archived/_completed/pos_unscannable_manual_line.md).

---

## [2.2.8] — 2026-04-06

### Added

- **POS — sold SKU and resale copy:** Scanning a sold unit returns structured errors (`ITEM_ALREADY_SOLD`, `sku`, `title`). **`ItemScanHistory`** extended with `outcome`, optional `cart` and `created_by`; blocked scans log `pos_blocked_sold`. **`POST /api/pos/carts/{id}/add-resale-copy/`** atomically duplicates a sold item for resale ([`apps/inventory/services/resale_duplicate.py`](apps/inventory/services/resale_duplicate.py)) and adds a line with **`resale_source_sku`** / **`resale_source_item_id`** for staff reporting. Terminal: modal (**Cancel** vs **Create copy and add to cart**). Transactions detail (`/pos/transactions`) shows a staff-only resale caption; printed receipts use normal line **description** only (no internal provenance on the customer copy). Tests: `apps/pos/tests/test_cart_add_item_audit.py`, `test_cart_add_resale_copy.py`. Initiative: [`.ai/initiatives/pos_sold_item_scan_ux_and_audit_trail.md`](.ai/initiatives/pos_sold_item_scan_ux_and_audit_trail.md).

### Deployment

- **Migrations:** apply `inventory` (ItemScanHistory) and `pos` (CartLine resale columns): `python manage.py migrate`.

---

## [2.2.7] — 2026-04-06

### Fixed

- **POS — cart totals:** `Cart.recalculate()` now sums line totals from the database instead of `cart.lines.all()`, which could reuse a stale `prefetch_related` cache after `add-item` or line edits so header/footer totals lagged line rows. Regression tests: `apps/pos/tests/test_cart_totals.py`. Initiative: [`.ai/initiatives/pos_cart_total_stale_prefetch_bug.md`](.ai/initiatives/pos_cart_total_stale_prefetch_bug.md). For local runs without a PostgreSQL test database, use `python manage.py test apps.pos.tests --settings=ecothrift.test_settings` (SQLite in-memory via [`ecothrift/test_settings.py`](ecothrift/test_settings.py)).

- **Routing — Django admin vs React `/admin/*`:** Django **`contrib.admin`** moved from **`/admin/`** to **`/db-admin/`** so hard refresh and direct URLs to in-app pages (e.g. **`/admin/settings`**, **`/admin/users`**) load the React SPA instead of Django’s admin login. Production SPA fallback no longer excludes **`admin/`**; Vite dev proxy targets **`/db-admin`** only. Exact **`/admin`** / **`/admin/`** redirects to **`/db-admin/`** for bookmarks to the old Django admin root. Superusers who used Django Admin at **`/admin/`** should open **`/db-admin/`**. Initiative (archived completed): [`.ai/initiatives/_archived/_completed/django_admin_legacy_navigation.md`](.ai/initiatives/_archived/_completed/django_admin_legacy_navigation.md).

---

## [2.2.6] — 2026-03-31

### Changed

- **Inventory — Retag:** After a successful multi-unit tag (**Labels / qty** > 1), the qty control resets to **1** for the next scan. **Outside initiative** — UX polish (`RetagPage.tsx`).

---

## [2.2.5] — 2026-03-31

### Added

- **Inventory — Retag:** **Labels / qty** (1–50) on **`/inventory/retag`** creates that many new DB3 items (unique SKUs, one `RetagLog` per unit) per scan or manual confirm. **`POST /api/inventory/retag/v2/create/`** accepts optional **`quantity`** (default 1) and returns **`created`** (per-item `new_sku` + `print_payload`). The browser prints each label with the existing local print server **`POST /print/label`** only, staggered **200 ms** between jobs (no new print-server routes).

---

## [2.2.4] — 2026-03-28

### Fixed

- **Layout — sidebar:** Prevent horizontal scrollbars in the left nav: drawer paper and scroll region use **`overflow-x: hidden`**; nav list is full-width with **`minWidth: 0`**; long labels **ellipsis**; section chevrons and icons **`flexShrink: 0`**. **Outside initiative** — UI polish only (`MainLayout.tsx`, `Sidebar.tsx`).

---

## [2.2.3] — 2026-03-28

### Added

- **Inventory — Item detail:** After **Save**, if **price**, **title**, or **brand** changed, a **non-blocking warning banner** (fade + auto-dismiss) recommends **reprinting the label**, with a **Reprint label** action. Initiative closure: [`.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md`](.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md).

### Changed

- **Inventory — Quick Reprice:** **Default 10%** off current price; radio/helper copy updated; **Discount Settings** remains **above** the scan row. **“This Session”** still titled that way; list + totals persist **this browser · local calendar day** (`localStorage`, new list after **local midnight**). Subtle caption under the card explains scope.

---

## [2.2.2] — 2026-03-27

### Added

- **Steering:** Initiative **archiving** requires **explicit user approval** (documented in [`.ai/initiatives/_index.md`](.ai/initiatives/_index.md), [`_archived/ARCHIVE.md`](.ai/initiatives/_archived/ARCHIVE.md), [`.ai/protocols/code.0.Startup.md`](.ai/protocols/code.0.Startup.md), [`.ai/protocols/session.9.Close.md`](.ai/protocols/session.9.Close.md), [`.ai/context.md`](.ai/context.md)). Initiative [`e2e_retag_quick_reprice_fixes.md`](.ai/initiatives/e2e_retag_quick_reprice_fixes.md) **restored** to the active index with expanded scope *(now archived as [completed](.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md)).*
- **Inventory — Quick reprice (sold units):** **`POST /api/inventory/items/:id/duplicate-for-resale/`** (staff) creates a new **on-shelf** item from a **sold** row; **`POST /api/inventory/items/:id/mark-on-shelf/`** (Manager/Admin) when no completed POS sale exists. **Quick Reprice** dialog: **Create unsold copy & reprice**, **Mark on shelf again**, **Cancel**.
- **Inventory — Quick reprice UX:** **This Session** card with **expand/collapse** (chevron) listing all repriced items with links to **`/inventory/items/:id`**. **`?sku=`** query prefill when opening Quick Reprice from item detail.
- **Inventory — Item detail:** **Print tag** and **Reprice** (deep-link to Quick Reprice with `?sku=`). Initiative: [`e2e_retag_quick_reprice_fixes.md`](.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md).

### Fixed

- **Inventory — Quick reprice:** Item list ignored `?sku=` (DRF search uses `search`, not `sku`). Added exact **`sku`** to `ItemViewSet` filterset fields so scans resolve the correct row. **Quick Reprice** uses the shared API client, normalizes SKU, shows **status**, blocks non-sellable statuses; **`POST .../quick-reprice/`** rejects disallowed statuses with HTTP 400.
- **Inventory — Retag history:** History fetch failures show an error alert; summary tiles distinguish **all-time totals** vs **tags this visit** vs **this session only** (server log count).

### Changed

- **Initiatives layout:** Replaced `.ai/plans/` with `.ai/initiatives/` (main `_index`, `_archived/` buckets). Updated `.ai/context.md`, protocols, extended docs, notebook links.
- **Documentation layout:** Setup in `.ai/extended/development.md`; removed standalone `docs/` tree from prior layout; E2E checklist under `workspace/testing/`.

---

## [2.2.1] — 2026-03-25

### Added
- **Print server Windows installer:** `cleanup_legacy_prior()` in `printserver/installer/setup.py` removes legacy V2 stack (Startup `Eco-Thrift Print Server.vbs`, `C:\DashPrintServer` / `C:\PrintServer` when `print_server.py` + `venv\` exist) and frees port 8888 before installing V3; same cleanup runs at start of uninstall. Optional IT batch: `printserver/installer/uninstall_legacy_prior.bat`.
- **Print server** bumped to **1.0.7** (`printserver/config.py`, `CHANGELOG`) for the installer change.

### Changed
- **AI / steering docs:** `.ai/extended/print-server.md`, `.ai/plans/print_server_v3_testing_and_migration.md`, `.ai/reference/PrintServer (V2)/LEGACY_UNINSTALL.md` aligned with in-installer migration (no standalone `scripts/printserver_uninstall_all`); `.ai/context.md` and `README.md` updated.
- **`docs/development.md`:** Print server notes and layout table; this repo’s `docs/` tree may only contain this file plus any other paths you keep locally.

---

## [2.2.0] — 2026-03-25

### Added
- **B-Stock notebook scraper package:** `workspace/notebooks/Scraper/` with `BStockScraper` (`get_auctions`, `update`, `save_to_disk`), HTTP client + config loader, optional Playwright module (`python -m Scraper.browser`), experimental `refresh_token` helper, `examples/bstock_quickstart.ipynb`, CLI `python -m Scraper` when run from `workspace/notebooks`. Secrets in gitignored `Scraper/bstock_config_local.py` (template: `Scraper/config.example.py`).

### Changed
- **Notebooks docs:** `workspace/notebooks/` layout + `docs/development.md` updated for `Scraper/` layout; `.ai/plans/bstock_scraper.md` and plans index refreshed.

### Removed
- Flat B-Stock scripts at `workspace/notebooks/` root (`bstock_scraper.py`, `bstock_scraper_browser.py`, `bstock_refresh_token.py`, `bstock_config.example.py`) — replaced by the `Scraper` package.

---

## [2.1.0] — 2026-03-24

### Added
- **Purchase order reset safety:** `GET /api/inventory/orders/:id/delete-preview/` and `POST /api/inventory/orders/:id/purge-delete/` (order-number confirmation).
- **Preprocessing preview search:** Server-side search over full raw manifest and full standardized output (top-100 preview window per endpoint).
- **Project / AI layout (BEST-spec alignment):** Repo root `.version` and `CHANGELOG.md`; `.ai/protocols/` (`code.0.Startup.md`, `session.9.Close.md`, `code.1.Bearing.md`); `.ai/plans/_index.md` and `plans/archive/`; `.ai/reference/`; committed `scripts/dev/` (`start_servers.bat`, `kill_servers.bat`) and `scripts/deploy/commit_message.txt`.
- **Root spec:** `2.EcoThrift.project_build_spec.md` describing layout, versioning, and protocols.
- **Multi-DB Jupyter:** Tracked `workspace/notebooks/` (selective gitignore): `config.example.py`, `db_explorer.ipynb` — SQLAlchemy + pandas helpers, pickles dir ignored; optional `requirements-notebooks.txt` (includes former ML deps).
- **`.ai/extended/databases.md`:** DB1 / DB2 / DB3 overview; credentials stay out of repo; points to `docs/Database Audits/`.

### Changed
- **App version API:** `GET /api/core/system/version/` reads repo root `.version` only; response still includes `build_date` / `description` as null/empty (reserved).
- **Dependencies:** Merged `requirements-ml.txt` into `requirements-notebooks.txt`; updated `train_price_model`, `categorizer`, `docs/retag/after_retag.md`, and related docs.
- **Notebooks:** `db_explorer.ipynb` resolves notebook dir when Jupyter cwd is repo root; optional `NOTEBOOK_DIR` env; `config_local.py` (gitignored) can load `DATABASE_*` from project `.env`.
- **Preprocessing UI:** Multi-open 3-step accordion (upload → raw sample → standardize); taller default viewports for raw/standardized tables; Inventory and POS sidebar sections collapsible like HR.
- **Docs:** `README.md`, `docs/architecture.md`, `docs/development.md`, `docs/api-reference.md`, `.ai/context.md` updated for new paths and versioning.

### Removed
- `.ai/version.json` and `.ai/changelog.md` (superseded by root `.version` + `CHANGELOG.md`).
- `.ai/procedures/` (replaced by `.ai/protocols/` with merged content).
- `.ai/extended/TOC.md` (extended docs indexed by filename).
- `requirements-ml.txt` (merged into `requirements-notebooks.txt`).

---

## [2.0.0] — 2026-03-04

### Added
- **Retag v2 — DB2→DB3 Migration System**: Full on-site retag workflow. `TempLegacyItem` model (staging table of active DB2 items, populated by `import_db2_staging`). `RetagLog` model (per-event log for retag day). Three `retag_v2_*` API endpoints (`lookup`, `create`, `history`). `RetagPage.tsx` at `/inventory/retag`. Supports 4 price strategies (keep current / % of current / AI estimate / % of retail), auto-print on scan, non-blocking "already retagged" snackbar warnings, always creates a new DB3 item per scan. Paginated history panel with summary tiles (total tagged, sum retail, sum price), search, and session filter. **Both `TempLegacyItem` and `RetagLog` are temporary scaffolding — drop after retag day.**
- **Pricing Model Foundation**: Management commands scaffolded: `import_historical_sold` (~145K sold items from DB1+DB2 for ML training data), `import_historical_transactions` (~68K transactions into `HistoricalTransaction` for multi-generation revenue reporting), `train_price_model` (gradient-boosted price estimator, output to `workspace/models/price_model.joblib`), `backfill_categories` (retroactive category classifier). Ready to run after retag day.
- **`very_good` condition**: Added `('very_good', 'Very Good')` to `CONDITION_CHOICES` on `Item`, `ManifestRow`, and `BatchGroup` models (migration `0010_add_very_good_condition`).
- **Database audits**: Full schema and row-count audits in `docs/Database Audits/` for DB1 (`ecothrift_v1` archive), DB2 local snapshot (`ecothrift_v2`), DB3 / Django dev (`ecothrift_v3`).
- **Retag day ops docs**: `docs/retag/before_retag.md` (prep checklist, data clearing, end-to-end test plan, price strategy guide) and `docs/retag/after_retag.md` (cleanup, historical import, model training, deployment checklist).

---

## [1.9.1] — 2026-02-26

### Fixed
- **POS `CartFilter` `status=open` fallthrough**: `filter_status` only handled `all`, `completed`, `voided` — `open` fell through returning all carts (including voided ones), causing voided carts to be restored on mount. Added `open` to the handled values.
- **Prefetch cache staleness after cart mutations**: `CartViewSet` uses `prefetch_related('lines')` which caches lines on the object. After `add_item` and `manage_line` mutations the serializer read stale prefetch cache, returning data one step behind. Fixed by re-fetching cart via `self.get_queryset().get(pk=cart.pk)` after `recalculate()`.
- **Cart restore stale React Query cache on navigation**: `useCarts` React Query hook served stale cached data instantly on `TerminalPage` remount, restoring an outdated cart before the fresh network response arrived. Replaced with direct `getCarts()` API call in a `useEffect` that always makes a fresh network request.
- **Duplicate CartLines on repeated item scan**: `add_item` was creating a new `CartLine` every time the same SKU was scanned. Now increments `quantity` on the existing line instead.

### Added
- **Inline cart line editing**: Edit icon per line opens in-place `TextField`s for `quantity`, `description`, and `unit_price`. Backend `manage_line` action serves both `PATCH` (update) and `DELETE` (remove) on `lines/{line_id}/`.
- **Void Sale button**: Red "Void" button + `ConfirmDialog` on terminal. Calls `POST /pos/carts/{id}/void/`. Voided carts visible in Transactions by default (status filter defaults to `all`).
- **Drawer reopen**: `POST /pos/drawers/{id}/reopen/` (Manager+) reopens a closed drawer. UI button on closed-drawer cards in `DrawerListPage`.
- **Terminal state machine**: `TerminalState` union + `deriveTerminalState()` drives full-page UI branching (unconfigured / loading / no_drawer / drawer_open_other / ready+active_sale / drawer_closed / manager_mode).
- **Lazy cart creation**: Cart is created on first item scan rather than on an explicit "Start Sale" button. Sale interface shown immediately when drawer is open/ready.

---

## [1.9.0] — 2026-02-25

### Added
- **Processing Page Overhaul** (`ProcessingPage.tsx`): full "Command Center + Side Drawer" redesign
- `useLocalPrintStatus` hook: polls `/health` every 30s, exposes `online`/`version`/`printersAvailable`; persistent green/gray status chip in PageHeader
- Print server graceful degradation: check-in succeeds even when print server offline; warning snackbar + reprint recovery on Checked In tab
- Staggered batch label printing via `Promise.allSettled` with 200ms stagger and inline "Printing X/Y labels..." progress alert
- **MUI Autocomplete order selector** with search, status chips, and per-order progress indicators replacing basic dropdown
- **Circular progress ring** (% complete) + stats chips (on-shelf, pending, batches) in order context bar
- **Always-visible SKU scanner input** with F2 hotkey focus; Enter searches items by SKU and auto-opens side drawer
- **Three-tab queue** (Batches / Items / Checked In) with badge counts; tab selection persists across interactions
- **Right-side MUI Drawer** (`ProcessingDrawer.tsx`) replaces center dialog; shows form + collapsible source data context (product, brand, cost, batch info)
- **Checked In tab**: DataGrid of completed items sorted by check-in time with per-row reprint button
- **Bulk check-in**: checkbox column on Items tab, floating "Bulk Check-In" dialog with shared condition/location/price/cost overrides; calls existing `check-in-items` endpoint; prints staggered labels
- **Detach confirmation popover**: replaces immediate action; shows warning before detaching item from batch
- **Keyboard shortcuts**: F2 (scanner focus), Ctrl+Enter (check-in), Escape (close drawer), Ctrl+P (reprint), N (next item)
- **Auto-advance**: after check-in automatically opens next pending item; toggle switch in stats bar (default ON)
- **Sticky defaults**: condition + location persist in `localStorage` under `processing_sticky_defaults`; pre-fill empty fields on open
- **Copy from Last**: button in drawer copies condition/location/notes from most recently checked-in item
- **Session stats bar** (`ProcessingStatsBar.tsx`): elapsed time, items/hour rate, ETA, session item count, auto-advance toggle
- **Back to Preprocessing** navigation button in PageHeader when an order is selected
- `useItems` and `useBatchGroups` hooks accept `enabled` parameter to prevent fetching all items when no order selected

### Changed
- `queueNotBuilt` logic broadened: triggers for both `delivered` and `processing` status with zero items (was `delivered` only)
- Items query limit raised from 500 to 1000 for large orders
- Replaced local `formatCurrency` in ProcessingPage with shared `formatCurrency` from `utils/format.ts`
- DataGrid density set to `compact` across all three tabs for higher information density

---

## [1.8.0] — 2026-02-25

### Added
- **Local Print Server** (`printserver/`): standalone FastAPI server on `127.0.0.1:8888` for label, receipt, and cash drawer printing via Windows GDI/ESC-POS
- Built-in browser UI at `/` (printer assignment dropdowns, test buttons) and `/manage` (status, auto-start toggle with Enabled/Disabled label, version check, changelog, uninstall)
- Windows self-contained installer (`ecothrift-printserver-setup.exe`) with Tkinter GUI, registry auto-start, port-kill on reinstall
- `distribute.bat` / `distribute.py`: builds both exes, uploads setup exe to S3, registers release in Django DB using management commands — no credentials required
- Django `publish_printserver` management command for credential-less release registration
- Public (no-auth) `print-server-version-public` endpoint for version checks from the print server management page
- Admin SettingsPage redesigned: printer assignment dropdowns, test label/receipt/drawer buttons, Client Download section, Online chip links to `/manage`
- Server-side update-check proxy (`/manage/check-update`) to avoid browser CORS restrictions
- `CORS_ALLOWED_ORIGINS` updated to include `127.0.0.1:8888`

---

## [1.7.0] — 2026-02-21

### Added
- **Preprocessing Undo System**: Every preprocessing step has a working undo with cascade confirmation. `deriveCompletedStep()` is the single source of truth for step completion state. Backend endpoints: `undo-product-matching` (Step 3), `clear-pricing` (Step 4). `cancel-ai-cleanup` updated to cascade and also clear Step 3 matching fields.
- **6-State Step 1 Button Logic**: Standardize step derives state (clear/partial/ready/done/edited/edited_partial) from formula state and standardization status. Two separate button rows: primary actions (Standardize/Re-standardize/Undo) and formula-level actions (Clear Formulas/Cancel Edits/Use AI). Tracks formulas at standardization time via ref for edit detection.
- **Complete Preprocessing in Breadcrumbs**: "Complete Preprocessing" button rendered inline at end of breadcrumb chip row (visible when Step 4 active, all rows priced, not yet finalized).
- **Shared Formatting Utilities**: `formatCurrencyWhole` (commas, no decimals), `formatCurrency` (commas, 2 decimals), `formatNumber` (locale-formatted counts) in `frontend/src/utils/format.ts`. Applied across OrderListPage, OrderDetailPage, FinalizePanel.
- **Auto-Build Check-In Queue on Deliver**: `deliver` endpoint automatically creates Items + BatchGroups when manifest rows exist and no items exist. Eliminates manual "Build Check-In Queue" step for the standard flow. `create-items` endpoint preserved for edge cases (manifest processed after delivery).
- **Section Dividers**: `<Divider>` components between major sections in all 4 preprocessing step panels for visual clarity.

### Changed
- **Breadcrumb Navigation**: Removed all "Continue to..." / "Next Step" / "Confirm Products" navigation buttons from Steps 1-3. Navigation is exclusively via breadcrumb chips with 4 visual states (selected/done/ready/notReady with pulse animation). Accept All in Step 3 now also confirms/submits decisions.
- **OrderDetailPage**: All 4 action buttons (Back/Preprocessing/Processing/Delete) merged into PageHeader row. Separate "Go To" card removed.
- **OrderListPage**: Actions column moved to first position with 'Actions' header.
- **Step 2 Buttons**: Renamed (Run Cleanup, Pause Cleanup, Restart Cleanup, Cancel Cleanup, Clear Cleanup). Removed Re-run when done — only Clear shown.
- **Step 3 Accept All**: Only visible when undecided matched rows exist; shows count.
- **Step 4 renamed**: "Review & Finalize" → "Pricing" throughout.
- **Preview Empty State**: Changed from "Click Preview Standardization" to "Preview will appear when formulas are applied."
- **ConfigurablePageSizePagination**: Custom DRF pagination class allows client to specify `page_size`.

### Fixed
- Processing page "No rows" issue: broadened `queueNotBuilt` logic to always render queue sections when an order is selected.
- `deliver` endpoint now auto-creates items from manifest rows, preventing "Build Check-In Queue" friction.

---

## [1.6.0] — 2026-02-18

### Added
- **AI Integration Foundation** (`apps/ai/`): New Django app with `ChatProxyView` (POST `/api/ai/chat/`) and `ModelListView` (GET `/api/ai/models/`) proxying Anthropic Claude API. Models: `claude-sonnet-4-6`, `claude-haiku-4-5`.
- **Expression-Based Formula Engine** (`apps/inventory/formula_engine.py`): Full expression parser supporting `[COLUMN]` refs, functions (`UPPER`, `LOWER`, `TITLE`, `TRIM`, `REPLACE`, `CONCAT`, `LEFT`, `RIGHT`), `+` concatenation, and quoted string literals. Used by `normalize_row()` alongside legacy source+transforms path.
- **AI-Assisted Row Cleanup**: `POST /api/inventory/orders/:id/ai-cleanup-rows/` sends manifest rows to Claude in batches for title/brand/model/specs cleanup. Supports `batch_size` and `offset` for frontend-driven batch processing.
- **AI Cleanup Status & Cancel**: `GET ai-cleanup-status/` returns progress counts; `POST cancel-ai-cleanup/` clears all AI-generated fields.
- **Concurrent Batch Processing**: Frontend worker pool pattern — configurable batch size (5/10/25/50 rows) and concurrency (1/4/8/16 threads). Up to 16 simultaneous API requests for faster processing.
- **Expandable Row Detail Panels**: Cleanup table rows are expandable with chevron toggle. Expanded view shows side-by-side "Original Manifest Data" vs "AI Suggestions" cards with change highlighting, specifications key-value grid, and AI reasoning quote block. Multiple rows expandable simultaneously.
- **Standalone Preprocessing Page**: Moved from `/inventory/orders/:id/preprocess` to `/inventory/preprocessing/:id` with its own sidebar navigation entry. localStorage persistence of last preprocessed order ID. Legacy route redirects for backward compatibility.
- **Product Matching Engine**: Fuzzy scoring (UPC exact, VendorRef exact, text similarity) + AI batch decisions. New fields on `ManifestRow`: `match_candidates`, `ai_match_decision`, `ai_reasoning`, `ai_suggested_title/brand/model`. Endpoints: `match-products`, `review-matches`, `match-results`.
- **ManifestRow Extended Fields**: `title`, `condition`, `batch_flag`, `search_tags`, `specifications` (JSONField), plus all AI suggestion and match fields. Two new migrations applied.
- Frontend API layer: `ai.api.ts`, `useAI.ts` hooks, `ModelSelector` component, cleanup/status/cancel API functions and React Query hooks.
- `StandardManifestBuilder` reworked for expression text input with syntax highlighting and autocomplete.
- `RowProcessingPanel` with flat form layout: AI cleanup controls, rows table, product matching section, review decisions section.
- `FinalizePanel` with merged pricing controls.

### Changed
- Preprocessing stepper: 4 steps (Standardize Manifest → AI Cleanup → Product Matching → Review & Finalize)
- Manifest upload removed from preprocessing page (stays on Order page)
- `useStandardManifest` hook reworked to use `formulas: Record<string, string>` instead of rules-based state
- `MANIFEST_TARGET_FIELDS` and `MANIFEST_STANDARD_COLUMNS` updated with new fields
- Default batch size changed to 5 rows; default concurrency set to 16 threads

### Fixed
- Infinite re-render loop in `PreprocessingPage.tsx`: `useEffect` dependency on full `order` object replaced with scalar values (`orderVendorCode`, `orderPreviewTemplateName`); `rawManifestParams` useMemo dependency changed from object ref to boolean; `matchSummary` prop memoized with `useMemo`
- Step 4 (Review & Finalize) freeze: template name and step-derived effects guarded to prevent update-depth loop; FinalizePanel table paginated (50 rows/page) to avoid rendering 400+ rows and blocking main thread
- `anthropic` library lazy-imported in `apps/ai/views.py` to prevent `ModuleNotFoundError` at Django startup
- Outdated Claude model IDs replaced: `claude-sonnet-4-5-20250514` → `claude-sonnet-4-6`, `claude-haiku-3-5-20241022` → `claude-haiku-4-5`
- `cancel_ai_cleanup` corrected from `specifications=dict` to `specifications={}`

---

## [1.5.0] — 2026-02-17

### Added
- `PreprocessingPage` at `/inventory/orders/:id/preprocess`: dedicated 3-step stepper wizard (Upload Manifest → Standardize Manifest → Set Prices) extracted from `OrderDetailPage`
- Route added in `App.tsx` for the new preprocessing page
- "Clear All" button in the pricing step to wipe all proposed prices and auto-save
- Warning `Alert` on Step 3 when any manifest rows are missing `retail_value`
- Auto-save on every pricing action (Apply to All, Clear All, individual field blur) with inline saving indicator

### Changed
- `OrderDetailPage` simplified: full preprocessing accordion block removed (~260 lines), replaced with a single "Open Preprocessing" CTA card
- Step 3 pricing UI redesigned: removed mode toggle, all price inputs always editable, no explicit Save Prices button
- `retail_value` mapping is now enforced as required at standardization — `handleStandardizeManifest` blocks with a warning snackbar if unmapped

### Fixed
- Infinite render loop in `PreprocessingPage`: `manualPrices` `useEffect` now uses stable `rowsKey` dependency (row IDs joined as string) instead of `manifestRows ?? []` which created a new array reference every render

---

## [1.4.0] - 2026-02-16

### Added
- New Standard Manifest preprocessing contract with `preview-standardize` and `process-manifest` support for function chains per standard column
- Pre-arrival manifest pricing support on `ManifestRow` (`proposed_price`, `final_price`, `pricing_stage`, `pricing_notes`)
- New pricing endpoint `POST /api/inventory/orders/:id/update-manifest-pricing/` for bulk manifest-row pricing updates
- New check-in endpoints:
  - `POST /api/inventory/orders/:id/check-in-items/` (bulk order check-in)
  - `POST /api/inventory/items/:id/check-in/` (single-item check-in)
  - `POST /api/inventory/batch-groups/:id/check-in/` (batch check-in)
- New check-in tracking fields on items: `checked_in_at`, `checked_in_by`
- New reusable frontend Standard Manifest modules:
  - `useStandardManifest` hook
  - `StandardManifestBuilder` component
  - `StandardManifestPreview` component

### Changed
- Replaced old order preprocessing UI with a cleaner Standard Manifest workflow and primary action **Standardize Manifest**
- Replaced prior processing page with a unified processing workspace centered on:
  - set fields,
  - check in,
  - print tags
- `create-items` now acts as a check-in queue builder and enforces post-delivery creation

### Fixed
- Removed old row-expression preprocessing/filtering flow that caused clunky UX and replaced it with explicit standard-column mapping
- Reduced processing-step/button sprawl by consolidating actions into a single arrival workflow

---

## [1.3.0] - 2026-02-16

### Added
- M3 inventory processing implementation finalized: all units are created as `Item` rows with optional `BatchGroup` acceleration for high-quantity rows
- Full manifest preprocessing flow on order detail page: raw row selection, row-expression selection (`1-50,75`), source-to-target column mapping, and per-field transforms
- Transform support in manifest normalization: `trim`, `title_case`, `upper`, `lower`, `remove_special_chars`, and `replace`
- Header-signature-based template workflow: load prior formulas by manifest header signature and save updated mappings for future uploads
- New inventory endpoint `GET /api/inventory/orders/:id/manifest-rows/` for full CSV row retrieval during preprocessing
- New M3 inventory APIs and UI integrations for product matching, batch group processing, item detachment, item history, and category CRUD

### Changed
- `process-manifest` now parses the full uploaded manifest file (not only preview rows) when explicit `rows` payload is not provided
- Processing page redesigned around M3 queues: Batch Queue + Individual Queue + Detached/Exception items
- Order detail manifest workflow now aligns to M3 sequence: preprocess -> process rows -> match products -> create items+batches -> mark complete
- Inventory and project documentation updated to make M3 the authoritative processing model

### Fixed
- Corrected manifest processing bug where only 20 preview rows were normalized instead of the full uploaded file

---

## [1.2.0] - 2026-02-13

### Added
- Purchase Order 6-step status workflow: ordered → paid → shipped → delivered → processing → complete
- Status action buttons: Mark Paid, Mark Shipped, Mark Delivered with dedicated UX modals
- Status undo buttons: Undo Paid, Undo Shipped, Undo Delivered to revert status changes
- "Shipped" modal with dual modes (Mark Shipped / Edit Shipped) including date pickers for shipped_date and expected_delivery
- Cost breakdown: purchase_cost + shipping_cost + fees = total_cost (auto-computed in model save)
- New PO fields: paid_date, shipped_date, retail_value, condition (dropdown), description, order_number (editable)
- Auto-generated order numbers (PO-XXXXX) with option to provide custom values
- CSV manifest upload persists to S3 with S3File record and manifest_preview JSON field
- S3File download URL via presigned URL property
- Manifest file info bar on detail page with filename, size, upload date, and Download button
- Ordered date editable on both create and edit forms
- Order list view enhanced with Description, Condition, Items, Retail Value columns

### Changed
- PO status choices renamed: `in_transit` → `shipped`, added `paid`
- Edit Order dialog reorganized: Order # + Date → Details → Costs → Notes (consistent across create/edit/detail)
- Create Order dialog now includes all fields matching edit dialog (# Items, condition, retail value, description)
- Upload manifest endpoint now returns full order detail instead of transient preview
- useUploadManifest hook invalidates specific order query for immediate UI refresh

---

## [1.1.0] - 2026-02-13

### Added
- Multi-role user model: User can simultaneously hold Employee, Customer, and Consignee profiles via Django Groups
- User `roles` property returning all assigned group names
- Employee termination workflow: termination type (10 industry-standard types), date, notes, status badge with tooltip
- Consignee account management: create from existing or new user, profile editing, soft-delete
- Consignee detail page with account settings and nested agreements (drop-offs)
- Customer management: full CRUD with auto-generated customer numbers (CUS-XXX)
- POS customer association: scan customer ID (CUS-XXX) at terminal to link customer to cart
- Admin password reset: generates temporary password for any user
- Forgot password flow: request reset token, enter new password (email delivery stubbed)
- Time entry modification requests: employee submit, manager approve/deny
- Phone number formatting utility (formatPhone, maskPhoneInput, stripPhone) applied across all UI
- Reusable ConfirmDialog component for destructive actions
- StatusBadge tooltip support for contextual information on hover
- Item detail page for viewing/editing individual inventory items
- ForgotPasswordPage with multi-step form
- ConsigneeDetailPage with profile editing and agreement management

### Changed
- AccountsPage rewritten to list consignee people (accounts) instead of agreements
- Agreement creation now defaults commission rate from consignee profile, start date to today, terms to standard template
- ConsigneeAccountViewSet uses user ID for lookups (not profile ID)
- DataGrid action columns vertically centered across all pages
- Date input fields use shrunk labels to prevent overlap
- Add Consignee dialog uses ToggleButtonGroup instead of confusing toggle switch

### Fixed
- EmployeeDetailPage crash: departments.map TypeError from paginated API response
- ConsigneeDetailPage 404: ID mismatch between frontend (user ID) and backend (profile ID)

---

## [1.0.0] - 2026-02-13

### Added
- Django 5.2 backend with 6 apps: accounts, core, hr, inventory, pos, consignment
- Custom User model with email-only authentication
- JWT auth with httpOnly cookie refresh tokens and in-memory access tokens
- Role-based access: Admin, Manager, Employee, Consignee (Django Groups)
- React 19 + TypeScript frontend with Vite, MUI v7, TanStack React Query
- 24 page components across dashboard, HR, inventory, POS, consignment, admin, and consignee portal
- Time clock with automatic clock-in (empty body POST)
- Sick leave accrual system (1 hour per 30 hours worked, 56-hour annual cap)
- Inventory pipeline: vendors, purchase orders, CSV manifest processing, item creation
- POS terminal with SKU scanning, cart management, cash/card/split payments
- Cash management: drawer open/close/handoff, cash drops, supplemental drawer, bank transactions
- Denomination breakdown tracking (JSON fields) across all cash operations
- Consignment system: agreements, item tracking, payout generation
- Consignee portal: self-service items, payouts, summary dashboard
- Dashboard with today's revenue, weekly chart, 4-week comparison table, alerts
- Public item lookup by SKU (no auth required)
- Local print server integration service (FastAPI at localhost:8888)
- Seed data management command (groups, admin user, registers, settings)
- Heroku deployment config (Procfile, WhiteNoise, gunicorn)
- Project documentation in docs/
- Developer workspace with bat scripts and Jupyter notebook
