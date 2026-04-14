<!-- Last updated: 2026-04-15T12:00:00-05:00 -->
# B-Stock API and scraper reference

**Full endpoint catalog (methods, limits, auth probes, samples):** [`workspace/notes/from_consultant/bstock_api_research.md`](../../workspace/notes/from_consultant/bstock_api_research.md). This file stays a **scraper-centric** map aligned with `apps/buying/services/scraper.py`.

## API surface (apps/buying/services/scraper.py)

All B-Stock HTTP calls go through `apps/buying/services/scraper.py`. No calls are triggered automatically by page loads or app startup. Every call requires explicit user action (UI button or management command).

**Search:** The public **`search.bstock.com/v1/all-listings/listings`** endpoint accepts **GET** (query params) **or** **POST** (JSON body). The Django app uses **POST** with **`storeFrontId` as an array**, default **`limit=200`**, parallel **ThreadPoolExecutor** per active marketplace (`discover_auctions_parallel`), optional **`BUYING_REQUEST_DELAY_SECONDS`** (default **0**). Discovery results upsert via raw SQL in **`sweep_upsert`** (preserves **`first_seen_at`** on conflict). Optional **SOCKS5** (`socks5h`) for search only — **`BUYING_SOCKS5_*`** env, **`PySocks`**. **Max `limit` = 200** per request. **Standalone ops sweep (no Django):** `python workspace/sweep_fast.py` — keep mapping aligned with **`listing_mapping.py`**; parallel GET + direct `psycopg2` upsert.

### Internal Django endpoints (staff REST — not B-Stock hosts)

Phase **5** adds valuation-related routes on the **same** `/api/buying/` router (see `apps/buying/urls.py`, `api_views.py`): e.g. **`POST`/`DELETE` `/api/buying/auctions/{id}/thumbs-up/`** (Admin), **`PATCH` `/api/buying/auctions/{id}/valuation-inputs/`** (Admin), **`GET` `/api/buying/category-need/`**, **`GET`/`POST` `/api/buying/category-want/`**. List auctions supports **`ordering=-priority`** and **`thumbs_up`** filter. **`POST` `/api/buying/sweep/`** runs discovery then **optional** AI title-category estimate for a limited batch of new auctions and **`recompute_all_open_auctions()`** (see `backend.md` Buying section). These do **not** call B-Stock except via **`pipeline.run_discovery`** (search).

| Function | Endpoint | Auth (in code) | Notes |
|----------|----------|----------------|--------|
| discover_auctions | **POST** search.bstock.com/v1/all-listings/listings | None | Same API works as **GET** with query params; **`limit` ≤ 200**. sweep_auctions, Refresh button. |
| get_auction_detail | GET auction.bstock.com/v1/auctions | JWT (`get_auth_headers`) | Probes: anonymous GET with `listingId` may return **200** — see research doc. |
| get_auction_states_batch | GET auction.bstock.com/v1/auctions | JWT | Batch auction state lookup |
| get_lot_detail | GET listing.bstock.com/v1/groups | JWT | Lot group data |
| get_manifest | GET order-process.bstock.com/v1/manifests/{lotId} | JWT | Probes: anonymous GET succeeded for **tested** lots (see research doc). **Production:** CSV **`POST …/upload_manifest/`** (no live B-Stock). Manifest paging **`limit`** up to **1000** (not the search **200** cap). |
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

Token-backed operations (ban risk, use only when needed):
- sweep_auctions --enrich-detail
- pull_manifests command
- watch_auctions command
- Pull Manifest button on auction detail page
