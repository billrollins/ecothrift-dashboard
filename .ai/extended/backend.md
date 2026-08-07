<!-- Last updated: 2026-08-07 (v2.69.0 removed whole-DB wipe commands; Online Sales go-live) -->

# Eco-Thrift Dashboard — Backend Context

**2026-08-07 (v2.69.0) — Online Sales go-live hardening:** Removed whole-database wipe commands (`reset_business_data`, `reset_buying_data`, `create_test_auctions`) and `seed_categories --clear`. Online Sales blank-slate is **`purge_online_sales`** only (DEBUG-gated; prod needs `--force-production --yes`). Webstore migrations `0006`–`0015` add verified holds, `ReservationEvent`, pickup codes, `HoldConfirmation`, staff archive fields, and customer history/delete stamps. Staff customer API soft-deactivates and can send magic-link sign-in.

**2026-07-29 (v2.61.0) — Inventory / orders summary:** **`aggregate_financials`** adds **`in_transit_count`**, **`in_transit_cost`**, **`pallet_count`**, **`sold_last_week`**, **`priced_retail`** on **`GET /api/inventory/orders/summary/`**.

**2026-07-29 (v2.60.0) — POS / Retail QA + dashboard metrics:** **`QualityAudit.updated_at`** (migration **`pos.0025`**); draft DELETE + list `limit`; +/- **`compute_overall_grade`**; week audit count includes off-schedule days. **`GET /api/pos/dashboard/metrics/?weeks=`** (default 8, clamp 2–12); cache key `dashboard:metrics:{date}:{weeks}`; retail days emit **`retail_audit_ids`** + **`form_slug`**. Command **`finalize_stranded_qa_audits`**. Orders **`page-metrics`**: `sold_last_week`, `priced_retail`.

**2026-07-13 (v2.49.0) — Processing / Restorations hub:** Restoration check-in may omit complete grade values (`needs_setup`); returns list includes untouched + desk summary fields (`direction`, `from_family`, `work_verbs`, `unit_kind`, `sale_state`, `decision_reason`); `mark-handled` accepts untouched; queued job `PATCH` may update `processing_handoff` on the check-in snapshot; check-in responses include `restoration_job_id`.

**2026-07-13 (v2.49.0) — Restoration / TARS decision guardrails:** Restoration Processing check-ins may save versioned `processing_handoff` evidence in `ItemCheckIn.defaults_snapshot`, exposed read-only on `RestorationJobSerializer`. `RestorationJob.work_session.decisionWork` schema/catalog v1 is normalized and size-capped by `services/tars_decision_work.py`; grade values and parts/order inputs are server-authoritative for $19.80/hr contribution-per-labor-minute recommendations. Completion requires a compatible selected outcome/grade/action/sale state/reason; identified ordinary evidence overrides are allowed, while mandatory legal/handling/disclosure stop-outs cannot be economically overridden. No migration.

**2026-07-03 (v2.47.2) — Performance:** dashboard metrics date filters → sargable timestamp ranges (`_day_range`); on-shelf aggregate single-query; migration **`inventory.0079`** — `pg_trgm` + trigram GIN on `Item.search_text`/`PurchaseOrder.search_text`, `Item (-checked_in_at, -created_at)` index; `ItemViewSet` `select_related('product__category')`; processing workspace peers/collapse rollups page-scoped, `expected_retail` via DB aggregate. `django.contrib.postgres` added to INSTALLED_APPS.

**2026-07-02 (Unreleased) — Floorplan / element kinds:** **`FloorPlanElementKind`** catalog (migrations **`0003`–`0004`**, 19 seeded built-ins; `shape` rect|circle + `corner_radius`); **`/api/floorplan/element-kinds/`** — staff read, **`IsSuperAdmin`** write; system kinds editable-not-deletable, `kind` slug immutable, auto-slug from label. See **`apps/floorplan/README.md`**.

**2026-07-02 (v2.39.0) — Floorplan (`apps/floorplan`):** **`FloorPlan`** JSON document + optimistic **`revision`** locking; **`FloorPlanAsset`** sanitized image library (SVG/PNG/JPEG data URIs); **`GET/POST/PATCH/DELETE /api/floorplan/plans/`** + **`/api/floorplan/assets/`** (staff read, Manager/Admin write). See **`apps/floorplan/README.md`**.

**2026-07-02 (v2.39.0) — Restoration hardening (migration `0078`):** dead **`executing`** stage removed (lifecycle is now `queued → sent → bench → pending → done` + `returned`); scan-requeue of `done`/`returned` jobs fully resets lifecycle fields; **`work_session`** PATCH validated (dict shape, `actions` list-of-dicts, 100KB cap) and dashboard **`_count_tars_actions`** defensive; parts-order **`record-order`** requires `site_id`/`line_ids` on multi-site requests and excludes skipped lines; **`mark-handled`** guarded to returns-eligible jobs + new **`POST …/unmark-handled/`**; bench Done validates **`final_grade`** against the job scale and defaults **`spent_parts_cost`** from actual ordered lines; queue transitions use `select_for_update`; scan-create returns **400** for validation (404 only for unknown SKU via **`RestorationItemNotFound`**); job-list serializer N+1 fixed; partial index **`restjob_disp_unhandled_idx`** for the Returns list. Done metrics keyed by **`dispositioned_at`**.

**2026-06-29 (WIP) — POS / Quality Audit:** **`QualityAuditForm`** + **`QualityAudit`** (migrations **`0008`–`0009`**); **`GET/POST/PATCH /api/pos/quality-audit-forms/`** + **`/api/pos/quality-audits/`** + **`…/submit/`** (Manager+); grade calc in **`apps/pos/services/quality_audit.py`**; dashboard retail card reads latest **`feeds_dashboard`** submit via **`build_department_metrics`**.

**2026-06-29 (WIP) — POS / dashboard metrics:** **`processing_by_day`** spans Mon-based last week through today for department grid; **`invalidate_dashboard_metrics_cache`** on QA submit.

**2026-06-26 (v2.34.0) — POS dashboard metrics:** **`GET /api/pos/dashboard/metrics/`** — cached 45s aggregate (sales run-rate, department cards, buying/processing/restoration rollups); **`DashboardSalesGoal`** + **`DashboardDepartmentGoal`** (migrations **`0005`–`0006`**); goal CRUD endpoints under **`/api/pos/dashboard/`**; **`Cart`** index **`cart_dash_completed_idx`** (migration **`0007`**); **`ItemHistory`** dashboard index **`itemhist_dash_on_shelf_idx`** (migration **`0075`**). Service: **`apps/pos/services/dashboard_metrics.py`**.

**2026-06-26 (v2.34.0) — Restoration bench + work session:** migrations **`0070`–`0074`** — **`RestorationJob.work_session`** JSON, **`bench_started_at`**, timer fields, **`pending`** stage rename; **`apps/inventory/services/restoration_bench.py`** — scan-to-bench, hold/done/pending, elapsed timer; **`PATCH /api/inventory/restoration-jobs/{id}/work-session/`**; grade scales **`RestorationGradeScaleViewSet`**; parts requests **`RestorationPartsRequestViewSet`**.

**2026-06-24 — Restoration queue (migrations `0068_restoration_job` / `0069_restoration_return_disposition`):** **`RestorationJob`** — one row per **`ItemCheckIn`** (`item_check_in` OneToOne, PROTECT); stages **`queued` → `sent` → `bench` → `executing` → `done`** plus **`returned`** for batches sent back to Processing; **`scale`**, **`grade_values`** JSON (mirrors frontend TARS grade scales in **`apps/inventory/services/restoration.py`**). Processing check-in with **`dispatch=restoration`** requires complete **`restoration_scale`** + **`restoration_grade_values`**, persists them in **`defaults_snapshot`**, and creates a **`queued`** job. Dispatch change away from restoration deletes a **`queued`** job; check-in delete removes **`queued`/`sent`** jobs. **`RestorationJobViewSet`**: **`GET /api/inventory/restoration-jobs/?stage=queued`**, **`POST`** manual scan **`{ sku }`**, **`PATCH`** scale/values (**`queued`** only), **`POST …/{id}/send/`** → **`sent`**, **`POST …/{id}/return-to-processing/`** → **`returned`** and moves linked items/check-in dispatch back to **`processing`** with either **`tars_completed`** (scale + grade + notes) or **`untouched`** (`recalled`, `not_worth_it`, `other`). Helpers: **`create_restoration_job_from_check_in`**, **`queue_add_restoration_item`**, **`send_restoration_job`**, **`return_restoration_job_to_processing`**.

**2026-06-24 — Item label printed tracking (migration `0067_item_label_printed_at`):** **`Item.label_printed_at`** — nullable timestamp; backfilled to `checked_in_at` for items already on shelf (status not `intake`). **`POST /api/inventory/items/mark-labels-printed/`** accepts `item_ids[]`, sets `label_printed_at = now()` for never-printed items; idempotent. Serializer exposes **`label_printed`** (bool) + **`label_printed_at`** (read-only); `ItemListSerializer._serialize_item` carries the same fields. List filter: **`?label_printed=true|false`** / **`?printed=`** alias.

**2026-06-16 (v2.32.0) — Unmanifested processing lines:** **`POST …/processing-add-item/`** creates pending **`row_kind='added'`** **`ProcessingRow`** rows (title/brand/model; no manifest row); check-in uses **`manifest_row_id=null`** and **`ItemCheckIn.ORIGIN_PRODUCT_AD_HOC`**. **`POST …/processing-delete-added-row/`** removes empty added rows (blocked when check-ins exist). Workspace **`segments`** query param supports multi-chip OR filters including **`unmanifested`**. Set/part product links scale default check-in price/retail via **`scale_row_amount_for_product_link`** (`manifestUnits / checkIns` from row bookmark). Manifest audit rollups exclude added rows.

**2026-06-16 (v2.31.0) — Processing product links:** migration **`0066_processingrow_product_links`** persists row/check-in product linkage for processing workspace product remap and prior history flows. `processing-patch` still limits condition/dispatch/price edits to on-shelf items and rejects manual `status="sold"`; prior check-ins no longer expose Status editing.

**2026-06-15 (v2.30.0) — ItemCheckIn catalog API:** **`GET /api/inventory/item-check-ins/`** (`ItemCheckInCatalogViewSet`, searchable serializer, dedicated pagination count). Filters: **`product`**, **`item_check_in`**, **`search`**.

**2026-06-15 — ItemCheckIn hard cleanup (`0063`–`0065`):** **`ItemCheckIn`** is the sole check-in event model (no import alias). **`Item.check_in`** FK is the only membership path; **`ItemCheckIn.item_ids`** removed in **`0064`**; index cleanup **`0065`**. API: **`item_check_in_id`** / **`item_check_in_ids`**, filter **`?item_check_in=`**, routes **`…/item-check-ins/{id}/…`**. Workspace payloads expose **`itemCheckIns`** with nested **`items`**. See [12_check_in_normalization](../reference/product_item_field_audit/12_check_in_normalization.md).

**2026-06-15 (v2.29.0) — Product check-in + category reset:** **`POST /api/inventory/products/{id}/check-in/`**; migrations **`0061`–`0062`**; **`ItemViewSet`** `ids` filter + **`-checked_in_at`** ordering.

**2026-06-11 Session 10 (v2.28.0) — Item Processor P7/P8:**
- **Collapse groups (P7):** **`ProcessingRow.collapse_master`** self-FK (migration **`0059`**, SET_NULL, `related_name='collapse_members'`) — presentation + check-in distribution only, manifest untouched. **`POST …/processing-collapse-rows/`** (`processing_row_ids` ≥2 manifest-backed; `product_mode` keep/existing/new — existing/new delegate to assign-shared-product) / **`POST …/processing-uncollapse-rows/`** (`master_processing_row_id`). Check-in on the **master** fills members **in row order** (one **`ItemCheckIn`** per member touched; response **`item_check_in_ids`**; overage → last row); followers raise on direct check-in. **`refresh_processing_rows_denorm`** overrides the master's **`queue_status` from GROUP totals** (pending/partial/checked_in/disputed — own-items status would read checked_in after fill-in-order and drop the group from `hide_checked_in`/segment filters; scoped refresh pulls the master in when only members were touched). Workspace list/patch rows carry **`collapsedGroup`** rollups (`collapse_rollups_for_order`); **`build_processing_row_detail`** for a master returns `collapsedGroup` + **all member items and item check-ins** + group-level `status` (per-row qty fields stay own-row; client combines via `effectiveRowQty`).
- **P8 endpoints:** **`GET /api/inventory/products/{id}/usage/`** → `{item_count, order_count}` (blast radius before editing a shared product). **`POST /api/inventory/items/`** is **quantity-aware** (`quantity` 1–10,000): workspace-enabled POs (any `ProcessingRow`) route through **`processing_add_item`** so manual adds land as a first-class **Added** queue row; other creates loop the serializer; response adds **`created_count`** + **`created_items`** (id/sku/price/title/brand/product_number per unit).
- **Check-in cap removed (owner ruling):** no 500 clamp anywhere — `_parse_check_in_quantity` accepts up to **`MAX_CHECK_IN_QUANTITY = 10_000`** (fat-finger backstop; exceeding raises an explicit error → 400, never a silent clamp) across row check-in, group check-in, check-in-together, add-item, and `POST /items`. The UI confirms >100-unit runs ("type `PRINT <qty>`" when printing).

**2026-04:** Buying — **Manifest ingestion is CSV upload only** (`upload_manifest` / `DELETE …/manifest/`). Anonymous order-process manifest pulls, staff **`pull_manifest`** REST actions, **`pull_manifests*`** / **`benchmark_manifest_pull`** management commands, and **`manifest_api_pipeline`** were removed. Historical **`ManifestPullLog`** rows may remain in the DB.

**v2.14.0:** Buying — **`CategoryStats.need_score_1to99`** (daily **`compute_daily_category_stats`** / **`category_stats_sql`**); auction **`need_score`** & **`priority`** = weighted mix **1–99** (**`valuation._auction_need_from_mix`**). Inventory — **`PurchaseOrder.est_shrink`** drives **`Item.cost`**; **`recompute_all_item_costs`** for backfill. Details under **inventory** and **Item acquisition cost** sections below.

**2026-04 Inventory preprocessing redesign:** `PurchaseOrderViewSet.process_manifest` seeds **`PreprocessingRow`** staging (`standard_*`). Staff download **lean cleanup CSV**, apply Grok/Excel output via **`apply-cleanup-csv`** into **`ai_*`** / **`ai_title`** (optional per-row **`ai_status`** JSON on wide import; empty/malformed → **`{}`**); **Final Decisions** uses **`preprocessing-review`** (**`PATCH`** clears **`ai_status`** when listing or price fields change, not for **`batch_flag`** / **`pricing_notes`** only); **`finalize-preprocessing`** runs **`snapshot_finalize_from_ai_and_standard`** then creates **`ProcessingRow`** bookmarks. Legacy **`ai-cleanup-rows`** (Anthropic) still mutates **`ManifestRow`** when invoked — **not** the shipped Step 2 path; see **Inventory AI Endpoints** below. `manual-review` is the canonical **post-finalize** review/pricing surface over **`ManifestRow`**. `create-items` opens Processing for existing early Items instead of duplicating inventory.

**Timeouts (`finalize-preprocessing`):** Finalize can run tens of seconds on large manifests (staging snapshot, bulk manifest rows, product/item upserts). Keep finalize synchronous unless logs show proxy timeouts. Ops should set reverse-proxy and app-server HTTP timeouts **≥ 120s** (e.g. nginx `proxy_read_timeout`, uvicorn/gunicorn graceful limits) for staff uploading large CSVs; correlate with structured finalize duration logs before adding async jobs.

**v2.23.0 Item Processor search:** **`ProcessingRow.search_string`** (migration **`0043_processingrow_search_string`**) — lowercased denormalized substring blob (listing scalars + values-only JSON flatten for **`identifiers`**, **`specifications`**, **`tracking`**, **`taxonomy`**, **`search_tags`**); rebuilt on **`ProcessingRow.save()`** (always merged into **`update_fields`** when provided) plus explicit **`bulk_update`** hotspots; **`GET …/processing-workspace`** list includes **`searchString`**; **`search`** query uses **`search_string__contains`** with **`row_number`** shortcuts for numeric / **`rowNNN`** tokens. **`manage.py rebuild_processing_search_string`** for backfill / periodic safety net. **`POST …/manual-review/`** mirrors searchable manifest columns onto linked bookmarks.

**Item Processor shelf price (bookmark-canonical, `[Unreleased]`):** **`processing-workspace`** / **`processing-row-detail`** merged **`price`** uses **`ProcessingRow.shelf_price`** (**`final_price`** fallback when shelf unset); **`refresh_processing_rows_denorm`** seeds **`shelf_price`** for bookmark-only or zero-item manifest rows from **`final_price`**/**`proposed_price`** only — does **not** overwrite **`shelf_price`** from **`Item.price`** when Items exist. **`processing_ops`** (**print-and-check-in**, **print-multiple**, **bulk disposition**, **`processing-patch`**) sets **`shelf_price`** + **`final_price`** before **`Item.price`**. Field rename migration **`0044_rename_processingrow_list_unit_price_shelf_price`**.

**v2.21.1 Item Processor hotfix:** **`POST /api/inventory/orders/{id}/build-processing-data/`** bulk-creates minimal **`ManifestRow`** + **`Item`** rows from finalized **`ProcessingRow`** bookmarks, pre-generates SKUs, and skips Product matching / Product rollups / `BatchGroup` creation on the synchronous hot path to avoid Heroku timeouts on large POs. **v2.21.0 Item Processor:** **`ProcessingRow`** persists per-manifest-line queue state (**`ManifestRow`** 1:1 at finalize — migrations **`0040_processing_row_bookmarks`**, **`0041_processing_row_canonical_denorm`**). **`GET /api/inventory/orders/{id}/processing-workspace/`** serves a **`rows`** page (**`limit`/`offset`** + filters); **`GET …/processing-row-detail/`** returns **`items`** + **`product`** for one bookmark. Mutations return **`workspace_patch`** for incremental client cache updates. **`POST …/processing-swap/`** is **not** part of shipping scope (**`CHANGELOG [2.21.0]`** — historical **`ItemSwapAudit`** rows may exist).

## Project Structure

Django project with **8 apps** under `apps/`:

| App | Purpose |
|-----|---------|
| `apps.accounts` | Users, auth, profiles (Employee, Consignee, Customer) |
| `apps.core` | Shared models: WorkLocation, AppSetting, S3File, PrintServerRelease |
| `apps.hr` | HR: Departments, time entries, sick leave |
| `apps.inventory` | Vendors, purchase orders, products, items, processing, formula engine |
| `apps.ai` | Claude API proxy: chat endpoint, model list |
| `apps.pos` | Registers, drawers, carts, receipts, cash management |
| `apps.consignment` | Consignment agreements, items, payouts |
| `apps.buying` | B-Stock auction intelligence: marketplaces, auctions, manifests, watchlist, bids, outcomes; `CategoryMapping`, **`ManifestTemplate`** (CSV header signature + column map); services **`ai_manifest_template`**, **`ai_key_mapping`**, **`manifest_upload`**; management commands `sweep_auctions`, `renormalize_manifest_rows`, `seed_category_mappings`, `seed_manifest_templates`, `seed_fast_cat_mappings`, `categorize_manifests`, `watch_auctions`; **`POST /api/buying/auctions/{id}/upload_manifest/`** (multipart CSV); **`POST …/map_fast_cat_batch/`**; **`DELETE …/manifest/`**; dev-only `POST /api/buying/token/` for JWT ingest |

Root URL prefixes: `api/auth/`, `api/accounts/`, `api/core/`, `api/hr/`, `api/inventory/`, `api/ai/`, `api/pos/`, `api/consignment/`, `api/buying/` (staff auction list/detail/summary, sweep, manifest rows, upload manifest, map fast-cat batch, delete manifest, watchlist; dev-only token ingest — see Buying section below).

---

## Settings Highlights

- **Database**: PostgreSQL (`ecothrift_v3` default)
- **Auth**: `AUTH_USER_MODEL = 'accounts.User'`
- **REST Framework**:
  - `DEFAULT_AUTHENTICATION_CLASSES`: `JWTAuthentication`
  - `DEFAULT_PERMISSION_CLASSES`: `IsAuthenticated`
  - `DEFAULT_PAGINATION_CLASS`: `PageNumberPagination`, `PAGE_SIZE = 50`
  - `DEFAULT_FILTER_BACKENDS`: `DjangoFilterBackend`, `SearchFilter`, `OrderingFilter`
- **SimpleJWT**:
  - `ACCESS_TOKEN_LIFETIME`: 30 minutes
  - `REFRESH_TOKEN_LIFETIME`: 7 days
  - `ROTATE_REFRESH_TOKENS`: True
  - `BLACKLIST_AFTER_ROTATION`: True
- **Timezone**: `America/Chicago`, `USE_TZ = True`
- **CORS**: `localhost:5173`, `CORS_ALLOW_CREDENTIALS = True`
- **Static**: WhiteNoise, optional S3 for media
- **Optional `DATABASES['production']`:** When **`PROD_DATABASE_NAME`** (and related **`PROD_DATABASE_*`**) are set in the environment, **`ecothrift/settings.py`** registers alias **`production`** (same search path as V3). Used by **inventory** management commands that accept **`--database default|production`** and **`--no-input`** (skips interactive production confirmation) — see **`apps/inventory/management/command_db.py`**, **`recompute_all_item_costs`**, **`backfill_phase*_*`**, **`populate_item_retail_value`**, **`classify_v2_*`**. Legacy **`psycopg2`** reads for V1/V2 still use the **`default`** connection unless a command documents otherwise.
- **`Product` / `Item` ID generation:** **`Product.generate_product_number`** and **`Item.generate_sku`** accept optional **`using=`** so **`save(using='production')`** sequences against the target DB (avoids collisions when the default DB differs from the write alias).

### Metrics, scheduled jobs, and caching

#### Metrics glossary (authoritative paths)

| Metric / output | Source | Notes |
|-----------------|--------|--------|
| **Category need (1–99 per taxonomy row)** | `CategoryStats` populated by **`compute_daily_category_stats`** → SQL in **`apps/buying/services/category_stats_sql.py`**; panel rows via **`build_category_need_rows()`** in **`apps/buying/services/category_need.py`**. | **`need_score_1to99`** on `CategoryStats`; shelf/sold bar mix + **N-day** sold cohort for **want** counts; **recovery** / **avg sale–retail–cost** / **margin** use **all-time good-data** sold rows (**v2.17.0**: sale, retail, cost each **0.01–9999**). |
| **Auction `need_score` / auto `priority`** | **`apps/buying/services/valuation.py`** — **`_auction_need_from_mix()`** (weighted SUMPRODUCT of per-category **`need_score_1to99`**, clamped **1–99**). | Staff may set **`priority_override`** on **`Auction`**. |
| **`Item.cost`** | **`PurchaseOrder.est_shrink`** + listing **`Item.retail_value`** / PO retail totals — see **Item acquisition cost**; updates on PO save and on **Item** retail/PO FK change; **`recompute_all_item_costs`** for backfill only. | Not computed by daily buying batch. |
| **Profitability / fees / shipping** | **`valuation._fees_shipping_total_cost()`** + overrides on **`Auction`**; **`PricingRule`** sell-through where applicable. | |
| **Category distribution (auction)** | Manifest **`fast_cat_value`** counts or AI estimates — manifest upload, **`map_fast_cat_batch`**, delete manifest, sweep paths. | Feeds valuation mix. |
| **Shelf (“have”) / 90d sold (“want”)** | **`category_stats_sql`** aggregates from inventory + sold history (window from **`get_pricing_need_window_days()`**). | Drives need gap / bars. |
| **`ManifestRow.retail_value`** | **Per-unit MSRP** (canonical, **v2.17.1**). Set at ingest by **`apps/buying/services/normalize.py`** (API; prefers `unitRetail`, divides `extRetail / quantity` when only ext is present) and **`apps/buying/services/manifest_template.py`** **`standardize_row`** (CSV; divides `extended_retail / quantity` when only ext is mapped, warns on >2% disagreement). | **Extended retail** is **`SUM(Coalesce(quantity, 1) × retail_value)`** at query time — never stored. Computed by **`valuation._manifest_retail_sum`**, **`valuation.compute_and_save_manifest_distribution`** (per-bucket), **`api_views.annotate_auction_list_extras`** (`_manifest_retail_sum` annotation), and **`serializers.AuctionDetailSerializer.get_manifest_extended_retail_total`** (detail card). Audit with **`python manage.py diagnose_manifest_retail`**; backfill with **`python manage.py normalize_stored_manifest_retail --auction <id> --dry-run`**. |

#### Scheduled jobs (buying / inventory ops)

Heroku Scheduler (minimum) and local parity: **`.ai/extended/development.md`** — **Heroku Scheduler (buying)** table. Local batch: **`scripts/dev/daily_scheduled_tasks.bat`** runs the same commands in order; **`SKIP_BSTOCK=1`** runs only **`compute_daily_category_stats`**.

| Cadence | Command | What it refreshes |
|---------|---------|-------------------|
| **Daily** (~03:00 UTC on Heroku) | `python manage.py compute_daily_category_stats` | Upserts **`CategoryStats`** (incl. **`need_score_1to99`**); **`cache.delete('category_need_panel')`**; unless **`--skip-recompute-open`**, full **`recompute_auction_full`** for non-archived **open/closing** auctions with future **`end_time`**. |
| **Hourly** | `python manage.py scheduled_sweep` | Discovery (**`pipeline.run_discovery`**), optional AI estimate for swept IDs, **`recompute_active_auctions_lightweight`**. |
| **Third step (local bat / optional Heroku)** | `python manage.py watch_auctions` | Watchlist poll — snapshots + lightweight valuation per **`WatchlistEntry`** intervals. Documented in **development.md** as not necessarily the same Heroku clock as the table’s two rows. |
| **On-demand only** | `python manage.py recompute_all_item_costs` | Backfill **`Item.cost`** after **`est_shrink`** / data fixes — **not** daily. |

#### Django DB cache — keys, TTL, invalidation

- **Backend:** Django **database** cache (`django_cache_table` in production; tests use LocMem). **No** signal-based invalidation for inventory/item list keys — entries expire by TTL. **Exception:** **`category_need_panel`** is also **deleted** when **`compute_daily_category_stats`** runs successfully (`apps/buying/management/commands/compute_daily_category_stats.py`).

| Key | TTL (s) | Set by | Invalidation |
|-----|---------|--------|--------------|
| **`category_need_panel`** | **600** | **`GET /api/buying/category-need/`** — `cache.get_or_set` in **`apps/buying/api_views.py`**. | **Explicit `cache.delete`** in **`compute_daily_category_stats`**; otherwise TTL expiry. |
| **`item_stats_global`** | **300** | **`GET /api/inventory/items/item_stats/`** — **`apps/inventory/views.py`**. | TTL-only. |
| **`item_list_total_count`** | **300** | Unfiltered **`GET /api/inventory/items/`** pagination **`count`** — **`ecothrift/pagination.py`** (`ItemListPagination`). | TTL-only. |

### AI defaults (inventory — Bill decision, Phase 2)

- **`POST …/suggest_item/`** and **`POST …/ai_cleanup_rows/`** default the model to **`AI_MODEL_FAST`** (Haiku, e.g. `claude-haiku-4-5` in `ecothrift/settings.py`), not **`AI_MODEL`** (Sonnet). Per-request — **not** stored in the Django DB cache keys table above.
- **`suggest_item`** includes the **canonical taxonomy_v1 category list** in the prompt; on an **invalid** category from the model, the server **retries once** with a stricter instruction; if still invalid, category falls back to **`Mixed lots & uncategorized`** (`apps/inventory/views.py`).

---

## App Models

### accounts

| Model | Key Fields |
|-------|------------|
| **User** | email (unique), first_name, last_name, phone, is_active, is_staff, date_joined, updated_at; `role` property (first group), `roles` property (all groups as list) |
| **EmployeeProfile** | user (1:1), employee_number, department (FK hr.Department), position, employment_type, pay_rate, hire_date, termination_date, **termination_type** (choices: voluntary_resignation, job_abandonment, retirement, layoff, etc.), **termination_notes**, work_location (FK core.WorkLocation) |
| **ConsigneeProfile** | user (1:1), consignee_number, commission_rate, payout_method, status (active/paused/closed), join_date |
| **CustomerProfile** | user (1:1), customer_number, customer_since |

### core

| Model | Key Fields |
|-------|------------|
| **WorkLocation** | name, address, phone, timezone (default America/Chicago), is_active |
| **AppSetting** | key, value (JSON), description, updated_by |
| **S3File** | key, filename, size, content_type, uploaded_by |
| **PrintServerRelease** | version, s3_file (FK S3File), release_notes, is_current |

### hr

| Model | Key Fields |
|-------|------------|
| **Department** | name, location (FK core.WorkLocation), manager (FK User), is_active |
| **TimeEntry** | employee (FK User), date, clock_in, clock_out, break_minutes, **on_break**, **break_started_at**, total_hours, status (pending/approved/flagged), approved_by, **deleted_at**, **deleted_by** — default manager excludes soft-deleted |
| **SickLeaveBalance** | employee, year, hours_earned, hours_used; ANNUAL_CAP 56h |
| **SickLeaveRequest** | employee, start_date, end_date, hours_requested, status (pending/approved/denied), reviewed_by |
| **TimeEntryModificationRequest** | time_entry (FK TimeEntry), employee (FK User), requested_clock_in/out, requested_break_minutes, reason, status (pending/approved/denied), reviewed_by, review_note, **deleted_at**, **deleted_by** |

**HR API (MVP):** `TimeEntryViewSet` — clock in/out, `start_break`/`end_break`, `weekly_status`, `roster`, `payroll`, `payroll_periods`, manager `bulk_delete` (soft); **`GET …/time-entries/` list** and **`summary`** default to the **current user** (managers may pass `?employee=`; detail/approve actions unchanged). **`GET …/roster/`** — shift rows with **`weekly_cumulative_hours`** = full-week partition sum (Mon–Sun per employee; same on every row in that week). **`GET …/payroll/`** — by-employee totals plus **`hours_this_week`** (completed shifts in current calendar week). **`TimeEntry.save`** sets **`date`** from **`clock_in`**; **`validate_shift_duration`** (max **16h** worked after breaks) on clock-out. `TimeEntryModificationRequestViewSet` — Super Admin `approve`, **`reject`**, `bulk_approve`, **`bulk_reject`**, `bulk_delete` (soft). **`purge_soft_deleted_hr`** management command hard-deletes after 30 days.

### inventory

| Model | Key Fields |
|-------|------------|
| **Vendor** | name, code (unique), vendor_type (liquidation/retail/direct/other), is_active. Legacy duplicate **TGT** merged into **TRGET** (migration `0018_merge_tgt_into_trget`); **TGT** row kept with `is_active=False`. |
| **Category** | name, slug, parent (self-FK), spec_template (JSON) |
| **PurchaseOrder** | vendor, order_number, status (ordered→paid→shipped→delivered→processing→complete), ordered_date, paid/shipped/delivered dates, purchase/shipping/fees, **total_cost** (sum of components), **retail_value** (B-Stock listing total — do not overwrite with sum of line retails), **est_shrink** (new POs: **`get_default_po_est_shrink()`** from **`AppSetting`** `po_default_est_shrink`, else model default **0.15**), manifest (FK core.S3File), manifest_preview (JSON); raw CSV upload/replace from staff UI — **Order detail** → Raw Manifest (`POST /api/inventory/orders/{id}/upload-manifest/`) |
| **CSVTemplate** | vendor, name, header_signature, column_mappings (JSON), is_default |
| **ManifestRow** | purchase_order, row_number, quantity, description, title, brand, model, category, condition, **unit_retail**, proposed_price, final_price, pricing_stage, pricing_notes, batch_flag, identifiers / taxonomy / tracking (JSON), search_tags, specifications (JSON), matched_product, match_status, match_candidates (JSON), ai_match_decision, ai_reasoning, notes — **canonical listing fields** after preprocessing finalize (**no** separate **`ai_suggested_*`** columns) |
| **ProcessingRow** | **Queue bookmark / list projection** for Item Processor: **`purchase_order`**, **`row_number`**, optional **`manifest_row`** + **`matched_product`** (lazy detail + denorm); optional **`preprocessing_row`** FK (audit trail); mirrored listing + pricing columns; **`shelf_price`** — workspace **`price`** (**list_unit_price** rename migration **`0044`**); **`search_string`** (**v2.23.0**, migration **`0043`**) lowercased denormalized workspace search blob; **`queue_*`** aggregates for paginated **`processing-workspace`** — migrations **`0040`** / **`0041`** |
| **PreprocessingOrder** / **PreprocessingRow** | Staging before finalize: **`standard_*`**, **`ai_*`**, **`final_*`**, **`ai_title`** / **`final_title`**, **`ai_status`** (JSON — Grok validation/recovery metadata); CSV cleanup apply writes **`ai_*`** + **`ai_status`**; **`finalize-preprocessing`** coalesces then rebuilds **`ManifestRow`** |
| **Product** | product_number, title, brand, model, category, category_ref (FK Category), specifications (JSON), default_price, upc |
| **VendorProductRef** | vendor, product, vendor_item_number, vendor_description, last_unit_cost, times_seen, last_seen_date |
| **BatchGroup** | batch_number, product, purchase_order, manifest_row, total_qty, status, unit_price, **unit_cost** (legacy name — stores **manifest/vendor retail per unit**, not acquisition cost; rename to `unit_retail` planned), condition, location, processed_by/at |
| **Item** | sku (unique), product (FK), purchase_order (FK), manifest_row (FK), batch_group (FK), processing_tier, title, price, **retail_value** (vendor/manifest MSRP-style retail), **cost** (allocated from PO: `(item.retail / (PO.retail × (1 − PO.est_shrink))) × PO.total_cost` when PO has listing retail and total_cost; read-only on API), source, status, condition, location, listed_at, checked_in_at/by, sold_at |
| **ProcessingBatch** | purchase_order, status, total_rows, processed_count, items_created |
| **ItemHistory** | item, event_type, old_value, new_value, note, created_by, created_at |
| **ItemScanHistory** | item, scanned_at, ip_address, source (public_lookup/pos_terminal) |

### pos

| Model | Key Fields |
|-------|------------|
| **Register** | location (FK core.WorkLocation), name, code, starting_cash, starting_breakdown |
| **Drawer** | register, date, status (open/closed), current_cashier, opened_by, opening_count, closing_count, cash_sales_total, variance |
| **DrawerHandoff** | drawer, outgoing_cashier, incoming_cashier, counted_at, count, variance |
| **CashDrop** | drawer, amount, total, dropped_by |
| **SupplementalDrawer** | location (1:1 WorkLocation), current_balance, current_total |
| **SupplementalTransaction** | supplemental, transaction_type (draw/return/audit_adjustment), amount, related_drawer |
| **BankTransaction** | location, transaction_type (deposit/change_pickup), amount, status |
| **Cart** | drawer, cashier, customer, status (open/completed/voided), subtotal, tax_rate, tax_amount, total, payment_method |
| **CartLine** | cart, item (FK inventory.Item), description, quantity, unit_price, line_total |
| **Receipt** | cart (1:1), receipt_number, printed, emailed |
| **RevenueGoal** | location, date, goal_amount |

### consignment

| Model | Key Fields |
|-------|------------|
| **ConsignmentAgreement** | consignee (FK User), agreement_number, commission_rate, status (active/paused/closed), start_date, end_date |
| **ConsignmentItem** | agreement, item (1:1 FK inventory.Item), asking_price, listed_price, status (pending_intake→sold), received_at, listed_at, sold_at, store_commission, consignee_earnings |
| **ConsignmentPayout** | consignee, payout_number, period_start/end, items_sold, total_sales, total_commission, payout_amount, status (pending/paid), payment_method |

---

## App Relationships

```
User (accounts)
  ├── EmployeeProfile → hr.Department, core.WorkLocation
  ├── ConsigneeProfile
  └── CustomerProfile

core.WorkLocation
  ├── hr.Department
  ├── pos.Register
  ├── pos.SupplementalDrawer (1:1)
  └── pos.BankTransaction, pos.RevenueGoal

inventory.PurchaseOrder → inventory.Vendor, core.S3File
inventory.ManifestRow → inventory.PurchaseOrder
inventory.ProcessingRow → inventory.PurchaseOrder, optional FKs to **`ManifestRow`**, **`PreprocessingRow`** (audit), **`Product`** (`matched_product`), self (`collapse_master` P7; `split_parent` P9 sub rows — `Item.unit_count` carries units-per-tag)
inventory.Product → inventory.Category (optional)
inventory.VendorProductRef → inventory.Vendor, inventory.Product
inventory.BatchGroup → inventory.Product, inventory.PurchaseOrder, inventory.ManifestRow
inventory.Item → inventory.Product, inventory.PurchaseOrder, inventory.ManifestRow, inventory.BatchGroup
inventory.ProcessingBatch → inventory.PurchaseOrder
inventory.ItemHistory, inventory.ItemScanHistory → inventory.Item

pos.Drawer → pos.Register, User
pos.Cart → pos.Drawer, User, inventory.Item (via CartLine)
pos.Receipt → pos.Cart

consignment.ConsignmentAgreement → User (consignee)
consignment.ConsignmentItem → ConsignmentAgreement, inventory.Item (1:1)
consignment.ConsignmentPayout → User (consignee)
```

---

## Key Patterns

### ViewSets + DRF Routers

- Each app uses `DefaultRouter` and `router.register()` for CRUD endpoints.
- Example: `api/pos/drawers/`, `api/pos/drawers/<id>/`, etc.

### Custom Endpoints

- **`@action(detail=True, methods=['patch'])`** on ViewSets for sub-resource updates (e.g. `users/<id>/employee_profile/`).
- **Function-based views** for non-CRUD endpoints (e.g. `dashboard/metrics/`, `my/items/`, `my/payouts/`, `my/summary/`).

### Permission Classes

- Default: `IsAuthenticated`.
- Custom: `IsAdmin`, `IsManager`, `IsManagerOrAdmin`, `IsEmployee`, `IsConsignee`, `IsStaff`.
- Applied per ViewSet or view via `permission_classes`.

### Timestamps

- All `created_at` / `updated_at` use `auto_now_add` / `auto_now`; stored in `America/Chicago` (USE_TZ=True).

---

## Item acquisition cost (inventory)

- **Formula (per line):** `Item.cost = (Item.retail_value / (PO.retail_value × (1 − PO.est_shrink))) × PO.total_cost`, where **`PO.retail_value`** is the **B-Stock listing** total.
- **Default `est_shrink` for new POs:** **`AppSetting`** key **`po_default_est_shrink`** (JSON number, typically **0.15**), seeded by **`setup_initial_data`**. Staff edit under **Admin → Assumptions** (`/admin/assumptions`). Changing this **does not** rewrite existing POs; **REST `POST /api/inventory/orders/`** uses **`get_default_po_est_shrink()`** in **`PurchaseOrderViewSet.perform_create`**. For **`PurchaseOrder.objects.create(...)`** in scripts/shell, pass **`est_shrink=`** explicitly or **`est_shrink=get_default_po_est_shrink()`** — the model field default alone stays **0.15** and does not read **`AppSetting`**.
- **Buying valuation (separate from PO shrink):** **`AppSetting`** **`pricing_shrinkage_factor`** — shrink on estimated auction revenue (**`get_global_shrinkage()`** in **`apps/buying/services/valuation.py`**); same typical default **0.15** as PO shrink but a different role. **`pricing_need_window_days`** — sold-items lookback for category need (**`buying_settings.get_pricing_need_window_days()`**). Both are editable on **Admin → Assumptions** and seeded by **`setup_initial_data`** / **`seed_pricing_rules`**.
- **When costs update (Django only — no Postgres triggers, no Heroku job):** Changing **`PurchaseOrder`** fields that affect **`total_cost`**, **`retail_value`**, or **`est_shrink`** runs **`recompute_item_costs()`** for that PO. Changing **`Item.retail_value`** or **`Item.purchase_order`** runs **`recompute_item_costs()`** for the affected PO(s). **`Item.cost`** is read-only on the item API.
- **Backfill command:** `python manage.py recompute_all_item_costs` (optional **`--database production`**) — **on-demand only** after bulk SQL, imports, or DB repair when rows may be stale. **Not** a scheduled task.
- **Data-quality check:** Some imports set **`PO.retail_value`** too low (e.g. cents treated as dollars) while **`notes`** embeds JSON with **`ext_retail`** at the true listing total. If **`total_cost / retail_value`** is implausibly high (near or above **1** for a truckload), compare to **`ext_retail`** (parse **`notes`** after the first `{`). Correct **`PurchaseOrder.retail_value`**, then **`recompute_all_item_costs`**; run **`compute_daily_category_stats`** so **`CategoryStats`** cost-based fields (**v2.17.0**) match. Raw SQL updates bypass **`PurchaseOrder.save()`** — **must** recompute item costs afterward.

---

## Inventory Backend Updates (Post-1.4.0 UX Pass)

- Added guarded order reset workflow on `PurchaseOrderViewSet`:
  - `GET /api/inventory/orders/:id/delete-preview/`
  - `POST /api/inventory/orders/:id/purge-delete/` (requires `confirm_order_number`)
- Purge flow deletes order-owned artifacts in reverse operational sequence:
  1) `ItemHistory`, 2) `ItemScanHistory`, 3) `Item`,
  4) `BatchGroup`, 5) `ProcessingBatch`, 6) `ManifestRow`,
  7) manifest `S3File` (only if not referenced by another order), 8) `PurchaseOrder`.
- Shared catalog entities are intentionally retained during purge:
  - `Product`
  - `VendorProductRef`
  - `CSVTemplate`
- Enhanced preprocessing preview endpoints for full-dataset search + capped preview result windows:
  - `GET /api/inventory/orders/:id/manifest-rows/?search=...&limit=100`
    - searches full raw manifest rows server-side,
    - returns top N rows and `row_count_filtered`.
  - `POST /api/inventory/orders/:id/preview-standardize/` with `search_term`
    - filters full normalized row set server-side,
    - returns top preview rows with filtered count metadata.

---

## AI App (`apps/ai/`) — Added v1.6.0

- **`GET /api/ai/models/`** — Returns curated list of available Claude models (`claude-sonnet-4-6`, `claude-haiku-4-5`)
- **`POST /api/ai/chat/`** — Proxies to Anthropic Claude API. Accepts `model`, `system`, `messages`, `max_tokens`.
- `anthropic` library is lazy-imported to prevent startup crash if not installed.
- `ANTHROPIC_API_KEY` loaded from Django settings / `.env`.

## Inventory AI Endpoints — Added v1.6.0

### Legacy in-app cleanup — `ai-cleanup-rows` (API only; Step 2 UI removed)

- **`POST /api/inventory/orders/:id/ai-cleanup-rows/`** — Anthropic batches over **`ManifestRow`** (not **`PreprocessingRow.ai_*`**). Accepts `model`, `batch_size`, `offset`, `mode`. Returns `{ rows_processed, rows_saved, total_rows, offset, has_more, timing, … }`. **Hot-path cost:** **`ensure_manifest_products_and_items(order)`** runs before each batch (full PO scan). Anthropic **`timeout=90`**; Heroku router ~**30s**. **`ai_cleanup_generation`** guard discards stale saves after undo/cancel.
- **`GET /api/inventory/orders/:id/ai-cleanup-status/`** — `{ total_rows, cleaned_rows, remaining_rows }` (non-empty **`ai_reasoning`**).
- **`POST /api/inventory/orders/:id/cancel-ai-cleanup/`** — Clears AI fields on staging or manifest rows; increments **`ai_cleanup_generation`**.

**Benchmark (dev, PO 323, Haiku, API-only via `test_ai_cleanup`):** batch 5 ~7s, batch 10 ~13.5s, batch 25 ~20s avg API per batch. Initiative: [`preprocessing_ai_cleanup_review.md`](../initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md).

### Other inventory AI (unchanged)

- **`POST /api/inventory/orders/:id/suggest-formulas/`** — AI suggests expression formulas for standard fields given manifest headers and sample data; implemented via **`apps.core.services.llm_chat.llm_chat_completion_text`** (Anthropic Claude or xAI Grok per **`AI_PROVIDER`** / model id — same env keys as Django **`ecothrift/settings.py`**).
- **`POST /api/inventory/orders/:id/match-products/`** — **410 Gone** (P6); use Final Decisions / assign shared product instead.
- **`POST /api/inventory/orders/:id/review-matches/`** — Legacy match review (if still wired).
- **`GET /api/inventory/orders/:id/match-results/`** — Legacy match results.

### Preprocessing offline cleanup CSV — shipped Step 2 UI

Contract detail: [`.ai/extended/inventory-pipeline.md`](inventory-pipeline.md) § AI Row Cleanup. Initiative review: [`preprocessing_ai_cleanup_review.md`](../initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md).

- **`GET /api/inventory/orders/:id/download-cleanup-csv/`** — Pre-AI export: **`row_id`**, **`row_number`**, **`quantity`**, **`unit_retail`**, **`base_cost`**, **`ideal_price`**, then **`description`**, **`brand`**, **`model`**, **`condition`**, **`notes`**, **`identifiers_json`**, **`taxonomy_json`**, **`specifications_json`**, **`tracking_json`**, **`search_tags_json`**; **`base_cost`** / **`ideal_price`** per unit as in preprocessing-status totals.
- **`POST /api/inventory/orders/:id/upload-cleanup-csv/`** — Multipart **`file`**: **wide** staging CSV (Grok/Excel columns per **`cleanup_csv_contract.md`**, including optional **`ai_status`**) or **narrow** header **`row_id`, `ai_title`, `ai_brand`, `ai_model`, `category`, `condition`, `proposed_price`** only; validates and updates staging **`PreprocessingRow`** or legacy **`ManifestRow`** by **`row_id`** (exact row coverage required).
- **`POST /api/inventory/orders/:id/apply-cleanup-csv/`** — Same merge semantics as upload; JSON **`{ "rows": [ ... ] }`** with wide or narrow keys per row (SPA **`apply-cleanup-csv`** path).

## Expression Formula Engine (`apps/inventory/formula_engine.py`) — Added v1.6.0

- Tokenizer + recursive descent parser + AST evaluator
- Column refs: `[COLUMN_NAME]`, Functions: `UPPER()`, `LOWER()`, `TITLE()`, `TRIM()`, `REPLACE()`, `CONCAT()`, `LEFT()`, `RIGHT()`
- String concatenation with `+`, quoted string literals
- `evaluate_formula(formula_str, row_dict) -> str` public entry point
- `normalize_row()` in views.py checks for `formula` key (new path) vs `source` + `transforms` (legacy path)

## Buying / B-Stock (`apps/buying/`) — Added v2.3.0

- **Models:** `Marketplace`, `Auction`, **`AuctionThumbsVote`** (staff **one row per user per auction**), `AuctionSnapshot`, `ManifestRow`, `WatchlistEntry`, `Bid`, `Outcome`, **`CategoryMapping`** (global `source_key` → taxonomy_v1 canonical name; origins `seeded` / `ai` / `manual`). **`ManifestTemplate`** (per marketplace **header signature** + **`column_map`** / **`category_fields`**, **`is_reviewed`**). **`ManifestRow`** adds **`canonical_category`**, **`category_confidence`** (`direct` / `ai_mapped` / **`fast_cat`** / `fallback`), **`manifest_template`** FK, **`fast_cat_key`** / **`fast_cat_value`**. **`fast_cat`** is set when **`fast_cat_value`** is resolved from **`CategoryMapping`** on CSV upload (**Phase 4.1A**); tier-1/3 canonical categorization is separate (**`categorize_manifest_rows`** after CSV ingest, or **`categorize_manifests`** command). **`PricingRule`**: one row per taxonomy_v1 category, **`sell_through_rate`** (legacy CSV seed; **not** used by live valuation). **`CategoryStats`**: **`recovery_rate`** (0–1, `SUM(sold_for)/SUM(retail_value)` per bucket; **v2.17.0** qualifying rows require **`sold_for`**, **`retail_value`**, **`cost`** each **0.01–9999**), **`recovery_sold_amount`** / **`recovery_retail_amount`** / **`recovery_cost_amount`**, **`good_data_sample_size`**, **`avg_sold_price`** / **`avg_retail`** / **`avg_cost`** (means on that cohort) — **live valuation** reads **`CategoryStats`** only. Staff category want-vote (**`CategoryWantVote`**) removed **2026-04**. **`Auction` (Phase 5):** **`ai_category_estimates`**, **`manifest_category_distribution`**, **`estimated_revenue`**, **`revenue_override`**, **`fees_override`**, **`shipping_override`** (nullable USD overrides; else estimated from marketplace rates × **`current_price`**), **`estimated_fees`**, **`estimated_shipping`**, **`estimated_total_cost`**, **`profitability_ratio`**, **`need_score`**, **`shrinkage_override`**, **`profit_target_override`**, **`priority`**, **`priority_override`** (**v2.19.0** — legacy boolean **`thumbs_up`** column removed; migration **`0020_remove_auction_thumbs_up`**). **`Marketplace`:** **`default_fee_rate`**, **`default_shipping_rate`** (fractions of purchase price).
- **Phase 5 (v2.8.0) — valuation design:** **`estimated_revenue`** = category mix × retail base × **`CategoryStats.recovery_rate`** per category (**no** vendor × category matrix). **`estimated_revenue`** is **pre-shrinkage**; **`revenue_override`** (USD) replaces that dollar amount for effective margin math when set (**`coalesce`**); **`profitability_ratio`** uses **effective revenue after shrinkage**. **`fees_override`** / **`shipping_override`** are **USD** only when set (no percentage mode on overrides). **Mix:** **`manifest_category_distribution`** (retail share per **`fast_cat_value`**, with row-count fallback if retail is all null/zero) takes precedence over **`ai_category_estimates`**; while mapping is partial, the **Mixed lots & uncategorized** slice is **blended** with AI title estimates. **`run_ai_estimate_for_swept_auctions`** is uncapped and skips auctions that already have AI estimates.
- **Taxonomy:** `apps/buying/taxonomy_v1.py` — `TAXONOMY_V1_CATEGORY_NAMES` (19 names; sync with `workspace/notebooks/category-research/taxonomy_v1.example.json`).
- **Commands:** `python manage.py sweep_auctions` (POST `search.bstock.com/v1/all-listings/listings` — same API as GET; max **`limit` 200**), `python manage.py renormalize_manifest_rows` (re-apply `normalize_manifest_row` to stored `ManifestRow.raw_data` — no live B-Stock; optional `--auction-id`, `--marketplace`, `--limit`, `--dry-run`), **`python manage.py seed_category_mappings`** (loads rules from `workspace/notebooks/category-research/cr/taxonomy_estimate.py`; refuses when `DEBUG` is False unless `--force`), **`python manage.py seed_manifest_templates`** (four Phase 4.1A reviewed templates: Target 17-col, Walmart 13-col, Amazon 16-col, Amazon 17-col; refuses when `DEBUG` is False unless `--force`), **`python manage.py seed_fast_cat_mappings`** (343 consultant-reviewed **`fast_cat_key`** → **`canonical_category`** rows inlined in the command — **Target beauty-heavy**, **Walmart** general merch, **Amazon** mixed; not exhaustive for every vendor category path), **`python manage.py categorize_manifests`** (tier 1 + tier 3; **`--ai`** for Claude tier 2 with **`--ai-limit`** default 10), `python manage.py watch_auctions` (JWT: batch `GET auction.bstock.com/v1/auctions` with comma-separated `listingId`; writes `AuctionSnapshot`, updates `Auction`, sets `WatchlistEntry.last_polled_at`; flags `--dry-run`, `--auction-id`, `--force`). **`python manage.py seed_pricing_rules`** — loads **`PricingRule`** from `workspace/data/sell_through_by_category.csv` and ensures **`AppSetting`** keys: **`pricing_shrinkage_factor`**, **`pricing_profit_factor`**, **`pricing_need_window_days`**. **`python manage.py seed_marketplace_pricing_defaults`** — sets **`Marketplace.default_fee_rate`** / **`default_shipping_rate`** from optional CSV `workspace/data/marketplace_pricing_defaults.csv` (`slug`, `default_fee_rate`, `default_shipping_rate`) or built-in placeholders for known slugs. **`python manage.py estimate_auction_categories`** — runs **`estimate_batch`** for given auction PKs (Claude fast); **`--missing-both`** selects open/closing auctions with neither **`ai_category_estimates`** nor **`manifest_category_distribution`** (default cap **500** unless **`--limit`**). **`python manage.py recompute_buying_valuations`** — recomputes all open/closing auctions (run after **`seed_pricing_rules`** or data changes; seed command does not auto-recompute). **Heroku Scheduler:** run `watch_auctions` on a cadence **longer** than worst-case runtime (e.g. every 10+ minutes); server must have a valid JWT in `workspace/.bstock_token` or `BSTOCK_AUTH_TOKEN`.
- **Services:** `apps.buying.services.scraper`, `normalize` (maps nested B-Stock `attributes`, `attributes.ids`, `uniqueIds`, `categories`, `itemCondition`, etc. to `ManifestRow` columns), `pipeline`, **`categorize_manifest`** (tier 1 + 3), **`category_ai`** (optional Claude tier 2; `ANTHROPIC_API_KEY`, `BUYING_CATEGORY_AI_MODEL` → `AI_MODEL`), **`ai_manifest_template`** (Claude template proposal), **`ai_key_mapping`** (Claude batch `fast_cat_key` → taxonomy_v1), **`manifest_upload`**, **`buying_settings`** (read **`pricing_need_window_days`**), **`category_need`** (`taxonomy_bucket_for_item`, **`build_category_need_rows`** for inventory aggregates), **`valuation`** (**`recompute_auction_valuation`** refreshes manifest mix when **`has_manifest`**, **`recompute_all_open_auctions`**, **`compute_and_save_manifest_distribution`** retail-weighted, **`get_valuation_source`**, **`run_ai_estimate_for_swept_auctions`** uncapped / skip existing AI), **`ai_title_category_estimate`** (**`estimate_batch`**, `AI_MODEL_FAST` few-shot; cached system block with taxonomy + rules + JSON schema sized above Haiku **2048**-token cache minimum; per-vendor few-shot drops rows where **`Mixed lots & uncategorized` ≥ 80%** and skips entirely when vendor has no clean examples; output rows keyed by **`auction_id`** only — **`title_echo`** removed)
- **Core AI logging:** `apps/core/services/ai_usage_log.py` — `workspace/logs/ai_usage.jsonl`, `AI_PRICING` in `ecothrift/settings.py`
- **Settings:** `workspace/.bstock_token` (from `python manage.py bstock_token`) preferred over `BSTOCK_AUTH_TOKEN`; `BUYING_REQUEST_DELAY_SECONDS`, `BSTOCK_MAX_RETRIES`, `BSTOCK_SEARCH_MAX_PAGES`; **`AI_MODEL`**, **`AI_MODEL_FAST`**, **`AI_PRICING`** (see `ecothrift/settings.py` and the **Environment Variables** table in [`development.md`](development.md)). Bookmarklet: `apps/buying/bookmarklet/bstock_elt_bookmarklet.md`
- **Sweep / search debug (no Django):** `python workspace/test_bstock_api.py` — POST `search.bstock.com/v1/all-listings/listings` with the same JSON body and browser-like headers as `apps.buying.services.scraper.discover_auctions` (default Target `storeFrontId`). Use to see HTTP status, extracted listing count, and sample titles without app code or JWT.
- **Dev:** `POST /api/buying/token/` saves JWT to `workspace/.bstock_token` (DEBUG or localhost only)
- **API (staff):** `GET/POST` sweep (after discovery: optional AI title estimates for swept auctions without a manifest mix or existing AI estimates + **`recompute_all_open_auctions`** summary fields); `GET` auctions (list; ordering includes **`priority`**, **`estimated_revenue`**, **`profitability_ratio`**, **`need_score`**, **`thumbs_up_count`** (distinct voter count — **v2.19.0**); filters **`thumbs_up`** (query: current user has a vote), **`profitable`** (boolean → **`profitability_ratio` ≥ 1.5**), **`needed`** (boolean → **`need_score` > 0), **`has_manifest`**, marketplace/status); list/detail JSON **`my_thumbs_up`**, **`thumbs_up_count`**; `GET` auctions/summary/, marketplaces/; `GET` auctions/{id}/ (`category_distribution`, optional `manifest_template_name`; valuation fields incl. **`valuation_source`**, **`has_revenue_override`**, **`effective_revenue_after_shrink`**); **`POST`/`DELETE` auctions/{id}/thumbs-up/** (Admin; response **`my_thumbs_up`**, **`thumbs_up_count`**); **`PATCH` auctions/{id}/valuation-inputs/** (Admin: fee/shipping/revenue/shrinkage/profit/priority overrides; recomputes — **v2.19.1** string decimals normalized **`$`**, **`,`**; **400** if parse fails) — **`AuctionDetailViewSet.valuation_inputs`**, **`recompute_auction_valuation`**. `GET` manifest_rows/ (query: `search`, `category`; fields include `canonical_category`, `category_confidence`, `fast_cat_key`, `fast_cat_value`); `GET` auctions/{id}/snapshots/ (200/page); **`POST` auctions/{id}/upload_manifest/** (multipart **`file`**, **v2.7.0+**): Stage **1** — rows + template; response includes **`unmapped_key_count`**, **`total_batches`** when applicable; may run **Claude** template proposal for unknown headers; sets **`fast_cat_key`** / **`fast_cat_value`** from **`CategoryMapping`** where keys exist (**does not** invoke **`categorize_manifest_rows`**). **`POST` auctions/{id}/map_fast_cat_batch/** (body `{}` — **v2.7.0+**): one batch of up to **10** unmapped keys; **`CategoryMapping`** **`rule_origin='ai'`**. **`DELETE` auctions/{id}/manifest/** (**v2.7.0+**): deletes **`ManifestRow`** only; templates + **`CategoryMapping`** retained. **HTTP 400** if headers unknown (**`code=unknown_template`**, stub template created for admin) or template exists but **`is_reviewed=False`** (**`template_not_reviewed`**). `POST` poll/; `POST`/`DELETE` auctions/{id}/watchlist/; `GET` watchlist/ (collection; filters **`marketplace`**, **`status`**, **`has_manifest`**, watchlist **`priority`** / **`watchlist_status`**). **`GET` /api/buying/category-need/** — **`need_window_days`**, **`categories`** (19 rows: shelf/sold counts and %, **`avg_profit`** / **`profit_margin`** / **`good_data_sample_size`**, need gap, **`recovery_rate`** / **`recovery_pct`**, **`bar_scale_max`**; sorted by need gap).
- **Verification (Phase 5):** After migrate + optional **`seed_pricing_rules`** / **`seed_marketplace_pricing_defaults`**, **`GET /api/buying/category-need/`** should return **`need_window_days`** and **19** **`categories`**. Spot-check shelf/sold counts vs `inventory_item` for one taxonomy name. Upload a manifest or run **`estimate_auction_categories`** then **`GET /api/buying/auctions/{id}/`** — expect **`valuation_source`**, **`estimated_revenue`**, **`priority`**, etc.
- **UI:** Django admin at `/db-admin/`; staff React under `/buying/*` (see `frontend.md`)
