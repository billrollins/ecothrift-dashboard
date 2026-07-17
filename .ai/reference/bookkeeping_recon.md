<!-- Generated: 2026-07-16 — read-only recon against local ecothrift_v3. Do not treat as a product roadmap. -->
# Bookkeeping recon — Dash inventory & COGS

**DB queried:** `ecothrift_v3` (local prod restore; Django `search_path=ecothrift`).  
**Scope:** Read-only. Every number below was produced by SQL run in this session (see **Queries used**).  
**Audience:** Design of a separate bookkeeping app that cannot see inventory itself.

---

## Headlines

1. **COGS is not snapshotted on the sale.** `pos_cartline` has no cost column. Completing a cart writes `Item.status='sold'`, `sold_at`, `sold_for` — then any later `recompute_all_item_costs` or PO/`Item.retail` change silently rewrites historical COGS if you join live `Item.cost`.
2. **The March 30–April 2 2026 retag broke acquisition cost on floor stock.** Retag created **new** Items (`RETAGGED_FROM_DB2:{old_sku}`) with **no `purchase_order_id` and `cost = NULL`**. ~5,839 on-shelf retag units today have $0 allocated cost; April 2026 POS COGS collapses to **~$37** on **~$18.4k** item sales unless you impute from the predecessor SKU.
3. **`sum(Item.cost)` for a PO does not equal what you paid.** By design, cost is allocated over **recoverable** listing retail (`PO.retail_value × (1 − est_shrink)`), so the sum of line costs is typically **~`total_cost / (1 − est_shrink)`** when line retails match the listing — not `PO.total_cost`.
4. **You cannot get trustworthy month-end inventory at cost for past dates.** Only ~18k of ~212k items have `status_change` history; the rest have no as-of reconstruction. Current owned active inventory cost on the **new** SKU is **~$49.5k**, but that **excludes** retag floor stock (another ~$38k if you map old SKU costs).
5. **Purchases are the strongest of the three numbers** — use `PurchaseOrder.total_cost` (= purchase + shipping + fees) by **`ordered_date`** (or `paid_date` when present). `paid_date` is missing on many 2025 POs, so bank matching needs your feed, not Dash alone.

---

## Can Dash answer the 3 questions?

| Question | Answer | Trust |
|----------|--------|-------|
| **A. Inventory at cost as of a date** | **Partial / mostly no for history.** Current snapshot only, and incomplete (retag null costs). | Low for past; medium for “today” after a retag-cost repair |
| **B. COGS for a date range** | **Partial.** Queryable via sold items / cart lines → `Item.cost`, but **live** cost, retag gap, backfill quality variance. | Medium pre-retag if you accept live cost; **low** Apr 2026+ without imputation |
| **C. Purchases at cost for a date range** | **Yes** (PO `total_cost` by date). | High for amounts; medium for which date matches the bank |

---

## The cost model

### Formula as implemented

File: `apps/inventory/models.py` — `PurchaseOrder.compute_item_cost`

```text
Item.cost = (Item.retail / (PO.retail_value × (1 − est_shrink))) × PO.total_cost
```

Rounded to cents (`ROUND_HALF_UP`). Returns `NULL` if item retail, PO retail, or PO total_cost is missing/non-positive, or if `est_shrink` ∉ [0, 1).

`PO.total_cost` is auto-summed on save from `purchase_cost + shipping_cost + fees` when any component is set (`PurchaseOrder.save`).

`recompute_item_costs()` rewrites **every** `Item` on that PO (including already-sold rows) from current `Item.retail`.  
`recompute_all_item_costs` management command loops all POs with items and calls that — **on-demand only**, not a daily job. **Last run time: unknown** (no audit table).

### What is `est_shrink`?

- Fraction **0–1** (not a percent UI value — store `0.15` for 15%).
- Per-PO field; changing it recomputes that PO’s item costs.
- New POs: `AppSetting` key `po_default_est_shrink` via `get_default_po_est_shrink()` (`apps/inventory/services/po_defaults.py`). Model field default is still `0.15` if you create rows without the helper.
- **Live DB (2026-07-16):**

| Metric | Value |
|--------|------:|
| PO count | 331 |
| null `est_shrink` | 0 |
| min / max | 0.10 / 0.15 |
| median | 0.15 |
| at 0.15 | 315 |
| at 0.10 | 16 |
| AppSetting `po_default_est_shrink` | **0.1** (newer default; most historical POs still 0.15) |

### When is `Item.cost` written?

| Event | Behavior |
|-------|----------|
| Intake / check-in | Set at create via `order.compute_item_cost(item_retail)` (`processing_ops.py`) |
| PO save changing `est_shrink`, `retail_value`, or `total_cost` | Full PO recompute |
| `Item.retail` or `Item.purchase_order` change | Full recompute on affected PO(s) |
| `Item.price` change (markdown / quick-reprice) | **Does not** change cost |
| `recompute_all_item_costs` | Manual backfill of all POs |

### Worked example (real PO)

**PO `C5TC0-OD7-3Q1L`** (id 359), ordered 2026-06-26:

| Field | Value |
|-------|------:|
| `purchase_cost` | 931.00 |
| `shipping_cost` | 489.79 |
| `fees` | 27.93 |
| `total_cost` (what allocation uses) | **1,448.72** |
| `retail_value` (B-Stock listing total) | 5,746.00 |
| `est_shrink` | 0.10 |
| Recoverable denom `retail × (1−shrink)` | 5,171.40 |
| Cost per $1 of item retail | 0.280141 |
| Items on PO | 26 |
| `sum(Item.retail)` | 5,855.74 |
| `sum(Item.cost)` | **1,640.47** |
| `sum(Item.price)` (your tags) | 3,228.56 |

Sample line **ITM0187403**: retail 699.99 → cost = (699.99 / 5171.40) × 1448.72 = **196.10** (matches DB; formula verified).

**Paid vs sum of costs:** 1640.47 − 1448.72 = **+191.75**. Expected inflation if line retails ≈ listing: `1448.72 / 0.9 ≈ 1609.69`. Residual vs that ≈ +30 from line retails slightly above listing.

### Across POs: does `sum(Item.cost)` = what you paid?

**No.** Among 284 POs with items and `total_cost > 0`:

| Check | Result |
|-------|--------|
| Avg `sum(cost) / total_cost` | **1.069** |
| POs where sum ≈ paid (±$1) | **0** |
| Avg `sum(item.retail) / PO.retail_value` | 0.91 |

So you should **not** use `sum(Item.cost)` as “inventory purchases.” Use **`PO.total_cost`**.

Outlier **WLMRT-OJU-3V74**: listing retail 57,374 but 9,765 items with `sum(retail)` 105,860 → sum cost ~2× paid. Suggests over-intake / duplicate units vs listing, not a formula bug.

### What did you pay? (`PurchaseOrder`)

| Field | Role |
|-------|------|
| `purchase_cost` | Hammer / merchandise |
| `shipping_cost` | Freight |
| `fees` | Buyer premium / fees |
| **`total_cost`** | Sum of the three — **this is in the allocation** |

Tax is not a separate field. There is no “paid to bank” amount distinct from these.

---

## 1b. `retail` vs store tag price

| Concept | Field | What it is |
|---------|-------|------------|
| Vendor / manifest retail (per unit) | **`Item.retail`** (API often aliases as `retail_value`) | From manifest / `ProcessingRow.unit_retail` at check-in. **Not** your shelf tag. |
| Your tagged / listed store price | **`Item.price`** | What POS charges; markdowns change this. |
| PO listing total (B-Stock) | **`PurchaseOrder.retail_value`** | Denominator for cost allocation. Docs warn: do not replace with sum of line retails. |

**Cost allocation uses `Item.retail` (manifest), not `Item.price`.**

**Honest read on proportionality:** Within a PO, `corr(retail, price)` median ≈ **0.99** (300 POs with ≥20 items). Globally, median tag/retail ≈ **0.50**. Manifest retail is inflated in absolute terms but **rank-order within a truck is consistent enough** that allocation is usually fine *for relative shares*. Absolute MSRP fantasy does not break the math if proportions hold; it does not make COGS “true economic cost” either — that still depends on `est_shrink` and listing totals being sane.

---

## 1c. Retag (Mar 30–31 2026) and markdowns

### What retag did

- Created **new** DB3 Items with notes `RETAGGED_FROM_DB2:{old_sku}`.
- Scaffolding (`TempLegacyItem`, `RetagLog`, retag APIs) was **removed** after cutover (see `.ai/extended/retag-operations.md`, migration cleanup).
- **Counts (create window 2026-03-30 → 2026-04-02):** 8,187 items; **all 8,187 have `cost IS NULL` and no PO**; they do have `price` and `retail`.
- Old SKUs were largely moved to **`scrapped`** (still carry their old `cost`).

### Did retag overwrite `retail` / price / cost on existing items?

- **Not via in-place update of the live floor SKU.** It issued **new SKUs**.
- Only **5** `price_change` history events in the retag window (quick-reprice 50% off) — not a mass rewrite of `retail`.
- **Cost was not copied** onto the new items. Predecessor costs still sit on scrapped/sold old SKUs.

### Markdown / quick-reprice

`quick_reprice_view` (`apps/inventory/views.py`) changes **`Item.price` only**, logs `price_change`, does **not** touch `retail` or `cost`. Historical COGS is **not** destabilized by markdowns. It **is** destabilized by retail edits, PO field edits, and `recompute_all_item_costs`.

### Recoverability (important for the other app)

| Population | n | Imputed cost from old SKU |
|------------|--:|--------------------------:|
| On-shelf retag | 5,839 | **$38,057** (4,791 with old cost) |
| Sold retag Apr 2026 | 1,406 | **$7,903** (1,147 with old cost) |
| Sold retag May 2026 | 1,158 | **$5,897** |
| Sold retag Jun 2026 | 679 | **$3,309** |

Without that join, post-retag COGS in Dash is nearly useless.

---

## Trust assessment (ranked)

| Rank | Area | Strength |
|-----:|------|----------|
| 1 | **PO `total_cost` components** | Strong — what you paid to acquire a truck |
| 2 | **POS sales dollars** (`CartLine.line_total` / `sold_for`) | Strong for completed carts from 2024-03 onward |
| 3 | **Allocated `Item.cost` on native post-intake units** | Medium — coherent formula; depends on listing retail + shrink assumption |
| 4 | **Backfill-era costs** | Medium-low — originally `purchase_cost/item_count`; later may have been recomputed with shrink formula; ~10.6k sold backfill rows still null cost |
| 5 | **Post-retag COGS / floor cost on new SKUs** | **Weak** until imputed or repaired |
| 6 | **Historical month-end inventory** | **Weak / unavailable** |
| 7 | **Actual shrink measurement** | **Weak** — `est_shrink` is a purchase assumption; floor vanishing is mostly invisible |

---

## The numbers

### How to read this table

- **Sales** = sum of `pos_cartline.line_total` for completed carts with an `item_id` (America/Chicago month). Excludes tax. Manual/discount/delivery lines excluded by `item_id IS NOT NULL`.
- **COGS (live)** = sum of **current** `Item.cost` on those sale lines (purchased source). **Not a historical snapshot.**
- **COGS (retag-imputed)** = for Apr–Jul 2026 only: live cost where present, else predecessor SKU cost via `RETAGGED_FROM_DB2:`.
- **Purchases** = sum `PO.total_cost` by **`ordered_date`** (cancelled excluded). Prefer this over `paid_date` (many 2025 `paid_date` nulls).
- **Inventory month-end** = **not available historically.** Row shows **current** owned active cost only on the last row note.

Completed carts with item lines: **2024-03-18 → 2026-07-04** (57,282 carts). Earliest cart row 2023-02 is empty of item lines.

| Month | Sales (item lines) | COGS (live Item.cost) | COGS retag-imputed | Purchases (ordered) | Notes |
|-------|-------------------:|----------------------:|-------------------:|--------------------:|-------|
| 2024-03 | 12,043 | 3,991 | — | 61,253 | Backfill era; 211/508 lines missing cost |
| 2024-04 | 48,879 | 17,072 | — | 63,669 | |
| 2024-05 | 73,552 | 37,113 | — | 82,586 | |
| 2024-06 | 127,067 | 69,641 | — | 120,332 | |
| 2024-07 | 131,266 | 69,749 | — | 105,466 | |
| 2024-08 | 114,055 | 57,041 | — | 40,912 | |
| 2024-09 | 78,841 | 36,501 | — | 32,812 | |
| 2024-10 | 72,139 | 34,129 | — | 37,505 | |
| 2024-11 | 108,838 | 50,540 | — | 79,024 | |
| 2024-12 | 104,567 | 53,185 | — | 69,137 | |
| 2025-01 | 76,175 | 35,257 | — | 43,207 | |
| 2025-02 | 86,832 | 39,636 | — | 71,835 | |
| 2025-03 | 122,950 | 51,928 | — | 85,435 | |
| 2025-04 | 123,700 | 50,929 | — | 128,009 | |
| 2025-05 | 128,878 | 67,632 | — | 154,720 | |
| 2025-06 | 93,316 | 97,045 | — | 38,600 | Live COGS > sales — bad/overstated costs or mix |
| 2025-07 | 62,548 | 51,077 | — | 0 | PO dates gap |
| 2025-08 | 26,298 | 4,706 | — | 83,169 | Thin sales; costs sparse |
| 2025-09 | 74,542 | 20,693 | — | 100,301 | |
| 2025-10 | 146,403 | 90,121 | — | 115,638 | |
| 2025-11 | 134,001 | 56,174 | — | 64,234 | Your Excel cutoff era |
| 2025-12 | 67,899 | 39,593 | — | 0 | |
| 2026-01 | 38,081 | 13,672 | — | 0 | |
| 2026-02 | 51,057 | 20,290 | — | 0 | |
| 2026-03 | 29,692 | 12,517 | — | 0 | Retag starts 3/30 |
| 2026-04 | 18,439 | **37** | **~7,940** | 22,616 | Retag cliff |
| 2026-05 | 42,258 | 9,518 | **~15,415** | 25,505 | |
| 2026-06 | 36,648 | 11,557 | **~14,866** | 20,232 | |
| 2026-07 (partial) | 6,729 | 2,242 | **~2,639** | 1,786 | Through ~2026-07-04 sales |

Implied GM% on live COGS swings wildly (e.g. Apr 2026 **99.8%**, Jun 2025 **−4%**). After retag imputation, Apr–Jun 2026 GM looks more like ~45–60% — still approximate.

### Roll-forward / shrink

`Beginning + Purchases − COGS = Ending` **cannot be tested month-by-month** without as-of inventory.

**Current snapshot (owned, active statuses `on_shelf`+`intake`, purchased):**

| Measure | Amount |
|---------|-------:|
| Sum of `Item.cost` (nulls as 0) | **$49,506** |
| Units | 18,167 |
| Units missing cost | **6,420** (mostly retag) |
| Plus imputed retag floor cost | **+$38,057** → **~$87.6k** rough economic inventory |

A backward walk from $49.5k using post-retag purchases/COGS/writeoffs is **arithmetically closed by construction** and **not** independent month-end truth — do not use it as audited ending inventory.

### Sanity read

- **Believe:** PO purchase totals; POS sales dollars from 2024-03; that shrink-loaded allocation exists and is internally consistent for native intake.
- **Do not believe without repair:** Apr 2026+ COGS from live `Item.cost`; any historical inventory asset account; GM% spikes/crashes in the live-COGS column.
- **Weakest link for books:** retag null costs + no sale-time cost snapshot + no physical counts.

---

## Consignment separation

| Question | Fact |
|----------|------|
| Same `Item` table? | Yes — `Item.source` ∈ `purchased` \| `consignment` \| `misc` |
| Flag | **`Item.source = 'consignment'`**; optional 1:1 `consignment.ConsignmentItem` |
| Live rows | **0** consignment items; **0** `ConsignmentItem` rows |
| Sale treatment | On cart complete: sets `ConsignmentItem` sold + `store_commission` / `consignee_earnings` from agreement rate (`apps/pos/views.py` `complete`) |
| Would naive `sum(cost)` include consigned? | Only if `source='consignment'` and cost set — **today no**. Always filter `source = 'purchased'` for owned inventory asset |

---

## Shrink visibility

| Status | Meaning | Live count | Notes |
|--------|---------|----------:|-------|
| `lost` | Explicit lost | **148** | Used (mostly Jun 2026) |
| `scrapped` | Written off | **83,532** | **83,518 are BACKFILL** leftovers; **14 native** |
| `returned` | In status enum | 0 in status rollup this session | |

- **No physical / cycle count table** (no inventory count model; only unrelated “audit” tables for QA / merges).
- If an item vanishes off the floor with no status change, **Dash does not notice**.
- `est_shrink` is **never** reconciled to actual lost/scrapped in an automated report found here.
- Status history coverage: **18,188 / 211,571** items — insufficient for shrink detection via reconstruction.

---

## Data coverage / which DB

| Topic | Answer |
|-------|--------|
| **Query for accounting** | **`ecothrift` schema** on the Django DB (`ecothrift_v3` locally; Heroku prod alias when configured). Not `ecothrift_v1` / `ecothrift_v2` archives. |
| **Reliable POS with lines** | **2024-03-18 → present** |
| **Backfill completeness** | Items tagged `BACKFILL:v1:` / `BACKFILL:v2:`; original cost often `purchase_cost/item_count` (`backfill_phase3_items.unit_cost_from_po`), not shrink formula. Many later recomputed if PO+retail present. **10,650 backfill rows still null cost.** |
| **Known bad periods** | Retag cutover **2026-03-30+** for item cost on new SKUs; mid-2025 PO `paid_date` gaps; Jun 2025 live COGS > sales |

### Excel “Sales History” / `daily_migration.csv`

- Produced by **manual** `psql --csv -f .ai/extended/sql/inventory_daily_migration.sql` (documented in `.ai/extended/sql/README.md`). **Not** a Heroku scheduled job.
- **Current v4 SQL has no COGS column.** Columns include `sales_qty`, `sales_sales`, `sales_retail`, on-shelf qty/price/retail, migrations, price up/down. If your sheet had “COGs,” it was either an older SQL variant, a column rename/mislabel, or computed outside this file.
- **Stale:** SQL still references `inventory_item.unit_retail`; live column is **`retail`** (renamed migration `0061`). Running the file as-is against current DB **fails**.
- Window: last **90 Chicago days** only — not a full historical P&L extract.

---

## Recommended interface

| Option | Recommendation |
|--------|----------------|
| **Cleanest v1** | Management command → **monthly CSV** (three totals + diagnostics). No need for the bookkeeping app to hold a live Dash connection. |
| **MVP monthly export** | **Three totals are enough to start**, plus: sales $, lines missing cost, retag-imputed COGS, purchases by ordered vs paid date, current inventory cost + missing-cost count. |
| **Item-level** | Feasible. ~**212k** rows, table ~**237 MB**. Columns: `item_id`, `sku`, `po_id`, `cost`, `retail`, `price`, `created_at`, `sold_at`, `sold_for`, `status`, `source`, `notes` (retag/backfill). Prefer monthly deltas after a full baseline. |
| **Existing paths** | `workspace/to_consultant/files-update/` is a **code/docs handoff**, not a numbers pipeline. `.ai/extended/sql/` has ops SQL but **no** COGS export. `export_category_bins` is category research, not books. **Build a dedicated command.** |

Suggested MVP columns for the bookkeeping import:

```text
entity, period_start, period_end,
sales_item_lines, sales_cart_subtotal,
cogs_live, cogs_retag_imputed, cogs_lines_missing_cost,
purchases_ordered_date, purchases_paid_date,
inventory_cost_current, inventory_units_missing_cost,
generated_at
```

---

## Unknowns

| Unknown | What would answer it |
|---------|---------------------|
| Exact last run of `recompute_all_item_costs` | Heroku/one-off shell history; no DB audit |
| Whether production Heroku DB matches this local restore freshness | `scripts/deploy/0_pull_prod_to_local.bat` date / heroku pull |
| Your Excel “COGs” column lineage | Old SQL file version, or separate notebook — not in current `inventory_daily_migration.sql` |
| Whether old-SKU costs should be copied onto retag Items as official repair | Owner decision + a one-shot data command |
| True physical shrink $ | Requires counts or systematic `lost` usage — neither exists at scale |
| Bank-date match quality PO-by-PO | Sample join of `paid_date`/`ordered_date` to B-Stock bank lines |

---

## Queries used

All against `ecothrift_v3` / schema `ecothrift`. Artifacts (gitignored workspace):

- `workspace/bookkeeping_recon_queries.sql`
- `workspace/bookkeeping_recon_queries2.sql`
- `workspace/bookkeeping_recon_output.txt`
- `workspace/bookkeeping_recon_output2.txt`

### Representative SQL

**Allocation check (single PO):**
```sql
SELECT i.sku, i.retail, i.price, i.cost,
  ROUND((i.retail / (po.retail_value * (1 - po.est_shrink))) * po.total_cost, 2) AS formula_cost
FROM ecothrift.inventory_item i
JOIN ecothrift.inventory_purchaseorder po ON po.id = i.purchase_order_id
WHERE po.order_number = 'C5TC0-OD7-3Q1L';
```

**Monthly sales + live COGS:**
```sql
SELECT date_trunc('month', timezone('America/Chicago', c.completed_at)) AS month,
       SUM(l.line_total) AS sales,
       SUM(i.cost) FILTER (WHERE i.source = 'purchased') AS cogs_live
FROM ecothrift.pos_cart c
JOIN ecothrift.pos_cartline l ON l.cart_id = c.id AND l.item_id IS NOT NULL
JOIN ecothrift.inventory_item i ON i.id = l.item_id
WHERE c.status = 'completed'
GROUP BY 1 ORDER BY 1;
```

**Retag-imputed COGS:**
```sql
SELECT SUM(COALESCE(i.cost, old.cost)) AS cogs_imputed
FROM ecothrift.inventory_item i
LEFT JOIN ecothrift.inventory_item old
  ON old.sku = substring(i.notes FROM 'RETAGGED_FROM_DB2:(.+)$')
WHERE i.status = 'sold' AND i.sold_at >= $start AND i.sold_at < $end;
```

**Purchases:**
```sql
SELECT date_trunc('month', ordered_date)::date,
       SUM(total_cost)
FROM ecothrift.inventory_purchaseorder
WHERE status IS DISTINCT FROM 'cancelled' AND total_cost IS NOT NULL
GROUP BY 1 ORDER BY 1;
```

**Current owned inventory at cost:**
```sql
SELECT SUM(cost)
FROM ecothrift.inventory_item
WHERE source = 'purchased'
  AND status IN ('on_shelf', 'intake', 'processing', 'returned');
```

### Code citations

| Claim | Location |
|-------|----------|
| Cost formula | `apps/inventory/models.py` `PurchaseOrder.compute_item_cost` |
| PO total from components | `PurchaseOrder.save` |
| Recompute on retail/PO change | `Item.save` / `_recompute_po_item_costs_after_save` |
| Intake sets cost | `apps/inventory/processing_ops.py` (check-in path) |
| Backfill command | `apps/inventory/management/commands/recompute_all_item_costs.py` |
| Default shrink setting | `apps/inventory/services/po_defaults.py` |
| Cart complete / no cost snapshot | `apps/pos/views.py` `complete`; `apps/pos/models.py` `CartLine` |
| Quick reprice | `apps/inventory/views.py` `quick_reprice_view` |
| Backfill original cost | `backfill_phase3_items.unit_cost_from_po` |
| Field rename `unit_retail`→`retail` | migration `0061_product_item_field_cleanup.py` |

---

*End of recon. No code, schema, or data was modified except this report file.*
