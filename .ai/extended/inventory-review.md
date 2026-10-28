<!-- Last updated: 2026-10-28 (phase 4: recovery per item, behind the owner switch) -->
# Inventory review

The owner's plan (approved 2026-10-22): weekly numbers per category, subcategory, vendor and price point, so the
floor can be read and buying steered. Phase 1 is the data (v2.216.0); phase 2 is Inventory → Review, Categories tab
(v2.218.0); phase 3 the Vendors, Price points and Flags tabs; phase 4 the recovery estimate per item, behind the
owner's switch.

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
(2 years), `--weeks N`. It runs at the end of the daily `compute_daily_category_stats` (no Scheduler job of its own; `--skip-inventory-weeks` skips it). About 7 s nightly and 50 s for
the full build on a production-size copy. Buying's `CategoryStats` is not changed.

| Dimension | Key | Notes |
|---|---|---|
| category | taxonomy_v1 name (23, Mixed lots included) | `taxonomy_bucket_case_sql`, honours `category_from_profile` like Buying |
| subcategory | `ProductProfile.subcategory`, `parent` = its category | '' = "No subcategory" |
| vendor | vendor code | '' = "No vendor"; Misfit items are on MIS |
| price_point | `u5`, `5-10`, `10-25`, `25-50`, `50-100`, `100+` | today's tag price (no price history) |
| all | '' | the whole store, one row a week (phase 3), so every Review tab shows the same total |

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

## Inventory → Review, Categories tab (phase 2)

`/inventory/review` (nav: Inventory → Review, under Search; everyone who sees Search, `IsStaff`, cost numbers shown as on
Vendors). Page `pages/inventory/InventoryReviewPage.tsx`; API `GET /api/inventory/review/?span=1|4&category=<name>`
(`services/inventory_review.py`). About 0.5 s on a production-size copy.

- **Week** = the last complete Monday-to-Sunday week; **4 weeks** = the last four. In, out (sold + scrapped + lost +
  out_other), recovery and days to sell come from `InventoryWeek` over those weeks.
- **On hand, stale, bulk, missing data are now**: one grouped query over the items on the shelf (same rules as the
  rollup).
- **Weeks of supply** = on hand ÷ (units sold in the last 4 weeks ÷ 4), whatever the toggle. "99+" above 99.
- **Recovery** = net ÷ retail on sold items with a retail, and net ÷ cost (×) where cost exists. **Days** = the median of
  the weeks' medians, weighted by units sold.
- **Flags** (owner settings, Settings → Inventory → Inventory review; seeded by migration 0119):

| Flag | Rule | Setting (default) |
|---|---|---|
| Overstocked | weeks of supply above the limit, or stock with no sale in 4 weeks | `inventory_review_overstock_weeks` (12) |
| Short | weeks of supply below the limit | `inventory_review_short_weeks` (2) |
| Stale-heavy | stale share of on hand above the limit | `inventory_review_stale_heavy_share` (40%) |
| Slowing | 4-week sales at least this far below the 12-week average, with at least 1 sale a week over 12 weeks | `inventory_review_slowing_share` (30%) |
| Missing data | Mixed lots, or on hand with no retail or no check-in date above the limit | `inventory_review_missing_share` (10%) |

- **Drill**: a category row opens its subcategories (`?category=`); a subcategory row opens Inventory search with
  `category` and `sub`; the stale % opens it with `stale=1` too. "See items" opens the whole category.
- Desk: a sortable table with the total on top. Phone: one card per row with a sort menu.

## Vendors, Price points and Flags tabs (phase 3)

- `?tab=vendors` / `?tab=price-points` (API `?tab=vendor|price_point`): the same columns and flags as Categories, one
  row per vendor code ("No vendor" for items with no order; Misfit items are on MIS) or tag price band (in band order).
  A row opens Inventory search with `vendor=<code>` (`(none)` = no vendor) or `price_point=<band>`; the stale % adds
  `stale=1`. Vendor names come from the rollup, or from `Vendor` for a vendor with stock but no rollup rows yet.
- **Totals** read the rollup's `all` rows (or, inside a category, the category's own rows), so the "All" row is the
  same on every tab. Until a rebuild has written `all` rows for every week shown, the total adds up the rows.
  Migration 0120 only adds the `all` choice; run `rebuild_inventory_weeks --full` once after deploy (else the nightly
  run fills the last 8 weeks and the 12-week totals add up the rows until then).
- `?tab=flags` (API `GET /api/inventory/review/flags/?span=`, `inventory_review.flags_summary`): each flag's rule, its
  limit, and what carries it now on each tab (first 8 per tab, "+N more"). A category chip opens its subcategories;
  a vendor or price point chip opens its items. Managers (and the Super User) change a limit right there (the same
  settings as Settings → Inventory → Inventory review, `PATCH /api/core/settings/<key>/`); everyone else sees the limits.

## Recovery estimate per item (phase 4, owner's switch)

`services/recovery_estimate.py`, behind **`inventory_recovery_estimate`** (off by default; owner-only: Admin or the
Super User, `AppSettingViewSet.ADMIN_ONLY`). Recovery = net (`sold_net`) ÷ retail, on sold items with a retail.

- **Sources** (rate and n = sold items with a retail): the store, category, subcategory and vendor and price point from
  the rollup over the last 52 complete weeks; condition from sold items over the last year (the rollup has none); the
  **sold vector neighbours** (`ProductVector`, similarity ≥ 0.75, their sales over a year), only from a product's
  stored vector so no model loads on the web server.
- **Pulled toward the parent**: (n·r + k·parent) ÷ (n + k), k = `inventory_recovery_prior_n` (30). Category → store,
  subcategory → category, neighbours → subcategory; vendor, price point, condition → store. Then the "what it is"
  level, vendor, price point and condition are averaged, each weighted n ÷ (n + k).
- **Shown n** = the most specific "what" level with at least k sales ("similar items keep 31% of retail (n=212)").
- **Band** = retail × recovery × (1 ± `inventory_recovery_band_share`, 20%); a price outside it is priced high or low.
- The model (all the rates) is cached for an hour (`inventory_recovery_model_v1`).

Where it shows:

- **Processing check-in** (`ProcessingCheckInDialog` → `CheckInDetailFieldsSection.belowPrice` →
  `components/inventory/RecoveryHint.tsx`; `GET /api/inventory/recovery-estimate/?retail=&product=&order=&condition=&price=`):
  the line, the band, a Priced high / low chip, and "Use $x" (the band's middle). Uses neighbours.
- **Preprocessing** pricing table: under the Ideal price, "keeps 31%" (tooltip: n, basis, band; click to set the
  price to the middle). From the review rows' `recovery` field (one model per page, no neighbours).
- **The price estimator** (`price_estimator.estimate_price`, `POST /api/inventory/estimate-price/`, the order's
  "estimate prices"): returns `recovery`; with no trained model it prices from it (`method: 'recovery'`) instead of the
  fixed condition multipliers.
- **Inventory review flags** Priced high / Priced low (switch on only): the shelf's asking price ÷ retail against what
  sold kept over 12 weeks, `inventory_review_price_gap_share` (25%) apart, with at least `inventory_review_price_min_n`
  (20) sales. Asking is a tag price and kept is after ThriftBucks, so asking runs a little above kept even when priced
  right. On the Flags tab as one "Priced high or low" card.

Settings (migration 0124): the switch, `inventory_recovery_prior_n`, `inventory_recovery_band_share`,
`inventory_review_price_gap_share`, `inventory_review_price_min_n` (Settings → Inventory → Recovery estimate and
Inventory review).
