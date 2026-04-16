"""DRF viewsets and sweep endpoint for buying API."""

from __future__ import annotations

import logging
import time
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from django.core.cache import cache
from django.db.models import (
    Case,
    Count,
    DecimalField,
    Exists,
    F,
    Max,
    OuterRef,
    Q,
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

from apps.accounts.permissions import IsAdmin, IsStaff
from apps.buying.filters import AuctionFilter, WatchlistAuctionFilter
from apps.buying.models import (
    Auction,
    AuctionSnapshot,
    AuctionThumbsVote,
    CategoryMapping,
    ManifestPullLog,
    ManifestRow,
    Marketplace,
    WatchlistEntry,
)
from apps.buying.services.buying_settings import get_pricing_need_window_days
from apps.buying.services.category_need import build_category_need_payload
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
from apps.buying.services import manifest_dev_timelog, pipeline, scraper
from apps.buying.services.ai_key_mapping import map_one_fast_cat_batch
from apps.buying.services.manifest_api_pipeline import (
    get_progress as get_manifest_pull_progress,
    run_api_manifest_pull,
)
from apps.buying.services.manifest_upload import process_manifest_upload
from apps.buying.services.valuation import (
    recompute_active_auctions_lightweight,
    recompute_auction_valuation,
    run_ai_estimate_for_swept_auctions,
)

logger = logging.getLogger(__name__)


def annotate_auction_list_extras(qs, user=None):
    """Manifest row count, retail sum, hybrid retail_sort, thumbs counts (Phase 3B)."""
    qs = qs.annotate(
        _manifest_row_count=Count('manifest_rows', distinct=True),
        _manifest_retail_sum=Sum('manifest_rows__retail_value'),
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
    qs = qs.annotate(_thumbs_up_count=Count('staff_thumbs_votes', distinct=True))
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

def _apply_auction_list_visibility(request, queryset):
    """
    Default: **live** auctions only — non-archived, ``open`` / ``closing`` with ``end_time`` in the future.

    ``completed=1``: **recently ended** — ``end_time`` in the last 7 days and not after ``now`` (clock-ended),
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
    GET /api/buying/watchlist/ — auctions the staff user is watching (WatchlistEntry).

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
        'thumbs_up',
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
        'thumbs_up',
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
            qs = qs.annotate(_thumbs_up_count=Count('staff_thumbs_votes', distinct=True))
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
            'pull_manifest',
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

    @action(
        detail=False,
        methods=['get'],
        url_path='manifest_queue',
        permission_classes=[IsAuthenticated, IsAdmin],
    )
    def manifest_queue(self, request):
        """Admin: next auctions eligible for nightly manifest pull (same ordering as pull_manifests_nightly)."""
        qs = pipeline.manifest_pull_queue_queryset()
        paginator = ConfigurablePageSizePagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        results = []
        for a in page:
            we = getattr(a, 'watchlist_entry', None)
            thumbs = getattr(a, '_thumbs_count', None)
            results.append(
                {
                    'id': a.id,
                    'title': a.title,
                    'lot_id': a.lot_id,
                    'marketplace': MarketplaceSerializer(a.marketplace).data,
                    'watched': we is not None,
                    'watchlist_priority': we.priority if we else None,
                    'thumbs_up_count': int(thumbs) if thumbs is not None else 0,
                    'auction_priority': a.priority,
                    'url': a.url or '',
                }
            )
        return paginator.get_paginated_response(results)

    @action(
        detail=False,
        methods=['post'],
        url_path='pull_manifests_budget',
        permission_classes=[IsAuthenticated, IsAdmin],
    )
    def pull_manifests_budget(self, request):
        """Admin: run the nightly manifest queue for N seconds (long HTTP, single request).

        Shares a worker with the caller — keep ``seconds`` modest (30-300). Mirrors
        the ``pull_manifests_budget`` management command so the UI can kick one off
        without shell access.
        """
        body = request.data if isinstance(request.data, dict) else {}
        try:
            seconds = float(body.get('seconds', 60))
        except (TypeError, ValueError):
            seconds = 60.0
        if seconds <= 0 or seconds > 900:
            return Response(
                {'detail': 'seconds must be in (0, 900].', 'code': 'bad_seconds'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            batch_size = int(body.get('batch_size', 50))
        except (TypeError, ValueError):
            batch_size = 50
        try:
            delay = float(body.get('delay', 1.0))
        except (TypeError, ValueError):
            delay = 1.0
        force = bool(body.get('force', False))

        summary = pipeline.run_budget_manifest_pull(
            seconds=seconds,
            batch_size=batch_size,
            inter_auction_delay=delay,
            force=force,
        )
        summary['manifest_api_version'] = manifest_dev_timelog.MANIFEST_API_PULL_VERSION
        return Response(summary, status=status.HTTP_200_OK)

    @action(
        detail=False,
        methods=['get'],
        url_path='manifest_pull_log',
        permission_classes=[IsAuthenticated, IsAdmin],
    )
    def manifest_pull_log(self, request):
        """Admin: recent anonymous manifest API pull attempts (rows, timing, SOCKS5)."""
        qs = ManifestPullLog.objects.select_related(
            'auction',
            'auction__marketplace',
        ).order_by('-completed_at')
        paginator = ConfigurablePageSizePagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        results = []
        for log in page:
            auc = log.auction
            results.append(
                {
                    'id': log.id,
                    'auction_id': auc.id,
                    'auction_title': auc.title,
                    'auction_url': auc.url or '',
                    'marketplace': MarketplaceSerializer(auc.marketplace).data,
                    'started_at': log.started_at.isoformat(),
                    'completed_at': log.completed_at.isoformat(),
                    'rows_downloaded': log.rows_downloaded,
                    'api_calls': log.api_calls,
                    'duration_seconds': log.duration_seconds,
                    'used_socks5': log.used_socks5,
                    'success': log.success,
                    'error_message': log.error_message,
                }
            )
        return paginator.get_paginated_response(results)

    @action(detail=True, methods=['get'], url_path='manifest_rows')
    def manifest_rows(self, request, pk=None):
        """Paginated manifest line items for this auction (50 per page, server-side only)."""
        auction = self.get_object()
        qs = ManifestRow.objects.filter(auction=auction).order_by('row_number')
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
        category = request.query_params.get('category', '').strip()
        if category == '__uncategorized__':
            qs = qs.filter(
                Q(canonical_category__isnull=True) | Q(canonical_category=''),
            ).filter(Q(fast_cat_value__isnull=True) | Q(fast_cat_value=''))
        elif category:
            qs = qs.filter(Q(canonical_category=category) | Q(fast_cat_value=category))
        paginator = ManifestRowsPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = ManifestRowSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(
        detail=True,
        methods=['post'],
        url_path='pull_manifest',
        permission_classes=[IsAuthenticated, IsAdmin],
    )
    def pull_manifest(self, request, pk=None):
        """
        Two-worker B-Stock manifest pull (anonymous). Resolves (or AI-creates) a
        :class:`ManifestTemplate` from the first page's flattened headers, then
        streams pages of 10 rows — Worker 2 standardizes rows, builds
        ``fast_cat_key``, and batch-inserts as Worker 1 keeps fetching. After
        the final row is persisted, the server loops ``map_one_fast_cat_batch``
        so one click does template + fetch + map + categorize + valuation.
        """
        auction = self.get_object()
        raw = request.data.get('force', False)
        force = raw in (True, 'true', 'True', '1', 1)
        if not (auction.lot_id or '').strip():
            return Response(
                {
                    'detail': 'Auction has no lot_id; cannot fetch manifest from B-Stock.',
                    'code': 'missing_lot_id',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        body, http_status = run_api_manifest_pull(auction, force=force)
        if isinstance(body, dict):
            body.setdefault('manifest_api_version', manifest_dev_timelog.MANIFEST_API_PULL_VERSION)
            body.setdefault('auctions_processed', 1 if http_status == 200 else 0)
            body.setdefault('manifest_rows_saved', int(body.get('rows_saved', 0) or 0))
        return Response(body, status=http_status)

    @action(
        detail=True,
        methods=['get'],
        url_path='manifest_pull_progress',
        permission_classes=[IsAuthenticated, IsAdmin],
    )
    def manifest_pull_progress(self, request, pk=None):
        """
        Lightweight progress polling for an in-flight API manifest pull.

        Returns the current persisted row count (grows in batches of 10 while
        the two-worker pipeline runs) plus a compact summary of the most recent
        :class:`ManifestPullLog` so the UI can show live download counts,
        elapsed time, and error state without refetching the full detail.
        """
        auction = self.get_object()
        rows_downloaded = ManifestRow.objects.filter(auction=auction).count()
        last_log = (
            ManifestPullLog.objects.filter(auction=auction)
            .order_by('-completed_at')
            .first()
        )
        log_payload = None
        if last_log is not None:
            log_payload = {
                'id': last_log.id,
                'started_at': last_log.started_at.isoformat() if last_log.started_at else None,
                'completed_at': (
                    last_log.completed_at.isoformat() if last_log.completed_at else None
                ),
                'rows_downloaded': int(last_log.rows_downloaded or 0),
                'api_calls': int(last_log.api_calls or 0),
                'duration_seconds': float(last_log.duration_seconds or 0),
                'used_socks5': bool(last_log.used_socks5),
                'success': bool(last_log.success),
                'error_message': last_log.error_message or '',
            }

        # Live per-worker counters populated by run_api_manifest_pull via the
        # module-level progress cache. ``None`` when no pull is active.
        live = get_manifest_pull_progress(auction.pk)
        live_payload = None
        if isinstance(live, dict):
            live_payload = {
                'phase': live.get('phase'),
                'started_at': live.get('started_at'),
                'updated_at': live.get('updated_at'),
                'total_rows_hint': live.get('total_rows_hint'),
                'api_calls': int(live.get('api_calls') or 0),
                'rows_fetched': int(live.get('rows_fetched') or 0),
                'rows_saved': int(live.get('rows_saved') or 0),
                'batches_processed': int(live.get('batches_processed') or 0),
                'template_source': live.get('template_source'),
                'ai_batches_run': int(live.get('ai_batches_run') or 0),
                'ai_mappings_created': int(live.get('ai_mappings_created') or 0),
                'keys_remaining': live.get('keys_remaining'),
                'ai_error': live.get('ai_error'),
            }

        return Response(
            {
                'auction_id': auction.pk,
                'rows_downloaded': int(rows_downloaded),
                'live': live_payload,
                'last_pull_log': log_payload,
            }
        )

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
        auction.manifest_rows.all().delete()
        auction.has_manifest = False
        auction.manifest_category_distribution = None
        auction.manifest_pulled_at = None
        auction.save(
            update_fields=[
                'has_manifest',
                'manifest_category_distribution',
                'manifest_pulled_at',
            ]
        )
        auction.refresh_from_db()
        recompute_auction_valuation(auction)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post', 'delete'], url_path='watchlist')
    def watchlist(self, request, pk=None):
        """
        POST: idempotent add — always 200 with watchlist entry (create or existing).
        DELETE: remove if present — always 204 (no 404).
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
        permission_classes=[IsAuthenticated, IsAdmin],
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
        legacy = n > 0
        if auction.thumbs_up != legacy:
            auction.thumbs_up = legacy
            auction.save(update_fields=['thumbs_up'])
        return Response({'thumbs_up': voted, 'thumbs_up_count': n}, status=status.HTTP_200_OK)

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
                setattr(auction, name, Decimal(str(raw)))
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
        routes are re-enabled — not done here.
        """
        auction = self.get_object()
        recompute_auction_valuation(auction)
        auction.refresh_from_db()
        serializer = AuctionDetailSerializer(auction, context={'request': request})
        return Response(serializer.data)

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
    - marketplace=<slug> — limit to one marketplace.
    - run_ai=1|true|yes — run AI estimate on swept auctions, then lightweight recompute (default: off).
    - defer_valuation=1|true|yes — discovery only; skip lightweight recompute and AI (fastest).
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
                        (ai_est or {}).get('considered', '—'),
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


class CategoryNeedView(APIView):
    """GET: category need panel aggregates (19 taxonomy rows + need_window_days)."""

    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        def _build():
            payload = build_category_need_payload()
            payload['need_window_days'] = get_pricing_need_window_days()
            return payload

        # TTL-only cache (10 min); no signal invalidation.
        payload = cache.get_or_set('category_need_panel', _build, 600)
        return Response(payload)
