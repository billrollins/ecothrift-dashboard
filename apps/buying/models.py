from __future__ import annotations

from django.db import models


class Marketplace(models.Model):
    """B-Stock marketplace or seller (for example Amazon Liquidation Auctions)."""

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=120, unique=True, db_index=True)
    external_id = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        unique=True,
        db_index=True,
        help_text='B-Stock storeFrontId for search API',
    )
    base_url = models.URLField(max_length=500, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class Auction(models.Model):
    STATUS_OPEN = 'open'
    STATUS_CLOSING = 'closing'
    STATUS_CLOSED = 'closed'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_CLOSING, 'Closing'),
        (STATUS_CLOSED, 'Closed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    marketplace = models.ForeignKey(
        Marketplace,
        on_delete=models.CASCADE,
        related_name='auctions',
    )
    external_id = models.CharField(
        max_length=120,
        db_index=True,
        help_text='B-Stock listingId (primary listing identifier)',
    )
    lot_id = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        db_index=True,
        help_text='B-Stock lotId (e.g. listing.bstock.com groups?lotId=)',
    )
    group_id = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        db_index=True,
        help_text='B-Stock groupId for order-process manifest URL path',
    )
    auction_ext_id = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        help_text='B-Stock auction id from auction service (bids)',
    )
    seller_id = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        help_text='storeFrontId for this listing (reference)',
    )
    title = models.CharField(max_length=500, blank=True, default='')
    description = models.TextField(blank=True, default='')
    url = models.URLField(max_length=1000, blank=True, default='')
    category = models.CharField(max_length=300, blank=True, default='')
    condition_summary = models.CharField(max_length=500, blank=True, default='')
    lot_size = models.PositiveIntegerField(null=True, blank=True)
    current_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    starting_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    buy_now_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    bid_count = models.PositiveIntegerField(null=True, blank=True)
    time_remaining_seconds = models.IntegerField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_OPEN,
        db_index=True,
    )
    has_manifest = models.BooleanField(default=False)
    ai_score = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
    )
    ai_score_data = models.JSONField(default=dict, blank=True)
    first_seen_at = models.DateTimeField(null=True, blank=True)
    last_updated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-last_updated_at', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['marketplace', 'external_id'],
                name='buying_auction_marketplace_external_id_uniq',
            ),
        ]
        indexes = [
            models.Index(fields=['marketplace', 'status']),
        ]

    def __str__(self) -> str:
        return f'{self.external_id}: {self.title[:60]}' if self.title else self.external_id


class AuctionSnapshot(models.Model):
    """Time-series sample for a watched auction (Phase 2 uses this heavily)."""

    auction = models.ForeignKey(
        Auction,
        on_delete=models.CASCADE,
        related_name='snapshots',
    )
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    bid_count = models.PositiveIntegerField(null=True, blank=True)
    time_remaining_seconds = models.IntegerField(null=True, blank=True)
    captured_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-captured_at']
        indexes = [
            models.Index(fields=['auction', 'captured_at']),
        ]

    def __str__(self) -> str:
        return f'{self.auction_id} @ {self.captured_at}'


class ManifestRow(models.Model):
    auction = models.ForeignKey(
        Auction,
        on_delete=models.CASCADE,
        related_name='manifest_rows',
    )
    row_number = models.PositiveIntegerField()
    raw_data = models.JSONField(default=dict, blank=True)
    title = models.CharField(max_length=500, blank=True, default='')
    brand = models.CharField(max_length=300, blank=True, default='')
    model = models.CharField(max_length=300, blank=True, default='')
    category = models.CharField(max_length=300, blank=True, default='')
    sku = models.CharField(max_length=200, blank=True, default='')
    upc = models.CharField(max_length=64, blank=True, default='')
    quantity = models.PositiveIntegerField(null=True, blank=True)
    retail_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    condition = models.CharField(max_length=200, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['auction', 'row_number']
        constraints = [
            models.UniqueConstraint(
                fields=['auction', 'row_number'],
                name='buying_manifestrow_auction_row_uniq',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.auction_id} row {self.row_number}'


class WatchlistEntry(models.Model):
    PRIORITY_LOW = 'low'
    PRIORITY_MEDIUM = 'medium'
    PRIORITY_HIGH = 'high'
    PRIORITY_CRITICAL = 'critical'
    PRIORITY_CHOICES = [
        (PRIORITY_LOW, 'Low'),
        (PRIORITY_MEDIUM, 'Medium'),
        (PRIORITY_HIGH, 'High'),
        (PRIORITY_CRITICAL, 'Critical'),
    ]

    STATUS_WATCHING = 'watching'
    STATUS_BIDDING = 'bidding'
    STATUS_WON = 'won'
    STATUS_LOST = 'lost'
    STATUS_PASSED = 'passed'
    STATUS_CHOICES = [
        (STATUS_WATCHING, 'Watching'),
        (STATUS_BIDDING, 'Bidding'),
        (STATUS_WON, 'Won'),
        (STATUS_LOST, 'Lost'),
        (STATUS_PASSED, 'Passed'),
    ]

    auction = models.OneToOneField(
        Auction,
        on_delete=models.CASCADE,
        related_name='watchlist_entry',
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default=PRIORITY_MEDIUM,
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_WATCHING,
        db_index=True,
    )
    notes = models.TextField(blank=True, default='')
    poll_interval_seconds = models.PositiveIntegerField(default=60)
    added_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self) -> str:
        return f'Watch {self.auction_id}'


class Bid(models.Model):
    STRATEGY_EARLY_MAX = 'early_max'
    STRATEGY_INCREMENTAL = 'incremental'
    STRATEGY_SNIPE = 'snipe'
    STRATEGY_OTHER = 'other'
    STRATEGY_CHOICES = [
        (STRATEGY_EARLY_MAX, 'Early max'),
        (STRATEGY_INCREMENTAL, 'Incremental'),
        (STRATEGY_SNIPE, 'Snipe'),
        (STRATEGY_OTHER, 'Other'),
    ]

    auction = models.ForeignKey(
        Auction,
        on_delete=models.CASCADE,
        related_name='bids',
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    strategy = models.CharField(
        max_length=20,
        choices=STRATEGY_CHOICES,
        default=STRATEGY_OTHER,
    )
    bid_time = models.DateTimeField()
    was_winning = models.BooleanField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-bid_time']

    def __str__(self) -> str:
        return f'{self.auction_id} {self.amount}'


class Outcome(models.Model):
    auction = models.OneToOneField(
        Auction,
        on_delete=models.CASCADE,
        related_name='outcome',
    )
    hammer_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    fees = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    shipping_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    total_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    win = models.BooleanField(default=False)
    margin_estimate = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    notes = models.TextField(blank=True, default='')
    captured_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'Outcome {self.auction_id}'
