from django.conf import settings
from django.db import models
from django.utils.text import slugify


class Vendor(models.Model):
    VENDOR_TYPES = [
        ('liquidation', 'Liquidation'),
        ('retail', 'Retail'),
        ('direct', 'Direct'),
        ('other', 'Other'),
    ]

    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, unique=True)
    vendor_type = models.CharField(max_length=20, choices=VENDOR_TYPES, default='other')
    contact_name = models.CharField(max_length=200, blank=True, default='')
    contact_email = models.EmailField(blank=True, default='')
    contact_phone = models.CharField(max_length=30, blank=True, default='')
    address = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.code} - {self.name}'


class Category(models.Model):
    name = models.CharField(max_length=200, unique=True)
    slug = models.SlugField(max_length=200, unique=True, blank=True)
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children',
    )
    spec_template = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:180] or 'category'
            slug = base
            suffix = 1
            while Category.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f'{base}-{suffix}'
                suffix += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class PurchaseOrder(models.Model):
    STATUS_CHOICES = [
        ('ordered', 'Ordered'),
        ('paid', 'Paid'),
        ('shipped', 'Shipped'),
        ('delivered', 'Delivered'),
        ('processing', 'Processing'),
        ('complete', 'Complete'),
        ('cancelled', 'Cancelled'),
    ]

    CONDITION_CHOICES = [
        ('new', 'New'),
        ('like_new', 'Like New'),
        ('good', 'Used - Good'),
        ('fair', 'Used - Fair'),
        ('salvage', 'Salvage'),
        ('mixed', 'Mixed'),
    ]

    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='orders')
    order_number = models.CharField(max_length=100, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ordered')
    ordered_date = models.DateField()
    paid_date = models.DateField(null=True, blank=True)
    shipped_date = models.DateField(null=True, blank=True)
    expected_delivery = models.DateField(null=True, blank=True)
    delivered_date = models.DateField(null=True, blank=True)
    purchase_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    shipping_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    fees = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    retail_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, blank=True, default='')
    description = models.CharField(max_length=500, blank=True, default='')
    item_count = models.IntegerField(default=0)
    notes = models.TextField(blank=True, default='')
    manifest = models.ForeignKey(
        'core.S3File',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_orders',
    )
    manifest_preview = models.JSONField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-ordered_date']

    def __str__(self):
        return f'{self.order_number} ({self.vendor.code})'

    def save(self, *args, **kwargs):
        """Auto-compute total_cost from component fields when any are set."""
        components = [self.purchase_cost, self.shipping_cost, self.fees]
        if any(c is not None for c in components):
            from decimal import Decimal
            self.total_cost = sum(
                (c for c in components if c is not None), Decimal('0.00')
            )
        super().save(*args, **kwargs)

    @staticmethod
    def generate_order_number():
        """Generate next order number like PO-00001."""
        last = PurchaseOrder.objects.order_by('-id').first()
        if last:
            try:
                num = int(last.order_number.replace('PO-', '')) + 1
            except (ValueError, AttributeError):
                num = PurchaseOrder.objects.count() + 1
        else:
            num = 1
        return f'PO-{num:05d}'


class CSVTemplate(models.Model):
    """Reusable column mapping for vendor manifests."""
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='templates')
    name = models.CharField(max_length=200)
    header_signature = models.CharField(max_length=255, blank=True, default='')
    column_mappings = models.JSONField(default=list)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['vendor', 'name']

    def __str__(self):
        return f'{self.vendor.code} - {self.name}'


class ManifestRow(models.Model):
    MATCH_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('matched', 'Matched'),
        ('new', 'New Product'),
    ]
    PRICING_STAGE_CHOICES = [
        ('unpriced', 'Unpriced'),
        ('draft', 'Draft'),
        ('final', 'Final'),
    ]

    CONDITION_CHOICES = [
        ('new', 'New'),
        ('like_new', 'Like New'),
        ('good', 'Good'),
        ('fair', 'Fair'),
        ('salvage', 'Salvage'),
        ('unknown', 'Unknown'),
    ]
    AI_MATCH_DECISION_CHOICES = [
        ('pending_review', 'Pending Review'),
        ('confirmed', 'Confirmed'),
        ('rejected', 'Rejected'),
        ('uncertain', 'Uncertain'),
        ('new_product', 'New Product'),
    ]

    """Standardized row data extracted from vendor CSV."""
    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.CASCADE, related_name='manifest_rows',
    )
    row_number = models.IntegerField()
    quantity = models.IntegerField(default=1)
    description = models.TextField(blank=True, default='')
    title = models.CharField(max_length=300, blank=True, default='')
    brand = models.CharField(max_length=200, blank=True, default='')
    model = models.CharField(max_length=200, blank=True, default='')
    category = models.CharField(max_length=200, blank=True, default='')
    condition = models.CharField(
        max_length=20,
        choices=CONDITION_CHOICES,
        blank=True,
        default='',
    )
    retail_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    proposed_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    final_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    pricing_stage = models.CharField(
        max_length=20,
        choices=PRICING_STAGE_CHOICES,
        default='unpriced',
    )
    pricing_notes = models.TextField(blank=True, default='')
    upc = models.CharField(max_length=100, blank=True, default='')
    vendor_item_number = models.CharField(max_length=100, blank=True, default='')
    batch_flag = models.BooleanField(default=False)
    search_tags = models.TextField(blank=True, default='')
    specifications = models.JSONField(default=dict, blank=True)
    matched_product = models.ForeignKey(
        'Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='matched_rows',
    )
    match_status = models.CharField(
        max_length=20,
        choices=MATCH_STATUS_CHOICES,
        default='pending',
    )
    match_candidates = models.JSONField(default=list, blank=True)
    ai_match_decision = models.CharField(
        max_length=20,
        choices=AI_MATCH_DECISION_CHOICES,
        blank=True,
        default='',
    )
    ai_reasoning = models.TextField(blank=True, default='')
    ai_suggested_title = models.CharField(max_length=300, blank=True, default='')
    ai_suggested_brand = models.CharField(max_length=200, blank=True, default='')
    ai_suggested_model = models.CharField(max_length=200, blank=True, default='')
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['purchase_order', 'row_number']

    def __str__(self):
        return f'Row {self.row_number}: {self.description[:50]}'


class Product(models.Model):
    """Reusable product catalog entry."""
    product_number = models.CharField(
        max_length=20,
        unique=True,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=300)
    brand = models.CharField(max_length=200, blank=True, default='')
    model = models.CharField(max_length=200, blank=True, default='')
    category = models.CharField(max_length=200, blank=True, default='')
    category_ref = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='products',
    )
    description = models.TextField(blank=True, default='')
    specifications = models.JSONField(default=dict, blank=True)
    default_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    upc = models.CharField(max_length=100, blank=True, default='')
    times_ordered = models.IntegerField(default=0)
    total_units_received = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        if self.product_number:
            return f'{self.product_number} - {self.title}'
        return self.title

    @staticmethod
    def generate_product_number():
        """Generate next product number like PRD-00001."""
        last = Product.objects.exclude(product_number__isnull=True).exclude(
            product_number='',
        ).order_by('-id').first()
        if last:
            try:
                num = int(last.product_number.replace('PRD-', '')) + 1
            except (ValueError, AttributeError):
                num = Product.objects.count() + 1
        else:
            num = 1
        return f'PRD-{num:05d}'

    def save(self, *args, **kwargs):
        if not self.product_number:
            self.product_number = Product.generate_product_number()
        super().save(*args, **kwargs)


class VendorProductRef(models.Model):
    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.CASCADE,
        related_name='product_refs',
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='vendor_refs',
    )
    vendor_item_number = models.CharField(max_length=100)
    vendor_description = models.CharField(max_length=500, blank=True, default='')
    last_unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    times_seen = models.IntegerField(default=1)
    last_seen_date = models.DateField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['vendor', 'vendor_item_number']
        unique_together = ['vendor', 'vendor_item_number']

    def __str__(self):
        return f'{self.vendor.code}:{self.vendor_item_number} -> {self.product_id}'


class BatchGroup(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('complete', 'Complete'),
    ]
    CONDITION_CHOICES = [
        ('new', 'New'),
        ('like_new', 'Like New'),
        ('good', 'Good'),
        ('fair', 'Fair'),
        ('salvage', 'Salvage'),
        ('unknown', 'Unknown'),
    ]

    batch_number = models.CharField(max_length=20, unique=True)
    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='batch_groups',
    )
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='batch_groups',
    )
    manifest_row = models.ForeignKey(
        ManifestRow,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='batch_groups',
    )
    total_qty = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, default='unknown')
    location = models.CharField(max_length=100, blank=True, default='')
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='processed_batch_groups',
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.batch_number

    @staticmethod
    def generate_batch_number():
        """Generate next batch number like BTH-00001."""
        last = BatchGroup.objects.order_by('-id').first()
        if last:
            try:
                num = int(last.batch_number.replace('BTH-', '')) + 1
            except (ValueError, AttributeError):
                num = BatchGroup.objects.count() + 1
        else:
            num = 1
        return f'BTH-{num:05d}'

    def save(self, *args, **kwargs):
        if not self.batch_number:
            self.batch_number = BatchGroup.generate_batch_number()
        super().save(*args, **kwargs)

    def apply_to_items(self):
        """Apply current batch defaults to all non-terminal items."""
        from django.utils import timezone

        updates = {
            'status': 'on_shelf',
            'listed_at': timezone.now(),
        }
        if self.unit_price is not None:
            updates['price'] = self.unit_price
        if self.unit_cost is not None:
            updates['cost'] = self.unit_cost
        if self.condition:
            updates['condition'] = self.condition
        if self.location:
            updates['location'] = self.location

        count = self.items.exclude(status__in=['sold', 'scrapped', 'lost']).update(**updates)
        self.status = 'complete'
        self.processed_at = timezone.now()
        self.total_qty = self.items.count()
        self.save(update_fields=['status', 'processed_at', 'total_qty', 'updated_at'])
        return count


class Item(models.Model):
    """Individual inventory item — the core entity that flows through the system."""
    SOURCE_CHOICES = [
        ('purchased', 'Purchased'),
        ('consignment', 'Consignment'),
        ('house', 'House'),
    ]
    STATUS_CHOICES = [
        ('intake', 'Intake'),
        ('processing', 'Processing'),
        ('on_shelf', 'On Shelf'),
        ('sold', 'Sold'),
        ('returned', 'Returned'),
        ('scrapped', 'Scrapped'),
        ('lost', 'Lost'),
    ]
    CONDITION_CHOICES = [
        ('new', 'New'),
        ('like_new', 'Like New'),
        ('good', 'Good'),
        ('fair', 'Fair'),
        ('salvage', 'Salvage'),
        ('unknown', 'Unknown'),
    ]
    PROCESSING_TIER_CHOICES = [
        ('individual', 'Individual'),
        ('batch', 'Batch'),
    ]

    sku = models.CharField(max_length=20, unique=True)
    product = models.ForeignKey(
        Product, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='items',
    )
    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='items',
    )
    manifest_row = models.ForeignKey(
        ManifestRow,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='items',
    )
    batch_group = models.ForeignKey(
        BatchGroup,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='items',
    )
    processing_tier = models.CharField(
        max_length=20,
        choices=PROCESSING_TIER_CHOICES,
        default='individual',
    )
    title = models.CharField(max_length=300)
    brand = models.CharField(max_length=200, blank=True, default='')
    category = models.CharField(max_length=200, blank=True, default='')
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='purchased')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='intake')
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, default='unknown')
    specifications = models.JSONField(default=dict, blank=True)
    location = models.CharField(max_length=100, blank=True, default='')
    listed_at = models.DateTimeField(null=True, blank=True)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='checked_in_items',
    )
    sold_at = models.DateTimeField(null=True, blank=True)
    sold_for = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.sku} - {self.title}'

    @staticmethod
    def generate_sku():
        """Generate next SKU like ITM0001234."""
        last = Item.objects.order_by('-id').first()
        if last:
            try:
                num = int(last.sku.replace('ITM', '')) + 1
            except (ValueError, AttributeError):
                num = Item.objects.count() + 1
        else:
            num = 1
        return f'ITM{num:07d}'


class ProcessingBatch(models.Model):
    """Tracks a create-items processing run for a PO."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('complete', 'Complete'),
    ]

    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.CASCADE, related_name='processing_batches',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    total_rows = models.IntegerField(default=0)
    processed_count = models.IntegerField(default=0)
    items_created = models.IntegerField(default=0)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
    )
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-started_at']
        verbose_name_plural = 'Processing batches'

    def __str__(self):
        return f'Batch for {self.purchase_order.order_number}'


class ItemHistory(models.Model):
    EVENT_TYPES = [
        ('created', 'Created'),
        ('status_change', 'Status Change'),
        ('condition_change', 'Condition Change'),
        ('price_change', 'Price Change'),
        ('location_change', 'Location Change'),
        ('batch_processed', 'Batch Processed'),
        ('detached_from_batch', 'Detached From Batch'),
        ('sold', 'Sold'),
        ('returned', 'Returned'),
        ('lost', 'Lost'),
        ('found', 'Found'),
        ('note', 'Note'),
    ]

    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='history_events')
    event_type = models.CharField(max_length=30, choices=EVENT_TYPES)
    old_value = models.CharField(max_length=300, blank=True, default='')
    new_value = models.CharField(max_length=300, blank=True, default='')
    note = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.item.sku} - {self.event_type}'


class ItemScanHistory(models.Model):
    """Tracks public item lookups and POS scans."""
    SOURCE_CHOICES = [
        ('public_lookup', 'Public Lookup'),
        ('pos_terminal', 'POS Terminal'),
    ]

    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='scans')
    scanned_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='public_lookup')

    class Meta:
        ordering = ['-scanned_at']
        verbose_name_plural = 'Item scan histories'

    def __str__(self):
        return f'{self.item.sku} scanned at {self.scanned_at}'
