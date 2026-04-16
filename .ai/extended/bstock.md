<!-- Last updated: 2026-04-16T20:30:00-05:00 (reference tree removed — opening paragraph) -->
# B-Stock API and scraper reference

**Committed map:** This file is the **scraper-centric** reference aligned with `apps/buying/services/scraper.py`. A longer probe-backed catalog previously lived under **`.ai/reference/`**; that tree is **not** in the repo anymore — treat **`scraper.py`** + this doc as authoritative.

**Valuation (v2.14.0):** Staff auction **`need_score`** and auto **`priority`** are **1–99** integers derived from daily **`CategoryStats.need_score_1to99`** (per taxonomy bucket) × manifest or AI category weights — see **`apps/buying/services/valuation.py`** and **`.ai/extended/backend.md`** (buying / inventory). Not the same as PO-level **`est_shrink`** (inventory item cost).

## API surface (apps/buying/services/scraper.py)

All B-Stock HTTP calls go through `apps/buying/services/scraper.py`. No calls are triggered automatically by page loads or app startup. Every call requires explicit user action (UI button or management command).

**Search:** The public **`search.bstock.com/v1/all-listings/listings`** endpoint accepts **GET** (query params) **or** **POST** (JSON body). The Django app uses **POST** with **`storeFrontId` as an array**, default **`limit=200`**, parallel **ThreadPoolExecutor** per active marketplace (`discover_auctions_parallel`), optional **`BUYING_REQUEST_DELAY_SECONDS`** (default **0**). Discovery results upsert via raw SQL in **`sweep_upsert`** (preserves **`first_seen_at`** on conflict). **SOCKS5 (v2.14.1):** All `*.bstock.com` requests via `_request_json` route through SOCKS5 when `BUYING_SOCKS5_PROXY_ENABLED=True`. PIA requires `socks5://` (local DNS, `BUYING_SOCKS5_LOCAL_DNS=True`); optional `BUYING_SOCKS5_PROXY_IP` for resolved-IP override. Full setup, troubleshooting, and diagnostic: **[`.ai/extended/vpn-socks5.md`](vpn-socks5.md)**. **Max `limit` = 200** per search request. **Supported path:** **`python manage.py sweep_auctions`** (and staff **`POST /api/buying/sweep/`**); ad hoc parallel scripts are not committed.

### Internal Django endpoints (staff REST — not B-Stock hosts)

Phase **5** adds valuation-related routes on the **same** `/api/buying/` router (see `apps/buying/urls.py`, `api_views.py`): e.g. **`POST`/`DELETE` `/api/buying/auctions/{id}/thumbs-up/`** (Admin), **`PATCH` `/api/buying/auctions/{id}/valuation-inputs/`** (Admin), **`GET` `/api/buying/category-need/`**. List auctions supports **`ordering=-priority`** and **`thumbs_up`** filter. **`POST` `/api/buying/sweep/`** runs discovery then **optional** AI title-category estimate for a limited batch of new auctions and **`recompute_all_open_auctions()`** (see `backend.md` Buying section). These do **not** call B-Stock except via **`pipeline.run_discovery`** (search).

| Function | Endpoint | Auth (in code) | Notes |
|----------|----------|----------------|--------|
| discover_auctions | **POST** search.bstock.com/v1/all-listings/listings | None | Same API works as **GET** with query params; **`limit` ≤ 200**. sweep_auctions, Refresh button. |
| get_auction_detail | GET auction.bstock.com/v1/auctions | JWT (`get_auth_headers`) | Probes: anonymous GET with `listingId` may return **200** — see research doc. |
| get_auction_states_batch | GET auction.bstock.com/v1/auctions | optional (default anonymous) | Batch auction state lookup |
| get_lot_detail | GET listing.bstock.com/v1/groups | JWT | Lot group data |
| get_manifest | GET order-process.bstock.com/v1/manifests/{lotId} | Anonymous (no JWT) | **`scraper.get_manifest`** paginates with **`limit`** ≤ **1000**, **`max_rows`** default **10_000**; optional **`auction_id`** (Django PK) resolves **`lot_id`**. **B-Stock hard-caps page size at 10 items** regardless of `limit` param (v2.15.1 finding). **v2.15.1:** uses `_manifest_http_session()` (singleton `requests.Session` for TLS reuse). **Production:** CSV **`POST …/upload_manifest/`** (no live B-Stock). |
| get_shipping_quotes | GET shipment.bstock.com/v1/quotes | JWT | Shipping estimates |
| get_unique_bid_counts | GET auction.bstock.com/v1/auctions/bids/unique | JWT | Bid count enrichment |

## Operational safety

Safe operations (no ban risk):
- Opening the dashboard (no B-Stock calls)
- Browsing auctions, manifests, watchlist (DB reads only)
- sweep_auctions without flags (public search — **GET** or **POST** — no JWT)
- CSV manifest upload (local file processing, no B-Stock call)
- **`POST` `/api/buying/sweep/`** from the UI (search discovery only; no JWT) — **Phase 5** may run **Claude** title-category estimates server-side for a limited batch (`ANTHROPIC_API_KEY`), not B-Stock
- Management commands **`recompute_buying_valuations`**, **`estimate_auction_categories`** (DB + optional Anthropic; no B-Stock)
- **`pull_manifests`** / **`pull_manifests_budget`** / **`pull_manifests_nightly`** management commands — anonymous **`get_manifest`** (no JWT); **v2.15.1** pipeline optimizations (session reuse, prefetch, batch_size, default delay 1 s). A 1000-row manifest ≈ **101 API calls** (10 items/page hard cap)

Token-backed operations (ban risk, use only when needed):
- sweep_auctions --enrich-detail
- watch_auctions command
- Staff **POST** `/api/buying/auctions/{id}/pull_manifest/` is **disabled** (use CSV or **`manage.py pull_manifests`**)

## Staff React UI (cross-reference)

Desktop **auction list** DataGrid behavior, stable columns, watch/thumbs mutations — **v2.13.1** — documented in **`.ai/extended/frontend.md`** (section *Buying — desktop auction list*). **Need** column shows integer **1–99** after **v2.14.0**. This file remains scraper/API-centric.
