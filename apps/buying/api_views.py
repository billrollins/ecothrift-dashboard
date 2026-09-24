"""DRF viewsets and sweep endpoint for buying API."""

from __future__ import annotations

import logging
import re
import time
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from django.core.cache import cache
from django.db import transaction
from django.db.models import (
    Case,
    CharField,
    Count,
    DecimalField,
    Exists,
    ExpressionWrapper,
    F,
    IntegerField,
    Max,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, IsStaff, IsSuperAdmin
from apps.buying.filters import AuctionFilter, WatchlistAuctionFilter
from apps.buying.models import (
    Auction,
    AuctionSnapshot,
    AuctionThumbsVote,
    CategoryMapping,
    ManifestPullJob,
    ManifestRow,
    Marketplace,
    WatchlistEntry,
)
from apps.buying.services.buying_settings import get_pricing_need_window_days
from apps.buying.services.bstock_token_store import (
    TokenRejected,
    clear_token,
    current_token,
    save_token,
    token_status,
)
from apps.buying.services.manifest_pull import (
    STOPPED_DISCONNECTED,
    job_payload,
    shortlist_queryset,
    start_job,
    stop_job,
    waiting_retry_count,
)
from apps.buying.services.category_need import build_category_need_payload
from apps.buying.services.shipping_quote import refresh_shipping_quote
from apps.buying.pagination import ManifestRowsPagination, SnapshotPagination
from ecothrift.pagination import ConfigurablePageSizePagination
from apps.buying.serializers import (
    AuctionDetailSerializer,
    AuctionListSerializer,
    AuctionSnapshotSerializer,
    AuctionWatchlistListSerializer,
    ManifestRowSerializer,
    MarketplaceSerializer,
    WatchlistEntrySerializer,
    WatchlistEntryWriteSerializer,
)
from apps.buying.services import pipeline, scraper
from apps.buying.services.ai_key_mapping import map_one_fast_cat_batch
from apps.buying.services.manifest_analysis import product_sales
from apps.buying.services.decision import decision as build_decision
from apps.buying.services.decision import need_level
from apps.buying.services.wishlist import build_wishlist, buying_strip
from apps.buying.services.won_to_po import WonToPoError, calibration, mark_lost, mark_won
from apps.inventory.models import Product
from apps.buying.services.manifest_upload import process_manifest_upload
from apps.buying.services.valuation import (
    load_category_stats_dict,
    recompute_active_auctions_lightweight,
    recompute_auction_valuation,
    run_ai_estimate_for_swept_auctions,
)

logger = logging.getLogger(__name__)


def annotate_auction_list_extras(qs, user=None):
    """Manifest row count, retail sum, hybrid retail_sort, thumbs counts (Phase 3B)."""
    # Subqueries, not joins: joining manifest rows and thumbs votes in one GROUP BY
    # multiplied the retail sum by the vote count.
    rows = ManifestRow.objects.filter(auction_id=OuterRef('pk')).order_by().values('auction_id')
    qs = qs.annotate(
        _manifest_row_count=Coalesce(
            Subquery(rows.annotate(n=Count('pk')).values('n')[:1]),
            Value(0),
        ),
        _manifest_retail_sum=Subquery(
            rows.annotate(
                s=Sum(Coalesce(F('quantity'), Value(1)) * F('retail_value'))
            ).values('s')[:1],
            output_field=DecimalField(max_digits=16, decimal_places=2),
        ),
    ).annotate(
        retail_sort=Case(
            When(
                _manifest_row_count__gt=0,
                then=Coalesce(F('_manifest_retail_sum'), Value(Decimal('0'))),
            ),
            default=Coalesce(F('total_retail_value'), Value(Decimal('0'))),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        ),
    )
    # Price ÷ retail (same denominator as list Retail column / serializer total_retail_display).
    qs = qs.annotate(
        price_retail_pct=Case(
            When(
                retail_sort__gt=0,
                current_price__isnull=False,
                then=ExpressionWrapper(
                    F('current_price') / F('retail_sort'),
                    output_field=DecimalField(max_digits=20, decimal_places=10),
                ),
            ),
            default=Value(None),
            output_field=DecimalField(max_digits=20, decimal_places=10, null=True),
        ),
    )
    qs = qs.annotate(
        thumbs_up_count=Coalesce(
            Subquery(
                AuctionThumbsVote.objects.filter(auction_id=OuterRef('pk'))
                .order_by()
                .values('auction_id')
                .annotate(n=Count('pk'))
                .values('n')[:1]
            ),
            Value(0),
        )
    )
    if user is not None and getattr(user, 'is_authenticated', False):
        qs = qs.annotate(
            _user_thumbs_up=Exists(
                AuctionThumbsVote.objects.filter(auction_id=OuterRef('pk'), user_id=user.id)
            ),
        )
        qs = qs.annotate(
            watchlist_sort=Exists(
                WatchlistEntry.objects.filter(auction_id=OuterRef('pk')),
            ),
        )
    return qs


def _apply_manifest_rows_ordering(qs, ordering_param: str):
    """
    Whitelist ordering for GET .../manifest_rows/.

    ``ext_retail`` and ``pct_manifest`` share the same sort key (line extended retail:
    Coalesce(quantity,1) × Coalesce(retail_value,0)); total manifest is constant per auction
    so % of manifest is monotonic with extended retail.
    """
    raw = (ordering_param or '').strip()
    if not raw:
        return qs.order_by('row_number')
    token = raw.split(',')[0].strip()
    desc = token.startswith('-')
    key = token[1:] if desc else token
    prefix = '-' if desc else ''

    direct = {
        'row_number',
        'brand',
        'title',
        'quantity',
        'retail_value',
        'condition',
        'upc',
        'sku',
    }
    if key in direct:
        return qs.order_by(f'{prefix}{key}')

    if key == 'line_value':
        # Phase 4: expected revenue for the line (unit value x units).
        qty = Coalesce(F('quantity'), Value(1), output_field=IntegerField())
        unit = Coalesce(
            F('unit_value'),
            Value(Decimal('0')),
            output_field=DecimalField(max_digits=10, decimal_places=2),
        )
        qs = qs.annotate(
            _manifest_line_value=ExpressionWrapper(
                qty * unit,
                output_field=DecimalField(max_digits=16, decimal_places=2),
            )
        )
        return qs.order_by(f'{prefix}_manifest_line_value', 'row_number')

    if key == 'canonical_category':
        qs = qs.annotate(
            _manifest_cat_sort=Coalesce(
                F('canonical_category'),
                F('fast_cat_value'),
                output_field=CharField(max_length=64),
            )
        )
        return qs.order_by(f'{prefix}_manifest_cat_sort')

    if key in ('ext_retail', 'pct_manifest'):
        qty = Coalesce(F('quantity'), Value(1), output_field=IntegerField())
        rv = Coalesce(
            F('retail_value'),
            Value(Decimal('0')),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        )
        qs = qs.annotate(
            _manifest_line_ext=ExpressionWrapper(
                qty * rv,
                output_field=DecimalField(max_digits=16, decimal_places=2),
            )
        )
        return qs.order_by(f'{prefix}_manifest_line_ext')

    return qs.order_by('row_number')


def _apply_auction_list_visibility(request, queryset):
    """
    Default: **live** auctions only - non-archived, ``open`` / ``closing`` with ``end_time`` in the future.

    ``completed=1``: **recently ended** - ``end_time`` in the last 7 days and not after ``now`` (clock-ended),
    regardless of ``status`` (status may still be ``open`` until the next sweep/poll).

    ``archived=1``: archived auctions only (``archived_at`` set).

    Skip when ``status`` is set (caller controls filtering). Legacy ``include_ended`` maps
    to completed mode.
    """
    if request.query_params.get('status'):
        return queryset
    archived = str(request.query_params.get('archived', '')).lower() in ('1', 'true', 'yes')
    if archived:
        return queryset.filter(archived_at__isnull=False)
    completed = str(request.query_params.get('completed', '')).lower() in ('1', 'true', 'yes')
    legacy = str(request.query_params.get('include_ended', '')).lower() in ('1', 'true', 'yes')
    if legacy:
        completed = True
    now = timezone.now()
    if completed:
        since = now - timedelta(days=7)
        return queryset.filter(
            archived_at__isnull=True,
            end_time__gte=since,
            end_time__lte=now,
        )
    return queryset.filter(
        archived_at__isnull=True,
        status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING],
        end_time__gte=now,
    )


class WatchlistAuctionViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    GET /api/buying/watchlist/ - auctions the staff user is watching (WatchlistEntry).

    Default ordering: ``end_time`` ascending (soonest ending first).
    """

    permission_classes = [IsAuthenticated, IsStaff]
    serializer_class = AuctionWatchlistListSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_class = WatchlistAuctionFilter
    ordering_fields = [
        'end_time',
        'current_price',
        'bid_count',
        'last_updated_at',
        'total_retail_value',
        'retail_sort',
        'price_retail_pct',
        'marketplace__name',
        'title',
        'condition_summary',
        'status',
        'has_manifest',
        'lot_size',
        'added_at',
        'priority',
        'estimated_revenue',
        'profitability_ratio',
        'need_score',
        'est_profit',
        'thumbs_up_count',
        'archived_at',
        'watchlist_sort',
    ]
    ordering = ['end_time']

    def get_queryset(self):
        return annotate_auction_list_extras(
            Auction.objects.filter(watchlist_entry__isnull=False)
            .exclude(listing_type__iexact=Auction.LISTING_TYPE_CONTRACT)
            .select_related('marketplace', 'watchlist_entry')
            .annotate(added_at=F('watchlist_entry__added_at')),
            self.request.user,
        )

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        return _apply_auction_list_visibility(self.request, qs)

    @action(detail=False, methods=['post'], url_path='update_now')
    def update_now(self, request):
        """Poll B-Stock (anonymous auction state) for due watchlist rows; merge + lightweight recompute."""
        try:
            summary = pipeline.run_watch_poll(force=True)
        except scraper.BStockAuthError as e:
            return Response({'detail': str(e), 'code': 'bstock_auth_error'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(summary, status=status.HTTP_200_OK)


class MarketplaceViewSet(viewsets.ReadOnlyModelViewSet):
    """Active marketplaces for filter dropdowns (small list; no pagination)."""

    serializer_class = MarketplaceSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    queryset = Marketplace.objects.filter(is_active=True)
    pagination_class = None

    def get_queryset(self):
        return super().get_queryset().order_by('name')


class AuctionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Paginated auction list with filters; detail includes manifest_row_count.

    Contract listings (B-Stock ``listingType`` CONTRACT) are excluded from list and
    summary; they remain in the DB and are still visible on detail by id.
    """

    queryset = Auction.objects.all()
    permission_classes = [IsAuthenticated, IsStaff]
    filterset_class = AuctionFilter
    ordering_fields = [
        'end_time',
        'current_price',
        'bid_count',
        'last_updated_at',
        'total_retail_value',
        'retail_sort',
        'price_retail_pct',
        'marketplace__name',
        'title',
        'condition_summary',
        'status',
        'has_manifest',
        'lot_size',
        'priority',
        'estimated_revenue',
        'profitability_ratio',
        'need_score',
        'est_profit',
        'thumbs_up_count',
        'archived_at',
        'watchlist_sort',
    ]
    ordering = ['-end_time']

    def get_queryset(self):
        qs = super().get_queryset().select_related('marketplace')
        if self.action in ('list', 'summary'):
            qs = qs.exclude(listing_type__iexact=Auction.LISTING_TYPE_CONTRACT)
        if self.action == 'list':
            qs = annotate_auction_list_extras(qs, self.request.user)
        if self.action == 'retrieve':
            qs = qs.annotate(manifest_rows_count=Count('manifest_rows', distinct=True))
            qs = qs.annotate(
                thumbs_up_count=Coalesce(
                    Subquery(
                        AuctionThumbsVote.objects.filter(auction_id=OuterRef('pk'))
                        .order_by()
                        .values('auction_id')
                        .annotate(n=Count('pk'))
                        .values('n')[:1]
                    ),
                    Value(0),
                )
            )
            u = self.request.user
            if getattr(u, 'is_authenticated', False):
                qs = qs.annotate(
                    _user_thumbs_up=Exists(
                        AuctionThumbsVote.objects.filter(auction_id=OuterRef('pk'), user_id=u.id)
                    ),
                )
            qs = qs.select_related('watchlist_entry')
        elif self.action in (
            'manifest_rows',
            'upload_manifest',
            'map_fast_cat_batch',
            'manifest',
            'watchlist',
            'snapshots',
            'poll',
            'refresh_from_bstock',
        ):
            qs = qs.select_related('watchlist_entry')
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return AuctionDetailSerializer
        return AuctionListSerializer

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        if self.action not in ('list', 'summary'):
            return qs
        return _apply_auction_list_visibility(self.request, qs)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """Aggregated counts by marketplace and max ``last_updated_at`` (same filters as list)."""
        qs = self.filter_queryset(self.get_queryset())
        last_ref = qs.aggregate(m=Max('last_updated_at'))['m']
        rows = (
            qs.values('marketplace_id', 'marketplace__name', 'marketplace__slug')
            .annotate(count=Count('id', distinct=True))
            .order_by('marketplace__name')
        )
        return Response(
            {
                'last_refreshed_at': last_ref.isoformat() if last_ref else None,
                'by_marketplace': [
                    {
                        'marketplace_id': r['marketplace_id'],
                        'name': r['marketplace__name'],
                        'slug': r['marketplace__slug'],
                        'count': r['count'],
                    }
                    for r in rows
                    if r['marketplace_id'] is not None
                ],
            }
        )

    @action(detail=True, methods=['get'], url_path='manifest_rows')
    def manifest_rows(self, request, pk=None):
        """Paginated manifest line items for this auction (50 per page, server-side only)."""
        auction = self.get_object()
        qs = ManifestRow.objects.filter(auction=auction)
        ordering = request.query_params.get('ordering', '').strip()
        qs = _apply_manifest_rows_ordering(qs, ordering)
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(brand__icontains=search)
                | Q(sku__icontains=search)
                | Q(upc__icontains=search)
                | Q(fast_cat_value__icontains=search)
                | Q(canonical_category__icontains=search)
            )
        hazard = request.query_params.get('hazard', '').strip()
        if hazard == 'any':
            qs = qs.exclude(hazards__isnull=True).exclude(hazards=[])
        elif hazard:
            qs = qs.filter(hazards__contains=[hazard])
        matched = request.query_params.get('matched', '').strip()
        if matched == '1':
            qs = qs.filter(matched_product__isnull=False)
        elif matched == '0':
            qs = qs.filter(matched_product__isnull=True)
        category = request.query_params.get('category', '').strip()
        if category == '__uncategorized__':
            qs = qs.filter(
                Q(canonical_category__isnull=True) | Q(canonical_category=''),
            ).filter(Q(fast_cat_value__isnull=True) | Q(fast_cat_value=''))
        elif category:
            qs = qs.filter(Q(canonical_category=category) | Q(fast_cat_value=category))
        paginator = ManifestRowsPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = ManifestRowSerializer(page, many=True).data
        # Phase 4: what each matched product did for us (sold, days, share of retail, on hand).
        sales = product_sales({row.matched_product_id for row in page if row.matched_product_id})
        titles = dict(
            Product.objects.filter(pk__in=list(sales.keys())).values_list('pk', 'title')
        ) if sales else {}
        # The advisor's Need column: the line's category need (the same levels as the page).
        stats = load_category_stats_dict()
        for row, out in zip(page, data):
            category = (row.fast_cat_value or row.canonical_category or '').strip()
            cat_stats = stats.get(category) if category else None
            out['need_level'] = need_level(cat_stats.need_score_1to99) if cat_stats is not None else None
            ps = sales.get(row.matched_product_id) if row.matched_product_id else None
            out['product_sales'] = None if ps is None else {
                'title': titles.get(row.matched_product_id, ''),
                'sold': ps.sold,
                'avg_days': ps.avg_days,
                'on_hand': ps.on_hand,
                'ratio': None if ps.ratio is None else str(ps.ratio),
            }
        return paginator.get_paginated_response(data)

    @action(
        detail=True,
        methods=['post'],
        url_path='upload_manifest',
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_manifest(self, request, pk=None):
        """Upload a manifest CSV; replaces existing ManifestRow rows for this auction."""
        auction = self.get_object()
        upload = request.FILES.get('file')
        if not upload:
            return Response(
                {'detail': 'Missing multipart file field "file".', 'code': 'missing_file'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            raw = upload.read()
        except Exception as e:
            logger.exception('manifest upload read failed')
            return Response(
                {'detail': f'Could not read file: {e}', 'code': 'read_error'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        name = getattr(upload, 'name', '') or 'manifest.csv'
        body, code = process_manifest_upload(auction, raw, name)
        return Response(body, status=code)

    @action(detail=True, methods=['post'], url_path='map_fast_cat_batch')
    def map_fast_cat_batch(self, request, pk=None):
        """One batch of AI fast_cat key mapping (Phase 4.1B enhancement). POST body: {}."""
        auction = self.get_object()
        mapping = dict(CategoryMapping.objects.values_list('source_key', 'canonical_category'))
        body = map_one_fast_cat_batch(auction, mapping=mapping)
        return Response(body, status=status.HTTP_200_OK)

    @action(detail=True, methods=['delete'], url_path='manifest')
    def manifest(self, request, pk=None):
        """Delete all manifest rows for this auction; keep templates and CategoryMappings."""
        # TODO: If a CSV was uploaded to the wrong marketplace (e.g., Target CSV on a
        # Costco auction), AI-created CategoryMappings with the wrong prefix persist
        # after manifest removal. Consider adding purge_ai_mappings option or admin
        # tooling to review/delete AI-origin mappings by marketplace prefix.
        auction = self.get_object()
        with transaction.atomic():
            # Same lock the background manifest pull takes before saving, held until the
            # auction's fields match: a pull cannot slip rows in between.
            Auction.objects.select_for_update().filter(pk=auction.pk).first()
            auction.manifest_rows.all().delete()
            auction.has_manifest = False
            auction.manifest_category_distribution = None
            auction.manifest_pulled_at = None
            auction.manifest_source = ''
            # Removing a manifest puts the auction back in line for the next Pull.
            auction.manifest_pull_attempted_at = None
            auction.manifest_pull_error = ''
            auction.manifest_pull_blocked = False
            auction.save(
                update_fields=[
                    'has_manifest',
                    'manifest_category_distribution',
                    'manifest_pulled_at',
                    'manifest_source',
                    'manifest_pull_attempted_at',
                    'manifest_pull_error',
                    'manifest_pull_blocked',
                ]
            )
        auction.refresh_from_db()
        recompute_auction_valuation(auction)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post', 'delete'], url_path='watchlist')
    def watchlist(self, request, pk=None):
        """
        POST: idempotent add - always 200 with watchlist entry (create or existing).
        DELETE: remove if present - always 204 (no 404).
        """
        auction = self.get_object()
        if request.method == 'POST':
            ser = WatchlistEntryWriteSerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            priority = ser.validated_data['priority']
            entry, _created = WatchlistEntry.objects.get_or_create(
                auction=auction,
                defaults={
                    'priority': priority,
                    'status': WatchlistEntry.STATUS_WATCHING,
                },
            )
            return Response(
                WatchlistEntrySerializer(entry).data,
                status=status.HTTP_200_OK,
            )
        WatchlistEntry.objects.filter(auction=auction).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='snapshots')
    def snapshots(self, request, pk=None):
        """Paginated AuctionSnapshot rows for price history (200 per page, newest first)."""
        auction = self.get_object()
        qs = AuctionSnapshot.objects.filter(auction=auction).order_by('-captured_at')
        paginator = SnapshotPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = AuctionSnapshotSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(detail=True, methods=['post'], url_path='poll')
    def poll(self, request, pk=None):
        """Alias for ``refresh_from_bstock`` (anonymous auction state + lightweight recompute)."""
        return self.refresh_from_bstock(request, pk=pk)

    @action(detail=True, methods=['post'], url_path='refresh_from_bstock')
    def refresh_from_bstock(self, request, pk=None):
        """Merge auction.bstock.com state for this listing (anonymous GET; no server JWT)."""
        auction = self.get_object()
        try:
            body = pipeline.refresh_auction_from_bstock(auction)
        except scraper.BStockAuthError as e:
            return Response({'detail': str(e), 'code': 'bstock_auth_error'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if not body.get('ok'):
            return Response(body, status=status.HTTP_400_BAD_REQUEST)
        auction.refresh_from_db()
        serializer = AuctionDetailSerializer(auction, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=['post', 'delete'],
        url_path='thumbs-up',
        permission_classes=[IsAuthenticated, IsStaff],
    )
    def thumbs_up(self, request, pk=None):
        auction = self.get_object()
        if request.method == 'POST':
            AuctionThumbsVote.objects.get_or_create(auction=auction, user=request.user)
            voted = True
        else:
            AuctionThumbsVote.objects.filter(auction=auction, user=request.user).delete()
            voted = False
        n = AuctionThumbsVote.objects.filter(auction=auction).count()
        return Response({'my_thumbs_up': voted, 'thumbs_up_count': n}, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=['post'],
        url_path='shipping-quote',
        permission_classes=[IsAuthenticated, IsSuperAdmin],
    )
    def shipping_quote(self, request, pk=None):
        """
        Read B-Stock's shipping quote for this listing with the owner's handed-over login
        (one direct call). B-Stock only has a quote once the owner opened the listing there.
        """
        auction = self.get_object()
        login = current_token()
        if not login:
            return Response(
                {
                    'detail': 'Send your B-Stock login from the Pull B-Stock manifests routine first.',
                    'code': 'no_login',
                },
                status=status.HTTP_409_CONFLICT,
            )
        try:
            quote = refresh_shipping_quote(auction, bearer=login)
        except scraper.BStockAuthError:
            clear_token(login)
            return Response(
                {
                    'detail': 'B-Stock refused the login. Send it again from the Pull B-Stock manifests routine.',
                    'code': 'login_refused',
                },
                status=status.HTTP_409_CONFLICT,
            )
        except scraper.BStockHTTPError as e:
            if e.status_code != 404:
                return Response(
                    {'detail': f'B-Stock answered HTTP {e.status_code}. Try again in a minute.', 'code': 'bstock_error'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            quote = None
        except scraper.BStockUnavailable:
            return Response(
                {'detail': 'B-Stock did not answer. Try again in a minute.', 'code': 'bstock_unavailable'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        if quote is None:
            return Response(
                {
                    'detail': 'B-Stock has no shipping quote for this listing yet. Open it on B-Stock, then try again.',
                    'code': 'no_quote',
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        auction.refresh_from_db()
        recompute_auction_valuation(auction)
        auction.refresh_from_db()
        serializer = AuctionDetailSerializer(auction, context={'request': request})
        return Response(serializer.data)

    @action(
        detail=True,
        methods=['patch'],
        url_path='valuation-inputs',
        permission_classes=[IsAuthenticated, IsAdmin],
    )
    def valuation_inputs(self, request, pk=None):
        auction = self.get_object()
        data = request.data
        dec_fields = (
            'fees_override',
            'shipping_override',
            'shrinkage_override',
            'profit_target_override',
            'revenue_override',
        )
        for name in dec_fields:
            if name not in data:
                continue
            raw = data.get(name)
            if raw is None or raw == '':
                setattr(auction, name, None)
            else:
                normalized = str(raw).strip().lstrip('$').replace(',', '')
                try:
                    setattr(auction, name, Decimal(normalized))
                except (InvalidOperation, TypeError, ValueError):
                    return Response(
                        {'detail': f'{name} must be a decimal number.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
        if 'priority' in data and data.get('priority') is not None and data.get('priority') != '':
            try:
                auction.priority = int(data.get('priority'))
            except (TypeError, ValueError):
                return Response(
                    {'detail': 'priority must be an integer 1-99.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if auction.priority < 1 or auction.priority > 99:
                return Response(
                    {'detail': 'priority must be 1-99.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            auction.priority_override = True
        auction.save()
        auction.refresh_from_db()
        recompute_auction_valuation(auction)
        serializer = AuctionDetailSerializer(auction, context={'request': request})
        return Response(serializer.data)

    @action(
        detail=True,
        methods=['post'],
        url_path='recompute_valuation',
        permission_classes=[IsAuthenticated, IsStaff],
    )
    def recompute_valuation(self, request, pk=None):
        """
        Recompute priority, need, and valuation from current local data (no B-Stock JWT).

        For a future \"full refresh\", also call sweep/enrich against B-Stock where token-backed
        routes are re-enabled - not done here.
        """
        auction = self.get_object()
        recompute_auction_valuation(auction)
        auction.refresh_from_db()
        serializer = AuctionDetailSerializer(auction, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='decision', permission_classes=[IsAuthenticated, IsStaff])
    def decision(self, request, pk=None):
        """The auction page's decision panel: verdict, bids, need, hazards, profit, landed cost."""
        return Response(build_decision(self.get_object()))

    @action(detail=True, methods=['patch'], url_path='buyer', permission_classes=[IsAuthenticated, IsStaff])
    def buyer(self, request, pk=None):
        """The buyer's own max bid (blank clears it) and notes."""
        auction = self.get_object()
        fields = []
        if 'max_bid' in request.data:
            raw = request.data.get('max_bid')
            if raw in (None, ''):
                auction.max_bid = None
            else:
                try:
                    value = Decimal(str(raw))
                except Exception:
                    return Response({'detail': 'max_bid must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
                if value <= 0:
                    return Response({'detail': 'max_bid must be above 0.'}, status=status.HTTP_400_BAD_REQUEST)
                auction.max_bid = value.quantize(Decimal('0.01'))
            fields.append('max_bid')
        if 'buyer_notes' in request.data:
            auction.buyer_notes = str(request.data.get('buyer_notes') or '')[:5000]
            fields.append('buyer_notes')
        if fields:
            auction.save(update_fields=fields)
        return Response({'max_bid': auction.max_bid, 'buyer_notes': auction.buyer_notes})

    @action(detail=True, methods=['post'], url_path='won', permission_classes=[IsAuthenticated, IsStaff])
    def won(self, request, pk=None):
        """
        Phase 6: record the win and create the PO (with the manifest). Body: ``hammer_price``,
        optional ``fees`` and ``shipping`` (default: the fee rate on the hammer, and the
        auction's shipping). Manager, Admin or superuser.
        """
        user = request.user
        if not (user.is_superuser or getattr(user, 'role', '') in ('Manager', 'Admin')):
            return Response({'detail': 'A manager records wins.'}, status=status.HTTP_403_FORBIDDEN)
        auction = self.get_object()

        def money(key):
            raw = request.data.get(key)
            if raw in (None, ''):
                return None
            try:
                return Decimal(str(raw))
            except Exception:
                raise ValueError(key)

        try:
            hammer = money('hammer_price')
            fees = money('fees')
            shipping = money('shipping')
        except ValueError as bad:
            return Response({'detail': f'{bad} must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            po = mark_won(auction, hammer_price=hammer, user=user, fees=fees, shipping=shipping)
        except WonToPoError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        auction.refresh_from_db()
        data = AuctionDetailSerializer(auction, context={'request': request}).data
        data['won_note'] = getattr(po, 'won_manifest_note', '')
        return Response(data)

    @action(detail=True, methods=['post'], url_path='lost', permission_classes=[IsAuthenticated, IsStaff])
    def lost(self, request, pk=None):
        """Phase 6: record a loss, with the closing price when known (``hammer_price``)."""
        auction = self.get_object()
        raw = request.data.get('hammer_price')
        try:
            hammer = Decimal(str(raw)) if raw not in (None, '') else None
        except Exception:
            return Response({'detail': 'hammer_price must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
        mark_lost(auction, hammer_price=hammer)
        auction.refresh_from_db()
        return Response(AuctionDetailSerializer(auction, context={'request': request}).data)

    @action(
        detail=True,
        methods=['post', 'delete'],
        url_path='archive',
        permission_classes=[IsAuthenticated, IsStaff],
    )
    def archive(self, request, pk=None):
        """POST: set ``archived_at`` (hide from default lists). DELETE: clear ``archived_at``."""
        auction = self.get_object()
        if request.method == 'POST':
            auction.archived_at = timezone.now()
            auction.save(update_fields=['archived_at'])
        else:
            auction.archived_at = None
            auction.save(update_fields=['archived_at'])
        auction.refresh_from_db()
        serializer = AuctionDetailSerializer(auction, context={'request': request})
        return Response(serializer.data)


class SweepView(APIView):
    """
    POST triggers pipeline.run_discovery (search API; no B-Stock JWT required).

    Optional query params:
    - marketplace=<slug> - limit to one marketplace.
    - run_ai=1|true|yes - run AI estimate on swept auctions, then lightweight recompute (default: off).
    - defer_valuation=1|true|yes - discovery only; skip lightweight recompute and AI (fastest).
    Default (no params): discovery + lightweight recompute, no AI (Refresh button path).
    enrich_detail stays False so this does not call auction.bstock.com (no token).
    """

    permission_classes = [IsAuthenticated, IsStaff]

    def post(self, request):
        slug = request.query_params.get('marketplace')
        if slug is not None:
            slug = slug.strip() or None
        defer_raw = request.query_params.get('defer_valuation')
        defer_valuation = str(defer_raw or '').strip().lower() in ('1', 'true', 'yes')
        run_ai_raw = request.query_params.get('run_ai')
        run_ai = str(run_ai_raw or '').strip().lower() in ('1', 'true', 'yes')
        sweep_t0 = time.perf_counter()
        try:
            t_disc = time.perf_counter()
            summary = pipeline.run_discovery(
                marketplace_slug=slug,
                dry_run=False,
                enrich_detail=False,
            )
            discovery_ms = (time.perf_counter() - t_disc) * 1000.0
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception('buying sweep failed')
            return Response(
                {'detail': 'Sweep failed. Check server logs.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        logger.info(
            '[sweep] discovery_done marketplace=%s ms=%.1f upserted_ids=%s',
            slug or 'all',
            discovery_ms,
            len(summary.get('upserted_auction_ids') or []),
        )
        ids = summary.get('upserted_auction_ids') or []
        timing_ms: dict[str, float] = {
            'discovery': round(discovery_ms, 1),
        }
        if defer_valuation:
            summary = {
                **summary,
                'valuation_deferred': True,
                'run_ai': run_ai,
                'sweep_timing_ms': timing_ms,
            }
            logger.info('[sweep] valuation_deferred=true (discovery only)')
        else:
            try:
                summary = {**summary, 'valuation_deferred': False, 'run_ai': run_ai}
                if run_ai:
                    t_ai = time.perf_counter()
                    ai_est = run_ai_estimate_for_swept_auctions(ids)
                    ai_ms = (time.perf_counter() - t_ai) * 1000.0
                    timing_ms['ai_estimate'] = round(ai_ms, 1)
                    logger.info(
                        '[sweep] ai_estimate_done ms=%.1f considered=%s',
                        ai_ms,
                        (ai_est or {}).get('considered', '-'),
                    )
                    summary['ai_estimate'] = ai_est
                t_lw = time.perf_counter()
                lw = recompute_active_auctions_lightweight()
                lw_ms = (time.perf_counter() - t_lw) * 1000.0
                timing_ms['lightweight_recompute'] = round(lw_ms, 1)
                logger.info('[sweep] lightweight_recompute_done ms=%.1f auctions=%s', lw_ms, lw)
                summary = {
                    **summary,
                    'lightweight_recomputed': lw,
                    'sweep_timing_ms': timing_ms,
                }
            except Exception as e:
                logger.exception('post-sweep valuation failed')
                summary = {
                    **summary,
                    'valuation_error': str(e),
                    'sweep_timing_ms': timing_ms,
                }
        total_ms = (time.perf_counter() - sweep_t0) * 1000.0
        timing_ms['total'] = round(total_ms, 1)
        logger.info(
            '[sweep] response_ready total_ms=%.1f defer_valuation=%s run_ai=%s',
            total_ms,
            defer_valuation,
            run_ai,
        )
        return Response(summary)


class BstockTokenStatusView(APIView):
    """GET: whether the server has a B-Stock JWT (for enabling refresh buttons)."""

    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        return Response({'bstock_token_available': scraper.bstock_token_available()})


class BstockLoginView(APIView):
    """
    Superuser: the B-Stock login handed over from bstock.com by the bookmarklet.

    GET: connected / expires_at / seconds_left (usable time; never the token).
    POST {token}: validate and store it, replacing the old one.
    DELETE: forget it (Disconnect) and stop a running pull.
    """

    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        return Response(token_status().as_dict())

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        try:
            save_token(str(data.get('token') or ''), user=request.user)
        except TokenRejected as e:
            return Response({'detail': str(e), 'code': 'token_rejected'}, status=400)
        return Response(token_status().as_dict())

    def delete(self, request):
        stop_job(STOPPED_DISCONNECTED)
        clear_token()
        return Response(token_status().as_dict())


class ManifestPullView(APIView):
    """
    Superuser: the shortlist manifest pull.

    GET [?job=<id>]: that job (default the latest), login status, the shortlist size now,
    and how many auctions are only waiting out a failed attempt.
    POST: start a pull, resume one whose runner died, or return the one running. 409 without
    a live login.
    DELETE: stop the live pull.
    """

    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def _payload(self, job):
        return {
            'job': job_payload(job),
            'login': token_status().as_dict(),
            'shortlist_count': shortlist_queryset().count(),
            'waiting_retry_count': waiting_retry_count(),
        }

    def get(self, request):
        job_id = str(request.query_params.get('job') or '')
        qs = ManifestPullJob.objects.all()
        if job_id and not re.fullmatch(r'[0-9]{1,12}', job_id):
            return Response({'detail': 'job must be an id.'}, status=400)
        job = qs.filter(pk=int(job_id)).first() if job_id else qs.first()
        return Response(self._payload(job))

    def post(self, request):
        if not current_token():
            return Response(
                {'detail': 'Send your B-Stock login first.', 'code': 'no_login'},
                status=409,
            )
        job = start_job(user=request.user)
        payload = self._payload(job)
        if payload['job'] and payload['job']['status'] in ManifestPullJob.LIVE_STATUSES:
            # A resumed job was just handed to a new runner; it is not stalled any more.
            payload['job']['stalled'] = False
        return Response(payload, status=202)

    def delete(self, request):
        return Response(self._payload(stop_job() or ManifestPullJob.objects.first()))


CATEGORY_NEED_CACHE_KEY = 'category_need_panel'


class WishlistView(APIView):
    """
    GET: the wish list (Phase 5). Live auctions with a price target, in range first by
    Priority; ``?include=over`` adds the ones whose price already passed the target.
    """

    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        include_over = request.query_params.get('include', '') == 'over'
        payload = build_wishlist(
            include_over=include_over,
            rank=request.query_params.get('rank', 'focus'),
            category=request.query_params.get('category') or None,
        )
        # Phase 6: how finished trucks did against their prediction (the valuation's check).
        payload['report_cards'] = calibration()
        payload['strip'] = buying_strip()
        return Response(payload)


class ReportCardsView(APIView):
    """GET: every won truck's report card (predicted vs actual) and the valuation check."""

    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        from apps.buying.services.won_to_po import report_cards

        return Response(report_cards())


class BuyingNagsView(APIView):
    """
    GET: the buyer's nags for the nag drawer: watched lots ending within the hour still under
    the max, and ended ones with no result. Superusers only (they bid); everyone else gets none.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.buying.services import buying_nags

        if not request.user.is_superuser:
            return Response(buying_nags.empty())
        return Response(buying_nags.buying_nags())


class CategoryNeedView(APIView):
    """GET: category need panel aggregates (19 taxonomy rows + need_window_days)."""

    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        def _build():
            payload = build_category_need_payload()
            payload['need_window_days'] = get_pricing_need_window_days()
            return payload

        # TTL-only cache (10 min); a goal change clears it.
        payload = cache.get_or_set(CATEGORY_NEED_CACHE_KEY, _build, 600)
        return Response(payload)


class CategoryGoalView(APIView):
    """
    PATCH ``{category, goal}``: the manager's goal for one category (more | normal | less |
    stop). It moves the category's target weeks of cover, so Need v2 is re-scored from the
    stored inputs at once and live auctions are re-valued.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def patch(self, request):
        from apps.buying.services.buying_settings import CATEGORY_GOALS, get_category_goals
        from apps.buying.services.category_stats_sql import rescore_needs_from_stored
        from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES
        from apps.core.models import AppSetting

        data = request.data if isinstance(request.data, dict) else {}
        category = str(data.get('category') or '')
        goal = str(data.get('goal') or '')
        if category not in TAXONOMY_V1_CATEGORY_NAMES:
            return Response({'detail': 'Unknown category.'}, status=status.HTTP_400_BAD_REQUEST)
        if goal not in CATEGORY_GOALS:
            return Response(
                {'detail': f'Goal must be one of: {", ".join(CATEGORY_GOALS)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        goals = get_category_goals()
        if goal == 'normal':
            goals.pop(category, None)
        else:
            goals[category] = goal
        AppSetting.objects.update_or_create(
            key='buying_category_goals',
            defaults={
                'value': goals,
                'description': 'Buying: manager goal per category (more / less / stop); moves its target weeks of cover.',
            },
        )
        rescore_needs_from_stored()
        recompute_active_auctions_lightweight()
        cache.delete(CATEGORY_NEED_CACHE_KEY)
        payload = build_category_need_payload()
        payload['need_window_days'] = get_pricing_need_window_days()
        return Response(payload)
