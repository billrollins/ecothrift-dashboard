<!-- initiative: slug=data-backfill status=active updated=2026-04-11 -->
<!-- Last updated: 2026-04-11T20:00:00-05:00 -->
# Initiative: Historical data backfill (V1/V2 into V3)

**Status:** Active

**Current phase:** Phase 4 (sales — carts, cart lines, payments, **`sold_for` / sale data on items**) — **next** (Session 5). Phase 3 loader shipped; run [`backfill_phase3_items`](../../apps/inventory/management/commands/backfill_phase3_items.py) against legacy DBs when ready to populate ~184K `Item` rows.

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

**Implementation:** Management command [`backfill_phase1_vendors_pos`](../../apps/inventory/management/commands/backfill_phase1_vendors_pos.py) — `psycopg2` reads from `ecothrift_v1` / `ecothrift_v2`; Django ORM `get_or_create` on `Vendor.code` and `PurchaseOrder.order_number`; inline description enrichment (JSON on last line of `notes`); skips Misfit POs.

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

**Implementation:** [`backfill_phase2_products_manifests`](../../apps/inventory/management/commands/backfill_phase2_products_manifests.py) — legacy DB reads (`ecothrift_v1` / `ecothrift_v2`); products via individual `save()` (`PRD-*`); manifest rows via `bulk_create`; category + `legacy_*` in `specifications`; idempotency on `Product.description` and `ManifestRow.notes` tags.

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

**Loader:** [`backfill_phase3_items`](../../apps/inventory/management/commands/backfill_phase3_items.py) — `psycopg2` reads from **`ecothrift_v1`** / **`ecothrift_v2`**; `bulk_create` with precomputed `search_text`; idempotent `BACKFILL:v1:{code}` / `BACKFILL:v2:{id}` notes; Misfit PO fallbacks; V1 sold from latest `item_status` (16/23); V2 `sold_at` / `sold_for` on `inventory_item`; V2 `ITM\\d+` SKUs prefixed `V2-`; **`sold_for`** V1 null (no legacy sold price on `item`); no cart joins.

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

### Phase 4: Sales (Carts, CartLines, Payments) — planned

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

**Acceptance:**
- Cart count: ~69K (53K V1 + 16K V2)
- CartLine count: ~217K (173K V1 + 44K V2)
- Every CartLine's `cart` FK is valid
- Sold item count matches: number of items with `status='sold'` and `notes` containing BACKFILL should approximate the number of cart lines with item FKs
- Spot check: 3 carts from each generation, verify line items, totals, dates

---

### Phase 5: Category enrichment — planned

**Goal:** Assign taxonomy_v1 categories to all backfilled items and products.

**Step 1: Rule-based pass.**

Use the existing `taxonomy_estimate.py` mapping (verify actual label count when loading — the "444" figure from initiative drafting is unverified) to map V1 `product_attrs.category` labels and V2 manifest `category` labels to taxonomy_v1 canonical names. Apply to `Item.category` and `Product.category` fields.

V1 coverage estimate: V1 categories are department-style labels ("Home & Decor", "Toys, Games & Arts") that should map well to taxonomy_v1. Expect 70-90% coverage.

V2 coverage estimate: V2 categories are mixed marketplace-style strings ("TOYS", "KITCHEN_AND_DINING"). Some will map directly, others need normalization. Expect 50-70% coverage.

**Step 2: Export gaps.**

Export all items where `category` is still empty or not in `TAXONOMY_V1_CATEGORY_NAMES` as a CSV: `workspace/data/backfill_uncategorized.csv` with columns: item SKU, title, brand, original category label, source (v1/v2).

**Step 3: AI categorization.**

Bill takes the CSV to Cursor. Scout or Christina reads the CSV and uses AI to assign taxonomy_v1 categories to each row, writing results back to a column in the CSV. Bill brings the completed CSV back. A management command reads the CSV and updates `Item.category` and `Product.category`.

Alternative: If the gap is small enough, use the existing `map_fast_cat_batch` API or a simple Python script with Claude API calls.

**Step 4: Update PricingRule.**

After all items have categories, recompute sell-through rates from actual data:
`sum(sold_for) / sum(price)` per taxonomy_v1 category for all sold backfilled items.

Update `PricingRule` rows with data-backed rates. This replaces the manually seeded flat rates.

**Acceptance:**
- `Item.objects.filter(notes__startswith='BACKFILL:', category='').count()` = 0 (no uncategorized backfilled items)
- Every category value is in `TAXONOMY_V1_CATEGORY_NAMES`
- PricingRule rows updated with sample_size > 0 for categories with historical sales

---

### Phase 6: Verify and recompute — planned

**Goal:** Confirm all dashboards and calculations show real historical data.

**Step 1: Recompute.**
- `python manage.py recompute_buying_valuations` (recalculates auction valuations with new pricing rules)
- `python manage.py seed_pricing_rules --input workspace/data/sell_through_by_category_computed.csv` (if Phase 5 produced a new rates CSV)

**Step 2: Verify dashboards.**

Test worksheet for Bill:

1. Open `http://localhost:5173/buying/auctions` - Category need panel should show non-zero shelf/sold counts and percentages across multiple categories.
2. Check any auction detail page - Valuation card should show estimated revenue based on real sell-through rates.
3. Open Django admin (`/db-admin/`) - `inventory.PurchaseOrder` should show 313+ POs. `inventory.Item` should show 184K+ items. `pos.Cart` should show 69K+ carts.
4. API check: `curl http://localhost:8000/api/buying/category-need/` - Should return 19 categories with non-zero `shelf_count`, `sold_count`, `sell_through_pct`.

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
- All counts match expected totals (within 5% tolerance for join failures)
- Category need API returns non-zero data
- No orphan FKs (run a quick FK integrity check)
- `manage.py check` passes
- `tsc --noEmit` passes (no frontend changes in this initiative)

---

## Sessions

_Session ID:_ count all session rows in `## Sessions` (collapsed one-liners and `### Session` headers) and add 1 for the next session. Keep full detail for the **3** most recent sessions; when starting session 4, collapse session 1 to one line.

### Session 1 — Phase 0: recon, historical import cleanup, Misfit vendor/POs — est 6h — started 2026-04-10T14:00:00-05:00

**Goal:** Recon `ecothrift.inventory_item` and related tables; remove `HISTORICAL:db1:` / `HISTORICAL:db2:` import rows; verify clean state; add Misfit vendor + two placeholder POs; pickle SKU collision check.

**Finish line:** Verified clean DB with real V3 data preserved; Misfit vendor + `MISFIT-V1-2024` / `MISFIT-V2-2025` POs; recon report + SKU analysis documented.

**Scope:** Django ORM/SQL against default DB; management command for Misfit setup; no Phase 1+ backfill load; no migrations.

#### Session updates

- 2026-04-10T14:00:00-05:00 Session started — implementation per Phase 0 execution plan.
- 2026-04-10T18:30:00-05:00 Recon: 155,869 items total; 146,860 `HISTORICAL:db1:`/`db2:`; 9,009 retained; CartLine→historical **0**; `pos_cart`/`pos_cartline` 101/232 unchanged; `inventory_manifestrow` 0; `TempLegacyItem` 59,833; non-historical notes dominated by `RETAGGED_FROM_DB2:`.
- 2026-04-10T18:35:00-05:00 Deleted `HISTORICAL:*` items via `Item.objects.filter(HISTORICAL_Q).delete()` in one transaction (no PK list); remaining items **9,009**. `manage.py check` OK.
- 2026-04-10T18:40:00-05:00 SKU spot-check (DB): all remaining SKUs match `^ITM\d+$`; max numeric suffix **155886** (ensure `generate_sku()` / sequences stay above this in Phase 3). Pickle `items.pkl` load failed on this environment (pandas `NotImplementedError` on array state) — re-run SKU pattern check in notebook env when loading pickles for Phase 1.
- 2026-04-10T18:45:00-05:00 Ran `python manage.py setup_misfit_backfill_pos` — vendor **MIS** + POs **MISFIT-V1-2024** / **MISFIT-V2-2025** created.
- Session close (consultant): `phase0_close_and_corrections.md` — initiative corrections (Phase 1–5 text), production deployment strategy, `convert_pickles_to_csv.py`; Session 1 result finalized for Phase 0; `commit_message.txt` append.

#### Result

Completed — committed (no semver bump) with docs restructure / Phase 0 bundle: Phase 0 DB cleanup + [`setup_misfit_backfill_pos`](../../apps/inventory/management/commands/setup_misfit_backfill_pos.py); initiative corrections + CSV path + production strategy; see **`CHANGELOG`** `[Unreleased]` and `scripts/deploy/commit_message.txt`.

---

### Session 2 — Phase 1: vendors and POs backfill (`backfill_phase1_vendors_pos`) — est 4h — started 2026-04-10T21:00:00-05:00

**Goal:** Load all historical vendors and POs from `ecothrift_v1` / `ecothrift_v2` into V3 via raw `psycopg2` + idempotent `get_or_create`; inline PO description enrichment; document model vs initiative reconciliation.

**Finish line:** `Vendor` / `PurchaseOrder` counts match acceptance (315 POs incl. Misfit); no duplicate `order_number`; `manage.py check` OK; Session notes + `[Unreleased]` CHANGELOG.

**Scope:** New management command only; no migrations; no pickle pipeline; Misfit POs untouched.

#### Session updates

- 2026-04-10T21:00:00-05:00 Session started — implement [`backfill_phase1_vendors_pos`](../../apps/inventory/management/commands/backfill_phase1_vendors_pos.py).
- 2026-04-10T21:30:00-05:00 **Model vs initiative reconciliation:** `PurchaseOrder.total_cost` computed in model `save()` from `purchase_cost` + `shipping_cost` + `fees` — not set manually. V1 `purchase_order` has no `shipped_date` source (left null). V2 observed statuses only: `confirmed`, `items_generated`, `received`. V1 condition names mapped: Fair/Good/Like New/New/Repairable/Very Good → V3 choices (Very Good → `good`). V2 condition values already mostly V3-shaped; `very_good` → `good`. `notes` layout: line 1 `BACKFILL:v1|v2:id`; optional plain-text legacy V2 `notes` on following lines; optional single-line JSON object on **last line** for enrichment.
- 2026-04-10T21:35:00-05:00 Ran `python manage.py backfill_phase1_vendors_pos` — V1 POs 210 created, V2 POs 103 created; enrichment JSON appended to 271 PO(s) with parseable descriptions; re-run idempotent (0 created). Verified: `Vendor.objects.count()` = 11, `PurchaseOrder.objects.count()` = 315, duplicate `order_number` query empty; `manage.py check` OK.

#### Result

Completed — Phase 1 loader shipped: [`backfill_phase1_vendors_pos`](../../apps/inventory/management/commands/backfill_phase1_vendors_pos.py); initiative Phase 1 marked done; source-of-truth bullets updated for legacy-DB Phase 1; see **`CHANGELOG`** `[Unreleased]`.

---

### Session 3 — Phase 2: products and manifest rows (`backfill_phase2_products_manifests`) — est 6h — started 2026-04-11T12:00:00-05:00

**Goal:** Load V1/V2 products and manifest lines via raw `psycopg2`; `Product.save()` per row for `PRD-*`; `ManifestRow` `bulk_create`; PO FK maps; idempotency via backfill tags; recon + dedup decision documented.

**Finish line:** ~180K products, ~144K manifest rows in V3 with `BACKFILL:` tags; acceptance queries pass; `manage.py check` OK; Session notes + `[Unreleased]` CHANGELOG.

**Scope:** New management command only; no migrations; no pickles.

#### Session updates

- 2026-04-11T12:00:00-05:00 Session started — recon legacy schemas; implement [`backfill_phase2_products_manifests`](../../apps/inventory/management/commands/backfill_phase2_products_manifests.py).
- 2026-04-11T13:00:00-05:00 **Recon:** V1 tables `product`, `product_attrs`, `manifest`; V2 `inventory_product` (no UPC column), `inventory_manifest_rows`. `product_attrs` ~153K rows / ~79.4K distinct `product_cde` — pick one row per code via `LATERAL` subquery. Dedup sample (100+100 title/brand/upc): **0** overlap — no cross-system dedup. Runtime ~2 min products + manifests on dev machine.
- 2026-04-11T14:00:00-05:00 **Model notes:** `Product`/`ManifestRow` have no `subcategory` field — `category` = `"Category / Subcategory"` (truncated); `specifications` holds `legacy_category` / `legacy_subcategory`. V1 `manifest` uses `retail_amt` then `ext_retail_amt`; `line_number` null → fallback to manifest `id` for `row_number`. Ran full backfill + idempotent re-run; spot-check 3 POs; `generate_product_number()` → `PRD-120920`.
- 2026-04-11T15:30:00-05:00 **`session_close.md`** — Phase 2 session wrapped; **`consultant_context`** + **`context`** pointers refreshed; **`commit_message.txt`** appended for pending commit; no semver bump (unreleased backfill work). Next session: **Phase 3** (items) per [`startup.md`](../../protocols/startup.md).

#### Result

**Session closed** — Phase 2 complete; **`CHANGELOG`** `[Unreleased]` includes Phase 2; acceptance checklist updated. **Commit:** not run (per protocol — commit when Bill is ready); see [`scripts/deploy/commit_message.txt`](../../scripts/deploy/commit_message.txt) for suggested subject and Session 3 summary.

---

### Session 4 — Phase 3: items (`backfill_phase3_items`) — est 8h — started 2026-04-11T16:00:00-05:00

**Goal:** Load V1/V2 historical `Item` rows via `psycopg2`; lookup maps from Phases 1–2; `sold`/`scrapped` only; Misfit PO fallbacks; `bulk_create` with precomputed `search_text`; idempotency on `BACKFILL:v1:{code}` / `BACKFILL:v2:{id}` notes.

**Finish line:** ~184K items in V3; acceptance queries; `manage.py check`; Session notes + **`CHANGELOG`** `[Unreleased]`.

**Scope:** Management command only; no cart data; **`sold_for`** from legacy sold tables only when present (Phase 4 fills from cart lines).

#### Session updates

- 2026-04-11T16:00:00-05:00 Session started — legacy recon: V1 `item` (123,941), `item_status`/`list_status` (latest row per item; sold = status_id **16** or **23**), `item_condition`+`list_condition`; **no `sold_items` table** in this archive. V2 `inventory_item` (59,833), `sold_at`/`sold_for` on row; `inventory_item_history` for latest condition. V2 **3** SKUs match `^ITM[0-9]+$` — prefix `V2-`. **Model:** `Item.save()` sets `search_text` only; `sold_for` field exists; `generate_sku()` last-by-id fragile after mixed SKUs — verify max `ITM` after load.
- 2026-04-11T18:00:00-05:00 **Checkpoint —** Implemented [`backfill_phase3_items`](../../apps/inventory/management/commands/backfill_phase3_items.py): maps from Phase 1–2 `Product`/`PurchaseOrder`, `bulk_create` batch 2000, `--dry-run`/`--limit`/`--skip-v1`/`--skip-v2`; cost from `purchase_cost/item_count`; `generate_sku` safety: pre-load max `ITM` suffix on current DB **155886** (9,009 `ITM\\d+` rows) — after full backfill, re-run max-suffix query; consider follow-up to scan max `^ITM\\d+$` instead of last-by-id.
- 2026-04-11T19:30:00-05:00 **Fix —** V1 `SELECT` used `LEFT JOIN product` on `code`; legacy `product` has **multiple rows per code** (~35K codes), multiplying result rows (~272K vs 124K `item` rows) and inflating `skipped_exists`. Replaced with **`LEFT JOIN LATERAL (SELECT … ORDER BY id LIMIT 1)`** so one row per item. **Dry-run** had incremented `*_created` without writing — split **`would_create`** vs **`created`**; **`bulk_create`** wrapped in try/except re-raise. See **`CHANGELOG`** `[Unreleased]` Fixed.
- 2026-04-11T20:00:00-05:00 **`session_close.md`** — Session 4 wrapped; **`_index`**, **`consultant_context`**, **`context`** Working pointer; **`commit_message.txt`** appended; no semver bump. **Next:** Phase 4 (carts, cart lines, update sold items with sale data) per initiative Phase 4 section.

#### Result

**Session closed** — Phase 3 complete (loader + fixes); **`CHANGELOG`** `[Unreleased]`; acceptance checklist Phase 3 remains **[x]**; **commit** when Bill is ready — see [`scripts/deploy/commit_message.txt`](../../scripts/deploy/commit_message.txt).

---

## Acceptance (initiative level)

- [x] **Phase 0 complete:** Half-baked import removed; real V3 data preserved; clean state verified.
- [x] **Phase 1 complete:** Vendors and 313 backfilled POs (+ 2 Misfit) loaded; [`backfill_phase1_vendors_pos`](../../apps/inventory/management/commands/backfill_phase1_vendors_pos.py); legacy DB reads.
- [x] **Phase 2 complete:** Products and manifest rows loaded with PO linkage; [`backfill_phase2_products_manifests`](../../apps/inventory/management/commands/backfill_phase2_products_manifests.py).
- [x] **Phase 3 complete:** Loader [`backfill_phase3_items`](../../apps/inventory/management/commands/backfill_phase3_items.py) shipped; run on legacy DBs to populate ~184K items (idempotent).
- [ ] **Phase 4 complete:** ~69K carts and ~217K cart lines loaded; sold items updated.
- [ ] **Phase 5 complete:** All backfilled items have taxonomy_v1 categories; PricingRule updated.
- [ ] **Phase 6 complete:** Dashboards show real data; integrity checks pass.

---

## Open questions

- **Pickle loading in Cursor:** Pickles converted to CSV via `workspace/scripts/convert_pickles_to_csv.py`. **Phase 1** uses live legacy DB reads instead. Phases 2+ may use CSV/pickle or DB as implemented.
- **(Phase 0)** Real V3 vs old import: half-baked rows were `notes` starting with `HISTORICAL:db1:` or `HISTORICAL:db2:`. Everything else (e.g. `RETAGGED_FROM_DB2:…`, normal notes) was treated as operational and kept.
- Should backfilled "sold" items that cannot be linked to a cart line get `status = 'scrapped'` instead of `'sold'`? (Proposed: yes, unless they have a `sold_at` timestamp in the source data.)
- How to handle V1 items with no PO linkage (~10% of items): leave `purchase_order` null, or create a catch-all "Unknown V1 PO" record?
- Register/drawer strategy for V1 backfilled carts (see Phase 4 design decision).

---

## Parking lot

- Historical sell-through initiative (pending) may be superseded by Phase 5 of this initiative. Evaluate after Phase 5 ships.
- V1 `item_dispatch` / `item_destination` tables contain location/department history. Not in scope for this backfill but could feed future store analytics.
- V2 `preprocessing_details.pkl` and `processing_details.pkl` contain per-item pipeline metadata. Not loaded in this backfill. Retain pickles for future use.

---

## See also

- `workspace/scripts/convert_pickles_to_csv.py` (pickle → CSV for Phase 1+ loads)
- `workspace/notebooks/historical-data/csv/` (CSV mirror of pickles, after conversion)
- `workspace/notebooks/historical-data/pickle/manifest.json` (pickle inventory with column names)
- `workspace/notebooks/historical-data/export_all.ipynb` (how pickles were created)
- `.ai/extended/databases.md` (connection reference)
- `.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md` (taxonomy_v1 and mapping infrastructure)
- `.ai/initiatives/_archived/_pending/historical_data_export.md` (Phase 1 of pickle extraction)
- `.ai/initiatives/_archived/_completed/retag_cutover.md` (retag workflow that created real V3 items)
- `apps/buying/taxonomy_v1.py` (19 canonical category names)
- `workspace/notebooks/category-research/cr/taxonomy_estimate.py` (rule-based label mapping)
