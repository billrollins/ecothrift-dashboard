<!-- Last updated: 2026-02-14T00:15:00-06:00 -->
# Prototype: Item Processing — Product & Item Model Design

| Field       | Value                          |
|-------------|--------------------------------|
| Description | Redesign Product/Item models for manifest-driven inventory processing |
| Purpose     | Handle product recognition, bulk vs individual items, specs/attributes, SKU semantics, and item lifecycle tracking across diverse vendor manifest formats |
| Status      | draft                          |
| Created     | 2026-02-13                     |
| Based On    | _(none — greenfield design extending current v1.2.0 models)_ |

**Status values:** draft | active | accepted | rejected | archived

---

## Context / Problem Statement

Eco-Thrift receives inventory from multiple vendors (Costco, Target, Walmart, Home Depot, etc.) via purchase orders with CSV manifests. Each vendor uses different column layouts, identifiers, and levels of detail.

**Current state:** Product is a bare-bones catalog entry (`title`, `brand`, `model`, `category`, `description`, `default_price`). Item is the physical unit with a generated SKU (`ITM0001234`). There is no mechanism to match incoming manifest rows to existing products, no bulk handling, no structured specs, and no item history beyond scan tracking.

### Key Challenges Identified from Manifest Analysis

**1. Product Recognition — "Have I seen this before?"**
Each vendor uses different identifiers:
- **Costco**: `Item #` (e.g., `1819433`) — vendor's internal product number, no UPC
- **Target**: `Item #` (e.g., `LPJD863051`) is a lot-specific ID, but `TCIN` (e.g., `92318499`) and `UPC` are consistent product identifiers
- **Walmart**: `Walmart Item ID` + `UPC` + `SLP` (per-unit tracking number)
- **Home Depot**: _(large file, assumed similar vendor-specific IDs)_

The same product can appear across multiple orders and even within the same manifest on different pallets/lots. We need a cross-vendor product matching strategy.

**2. Quantity Ranges — "Do I track each one individually?"**
From the Costco manifest alone:
- 61× Heated Vest 32 Degree ($49.99 each)
- 28× Allegra Allergy 180mg ($38.49 each)
- 20× Artika Sonolok Acoustic Panels ($49.99 each)
- 20× 27G Storage Tote ($8.99 each)
- 1× Barrington Poker Table ($229.99)
- 1× Singer Heavy Duty Sewing Machine ($199.99)

Creating 61 individual Item records for identical heated vests and processing each one with condition assessment is wasteful. But the poker table absolutely needs individual attention.

**3. Specs & Attributes — "What details matter?"**
Target manifests have rich descriptions: _"GE Appliances Opal Nugget Ice Maker - Hearth & Hand with Magnolia: Stainless Steel, Countertop, 34 lbs Daily Production"_. Costco has minimal: _"KOHLER PROVO SINK KIT SS"_.

Relevant specs vary by category:
- Faucets: finish, mounting type
- Electronics: capacity, wattage
- Clothing/sports: size, color
- Furniture: dimensions, material
- Consumables: quantity per pack, strength/dosage

Tracking every possible spec is infeasible. The question is how structured vs freeform to make it.

**4. SKU Semantics — "What number goes where?"**
Current: `SKU = ITM0001234` (per individual item). This goes on the price tag and is scanned at POS.
Questions:
- Should Products also have an identifier? (for catalog reference, reordering)
- Is "SKU" the item-level barcode or the product-level catalog code?
- How do vendor identifiers map to our internal numbering?

**5. Item Lifecycle — "What happens to an item over time?"**
Beyond status changes (intake → processing → on_shelf → sold), items can:
- Get lost in the store
- Be found again
- Have condition downgrades (discovered damage)
- Get repriced
- Move locations
- Get returned after sale
- Be bundled with other items

---

## Version A: "Flat & Simple"

### Approach

Keep the Product model lightweight. Every physical unit gets an individual Item record regardless of quantity. No separate bulk handling. Use freeform text and a JSON field for specs. Focus on simplicity and uniform processing.

### Design

#### Models

```python
# ── Product (catalog entry, for matching/reordering) ──────────────────
class Product(models.Model):
    product_number = models.CharField(max_length=20, unique=True)  # PRD-XXXXX auto-gen
    title = models.CharField(max_length=300)
    brand = models.CharField(max_length=200, blank=True, default='')
    model_name = models.CharField(max_length=200, blank=True, default='')
    category = models.CharField(max_length=200, blank=True, default='')
    subcategory = models.CharField(max_length=200, blank=True, default='')
    description = models.TextField(blank=True, default='')
    default_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    avg_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    upc = models.CharField(max_length=100, blank=True, default='')  # Universal match key
    tags = models.JSONField(default=dict, blank=True)  # Ad-hoc: {"color": "black", "size": "L"}
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# ── VendorProductRef (cross-reference for matching) ───────────────────
class VendorProductRef(models.Model):
    """Maps a vendor's identifier to our Product. Enables auto-matching on future manifests."""
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='product_refs')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='vendor_refs')
    vendor_item_number = models.CharField(max_length=100)  # e.g., Costco Item#, Target TCIN
    vendor_description = models.CharField(max_length=500, blank=True, default='')
    last_seen_date = models.DateField(auto_now=True)

    class Meta:
        unique_together = ['vendor', 'vendor_item_number']


# ── Item (every physical unit) ────────────────────────────────────────
class Item(models.Model):
    SOURCE_CHOICES = [('purchased','Purchased'), ('consignment','Consignment'), ('house','House')]
    STATUS_CHOICES = [
        ('intake','Intake'), ('processing','Processing'), ('on_shelf','On Shelf'),
        ('sold','Sold'), ('returned','Returned'), ('scrapped','Scrapped'), ('lost','Lost'),
    ]
    CONDITION_CHOICES = [
        ('new','New'), ('like_new','Like New'), ('good','Good'),
        ('fair','Fair'), ('salvage','Salvage'), ('unknown','Unknown'),
    ]

    sku = models.CharField(max_length=20, unique=True)  # ITM0001234 — goes on price tag
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.SET_NULL, null=True, blank=True)
    manifest_row = models.ForeignKey(ManifestRow, on_delete=models.SET_NULL, null=True, blank=True)

    title = models.CharField(max_length=300)
    brand = models.CharField(max_length=200, blank=True, default='')
    category = models.CharField(max_length=200, blank=True, default='')
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, default='unknown')

    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='purchased')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='intake')
    location = models.CharField(max_length=100, blank=True, default='')

    tags = models.JSONField(default=dict, blank=True)  # {"color": "red", "size": "M"}

    listed_at = models.DateTimeField(null=True, blank=True)
    sold_at = models.DateTimeField(null=True, blank=True)
    sold_for = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# ── ItemHistory (event log) ───────────────────────────────────────────
class ItemHistory(models.Model):
    EVENT_TYPES = [
        ('created', 'Created'),
        ('status_change', 'Status Change'),
        ('condition_change', 'Condition Change'),
        ('price_change', 'Price Change'),
        ('location_change', 'Location Change'),
        ('note_added', 'Note Added'),
        ('returned', 'Returned'),
    ]

    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='history')
    event_type = models.CharField(max_length=30, choices=EVENT_TYPES)
    old_value = models.CharField(max_length=200, blank=True, default='')
    new_value = models.CharField(max_length=200, blank=True, default='')
    note = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
```

#### SKU / Number System

| Number | Format | Purpose | Where Used |
|--------|--------|---------|------------|
| Product Number | `PRD-XXXXX` | Catalog reference | Product list, reorder reports |
| Item SKU | `ITM-XXXXXXX` | Physical item ID | Price tag, POS scan, public lookup |
| Vendor Item # | Varies | Cross-reference | VendorProductRef, manifest matching |
| UPC | Standard barcode | Universal product ID | Product matching, optional label |

#### Product Matching Flow

```
ManifestRow arrives →
  1. If UPC present → search Product.upc
  2. Else → search VendorProductRef(vendor, vendor_item_number)
  3. Else → search Product by title+brand fuzzy match
  4. If no match → create new Product + VendorProductRef
  5. If match → link to existing Product, update VendorProductRef.last_seen_date
```

#### Item Creation Flow

```
For each ManifestRow with matched/new Product:
  For i in range(row.quantity):
    Create Item(
      sku=generate_sku(),
      product=matched_product,
      title=product.title,
      brand=product.brand,
      cost=row.retail_value / row.quantity,  # per-unit vendor cost
      condition=row.condition or 'unknown',
      status='intake',
    )
```

For 61 heated vests → 61 Item records created, all identical except SKU.

#### End-to-End Processing Workflow

The current system has three backend steps: `upload-manifest` → `process-manifest` → `create-items`. This prototype extends that pipeline with product matching and a linear item processing queue. No tier decisions — every row becomes individual Items.

##### Phase 1: Manifest Upload (existing — no change)

Staff uploads the vendor CSV on the Order Detail page. File is saved to S3, preview is persisted. Order can be at status `delivered` or later.

**Endpoint:** `POST /inventory/orders/{id}/upload-manifest/`
**UI:** Same as v1.2.0 — file picker, preview table, download link.

##### Phase 2: Column Mapping & Row Normalization (existing — minor update)

Staff selects or confirms the CSVTemplate. The frontend maps vendor columns to standard fields and sends normalized rows.

**Endpoint:** `POST /inventory/orders/{id}/process-manifest/`
**Result:** ManifestRows created. Order status → `processing`.

**Change from v1.2.0:** ManifestRow now also captures `vendor_item_number` and `upc` (extracted from vendor-specific columns via the template mapping). These are needed for product matching in the next phase.

##### Phase 3: Product Matching (NEW)

After ManifestRows are created, staff clicks **"Match Products"** on the Order Detail page. The backend attempts to auto-match each row to an existing Product.

**Endpoint:** `POST /inventory/orders/{id}/match-products/`

**Backend logic per ManifestRow:**

```
for row in manifest_rows:
    product = None

    # Strategy 1: UPC lookup (strongest signal)
    if row.upc:
        product = Product.objects.filter(upc=row.upc).first()

    # Strategy 2: Vendor cross-reference
    if not product and row.vendor_item_number:
        ref = VendorProductRef.objects.filter(
            vendor=order.vendor,
            vendor_item_number=row.vendor_item_number,
        ).select_related('product').first()
        if ref:
            product = ref.product

    # Strategy 3: Title+Brand approximate match (optional, can be skipped)
    if not product:
        product = Product.objects.filter(
            title__icontains=row.description[:50],
            brand__icontains=row.brand,
        ).first()

    if product:
        row.matched_product = product
        row.match_status = 'matched'
        # Ensure VendorProductRef exists for future matching
        VendorProductRef.objects.get_or_create(
            vendor=order.vendor,
            vendor_item_number=row.vendor_item_number or row.upc,
            defaults={'product': product, 'vendor_description': row.description},
        )
    else:
        row.match_status = 'new'

    row.save()
```

**Response:** Summary of matches:

```json
{
  "total_rows": 470,
  "matched": 127,
  "new_products": 343,
  "requires_review": 0
}
```

**UI: Match Review Screen**

After matching, the Order Detail page shows a **Product Matching Panel**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  PRODUCT MATCHING — PO-C5TC0 (Costco)                              │
│                                                                     │
│  ✓ 127 rows matched to existing products                           │
│  ● 343 rows → new products will be created                         │
│                                                                     │
│  ┌─ Row 1 ─────────────────────────────────────────────────────┐   │
│  │ BODY GLOVE PERFORMER (Qty: 4, $339.99)                      │   │
│  │ Match: ● NEW PRODUCT                                        │   │
│  │ [Create Product] [Search Catalog...] [Skip]                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ Row 3 ─────────────────────────────────────────────────────┐   │
│  │ KOHLER PROVO SINK KIT SS (Qty: 3, $399.99)                  │   │
│  │ Match: ✓ PRD-00042 — Kohler Provo Sink Kit                  │   │
│  │ [Confirm] [Change Match...] [Create New Instead]            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ... (scrollable list, filterable by match status) ...             │
│                                                                     │
│  [Auto-Create All New Products]  [Confirm All Matches]  [Next →]  │
└─────────────────────────────────────────────────────────────────────┘
```

Staff can review, override matches, or click **"Auto-Create All New Products"** to batch-create Product records for all unmatched rows. Each new Product gets a `PRD-XXXXX` number, and a VendorProductRef is created linking the vendor's item number to it.

##### Phase 4: Item Creation (UPDATED)

Once all rows have a matched or newly-created Product, staff clicks **"Create Items"**.

**Endpoint:** `POST /inventory/orders/{id}/create-items/`

**Backend logic:**

```
batch = ProcessingBatch.objects.create(...)
items_created = 0

for row in manifest_rows:
    product = row.matched_product  # Set in Phase 3

    for i in range(row.quantity):
        item = Item.objects.create(
            sku=Item.generate_sku(),
            product=product,
            purchase_order=order,
            manifest_row=row,
            title=product.title,
            brand=product.brand,
            category=product.category,
            cost=row.retail_value,   # Unit retail from manifest = our cost basis
            condition=row.condition or 'unknown',
            source='purchased',
            status='intake',
        )
        ItemHistory.objects.create(
            item=item,
            event_type='created',
            new_value='intake',
            note=f'Created from PO {order.order_number}, row {row.row_number}',
            created_by=request.user,
        )
        items_created += 1

batch.items_created = items_created
batch.status = 'complete'
batch.save()
order.item_count = items_created
order.status = 'processing'
order.save()
```

**Result:** For the Costco order — 1149 Item records created, each linked to a Product and ManifestRow. All at status `intake`.

##### Phase 5: Item Processing Queue (NEW)

Items are now in `intake` status and need individual processing before going on the shelf. Staff navigates to the **Processing Queue** page.

**Page:** `/inventory/processing` (new page)

**UI: Processing Queue**

```
┌─────────────────────────────────────────────────────────────────────┐
│  PROCESSING QUEUE                                     Filter: PO ▼ │
│                                                                     │
│  PO-C5TC0 (Costco) — 1,149 items awaiting processing              │
│  PO-HMD67891 (Home Depot) — 981 items awaiting processing         │
│                                                                     │
│  ┌─ ITM-0001234 ──────────────────────────────────────────────┐    │
│  │ BODY GLOVE PERFORMER — PRD-00089                            │    │
│  │ Cost: $339.99 | Status: intake                              │    │
│  │                                                             │    │
│  │ Condition: [New ▼]     Price: [$_99.99___]                  │    │
│  │ Location:  [____A1____] Notes: [________________]           │    │
│  │ Tags:      [color: ________] [+ Add Tag]                   │    │
│  │                                                             │    │
│  │ [Mark Ready & Print Tag]  [Skip]  [Scrap]                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ ITM-0001235 ──────────────────────────────────────────────┐    │
│  │ BODY GLOVE PERFORMER — PRD-00089                            │    │
│  │ ... (same product, next unit)                               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Quick Actions: [Select All Same Product] [Bulk Set Price...]      │
└─────────────────────────────────────────────────────────────────────┘
```

**"Mark Ready & Print Tag"** for an item:
- Sets `status='on_shelf'`, `listed_at=now()`
- Logs `ItemHistory(event_type='status_change', old='intake', new='on_shelf')`
- Queues price tag print job (ITM number + title + price)

**"Bulk Set Price..." convenience** (UI-only, not a model concept):
- Select multiple items with the same Product
- Set price, condition, location for all at once
- Backend: `PATCH` each item individually (or a batch-update endpoint)
- This is the "poor man's batch" — functional but each call is a separate DB update

**Endpoint:** `PATCH /inventory/items/{id}/` (existing) and `POST /inventory/items/{id}/ready/` (existing)

**Bulk convenience endpoint (new):** `POST /inventory/orders/{id}/bulk-update-items/`

```json
// Request
{
  "item_ids": [1234, 1235, 1236, ...],
  "updates": { "price": 14.99, "condition": "good", "location": "A3" }
}
// Response
{ "updated": 61 }
```

##### Phase 6: Order Completion

When all items for a PO are processed (status != `intake`), the order can be marked `complete`.

**Auto-detection:** The Order Detail page checks `items.filter(status='intake').count() == 0` and shows a **"Mark Complete"** button.

##### Full Pipeline Summary (Version A)

```
  Order delivered
       │
       ▼
  ┌──────────────┐    ┌────────────────┐    ┌────────────────┐
  │ Upload CSV   │───▶│ Process Rows   │───▶│ Match Products │
  │ (S3 + preview)│    │ (ManifestRows) │    │ (auto + review)│
  └──────────────┘    └────────────────┘    └────────────────┘
                                                    │
                                                    ▼
                                            ┌──────────────────┐
                                            │ Create Items     │
                                            │ (1 per unit, all │
                                            │  status=intake)  │
                                            └──────────────────┘
                                                    │
                                                    ▼
                                            ┌──────────────────┐
                                            │ Processing Queue │
                                            │ (inspect each,   │
                                            │  set price/cond, │
                                            │  print tag)      │
                                            │                  │
                                            │ Bulk Set Price   │
                                            │ for same-product │
                                            │ groups (UI only) │
                                            └──────────────────┘
                                                    │
                                                    ▼
                                            ┌──────────────────┐
                                            │ Order Complete   │
                                            └──────────────────┘
```

**Total API endpoints for this prototype:**

| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/orders/{id}/upload-manifest/` | POST | Existing | Upload CSV to S3 |
| `/orders/{id}/process-manifest/` | POST | Existing | Create ManifestRows |
| `/orders/{id}/match-products/` | POST | **New** | Auto-match rows to Products |
| `/orders/{id}/create-items/` | POST | Updated | Create Items linked to Products |
| `/orders/{id}/bulk-update-items/` | POST | **New** | Bulk set price/condition/location |
| `/items/{id}/` | PATCH | Existing | Update individual item |
| `/items/{id}/ready/` | POST | Existing | Mark item on_shelf + print tag |

### Pros

- **Simplest model**: No special bulk logic. Every item is an Item.
- **Uniform POS**: Every price tag has an ITM SKU, every scan works the same way.
- **Full traceability**: Every unit is independently trackable from intake to sale.
- **Easy reporting**: `Item.objects.filter(status='on_shelf').count()` — straightforward.
- **No "split" problem**: If one vest in a batch is damaged, it already has its own record.

### Cons

- **Scale at processing time**: 61 vests = 61 records to create, 61 labels to print, 61 price tags. A 1149-unit Costco order means 1149+ Item rows.
- **Wasted effort on commodities**: Inspecting/pricing 28 boxes of Allegra individually adds no value.
- **No structured specs**: `tags` JSON is freeform — no validation, no searchable attribute catalog.
- **Database bloat**: High-volume orders create large Item tables quickly.
- **No batch pricing**: Can't set "all vests = $14.99" in one action without updating 61 rows.

### Open Questions

- At what database scale does this become a performance concern? (Thousands of orders × hundreds of items each)
- Should "batch update" be a UI convenience (update 61 items at once) rather than a model-level concept?
- Is the `tags` JSON sufficient for spec management, or will staff want to filter/search by attributes?

---

## Version B: "Product-Centric with Bulk Lots"

### Approach

Make Product the rich source of truth with structured specifications. Introduce a **BulkLot** model for high-quantity commodity items that don't need individual tracking. Items and BulkLots both link to Product but serve different processing paths. Staff decides (with smart defaults) whether a manifest row creates individual Items or a BulkLot.

### Design

#### Models

```python
# ── Category (defines what specs matter) ──────────────────────────────
class Category(models.Model):
    name = models.CharField(max_length=200, unique=True)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children')
    suggested_specs = models.JSONField(default=list, blank=True)
    # e.g., ["finish", "size", "wattage", "capacity"]
    bulk_threshold = models.IntegerField(default=10)  # Suggest bulk if qty >= this
    bulk_price_cap = models.DecimalField(max_digits=10, decimal_places=2, default=50.00)
    # Suggest bulk if unit price <= this
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'categories'


# ── Product (rich catalog entry) ──────────────────────────────────────
class Product(models.Model):
    product_number = models.CharField(max_length=20, unique=True)  # PRD-XXXXX
    title = models.CharField(max_length=300)
    brand = models.CharField(max_length=200, blank=True, default='')
    model_name = models.CharField(max_length=200, blank=True, default='')
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    description = models.TextField(blank=True, default='')
    specifications = models.JSONField(default=dict, blank=True)
    # e.g., {"finish": "Matte Black", "mounting": "Single Hole", "material": "Stainless Steel"}
    default_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    avg_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    upc = models.CharField(max_length=100, blank=True, default='')
    image_url = models.URLField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# ── VendorProductRef (same as Version A) ──────────────────────────────
class VendorProductRef(models.Model):
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='product_refs')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='vendor_refs')
    vendor_item_number = models.CharField(max_length=100)
    vendor_sku = models.CharField(max_length=100, blank=True, default='')  # Vendor's own SKU if different
    vendor_description = models.CharField(max_length=500, blank=True, default='')
    last_unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    last_seen_date = models.DateField(auto_now=True)

    class Meta:
        unique_together = ['vendor', 'vendor_item_number']


# ── Item (individual tracked items) ───────────────────────────────────
class Item(models.Model):
    SOURCE_CHOICES = [('purchased','Purchased'), ('consignment','Consignment'), ('house','House')]
    STATUS_CHOICES = [
        ('intake','Intake'), ('processing','Processing'), ('on_shelf','On Shelf'),
        ('sold','Sold'), ('returned','Returned'), ('scrapped','Scrapped'), ('lost','Lost'),
    ]
    CONDITION_CHOICES = [
        ('new','New'), ('like_new','Like New'), ('good','Good'),
        ('fair','Fair'), ('salvage','Salvage'), ('unknown','Unknown'),
    ]

    sku = models.CharField(max_length=20, unique=True)  # ITM-XXXXXXX — price tag
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.SET_NULL, null=True, blank=True)
    manifest_row = models.ForeignKey(ManifestRow, on_delete=models.SET_NULL, null=True, blank=True)
    bulk_lot = models.ForeignKey('BulkLot', on_delete=models.SET_NULL, null=True, blank=True)
    # If this item was split out of a bulk lot

    title = models.CharField(max_length=300)
    brand = models.CharField(max_length=200, blank=True, default='')
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, default='unknown')
    specifications = models.JSONField(default=dict, blank=True)  # Override product specs

    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='purchased')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='intake')
    location = models.CharField(max_length=100, blank=True, default='')

    listed_at = models.DateTimeField(null=True, blank=True)
    sold_at = models.DateTimeField(null=True, blank=True)
    sold_for = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# ── BulkLot (high-quantity commodity tracking) ────────────────────────
class BulkLot(models.Model):
    STATUS_CHOICES = [
        ('intake', 'Intake'),
        ('on_shelf', 'On Shelf'),
        ('depleted', 'Depleted'),
    ]

    lot_number = models.CharField(max_length=20, unique=True)  # BLK-XXXXX
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='bulk_lots')
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.SET_NULL, null=True, blank=True)
    manifest_row = models.ForeignKey(ManifestRow, on_delete=models.SET_NULL, null=True, blank=True)

    total_qty = models.IntegerField()
    available_qty = models.IntegerField()  # Decremented on sale
    sold_qty = models.IntegerField(default=0)
    damaged_qty = models.IntegerField(default=0)

    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    condition = models.CharField(max_length=20, default='unknown')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='intake')
    location = models.CharField(max_length=100, blank=True, default='')

    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def sell_one(self):
        """Decrement available, increment sold. Called from POS."""
        if self.available_qty <= 0:
            raise ValueError("No units available")
        self.available_qty -= 1
        self.sold_qty += 1
        if self.available_qty == 0:
            self.status = 'depleted'
        self.save()

    def split_item(self):
        """Extract one unit into an individual Item (e.g., found damage)."""
        if self.available_qty <= 0:
            raise ValueError("No units available")
        self.available_qty -= 1
        self.save()
        return Item.objects.create(
            sku=Item.generate_sku(),
            product=self.product,
            purchase_order=self.purchase_order,
            bulk_lot=self,
            title=self.product.title,
            brand=self.product.brand,
            cost=self.unit_cost,
            status='processing',
            condition='unknown',
            notes=f'Split from bulk lot {self.lot_number}',
        )


# ── ItemEvent (unified history for Items and BulkLots) ────────────────
class ItemEvent(models.Model):
    EVENT_TYPES = [
        ('created', 'Created'),
        ('status_change', 'Status Change'),
        ('condition_change', 'Condition Change'),
        ('price_change', 'Price Change'),
        ('location_change', 'Location Change'),
        ('sold', 'Sold'),
        ('returned', 'Returned'),
        ('split_from_bulk', 'Split from Bulk Lot'),
        ('bulk_sale', 'Bulk Lot Sale'),
        ('lost', 'Lost'),
        ('found', 'Found'),
        ('note', 'Note'),
    ]

    item = models.ForeignKey(Item, null=True, blank=True, on_delete=models.CASCADE, related_name='events')
    bulk_lot = models.ForeignKey(BulkLot, null=True, blank=True, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=30, choices=EVENT_TYPES)
    old_value = models.CharField(max_length=300, blank=True, default='')
    new_value = models.CharField(max_length=300, blank=True, default='')
    note = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
```

#### SKU / Number System

| Number | Format | Purpose | Where Used |
|--------|--------|---------|------------|
| Product Number | `PRD-XXXXX` | Catalog reference | Product list, reorder, matching |
| Item SKU | `ITM-XXXXXXX` | Individual item ID | Price tag, POS scan |
| Bulk Lot Number | `BLK-XXXXX` | Bulk group ID | Shelf label, POS scan for bulk |
| Vendor Item # | Varies | Cross-reference | VendorProductRef |
| UPC | Standard barcode | Universal match | Product matching |

**POS behavior:**
- Scan `ITM-XXXXXXX` → look up Item, standard sale
- Scan `BLK-XXXXX` → look up BulkLot, decrement `available_qty`, record sale

#### Processing Decision Flow

```
ManifestRow (Qty=N, UnitRetail=$X) arrives →
  Match/create Product (same as Version A)

  Determine processing tier:
    Category.bulk_threshold and Category.bulk_price_cap provide defaults
    IF qty >= bulk_threshold AND unit_retail <= bulk_price_cap:
      → Suggest BULK (staff can override to INDIVIDUAL)
    ELSE:
      → Suggest INDIVIDUAL (staff can override to BULK)

  BULK path:
    Create BulkLot(total_qty=N, available_qty=N, unit_price=suggested_price)
    Print 1 shelf label with BLK number
    No individual item records (unless split later)

  INDIVIDUAL path:
    Create N Item records, each with unique ITM SKU
    Queue N price tags for printing
```

#### Specs Management

The Category model drives which specs are relevant:

```python
# Example Category data:
Category(name="Bathroom Fixtures", suggested_specs=["finish", "mounting_type", "material"])
Category(name="Small Appliances", suggested_specs=["wattage", "capacity", "color"])
Category(name="Sporting Goods", suggested_specs=["size", "color", "gender"])
Category(name="Health & Beauty", suggested_specs=["quantity_per_pack", "strength"])
```

When creating/editing a Product, the UI shows the category's suggested spec fields. Staff fills in what they know. The `specifications` JSONField stores the values. Products inherit specs to Items; Items can override.

#### End-to-End Processing Workflow

This prototype fundamentally changes item creation by introducing a **tier decision step** where staff choose between Individual Items and Bulk Lots. The pipeline splits into two parallel tracks after product matching.

##### Phase 1: Manifest Upload (existing — no change)

Same as v1.2.0. CSV uploaded, saved to S3, preview persisted.

**Endpoint:** `POST /inventory/orders/{id}/upload-manifest/`

##### Phase 2: Column Mapping & Row Normalization (existing — minor update)

Same as v1.2.0 with the addition of `vendor_item_number` and `upc` fields on ManifestRow.

**Endpoint:** `POST /inventory/orders/{id}/process-manifest/`

##### Phase 3: Product Matching (NEW — same logic as Version A)

Auto-match ManifestRows to existing Products via UPC → VendorProductRef → title+brand fuzzy match. Staff reviews matches and creates new Products for unmatched rows.

**Endpoint:** `POST /inventory/orders/{id}/match-products/`

**UI:** Same Match Review Screen as Version A. Additionally, when a new Product is created, the UI prompts for **Category assignment** since categories drive spec templates and bulk thresholds.

```
┌─ New Product: HEATED VEST 32 DEGREE ──────────────────────────┐
│ Brand: DAVID PEYSER SPORTSWEAR                                 │
│ Category: [Sporting Goods ▼]  ← drives specs + bulk threshold │
│                                                                 │
│ Suggested Specs (from Sporting Goods category):                │
│   Size:   [________]                                           │
│   Color:  [________]                                           │
│   Gender: [Unisex ▼]                                           │
│                                                                 │
│ [Save Product]  [Save & Apply to Similar Rows]                 │
└─────────────────────────────────────────────────────────────────┘
```

##### Phase 4: Tier Decision & Inventory Creation (NEW — the key differentiator)

After all rows are matched to Products, staff clicks **"Create Inventory"**. The system presents each manifest row with a **recommended processing tier** based on the Category's `bulk_threshold` and `bulk_price_cap`.

**Endpoint:** `POST /inventory/orders/{id}/preview-tiers/` (generates recommendations)

**Response:**

```json
{
  "rows": [
    {
      "row_number": 49,
      "description": "HEATED VEST 32 DEGREE",
      "qty": 61,
      "unit_retail": 49.99,
      "product_id": 89,
      "recommended_tier": "bulk",
      "reason": "qty(61) >= threshold(10) AND price($49.99) <= cap($75.00)"
    },
    {
      "row_number": 22,
      "description": "KS IRON SET REGULAR FLEX",
      "qty": 1,
      "unit_retail": 529.99,
      "product_id": 42,
      "recommended_tier": "individual",
      "reason": "qty(1) < threshold(10)"
    }
  ],
  "summary": {
    "total_rows": 470,
    "recommended_bulk": 285,
    "recommended_individual": 185,
    "total_units": 1149,
    "bulk_units": 847,
    "individual_units": 302
  }
}
```

**UI: Tier Decision Screen**

```
┌─────────────────────────────────────────────────────────────────────┐
│  TIER ASSIGNMENT — PO-C5TC0 (Costco)                               │
│                                                                     │
│  285 rows → Bulk Lot (847 units)                                   │
│  185 rows → Individual Items (302 units)                           │
│                                                                     │
│  ┌─ Row 49: HEATED VEST 32 DEGREE ────────────────────────────┐   │
│  │ Qty: 61 | $49.99/ea | PRD-00089                             │   │
│  │ Recommended: ● BULK LOT                                     │   │
│  │ Tier: (● Bulk) (○ Individual)  [Override]                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ Row 1: BODY GLOVE PERFORMER ──────────────────────────────┐   │
│  │ Qty: 4 | $339.99/ea | PRD-00091                             │   │
│  │ Recommended: ● INDIVIDUAL                                   │   │
│  │ Tier: (○ Bulk) (● Individual)  [Override]                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Accept All Recommendations]     [Create Inventory →]             │
└─────────────────────────────────────────────────────────────────────┘
```

Staff can override any tier. Then clicks **"Create Inventory"**.

**Endpoint:** `POST /inventory/orders/{id}/create-inventory/`

**Request body:**

```json
{
  "rows": [
    {"row_id": 49, "tier": "bulk"},
    {"row_id": 1, "tier": "individual"},
    ...
  ]
}
```

**Backend logic:**

```
for row_decision in request.data['rows']:
    row = ManifestRow.objects.get(id=row_decision['row_id'])
    product = row.matched_product

    if row_decision['tier'] == 'bulk':
        # Create a single BulkLot — no individual Item records
        BulkLot.objects.create(
            lot_number=BulkLot.generate_lot_number(),
            product=product,
            purchase_order=order,
            manifest_row=row,
            total_qty=row.quantity,
            available_qty=row.quantity,
            unit_cost=row.retail_value,
            condition=row.condition or 'unknown',
            status='intake',
        )
        ItemEvent.objects.create(
            bulk_lot=bulk_lot,
            event_type='created',
            note=f'Bulk lot from PO {order.order_number}, row {row.row_number}',
        )

    elif row_decision['tier'] == 'individual':
        # Create N individual Item records
        for i in range(row.quantity):
            item = Item.objects.create(
                sku=Item.generate_sku(),
                product=product,
                purchase_order=order,
                manifest_row=row,
                title=product.title,
                brand=product.brand,
                cost=row.retail_value,
                condition=row.condition or 'unknown',
                source='purchased',
                status='intake',
            )
            ItemEvent.objects.create(
                item=item,
                event_type='created',
                note=f'From PO {order.order_number}, row {row.row_number}',
            )
```

**Result for Costco order:**
- 285 BulkLot records (covering 847 units)
- 302 individual Item records
- Total database rows: 587 (vs 1149 in Version A)

##### Phase 5: Dual Processing Tracks (NEW)

After creation, there are two separate processing queues.

**UI: Processing Dashboard** (`/inventory/processing`)

```
┌─────────────────────────────────────────────────────────────────────┐
│  PROCESSING DASHBOARD                                              │
│                                                                     │
│  ┌─ INDIVIDUAL ITEMS ──────────────────────────────────────────┐   │
│  │ 302 items awaiting processing                               │   │
│  │ [Open Processing Queue →]                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ BULK LOTS ─────────────────────────────────────────────────┐   │
│  │ 285 lots awaiting pricing                                   │   │
│  │ [Open Bulk Pricing →]                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Track A — Individual Item Processing Queue:**

Same as Version A's processing queue. Staff inspects each item, sets condition/price/location/specs, clicks "Mark Ready & Print Tag."

```
┌─ ITM-0001234 ─────────────────────────────────────────────────┐
│ BODY GLOVE PERFORMER — PRD-00091                               │
│ Cost: $339.99 | Category: Sporting Goods                       │
│                                                                 │
│ Condition: [Good ▼]     Price: [$_99.99___]                    │
│ Location:  [____B2____]                                        │
│ Specs: Size [________] Color [________] Gender [Unisex ▼]      │
│ Notes: [________________________________]                      │
│                                                                 │
│ [Mark Ready & Print Tag]  [Skip]  [Scrap]                      │
└────────────────────────────────────────────────────────────────┘
```

**Endpoint:** `POST /inventory/items/{id}/ready/`

**Track B — Bulk Lot Pricing:**

A simpler interface. Each row shows the product, total qty, and fields for a single pricing decision. No per-unit inspection.

```
┌─────────────────────────────────────────────────────────────────────┐
│  BULK LOT PRICING — PO-C5TC0                                      │
│                                                                     │
│  ┌─ BLK-00012: HEATED VEST 32 DEGREE ─────────────────────────┐   │
│  │ PRD-00089 | 61 units | Cost: $49.99/ea                      │   │
│  │                                                              │   │
│  │ Unit Price: [$_14.99___]  Condition: [Good ▼]               │   │
│  │ Location:   [____A3____]                                    │   │
│  │                                                              │   │
│  │ [Mark On Shelf & Print Label]  [Split 1 Unit Out]           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ BLK-00013: ALLEGRA ALLERGY 180MG ─────────────────────────┐   │
│  │ PRD-00112 | 28 units | Cost: $38.49/ea                      │   │
│  │ Unit Price: [$__9.99___]  Condition: [New ▼]                │   │
│  │ Location:   [____C1____]                                    │   │
│  │ [Mark On Shelf & Print Label]  [Split 1 Unit Out]           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Process All Bulk Lots]                                           │
└─────────────────────────────────────────────────────────────────────┘
```

**"Mark On Shelf & Print Label":**
- Sets `BulkLot.status='on_shelf'`
- Prints ONE shelf label with BLK number, product title, unit price
- Logs `ItemEvent(bulk_lot=lot, event_type='status_change')`

**"Split 1 Unit Out":**
- Calls `bulk_lot.split_item()` — decrements `available_qty`, creates a new Item in `processing` status
- That Item enters the Individual Processing Queue for full inspection

**Endpoint (new):** `POST /inventory/bulk-lots/{id}/mark-on-shelf/`
**Endpoint (new):** `POST /inventory/bulk-lots/{id}/split/`

##### Phase 6: POS Integration (two scan paths)

At the register:

```
Scan ITM-0001234 →
  Look up Item → standard sale flow
  Item.status = 'sold', Item.sold_at = now(), Item.sold_for = price
  ItemEvent(item=item, event_type='sold')

Scan BLK-00012 →
  Look up BulkLot → decrement flow
  BulkLot.sell_one() → available_qty -= 1, sold_qty += 1
  ItemEvent(bulk_lot=lot, event_type='bulk_sale')
  If available_qty == 0 → status = 'depleted'
  Receipt shows: product title + unit price (no individual item ID)
```

##### Phase 7: Order Completion

Order is `complete` when:
- All individual Items have status != `intake`
- All BulkLots have status != `intake`

##### Full Pipeline Summary (Version B)

```
  Order delivered
       │
       ▼
  ┌──────────────┐    ┌────────────────┐    ┌────────────────┐
  │ Upload CSV   │───▶│ Process Rows   │───▶│ Match Products │
  │ (S3 + preview)│    │ (ManifestRows) │    │ (auto + review │
  └──────────────┘    └────────────────┘    │  + assign cats)│
                                            └────────────────┘
                                                    │
                                                    ▼
                                            ┌──────────────────┐
                                            │ Tier Decision    │
                                            │ (system suggests,│
                                            │  staff confirms) │
                                            └──────────────────┘
                                               │            │
                              ┌────────────────┘            └───────────────┐
                              ▼                                             ▼
                   ┌────────────────────┐                     ┌──────────────────┐
                   │ Create BulkLots    │                     │ Create Items     │
                   │ (1 record per row, │                     │ (N records per   │
                   │  no individual     │                     │  row, all status │
                   │  items)            │                     │  = intake)       │
                   └────────────────────┘                     └──────────────────┘
                              │                                             │
                              ▼                                             ▼
                   ┌────────────────────┐                     ┌──────────────────┐
                   │ Bulk Lot Pricing   │                     │ Individual Queue │
                   │ (set price/cond    │                     │ (inspect each,   │
                   │  once, print 1     │    ┌──split──┐      │  set price/cond, │
                   │  shelf label)      │───▶│ Item    │─────▶│  print tag)      │
                   └────────────────────┘    └─────────┘      └──────────────────┘
                              │                                             │
                              ▼                                             ▼
                   ┌────────────────────┐                     ┌──────────────────┐
                   │ POS: scan BLK →    │                     │ POS: scan ITM →  │
                   │ decrement qty      │                     │ standard sale    │
                   └────────────────────┘                     └──────────────────┘
                              │                                             │
                              └──────────────────┬──────────────────────────┘
                                                 ▼
                                         ┌──────────────┐
                                         │ Order Complete│
                                         └──────────────┘
```

**Total API endpoints for this prototype:**

| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/orders/{id}/upload-manifest/` | POST | Existing | Upload CSV to S3 |
| `/orders/{id}/process-manifest/` | POST | Existing | Create ManifestRows |
| `/orders/{id}/match-products/` | POST | **New** | Auto-match rows to Products |
| `/orders/{id}/preview-tiers/` | POST | **New** | Generate tier recommendations |
| `/orders/{id}/create-inventory/` | POST | **New** | Create Items + BulkLots based on tier decisions |
| `/items/{id}/` | PATCH | Existing | Update individual item |
| `/items/{id}/ready/` | POST | Existing | Mark item on_shelf + print tag |
| `/bulk-lots/` | GET | **New** | List bulk lots (filterable) |
| `/bulk-lots/{id}/` | PATCH | **New** | Update bulk lot (price, condition, location) |
| `/bulk-lots/{id}/mark-on-shelf/` | POST | **New** | Mark bulk lot on shelf + print label |
| `/bulk-lots/{id}/split/` | POST | **New** | Extract 1 unit into individual Item |
| `/bulk-lots/{id}/sell/` | POST | **New** | POS sale — decrement available_qty |

### Pros

- **Efficient bulk handling**: 61 vests = 1 BulkLot + 1 shelf label. Not 61 records.
- **Structured specifications**: Category-driven, searchable, consistent across products.
- **Product is reusable**: Rich catalog enables reorder analysis, pricing trends.
- **Split mechanism**: When a bulk item needs attention, split it into an individual Item.
- **Scalable**: BulkLot keeps row count manageable for high-volume orders.

### Cons

- **Dual POS path**: Scanner must handle both ITM and BLK codes. More complex POS logic.
- **Split complexity**: Extracting an item from a BulkLot creates an orphan that needs full processing.
- **Reporting split**: "How many items do we have?" needs to sum Item count + BulkLot.available_qty.
- **Bulk lot history**: Harder to trace "which specific unit was sold to which customer."
- **Category maintenance**: Someone needs to set up categories and suggested specs upfront.

### Open Questions

- How does the POS receipt look for a bulk sale? (Product title + price, no unique item ID?)
- Can a customer return a bulk-sold item? How is it tracked without an individual SKU?
- Should bulk lots get a range of ITM numbers reserved (for potential future splitting)?
- What's the threshold sweet spot? (qty >= 10 AND price <= $50 is a starting guess)

---

## Version C: "Universal Items with Smart Batch Processing"

### Approach

**Every unit always gets an Item record** (like Version A), but introduce **BatchGroup** as a processing accelerator — not a separate tracking path. BatchGroups let staff process identical items together (set price, condition, location once for the whole batch), but each item still gets its own ITM number for the price tag. This avoids the dual-path POS complexity of Version B while solving the processing efficiency problem.

Specs use a hybrid approach: a `specifications` JSON on Product for structured data, plus a `CategoryTemplate` that suggests which specs to fill in — but no strict EAV enforcement.

### Design

#### Models

```python
# ── Category ──────────────────────────────────────────────────────────
class Category(models.Model):
    name = models.CharField(max_length=200, unique=True)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children')
    slug = models.SlugField(max_length=200, unique=True)
    spec_template = models.JSONField(default=list, blank=True)
    # e.g., [
    #   {"key": "finish", "label": "Finish", "type": "text"},
    #   {"key": "wattage", "label": "Wattage", "type": "number", "unit": "W"},
    #   {"key": "size", "label": "Size", "type": "choice", "options": ["S","M","L","XL"]},
    # ]
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'categories'


# ── Product (catalog entry with structured specs) ─────────────────────
class Product(models.Model):
    product_number = models.CharField(max_length=20, unique=True)  # PRD-XXXXX
    title = models.CharField(max_length=300)
    brand = models.CharField(max_length=200, blank=True, default='')
    model_name = models.CharField(max_length=200, blank=True, default='')
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    description = models.TextField(blank=True, default='')
    specifications = models.JSONField(default=dict, blank=True)
    # Structured specs: {"finish": "Matte Black", "wattage": 1200}
    default_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    avg_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    upc = models.CharField(max_length=100, blank=True, default='')
    is_active = models.BooleanField(default=True)
    times_ordered = models.IntegerField(default=0)  # Incremented on manifest match
    total_units_received = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @staticmethod
    def generate_product_number():
        last = Product.objects.order_by('-id').first()
        next_num = (last.id + 1) if last else 1
        return f'PRD-{next_num:05d}'


# ── VendorProductRef ──────────────────────────────────────────────────
class VendorProductRef(models.Model):
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='product_refs')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='vendor_refs')
    vendor_item_number = models.CharField(max_length=100)
    vendor_description = models.CharField(max_length=500, blank=True, default='')
    last_unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    times_seen = models.IntegerField(default=1)
    last_seen_date = models.DateField(auto_now=True)

    class Meta:
        unique_together = ['vendor', 'vendor_item_number']


# ── Item (every physical unit, always) ────────────────────────────────
class Item(models.Model):
    SOURCE_CHOICES = [('purchased','Purchased'), ('consignment','Consignment'), ('house','House')]
    STATUS_CHOICES = [
        ('intake','Intake'), ('processing','Processing'), ('on_shelf','On Shelf'),
        ('sold','Sold'), ('returned','Returned'), ('scrapped','Scrapped'), ('lost','Lost'),
    ]
    CONDITION_CHOICES = [
        ('new','New'), ('like_new','Like New'), ('good','Good'),
        ('fair','Fair'), ('salvage','Salvage'), ('unknown','Unknown'),
    ]
    PROCESSING_TIER = [
        ('individual', 'Individual'),  # Needs per-item inspection
        ('batch', 'Batch'),            # Processed as a group, inherits batch settings
    ]

    sku = models.CharField(max_length=20, unique=True)  # ITM-XXXXXXX — always on price tag
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.SET_NULL, null=True, blank=True)
    manifest_row = models.ForeignKey(ManifestRow, on_delete=models.SET_NULL, null=True, blank=True)
    batch_group = models.ForeignKey('BatchGroup', on_delete=models.SET_NULL, null=True, blank=True)

    title = models.CharField(max_length=300)
    brand = models.CharField(max_length=200, blank=True, default='')
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, default='unknown')
    processing_tier = models.CharField(max_length=20, choices=PROCESSING_TIER, default='individual')
    specifications = models.JSONField(default=dict, blank=True)
    # Per-item spec overrides (usually empty for batch items)

    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='purchased')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='intake')
    location = models.CharField(max_length=100, blank=True, default='')

    listed_at = models.DateTimeField(null=True, blank=True)
    sold_at = models.DateTimeField(null=True, blank=True)
    sold_for = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @staticmethod
    def generate_sku():
        last = Item.objects.order_by('-id').first()
        next_num = (last.id + 1) if last else 1
        return f'ITM-{next_num:07d}'


# ── BatchGroup (processing accelerator, NOT a separate tracking entity) ─
class BatchGroup(models.Model):
    """Groups identical items for efficient batch processing.
    All items still exist as individual Item records — BatchGroup just
    lets staff set shared attributes (price, condition, location) once."""

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('complete', 'Complete'),
    ]

    batch_number = models.CharField(max_length=20, unique=True)  # BTH-XXXXX
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='batch_groups')
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.SET_NULL, null=True, blank=True)
    manifest_row = models.ForeignKey(ManifestRow, on_delete=models.SET_NULL, null=True, blank=True)

    total_qty = models.IntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    # Batch-level defaults (applied to all items in the batch)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    condition = models.CharField(max_length=20, default='unknown')
    location = models.CharField(max_length=100, blank=True, default='')

    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    processed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def apply_to_items(self):
        """Push batch settings to all items in this group."""
        self.items.update(
            price=self.unit_price,
            cost=self.unit_cost,
            condition=self.condition,
            location=self.location,
            status='on_shelf',
            listed_at=timezone.now(),
        )
        self.status = 'complete'
        self.processed_at = timezone.now()
        self.save()

    def detach_item(self, item):
        """Remove an item from batch processing for individual handling."""
        item.batch_group = None
        item.processing_tier = 'individual'
        item.status = 'processing'
        item.save()


# ── ItemHistory (event log — same as Version A but richer) ────────────
class ItemHistory(models.Model):
    EVENT_TYPES = [
        ('created', 'Created'),
        ('status_change', 'Status Change'),
        ('condition_change', 'Condition Change'),
        ('price_change', 'Price Change'),
        ('location_change', 'Location Change'),
        ('batch_processed', 'Batch Processed'),
        ('detached_from_batch', 'Detached from Batch'),
        ('sold', 'Sold'),
        ('returned', 'Returned'),
        ('lost', 'Lost'),
        ('found', 'Found'),
        ('note', 'Note'),
    ]

    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='history')
    event_type = models.CharField(max_length=30, choices=EVENT_TYPES)
    old_value = models.CharField(max_length=300, blank=True, default='')
    new_value = models.CharField(max_length=300, blank=True, default='')
    note = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
```

#### SKU / Number System

| Number | Format | Purpose | Where Used |
|--------|--------|---------|------------|
| Product Number | `PRD-XXXXX` | Catalog reference | Product list, reorder, matching |
| Item SKU | `ITM-XXXXXXX` | Physical item ID | **Always** on price tag, POS scan, public lookup |
| Batch Number | `BTH-XXXXX` | Processing group ID | Internal processing UI only |
| Vendor Item # | Varies | Cross-reference | VendorProductRef, manifest matching |
| UPC | Standard barcode | Universal match | Product matching |

**Key insight: The price tag always has ITM-XXXXXXX. POS always scans ITM numbers. No dual-path.**

#### Processing Workflow

```
ManifestRow arrives →
  1. Match/create Product + VendorProductRef (same as A/B)
  2. Determine tier:
     IF qty >= 6 AND unit_retail < $75:   → tier = 'batch'
     ELSE:                                 → tier = 'individual'
     (Staff can override either direction in the processing UI)

  3a. BATCH tier:
      Create BatchGroup(total_qty=N)
      Create N Item records (sku=generated, batch_group=group, processing_tier='batch')
      → Items are auto-populated from Product defaults
      → Staff reviews the BatchGroup: sets price, condition, location ONCE
      → "Process Batch" → apply_to_items() updates all N items at once
      → Print N price tags (can be deferred or printed in batches)

  3b. INDIVIDUAL tier:
      Create N Item records (processing_tier='individual')
      → Each item enters the processing queue
      → Staff inspects each: set condition, price, specs, location
      → Print 1 price tag per item

  4. DETACH (optional):
     If during batch processing a vest has a rip:
     → batch.detach_item(item) → item becomes 'individual', enters processing queue
     → Staff sets new condition/price for just that item
```

#### Spec Management (Hybrid)

```
Category "Bathroom Fixtures" has spec_template:
  [
    {"key": "finish",       "label": "Finish",        "type": "text"},
    {"key": "mounting_type","label": "Mounting Type",  "type": "choice", "options": ["Single Hole","Widespread","Wall Mount"]},
    {"key": "material",     "label": "Material",       "type": "text"},
  ]

Product "Kohler Provo Sink Kit" (category=Bathroom Fixtures):
  specifications = {"finish": "Stainless Steel", "mounting_type": "Single Hole"}

Item created from this product:
  specifications = {}  (inherits from product, no override needed)

Item where one unit has a different finish:
  specifications = {"finish": "Matte Black"}  (overrides just this field)
```

**UI behavior:** When editing a Product, the form shows input fields from the category's `spec_template`. Staff fills in what they know. Unknown specs are left blank. Additional freeform specs can be added.

#### Example: Processing the Costco Order (1149 units)

| Manifest Row | Qty | Unit $ | Tier | What Happens |
|-------------|-----|--------|------|-------------|
| Heated Vest 32 Degree | 61 | $49.99 | batch | 1 BatchGroup + 61 Items. Staff sets price=$14.99, condition=good, location=A3. One click → 61 items on shelf. |
| Allegra Allergy 180mg | 28 | $38.49 | batch | 1 BatchGroup + 28 Items. Price=$9.99, condition=new. |
| Artika Sonolok Panels | 20 | $49.99 | batch | 1 BatchGroup + 20 Items. Price=$14.99. |
| Body Glove Performer | 4 | $339.99 | individual | 4 Items. Each inspected individually (condition, completeness). |
| Barrington Poker Table | 1 | $229.99 | individual | 1 Item. Full inspection, detailed specs. |
| Singer Sewing Machine | 1 | $199.99 | individual | 1 Item. Test functionality, rate condition. |
| 27G Storage Tote | 20 | $8.99 | batch | 1 BatchGroup + 20 Items. Price=$2.99. Quick. |

**Result**: ~470 manifest rows → ~240 BatchGroups + ~100 individual items. Staff processes ~340 decisions, not 1149.

#### End-to-End Processing Workflow

This prototype creates an Item record for every physical unit (like Version A) but uses **BatchGroups** to accelerate processing. The pipeline is unified — no dual POS paths — but processing is as efficient as Version B for high-quantity rows. The key innovation: the tier decision affects *how* items are processed, not *whether* they exist.

##### Phase 1: Manifest Upload (existing — no change)

Same as v1.2.0. CSV uploaded, saved to S3, preview persisted.

**Endpoint:** `POST /inventory/orders/{id}/upload-manifest/`

##### Phase 2: Column Mapping & Row Normalization (existing — minor update)

Same as v1.2.0 with `vendor_item_number` and `upc` added to ManifestRow.

**Endpoint:** `POST /inventory/orders/{id}/process-manifest/`

##### Phase 3: Product Matching (NEW — same as Versions A/B)

Auto-match ManifestRows to existing Products via UPC → VendorProductRef → title+brand. Staff reviews. New Products get a Category assignment which populates the spec_template for later use.

**Endpoint:** `POST /inventory/orders/{id}/match-products/`

**UI:** Same Match Review Screen. New Product creation includes Category picker with spec_template preview:

```
┌─ New Product: HEATED VEST 32 DEGREE ──────────────────────────┐
│ Brand: DAVID PEYSER SPORTSWEAR                                 │
│ Product #: PRD-00089 (auto)                                    │
│ Category: [Sporting Goods ▼]                                   │
│                                                                 │
│ Suggested Specs:                                               │
│   Size:   [________]   Color:  [________]   Gender: [Unisex ▼]│
│                                                                 │
│ Default Price: [$________]  (can be set later during processing)│
│                                                                 │
│ [Save Product]                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Product stats update:** When a row matches an existing product, increment `product.times_ordered` and `product.total_units_received += row.quantity`.

##### Phase 4: Item & Batch Creation (NEW — the key step)

After all rows have Products, staff clicks **"Create Items"**. The system creates ALL items (every unit gets an ITM record) but also groups qualifying rows into BatchGroups for streamlined processing.

**Endpoint:** `POST /inventory/orders/{id}/create-items/`

**Backend logic:**

```python
for row in manifest_rows:
    product = row.matched_product

    # Determine processing tier
    qty = row.quantity
    unit_cost = row.retail_value or 0
    category = product.category

    if category:
        is_batch = qty >= 6 and unit_cost < 75  # sensible defaults
    else:
        is_batch = qty >= 10  # fallback without category

    tier = 'batch' if is_batch else 'individual'

    # Create BatchGroup if batch tier
    batch_group = None
    if tier == 'batch':
        batch_group = BatchGroup.objects.create(
            batch_number=BatchGroup.generate_batch_number(),
            product=product,
            purchase_order=order,
            manifest_row=row,
            total_qty=qty,
            unit_cost=unit_cost,
            condition=row.condition or 'unknown',
            status='pending',
        )

    # Create individual Item records for EVERY unit (batch or not)
    for i in range(qty):
        item = Item.objects.create(
            sku=Item.generate_sku(),
            product=product,
            purchase_order=order,
            manifest_row=row,
            batch_group=batch_group,  # None for individual-tier items
            title=product.title,
            brand=product.brand,
            cost=unit_cost,
            condition=row.condition or 'unknown',
            processing_tier=tier,
            source='purchased',
            status='intake',
        )
        ItemHistory.objects.create(
            item=item,
            event_type='created',
            note=f'From PO {order.order_number}, row {row.row_number}'
                 + (f', batch {batch_group.batch_number}' if batch_group else ''),
            created_by=request.user,
        )
```

**Result for Costco order (1149 units, ~470 rows):**
- 1149 Item records (every unit has its own ITM-XXXXXXX)
- ~240 BatchGroup records (for rows where qty >= 6 and unit_cost < $75)
- ~100 rows create individual-tier items (~302 units)
- All items start at `status='intake'`

##### Phase 5: Processing — Two Modes, One Queue (NEW)

Staff navigates to the **Processing page**. Unlike Version B (which has two completely separate queues), Version C has a single processing page with two *modes* within it.

**Page:** `/inventory/processing` (new page)

**UI: Order Processing Page**

```
┌─────────────────────────────────────────────────────────────────────┐
│  PROCESSING — PO-C5TC0 (Costco)                                   │
│                                                                     │
│  Progress: ████████░░░░░░░░ 34% (391 of 1,149 items processed)    │
│                                                                     │
│  ┌─ BATCH PROCESSING ─────────────────────────────────────────┐    │
│  │                                                             │    │
│  │  240 batches | 847 items | 198 batches remaining            │    │
│  │                                                             │    │
│  │  ┌─ BTH-00012: HEATED VEST 32 DEGREE (61 items) ──────┐   │    │
│  │  │ PRD-00089 | Cost: $49.99/ea                          │   │    │
│  │  │                                                      │   │    │
│  │  │ Price:     [$_14.99___]                              │   │    │
│  │  │ Condition: [Good ▼]                                  │   │    │
│  │  │ Location:  [____A3____]                              │   │    │
│  │  │                                                      │   │    │
│  │  │ [Process Batch (61 items)]  [Detach 1 Item]          │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  │                                                             │    │
│  │  ┌─ BTH-00013: ALLEGRA ALLERGY 180MG (28 items) ──────┐   │    │
│  │  │ PRD-00112 | Cost: $38.49/ea                          │   │    │
│  │  │ Price: [$__9.99___] Condition: [New ▼] Loc: [__C1__] │   │    │
│  │  │ [Process Batch (28 items)]  [Detach 1 Item]          │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  │                                                             │    │
│  │  ┌─ BTH-00014: 27G STORAGE TOTE (20 items) ───────────┐   │    │
│  │  │ PRD-00156 | Cost: $8.99/ea                           │   │    │
│  │  │ Price: [$__2.99___] Condition: [Good ▼] Loc: [__D4__]│   │    │
│  │  │ [Process Batch (20 items)]  [Detach 1 Item]          │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  │                                                             │    │
│  │  [Process All Remaining Batches]                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ INDIVIDUAL PROCESSING ────────────────────────────────────┐    │
│  │                                                             │    │
│  │  302 items | 87 remaining                                   │    │
│  │                                                             │    │
│  │  ┌─ ITM-0001234: BODY GLOVE PERFORMER ────────────────┐   │    │
│  │  │ PRD-00091 | Cost: $339.99                            │   │    │
│  │  │                                                      │   │    │
│  │  │ Condition: [Like New ▼]  Price: [$119.99___]         │   │    │
│  │  │ Location: [____B2____]                               │   │    │
│  │  │ Specs: Size [________] Color [Red/Black__]           │   │    │
│  │  │ Notes: [Complete, all accessories_____]              │   │    │
│  │  │                                                      │   │    │
│  │  │ [Mark Ready & Print Tag]  [Skip]  [Scrap]           │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  │                                                             │    │
│  │  ┌─ ITM-0001235: BARRINGTON POKER TABLE ──────────────┐   │    │
│  │  │ PRD-00093 | Cost: $229.99                            │   │    │
│  │  │ Condition: [Good ▼]  Price: [$_79.99___]             │   │    │
│  │  │ Location: [____B5____]                               │   │    │
│  │  │ Specs: Material [Wood/Felt___] Players [8_]          │   │    │
│  │  │ Notes: [Minor scuff on leg, felt good__]             │   │    │
│  │  │ [Mark Ready & Print Tag]  [Skip]  [Scrap]           │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ DETACHED ITEMS (need individual processing) ──────────────┐    │
│  │  3 items detached from batches                              │    │
│  │  ... (shows same individual processing form)                │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

##### "Process Batch" Action (backend)

**Endpoint:** `POST /inventory/batch-groups/{id}/process/`

**Request:**

```json
{
  "unit_price": 14.99,
  "condition": "good",
  "location": "A3"
}
```

**Backend:**

```python
def process_batch(self, request, pk=None):
    batch = self.get_object()

    batch.unit_price = request.data['unit_price']
    batch.condition = request.data['condition']
    batch.location = request.data.get('location', '')
    batch.processed_by = request.user
    batch.processed_at = timezone.now()
    batch.status = 'complete'
    batch.save()

    # Push to ALL items in this batch — single DB query
    updated = batch.items.update(
        price=batch.unit_price,
        cost=batch.unit_cost,
        condition=batch.condition,
        location=batch.location,
        status='on_shelf',
        listed_at=timezone.now(),
    )

    # Log history for each item (bulk insert)
    histories = [
        ItemHistory(
            item=item,
            event_type='batch_processed',
            new_value=f'price={batch.unit_price}, cond={batch.condition}, loc={batch.location}',
            note=f'Batch processed via {batch.batch_number}',
            created_by=request.user,
        )
        for item in batch.items.all()
    ]
    ItemHistory.objects.bulk_create(histories)

    return Response({
        'batch_number': batch.batch_number,
        'items_updated': updated,
        'status': 'complete',
    })
```

**Result:** 61 heated vests → one form submission → 61 Items updated to `on_shelf` with price $14.99, condition "good", location "A3". Staff now queues 61 price tags for batch printing.

##### "Detach Item" Action

**Endpoint:** `POST /inventory/batch-groups/{id}/detach/`

**Request:** `{"item_id": 1234}`

**Backend:**

```python
def detach_item(self, request, pk=None):
    batch = self.get_object()
    item_id = request.data.get('item_id')

    # If no specific item, detach the first unprocessed one
    if item_id:
        item = batch.items.get(id=item_id)
    else:
        item = batch.items.filter(status='intake').first()

    if not item:
        return Response({'detail': 'No item to detach'}, status=400)

    item.batch_group = None
    item.processing_tier = 'individual'
    item.status = 'processing'
    item.save()

    ItemHistory.objects.create(
        item=item,
        event_type='detached_from_batch',
        note=f'Detached from {batch.batch_number} for individual processing',
        created_by=request.user,
    )

    batch.total_qty -= 1
    batch.save()

    return Response({
        'detached_item': item.sku,
        'remaining_in_batch': batch.total_qty,
    })
```

**Use case:** Staff opens box 34 of 61 heated vests and finds a rip. Click "Detach 1 Item" → that item moves to the Individual Processing section where staff can set `condition='fair'`, `price=7.99`, and handle it separately. The other 60 vests continue as a batch.

##### Phase 6: Price Tag Printing

Because every item has an ITM-XXXXXXX, tag printing is unified:

**Batch tags:** After processing a BatchGroup, staff clicks **"Print Tags for Batch"**. System generates 61 tags with:
```
┌──────────────────────────────┐
│  HEATED VEST 32 DEGREE       │
│  $14.99                      │
│                              │
│  |||||||||||||||||||||||      │
│    ITM-0001301               │
│                              │
│  Good | A3                   │
└──────────────────────────────┘
```

**Individual tags:** Same format, printed one at a time as each item is processed.

**Endpoint:** `POST /inventory/orders/{id}/print-tags/`
**Request:** `{"item_ids": [1301, 1302, ...]}` or `{"batch_group_id": 12}`

##### Phase 7: POS Integration (single path — always ITM)

At the register, the cashier **always** scans an ITM barcode. No BLK codes.

```
Scan ITM-0001301 →
  Item = Item.objects.get(sku='ITM-0001301')
  assert Item.status == 'on_shelf'
  → Add to cart at Item.price ($14.99)
  → On checkout: Item.status = 'sold', sold_at = now(), sold_for = 14.99
  → ItemHistory(event_type='sold')
```

Same flow for batch items and individual items. POS doesn't know or care which tier an item was processed under.

##### Phase 8: Order Completion

**Auto-detection:** `order.items.filter(status='intake').count() == 0`

The Order Detail page shows a progress indicator:

```
Items processed: 1,146 / 1,149 (3 remaining in intake)
Batches complete: 238 / 240
[Mark Order Complete]  (disabled until all items processed)
```

When ready: `POST /inventory/orders/{id}/mark-complete/` → `status='complete'`

##### Full Pipeline Summary (Version C)

```
  Order delivered
       │
       ▼
  ┌──────────────┐    ┌────────────────┐    ┌────────────────┐
  │ Upload CSV   │───▶│ Process Rows   │───▶│ Match Products │
  │ (S3 + preview)│    │ (ManifestRows) │    │ (auto + review │
  └──────────────┘    └────────────────┘    │  + assign cats)│
                                            └────────────────┘
                                                    │
                                                    ▼
                                            ┌──────────────────┐
                                            │ Create Items     │
                                            │ (EVERY unit gets │
                                            │  an ITM record)  │
                                            │                  │
                                            │ + BatchGroups    │
                                            │ (for qty >= 6    │
                                            │  & cost < $75)   │
                                            └──────────────────┘
                                                    │
                              ┌──────────────────────┼───────────────────┐
                              ▼                      │                   ▼
                   ┌────────────────────┐            │     ┌──────────────────┐
                   │ Batch Processing   │            │     │ Individual Queue │
                   │ (set price/cond/   │            │     │ (inspect each,   │
                   │  loc ONCE, push    │   detach   │     │  set price/cond/ │
                   │  to all items)     │───────────▶│     │  specs, location)│
                   └────────────────────┘            │     └──────────────────┘
                              │                      │               │
                              ▼                      │               ▼
                   ┌────────────────────┐            │     ┌──────────────────┐
                   │ Print N Tags       │            │     │ Print 1 Tag      │
                   │ (batch print)      │            │     │ (per item)       │
                   └────────────────────┘            │     └──────────────────┘
                              │                      │               │
                              └──────────────────────┼───────────────┘
                                                     ▼
                                            ┌──────────────────┐
                                            │ POS: scan ITM    │
                                            │ (always, unified)│
                                            └──────────────────┘
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │ Order Complete   │
                                            └──────────────────┘
```

**Total API endpoints for this prototype:**

| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/orders/{id}/upload-manifest/` | POST | Existing | Upload CSV to S3 |
| `/orders/{id}/process-manifest/` | POST | Existing | Create ManifestRows |
| `/orders/{id}/match-products/` | POST | **New** | Auto-match rows to Products |
| `/orders/{id}/create-items/` | POST | Updated | Create all Items + BatchGroups |
| `/orders/{id}/mark-complete/` | POST | **New** | Mark order complete |
| `/orders/{id}/print-tags/` | POST | **New** | Batch print tags by order/batch |
| `/items/{id}/` | PATCH | Existing | Update individual item |
| `/items/{id}/ready/` | POST | Existing | Mark item on_shelf + print tag |
| `/batch-groups/` | GET | **New** | List batch groups (filterable) |
| `/batch-groups/{id}/process/` | POST | **New** | Process batch → push to all items |
| `/batch-groups/{id}/detach/` | POST | **New** | Detach 1 item for individual processing |

##### Walkthrough: Processing 61 Heated Vests

To make this concrete, here is exactly what a staff member does:

1. **Open Processing page** for PO-C5TC0
2. **Scroll to batch BTH-00012** — "HEATED VEST 32 DEGREE (61 items)"
3. **Open a few boxes**, do a quick visual inspection of the lot
4. **Set:** Price = $14.99, Condition = Good, Location = A3
5. **Click "Process Batch (61 items)"**
6. Backend: 61 Items updated in one query. 61 ItemHistory records created. BatchGroup marked `complete`.
7. **Click "Print Tags for Batch"** — 61 price tags queued for the label printer
8. **Spot a vest with a rip?** Click "Detach 1 Item" → that vest moves to Individual Processing
9. **In Individual Processing:** Set that vest to Condition = Fair, Price = $7.99, Mark Ready
10. **Result:** 60 vests at $14.99 + 1 vest at $7.99, all with unique ITM-XXXXXXX barcodes

**Total time for 61 vests:** ~2 minutes (vs ~30+ minutes processing each individually)

### Pros

- **Uniform POS**: Every item has an ITM SKU. No dual scanning logic. Clean.
- **Efficient processing**: Batch items get processed in one action. 61 vests = 1 pricing decision.
- **Full traceability**: Every unit has its own Item record — loss tracking, returns, history all work.
- **Flexible detach**: If one batch item needs individual attention, just detach it. No splitting complexity.
- **Structured-but-pragmatic specs**: Category templates guide staff but don't force completeness.
- **Product analytics**: `times_ordered` and `total_units_received` enable reorder insights.
- **Single price tag system**: No BLK codes to confuse staff or POS.

### Cons

- **More rows than Version B**: 61 vests still creates 61 Item records (vs 1 BulkLot). Database is larger.
- **Batch creation overhead**: Creating 61 Item records takes slightly longer than 1 BulkLot record.
- **61 price tags**: Still need to print 61 tags for 61 vests. (Mitigated: can batch-print from BatchGroup.)
- **BatchGroup is "soft"**: It's a processing tool, not an inventory entity. Could confuse reporting if misused.
- **Category setup**: Like Version B, need initial category + spec template configuration.

### Open Questions

- Should batch items defer price tag printing until after batch processing? (Yes, probably.)
- Is the batch tier threshold configurable per category, or a global setting?
- Should the BatchGroup auto-detect if all items share a product, or is it always 1 product per batch?
- For POS returns: if a batch item is returned, does it re-enter the batch or become individual?

---

## Comparison

| Criteria | Version A: Flat & Simple | Version B: Product-Centric + Bulk | Version C: Universal Items + Smart Batch |
|----------|-------------------------|-----------------------------------|----------------------------------------|
| **Complexity** | Low — 4 new/modified models | High — 6 new/modified models, dual tracking | Medium — 5 new/modified models, unified tracking |
| **Processing Speed** | Slow — every item processed individually | Fast — bulk items skip individual processing entirely | Fast — batch items processed as a group, then all have records |
| **POS Integration** | Simple — scan ITM only | Complex — scan ITM or BLK, different sale flows | Simple — scan ITM only |
| **Traceability** | Full — every unit has a record | Partial — bulk units are anonymous until split | Full — every unit has a record |
| **Database Scale** | Largest — 1 row per unit always | Smallest — bulk lots compress to 1 row | Medium-large — 1 row per unit, but batch processing is fast |
| **Spec Management** | Freeform JSON only | Category-driven structured specs | Category-driven structured specs |
| **Returns Handling** | Simple — look up ITM, update status | Complex — bulk returns need special handling | Simple — look up ITM, update status |
| **Product Matching** | VendorProductRef + UPC | VendorProductRef + UPC | VendorProductRef + UPC |
| **Staff Learning Curve** | Lowest | Highest (two inventory concepts) | Low (everything is an item, batches are just a processing tool) |
| **Print Tags** | 1 per unit always | 1 per individual + 1 per bulk lot | 1 per unit (batch-printable) |
| **Reporting** | `Item.count()` | `Item.count() + sum(BulkLot.available_qty)` | `Item.count()` |
| **Matches thrift store workflow** | Partially — no efficiency for bulk | Yes — but adds POS complexity | Yes — efficient processing, simple POS |

---

## Outcome

**Decision:** _(pending user review)_

**Rationale:** _(to be filled after discussion)_

**Next Steps:**
- Review the three prototypes and discuss tradeoffs
- Decide on bulk handling approach (biggest differentiator)
- Decide on spec management depth (structured vs freeform)
- Decide SKU semantics (all three agree on ITM for items, PRD for products)
- Once a version is chosen, build the migration and model changes
