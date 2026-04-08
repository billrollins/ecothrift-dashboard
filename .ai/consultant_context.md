# Consultant context: B-Stock auction intelligence

<!-- Last updated: 2026-04-10T18:45:00-05:00 -->

**Purpose.** This is the **single-file, information-dense** handoff for **external advisors** on the **B-Stock auction intelligence** initiative for **Eco-Thrift Dashboard**. The reader may have **no repo access** or limited time: everything critical should be reachable in one pass.

**Why not only `initiatives/` and `extended/`?** Those trees are **modular** so **coding agents** load only what a task needs and avoid irrelevant context. A **consultant** needs the **whole picture**—business, architecture, APIs, phases, gotchas, open questions—without opening many files. This document **consolidates** that; it does **not** replace **`.ai/initiatives/bstock_auction_intelligence.md`** for phase checklists and acceptance criteria—**keep both aligned** when either changes.

---

## Business context

**Eco-Thrift** is a thrift retail operation (Omaha area) that runs its business on an internal full-stack app: Django and Postgres on the backend, React on the frontend, deployed to **Heroku** for always-on access.

**B-Stock** operates business-to-business liquidation marketplaces. Vendors (for example big-box retailers) sell customer returns, shelf pulls, and similar inventory in **auction** format. Eco-Thrift participates as a buyer, sourcing pallets and truckloads at prices that can support resale margins.

The owner buys **liquidation inventory through auctions** because it is a primary supply path for sellable goods at scale. Decisions are **time-sensitive**: auctions have fixed end times, and competitive bidding often compresses into the **final seconds**. Missing an end time or misjudging value against time pressure directly affects whether the business wins useful lots at acceptable prices.

### Marketplaces in scope

The initiative focuses on **six B-Stock marketplaces** the owner actually shops (each backed by a B-Stock **storeFrontId** used in search). They are seeded in the app as separate sellers (Target, Walmart, Costco, Amazon liquidation-style storefronts, Home Depot, Wayfair). **Essendant** (`bstock.com/essendant/`) was explicitly **deprioritized**: it still runs on **legacy Magento**, not the same **Next.js** stack as the main B-Stock buyer experience, and it does **not** use the **`search.bstock.com`** listings API the scraper relies on. Building parity for Essendant would require a different integration path.

---

## Architecture decisions (and why)

### Single Django app inside the existing dashboard

Auction intelligence is implemented as **`apps/buying/`** inside the **same** Django project as inventory, POS, HR, and the rest. That is intentional: one database, one deployment, one auth and operations story. A **separate repo** would duplicate auth, deployment, and data joins. A **notebooks-only** approach was rejected for **production** behavior: scraping, persistence, and future jobs must live on the server.

### Heroku vs the owner’s laptop

**Heroku** runs the app **24/7**. The owner has **one home machine** and **no always-on local server**. Anything that must run on a schedule (sweeps, future polling, jobs) is assumed to target the cloud environment. If B-Stock ever blocks cloud IPs (see open questions), the fallback is a **local push** pattern: the owner’s machine runs a capture step and posts into production APIs.

### Notebooks vs production code

**Notebooks** under `workspace/notebooks/` remain a **workbench** for exploration, SQL, and ad hoc analysis. **Production logic** (HTTP clients, orchestration, models, management commands) lives in **`apps/buying/`** so it is versioned, testable, and deployable.

### Frontend stack

The dashboard UI is **React** (TypeScript, MUI, React Query). **Buying** staff routes live in the same stack (**`/buying/auctions`**, **`/buying/auctions/:id`**, **`/buying/watchlist`**). There is no separate SPA for this feature.

---

## Operational model (B-Stock)

**Soft touch vs invasive:** **Soft touch** (default) means using the **public listings API** (`search.bstock.com` POST) **without a JWT**. It is appropriate for **frequent or scheduled sweeps** and minimizes ban risk. **Invasive** flows use a **Bearer JWT** for **token-backed** endpoints: **order-process manifests**, **auction.bstock.com** batch state, authenticated **listing** calls, etc. Invasive calls should be **rare**, **manually approved**, and tied to **intent to bid** or **must-have enrichment**.

**Manual manifest path (production):** **CSV upload** in the React **auction detail** page is **shipped** (**v2.6.1**, Phase 4.1A): **`POST /api/buying/auctions/{id}/upload_manifest/`** with `ManifestTemplate` detection. **Server-side** `pull_manifest` using a stored token remains useful for **local development** but is **not** the default production story, because cloud token automation is awkward and token-heavy calls drove **account blocks** during development.

**Ban mitigation:** If token-backed actions are blocked, **soft-touch discovery** can continue. Standard practices: **delays between requests**, **backoff on HTTP 429/403**, **logging response codes**, and **separating** listing sweeps from manifest pulls. See initiative **Open questions** for follow-up on per-account vs per-IP limits.

---

## B-Stock API architecture (discovered via DevTools)

B-Stock’s buyer experience talks to **multiple microservice hosts**. Public URLs are fixed; the app does not invent HTML scraping for these flows.

### Service map

| Host | Role |
|------|------|
| **search.bstock.com** | Search and discovery: list listings for a storefront. |
| **listing.bstock.com** | Listing and lot-group data (for example groups by `lotId`). |
| **auction.bstock.com** | Live auction state: prices, bids, timing. |
| **order-process.bstock.com** | **Manifests** (line items for a won or previewed lot). |
| **shipment.bstock.com** | Shipping quotes. |
| **account.bstock.com** | Account and identity (not deeply wired in Phase 1). |
| **location.bstock.com** | Location-related APIs (not deeply wired in Phase 1). |

### Authentication rules

| Call type | Auth |
|-----------|------|
| **POST** `search.bstock.com/v1/all-listings/listings` | **No JWT required** for discovery. This is important for unattended scheduled sweeps on Heroku. |
| **GET** `order-process.bstock.com/v1/manifests/...` | **JWT required.** |
| **GET** `auction.bstock.com/v1/auctions?...` | **JWT required** (auction detail enrichment). |
| **GET** `listing.bstock.com/...` | **JWT required** for authenticated listing calls. |
| **GET** `shipment.bstock.com/...` | **JWT required** where used. |

### Search listings (discovery)

**Endpoint:** `POST https://search.bstock.com/v1/all-listings/listings`

The body is JSON. The important fields include:

- **`storeFrontId`**: an array of storefront identifiers (the app passes one seeded ID per marketplace).
- **`limit`**: page size (the app paginates until a page returns fewer rows than `limit`).
- **`offset`**: offset for pagination.
- **`sortBy`**: for example `recommended` (the app uses the same pattern as captured from DevTools).
- **`sortOrder`**: for example `asc`.

The response shape is normalized in code, but listings arrive as rows with fields such as **`listingId`**, **`lotId`**, titles, prices, categories, and timing. The first page can be logged in dry-run mode for schema discovery.

### Manifests

**Endpoint:** `GET https://order-process.bstock.com/v1/manifests/{lotId}`

The path segment is **`lotId`**, not `listingId` and not `groupId`. Query parameters include **`limit`** (maximum **1000** per request; higher values return a clear error), **`offset`** for paging, plus sort and exclude flags. Large manifests require a **pagination loop**: accumulate `offset` until `total` rows are retrieved or a page returns empty.

### Auction state

**Endpoint:** `GET https://auction.bstock.com/v1/auctions`

The client passes **`listingId`** (and **`limit`**). The API supports **batching** multiple listing IDs in one query (comma-separated) for efficiency when enriching many auctions.

### Identifier relationships (critical)

These IDs are **not** interchangeable:

- **`listingId`**: primary listing identifier in search and in the auction service. **Auction state** queries use **`listingId`**.
- **`lotId`**: identifies the **lot** in listing and **manifest** flows. The **manifest URL** uses **`lotId`** in the path.
- **`auctionId`**: auction record id from B-Stock (bids, auction service).
- **`groupId`**: appears in some payloads; **not** the manifest path id (the manifest uses **`lotId`**).

The **search** response includes **`listingId`** and **`lotId`**. The **manifest** endpoint uses **`lotId`**. The **auction** endpoint uses **`listingId`**. Getting this wrong produced manifest **400** or empty results until corrected.

### Essendant (Magento) caveat

The **Essendant** marketplace on the old **Magento** stack does **not** use **`search.bstock.com`** for discovery the same way. It is **out of scope** for the current Phase 1 pipeline unless a separate integration is funded.

Full scraper endpoint map with auth requirements and triggers is documented in `.ai/extended/bstock.md`.

---

## StoreFront IDs (marketplace seeds)

These values are the B-Stock **storeFrontId** strings used in search for each marketplace row in the app:

| Marketplace | storeFrontId |
|-------------|--------------|
| Target | `681ba6075fcfe8a77834e039` |
| Walmart | `66562833b29d4ed2184fb048` |
| Costco | `671006ab361622722de6a918` |
| Amazon | `6890f7d62ed3f874681ba620` |
| Home Depot | `6881261faf84045af78617c9` |
| Wayfair | `69b09e3a59abd904a59f5459` |

---

## Authentication (FusionAuth, JWT, JWE, and local workflow)

B-Stock uses **FusionAuth** for **OAuth2** login in the browser. **API calls** that require auth expect a **Bearer JWT** in the `Authorization` header.

### JWT lifetime and shape

The usable token is a **signed JWT** (typically **RS256**). It begins with **`eyJhbGciOiJSUzI1NiI`**. It expires in roughly **one hour**, so long-running sessions need periodic refresh.

### The `elt` cookie mistake (JWE vs JWT)

The browser **`elt`** cookie often holds a **JWE** (encrypted token) starting with **`eyJhbGciOiJSU0EtT0FF`**. That value is **not** the same as the **Authorization** token the microservices accept. Sending the JWE to **order-process** (manifests) produced **HTTP 400** (not **401**), which was a costly debugging thread. **Any future token issue should verify token type first.**

### Where the real JWT lives (Next.js)

On standard Next.js B-Stock pages, the access token is exposed on the page as:

`window.__NEXT_DATA__.props.pageProps.accessToken`

(a shortcut is `window.p.accessToken`). A **bookmarklet** copies this value or **POSTs** it to a **local dev** endpoint.

### Local token save and scraper resolution

**POST** `/api/buying/token/` (allowed only when `DEBUG` or from localhost) accepts JSON `{"token":"..."}` and writes **`workspace/.bstock_token`** (gitignored). The scraper reads that file **first**, then falls back to **`BSTOCK_AUTH_TOKEN`** in the environment. **Full automation** of login (OAuth2 code flow, CAPTCHA, browser session) is **out of scope** and **not** implemented; the human must refresh the token when it expires.

### What runs without auth vs with auth

| Command / behavior | Auth |
|--------------------|------|
| **`sweep_auctions`** (search discovery) | **Not required** (public search). |
| **`pull_manifests`**, **`get_auction_detail`**, listing calls that need JWT | **Required** |

Scheduled **sweeps** on Heroku can run **without** a token if only search is used. **Manifest pulls** and **auction enrichment** need a **valid JWT** refreshed by the owner.

---

## What is implemented (Phases 1–4)

### Phase 1 (shipped)

The **Django app** `apps/buying/` includes models: **Marketplace**, **Auction**, **AuctionSnapshot**, **ManifestRow**, **WatchlistEntry**, **Bid**, and **Outcome** (the last two are modeled for later phases).

**Services:** **`scraper.py`** performs HTTP calls with retries, backoff, and rate limiting; **`normalize.py`** maps B-Stock manifest JSON into **`ManifestRow`** columns (with **`raw_data`** retaining the full payload); **`pipeline.py`** orchestrates discovery and manifest pulls.

**Management commands:** **`sweep_auctions`**, **`pull_manifests`**, **`bstock_token`**, **`renormalize_manifest_rows`** (re-apply normalization to stored **`raw_data`** without a live JWT — optional filters and dry-run). The **`POST /api/buying/token/`** view supports the bookmarklet workflow.

**Data:** Six marketplaces are seeded with the **storeFrontId** values above via migrations. **Bookmarklet** documentation lives at **`apps/buying/bookmarklet/bstock_elt_bookmarklet.md`**.

**Scale observed in testing:** discovery has run across **six** marketplaces (on the order of **60+** auction rows in a representative sweep); **manifest** pagination was validated on large lots (on the order of **1,000+** lines per auction with **limit 1000** and **offset** paging).

### Phase 2 — staff React UI and APIs (shipped)

**Auction list** (`/buying/auctions`, **v2.4.1**; UX **v2.6.1**): server-paginated **DataGrid** on desktop (`md+`) and **infinite-scroll cards** on mobile; **marketplace chip** filters (single-click isolate one vendor, **Ctrl/⌘+click** multi-select; comma-separated slugs on the API) with global summary counts; status and has-manifest filters; **all columns sortable**; **Total retail** shows manifest vs listing source (**`total_retail_display`** / **`retail_source`**); urgency styling for time remaining; row/card navigation to detail; **Refresh auctions** runs **`POST /api/buying/sweep/?marketplace=`** **sequentially** per marketplace with inline progress and partial-failure reporting; list refetches on mount when returning from detail.

**Auction detail** (`/buying/auctions/:id`): two-column layout (**metadata** | **manifest** card with CSV drop zone and **Open on B-Stock**); **CSV upload** primary path; **pull manifest** (JWT) when needed for dev; **watchlist star** (add/remove via **`POST`/`DELETE …/watchlist/`**); **manifest** table (**DataGrid**, server pagination, 50 per page) on desktop or **card list + load more** on mobile via **`GET …/manifest_rows/`** (**optional `search` / `category`** filters, **v2.6.1**).

**Manifest normalization:** **`normalize.py`** flattens nested B-Stock structures (**`attributes`**, **`attributes.ids`**, **`uniqueIds`**, **`customAttributes`**, **`categories`**, **`itemCondition`**, pick heuristics for SKU/title, etc.); optional warnings when important fields are empty and unmapped keys remain (**`row_id`** helps pinpoint rows). **`renormalize_manifest_rows`** bulk-updates rows from stored **`raw_data`**. **Retail:** unit/extended retail is converted to dollars; **integer minor units (cents)** use a documented heuristic (see **`normalize.py`**).

**Watchlist list** (`/buying/watchlist`): **`GET /api/buying/watchlist/`** returns auctions with nested **`watchlist_entry`**; client filters by **priority** and **watchlist status**; sort includes **end time** (default), **current price**, **total retail**, **added_at**; **remove** per row (**`DELETE …/watchlist/`**) with list invalidation; row navigation to auction detail. **No** inline editing of priority/status on the watchlist page (display + filters only). **No** sidebar badge count for watchlist size.

**DRF surface (staff):** auctions list/detail/summary, marketplaces, sweep, manifest rows, pull manifest, watchlist add/remove, watchlist collection — see **`CHANGELOG.md`** **[2.4.1]** and **[2.5.0]** for versioned detail.

### Phase 3 — watchlist polling and price history (shipped)

**`python manage.py watch_auctions`** polls watchlisted auctions and writes **`AuctionSnapshot`** rows; updates **`Auction`** fields and **`WatchlistEntry.last_polled_at`**. **`GET /api/buying/auctions/{id}/snapshots/`** supports paginated history. **Auction detail** UI includes **price history** (chart on desktop, table on small screens). **Poll now** from the UI triggers server-side watch poll for that auction.

### Phase 4 — fast categorization (shipped)

**Models:** **`CategoryMapping`** (global **`source_key`** → **`canonical_category`**, **`rule_origin`** seeded/ai/manual). **`ManifestRow`** adds **`canonical_category`**, **`category_confidence`** (direct / ai_mapped / fallback).

**Commands:** **`seed_category_mappings`** (from `workspace/notebooks/category-research/cr/taxonomy_estimate.py`); **`categorize_manifests`** (tier 1 + tier 3; **`--ai`** for Claude tier 2 with **`--ai-limit`**). After **`pull_manifest`**, **`categorize_manifest_rows`** runs tier 1 + 3 automatically (no AI).

**API:** Auction detail includes **`category_distribution`** (full category list per manifest; **no** rolled-up “Other” bucket); manifest rows include canonical fields.

**UI:** Auction detail shows a **horizontal category mix** bar (**all** categories + not yet categorized) and **chips** per manifest line by confidence.

**Phase 4.1A:** **`ManifestTemplate`**, **`fast_cat_key`** on ingest, **`seed_fast_cat_mappings`** (343 static mappings), CSV upload.

---

## What is not implemented yet

**Phase 5 (auction valuation):** per-line estimates, rollup, pricing rules table, bid calculator, UI on list and detail. **Next** per initiative.

**Phase 6 (outcomes):** hammer, fees, shipping, per-line results, outcome UI.

**Heroku Scheduler** (or a worker dyno) for production jobs may be partial; confirm deployment docs.

**Manual manifest upload** in the React UI (drag/drop) is **shipped** (**v2.6.1**).

**Bid** and **Outcome** models exist; full outcome tracking UI and workflows are **Phase 6**.

Optional UX gaps: **sidebar watchlist badge**; **inline** priority/status editing on the watchlist page.

### Future direction

Item processing AI: a future initiative will send standardized manifest rows through AI during item processing for improved metadata (title, brand, model, notes), better canonical category assignment, retail value validation, and price recommendations. Price recommendations will draw from multiple estimate sources (category margin rates, scoring models, cost-based minimums) with a dynamic admin-level pricing throttle. This is separate from the buying/auction intelligence initiative and depends on the fast categorization and standardization infrastructure being built in Phase 4.1.

---

## Current phase plan (summary)

The initiative file is authoritative. At a high level:

| Phase | Focus |
|-------|--------|
| **1** | Foundation: models, scraper, sweep, manifests, token workflow. **Done.** |
| **2** | Staff auction list, detail + manifests, watchlist page, normalization + renormalize command. **Done (v2.4.1 + v2.5.0).** |
| **3** | Watchlist polling, **`AuctionSnapshot`**, snapshots API, price history, Poll now. **Done.** |
| **4** | **`CategoryMapping`**, 3-tier categorization, seed/categorize commands, **`category_distribution`**, UI bar + chips, retail cents fix. **Done.** |
| **5** | Auction valuation scaffold. **Next.** |
| **6** | Outcome tracking. **Future.** |

The plan was **reordered** so the **frontend** lands before heavy backend-only intelligence, so the owner uses the product daily instead of only admin and SQL.

---

## Gotchas consultants should internalize

**Prices:** B-Stock often returns **money as integer cents** in API fields. **Dollar display** requires dividing by **100** where that convention applies. **Manifest line retail** in `normalize.py` uses **`_manifest_retail_to_dollars`** heuristics (explicit decimals vs integer minor units). Always validate against **raw JSON** when adjusting mappings.

**Manifest paging:** **`limit`** is capped at **1000**. Large manifests **must** use **offset** pagination.

**Manifest path id:** Use **`lotId`** in **`order-process`** manifest URLs, not **`listingId`**.

**`has_manifest`:** The search payload may not include an explicit boolean. The app may infer interest from **`lotId`** presence and other hints.

**Public search:** `search.bstock.com` listings POST **without auth** enables **scheduled discovery** on Heroku without storing a live JWT for sweeps only.

**JWE vs JWT:** See **Authentication** above. Wrong token type manifests as **400** on some services, not a clean **401**.

**Heroku IPs:** If B-Stock blocks **Heroku egress IPs**, server-side scraping may fail. **Mitigation** is not finalized; **local push** to production APIs is the documented fallback idea.

---

## Open questions (carried from the initiative)

**Outcome truth:** When a lot is won, is the **source of truth** the **B-Stock API hammer** or **internal POS / receipt** after physical pickup? That affects reconciliation and learning labels.

**Retention:** How long to keep **raw API payloads** and at what granularity; privacy and disk cost.

**Background execution:** **Heroku Scheduler** (simple cron) vs a **worker dyno** (more flexible, higher cost). Revisit when **polling** and **jobs** scale.

**Cloud scraping:** Whether **B-Stock** tolerates requests from **Heroku’s IP ranges** at scale is **untested** as a hard guarantee.

**B-Stock ban/block risk:** Soft-touch listings sweep may remain available when token-backed calls are limited. Investigate per-account, per-IP, or per-token limits; document safe intervals for invasive calls.

**Retrospective metrics** (estimates vs actuals, MAE by category) are **deferred** until **Phase 6** outcome data exists; they may live in a **future scoring model initiative** or an appendix to Phase 6, not as a standalone numbered phase in this initiative.

---

## Document maintenance

When APIs, phases, or shipped behavior change, update **this file** and **`.ai/initiatives/bstock_auction_intelligence.md`** together so advisors and implementers stay aligned. Prefer **density** (tables, tight bullets) over prose; avoid duplicating **`.ai/extended/`** verbatim—summarize what consultants must know. Session startup and context rules: **`.ai/protocols/startup.md`** (Audience: coding agent vs consultant), **`.ai/context.md`**.
