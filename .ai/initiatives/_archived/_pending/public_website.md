<!-- initiative: slug=public-website status=pending updated=2026-05-30 -->
<!-- Archived 2026-05-30: disposition=pending paused off main index (build shipped v2.26.0; owner launch tasks deferred) -->
<!-- Last updated: 2026-05-30 (Session 7 closed; parked pending) -->

# Initiative: Public website (storefront rebuild)

**Status:** **Pending** (parked off main index, 2026-05-30) — **Phases 0–4 + Session 7 shipped in code** ([`CHANGELOG`](../../../../CHANGELOG.md) **v2.26.0**). Engineering scope for the storefront rebuild is **done** in repo.

**Resume when:** you are ready to **deploy** (`git push` + Heroku, `seed_shop_categories` on prod), and/or after **Helcim + email** conversations (owner target: week of 2026-06-02). Optional later: social share image, customer accounts, real price-drop engine.

**Deferred (not in scope for the parked period):** live card charges, transactional email provider, OG share image.

Rebuild the public Eco-Thrift website (previously Shopify) **inside this repo**, served from the **same Heroku app** (`ecothrift-dashboard`) and split by hostname. The owner pointed `ecothrift.us` and `www.ecothrift.us` at the Heroku app on 2026-05-30 (DNS + TLS done; `ALLOWED_HOSTS` already includes both). The staff dashboard stays on `dash.ecothrift.us`.

- **End goal (owner-confirmed):** **full online checkout** — real payments (Stripe), shipping/tax, and order management (what Shopify did).
- **Catalog (owner-confirmed):** a **separately hand-curated web catalog** — staff manually pick/list a subset of items with their own photos, descriptions, and prices (not auto-pulled from floor inventory).
- **Design source of truth:** `ecothrift-store.html` (full storefront mockup) + real copy in `site_copy.md`. Plan of record: this file (mirrors the approved session plan).

---

## Pre-flight (owner — launch)

- **DNS propagation.** Apex `A` record may still cache the old Shopify IP (`23.227.38.65`) for a few hours; re-check `Resolve-DnsName ecothrift.us -Server 8.8.8.8` until it resolves to Heroku. `ALLOWED_HOSTS` already includes apex + `www` (verified on Heroku).
- **No CORS work needed.** The frontend uses a **relative** `/api` base URL (no `VITE_API_URL` anywhere), so pages are same-origin with the API.

---

## Current state (grounding facts)

| Area | Today | Implication |
|------|-------|-------------|
| Host routing | **None.** [`ecothrift/urls.py`](../../../../ecothrift/urls.py) has one prod SPA catch-all (`^(?!api/|db-admin/|static/|assets/).*$` → `index.html`). Every host serves the **staff dashboard** SPA (`/` → `/dashboard` → login). | Right now `ecothrift.us` shows the **staff login**. Phase 0 displaces it. |
| Frontend build | One Vite build → `frontend/dist`, WhiteNoise + `heroku-postbuild` ([`package.json`](../../../../package.json), [`Procfile`](../../../../Procfile)). `APP_DIRS=True` so Django templates resolve from apps. | A public site can be a 2nd Vite build or Django-rendered; confirm in Phase 1. |
| Product data | [`apps/inventory/models.py`](../../../../apps/inventory/models.py) `Item` has `price`, `unit_retail`, `status` (`on_shelf`/`sold`), `condition`, `sku`; `Category` has slugs. **No image fields anywhere**, no description on `Item`. | Curated catalog + photos are net-new (Phase 2). |
| Public API | Only `AllowAny` read endpoint is `item_lookup` ([`apps/inventory/views.py`](../../../../apps/inventory/views.py)) via `ItemPublicSerializer`. S3 serves **presigned/authenticated** URLs ([`apps/core/models.py`](../../../../apps/core/models.py)). | Public catalog/cart/checkout API + public image URLs are net-new. |
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

- **Payment processor** — *not Stripe* (owner decision 2026-05-30); likely **Helcim**. For now build a provider-agnostic abstraction + no-op stub (no live charges); wire the real processor when the account/keys exist. Email provider (SES/Postmark/SendGrid) for order confirmations; Nebraska sales-tax handling/registration; refund/privacy/terms pages (refund copy exists in `site_copy.md`).
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
- [x] [`.ai/extended/frontend.md`](../../../extended/frontend.md) and [`.ai/context.md`](../../../context.md) updated as routes/architecture change; releases bumped per [`ship-push-git.md`](../../../protocols/ship-push-git.md). *(v2.26.0)*

---

## See also

- Plan of record (approved): mirrors this file's phases.
- `.ai/reference/shopify-site-copy/` — mockup HTML + scraped copy.
- [`.ai/extended/frontend.md`](../../../extended/frontend.md) — routing/pages (update as the public site lands).
- Predecessor: [`web_ui_cleanup`](../_completed/web_ui_cleanup.md) (staff nav/page audit, shipped v2.25.0).
- [`.ai/initiatives/_index.md`](../../_index.md).
