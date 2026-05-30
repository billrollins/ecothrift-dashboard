"""Curated web-catalog models for the public storefront.

These are intentionally separate from operational floor inventory (`apps.inventory`):
staff hand-pick a subset of goods, give them their own photos/descriptions/prices,
and publish them to the public site. An optional FK back to an `Item` is kept for
reference but the web listing is the source of truth for what shoppers see.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class WebListing(models.Model):
    """A single curated product shown on the public storefront."""

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('archived', 'Archived'),
    ]
    # Public-facing condition set (a curated subset of Item.CONDITION_CHOICES).
    CONDITION_CHOICES = [
        ('new', 'New'),
        ('like_new', 'Like New'),
        ('very_good', 'Very Good'),
        ('good', 'Good'),
        ('fair', 'Fair'),
    ]

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    category = models.ForeignKey(
        'inventory.Category', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='web_listings',
    )
    # Optional link to the operational inventory item this listing represents.
    item = models.ForeignKey(
        'inventory.Item', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='web_listings',
    )
    sku = models.CharField(max_length=40, blank=True, default='')
    description = models.TextField(blank=True, default='')
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, default='good')

    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Optional "was" price; when set above `price` the public site shows it struck through.
    compare_at_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stock = models.PositiveIntegerField(default=1)

    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='draft')
    featured = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='web_listings_created',
    )
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-featured', '-created_at']
        indexes = [
            models.Index(fields=['status', 'category']),
            models.Index(fields=['status', 'featured']),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:200] or 'listing'
            slug = base
            suffix = 1
            while WebListing.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f'{base}-{suffix}'
                suffix += 1
            self.slug = slug
        if self.status == 'published' and self.published_at is None:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)

    @property
    def on_sale(self) -> bool:
        return bool(self.compare_at_price and self.compare_at_price > self.price)

    @property
    def is_available(self) -> bool:
        return self.status == 'published' and self.stock > 0


class WebListingImage(models.Model):
    """A photo attached to a `WebListing`, backed by a `core.S3File`."""

    listing = models.ForeignKey(WebListing, on_delete=models.CASCADE, related_name='images')
    s3_file = models.ForeignKey(
        'core.S3File', on_delete=models.CASCADE, related_name='web_listing_images',
    )
    alt = models.CharField(max_length=200, blank=True, default='')
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['position', 'id']

    def __str__(self):
        return f'{self.listing_id}:{self.s3_file_id}'


class Order(models.Model):
    """A public storefront order (guest checkout).

    Money fields are captured at order time. Payment is intentionally decoupled:
    `payment_provider`/`payment_status` are filled by a `PaymentProvider`
    (see `apps/webstore/payments.py`) — the default `manual` provider records the
    order as awaiting payment, ready for a real processor (likely Helcim) later.
    """

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('fulfilled', 'Fulfilled'),
        ('cancelled', 'Cancelled'),
    ]
    PAYMENT_STATUS_CHOICES = [
        ('unpaid', 'Unpaid'),
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('refunded', 'Refunded'),
        ('failed', 'Failed'),
    ]
    FULFILLMENT_CHOICES = [
        ('pickup', 'In-store pickup'),
        ('ship', 'Ship'),
    ]

    order_number = models.CharField(max_length=20, unique=True, blank=True)

    customer_name = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True, default='')

    fulfillment = models.CharField(max_length=10, choices=FULFILLMENT_CHOICES, default='pickup')
    ship_address1 = models.CharField(max_length=200, blank=True, default='')
    ship_address2 = models.CharField(max_length=200, blank=True, default='')
    ship_city = models.CharField(max_length=120, blank=True, default='')
    ship_state = models.CharField(max_length=40, blank=True, default='')
    ship_postal = models.CharField(max_length=20, blank=True, default='')

    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    shipping = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='pending')
    payment_provider = models.CharField(max_length=30, blank=True, default='')
    payment_status = models.CharField(max_length=12, choices=PAYMENT_STATUS_CHOICES, default='unpaid')
    payment_reference = models.CharField(max_length=200, blank=True, default='')

    customer_note = models.TextField(blank=True, default='')
    staff_note = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['payment_status']),
        ]

    def __str__(self):
        return self.order_number or f'order #{self.pk}'

    def save(self, *args, **kwargs):
        creating = self._state.adding and not self.order_number
        super().save(*args, **kwargs)
        if creating and not self.order_number:
            self.order_number = f'ETW{self.pk:05d}'
            super().save(update_fields=['order_number'])

    @property
    def item_count(self) -> int:
        return sum(line.quantity for line in self.lines.all())


class OrderLine(models.Model):
    """A single line in an `Order`. Snapshots title/price so history is stable even
    if the listing is later edited or deleted."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='lines')
    listing = models.ForeignKey(
        WebListing, on_delete=models.SET_NULL, null=True, blank=True, related_name='order_lines',
    )
    title = models.CharField(max_length=200)
    slug = models.CharField(max_length=220, blank=True, default='')
    sku = models.CharField(max_length=40, blank=True, default='')
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    quantity = models.PositiveIntegerField(default=1)
    line_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.quantity}× {self.title}'
