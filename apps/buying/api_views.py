"""DRF viewsets and sweep endpoint for buying API."""

from __future__ import annotations

import logging
from decimal import Decimal

from django.core.cache import cache
from django.db.models import (
    Case,
    Count,
    DecimalField,
    F,
    Max,
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
    CategoryMapping,
    CategoryWantVote,
    ManifestRow,
    Marketplace,
    WatchlistEntry,
)
from apps.buying.services.buying_settings import get_pricing_need_window_days
from apps.buying.services.category_need import build_category_need_rows
from apps.buying.services.want_vote import effective_want_value
from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES
from apps.buying.pagination import ManifestRowsPagination, SnapshotPagination
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
from apps.buying.services import pipeline
from apps.buying.services.ai_key_mapping import map_one_fast_cat_batch
from apps.buying.services.manifest_upload import process_manifest_upload
from apps.buying.services.valuation import (
    recompute_auction_valuation,
    recompute_all_open_auctions,
    run_ai_estimate_for_swept_auctions,
)

logger = logging.getLogger(__name__)


def annotate_auction_list_extras(qs):
    """Manifest row count, retail sum, and hybrid retail_sort for list ordering."""
    return qs.annotate(
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

# Token-backed B-Stock HTTP from the API is disabled; use CSV upload. Management commands may still be run manually.
_TOKEN_BACKED_BSTOCK_DISABLED = (
    'Token-backed B-Stock calls are disabled. Use CSV upload instead.'
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
    ]
    ordering = ['end_time']

    def get_queryset(self):
        return annotate_auction_list_extras(
            Auction.objects.filter(watchlist_entry__isnull=False)
            .exclude(listing_type__iexact=Auction.LISTING_TYPE_CONTRACT)
            .select_related('marketplace', 'watchlist_entry')
            .annotate(added_at=F('watchlist_entry__added_at'))
        )


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
    ]
    ordering = ['-end_time']

    def get_queryset(self):
        qs = super().get_queryset().select_related('marketplace')
        if self.action in ('list', 'summary'):
            qs = qs.exclude(listing_type__iexact=Auction.LISTING_TYPE_CONTRACT)
        if self.action == 'list':
            qs = annotate_auction_list_extras(qs)
        if self.action == 'retrieve':
            qs = qs.annotate(manifest_rows_count=Count('manifest_rows', distinct=True))
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
        ):
            qs = qs.select_related('watchlist_entry')
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return AuctionDetailSerializer
        return AuctionListSerializer

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

    @action(detail=True, methods=['post'], url_path='pull_manifest')
    def pull_manifest(self, request, pk=None):
        """Disabled: use CSV upload. See ``python manage.py pull_manifests`` for manual JWT-backed pulls."""
        return Response(
            {'detail': _TOKEN_BACKED_BSTOCK_DISABLED, 'code': 'token_backed_bstock_disabled'},
            status=status.HTTP_501_NOT_IMPLEMENTED,
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
        auction.save(update_fields=['has_manifest', 'manifest_category_distribution'])
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
        """Disabled: use CSV upload for manifests. See ``python manage.py watch_auctions`` for manual JWT polls."""
        return Response(
            {'detail': _TOKEN_BACKED_BSTOCK_DISABLED, 'code': 'token_backed_bstock_disabled'},
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )

    @action(
        detail=True,
        methods=['post', 'delete'],
        url_path='thumbs-up',
        permission_classes=[IsAuthenticated, IsAdmin],
    )
    def thumbs_up(self, request, pk=None):
        auction = self.get_object()
        auction.thumbs_up = request.method == 'POST'
        auction.save(update_fields=['thumbs_up'])
        return Response({'thumbs_up': auction.thumbs_up}, status=status.HTTP_200_OK)

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


class SweepView(APIView):
    """
    POST triggers pipeline.run_discovery (search API; no B-Stock JWT required).

    Optional query param: marketplace=<slug> to limit to one marketplace.
    enrich_detail stays False so this does not call auction.bstock.com (no token).
    """

    permission_classes = [IsAuthenticated, IsStaff]

    def post(self, request):
        slug = request.query_params.get('marketplace')
        if slug is not None:
            slug = slug.strip() or None
        try:
            summary = pipeline.run_discovery(
                marketplace_slug=slug,
                dry_run=False,
                enrich_detail=False,
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception('buying sweep failed')
            return Response(
                {'detail': 'Sweep failed. Check server logs.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        ids = summary.get('upserted_auction_ids') or []
        try:
            ai_est = run_ai_estimate_for_swept_auctions(ids)
            recomputed = recompute_all_open_auctions()
            summary = {
                **summary,
                'ai_estimate': ai_est,
                'recomputed_open_auctions': recomputed,
            }
        except Exception as e:
            logger.exception('post-sweep valuation failed')
            summary = {**summary, 'valuation_error': str(e)}
        return Response(summary)


class CategoryNeedView(APIView):
    """GET: category need panel aggregates (19 taxonomy rows + need_window_days)."""

    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        def _build():
            return {
                'need_window_days': get_pricing_need_window_days(),
                'categories': build_category_need_rows(),
            }

        # TTL-only cache (10 min); no signal invalidation.
        payload = cache.get_or_set('category_need_panel', _build, 600)
        return Response(payload)


class CategoryWantView(APIView):
    """GET/POST staff want votes per taxonomy category (decay on read)."""

    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        votes = {v.category: v for v in CategoryWantVote.objects.filter(user=request.user)}
        out = []
        for name in TAXONOMY_V1_CATEGORY_NAMES:
            v = votes.get(name)
            if v is not None:
                out.append(
                    {
                        'category': name,
                        'value': v.value,
                        'voted_at': v.voted_at,
                        'effective_value': effective_want_value(v.value, v.voted_at),
                    }
                )
            else:
                out.append(
                    {
                        'category': name,
                        'value': None,
                        'voted_at': None,
                        'effective_value': 5.0,
                    }
                )
        return Response(out)

    def post(self, request):
        cat = (request.data.get('category') or '').strip()
        if cat not in TAXONOMY_V1_CATEGORY_NAMES:
            return Response(
                {'detail': 'Invalid or unknown category.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            val = int(request.data.get('value'))
        except (TypeError, ValueError):
            return Response(
                {'detail': 'value must be an integer 1-10.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if val < 1 or val > 10:
            return Response(
                {'detail': 'value must be 1-10.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj, _created = CategoryWantVote.objects.update_or_create(
            user=request.user,
            category=cat,
            defaults={'value': val},
        )
        obj.refresh_from_db()
        return Response(
            {
                'category': obj.category,
                'value': obj.value,
                'voted_at': obj.voted_at,
                'effective_value': effective_want_value(obj.value, obj.voted_at),
            },
            status=status.HTTP_200_OK,
        )
