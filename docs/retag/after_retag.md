# What To Do After Retag Day

> **Context:** On March 16 you will manually scan every item in the store using the Retag v2 app (Dashboard 3). This document tells you exactly what to do immediately after that day is done — cleanup, data import, model training, and what comes next in the pricing system.

---

## Part 1 — Retag Day Wrap-Up (same day or day after)

### 1.1 Verify the retag counts look right

Open the Retag page in the dashboard. The summary tiles at the top show:
- **Total Tagged** — should be close to your total on-shelf item count
- **Sum Retail** — sanity check vs. your known inventory value
- **Sum Price** — your total tagged inventory at DB3 prices

Run this in PGAdmin against `ecothrift_dev` (your DB3 local, or Heroku once deployed) to double-check:

```sql
-- Total retag events
SELECT COUNT(*) FROM inventory_retaglog;

-- Items tagged more than once (worth reviewing)
SELECT legacy_sku, COUNT(*) AS times_tagged
FROM inventory_retaglog
GROUP BY legacy_sku
HAVING COUNT(*) > 1
ORDER BY times_tagged DESC;

-- Items in TempLegacyItem that were NEVER scanned (missed items)
SELECT COUNT(*) FROM inventory_templegacyitem
WHERE retagged = FALSE AND source_db = 'db2';

-- List the missed items (print new tags or investigate)
SELECT legacy_sku, title, brand, price
FROM inventory_templegacyitem
WHERE retagged = FALSE AND source_db = 'db2'
ORDER BY title;
```

Handle any missed items by scanning them through the retag app, or manually creating DB3 records if needed.

### 1.2 Check for duplicate tags on the shelf

If an item was scanned twice, two DB3 items now exist. The second scan triggered a warning but still created a new item. Find duplicates:

```sql
SELECT legacy_sku, COUNT(*) AS tag_count, 
       STRING_AGG(new_item_sku, ', ' ORDER BY retagged_at) AS new_skus
FROM inventory_retaglog
GROUP BY legacy_sku
HAVING COUNT(*) > 1
ORDER BY tag_count DESC;
```

For each duplicate: one physical tag is on the item, one DB3 item has no physical tag. Set the untagged DB3 items to status `lost` or delete them so they don't show up in inventory counts:

```sql
-- Example: mark an orphaned DB3 item as lost
UPDATE inventory_item SET status = 'lost', notes = notes || ' | ORPHANED_DUPLICATE_FROM_RETAG'
WHERE sku = 'ITMXXXXXXX';
```

### 1.3 Test the POS with a few retagged items

Before the store opens for business on the first day after retag:

1. Pick 5–10 items with new tags from various categories
2. Open the POS terminal in Dashboard 3
3. Scan each new barcode — verify the item title, price, and condition appear correctly
4. Complete a test transaction (then void/reverse it) to confirm the full POS flow works
5. Check that `sold_for` is being set on the item after sale

---

## Part 2 — Drop Temporary Retag Scaffolding

The `RetagLog` and `TempLegacyItem` models are temporary scaffolding. Once retag day is confirmed successful, clean them up.

### 2.1 Export the retag log first (optional but recommended)

Before dropping the table, export a CSV for your records:

```sql
-- Run in PGAdmin → save as CSV
COPY (
  SELECT legacy_sku, new_item_sku, title, price, retail_amt, retagged_at
  FROM inventory_retaglog
  ORDER BY retagged_at
) TO '/tmp/retag_log_export.csv' WITH CSV HEADER;
```

Or use PGAdmin's export function: right-click the `inventory_retaglog` table → Backup / Export data.

### 2.2 Drop the temporary tables from the database

Run this directly in PGAdmin on your DB3 database (Heroku or local):

```sql
DROP TABLE inventory_retaglog;
DROP TABLE inventory_templegacyitem;
```

### 2.3 Remove the models and migrations from the codebase

In your project files:

1. **Delete the model classes** from `apps/inventory/models.py`:
   - Remove the `TempLegacyItem` class (lines ~636–668)
   - Remove the `RetagLog` class (lines ~671–697)

2. **Delete migration files** (or create a new migration that removes these models):
   - `apps/inventory/migrations/0009_add_temp_legacy_item_and_historical_transaction.py` — contains `TempLegacyItem`
   - `apps/inventory/migrations/0011_add_retaglog.py` — contains `RetagLog`
   
   The cleanest approach is to create a new removal migration rather than deleting existing ones, so the migration history stays intact:
   
   ```bash
   python manage.py makemigrations inventory --name remove_retag_scaffolding
   python manage.py migrate
   ```

3. **Remove the management commands** that are no longer needed:
   - `apps/inventory/management/commands/import_db2_staging.py`

4. **Remove the retag v2 endpoints** from `apps/inventory/views.py`:
   - `retag_v2_lookup_view`
   - `retag_v2_create_view`
   - `retag_v2_stats_view`
   - `retag_v2_history_view`

5. **Remove the routes** from `apps/inventory/urls.py`:
   - `retag/v2/lookup/`
   - `retag/v2/create/`
   - `retag/v2/stats/`
   - `retag/v2/history/`

6. **Remove the frontend API functions** from `frontend/src/api/inventory.api.ts`:
   - `retagV2Lookup`, `retagV2Create`, `retagV2Stats`, `retagV2History`
   - `RetagV2LookupResponse`, `RetagV2CreateRequest`, `RetagV2CreateResponse`, `RetagV2StatsResponse`
   - `RetagHistoryRow`, `RetagHistoryResponse`

7. **Remove the frontend page and sidebar link**:
   - Delete `frontend/src/pages/inventory/RetagPage.tsx`
   - Remove the `Retag (DB2→DB3)` link from `frontend/src/components/layout/Sidebar.tsx`
   - Remove the `/inventory/retag` route from `frontend/src/App.tsx`

---

## Part 3 — Import Historical Data for the Pricing Model

Now that retag day is done, your store is running entirely on Dashboard 3. It's time to bring in the historical sold data from DB1 and DB2 to train the pricing model.

### 3.1 Import historical sold items (for ML training)

This command loads ~145,000 sold items from DB1 and DB2 into your DB3 `inventory_item` table with `status='sold'`. These records feed `train_price_model.py`.

```bash
# Dry run first
python manage.py import_historical_sold --dry-run

# Then run for real (may take a few minutes)
python manage.py import_historical_sold
```

Verify afterwards:

```sql
SELECT status, COUNT(*) FROM inventory_item GROUP BY status ORDER BY count DESC;
-- You should see ~145K rows with status='sold' and notes like 'HISTORICAL:db1:...' or 'HISTORICAL:db2:...'
```

### 3.2 Import historical transactions (for revenue reporting)

This brings in ~68K transaction records from DB1 and DB2 into `pos_historicaltransaction` for the revenue chart that spans all 3 generations of the dashboard.

```bash
python manage.py import_historical_transactions --dry-run
python manage.py import_historical_transactions
```

Check the result in PGAdmin:

```sql
SELECT source_db, COUNT(*), MIN(sale_date), MAX(sale_date), SUM(total)
FROM pos_historicaltransaction
GROUP BY source_db;
-- DB1: ~53K records, DB2: ~15K records
```

---

## Part 4 — Train the Pricing Model

With 3 years of sold data now in DB3, train the price estimator.

### 4.1 Install ML dependencies (if not already done)

```bash
pip install -r requirements-ml.txt
```

The `requirements-ml.txt` file includes: `scikit-learn`, `lightgbm`, `xgboost`, `joblib`, `pandas`.

### 4.2 Run the training command

```bash
python manage.py train_price_model
```

This will:
- Query all `Item` records with `status='sold'` and `sold_for > 0`
- Engineer features (category, brand, condition, source, retail_value, days_to_sell)
- Train a gradient-boosted model
- Save the model to `workspace/models/price_model.joblib`
- Print accuracy metrics (MAE, RMSE, R²)

**Evaluate the output.** The training command prints a report. Acceptable thresholds:
- MAE (mean absolute error) < $5 for items under $50, < 15% for items over $50
- R² > 0.65 (model explains 65%+ of price variance)

If accuracy is below threshold, the heuristic fallback (`retail × condition_multiplier`) continues to be used automatically — the model is opt-in.

### 4.3 Test the estimator via the API

```bash
curl -X POST http://localhost:8000/api/inventory/estimate-price/ \
  -H "Content-Type: application/json" \
  -d '{"title": "KitchenAid Stand Mixer", "brand": "KitchenAid", "condition": "good"}'
```

You should get back `estimated_price`, `price_low`, `price_high`, `price_confidence`, and `comparables` (similar items from your sales history).

---

## Part 5 — Next Steps in the Pricing System

After retag day the priority order is:

### 5.1 Immediate (within 1 week)

| Task | Why now |
|---|---|
| Verify DB3 is running cleanly as production | You just replaced DB2 — confirm all store operations work |
| Review the historical transaction chart in the dashboard | Confirm DB1 + DB2 revenue history displays correctly |
| Run `import_historical_sold` and `train_price_model` | Get AI estimates working ASAP for consignment intake |

### 5.2 Phase 2 — Pricing model in daily use (1–3 weeks)

- Enable AI price estimates on the **Consignment intake** form — when a customer brings in items, staff sees an estimated price immediately
- Enable AI price estimates on the **manifest finalize panel** — when you're pricing a BStock lot, each row gets an AI-suggested price
- Review and tune: run `train_price_model` monthly, or any time accuracy feels off

### 5.3 Phase 3 — Operational tools (2–6 weeks)

- **Enhanced Customer Scan**: update the public item lookup page to show condition, source, estimated retail value, and savings percentage
- **Quick Reprice page** (already built at `/inventory/quick-reprice`): enable it for staff to do clearance discount runs
- **Inventory Audit tools**: shrinkage scan, shelf check, manager store report

### 5.4 Phase 1 — Category Classifier (run whenever convenient)

The category backfill command categorizes every item in the database automatically:

```bash
python manage.py backfill_categories
```

This improves pricing model accuracy and makes reports more useful. Run it once after retag cleanup is done.

---

## Part 6 — Heroku Deployment Checklist

If you haven't pushed Dashboard 3 to Heroku production yet (or just pushed during retag day), verify these after the push:

```bash
# Apply all pending migrations on Heroku
heroku run python manage.py migrate

# Run the DB2 staging import on the Heroku DB if retag is happening on production
heroku run python manage.py import_db2_staging

# Check that the app is healthy
heroku logs --tail
```

**Environment variables to confirm are set on Heroku:**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Main DB3 Heroku Postgres connection |
| `SECRET_KEY` | Django secret key |
| `ALLOWED_HOSTS` | Your Heroku app domain |
| `DEBUG` | Must be `False` in production |

**Do NOT set** `DB1_*` or `DB2_*` connection variables on Heroku — those databases are local only and not needed in production.

---

## Quick Reference: Commands Summary

```bash
# After retag day — data import
python manage.py import_historical_sold
python manage.py import_historical_transactions

# Train the pricing model
python manage.py train_price_model

# Category backfill (improves model accuracy)
python manage.py backfill_categories

# Remove retag scaffolding (after verified cleanup)
python manage.py makemigrations inventory --name remove_retag_scaffolding
python manage.py migrate
```

```sql
-- Cleanup queries (run in PGAdmin on DB3)
DROP TABLE inventory_retaglog;
DROP TABLE inventory_templegacyitem;
```

---

*Last updated: March 2026.*
