<!-- initiative: slug=online-sales-mvp status=active updated=2026-07-30 -->
<!-- Last updated: 2026-07-30T18:10:00-05:00 (resplit into 5 value-ordered phases; sending identity retail@) -->

# Initiative: Online Sales MVP — reserve online, pay & pick up in store

**Status:** **Active** (created 2026-07-30). Supersedes the ambition of parked [`online_sales_workspace`](./_archived/_pending/online_sales_workspace.md) for *what we ship next*; that file stays parked as the long-term vision and keeps the still-valid Phase 0 contract.

**One sentence:** A customer sees an item on **ecothrift.us**, asks about it or reserves it, talks to us **inside our own system**, then comes to the store to **pay and pick up** — and staff run all of that from one **Online Sales** workspace in the dashboard.

**No online payment. No shipping. No delivery.** Everything customer-initiated is "contact us / reserve" — the transaction happens at the register. Customers get a **simple account** so they can come back to their requests and messages, but they are never forced to create one before their first ask.

---

## The finding that shapes this initiative

A code audit on 2026-07-30 found that **most of this MVP is already built and parked**, not missing. The honest job is *turn it on, close five real gaps, and launch* — not *build online sales*.

| MVP capability | State on disk today |
|----------------|---------------------|
| Public shop, product detail, hold list, hold request, hold status page | **Built** in `frontend-public/src/pages/` — every commerce route redirects to `/visit`; `Layout.tsx` shows an "under construction" banner and has no Shop link or cart |
| Public catalog API | **Live** (`GET /api/webstore/catalog/`, `catalog/<slug>/`, `catalog/categories/`) — returns 0 rows because there are no listings |
| Listing data model with lifecycle, on-hand/reserved quantity, return policy, FB copy | **Built** — `WebListing` (`draft → ready → published ↔ paused → sold | archived`), `WebListingImage`, `ChannelPublication` |
| Reservation / hold model + state machine + unguessable token | **Built** — `Reservation` with `requested → confirmed → ready_for_pickup → completed`, exits `declined / expired / cancelled`; `services/reservations.py` |
| Staff listing editor (full-page Studio), Listings grid, Work queue, Inbox, Sales log | **Built** in `frontend/src/pages/online-sales/` (6 pages) — **not routed**, no nav workspace |
| Photo upload to S3 | **Built** — `POST listings/:id/images/` → `core.S3File` |
| POS held-item guard + pickup completion | **Built** — cart `add-item` blocks held items (`ITEM_ON_HOLD`) unless matching `reservation_id` or manager override with reason; cart `complete` calls `complete_reservation()` |
| Hard-control tests (race, release, policy reject, token privacy, POS guard) | **Built** — `apps/webstore/tests/test_holds_hard_controls.py` |
| **Customer ↔ staff messaging** | **Does not exist anywhere in the repo.** No `Conversation` / `Message` model. This is the one genuinely new build. |
| **Customer login** | **Auth machinery is reusable, the customer surface is not.** `/api/auth/login|refresh|logout|me` with JWT + httpOnly refresh cookie works, `CustomerProfile` exists, and the public site is **same-origin** with the API (`ecothrift.us/api/…` passes through the middleware), so no CORS work is needed. Missing: a `Customer` group + `IsCustomer` permission, any self-registration endpoint, and any auth code at all in `frontend-public/`. Also: **two auth defects must be fixed first** — see *Auth prerequisites*. |
| **Hold expiry actually running** | `expire_due_reservations()` exists with **zero callers** — no command, no scheduler. Reserved quantity would leak forever. |
| **Pickup prep view** | Not built. Inbox lists reservations; nothing answers "who is coming today and where is their stuff." |
| **Listings in the database** | **Zero.** 5 inventory Items sit at `location='online_sales'`. Shop categories not seeded in prod. |

**Therefore:** this is a *finish and launch* initiative with one new subsystem (Messages) and one new surface on existing rails (customer login), not a greenfield build. Estimate stays small — provided scope stays cut.

---

## Finish line

1. **The website shows real merchandise.** ecothrift.us `/shop` lists published items with photos, price, condition, and a pickup-only policy. Shop is reachable from the site nav.
2. **Staff can list an item in the dashboard.** Basic CRUD in the Listing Studio: create (from an `online_sales` Item or blank), photos, facts, price, quantity, publish / pause / sold / archive.
3. **A customer can start a conversation and reserve an item straight from the listing page** — no account required, no phone tag.
4. **A customer can get back to their own stuff.** A simple sign-in shows my requests and my messages on any device; the guest token link keeps working for anyone who never signs in.
5. **Staff answer inside the dashboard.** One Inbox shows every open thread and hold, who owes a reply, and the state of each hold.
6. **Pickup works.** Staff see today's staged holds, the customer arrives, the cashier rings it at POS, the reservation closes, quantity and Item status are correct, and revenue is counted **once**.
7. **It is live in production** with a documented kill switch and a written staff SOP.

Not the finish line: marketing calendar, channel fee tracking, contribution/P&L, B2B, Facebook automation, nav renames elsewhere in the app.

---

## Strategic decisions

**Locked** = owner direction, do not reopen without a policy change. **Default** = the implementation choice unless the owner changes it before that slice. **Gate** = needs an owner answer (see *Open gates*).

### Transaction and policy

| # | Decision | Status |
|---|----------|--------|
| 1 | **No online payment, no shipping, no delivery.** Server rejects ship/pay paths even if a stale client calls them. Legacy `checkout/` and `order-status/` stay 410. | **Locked** |
| 2 | **Everything customer-facing is "ask" or "reserve," never "buy."** Copy says *Request a hold* / *Ask about this item*. No cart-to-checkout language, no price-at-checkout, no tax math on the web. | **Locked** |
| 3 | **Online price is the expected pre-tax item price.** POS computes tax and takes payment at pickup. POS is the single revenue truth; the Online Sales log links to it and never re-counts. | **Locked** |
| 4 | **Hold window = store close on the next business day** after staff confirm (Canfield Mon–Sat 9–6, closed Sun), from `AppSetting` key `online_sales.hours`. Manager may extend with a reason. | Inherited from Phase 0 — **Gate G3** to confirm |
| 5 | **Default final sale.** The 48h-return/store-credit template exists in the model but stays off and unadvertised until store-credit ops exist. | **Locked** |
| 6 | **A hold is not a sale and not a promise.** Request → staff verify the item is really there → staff confirm → *then* the customer has a hold. Publishing and requesting never mark an Item sold. | **Locked** |

### Identity, messaging, and notification

| # | Decision | Status |
|---|----------|--------|
| 7 | **Guest-first, account-optional.** A customer can ask about an item or request a hold with **name + email + phone and nothing else**. An account is how they *come back* — never a gate in front of the first action. Requiring signup before a thrift-store customer can ask "is this still there?" kills the conversation we are trying to start. | **Default — Gate G8** |
| 7b | **The account is deliberately thin.** It answers one question: *what did I ask for and what did you say?* My requests (holds + status) and My messages. No saved cards, no addresses, no order history beyond requests, no wishlists, no loyalty. | **Default** |
| 7c | **Customers are a separate identity class from staff.** New `Customer` Django group + `IsCustomer` permission, `is_staff=False`, zero dashboard access, rejected by the staff SPA's route guards the way `Consignee` already is. The customer session lives on the **apex host** and the refresh cookie is host-scoped, so a customer session can never become a `dash.` session. | **Locked (security)** |
| 8 | **The token URL still works and is still the guest path.** One page shows hold status *and* the message thread; the public site remembers tokens in `localStorage` as "My requests." Logging in simply gathers every request tied to that email into one place, on any device. | **Default** |
| 8b | **Login is a magic link — passwordless.** Customer enters their email, gets a sign-in link, clicks it. Nothing to store, no reset flow, no password UI, nothing for a customer to forget. | **Accepted (G7, 2026-07-30)** |
| 9 | **The conversation itself lives only in our DB** — no email threads, no SMS provider, no Facebook API. Staff read and reply in the dashboard; the customer reads and replies on the website. | **Locked** (owner direction) |
| 9b | **Transactional email is ON, and it is a different thing from messaging-by-email.** The magic-link sign-in, "your hold is confirmed," and "you have a reply" are one-line system notices — the conversation itself still lives only in our DB. There is **no working mail provider today** (`EMAIL_BACKEND` is the console backend), so configuring one is its own early phase rather than an afterthought. Sends as **`retail@ecothrift.us`**, display name **Eco-Thrift** (see *Resolved gates*). | **Accepted (G1, 2026-07-30)** |
| 10 | **Staff still phone customers when it matters.** Email removes the *obligation* to call for every hold, not the option: a same-day pickup or a tricky question is still faster by phone, and the call gets logged in the thread as a system message. | **Default** |
| 11 | **A conversation can exist without a hold.** "Ask about this item" opens a thread tied to a listing with no quantity reserved. This is the "all contact us" model. | **Default — Gate G2** |
| 12 | **Minimum PII, always.** Public endpoints return status + thread for that token only: no other customer's data, no address, no other holds. Rate-limited and idempotent. Nothing about a customer is exposed by guessing a number. | **Locked** |

### Product shape

| # | Decision | Status |
|---|----------|--------|
| 13 | **Reuse the parked code; do not redesign.** MVP ships the existing `ShopPage` / `ProductDetailPage` / `ListingStudioPage` with corrected copy and the messaging additions. Aesthetic upgrades are a later pass. | **Default** |
| 14 | **"Hold list" not "cart."** The existing multi-item hold request stays (the backend already loops items); it is labeled a hold list, never a cart or checkout. | **Default — Gate G6** |
| 15 | **Four staff destinations, not six.** `/online-sales` Work queue · `/online-sales/listings` (+ Studio) · `/online-sales/inbox` Messages & Holds (with a **Ready for pickup** tab) · `/online-sales/sales` Sales log. **Marketing stays parked**; Blog Studio stays in Admin. | **Default** |
| 16 | **No nav renames outside Online Sales.** Floor Ops → Retail Floor, Cashier → Store Sales, and the POS-setup/QA moves from the old Phase 0 contract are **out of scope**. Add one workspace; touch nothing else. | **Locked (scope cut)** |
| 17 | **Reserved items stay visible on the shop** with a *Reserved* badge rather than vanishing. Availability = `on_hand − reserved`. | **Default — Gate G4** |
| 18 | **`ONLINE_SALES_ENABLED` becomes a real kill switch.** Today it only gates `POST holds/` while the public catalog stays live and both SPAs hard-redirect. MVP makes one flag turn the whole customer surface on and off, so launch and rollback are a config change. | **Default** |

### Data ownership (unchanged from Phase 0 — still correct)

| Object | Owns | Must not |
|--------|------|----------|
| Inventory `Item` / `Product` | SKU, cost, operational status/condition/location, source | Become a second public catalog |
| `WebListing` | Public title, description, photos, asking price, disclosures, return badge, slug, on-hand quantity, publication state | Silently overwrite staff copy from the Item; be hard-deleted in routine use |
| `Reservation` | Customer contact, quantity, expiry, staging, completion | Be a parallel "Order" truth |
| **`Conversation` / `Message` (new)** | Customer↔staff thread, reply state, ownership | Require any external API |
| POS `Cart` / `Receipt` | Payment, tax, revenue | Be duplicated in an Online Sales report |

---

## What gets built (the five real gaps)

### Gap 1 — Turn the surface on truthfully

- Remove the redirect stubs in `frontend/src/App.tsx` and `frontend-public/src/App.tsx`; route the six existing staff pages (four in nav) and the public shop pages.
- Add the `onlineSales` workspace to `SLOT_C_WORKSPACES` + `SLOT_C_NAV_GROUPS`; keep `/admin/web-store` and `/admin/web-orders` as redirects into the new pages so bookmarks survive.
- Restore Shop + hold-list entry points in `frontend-public/src/components/Layout.tsx`; mount the orphaned `CartDrawer`; delete the construction banner.
- Make `ONLINE_SALES_ENABLED` gate the public catalog too, so flipping it false empties the shop instead of leaving a live API behind a dead UI.
- Retire the dead ends found in the audit: frontend `setWebOrderStatus` calls a backend action that does not exist; `WEBSTORE_SALES_TAX_RATE` / `WEBSTORE_SHIP_FLAT` have no consumers; `emails.py` and `payments.py` have no callers; `Reservation` is missing from Django admin.

### Gap 2 — Identity: a simple customer login

Reuses the existing JWT stack; the new code is mostly the customer-side surface.

- **`Customer` Django group + `IsCustomer` permission**, added to the role map at the lowest priority. Must not satisfy `IsStaff`, must be rejected by the staff SPA's `StaffRoute` exactly as `Consignee` is, and must never surface in staff employee lists.
- **Self-service account creation** (`AllowAny`, throttled) — the only genuinely new auth endpoint. Either a magic-link request or an email+password register, per **G7**. Matches an existing `User` by email rather than creating duplicates, and attaches a `CustomerProfile`.
- **Auth in `frontend-public/`** — it has none today: a small auth context, in-memory access token, `withCredentials` refresh against the same-origin `/api/auth/*`, and a Bearer interceptor. The staff `AuthContext` is the working template.
- **`/account` portal on the public site** — My requests (holds + status) and My messages. Nothing else.
- **Backfill on login:** when a customer logs in, every guest request made with that email is claimed into their account, so the guest path and the account path are the same data.

#### Auth prerequisites (must be fixed before any public login)

The audit found two defects that are tolerable while auth is staff-only on `dash.` and **not** tolerable once anyone on the internet can reach the login surface:

1. **`POST /api/auth/forgot-password/` returns the reset token in its own JSON response** to an unauthenticated caller. Today that means anyone who knows or guesses a **staff** email address can obtain a valid password-reset token and take the account over. This is a live issue independent of this initiative and should be fixed regardless of what we decide about customer login.
2. **The refresh cookie is written with `secure=False`** (hardcoded in `apps/accounts/views.py`, not overridden in production settings), so it is not HTTPS-only.

Also needed before opening the surface: **throttling on login and registration** (there is none — only the labels AI endpoints and the hold-request view are rate-limited today) and a decision on anti-abuse for signups (no captcha exists anywhere in the repo).

### Gap 3 — Messages (the only new subsystem)

Minimal, boring, ours:

- **`Conversation`** — listing FK (nullable), reservation FK (nullable), **customer `User` FK (nullable, set when they have an account)**, guest name / email / phone, unguessable `public_token`, `state` (`needs_reply ↔ waiting_on_customer → resolved`), `last_message_at`, staff owner (nullable), `staff_unread` / `customer_unread` markers.
- **`Message`** — conversation FK, `author_kind` (`customer` | `staff` | `system`), author user (nullable), body, `created_at`. System messages record hold state changes and "called the customer" notes so the thread is the full history.
- **Public:** `GET /holds/<token>/` gains the thread; `POST /threads/<token>/messages/` (rate-limited, no PII of anyone else); `POST /catalog/<slug>/ask/` opens an inquiry thread. Logged-in customers reach the same threads through `/account` without needing the token.
- **Staff:** conversation list with filters (needs reply, has hold, resolved), reply box, resolve/reopen, assign to me. Lives in the existing Inbox page.
- A hold request auto-opens its thread; the request note becomes message #1.

### Gap 4 — Pickup prep and review

- **Ready for pickup** tab in Inbox: today's confirmed/staged holds, customer name + phone, item + SKU + staging location, expiry countdown, and the actions staff actually take (stage, extend, cancel, no-show).
- Verify the POS path end to end and make the cashier's moment obvious: scanning a held item must name the hold and offer completion rather than just erroring.
- Keep the existing read-only **Sales log** of completed reservations. No fees, no contribution math, no exports.

### Gap 5 — It has to actually run

- Management command wrapping `expire_due_reservations()` + a **Heroku Scheduler** entry (documented in `.ai/extended/development.md` next to the buying jobs).
- Seed `online_sales.hours` AppSetting; run `seed_shop_categories` in production.
- Publish a real starter set of listings from the `online_sales` Items (**Gate G5**: how many, who lists them).
- Verify S3 image upload and public image serving in production, not just locally.
- Written staff SOP: request → verify → stage → confirm → call → pickup at POS → expiry/no-show.

---

## Out of scope (explicitly, for this initiative)

Online payment · shipping / delivery · customer loyalty, wishlists, saved addresses/cards, or any account feature beyond *my requests* and *my messages* · social login (Google/Facebook sign-in) · SMS delivery · Facebook / Marketplace API posting (the existing FB copy fields may be used by hand; nothing new is built) · Marketing calendar and campaigns · channel accounts, logins, fee rules · contribution / P&L reporting · B2B channel · durable intake queue models from Processing/TARS (the existing `location='online_sales'` work queue is enough) · Slot C renames and Admin page moves elsewhere in the app · Listing Studio visual redesign or AI copy assistance · returns/store-credit operations · multi-location pickup · Product FK for multi-quantity listings.

Each of these has a home in the parked [`online_sales_workspace`](./_archived/_pending/online_sales_workspace.md) if it earns its way back.

---

## Resolved gates

| Gate | Decision | Accepted |
|------|----------|----------|
| **G1 — Transactional email** | **ON.** The store sends system email: magic-link sign-in, "your hold is confirmed," "you have a reply." The *conversation* still lives only in our DB (decision #9) — these are one-line system notices, not email threads. | 2026-07-30 |
| **G7 — Login flavour** | **Magic link (passwordless).** Customer enters their email, gets a sign-in link, clicks it. No password stored, no reset flow, no password UI. Follows from G1. | 2026-07-30 |
| **G1b — Sending identity** | **`retail@ecothrift.us`** (existing *Retail Operations* mailbox, Microsoft 365 Business Standard), `Reply-To` itself, but **display name “Eco-Thrift”**. | 2026-07-30 |
| **G2 — Inquiries** | **Allow** “Ask about this item” threads with no hold. | 2026-07-31 |
| **G3 — Hold window** | **Store close next business day** after staff confirm. | 2026-07-31 |
| **G4 — Reserved visibility** | **Show with *Reserved* badge** (do not hide). | 2026-07-31 |
| **G5 — Launch listings** | **Owner enters their own listings** via Listing Studio / work queue CRUD (not a fixed 10–20 seed set). | 2026-07-31 |
| **G6 — Hold list** | **Keep multi-item** hold list. | 2026-07-31 |
| **G8 — Accounts** | **Optional** (guest-first). | 2026-07-31 |
| **G9 — Sending pipe** | **Microsoft Graph** (Entra app + RBAC scoped to `retail@` only). No third-party provider. One mailbox; Online Sales vs general mail split in the dashboard UI by conversation token. No SPF/DKIM DNS change (mail leaves M365 as `retail@`). IMAP/POP basic auth is gone; SMTP basic auth is a dead-end by late 2026 — Graph is the durable path. | 2026-07-31 |

### Email is load-bearing — deliverability is a hard requirement

Once sign-in *is* an emailed link, **mail delivery is the front door**. Magic-link emails need a **short expiry, single use, and no token echoed in any API response**. If mail delivery fails, the **guest token URL keeps working**. Outlook on `retail@` remains the full mailbox; the dashboard is a simple read/reply surface for staff on the go.

---

## Open gates (owner answers needed)

*(none — G2–G9 closed 2026-07-31)*

---

## Phases

**Five short phases, ordered by value.** Each one is independently releasable and leaves the store better off, so stopping early still leaves a working product rather than a half-built one. Phases 2 and 3 can be collapsed into one if four is preferred; nothing else should be merged.

| # | Phase | What the owner gets | Rough size |
|---|-------|--------------------|-----------|
| 1 | **Live surface** | List it, show it, reserve it, sell it at the register | Largest — but mostly un-parking existing code |
| 2 | **Email** | Customers get told things; no phone call per hold | Small — config, DNS, one template |
| 3 | **Messages** | Two-way conversation with customers, in our own system | Medium — the only new data model |
| 4 | **Accounts** | Magic-link sign-in; "my requests, my messages" | Medium |
| 5 | **Pickup + launch** | Daily operation, real listings, live for a week | Small |

**If we stop after Phase 3**, the MVP as originally described is complete: website shows items, staff have an editor, customers can message us, and reservations flow through the register. Accounts are a convenience layer on top.

### Phase 1 — Live surface: list it, show it, reserve it, sell it

**Goal:** An item goes from the dashboard to ecothrift.us, a customer reserves it, and the store sells it at the register.

**Work:** un-park staff routes + `onlineSales` workspace nav · un-park public shop routes + site nav + hold list · make `ONLINE_SALES_ENABLED` a real kill switch · basic-CRUD pass on the Listing Studio (create from Item, photos, facts, price/qty, publish/pause/sold/archive, readiness errors that make sense) · copy audit so nothing says buy/checkout/ship/pay online · expiry command + scheduler · seed hours and shop categories · verify POS held-item guard and pickup completion · clear the dead ends from Gap 1 · **plus the two auth security fixes** (forgot-password token disclosure, `secure` refresh cookie) because they are small and there is no reason to sit on an account-takeover path for weeks.

**Deliverable:** Staff publish a listing; it appears on the public shop; a hold request is created, verified, confirmed, and completed at POS; quantity and Item state are right afterward; flipping the flag off cleanly removes the customer surface.

**Exit gate:** One real item completes the full round trip in production. No copy or API path promises payment, shipping, or delivery. Hold expiry runs on a schedule. The two auth defects are closed.

*Customer notification in this phase: staff phone them. That is exactly what Phase 2 removes.*

### Phase 2 — Email: stop making staff phone everyone

**Goal:** The system tells the customer what happened, so a confirmed hold no longer costs a phone call.

**Why this comes early and alone:** it is the only piece with an **external dependency** (DNS, a sending provider, spam-filter reality), so de-risking it early is worth more than bundling it. It is also the prerequisite for both Phase 3's reply notice and Phase 4's sign-in link.

**Work:** transactional sending configured as **`retail@ecothrift.us`**, display name **Eco-Thrift**, `Reply-To` itself · SPF **appended** (never replacing the Microsoft entry) and DKIM published · delivery proven against live Gmail / Outlook / Yahoo · confirm replies land in the `retail@` inbox with a named owner · the **"your hold is confirmed"** email (pickup window, address, hours, policy) · verify staff email still works after the DNS change.

**Deliverable:** A confirmed hold produces a real email the customer actually receives, with the pickup window and policy in it.

**Exit gate:** Mail reaches live Gmail and Outlook inboxes, not junk. Staff email is unaffected. Throttling and rate limits are in place.

### Phase 3 — Messages: talk to customers inside our system

**Goal:** Every customer conversation has one home, in our database, with a clear "who owes a reply."

**Work:** `Conversation` + `Message` models and migration · public thread on the token page + post-a-reply · "Ask about this item" inquiry from the listing page · staff Inbox thread list, filters, reply, assign, resolve/reopen · unread and reply-state indicators · system messages for hold state changes and logged phone calls · rate limits, idempotency, PII-minimal serializers · "My requests" token memory on the public site · the **"you have a reply"** email.

**Deliverable:** A customer asks a question about an item without reserving anything, gets an answer, and the whole exchange is one readable thread on both sides. Staff see at a glance what is unanswered.

**Exit gate:** A thread is reachable only with its token; no thread leaks another customer's data; nothing depends on an external social or email integration.

### Phase 4 — Accounts: a simple way back to your own stuff

**Goal:** A returning customer sees their requests and messages in one place, on any device, without a password.

**Work:** `Customer` group + `IsCustomer` (no staff rank, rejected by staff route guards) · sign-in-link request + consume endpoints (short expiry, single use, never echoed in a response body) · auth context in `frontend-public/`, which has none today · `/account` with My requests + My messages · claim guest requests by email on sign-in · the **sign-in link** email.

**Deliverable:** A customer who asked as a guest signs in later and finds that question plus their hold together.

**Exit gate:** A signed-in customer sees only their own threads; a customer account cannot touch any staff surface, endpoint, or the dashboard host; sign-in links are short-lived and single-use; the guest token URL still works for anyone who never signs in.

### Phase 5 — Pickup, review, and launch

**Goal:** The store can run this daily without asking how it works.

**Work:** Ready-for-pickup tab (today's holds, staging location, expiry countdown, no-show) · cashier-facing clarity on scanning a held item · confirm the Sales log answers "what sold online and did it close through POS" · staff SOP written · publish the launch set (G5) · soft launch, then watch holds/no-shows/threads for a week · docs (`.ai/extended/` where behavior changed, `CHANGELOG`, semver) and `.ai/context.md` compass update.

**Deliverable:** Online Sales is in daily use: staff know where to list, what to answer, who is coming today, and what sold. The owner can answer those four questions from the product.

**Exit gate:** A week of live use with no double-sale, no leaked reserved quantity, no unanswered-thread pileup, and no manual database surgery.

---

## Hard controls (zero tolerance)

- A quantity-1 item can never be reserved twice under concurrent requests.
- An ordinary POS sale of a held Item is blocked unless the reservation matches or a manager overrides **with a reason**, audited.
- Every completed pickup produces exactly one revenue truth (the POS transaction) — never a duplicate line in Online Sales.
- Every public URL that reveals customer data uses an unguessable token; no sequential number is ever an authorization.
- A customer account can never read another customer's thread, and can never reach a staff endpoint, page, or dashboard host.
- No password-reset or sign-in token is ever returned in an API response body.
- Expiry, cancel, and decline always release reserved quantity.
- No password, MFA seed, recovery code, or API token is ever stored in a dashboard field.
- No customer-facing surface offers payment, shipping, or delivery — enforced on the server, not only in the UI.

## Measures worth watching (baseline first, targets later)

Time from `online_sales` Item → published listing · holds requested / confirmed / expired / no-show · first-response time on threads and open-thread count · items sold through an online reserve · share of published listings that ever get a hold.

---

## Risks

| Risk | Control |
|------|---------|
| **Sign-in links land in spam and the login looks broken** | G1 makes email load-bearing: real transactional provider, SPF + DKIM verified against Gmail/Outlook/Yahoo before launch, and the guest token URL always keeps working so a delivery problem degrades sign-in instead of locking anyone out of a hold. |
| Customers reply by email to a mailbox nobody reads | `retail@ecothrift.us` is an existing staffed mailbox with `Reply-To` set to itself — not `noreply@`. |
| **Customer mail damages the `retail@` mailbox staff depend on** | Send through the provider, not the mailbox's own SMTP; keep the credential out of Heroku config; watch complaint/bounce rates once live. If the `retail@` SMTP fallback is used, migrate before Dec 2026. |
| SPF change breaks all staff email | SPF is **appended**, never replaced; verify staff send/receive immediately after the DNS change. |
| Turning on parked code exposes old checkout/shipping semantics | Copy + server audit in Phase 1; existing policy-reject tests extended; legacy endpoints stay 410. |
| We ship the surface and then never list anything | G5 launch set is part of the Phase 5 exit gate, not a wish. |
| A hold is a website badge but the item is not physically set aside | Staging step is required before confirm; Ready-for-pickup tab shows staging location; POS guard makes the floor respect it. |
| Public message endpoints invite spam | Rate limit, idempotency, staff resolve/decline tools, and no anonymous thread creation without a listing context. |
| **Opening a public login widens the attack surface on the same auth stack staff use** | Fix the forgot-password token disclosure and the non-secure refresh cookie *before* the login ships; throttle login and registration; `Customer` group carries no staff rank and is rejected by staff route guards; customer sessions stay host-scoped to the apex domain. |
| Login becomes a wall in front of the first conversation | G8 default is guest-first; the token URL keeps working forever; login only aggregates what the guest path already created. |
| Sign-in links become an account-takeover vector | Short expiry, single use, invalidated on use, never returned in an API response body, and rate-limited per email and per IP. |
| Reserved quantity leaks and the shop lies about availability | Expiry command on a schedule (Phase 1), release on every exit path, existing race/release tests. |
| MVP quietly grows back into the full workspace vision | Scope-cut decisions #15, #16 and the Out-of-scope list are load-bearing; anything on that list goes back to the parked initiative. |
| Public site build/deploy breaks the staff app | `frontend-public` already ships in `heroku-postbuild`; verify both builds and keep the kill switch config-only. |

## Acceptance

- [x] Remaining gates (G2–G6, G8, G9) answered and recorded here. **G1/G7 accepted 2026-07-30; G2–G6, G8, G9 accepted 2026-07-31.**
- [ ] Mail sends as **`retail@ecothrift.us`** / display name **Eco-Thrift** via Microsoft Graph; a sign-in link reaches live inboxes; Outlook still shows the full mailbox.
- [ ] Replies to customer mail land in the `retail@` inbox and a named person watches it (Outlook + dashboard).
- [ ] Only three system emails exist: sign-in link, hold confirmed, you have a reply.
- [ ] Online Sales workspace live with four destinations; legacy `/admin/web-store` and `/admin/web-orders` redirect without losing bookmarks.
- [ ] Listing Studio does basic CRUD well: create from Item or blank, photos, facts, price/quantity, publish/pause/sold/archive, clear readiness errors.
- [ ] ecothrift.us `/shop` shows published listings with photos and pickup-only policy, reachable from site nav.
- [ ] Customer can ask a question and request a hold **as a guest**; both land in one dashboard Inbox thread; staff replies reach the customer's token page.
- [ ] A customer can sign in with a magic link and see their own requests and messages at `/account` — including ones they made as a guest with the same email.
- [ ] Forgot-password no longer returns a token in the response; refresh cookie is `secure`; login and sign-in-link requests are throttled; sign-in links are short-lived and single-use.
- [ ] A `Customer` account is proven to have zero staff access (route guards, `IsStaff`-gated APIs, dashboard host) and cannot read another customer's thread.
- [ ] Staff can verify → stage → confirm → complete a hold; POS completion is the only revenue event.
- [ ] Ready-for-pickup view answers "who is coming today and where is their stuff."
- [ ] Hold expiry runs on a schedule and releases quantity.
- [ ] `ONLINE_SALES_ENABLED=false` cleanly removes the customer surface (kill switch verified).
- [ ] Hard controls above are covered by tests in `apps/webstore/tests/`.
- [ ] Staff SOP written; launch set published; one week of live use reviewed.
- [ ] `CHANGELOG` + `.version` reflect the ship; `.ai/context.md` Active work updated.

---

## Sessions

### Session 1 — 2026-07-30T17:14:00-05:00 (est 1h)

- **Goal:** Create a strategic MVP initiative for online sales — high-level, all major decisions written down, scope cut to an absolute minimum.
- **Finish line:** Initiative file on disk with a solid outline (decisions, gaps, phases, gates, acceptance) + row on `_index.md`; owner gates ready to answer.
- **Scope:** Read-only audit of `apps/webstore`, `frontend-public`, staff Online Sales pages, nav, and the parked initiative; then authoring. No application code.
- **Out of scope:** Answering the owner gates, any implementation, version bump.
- **Update 2026-07-30T17:32:00-05:00 — customer login added to scope.** Owner asked for a simple customer login. Audited the auth stack: the JWT machinery is reusable and the public site is same-origin with the API (no CORS work), but there is no `Customer` group, no `IsCustomer`, no self-registration, and no auth code at all in `frontend-public/`. Decision #7 reversed to **guest-first, account-optional**; new decisions on identity isolation (#7c) and login flavour (#8b); new **Gap 2 — Identity**; Phase 2 renamed *Identity and conversation*; gates **G7** (magic link vs password) and **G8** (optional vs required) added, and **G1 reframed** — transactional email is now the pivotal dependency because it makes login passwordless *and* solves customer notification. **Two pre-existing auth defects found and recorded as prerequisites:** `forgot-password` returns a valid reset token in its response body to anonymous callers (staff account-takeover path today), and the refresh cookie is written with `secure=False`.
- **Update 2026-07-30T17:46:00-05:00 — G1 and G7 accepted.** Owner chose **transactional email ON**, which settles the login as a **magic link (passwordless)**. Sending identity defaulted to **`shop@ecothrift.us`** / display name Eco-Thrift / `Reply-To` itself, and it must be a real monitored mailbox rather than `noreply@` (owner to confirm the mailbox and its owner — new **G9**). Consequence recorded: because sign-in *is* an emailed link, **deliverability becomes a hard requirement** — real transactional provider, SPF + DKIM verified against Gmail/Outlook/Yahoo, short-lived single-use links never echoed in a response, and the guest token URL retained as the degradation path. Phase 2 reordered so email plumbing lands before the login that depends on it, and scoped to exactly three system emails.
- **Update 2026-07-30T17:56:00-05:00 — mail architecture settled.** Owner shared the Entra tenant: `ecothrift.us` runs on **Microsoft 365** with `bill_rollins@`, `marketing@`, `retail@`, `warehouse@`; **no `shop@` yet**. Verified current Microsoft guidance and recorded the decision to **split sending from receiving** — app mail goes out through a **transactional provider**, M365 only receives replies. Rationale captured in the file: basic-auth SMTP is disabled by default after **December 2026** (removal announced 2H 2027), **shared mailboxes cannot SMTP-auth** so the M365 path would require a paid licensed robot mailbox, **HVE is internal-recipient oriented**, and routing customer mail through the staff identity risks staff deliverability with no bounce visibility. `shop@` to be created as a **free shared mailbox** (or alias on `retail@`) for replies. **SPF must be appended, never replacing the Microsoft entry.** G9 narrowed to provider choice + mailbox-vs-alias.
- **Update 2026-07-30T18:10:00-05:00 — resplit into five phases.** Phase 2 had accumulated security fixes + email + messages + login + templates, so it was broken up and **ordered by value**: **1 Live surface** (plus the two small auth fixes, since sitting on an account-takeover path for weeks is indefensible) → **2 Email** (its own phase because it is the only piece with an external dependency — DNS, provider, spam filters — and it unblocks both later notices) → **3 Messages** → **4 Accounts** → **5 Pickup + launch**. Each phase is independently releasable; **stopping after Phase 3 still delivers the MVP as originally described**, with accounts as a convenience layer. Phases 2 and 3 may be collapsed if four phases is preferred; nothing else should merge.
- **Update 2026-07-30T18:04:00-05:00 — sending identity is `retail@ecothrift.us`.** Owner chose the existing **Retail Operations** mailbox (Business Standard licensed) rather than creating `shop@`: it is already staffed so replies cannot vanish, and no new mailbox or licence is needed. Display name set to **Eco-Thrift** (not “Retail Operations”, which reads as internal machinery to a customer). Because `retail@` is licensed, the earlier shared-mailbox objection no longer applies and its SMTP *would* work today — the provider recommendation now rests on reputation coupling with a mailbox staff depend on, a stored mailbox credential in Heroku config, absent bounce visibility under magic-link login, the Dec 2026 basic-auth default change, and display-name control. The `retail@` SMTP path is recorded as an **accepted MVP fallback** since switching pipes is only a Django settings change, with a hard note to migrate before December 2026. G9 reduced to the pipe choice.
- **Result:** Initiative created. Key finding: the MVP is ~80% built and parked — Listing model, Reservation state machine, POS hold guard, Studio, Inbox, public shop/hold pages all exist behind redirects and `ONLINE_SALES_ENABLED=false`. **Five real gaps** identified: turn-on hygiene, customer identity/login, Messages subsystem, pickup prep, and expiry scheduler + launch data. Scope cut: no marketing/channels/P&L/B2B, no nav renames outside Online Sales, no account features beyond my-requests/my-messages. **Eight owner gates open**; G1 (transactional email) is pivotal because it decides both the login flavour and whether customers get notified at all. No code written.

### Session 2 — 2026-07-30 overnight (unsupervised build on `online-sales-mvp`)

- **Goal:** Implement overnight plan Phases 1–4 (surfaces, email, messages, accounts) + pickup tab + demo seed + hardening tests + handoff artifacts. No push, no prod.
- **Done:** Auth hardening; audits; backend kill switch + expiry command; staff Online Sales nav/routes; public shop un-park behind config; policy copy guard; Conversation/Message + Inbox Messages; three system emails + email_setup; Customer magic-link + public account pages; Ready for pickup tab; `seed_online_sales_demo`; G1–G6 style tests; SOP/demo/changelog drafts; migration rollback rehearsal.
- **Verify:** `makemigrations --check` clean; `test apps.webstore apps.accounts.tests` → **70 OK**; vitest online-sales+policy → **21 OK**; staff + public builds OK.
- **Handoff:** Read [`.ai/reference/online_sales_mvp/overnight_log.md`](../reference/online_sales_mvp/overnight_log.md) first (DECISIONS NEEDED / WHERE I STOPPED / FINDINGS). Recommended semver draft `v2.62.0` in `changelog_draft.md` — do not bump yet.
- **Out of scope overnight:** Answering open gates G2–G6/G8/G9; DNS/provider signup; flipping `ONLINE_SALES_ENABLED` in production; editing `CHANGELOG.md` / `.version`.

### Session 3 — 2026-07-31 morning fix pass (stop before merge)

- **Goal:** Review overnight branch; fix confirmed defects; walk demo locally with flags on; do not merge.
- **Done:** Unread no longer cleared by GET (explicit `POST …/threads/<token>/read/`); list payloads omit message bodies; 48h untriaged-request expiry; idempotency scoped to active+email; confirm email on `transaction.on_commit`; cache-backed hold/message throttles; pickup “today” filter extracted and fixed; lazy public auth; SignIn `debug_token`; seed wipe + `walk_online_sales_demo`.
- **Verify:** `test apps.webstore apps.accounts.tests` → **80 OK**; vitest online-sales+policy → **27 OK**; both FE builds OK; local walk with `ONLINE_SALES_ENABLED=true` OK.
- **Still open:** G9 provider/SPF; merge decision; marking G2–G6/G8 accepted.

### Session 4 — 2026-07-31 release + next slices

- **Goal:** Full release **v2.62.0** (merge + deploy, public flag off); then listing CRUD polish + shared TipTap editor (v2.63); then M365 Graph two-way mail (v2.64).
- **Gates:** G2–G8 accepted; G5 = owner-entered listings; G9 = Microsoft Graph on `retail@`, one mailbox, UI-split OS vs general (Admin-only general inbox).
- **Prod:** Do not flip `ONLINE_SALES_ENABLED` until owner tests in dev and says go.

---


## See also

- [`.ai/initiatives/_archived/_pending/online_sales_workspace.md`](./_archived/_pending/online_sales_workspace.md) — full vision, parked; source of the accepted policy and data contracts
- [`.ai/reference/online_sales_workspace/phase_0_contract.md`](../reference/online_sales_workspace/phase_0_contract.md) — accepted Phase 0 pack (policy copy, SOP, state machines, hard controls) — still authoritative where this file does not narrow it
- [`.ai/initiatives/_archived/_pending/public_website.md`](./_archived/_pending/public_website.md) — public site build; its Helcim/shipping direction is superseded
- `apps/webstore/` — models, views, `services/reservations.py`, `services/hours.py`, `services/feature.py`, `tests/test_holds_hard_controls.py`
- `frontend/src/pages/online-sales/`, `frontend/src/api/webstore.api.ts`, `frontend/src/hooks/useWebStore.ts`
- `frontend/src/navigation/navItemCatalog.ts`, `slotCNavLayout.ts`
- `frontend-public/src/` — `App.tsx`, `api.ts`, `pages/`, `components/Layout.tsx`, `cart.tsx`
- [`.ai/extended/development.md`](../extended/development.md) — Heroku Scheduler section for the expiry job

*Parent: [`.ai/initiatives/_index.md`](./_index.md).*
