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


# Unambiguous alphabet - no I, O, L, 0, 1.
_PICKUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'


def generate_pickup_code(length: int = 5) -> str:
    """Short uppercase code for counter lookup (e.g. K7M4Q)."""
    return ''.join(secrets.choice(_PICKUP_CODE_ALPHABET) for _ in range(length))


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
        ('pending_verification', 'Pending verification'),
        ('requested', 'Requested'),
        ('confirmed', 'Confirmed'),
        ('ready_for_pickup', 'Ready for pickup'),
        ('completed', 'Completed'),
        ('declined', 'Declined'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ]
    # pending_verification keeps stock reserved and POS/listing guards working;
    # staff querysets hide it until the email is proven.
    ACTIVE_STATUSES = ('pending_verification', 'requested', 'confirmed', 'ready_for_pickup')
    STAFF_VISIBLE_STATUSES = ('requested', 'confirmed', 'ready_for_pickup', 'completed', 'declined', 'expired', 'cancelled')
    # Terminal = the hold is finished either way; only these may be archived.
    RELEASED_STATUSES = ('declined', 'expired', 'cancelled')
    TERMINAL_STATUSES = ('completed', 'declined', 'expired', 'cancelled')

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
    pickup_code = models.CharField(max_length=5, unique=True, db_index=True)
    idempotency_key = models.CharField(max_length=128, blank=True, default='', db_index=True)

    customer_name = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True, default='')
    quantity = models.PositiveIntegerField(default=1)
    customer_note = models.TextField(blank=True, default='')
    staff_note = models.TextField(blank=True, default='')
    release_reason = models.CharField(max_length=200, blank=True, default='')

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

    # Archive is presentation-only: it hides a finished hold from the staff
    # queues. It never changes status, releases stock, or touches the customer's
    # own view of their hold.
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+',
    )
    # Customer hide from History - separate from staff archive. Restore from
    # Account; never changes status or stock.
    customer_archived_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['listing', 'status']),
            models.Index(fields=['archived_at', 'status']),
            # Holds join to a customer by email, not by FK. Plain index only -
            # db_index=True would also build the varchar_pattern_ops twin.
            models.Index(fields=['email']),
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


class ReservationEvent(models.Model):
    """Append-only hold history. Never updated, never deleted."""

    KIND_CHOICES = [
        ('requested', 'Requested'),
        ('verified', 'Email verified'),
        ('confirmed', 'Confirmed'),
        ('staged', 'Staged'),
        ('extended', 'Extended'),
        ('completed', 'Completed'),
        ('declined', 'Declined'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
        ('reopened', 'Reopened'),
        ('note', 'Staff note'),
    ]

    reservation = models.ForeignKey(
        Reservation, on_delete=models.CASCADE, related_name='events',
    )
    kind = models.CharField(max_length=24, choices=KIND_CHOICES)
    from_status = models.CharField(max_length=24, blank=True, default='')
    to_status = models.CharField(max_length=24, blank=True, default='')
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [
            models.Index(fields=['reservation', 'created_at']),
        ]

    def __str__(self):
        return f'{self.reservation_id} {self.kind} @ {self.created_at}'


class HoldConfirmation(models.Model):
    """One confirmation attempt for a pending hold - code + link secrets, hashed."""

    VIA_CODE = 'code'
    VIA_LINK = 'link'
    VIA_CHOICES = [
        (VIA_CODE, 'Code'),
        (VIA_LINK, 'Link'),
    ]

    reservation = models.ForeignKey(
        Reservation, on_delete=models.CASCADE, related_name='confirmations',
    )
    email = models.EmailField()
    code_hash = models.CharField(max_length=64)
    # unique=True creates the index; do not also set db_index=True (Postgres _like trap).
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_via = models.CharField(max_length=8, choices=VIA_CHOICES, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['reservation', 'confirmed_at', 'expires_at']),
        ]

    def __str__(self):
        state = 'confirmed' if self.confirmed_at else 'pending'
        return f'HoldConfirmation {self.pk} ({state}) for {self.reservation_id}'


class Conversation(models.Model):
    """Staff ↔ customer message thread (inquiry and/or hold-linked)."""

    STATE_CHOICES = [
        ('pending_verification', 'Pending verification'),
        ('needs_reply', 'Needs reply'),
        ('waiting_on_customer', 'Waiting on customer'),
        ('resolved', 'Resolved'),
    ]
    STAFF_VISIBLE_STATES = ('needs_reply', 'waiting_on_customer', 'resolved')

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
    # Hides a resolved thread from the staff inbox; the customer keeps seeing it.
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+',
    )
    # Customer soft-delete: hidden from their Messages only. Staff and the DB
    # row stay. A later staff reply clears this so they see the new message.
    customer_deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-last_message_at', '-created_at']
        indexes = [
            models.Index(fields=['state', 'last_message_at']),
            models.Index(fields=['guest_email']),
            models.Index(fields=['archived_at', 'state']),
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


class StoreHoursOverride(models.Model):
    """Dated holiday / special hours. Wins over weekly AppSetting hours."""

    label = models.CharField(max_length=120)
    date_start = models.DateField()
    date_end = models.DateField()
    closed = models.BooleanField(default=False)
    open = models.CharField(max_length=5, blank=True, default='09:00')
    close = models.CharField(max_length=5, blank=True, default='18:00')
    note = models.CharField(max_length=240, blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='hours_overrides_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['date_start', 'id']
        indexes = [
            models.Index(fields=['is_active', 'date_start', 'date_end']),
        ]

    def __str__(self):
        return f'{self.label} {self.date_start}–{self.date_end}'

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.date_end and self.date_start and self.date_end < self.date_start:
            raise ValidationError({'date_end': 'End date cannot be before start date.'})
        if not self.is_active or not self.date_start or not self.date_end:
            return
        qs = StoreHoursOverride.objects.filter(
            is_active=True,
            date_start__lte=self.date_end,
            date_end__gte=self.date_start,
        )
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        if qs.exists():
            other = qs.first()
            raise ValidationError(
                {'date_start': f'Overlaps active override "{other.label}" ({other.date_start}–{other.date_end}).'}
            )


class Announcement(models.Model):
    """Customer-facing www announcement, edited in Dash."""

    KIND_PROMOTION = 'promotion'
    KIND_NOTICE = 'notice'
    KIND_HOLIDAY = 'holiday'
    KIND_EVENT = 'event'
    KIND_CHOICES = [
        (KIND_PROMOTION, 'Promotion'),
        (KIND_NOTICE, 'Notice'),
        (KIND_HOLIDAY, 'Holiday'),
        (KIND_EVENT, 'Event'),
    ]
    STYLE_SALE = 'sale'
    STYLE_INFO = 'info'
    STYLE_WARNING = 'warning'
    STYLE_HOLIDAY = 'holiday'
    STYLE_SEASONAL = 'seasonal'
    STYLE_CHOICES = [
        (STYLE_SALE, 'Sale'),
        (STYLE_INFO, 'Info'),
        (STYLE_WARNING, 'Warning'),
        (STYLE_HOLIDAY, 'Holiday'),
        (STYLE_SEASONAL, 'Seasonal'),
    ]
    PLACEMENT_BANNER = 'banner'
    PLACEMENT_HOME_HERO = 'home_hero'
    PLACEMENT_HOME_CARD = 'home_card'
    PLACEMENT_VISIT = 'visit'
    PLACEMENT_SHOP = 'shop'
    PLACEMENT_CHOICES = [
        PLACEMENT_BANNER,
        PLACEMENT_HOME_HERO,
        PLACEMENT_HOME_CARD,
        PLACEMENT_VISIT,
        PLACEMENT_SHOP,
    ]

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_PROMOTION)
    style = models.CharField(max_length=20, choices=STYLE_CHOICES, default=STYLE_INFO)
    body_json = models.JSONField(default=dict, blank=True)
    body_html = models.TextField(blank=True, default='')
    body_text = models.TextField(blank=True, default='')
    cta_label = models.CharField(max_length=80, blank=True, default='')
    cta_url = models.CharField(max_length=400, blank=True, default='')
    placements = models.JSONField(default=list, blank=True)
    priority = models.IntegerField(default=0)
    dismissible = models.BooleanField(default=True)
    is_active = models.BooleanField(default=False)
    is_template = models.BooleanField(default=False)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    linked_hours_override = models.ForeignKey(
        StoreHoursOverride, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='announcements',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='announcements_created',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='announcements_updated',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-priority', '-updated_at']
        indexes = [
            models.Index(fields=['is_active', 'is_template', 'starts_at', 'ends_at']),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:200] or 'announcement'
            slug = base
            suffix = 1
            while Announcement.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f'{base}-{suffix}'
                suffix += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def apply_body(self, *, body_html=None, body_json=None):
        from apps.core.html_sanitize import clean_blog_html, html_to_text

        if body_json is not None:
            self.body_json = body_json
        if body_html is not None:
            self.body_html = clean_blog_html(body_html)
            self.body_text = html_to_text(self.body_html)

    def is_live(self, now=None) -> bool:
        if self.is_template or not self.is_active:
            return False
        now = now or timezone.now()
        if self.starts_at and now < self.starts_at:
            return False
        if self.ends_at and now > self.ends_at:
            return False
        return True


class AnnouncementImage(models.Model):
    """A photo on an announcement, backed by a `core.S3File`."""

    announcement = models.ForeignKey(
        Announcement, on_delete=models.CASCADE, related_name='images',
    )
    s3_file = models.ForeignKey(
        'core.S3File', on_delete=models.CASCADE, related_name='announcement_images',
    )
    alt = models.CharField(max_length=200, blank=True, default='')
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.announcement_id}:{self.s3_file_id}'

    @property
    def url(self) -> str:
        return f'/api/webstore/public/announcement-images/{self.pk}/'


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
