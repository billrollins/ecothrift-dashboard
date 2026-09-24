from __future__ import annotations

from django.conf import settings
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
    requires_login = models.BooleanField(
        default=False,
        db_default=False,
        help_text=(
            "B-Stock shows this seller's auctions only to a signed-in buyer (Costco). The sweep "
            "searches it with the owner's handed-over login while that login is live."
        ),
    )
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
    """Per-canonical-category sell-through stats for auction valuation (Phase 5)."""

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


class CategoryStats(models.Model):
    """Daily SQL aggregates per taxonomy_v1 category (single source for valuation need/rates)."""

    category = models.CharField(max_length=200, unique=True, db_index=True)
    recovery_rate = models.DecimalField(
        max_digits=8,
        decimal_places=6,
        help_text=(
            '0-1; SUM(sold_for)/SUM(retail_value) for all-time sold rows where sold_for, '
            'retail_value, and cost are each between 0.01 and 9999; 0 when denominator is zero.'
        ),
    )
    have_retail = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    have_units = models.PositiveIntegerField(default=0)
    want_retail = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    want_units = models.PositiveIntegerField(default=0)
    need_retail = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    need_units = models.IntegerField(default=0)
    computed_at = models.DateTimeField(auto_now=True)
    recovery_sold_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    recovery_retail_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    recovery_cost_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='SUM(cost) for qualifying sold rows (same cohort as recovery_rate).',
    )
    good_data_sample_size = models.PositiveIntegerField(
        default=0,
        help_text='Count of sold rows in the good-data cohort (sale, retail, cost each 0.01-9999).',
    )
    avg_sold_price = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=(
            'Mean sold_for per qualifying sold row (sale + retail + cost each in [0.01, 9999], all-time).'
        ),
    )
    avg_retail = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=(
            'Mean retail_value per qualifying sold row (sale + retail + cost each in [0.01, 9999], all-time).'
        ),
    )
    avg_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=(
            'Mean cost per qualifying sold row (sale + retail + cost each in [0.01, 9999], all-time).'
        ),
    )
    need_score_1to99 = models.PositiveSmallIntegerField(
        default=50,
        help_text=(
            'Need v2 (1-99): weeks of cover (shelf + pipeline) against the target weeks; '
            '50 = on target, higher = short, lower = overstocked. Recomputed daily.'
        ),
    )
    # Need v2 inputs (daily job). Pipeline = stock we own that is not on the shelf yet.
    in_building_units = models.PositiveIntegerField(default=0, db_default=0, help_text='Items in intake or processing.')
    in_building_retail = models.DecimalField(max_digits=14, decimal_places=2, default=0, db_default=0)
    on_order_units = models.PositiveIntegerField(
        default=0, db_default=0, help_text='Manifest units on open POs with no item yet (ordered to processing).'
    )
    on_order_retail = models.DecimalField(max_digits=14, decimal_places=2, default=0, db_default=0)
    weekly_sales_units = models.DecimalField(
        max_digits=10, decimal_places=2, default=0, db_default=0, help_text='Units sold per week over the need window.'
    )
    cover_weeks = models.DecimalField(
        max_digits=8, decimal_places=1, null=True, blank=True,
        help_text='(shelf + pipeline) / weekly sales; empty when nothing sold.',
    )
    target_weeks = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    median_days_to_sell = models.PositiveIntegerField(null=True, blank=True)
    sold_within_90_pct = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    sell_through_30_pct = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True,
        help_text='Of items shelved 30-180 days ago, % sold within 30 days (unsold count against). Empty under 20 items.',
    )

    class Meta:
        ordering = ['category']

    def __str__(self) -> str:
        return self.category


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

    MANIFEST_SOURCE_AUTO = 'auto'
    MANIFEST_SOURCE_MANUAL = 'manual'
    MANIFEST_SOURCE_CHOICES = [
        (MANIFEST_SOURCE_AUTO, 'Pulled from B-Stock'),
        (MANIFEST_SOURCE_MANUAL, 'Uploaded CSV'),
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
    # From the search listing (palletCount, else "23 Pallets" in the title). db_default: the
    # sweep inserts with raw SQL.
    pallet_count = models.PositiveIntegerField(null=True, blank=True)
    origin_city = models.CharField(
        max_length=120,
        blank=True,
        default='',
        db_default='',
        help_text='Where the lot ships from: B-Stock sellerCity, provinceCode (e.g. "Franklin, IN").',
    )
    origin_zip = models.CharField(max_length=12, blank=True, default='', db_default='')
    shipment_type = models.CharField(
        max_length=20,
        blank=True,
        default='',
        db_default='',
        help_text='B-Stock shipmentType: Truckload, LTL, or PARCEL.',
    )
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

    # Phase 5 - auction valuation (computed fields populated in later steps)
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
        help_text=(
            'Optional user override for shipping in dollars; else the B-Stock shipping quote; '
            'else shipping rate times current price.'
        ),
    )
    # Nullable on purpose: the hourly sweep inserts auctions with raw SQL that omits these.
    shipping_quote = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="B-Stock's freight quote to the buyer's address, in dollars.",
    )
    shipping_quote_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the quote was read from B-Stock.',
    )
    shipping_quote_info = models.JSONField(
        null=True,
        blank=True,
        help_text='Carrier, mode (TL / LTL), trucks, destination ZIP, quote id, and B-Stock quote time.',
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
    need_score = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text='1-99 weighted mix of CategoryStats.need_score_1to99 for this auction.',
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
        help_text='1-99; higher surfaces first when auto-ranked.',
    )
    priority_override = models.BooleanField(
        default=False,
        help_text='True when priority was set manually and should not be overwritten by auto recompute.',
    )
    est_profit = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Expected profit after shrink vs total cost (lightweight/full recompute).',
    )
    archived_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text='When set, auction is archived (hidden from default lists and sweeps).',
    )
    manifest_pulled_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text='When manifest rows were last saved, by auto pull or CSV upload.',
    )
    # db_default: sweep_upsert inserts auctions with raw SQL that does not name these columns.
    manifest_source = models.CharField(
        max_length=10,
        choices=MANIFEST_SOURCE_CHOICES,
        blank=True,
        default='',
        db_default='',
        help_text='Where the current manifest rows came from; blank when there are none.',
    )
    manifest_pull_attempted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Last auto pull attempt, success or not. The shortlist waits before retrying a failure.',
    )
    manifest_pull_error = models.CharField(
        max_length=300,
        blank=True,
        default='',
        db_default='',
        help_text='Why the last auto pull failed; cleared on success.',
    )
    manifest_pull_blocked = models.BooleanField(
        default=False,
        db_default=False,
        help_text='B-Stock will never give this manifest (too large, or none); the pull stops trying.',
    )
    # Buying Phase 4: manifest lines matched to our products, hazards and a line-by-line value.
    manifest_analysis = models.JSONField(
        null=True,
        blank=True,
        help_text='Summary from services/manifest_analysis.py: match coverage, hazards, top lines.',
    )
    analysis_revenue = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Truck value v2: expected revenue summed line by line (before shrink).',
    )
    # Buying Phase 5 (services/price_target.py).
    price_target = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Buy at or under: the most we can pay and still make the profit factor.',
    )
    expected_close = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Likely hammer price (retail x seller close ratio, or price x the late bump).',
    )
    # The buyer's own max bid and notes (the auction page's "Your max bid" and "Notes").
    max_bid = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="The buyer's own max; the wish list measures room against it (else the price target).",
    )
    buyer_notes = models.TextField(blank=True, default='', db_default='')
    # Buying Phase 6 (services/won_to_po.py): the PO a won auction became.
    purchase_order = models.ForeignKey(
        'inventory.PurchaseOrder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='buying_auctions',
    )

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


class AuctionThumbsVote(models.Model):
    """Staff thumbs-up per auction (at most one row per staff user per auction)."""

    auction = models.ForeignKey(
        Auction,
        on_delete=models.CASCADE,
        related_name='staff_thumbs_votes',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='auction_thumbs_votes',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['auction', 'user'],
                name='buying_auction_thumbs_vote_auction_user_uniq',
            ),
        ]
        indexes = [
            models.Index(fields=['auction']),
        ]

    def __str__(self) -> str:
        return f'auction {self.auction_id} user {self.user_id}'


class AuctionSnapshot(models.Model):
    """Price over time: every watched-auction poll, plus each hourly sweep when the price or bid count moves."""

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
    # Buying Phase 4 (services/manifest_analysis.py).
    matched_product = models.ForeignKey(
        'inventory.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='buying_manifest_rows',
    )
    match_method = models.CharField(
        max_length=8,
        blank=True,
        default='',
        db_default='',
        help_text="How the line was matched: 'upc', 'title' (same title) or 'near' (similar title).",
    )
    match_score = models.DecimalField(max_digits=4, decimal_places=3, null=True, blank=True)
    hazards = models.JSONField(null=True, blank=True, help_text='Hazard codes for this line.')
    unit_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Expected revenue per unit, after hazard discounts.',
    )
    value_basis = models.CharField(
        max_length=10,
        blank=True,
        default='',
        db_default='',
        help_text="'product' (this product's own sales) or 'category' (the category rate).",
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


class ManifestPullLog(models.Model):
    """One row per manifest pull attempt with the owner's login (a routine Pull, or a resumed job)."""

    auction = models.ForeignKey(
        Auction,
        on_delete=models.CASCADE,
        related_name='manifest_pull_logs',
    )
    started_at = models.DateTimeField()
    completed_at = models.DateTimeField(auto_now_add=True, db_index=True)
    rows_downloaded = models.PositiveIntegerField(default=0)
    api_calls = models.PositiveIntegerField(default=0)
    duration_seconds = models.FloatField(default=0)
    used_socks5 = models.BooleanField(default=False)
    success = models.BooleanField(default=True)
    error_message = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-completed_at']

    def __str__(self) -> str:
        return f'auction {self.auction_id} @ {self.completed_at}'


class ShippingOrigin(models.Model):
    """A city lots ship from, with its driving distance from the store (for the shipping formula)."""

    slug = models.SlugField(max_length=120, unique=True)
    city = models.CharField(max_length=120, help_text='"City, ST" as B-Stock or a PO names it.')
    miles = models.PositiveIntegerField(null=True, blank=True, help_text='Driving miles from the store.')
    looked_up_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['city']

    def __str__(self) -> str:
        return f'{self.city} ({self.miles} mi)' if self.miles else self.city


class BStockToken(models.Model):
    """
    A superuser's B-Stock login token (the RS256 JWT B-Stock's own pages use, about an hour).

    Handed over from bstock.com by the Send-to-Eco-Thrift bookmarklet. Kept in the database so
    the web and Scheduler dynos see the same one. Never returned by the API.
    """

    token = models.TextField()
    expires_at = models.DateTimeField(null=True, blank=True)
    saved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    saved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-saved_at']

    def __str__(self) -> str:
        return f'B-Stock token saved {self.saved_at:%Y-%m-%d %H:%M}'


class ManifestPullJob(models.Model):
    """One run over the manifest shortlist. Started only by the routine's Pull; the scheduler resumes it."""

    STATUS_QUEUED = 'queued'
    STATUS_RUNNING = 'running'
    STATUS_DONE = 'done'
    STATUS_FAILED = 'failed'
    STATUS_STOPPED = 'stopped'
    STATUS_CHOICES = [
        (STATUS_QUEUED, 'Queued'),
        (STATUS_RUNNING, 'Running'),
        (STATUS_DONE, 'Done'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_STOPPED, 'Stopped by owner'),
    ]
    LIVE_STATUSES = (STATUS_QUEUED, STATUS_RUNNING)

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_QUEUED)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    heartbeat_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Touched after every page, mapping batch, and auction; a job that goes quiet is picked up again.',
    )
    runner = models.CharField(
        max_length=32,
        blank=True,
        default='',
        help_text='Token of the thread or scheduler run that owns the job; a runner that loses it stops.',
    )
    auction_ids = models.JSONField(
        default=list,
        blank=True,
        help_text='The shortlist fixed when the job first ran; a resumed job works through the rest.',
    )
    total = models.PositiveIntegerField(default=0)
    done_count = models.PositiveIntegerField(default=0)
    ok_count = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=300, blank=True, default='')
    results = models.JSONField(
        default=list,
        blank=True,
        help_text='[{auction_id, title, ok, rows, error}] in pull order.',
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'manifest pull {self.pk} {self.status} {self.done_count}/{self.total}'


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
    prediction = models.JSONField(
        null=True,
        blank=True,
        help_text='What we predicted when it was won (revenue, profit, days to sell): the report card.',
    )
    notes = models.TextField(blank=True, default='')
    captured_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'Outcome {self.auction_id}'
