# R-004 · recon · Sales data we can use

**Why:** Truck valuation, pricing to sell within 90 days, and buying pressure all need sales by category and vendor, with days to sell. We need to know what the data holds and how clean it is.

**Answer these:**

1. **Where a sale lives.** The models and fields from a sale to an item, then to its category, product, vendor (through its PO) and PO (`path:line`).
   - Which field is the sold price and which is the sold date?
   - Is there a sales channel (in store vs online)?
   - Is there a discount or cash-back field (Thrift+)?
2. **Days to sell.** Which item dates exist: created, received, priced, shelved, sold?
   - For items sold in the last 12 months, what % have each date?
   - Which start date gives the most reliable days to sell? Show the median days by each start date.
3. **Last 12 months, by canonical category** (top 25 by revenue): units sold, revenue, median sold price, median sold ÷ retail, median days to sell (best start date from Q2), and % of items sold within 90 days.
4. **Same, by vendor** (top 10).
5. **Monthly trend:** units sold and revenue per month for the last 18 months (all categories).
6. **Items not selling:** count and retail of items shelved over 90 days ago and still unsold, by category (top 15).
7. **Existing code:** list any sell-through, velocity or days-to-sell code already in the repo (`path:line` and a one-line summary each).

**Result:** `results/R-004-sales-data.md`, with the tables. Read-only; no outside calls. Put the scratch queries in `workspace/runner/R-004/`.
