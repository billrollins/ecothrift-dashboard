<!-- Last updated: 2026-07-13T14:55:00-05:00 (Phase 0 accepted) -->
# Phase 0 Contract — Online Sales Workspace

**Initiative:** [`.ai/initiatives/online_sales_workspace.md`](../../initiatives/online_sales_workspace.md)  
**Status:** **Accepted 2026-07-13T14:55:00-05:00** (America/Chicago)  
**Mode:** Decision/specification only — no application code, migrations, seeds, deploys, or semver in this phase.

**Supersedes for planning:** parked [`public_website`](../../initiatives/_archived/_pending/public_website.md) Helcim / ship / full-checkout end goal. Deploy/DNS/SPA architecture facts from that initiative remain useful; payment and shipping resume only if Policy v1 is explicitly amended.

---

## Owner acceptance record

| Gate | Decision | Status |
|------|----------|--------|
| **G1 Hold expiry** | Confirmed hold lasts until **store close on the next business day** after confirmation. Manager+ may extend with a required reason. | **Accepted** |
| **G1b Hours source** | Canonical hours: **Eco-Thrift — Canfield**, Mon–Sat **9:00–18:00**, **closed Sunday**. Holidays treated as non-business days. Phase 1 persists via `AppSetting` (or equivalent) — do **not** assume `WorkLocation` has hours fields today. | **Accepted** |
| **G2 Returns** | Default **final sale**. Optional Manager-selected **48-hour return eligible → store credit**. As-is / untested / parts-only / clearance **always final**. Template exists in Phase 1 but stays **disabled/not advertised** until store-credit ops exist. | **Accepted** |
| **G3 Capability holders** | Until named Online Sales staff are assigned: **Operate** = Manager/Admin; **Publish** = Manager/Admin; **Financials** = Manager/Admin; **Configure** = Admin (Manager optional for channel templates). Employees without grant: no Online Sales nav. | **Accepted (role defaults)** |
| **G4 Facebook first** | **Facebook Page post template** first in Phase 1. Marketplace is **Phase 2** config unless owner later promotes it to daily work. | **Accepted** |

| Deliverable | Status |
|-------------|--------|
| D1 Workspace/nav contract | **Accepted** |
| D2 Policy v1 + staff SOP | **Accepted** |
| D3 Data / migration / security | **Accepted** |
| D4 Phase 1 build brief + acceptance script | **Ready to build** |

**Migration posture:** **A — greenfield-ish** (empty webstore tables; 5 upstream `online_sales` Items).

---

## A. Production / local inventory evidence (REDACTED)

**Env used:** both — local Django/PostgreSQL (`search_path=ecothrift`) + prod read-only via `heroku pg:psql -a ecothrift-database` (note: `ecothrift-dashboard` has no Postgres addon).  
**As-of:** 2026-07-13 ~14:50 America/Chicago  
**PII in docs:** none (aggregates only).

### HTTP (unauthenticated GET)

| URL | Status | Kind |
|-----|--------|------|
| `https://ecothrift.us/` | 200 | Public SPA shell |
| `https://www.ecothrift.us/` | 301 → `https://ecothrift.us/` | Apex redirect |
| `https://dash.ecothrift.us/` | 200 | Staff SPA shell |
| `https://ecothrift.us/shop` | 200 | Public SPA (shop route present) |
| `https://ecothrift.us/checkout` | 200 | Public SPA (checkout route present — **must cut over** in Phase 1) |
| `https://ecothrift.us/api/webstore/catalog/` | 200 JSON | **count=0** |

### Aggregate DB counts (schema `ecothrift.*`; local ≈ prod)

| Metric | Value |
|--------|-------|
| WebListing by status | **0 rows** (empty) |
| WebListingImage | **0** |
| linked_item / zero_stock / multi_stock | **0 / 0 / 0** |
| Order by status/payment/fulfillment | **0 rows** |
| OrderLine | **0** |
| Items `location='online_sales'` not sold/scrapped/lost | **5** |
| Nonempty customer PII rows | **no** |

### Config (non-secret)

| Key | Effective |
|-----|-----------|
| `WEBSTORE_PAYMENT_PROVIDER` | **`manual`** (Heroku unset → settings default) |
| `WEBSTORE_SALES_TAX_RATE` | default `0.07` in settings |
| `WEBSTORE_SHIP_FLAT` | default `9.95` in settings (API still accepts ship — Phase 1 rejects) |
| `PUBLIC_SITE_HOSTS` (prod) | `ecothrift.us,www.ecothrift.us` |

### Posture decision

**A — greenfield-ish.** Zero listings/orders/images and no customer PII rows. Additive schema and language cutover are safe. Still treat the **5 `online_sales` inventory items** as upstream handoff inventory for Phase 2 intake (not Order migration).

---

## B. Workspace / nav contract (D1) — Accepted

### Target Slot C order

`Buying → Processing → Restoration → Inventory → Retail Floor → Store Sales → Online Sales → Admin`

| Current workspace id | Action | Target id / label | Helper |
|----------------------|--------|-------------------|--------|
| `buying` | Keep | Buying | unchanged |
| `processing` | Keep | Processing | unchanged |
| `restoration` | Keep | Restoration | unchanged |
| `inventory` | Keep | Inventory | unchanged |
| `floorOps` / Floor Ops | **Rename** | `retailFloor` / **Retail Floor** | Floor and shelf work |
| *(none)* | **Add** | `onlineSales` / **Online Sales** | List, reserve, message, market, and track results |
| `cashier` / Cashier | **Rename** | `storeSales` / **Store Sales** | Register, cash, POS setup |
| `admin` | Keep (trim) | Admin | Setup and access |
| Essentials | Keep | Dashboard, Time clock | Fix README “Employees” drift on cutover |

**localStorage:** extend `SLOT_C_WORKSPACE_ID_MIGRATION` with `floorOps→retailFloor`, `cashier→storeSales`. Key: `ecothrift.navC.workspace.v1`.

### Online Sales destinations

| Destination | Route | Phase |
|-------------|-------|-------|
| Work queue | `/online-sales` | **2** (full); Phase 1 may show a stub/home linking to Listings + Inbox |
| Listings | `/online-sales/listings` | **1** |
| Listing Studio | `/online-sales/listings/:id` | **1** |
| Inbox & Holds | `/online-sales/inbox` | **1** |
| Marketing | `/online-sales/marketing` | **2** |
| Sales | `/online-sales/sales` | **2** |

### Keep / move / rename / remove matrix

| Current | Path | Nav roles | Route guard | Decision | Target |
|---------|------|-----------|-------------|----------|--------|
| `webStore` | `/admin/web-store` | Manager, Admin | ManagerRoute | **Move + rename** | Online Sales **Listings**; redirect legacy |
| `webOrders` | `/admin/web-orders` | Manager, Admin | ManagerRoute | **Move + replace semantics** | Online Sales **Inbox & Holds**; redirect legacy |
| `blogStudio` | `/blog-studio` | superuserOnly | SuperAdminRoute | **Move nav only** | Online Sales → Marketing child; keep path + new window |
| `posSetup` | `/admin/pos-setup` | Manager, Admin | ManagerRoute | **Move** | Store Sales (path may stay until later) |
| `qualityAudit` | `/admin/quality-audit` | Manager, Admin | ManagerRoute | **Move** | Retail Floor |
| `qualityAuditForms` | `/admin/quality-audit/forms` | Super Admin | SuperAdminRoute | **Move** | Retail Floor; keep Super Admin |
| Assumptions, Employees, Customers, Permissions, Settings, Label Studio, Time & payroll | `/admin/*` | as today | as today | **Keep** | Admin |
| `searchItems` | `/inventory/items` | legacy; not in layout | — | **Remove catalog alias in Phase 2** after grep; route may remain | — |
| `restorationQueue` | `/restoration/queue` | not in layout; redirects to TARS | — | **Remove catalog alias in Phase 2** | redirect already exists |
| `restorationReturns` | `/inventory/restorations` | deprecated preference | — | **Remove after preference migration verified (Phase 2)** | use `restorations` |
| Floor Ops items | quick reprice, floorplans | staff | staff | **Keep** under Retail Floor | rename workspace only |
| Cashier items | terminal, transactions, drawers, cash | staff | staff | **Keep** under Store Sales | rename workspace only |
| Processing / TARS `online_sales` exits | existing | staff | staff | **Keep** upstream | no Online Sales nav merge |

### Phase split (explicit)

| Phase | Nav ships |
|-------|-----------|
| **1** | Online Sales workspace shell; Listings + Studio; Inbox & Holds; Blog Studio nav entry under Online Sales; redirects `/admin/web-store` → listings, `/admin/web-orders` → inbox |
| **2** | Work queue, Marketing, Sales; Floor Ops→Retail Floor; Cashier→Store Sales; POS setup + QA moves; stale alias cleanup; nav README fix |

### Public routes (cut over in Phase 1, same release)

| Current | Target |
|---------|--------|
| `/shop`, `/shop/:slug` | Keep browse; CTA → **Request a hold** |
| `/checkout` | Hold-request flow (not Place order) |
| `/order/:number` | Public status by **unguessable token**; lockdown `ETW#####` |
| Cart “checkout / payment coming soon” | Hold + pickup policy; no payment tease |

---

## C. Policy v1 + staff SOP (D2) — Accepted

### Customer-facing Policy v1 (final copy)

> Request a hold online. A hold starts only after Eco-Thrift confirms the item is available and staged. Confirmed holds last until store close on the next business day. Pay and pick up in person; Eco-Thrift does not take online payment or offer delivery for these listings. Inspect the item before paying. Sales are final unless the listing is specifically marked **48-hour return eligible**. An eligible return requires the original receipt, all parts, and the item in the same condition; the remedy is store credit. As-is, untested, parts-only, and clearance items are always final sale.

**Pickup location (customer copy):** Eco-Thrift — Canfield, 8425 W Center Rd, Omaha, NE 68124. Hours: 9 AM – 6 PM, Monday – Saturday; closed Sunday.

### Staff SOP (numbered)

1. **Request arrives** (website hold form or staff-logged channel message) → Reservation `requested`; conversation opens `needs_reply` if inbound.
2. **Verify** Listing available qty and linked Item (not sold/scrapped/lost; not held elsewhere).
3. **Stage** physical item; set Reservation toward staging; create pick/stage task if linked Item.
4. **Confirm** → Reservation `confirmed` → `ready_for_pickup`; set `hold_expires_at` = store close next business day (G1/G1b); decrement available (increase reserved) transactionally.
5. **Customer notified** with public status token (minimum fields); policy + expiry shown.
6. **During hold:** Manager+ may **extend** with reason; customer/staff **cancel** releases qty; **decline** if unavailable.
7. **Expiry / no-show:** auto or job releases reserved qty; record no-show; reopen availability; conversation may resolve.
8. **Pickup:** POS completion linked to Reservation → sale; mark Reservation `completed`; Listing/Item sold rules apply; tax/payment at POS.
9. **Returns:** only if Listing/sale snapshotted return-eligible template and ops support exists; otherwise final sale.

### After-hours / Sunday / holiday

- Confirmation timestamp in America/Chicago.
- If confirmed Fri after close, Sat open day → expires Sat close; if Sat after close or Sunday → next open business day close (typically Monday).
- Closed Sundays and recorded holidays are non-business days.
- Hours source: G1b (AppSetting in Phase 1; seed from Canfield copy above).

### Edge cases (SOP)

| Edge | Rule |
|------|------|
| Partial qty on multi-qty Listing | Confirm only available qty; partial holds allowed |
| Item already in open POS cart | Confirm hold fails or requires manager override that clears cart line — **prefer fail-safe: block confirm until cart cleared** |
| Item sold on floor before confirm | Decline request; pause/sold Listing as appropriate |
| Unlinked / manual Listing | Hold without Item; POS completion uses manual/external sale path with reconciliation |
| Manager override on POS scan of held Item | Require reason; audit |
| Return-eligible before ops ready | Template **off**; do not show on public Listing |

### Copy surfaces that must change together (Phase 1 same release)

Public: Shop pickup note, Product CTA, CartDrawer, CheckoutPage, OrderConfirmation, `emails.py`.  
Staff: Web orders vocabulary → Inbox & Holds.  
Server: reject `fulfillment=ship`, online payment providers other than manual-no-charge reserve path, and stale “checkout/order” customer promises.

### Server policy (not UI-only)

- Reject shipping/delivery attempts with 4xx.
- Reject online card capture / Helcim `requires_action` under Policy v1.
- Do not use “Place order” / “Buy now” / “Pay online” in customer-facing copy.
- Online price = expected **pre-tax** item price; POS calculates tax at pickup.

---

## D. Data / migration / security contract (D3) — Accepted

### Source of truth

| Object | Owns | Must not |
|--------|------|----------|
| Item / Product | SKU, cost, operational status/condition/location, source | Become a second public catalog |
| Listing (`WebListing` table kept) | Public title, description, photos, asking price, disclosures, return-policy badge, slug/SEO, channel copy, on-hand qty, publication state | Silently overwrite from Item after staff edit; hard-delete routine |
| Reservation | Customer/contact, qty, expiry, staging, conversation link, completion | Parallel “Order” active truth |
| Channel publication | Channel, copy snapshot, URL, post state, timestamps | Store passwords |
| Conversation | Channel, direction, body/summary, response state | Require FB API sync in Phase 1–2 |
| POS Cart / Receipt / Sale | Payment, tax, revenue truth | Be duplicated in Online Sales P&L |
| Intake (Phase 2) | Queue from Processing/TARS `online_sales` + manual | Vanish without reason |

**Product FK for multi-qty:** **Deferred to Phase 2.** Phase 1: unique Items use qty on hand = 1 + Item FK; multi-qty Listings may use on-hand > 1 without Product FK until evidence requires it. Production today: **0 multi_stock listings**.

### State machines

**Listing:** `draft → ready → published ↔ paused → sold | archived`  
- Map from today: `draft`→draft; `published`→published; `archived`→archived; introduce `ready`, `paused`, `sold`.  
- Do **not** put `hold` on Listing status. Availability = on_hand − active_reserved.

**Reservation:** `requested → confirmed → ready_for_pickup → completed`; exits `declined | expired | cancelled`.

**Channel publication:** `draft → posted ↔ paused → ended`.

**Conversation:** `needs_reply ↔ waiting_on_customer → resolved`.

**Intake (Phase 2):** `queued → in_progress → listed | not_listing → closed` (reason required on not_listing).

### Quantity

| Field | Meaning |
|-------|---------|
| `quantity_on_hand` | Physical/units available to commit (migrated from `stock` when reserved=0) |
| `quantity_reserved` | Sum of active confirmed/ready reservations |
| `quantity_available` | Derived: on_hand − reserved |

Rules: transactional locks on confirm/expiry/cancel/sale; race test qty-1 cannot double-hold; publishing does not mark Item sold; confirming hold does not mark sold; POS completion is the sale event.

### Legacy Order → Reservation (posture A)

With **0 Orders**, mapping is still required for code cutover and empty-table migration safety:

| Legacy Order | Target |
|--------------|--------|
| Table `webstore_order` | Prefer **evolve in place** with `kind`/`reservation` semantics **or** new Reservation table + archive FK; **one active commitment API**. Product language = Reservation. Keep DB rename optional. |
| `pending` + unpaid | → `requested` or `confirmed` depending on whether stock already decremented (if any future rows: treat decremented pending as confirmed/ready) |
| `paid` / `fulfilled` | Historical sale — map to completed + linked sale note; not active hold |
| `cancelled` | cancelled; stock already restocked by today’s cancel path |
| `fulfillment=ship` | Quarantine / reject new; historical rare (0 today) |
| `order_number` ETW##### | Display ref only; **never** auth token |
| `stock` column | Rename/split to on_hand; reserved starts 0 |

**DELETE listings:** disable routine hard delete; archive-first. Hard purge owner-only and blocked when reservations/publications/sales exist.

### Public token + privacy

- New unguessable `public_status_token` (e.g. 128-bit URL-safe random).
- Public status serializer: status, expiry, pickup location/hours summary, Listing title, qty — **no** email/phone/address/other customers.
- Legacy `GET order-status/<ETW#####>/`: **deny** or return 410 after cutover (posture A: safe to hard-cut).
- Rate-limit + idempotency on public hold request.

### POS hold guard

- Confirmed hold on linked Item → ordinary POS add blocked with hold identity shown.
- Matching Reservation completion at pickup allowed.
- Manager override requires reason + audit.
- Kill-switch / feature flag for emergency floor override documented in Phase 1 brief.

### Audit events (minimum)

publish/pause/archive; quantity adjust; hold confirm/extend/expire/cancel/decline; policy override; sale completion; fee/cost override; manual reconciliation.

### Rollback

| Layer | Rollback |
|-------|----------|
| DB | Additive columns/tables; deploy can leave columns unused if SPA reverted |
| Public SPA | Redeploy prior `frontend-public` build |
| Staff nav | Redirects reversible; workspace id migration map retained |
| Email | Copy-only; console/SMTP unchanged in Phase 0 |
| Data loss | Not acceptable for Listings/Reservations once created; posture A has no customer Orders to lose |

### Processing / TARS intake (Phase 2 contract stub)

- Creating disposition/location `online_sales` **must** create or upsert an Intake queue row (Phase 2).
- Fields (minimum): item FK, source (processing|tars|manual), assignee nullable, queued_at, status, not_listing_reason nullable, listing FK nullable.
- Phase 1: staff may still create Listing from Item SKU search without full queue UI.

### Server reject list (Phase 1)

- `fulfillment=ship` / delivery address required paths → 400
- Helcim / card providers while Policy v1 active → 503/400
- Customer “checkout” creating paid-online semantics → removed
- Guessable order-number status auth → removed

---

## E. Access, channels, B2B, contribution — Accepted

### Capabilities (no new primary role)

| Capability | Default holders (G3) | May do |
|------------|----------------------|--------|
| **Operate** | Manager/Admin | Queue/list drafts, photos, copy, messages, ordinary holds |
| **Publish** | Manager/Admin | Publish/pause/end channels, qty adjust, hold extend/override |
| **Financials** | Manager/Admin | Sales, costs, fees, contribution views |
| **Configure** | Admin (+ Manager optional) | Channel/policy/template config |

**Known mismatch:** API `IsStaff` (Employee+) vs UI Manager/Admin. Phase 1 aligns nav, routes, and API to capabilities.

### Channels

- **Website:** native publish via Listing status.
- **Facebook Page:** Phase 1 template cards — title, body, price/CTA, canonical URL, optional hashtags; actions Copy title/body/all, Open channel, Mark posted, Paste URL, Regenerate (confirm before overwrite).
- **Marketplace:** Phase 2 unless owner amends G4.
- **Accounts:** metadata + password-manager vault reference only — **never** passwords, MFA seeds, recovery codes, API tokens in DB fields.

### B2B

Channel/type `b2b` in Phase 2 Sales log. No quotes/invoicing/AR in this initiative.

### Contribution (Phase 2 reporting; define now)

`contribution = gross_merchandise_sales - discounts - COGS_snapshot - channel_fees_snapshot - direct_expense - accepted_return_loss`

- Tax and tender are not revenue.
- POS-linked pickup reuses Cart/Receipt; no double count.
- Manual external sale requires reason + reconciliation state.

---

## F. Phase 1 build brief (D4) — Ready to build

### Ordered vertical slices (do not reorder casually)

1. **Additive schema + migration** — Listing lifecycle/return policy fields, quantity on_hand/reserved, Reservation (+ public token), channel draft/publication stubs, audit hooks, archive-first; empty Order path mapped; lockdown legacy status URL.
2. **Listing Studio full page** — `/online-sales/listings/:id`; SKU/queue/manual/duplicate starts; Item prefill + drift; media upload/reorder/alt; sections per initiative; autosave; sticky exact preview; readiness; publish/pause/sold/archive/restore.
3. **Channel cards** — Website + Facebook Page templates; persisted edits; copy/post tracking.
4. **Minimal Online Sales nav** — workspace shell; Listings; Inbox & Holds; Blog Studio nav move; redirects from `/admin/web-store` and `/admin/web-orders`.
5. **Same-release public cutover** — Request a hold UI; server reject ship/pay; staff verify/stage/confirm/expire/cancel; availability; POS held-item guard; linked POS completion; policy copy everywhere listed in §C.
6. **Tests + A-grade trial + rollback rehearsal** — matrix below; owner acceptance.

### Out of Phase 1 (explicit)

Work queue intake automation, Marketing calendar, Sales/P&L UI, B2B, Marketplace template (per G4), Helcim, ship, social API auto-post, Product FK multi-qty, return-eligible public advertising, HR/People nav redesign, storing channel secrets.

### Fixtures

| ID | Fixture |
|----|---------|
| F1 | Unique Item qty=1 linked Listing |
| F2 | Multi-qty Listing (on_hand>1, no Product FK) |
| F3 | Draft incomplete / ready / published / paused / sold / archived |
| F4 | Published Listing with images |
| F5 | Unlinked manual Listing |
| F6 | Requested + confirmed Reservation on F1 |
| F7 | Expired Reservation (qty released) |
| F8 | Held linked Item for POS guard |
| F9 | Empty legacy Order table path / migration no-op |

### Automated tests (required)

| ID | Assert |
|----|--------|
| T1 | Publish readiness rejects missing photo/price/policy/etc. |
| T2 | Concurrent qty-1 holds → exactly one success |
| T3 | Duplicate submit idempotent; public rate limit |
| T4 | Expiry/cancel releases reserved qty |
| T5 | Ship/payment API paths 4xx |
| T6 | Capability matrix on nav/API |
| T7 | Random token status privacy; guessed ETW##### denied |
| T8 | Legacy Order/stock migration safe on empty + synthetic row |
| T9 | POS held Item blocked; override+reason; matching completion |
| T10 | Redirects + workspace selection for new routes |
| T11 | Public copy: Request a hold; no checkout/pay/delivery promise |
| T12 | Media validation / reorder / alt |

### A-grade owner trial (click path)

**Environment:** desktop + phone-width. **Pass:** trained operator completes without Admin archaeology or retyping source facts.

1. Start from Item SKU (or one of the 5 `online_sales` Items) → create Listing → photos → facts → price/qty → copy → readiness green.
2. Exact preview matches public card/detail.
3. Publish to site; confirm public catalog shows Listing.
4. Generate Facebook Page copy; Copy all; Mark posted; paste fake URL.
5. Pause / republish / archive-restore smoke.
6. Public: Request a hold → staff verify/stage/confirm → customer status page shows policy + expiry (token URL).
7. POS: attempt sell held Item → blocked; complete matching pickup → sold once.
8. Alternate: expire/cancel hold → qty available again.
9. Incomplete draft cannot publish; errors inline.
10. Unlinked Listing hold path without Item.
11. Multi-qty partial hold.
12. Regression: no ship fields; no pay-online CTA; Admin legacy URLs redirect.

### Phase 1 stop conditions

- Policy reopened to allow online pay/ship mid-build.
- Double-sale path found without fix.
- Predictable PII token remains.
- Owner grades studio/reserve journey below A for daily use.
- Attempt to store channel passwords in app fields.

### Implementation notes for Grok Fast

- Extend `apps.webstore` + `frontend-public`; upgrade away from modal `WebStorePage` as target UX.
- Prefer Blog Studio / Label Studio patterns for full-page studio chrome, not Admin DataGrid dialogs.
- Align permissions: capabilities on routes + API.
- Hours: `AppSetting` keys for Canfield open/close + closed weekdays; seed Mon–Sat 09:00–18:00, Sun closed.
- Feature flags: public hold endpoint, POS hold guard (for rollback).
- Create `apps/webstore/tests/` (none exist today).
- Do not bump `.version` until user-visible ship + `session.9.Close`.

---

## Phase 0 exit checklist

- [x] Production posture recorded; migration **A**
- [x] Gates G1–G4 accepted
- [x] D1–D3 Accepted; D4 Ready to build
- [x] Fixtures, tests, A-grade script, rollback explicit
- [x] `public_website` Helcim/ship marked superseded for planning
- [x] Zero application code / migration / config / secret / PII in Phase 0 diff
- [x] Initiative Session 3 + acceptance + `_index` / `context` → Phase 1 next

*End of Phase 0 contract.*
