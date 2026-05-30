<!-- initiative: slug=public-website status=active updated=2026-05-30 -->
<!-- Last updated: 2026-05-30 (Session 6 — content polish; v2.26.0) -->

# Initiative: Public website (storefront rebuild)

**Status:** Active — **all build phases (0–4) code-complete.** Marketing site + curated catalog + online checkout (payments stubbed, Helcim-ready) + staff order management + launch hardening (SEO/meta/JSON-LD, `robots.txt`/`sitemap.xml`, legacy Shopify 301s, route code-splitting, favicon/branding). **Remaining = owner/launch tasks:** deploy, rotate secrets, wire a payment processor + email provider, add a social share image, optional accounts/price-drop engine.

Rebuild the public Eco-Thrift website (previously Shopify) **inside this repo**, served from the **same Heroku app** (`ecothrift-dashboard`) and split by hostname. The owner pointed `ecothrift.us` and `www.ecothrift.us` at the Heroku app on 2026-05-30 (DNS + TLS done; `ALLOWED_HOSTS` already includes both). The staff dashboard stays on `dash.ecothrift.us`.

- **End goal (owner-confirmed):** **full online checkout** — real payments (Stripe), shipping/tax, and order management (what Shopify did).
- **Catalog (owner-confirmed):** a **separately hand-curated web catalog** — staff manually pick/list a subset of items with their own photos, descriptions, and prices (not auto-pulled from floor inventory).
- **Design source of truth:** [`ecothrift-store.html`](../reference/shopify-site-copy/ecothrift-store.html) (full storefront mockup) + real copy in [`site_copy.md`](../reference/shopify-site-copy/site_copy.md). Plan of record: this file (mirrors the approved session plan).

---

## Pre-flight (owner, urgent — independent of this build)

- **Rotate exposed secrets.** The Anthropic key, AWS key pair, `DATABASE_URL`, Django `SECRET_KEY`, and proxy password were reportedly pasted into chat/screenshots — treat as compromised. Rotate via the AWS/Anthropic consoles + `heroku config:set` + DB credential rotation. Rotating `SECRET_KEY` invalidates existing JWT refresh sessions (everyone re-logs in). Does **not** block website work, but should happen soon.
- **DNS propagation.** Apex `A` record may still cache the old Shopify IP (`23.227.38.65`) for a few hours; re-check `Resolve-DnsName ecothrift.us -Server 8.8.8.8` until it resolves to Heroku. `ALLOWED_HOSTS` already includes apex + `www` (verified on Heroku).
- **No CORS work needed.** The frontend uses a **relative** `/api` base URL (no `VITE_API_URL` anywhere), so pages are same-origin with the API — the consultant's cross-origin concern does not apply to this build.

---

## Current state (grounding facts)

| Area | Today | Implication |
|------|-------|-------------|
| Host routing | **None.** [`ecothrift/urls.py`](../../ecothrift/urls.py) has one prod SPA catch-all (`^(?!api/|db-admin/|static/|assets/).*$` → `index.html`). Every host serves the **staff dashboard** SPA (`/` → `/dashboard` → login). | Right now `ecothrift.us` shows the **staff login**. Phase 0 displaces it. |
| Frontend build | One Vite build → `frontend/dist`, WhiteNoise + `heroku-postbuild` ([`package.json`](../../package.json), [`Procfile`](../../Procfile)). `APP_DIRS=True` so Django templates resolve from apps. | A public site can be a 2nd Vite build or Django-rendered; confirm in Phase 1. |
| Product data | [`apps/inventory/models.py`](../../apps/inventory/models.py) `Item` has `price`, `unit_retail`, `status` (`on_shelf`/`sold`), `condition`, `sku`; `Category` has slugs. **No image fields anywhere**, no description on `Item`. | Curated catalog + photos are net-new (Phase 2). |
| Public API | Only `AllowAny` read endpoint is `item_lookup` ([`apps/inventory/views.py`](../../apps/inventory/views.py)) via `ItemPublicSerializer`. S3 serves **presigned/authenticated** URLs ([`apps/core/models.py`](../../apps/core/models.py)). | Public catalog/cart/checkout API + public image URLs are net-new. |
| Email | **Not wired** (forgot-password tokens returned in responses, not sent). | Order confirmations (Phase 3) need an email backend. |
| Price drops | No engine — only `Item.listed_at`. FAQ describes 5%/day + L4/A2 codes (business intent, not coded). | Phase 2/4 decision: real schedule vs `compare_at_price` + copy. |

---

## Architecture (recommended; confirm in Phase 0/1)

Serve both sites from the same Heroku app, split by hostname. **Recommended:** a separate lightweight **public Vite build** so the heavy staff bundle never ships to shoppers, with Django selecting the response by host.

```
ecothrift.us / www  ─┐
                     ├─► Django on Heroku ──► host=apex  → public site (holding page now; public SPA later)
dash.ecothrift.us  ──┘                     └─► host=dash → existing dashboard SPA
                        /api/* = shared DRF (public AllowAny endpoints + staff endpoints)
```

Phase 0 uses a **Django-rendered holding page** (no new frontend folder yet). The separate-frontend-build decision is gated to Phase 1 (per the lean-scaffolding rule: confirm folders/structure before creating them).

Alternative: single SPA branching on `window.location.hostname` — cheaper to wire but ships the staff bundle to the public and fights the global `AuthProvider` / `/`→`/dashboard` redirects.

---

## Phased build

### Phase 0 — Hostname split + holding page (unblock the apex)
- Host-based routing middleware: apex/`www` → public response; `dash`, `*.herokuapp.com`, localhost → unchanged dashboard SPA.
- **Canonical host:** recommend apex `ecothrift.us`; **301-redirect** `www` → apex in the same middleware (keeps SEO/cookies from splitting; the DNS host can't do this for a Heroku app).
- Minimal **branded holding page** (Django template) using the mockup palette + **real** store info (9717 Q St, Omaha NE 68127; 9AM–8PM daily; (402) 510-7509) and an "online store coming soon" message.
- `/api/`, `/static/`, `/assets/`, `/media/`, `/db-admin/` still function on the apex.
- **Outcome:** apex no longer shows staff login; one canonical public URL.

### Phase 1 — Public scaffold + marketing pages (static)
- Confirm architecture; scaffold the public frontend with the mockup's design system (Spectral/Manrope, brand greens), shared header/subnav/footer + router.
- Build **Home, Visit, Sell (consignment), Blog list + post** from real copy. Reconcile mockup placeholders with reality: real address **9717 Q St** (drop "Canfield"), hours, phone, and the **5%/day vs 10%/Monday** pricing inconsistency. Shop page renders with placeholder data.
- **Outcome:** full marketing site live on apex.

### Phase 2 — Curated web catalog (backend + staff admin + public read API)
- New models (e.g. `WebListing` + `WebListingImage`; reuse `Category`); **public product photos** on S3 with public/cacheable URLs (config decision).
- Staff CRUD UI in the dashboard (new "Web store" area in the Slot C nav) to create/publish listings, upload photos, set price/compare-at/condition/stock/featured, optional link to an `Item`.
- Public `AllowAny` API: catalog list (category/search/sort/drops/available filters), detail by slug, category counts.
- Wire public Shop + Product Detail + client-side cart drawer to the real API; checkout still a stub.
- **Outcome:** real browsable catalog with photos; cart works.

### Phase 3 — Full checkout + payments + orders
- `Order`/`OrderLine` models; **provider-agnostic payment layer** — **not Stripe** (owner decision 2026-05-30); likely **Helcim** later. Ship a `PaymentProvider` abstraction with a **no-op/stub provider** now so the full order flow works end-to-end except the real charge, ready to wire Helcim (API / HelcimPay.js) by config. Fulfillment pickup (free) / ship (rate) + Nebraska sales tax; stock validation + reserve/decrement + mark-sold (single-qty safe); **order confirmation email** (needs an email backend — new dependency); order-status page; staff order management in the dashboard.
- **Outcome:** customers can buy online (pickup or ship) and staff fulfill.

### Phase 4 — Launch hardening
- SEO/meta/OpenGraph, sitemap, structured data; **redirects from old Shopify URLs** (`/collections/*`, `/pages/*`, `/blogs/*`) for SEO continuity; performance/code-split; analytics; favicon/branding/404; optional customer accounts / "Thrift+"; optional real price-drop schedule engine.
- **Outcome:** production-grade public store.

---

## Non-code dependencies (owner)

- **Payment processor** — *not Stripe* (owner decision 2026-05-30); likely **Helcim**. For now build a provider-agnostic abstraction + no-op stub (no live charges); wire the real processor when the account/keys exist. Email provider (SES/Postmark/SendGrid) for order confirmations; Nebraska sales-tax handling/registration; refund/privacy/terms pages (refund copy exists in [`site_copy.md`](../reference/shopify-site-copy/site_copy.md)).
- **Public image hosting — ✅ resolved (Session 3): keep S3 private**; the public catalog serves photos via an `AllowAny` presigned-redirect endpoint (302 → short-lived presigned URL). No bucket policy change, fully reversible; can swap to a public CDN prefix later if desired.

## Open decisions to confirm during the work

- **Architecture:** ✅ **Resolved (Session 2): separate public Vite build** (`frontend-public/`), owner-confirmed. Built to `frontend-public/dist`, collected under `STATIC_ROOT/site`, served at `/static/site/*`; `PublicSiteMiddleware` serves its `index.html` on the apex.
- **Price drops:** ✅ **Resolved (Session 3): simple `compare_at_price` + copy** now; defer a real days-on-shelf schedule engine to Phase 4.
- **Customer accounts / "Thrift+":** defer to Phase 4 (guest checkout first) vs earlier.

---

## Acceptance

- [x] `ecothrift.us` / `www` serve a public Eco-Thrift experience (not the staff login); `dash.ecothrift.us` unchanged. *(code complete; live on next deploy)*
- [x] One canonical public host with a 301 from the other. *(`www` → apex 301 in `PublicSiteMiddleware`)*
- [x] Marketing pages live with real store info and reconciled copy. *(Home/Shop/Blog/Visit/Sell/404)*
- [x] Staff can curate a web catalog (with photos); the public can browse it. *(Phase 2: `apps.webstore` + staff "Web store" CRUD + public shop/detail/cart)*
- [x] Customers can complete an order (pickup or ship) and receive confirmation; staff can fulfill. *(Phase 3: public `/checkout` + `/order/:number`, `Order`/`OrderLine`, NE tax + flat ship, atomic stock reserve, staff "Web orders" status/payment mgmt. **Live charge stubbed** — `manual` provider records the order awaiting payment; swap to Helcim by config.)*
- [x] SEO basics + old-URL redirects in place at launch. *(Phase 4: per-route title/description/canonical/OG/Twitter via `useSeo`, Store + Product JSON-LD, `robots.txt` + `sitemap.xml`, legacy Shopify 301s (`/products|/collections|/blogs|/pages|/cart|/account`) merged with the canonical-host redirect, route code-splitting, SVG favicon + theme-color, `noindex` on checkout/order/404. Optional Plausible analytics gated by `VITE_PLAUSIBLE_DOMAIN`.)*
- [x] [`.ai/extended/frontend.md`](../extended/frontend.md) and [`.ai/context.md`](../context.md) updated as routes/architecture change; releases bumped per [`session.9.Close.md`](../protocols/session.9.Close.md). *(v2.26.0)*

---

## Sessions

### Session 1 — Archive cleanup + Phase 0 (host split + holding page)

- **Goal:** Stand up the initiative and stop `ecothrift.us` from serving the staff login.
- **Finish line:** `web_ui_cleanup` archived; this initiative created + indexed; host-based routing + canonical `www`→apex 301 + branded holding page in place; `python manage.py check` clean.
- **Scope:** Docs (archive + this file + `_index.md` + `context.md`); `ecothrift/settings.py` (host config + middleware registration), new `apps/core/middleware.py`, new `apps/core/templates/public/holding.html`. **Out of scope:** the public SPA build, catalog models, payments.
- **Est:** ~1–2h · **Start:** 2026-05-30
- **Result (2026-05-30):** Done. `web_ui_cleanup` archived → `_completed/`; this initiative created + indexed; `context.md` compass repointed. Phase 0 shipped to code: `apps.core.middleware.PublicSiteMiddleware` + `apps/core/templates/public/holding.html` + `PUBLIC_SITE_HOSTS`/`PUBLIC_SITE_CANONICAL_HOST` settings (prod defaults to apex + www). Verified locally: apex serves the holding page, `www`→apex 301 (path+query preserved), `/api/` + `dash` pass through, `manage.py check` clean. Takes effect on next Heroku deploy. **Next:** confirm the Phase 1 architecture (separate public Vite build vs host-switching SPA) before scaffolding the public frontend.

### Session 2 — Phase 1 (public scaffold + marketing pages)

- **Goal:** Stand up the public storefront frontend and ship the static marketing site on the apex.
- **Architecture decision:** **separate public Vite build** (`frontend-public/`) — owner-confirmed (`frontend_arch = separate_build`). Keeps the heavy staff bundle off public pages.
- **Scope (done):**
  - New `frontend-public/` app — React 18.3 / TS / Vite 7 / `react-router-dom` 7 (versions matched to staff `frontend/`). Self-contained `tsconfig.json` (no project refs), `vite.config.ts` with prod `base: '/static/site/'` + `/api` dev proxy.
  - Design system ported from the mockup (`styles.css`: Spectral/Manrope, brand greens, tokens), shared `Layout` (utility bar + header + category subnav + footer) and `PostCard`.
  - Pages from **real** copy: **Home, Shop** (opening-soon shell), **Blog list + post**, **Visit, Sell**, **404**. Content centralized in `src/data/content.ts` — reconciled store facts (**9717 Q St, Omaha NE 68127**; 9 AM–8 PM daily; (402) 510-7509; dropped "Canfield"), founder blog essays, testimonials.
  - SEO: `usePageTitle` per page + meta description in `index.html`.
  - Django wiring: `STATICFILES_DIRS += ('site', frontend-public/dist)`, `PUBLIC_SITE_INDEX` → public `index.html`; `PublicSiteMiddleware` serves the built SPA on the apex (falls back to the Phase 0 holding page when no build is present, e.g. local dev). Root `package.json` `heroku-postbuild` now builds `frontend-public` too; `.gitignore` updated.
- **Verified (2026-05-30):** `npm run build` (frontend-public) OK; `manage.py check` clean; `manage.py collectstatic --noinput` → 176 copied / 496 post-processed, **no manifest errors**; assets land at `staticfiles/site/assets/*` (hashed + gz). Routing harness: apex `/` → 200 built SPA, apex `/shop` → 200 SPA fallback, `www/blog` → 301 apex, apex `/api/...` → 401 passthrough, `dash /` → passthrough. Live on next Heroku deploy.
- **Result:** **Phase 1 complete.** Full marketing site renders on the apex (Home/Shop/Blog/Visit/Sell/404). **Next:** Phase 2 — two open decisions gate the data model (**public image hosting** + **price-drop approach**), and Phase 3 is hard-blocked on owner-provided **Stripe** + **email** accounts. Checkpoint with owner before the catalog build.

### Session 3 — Phase 2 (curated catalog: backend + staff CRUD + public shop)

- **Goal:** Stand up a hand-curated catalog with photos, a public browse/cart experience, and staff tooling to manage it.
- **Owner decisions (this session):** payments **not Stripe** — likely **Helcim**; build provider-agnostic + stubbed for now. Image hosting → **keep S3 private + presigned-redirect proxy**. Price drops → **`compare_at_price` + copy** (defer engine).
- **Scope (done):**
  - **New app `apps.webstore`** (registered in `INSTALLED_APPS`, mounted at `/api/webstore/`). Models `WebListing` (title/slug, optional FK `inventory.Category` + `inventory.Item`, condition, price, `compare_at_price`, stock, status draft/published/archived, featured) + `WebListingImage` (FK `core.S3File`, position/alt). Migration `0001_initial` applied locally.
  - **Public API (`AllowAny`):** `catalog/` (filters: category, q, sort, featured, on_sale, available; paginated), `catalog/<slug>/`, `catalog/categories/` (counts), and `images/<id>/` — a **private-S3 image proxy** (302 → presigned URL on S3, streams in non-S3 dev).
  - **Staff API (`IsStaff`):** `WebListingViewSet` CRUD + actions `images` (multipart upload), `images/reorder`, `images/<id>` (delete).
  - **Staff UI:** `frontend/src/pages/admin/WebStorePage.tsx` — DataGrid list + create/edit dialog (category/condition/status/featured/price/compare-at/stock/SKU/description) + inline photo upload/delete. New **"Web store"** link in the **Admin** workspace (`storefront` icon), route `/admin/web-store` (Manager/Admin). API/hooks: `api/webstore.api.ts`, `hooks/useWebStore.ts`.
  - **Public UI:** `frontend-public` Shop is now a live catalog grid (category sidebar w/ counts, sort, search, sale/sold badges, add-to-cart), new **Product detail** page (`/shop/:slug`, gallery + qty + add-to-cart), and a **client-side cart** (`cart.tsx` + `CartDrawer`, localStorage) with a cart button in the header. Checkout remains a stub (cart → "reserve by email"; full checkout is Phase 3).
- **Verified (2026-05-30):** `manage.py makemigrations`/`migrate` + `check` clean; staff `tsc` clean; public `tsc && vite build` clean. Integration harness (local DB `ecothrift_v3`): catalog hides drafts, lists sold-out as unavailable, on_sale/category filters work, detail returns images + multiline description, image proxy 302s to presigned S3, apex serves the rebuilt SPA, `/api` passes through.
- **Result:** **Phase 2 complete.** Real curated catalog browsable with photos; cart works. **Next:** Phase 3 — order models + provider-agnostic payments (stub now, Helcim-ready), shipping/Nebraska tax, stock reserve/mark-sold, order email, staff order management.

### Session 4 — Phase 3 (checkout + orders + provider-agnostic payments)

- **Goal:** Turn the working cart into placed orders — end-to-end checkout, order records, NE tax + shipping, stock reservation, email confirmation, and staff order management. Payments are wired through an abstraction but **not charged** (owner: not Stripe; likely Helcim later).
- **Scope (done):**
  - **Backend (`apps.webstore`):** `Order` (auto `ETW#####` number, status pending/paid/fulfilled/cancelled, payment provider/status/reference, fulfillment pickup/ship + ship address, money snapshot, customer/staff notes) + `OrderLine` (title/sku/price snapshot). Migration `0002_order_orderline` applied locally.
    - **Payments:** `payments.py` — `PaymentProvider` interface + `ManualProvider` (default stub: records order awaiting payment, always "succeeds") + `HelcimProvider` placeholder; `get_payment_provider()` factory keyed off `WEBSTORE_PAYMENT_PROVIDER`.
    - **Public API (`AllowAny`):** `POST checkout/` — validates cart, **atomically** `select_for_update`-reserves stock (409 on oversell), computes flat shipping (`WEBSTORE_SHIP_FLAT`, ship only) + NE tax (`WEBSTORE_SALES_TAX_RATE` on subtotal+shipping), creates order+lines, decrements stock, runs the payment provider, sends confirmation. `GET order-status/<number>/` (number is the customer's token).
    - **Staff API (`IsStaff`):** `OrderViewSet` (list/retrieve/update — only payment status/reference + staff note writable) + `set-status` action (cancel **restocks** reserved units atomically; marking paid syncs `payment_status`).
    - **Email:** `emails.py` `send_order_confirmation` (best-effort, `fail_silently`); console backend by default (`EMAIL_BACKEND`/`DEFAULT_FROM_EMAIL` settings), so checkout never blocks on mail.
  - **Public UI (`frontend-public`):** `/checkout` (contact + pickup/ship toggle + address + order summary; shipping/tax shown as "calculated on confirmation"; honest "online payment coming soon — we'll arrange payment" note) → `/order/:number` confirmation (status, totals, ship/pickup, emailed-to). Cart drawer CTA changed from "reserve by email" to **Checkout**. `api.ts` gained `checkout()` + `fetchOrder()`.
  - **Staff UI:** new **"Web orders"** page (`/admin/web-orders`, Manager/Admin, `receiptLong` icon in the Admin workspace) — DataGrid (order/date/customer/status/payment/fulfillment/total, filters + search) + detail dialog (lines, totals, customer/ship info, status action buttons, editable payment status/reference + staff note). API/hooks added to `webstore.api.ts` + `useWebStore.ts`.
- **Verified (2026-05-30):** Phase 3 backend harness — pickup order → 201 `ETW00001`, subtotal $20 / tax $1.40 / total $21.40, stock decremented; ship order → subtotal $25 + ship $9.95 + tax $2.45 = $37.40; oversell → 409; missing ship address → 400; `order-status` → 200; staff `orders` unauthenticated → 401. Staff `tsc --noEmit` clean; public `tsc && vite build` clean (224 kB / 72 kB gz). Lints clean.
- **Result:** **Phase 3 complete.** Customers can place pickup/ship orders end-to-end (real charge stubbed, Helcim-ready); staff manage orders + payment status in the dashboard. **Next:** Phase 4 — SEO/meta/sitemap, old-Shopify-URL redirects, performance/code-split, analytics, favicon/branding/404, optional accounts + price-drop engine.

### Session 5 — Phase 4 (launch hardening: SEO + redirects + perf + branding)

- **Goal:** Make the storefront launch-ready: discoverable (SEO/meta/structured data/sitemap), continuous with the old Shopify URLs (301s), fast (code-split), and branded (favicon/social).
- **Scope (done):**
  - **SEO (`frontend-public`):** new **`useSeo`** hook (replaces `usePageTitle`) sets per-route `<title>`, meta description, **canonical** link, **Open Graph** + **Twitter** tags, and the **robots** directive; **`useJsonLd`** injects structured data. Applied across all pages: Home/Visit emit **Store (LocalBusiness)** JSON-LD; product pages emit **Product** JSON-LD (price/availability/images) + per-item description & `og:image`; checkout, order confirmation, and 404 are **`noindex`**. Canonical origin centralized as `SITE_URL`.
  - **Branding:** SVG **favicon** (brand leaf) in `public/`, `theme-color`, and default OG/Twitter tags baked into `index.html` (Vite rewrites the favicon to `/static/site/favicon.svg` for the non-root base).
  - **Performance:** route components **code-split** via `React.lazy` + `Suspense` — entry chunk dropped ~225 kB → **207 kB** (gz 72 → 69), with per-route chunks (Shop, Product, Checkout, Blog, …) loaded on demand.
  - **Backend SEO:** `apps/core/views.py` `robots_txt` + `sitemap_xml` (marketing routes + blog slugs + every published `WebListing` slug, built from the canonical host); wired in `ecothrift/urls.py` ahead of the SPA fallback; `PublicSiteMiddleware` passes `/robots.txt` + `/sitemap.xml` through.
  - **Legacy redirects:** `PublicSiteMiddleware.rewrite_legacy_path` maps old Shopify URLs — `/products/<h>`→`/shop/<h>`, `/collections[/*]`→`/shop`, `/blogs[/*]`→`/blog`, `/pages/<slug>`→`/visit|/sell|/blog|/`, `/cart`→`/shop`, `/account[/*]`→`/` — **merged with the canonical-host 301** so `www` + a legacy path resolve in a single hop.
  - **Analytics:** optional, privacy-friendly **Plausible** include gated by `VITE_PLAUSIBLE_DOMAIN` (no-op unless set at build) — "ready to hook up," mirroring the payments approach.
- **Verified (2026-05-30):** public `tsc && vite build` clean (code-split chunks emitted, favicon copied + path rewritten in `dist/index.html`); `manage.py check` clean; SEO/redirect harness all-pass — `robots.txt`/`sitemap.xml` 200 with expected content, the full legacy-301 matrix, single-hop `www` + `/products/x` → apex `/shop/x`, query preserved, native routes serve 200, `/api` still passes through.
- **Result:** **Phase 4 complete — all build phases done.** The public site is launch-ready pending owner/deploy tasks (deploy, secret rotation, payment + email providers, a real social share image). Deferred by owner decision: customer accounts / "Thrift+" and a real price-drop schedule engine.

### Session 6 — Content polish + launch copy (Canfield, categories, pickup-only)

- **Goal:** Align the public site with current store reality and tone before deploy.
- **Scope (done):**
  - **Store facts:** Canfield retail (8425 W Center Rd; Mon–Sat 9–6; (402) 881-9861); removed closed warehouse (8072 H St) from Visit + holding page.
  - **Shop:** taxonomy v1 categories (19) via `shop_categories.py` + `seed_shop_categories`; collection legacy 301s → taxonomy slugs.
  - **UX/copy:** pickup-only checkout (no ship UI / no nationwide-shipping promises); Sell page “coming this summer”; sticky high-visibility under-construction banner; larger high-res logos; Google Maps embed on Visit; three blog posts with photos; removed shop empty-state “Ask what’s in stock” and hero secondary CTA.
  - **Dev:** `start_servers.bat` / `kill_servers.bat` include public Vite on `:5174`.
- **Result (2026-05-30):** Content polish complete. Released **v2.26.0**. **Next:** deploy to Heroku, run `seed_shop_categories` on prod, rotate secrets, wire payment + email.

---

## See also

- Plan of record (approved): mirrors this file's phases.
- [`.ai/reference/shopify-site-copy/`](../reference/shopify-site-copy/README.md) — mockup HTML + scraped copy.
- [`.ai/extended/frontend.md`](../extended/frontend.md) — routing/pages (update as the public site lands).
- Predecessor: [`web_ui_cleanup`](./_archived/_completed/web_ui_cleanup.md) (staff nav/page audit, shipped v2.25.0).
- [`.ai/initiatives/_index.md`](_index.md).
