<!-- Last updated: 2026-02-14T15:34:57-06:00 -->
# Prototype: Item Processing — Ledger-First Inventory Model

| Field       | Value                          |
|-------------|--------------------------------|
| Description | Alternative inventory model centered on stock lots + deferred unit creation |
| Purpose     | Provide a second, materially different design from `item-processing.md` that keeps POS simple while reducing item-row explosion |
| Status      | draft                          |
| Created     | 2026-02-14                     |
| Based On    | `.ai/prototype/item-processing.md` |

**Status values:** draft | active | accepted | rejected | archived

---

## Context / Problem Statement

Current v1.2.0 behavior creates one `Item` row per manifest quantity during `/create-items/`. That works for unique goods, but it is expensive for high-quantity commodity rows and pushes processing labor early in the workflow.

The first prototype explores three options:
- All-units individual (`Version A`)
- Dual inventory entities (`Version B` with `BulkLot`)
- All-units individual with batch tooling (`Version C`)

This second prototype proposes a different baseline:

1. **Inventory is represented as quantity ledger lots first.**
2. **Item-level rows are materialized only when needed** (tagging, shelfing, or serial/condition exceptions).
3. **POS remains single-path** by scanning item-level `ITM` barcodes only.

This gives a separate design family to compare against the first prototype.

---

## Version A: Pure Deferred Unitization

### Approach

Treat intake as lot inventory first, item inventory second:
- Parse manifest rows into normalized intake lines.
- Convert lines into `StockLot` records with quantity and valuation.
- Create `Item` rows only when staff decides to print tags for shelf placement.

No dual barcode types. No `BLK` scan path at POS.

### Design

#### Core Model Structure

```python
class StockLot(models.Model):
    """
    Quantity-based inventory unit created from intake.
    One lot can represent many physical units with shared characteristics.
    """
    lot_number = models.CharField(max_length=20, unique=True)  # LOT-000123
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='stock_lots')
    manifest_row = models.ForeignKey(ManifestRow, null=True, blank=True, on_delete=models.SET_NULL)
    product = models.ForeignKey(Product, null=True, blank=True, on_delete=models.SET_NULL)

    # Snapshot fields for resilience if Product data changes later
    title_snapshot = models.CharField(max_length=300)
    brand_snapshot = models.CharField(max_length=200, blank=True, default='')
    category_snapshot = models.CharField(max_length=200, blank=True, default='')

    condition = models.CharField(max_length=20, default='unknown')
    source = models.CharField(max_length=20, default='purchased')

    qty_received = models.PositiveIntegerField(default=0)
    qty_available = models.PositiveIntegerField(default=0)
    qty_unitized = models.PositiveIntegerField(default=0)  # turned into Item rows
    qty_sold = models.PositiveIntegerField(default=0)
    qty_adjusted = models.IntegerField(default=0)          # shrinkage/damage corrections

    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    suggested_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=[
            ('intake', 'Intake'),
            ('qc', 'Quality Check'),
            ('ready_to_tag', 'Ready To Tag'),
            ('active', 'Active'),
            ('depleted', 'Depleted'),
            ('closed', 'Closed'),
        ],
        default='intake',
    )
    location = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class LotLedgerEvent(models.Model):
    """
    Immutable audit log for quantity/cost movement on StockLot.
    """
    lot = models.ForeignKey(StockLot, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=30)  # received, unitized, sold, returned, adjusted, scrapped
    delta_qty = models.IntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reference_type = models.CharField(max_length=30, blank=True, default='')  # order, item, receipt, return
    reference_id = models.CharField(max_length=50, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)


class Item(models.Model):
    """
    Existing item model remains POS-facing. It now links back to StockLot.
    """
    sku = models.CharField(max_length=20, unique=True)  # ITM0001234
    stock_lot = models.ForeignKey(StockLot, null=True, blank=True, on_delete=models.SET_NULL, related_name='items')
    # existing fields remain (product, purchase_order, title, brand, category, price, cost, status, ...)
```

#### Flow

```text
upload-manifest
  -> process-manifest (ManifestRows)
    -> match-products
      -> create-lots (StockLots + ledger 'received')
        -> lot processing (price/condition/location at lot level)
          -> unitize N units (create N Items + ledger 'unitized')
            -> print ITM tags
              -> POS sale (existing item scan path)
```

#### API Surface (new and compatible)

Keep existing endpoints for compatibility, add lot endpoints:

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/orders/{id}/upload-manifest/` | POST | Existing |
| `/orders/{id}/process-manifest/` | POST | Existing |
| `/orders/{id}/match-products/` | POST | Existing from prototype 1 |
| `/orders/{id}/create-lots/` | POST | New: build `StockLot` records |
| `/lots/` | GET | New: list/filter by PO, status, category |
| `/lots/{id}/process/` | POST | New: apply lot-level price/condition/location |
| `/lots/{id}/unitize/` | POST | New: create N `Item` rows + tags |
| `/items/{id}/ready/` | POST | Existing: unchanged |
| `/inventory/items/lookup/{sku}/` | GET | Existing public lookup unchanged |

#### Example: 61 Heated Vests

- Intake creates **1 `StockLot`** (`qty_received=61`).
- Staff unitizes 24 for immediate floor placement.
- System creates 24 `Item` rows + 24 tags.
- Remaining 37 stay in lot reserve without item rows.
- Later unitize the next tranche as shelf replenishment.

### Pros

- Massive row reduction for bulk intake while preserving ITM-only POS.
- Better operational fit: defer detailed work until units are actually merchandised.
- Strong auditability through immutable quantity ledger events.
- Cleaner cost accounting (`unit_cost` and quantity movement at lot level).

### Cons

- Requires new mental model: "lot quantity" and "item units" coexist.
- Some reports must aggregate across lots and item rows.
- Returns policy must define whether returned units re-enter lot reserve or stay as item-only stock.

### Open Questions

- Should lots be allowed on shelf without full unitization?
- Is partial unitization defaulted by category (e.g., apparel vs furniture)?
- Which events should lock/edit lot pricing after first unit sale?

---

## Version B: Hybrid Policy-Driven Unitization (Recommended)

### Approach

Same ledger-first model as Version A, but add explicit policy rules that decide when to auto-create item rows at intake:

- **Auto-unitize immediately** for unique/high-value/serial-tracked items.
- **Defer unitization** for commodity bulk lines.
- Keep the ability to override per lot from UI.

This keeps workflow speed for bulk while preserving immediate per-item traceability where it matters.

### Design

#### Additional Policy Model

```python
class UnitizationPolicy(models.Model):
    """
    Rules that decide lot vs immediate item materialization.
    """
    name = models.CharField(max_length=120, unique=True)
    category = models.CharField(max_length=200, blank=True, default='')
    min_unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    max_quantity_for_auto_item = models.PositiveIntegerField(default=5)
    require_serial_capture = models.BooleanField(default=False)
    default_mode = models.CharField(
        max_length=20,
        choices=[('defer', 'Defer Unitization'), ('immediate', 'Immediate Itemization')],
        default='defer',
    )
    is_active = models.BooleanField(default=True)
```

#### Policy Evaluation (on `create-lots`)

```python
def decide_unitization_mode(row, matched_product, policy):
    if policy.require_serial_capture:
        return 'immediate'
    if row.quantity <= policy.max_quantity_for_auto_item:
        return 'immediate'
    if row.retail_value and policy.min_unit_price and row.retail_value >= policy.min_unit_price:
        return 'immediate'
    return policy.default_mode
```

#### Operational Behavior

- If decision is `immediate`, the system creates `Item` rows now (same ITM behavior as current app).
- If decision is `defer`, only `StockLot` quantity is created; items appear later via `/unitize/`.
- Processing UI shows two queues:
  - **Immediate Items Queue** (existing item-level workflow)
  - **Deferred Lots Queue** (lot processing + unitize actions)

#### Compatibility Layer

To avoid frontend breakage during migration:
- Existing `/create-items/` can call policy logic internally.
- Response payload returns:
  - `items_created_now`
  - `lots_created`
  - `lots_pending_unitization`

### Pros

- Best balance of performance and traceability.
- Preserves simple POS (`ITM` only), unlike dual-code bulk models.
- Reduces workload spikes: staff process bulk as batches, unique goods individually.
- Easy rollout path: keep current endpoints and incrementally add lot UI.

### Cons

- Policy tuning required (thresholds by category and seasonality).
- More moving parts than pure item-only models.
- Requires staff training on when to unitize deferred lots.

### Open Questions

- Should policy be evaluated at row level or after product matching confidence is known?
- Should managers be allowed to override policy after lot creation?
- Do we need a nightly auto-unitize job for low reserve quantities?

---

## Comparison

| Criteria | Version A: Pure Deferred Unitization | Version B: Hybrid Policy-Driven Unitization |
|----------|--------------------------------------|---------------------------------------------|
| Complexity | Medium | Medium-High |
| Performance | Highest for bulk orders | Very high, slightly lower than A |
| Traceability on day 1 | Lower for deferred units | High for unique/high-value units |
| POS Simplicity | High (ITM only) | High (ITM only) |
| Staff Workflow Fit | Good | Best (split by policy, with override) |
| Migration Risk | Medium | Medium (but smoother if `/create-items/` stays) |
| Reporting Clarity | Good with ledger discipline | Good with policy metadata |

---

## Outcome

**Decision:** `Version B — Hybrid Policy-Driven Unitization`

**Rationale:**
- It is the most practical middle path for Eco-Thrift's mixed inventory profile.
- It keeps checkout simple and compatible with existing item barcode behavior.
- It avoids creating thousands of unnecessary item rows for commodity intake.
- It still gives immediate per-unit records for categories that need strict traceability.

**Next Steps:**
- Define initial `UnitizationPolicy` rules for top 10 categories.
- Add `StockLot` + `LotLedgerEvent` models and migrations.
- Implement compatibility mode in `/create-items/` so frontend can migrate gradually.
- Add new lot endpoints and a Processing UI tab for deferred lots.
- Pilot on one vendor feed (Costco) and compare labor time + data quality vs current flow.
