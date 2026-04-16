<!-- initiative: slug=bstock-auction-intelligence status=active updated=2026-04-16 -->
<!-- Last updated: 2026-04-16T20:30:00-05:00 (paths: notebooks + AI log tooling) -->
# Initiative: B-Stock auction intelligence (AI, scraping, learning)

**Status:** Active

**Predecessor:** Prior notebook scraper scope is documented in [`.ai/initiatives/_archived/_pending/bstock_scraper.md`](./_archived/_pending/bstock_scraper.md). The old [`workspace/notebooks/bstock-scraper/Scraper/`](../../workspace/notebooks/bstock-scraper/Scraper/) package is **historical reference only** for API discovery notes and endpoint patterns. Production logic lives in **`apps/buying/`**.

---

## Context

B-Stock auctions are time-sensitive: final price is often decided in the last seconds of an auction. The owner needs to discover and evaluate listings efficiently (AI-assisted triage), watch a narrowed set with fast refresh, and learn over time which vendor, category, and brand patterns correlate with resale value and margin.

**Architecture:** This work is a **new Django app** inside Eco-Thrift Dashboard, not a separate repo. Heroku runs the app 24/7; the owner has one home machine and no always-on local server. **Production behavior** (scraping orchestration, persistence, scheduled jobs) lives in **`apps/buying/`** with data in **Postgres**. **Notebooks** under **`workspace/notebooks/`** (e.g. **`category-research/`**, **`historical-data/`**, **`bstock-scraper/`**) are an optional local workbench — not required for production.

**Code today:** **`apps/buying/`** replaces the prior `Scraper/` package. Reference the old notebook package only for DevTools and HTTP patterns. Use the **RS256 JWT** from **`__NEXT_DATA__.props.pageProps.accessToken`** (or **`POST /api/buying/token/`** when **`DEBUG`**), not the **JWE** in the **`elt`** cookie. Manifest pull paginates until **`total`** manifest lines are stored.

**Priority:** **Phases 1–4** and **4.1A–4.1B** are **complete** (**v2.7.0**). **Phase 5** (auction valuation — API, services, seeds, hooks, **React list/detail/category-need UI**) is **complete** on production (**v2.8.0** API + **v2.9.0** frontend); **V3** backfill data (inventory, sales, categories, cost pipeline, `Item.retail_value`) is deployed to **Heroku** so category-need and buying panels reflect live data. **Phase 6** (outcome tracking) is next.

---

## Objectives

1. **Daily-use dashboard:** auction browser, manifests, and watchlist in the React app so buying work happens in the product, not only in Django admin or pgAdmin. **Shipped (Phase 2).**
2. **Fresh watchlist data:** polling and **`AuctionSnapshot`** once the watchlist is visible and manageable in the UI. **Shipped (Phase 3).**
3. **Canonical categorization:** every manifest line tagged to **taxonomy_v1** (19 categories) via rules, targeted AI for new patterns, and auction-level fallback—with rules persisted and visible in the UI. **Shipped (Phase 4).**
4. **Auction valuation:** category mix × **`PricingRule.sell_through_rate`** rollup (estimated revenue, fees/shipping/cost, shrinkage, profitability, need score, priority), staff overrides, AI title–category estimates when no manifest mix — **API and server recompute shipped (Phase 5)**; **React** list/detail/category-need **valuation UI shipped (v2.9.0)**.
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
- **UI:** `AuctionDetailPage` — section labels **Auction Details** / **Manifest**; **auction title** + optional **View on B-Stock** icon (listing URL); **marketplace** chip in metadata card; two-column **metadata** | **manifest** (CSV drop / replace, **Choose file**, **Download from B-Stock** when empty); watchlist **star** toggle (**v2.6.1**)
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

**Acceptance:** `CategoryMapping` + `ManifestRow.canonical_category` / `category_confidence` migrated; seed + categorize commands exist; auction detail API exposes **`category_distribution`**; manifest UI shows canonical chips and a **category mix** stacked bar + **wrapping** legend (**all** categories + not yet categorized; **v2.6.1+** uses distinct colors per taxonomy category in **`frontend/src/constants/taxonomyV1.ts`**); retail display corrected for cents vs dollars where applicable.

### Phase 4.1A: Manifest templates and `fast_cat_key` **done** (manual validation 2026-04)

- **`ManifestTemplate`** (per marketplace + CSV header signature): **`column_map`**, **`category_fields`**, **`is_reviewed`**, and **`fast_cat_key`** composition via **`build_fast_cat_key`**. **`python manage.py seed_manifest_templates`** seeds **four** reviewed templates (Target 17-col, Walmart 13-col, Amazon 16-col, Amazon 17-col with Pallet ID) (DEBUG or **`--force`**).
- **Staff CSV upload:** **`POST /api/buying/auctions/{id}/upload_manifest/`** (multipart **`file`**) replaces manifest rows; sets **`has_manifest`**; populates **`fast_cat_key`** / **`fast_cat_value`** and **`category_confidence`** = **`fast_cat`** when the key hits **`CategoryMapping`**. Unknown headers: **HTTP 400**, **`code=unknown_template`**, **stub** **`ManifestTemplate`** for admin; unreviewed template match returns **`template_not_reviewed`**. Upload path does **not** run **`categorize_manifest_rows`** (canonical tiers remain separate from fast-cat lookup).
- **Static seed:** **`python manage.py seed_fast_cat_mappings`** — **343** consultant-reviewed keys (inlined). Coverage is **intentionally** from three source manifests (Target **beauty**-heavy, Walmart general merch, Amazon mixed home/toys) — vendor paths outside that set (e.g. Target **electronics** keys) may yield **0** **`fast_cat_value`** until **Phase 4.1B** expands mappings — **not** an upload bug.
- **Local testing:** **`python manage.py create_test_auctions`** — creates/updates **10** placeholder auctions (seeded + unseeded marketplaces) for CSV matrix testing **without** B-Stock API calls.
- **API:** Auction detail may include **`manifest_template_name`**; list/detail retail annotations and manifest_rows **`search`** / **`category`** (see **`CHANGELOG`** **[2.6.1]**).
- **UI (v2.6.1):** Auction list — sortable grid, retail source tooltips, marketplace chip filters, **refetchOnMount** when returning from detail. Auction detail — two-column layout, **Category Mix** bar + **wrapping** legend; **Manifest Rows** with search + fast-category filter; CSV drop zone. **Steering:** [`.ai/consultant_context.md`](../consultant_context.md); [`.ai/extended/frontend.md`](../extended/frontend.md) / [`backend.md`](../extended/backend.md).

**Manual validation (2026-04):** Five seeded vendor CSVs uploaded successfully (full **`fast_cat_value`** coverage on beauty/general/mixed manifests; one Target electronics file produced keys with **0** seed hits — expected gap before AI expansion). One **unseeded** vendor (Costco) returned **400** with stub message prior to **4.1B** AI template path.

### Phase 4.1B: AI template creation, AI key mapping, upload UX **done** (v2.7.0; validated 2026-04)

- **AI template creation:** Unknown CSV headers → Claude proposes **`column_map`** and **`category_fields`** via **`apps/buying/services/ai_manifest_template.py`** (`propose_manifest_template_with_ai`); **`ManifestTemplate`** saved with **`is_reviewed=True`**; upload continues in one request flow.
- **AI key mapping:** Unmapped **`fast_cat_key`** values batched (**10** per **`POST /api/buying/auctions/{id}/map_fast_cat_batch/`**); **`apps/buying/services/ai_key_mapping.py`** (`map_one_fast_cat_batch`); new **`CategoryMapping`** rows with **`rule_origin='ai'`**; **`ManifestRow.fast_cat_value`** updated. **`__no_key__`** sentinels (no category fields) excluded from batches and counts.
- **Upload split:** Stage **1** — **`POST …/upload_manifest/`** returns **`unmapped_key_count`**, **`total_batches`**. Stage **2** — browser drives concurrent workers calling **`map_fast_cat_batch`** until complete or cancel.
- **Other API:** **`DELETE /api/buying/auctions/{id}/manifest/`** — deletes **`ManifestRow`** only; templates and **`CategoryMapping`** preserved. TODO on **`DELETE`** for wrong-marketplace stale AI prefixes (admin tooling later).
- **AI usage logging:** **`workspace/logs/ai_usage.jsonl`**; four token fields + **Decimal** cost from **`AI_PRICING`**; inspect JSONL locally (summarize helper not committed).
- **Settings:** **`AI_MODEL`**, **`AI_MODEL_FAST`**, **`AI_PRICING`**; **`BUYING_CATEGORY_AI_MODEL`** → **`AI_MODEL`**; **`cache_control`** on system prompts.
- **Frontend:** **`ManifestUploadProgress`**; **four** workers; progress, est. cost, latest mapping, cancel; debounced query invalidation (~**1** s); remove manifest in card; drop/replace hidden during **MAPPING**; flex column height alignment.

**Manual validation (2026-04):** Five seeded CSVs instant upload / seed mapping; five unseeded CSVs (Costco, Home Depot, Wayfair, Essendant, Amazon 20-col) — AI template + AI key mapping successful; cancel mid-mapping preserves partial categories; remove manifest + re-upload reuses templates/mappings; total test cost ~**$0.72** across **51** AI calls. **Known:** prompt cache hit rate ~**0** (under **2048**-token threshold); **`DELETE manifest`** wrong-marketplace TODO — documented, not blocking.

### Phase 5: Auction valuation **done (API + services; 2026-04)**

**Pricing rules:** Flat **`PricingRule`** rows (one per taxonomy_v1 category) with **`sell_through_rate`**; seed from **`workspace/data/sell_through_by_category.csv`** via **`python manage.py seed_pricing_rules`** (also sets **`AppSetting`** keys: **`pricing_shrinkage_factor`**, **`pricing_profit_factor`**, **`pricing_need_window_days`**, **`buying_want_vote_decay_per_day`**). **`python manage.py seed_marketplace_pricing_defaults`** — marketplace fee/shipping fractions.

**Mix source:** **`manifest_category_distribution`** (counts of **`ManifestRow.fast_cat_value`**, null → Mixed lots) when present; else **`ai_category_estimates`** from **`apps/buying/services/ai_title_category_estimate.py`** (**`estimate_batch`**, **`AI_MODEL_FAST`**, few-shot from same marketplace). **`get_valuation_source`** → `manifest` | `ai` | `none`.

**Rollup:** **`apps/buying/services/valuation.py`** — **`recompute_auction_valuation`**, **`recompute_all_open_auctions`**; retail base = manifest retail sum when **`has_manifest`** and sum &gt; 0 else **`total_retail_value`**; revenue = sumproduct(mix × sell-through); fees/shipping from **`fees_override`** / **`shipping_override`** or marketplace default rates × **`current_price`**; **`profitability_ratio`**, **`need_score`** (category need × mean effective want), **`priority`** 1–99 (formula unless **`priority_override`**).

**Triggers:** After **`upload_manifest`** (and when **`unmapped_key_count == 0`**), after **`map_fast_cat_batch`** when no keys remain, after **`DELETE …/manifest/`**; **`POST /api/buying/sweep/`** runs a **limited** AI estimate batch for swept auctions without manifest mix then **`recompute_all_open_auctions`**.

**Staff APIs:** **`GET /api/buying/category-need/`**, **`GET`/`POST /api/buying/category-want/`**; **`POST`/`DELETE …/thumbs-up/`** (Admin); **`PATCH …/valuation-inputs/`** (Admin). List: **`ordering`**, **`thumbs_up`** filter. Commands: **`estimate_auction_categories`**, **`recompute_buying_valuations`**.

**React UI (v2.9.0):** auction list **DataGrid** — profitability/need pills, est. revenue, priority steppers (Admin), thumbs toggle, time colors, filter chips + marketplace multi-select, watchlist tint, stable server pagination (`keepPreviousData`); **category need panel** (Min/Window/Full, bars, want vote); **auction detail** — valuation card, overrides, AI vs manifest strip, max bid line.

**Design decisions (locked in code and docs):**

- **Sell-through:** Flat **19** taxonomy **`sell_through_rate`** values only — **`PricingRule`** is one row per category (**no** vendor × category matrix). **`PricingRule`** shape is unchanged from that design (no extra dimensions).
- **Revenue override:** **`revenue_override`** is a **USD** amount (not a sell-through or rate override). **Effective revenue** for margin math uses **`revenue_override` if set, else `estimated_revenue`** (`coalesce`), then **global shrinkage** applies. **`estimated_revenue`** is always the **pre-shrinkage** rollup from mix × rates × retail base.
- **Fees / shipping overrides:** **`fees_override`** and **`shipping_override`** are **nullable USD** amounts only (**no** percentage toggle on overrides). When null, **`estimated_fees`** / **`estimated_shipping`** use **`Marketplace`** default **fractions** × **`current_price`**.
- **Profitability:** **`profitability_ratio`** compares **effective revenue after shrinkage** to **`estimated_total_cost`** (hammer + fees + shipping).
- **Valuation mix precedence / build order:** **`manifest_category_distribution`** (retail share of **`ManifestRow.retail_value`** per **`fast_cat_value`**, row-count fallback when retail is all null/zero) is used when present; **`ai_category_estimates`** only when there is no manifest mix. While fast-cat mapping is incomplete, the **Mixed lots & uncategorized** portion is **redistributed** using the AI title mix so **`need_score`** (SUMPRODUCT) reflects known rows plus AI for the unmapped share. **Implementation order** — manifest distribution plumbing (**`compute_and_save_manifest_distribution`**, upload hooks) before the AI title–category estimate path (**`estimate_batch`** / sweep batch); sweep AI is uncapped and skips auctions that already have AI estimates.

### Phase 6: Outcome tracking

Record what actually happened: **hammer price**, **fees**, **shipping**, **per-item sale prices**, **shrinkage**. **Manual entry** and/or **API capture** where possible. Define the **schema** for outcome data that feeds future model building. **Surface outcomes** in the UI tied to auctions.

### Operational notes (B-Stock ingestion)

- **Two sweep modes:** **Soft touch** (default) uses the **public listings API only**, requires **no JWT**, and is safe for scheduled or frequent use. **Invasive** (manual approval) uses **token-backed** endpoints (manifests, auction detail enrichment) and should only run when the owner intends to bid on specific auctions.
- **Manual manifest path:** For production and Heroku, manifests are obtained by **manual download** from B-Stock and **upload via UI drag/drop** (**shipped** — **v2.6.1** / Phase 4.1A). Server-side manifest pull remains available for **local dev** but is **not** the default production workflow. This reduces token exposure and ban risk.
- **Ban mitigation:** If B-Stock blocks token-backed actions, the soft-touch sweep continues to work. **Rate limits**, **backoff on 429/403**, and **logging of response codes** should be standard. A detailed ops playbook can be added to open questions or a separate operations doc when needed.

---

## Sessions

_Session ID:_ count `### Session` headers below and add 1 for the next session. Keep full detail for the **3** most recent sessions; when starting session 4, collapse session 1 to one line (see **`.ai/initiatives/docs_restructure.md`** template if needed).

- **Session 1** — 2026-04-07T09:15:00-05:00 — Phase 1 — est 2h — `apps/buying/` scaffold, initial models + migrations, admin registration — **Result:** committed as v2.4.0 at `145ccf4` (CHANGELOG **[2.3.0]** + **[2.4.0]** in same release).
- **Session 2** — 2026-04-07T13:30:00-05:00 — Phase 1 — est 2h — `scraper`/`pipeline`/`normalize`, `sweep_auctions` + `pull_manifests`, manifest pagination — **Result:** committed as v2.4.0 at `145ccf4`.
- **Session 3** — 2026-04-07T16:45:00-05:00 — Phase 1 — est 1h — `POST /api/buying/token/`, bookmarklet + `refresh_bstock.bat`, `.env.example` + docs — **Result:** committed as v2.4.0 at `145ccf4`.
- **Session 4** — 2026-04-08T09:00:00-05:00 — Phase 2A — est 2h — DRF list/summary/sweep APIs + `AuctionListPage` (DataGrid + mobile infinite scroll) — **Result:** committed as v2.6.0 at `528f9ec` (CHANGELOG **[2.4.1]**).
- **Session 5** — 2026-04-08T09:40:00-05:00 — Phase 2B — est 2h — `AuctionDetailPage`, manifest rows API + `normalize.py` heuristics — **Result:** committed as v2.6.0 at `528f9ec` (CHANGELOG **[2.5.0]**).
- **Session 6** — 2026-04-08T10:05:00-05:00 — Phase 2C — est 1h — `WatchlistPage`, watchlist filters/ordering, `test_normalize_manifest` — **Result:** committed as v2.6.0 at `528f9ec`.
- **Session 7** — 2026-04-08T10:20:00-05:00 — Phase 2 — est 1h — Sidebar routes, shared hooks (`useBuyingAuctions*`), sweep progress UX hardening — **Result:** committed as v2.6.0 at `528f9ec`.
- **Session 8** — 2026-04-08T10:35:00-05:00 — Phase 3 — est 2h — `watch_auctions`, `AuctionSnapshot`, snapshots API + Recharts on detail — **Result:** committed as v2.6.0 at `528f9ec`.
- **Session 9** — 2026-04-08T10:50:00-05:00 — Phase 4 — est 2h — `CategoryMapping`, `taxonomy_v1`, `categorize_manifests`, category bar on detail — **Result:** committed as v2.6.0 at `528f9ec`.
- **Session 10** — 2026-04-08T15:38:00-05:00 — Phase 4.1A — est 1h — v2.6.1 list/detail polish, retail sort + manifest column behavior — **Result:** committed as v2.6.1 at `b8f95a2`.
- **Session 11** — 2026-04-08T16:53:00-05:00 — Phase 4.1A — est 2h — `ManifestTemplate`, `upload_manifest`, `seed_fast_cat_mappings` — **Result:** committed (no bump) at `a1eb5af`.
- **Session 12** — 2026-04-08T18:26:00-05:00 — Phase 4.1A — est 1h — Initiative + consultant + CHANGELOG close-out — **Result:** committed (no bump) at `a483b71`.
- **Session 13** — 2026-04-08T19:30:00-05:00 — Phase 4.1B — est 2h — AI template + `map_fast_cat_batch` + upload Stage 1/2 + `DELETE` manifest semantics — **Result:** committed as v2.7.0 at `dc499d0`.
- **Session 14** — 2026-04-08T19:50:00-05:00 — Phase 4.1B — est 1h — `AI_PRICING`, `AI_MODEL_FAST`, `.env.example` + prompt caching wiring — **Result:** committed as v2.7.0 at `dc499d0`.
- **Session 15** — 2026-04-08T20:00:00-05:00 — Phase 4.1B — est 1h — `ai_usage.jsonl`, `ManifestUploadProgress` + four workers + cancel — **Result:** committed as v2.7.0 at `dc499d0`.
- **Session 16** — 2026-04-08T20:10:00-05:00 — Phase 4.1B — est 1h — Buying UI layout (`flex: 1` manifest card), `__no_key__` exclusion, remove-manifest confirmation — **Result:** committed as v2.7.0 at `dc499d0`.
- **Session 17** — 2026-04-08T20:12:00-05:00 — Phase 4.1B — est 1h — Settings review + initiative **[2.7.0]** parking-lot notes (wrong-marketplace `CategoryMapping` TODO) — **Result:** committed as v2.7.0 at `dc499d0`.

### Session 18 — Phase 5 backend: valuation engine + seeds — est 2h — started 2026-04-09T15:00:00-05:00

**Goal:** Ship stored valuation fields, recompute pipeline, category need / want votes, and staff controls so the API is ready before the React valuation UI.

**Finish line:** `PricingRule` + migrations land; `recompute_*` paths exercised; list/detail serializers expose valuation + ordering; seeds documented in CHANGELOG **[2.8.0]**.

**Scope:** `apps/buying/services/valuation.py`, `ai_title_category_estimate.py`, `category_need.py`, `want_vote.py`, serializers/filters, `seed_pricing_rules` / management commands, unit tests under `apps/buying/tests/`.

#### Session updates

- 2026-04-09T15:00:00-05:00 Session started — migrations + model fields first.
- 2026-04-09T16:45:00-05:00 Valuation recompute + manifest/AI mix wired; category-need endpoint returning rows.
- 2026-04-09T18:50:00-05:00 Thumbs-up + valuation-inputs endpoints tested; ready to tag.

#### Result

Completed — committed as v2.8.0 at `d863b4f`.

---

### Session 19 — Phase 5 React: auction list valuation + filters — est 2h — started 2026-04-10T09:30:00-05:00

**Goal:** Expose profitability, need, revenue, priority, and thumbs-up on the auction grid with server-side filter chips aligned to `AuctionFilter`.

**Finish line:** Desktop + mobile list show new columns; chip filters call list/watchlist APIs with parity; React Query keeps pagination stable (`keepPreviousData`).

**Scope:** `AuctionListPage` / list components, `buying.api.ts`, filter chip UX, `WatchlistAuctionFilter` alignment, CHANGELOG **[2.9.0]** React bullets.

#### Session updates

- 2026-04-10T09:30:00-05:00 Session started — DataGrid columns + sort defaults (`-priority,end_time`).
- 2026-04-10T10:40:00-05:00 Filter chips + marketplace row layout; watchlist tint query capped at 100 IDs.
- 2026-04-10T11:50:00-05:00 Pagination snap-back fix + `has_manifest` filter consistency verified.

#### Result

Completed — committed as v2.9.0 at `0620237`.

---

### Session 20 — Phase 5 React: category need panel + valuation detail — est 2h — started 2026-04-10T11:45:00-05:00

**Goal:** Desktop category-need analytics + auction detail valuation card with overrides and AI vs manifest comparison strip.

**Finish line:** `GET /api/buying/category-need/` drives charts; detail page shows `AuctionValuationCard` + `AiManifestComparisonStrip` when applicable; JWT token-backed calls documented as disabled for ban mitigation.

**Scope:** `category-need` UI, `AuctionDetailPage` valuation stack, API field consumption, CHANGELOG **[2.9.0]** notes + initiative parking-lot cross-links.

#### Session updates

- 2026-04-10T11:45:00-05:00 Session started — category panel sizing (min/window/full) + bar charts.
- 2026-04-10T12:30:00-05:00 Want-vote slider debounce + `sell_through_rate` in category rows.
- 2026-04-10T13:05:00-05:00 Detail valuation overrides + comparison strip; rechecked list/watchlist filter parity.

#### Result

Completed — committed as v2.9.0 at `0620237`.

---

### Session 21 — archive + consultant handoff — est 1h — started 2026-04-11T23:00:00-05:00

**Goal:** Archive completed data backfill initiative; refresh consultant file bundle for **Phase 6** (outcome tracking) prep.

**Finish line:** Main `_index.md` lists only **B-Stock** as active; `workspace/to_consultant/files-update/` contains refreshed copies; no semver bump (v2.10.0 already shipped).

#### Session updates

- 2026-04-11T23:00:00-05:00 `data_backfill_initiative.md` moved to `_archived/_completed/`; `ARCHIVE.md` + `_index.md` + `context.md` + `consultant_context.md` aligned; consultant bundle collected per **`extended/consultant_handoff.md`**.

#### Result

Completed — docs and handoff bundle only (not committed). No version bump. Commit/push when Bill is ready — see `scripts/deploy/commit_message.txt`.

---

### Session 22 — production data + session closeout (v2.11.1) — est 2h — started 2026-04-12T12:00:00-05:00

**Goal:** Close the major deployment session: archive workspace diagnostics, bump **v2.11.1**, align steering docs, record production state for buying + inventory.

**Finish line:** Vendor-prefix investigation and related notes recorded in **CHANGELOG** **[2.11.0]** / **[2.11.1]** (long-form copies were under **`.ai/reference/`**, since removed); **CHANGELOG** **[2.11.1]**; `.version` / `package.json`; initiative + consultant context note **Heroku** backfill + cost pipeline live; **Phase 6** clearly next.

**Scope:** Docs and `workspace/` archive only — no application code changes in this closeout.

#### Session updates

- 2026-04-12T12:00:00-05:00 Session started — archive consultant/SQL/diagnostic artifacts; version + CHANGELOG + context.
- 2026-04-12T12:00:00-05:00 **Production (prior sessions):** V1/V2→V3 backfill **phases 1–5** deployed; **`Item.retail_value`** populated; **cost pipeline** (**`compute_vendor_metrics`**, **`compute_po_cost_analysis`**, **`compute_item_cost`**, pink-tag fulfillment below 0.15 allocation) run; **vendor merge** (TGT→TRGET), **PO data corrections** (WAL/TGT/WFR/CST/AMZ cases), **retag category inheritance** migration; **DB-aware** **`generate_product_number`** / **`generate_sku`** for **`--database production`**; **phase 2** collision handling; **phase 5** remote batch sizing; **`classify_v2_*`** **`--database` / `--no-input`**; **HISTORICAL** legacy rows cleaned; **`recompute_cost_pipeline`** on production.
- 2026-04-15 **v2.14.0 shipped:** Replaced legacy nightly cost pipeline with **`PurchaseOrder.est_shrink`** item cost formula + **`recompute_all_item_costs`** backfill; buying need = **`CategoryStats.need_score_1to99`** + auction **`need_score`**/**`priority`** SUMPRODUCT — see **CHANGELOG [2.14.0]** and **`.ai/context.md`**.
- 2026-04-15T12:00:00-05:00 **Checkpoint (research):** local probe script + reference research doc + JSON samples under **`workspace/data/`** (not all committed today) — endpoint catalog, search **max limit 200**, anonymous vs JWT behaviors; **CHANGELOG** `[Unreleased]` bullet; no app code changes. *(Reference MD tree later removed; see **`.ai/extended/bstock.md`**.)*
- 2026-04-14T22:00:00-05:00 **Checkpoint (consultant handoff prep):** **`consultant_context`** + **`bstock.md`** — search **GET/POST**, **`limit` 200**, auction/manifest anonymous probes; **[`extended/consultant_handoff.md`](../extended/consultant_handoff.md)** + **flat** bundle; **`backend.md`** — cache TTLs, **`AI_MODEL_FAST`** defaults, **`suggest_item`** retry. *(Personas / reference prompts / **`sweep_fast.py`** were documented at the time; **`.ai/reference/`** and that script are not in the repo now.)*
- 2026-04-16T12:00:00-05:00 **Bearing** — MESSY — ~63 files unstaged (+3825/−2078); 0 staged; uncommitted work spans v2.13–v2.15+ (buying, inventory, migrations, UI); not measurable vs Session 22 finish line (v2.11.1); Session 23+ Session 6 initiative **Results** describe shipped releases but **git** still dirty — next: **`startup.md` steps 8–9** (new session entry for this tree) or **`session_close.md`** to commit/reconcile; see chat bearing card.

#### Result

Superseded by Sessions 24–28 (v2.14.0 → v2.15.3 release train). The v2.11.1 docs/version prep and the intervening v2.13.0 / v2.13.1 / v2.14.0 / v2.14.1 / v2.15.0 / v2.15.1 / v2.15.2 / v2.15.3 work all ship in one combined push — see `CHANGELOG.md` [2.15.3] ↔ [2.14.0] and `scripts/deploy/commit_message.txt`.

---

### Session 23 — fast sweep + SOCKS proxy prep (v2.13.0) — est 4h — started 2026-04-15T12:00:00-05:00

**Goal:** Parallel **POST** search sweep (default `limit=200`, delay 0), raw SQL upsert with **`first_seen_at` / staff-field** preservation, **`listing_mapping`** module; **`POST /api/buying/sweep/`** richer JSON; single-request **Refresh** on auction list; optional **SOCKS5** for search (`BUYING_SOCKS5_*`, `PySocks`, URL-encoded credentials). *(Ad hoc parallel sweep script was described in docs at the time; not committed.)*

**Finish line:** **v2.13.0** semver + **CHANGELOG** + steering touchpoints; Bill commits when ready.

#### Session updates

- 2026-04-15T12:00:00-05:00 **Implemented** — `scraper.discover_auctions_parallel`, `_search_post_paginate`, `sweep_upsert`, `pipeline.run_discovery` branching (`enrich_detail` → ORM path); `SweepView` returns extended summary; `AuctionListPage` one `postBuyingSweep(null)`; `.env.example` SOCKS keys; `fast_sweep_verify.md` verification note for consultant bundle.
- 2026-04-15 **Session close** — bump `.version` / root `package.json`, **CHANGELOG [2.13.0]**; **`.ai/context.md`**, **`bstock.md`**, **`consultant_context.md`** Refresh/sweep lines; **`_index.md`** note; this **`Result`**.

#### Result

Prepared for release as **v2.13.0** (semver + changelog + docs); **commit/push at Bill’s discretion** (see `scripts/deploy/commit_message.txt`).

---

### Session 24 — v2.14.0 item cost (est_shrink) + need_score_1to99 — est 3h — started 2026-04-15T14:00:00-05:00

**Goal:** Replace legacy nightly `compute_vendor_metrics` / `compute_po_cost_analysis` / `compute_item_cost` / `recompute_cost_pipeline` with a direct **`PurchaseOrder.est_shrink`** → **`Item.cost`** path; swap buying need from ad-hoc scoring to **`CategoryStats.need_score_1to99`** driving auction **`need_score`** / **`priority`** via SUMPRODUCT.

**Finish line:** v2.14.0 semver + CHANGELOG [2.14.0]; legacy cost-pipeline commands deleted; `recompute_all_item_costs` backfill shipped; `compute_daily_category_stats` refreshes `CategoryStats` + 1–99 + cache invalidation.

**Scope:** `apps/inventory/models.py` (`PurchaseOrder.est_shrink`, `Item.cost` recompute), `apps/inventory/migrations/0023_po_est_shrink_remove_cost_pipeline_fields.py`, `apps/buying/services/category_stats_sql.py`, `apps/buying/services/category_need.py`, `apps/buying/services/valuation.py`, `apps/buying/management/commands/compute_daily_category_stats.py`, `apps/inventory/management/commands/recompute_all_item_costs.py`.

#### Session updates

- 2026-04-15T14:00:00-05:00 Model + migration — `PurchaseOrder.est_shrink` default 0.15; removed shrinkage_rate/misfit_rate/avg_sell_through/avg_fulfillment/shrink_retail_est/mistracked_retail/misfit_sales_amt; `Item.cost` derived from PO retail + est_shrink + listing retail.
- 2026-04-15T15:30:00-05:00 `category_stats_sql.py` + `need_score_1to99`; `compute_daily_category_stats` wires SQL refresh + open-auction recompute + category-need cache bust.
- 2026-04-15T16:00:00-05:00 Deleted legacy cost-pipeline commands; `recompute_all_item_costs` backfill; CHANGELOG [2.14.0]; `backend.md` / `bstock.md` / `development.md` updated.

#### Result

Prepared for release as **v2.14.0** — shipped in the combined v2.15.3 push (see `CHANGELOG.md` [2.14.0]).

---

### Session 25 — v2.14.1 SOCKS5 hardening for all B-Stock HTTP — est 2h — started 2026-04-15T17:00:00-05:00

**Goal:** Route **every** `*.bstock.com` request through the SOCKS5 proxy (not just search), expose PIA-friendly knobs (`socks5://` vs `socks5h://`, resolved-IP override, dev audit), and build a six-step egress diagnostic script.

**Finish line:** v2.14.1 semver + CHANGELOG [2.14.1]; `BUYING_SOCKS5_LOCAL_DNS=True` default for PIA; `BUYING_SOCKS5_PROXY_IP` optional override; `workspace/tests/socks5_egress_probe.py` 6-step diagnostic; `.ai/extended/vpn-socks5.md` written.

**Scope:** `apps/buying/services/scraper.py` (`_request_json`), `ecothrift/settings.py`, `.env.example`, `workspace/tests/socks5_egress_probe.py`, `.ai/extended/vpn-socks5.md` (new).

#### Session updates

- 2026-04-15T17:00:00-05:00 Scraper — all `_request_json` paths use SOCKS5 when enabled; PIA `0x04` behavior documented (`socks5://` works, `socks5h://` often fails).
- 2026-04-15T18:30:00-05:00 `socks5_egress_probe.py` 6-step diagnostic (resolve host → direct → socks5+host → socks5+IP → socks5h+host → optional bstock probe).
- 2026-04-15T19:00:00-05:00 `.ai/extended/vpn-socks5.md` written; CHANGELOG [2.14.1]; `.env.example` documents new keys.

#### Result

Prepared for release as **v2.14.1** — shipped in the combined v2.15.3 push (see `CHANGELOG.md` [2.14.1]).

---

### Session 26 — v2.15.1 manifest pipeline optimizations + dev timelog/benchmark — est 3h — started 2026-04-16T09:00:00-05:00

**Goal:** Seven targeted optimizations on the B-Stock manifest download + post-processing path; dev timing infrastructure to measure pull speed; confirm B-Stock page-size ceiling.

**Finish line:** v2.15.1 semver + CHANGELOG [2.15.1]; baseline ~38 s / 1010 rows / ~26 rows/s confirmed; 10-items/page hard cap documented; 0 additional B-Stock API calls beyond the three baseline pulls.

**Scope:** `apps/buying/services/scraper.py` (lazy singleton `Session`), `apps/buying/services/pipeline.py` (preloaded `CategoryStats`, `Exists` annotation, prefetch, batch_size), `apps/buying/management/commands/{pull_manifests_budget,pull_manifests_nightly}.py` (delay default 1.0 s), `apps/buying/services/manifest_dev_timelog.py` (new), `apps/buying/management/commands/benchmark_manifest_pull.py` (new), `workspace/b-manifest-api/` dev timelogs + benchmark scratch.

#### Session updates

- 2026-04-16T09:00:00-05:00 Opts 1–7 applied (session reuse, stats preload, queryset annotation, bulk_create batch_size, prefetch, delay cut, migration indexes).
- 2026-04-16T10:30:00-05:00 `manifest_dev_timelog.py` writes `.timelogs/*.jsonl` + `time_summary.md` when `ENVIRONMENT=development`; `MANIFEST_API_PULL_VERSION` string.
- 2026-04-16T11:15:00-05:00 Benchmark — warm-up + 3 baseline runs — avg 38.41 s / 1010 rows / ~26.3 rows/s; probe skipped per B-Stock safety rule.

#### Result

Prepared for release as **v2.15.1** — shipped in the combined v2.15.3 push (see `CHANGELOG.md` [2.15.1]).

---

### Session 27 — v2.15.2 retail-weighted manifest mix + AI Mixed-lot blend — est 2h — started 2026-04-16T12:00:00-05:00

**Goal:** Build `manifest_category_distribution` from **retail share** per `fast_cat_value` (not row counts); blend the **Mixed lots & uncategorized** bucket with AI title estimates when both exist; lift per-sweep AI estimate cap; skip auctions already AI-estimated.

**Finish line:** v2.15.2 semver + CHANGELOG [2.15.2]; `recompute_auction_full` refreshes manifest distribution before revenue / `need_score`; `recompute_buying_valuations` backfills retail-weighted mixes.

**Scope:** `apps/buying/services/valuation.py` (`compute_and_save_manifest_distribution`, `_mix_for_auction`, `run_ai_estimate_for_swept_auctions`, `recompute_auction_full`), `apps/buying/services/ai_title_category_estimate.py` (taxonomy/rules/JSON schema into cached system block; drop ≥80% Mixed vendor examples), `apps/buying/management/commands/recompute_buying_valuations.py`.

#### Session updates

- 2026-04-16T12:00:00-05:00 `compute_and_save_manifest_distribution` retail-weighted with row-count fallback; `_mix_for_auction` blends Mixed lots with AI when both present.
- 2026-04-16T12:45:00-05:00 Lifted 25-auction sweep cap on AI estimates; skip auctions that already have AI estimates; few-shot vendor examples drop rows where Mixed ≥80%.
- 2026-04-16T13:15:00-05:00 `recompute_auction_full` refreshes manifest distribution from `ManifestRow` before revenue + `need_score`.

#### Result

Prepared for release as **v2.15.2** — shipped in the combined v2.15.3 push (see `CHANGELOG.md` [2.15.2]).

---

### Session 28 — v2.15.3 AI title estimate yield + sweep ergonomics — est 1h — started 2026-04-16T13:30:00-05:00

**Goal:** Restore high save rate from `estimate_batch` by removing the redundant `title_echo` verification (rows already match via `auction_id`); pad the cached system block past Haiku’s 2048-token minimum so repeated batches benefit from `cache_read` pricing; add `estimate_auction_categories --missing-both` for robust backfills.

**Finish line:** v2.15.3 semver + CHANGELOG [2.15.3]; `estimate_batch` with no `title_echo` field; system prompt padded with edge-case + worked-example sections; `--missing-both` flag on `estimate_auction_categories` with default 500 cap (`--limit` overrides).

**Scope:** `apps/buying/services/ai_title_category_estimate.py`, `apps/buying/management/commands/estimate_auction_categories.py`.

#### Session updates

- 2026-04-16T13:30:00-05:00 Removed `title_echo` from `estimate_batch` — rows identified by `auction_id` only.
- 2026-04-16T14:00:00-05:00 System prompt padded past 2048 tokens; `cache_control=ephemeral` retained.
- 2026-04-16T14:20:00-05:00 `--missing-both` flag on `estimate_auction_categories` for open/closing auctions missing both mixes; CHANGELOG [2.15.3].

#### Result

Prepared for release as **v2.15.3** (current `.version`) — shipped in the combined v2.15.3 push (see `CHANGELOG.md` [2.15.3] and `scripts/deploy/commit_message.txt`).

---

## Acceptance (initiative level)

- [x] **Phase 1 complete:** sweep and manifest commands work; data in Postgres; token workflow documented
- [x] **Phase 2 complete:** React pages for auction list, auction detail with manifests, and watchlist; API endpoints for all three; sweep and manifest pull triggerable from UI
- [x] **Phase 3 complete:** watchlist polling produces time-series snapshots; price history visible in UI; rate limits documented
- [x] **Phase 4 complete:** manifest rows carry canonical category from taxonomy_v1; rules persisted; categorization command; category on rows in UI; distribution summary on auction detail; manifest retail cents/dollars normalization applied
- [x] **Phase 4.1A complete (v2.6.1 + manual validation 2026-04):** **`ManifestTemplate`** + CSV **`upload_manifest`** + **`seed_manifest_templates`** / **`seed_fast_cat_mappings`** + **`fast_cat_key`** / **`fast_cat_value`** / **`category_confidence`** **`fast_cat`**; auction list/detail UX per **`CHANGELOG` [2.6.1]**; unknown-template stub **400**; **`create_test_auctions`** for local matrix; seed coverage limits documented (343 keys).
- [x] **Phase 4.1B complete (v2.7.0 + validation 2026-04):** AI template + AI key mapping + split upload + **`map_fast_cat_batch`** + **`DELETE manifest`** + usage logging + buying UI (**`ManifestUploadProgress`**, workers, cancel, remove manifest, **`__no_key__`** exclusion). See **`CHANGELOG` [2.7.0]**.
- [x] **Phase 5 complete (backend/API):** **`PricingRule`** + **`seed_pricing_rules`**; **`valuation`** + **`ai_title_category_estimate`**; manifest/AI mix; **`CategoryNeed`** / **`CategoryWantVote`** APIs; **`fees_override`** / **`shipping_override`**; thumbs-up + valuation-inputs; list/detail serializers + ordering + **`thumbs_up`** filter; hooks + commands; unit tests in **`apps/buying/tests/test_valuation.py`**, **`apps/buying/tests/test_phase5_category_need.py`**
- [x] **Phase 5 complete (React UI, v2.9.0):** auction list valuation columns, filters, category-need panel, auction detail valuation card + overrides + comparison strip; see **`CHANGELOG`** **[2.9.0]**
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

## Parking lot (deferred)

- **Mixed lots vs _NA_ taxonomy split:** treat “Mixed / Misc” as a real category with its own sell-through; use “_NA_” for uncategorized items where no key exists. Touches `taxonomy_v1` list, `PricingRule` seeds, fast-cat mapping.
- **Auction detail page UX redesign:** restructure layout so decisions (price, profitability, need, max bid) stay at the top; compact overrides below; details and breakdown lower; manifest drop zone minimized.
- **Groq Llama 3.1 8B for fast-cat key mapping:** cost optimization (~$0.05/M tokens vs current Sonnet/Haiku rates). Example: ~$1.19 for 310 keys on one manifest; simple classification task suitable for a smaller model.
- **Switch `ai_key_mapping.py` to `AI_MODEL_FAST` instead of `AI_MODEL`:** one-line change to route key mapping through Haiku instead of Sonnet and cut cost immediately.
- **`ai_key_mapping.py` / model choice:** future discussion on whether fast-cat mapping should use a smaller/cheaper model consistently (see also **Groq** idea above); no code change required for Phase 5 ship.
- **Data backfill initiative:** **done** — see [archived initiative](./_archived/_completed/data_backfill_initiative.md) (v2.10.0). Production CSV export/deploy to other hosts remains deferred.
- **Postgres test DB schema fix:** test runner fails on Postgres when `ecothrift` schema is missing in the new test DB; low priority while SQLite `test_settings` works.

---

## See also

- **`apps/buying/`** (Django app; production logic)
- [`.ai/initiatives/_archived/_pending/bstock_scraper.md`](./_archived/_pending/bstock_scraper.md) (archived API notes)
- [`workspace/notebooks/bstock-scraper/Scraper/`](../../workspace/notebooks/bstock-scraper/Scraper/) (historical reference for discovery only)
- [`workspace/notebooks/_shared/config.example.py`](../../workspace/notebooks/_shared/config.example.py) (notebook DB access; copy to `config_local.py`)
- [`.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md`](./_archived/_completed/category_sales_inventory_and_taxonomy.md) (related learning pattern)
- **Future:** Scoring model initiative (data science project to replace v1 category-margin pricing with a trained model; depends on outcome data from **Phase 6**).

---

*Parent: [`.ai/initiatives/_index.md`](./_index.md).*
