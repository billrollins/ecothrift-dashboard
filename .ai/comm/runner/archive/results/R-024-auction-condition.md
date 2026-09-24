# R-024 result · Auction condition (AUC-05)

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 17:12 · **Finished:** 2026-09-23 17:16

## Where condition comes in

The listing condition is `Auction.condition_summary` (`apps/buying/models.py:302`). The sweep copies it from the search payload: `condition`, else `conditionSummary`, else `conditionName` (`apps/buying/services/listing_mapping.py:211`). The raw listing JSON is not stored on the auction. `buying_manifestrow.condition` (`apps/buying/models.py:646`) is a different field: the line grade from the manifest file (`apps/buying/services/normalize.py:450`), not the listing condition.

## Values

17,188 auctions. 17,181 have a condition string. The same phrase is stored two ways, `Used Good` and `['Used Good']`. Counts below have those merged. Marketplaces are where that phrase actually appears.

| Condition | Count | Marketplaces |
|---|---:|---|
| Used Good | 7,784 | Target 5,974, Amazon 1,612, Walmart 101, Home Depot 84, Wayfair 13 |
| Used Fair | 4,904 | Walmart 3,830, Home Depot 765, Wayfair 309 |
| Like New | 1,666 | Amazon 698, Walmart 543, Target 396, Wayfair 29 |
| New | 1,291 | Target 1,291 |
| Salvage | 928 | Home Depot 913, Walmart 8, Wayfair 6, Target 1 |
| Brand New | 467 | Target 466, Walmart 1 |
| Scratch & Dent | 114 | Home Depot 114 |
| Mixed | 15 | Home Depot 12, Amazon 2, Wayfair 1 |
| Unspecified | 11 | Walmart 11 |
| Salvage, Used Fair | 1 | Home Depot 1 |
| (blank) | 7 | Wayfair 5, Home Depot 1, Walmart 1 |

Title words, all auctions: like new 554, the word new 585, salvage 9, damaged 8. Customer returns, uninspected, shelf pulls, overstock, untested, refurbished, and mixed condition: 0 titles.

## Coverage, last 90 days

`COALESCE(end_time, created_at)` within 90 days: 10,753 auctions. 10,747 have `condition_summary` (99.9%). The title words do not add any auction that the field missed.

## Suggested groups

| Group | Phrases | Count |
|---|---|---:|
| New | New, Brand New | 1,758 |
| Like new | Like New | 1,666 |
| Used good | Used Good | 7,784 |
| Used fair | Used Fair | 4,904 |
| Damaged | Salvage, Scratch & Dent, the one Salvage + Used Fair row | 1,043 |
| Unspecified | Mixed, Unspecified, blank | 33 |

## Outcomes

UNKNOWN. There is no won-auction to purchase-order link to hang recovery on.

Checked: `buying_outcome` 0, `buying_bid` 0, watchlist `status = won` 0. `Auction` has no purchase-order field. `PurchaseOrder` has no auction or lot id field. A title match between auctions and POs exists as a fill for other work, but nothing marks which of those auctions were won, so condition cannot be joined to sold dollars, sell-through, or shrink.
