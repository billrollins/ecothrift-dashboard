<!-- Last updated: 2026-09-30 (drafted from the owner's description; not started) -->
# Initiative: sell_time_model

**Status:** Planned. Starts when the catalog standardize run finishes and the backfill is loaded (about 10-01 and after). First real project on the local warehouse (`data_platform` Phases 4 and 5).
**Owner's idea (2026-09-30):** load all the data we can once products are standardized and have good vectors, then learn how **time to sell** depends on **context and price**. Keep trying ideas (add features, remove features) until the model is as good as it can be. Then use it inside the pricing model, so different pricing strategies can be compared by the sales they would produce.

## The shape of the problem

Break it into one row per **item per day on the floor**:

| Column | Meaning |
|---|---|
| item, product, day | one row for each day an item sat on the shelf |
| price that day | the price in force that day (tag, store sale, Thrift+ member price as its own column) |
| **label: sold** | yes/no: did it sell that day |

This turns "how long until it sells" into a daily yes/no. It also handles items that were only at a price for a day or a week (markdowns, sales): each day carries the price it had, so a price that lasted a week gives seven honest rows. (It is a discrete-time survival model; the output per day is the chance of selling at that price.)

## Features to try (add and remove; keep a log of what each did)

- Price, price ÷ retail, price ÷ the product's typical selling price, days on the floor so far.
- Day of week, week of year, holiday and weather-free calendar effects, store traffic that day.
- Product: category and subcategory (from the standardized taxonomy), brand, condition, vector neighbours.
- **Similar products in the store that day:** how many, at what prices (competition for the same buyer), how many sold recently.
- Location and display: aisle, floor section.
- Earlier sell speed of the same product and of similar products.

## How we test it (this is the hard part)

- **Split by time, never at random.** Train on earlier weeks, test on later ones. A final holdout is opened once.
- **Score the probabilities**, not just yes/no: log loss and calibration (when it says 10%, about 10% should sell), plus a per-day lift chart. Baselines to beat: "same product's average", "category average", "price ratio only".
- **Price-change tests:** items whose price changed while they sat are natural experiments. Check that predictions move the right way when the price moves, and compare predicted vs actual for the days right after a markdown.
- **Caution:** price is not random (we mark things down when they don't sell), so a model can learn "low price means slow" wrongly. Use days-on-floor and the price history as features, and validate on sale days the owner set by calendar (Labor Day, Thrift+ launch) where price was not reactive.
- Every try is logged (features used, score), so we can go back. The model factory (`factory/`, Phase 5) already holds the time folds and holdout.

## Output

1. A score per product and day: the chance of selling at a given price.
2. A **pricing simulator:** pick a strategy (e.g. the Thrift+ reward schedule, or a flat markdown schedule), replay it over the floor, and read the expected sales, revenue and days to clear.
3. Feeds `buying_intelligence_v2` (how fast a truck's items would sell) and the Thrift+ reward schedule.

## Data needed first (why it waits)

- Clean, standardized products and vectors (the catalog standardize run and the backfill).
- A reliable price history per item (price changes and their dates). Data-quality register IDs to name when we build: the eras, `$0` means unknown, import-tagged `BACKFILL:` items.
- The inventory count (`inventory_count`) gives a true picture of what was on the shelf, which matters for the "days on the floor" rows.

## Record

**2026-09-30 — Drafted** from the owner's description.
