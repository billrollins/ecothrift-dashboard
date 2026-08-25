<!-- Archived 2026-04-11: disposition=completed (Phases 0–6; v2.10.0) -->
<!-- initiative: slug=data-backfill status=completed updated=2026-04-11 -->
<!-- Last updated: 2026-04-11T23:00:00-05:00 -->
# Initiative: Historical data backfill (V1/V2 into V3)

**Status:** Completed — archived. Production CSV export + `import_backfill` deployment still deferred (see initiative body).

**Current phase:** **Complete** — Phase 6 verification passed (Session 6). Taxonomy + `PricingRule` pipeline: [`backfill_phase5_categories`](../../../../apps/inventory/management/commands/backfill_phase5_categories.py); V2 iterative rules via [`classify_v2_iterate`](../../../../apps/inventory/management/commands/classify_v2_iterate.py).

---

## Context

The V3 dashboard has been live for ~4 days. The buying intelligence panels (category need, sell-through, sales charts) show near-zero data because the V3 schema has almost no historical inventory or sales records. A previous half-baked import loaded ~155K item rows into `ecothrift.inventory_item` with nearly zero category coverage, no PO/product FKs, and no corresponding sales data. That import needs to be removed and replaced with a proper backfill.

The business has ~3 years of operational data across two legacy database generations (V1: Mar 2024 to Jul 2025, V2: Aug 2025 to Mar 2026) plus 4 days of live V3 data. This initiative loads that history into V3's real models with proper relationships, categories, and a `backfilled` flag so it integrates with the existing app without breaking anything.

**Source data:** **Phases 1–2** read legacy PostgreSQL databases **`ecothrift_v1`** and **`ecothrift_v2`** on the same host as V3 (credentials from root `.env`; raw `psycopg2` reads — no Django aliases for legacy DBs). Pre-extracted pickle files at `workspace/notebooks/historical-data/pickle/` (db1/ and db2/ subdirectories) and **CSVs** under `workspace/notebooks/historical-data/csv/` remain useful for Phases 3+ and offline inspection; pickle manifest at `pickle/manifest.json`.

---

## Objectives

1. Remove the half-baked historical import. Preserve all real V3 operational data (retag items, add-item items, live POS carts/sales).
2. Load V1 and V2 data into V3 Django models with proper FK relationships.
3. Assign taxonomy_v1 categories to all backfilled items.
4. Flag all backfilled records so they are distinguishable from organically-created V3 data.
5. After backfill: category need panel, sales charts, sell-through rates, and PO history all show real historical numbers.

---

## Non-negotiables

- Real V3 operational data (on_shelf items, retag items, live carts/cartlines) must be preserved through the cleanup step. Identify before deleting.
- Every backfilled record gets `notes` containing a backfill tag (e.g. `BACKFILL:v1:` or `BACKFILL:v2:`) so it can be identified later.
- SKU uniqueness must be maintained. Backfilled items use a distinct SKU prefix or pattern that cannot collide with V3-generated SKUs (`ITM` prefix).
- No Django signals or hooks should fire during bulk import (use `bulk_create` with appropriate settings, or raw SQL where needed).
- **Phase 1:** Legacy DB archives (`ecothrift_v1`, `ecothrift_v2`) are the source of truth for vendors and POs. **Phases 2+:** Prefer pickle/CSV or DB reads as documented per phase; do not assume pickles load in every environment (use CSV conversion when needed).
- All money values are in dollars (V1 and V2 store as numeric/decimal dollars, same as V3).

---

## Backfill flag strategy

Every model that receives backfilled data gets a tag in its `notes` field (or equivalent):

| Model | Flag location | Format |
|-------|--------------|--------|
| PurchaseOrder | `notes` | `BACKFILL:v1:` or `BACKFILL:v2:` + original PK |
| Product | `description` | `BACKFILL:v1:` or `BACKFILL:v2:` + original code/PK |
| ManifestRow | `notes` | `BACKFILL:v1:` or `BACKFILL:v2:` + original PK |
| Item | `notes` | `BACKFILL:v1:` or `BACKFILL:v2:` + original code/PK |
| Cart | (no notes field) | Use a sentinel: `customer_id` left null, `created_at` set to original timestamp, identifiable by date range pre-V3-launch |
| CartLine | (no notes field) | Identifiable by cart FK to a backfilled cart |

---

## SKU strategy for backfilled items

V3 generates SKUs like `ITM0000001` (auto-increment via `generate_sku()`). Backfilled items must not collide.

- **V1 items:** Original SKU is a 9-char opaque code (e.g. `qthFHRXwu`). Use as-is since it cannot collide with `ITM` prefix pattern.
- **V2 items:** Original SKU is `ITMNDMA68E` style (10-char, starts with `ITM` but uses alpha suffix). Check for collisions with V3 `ITM` + numeric pattern. If collisions exist, prefix with `V2-`. If no collisions (likely given the format difference), use as-is.
- After backfill, verify `generate_sku()` starts above the highest numeric `ITM` SKU to avoid future collisions.

---

## Production deployment strategy

All backfill work happens on Bill's local database. Production does not receive data until the full pipeline is verified locally. The deployment approach:

**Local = working copy.** Each phase runs locally. Manual work (AI category assignments, data corrections, spot-check fixes) happens once and is captured in the local DB. We do not repeat expensive or manual steps.

**Export artifact.** After all phases are verified locally, extract every backfill-tagged record into portable CSVs:

- `backfill_vendors.csv`
- `backfill_purchase_orders.csv`
- `backfill_products.csv`
- `backfill_manifest_rows.csv`
- `backfill_items.csv`
- `backfill_carts.csv`
- `backfill_cartlines.csv`
- `backfill_drawers.csv` (synthetic daily drawers)
- `backfill_pricing_rules.csv` (computed sell-through rates)

These capture the final state of all backfill data including AI-assigned categories, corrected fields, and derived values. The export command extracts everything with `BACKFILL:` tags plus the Misfit vendor/POs and backfill infrastructure records.

**Import pipeline.** A management command (`import_backfill`) reads the export CSVs and creates records in the target database. It handles the FK chain in dependency order (vendors → POs → products → manifest rows → items → drawers → carts → cartlines). It is idempotent: uses `get_or_create` or checks for existing backfill tags before inserting so it can be re-run safely if interrupted.

**Production deployment sequence:**

1. Push all code to Heroku (buying app, management commands, migrations, etc.).
2. Run Phase 0 cleanup on production (the `HISTORICAL:` import exists there too).
3. Run `import_backfill` locally pointed at the production DB connection string (Bill runs from his machine via production credentials in `.env` or pgAdmin).
4. Verify on production.

If fresh production data is needed in the backfill (unlikely since V1/V2 are frozen history), pull production down, reconcile, re-export, re-import during off-hours when no new POS transactions are coming in.

**Standing requirement for all phases:** Every phase must create records that are extractable by backfill tag. Do not create records without tags. The export/import pipeline depends on being able to query "everything with BACKFILL: in notes" (or the equivalent sentinel for models without notes fields, like Cart/CartLine identification by date range and backfill drawer FK).

---

## Phased plan

### Phase 0: Recon and cleanup — **done** (2026-04-10)

**Goal:** Identify all real V3 operational data, remove the half-baked import, verify clean state.

**Step 1: Identify real V3 data.**

Run queries against `ecothrift.inventory_item`:
- Count items where `notes` contains `HISTORICAL:db1:` or `HISTORICAL:db2:` (the old import tag)
- Count items where `notes` does NOT contain those tags (these are real V3 items)
- Count items with `status = 'on_shelf'` that are NOT from the old import
- Count items referenced by `ecothrift.pos_cartline` (these have been through POS and must be preserved)
- Count items linked to `ecothrift.inventory_retaglog` (retag-created items) if that table still exists
- List distinct `notes` patterns to catch any other import artifacts

**Step 2: Delete the half-baked import.**

Delete `ecothrift.inventory_item` rows where `notes LIKE 'HISTORICAL:db1:%'` or `notes LIKE 'HISTORICAL:db2:%'`. Verify no CartLine or other FK references point to these rows first. If any do, report them before deleting.

Also clean up:
- Any `ecothrift.inventory_product` rows that were created by the old import (check for zero-FK items pointing to them)
- Any `ecothrift.inventory_itemhistory` rows for deleted items (CASCADE should handle this)

**Step 3: Verify clean state.**

- `ecothrift.inventory_item` row count should be small (only real V3 operational items)
- `ecothrift.pos_cart` and `ecothrift.pos_cartline` should be unchanged
- `manage.py check` passes
- No orphan FKs

**Acceptance:** Report showing before/after counts. All real V3 data preserved. Clean state confirmed.

**Verify commands:**
```
python manage.py check
python manage.py shell -c "from apps.inventory.models import Item; print(f'Items: {Item.objects.count()}')"
python manage.py shell -c "from apps.pos.models import Cart; print(f'Carts: {Cart.objects.count()}')"
```

---

### Phase 1: Vendors and Purchase Orders — **done** (Session 2, 2026-04-10)

**Goal:** Load vendor records and all historical POs into V3.

**Implementation:** Management command [`backfill_phase1_vendors_pos`](../../../../apps/inventory/management/commands/backfill_phase1_vendors_pos.py) — `psycopg2` reads from `ecothrift_v1` / `ecothrift_v2`; Django ORM `get_or_create` on `Vendor.code` and `PurchaseOrder.order_number`; inline description enrichment (JSON on last line of `notes`); skips Misfit POs.

**Pickle / CSV reference (column names only — Phase 1 does not load these files):**
- `db1/purchase_orders.pkl` (210 rows; columns include `number`, `price_amt`, `fee_amt`, `shipping_amt`, `paid_amt`, `retail_amt`, `quantity`, `description`, `condition_id`, `purchased_on`, `received_on`, `scheduled_delivery`, `paid_on`, `preprocessed_on`, `processed_on`, `created_on`, `delivery_address_cde`)
- `db2/purchase_orders.pkl` (103 rows; columns include `order_number`, `vendor_id`, `status`, `purchase_date`, `purchase_price`, `shipping_cost`, `other_fees`, `total_cost`, `retail_value`, `quantity`, `description`, `condition`, `notes`, `expected_delivery`, `received_date`)
- `db2/vendors.pkl` (vendor records with id, name, code, type, etc.)

**CSV mirror:** Same filenames under `workspace/notebooks/historical-data/csv/db1/` and `csv/db2/` after `convert_pickles_to_csv.py` — prefer CSV for loaders if pickles fail in your environment.

**Step 1: Vendors.**

Load V2 vendors from `db2/vendors.pkl` into `inventory.Vendor`. V1 has no vendor table; derive vendors from PO number prefixes using the known mapping:

| V1 PO prefix | Vendor code | Vendor name |
|-------------|-------------|-------------|
| AMZ | AMZ | Amazon |
| TGT | TGT | Target |
| WAL | WAL | Walmart |
| CST | CST | Costco |
| WFR | WFR | Wayfair |
| HMD | HMD | Home Depot |
| ESS | ESS | Essendant |
| GEN | GEN | Generic |

Check for existing vendors in V3 (from buying app seed data) and merge rather than duplicate. Use `get_or_create` on `code`.

**Step 2: Purchase Orders.**

> **Scout: verify these mappings.** Before implementing, read `apps/inventory/models.py` PurchaseOrder and reconcile. The target fields listed below were assumed, not verified against the model. Add any model fields not covered. Remove any that don't exist. Report discrepancies in the session notes.

V1 field mapping:

| V3 PurchaseOrder field | V1 source | Transform |
|----------------------|-----------|-----------|
| `vendor` | First 3 chars of `number` → vendor code lookup | Map prefix to Vendor FK |
| `order_number` | `number` | Direct |
| `status` | Derive from timestamps | If `processed_on` set: `complete`. Elif `received_on` set: `delivered`. Elif `paid_on` set: `paid`. Else: `ordered`. |
| `ordered_date` | `purchased_on` | Timestamp to date. Fallback: `created_on` date |
| `paid_date` | `paid_on` | Timestamp to date, nullable |
| `delivered_date` | `received_on` | Timestamp to date, nullable |
| `expected_delivery` | `scheduled_delivery` | Timestamp to date, nullable |
| `purchase_cost` | `price_amt` | Direct (decimal dollars) |
| `shipping_cost` | `shipping_amt` | Direct |
| `fees` | `fee_amt` | Direct |
| `retail_value` | `retail_amt` | Direct |
| `item_count` | `quantity` | Direct (int) |
| `description` | `description` | Direct (truncate to 500 chars if needed) |
| `condition` | `condition_id` → join `db1/list_condition.pkl` for name → map to V3 choices | Map legacy names to V3 CONDITION_CHOICES |
| `notes` | `BACKFILL:v1:` + original id | Backfill tag |
| `total_cost` | Let model `save()` compute from components | Auto |

**Scout:** Reconcile the **V2** mapping table below against `PurchaseOrder` the same way as V1 (add/remove fields to match the model).

V2 field mapping:

| V3 PurchaseOrder field | V2 source | Transform |
|----------------------|-----------|-----------|
| `vendor` | `vendor_id` → join `db2/vendors.pkl` → match V3 Vendor by code | FK lookup |
| `order_number` | `order_number` | Direct |
| `status` | `status` | Map: `confirmed` → `ordered`, `items_generated` → `processing`, `received` → `delivered`. Others: best match to V3 choices. |
| `ordered_date` | `purchase_date` | Direct (date) |
| `delivered_date` | `received_date` | Direct, nullable |
| `expected_delivery` | `expected_delivery` | Timestamp to date, nullable |
| `purchase_cost` | `purchase_price` | Direct |
| `shipping_cost` | `shipping_cost` | Direct |
| `fees` | `other_fees` | Direct |
| `retail_value` | `retail_value` | Direct |
| `item_count` | `quantity` | Direct |
| `description` | `description` | Direct |
| `condition` | `condition` | Map to V3 CONDITION_CHOICES |
| `notes` | Line 1: `BACKFILL:v2:` + id; lines 2+: legacy `notes` plain text if any; last line: optional enrichment JSON | See Step 3 |

**Step 3: PO description enrichment (inline).**

After PO rows are created, read all `description` fields and extract structured metadata using your own judgment. Look for: city/state, pallet count, unit count, ext. retail value, and category signals. **Notes layout:** line 1 = backfill tag; optional plain-text legacy V2 `notes` on lines 2+; optional single-line JSON object on the **last line** only (e.g. after `BACKFILL:v2:42` and any legacy text). Do not guess or fabricate fields. This replaces the previous reference to `extract_po_descriptions.py` which is not part of the backfill pipeline.

**Acceptance:**
- Vendor count matches expected (check with `Vendor.objects.count()` — includes MIS + merged V1/V2 vendors)
- PO count: **315** total (**313** backfilled: 210 V1 + 103 V2 + **2** Misfit POs from Phase 0), no duplicates on `order_number`
- `order_number` uniqueness: `PurchaseOrder.objects.values('order_number').annotate(c=Count('id')).filter(c__gt=1)` returns empty
- Spot check: 3 V1 POs and 3 V2 POs match source data (cost, dates, vendor)

---

### Phase 2: Products and inventory ManifestRows — **done** (Session 3, 2026-04-11)

**Goal:** Load product catalog and manifest line items.

**Implementation:** [`backfill_phase2_products_manifests`](../../../../apps/inventory/management/commands/backfill_phase2_products_manifests.py) — legacy DB reads (`ecothrift_v1` / `ecothrift_v2`); products via individual `save()` (`PRD-*`); manifest rows via `bulk_create`; category + `legacy_*` in `specifications`; idempotency on `Product.description` and `ManifestRow.notes` tags.

**Pickle / CSV reference only (Phase 2 does not load files):**
- `db1/products.pkl` (~140K rows: code, title, brand, model)
- `db1/product_attrs.pkl` (~153K rows: product_cde, upc, category, subcategory, retail_amt)
- `db1/manifests.pkl` (~108K rows: manifest lines with category, retail, descriptions)
- `db2/products.pkl` (~41K rows)
- `db2/manifest_rows.pkl` (~36K rows: category, subcategory, retail, descriptions, PO FK)

**Step 1: Products.**

Create `inventory.Product` rows. Join V1 `products.pkl` with `product_attrs.pkl` on `code` = `product_cde` to get category, UPC, retail.

V1 Product mapping:

| V3 Product field | V1 source | Transform |
|-----------------|-----------|-----------|
| `title` | `product.title` | Direct |
| `brand` | `product.brand` | Direct |
| `model` | `product.model` | Direct |
| `category` | `product_attrs.category` | Direct (V1 department-style label; taxonomy_v1 assignment happens in Phase 5) |
| `upc` | `product_attrs.upc` | Direct |
| `default_price` | `product_attrs.retail_amt` | Direct |
| `description` | `BACKFILL:v1:` + product code | Backfill tag |
| `product_number` | Let `save()` auto-generate | Auto (`PRD-NNNNN`) |

V2 Product mapping: Similar pattern, join with manifest_rows for category data since V2 products lack a category column.

**Deduplication (evaluate, don't assume):** V1 and V2 were separate systems, not a migration. Overlap may be minimal. Before building dedup logic, check a sample: load 100 V1 and 100 V2 products and see how many share exact title + brand + UPC. If overlap is <5%, skip dedup entirely and load all products with their respective backfill tags. If overlap is significant, propose a matching strategy in the plan. Do not build complex dedup unless the data justifies it.

**Step 2: Inventory ManifestRows.**

Create `inventory.ManifestRow` rows linked to their PurchaseOrder.

V1 ManifestRow mapping (from `db1/manifests.pkl`):

| V3 ManifestRow field | V1 source | Transform |
|---------------------|-----------|-----------|
| `purchase_order` | Join on manifest's PO reference → V3 PurchaseOrder FK | FK lookup by order_number |
| `row_number` | `line_number` or sequential | Direct or generated |
| `description` | `description` or `title` | Direct |
| `quantity` | `quantity` | Direct (default 1) |
| `retail_value` | `retail_amt` or `unit_retail` | Direct |
| `category` | `category` | Direct (original V1 label) |
| `brand`, `model`, `upc` | From manifest or joined product | Direct where available |
| `notes` | `BACKFILL:v1:` + original id | Backfill tag |

V2 ManifestRow mapping (from `db2/manifest_rows.pkl`): Similar, with `inventory_purchase_order_id` for PO linkage.

**Acceptance (verified Session 3):**
- **120,919** backfill `Product` rows (`BACKFILL:` in `description`) — V1 has **duplicate `product.code` values** across ~140.6K `product` rows; loader creates **one V3 product per distinct code** (~79.4K) plus **41,509** V2 products.
- **143,968** `ManifestRow` rows with backfill `notes`; **110** legacy manifest lines skipped (no matching V3 PO for `order_number` / V2 `purchase_order_id`).
- `ManifestRow` with null `purchase_order`: **0**.
- Spot check: `TGT100653`, `CST423585`, `AMZ11175` manifest line counts match legacy SQL.
- `Product.generate_product_number()` next value after load: **PRD-120920** (sequencing OK).

---

### Phase 3: Items — command implemented (Session 4)

**Loader:** [`backfill_phase3_items`](../../../../apps/inventory/management/commands/backfill_phase3_items.py) — `psycopg2` reads from **`ecothrift_v1`** / **`ecothrift_v2`**; `bulk_create` with precomputed `search_text`; idempotent `BACKFILL:v1:{code}` / `BACKFILL:v2:{id}` notes; Misfit PO fallbacks; V1 sold from latest `item_status` (16/23); V2 `sold_at` / `sold_for` on `inventory_item`; V2 `ITM\\d+` SKUs prefixed `V2-`; **`sold_for`** V1 null (no legacy sold price on `item`); no cart joins.

**Goal:** Load all historical inventory items with proper FK relationships.

**Pickle sources:**
- `db1/items.pkl` (~124K rows)
- `db1/item_conditions.pkl` (condition history for V1 items)
- `db1/item_statuses.pkl` (status history for V1 items)
- `db1/sold_items.pkl` (sold item data)
- `db2/items.pkl` (~60K rows)
- `db2/item_history.pkl` (status/condition history)
- `db2/sold_items.pkl`

**Item field mapping (V1):**

| V3 Item field | V1 source | Transform |
|--------------|-----------|-----------|
| `sku` | `item.code` | Direct (9-char opaque, no collision with `ITM` pattern) |
| `product` | `item.product_cde` → lookup V3 Product by backfill tag | FK lookup |
| `purchase_order` | `item.order_number` → lookup V3 PurchaseOrder by `order_number` | FK lookup (null if no match; ~10% of items have unmatched PO) |
| `title` | From joined product `title` | Direct |
| `brand` | From joined product `brand` | Direct |
| `category` | From joined `product_attrs.category` | Direct (original label; taxonomy_v1 in Phase 5) |
| `price` | `item.retail_amt` or `starting_price_amt` | Use `starting_price_amt` as the tag/shelf price; `retail_amt` as retail reference |
| `cost` | Derive from PO: `purchase_order.price_amt / purchase_order.quantity` | Per-unit cost estimate (nullable if PO not linked) |
| `status` | Derive: if item appears in `sold_items.pkl` or has a matching cart_line → `sold`. Otherwise → `scrapped`. Never `on_shelf` for backfilled items. Map V1 status IDs via `db1/list_status.pkl` only for logging/notes, not for V3 status. |
| `condition` | Latest from `item_conditions.pkl` joined on item code, mapped via `db1/list_condition.pkl` | Map to V3 CONDITION_CHOICES (`poor` → `fair`, etc.) |
| `sold_at` | From `sold_items.pkl` or cart_line join | Timestamp, nullable |
| `sold_for` | From cart_line `unit_price_amt` where sold | Decimal, nullable |
| `source` | `'purchased'` | Default for liquidation items |
| `notes` | `BACKFILL:v1:` + original item code | Backfill tag |

V2 Item mapping: Similar pattern, with typed FKs available (`product_id`, `inventory_purchase_order_id`).

**Status derivation rules:**
- If item has a matching cart_line in the sales data: `sold`
- If item has `sold_at` timestamp in the items pickle: `sold`
- Otherwise: `scrapped` (historical items not sold are presumed gone)
- Do NOT set `on_shelf` for backfilled items. Only real V3 operational items should be `on_shelf`.

**Acceptance (target after full run on legacy-connected DB):**
- Item count: ~184K total (124K V1 + 60K V2)
- No SKU collisions with existing V3 items
- Spot check: 5 items from each generation, verify title, price, status, PO linkage
- `Item.objects.filter(notes__startswith='BACKFILL:').count()` matches expected total

**Pasteable verification (shell, from project root):**

```bash
python manage.py check
python manage.py backfill_phase3_items --dry-run
python manage.py shell -c "from apps.inventory.models import Item; print('backfill items', Item.objects.filter(notes__startswith='BACKFILL:').count())"
python manage.py shell -c "from apps.inventory.models import Item; from django.db.models import Count; print(Item.objects.filter(notes__startswith='BACKFILL:').values('sku').annotate(c=Count('id')).filter(c__gt=1).count())"
python manage.py shell -c "from apps.inventory.models import Item; print('on_shelf backfill', Item.objects.filter(notes__startswith='BACKFILL:', status='on_shelf').count())"
python manage.py shell -c "from apps.inventory.models import Item, PurchaseOrder; m1=PurchaseOrder.objects.get(order_number='MISFIT-V1-2024').id; m2=PurchaseOrder.objects.get(order_number='MISFIT-V2-2025').id; qs=Item.objects.filter(notes__startswith='BACKFILL:', purchase_order_id__in=[m1,m2]); print('Misfit-linked', qs.count())"
python manage.py shell -c "import re; from apps.inventory.models import Item; itm=[s for s in Item.objects.values_list('sku', flat=True) if re.match(r'^ITM\\d+$', s)]; print('max ITM suffix', max((int(x[3:]) for x in itm), default=None))"
```

---

### Phase 4: Sales (Carts, CartLines, Payments) — command implemented (Session 5)

**Loader:** [`backfill_phase4_sales`](../../../../apps/inventory/management/commands/backfill_phase4_sales.py) — `psycopg2` reads from **`ecothrift_v1`** / **`ecothrift_v2`**; infrastructure register **`BACKFILL`** + drawers by Chicago sale date; V2 cashier via `core_user.email` → V3 `User` when possible; **`historical_revenue`** avoids double-count vs `HistoricalTransaction` (see `apps/pos/views.py`).

**Goal:** Load historical POS transactions so sales reports and sell-through calculations work.

**Pickle sources:**
- `db1/carts.pkl` (~53K rows)
- `db1/cart_lines.pkl` (~173K rows)
- `db1/payments.pkl` (~55K rows)
- `db1/drawers.pkl`
- `db2/carts.pkl` (~17K rows)
- `db2/cart_lines.pkl` (~44K rows)
- `db2/payments.pkl` (~16K rows)
- `db2/drawers.pkl`
- `db2/registers.pkl`
- `db2/receipts.pkl`

**Dependencies:** Cart requires Drawer requires Register requires WorkLocation. We need to create minimal infrastructure records.

**Step 1: Create backfill infrastructure.**

- One `WorkLocation` for the backfill (or use existing if one already exists): "Eco-Thrift Main" or similar.
- One `Register` per physical register that appears in the data (or a single "Backfill Register" if register-level reporting isn't critical).
- Drawers: one per unique drawer/date combination in the source data.
- One system user for `cashier` FK on backfilled carts (e.g. a "Backfill System" user, or map V1/V2 cashier codes to V3 users where possible).

**Design decision for Scout:** Propose the minimal infrastructure approach. Options:
- (A) Single backfill register + drawers grouped by date. Simple, loses register-level detail.
- (B) Map V2 registers from `db2/registers.pkl` to V3 registers. More accurate for V2 data. V1 data uses drawer codes that may not map cleanly.

**Step 2: Carts.**

V1 Cart mapping:

| V3 Cart field | V1 source | Transform |
|--------------|-----------|-----------|
| `drawer` | Map `cart.drawer_cde` to a V3 Drawer | FK lookup or backfill drawer |
| `cashier` | System backfill user (V1 has no cashier on cart) | FK to backfill user |
| `status` | `completed` (we only load non-void carts) | Static |
| `subtotal` | `subtotal_amt` | Direct |
| `tax_rate` | `sales_tax_percentage / 100` | Convert (V1 stores as 7.00, V3 as 0.0700) |
| `tax_amount` | `tax_amt` | Direct |
| `total` | `total_amt` | Direct |
| `payment_method` | Derive from `db1/payments.pkl`: if any payment.type = 'Credit' or 'Debit' → `card`. If only 'Cash' → `cash`. Mixed → `split`. | Join and derive |
| `completed_at` | `close_time` | Direct (exclude sentinel 9999 dates) |

V2 Cart mapping: Similar, with `pos_cart.status`, `completed_at`, `cashier_id` available.

**Step 3: CartLines.**

| V3 CartLine field | V1 source | Transform |
|------------------|-----------|-----------|
| `cart` | Map to V3 Cart by original cart code/id | FK lookup |
| `item` | `cart_line.item_cde` → lookup V3 Item by SKU | FK lookup (null for ~18% of V1 lines with no item_cde) |
| `description` | `line_description` | Direct |
| `quantity` | `quantity` | Direct |
| `unit_price` | `unit_price_amt` | Direct |
| `line_total` | `total_price_amt` | Direct |

V2 CartLine mapping: Similar, with `item_id` FK available (99.9% coverage).

**Step 4: Update sold items.**

After CartLines are loaded, update the corresponding Item records:
- Set `status = 'sold'`
- Set `sold_at` from the cart's `completed_at`
- Set `sold_for` from the cart line's `unit_price`

**Step 5: Receipts (optional).**

Create Receipt records for V2 carts (V2 has `db2/receipts.pkl`). V1 has no receipt model. Low priority; skip if it adds complexity.

**Acceptance (target after full run on legacy-connected DB):**
- Cart count: ~69K (53K V1 + 16K V2)
- CartLine count: ~217K (173K V1 + 44K V2)
- Every CartLine's `cart` FK is valid
- Sold item count matches: number of items with `status='sold'` and `notes` containing BACKFILL should approximate the number of cart lines with item FKs
- Spot check: 3 carts from each generation, verify line items, totals, dates

**Pasteable verification (shell, from project root):**

```bash
python manage.py check
python manage.py backfill_phase4_sales --dry-run
python manage.py shell -c "from apps.pos.models import Cart, Register; r=Register.objects.get(code='BACKFILL'); print('backfill carts', Cart.objects.filter(drawer__register=r).count())"
python manage.py shell -c "from apps.pos.models import CartLine; print('lines on backfill carts', CartLine.objects.filter(cart__drawer__register__code='BACKFILL').count())"
python manage.py shell -c "from apps.inventory.models import Item; print('BACKFILL with sold_for', Item.objects.filter(notes__startswith='BACKFILL:', sold_for__isnull=False).count())"
python manage.py shell -c "from apps.inventory.models import Item; print('on_shelf backfill', Item.objects.filter(notes__startswith='BACKFILL:', status='on_shelf').count())"
```

---

### Phase 5: Category enrichment — **done** (Session 6, 2026-04-11)

**Goal:** Assign every backfilled `Item` / `Product` a valid [`taxonomy_v1`](../../../../apps/buying/taxonomy_v1.py) category; recompute [`PricingRule`](../../../../apps/buying/models.py) sell-through from real sold BACKFILL data; classify V2 products (rules + manual).

**How V2 was classified:** `--preclassify-v2` (brand/PO rules) plus eight rounds of regex rules files (`rules_001.json` … `rules_008.json`) and one manual override JSON, driven by [`classify_v2_iterate`](../../../../apps/inventory/management/commands/classify_v2_iterate.py) (`--sample`, `--apply`, `--status`, `--apply-manual`); consultant iterated on patterns from `workspace/data/v2_sample/sample_for_review.csv`. Final stragglers fixed by `product_id`. Scout file `v2_products_001.csv` used merged manual map (`manual_merged.json`).

**Command:** [`backfill_phase5_categories`](../../../../apps/inventory/management/commands/backfill_phase5_categories.py)

| Step | Flag | Purpose |
|------|------|---------|
| 1 | `--map-v1` | Normalize V1 `Department / Subcategory` labels; map department → `TAXONOMY_V1_CATEGORY_NAMES` (hardcoded dict); `bulk_update` V1 items + mode on V1 `Product`. Items with no category borrow sibling product mode or `Mixed lots & uncategorized`. |
| 2 | `--export-v2` | CSV batches `workspace/data/v2_classify/v2_products_NNN.csv` (~400 rows/file), sorted vendor then title; PO enrichment JSON `category_text` when present. |
| 3 | `--import-v2` | Read completed CSVs; validate `taxonomy_v1_category`; update `Product`; propagate to V2 items (`bulk_update` from `product.category`). |
| 4 | `--recompute-pricing` | Per category: `sum(sold_for)/sum(price)` on sold BACKFILL items; `PricingRule.update_or_create` (+ optional `avg_retail` / `avg_sold_price`). |

**Execution order for Bill:** `--map-v1` → `--export-v2` → (classify CSVs offline) → `--import-v2` → `--recompute-pricing` → then manually `python manage.py recompute_buying_valuations`.

**Pasteable verification (from project root):**

```bash
python manage.py check
python manage.py shell -c "from apps.inventory.models import Item; from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES; print('empty category', Item.objects.filter(notes__startswith='BACKFILL:', category='').count()); print('invalid', Item.objects.filter(notes__startswith='BACKFILL:').exclude(category__in=TAXONOMY_V1_CATEGORY_NAMES).count())"
python manage.py shell -c "from apps.buying.models import PricingRule; print('PricingRule sample_size>0', PricingRule.objects.filter(sample_size__gt=0).count())"
```

**Acceptance:**
- [x] `Item.objects.filter(notes__startswith='BACKFILL:', category='').count()` = 0
- [x] `Item.objects.filter(notes__startswith='BACKFILL:').exclude(category__in=TAXONOMY_V1_CATEGORY_NAMES).count()` = 0
- [x] All 19 `PricingRule` rows have `sample_size > 0` with data-backed sell-through rates (after `--recompute-pricing` + Phase 4 sales)
- [x] `recompute_buying_valuations` ran successfully on 137 auctions

---

### Phase 6: Verify and recompute — **done** (Session 6, 2026-04-11)

**Goal:** Confirm all dashboards and calculations show real historical data.

**Step 1: Recompute.**
- `python manage.py recompute_buying_valuations` (recalculates auction valuations with new pricing rules)
- `python manage.py seed_pricing_rules --input workspace/data/sell_through_by_category_computed.csv` (if Phase 5 produced a new rates CSV)

**Step 2: Verify dashboards.**

Test worksheet for Bill:

1. Open `http://localhost:5173/buying/auctions` - Category need panel should show non-zero shelf/sold counts and percentages across multiple categories.
2. Check any auction detail page - Valuation card should show estimated revenue based on real sell-through rates.
3. Open Django admin (`/db-admin/`) - `inventory.PurchaseOrder` should show 313+ POs. `inventory.Item` should show 184K+ items. `pos.Cart` should show 69K+ carts.
4. API check: `curl http://localhost:8000/api/buying/category-need/` - Should return 19 categories with non-zero `shelf_count`, `sold_count`, `recovery_pct` (post–v2.16.0).

**Step 3: Integrity checks.**
```
python manage.py check
python manage.py shell -c "
from apps.inventory.models import Item, PurchaseOrder, Product
from apps.pos.models import Cart, CartLine
print(f'POs: {PurchaseOrder.objects.count()}')
print(f'Products: {Product.objects.count()}')
print(f'Items: {Item.objects.count()}')
print(f'  Backfilled: {Item.objects.filter(notes__startswith=\"BACKFILL:\").count()}')
print(f'  Sold: {Item.objects.filter(status=\"sold\").count()}')
print(f'  On shelf (real V3): {Item.objects.filter(status=\"on_shelf\").exclude(notes__startswith=\"BACKFILL:\").count()}')
print(f'Carts: {Cart.objects.count()}')
print(f'CartLines: {CartLine.objects.count()}')
"
```

**Acceptance:**
- [x] `GET /api/buying/category-need/` returns 19 categories with non-zero shelf/sold-derived counts (local verification)
- [x] Django admin: POs ≈315, Items 192K+, Carts 69K+ (spot-check)
- [x] `manage.py check` passes
- [x] `tsc --noEmit` passes (release gate)
