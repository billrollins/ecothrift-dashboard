"""FilterSets for buying API."""

from __future__ import annotations

from datetime import timedelta
from datetime import timezone as dt_timezone
from zoneinfo import ZoneInfo

import django_filters
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from apps.buying.models import Auction, AuctionThumbsVote, ManifestRow

CDT = ZoneInfo('America/Chicago')


def cdt_today_window_utc():
    """Start (inclusive) and end (exclusive) of today's calendar date in America/Chicago, as UTC."""
    now = timezone.now()
    now_cdt = now.astimezone(CDT)
    start_cdt = now_cdt.replace(hour=0, minute=0, second=0, microsecond=0)
    end_cdt = start_cdt + timedelta(days=1)
    return start_cdt.astimezone(dt_timezone.utc), end_cdt.astimezone(dt_timezone.utc)


def filter_auction_text_search(queryset, value):
    """
    Split `value` on whitespace; each non-empty term must match
    (title OR marketplace name) ILIKE %term% — AND across terms.
    """
    if value is None:
        return queryset
    raw = str(value).strip()
    if not raw:
        return queryset
    terms = [t for t in raw.split() if t.strip()]
    if not terms:
        return queryset
    qs = queryset
    for term in terms:
        qs = qs.filter(Q(title__icontains=term) | Q(marketplace__name__icontains=term))
    return qs


class WatchlistAuctionFilter(django_filters.FilterSet):
    """Query params: marketplace (slug or CSV), priority, watchlist_status, etc."""

    marketplace = django_filters.CharFilter(method='filter_marketplace')
    priority = django_filters.CharFilter(field_name='watchlist_entry__priority')
    watchlist_status = django_filters.CharFilter(field_name='watchlist_entry__status')
    status = django_filters.CharFilter(field_name='status')
    has_manifest = django_filters.CharFilter(method='filter_watchlist_has_manifest')
    thumbs_up = django_filters.BooleanFilter(method='filter_thumbs_up_for_user')
    today = django_filters.BooleanFilter(method='filter_today_end_cdt')
    archived = django_filters.CharFilter(method='filter_archived')
    q = django_filters.CharFilter(method='filter_q')

    class Meta:
        model = Auction
        fields = [
            'marketplace',
            'priority',
            'watchlist_status',
            'status',
            'has_manifest',
            'thumbs_up',
            'today',
            'archived',
            'q',
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

    def filter_today_end_cdt(self, queryset, name, value):
        """``end_time`` falls on today's calendar date in America/Chicago (UTC window)."""
        if value is not True:
            return queryset
        start_utc, end_utc = cdt_today_window_utc()
        return queryset.filter(end_time__gte=start_utc, end_time__lt=end_utc)

    def filter_archived(self, queryset, name, value):
        if value is None or value == '':
            return queryset
        s = str(value).strip().lower()
        if s in ('true', '1', 'yes', 'on'):
            return queryset.filter(archived_at__isnull=False)
        if s in ('false', '0', 'no', 'off'):
            return queryset.filter(archived_at__isnull=True)
        return queryset

    def filter_q(self, queryset, name, value):
        return filter_auction_text_search(queryset, value)

    def filter_thumbs_up_for_user(self, queryset, name, value):
        """True: current user has a thumbs vote; False: excluded."""
        if value is None:
            return queryset
        req = getattr(self, 'request', None)
        user = getattr(req, 'user', None) if req else None
        if not user or not user.is_authenticated:
            return queryset
        mine = Exists(AuctionThumbsVote.objects.filter(auction_id=OuterRef('pk'), user_id=user.id))
        if value is True:
            return queryset.filter(mine)
        return queryset.exclude(mine)


class AuctionFilter(django_filters.FilterSet):
    """Query params: marketplace, status, has_manifest, thumbs_up, today, q."""

    marketplace = django_filters.CharFilter(method='filter_marketplace')
    status = django_filters.CharFilter(field_name='status')
    # Explicit parsing — BooleanFilter can miss some query-string serializations from clients.
    has_manifest = django_filters.CharFilter(method='filter_has_manifest')
    thumbs_up = django_filters.BooleanFilter(method='filter_thumbs_up_for_user')
    today = django_filters.BooleanFilter(method='filter_today_end_cdt')
    archived = django_filters.CharFilter(method='filter_archived')
    q = django_filters.CharFilter(method='filter_q')

    class Meta:
        model = Auction
        fields = ['marketplace', 'status', 'has_manifest', 'thumbs_up', 'today', 'archived', 'q']

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

    def filter_today_end_cdt(self, queryset, name, value):
        """``end_time`` falls on today's calendar date in America/Chicago (UTC window)."""
        if value is not True:
            return queryset
        start_utc, end_utc = cdt_today_window_utc()
        return queryset.filter(end_time__gte=start_utc, end_time__lt=end_utc)

    def filter_archived(self, queryset, name, value):
        if value is None or value == '':
            return queryset
        s = str(value).strip().lower()
        if s in ('true', '1', 'yes', 'on'):
            return queryset.filter(archived_at__isnull=False)
        if s in ('false', '0', 'no', 'off'):
            return queryset.filter(archived_at__isnull=True)
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

    def filter_thumbs_up_for_user(self, queryset, name, value):
        """True: current user has a thumbs vote; False: excluded."""
        if value is None:
            return queryset
        req = getattr(self, 'request', None)
        user = getattr(req, 'user', None) if req else None
        if not user or not user.is_authenticated:
            return queryset
        mine = Exists(AuctionThumbsVote.objects.filter(auction_id=OuterRef('pk'), user_id=user.id))
        if value is True:
            return queryset.filter(mine)
        return queryset.exclude(mine)

    def filter_q(self, queryset, name, value):
        return filter_auction_text_search(queryset, value)
