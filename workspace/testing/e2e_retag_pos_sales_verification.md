## Phase 1 — Retag (10 items)

**Goal:** Complete the migration retag flow for **10** legacy SKUs so new `Item` rows exist in DB3.

1. Open **Retag (migration)** → `/inventory/retag`.
2. Use **10 distinct legacy SKUs** (staging must contain them after `import_db2_staging`). The canonical list and copy/pricing are in **`workspace/testing/data/`** — generated from the **first 10 rows** (file order) of `workspace/notebooks/pickles/retag_scan_simulation.csv` (`retag_e2e_10_items.csv` / `.json`). Regenerate with `python workspace/testing/data/generate_retag_e2e_sample.py` after re-exporting the big CSV.
3. Complete retag for each (create new DB3 item, your chosen price strategy).
4. Record identifiers so you can find them later (SKU, new item id if shown in UI or API).

**Sample legacy SKUs** (same source as above: `sku`, `starting_price` → price-on-tag, `retail_amt`, title/brand/model):

| # | Legacy SKU | Retail (export) | Starting price (tag sim) | Title (abridged) | Brand |
|---|------------|-----------------|---------------------------|-------------------|-------|
| 1 | ITMCD58LS5 | 29.99 | $15.00 | Simple Modern 40oz Trek Tumbler… | Simple Modern |
| 2 | ITMQKHMPZ6 | 61.19 | $30.60 | OutdoorMaster Cachalot 20PSI SUP Air Pump… | OutdoorMaster |
| 3 | ITMLTR36NY | 45.00 | $22.50 | Preserved Palm Wreath | Threshold |
| 4 | ITMHYX7WGR | 499.99 | $250.00 | GE Appliances Opal Nugget Ice Maker… | GE Appliances |
| 5 | ITMV56PX7B | 339.99 | $170.00 | Body Glove Performer Paddle Board | Body Glove |
| 6 | ITM83TE6JW | 99.99 | $50.00 | Rechargeable Wall Sconces - 2pk | Globe |
| 7 | ITM9JY9HJK | 29.99 | $15.00 | Kidoozie Bounce Around Dino… | Kidoozie |
| 8 | ITMPGNBKLF | 107.00 | $53.50 | VEVOR Stainless Steel Work Table | VEVOR |
| 9 | ITMNH5424T | 29.99 | $15.00 | up&up Forearm Lifting Moving Straps… | up&up |
| 10 | ITMKA4CZN3 | 20.00 | $10.00 | Casaluna 2-Wick Ceramic Jar Candle… | Casaluna |

**Simulated old tags (print before POS scan):** run `workspace/testing/print_e2e_retag_labels.bat` from Explorer, or from repo root after `cd printserver`:  
`python scripts/print_labels_from_json.py --file ../workspace/testing/data/retag_e2e_10_items.json --preset 1.5x1`  
Add `--dry-run` to write PNGs under `printserver/output/e2e_retag/` instead of the Windows printer.

| # | Legacy SKU scanned | New ITM SKU (or id) | Price set | Notes |
|---|--------------------|---------------------|-----------|--------|
| 1 | ITMCD58LS5 | | | |
| 2 | ITMQKHMPZ6 | | | |
| 3 | ITMLTR36NY | | | |
| 4 | ITMHYX7WGR | | | |
| 5 | ITMV56PX7B | | | |
| 6 | ITM83TE6JW | | | |
| 7 | ITM9JY9HJK | | | |
| 8 | ITMPGNBKLF | | | |
| 9 | ITMNH5424T | | | |
| 10 | ITMKA4CZN3 | | | |

**Phase 1 outcome (pass / fail / partial):**

```
What happened:


```

---

## Phase 2 — Print tags and scan in POS

**Goal:** Labels print as expected; POS finds the item and price matches.

1. Print price tags for the **10** retagged items (your normal workflow: print dialog, label printer, etc.).
2. Open **POS Terminal** → `/pos/terminal`.
3. Scan each item (or enter SKU) and confirm **description and price** match expectations before completing a sale (you may use **void** or complete tiny test sales—your choice; note below).

| # | SKU scanned (use new ITM from Phase 1) | POS shows title? | POS shows price? | Sale completed? (Y/N/void) |
|---|----------------------------------------|-------------------|------------------|----------------------------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |

**Print / scan issues:**

```
What happened:


```

---

## Phase 3 — Add new items and scan in POS

**Goal:** Fresh inventory from **Processing** (or your intake path) appears and rings correctly.

1. Open **Processing** → `/inventory/processing`.
2. Create **at least one new item** (or more if you want)—note SKU(s) and intended price.
3. Print tag(s) if applicable.
4. On `/pos/terminal`, scan each new SKU and verify **title + price** before checkout.

| New item SKU | Source (PO / batch / notes) | List price | POS scan OK? (Y/N) | Notes |
|---------------|-----------------------------|------------|--------------------|--------|
| | | | | |
| | | | | |

**Phase 3 outcome:**

```
What happened:


```

---

## Phase 4 — Update price and scan in POS

**Goal:** A price change in the dashboard is reflected when the item is scanned at POS.

1. Open **Quick reprice** → `/inventory/quick-reprice`.
2. Pick **one** item from Phase 1 or 3 (note SKU). Record **old price** and set a clearly different **new price** (e.g. +$1.00).
3. Reprint label if your process requires it.
4. Scan same SKU on `/pos/terminal` and confirm **new** price shows.

| Item SKU | Old price | New price | POS shows new price? (Y/N) |
|----------|-----------|-----------|----------------------------|
| | | | |

**Phase 4 outcome:**

```
What happened:


```

---

## Phase 5 — Verify sales via SQL

**Goal:** Completed POS activity matches what you expect in Postgres (line totals, item linkage, sold status).

Connect with `psql` or your SQL client to the **same database** the app uses.

Django default table names (adjust if you use custom `db_table`):

| Concept | Typical table |
|---------|-----------------|
| Cart (sale) | `pos_cart` |
| Line | `pos_cartline` |
| Item | `inventory_item` |
| Receipt | `pos_receipt` |

### 5a — Recent completed carts

Replace limits as needed.

```sql
SELECT c.id, c.status, c.total, c.completed_at, c.created_at
FROM pos_cart c
WHERE c.status = 'completed'
ORDER BY c.completed_at DESC NULLS LAST, c.id DESC
LIMIT 20;
```

**Paste key rows (or “none unexpected”):**

```
(results / notes)


```

### 5b — Lines for those carts (join items)

```sql
SELECT cl.id AS line_id, cl.cart_id, cl.description,
       cl.quantity, cl.unit_price, cl.line_total,
       i.sku, i.status AS item_status, i.price AS item_current_price
FROM pos_cartline cl
LEFT JOIN inventory_item i ON i.id = cl.item_id
WHERE cl.cart_id IN (
  SELECT id FROM pos_cart WHERE status = 'completed'
  ORDER BY completed_at DESC NULLS LAST LIMIT 10
)
ORDER BY cl.cart_id DESC, cl.id;
```

**Paste results or summarize:**

```
(results / notes)


```

### 5c — Items you touched (optional spot-check)

Use your SKUs from Phases 1–4:

```sql
SELECT id, sku, status, price, sold_at, sold_for
FROM inventory_item
WHERE sku IN (
  /* paste ITM... SKUs here */
  'ITM0000001'
)
ORDER BY sku;
```

**Paste results:**

```
(results / notes)


```

### 5d — Receipt numbers (optional)

```sql
SELECT r.receipt_number, r.cart_id, r.created_at
FROM pos_receipt r
ORDER BY r.id DESC
LIMIT 10;
```

**Paste results:**

```
(results / notes)


```

**SQL verification summary (pass / fail):**

```
Does DB match what you did at the register?


```

---

## Overall test summary

| Section | Pass / fail / skipped | Comment |
|---------|------------------------|---------|
| Prerequisites | | |
| Phase 1 Retag (10) | | |
| Phase 2 Print + POS | | |
| Phase 3 Add items | | |
| Phase 4 Quick reprice | | |
| Phase 5 SQL | | |

**Follow-ups / bugs to file:**

```
1.
2.
3.
```

---

## Appendix — Quick route reference

| Step | URL |
|------|-----|
| Retag | `/inventory/retag` |
| Processing | `/inventory/processing` |
| Quick reprice | `/inventory/quick-reprice` |
| POS terminal | `/pos/terminal` |
| Drawers | `/pos/drawers` |
| Transactions | `/pos/transactions` |

<!-- Last updated: 2026-03-26 -->
