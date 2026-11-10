# Buying: end goal (final draft, 2026-11-06; 3 rounds with the Buying session)

**Status:** draft for Bill. Locked once he says yes. After that it changes only when Bill says "change the goal", logged in the Q&A log. Sessions never change it.

**The workspace's job:** win the right B-Stock lots at the right price (about 20% of retail landed is normal), faster than B-Stock's own pages and with a number we trust, then get each truck from ordered to received. We keep B-Stock's browsing; we beat it on speed and on knowing what a lot is worth to us.

**Words used here:** *Max bid* = the most to pay so the lot lands at 20% of its retail. *How sure* = how far off this kind of estimate has been on our own trucks (the blind median miss, in points of retail). How sure and the 23% max are shown on Auction detail and Estimate a lot; the Auctions list marks whole-truck guesses with ≈.

## The finished menu

| # | Page | Its one job | It will NOT | Done when |
|---|------|-------------|-------------|-----------|
| 1 | **Auctions** | Every live lot: true current price and Buy Now, max bid at 20%, profit at max bid, Get manifest; seller chips; sort by Ending soon, Best return or Most profit; a **Watching** filter with its alerts. | Copy B-Stock's whole browse; show "overstocked"; filter by need (Next version). | Bill says yes after 2 weeks of use, and at least one lot won was found here. |
| 2 | **Auction detail** | One lot: its manifest (or Get manifest), the estimate by seller category, max bid at 20% and 23%, how sure, Watch it. | Bid for him. | Same numbers as Estimate a lot, and Bill opens it instead of the old detail. |
| 3 | **Estimate a lot** | A lot not in our list yet, or a manifest CSV: the same estimate as the detail page. | Duplicate the detail page for listed lots. | Same numbers as Auction detail for a listed lot. |
| 4 | **Orders** | Every truck from paid to received (as today). | — | Kept as is. |
| 5 | **Vendors** | Intake vendor records (as today). | Hold track records or buying rules. | Kept as is. |
| 6 | **Preprocessing** | Get a manifest ready for intake (as today). | — | Kept as is. |

**Watching** (on Auctions, not its own page): the short curated list with the live price, a snipe reminder before close, and a Buy Now lot that fits found first. *Fits* = lands at 23% of retail or less and has $3,000+ retail (design A10). Done when the alert log shows every watched lot alerted 2+ minutes before close for 2 weeks, none missed. Today's Watchlist folds in here.

**How good is it?** is a section on Estimate a lot and Auction detail, for everyone (no hiding from staff): misses by seller and category, the forward scores (Report cards fold in here) and the monthly miss review's advice. The estimate is Finished for Target when its blind median miss is **4 points or less** (7.3 on 11-05). Every other seller shows "not yet" until it passes its own blind test the same way.

## Tiers today

| Tier | Pages |
|------|-------|
| **Finished** (Bill signed off) | Orders, Vendors, Preprocessing: "Kept as is, Bill yes on [date]" (waiting for his yes; until then they stay where they are) |
| **In progress** | Auctions (rebuilt, v2.268.0), Estimate a lot (v2.261-v2.266) |
| **_Legacy_** | Today's best, Auctions (old), Watchlist (folds into Watching), Report cards (fold into How good is it?) |

## Order of work (Bill 11-06)

1. Auctions list: done in v2.268.0.
2. Auction detail, with a per-lot "how sure" (the list shows it only as "≈" on whole-truck guesses today).
3. Good estimates: manifests on watched lots plus the top 20 by Best return, so a seller's lots stop all showing the same rate (with your B-Stock login live; about 60 calls, inside the 200-an-hour cap); push Target's miss to 4 points.
4. Scraping: live watch and Buy Now alerts, and fetching a brand-new lot. **Waits on Bill:** the alert channel (text is not live yet; email lags), and the always-on checker a 2-minute snipe needs.
5. Fold Watchlist (into Watching) and Report cards (into How good is it?) in.
6. Retire Legacy.

## How a page gets built (all pages)

1. A one-page spec from this goal: its job, what is on it, what it will not do, its done-when. Bill says yes.
2. Build to the spec. The critic grades against the spec and this goal, at most 3 rounds.
3. New ideas during the build go on **Next version** below, not into the build.
4. Bill uses it and signs off: it moves to Finished.

## Next version (parked until the pages above are Finished)

- Filter by true need: only once weeks of stock is well estimated (today it is not).
- AI second opinion on an estimate: 10-20 read-only tools, a short qualitative check; never replaces the number (Bill 11-05).
- More estimators side by side (our category, the data-science database).
- A vendor track-record view (90-day recovery and shrink by seller).
