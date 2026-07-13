<!-- initiative: slug=online-sales-workspace status=active updated=2026-07-13 -->
<!-- Last updated: 2026-07-13T14:55:00-05:00 (Phase 0 accepted; Phase 1 ready) -->

# Initiative: Online Sales Workspace & Listing Studio

**Status:** **Active** — **One-shot ship ready for owner click-through (2026-07-13).** Phase 0 contract remains canonical for policy. Staff Online Sales workspace + Listing Studio + holds + POS guard + full Slot C nav are in code; lean hard-control tests green.

**Purpose:** Make Eco-Thrift’s **online / external selling** operation excellent: a dedicated **Online Sales workspace** with a best-in-class **Listing Studio**, easy publish to **www.ecothrift.us**, one-action **channel post copy** (Facebook first), truthful quantity and reservation handling, customer-message tracking, channel/accounts/fees, basic contribution reporting, and a **clear pickup-only policy**—while keeping Slot C and making its workspace names and page placement honest.

**Planning rule:** This document now contains a **working product contract**, not only a list of questions. Decisions marked **Locked** come directly from owner direction. Decisions marked **Adopted default** are the implementation default unless the owner changes them before the relevant phase. **Owner gates** are the few business-policy choices that still require explicit acceptance. Phase planning may refine implementation details, but must not casually reopen these decisions without new evidence.

**Related (do not conflate):**

| Related | Boundary |
|---------|----------|
| [`public_website`](./_archived/_pending/public_website.md) (parked) | Owns the shipped public-site code and unresolved production-launch work. Its old “full checkout / shipping / Helcim” direction is **superseded for current planning** by this initiative’s owner-directed **reserve online, pay/pick up in store, no delivery, no online payment** policy. Payment/shipping may not resume without an explicit policy change. |
| [`blog_studio`](./_archived/_completed/blog_studio.md) (shipped) | Blog records/editor remain technically separate. Its **nav entry moves under Online Sales → Marketing** because it is content work, not system administration. No data-model merge is required. |
| Admin **Web store** / **Web orders** (`/admin/web-store`, `/admin/web-orders`) | Brownfield surfaces to **replace in place**: Web store becomes **Listings / Listing Studio**; Web orders becomes **Inbox & Holds** with reservation semantics. Legacy routes redirect during migration. |
| Inventory disposition **Online Sales** (Processing / TARS exits) | Upstream handoff into the online pipeline; this initiative owns what happens **after** an item is destined for online/external sale. |
| Inventory **Item / Product** | Operational identity, SKU, cost, status, and source remain authoritative here. A Listing is the customer-facing offer; the Listing Studio does not become a second inventory editor. |

---

## Finish line (initiative)

Online selling is no longer a pile of Admin pages and tribal process:

1. **One workspace** — staff open **Online Sales** for listing, posting, reservations, messages, channel metadata/fees, and basic contribution—not scattered Admin leftovers.
2. **Perfect Listing Studio** — creating and updating what we sell online is fast, obvious, and complete (source, photos, disclosures, copy, quantity, publication state, and where it is posted).
3. **Publish once, post everywhere** — listing to **www.ecothrift.us** is extremely easy; the same studio listing produces **templated channel text** (e.g. Facebook title + focused body) without rewriting from scratch.
4. **Policy is real** — starting policy is written, visible to staff/customers as needed, and product flows respect it (chat/reserve online; pay & pick up in person; strict returns; no delivery; no online payments; reserve pickup window).
5. **Ops visibility** — we know the **pipeline of items to list**, **where each is posted**, customer/hold state, channel metadata/fee rules, and **basic contribution** for online/external sales; B2B is included as a channel/type.
6. **Nav honesty** — Slot C workspace format kept; macros/names/placements updated; removable or combinable pages decided and executed.

The initiative is complete only when the workspace, editor, policy, and nav cutover are in daily use—not when a single editor prototype exists.

---

## Why this exists

Eco-Thrift already has pieces of online commerce (public site rebuild in repo, staff Web store / Web orders, Blog Studio, items that can exit Processing/TARS toward Online Sales). What is missing is a **coherent operating system** for the Online Sales / marketing team:

- Where does the work live in the dashboard (workspace + nav)?
- How do we make listing and publishing to the site *delightfully* easy?
- How do we keep Facebook (and other channels) in sync without duplicate labor?
- How do we track listing workflow, reservations, quantities, messages, fees, and whether online selling is actually profitable?
- What may customers do online vs in store—and how do we enforce that?

Without that system, online sales stay fragile, policy stays oral, and Admin accumulates half-related pages.

---

## Owner intent (captured 2026-07-13)

1. **Nav rethink (keep Slot C workspaces)** — inventory pages needed; find better placements, better macro names; remove old pages; combine or update pages where it helps.
2. **Online Sales Workspace** — may combine Social Media Marketing, marketing analysis/planning, Online Sales log (pipeline of items to list; where listed; fees/accounts/logins; basic P&L). **May** be where B2B sales are tracked.
3. **Extremely easy site publish** — www.ecothrift.us; studio posts also produce easy FB/other **templated text areas** (e.g. title, fields, FB-focused text).
4. **Lifecycle fields** — Pending / Hold / etc., Qty, and related listing states.
5. **Messages** — a place to track customer/channel messages.
6. **Policy (v1 starting point):**
   - Chat / reserve **online**
   - Pay / pick up **in person**
   - **Select returns** — strict policy required
   - **No delivery**
   - **No online payments**
   - Clear **reserve pickup deadline** (how long the hold lasts)

---

## Decision baseline — 2026-07-13

**Phase 0 status:** Accepted — full contract in [`.ai/reference/online_sales_workspace/phase_0_contract.md`](../reference/online_sales_workspace/phase_0_contract.md). Gates G1–G4 resolved; migration posture **A**.

### Decision register

| Decision | Status | Working contract |
|----------|--------|------------------|
| Workspace name | **Locked / Accepted** | **Online Sales**. Do not dilute it to “Marketing” or hide it in Admin. |
| Editor name / object | **Accepted** | **Listing Studio** edits a customer-facing **Listing**. Inventory Item/Product remains a separate operational source of truth. |
| Slot C | **Locked / Accepted** | Keep the workspace selector and one-workspace-at-a-time format. |
| Workspace placement | **Accepted (amended)** | Place **Online Sales** after **Store Sales** (before Admin). |
| Public transaction | **Locked / Accepted** | **Request/confirm a hold → pay and pick up in person.** No delivery and no online payment. |
| Website vs channels | **Accepted** | Website publishing is native. Facebook **Page** templates in Phase 1; Marketplace Phase 2. |
| “Hold” / “pending” | **Accepted** | A hold belongs to a **Reservation**, not the Listing status. Never use an unlabeled “Pending”; say what is pending. |
| Quantity truth | **Accepted** | Store on-hand quantity; derive reserved and available quantities transactionally. Never overload one `stock` number to mean all three. |
| Existing checkout/order code | **Accepted** | Migrate to one active **Reservation** concept; do not operate parallel “Order” and “Reservation” truths. Preserve legacy history during migration (empty today). |
| B2B | **Accepted** | B2B is a **sales channel/type inside Online Sales** (Phase 2), not another workspace or full CRM. |
| Blog Studio | **Accepted** | Keep its editor/data separate; move its nav entry under Online Sales → Marketing. |
| Accounts / logins | **Locked security guardrail** | Track channel ownership, handle, login URL, fees, and password-manager reference—**never passwords, MFA seeds, recovery codes, or tokens** in dashboard fields. |
| Revenue truth | **Accepted** | In-store pickup payment closes through POS and links back to the reservation/sale. Reports reuse that transaction instead of counting revenue twice. |
| Destructive delete | **Accepted** | Archive listings and preserve history. Hard purge is exceptional, owner-only, and blocked when reservations/publications/sales exist. |
| Migration posture | **Accepted** | **A — greenfield-ish** (0 listings/orders; 5 upstream `online_sales` Items). |

### 1. Workspace and page map

**Target Slot C order:**

`Buying → Processing → Restoration → Inventory → Retail Floor → Store Sales → Online Sales → Admin`

- **Floor Ops → Retail Floor** — clearer macro name; move Quality Audit + QA Forms here because they are floor work.
- **Cashier → Store Sales** — its pages include transactions, drawers, cash management, and POS setup; “Cashier” is too narrow.
- **Online Sales** — new first-class workspace; helper text: **“List, reserve, message, market, and track results.”**
- Keep **Buying, Processing, Restoration, Inventory, Admin** names for this initiative. A broader HR/People reorganization is not required to ship Online Sales.

**Five primary Online Sales destinations (deliberately not ten):**

| Destination | Canonical route | Owns |
|-------------|-----------------|------|
| **Work queue** | `/online-sales` | Items intended for online sale, assignments, age, readiness, expiring holds, messages needing response, and next action. |
| **Listings** | `/online-sales/listings` | Listing library, filters, channel presence, and create. A full-page editor lives at `/online-sales/listings/:id`. |
| **Inbox & Holds** | `/online-sales/inbox` | Customer conversations, hold requests, confirmed reservations, pickup staging, expiry/no-show, and completion. Messages and holds stay together because they are one customer workflow. |
| **Marketing** | `/online-sales/marketing` | Listing-linked and standalone post drafts, light content calendar, campaigns, and channel-copy queue. Blog Studio is a permission-filtered child link, not a merged editor. |
| **Sales** | `/online-sales/sales` | Online/external sales log, B2B filter, channel/fee configuration, direct expenses, and basic contribution reporting. |

**Nav move / combine / remove baseline:**

| Current | Decision |
|---------|----------|
| Admin → **Web store** | Rename **Listings**; move to Online Sales; replace modal editor with Listing Studio; legacy `/admin/web-store` redirects to `/online-sales/listings`. |
| Admin → **Web orders** | Replace with **Inbox & Holds**; migrate active behavior from “order/checkout” to reservation/pickup; legacy `/admin/web-orders` redirects. |
| Admin → **Blog studio** | Move nav item to Online Sales → Marketing; preserve `/blog-studio`, Super Admin gate, and separate window. |
| Admin → **POS setup** | Move to Store Sales; route can remain until a later route cleanup. |
| Admin → **Quality Audit / QA Forms** | Move to Retail Floor; keep existing permission differences. |
| Admin → Assumptions, Employees, Customers, Permissions, Settings, Label Studio, Time & payroll | Keep in Admin in this initiative. Their future regrouping is not required for Online Sales. |
| Stale nav catalog IDs (`restorationQueue`, deprecated `restorationReturns`, hidden legacy `searchItems`) | Remove unused catalog aliases only after reference verification; keep intentional route redirects/bookmarks as appropriate. |
| Navigation README | Correct stale “Essentials: Employees” text and document the accepted workspace order during cutover. |

### 2. One source of truth and explicit state machines

**Data ownership:**

- **Inventory Item/Product owns:** SKU, product identity, acquisition cost, source, operational condition/status, and physical location.
- **Listing owns:** public title, customer description, photos/order, asking price, public condition/disclosures, return-policy badge, website slug/SEO, and channel-specific copy.
- **Reservation owns:** customer/contact, requested/confirmed quantity, expiry, pickup/staging state, conversation, and completion/cancellation.
- **Channel publication owns:** channel, external ID/URL, channel price, post state, posted/ended timestamps, and the exact copy used.
- **Sale owns:** price/discount snapshots, source channel, linked POS transaction when applicable, COGS snapshot, fee snapshots, direct costs, and return outcome.
- Prefill Listing fields from a linked Item/Product once; later source changes produce a visible **“source changed”** comparison. Never silently overwrite staff-authored public copy.

**Workflow objects and states:**

- **Intake / work queue:** `queued → in_progress → listed | not_listing → closed`. Every “not listing” exit requires a short reason so the queue does not disappear silently.
- **Listing:** `draft → ready → published ↔ paused → sold | archived`.
  - `draft` can be incomplete.
  - `ready` passes publish checks but is not public.
  - `published` is public; `paused` is intentionally unavailable/hidden without losing work.
  - `sold` keeps a stable public URL with a Sold badge and similar-items action; `archived` leaves active views.
- **Reservation:** `requested → confirmed → ready_for_pickup → completed`; exits are `declined`, `expired`, or `cancelled`.
- **Manual channel publication:** `draft → posted ↔ paused → ended`. A sold/paused/expired item creates a visible task to update the external post.
- **Conversation:** `needs_reply ↔ waiting_on_customer → resolved`.
- Do not add `hold` to Listing status. Availability is `quantity_on_hand - active_reserved_quantity`; public UI may say **Reserved** when available quantity reaches zero.

**Quantity and inventory rules:**

- Replace ambiguous `stock` semantics with **on hand**, **reserved**, and derived **available**.
- Unique thrift item: quantity on hand is 1 and the Listing links to one Item.
- Multi-quantity offer: quantity on hand may exceed 1 and may link to a Product rather than pretending one Item row represents every unit.
- Reservation confirmation, expiry/cancel, and sale completion lock affected rows transactionally; race tests must prove a quantity-1 item cannot be held twice.
- A confirmed hold creates a **pick/stage task** and makes the linked Item unavailable to ordinary floor sale. POS scanning a held item must identify the hold and require matching completion or a manager override with reason.
- Publishing does **not** mark an Item sold. Requesting/confirming a hold does **not** mark it sold. In-store payment/POS completion is the sale event.

### 3. “Perfect” Listing Studio contract

The current `WebStorePage` create/edit dialogs are a brownfield seed, not the target.

**Interaction decisions:**

- Full-page, responsive studio—not a cramped modal.
- Entry paths: **scan/search an Item**, open a work-queue candidate, duplicate an existing Listing, or create an unlinked/manual Listing.
- Draft auto-save with clear **Saving / Saved / Error / Unsaved upload** state; publication is always an explicit action.
- Sticky customer preview that matches the public card/detail experience; website and channel previews use the saved draft.
- Multi-photo upload/camera capture, progress, validation, rotate/crop or safe orientation handling, reorder, cover selection, editable alt text, and web-optimized output.
- Sections stay understandable: **Source & identity → Photos → Facts & condition → Price & quantity → Customer copy → Channels → Preview & publish**.
- Staff can archive/restore and duplicate. Routine UI does not hard-delete.
- AI may be an optional “improve/draft” assistant later; deterministic templates and manual editing ship first. AI never becomes a publish requirement or silently replaces copy.

**Publish readiness (save draft remains allowed):**

- Title, category, public condition, asking price greater than zero, quantity on hand, return-policy selection, at least one valid photo, and customer description/disclosures.
- Linked one-of-kind items must not already be sold/scrapped/lost or actively committed elsewhere.
- Known defects/test status required when applicable; “unknown/untested” must be stated truthfully rather than hidden.
- Public pickup policy and contact path must be active.
- Publish validation is server-authoritative; the client explains every missing requirement inline.

**Channel-copy cards:**

- Phase 1 baseline: **Website + one configurable Facebook template**; add other templates without changing Listing truth.
- Each card exposes channel title, body, price/CTA, canonical listing link, and optional hashtags.
- Actions: **Copy title, Copy body, Copy all, Open channel, Mark posted, Paste post URL, Regenerate from template**.
- Staff edits are persisted. Regeneration previews changes and never overwrites an edited draft without confirmation.

**A-grade usability gate:**

- Test at least 10 representative cases: linked unique item, multi-qty offer, missing photos, known defect/untested, draft, paused, held, sold, unlinked listing, and channel repost.
- A trained operator can start from SKU/queue, produce a publish-ready listing, preview it, publish it, and copy Facebook text without leaving the studio or retyping source data.
- Desktop and phone-width image capture/edit paths must both work; keyboard-only core fields and clear error recovery are required.

### 4. Reservation and customer-policy contract

**Policy v1 adopted default (owner must accept exact hold/return terms before customer-facing release):**

> Request a hold online. A hold starts only after Eco-Thrift confirms the item is available and staged. Confirmed holds last until store close on the next business day. Pay and pick up in person; Eco-Thrift does not take online payment or offer delivery for these listings. Inspect the item before paying. Sales are final unless the listing is specifically marked **48-hour return eligible**. An eligible return requires the original receipt, all parts, and the item in the same condition; the remedy is store credit. As-is, untested, parts-only, and clearance items are always final sale.

**Operational rules:**

- Website button says **Request a hold**, not “Buy,” “Checkout,” or “Place order.” Submission is not a confirmed promise until staff verifies/stages the item.
- Confirmation sets expiry to **store close on the next business day**, using canonical location hours—not a hard-coded timestamp/address. A Manager may extend with a reason.
- Expired/cancelled holds release quantity automatically and reopen availability; no-show is recorded.
- Customer receives a random, unguessable public status token. Sequential IDs/order numbers are display references only and must never act as an authorization token.
- Public status returns the minimum necessary information and no other customer’s PII. Public request endpoints are rate-limited and idempotent.
- Server rejects shipping/delivery and online-payment attempts even if a stale client calls the API directly.
- Price shown online is the expected pre-tax item price; POS calculates final tax/payment at pickup.
- Return policy is selected per Listing from controlled templates, displayed before the request, and snapshotted on the completed sale.
- Do not advertise the return-eligible template until the operational store-credit/return record is actually supported.

### 5. Messages, marketing, channels, accounts, and B2B

- **Inbox is a durable work log, not a promised Facebook/email integration.** Phase 2 records channel (`website`, Facebook, phone, email, in person, other), direction, time, staff owner, summary/text, external thread URL, and response state. Native APIs can be added later only when credentials, platform policy, and volume justify them.
- Website hold requests create a conversation automatically. Staff-created conversations can link to a Listing, Reservation, customer, or sale.
- **Marketing is lightweight operations:** planned/published date, channel, campaign, Listing/blog link, copy, CTA/link, owner, state, and optional manually entered outcome. It is not a generic ad platform.
- A marketing draft may start from a **Listing, Blog Post, or standalone campaign** and uses the same channel-template card pattern. Blog Studio may deep-link to “Create share copy” without merging Blog and Listing records.
- **Channels** store display name, type, account handle, login URL, business/public URL, owner, fee rules, last verified date, and password-manager vault reference. No secret material is stored in this app.
- Fee rules are versioned/effective-dated; a Sale snapshots the actual fee used so later fee edits do not rewrite history.
- **B2B** uses channel/type `b2b` plus organization/contact and optional reference; it shares the Sales log and P&L. Quotes, invoicing, credit terms, and accounts receivable require a future initiative if real use proves they are needed.

### 6. Basic P&L / contribution contract

This is an operational channel report, not the general ledger.

- **Gross merchandise sales:** completed item price before sales tax.
- **COGS:** linked `Item.cost` snapshot; otherwise a required manual cost source with provenance.
- **Channel/payment fees:** actual fee snapshot; zero is explicit, not blank.
- **Direct expense:** listing-specific packing, promoted post/ad, or other attributable cost.
- **Contribution:** `gross merchandise sales - discounts - COGS - channel/payment fees - direct expense - accepted return loss`.
- Sales tax and cash tender are not revenue. Store overhead and general payroll are out of this basic report.
- A pickup paid through POS links to the completed Cart/Receipt and reuses its price/payment/tax. Manual external/B2B sales require a reason and reconciliation state; they must not duplicate a POS sale.
- Period views answer: what sold, channel, gross, cost, fees, direct expense, contribution, hold conversion/no-show, time-to-list, and channel sell-through.

### 7. Access, audit, and retention

- Do **not** add a new primary user role. Add scoped Online Sales capabilities and expose them to route/nav/API checks consistently:
  - **Operate:** queue, draft/edit, photos, copy, messages, ordinary holds.
  - **Publish:** publish/pause/end channels, quantity adjustments, hold overrides/extensions.
  - **Financials:** sales, costs, fees, contribution.
  - **Configure:** channel/policy/template configuration.
- Manager/Admin receive sensible defaults; named Employees may receive only the capabilities needed for their Online Sales job.
- Resolve the current mismatch where the API allows all staff but staff routes/nav are Manager/Admin-only.
- Audit actor/time/before-after for publish/pause/archive, quantity adjustments, hold confirmation/extension/expiry, policy override, sale completion, fee/cost override, and manual reconciliation.
- Retain Listing/publication/reservation/sale history. Customer-message/PII retention period is selected before Phase 2 launch; UI includes controlled redaction rather than destructive relational deletion.

---

## Shipped / brownfield baseline

Design from what exists; do not treat shipped code as matching the new policy.

| Area | Today (starting point) |
|------|------------------------|
| Public site | `frontend-public/` + `apps.webstore`; initiative **public_website** parked. Code includes public catalog/cart/checkout/order status; actual production deployment/data must be verified before migration. |
| Staff catalog | **Web store** `/admin/web-store` (Manager/Admin route) is a DataGrid + create/edit dialogs. `WebListing` already has optional Item/Category, SKU, description, condition, price/compare-at, integer `stock`, draft/published/archived, featured, and ordered S3-backed images. |
| Staff orders | **Web orders** `/admin/web-orders` manages pending/paid/fulfilled/cancelled orders, payment fields, pickup/ship, and notes. It is the migration source for Inbox & Holds—not the target language/state model. |
| Current policy mismatch | Public UI currently says Checkout/Place order but hardcodes pickup; backend still accepts `ship`, calculates shipping/tax, decrements stock, creates `Order`, and invokes a manual payment provider. This must be cut over coherently—not hidden only in UI. |
| Public status risk | `GET order-status/<ETW#####>/` uses a predictable display number as the lookup token and its serializer includes customer contact/address. New reservation status requires an unguessable token + minimum fields; legacy access must be locked down during cutover. |
| Permissions mismatch | Staff Listing/Order APIs use `IsStaff` (Employee/Manager/Admin), while routes/nav are Manager/Admin. Phase 1 aligns backend, frontend, and new capabilities. |
| Test gap | No dedicated `apps.webstore` automated tests were found. Reservation races, policy enforcement, permissions, media, and publish rules require representative coverage before cutover. |
| Blog | **Blog Studio** `/blog-studio` (Super Admin) — marketing-adjacent, not listing ops. |
| Nav | Slot C; Admin currently holds Web store, Web orders, Blog Studio, Label Studio, etc. (`navItemCatalog` / `slotCNavLayout`). |
| Inventory link | Items / Processing / TARS can disposition toward **online_sales**, but no durable intake queue is created and no direct Listing handoff exists. |
| Missing ops data | No first-class reservations, conversations, channel publications/accounts/fees, external-sale attribution, B2B, or Online Sales contribution report. |
| POS device type | `online_sales` exists as a device type string in POS docs—not the same as this workspace. |

---

## Scope

### In scope

- Accepted **Slot C nav** map and cutover: add Online Sales; rename Floor Ops / Cashier; move contextual pages out of Admin; remove verified stale aliases.
- Full-page **Listing Studio** built on `WebListing` and existing S3/public-catalog foundations.
- Item/Product prefill + drift visibility without duplicating operational inventory editing.
- Explicit Listing, Reservation, channel-publication, conversation, intake, and sale states.
- Quantity-on-hand / reserved / available truth, atomic reservation handling, floor/POS held-item protection, and pickup completion.
- Customer + staff **Policy v1**: request/confirm hold, in-person payment/pickup, no online payment, no delivery, exact expiry, controlled return templates.
- Website publish/preview and persisted channel-specific copy (Facebook first).
- Work queue, Inbox & Holds, lightweight Marketing, channel/account metadata + fees, external/B2B Sales log, and basic contribution reporting.
- Secure public reservation/status flow, aligned capabilities/permissions, audit history, migrations, redirects, and representative automated tests.
- Coordination with parked **public_website** for production state and public SPA changes; this initiative controls current transaction policy.

### Out of scope unless a phase plan explicitly brings it in

- Replacing Slot C with a different nav paradigm.
- Card capture, online payment, shipping, delivery, shipping tax/rates, or customer checkout.
- Social-network API auto-posting or inbox synchronization (templates + manual post/message tracking first).
- Rebuilding Blog Studio or Label Studio from scratch.
- Company-wide CRM, ad platform, email/SMS marketing suite, or customer accounts/loyalty.
- Storing channel passwords, MFA/recovery material, or API credentials in ordinary database fields.
- General ledger, payroll allocation, full inventory accounting, invoicing/AR, or a broad POS refund rebuild.
- A separate B2B product unless actual use proves quotes/terms/invoicing are required.
- Solving all TARS / Processing online disposition UX beyond clear handoff into Online Sales.
- Silent two-way synchronization that could overwrite Listing copy or Item truth.

---

## Product and process principles

1. **Workspace over Admin junk drawer** — Online Sales work should live where the team works, not only under Admin because “web” sounded technical.
2. **Editor joy** — if listing/publishing feels heavy, the phase is not done.
3. **Separate truths, connected explicitly** — Item owns operational inventory; Listing owns customer presentation; Reservation owns commitment; POS/Sale owns money.
4. **Qualified states** — avoid overloaded “pending,” “hold,” and “stock.” Every state says what it means.
5. **Policy before payment fantasy** — product matches reserve / pickup / no-online-pay / no-delivery rules until the owner explicitly changes policy.
6. **Physical truth matters** — a confirmed hold is not merely a website badge; staff stage the item and ordinary POS sale is guarded.
7. **One revenue truth** — link POS/external sales instead of duplicating totals in an Online Sales report.
8. **Few long phases** — each phase ends with an owner-usable outcome; no micro-phase theater.
9. **Brownfield without semantic debt** — reuse `apps.webstore` and public-site foundations, but migrate checkout/order semantics rather than relabeling contradictory behavior.
10. **Privacy and security by construction** — least privilege, random public tokens, minimal PII, no dashboard-stored channel secrets.
11. **Archive and audit** — preserve the history needed to explain publication, holds, quantity, fees, and sales.

---

## Phases (long; few)

### Phase 0 — Map, policy, and workspace contract

**Goal:** Accept the decision baseline, remove business ambiguity, and produce an implementation/migration contract before coding.

**Status:** **Complete — accepted 2026-07-13.** Full text: [`.ai/reference/online_sales_workspace/phase_0_contract.md`](../reference/online_sales_workspace/phase_0_contract.md).

**Evidence summary:** Public SPA live on apex; catalog API count=0; local+prod webstore tables empty; **5** Items at `location=online_sales`; migration posture **A**; payment provider effective **`manual`**.

**Accepted gates:**

1. Hold expiry = store close **next business day** after confirmation (Canfield Mon–Sat 9–6, closed Sun; AppSetting in Phase 1).
2. Default **final sale**; optional 48h return-eligible/store-credit template **disabled until ops exist**.
3. Capabilities default to Manager/Admin (Configure: Admin) until named Online Sales staff.
4. Facebook **Page** template in Phase 1; Marketplace deferred to Phase 2.

**End-of-phase deliverable (explicit):**

1. [x] **Accepted workspace/nav contract** — Phase 1 ships Listings + Inbox & Holds + Blog nav move + redirects; Phase 2 ships queue/Marketing/Sales + Retail Floor/Store Sales renames.
2. [x] **Accepted Policy v1** — customer copy + staff SOP in Phase 0 contract §C.
3. [x] **Accepted data/migration/security contract** — states, qty, Order→Reservation, tokens, POS guard, rollback in §D.
4. [x] **Phase 1 build brief + acceptance script** — slices, fixtures F1–F9, tests T1–T12, A-grade trial in §F.

**Exit gate:** Met. No production behavior changes in Phase 0.

---

### Phase 1 — Perfect Listing Studio + website reservations

**Goal:** Make listing/publishing excellent and replace misleading checkout/order behavior with a safe, truthful reservation/pickup flow.

**Work (long):**

- Additive data changes and migration for Listing lifecycle/return policy, quantity truth, Reservation, channel drafts/publication, public tokens, audit, and legacy Orders.
- Build the full-page **Listing Studio** contract above: SKU/queue/manual starts, prefill/drift, media workflow, readiness, autosave, exact preview, archive/restore, publish/pause/sold.
- Build website + configurable Facebook channel cards with persisted edits and copy/post tracking.
- Create the minimal **Online Sales** workspace/nav with Listings and Inbox & Holds; move Blog Studio nav; keep legacy Admin route redirects.
- Replace public Cart/Checkout/Order language and API behavior with **Request a hold / Reservation**; remove shipping/payment paths, tax-at-web, and predictable public lookup.
- Add staff verify/stage/confirm/expire/cancel/complete flow, availability updates, held-item POS guard, and linked POS completion.
- Harden image validation/optimization, permissions, public rate limits/idempotency, failure recovery, and history preservation.
- Add backend race/policy/permissions/migration tests and frontend editor/reservation/public-flow coverage; execute the representative owner trial.

**End-of-phase deliverable (explicit):**

1. Staff can go from Item/queue/manual start → complete Listing → exact preview → website publish → Facebook-ready copy in one studio without retyping source facts.
2. Public visitors can request a hold; staff can verify/stage/confirm it; quantity cannot double-reserve; customer sees policy/expiry; pickup payment completes through POS.
3. Public and server surfaces contain **no active shipping, delivery, online-payment, or customer “checkout/order” promise**.
4. Online Sales workspace contains the daily Phase 1 pages; old Admin links redirect without losing bookmarks/history.
5. Automated tests cover publish readiness, quantity race, expiry/release, held-item guard, permissions, public-token privacy, and legacy migration.

**Exit gate:** Owner grades the studio + reserve/pickup journey **A-level for daily use**. No unresolved policy contradiction, known double-sale path, predictable PII token, or destructive-history gap.

---

### Phase 2 — Online Sales workspace ops + nav cutover

**Goal:** One workspace runs the business of online/external sales—not only listing craft—and Slot C tells the truth across departments.

**Work (long):**

- Add durable **Online Sales Intake** from Processing/TARS `online_sales` disposition plus manual candidates; assignment, age, priorities, “not listing” reasons, and start-listing handoff.
- Complete **Work queue** and **Inbox & Holds** with message response states, reservation aging/no-show, tasks, and controlled PII retention/redaction.
- Add **Marketing** post queue/calendar for listing-linked and standalone drafts; Blog Studio entry remains separate.
- Add channel/account metadata + password-manager references, effective fee rules, channel publication reconciliation, and stale external-post tasks.
- Add **Sales** log, B2B channel/type, POS linkage/manual reconciliation, cost/fee/direct-expense snapshots, contribution formula, and period/channel views.
- Execute the broader accepted nav cutover: Floor Ops → Retail Floor, Cashier → Store Sales, move POS setup/Quality Audit/QA Forms, verify/remove stale nav aliases, and update nav docs.
- Add metrics/alerts, exports only where operationally needed, retention jobs, permission/audit hardening, and operator handoff.

**End-of-phase deliverable (explicit):**

1. **Online Sales is the operating home** for queue, Listings, Inbox & Holds, Marketing, Sales, channels/fees, and B2B-as-channel.
2. **Nav cutover is complete** per the accepted map; Admin is no longer the home for daily web/POS/floor work; agreed stale aliases are gone or intentionally redirected.
3. Owner can answer from the product: *what should be listed, what is live where, what needs a reply, what is held/expiring, what sold, what did it cost, what fees applied, and what contribution remains?*
4. Staff can trace each completed sale back to Listing/Reservation/channel and POS or a reconciled external record without duplicate revenue.

**Exit gate:** Initiative finish line items 1–6 and the acceptance list below are met; owners accept operating responsibility/metrics. Remaining payment, delivery, social API, CRM, or accounting ambitions become separate initiatives rather than extending this one indefinitely.

---

## Success measures

**Hard controls (target = 100% / zero exceptions unless audited):**

- Every published Listing passes server readiness and has a return-policy snapshot.
- Every confirmed hold has customer/contact, quantity, stage/owner, confirmation time, and expiry.
- Zero successful double-reservations for quantity-1 inventory under concurrent requests.
- Zero ordinary POS sales of a held linked Item without matching Reservation or manager override reason.
- Every completed pickup links to one POS/external Sale truth; no duplicate revenue line.
- Every public reservation status uses an unguessable token and exposes no unrelated PII.
- No dashboard field stores a channel password, MFA seed, recovery code, or access token.
- Every sold/paused Listing with manual external publications creates or clears channel-close tasks.

**Operational measures (baseline first, then set targets):**

- Intake age and time from `queued` → first draft → published.
- Publish readiness failure reasons and editor abandonment/rework.
- Active Listings by channel; stale publications and missing external URLs.
- First-response time, open conversations, holds by state, conversion, expiry, cancellation, and no-show.
- Gross merchandise sales, COGS, fees, direct expense, contribution, and sell-through by channel/category.
- Return requests/accepted returns by policy template and reason.
- Percentage of sales linked to POS vs manually reconciled.

---

## Risks and controls

| Risk | Control |
|------|---------|
| Item and Listing become competing inventory records | Explicit ownership boundary; source prefill + drift review; no silent two-way sync. |
| “Hold” hides whether inventory is actually committed | Reservation state machine, transactional quantity, physical staging task, expiry, and POS guard. |
| Existing checkout contradicts policy | Same-release public UI + server cutover; server rejects stale shipping/payment requests. |
| Customer PII is exposed through predictable order URLs | Random public token, minimal serializer, throttling, and legacy-endpoint lockdown. |
| Facebook/manual channels drift after edits/sale | Channel-publication rows, exact copy/URL snapshots, stale/update/end tasks. |
| Public requests create spam or duplicate holds | Staff confirmation, idempotency, rate limits, transaction locks, and aging/decline tools. |
| “Accounts/logins” becomes a password spreadsheet | Metadata + password-manager reference only; secrets remain outside ordinary app data. |
| P&L double-counts POS sales or mutates with later fee/cost edits | Link POS transaction; snapshot COGS/fees/direct cost at sale; reconciliation state. |
| Return promise exceeds POS/store capability | Final-sale default; do not activate return-eligible template until operational credit/return record exists. |
| Nav rethink sprawls into a whole-repo redesign | Implement only accepted contextual moves; leave unrelated People/HR restructuring outside this initiative. |
| “Perfect editor” becomes aesthetic-only | Representative operator trial, measurable end-to-end tasks, race/policy tests, responsive/media/error-recovery gates. |
| Old links/data are lost during rename | Additive migrations, production inventory first, redirects, archive/history preservation, and rollback plan. |

---

## Acceptance (initiative-level)

- [x] Phase 0 decision/nav/policy/data/migration contract accepted and owner gates resolved.
- [ ] Listing Studio passes the representative A-grade owner/operator trial on desktop + phone width.
- [ ] Website publication, quantity, channel copy, archive/history, and Item drift behavior follow the contract.
- [ ] Public reserve → staff verify/stage/confirm → expiry/cancel or POS pickup completion works without shipping/payment language or API paths.
- [ ] Concurrent quantity, held-POS, permission, public-token/PII, expiry/release, migration, and policy tests pass.
- [ ] Work queue captures Processing/TARS/manual candidates and explains listed/not-listing/closed exits.
- [ ] Inbox & Holds makes response ownership, conversations, reservation age, expiry, no-show, and pickup state visible.
- [ ] Marketing tracks listing/standalone drafts and manual channel publication without storing secrets.
- [ ] Sales/B2B/channel fees/basic contribution reconcile to POS or an explicit external record without duplicate revenue.
- [ ] Slot C names/placements and legacy redirects/removals match the accepted map; nav docs are current.
- [ ] Related Admin/Web pages live inside the new IA or are intentionally retained/redirected; no orphan daily-work page remains in Admin.
- [ ] `CHANGELOG` / semver reflect user-visible ships; `.ai/context.md` Active work updated on release/archive.

---

## Sessions

### Session 1 — 2026-07-13T14:15:00-05:00 (est 0.5h)

- **Goal:** Create the Online Sales Workspace initiative with a small number of long phases and explicit end-of-phase deliverables.
- **Finish line:** Initiative file on disk + row on `_index.md`; ready to plan Phase 0 next.
- **Scope:** Initiative authoring and index/compass pointers only — no Phase 0 workshop yet, no code.
- **Out of scope:** Phase 0 decisions, nav implementation, editor build.
- **Result:** Initiative created with three long phases (0 map/policy, 1 editor+publish+templates, 2 workspace ops+nav cutover); listed on `_index.md`; compass pointer in `.ai/context.md`. Phase 0 planning not started.

### Session 2 — 2026-07-13T14:23:00-05:00 (est 1.5h)

- **Goal:** Review the initiative against the shipped nav/webstore/public-site code and replace vague possibilities with a concrete product contract.
- **Finish line:** Good default decisions on workspace/pages, state/quantity ownership, Listing Studio, reserve/pickup policy, messages/channels/security, B2B, contribution reporting, permissions, phases, tests, and risks—while keeping only true owner policy gates open.
- **Scope:** Read-only brownfield audit + this initiative update; no production behavior, nav code, model, route, or archived-initiative edits.
- **Out of scope:** Owner acceptance of Policy v1, Phase 1 implementation, release/version changes.
- **Result:** Working decision baseline added. Phase 0 is ready for owner review of four focused gates rather than open-ended product discovery.

### Session 3 — 2026-07-13T14:50:00-05:00 (est 3h)

- **Goal:** Execute Phase 0 — verify production/local posture, accept nav/policy/data/security contracts, resolve four owner gates, and produce a Grok-ready Phase 1 brief.
- **Finish line:** Four deliverables Accepted/Ready; Phase 1 executable without product improvisation; zero application code.
- **Scope:** Docs only — initiative + `.ai/reference/online_sales_workspace/phase_0_contract.md` + index/context pointers; read-only HTTP + aggregate SQL.
- **Out of scope:** Application code, migrations, seeds, deploys, semver, Helcim/shipping resume.
- **Result:** Phase 0 accepted. Migration posture **A** (empty webstore; 5 `online_sales` Items). Gates G1–G4 accepted (Page FB template; Marketplace Phase 2; role-default capabilities). Nav Phase 1/2 split, Policy v1 + SOP, data/security/rollback, and Phase 1 slices/fixtures/tests/A-grade script recorded in [`phase_0_contract.md`](../reference/online_sales_workspace/phase_0_contract.md). Next = Phase 1 build.

---

## See also

- [`.ai/reference/online_sales_workspace/phase_0_contract.md`](../reference/online_sales_workspace/phase_0_contract.md) — **Phase 0 accepted pack**
- [`.ai/initiatives/_index.md`](./_index.md)
- [`.ai/initiatives/_archived/_pending/public_website.md`](./_archived/_pending/public_website.md)
- [`.ai/initiatives/_archived/_completed/blog_studio.md`](./_archived/_completed/blog_studio.md)
- [`.ai/extended/frontend.md`](../extended/frontend.md) — Web store / public SPA notes
- `frontend/src/navigation/navItemCatalog.ts`, `slotCNavLayout.ts`
- `apps/webstore/`, `frontend-public/`
