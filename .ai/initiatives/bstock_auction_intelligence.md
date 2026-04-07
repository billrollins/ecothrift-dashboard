<!-- initiative: slug=bstock-auction-intelligence status=active updated=2026-04-07 -->
<!-- Last updated: 2026-04-07T23:00:00-05:00 -->
# Initiative: B-Stock auction intelligence (AI, scraping, learning)

**Status:** Active

**Predecessor:** Prior notebook scraper scope is documented in [`.ai/initiatives/_archived/_pending/bstock_scraper.md`](./_archived/_pending/bstock_scraper.md). The old [`workspace/notebooks/bstock-scraper/Scraper/`](../../workspace/notebooks/bstock-scraper/Scraper/) package is **historical reference only** for API discovery notes and endpoint patterns. Production logic lives in **`apps/buying/`**.

---

## Context

B-Stock auctions are time-sensitive: final price is often decided in the last seconds of an auction. The owner needs to discover and evaluate listings efficiently (AI-assisted triage), watch a narrowed set with fast refresh, and learn over time which vendor, category, and brand patterns correlate with resale value and margin.

**Architecture:** This work is a **new Django app** inside Eco-Thrift Dashboard, not a separate repo. Heroku runs the app 24/7; the owner has one home machine and no always-on local server. **Production behavior** (scraping orchestration, persistence, scheduled jobs) lives in **`apps/buying/`** with data in **Postgres**. **Notebooks** under `workspace/notebooks/bstock-intelligence/` (workbench) connect to the same database and call **`apps/buying/`** services or APIs for exploration and prompt iteration.

**Code today:** **`apps/buying/`** replaces the prior `Scraper/` package. Reference the old notebook package only for DevTools and HTTP patterns. Use the **RS256 JWT** from **`__NEXT_DATA__.props.pageProps.accessToken`** (or **`POST /api/buying/token/`** when **`DEBUG`**), not the **JWE** in the **`elt`** cookie. Manifest pull paginates until **`total`** manifest lines are stored.

---

## Objectives

1. **Automate auction viewing and evaluation** using **server-side** scraping and orchestration, **AI** (Phase 3), and **notebooks** for exploration. The Django app owns ingestion; notebooks own ad hoc analysis and prompt tuning.
2. **Near real-time updates for watchlisted auctions** (Phase 2): polling and snapshots so price and time remaining stay usable in the final moments, within API limits.
3. **Learn from manifests** as they are reviewed and tied to outcomes: structured memory (vendor, category, brand, and other features) toward value bands and confidence.
4. **Decision support:** likely end bid or band (with uncertainty), and retrospective feedback on what was a good bid or pass (Phase 5).

---

## Non-negotiables

- Do **not** automate login or bypass CAPTCHA or Cloudflare. No ToS-violating automation.
- **Throttle** requests; respect rate limits; prefer JSON endpoints observed in DevTools over brittle HTML scraping.
- Secrets and tokens live in **environment variables** (for example `.env` locally, Heroku config on production), read via **`django.conf.settings`**. Do not commit real tokens.
- **Scraping runs server-side** (management commands or service layer), never in the browser. The React UI stays read-heavy and trigger-light (for example "refresh this auction," "add to watchlist"). No Playwright or headless browsers in user-facing request cycles.

---

## Phased plan

Each phase delivers something usable.

### Phase 1: Foundation (Django app, data model, basic scraping)

- Create **`apps/buying/`** with models: `Marketplace`, `Auction`, `AuctionSnapshot`, `ManifestRow`, `WatchlistEntry`, `Bid`, `Outcome`
- Scraping in **`apps/buying/services/scraper.py`**: `discover_auctions()`, `get_auction_detail(auction_id)`, `get_manifest(auction_id)` (manifest may be stubbed until DevTools capture)
- Management commands: **`python manage.py sweep_auctions`**, **`python manage.py pull_manifests`**
- No React frontend in Phase 1. Inspect via Django admin and notebooks.
- **Acceptance:** run both commands; auction and manifest data in Postgres; query from a notebook. **Done (v2.4.0):** sweep and manifest pull exercised across six marketplaces; **`workspace/.bstock_token`** or **`BSTOCK_AUTH_TOKEN`**; bookmarklet and **`POST /api/buying/token/`** documented.

### Phase 2: Watchlist and polling

- `WatchlistEntry` with status (watching, bidding, closed) and priority
- **`python manage.py watch_auctions`**: polls watchlisted auctions at a configurable interval; writes **`AuctionSnapshot`** (price, bid count, time remaining)
- Document minimum safe polling interval and observed latency
- Simple API: list watchlist, add/remove
- Optional: basic React watchlist page (read-only)
- **Acceptance:** watch 3 to 5 auctions for 15+ minutes; price history in the database; rate limits documented.

### Phase 3: AI evaluation

- **`apps/buying/services/scoring.py`**: prompt templates; Claude returns structured JSON (score, risk flags, value band, recommendation)
- **`python manage.py score_auctions`**: score unwatched or unscored auctions from the latest sweep
- Store scores on **`Auction`** or **`AuctionScore`**
- Notebook for prompt iteration
- **Acceptance:** score 10+ auctions; review outputs in a notebook.

### Phase 4: Outcome tracking and learning baseline

- **`Outcome`**: hammer, fees, shipping, win or loss, bid amount
- Manual or API outcome entry; **`python manage.py capture_outcomes`** for closed auctions
- Learning baseline: grouped medians by (vendor, category, brand) with sample size (`LearningAggregate` or Parquet export)
- Notebook: estimated end bid from nearest band
- **Acceptance:** feature-outcome join for a historical batch; band estimates with confidence indicators.

### Phase 5: Retrospective and decision logging

- **`Bid`** extended with strategy tags (early_max, incremental, snipe, pass)
- Post-hoc comparison: prediction vs actual, margin analysis
- Notebook-driven good or bad analysis with Claude explanations
- Metrics: MAE, hit rate within band, win rate by strategy
- **Acceptance:** retrospective report for a batch with labeled decisions.

### Phase 6: Frontend (deferred)

- React: auction list with scores, watchlist, outcome review, learning dashboard
- Plan in detail only after Phases 1 to 3 are solid.

---

## Acceptance (initiative level)

- [x] **Phase 1 complete:** `sweep_auctions` and `pull_manifests` work end to end; data in Postgres; token workflow documented (bookmarklet + **`POST /api/buying/token/`**). Evidence: full sweep across **6** marketplaces; manifest pull with pagination (per-listing limits; see **`CHANGELOG.md`** **[2.4.0]** baseline); token path documented in **`apps/buying/bookmarklet/bstock_elt_bookmarklet.md`** and **`bstock_token`** / **`POST /api/buying/token/`**.
- [ ] **Phase 2 complete:** watchlist polling produces time-series snapshots; rate limits documented
- [ ] **Phase 3 complete:** AI scoring pipeline produces structured evaluations for a batch
- [ ] **Phase 4 complete:** outcome data captured; grouped-median baseline produces band estimates
- [ ] **Phase 5 complete:** retrospective analysis with labeled decisions and explanations

---

## Open questions

- Which **outcome labels** are authoritative (hammer from API vs internal POS after receipt)?
- **Retention:** how long to store raw pulls; privacy and disk.
- **Scraping from Heroku IP ranges:** if B-Stock blocks server IPs, options include a proxy or a **local push to API** pattern where the owner's machine posts captures into production endpoints.
- **Background work:** **Heroku Scheduler** (cron-like, simple) vs a **worker dyno** (more flexible, higher cost). Revisit after Phase 1 when polling requirements are clearer.

---

## See also

- **`apps/buying/`** (Django app; production logic)
- [`.ai/initiatives/_archived/_pending/bstock_scraper.md`](./_archived/_pending/bstock_scraper.md) (archived API notes)
- [`workspace/notebooks/bstock-scraper/Scraper/`](../../workspace/notebooks/bstock-scraper/Scraper/) (historical reference for discovery only)
- [`workspace/notebooks/_shared/README.md`](../../workspace/notebooks/_shared/README.md) (notebook DB access)
- [`.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md`](./_archived/_completed/category_sales_inventory_and_taxonomy.md) (related learning pattern)

---

*Parent: [`.ai/initiatives/_index.md`](./_index.md).*
