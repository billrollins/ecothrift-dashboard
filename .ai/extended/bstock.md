<!-- Last updated: 2026-04-09T20:00:00-05:00 -->
# B-Stock API and scraper reference

## API surface (apps/buying/services/scraper.py)

All B-Stock HTTP calls go through `apps/buying/services/scraper.py`. No calls are triggered automatically by page loads or app startup. Every call requires explicit user action (UI button or management command).

### Internal Django endpoints (staff REST — not B-Stock hosts)

Phase **5** adds valuation-related routes on the **same** `/api/buying/` router (see `apps/buying/urls.py`, `api_views.py`): e.g. **`POST`/`DELETE` `/api/buying/auctions/{id}/thumbs-up/`** (Admin), **`PATCH` `/api/buying/auctions/{id}/valuation-inputs/`** (Admin), **`GET` `/api/buying/category-need/`**, **`GET`/`POST` `/api/buying/category-want/`**. List auctions supports **`ordering=-priority`** and **`thumbs_up`** filter. **`POST` `/api/buying/sweep/`** runs discovery then **optional** AI title-category estimate for a limited batch of new auctions and **`recompute_all_open_auctions()`** (see `backend.md` Buying section). These do **not** call B-Stock except via **`pipeline.run_discovery`** (search).

| Function | Endpoint | Auth | Trigger |
|----------|----------|------|---------|
| discover_auctions | POST search.bstock.com/v1/all-listings/listings | None | sweep_auctions command, Refresh button on auction list |
| get_auction_detail | GET auction.bstock.com/v1/auctions | JWT | sweep_auctions --enrich-detail only |
| get_auction_states_batch | GET auction.bstock.com/v1/auctions | JWT | Batch auction state lookup |
| get_lot_detail | GET listing.bstock.com/v1/groups | JWT | Lot group data |
| get_manifest | GET order-process.bstock.com/v1/manifests/{lotId} | JWT | pull_manifests command, Pull Manifest button (dev / optional). **Production path:** staff uploads CSV via **`POST /api/buying/auctions/{id}/upload_manifest/`** (no B-Stock call; **v2.6.1**). |
| get_shipping_quotes | GET shipment.bstock.com/v1/quotes | JWT | Shipping estimates |
| get_unique_bid_counts | GET auction.bstock.com/v1/auctions/bids/unique | JWT | Bid count enrichment |

## Operational safety

Safe operations (no ban risk):
- Opening the dashboard (no B-Stock calls)
- Browsing auctions, manifests, watchlist (DB reads only)
- sweep_auctions without flags (public search endpoint only)
- CSV manifest upload (local file processing, no B-Stock call)
- **`POST` `/api/buying/sweep/`** from the UI (search discovery only; no JWT) — **Phase 5** may run **Claude** title-category estimates server-side for a limited batch (`ANTHROPIC_API_KEY`), not B-Stock
- Management commands **`recompute_buying_valuations`**, **`estimate_auction_categories`** (DB + optional Anthropic; no B-Stock)

Token-backed operations (ban risk, use only when needed):
- sweep_auctions --enrich-detail
- pull_manifests command
- watch_auctions command
- Pull Manifest button on auction detail page
