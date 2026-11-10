<!-- Last updated: 2026-11-09 -->
# Auction detail: spec (buying rebuild step 2, draft for Bill)

From the Buying end goal, page 2. **Its one job:** one lot: its manifest (or Get manifest), what it brings in, your max bid at 20% and 23% landed, how sure, and what is wrong with the manifest. **It will NOT** bid for you. **Done when** its numbers match Estimate a lot for the same lot, and you open it instead of the old detail page.

What Friday's lot reviews showed you check by hand, the page does for you.

## On the page, top to bottom

1. **The lot line.** Seller, short title, pallets, units, city, condition (Like New / Used Fair / Customer Returns), ends in, price now and bids (or Buy Now), the B-Stock link. Watch it (star).
2. **Your max (the headline).** Max bid at **20%** and **23%** landed = (retail x pct - freight) / 1.05. Under it: what it lands at the price now, as % of retail. Freight = B-Stock's quote when we have it, else our formula with its +/- band; "Get B-Stock quote" button (works while your login is live).
3. **Brings in and profit.** Low / likely / high, profit at your max, how sure ("blind test on N trucks: usually off X points"). By seller category when the manifest is stored, else whole truck (said so). Sellers our sales undercount (Wayfair: unmatched register sales, disputes) show our number as a **floor** with a note.
4. **Manifest check: what is wrong with it.** One line each, only when it applies:
   - **Too much for one truck:** total weight from the manifest vs about 44,000 lb (Wayfair 11-06: 58,463 lb).
   - **Parts, not whole items:** "BOX 2" lines without their box 1 (Wayfair: 69 bed box 2s, 6 box 1s).
   - **Sold as incomplete:** "sets may be missing pieces" lines, share of retail (Wayfair: 33%).
   - **Made-up retail:** many units at one flat price ($150 for a gazebo and a bed box alike), share of retail.
   - **One item in depth:** a single product over 5% of retail or 100+ units (Walmart: 700 pairs of No Boundaries jeans, 21%).
   - **Prepacks:** "22 PC" style lines, with the per-piece price.
   - **Cheap filler:** share of units under $5.
5. **What is in it.** Seller categories by retail (top 10), and beside each **what we already have on the shelf** in our matching category (units and tag value; facts, no verdict). The top 15 lines by retail. Expiration-date column summarized when present (candy).
6. **Manifest:** the stored rows (search, sort), Get manifest when none, or drop the CSV (same as today). Lines flagged in step 4 are marked.
7. **How good is it?** (folded): the same section as Estimate a lot.

## Not on it

Need score, Priority, price target, AI category guesses, decision panel, thumbs (they stay on the old detail until Legacy retires). Bidding.

## How it is built

The detail and Estimate a lot call one estimate function, so they cannot disagree. The manifest check is table math over the stored rows (no AI). Old detail stays at `/buying/auctions-old/:id` until you retire it. At most 3 critic rounds, then you use it on real lots.
