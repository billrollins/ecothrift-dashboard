"""FilterSets for buying API."""

from __future__ import annotations

from decimal import Decimal

import django_filters
from django.db.models import Exists, OuterRef

from apps.buying.models import Auction, ManifestRow


class WatchlistAuctionFilter(django_filters.FilterSet):
    """Query params: marketplace (slug or CSV), priority, watchlist_status, etc."""

    marketplace = django_filters.CharFilter(method='filter_marketplace')
    priority = django_filters.CharFilter(field_name='watchlist_entry__priority')
    watchlist_status = django_filters.CharFilter(field_name='watchlist_entry__status')
    status = django_filters.CharFilter(field_name='status')
    has_manifest = django_filters.CharFilter(method='filter_watchlist_has_manifest')
    thumbs_up = django_filters.BooleanFilter(field_name='thumbs_up')
    profitable = django_filters.BooleanFilter(method='filter_profitable')
    needed = django_filters.BooleanFilter(method='filter_needed')

    class Meta:
        model = Auction
        fields = [
            'marketplace',
            'priority',
            'watchlist_status',
            'status',
            'has_manifest',
            'thumbs_up',
            'profitable',
            'needed',
        ]

    def filter_watchlist_has_manifest(self, queryset, name, value):
        if value is None or value == '':
            return queryset
        s = str(value).strip().lower()
        manifest_exists = Exists(ManifestRow.objects.filter(auction_id=OuterRef('pk')))
        if s in ('true', '1', 'yes', 'on'):
            return queryset.filter(manifest_exists)
        if s in ('false', '0', 'no', 'off'):
            return queryset.exclude(manifest_exists)
        return queryset

    def filter_marketplace(self, queryset, name, value):
        if not value:
            return queryset
        raw = str(value).strip()
        if not raw:
            return queryset
        if ',' in raw:
            slugs = [s.strip() for s in raw.split(',') if s.strip()]
            if not slugs:
                return queryset
            return queryset.filter(marketplace__slug__in=slugs)
        return queryset.filter(marketplace__slug__iexact=raw)

    def filter_profitable(self, queryset, name, value):
        if value is not True:
            return queryset
        return queryset.filter(profitability_ratio__gte=Decimal('1.5'))

    def filter_needed(self, queryset, name, value):
        if value is not True:
            return queryset
        return queryset.filter(need_score__gt=Decimal('0'))


class AuctionFilter(django_filters.FilterSet):
    """Query params: marketplace, status, has_manifest, thumbs_up, profitable, needed."""

    marketplace = django_filters.CharFilter(method='filter_marketplace')
    status = django_filters.CharFilter(field_name='status')
    # Explicit parsing — BooleanFilter can miss some query-string serializations from clients.
    has_manifest = django_filters.CharFilter(method='filter_has_manifest')
    thumbs_up = django_filters.BooleanFilter(field_name='thumbs_up')
    profitable = django_filters.BooleanFilter(method='filter_profitable')
    needed = django_filters.BooleanFilter(method='filter_needed')

    class Meta:
        model = Auction
        fields = ['marketplace', 'status', 'has_manifest', 'thumbs_up', 'profitable', 'needed']

    def filter_has_manifest(self, queryset, name, value):
        if value is None or value == '':
            return queryset
        s = str(value).strip().lower()
        # Use manifest rows, not the denormalized boolean (can be stale vs. CSV uploads).
        manifest_exists = Exists(ManifestRow.objects.filter(auction_id=OuterRef('pk')))
        if s in ('true', '1', 'yes', 'on'):
            return queryset.filter(manifest_exists)
        if s in ('false', '0', 'no', 'off'):
            return queryset.exclude(manifest_exists)
        return queryset

    def filter_profitable(self, queryset, name, value):
        """When true: marginal or better (ratio >= 1.5), aligned with UI pill bands."""
        if value is not True:
            return queryset
        return queryset.filter(profitability_ratio__gte=Decimal('1.5'))

    def filter_needed(self, queryset, name, value):
        """When true: need_score strictly above zero."""
        if value is not True:
            return queryset
        return queryset.filter(need_score__gt=Decimal('0'))

    def filter_marketplace(self, queryset, name, value):
        if not value:
            return queryset
        raw = str(value).strip()
        if not raw:
            return queryset
        if ',' in raw:
            slugs = [s.strip() for s in raw.split(',') if s.strip()]
            if not slugs:
                return queryset
            return queryset.filter(marketplace__slug__in=slugs)
        return queryset.filter(marketplace__slug__iexact=raw)
