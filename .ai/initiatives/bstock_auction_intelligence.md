<!-- initiative: slug=bstock-auction-intelligence status=active updated=2026-04-10 -->
<!-- Last updated: 2026-04-10T18:45:00-05:00 -->
# Initiative: B-Stock auction intelligence (AI, scraping, learning)

**Status:** Active

**Predecessor:** Prior notebook scraper scope is documented in [`.ai/initiatives/_archived/_pending/bstock_scraper.md`](./_archived/_pending/bstock_scraper.md). The old [`workspace/notebooks/bstock-scraper/Scraper/`](../../workspace/notebooks/bstock-scraper/Scraper/) package is **historical reference only** for API discovery notes and endpoint patterns. Production logic lives in **`apps/buying/`**.

---

## Context

B-Stock auctions are time-sensitive: final price is often decided in the last seconds of an auction. The owner needs to discover and evaluate listings efficiently (AI-assisted triage), watch a narrowed set with fast refresh, and learn over time which vendor, category, and brand patterns correlate with resale value and margin.

**Architecture:** This work is a **new Django app** inside Eco-Thrift Dashboard, not a separate repo. Heroku runs the app 24/7; the owner has one home machine and no always-on local server. **Production behavior** (scraping orchestration, persistence, scheduled jobs) lives in **`apps/buying/`** with data in **Postgres**. **Notebooks** under `workspace/notebooks/bstock-intelligence/` (workbench) connect to the same database and call **`apps/buying/`** services or APIs for exploration and prompt iteration.

**Code today:** **`apps/buying/`** replaces the prior `Scraper/` package. Reference the old notebook package only for DevTools and HTTP patterns. Use the **RS256 JWT** from **`__NEXT_DATA__.props.pageProps.accessToken`** (or **`POST /api/buying/token/`** when **`DEBUG`**), not the **JWE** in the **`elt`** cookie. Manifest pull paginates until **`total`** manifest lines are stored.

**Priority:** **Phase 4** (fast categorization) is **complete**. **Phase 5** (auction valuation) is next.

---

## Objectives

1. **Daily-use dashboard:** auction browser, manifests, and watchlist in the React app so buying work happens in the product, not only in Django admin or pgAdmin. **Shipped (Phase 2).**
2. **Fresh watchlist data:** polling and **`AuctionSnapshot`** once the watchlist is visible and manageable in the UI. **Shipped (Phase 3).**
3. **Canonical categorization:** every manifest line tagged to **taxonomy_v1** (19 categories) via rules, targeted AI for new patterns, and auction-level fallback—with rules persisted and visible in the UI. **Shipped (Phase 4).**
4. **Auction valuation:** pluggable per-line and rollup estimates (revenue, costs, suggested max bid) grounded in real category economics, with UI on list and detail (**Phase 5**).
5. **Outcome truth:** record hammer, fees, shipping, and per-line results so future models have labeled data (**Phase 6**).

---

## Non-negotiables

- Do **not** automate login or bypass CAPTCHA or Cloudflare. No ToS-violating automation.
- **Throttle** requests; respect rate limits; prefer JSON endpoints observed in DevTools over brittle HTML scraping.
- Secrets and tokens live in **environment variables** (for example `.env` locally, Heroku config on production), read via **`django.conf.settings`**. Do not commit real tokens.
- **Scraping runs server-side** (management commands or service layer), never in the browser. The React UI stays read-heavy and trigger-light (for example "refresh this auction," "add to watchlist"). No Playwright or headless browsers in user-facing request cycles.

---

## Phased plan

Each phase delivers something usable.

### Phase 1: Foundation (Django app, data model, basic scraping) **done**

- Create **`apps/buying/`** with models: `Marketplace`, `Auction`, `AuctionSnapshot`, `ManifestRow`, `WatchlistEntry`, `Bid`, `Outcome`
- Scraping in **`apps/buying/services/scraper.py`**: `discover_auctions()`, `get_auction_detail(auction_id)`, `get_manifest(auction_id)` (manifest may be stubbed until DevTools capture)
- Management commands: **`python manage.py sweep_auctions`**, **`python manage.py pull_manifests`**
- No React frontend in Phase 1. Inspect via Django admin and notebooks.
- **Acceptance:** run both commands; auction and manifest data in Postgres; query from a notebook. **Done (v2.4.0):** sweep and manifest pull exercised across six marketplaces; **`workspace/.bstock_token`** or **`BSTOCK_AUTH_TOKEN`**; bookmarklet and **`POST /api/buying/token/`** documented.

### Phase 2: Frontend: auction browser and watchlist UI **done (v2.4.1 + v2.5.0)**

Highest-value deliverable: see auctions, dig into manifests, and mark auctions to watch from the React dashboard.

**Status:** Phase **2A**, **2B**, and **2C** are **complete**. Phase 2A shipped in **v2.4.1**; Phase 2B, 2C, and manifest normalization ship in **v2.5.0**.

**2A: Auction list page** (`/buying/auctions`) — **done (2026-04-08T12:00:00-05:00; v2.4.1)**

- MUI DataGrid (desktop, `md+`) and card list with infinite scroll (mobile); shared filters and ordering
- Columns include marketplace, title, current price, total retail, bid count, time remaining, lot size, condition, status, has manifest
- Filters: **marketplace chip toggles** (comma-separated slug filter; global summary counts for chip labels), status, has manifest
- Sortable server-side; mobile sort dropdown
- Time remaining: color rules (≤1h warning, ≤15m error); mobile row accent (border + tint) for urgency
- Row / card tap navigates to auction detail (`/buying/auctions/:id`)
- **Refresh auctions:** sequential **`POST /api/buying/sweep/?marketplace=`** per active marketplace with progress; failures do not abort the whole run
- Sidebar **Buying** section

**2B: Auction detail page** (`/buying/auctions/:id`) — **done (2026-04-08T20:00:00-05:00; v2.5.0)**

- **DRF:** `GET /api/buying/auctions/{id}/` (detail includes `lot_id`, prices, `watchlist_entry`, `manifest_row_count`); `GET …/manifest_rows/` (server pagination, **50** per page); `POST …/pull_manifest/`; `POST` / `DELETE …/watchlist/` (POST idempotent **200**; DELETE always **204**)
- **UI:** `AuctionDetailPage` — metadata + manifest layout (see **v2.6.1** for two-column summary card + manifest card with CSV drop zone and **Open on B-Stock**); watchlist **star** toggle
- **Manifest:** desktop **`md+`** — MUI **DataGrid** with **`paginationMode="server"`**; below **`md`** — cards + **Load more** (same paged API). **v2.6.1+:** optional **`search`** / **`category`** query params on manifest rows.
- **Primary manifest path (production):** **CSV upload** via UI (`POST …/upload_manifest/`). **Pull manifest** (JWT) when **`manifest_row_count === 0`** and **`lot_id`** present remains for dev; **401** inline alerts for `bstock_token_missing` / `bstock_token_expired`; **400** when `lot_id` missing (button disabled + tooltip)
- **Manifest field mapping:** `apps/buying/services/normalize.py` maps order-process JSON (nested **`attributes`**, **`attributes.ids`**, **`uniqueIds`**, **`categories`**, **`itemCondition`**, etc.) onto `ManifestRow` columns; full line items remain in **`raw_data`**. After changing heuristics, re-apply without B-Stock JWT: **`python manage.py renormalize_manifest_rows`** (optional `--auction-id`, `--marketplace`, `--limit`, `--dry-run`).

**2C: Watchlist page** (`/buying/watchlist`) — **done (2026-04-08T20:00:00-05:00; v2.5.0)**

- **DRF:** **`GET /api/buying/watchlist/`** — same auction list serializer shape with nested **`watchlist_entry`**; filters **`priority`**, **`watchlist_status`**; ordering **`end_time`** (default ascending), **`current_price`**, **`total_retail_value`**, **`added_at`**
- **UI:** desktop **DataGrid** + mobile card list; **Remove from watchlist** per row; row navigates to auction detail
- Filters for **priority** and **watchlist status** (chip / select UX); **not** inline edit of priority or status on this page (deferred if product wants spreadsheet-style editing later)
- **No** sidebar badge count for active watchlist entries (deferred)

**Backend for Phase 2 (shipped)**

- DRF: auctions list (filters), auction detail, manifest rows, pull manifest, watchlist add/remove, **watchlist collection**
- **`POST /api/buying/sweep/`** runs discovery in the request cycle for now
- **`POST /api/buying/auctions/{id}/pull_manifest/`** for one auction
- Serializers: **`Auction`** (with marketplace name), **`ManifestRow`**, **`WatchlistEntry`**, **`AuctionWatchlistListSerializer`**
- Match patterns from inventory, POS, and other apps (serializers, URLs, React Query hooks)

### Phase 3: Watchlist polling and price tracking **done**

After the watchlist exists in the UI, keep data fresh.

- **`python manage.py watch_auctions`**: polls watchlisted auctions at a configurable interval; writes **`AuctionSnapshot`**
- Price history on auction detail (small chart or table)
- Auto-close: when an auction ends, update **`Auction`** and watchlist entry
- **`GET /api/buying/auctions/{id}/snapshots/`**
- Document minimum safe polling interval and rate limits

**Acceptance:** watchlist polling command exists and writes snapshots; price history visible on auction detail; polling behavior and limits documented in extended backend context.

### Phase 4: Fast categorization pipeline **done**

Every manifest row gets tagged with one of **19 canonical categories** (**taxonomy_v1**). Three-tier hierarchy:

- **Direct match (tier 1):** `ManifestRow.category.strip()` → **`CategoryMapping.source_key`** (global; seeded from `cr/taxonomy_estimate.py` via **`seed_category_mappings`**).
- **AI-assisted mapping (tier 2):** optional **`python manage.py categorize_manifests --ai`** — Claude proposes a canonical name for unknown header strings; **`--ai-limit`** (default 10) caps API calls per run.
- **Auction-level fallback (tier 3):** if tier 1 misses, try **`CategoryMapping`** on **`Auction.category`** (full string, then comma-separated segments); else **`Mixed lots & uncategorized`** with **`fallback`** confidence. Tier 3 does **not** reuse manifest heuristics on listing text beyond this lookup.

**Automatic:** after **`pull_manifest`** saves rows, **`categorize_manifest_rows`** runs (tier 1 + 3 only, no AI).

**Manifest retail normalization:** `normalize.py` maps unit/extended retail to dollars; integer minor units (cents) are converted where the heuristic applies. **`renormalize_manifest_rows`** reapplies normalization after fixes.

**Acceptance:** `CategoryMapping` + `ManifestRow.canonical_category` / `category_confidence` migrated; seed + categorize commands exist; auction detail API exposes **`category_distribution`**; manifest UI shows canonical chips and a **horizontal category mix** bar (**all** categories + not yet categorized); retail display corrected for cents vs dollars where applicable.

### Phase 4.1A: Manifest templates and `fast_cat_key` **done**

- **`ManifestTemplate`** (per marketplace + CSV header signature): column mapping and **`fast_cat_key`** composition rules.
- **Staff CSV upload:** **`POST /api/buying/auctions/{id}/upload_manifest/`** replaces manifest rows; sets **`has_manifest`** on success.
- **Static seed:** **`python manage.py seed_fast_cat_mappings`** — 343 consultant-reviewed `source_key` → `canonical_category` rows (Amazon/Target/Walmart), fully inlined in the command module.
- **UI:** Auction list/detail polish (sortable columns, retail source, marketplace chips, two-column detail layout, manifest search/filter, refetch on return to list) — **v2.6.1**.

### Phase 5: Auction valuation scaffold

**Per-line** estimated sale price on **`ManifestRow`**. **Auction-level rollup:** projected revenue, estimated costs, **suggested max bid**. Pricing function is **pluggable**: **v1** uses category-level **`avg_margin`** from **Bin 2** sell-through analysis (real data, not a flat guess). **Pricing rules** stored in a database table (category, margin rate, avg sale price, sample size, version date). **Bid calculator:** `projected_revenue` vs **total cost** (bid + fees + shipping + shrinkage estimate). **UI** shows valuation on **auction detail** and **summary on auction list**. When a better scoring model exists later, it **swaps into the same interface**.

### Phase 6: Outcome tracking

Record what actually happened: **hammer price**, **fees**, **shipping**, **per-item sale prices**, **shrinkage**. **Manual entry** and/or **API capture** where possible. Define the **schema** for outcome data that feeds future model building. **Surface outcomes** in the UI tied to auctions.

### Operational notes (B-Stock ingestion)

- **Two sweep modes:** **Soft touch** (default) uses the **public listings API only**, requires **no JWT**, and is safe for scheduled or frequent use. **Invasive** (manual approval) uses **token-backed** endpoints (manifests, auction detail enrichment) and should only run when the owner intends to bid on specific auctions.
- **Manual manifest path:** For production and Heroku, manifests are obtained by **manual download** from B-Stock and **upload via UI drag/drop** (**shipped** — **v2.6.1** / Phase 4.1A). Server-side manifest pull remains available for **local dev** but is **not** the default production workflow. This reduces token exposure and ban risk.
- **Ban mitigation:** If B-Stock blocks token-backed actions, the soft-touch sweep continues to work. **Rate limits**, **backoff on 429/403**, and **logging of response codes** should be standard. A detailed ops playbook can be added to open questions or a separate operations doc when needed.

---

## Acceptance (initiative level)

- [x] **Phase 1 complete:** sweep and manifest commands work; data in Postgres; token workflow documented
- [x] **Phase 2 complete:** React pages for auction list, auction detail with manifests, and watchlist; API endpoints for all three; sweep and manifest pull triggerable from UI
- [x] **Phase 3 complete:** watchlist polling produces time-series snapshots; price history visible in UI; rate limits documented
- [x] **Phase 4 complete:** manifest rows carry canonical category from taxonomy_v1; rules persisted; categorization command; category on rows in UI; distribution summary on auction detail; manifest retail cents/dollars normalization applied
- [ ] **Phase 5 complete:** per-line and auction rollup valuation in UI; pricing rules table; pluggable v1 margin path from Bin 2; list + detail surfaces
- [ ] **Phase 6 complete:** outcome schema implemented; hammer/fees/shipping/per-line outcomes capturable; outcomes visible in UI per auction

---

## Open questions

- Which **outcome labels** are authoritative (hammer from API vs internal POS after receipt)?
- **Retention:** how long to store raw pulls; privacy and disk.
- **Scraping from Heroku IP ranges:** if B-Stock blocks server IPs, options include a proxy or a **local push to API** pattern where the owner's machine posts captures into production endpoints.
- **Background work:** **Heroku Scheduler** (cron-like, simple) vs a **worker dyno** (more flexible, higher cost). Revisit when implementing watchlist polling and sweep triggers at scale.
- **`avg_days_to_sell`** did not populate in **Bin 2** extracts. **Timestamp join** needs investigation before days-to-sell can feed any model.
- **B-Stock ban/block risk:** the account was temporarily blocked during development. Soft-touch mode (listings-only, no JWT) appears unaffected. Token-backed calls (manifests, auction enrichment) are the risk surface. Investigate whether limits are per-account, per-IP, or per-token. Document minimum safe intervals for token-backed calls.
- Retrospective validation (comparing estimates to actuals, MAE by category) is deferred until outcome data exists. It may become part of a future scoring model initiative or an appendix to Phase 6.

---

## Future ideas (logged, not scoped)

- **AI-enhanced item processing row:** when an item enters the processing pipeline, send the standardized manifest row to AI for improved title, brand, model, notes, better canonical category assignment, retail value confidence check, and price recommendation. Multiple price estimate inputs: retail multiplied by category average sale price, modeled estimates (pluggable scoring models), cost-based estimate (minimum margin requirement based on acquisition cost). AI makes the final pricing decision from all inputs.
- **Dynamic pricing throttle:** admin-level setting to steer pricing appetite globally or by category. Examples: "price toys to sell fast this month", "summer closeout: mark down summer items X% even if below cost-required price." Overrides the default pricing logic when set.
- **Multiple valuation models:** ability to build, register, and run many scoring models in parallel. AI or rules pick the final price from multiple model outputs. Supports A/B testing of pricing strategies.
- **Cost-based pricing input:** "I need to make X on this item based on what I spent" as one of several pricing inputs fed to the final price decision.
- **Fast-cat accuracy tracking:** compare `fast_cat_value` (assigned at manifest ingestion) to `canonical_category` (assigned during item processing) over time. Use the delta to measure fast-cat quality, identify weak mappings, and improve template rules and AI prompts.
- **Two-category architecture:** `fast_cat_value` is what you know at bid time (used for auction valuation and scoring models). `canonical_category` is the real category assigned during item processing (used for merchandising, shelf placement, and outcome analysis). Models must train on `fast_cat_value` to avoid information leakage from future data.

---

## See also

- **`apps/buying/`** (Django app; production logic)
- [`.ai/initiatives/_archived/_pending/bstock_scraper.md`](./_archived/_pending/bstock_scraper.md) (archived API notes)
- [`workspace/notebooks/bstock-scraper/Scraper/`](../../workspace/notebooks/bstock-scraper/Scraper/) (historical reference for discovery only)
- [`workspace/notebooks/_shared/README.md`](../../workspace/notebooks/_shared/README.md) (notebook DB access)
- [`.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md`](./_archived/_completed/category_sales_inventory_and_taxonomy.md) (related learning pattern)
- **Future:** Scoring model initiative (data science project to replace v1 category-margin pricing with a trained model; depends on outcome data from **Phase 6**).

---

*Parent: [`.ai/initiatives/_index.md`](./_index.md).*
