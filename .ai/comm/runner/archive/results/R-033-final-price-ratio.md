# R-033 result · How much the price rises before close

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 17:56 · **Finished:** 2026-09-23 18:00

## Where the history is

`AuctionSnapshot` (`apps/buying/models.py:582`) stores `price`, `bid_count`, and `captured_at`. A row is written when a **watched** auction is polled (`apps/buying/services/pipeline.py:456`). The poll skips auctions that are not on the watchlist, and skips closed or cancelled ones (`:470`). Default gap is 300 seconds (`WatchlistEntry.poll_interval_seconds`, `models.py:847`). Nothing else stores a price over time. `Auction.current_price` is only the latest value.

## Coverage

177 snapshots, 174 with a price, on 64 auctions. Median 3 snapshots per auction, max 4. 427 auctions are closed with an `end_time`. **54** of those have a price snapshot within 1 hour of `end_time`. That 54 is the final-price set. Of 17,188 auctions, almost none were watched long enough to see the price move.

A point at T hours before the end counts only if some snapshot falls within ±25% of that gap. With at most 4 points, all near the end, nothing lands at 48, 24, 12, or 6 hours.

## Final ÷ price at T

| Hours before end | n | 25th | Median | 75th |
|---:|---:|---:|---:|---:|
| 48 | 0 | | | |
| 24 | 0 | | | |
| 12 | 0 | | | |
| 6 | 0 | | | |
| 1 | 19 | 1.00 | 1.17 | 1.28 |

By marketplace, 1 hour only (the other hours are 0 everywhere, including Costco and Wayfair):

| Marketplace | n | Median |
|---|---:|---:|
| Amazon | 7 | 1.18 |
| Target | 11 | 1.06 |
| Home Depot | 1 | 3.26 |
| Walmart | 0 | |
| Costco | 0 | |
| Wayfair | 0 | |

## Final price ÷ retail

On the same 54, where `total_retail_value` is set.

| Marketplace | n | Median |
|---|---:|---:|
| Amazon | 14 | 0.053 |
| Home Depot | 1 | 0.084 |
| Target | 30 | 0.111 |
| Walmart | 8 | 0.133 |

| Condition group | n | Median |
|---|---:|---:|
| New | 8 | 0.114 |
| Like new | 2 | 0.118 |
| Used good | 34 | 0.074 |
| Used fair | 9 | 0.128 |
| Damaged | 0 | |
| Unspecified | 0 | |

## Is current × median ratio usable?

No. The only ratio we can see is about 1.17 at one hour before close, on 19 auctions. There is no observation at 6 hours or earlier, so an early price cannot be turned into an expected close. To get those points, a watched auction needs a snapshot inside each window (for 48 hours before, something within 12 hours of that mark; for 6 hours, within 1.5 hours), which means polling across the last two days, not only the last few minutes.
