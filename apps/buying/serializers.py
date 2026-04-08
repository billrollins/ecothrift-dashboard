"""DRF serializers for buying API."""

from __future__ import annotations

from django.db.models import Count
from rest_framework import serializers

from apps.buying.models import Auction, AuctionSnapshot, ManifestRow, Marketplace, WatchlistEntry


class MarketplaceSerializer(serializers.ModelSerializer):
    """Active marketplace for filters and nested auction payloads."""

    class Meta:
        model = Marketplace
        fields = ['id', 'name', 'slug', 'external_id']


class AuctionListSerializer(serializers.ModelSerializer):
    marketplace = MarketplaceSerializer(read_only=True)

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
            'condition_summary',
            'status',
            'has_manifest',
            'last_updated_at',
        ]


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
            'category',
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
            'category_distribution',
            'watchlist_entry',
            'last_updated_at',
            'first_seen_at',
        ]

    def get_category_distribution(self, obj: Auction) -> dict:
        """Top 5 canonical categories by row %, Other, and not-yet-categorized (null canonical)."""
        rows = ManifestRow.objects.filter(auction=obj)
        total = rows.count()
        if total == 0:
            return {
                'total_rows': 0,
                'top': [],
                'other': None,
                'not_yet_categorized': {'count': 0, 'pct': 0.0},
            }

        not_cat = rows.filter(canonical_category__isnull=True).count()
        not_pct = round(100.0 * not_cat / total, 2)

        agg = (
            rows.exclude(canonical_category__isnull=True)
            .values('canonical_category')
            .annotate(c=Count('id'))
        )
        items = [(r['canonical_category'], r['c']) for r in agg]
        items.sort(key=lambda x: -x[1])

        top5 = items[:5]
        rest = items[5:]
        other_count = sum(c for _name, c in rest)

        top = [
            {
                'canonical_category': name,
                'count': c,
                'pct': round(100.0 * c / total, 2),
            }
            for name, c in top5
        ]
        other = None
        if other_count:
            other = {
                'count': other_count,
                'pct': round(100.0 * other_count / total, 2),
            }

        return {
            'total_rows': total,
            'top': top,
            'other': other,
            'not_yet_categorized': {'count': not_cat, 'pct': not_pct},
        }
