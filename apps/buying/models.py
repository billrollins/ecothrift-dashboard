from __future__ import annotations

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.buying.taxonomy_v1 import TAXONOMY_V1_CHOICES


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
    default_fee_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        null=True,
        blank=True,
        help_text='Historical avg fee as fraction of purchase price (e.g. 0.03 = 3%).',
    )
    default_shipping_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        null=True,
        blank=True,
        help_text='Historical avg shipping as fraction of purchase price.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class CategoryWantVote(models.Model):
    """Staff 1–10 want score per taxonomy category (Phase 5 category need panel)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='category_want_votes',
    )
    category = models.CharField(max_length=64, choices=TAXONOMY_V1_CHOICES, db_index=True)
    value = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text='1 = skip, 10 = want; neutral target is 5.',
    )
    voted_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'category'],
                name='buying_categorywantvote_user_category_uniq',
            ),
        ]
        ordering = ['category', 'user_id']

    def __str__(self) -> str:
        return f'{self.user_id} {self.category}: {self.value}'


class CategoryMapping(models.Model):
    """Global manifest category string → canonical taxonomy (Phase 4). Unique on source_key only."""

    RULE_SEEDED = 'seeded'
    RULE_AI = 'ai'
    RULE_MANUAL = 'manual'
    RULE_ORIGIN_CHOICES = [
        (RULE_SEEDED, 'Seeded'),
        (RULE_AI, 'AI'),
        (RULE_MANUAL, 'Manual'),
    ]

    source_key = models.CharField(
        max_length=500,
        unique=True,
        db_index=True,
        help_text='Lookup key: typically ManifestRow.fast_cat_key (vendor-prefixed slug).',
    )
    canonical_category = models.CharField(max_length=64, choices=TAXONOMY_V1_CHOICES)
    rule_origin = models.CharField(max_length=16, choices=RULE_ORIGIN_CHOICES)
    ai_reasoning = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['source_key']

    def __str__(self) -> str:
        return f'{self.source_key[:40]}… → {self.canonical_category}' if len(self.source_key) > 40 else f'{self.source_key} → {self.canonical_category}'


class PricingRule(models.Model):
    """Per–canonical-category sell-through stats for auction valuation (Phase 5)."""

    category = models.CharField(max_length=200, unique=True, db_index=True)
    sell_through_rate = models.DecimalField(
        max_digits=6,
        decimal_places=4,
        help_text='Ratio sold/retail (e.g. 0.4448 = 44.48%).',
    )
    avg_retail = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    avg_sold_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    sample_size = models.IntegerField(default=0)
    version_date = models.DateField()
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-sample_size']

    def __str__(self) -> str:
        return f'{self.category} ({self.sell_through_rate:.2%})'


class ManifestTemplate(models.Model):
    """Vendor + CSV header signature: column mapping and fast_cat_key rules (Phase 4.1A)."""

    marketplace = models.ForeignKey(
        Marketplace,
        on_delete=models.CASCADE,
        related_name='manifest_templates',
    )
    header_signature = models.CharField(max_length=2000, db_index=True)
    display_name = models.CharField(max_length=200)
    column_map = models.JSONField(default=dict, blank=True)
    category_fields = models.JSONField(default=list, blank=True)
    category_field_transforms = models.JSONField(default=dict, blank=True)
    min_fill_threshold = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=0.05,
    )
    is_reviewed = models.BooleanField(default=False, db_index=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['marketplace', 'header_signature']
        constraints = [
            models.UniqueConstraint(
                fields=['marketplace', 'header_signature'],
                name='buying_manifesttemplate_marketplace_header_uniq',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.marketplace.slug}: {self.display_name[:60]}'


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

    # B-Stock search `listingType`: SPOT (inventory), CONTRACT (term / percent-of-retail), etc.
    LISTING_TYPE_CONTRACT = 'CONTRACT'


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
    listing_type = models.CharField(
        max_length=32,
        blank=True,
        default='',
        db_index=True,
        help_text='B-Stock listingType (e.g. SPOT, CONTRACT)',
    )
    total_retail_value = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Extended retail from search (e.g. retailPrice), dollars',
    )
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

    # Phase 5 — auction valuation (computed fields populated in later steps)
    ai_category_estimates = models.JSONField(
        null=True,
        blank=True,
        help_text='Tier 1: AI-estimated category mix (% by taxonomy_v1 name).',
    )
    manifest_category_distribution = models.JSONField(
        null=True,
        blank=True,
        help_text='Tier 2: distribution from manifest fast_cat_value counts.',
    )
    estimated_revenue = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Expected revenue before shrinkage (sumproduct of category mix × sell-through rates).',
    )
    revenue_override = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='User override dollar amount; downstream uses coalesce(override, estimated_revenue).',
    )
    fees_override = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Optional user override for fees in dollars; else fee rate times current price.',
    )
    shipping_override = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Optional user override for shipping in dollars; else shipping rate times current price.',
    )
    estimated_fees = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    estimated_shipping = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    estimated_total_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
    )
    profitability_ratio = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
    )
    need_score = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
    )
    shrinkage_override = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        null=True,
        blank=True,
        help_text='Override global shrinkage factor for this auction.',
    )
    profit_target_override = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        null=True,
        blank=True,
        help_text='Override global profit factor (min revenue/cost ratio target).',
    )
    priority = models.PositiveSmallIntegerField(
        default=50,
        help_text='1–99; higher surfaces first when auto-ranked.',
    )
    priority_override = models.BooleanField(
        default=False,
        help_text='True when priority was set manually and should not be overwritten by auto recompute.',
    )
    thumbs_up = models.BooleanField(default=False)

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
    CONF_DIRECT = 'direct'
    CONF_AI_MAPPED = 'ai_mapped'
    CONF_FALLBACK = 'fallback'
    CONF_FAST_CAT = 'fast_cat'
    CATEGORY_CONFIDENCE_CHOICES = [
        (CONF_DIRECT, 'Direct match'),
        (CONF_AI_MAPPED, 'AI mapped'),
        (CONF_FALLBACK, 'Auction fallback'),
        (CONF_FAST_CAT, 'Fast category (manifest template)'),
    ]

    auction = models.ForeignKey(
        Auction,
        on_delete=models.CASCADE,
        related_name='manifest_rows',
    )
    row_number = models.PositiveIntegerField()
    raw_data = models.JSONField(default=dict, blank=True)
    manifest_template = models.ForeignKey(
        ManifestTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='manifest_rows',
    )
    title = models.CharField(max_length=500, blank=True, default='')
    brand = models.CharField(max_length=300, blank=True, default='')
    model = models.CharField(max_length=300, blank=True, default='')
    fast_cat_key = models.CharField(max_length=500, blank=True, default='')
    fast_cat_value = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        choices=TAXONOMY_V1_CHOICES,
    )
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
    canonical_category = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        choices=TAXONOMY_V1_CHOICES,
    )
    category_confidence = models.CharField(
        max_length=16,
        null=True,
        blank=True,
        choices=CATEGORY_CONFIDENCE_CHOICES,
    )
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
    poll_interval_seconds = models.PositiveIntegerField(
        default=300,
        help_text='Minimum seconds between successful polls for this row (scheduler cadence should exceed this).',
    )
    last_polled_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text='Last successful watch poll that updated auction state and wrote a snapshot.',
    )
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
