# The warehouse (Analytical layer)

A local DuckDB file built from the local copy of production. It's for analysis and modelling, and nothing in it
reaches production.

```bash
scripts\db\pull_prod_to_local.bat                  # refresh the local copy (replaces the local database)
python -m warehouse.build                        # rebuild: about 5 seconds; prints the checks
python -m factory.run sold_30                    # the model factory on one target
jupyter lab warehouse/notebooks/tour.ipynb       # the guided tour
```

Output: `workspace/warehouse/ecothrift.duckdb`, `workspace/warehouse/parquet/<table>.parquet`, and
`workspace/warehouse/build.json` (when it was built, which pull it came from, rows per table, checks).

## How the tables connect

```
             po ──┐
                  │ purchase_order_id
                  ▼
auction ──► item ◄── product_id / category (from the product)
             │ item_id
             ├──► sale_line ──► misfit_sale        (sales that can't be placed)
             ├──► item_event                        (everything that happened, in time order)
             ├──► item_price                        (the tag over time)
             └──► floor_interval ──► floor_daily    (the floor on every day)
                                ├──► sell_curve_daily / sell_curve
                                ├──► category_supply (weekly floor, sales, weeks of cover)
                                ├──► floor_now       (what's out now, and its odds)
                                └──► item_outcome    (one row per item out: the modelling table)
```

## The tables

| Table | One row per | What it's for |
|---|---|---|
| `item` | inventory item | Current state plus the era and fill-in flags: `era` (v1, v2, v3_retag, v3), `category_is_mixed`, `category_untrusted` (V1/V2), `cost` (null when unknown), `cost_known`, `no_po`, `misfit_po`, `backfill_unsold`. `listed_at` / `checked_in_at` are null on imports (ITM-02). |
| `po` | purchase order | Money with the "$0 means unknown" rules (`fees`, `shipping_cost` null), `placeholder_vendor`, `dates_backwards`, the linked `auction_id`. |
| `sale_line` | cart line on a completed or voided cart | The sale record: `day` (store day), `line_kind`, `quantity`, `line_total`, `thrift_savings`, `backfill_duplicate` (SAL-08: count once), `return_or_discount`. |
| `misfit_sale` | completed sale we can't place | `reason`: `no_item` (a manual line), `misfit_po` (MIS vendor), `no_po`, `no_manifest` (V3). |
| `item_event` | event | `event_at`, `kind` (status_change, price_change, sold, sale_voided, scan, tp_scan, tp_reward, ...), `old_value`, `new_value`, `source`, `at_estimated`. The sale comes from the cart, because checkout writes no history (SAL-14). |
| `item_price` | tag interval | `price` valid over `[valid_from, valid_to)`. `price_source`: `retag`, `before_first_retag`, `no_retag_recorded` (ITM-14). |
| `floor_interval` | item that was on the floor | `start_at` with `start_source` (on_shelf_event, listed_at, checked_in_at, created_at, import_date), `end_at` with `end_reason` (sold, sold_at, lost, scrapped, sold_no_date, or null = still out), `start_known`, `in_daily`. |
| `floor_daily` | store day since 2026-04-01 | `items` on the floor at the day's end, `tag_value` (the tag that day), `tag_value_today`, `retail_value`, `stale_items` (over 90 days), `start_known_items`, `mixed_items`, `added`. |
| `sell_curve_daily` | category and day on the floor | `share_sold` by that age (Kaplan-Meier: items still out count fairly), `at_risk`. |
| `sell_curve` | category and mark | `share_sold` at days 7, 14, 30, 43, 60, 77 and 90. For stock put out Oct 15, day 43 is Black Friday and day 77 is Dec 31. |
| `category_supply` | week and category | `items_on_floor`, `units_sold`, `revenue`, `weeks_of_cover` (floor ÷ the last 4 weeks' pace). |
| `floor_now` | item out at the pull | `age`, `age_band`, `sell_next_30` (its chance to sell in 30 days from its category's curve). |
| `item_outcome` | item out since 2026-04-12 with a known start | The modelling table. Features known the day it went out: category, brand, condition, vendor, retail, `tag` then, the category's floor and pace the week before, `same_product_on_floor`. Outcomes: `sold`, `censored`, `days_on_floor`, `sold_for`, `recovery`. |
| `auction`, `auction_price` | B-Stock listing / snapshot | `close_price` with `close_source` (outcome or last swept, AUC-02). |
| `category_label` | category proposal on a product | The label history (PRD-04): `value`, `source`, `confidence`, `status`. |
| `sale_line_po` | no-item register line and PO | Assignment (owner rules): `method` = express_code (the PO it names), weekly_share (split by that week's PO sales), bin_pink (own group), before_pos (unassigned). Shares sum to 1 per line. |
| `po_economics` | purchase order | Cost, revenue (items + assigned lines), `revenue_to_cost`, `recovery`, `sell_through`, shrink buckets (disputed, never_checked_in, lost_or_scrapped, unknown_fate, still_out), `received_est` with `received_source`, flags `cost_unknown`, `still_selling`. |
| `item_cost` | sold item | The truck's cost on it, by its share of the truck's sales (owner rule). |
| `checks` | check | Counted on every build; `should_be` 0 means a failure makes the build exit 1. |

Every fill-in is listed in `.ai/extended/data-quality.md` (the register and the imputation catalog). The IDs in the
column notes above (ITM-02, SAL-08, ...) point there.
