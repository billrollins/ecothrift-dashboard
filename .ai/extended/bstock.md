<!-- Last updated: 2026-04-10T18:45:00-05:00 -->
# B-Stock API and scraper reference

## API surface (apps/buying/services/scraper.py)

All B-Stock HTTP calls go through `apps/buying/services/scraper.py`. No calls are triggered automatically by page loads or app startup. Every call requires explicit user action (UI button or management command).

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

Token-backed operations (ban risk, use only when needed):
- sweep_auctions --enrich-detail
- pull_manifests command
- watch_auctions command
- Pull Manifest button on auction detail page
