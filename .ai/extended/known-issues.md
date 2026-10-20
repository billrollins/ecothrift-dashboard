<!-- Last updated: 2026-10-20 (POS next-unit scan and cash-completion input checks shipped; both POS items off the list) -->
# Known issues and live gaps

Load when a task touches one of these areas, or before a ship (docs audit in [`ship.md`](../protocols/ship.md)). Fixed items come off this list.

## Known issues

- **Inventory — acquisition cost:** `Item.retail_value` is vendor/manifest retail. `Item.cost` is allocated per PO using `PurchaseOrder.est_shrink` and listing retail. Retag floor stock can have null cost — see Item acquisition cost in [`backend.md`](backend.md).
- **`anthropic` package** must be in the venv for AI features (lazy import).
- Main JS chunk is about 0.9MB (275KB gzipped): every screen except login is lazy-loaded (`App.tsx`), and what is left is the shared base (MUI, react-router, react-dom, date-fns, axios, the API modules). Splitting MUI and React into vendor chunks was tried and made the first load bigger; only worth it for cross-release caching. Charts, the data grid, the editors, the PDF and camera libraries load only with their screens.
- **Thrift+ — floor counts include back stock and unwritten shrink:** the supply rule and Thrift+ → Overstock (rulebook P6) count every `on_shelf` unit, and almost none carry a back-stock location (52 of 35,017 on 10-19), so some products look slower than they are and grow ThriftBucks sooner. Fixed by back-stock counts (P5, P7).

## Not yet implemented (live gaps)

- No DB link from won **Auction** → **PurchaseOrder**.
- Email notifications beyond Graph transactional mail (holds, magic links, and password resets are covered).
- Broad automated test suite (POS and restoration have coverage; most domains do not).
- Pricing ML model not trained. Buying report cards start empty: only trucks won with "We won it" (v2.104.0+) count, and calibration needs 5 trucks that are 90+ days old and half sold.
