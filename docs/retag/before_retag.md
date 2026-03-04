# What To Do Before Retag Day

> **Goal:** On March 16 you will walk the entire store and scan every item, replacing all old DB2 tags with new DB3 tags. Before that day arrives, several things must be in place: the database must be clean, the staging data must be loaded, the app must be tested end-to-end, and the team must be briefed. This document is your prep checklist.

---

## Overview — The 3 Things That Must Be True on March 16

1. **DB3 is clean** — no leftover test items clogging up inventory counts
2. **The staging table is populated** — every active DB2 item is in `inventory_templegacyitem` so scanning a tag pulls up the correct title, brand, price
3. **The retag workflow is tested and working** — scan → item created → label prints, on every device you'll use

---

## Part 1 — Data Prep (Do this 3–5 days before)

### 1.1 Pull a fresh DB2 backup

You need a recent snapshot of production (DB2) to populate the staging table. The backup should be taken as close to retag day as possible — ideally the evening before or morning of.

Run from the project directory:

```bat
workspace\notes\backup_prod.bat
```

This creates a timestamped dump of the Heroku production database (`ecothrift_prod.dump` or similar). See `workspace/notes/backup_prod.bat` for exact paths.

**Then restore it locally as `db2`:**

```bat
workspace\notes\restore_dev.bat
```

This drops the local `db2` database and restores the fresh production snapshot into it. After this, your local `db2` postgres database is a mirror of what is currently in production.

> Repeat this step the morning of retag day (after the store closes the night before, or before it opens) to get the most current item list.

### 1.2 Import DB2 items into the staging table

Once `db2` is up to date locally, run the staging import. This populates `inventory_templegacyitem` in DB3 with every active item from DB2 — the lookup table the retag app queries when you scan a tag.

```bash
# Dry run first — verify the row count looks right (~20K items expected)
python manage.py import_db2_staging --dry-run

# Then run for real
python manage.py import_db2_staging
```

Verify in PGAdmin:

```sql
-- Should be ~20K rows matching DB2's active item count
SELECT COUNT(*) FROM inventory_templegacyitem WHERE source_db = 'db2';

-- Spot check — do titles and prices look right?
SELECT legacy_sku, title, brand, price, retail_amt
FROM inventory_templegacyitem
WHERE source_db = 'db2'
ORDER BY RANDOM()
LIMIT 20;
```

If the count looks low or wrong, check the DB2 connection settings in `docs/Database Audits/.config` and confirm `restore_dev.bat` ran successfully.

### 1.3 Re-run staging import the night before / morning of

Prices or inventory may have changed in the days between your test import and retag day. Run the import again with `--update-existing` to refresh any stale rows:

```bash
python manage.py import_db2_staging --update-existing
```

This will overwrite existing rows in the staging table with fresh data from DB2 without creating duplicates.

---

## Part 2 — Clear Test Data From DB3

DB3 currently has test items, test carts, test transactions etc. created during development. These must all be cleared before retag day so your inventory counts start from zero and only real retagged items exist.

### 2.1 Decide what to keep

Before deleting anything, review what's currently in DB3 that is real vs. test:

```sql
-- Inventory items summary
SELECT status, COUNT(*) FROM inventory_item GROUP BY status ORDER BY count DESC;

-- Any items that are NOT from test / not historical imports
SELECT COUNT(*) FROM inventory_item WHERE notes NOT LIKE '%HISTORICAL%';

-- Carts / transactions
SELECT COUNT(*) FROM pos_cart;
SELECT COUNT(*) FROM pos_receipt;
```

Anything created during dev that has no real business meaning should be deleted. Real data to preserve:
- User accounts (staff logins)
- Employee records
- Vendor / PO configuration (if any real POs were created)
- Categories (seeded, not test data)
- Consignee accounts (if any real ones exist)

### 2.2 Delete test inventory items

**WARNING: This is irreversible. Only do this after you've verified everything in Part 1 is working.**

```sql
-- Delete all non-historical items (test items created during dev)
-- Read these counts BEFORE running the DELETE to confirm they look right
SELECT COUNT(*) FROM inventory_item WHERE notes NOT LIKE '%HISTORICAL%' OR notes IS NULL;

-- Then delete:
DELETE FROM inventory_item WHERE notes NOT LIKE '%HISTORICAL%' OR notes IS NULL;
```

> If you also don't want the historical import data yet (you plan to run that after retag), clear all items:
>
> ```sql
> TRUNCATE TABLE inventory_item RESTART IDENTITY CASCADE;
> ```
>
> `CASCADE` will also wipe `inventory_itemscanhistory`, `inventory_itemhistory`, and any other tables with foreign keys to `inventory_item`. This is fine — these are all test records.

### 2.3 Clear test POS data

```sql
-- Clear all carts, receipts, cart lines
TRUNCATE TABLE pos_cartline RESTART IDENTITY CASCADE;
TRUNCATE TABLE pos_cart RESTART IDENTITY CASCADE;
TRUNCATE TABLE pos_receipt RESTART IDENTITY CASCADE;
```

> Do NOT clear drawer records or register configuration — those are real.

### 2.4 Clear the retag log (if you did any test scans)

If you ran test scans on the retag app during development:

```sql
TRUNCATE TABLE inventory_retaglog RESTART IDENTITY;
UPDATE inventory_templegacyitem SET retagged = FALSE, new_item_sku = '', retagged_at = NULL;
```

This resets the retag log and marks all staging items as untagged so the history panel starts fresh.

### 2.5 Verify the DB3 state is clean

Run these checks after clearing:

```sql
-- Should be 0 (or only real items if you kept some)
SELECT COUNT(*) FROM inventory_item WHERE status != 'sold';

-- Should be 0 test transactions
SELECT COUNT(*) FROM pos_cart;

-- Retag log should be empty
SELECT COUNT(*) FROM inventory_retaglog;

-- Staging table should be ~20K rows, all untagged
SELECT COUNT(*), SUM(CASE WHEN retagged THEN 1 ELSE 0 END) AS already_retagged
FROM inventory_templegacyitem;
```

---

## Part 3 — End-to-End Retag App Test

### 3.1 Test the full scan → create → print flow

Before retag day, do a complete test run:

1. Open the dashboard at `/inventory/retag`
2. Scan or type an actual DB2 SKU (you can look one up in PGAdmin: `SELECT legacy_sku FROM inventory_templegacyitem LIMIT 1;`)
3. Verify the item panel populates with correct title, brand, price, condition
4. Adjust the condition if needed
5. Click **Create** (or if auto-print is on, verify it fires automatically)
6. Verify a new DB3 SKU appears (e.g. `ITM00001`)
7. Verify the label prints on the label printer
8. Check in PGAdmin that the new item exists:
   ```sql
   SELECT sku, title, price, status FROM inventory_item ORDER BY id DESC LIMIT 5;
   ```
9. Check that a `RetagLog` row was created:
   ```sql
   SELECT * FROM inventory_retaglog ORDER BY retagged_at DESC LIMIT 5;
   ```

### 3.2 Test the already-retagged warning (non-blocking)

1. Scan the same SKU again
2. Verify you see a warning snackbar ("Already retagged → ITMxxxxx on [date]") but the form does NOT block
3. Verify a **second** new item is created with a different SKU
4. Verify the history table shows 2 entries for that legacy SKU

### 3.3 Test the history panel

1. Retag a few more items
2. Check the summary tiles update (Total Tagged, Sum Price, Sum Retail)
3. Test the search bar — search by title or SKU
4. Toggle "This session only" — count should match what you tagged since opening the page

### 3.4 Test on the actual hardware

If you have a dedicated tablet, scanner, or station for retag day:

- Open the retag app on that device and log in
- Confirm it can connect to the backend (no CORS errors, no login redirect)
- Scan a real barcode with the physical scanner
- Confirm the label printer is reachable from that device

---

## Part 4 — Price Strategy Decision

Before retag day, decide which price strategy the retag app should use as the default. The strategy toggle is per-session (top of the retag page), but you should agree on a default before you start.

### Option A: Keep current DB2 price (recommended for most items)

The item carries the same price it had in DB2. No repricing happens during retag. This is the fastest option and preserves your existing pricing.

**Use this if:** You trust your current prices and want to retag as fast as possible.

### Option B: % of current DB2 price

All items get a flat discount applied at retag time (e.g. 80% of current = automatic 20% off everything). Useful if you want to clear out old stock during or right after retag day.

**Use this if:** You're doing a clearance sale concurrent with retag.

### Option C: AI estimate (heuristic)

Uses the `retail_amt × condition_multiplier` formula to set a fresh price. Works best for items where the DB2 price is stale or unknown.

**Use this if:** You want to reprice everything from scratch. Slower and requires review.

### Option D: % of retail

Sets price as a percentage of the `retail_amt` field. Consistent margin-based pricing.

**Recommendation:** Default to **Option A (keep current)** for speed. Switch to Option C or D for specific categories where you know DB2 prices are wrong (e.g. items that have been on the shelf for 2+ years).

---

## Part 5 — Data Exploration (Optional but Useful)

You have 3 years of sales data in DB1 and DB2. Before retag day, it's worth doing a quick data review to understand your inventory and make better decisions about pricing strategy.

### 5.1 Price distribution of current inventory

Run in PGAdmin against `db2`:

```sql
-- Price buckets of active inventory
SELECT
  CASE
    WHEN i.starting_price < 5   THEN '$0-$4'
    WHEN i.starting_price < 10  THEN '$5-$9'
    WHEN i.starting_price < 25  THEN '$10-$24'
    WHEN i.starting_price < 50  THEN '$25-$49'
    WHEN i.starting_price < 100 THEN '$50-$99'
    ELSE '$100+'
  END AS price_bucket,
  COUNT(*) AS item_count,
  ROUND(AVG(i.starting_price)::numeric, 2) AS avg_price,
  ROUND(SUM(i.starting_price)::numeric, 2) AS total_value
FROM inventory_item i
WHERE i.sold_at IS NULL
GROUP BY 1
ORDER BY MIN(i.starting_price);
```

### 5.2 Items on shelf the longest (candidates for discounting)

```sql
-- Active items that have been sitting the longest
SELECT
  i.sku,
  p.title,
  p.brand,
  i.starting_price,
  i.on_shelf_at,
  CURRENT_DATE - i.on_shelf_at::date AS days_on_shelf
FROM inventory_item i
JOIN inventory_product p ON p.id = i.product_id
WHERE i.sold_at IS NULL
  AND i.on_shelf_at IS NOT NULL
ORDER BY days_on_shelf DESC
LIMIT 50;
```

This tells you which items have the stalest prices. These might be candidates for Option B or C pricing during retag.

### 5.3 What sold well (top categories by revenue — DB2)

```sql
SELECT
  p.brand,
  COUNT(*) AS items_sold,
  ROUND(AVG(i.sold_for)::numeric, 2) AS avg_sold_for,
  ROUND(SUM(i.sold_for)::numeric, 2) AS total_revenue
FROM inventory_item i
JOIN inventory_product p ON p.id = i.product_id
WHERE i.sold_at IS NOT NULL
  AND i.sold_for IS NOT NULL
GROUP BY p.brand
HAVING COUNT(*) > 10
ORDER BY total_revenue DESC
LIMIT 30;
```

### 5.4 Retail vs. actual price ratio (how well are you pricing?)

```sql
-- For items that sold, what % of retail did they sell for?
SELECT
  ROUND(AVG(i.sold_for / NULLIF(i.retail_amt, 0) * 100)::numeric, 1) AS avg_pct_of_retail,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY i.sold_for / NULLIF(i.retail_amt, 0)) AS median_ratio,
  MIN(i.sold_for / NULLIF(i.retail_amt, 0) * 100) AS min_pct,
  MAX(i.sold_for / NULLIF(i.retail_amt, 0) * 100) AS max_pct
FROM inventory_item i
WHERE i.sold_at IS NOT NULL
  AND i.sold_for > 0
  AND i.retail_amt > 0;
```

This gives you the empirical basis for the heuristic pricing multiplier. If your median ratio is 35%, you know "35% of retail" is a good default for the pricing model.

---

## Part 6 — Team Briefing

### What to tell staff before retag day

- Every item in the store gets a **new tag**. Old tags become invalid.
- The workflow is: **scan old barcode → review/adjust → label prints**. That's it.
- If an item has no barcode or the barcode doesn't scan, manually type the SKU
- If the item isn't found in the system (no staging record), it may be an old DB1 item — note the SKU and set it aside for manual entry
- Don't worry about "already retagged" warnings — they're informational only, and a new tag is still created each time
- The label printer must stay on and connected the entire day

### What you as manager should do during the day

- Watch the **Total Tagged** tile on the retag page — this is your progress counter
- Every 2 hours, run the missed-items query:
  ```sql
  SELECT COUNT(*) FROM inventory_templegacyitem WHERE retagged = FALSE;
  ```
  This tells you how many items are still untagged.
- If the printer jams or disconnects, fix it immediately — backed-up items that were created but not printed can be reprinted via the history table search

---

## Part 7 — Final Pre-Retag Checklist

Run through this the morning of March 16 before scanning begins:

```
[ ] 1. Fresh DB2 backup pulled and restored to local db2
[ ] 2. import_db2_staging --update-existing run successfully
[ ] 3. TempLegacyItem has ~20K rows, all retagged=False
[ ] 4. inventory_item cleared of test data (0 non-historical items with status != 'sold')
[ ] 5. inventory_retaglog is empty (0 rows)
[ ] 6. Retag app loads at /inventory/retag on every device being used
[ ] 7. Label printer is on, connected, and test print confirmed
[ ] 8. Auto-print toggle set to preferred mode (on or off)
[ ] 9. Price strategy toggle set to agreed default (recommended: Keep Current)
[ ] 10. All staff who will scan are logged in and can see the retag page
[ ] 11. Backup PGAdmin connection open on manager device to monitor progress
[ ] 12. Somebody knows how to clear a printer jam
```

---

## Quick Reference: Key Commands

```bash
# Pull latest production data locally
workspace\notes\backup_prod.bat
workspace\notes\restore_dev.bat

# Populate the staging table
python manage.py import_db2_staging --dry-run
python manage.py import_db2_staging

# Refresh staging data (run again the night before or morning of)
python manage.py import_db2_staging --update-existing
```

```sql
-- Reset retag state (if you need to restart)
TRUNCATE TABLE inventory_retaglog RESTART IDENTITY;
UPDATE inventory_templegacyitem SET retagged = FALSE, new_item_sku = '', retagged_at = NULL;

-- Check progress on retag day
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN retagged THEN 1 ELSE 0 END) AS done,
  COUNT(*) - SUM(CASE WHEN retagged THEN 1 ELSE 0 END) AS remaining
FROM inventory_templegacyitem WHERE source_db = 'db2';
```

---

*See also: `docs/retag/after_retag.md` for cleanup, data import, and model training steps after March 16.*
