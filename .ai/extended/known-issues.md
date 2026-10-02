<!-- Last updated: 2026-09-30 (moved out of context.md by tech_target) -->
# Known issues and live gaps

Load when a task touches one of these areas, or before a ship (docs audit in [`ship.md`](../protocols/ship.md)). Fixed items come off this list.

## Known issues

- **Inventory — acquisition cost:** `Item.retail_value` is vendor/manifest retail. `Item.cost` is allocated per PO using `PurchaseOrder.est_shrink` and listing retail. Retag floor stock can have null cost — see Item acquisition cost in [`backend.md`](backend.md).
- **Buying — `DELETE manifest` edge case:** wrong-marketplace CSV can leave misleading `CategoryMapping` prefixes after rows are removed.
- **`anthropic` package** must be in the venv for AI features (lazy import).
- Recharts ResponsiveContainer may log a width/height warning on first render (cosmetic).
- Large JS bundle (~1.7MB).
- POS cash completion should be hardened for malformed numeric payloads.
- **POS — already sold:** the dialog is SKU-exact (`status=sold`). Check-in edit no longer births sold units when quantity is raised after a sibling sold (**v2.95.0**). Duplicate physical tags (Quick Reprice / extra copies of one SKU) and cart qty++ on the same SKU still produce the message.
- **Routines — Opening can run twice a day:** once a pooled run picks up an assignee and is finished, the pooled branch of `materialize_routines` (it looks for `status=open` only) makes a second run for the same period. Seen 2026-09-22 (runs 180 and 187). Fix: skip creation when any run exists for that routine and period.
- **Tests — `tests_*.py` are not collected by default:** `pytest.ini` `python_files` is `test_*.py tests.py`, so a bare `pytest apps/routines` skips the nine `tests_*.py` files; name them. Pre-existing red (the `Retail` department seed collision, em dashes in six files, grading and clock-dependent asserts) is listed under Later in [`time_kiosk`](../initiatives/_archived/time_kiosk.md).

## Not yet implemented (live gaps)

- No DB link from won **Auction** → **PurchaseOrder**.
- Email notifications beyond Graph transactional mail (holds, magic links, and password resets are covered).
- Broad automated test suite (POS and restoration have coverage; most domains do not).
- Pricing ML model not trained. Buying report cards start empty: only trucks won with "We won it" (v2.104.0+) count, and calibration needs 5 trucks that are 90+ days old and half sold.
