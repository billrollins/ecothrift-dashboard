"""Curated web-catalog models for the public storefront.

Item/Product owns operational SKU/cost/status. WebListing owns public
copy/photos/price/qty/publication. Reservation owns hold commitment.
POS/Sale owns payment truth.
"""
from __future__ import annotations

import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


def _public_status_token() -> str:
    return secrets.token_urlsafe(24)


class WebListing(models.Model):
    """A single curated product shown on the public storefront."""

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('ready', 'Ready'),
        ('published', 'Published'),
        ('paused', 'Paused'),
        ('sold', 'Sold'),
        ('archived', 'Archived'),
    ]
    CONDITION_CHOICES = [
        ('new', 'New'),
        ('like_new', 'Like New'),
        ('very_good', 'Very Good'),
        ('good', 'Good'),
        ('fair', 'Fair'),
    ]
    RETURN_POLICY_CHOICES = [
        ('final_sale', 'Final sale'),
        ('return_48h_credit', '48-hour return → store credit'),
    ]

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    category = models.ForeignKey(
        'inventory.Category', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='web_listings',
    )
    item = models.ForeignKey(
        'inventory.Item', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='web_listings',
    )
    sku = models.CharField(max_length=40, blank=True, default='')
    description = models.TextField(blank=True, default='')
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, default='good')

    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    compare_at_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # Quantity truth: on_hand stored; reserved stored; available derived.
    # `stock` is kept as the derived available mirror for legacy public serializers.
    on_hand = models.PositiveIntegerField(default=1)
    reserved = models.PositiveIntegerField(default=0)
    stock = models.PositiveIntegerField(default=1)

    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='draft')
    featured = models.BooleanField(default=False)
    return_policy = models.CharField(
        max_length=32, choices=RETURN_POLICY_CHOICES, default='final_sale',
    )

    fb_title = models.CharField(max_length=200, blank=True, default='')
    fb_body = models.TextField(blank=True, default='')
    fb_posted_url = models.URLField(blank=True, default='')
    fb_posted_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='web_listings_created',
    )
    published_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
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

    @property
    def available(self) -> int:
        return max(0, int(self.on_hand) - int(self.reserved))

    def sync_stock_mirror(self) -> None:
        self.stock = self.available

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:200] or 'listing'
            slug = base
            suffix = 1
            while WebListing.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f'{base}-{suffix}'
                suffix += 1
            self.slug = slug
        self.sync_stock_mirror()
        if self.status == 'published' and self.published_at is None:
            self.published_at = timezone.now()
        if self.status == 'archived' and self.archived_at is None:
            self.archived_at = timezone.now()
        super().save(*args, **kwargs)

    @property
    def on_sale(self) -> bool:
        return bool(self.compare_at_price and self.compare_at_price > self.price)

    @property
    def is_available(self) -> bool:
        return self.status == 'published' and self.available > 0

    def publish_readiness_errors(self) -> list[str]:
        errors: list[str] = []
        if not (self.title or '').strip():
            errors.append('Title is required.')
        if self.price is None or self.price <= 0:
            errors.append('Price must be greater than zero.')
        if not self.images.exists():
            errors.append('At least one photo is required.')
        if not self.return_policy:
            errors.append('Return policy is required.')
        if self.on_hand < 1:
            errors.append('On-hand quantity must be at least 1.')
        return errors


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


class ChannelPublication(models.Model):
    """Persisted channel post draft / posted tracking for a listing."""

    CHANNEL_CHOICES = [
        ('website', 'Website'),
        ('facebook_page', 'Facebook Page'),
    ]
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('posted', 'Posted'),
        ('paused', 'Paused'),
        ('ended', 'Ended'),
    ]

    listing = models.ForeignKey(
        WebListing, on_delete=models.CASCADE, related_name='channel_publications',
    )
    channel = models.CharField(max_length=32, choices=CHANNEL_CHOICES)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='draft')
    title = models.CharField(max_length=200, blank=True, default='')
    body = models.TextField(blank=True, default='')
    external_url = models.URLField(blank=True, default='')
    posted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['channel', 'id']
        unique_together = [('listing', 'channel')]

    def __str__(self):
        return f'{self.listing_id}:{self.channel}:{self.status}'


class Reservation(models.Model):
    """Customer hold request / confirmed pickup reservation."""

    STATUS_CHOICES = [
        ('requested', 'Requested'),
        ('confirmed', 'Confirmed'),
        ('ready_for_pickup', 'Ready for pickup'),
        ('completed', 'Completed'),
        ('declined', 'Declined'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ]
    ACTIVE_STATUSES = ('requested', 'confirmed', 'ready_for_pickup')

    listing = models.ForeignKey(
        WebListing, on_delete=models.PROTECT, related_name='reservations',
    )
    item = models.ForeignKey(
        'inventory.Item', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='web_reservations',
    )
    status_token = models.CharField(
        max_length=48, unique=True, default=_public_status_token, db_index=True,
    )
    idempotency_key = models.CharField(max_length=64, blank=True, default='', db_index=True)

    customer_name = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True, default='')
    quantity = models.PositiveIntegerField(default=1)
    customer_note = models.TextField(blank=True, default='')
    staff_note = models.TextField(blank=True, default='')

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='requested')
    expires_at = models.DateTimeField(null=True, blank=True)
    staged_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    staged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reservations_staged',
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reservations_confirmed',
    )
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reservations_completed',
    )

    pos_cart = models.ForeignKey(
        'pos.Cart', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='web_reservations',
    )
    unit_price_snapshot = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cost_snapshot = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    fee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    direct_expense = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['listing', 'status']),
        ]

    def __str__(self):
        return f'{self.status_token[:8]}… {self.customer_name} ({self.status})'

    @property
    def is_active(self) -> bool:
        return self.status in self.ACTIVE_STATUSES

    @property
    def line_total(self):
        return self.unit_price_snapshot * self.quantity

    @property
    def contribution(self):
        cost = self.cost_snapshot or 0
        return self.line_total - cost - self.fee_amount - self.direct_expense


class Conversation(models.Model):
    """Staff ↔ customer message thread (inquiry and/or hold-linked)."""

    STATE_CHOICES = [
        ('needs_reply', 'Needs reply'),
        ('waiting_on_customer', 'Waiting on customer'),
        ('resolved', 'Resolved'),
    ]

    listing = models.ForeignKey(
        WebListing, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='conversations',
    )
    reservation = models.OneToOneField(
        Reservation, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='conversation',
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='web_conversations',
    )
    guest_name = models.CharField(max_length=200, blank=True, default='')
    guest_email = models.EmailField(blank=True, default='')
    guest_phone = models.CharField(max_length=30, blank=True, default='')
    public_token = models.CharField(
        max_length=48, unique=True, default=_public_status_token, db_index=True,
    )
    state = models.CharField(max_length=24, choices=STATE_CHOICES, default='needs_reply')
    last_message_at = models.DateTimeField(null=True, blank=True)
    staff_owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='web_conversations_owned',
    )
    staff_unread = models.PositiveIntegerField(default=0)
    customer_unread = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-last_message_at', '-created_at']
        indexes = [
            models.Index(fields=['state', 'last_message_at']),
            models.Index(fields=['guest_email']),
        ]

    def __str__(self):
        return f'{self.public_token[:8]}… ({self.state})'


class Message(models.Model):
    """Single message in a Conversation."""

    AUTHOR_CHOICES = [
        ('customer', 'Customer'),
        ('staff', 'Staff'),
        ('system', 'System'),
    ]

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name='messages',
    )
    author_kind = models.CharField(max_length=12, choices=AUTHOR_CHOICES)
    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='web_messages',
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self):
        return f'{self.author_kind}: {self.body[:40]}'


class Order(models.Model):
    """Legacy public storefront order (guest checkout). Kept for history; new
    public flow uses Reservation. Checkout API rejects new creates.
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
    """Legacy order line snapshot."""

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
