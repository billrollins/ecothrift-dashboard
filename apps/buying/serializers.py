"""DRF serializers for buying API."""

from __future__ import annotations

from django.db.models import CharField, Count
from django.db.models.functions import Coalesce
from rest_framework import serializers

from apps.buying.models import Auction, AuctionSnapshot, ManifestRow, Marketplace, WatchlistEntry


class MarketplaceSerializer(serializers.ModelSerializer):
    """Active marketplace for filters and nested auction payloads."""

    class Meta:
        model = Marketplace
        fields = ['id', 'name', 'slug', 'external_id']


class AuctionListSerializer(serializers.ModelSerializer):
    marketplace = MarketplaceSerializer(read_only=True)
    manifest_row_count = serializers.SerializerMethodField()
    retail_sort = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True,
        coerce_to_string=True,
    )
    total_retail_display = serializers.SerializerMethodField()
    retail_source = serializers.SerializerMethodField()

    class Meta:
        model = Auction
        fields = [
            'id',
            'marketplace',
            'title',
            'current_price',
            'bid_count',
            'end_time',
            'time_remaining_seconds',
            'lot_size',
            'total_retail_value',
            'manifest_row_count',
            'retail_sort',
            'total_retail_display',
            'retail_source',
            'condition_summary',
            'status',
            'has_manifest',
            'last_updated_at',
        ]

    def get_manifest_row_count(self, obj: Auction) -> int | None:
        v = getattr(obj, '_manifest_row_count', None)
        return v

    def get_total_retail_display(self, obj: Auction) -> str | None:
        if getattr(obj, '_manifest_row_count', 0) > 0:
            s = getattr(obj, '_manifest_retail_sum', None)
            return str(s) if s is not None else None
        v = obj.total_retail_value
        return str(v) if v is not None else None

    def get_retail_source(self, obj: Auction) -> str:
        if getattr(obj, '_manifest_row_count', 0) > 0:
            return 'manifest'
        return 'listing'


class WatchlistEntrySerializer(serializers.ModelSerializer):
    """Read-only watchlist row for auction detail and idempotent POST response."""

    class Meta:
        model = WatchlistEntry
        fields = [
            'id',
            'priority',
            'status',
            'notes',
            'poll_interval_seconds',
            'last_polled_at',
            'added_at',
        ]


class AuctionWatchlistListSerializer(AuctionListSerializer):
    """Auction list row plus nested watchlist entry (GET /api/buying/watchlist/)."""

    watchlist_entry = WatchlistEntrySerializer(read_only=True)
    added_at = serializers.SerializerMethodField()

    class Meta(AuctionListSerializer.Meta):
        fields = AuctionListSerializer.Meta.fields + ['watchlist_entry', 'added_at']

    def get_added_at(self, obj):
        if hasattr(obj, 'added_at'):
            return obj.added_at
        we = getattr(obj, 'watchlist_entry', None)
        return we.added_at if we else None


class WatchlistEntryWriteSerializer(serializers.Serializer):
    """Optional body for POST /auctions/{id}/watchlist/."""

    priority = serializers.ChoiceField(
        choices=WatchlistEntry.PRIORITY_CHOICES,
        required=False,
        default=WatchlistEntry.PRIORITY_MEDIUM,
    )


class AuctionSnapshotSerializer(serializers.ModelSerializer):
    """Time-series samples for GET .../snapshots/."""

    class Meta:
        model = AuctionSnapshot
        fields = [
            'id',
            'auction',
            'price',
            'bid_count',
            'time_remaining_seconds',
            'captured_at',
        ]
        read_only_fields = [
            'id',
            'auction',
            'price',
            'bid_count',
            'time_remaining_seconds',
            'captured_at',
        ]


class ManifestRowSerializer(serializers.ModelSerializer):
    """Manifest line items for GET .../manifest_rows/."""

    class Meta:
        model = ManifestRow
        fields = [
            'id',
            'row_number',
            'title',
            'brand',
            'model',
            'fast_cat_key',
            'fast_cat_value',
            'canonical_category',
            'category_confidence',
            'sku',
            'upc',
            'quantity',
            'retail_value',
            'condition',
            'notes',
        ]


class AuctionDetailSerializer(serializers.ModelSerializer):
    marketplace = MarketplaceSerializer(read_only=True)
    manifest_row_count = serializers.IntegerField(
        source='manifest_rows_count',
        read_only=True,
    )
    watchlist_entry = WatchlistEntrySerializer(read_only=True, allow_null=True)
    category_distribution = serializers.SerializerMethodField()
    manifest_template_name = serializers.SerializerMethodField()

    class Meta:
        model = Auction
        fields = [
            'id',
            'external_id',
            'marketplace',
            'title',
            'description',
            'url',
            'category',
            'lot_id',
            'current_price',
            'starting_price',
            'buy_now_price',
            'bid_count',
            'end_time',
            'time_remaining_seconds',
            'lot_size',
            'listing_type',
            'total_retail_value',
            'condition_summary',
            'status',
            'has_manifest',
            'manifest_row_count',
            'manifest_template_name',
            'category_distribution',
            'watchlist_entry',
            'last_updated_at',
            'first_seen_at',
        ]

    def get_manifest_template_name(self, obj: Auction) -> str | None:
        r = (
            ManifestRow.objects.filter(auction=obj)
            .select_related('manifest_template')
            .order_by('row_number')
            .first()
        )
        if r and r.manifest_template_id:
            return r.manifest_template.display_name
        return None

    def get_category_distribution(self, obj: Auction) -> dict:
        """All categories by row % (canonical_category or fast_cat_value); not-yet mapped bucket."""
        rows = ManifestRow.objects.filter(auction=obj).annotate(
            display_cat=Coalesce(
                'canonical_category',
                'fast_cat_value',
                output_field=CharField(max_length=64),
            )
        )
        total = rows.count()
        if total == 0:
            return {
                'total_rows': 0,
                'top': [],
                'other': None,
                'not_yet_categorized': {'count': 0, 'pct': 0.0},
            }

        not_cat = rows.filter(display_cat__isnull=True).count()
        not_pct = round(100.0 * not_cat / total, 2)

        agg = (
            rows.exclude(display_cat__isnull=True)
            .values('display_cat')
            .annotate(c=Count('id'))
        )
        items = [(r['display_cat'], r['c']) for r in agg]
        items.sort(key=lambda x: -x[1])

        top = [
            {
                'canonical_category': name,
                'count': c,
                'pct': round(100.0 * c / total, 2),
            }
            for name, c in items
        ]

        return {
            'total_rows': total,
            'top': top,
            'other': None,
            'not_yet_categorized': {'count': not_cat, 'pct': not_pct},
        }
