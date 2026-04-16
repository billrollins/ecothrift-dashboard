# Consultant context: B-Stock auction intelligence + legacy data

<!-- Last updated: 2026-04-16T23:00:00-05:00 (v2.15.4) -->

**Purpose.** This is the **single-file, information-dense** handoff for **external advisors** on **Eco-Thrift Dashboard**. The **primary** narrative is **B-Stock auction intelligence** (`apps/buying/`). A **second** stream—**historical sell-through / legacy PO extracts**—uses ad hoc scripts and local DBs; it is summarized below so advisors do not have to infer it from the buying initiative alone.

**Why not only `initiatives/` and `extended/`?** Those trees are **modular** so **coding agents** load only what a task needs and avoid irrelevant context. A **consultant** needs the **whole picture**—business, architecture, APIs, phases, gotchas, open questions—without opening many files. This document **consolidates** that; it does **not** replace **`.ai/initiatives/bstock_auction_intelligence.md`** for phase checklists and acceptance criteria—**keep both aligned** when either changes.

---

## Historical sell-through — legacy Purchase Order extract (v2.7.1)

**Initiative:** [`.ai/initiatives/_archived/_pending/historical_sell_through_analysis.md`](.ai/initiatives/_archived/_pending/historical_sell_through_analysis.md) (**pending**; initial `PricingRule` rates seeded manually v2.8.0; data-backed refinement deferred until needed. PO extract and joins **feed** **`seed_pricing_rules`** / category economics. **Live valuation** reads **`CategoryStats`** (daily SQL aggregates); **`PricingRule`** is retained for legacy/admin only.

**Heroku (buying):** Daily `compute_daily_category_stats` (refreshes **`CategoryStats`** including **`need_score_1to99`**, then full valuation for open future-ended auctions unless `--skip-recompute-open`); hourly `scheduled_sweep`. **No** nightly inventory **`recompute_cost_pipeline`** (removed **v2.14.0**) — see **`.ai/extended/development.md`**. **Local dev:** **`scripts/dev/daily_scheduled_tasks.bat`** runs the same buying commands (plus **`watch_auctions`**) against the default DB; not automatic with **`runserver`**.

**What ran (v2.7.1):** Ad hoc **`extract_po_descriptions.py`** against local **`ecothrift_v1`** / **`ecothrift_v2`** / **`ecothrift_v3`** (requires **`psycopg2`**, root **`.env`** DB vars). The script is **not** committed today; semantics and outputs are recorded in **`CHANGELOG`** **[2.7.1]** and the pending initiative file.

**Outputs (local `workspace/data/`, gitignored):** `po_descriptions_all.csv`, `po_category_distribution.csv`, `po_category_sell_through.csv`, plus consultant-side CSV/MD if you regenerate a local copy.

**Semantics:** `sold_line_count` in the sell-through aggregation counts **POs that matched** the sell-through file on `po_number`, not per–cart-line counts.

---

## Historical data backfill (V1/V2 into V3) — **Phases 0–6 complete** (local DB)

**Initiative:** [`initiatives/_archived/_completed/data_backfill_initiative.md`](initiatives/_archived/_completed/data_backfill_initiative.md) (**completed / archived** 2026-04-11). **v2.10.0:** Buying dashboards and category-need reflect ~**3 years** of backfilled inventory and sales on Bill’s loaded database.

**Pipeline (shipped):** [`backfill_phase1_vendors_pos`](../apps/inventory/management/commands/backfill_phase1_vendors_pos.py) through [`backfill_phase4_sales`](../apps/inventory/management/commands/backfill_phase4_sales.py); **[`backfill_phase5_categories`](../apps/inventory/management/commands/backfill_phase5_categories.py)** (`--map-v1`, `--export-v2`, `--preclassify-v2`, `--import-v2`, `--recompute-pricing`); V2 product classification via **[`classify_v2_iterate`](../apps/inventory/management/commands/classify_v2_iterate.py)** (regex rules under `workspace/data/v2_rules/`, samples under `workspace/data/v2_sample/`). Phase **6** verified: **`GET /api/buying/category-need/`** (19 categories, non-zero counts), admin counts, `manage.py check`.

**Production (Heroku):** Phases **1–5** backfill and supporting migrations have been **deployed**; **`Item.retail_value`** is populated. **v2.14.0 (2026-04-15):** **`Item.cost`** = allocation from **`PurchaseOrder.est_shrink`**, **`PO.retail_value`** (B-Stock listing), **`PO.total_cost`**, and line **`retail_value`** — formula in **`.ai/extended/backend.md`**; default **`est_shrink`** for new POs from **`AppSetting`** `po_default_est_shrink` (staff **Admin → Assumptions**); costs refresh in Django when PO or line retail / PO assignment changes; one-shot backfill **`python manage.py recompute_all_item_costs`** only if data was fixed outside **`save()`**. **Auction valuation:** **`need_score`** and auto **`priority`** are integers **1–99** from category **`need_score_1to99`** × manifest/AI category weights (**`apps/buying/services/valuation.py`**); daily **`compute_daily_category_stats`** updates SQL aggregates. Legacy commands **`compute_vendor_metrics`**, **`compute_po_cost_analysis`**, **`compute_item_cost`**, **`recompute_cost_pipeline`** are **removed**. Portable CSV **`export` / `import_backfill`** remains a **separate** path — not required for live Heroku V3.

**Relationship to sell-through initiative:** Backfill Phases 3–5 supersede much of the pending `historical_sell_through_analysis` work for data-backed **`PricingRule`** rates from real sold **`Item`** rows.

**Retag v2 scaffolding** (DB2→DB3 cutover) was **removed** from the codebase after March 2026; **[`retag-operations.md`](extended/retag-operations.md)** is historical reference only. Legacy Target duplicate vendor **TGT** was merged into **TRGET** (v2.11.0 data migration); details remain in **`CHANGELOG`** **[2.11.0]** / **[2.11.1]** (long-form investigation notes were under **`.ai/reference/`**, since removed from the repo).

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

**Soft touch vs invasive:** **Soft touch** (default) means using the **public listings API** (`search.bstock.com` **GET** or **POST** — same payload semantics; the Django scraper uses **POST**) **without a JWT**. It is appropriate for **frequent or scheduled sweeps** and minimizes ban risk. **Invasive** flows use a **Bearer JWT** for **token-backed** endpoints where the app still requires them: **order-process manifests** (management commands / legacy pull), authenticated **listing** calls, etc. Invasive calls should be **rare**, **manually approved**, and tied to **intent to bid** or **must-have enrichment**. *(Research note: **GET** `auction.bstock.com` with `listingId` and **GET** order-process manifests have been observed **anonymous 200** for tested probes; the app still passes JWT where coded — policy may change. Committed detail: **`.ai/extended/bstock.md`**.)*

**Manual manifest path (production):** **CSV upload** in the React **auction detail** page is **shipped** (**v2.7.0**, Phases 4.1A–4.1B): **`POST /api/buying/auctions/{id}/upload_manifest/`** with `ManifestTemplate` detection; optional **Claude** template completion for unknown headers; Stage **2** **`map_fast_cat_batch`** for unmapped **`fast_cat_key`** values. **Server-side** `pull_manifest` using a stored token remains useful for **local development** but is **not** the default production story, because cloud token automation is awkward and token-heavy calls drove **account blocks** during development.

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

| Call type | Auth (app / typical) |
|-----------|-------------------------|
| **GET** or **POST** `search.bstock.com/v1/all-listings/listings` | **No JWT required** for discovery. **Max `limit` = 200** (API returns **400** if higher). **GET** uses query params (`storeFrontId`, `limit`, `offset`); **POST** uses JSON body with **`storeFrontId`** as an **array** (Django **`discover_auctions`**). Important for unattended scheduled sweeps on Heroku. |
| **GET** `order-process.bstock.com/v1/manifests/{lotId}` | **JWT** in app code (`get_manifest`). **Anonymous GET** has succeeded for **tested** public lots in **2026-04** probes — do not rely on it for production without verification. Manifest pagination: the API accepts a **`limit`** parameter, but **observed page size is 10 rows per request** regardless — loop with **`offset`** until **`total`** (see **`.ai/extended/bstock.md`**, `scraper.py`). |
| **GET** `auction.bstock.com/v1/auctions?...` | **JWT** in app code (`get_auction_detail`). **Anonymous GET** with **`listingId`** succeeded in **2026-04** probes; app may still require token. |
| **GET** `listing.bstock.com/...` | **JWT** for **`get_lot_detail`** in app. |
| **GET** `shipment.bstock.com/...` | **JWT** where used. |

**Canonical (committed):** **`.ai/extended/bstock.md`** (endpoint map aligned with **`apps/buying/services/scraper.py`**).

### Search listings (discovery)

**Endpoints:** `GET` or `POST` `https://search.bstock.com/v1/all-listings/listings`

**POST** body is JSON. Important fields:

- **`storeFrontId`**: an array of storefront identifiers (the app passes one seeded ID per marketplace).
- **`limit`**: page size — **maximum 200** (not 1000; values above **200** return validation error).
- **`offset`**: offset for pagination.
- **`sortBy`** / **`sortOrder`**: e.g. `recommended`, `asc` (POST path in **`discover_auctions`**).

**GET** uses the same parameters as query string (`storeFrontId` as a single id). Response includes **`listings`**, **`total`**, **`limit`**, **`offset`**.

The response shape is normalized in code, but listings arrive as rows with fields such as **`listingId`**, **`lotId`**, titles, prices, categories, and timing. The first page can be logged in dry-run mode for schema discovery.

### Manifests

**Endpoint:** `GET https://order-process.bstock.com/v1/manifests/{lotId}`

The path segment is **`lotId`**, not `listingId` and not `groupId`. Query parameters include **`limit`**, **`offset`** for paging, plus sort and exclude flags. **Observed behavior:** responses return **10 items per page** regardless of `limit` — paginate with **`offset`** until **`total`** lines are retrieved or a page returns empty (see **`.ai/extended/bstock.md`**).

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

Full scraper endpoint map with auth requirements and triggers is in **`.ai/extended/bstock.md`**. A separate long-form probe catalog lived under **`.ai/reference/`** and is **no longer in the repo**; use **`bstock.md`** + **`scraper.py`** as the source of truth. **Standalone ops scripts** (e.g. parallel search without Django) are **not** committed — use **`python manage.py sweep_auctions`** and staff APIs for supported paths.

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

## What is implemented (Phases 1–5 + 4.1A–4.1B)

### Phase 1 (shipped)

The **Django app** `apps/buying/` includes models: **Marketplace**, **Auction**, **AuctionSnapshot**, **ManifestRow**, **WatchlistEntry**, **Bid**, and **Outcome** (the last two are modeled for later phases).

**Services:** **`scraper.py`** performs HTTP calls with retries, backoff, optional SOCKS5 for all `*.bstock.com` traffic in `_request_json`, dev audit logging (`BUYING_SOCKS5_DEV_AUDIT`), and rate limiting; **v2.15.1** adds a **lazy singleton `requests.Session`** (`_manifest_http_session()`) for TLS connection reuse across paginated manifest GETs. **`listing_mapping.py`** maps search listing JSON to auction fields; **`sweep_upsert`** raw-SQL upserts on sweep; **`normalize.py`** maps B-Stock manifest JSON into **`ManifestRow`** columns (with **`raw_data`** retaining the full payload); **`pipeline.py`** orchestrates discovery and manifest pulls — **v2.15.1** adds CategoryStats preload, `_has_manifest_rows` annotation, `bulk_create(batch_size=500)`, and 1-deep **`ThreadPoolExecutor`** prefetch of the next auction's manifest during current-auction processing. **`manifest_dev_timelog.py`** (v2.15.1) writes per-pull JSONL and `time_summary.md` when `ENVIRONMENT=development`.

**Management commands:** **`sweep_auctions`**, **`pull_manifests`**, **`bstock_token`**, **`renormalize_manifest_rows`** (re-apply normalization to stored **`raw_data`** without a live JWT — optional filters and dry-run), **`seed_manifest_templates`**, **`seed_fast_cat_mappings`**, **`create_test_auctions`** (10 local test auctions for CSV matrix — no B-Stock calls), **`benchmark_manifest_pull`** (v2.15.1 — warm-up + baseline timing against dev timelog; flags `--auction-id`, `--baseline-runs`, `--skip-warmup`). The **`POST /api/buying/token/`** view supports the bookmarklet workflow.

**Data:** Six marketplaces are seeded with the **storeFrontId** values above via migrations. **Bookmarklet** documentation lives at **`apps/buying/bookmarklet/bstock_elt_bookmarklet.md`**.

**Scale observed in testing:** discovery has run across **six** marketplaces (on the order of **60+** auction rows in a representative sweep); **manifest** pagination was validated on large lots (hundreds to **1,000+** lines per auction via **`offset`** paging at **10 rows per page**).

### Phase 2 — staff React UI and APIs (shipped)

**Auction list** (`/buying/auctions`, **v2.4.1**; UX **v2.7.0**; visibility **v2.12.1**; sweep **v2.13.0**; desktop grid UX/perf **v2.13.1**; **Need** column integer **1–99** **v2.14.0**): server-paginated **DataGrid** on desktop (`md+`) and **infinite-scroll cards** on mobile; **v2.13.1** — expand **chevron** column at the **end** of the row; **inline** detail strip under an expanded row (no separate panel below the grid); stable column definitions + ref-read cell state so star/thumbs/archive toggles do not rebuild the full grid; theme **`disableRipple`** / no transition on icon buttons and checkboxes in the buying grid path; watchlist optimistic mutation also patches list row **`watchlist_sort`**; non-blocking query cancel in mutations — see root **`CHANGELOG.md` [2.13.1]**; **marketplace chip** filters (single-click isolate one vendor, **Ctrl/⌘+click** multi-select; comma-separated slugs on the API) with global summary counts; status and has-manifest filters; **all columns sortable**; **Total retail** shows manifest vs listing source (**`total_retail_display`** / **`retail_source`**); urgency styling for time remaining; row/card navigation to detail; **Refresh auctions** issues **one** **`POST /api/buying/sweep/`** (no **`marketplace`** query param) so the server sweeps **all** active marketplaces in parallel and returns **`by_marketplace`** timing and counts; optional **`?marketplace=<slug>`** limits to one MP. List refetches on mount when returning from detail. **List visibility** (`_apply_auction_list_visibility` in `apps/buying/api_views.py`): by default the auction list and watchlist list APIs show **live** auctions only — status **`open`** or **`closing`** with **`end_time` ≥ now**. The **Completed** chip sets **`completed=1`**, which shows **recently ended** auctions only: **`closed`** / **`cancelled`** with **`end_time`** in the **last 24 hours** (not all history). If **`status`** is set in query params, this automatic filter is skipped.

**Auction detail** (`/buying/auctions/:id`, **v2.7.0**): **Auction title** as page heading + optional **View on B-Stock** icon (**`Auction.url`**); **marketplace** chip in **Auction Details** metadata card (not in header). Two-column flex sections **Auction Details** | **Manifest**: **`ManifestUploadProgress`** when uploading/mapping; CSV **drag/drop** + **Choose file** (hidden during **MAPPING**); **Remove manifest** in manifest card; empty state **Download from B-Stock** when URL present; replace strip when manifest exists and not mapping. **Category Mix** stacked bar + **wrapping** legend (19 taxonomy colors in **`frontend/src/constants/taxonomyV1.ts`**; hatch for **Not yet categorized**). **Manifest Rows** under a divider: **search** + **fast category** filter (server-side **`search`** / **`category`** on **`GET …/manifest_rows/`**); **DataGrid** (50/page) or mobile cards. **CSV upload** primary path; **pull manifest** (JWT) for dev; **watchlist star** (**`POST`/`DELETE …/watchlist/`**).

**Manifest normalization:** **`normalize.py`** flattens nested B-Stock structures (**`attributes`**, **`attributes.ids`**, **`uniqueIds`**, **`customAttributes`**, **`categories`**, **`itemCondition`**, pick heuristics for SKU/title, etc.); optional warnings when important fields are empty and unmapped keys remain (**`row_id`** helps pinpoint rows). **`renormalize_manifest_rows`** bulk-updates rows from stored **`raw_data`**. **Retail:** unit/extended retail is converted to dollars; **integer minor units (cents)** use a documented heuristic (see **`normalize.py`**).

**Watchlist list** (`/buying/watchlist`): **`GET /api/buying/watchlist/`** returns auctions with nested **`watchlist_entry`**; client filters by **priority** and **watchlist status**; sort includes **end time** (default), **current price**, **total retail**, **added_at**; **remove** per row (**`DELETE …/watchlist/`**) with list invalidation; row navigation to auction detail. **No** inline editing of priority/status on the watchlist page (display + filters only). **No** sidebar badge count for watchlist size.

**DRF surface (staff):** auctions list/detail/summary, marketplaces, sweep, manifest rows, pull manifest, watchlist add/remove, watchlist collection — see **`CHANGELOG.md`** **[2.4.1]** and **[2.5.0]** for versioned detail.

### Phase 3 — watchlist polling and price history (shipped)

**`python manage.py watch_auctions`** polls watchlisted auctions and writes **`AuctionSnapshot`** rows; updates **`Auction`** fields and **`WatchlistEntry.last_polled_at`**. **`GET /api/buying/auctions/{id}/snapshots/`** supports paginated history. **Auction detail** UI includes **price history** (chart on desktop, table on small screens). **Poll now** from the UI triggers server-side watch poll for that auction.

### Phase 4 — fast categorization (shipped)

**Models:** **`CategoryMapping`** (global **`source_key`** → **`canonical_category`**, **`rule_origin`** seeded/ai/manual). **`ManifestRow`** adds **`canonical_category`**, **`category_confidence`** (direct / ai_mapped / **`fast_cat`** / fallback).

**Commands:** **`seed_category_mappings`** (from `workspace/notebooks/category-research/cr/taxonomy_estimate.py`); **`categorize_manifests`** (tier 1 + tier 3; **`--ai`** for Claude tier 2 with **`--ai-limit`**). After **`pull_manifest`**, **`categorize_manifest_rows`** runs tier 1 + 3 automatically (no AI).

**API:** Auction detail includes **`category_distribution`** (full category list per manifest; **no** rolled-up “Other” bucket); manifest rows include canonical fields.

**UI:** Auction detail shows a **category mix** stacked bar + **wrapping** legend (full **`category_distribution`**; no rolled-up “Other”) and **chips** per manifest line by confidence.

**Phase 4.1A (v2.6.1; manual E2E validation 2026-04):** **`ManifestTemplate`** (per marketplace **header signature**, **`column_map`**, **`category_fields`**, **`is_reviewed`**); **`POST …/upload_manifest/`** (multipart **`file`**) — **`fast_cat_key`** / **`fast_cat_value`** from **`CategoryMapping`** lookup when keys exist; **`category_confidence`** = **`fast_cat`** when mapped; **does not** run **`categorize_manifest_rows`**. **`seed_manifest_templates`** (four templates: Target 17-col, Walmart 13-col, Amazon 16- and 17-col); **`seed_fast_cat_mappings`** (**343** keys — consultant-reviewed from **three** source manifests). **`create_test_auctions`** for local uploads without API. Auction detail API may expose **`manifest_template_name`**.

**Phase 4.1B (v2.7.0; validated 2026-04):** **Claude** proposes **`column_map`** / **`category_fields`** for unknown headers (**`ai_manifest_template.propose_manifest_template_with_ai`**); template saved **`is_reviewed=True`**. **`POST …/map_fast_cat_batch/`** — up to **10** keys per call (**`ai_key_mapping.map_one_fast_cat_batch`**); new **`CategoryMapping`** with **`rule_origin='ai'`**; **`ManifestRow.fast_cat_value`** filled. Upload response includes **`unmapped_key_count`**, **`total_batches`**. **`DELETE …/manifest/`** removes **`ManifestRow`** only — templates and **`CategoryMapping`** persist; **TODO** on wrong-marketplace stale AI prefixes. **`fast_cat_key`** containing **`__no_key__`** excluded from AI. **Usage:** **`workspace/logs/ai_usage.jsonl`**, **`AI_PRICING`** in **`ecothrift/settings.py`** (inspect JSONL; no summarize script in repo). **UI:** **`ManifestUploadProgress`**, **four** concurrent workers, cancel, remove manifest, debounced invalidation; drop/replace hidden during **MAPPING**. **Gotcha:** Sonnet prompt-cache hits ~**0** on small key batches (under **2048**-token cache minimum).

### Phase 5 — auction valuation (API **v2.8.0**; React **v2.9.0**)

- **Schema:** **`Auction`**: **`ai_category_estimates`**, **`manifest_category_distribution`**, **`estimated_revenue`**, **`revenue_override`**, **`fees_override`**, **`shipping_override`**, **`estimated_fees`**, **`estimated_shipping`**, **`estimated_total_cost`**, **`profitability_ratio`**, **`need_score`**, **`shrinkage_override`**, **`profit_target_override`**, **`priority`**, **`priority_override`**, **`thumbs_up`**. **`PricingRule`** (flat **`sell_through_rate`** per taxonomy category — **no** vendor × category matrix). Staff **`CategoryWantVote`** removed **2026-04**. Seeds: **`seed_pricing_rules`** (CSV + **`AppSetting`** keys), **`seed_marketplace_pricing_defaults`**.
- **Design:** **`revenue_override`** is **USD** (`coalesce` with **`estimated_revenue`** before shrinkage); **`fees_override`** / **`shipping_override`** are **USD** only when set (else **fraction** × **`current_price`**). **`estimated_revenue`** is **pre-shrinkage**; **`profitability_ratio`** uses **effective revenue after shrinkage**. **Mix:** **`manifest_category_distribution`** is retail-weighted per **`fast_cat_value`** (count fallback if retail missing); manifest replaces AI; **Mixed lots** slice blends with AI when mapping is partial; sweep AI title estimate is **uncapped** and skips auctions that already have **`ai_category_estimates`**.
- **Services:** **`valuation`** (`recompute_auction_valuation` refreshes manifest mix when **`has_manifest`**, `recompute_all_open_auctions`, `compute_and_save_manifest_distribution`, `get_valuation_source`, `run_ai_estimate_for_swept_auctions`); **`ai_title_category_estimate`** (`estimate_batch`, **`AI_MODEL_FAST`**; **v2.15.3** — no `title_echo` verification, rows match via `auction_id`; taxonomy + rules + JSON schema in the **cached system block** padded past Haiku's 2048-token minimum for `cache_read` pricing; few-shot vendor examples drop rows where **Mixed lots & uncategorized ≥ 80%**); **`category_need`**; hooks after **`upload_manifest`**, **`map_one_fast_cat_batch`** when mapping queue clears, **`DELETE manifest`**; sweep runs AI estimate (no 25-cap) + full open-auction recompute. **`estimate_auction_categories`** has **`--missing-both`** (open/closing, no AI mix and no manifest mix) with default **500** cap (**`--limit`** overrides).
- **APIs:** **`GET /api/buying/category-need/`**; **`POST`/`DELETE …/thumbs-up/`** (Admin), **`PATCH …/valuation-inputs/`** (Admin); list **`ordering`** (e.g. **`-priority`**) and **`thumbs_up`** filter; list/detail serializers expose valuation fields (**`valuation_source`**, **`has_revenue_override`**, **`effective_revenue_after_shrink`**, etc.).
- **Commands:** **`estimate_auction_categories`**, **`recompute_buying_valuations`**.
- **Tests:** **`apps/buying/tests/test_valuation.py`**, **`apps/buying/tests/test_phase5_category_need.py`**.
- **React (v2.9.0):** **`/buying/auctions`** — valuation columns, filter chips + marketplace multi-select, category-need panel (desktop), watchlist row tint, stable pagination (**`keepPreviousData`**). **`/buying/auctions/:id`** — valuation card, overrides, AI vs manifest strip. **`GET /api/buying/watchlist/`** list filters extended (**`profitable`**, **`needed`**, **`thumbs_up`**) to match main list. **Token-backed** B-Stock calls from the **REST API** are **disabled** (`501` / `token_backed_bstock_disabled`) — **CSV upload** + soft-touch sweep; see **`apps/buying/api_views.py`**.

**Production inventory alignment:** Heroku **V3** holds backfilled **Item** / **PricingRule** / cost data (see **CHANGELOG** through **[2.12.0]**), so **category-need** and valuation inputs reflect live historical data where applicable. **B-Stock Phase 6** (outcome tracking) is next.

**UI/UX polish:** [`.ai/initiatives/ui_ux_polish.md`](initiatives/ui_ux_polish.md) — **Phase 1** (category-need windowing, **`CategoryNeedBars`**) and **Phase 2** (inventory/POS UX, lean PO list, Add Item taxonomy, AI fast defaults) shipped **v2.12.0**; **unfiltered** item list pagination **`count`** uses a **TTL cache** (`item_list_total_count`, 300s) to reduce large-table **`COUNT(*)`**.

---

## Codified decisions (engineering)

- **AI model default (inventory):** **`suggest_item`** and **`ai_cleanup_rows`** default to **`AI_MODEL_FAST`** (Haiku) — Bill decision, Phase 2 (`apps/inventory/views.py`).
- **Category retry:** **`suggest_item`** includes the canonical taxonomy list in the prompt; **one retry** if the model returns an invalid category; fallback to **Mixed lots & uncategorized**.
- **Caches (Django DB):** **`item_stats_global`** 300s (item stats aggregate) — TTL-only; **`item_list_total_count`** 300s (unfiltered item list pagination `count`) — TTL-only; **`category_need_panel`** 600s (`GET /api/buying/category-need/`) — **also explicitly deleted** when **`compute_daily_category_stats`** runs (otherwise TTL). **`suggest_item` / `ai_cleanup_rows`** use **`AI_MODEL_FAST`** per request — not cached in this table. Full metric/job/cache matrix: **`.ai/extended/backend.md`** — *Metrics, scheduled jobs, and caching*.
- **Consultant status board:** optional local notes (previously **`status_board.md`** under **`.ai/reference/`**, removed). Maintain a short “what’s active” block in chat or a personal file if useful.

---

## What is not implemented yet

**Phase 6 (outcomes):** hammer, fees, shipping, per-line results, outcome UI.

**Heroku Scheduler** (or a worker dyno) for production jobs may be partial; confirm deployment docs.

**Manual manifest upload** in the React UI (drag/drop) is **shipped** (**v2.7.0** with **4.1B** AI flows).

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
| **4.1A** | **`ManifestTemplate`**, CSV **`upload_manifest`**, **`fast_cat_key`** / **`fast_cat_value`**, **`seed_manifest_templates`** + **`seed_fast_cat_mappings`** (343 keys), unknown-template stub, **`create_test_auctions`**. **Done (v2.6.1).** E2E validated **2026-04**. |
| **4.1B** | AI template creation, AI key mapping, **`map_fast_cat_batch`**, **`DELETE manifest`**, usage logging, **`ManifestUploadProgress`**, **`__no_key__`** exclusion. **Done (v2.7.0).** |
| **5** | Auction valuation: **`PricingRule`**, **`valuation`** + AI title mix, need/want APIs, overrides, thumbs-up, serializers + hooks + commands + **React list/detail/category-need UI**. **Done (API v2.8.0, React v2.9.0).** |
| **6** | Outcome tracking. **Future.** |

The plan was **reordered** so the **frontend** lands before heavy backend-only intelligence, so the owner uses the product daily instead of only admin and SQL.

---

## Gotchas consultants should internalize

**Prices:** B-Stock often returns **money as integer cents** in API fields. **Dollar display** requires dividing by **100** where that convention applies. **Manifest line retail** in `normalize.py` uses **`_manifest_retail_to_dollars`** heuristics (explicit decimals vs integer minor units). Always validate against **raw JSON** when adjusting mappings.

**Manifest paging:** **`limit`** in requests does not increase page size — **10 rows per page** observed; large manifests **must** use **offset** pagination until **`total`**.

**Manifest path id:** Use **`lotId`** in **`order-process`** manifest URLs, not **`listingId`**.

**`has_manifest`:** The search payload may not include an explicit boolean. The app may infer interest from **`lotId`** presence and other hints.

**Public search:** `search.bstock.com` listings **GET or POST** **without auth** enables **scheduled discovery** on Heroku without storing a live JWT for sweeps only (**max `limit` 200** per request).

**JWE vs JWT:** See **Authentication** above. Wrong token type manifests as **400** on some services, not a clean **401**.

**Fast-cat seed coverage (Phase 4.1A):** The **343** **`seed_fast_cat_mappings`** keys are **not** exhaustive for every B-Stock category string. Rows still get a **`fast_cat_key`** when category columns parse; **`fast_cat_value`** is **null** if the key is absent from **`CategoryMapping`**. **Phase 4.1B** adds **Claude** mapping for unknown keys (**`rule_origin='ai'`**) and UI-driven batch completion.

**Wrong marketplace + `DELETE manifest`:** Removing manifest rows does **not** delete **`CategoryMapping`**; a CSV uploaded against the wrong marketplace can leave **AI** mappings with a misleading prefix — **`DELETE`** handler **TODO**; use admin review until tooling ships.

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

## Extended docs — `.ai/extended/` TOC

These are the domain deep-dive files that coding agents load on demand. Consultants do not normally read these directly (this file summarizes what you need), but the TOC is here so you know what exists and can request specific files if needed.

| File | Domain | Description |
|------|--------|-------------|
| `auth-and-roles.md` | Auth | JWT flow (httpOnly refresh + in-memory access), roles, permissions, password flows |
| `backend.md` | Backend | Django apps, models, serializers, API patterns, HR, AI proxy, management commands |
| `bstock.md` | Buying | B-Stock API surface, scraper (parallel POST sweep, optional SOCKS5), auth; endpoint map (no separate **`reference/`** research file in repo) |
| `cash-management.md` | POS | Cash drops, pickups, drawer reconciliation, safe counts |
| `consignment.md` | Consignment | Agreements, consignment items, payouts, consignee portal |
| `consultant_handoff.md` | AI / ops | Flat **`workspace/to_consultant/files-update/`** bundle; advisor drops |
| `databases.md` | Data | Three-generation DB overview (V1/V2/V3), `search_path`, Django test DB uses `public`, `.env` keys |
| `development.md` | Dev ops | Dev setup, scripts (`scripts/dev/daily_scheduled_tasks.bat`, `start_servers`, `kill_servers`), environment, logging, Heroku Scheduler vs local parity |
| `frontend.md` | Frontend | React 18.3 + TS + MUI v7, pages, components, routing, React Query hooks |
| `inventory-pipeline.md` | Inventory | PO processing, M3 pipeline, preprocessing, manifest templates, fast-cat |
| `pos-system.md` | POS | Registers, drawers, carts, transactions, terminal UI, receipt flow |
| `print-server.md` | Print | Local FastAPI print server — labels, receipts, drawer kick, Windows installer |
| `retag-operations.md` | Inventory | Retag v2 day-of and post-cutover ops; cleanup instructions for temp models |
| `ux-spec.md` | UI/UX | Design philosophy, color system, typography, spacing, interaction patterns, component specs — authoritative reference for all pages |
| `vpn-socks5.md` | Proxy / VPN | PIA SOCKS5 setup, `.env` keys, `socks5://` vs `socks5h://`, diagnostics, IP rotation, troubleshooting |

---

## Document maintenance

When APIs, phases, or shipped behavior change, update **this file** and the relevant **initiative files** together so advisors and implementers stay aligned. Prefer **density** (tables, tight bullets) over prose; avoid duplicating **`.ai/extended/`** verbatim—summarize what consultants must know.

**Extended docs TOC:** When a file is **added, renamed, or removed** in `.ai/extended/`, the TOC table above **and** the matching table in **`.ai/context.md`** must both be updated.

Session startup and context rules: **`.ai/protocols/startup.md`** (Audience: coding agent vs consultant), **`.ai/context.md`**.
