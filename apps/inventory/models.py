from django.conf import settings
from django.db import models


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
        'core.S3File', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='purchase_orders',
    )
    manifest_preview = models.JSONField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
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
    """Standardized row data extracted from vendor CSV."""
    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.CASCADE, related_name='manifest_rows',
    )
    row_number = models.IntegerField()
    quantity = models.IntegerField(default=1)
    description = models.TextField(blank=True, default='')
    brand = models.CharField(max_length=200, blank=True, default='')
    model = models.CharField(max_length=200, blank=True, default='')
    category = models.CharField(max_length=200, blank=True, default='')
    retail_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    upc = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['purchase_order', 'row_number']

    def __str__(self):
        return f'Row {self.row_number}: {self.description[:50]}'


class Product(models.Model):
    """Reusable product catalog entry."""
    title = models.CharField(max_length=300)
    brand = models.CharField(max_length=200, blank=True, default='')
    model = models.CharField(max_length=200, blank=True, default='')
    category = models.CharField(max_length=200, blank=True, default='')
    description = models.TextField(blank=True, default='')
    default_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return self.title


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
    title = models.CharField(max_length=300)
    brand = models.CharField(max_length=200, blank=True, default='')
    category = models.CharField(max_length=200, blank=True, default='')
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
    """Tracks a batch processing run for a PO's items."""
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
