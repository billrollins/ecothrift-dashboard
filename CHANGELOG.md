<!-- Last updated: 2026-04-15 (v2.13.0 session close) -->
# Changelog

All notable changes to this project are documented here at the **version level**.
Commit-level detail belongs in commit messages, not here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.13.0] — 2026-04-15

User-facing theme: **Fast auction sweep** + **optional SOCKS5 for search** ([`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md)) — parallel B-Stock search, raw SQL upsert, richer sweep API, single-request Refresh UX.

### Added

- **Buying / sweep** — Parallel **POST** `search.bstock.com` pagination per marketplace (`ThreadPoolExecutor`), default **`limit=200`**, configurable **`BUYING_REQUEST_DELAY_SECONDS`** (default **0**). Raw PostgreSQL **`INSERT … ON CONFLICT`** upsert ([`sweep_upsert`](apps/buying/services/sweep_upsert.py)) preserving **`first_seen_at`** and staff fields; shared **[`listing_mapping`](apps/buying/services/listing_mapping.py)** for listing JSON → auction fields.
- **API** — `POST /api/buying/sweep/` response extensions: **`total_seconds`**, **`total_listings`**, **`by_marketplace`** (per-MP HTTP timing, insert/update/skip/db error counts), **`inserted`**, **`updated`** (alongside **`upserted`**).
- **Frontend** — **Refresh auctions**: one **`POST`** for all active marketplaces (no per-MP loop); loading copy **“Sweeping all marketplaces…”**; [`BuyingSweepResponse`](frontend/src/types/buying.types.ts) types extended.
- **Ops / proxy** — Optional **SOCKS5** for search only (`socks5h`), env **`BUYING_SOCKS5_*`**, **`PySocks`**; URL-encoded credentials in **[`scraper._socks_proxies_for_search`](apps/buying/services/scraper.py)**. **[`workspace/sweep_fast.py`](workspace/sweep_fast.py)** documented as ops-only fallback (no Django).

### Changed

- **`sweep_auctions`** default **`--page-limit`** **200** (was 20).
- **`.env.example`** — buying delay, sweep workers, SOCKS placeholders (Bill: copy to local **`.env`** as needed; not committed).

---

## [Unreleased]

### Added

- **Workspace (consultant):** B-Stock API research — [`workspace/notes/from_consultant/bstock_api_research.md`](workspace/notes/from_consultant/bstock_api_research.md) and probe script [`workspace/test_bstock_endpoints.py`](workspace/test_bstock_endpoints.py) (anonymous + optional JWT; samples under `workspace/data/bstock_api_samples/`).
- **Workspace:** [`workspace/sweep_fast.py`](workspace/sweep_fast.py) — standalone sweep (parallel GET search, `psycopg2` upsert, `workspace/logs/`).
- **Steering:** [`.ai/protocols/collect_for_consultant.md`](.ai/protocols/collect_for_consultant.md); [`workspace/notes/from_consultant/handoff_prompt.md`](workspace/notes/from_consultant/handoff_prompt.md); [`workspace/notes/from_consultant/status_board.md`](workspace/notes/from_consultant/status_board.md) (consultant status board template).

### Documentation

- **Consultant handoff bundle** — **`workspace/notes/to_consultant/files-update/`** is **flat** (no subfolders). Canonical procedure: **`.ai/protocols/consult_retire_scout.md`**; Charlie: **`.ai/protocols/consult_retire_charlie.md`**.
- **`.ai/consultant_context.md`**, **`.ai/extended/bstock.md`:** B-Stock search **GET or POST**, **max `limit` 200**; auction/manifest anonymous behavior cross-linked to **`bstock_api_research.md`**; **`_apply_auction_list_visibility`** (live default; **Completed** = last 24h ended).
- **`.ai/extended/backend.md`:** Django DB cache TTLs (**`item_stats_global`**, **`category_need_panel`**, **`item_list_total_count`**); **`suggest_item`** / **`ai_cleanup_rows`** → **`AI_MODEL_FAST`**; category retry + fallback.
- **`.ai/personas/Scout.md`**, **`.ai/personas/Christina.md`:** **Ask / Plan / Agent** rules; **present_files** for consultant `.md` prompts and `.txt` command scripts.

---

## [2.12.1] — 2026-04-14

User-facing theme: **Auction list & detail polish** (Phase 3A, [`.ai/initiatives/ui_ux_polish.md`](.ai/initiatives/ui_ux_polish.md)) — staff buying UI and buying API filters for active-auctions workflow, manifest truth from uploads, and detail recompute without B-Stock tokens.

### Changed

- **Auction list** — Column reorder (Watch, Thumbs, read-only Priority, raw Need, Vendor, Title, Price, Retail, Cost/retail %, time left); **`estimated_revenue`** / **`profitability_ratio`** removed from list; **manifest** Yes/No from **`ManifestRow`** (uploaded CSV), not B-Stock flag; **`q`** search (AND across title + marketplace); **Completed** chip + **`completed`** param (last-24h ended vs live default). **`_apply_auction_list_visibility`** for live vs completed.
- **Auction detail** — Manifest grid columns (**Ext Retail**, **% of Manifest**); action row under title (Watch → Update → B-Stock); **`POST …/recompute_valuation/`** for local recompute.

---

## [2.12.0] — 2026-04-13

User-facing theme: **Memory/performance**, **buying category need**, **inventory & POS UX** (Phase 1–2), and **faster item list** — ops tuning, caches, lean APIs, enter-to-commit search, Add Item taxonomy, AI fast defaults, plus **cached total count** for unfiltered item lists.

### Added

- **Inventory / POS — Phase 2 polish** ([`.ai/initiatives/ui_ux_polish.md`](.ai/initiatives/ui_ux_polish.md)) — Item list (`ItemListPanel`) and POS **transactions** receipt search commit on **Enter** / **Search** (draft text does not refetch lists). **Orders list API** — `PurchaseOrderListSerializer` with **`has_manifest`**; list queryset skips heavy PO stats annotations; no `processing_stats` or nested `manifest_file` on list. **Add Item** — category **taxonomy `Autocomplete`**, **retail (MSRP)** + validation, brand default **Generic**; **`PurchaseOrderListRow`** type for list responses. **AI** — `suggest_item` and `ai_cleanup_rows` default **`AI_MODEL_FAST`**; suggest-item includes canonical category list, **one retry** if category invalid, fallback to **Mixed lots & uncategorized**.
- **Item list API — cached total count** — For **unfiltered** list requests (no `q`, `search`, status/condition/source, filterset fields, or `updated_after`), DRF pagination **`count`** uses **`cache.get_or_set('item_list_total_count', …, 300)`** so large-table **`COUNT(*)`** is not repeated every request (`ItemListPagination` + `CachedTotalCountPaginator`). Filtered lists still run a normal count.
- **Heroku memory ops** — [`docs/operations/heroku-memory.md`](docs/operations/heroku-memory.md): `log-runtime-metrics`, tail web dyno, rollback note (pairs Procfile/Gunicorn + cache deploy).
- **Consignment agreements** — `SearchFilter` on list API so Add Item agreement autocomplete can search by number / consignee fields.

### Changed

- **Pagination** — DRF `max_page_size` **200** (was 1000); **Gunicorn** explicit `--workers 2`, `--max-requests` + jitter (Procfile).
- **Cache** — Django **database** cache backend (`django_cache_table`; tests use LocMem); **TTL-only** cache for item **global** stats block and **category-need** API response (no signal invalidation).
- **Purchase orders (list)** — Annotated item/batch counts for `processing_stats`; **list** no longer prefetches all `manifest_rows` / `batch_groups` (detail still prefetches manifest rows).
- **Item stats API** — `_item_stats_payload` uses a **single aggregate** query where applicable.
- **Buying / category need** — Metric windowing: all-time financials and `sell_through_pct` denominator; 90-day **`sold_count`** / **`sold_pct`** unchanged semantically; [`CategoryNeedBars`](frontend/src/components/buying/CategoryNeedBars.tsx) layered bars (see [`.ai/initiatives/ui_ux_polish.md`](.ai/initiatives/ui_ux_polish.md)).
- **Frontend lists** — **Server-side** DataGrid pagination for orders, items (`ItemListPanel`), POS transactions; **`useItemsAllPages`** for Processing page when a PO has many items; item list **`q`** and POS receipt filter use **committed** search (Enter/Search/Clear), not live-typing refetch.
- **Add Item form** — Purchase order and agreement pickers: **async** search (small page size) instead of loading hundreds of rows.

---

## [2.11.1] — 2026-04-12

User-facing theme: **Production deployment patch** — backfill data live on Heroku, cost pipeline and inventory ID generation hardened for remote DB.

### Added

- **Optional `DATABASES['production']`** — configure via **`PROD_DATABASE_*`** (see **`ecothrift/settings.py`**). Inventory management commands accept **`--database default|production`** and **`--no-input`** for scripted runs (e.g. **`scripts/deploy/run_production_backfill.bat`**).

### Changed

- **`Product.generate_product_number`** / **`Item.generate_sku`** — when saving with **`using=`**, sequence queries target that database (avoids **`PRD-*` / `ITM*` collisions** when backfilling to a non-default alias).
- **`backfill_phase2_products_manifests`** — **`IntegrityError`** around product saves; **bulk_create** with **`ignore_conflicts`** and smaller batches for remote; **`ManifestRow`** / **`Item`** **`bulk_create`** use **`.using(db)`** (not invalid **`using=`** kwarg).
- **`backfill_phase5_categories`** **`--map-v1`** — progress logging + **`stdout.flush()`**; batch size **500** on **`production`**; **`.only()`** on item querysets to reduce payload over the wire.
- **`classify_v2_iterate`**, **`classify_v2_status`**, **`classify_v2_validate`** — **`--database`** / **`--no-input`** ( **`command_db`** pattern).

### Fixed

- **Data migrations:** PO retail/cost corrections (**WAL135287**, **TGT126675**, **WFR10979**, **CST423585**, **AMZ24714**); **retag category inheritance** for **`RETAGGED_FROM_DB2:`** notes.
- **Pink-tag loads** — **`compute_item_cost`** uses alternate allocation when PO fulfillment rate is below **0.15**.
- **Production hygiene:** legacy **HISTORICAL** rows removed; **`Item.retail_value`** populated; **cost pipeline** (**vendor metrics**, **PO analysis**, **item cost**) run on production.

---

## [2.11.0] — 2026-04-11

User-facing theme: **Acquisition cost pipeline hardened** — vendor merge, shrink vs misfit decomposition, nightly recompute on Heroku.

### Added

- **`Vendor.misfit_rate`** — Estimated share of PO retail gap from untracked/misfit sales (marketplace vendors only); **`shrinkage_rate`** now means **true** shrink after that share is removed. **`compute_vendor_metrics`** uses global decomposition (orphan POS lines vs missing retail) for codes `AMZ`, `CST`, `ESS`, `HMD`, `TRGET`, `WAL`, `WFR`; other vendors keep legacy composite shrinkage with `misfit_rate` null.
- **Data migration** [`0018_merge_tgt_into_trget`](apps/inventory/migrations/0018_merge_tgt_into_trget.py) — Reassigns `PurchaseOrder`, `CSVTemplate`, and `VendorProductRef` from duplicate Target vendor **TGT** to canonical **TRGET**; **`TGT`** row retained with **`is_active=False`**.

### Changed

- **v2.10.0 cleanup (themes in this release notes bundle):** SKU / product number sequencing fix, retag scaffolding removal, historical transaction HT filter, AI cleanup cancel race, vendor prefix investigation.
- **`Item.retail_value`** field (populated from legacy DBs via **`populate_item_retail_value`**); **`Item.cost`** repurposed as **allocated acquisition cost** (was incorrectly used for retail in older flows).
- **Cost pipeline:** **`compute_vendor_metrics`**, **`compute_po_cost_analysis`**, **`compute_item_cost`**, wrapper **`recompute_cost_pipeline`**; Heroku Scheduler runs **`python manage.py recompute_cost_pipeline`** nightly.

---

## [2.10.0] — 2026-04-11

User-facing theme: **Buying dashboards and category need reflect ~3 years of real historical inventory and sales** after the V1/V2 backfill and taxonomy pipeline (local database where the backfill was run).

### Added

- **Data backfill — Phase 5 (V2 classification + pricing):** [`backfill_phase5_categories`](apps/inventory/management/commands/backfill_phase5_categories.py) — V1 `--map-v1`; V2 CSV export/import; conservative **`--preclassify-v2`**; **[`classify_v2_iterate`](apps/inventory/management/commands/classify_v2_iterate.py)** (`--sample`, `--apply`, `--status`, `--apply-manual`) for iterative regex rules + manual `product_id` overrides; **`PricingRule`** recomputation from sold BACKFILL items. See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 6.
- **Phase 5 (continued):** All **19** `PricingRule` categories with data-backed sell-through; `recompute_buying_valuations` over backfilled auctions.
- **Phase 6 (verification):** Category-need API and admin counts verified against loaded data; release gate `manage.py check` + `tsc --noEmit`.

### Added (Phases 0–4, same release)

- **Data backfill (Phase 4):** [`backfill_phase4_sales`](apps/inventory/management/commands/backfill_phase4_sales.py) — load V1/V2 `cart` / `cart_line` and V2 `pos_cart` / `pos_cart_line` into V3 **`Cart`** / **`CartLine`**; `WorkLocation` "Eco-Thrift Main", Register **`BACKFILL`**, system user `backfill@system.local`, one **`Drawer`** per Chicago sale date; payment aggregation; V2 cashier map via legacy `core_user.email`; update BACKFILL **`Item`** `sold_at` / `sold_for` / `status=sold` from lines; flags `--clean`, `--reset-item-sales`, `--delete-historical-transactions`, `--dry-run`, `--limit`, `--skip-v1` / `--skip-v2`, `--skip-item-updates`. See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 5.
- **Data backfill (Phase 3):** [`backfill_phase3_items`](apps/inventory/management/commands/backfill_phase3_items.py) — load V1/V2 historical `Item` rows from **`ecothrift_v1`** / **`ecothrift_v2`** (`psycopg2`); lookup maps from Phase 1–2 `Product` / `PurchaseOrder`; `bulk_create` with precomputed `search_text`; idempotent `BACKFILL:v1:{code}` / `BACKFILL:v2:{id}` notes; Misfit PO fallbacks; V2 numeric `ITM…` SKUs prefixed `V2-`; `--dry-run`, `--limit`, `--skip-v1` / `--skip-v2`. See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 4.
- **Data backfill (Phase 2):** [`backfill_phase2_products_manifests`](apps/inventory/management/commands/backfill_phase2_products_manifests.py) — load V1/V2 `Product` and `ManifestRow` from **`ecothrift_v1`** / **`ecothrift_v2`**; products via `save()` for `PRD-*`; manifest rows `bulk_create`; PO linkage; `category` + `specifications` legacy fields; idempotent on `BACKFILL:` tags. See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 3.
- **Data backfill (Phase 1):** [`backfill_phase1_vendors_pos`](apps/inventory/management/commands/backfill_phase1_vendors_pos.py) — load V1/V2 vendors and purchase orders from legacy PostgreSQL databases **`ecothrift_v1`** / **`ecothrift_v2`** (raw `psycopg2`, same `DATABASE_*` as V3); idempotent `get_or_create`; inline description metadata as JSON on the last line of `notes` (after optional legacy V2 plain-text lines). See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 2.
- **Data backfill (Phase 0):** [`setup_misfit_backfill_pos`](apps/inventory/management/commands/setup_misfit_backfill_pos.py) — vendor **MIS** (“The Island of Misfit Items”) and placeholder POs **MISFIT-V1-2024** / **MISFIT-V2-2025** for orphan items. [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) — removed ~146.9k `HISTORICAL:db1:`/`HISTORICAL:db2:` `inventory_item` rows; preserved 9,009 real V3 items; `pos_cart` / `pos_cartline` counts unchanged.

### Changed

- **POS reporting:** [`historical_revenue`](apps/pos/views.py) excludes carts on register **`BACKFILL`** from db3 aggregates while **`HistoricalTransaction`** rows exist for db1/db2 (avoids double-counting legacy totals vs `import_historical_transactions`). After deleting db1/db2 historical rows or loading only via Phase 4, totals reflect Carts.
- **Data backfill initiative (Phase 0 close / consultant pass):** Production deployment strategy (export CSVs + `import_backfill`); Phase 1–5 text corrections (inline PO enrichment, verify `PurchaseOrder` mappings before code, product dedup evaluation, backfilled items never `on_shelf`, taxonomy label count unverified). [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md). Added [`workspace/scripts/convert_pickles_to_csv.py`](workspace/scripts/convert_pickles_to_csv.py) — pickle→CSV using `pickle/manifest.json` (run in notebook venv if `read_pickle` fails).
- **AI steering / protocols:** Replaced **`review_bump.md`** with **`session_close.md`**; rewrote **`startup.md`** (session entry step) and **`get_bearing.md`** (progress vs written session). Generalized **`collect_for_consultant.md`**. [`.ai/initiatives/_index.md`](.ai/initiatives/_index.md) uses **Phase** + **Notes** columns; session detail lives in initiative files only. [`.ai/context.md`](.ai/context.md) **Working** section is short capability pointers (detail in **`.ai/extended/`**). Cross-links updated (README, lifecycle protocols, CHANGELOG history where cited). Django admin vs React **`/admin/*`** and retag history serializer guardrails moved to [`.ai/extended/frontend.md`](.ai/extended/frontend.md) and [`.ai/extended/retag-operations.md`](.ai/extended/retag-operations.md).
- **Initiative archiving:** [docs_restructure](.ai/initiatives/_archived/_completed/docs_restructure.md) archived as **completed**; [historical_sell_through_analysis](.ai/initiatives/_archived/_pending/historical_sell_through_analysis.md) moved to **pending** (initial rates seeded manually v2.8.0; data-backed refinement deferred). Session history seeded in initiative files.
- **AI steering / protocols (follow-up):** Added [`.ai/protocols/session_checkpoint.md`](.ai/protocols/session_checkpoint.md) for **mid-session** pulses (session updates, **`[Unreleased]`**, light extended-doc sync). **`startup.md`** now includes **framing questions** (success, intent, time, owner, out-of-scope, ship expectation) and points to checkpoints vs **`session_close`**. **`README`**, **`context`**, **`get_bearing`**, **`session_close`** cross-links updated.

### Fixed

- **Data backfill (Phase 3):** [`backfill_phase3_items`](apps/inventory/management/commands/backfill_phase3_items.py) — V1 `SELECT` no longer `JOIN`s `product` on `code` when multiple legacy `product` rows share a code (use `LATERAL … LIMIT 1`); avoids duplicate result rows and bogus `skipped_exists`. Dry-run reports **`would_create`** instead of inflating **`created`**; **`bulk_create`** errors are logged and re-raised. [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 4 close.

### Initiative

- [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) — Phases **0–6** complete on loaded DB (**v2.10.0**); production CSV export / `import_backfill` deployment still deferred.

---

## [2.9.0] — 2026-04-09

### Added

- **Buying — Phase 5 (React UI):** [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md) — **Auction list** (`/buying/auctions`): valuation **DataGrid** columns — **Profitability** / **Need** pills, **Est. revenue**, **Retail** (manifest vs listing tooltip), **Priority** with Admin **steppers**, **Thumbs up** toggle (Admin), **Time left** with color bands; default server sort **`-priority,end_time`**. **Filter chips** (server-side **`AuctionFilter`** / **`WatchlistAuctionFilter`**): **Profitable**, **Needed**, **Thumbs up**, **Watched**, **Has manifest** — multi-select with Ctrl/⌘ (plain click isolates / clears per row semantics); **marketplace** chips: **All** first, Ctrl/⌘ multi-vendor; layout: **Filters** + **Clear all**, then marketplace row, then filter row; mobile-scaled chips. **Category need panel** (desktop **`md+`**): **Min** / **Window** / **Full** sizing, bar charts, category detail, staff **want vote** slider (debounced). **Auction detail:** **AuctionValuationCard** (full computation breakdown, revenue/fees/shipping/shrinkage/profit-target/priority overrides, **max bid** line), **AiManifestComparisonStrip** when both AI and manifest mix exist. **Watchlist** row tint on main list (≤**100** watchlist IDs for tint query). **Mobile** list: scaled chips, time formatting, infinite scroll. **React Query:** `placeholderData: keepPreviousData` on auction + watchlist list queries so **server pagination** stays stable when the page param changes. **API:** **`GET /api/buying/category-need/`** category rows include **`sell_through_rate`**; list params **`profitable`**, **`needed`**; **`GET /api/buying/watchlist/`** accepts **`marketplace`**, **`status`**, **`has_manifest`**, **`profitable`**, **`needed`**, **`thumbs_up`** (watchlist filter parity with main list). **Backend:** `WatchlistAuctionFilter` extended for **`profitable`**, **`needed`**, **`thumbs_up`**; manifest-based **`has_manifest`** filtering aligned with list queryset.

### Fixed

- **Buying:** Pagination **snap-back** on alternate “next page” clicks (grid saw **`rowCount: 0`** while the next page was loading); **has_manifest** filter uses manifest-row existence consistently; **category distribution** mix math; want-vote slider **debouncing**.

### Changed

- **Buying — B-Stock JWT calls:** Token-backed **HTTP from the REST API** is **disabled** (`501` / `token_backed_bstock_disabled` on **`pull_manifest`**, **`poll`**, etc.) — **CSV upload** and soft-touch sweep remain; ban-risk mitigation (see [`apps/buying/api_views.py`](apps/buying/api_views.py)). **Management commands** may still be run manually where applicable.

### Notes (documentation)

- **Parking lot** entries in the initiative file (data backfill, **Groq** cost idea, **`ai_key_mapping.py`** → **`AI_MODEL_FAST`** one-liner, **`ai_key_mapping.py`** model-discussion follow-up). **AI steering:** tooltips on multi-select chips are one short platform-aware line (**`multiSelectChipTooltip`**).

### Initiative

- [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md) — Phase **5** **React UI** shipped (**v2.9.0**); **Phase 6** (outcomes) next.

---

## [2.8.0] — 2026-04-09

### Added

- **Buying — Phase 5 (auction valuation):** **`PricingRule`** (flat **`sell_through_rate`** per taxonomy_v1 category — **19** categories; **no** vendor × category matrix; model shape unchanged) and **`CategoryWantVote`** (staff **`value`** 1–10 per category, **`voted_at`**). **`Auction`** valuation fields: **`ai_category_estimates`**, **`manifest_category_distribution`**, **`estimated_revenue`**, **`revenue_override`**, **`fees_override`**, **`shipping_override`**, **`estimated_fees`**, **`estimated_shipping`**, **`estimated_total_cost`**, **`profitability_ratio`**, **`need_score`**, **`shrinkage_override`**, **`profit_target_override`**, **`priority`**, **`priority_override`**, **`thumbs_up`**. **`Marketplace`** defaults: **`default_fee_rate`**, **`default_shipping_rate`**. Migrations **`0009_phase5_auction_valuation`**, **`0010_auction_fee_shipping_overrides`**.
- **Valuation engine:** **`apps/buying/services/valuation.py`** — **`recompute_auction_valuation`**, **`recompute_all_open_auctions`**, **`compute_and_save_manifest_distribution`**, **`get_valuation_source`**, **`run_ai_estimate_for_swept_auctions`**; retail base from manifest sum or **`total_retail_value`**; **`estimated_revenue`** stored **pre-shrinkage**; **`profitability_ratio`** uses **effective revenue after shrinkage** vs **`estimated_total_cost`**; **`revenue_override`** / **`fees_override`** / **`shipping_override`** semantics per initiative (**`coalesce`** for revenue; fee/shipping overrides **USD** only when set).
- **AI title category estimation:** **`apps/buying/services/ai_title_category_estimate.py`** — **`estimate_batch`** with **`AI_MODEL_FAST`**, few-shot from marketplace, **title_echo** verification.
- **Category need / want:** **`GET /api/buying/category-need/`**; **`GET`/`POST /api/buying/category-want/`** with **`effective_value`** (step decay toward **5** per **`buying_want_vote_decay_per_day`**). **`apps/buying/services/category_need.py`**, **`want_vote.py`**, **`buying_settings.py`**.
- **Staff controls & serializers:** **`POST`/`DELETE /api/buying/auctions/{id}/thumbs-up/`** (Admin); **`PATCH /api/buying/auctions/{id}/valuation-inputs/`** (Admin) — **recompute** on change. **`AuctionFilter`** **`thumbs_up`**; list **`ordering`** includes **`priority`**, **`estimated_revenue`**, **`profitability_ratio`**, **`need_score`**; list/detail serializers expose **`valuation_source`**, **`has_revenue_override`**, **`effective_revenue_after_shrink`**, etc.
- **Seeds & management commands:** **`python manage.py seed_pricing_rules`** (CSV + **`AppSetting`** keys); **`python manage.py seed_marketplace_pricing_defaults`**; **`python manage.py estimate_auction_categories`**; **`python manage.py recompute_buying_valuations`**.
- **Manifest upload hooks:** **`manifest_upload`** computes **`manifest_category_distribution`** and triggers valuation **recompute** when mapping completes (**`upload_manifest`**, **`map_fast_cat_batch`** when queue clears, **`DELETE …/manifest/`**); **`pipeline`** sweep runs limited AI estimate batch + **`recompute_all_open_auctions`**.
- **Tests:** **`apps/buying/tests/test_valuation.py`**, **`apps/buying/tests/test_phase5_category_need.py`**.
- **Documentation & AI steering:** New protocols [`.ai/protocols/get_bearing.md`](.ai/protocols/get_bearing.md), [`.ai/protocols/collect_for_consultant.md`](.ai/protocols/collect_for_consultant.md); personas [`.ai/personas/Scout.md`](.ai/personas/Scout.md), [`.ai/personas/Christina.md`](.ai/personas/Christina.md); updates to **`.ai/context.md`**, **`.ai/extended/backend.md`**, **`.ai/extended/bstock.md`**, **`.ai/extended/frontend.md`**, **`.ai/consultant_context.md`**, **`.ai/initiatives/_index.md`**, **`bstock_auction_intelligence.md`**.

### Initiative

- [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md) — Phase **5** backend/API shipped; **next:** Phase **5** React valuation columns (optional) or **Phase 6** outcomes.

---

## [2.7.1] — 2026-04-09

### Added

- **Historical sell-through — consultant PO export:** `python workspace/notes/to_consultant/extract_po_descriptions.py` reads Purchase Orders from local **V1** (`ecothrift_v1`), **V2** (`ecothrift_v2`), and **V3** when `public.inventory_purchaseorder` exists; writes **`workspace/notes/to_consultant/purchase_orders_all_details.csv`** (full PO-level rows, same columns as **`workspace/data/po_descriptions_all.csv`**), plus category distribution / sell-through join outputs and **`po_description_analysis.md`**. Requires root **`.env`** `DATABASE_*`; V3 yields zero rows until inventory migrations / correct DB. Script is tracked in git (see **`.gitignore`** whitelist under **`workspace/notes/to_consultant/`**).

### Changed

- **`.gitignore`:** Whitelist **`workspace/notes/to_consultant/extract_po_descriptions.py`** so the consultant extract is versioned; generated CSV/Markdown under that folder remain ignored.

### Initiative

- [`.ai/initiatives/historical_sell_through_analysis.md`](.ai/initiatives/historical_sell_through_analysis.md) — tooling toward Phase **3** (sales join); consultant deliverable path documented.

---

## [2.7.0] — 2026-04-08

### Added

- **Buying — Phase 4.1B (AI template creation, AI key mapping, upload progress):** Unknown CSV headers → Claude proposes **`column_map`** and **`category_fields`**; new or matched **`ManifestTemplate`** saved with **`is_reviewed=True`**; upload continues in one flow. **`POST /api/buying/auctions/{id}/map_fast_cat_batch/`** processes up to **10** unmapped **`fast_cat_key`** values per request; persists **`CategoryMapping`** with **`rule_origin='ai'`** and updates **`ManifestRow.fast_cat_value`**. **`POST …/upload_manifest/`** Stage **1** (template + rows, synchronous) returns **`unmapped_key_count`** and **`total_batches`**. **`DELETE /api/buying/auctions/{id}/manifest/`** deletes manifest rows only (**`ManifestTemplate`** and **`CategoryMapping`** retained). **`fast_cat_key`** values containing **`__no_key__`** (no category fields on the row) are excluded from AI batches and from unmapped counts. See initiative.
- **AI usage logging:** Append-only **`workspace/logs/ai_usage.jsonl`** with **input** / **output** / **cache_creation** / **cache_read** token fields, **Decimal** cost from **`AI_PRICING`** in **`ecothrift/settings.py`**; **`log_ai_usage`** and **`log_ai_usage_from_response`** in **`apps/core/services/ai_usage_log.py`**; retrofitted across AI call sites (chat proxy, inventory AI, buying **`category_ai`**, management commands, 4.1B services). **`scripts/ai/summarize_ai_usage.py`** and **`scripts/ai/summarize_ai_usage.bat`** — totals, by source, by marketplace, by date, last **10** calls, cache stats, interactive clear.
- **Frontend — Buying:** **`ManifestUploadProgress`** and Stage **2** driver (**four** concurrent **`map_fast_cat_batch`** workers); progress bar, running estimated cost, latest mapping label, cancel; **debounced** React Query invalidation (~**1** s) for live **Manifest Rows** and category mix; **Remove manifest** inside manifest card with confirmation; drop/replace controls hidden while **`mapping`**; two-column layout aligned with flex (**`flex: 1`** manifest content card). **`frontend/src/components/buying/ManifestUploadProgress.tsx`**, **`AuctionDetailPage`**.

### Changed

- **Settings / pricing:** **`AI_MODEL`**, **`AI_MODEL_FAST`** (from **`.env`** with defaults in **`ecothrift/settings.py`**); **`AI_PRICING`** per-model rates (Sonnet, Opus, Haiku — input, output, cache write, cache read per million tokens); **`BUYING_CATEGORY_AI_MODEL`** unified as alias to **`AI_MODEL`**. Prompt caching via **`cache_control: {"type": "ephemeral"}`** on system content blocks. **`.env.example`** updated.

### Notes (documented, non-blocking)

- **`DELETE manifest`:** TODO on wrong-marketplace CSV leaving stale AI **`CategoryMapping`** prefixes after row removal — future admin tooling or **`purge_ai_mappings`** option ([`apps/buying/api_views.py`](apps/buying/api_views.py)).
- **Cache hit rate ~0** on fast-cat key batches: prompts under Sonnet **2048**-token minimum cache threshold; no action required.

### Initiative

- [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md) — Phase **4.1B** shipped; **next: Phase 5** (auction valuation).

---

## [2.6.1] — 2026-04-10

### Added

- **Buying — Phase 4.1A (manifest templates, `fast_cat_key`, static seed):** `ManifestTemplate` model; **`POST /api/buying/auctions/{id}/upload_manifest/`** (multipart CSV); template detection + **`python manage.py seed_fast_cat_mappings`** (343 vendor `fast_cat_key` → taxonomy_v1 rows, fully inlined — no workspace file dependency). See initiative.

### Changed

- **Buying — auction list UI:** All DataGrid columns sortable (including marketplace, title, condition, status, manifest); **Total retail** shows whole dollars with **manifest sum vs listing sweep** via API fields **`total_retail_display`** / **`retail_source`** (tooltip); **Manifest** column shows row count when present; marketplace chip UX: single-click isolates one vendor, **Ctrl/⌘+click** multi-select, helper copy + info tooltip; React Query **refetchOnMount** for auction list and summary so returning from detail shows fresh manifest flags.
- **Buying — auction detail UI:** Two-column layout (metadata card | manifest card); **Open on B-Stock** link lives under manifest drop zone; **Has manifest** badge driven by row count; category mix bar shows **all** canonical categories (no rolled-up “Other”); manifest table **search** + **fast category** filter (server-side **`search`** / **`category`** on **`GET …/manifest_rows/`**).
- **Buying — API:** List queryset annotates manifest retail sum and **`retail_sort`** for ordering; auction detail **`category_distribution`** returns full category list; successful CSV upload sets **`Auction.has_manifest`**.

### Initiative

- [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md) — Phase **4.1A** manifest upload + fast-cat seed shipped; Phase **5** (valuation) still next.

---

## [2.6.0] — 2026-04-10

### Added

- **Buying — Phase 3 (watchlist polling, snapshots, price history):** **`python manage.py watch_auctions`**; **`GET /api/buying/auctions/{id}/snapshots/`**; **`POST /api/buying/auctions/{id}/poll/`**; auction detail price chart (Recharts) / table on small screens; **`AuctionSnapshot`** time series.

- **Buying — Phase 4 (fast categorization):** **`CategoryMapping`** model; **`ManifestRow.canonical_category`** / **`category_confidence`**; **`apps/buying/taxonomy_v1.py`**; **`seed_category_mappings`**, **`categorize_manifests`** (tier 1 + 3; **`--ai`** / **`--ai-limit`** for Claude tier 2); **`categorize_manifest_rows`** after manifest pull; API **`category_distribution`**; auction detail **category bar** + **chips**.

### Fixed

- **Buying — manifest retail:** **`normalize.py`** converts B-Stock minor-unit integers to dollars where applicable (**`_manifest_retail_to_dollars`**); **`renormalize_manifest_rows`** reapplies to existing rows.

### Changed

- **Initiative** [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md): Phases **3–4** acceptance complete; **Phase 7** removed from phased plan; **Operational notes** (soft-touch vs invasive sweep, manual manifest path, ban mitigation); **Open questions** updated (ban risk, retrospective deferred). **Consultant:** [`.ai/consultant_context.md`](.ai/consultant_context.md) aligned.

### Initiative

- [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md) — **Phases 3–4 complete.** **Next: Phase 5** (auction valuation).

---

## [2.5.0] — 2026-04-08

### Added

- **Buying — Phase 2 close-out (2B auction detail, 2C watchlist page, manifest normalization):** Staff React routes **`/buying/auctions/:id`** (`AuctionDetailPage`) and **`/buying/watchlist`** (`WatchlistPage`); sidebar **Buying** links **Auctions** + **Watchlist**. Detail: metadata, pull manifest, star watchlist toggle, manifest **DataGrid** (server pagination, 50/page) or mobile cards + load more. **Watchlist:** **`GET /api/buying/watchlist/`** (auction list shape + nested **`watchlist_entry`**, filters **`priority`** / **`watchlist_status`**, ordering **`end_time`**, **`current_price`**, **`total_retail_value`**, **`added_at`**; default **`end_time`** ascending); remove via existing **`DELETE /api/buying/auctions/:id/watchlist/`** with list invalidation. **Manifest normalization:** **`apps/buying/services/normalize.py`** maps B-Stock order-process JSON (nested **`attributes`**, **`attributes.ids`**, **`uniqueIds`**, **`categories`**, **`itemCondition`**, etc.); optional unmapped-key warnings; **`python manage.py renormalize_manifest_rows`** (no JWT). Unit tests: **`apps/buying/tests/test_normalize_manifest.py`**.

### Changed

- **Phase 2A** (auction list UI) shipped in **v2.4.1**; this minor release completes **Phase 2** under [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md).

### Initiative

- [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md) — **Phase 2 (2A–2C) complete.** Next: **Phase 3** (watchlist polling, **`AuctionSnapshot`**, price history).

---

## [2.4.1] — 2026-04-08

### Added

- **Buying — auction list API (staff):** **`GET /api/buying/auctions/`** (paginated, filters, ordering), **`GET /api/buying/auctions/:id/`**, **`GET /api/buying/marketplaces/`**, **`GET /api/buying/auctions/summary/`** (global `last_refreshed_at` + per-marketplace counts), **`POST /api/buying/sweep/`** (runs `pipeline.run_discovery`). **`AuctionFilter`:** `marketplace` accepts comma-separated slugs (`__in`). Contract listings (`listingType` **CONTRACT**) excluded from default list queryset; detail by id still allowed. Model fields **`listing_type`**, **`total_retail_value`** (from B-Stock search `listingType` / `retailPrice`); migration **`0004_auction_listing_type_total_retail`**.

### Changed

- **Frontend — Buying:** Staff routes **`/buying/auctions`** — DataGrid (desktop) + card list with infinite scroll (below **`md`**); marketplace chips as toggle filters with **All** reset (tap last-only chip resets all); global summary counts; last-refreshed label; sequential **Refresh auctions** per marketplace with progress text, spinner, snackbar (partial failures listed); **Load more (N remaining)** on mobile. Shared helpers **`frontend/src/utils/buyingAuctionList.ts`**; split **`AuctionListDesktop`**, **`AuctionListMobile`**, **`AuctionMarketplaceChips`**; **`useBuyingAuctionsInfinite`**. Removed unused **`useBuyingSweep`** hook (sweep calls **`postBuyingSweep`** directly).

### Initiative

- [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md) — Phase 2A auction list shipped; Phase 2B detail / manifests / watchlist next.

---

## [2.4.0] — 2026-04-07

### Added

- **Buying / B-Stock (Phase 1 complete):** Django app **`apps/buying/`** with models, services (**`scraper`**, **`pipeline`**, **`normalize`**), management commands **`sweep_auctions`**, **`pull_manifests`**, **`bstock_token`**; **`POST /api/buying/token/`** (DEBUG or localhost) writes **`workspace/.bstock_token`**; rejects JWE cookie tokens (`eyJhbGciOiJSU0EtT0FF`). **`scripts/refresh_bstock.bat`**. Bookmarklet and docs: **`apps/buying/bookmarklet/bstock_elt_bookmarklet.md`**. Notebook workbench: **`workspace/notebooks/bstock-intelligence/README.md`**. Initiative: [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md).

### Changed

- **Buying / B-Stock scraper:** Microservice URLs (`search.bstock.com`, `auction.bstock.com`, `listing.bstock.com`, `order-process.bstock.com`, `shipment.bstock.com`). Settings: **`BSTOCK_AUTH_TOKEN`**, **`BUYING_REQUEST_DELAY_SECONDS`**, **`BSTOCK_MAX_RETRIES`**, **`BSTOCK_SEARCH_MAX_PAGES`**. **`DEBUG`** CORS adds **`https://bstock.com`** / **`https://www.bstock.com`** for bookmarklet **`fetch`**. **`get_manifest`**: **`limit`** capped at **1000** per request; paginates with **`offset`** until **`total`** rows. Search listing mapping: **`categories`**, **`winningBidAmount`**, **`numberOfBids`**, **`auctionUrl`**, **`has_manifest`** when **`lotId`** is set; **`merge_auction_state_into_fields`** fills **`startPrice`**, **`buyNow.price`**, **`winningBidAmount`**; money helper treats integers **>= 10000** as cents.

- **Docs / env:** **`.env.example`**, **`.ai/extended/backend.md`**, **`.ai/extended/development.md`**, **`.ai/context.md`**, **`README.md`**, **`workspace/notebooks/README.md`**, **`workspace/notebooks/_shared/README.md`**, **`.ai/initiatives/_index.md`** (B-Stock row).

### Baseline (release verification)

- **`python manage.py sweep_auctions`:** **97** listing rows upserted across **6** active marketplaces (full pagination run).
- **`python manage.py pull_manifests`:** ran; **0** new manifest rows written in this run (existing rows already present for eligible auctions).
- **Postgres snapshot after sweep:** **98** `Auction` rows, **67,276** `ManifestRow` rows (cumulative across this and prior sessions).

---

## [2.3.0] — 2026-04-07

### Added

- **Buying / B-Stock (Phase 1):** New Django app **`apps/buying/`** for auction intelligence: models `Marketplace`, `Auction`, `AuctionSnapshot`, `ManifestRow`, `WatchlistEntry`, `Bid`, `Outcome`; server-side services **`discover_auctions`**, **`get_auction_detail`**, **`get_manifest`** (manifest URL optional until DevTools capture); **`python manage.py sweep_auctions`** and **`python manage.py pull_manifests`**; Postgres-backed persistence; Django admin registration. Configuration via **`BSTOCK_*`** and **`BUYING_REQUEST_DELAY_SECONDS`** in `.env` (see **`.env.example`**). Explicit **`requests`** dependency in **`requirements.txt`**. Notebook workbench: **`workspace/notebooks/bstock-intelligence/README.md`**. Initiative: [`.ai/initiatives/bstock_auction_intelligence.md`](.ai/initiatives/bstock_auction_intelligence.md).

---

## [2.2.10] — 2026-04-07

### Changed

- **Category research — single-database exports:** **`export_category_bins`** uses Django’s **`default`** connection only. Bins 1–2 run schema-qualified SQL against **`public.*`** (V2-era inventory/POS); Bin 3 uses **`ecothrift.*`**. Removed optional **`DATABASES['legacy']`** / **`CATEGORY_LEGACY_DATABASE_NAME`** from settings — one Postgres database can hold both schemas. SQL script headers and **`workspace/testing/Category Research/`** docs updated accordingly. Initiative (now archived): [`.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md`](.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md).

---

## [2.2.9] — 2026-04-06

### Added

- **POS — unscannable (pink tag) line:** **`POST /api/pos/carts/{id}/add-manual-line/`** adds a cart line **without** an inventory item (`item` null): `description` (required), optional `unit_price` (default **0.50**), optional `quantity` (default 1). Rejects non-open carts. No `ItemScanHistory` row. Terminal: **Unscannable item** button, dialog (defaults **Pink Tag Item** / **0.50**), description field selected on open, **OK** / Enter submits; cart lines show a **Pink tag** chip when `item` is null. Tests: `apps/pos/tests/test_cart_manual_line.py`. Initiative: [`.ai/initiatives/_archived/_completed/pos_unscannable_manual_line.md`](.ai/initiatives/_archived/_completed/pos_unscannable_manual_line.md).

---

## [2.2.8] — 2026-04-06

### Added

- **POS — sold SKU and resale copy:** Scanning a sold unit returns structured errors (`ITEM_ALREADY_SOLD`, `sku`, `title`). **`ItemScanHistory`** extended with `outcome`, optional `cart` and `created_by`; blocked scans log `pos_blocked_sold`. **`POST /api/pos/carts/{id}/add-resale-copy/`** atomically duplicates a sold item for resale ([`apps/inventory/services/resale_duplicate.py`](apps/inventory/services/resale_duplicate.py)) and adds a line with **`resale_source_sku`** / **`resale_source_item_id`** for staff reporting. Terminal: modal (**Cancel** vs **Create copy and add to cart**). Transactions detail (`/pos/transactions`) shows a staff-only resale caption; printed receipts use normal line **description** only (no internal provenance on the customer copy). Tests: `apps/pos/tests/test_cart_add_item_audit.py`, `test_cart_add_resale_copy.py`. Initiative: [`.ai/initiatives/pos_sold_item_scan_ux_and_audit_trail.md`](.ai/initiatives/pos_sold_item_scan_ux_and_audit_trail.md).

### Deployment

- **Migrations:** apply `inventory` (ItemScanHistory) and `pos` (CartLine resale columns): `python manage.py migrate`.

---

## [2.2.7] — 2026-04-06

### Fixed

- **POS — cart totals:** `Cart.recalculate()` now sums line totals from the database instead of `cart.lines.all()`, which could reuse a stale `prefetch_related` cache after `add-item` or line edits so header/footer totals lagged line rows. Regression tests: `apps/pos/tests/test_cart_totals.py`. Initiative: [`.ai/initiatives/pos_cart_total_stale_prefetch_bug.md`](.ai/initiatives/pos_cart_total_stale_prefetch_bug.md). For local runs without a PostgreSQL test database, use `python manage.py test apps.pos.tests --settings=ecothrift.test_settings` (SQLite in-memory via [`ecothrift/test_settings.py`](ecothrift/test_settings.py)).

- **Routing — Django admin vs React `/admin/*`:** Django **`contrib.admin`** moved from **`/admin/`** to **`/db-admin/`** so hard refresh and direct URLs to in-app pages (e.g. **`/admin/settings`**, **`/admin/users`**) load the React SPA instead of Django’s admin login. Production SPA fallback no longer excludes **`admin/`**; Vite dev proxy targets **`/db-admin`** only. Exact **`/admin`** / **`/admin/`** redirects to **`/db-admin/`** for bookmarks to the old Django admin root. Superusers who used Django Admin at **`/admin/`** should open **`/db-admin/`**. Initiative (archived completed): [`.ai/initiatives/_archived/_completed/django_admin_legacy_navigation.md`](.ai/initiatives/_archived/_completed/django_admin_legacy_navigation.md).

---

## [2.2.6] — 2026-03-31

### Changed

- **Inventory — Retag:** After a successful multi-unit tag (**Labels / qty** > 1), the qty control resets to **1** for the next scan. **Outside initiative** — UX polish (`RetagPage.tsx`).

---

## [2.2.5] — 2026-03-31

### Added

- **Inventory — Retag:** **Labels / qty** (1–50) on **`/inventory/retag`** creates that many new DB3 items (unique SKUs, one `RetagLog` per unit) per scan or manual confirm. **`POST /api/inventory/retag/v2/create/`** accepts optional **`quantity`** (default 1) and returns **`created`** (per-item `new_sku` + `print_payload`). The browser prints each label with the existing local print server **`POST /print/label`** only, staggered **200 ms** between jobs (no new print-server routes).

---

## [2.2.4] — 2026-03-28

### Fixed

- **Layout — sidebar:** Prevent horizontal scrollbars in the left nav: drawer paper and scroll region use **`overflow-x: hidden`**; nav list is full-width with **`minWidth: 0`**; long labels **ellipsis**; section chevrons and icons **`flexShrink: 0`**. **Outside initiative** — UI polish only (`MainLayout.tsx`, `Sidebar.tsx`).

---

## [2.2.3] — 2026-03-28

### Added

- **Inventory — Item detail:** After **Save**, if **price**, **title**, or **brand** changed, a **non-blocking warning banner** (fade + auto-dismiss) recommends **reprinting the label**, with a **Reprint label** action. Initiative closure: [`.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md`](.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md).

### Changed

- **Inventory — Quick Reprice:** **Default 10%** off current price; radio/helper copy updated; **Discount Settings** remains **above** the scan row. **“This Session”** still titled that way; list + totals persist **this browser · local calendar day** (`localStorage`, new list after **local midnight**). Subtle caption under the card explains scope.

---

## [2.2.2] — 2026-03-27

### Added

- **Steering:** Initiative **archiving** requires **explicit user approval** (documented in [`.ai/initiatives/_index.md`](.ai/initiatives/_index.md), [`_archived/ARCHIVE.md`](.ai/initiatives/_archived/ARCHIVE.md), [`.ai/protocols/startup.md`](.ai/protocols/startup.md), [`.ai/protocols/session_close.md`](.ai/protocols/session_close.md), [`.ai/context.md`](.ai/context.md)). Initiative [`e2e_retag_quick_reprice_fixes.md`](.ai/initiatives/e2e_retag_quick_reprice_fixes.md) **restored** to the active index with expanded scope *(now archived as [completed](.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md)).*
- **Inventory — Quick reprice (sold units):** **`POST /api/inventory/items/:id/duplicate-for-resale/`** (staff) creates a new **on-shelf** item from a **sold** row; **`POST /api/inventory/items/:id/mark-on-shelf/`** (Manager/Admin) when no completed POS sale exists. **Quick Reprice** dialog: **Create unsold copy & reprice**, **Mark on shelf again**, **Cancel**.
- **Inventory — Quick reprice UX:** **This Session** card with **expand/collapse** (chevron) listing all repriced items with links to **`/inventory/items/:id`**. **`?sku=`** query prefill when opening Quick Reprice from item detail.
- **Inventory — Item detail:** **Print tag** and **Reprice** (deep-link to Quick Reprice with `?sku=`). Initiative: [`e2e_retag_quick_reprice_fixes.md`](.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md).

### Fixed

- **Inventory — Quick reprice:** Item list ignored `?sku=` (DRF search uses `search`, not `sku`). Added exact **`sku`** to `ItemViewSet` filterset fields so scans resolve the correct row. **Quick Reprice** uses the shared API client, normalizes SKU, shows **status**, blocks non-sellable statuses; **`POST .../quick-reprice/`** rejects disallowed statuses with HTTP 400.
- **Inventory — Retag history:** History fetch failures show an error alert; summary tiles distinguish **all-time totals** vs **tags this visit** vs **this session only** (server log count).

### Changed

- **Initiatives layout:** Replaced `.ai/plans/` with `.ai/initiatives/` (main `_index`, `_archived/` buckets). Updated `.ai/context.md`, protocols, extended docs, notebook links.
- **Documentation layout:** Setup in `.ai/extended/development.md`; removed standalone `docs/` tree from prior layout; E2E checklist under `workspace/testing/`.

---

## [2.2.1] — 2026-03-25

### Added
- **Print server Windows installer:** `cleanup_legacy_prior()` in `printserver/installer/setup.py` removes legacy V2 stack (Startup `Eco-Thrift Print Server.vbs`, `C:\DashPrintServer` / `C:\PrintServer` when `print_server.py` + `venv\` exist) and frees port 8888 before installing V3; same cleanup runs at start of uninstall. Optional IT batch: `printserver/installer/uninstall_legacy_prior.bat`.
- **Print server** bumped to **1.0.7** (`printserver/config.py`, `CHANGELOG`) for the installer change.

### Changed
- **AI / steering docs:** `.ai/extended/print-server.md`, `.ai/plans/print_server_v3_testing_and_migration.md`, `.ai/reference/PrintServer (V2)/LEGACY_UNINSTALL.md` aligned with in-installer migration (no standalone `scripts/printserver_uninstall_all`); `.ai/context.md` and `README.md` updated.
- **`docs/development.md`:** Print server notes and layout table; this repo’s `docs/` tree may only contain this file plus any other paths you keep locally.

---

## [2.2.0] — 2026-03-25

### Added
- **B-Stock notebook scraper package:** `workspace/notebooks/Scraper/` with `BStockScraper` (`get_auctions`, `update`, `save_to_disk`), HTTP client + config loader, optional Playwright module (`python -m Scraper.browser`), experimental `refresh_token` helper, `examples/bstock_quickstart.ipynb`, CLI `python -m Scraper` when run from `workspace/notebooks`. Secrets in gitignored `Scraper/bstock_config_local.py` (template: `Scraper/config.example.py`).

### Changed
- **Notebooks docs:** `workspace/notebooks/README.md` and `docs/development.md` updated for `Scraper/` layout; `.ai/plans/bstock_scraper.md` and plans index refreshed.

### Removed
- Flat B-Stock scripts at `workspace/notebooks/` root (`bstock_scraper.py`, `bstock_scraper_browser.py`, `bstock_refresh_token.py`, `bstock_config.example.py`) — replaced by the `Scraper` package.

---

## [2.1.0] — 2026-03-24

### Added
- **Purchase order reset safety:** `GET /api/inventory/orders/:id/delete-preview/` and `POST /api/inventory/orders/:id/purge-delete/` (order-number confirmation).
- **Preprocessing preview search:** Server-side search over full raw manifest and full standardized output (top-100 preview window per endpoint).
- **Project / AI layout (BEST-spec alignment):** Repo root `.version` and `CHANGELOG.md`; `.ai/protocols/` (`startup.md`, `session_close.md`, `get_bearing.md`); `.ai/plans/_index.md` and `plans/archive/`; `.ai/reference/`; committed `scripts/dev/` (`start_servers.bat`, `kill_servers.bat`) and `scripts/deploy/commit_message.txt`.
- **Root spec:** `2.EcoThrift.project_build_spec.md` describing layout, versioning, and protocols.
- **Multi-DB Jupyter:** Tracked `workspace/notebooks/` (selective gitignore): `README.md`, `config.example.py`, `db_explorer.ipynb` — SQLAlchemy + pandas helpers, pickles dir ignored; optional `requirements-notebooks.txt` (includes former ML deps).
- **`.ai/extended/databases.md`:** DB1 / DB2 / DB3 overview; credentials stay out of repo; points to `docs/Database Audits/`.

### Changed
- **App version API:** `GET /api/core/system/version/` reads repo root `.version` only; response still includes `build_date` / `description` as null/empty (reserved).
- **Dependencies:** Merged `requirements-ml.txt` into `requirements-notebooks.txt`; updated `train_price_model`, `categorizer`, `docs/retag/after_retag.md`, and related docs.
- **Notebooks:** `db_explorer.ipynb` resolves notebook dir when Jupyter cwd is repo root; optional `NOTEBOOK_DIR` env; `config_local.py` (gitignored) can load `DATABASE_*` from project `.env`.
- **Preprocessing UI:** Multi-open 3-step accordion (upload → raw sample → standardize); taller default viewports for raw/standardized tables; Inventory and POS sidebar sections collapsible like HR.
- **Docs:** `README.md`, `docs/architecture.md`, `docs/development.md`, `docs/api-reference.md`, `.ai/context.md` updated for new paths and versioning.

### Removed
- `.ai/version.json` and `.ai/changelog.md` (superseded by root `.version` + `CHANGELOG.md`).
- `.ai/procedures/` (replaced by `.ai/protocols/` with merged content).
- `.ai/extended/TOC.md` (extended docs indexed by filename).
- `requirements-ml.txt` (merged into `requirements-notebooks.txt`).

---

## [2.0.0] — 2026-03-04

### Added
- **Retag v2 — DB2→DB3 Migration System**: Full on-site retag workflow. `TempLegacyItem` model (staging table of active DB2 items, populated by `import_db2_staging`). `RetagLog` model (per-event log for retag day). Three `retag_v2_*` API endpoints (`lookup`, `create`, `history`). `RetagPage.tsx` at `/inventory/retag`. Supports 4 price strategies (keep current / % of current / AI estimate / % of retail), auto-print on scan, non-blocking "already retagged" snackbar warnings, always creates a new DB3 item per scan. Paginated history panel with summary tiles (total tagged, sum retail, sum price), search, and session filter. **Both `TempLegacyItem` and `RetagLog` are temporary scaffolding — drop after retag day.**
- **Pricing Model Foundation**: Management commands scaffolded: `import_historical_sold` (~145K sold items from DB1+DB2 for ML training data), `import_historical_transactions` (~68K transactions into `HistoricalTransaction` for multi-generation revenue reporting), `train_price_model` (gradient-boosted price estimator, output to `workspace/models/price_model.joblib`), `backfill_categories` (retroactive category classifier). Ready to run after retag day.
- **`very_good` condition**: Added `('very_good', 'Very Good')` to `CONDITION_CHOICES` on `Item`, `ManifestRow`, and `BatchGroup` models (migration `0010_add_very_good_condition`).
- **Database audits**: Full schema and row-count audits in `docs/Database Audits/` for DB1 (`ecothrift_v1` archive), DB2 local snapshot (`ecothrift_v2`), DB3 / Django dev (`ecothrift_v3`).
- **Retag day ops docs**: `docs/retag/before_retag.md` (prep checklist, data clearing, end-to-end test plan, price strategy guide) and `docs/retag/after_retag.md` (cleanup, historical import, model training, deployment checklist).

---

## [1.9.1] — 2026-02-26

### Fixed
- **POS `CartFilter` `status=open` fallthrough**: `filter_status` only handled `all`, `completed`, `voided` — `open` fell through returning all carts (including voided ones), causing voided carts to be restored on mount. Added `open` to the handled values.
- **Prefetch cache staleness after cart mutations**: `CartViewSet` uses `prefetch_related('lines')` which caches lines on the object. After `add_item` and `manage_line` mutations the serializer read stale prefetch cache, returning data one step behind. Fixed by re-fetching cart via `self.get_queryset().get(pk=cart.pk)` after `recalculate()`.
- **Cart restore stale React Query cache on navigation**: `useCarts` React Query hook served stale cached data instantly on `TerminalPage` remount, restoring an outdated cart before the fresh network response arrived. Replaced with direct `getCarts()` API call in a `useEffect` that always makes a fresh network request.
- **Duplicate CartLines on repeated item scan**: `add_item` was creating a new `CartLine` every time the same SKU was scanned. Now increments `quantity` on the existing line instead.

### Added
- **Inline cart line editing**: Edit icon per line opens in-place `TextField`s for `quantity`, `description`, and `unit_price`. Backend `manage_line` action serves both `PATCH` (update) and `DELETE` (remove) on `lines/{line_id}/`.
- **Void Sale button**: Red "Void" button + `ConfirmDialog` on terminal. Calls `POST /pos/carts/{id}/void/`. Voided carts visible in Transactions by default (status filter defaults to `all`).
- **Drawer reopen**: `POST /pos/drawers/{id}/reopen/` (Manager+) reopens a closed drawer. UI button on closed-drawer cards in `DrawerListPage`.
- **Terminal state machine**: `TerminalState` union + `deriveTerminalState()` drives full-page UI branching (unconfigured / loading / no_drawer / drawer_open_other / ready+active_sale / drawer_closed / manager_mode).
- **Lazy cart creation**: Cart is created on first item scan rather than on an explicit "Start Sale" button. Sale interface shown immediately when drawer is open/ready.

---

## [1.9.0] — 2026-02-25

### Added
- **Processing Page Overhaul** (`ProcessingPage.tsx`): full "Command Center + Side Drawer" redesign
- `useLocalPrintStatus` hook: polls `/health` every 30s, exposes `online`/`version`/`printersAvailable`; persistent green/gray status chip in PageHeader
- Print server graceful degradation: check-in succeeds even when print server offline; warning snackbar + reprint recovery on Checked In tab
- Staggered batch label printing via `Promise.allSettled` with 200ms stagger and inline "Printing X/Y labels..." progress alert
- **MUI Autocomplete order selector** with search, status chips, and per-order progress indicators replacing basic dropdown
- **Circular progress ring** (% complete) + stats chips (on-shelf, pending, batches) in order context bar
- **Always-visible SKU scanner input** with F2 hotkey focus; Enter searches items by SKU and auto-opens side drawer
- **Three-tab queue** (Batches / Items / Checked In) with badge counts; tab selection persists across interactions
- **Right-side MUI Drawer** (`ProcessingDrawer.tsx`) replaces center dialog; shows form + collapsible source data context (product, brand, cost, batch info)
- **Checked In tab**: DataGrid of completed items sorted by check-in time with per-row reprint button
- **Bulk check-in**: checkbox column on Items tab, floating "Bulk Check-In" dialog with shared condition/location/price/cost overrides; calls existing `check-in-items` endpoint; prints staggered labels
- **Detach confirmation popover**: replaces immediate action; shows warning before detaching item from batch
- **Keyboard shortcuts**: F2 (scanner focus), Ctrl+Enter (check-in), Escape (close drawer), Ctrl+P (reprint), N (next item)
- **Auto-advance**: after check-in automatically opens next pending item; toggle switch in stats bar (default ON)
- **Sticky defaults**: condition + location persist in `localStorage` under `processing_sticky_defaults`; pre-fill empty fields on open
- **Copy from Last**: button in drawer copies condition/location/notes from most recently checked-in item
- **Session stats bar** (`ProcessingStatsBar.tsx`): elapsed time, items/hour rate, ETA, session item count, auto-advance toggle
- **Back to Preprocessing** navigation button in PageHeader when an order is selected
- `useItems` and `useBatchGroups` hooks accept `enabled` parameter to prevent fetching all items when no order selected

### Changed
- `queueNotBuilt` logic broadened: triggers for both `delivered` and `processing` status with zero items (was `delivered` only)
- Items query limit raised from 500 to 1000 for large orders
- Replaced local `formatCurrency` in ProcessingPage with shared `formatCurrency` from `utils/format.ts`
- DataGrid density set to `compact` across all three tabs for higher information density

---

## [1.8.0] — 2026-02-25

### Added
- **Local Print Server** (`printserver/`): standalone FastAPI server on `127.0.0.1:8888` for label, receipt, and cash drawer printing via Windows GDI/ESC-POS
- Built-in browser UI at `/` (printer assignment dropdowns, test buttons) and `/manage` (status, auto-start toggle with Enabled/Disabled label, version check, changelog, uninstall)
- Windows self-contained installer (`ecothrift-printserver-setup.exe`) with Tkinter GUI, registry auto-start, port-kill on reinstall
- `distribute.bat` / `distribute.py`: builds both exes, uploads setup exe to S3, registers release in Django DB using management commands — no credentials required
- Django `publish_printserver` management command for credential-less release registration
- Public (no-auth) `print-server-version-public` endpoint for version checks from the print server management page
- Admin SettingsPage redesigned: printer assignment dropdowns, test label/receipt/drawer buttons, Client Download section, Online chip links to `/manage`
- Server-side update-check proxy (`/manage/check-update`) to avoid browser CORS restrictions
- `CORS_ALLOWED_ORIGINS` updated to include `127.0.0.1:8888`

---

## [1.7.0] — 2026-02-21

### Added
- **Preprocessing Undo System**: Every preprocessing step has a working undo with cascade confirmation. `deriveCompletedStep()` is the single source of truth for step completion state. Backend endpoints: `undo-product-matching` (Step 3), `clear-pricing` (Step 4). `cancel-ai-cleanup` updated to cascade and also clear Step 3 matching fields.
- **6-State Step 1 Button Logic**: Standardize step derives state (clear/partial/ready/done/edited/edited_partial) from formula state and standardization status. Two separate button rows: primary actions (Standardize/Re-standardize/Undo) and formula-level actions (Clear Formulas/Cancel Edits/Use AI). Tracks formulas at standardization time via ref for edit detection.
- **Complete Preprocessing in Breadcrumbs**: "Complete Preprocessing" button rendered inline at end of breadcrumb chip row (visible when Step 4 active, all rows priced, not yet finalized).
- **Shared Formatting Utilities**: `formatCurrencyWhole` (commas, no decimals), `formatCurrency` (commas, 2 decimals), `formatNumber` (locale-formatted counts) in `frontend/src/utils/format.ts`. Applied across OrderListPage, OrderDetailPage, FinalizePanel.
- **Auto-Build Check-In Queue on Deliver**: `deliver` endpoint automatically creates Items + BatchGroups when manifest rows exist and no items exist. Eliminates manual "Build Check-In Queue" step for the standard flow. `create-items` endpoint preserved for edge cases (manifest processed after delivery).
- **Section Dividers**: `<Divider>` components between major sections in all 4 preprocessing step panels for visual clarity.

### Changed
- **Breadcrumb Navigation**: Removed all "Continue to..." / "Next Step" / "Confirm Products" navigation buttons from Steps 1-3. Navigation is exclusively via breadcrumb chips with 4 visual states (selected/done/ready/notReady with pulse animation). Accept All in Step 3 now also confirms/submits decisions.
- **OrderDetailPage**: All 4 action buttons (Back/Preprocessing/Processing/Delete) merged into PageHeader row. Separate "Go To" card removed.
- **OrderListPage**: Actions column moved to first position with 'Actions' header.
- **Step 2 Buttons**: Renamed (Run Cleanup, Pause Cleanup, Restart Cleanup, Cancel Cleanup, Clear Cleanup). Removed Re-run when done — only Clear shown.
- **Step 3 Accept All**: Only visible when undecided matched rows exist; shows count.
- **Step 4 renamed**: "Review & Finalize" → "Pricing" throughout.
- **Preview Empty State**: Changed from "Click Preview Standardization" to "Preview will appear when formulas are applied."
- **ConfigurablePageSizePagination**: Custom DRF pagination class allows client to specify `page_size`.

### Fixed
- Processing page "No rows" issue: broadened `queueNotBuilt` logic to always render queue sections when an order is selected.
- `deliver` endpoint now auto-creates items from manifest rows, preventing "Build Check-In Queue" friction.

---

## [1.6.0] — 2026-02-18

### Added
- **AI Integration Foundation** (`apps/ai/`): New Django app with `ChatProxyView` (POST `/api/ai/chat/`) and `ModelListView` (GET `/api/ai/models/`) proxying Anthropic Claude API. Models: `claude-sonnet-4-6`, `claude-haiku-4-5`.
- **Expression-Based Formula Engine** (`apps/inventory/formula_engine.py`): Full expression parser supporting `[COLUMN]` refs, functions (`UPPER`, `LOWER`, `TITLE`, `TRIM`, `REPLACE`, `CONCAT`, `LEFT`, `RIGHT`), `+` concatenation, and quoted string literals. Used by `normalize_row()` alongside legacy source+transforms path.
- **AI-Assisted Row Cleanup**: `POST /api/inventory/orders/:id/ai-cleanup-rows/` sends manifest rows to Claude in batches for title/brand/model/specs cleanup. Supports `batch_size` and `offset` for frontend-driven batch processing.
- **AI Cleanup Status & Cancel**: `GET ai-cleanup-status/` returns progress counts; `POST cancel-ai-cleanup/` clears all AI-generated fields.
- **Concurrent Batch Processing**: Frontend worker pool pattern — configurable batch size (5/10/25/50 rows) and concurrency (1/4/8/16 threads). Up to 16 simultaneous API requests for faster processing.
- **Expandable Row Detail Panels**: Cleanup table rows are expandable with chevron toggle. Expanded view shows side-by-side "Original Manifest Data" vs "AI Suggestions" cards with change highlighting, specifications key-value grid, and AI reasoning quote block. Multiple rows expandable simultaneously.
- **Standalone Preprocessing Page**: Moved from `/inventory/orders/:id/preprocess` to `/inventory/preprocessing/:id` with its own sidebar navigation entry. localStorage persistence of last preprocessed order ID. Legacy route redirects for backward compatibility.
- **Product Matching Engine**: Fuzzy scoring (UPC exact, VendorRef exact, text similarity) + AI batch decisions. New fields on `ManifestRow`: `match_candidates`, `ai_match_decision`, `ai_reasoning`, `ai_suggested_title/brand/model`. Endpoints: `match-products`, `review-matches`, `match-results`.
- **ManifestRow Extended Fields**: `title`, `condition`, `batch_flag`, `search_tags`, `specifications` (JSONField), plus all AI suggestion and match fields. Two new migrations applied.
- Frontend API layer: `ai.api.ts`, `useAI.ts` hooks, `ModelSelector` component, cleanup/status/cancel API functions and React Query hooks.
- `StandardManifestBuilder` reworked for expression text input with syntax highlighting and autocomplete.
- `RowProcessingPanel` with flat form layout: AI cleanup controls, rows table, product matching section, review decisions section.
- `FinalizePanel` with merged pricing controls.

### Changed
- Preprocessing stepper: 4 steps (Standardize Manifest → AI Cleanup → Product Matching → Review & Finalize)
- Manifest upload removed from preprocessing page (stays on Order page)
- `useStandardManifest` hook reworked to use `formulas: Record<string, string>` instead of rules-based state
- `MANIFEST_TARGET_FIELDS` and `MANIFEST_STANDARD_COLUMNS` updated with new fields
- Default batch size changed to 5 rows; default concurrency set to 16 threads

### Fixed
- Infinite re-render loop in `PreprocessingPage.tsx`: `useEffect` dependency on full `order` object replaced with scalar values (`orderVendorCode`, `orderPreviewTemplateName`); `rawManifestParams` useMemo dependency changed from object ref to boolean; `matchSummary` prop memoized with `useMemo`
- Step 4 (Review & Finalize) freeze: template name and step-derived effects guarded to prevent update-depth loop; FinalizePanel table paginated (50 rows/page) to avoid rendering 400+ rows and blocking main thread
- `anthropic` library lazy-imported in `apps/ai/views.py` to prevent `ModuleNotFoundError` at Django startup
- Outdated Claude model IDs replaced: `claude-sonnet-4-5-20250514` → `claude-sonnet-4-6`, `claude-haiku-3-5-20241022` → `claude-haiku-4-5`
- `cancel_ai_cleanup` corrected from `specifications=dict` to `specifications={}`

---

## [1.5.0] — 2026-02-17

### Added
- `PreprocessingPage` at `/inventory/orders/:id/preprocess`: dedicated 3-step stepper wizard (Upload Manifest → Standardize Manifest → Set Prices) extracted from `OrderDetailPage`
- Route added in `App.tsx` for the new preprocessing page
- "Clear All" button in the pricing step to wipe all proposed prices and auto-save
- Warning `Alert` on Step 3 when any manifest rows are missing `retail_value`
- Auto-save on every pricing action (Apply to All, Clear All, individual field blur) with inline saving indicator

### Changed
- `OrderDetailPage` simplified: full preprocessing accordion block removed (~260 lines), replaced with a single "Open Preprocessing" CTA card
- Step 3 pricing UI redesigned: removed mode toggle, all price inputs always editable, no explicit Save Prices button
- `retail_value` mapping is now enforced as required at standardization — `handleStandardizeManifest` blocks with a warning snackbar if unmapped

### Fixed
- Infinite render loop in `PreprocessingPage`: `manualPrices` `useEffect` now uses stable `rowsKey` dependency (row IDs joined as string) instead of `manifestRows ?? []` which created a new array reference every render

---

## [1.4.0] - 2026-02-16

### Added
- New Standard Manifest preprocessing contract with `preview-standardize` and `process-manifest` support for function chains per standard column
- Pre-arrival manifest pricing support on `ManifestRow` (`proposed_price`, `final_price`, `pricing_stage`, `pricing_notes`)
- New pricing endpoint `POST /api/inventory/orders/:id/update-manifest-pricing/` for bulk manifest-row pricing updates
- New check-in endpoints:
  - `POST /api/inventory/orders/:id/check-in-items/` (bulk order check-in)
  - `POST /api/inventory/items/:id/check-in/` (single-item check-in)
  - `POST /api/inventory/batch-groups/:id/check-in/` (batch check-in)
- New check-in tracking fields on items: `checked_in_at`, `checked_in_by`
- New reusable frontend Standard Manifest modules:
  - `useStandardManifest` hook
  - `StandardManifestBuilder` component
  - `StandardManifestPreview` component

### Changed
- Replaced old order preprocessing UI with a cleaner Standard Manifest workflow and primary action **Standardize Manifest**
- Replaced prior processing page with a unified processing workspace centered on:
  - set fields,
  - check in,
  - print tags
- `create-items` now acts as a check-in queue builder and enforces post-delivery creation

### Fixed
- Removed old row-expression preprocessing/filtering flow that caused clunky UX and replaced it with explicit standard-column mapping
- Reduced processing-step/button sprawl by consolidating actions into a single arrival workflow

---

## [1.3.0] - 2026-02-16

### Added
- M3 inventory processing implementation finalized: all units are created as `Item` rows with optional `BatchGroup` acceleration for high-quantity rows
- Full manifest preprocessing flow on order detail page: raw row selection, row-expression selection (`1-50,75`), source-to-target column mapping, and per-field transforms
- Transform support in manifest normalization: `trim`, `title_case`, `upper`, `lower`, `remove_special_chars`, and `replace`
- Header-signature-based template workflow: load prior formulas by manifest header signature and save updated mappings for future uploads
- New inventory endpoint `GET /api/inventory/orders/:id/manifest-rows/` for full CSV row retrieval during preprocessing
- New M3 inventory APIs and UI integrations for product matching, batch group processing, item detachment, item history, and category CRUD

### Changed
- `process-manifest` now parses the full uploaded manifest file (not only preview rows) when explicit `rows` payload is not provided
- Processing page redesigned around M3 queues: Batch Queue + Individual Queue + Detached/Exception items
- Order detail manifest workflow now aligns to M3 sequence: preprocess -> process rows -> match products -> create items+batches -> mark complete
- Inventory and project documentation updated to make M3 the authoritative processing model

### Fixed
- Corrected manifest processing bug where only 20 preview rows were normalized instead of the full uploaded file

---

## [1.2.0] - 2026-02-13

### Added
- Purchase Order 6-step status workflow: ordered → paid → shipped → delivered → processing → complete
- Status action buttons: Mark Paid, Mark Shipped, Mark Delivered with dedicated UX modals
- Status undo buttons: Undo Paid, Undo Shipped, Undo Delivered to revert status changes
- "Shipped" modal with dual modes (Mark Shipped / Edit Shipped) including date pickers for shipped_date and expected_delivery
- Cost breakdown: purchase_cost + shipping_cost + fees = total_cost (auto-computed in model save)
- New PO fields: paid_date, shipped_date, retail_value, condition (dropdown), description, order_number (editable)
- Auto-generated order numbers (PO-XXXXX) with option to provide custom values
- CSV manifest upload persists to S3 with S3File record and manifest_preview JSON field
- S3File download URL via presigned URL property
- Manifest file info bar on detail page with filename, size, upload date, and Download button
- Ordered date editable on both create and edit forms
- Order list view enhanced with Description, Condition, Items, Retail Value columns

### Changed
- PO status choices renamed: `in_transit` → `shipped`, added `paid`
- Edit Order dialog reorganized: Order # + Date → Details → Costs → Notes (consistent across create/edit/detail)
- Create Order dialog now includes all fields matching edit dialog (# Items, condition, retail value, description)
- Upload manifest endpoint now returns full order detail instead of transient preview
- useUploadManifest hook invalidates specific order query for immediate UI refresh

---

## [1.1.0] - 2026-02-13

### Added
- Multi-role user model: User can simultaneously hold Employee, Customer, and Consignee profiles via Django Groups
- User `roles` property returning all assigned group names
- Employee termination workflow: termination type (10 industry-standard types), date, notes, status badge with tooltip
- Consignee account management: create from existing or new user, profile editing, soft-delete
- Consignee detail page with account settings and nested agreements (drop-offs)
- Customer management: full CRUD with auto-generated customer numbers (CUS-XXX)
- POS customer association: scan customer ID (CUS-XXX) at terminal to link customer to cart
- Admin password reset: generates temporary password for any user
- Forgot password flow: request reset token, enter new password (email delivery stubbed)
- Time entry modification requests: employee submit, manager approve/deny
- Phone number formatting utility (formatPhone, maskPhoneInput, stripPhone) applied across all UI
- Reusable ConfirmDialog component for destructive actions
- StatusBadge tooltip support for contextual information on hover
- Item detail page for viewing/editing individual inventory items
- ForgotPasswordPage with multi-step form
- ConsigneeDetailPage with profile editing and agreement management

### Changed
- AccountsPage rewritten to list consignee people (accounts) instead of agreements
- Agreement creation now defaults commission rate from consignee profile, start date to today, terms to standard template
- ConsigneeAccountViewSet uses user ID for lookups (not profile ID)
- DataGrid action columns vertically centered across all pages
- Date input fields use shrunk labels to prevent overlap
- Add Consignee dialog uses ToggleButtonGroup instead of confusing toggle switch

### Fixed
- EmployeeDetailPage crash: departments.map TypeError from paginated API response
- ConsigneeDetailPage 404: ID mismatch between frontend (user ID) and backend (profile ID)

---

## [1.0.0] - 2026-02-13

### Added
- Django 5.2 backend with 6 apps: accounts, core, hr, inventory, pos, consignment
- Custom User model with email-only authentication
- JWT auth with httpOnly cookie refresh tokens and in-memory access tokens
- Role-based access: Admin, Manager, Employee, Consignee (Django Groups)
- React 19 + TypeScript frontend with Vite, MUI v7, TanStack React Query
- 24 page components across dashboard, HR, inventory, POS, consignment, admin, and consignee portal
- Time clock with automatic clock-in (empty body POST)
- Sick leave accrual system (1 hour per 30 hours worked, 56-hour annual cap)
- Inventory pipeline: vendors, purchase orders, CSV manifest processing, item creation
- POS terminal with SKU scanning, cart management, cash/card/split payments
- Cash management: drawer open/close/handoff, cash drops, supplemental drawer, bank transactions
- Denomination breakdown tracking (JSON fields) across all cash operations
- Consignment system: agreements, item tracking, payout generation
- Consignee portal: self-service items, payouts, summary dashboard
- Dashboard with today's revenue, weekly chart, 4-week comparison table, alerts
- Public item lookup by SKU (no auth required)
- Local print server integration service (FastAPI at localhost:8888)
- Seed data management command (groups, admin user, registers, settings)
- Heroku deployment config (Procfile, WhiteNoise, gunicorn)
- Project documentation in docs/
- Developer workspace with bat scripts and Jupyter notebook
