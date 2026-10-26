<!-- Last updated: 2026-10-26 (phase 1: sale facts and the weekly rollup) -->
# Inventory review

The owner's plan (approved 2026-10-22): weekly numbers per category, subcategory, vendor and price point, so the
floor can be read and buying steered. Phase 1 is the data; phase 2 adds Inventory → Review (Categories tab).

## Sale facts on the item (phase 1)

`Item.sold_net` and `Item.thriftbucks_at_sale` are written with `sold_for`, in the same save
(`apps/inventory/services/sale_facts.py`).

- **sold_net** = what the store keeps per unit: `sold_for` less the **kept** ThriftBucks the line earned, per unit.
  `sold_for` already has Instant ThriftBucks off (`CartLine.thrift_savings`). A sale with no member: `sold_net = sold_for`.
- **thriftbucks_at_sale** = ThriftBucks the unit collected (`collected / qty`); 0 with no member.
- **ThriftBucks spent are a tender.** They never come off the item they are spent on.
- Source: the line snapshot `CartLine.meta['thrift_plus']`, written by `register._member_sale` after the POS item loop,
  which then updates the item. The POS sets `sold_net = sold_for` first, so a failed Thrift+ step still leaves a value.
- Every path that sets or clears `sold_for` does the same: POS complete and void, Online Sales "Sold online" and its
  undo, the duplicate-tag move and its undo, Find item's "back on the shelf", deleting a member's sales, and the QA
  request `qa.sold_from_cart`. `sold_for` itself is never changed.
- Old sales: the Request **`inventory.backfill_sale_facts`** (`stage_request`, approved in Dash → Requests) fills
  only empty fields: member lines since 2026-10-16 from their snapshot, every other sale `sold_net = sold_for`. No undo
  (it never overwrites).

## The weekly rollup `InventoryWeek` (phase 1)

One row per (week starting Monday, dimension, key), rebuilt from items by `services/inventory_week.py`.
Command: `python manage.py rebuild_inventory_weeks` (last 8 weeks; on an empty table, all 2 years), `--full`
(2 years), `--weeks N`. Heroku Scheduler: daily, after `compute_daily_category_stats`. About 7 s nightly and 50 s for
the full build on a production-size copy. Buying's `CategoryStats` is not changed.

| Dimension | Key | Notes |
|---|---|---|
| category | taxonomy_v1 name (23, Mixed lots included) | `taxonomy_bucket_case_sql`, honours `category_from_profile` like Buying |
| subcategory | `ProductProfile.subcategory`, `parent` = its category | '' = "No subcategory" |
| vendor | vendor code | '' = "No vendor"; Misfit items are on MIS |
| price_point | `u5`, `5-10`, `10-25`, `25-50`, `50-100`, `100+` | today's tag price (no price history) |

**Rules** (data-quality first: nothing is dropped, every gap is counted):

- **In** = `checked_in_at`; with none, `created_at` (counted in `on_hand_no_checkin` / `sold_no_checkin`). Items in
  intake or processing, and scrapped or lost items never checked in, never reached the floor.
- **Out** = sold at `sold_at`; scrapped / lost / old "returned" at the history row that set the status, else
  `updated_at`. "Sold" with no `sold_at` (SAL-04) is not a sale: `units_out_other`.
- **Old-system imports** (`BACKFILL:` notes, eras V1/V2): no real in date. Every sold one is in `legacy_sold` (not
  `units_in`), and in `units_sold` and the money when it has a sale date; never on hand; no days to sell. Their scrapped rows are unsold imports and are left
  out (data-quality standing decision 3).
- **On hand** at the week's end (now for the open week). The weeks chain: on hand = last week + in + legacy_sold − sold
  − scrapped − lost − out_other.
- **Stale** = on hand and in more than `inventory_review_stale_days` (AppSetting, default 90) days.
- **Bulk** = on hand units of a product with Thrift+ `group_min_units` (10, rulebook P6) or more on hand.
- **Money**: `sales` = Σ`sold_for`, `net` = Σ`sold_net` (`sold_for` where empty). `sold_retail` / `sold_cost` sum only
  sold items that have them (`sold_with_retail`, `sold_with_cost`), with the net of those same items
  (`sold_net_with_retail`, `sold_net_with_cost`): recovery = net ÷ retail on like items.
- `units_returned` = Thrift+ returns taken that week (`ReturnRecord`; the item stays sold).
- `median_days_to_sell` = sold that week, in to out.

Checked on a copy of production (2026-10-26): every dimension's open-week on hand equals the live on-shelf count, and
the chain holds for every week.
