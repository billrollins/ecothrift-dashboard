"""FilterSets for buying API."""

from __future__ import annotations

import django_filters

from apps.buying.models import Auction


class WatchlistAuctionFilter(django_filters.FilterSet):
    """Query params: priority, watchlist_status (WatchlistEntry fields)."""

    priority = django_filters.CharFilter(field_name='watchlist_entry__priority')
    watchlist_status = django_filters.CharFilter(field_name='watchlist_entry__status')

    class Meta:
        model = Auction
        fields = ['priority', 'watchlist_status']


class AuctionFilter(django_filters.FilterSet):
    """Query params: marketplace (slug or comma-separated slugs), status, has_manifest."""

    marketplace = django_filters.CharFilter(method='filter_marketplace')
    status = django_filters.CharFilter(field_name='status')
    has_manifest = django_filters.BooleanFilter(field_name='has_manifest')
    thumbs_up = django_filters.BooleanFilter(field_name='thumbs_up')

    class Meta:
        model = Auction
        fields = ['marketplace', 'status', 'has_manifest', 'thumbs_up']

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
