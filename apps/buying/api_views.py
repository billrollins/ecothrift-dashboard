"""DRF viewsets and sweep endpoint for buying API."""

from __future__ import annotations

import logging

from django.db.models import Count, F, Max
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsStaff
from apps.buying.filters import AuctionFilter, WatchlistAuctionFilter
from apps.buying.models import Auction, AuctionSnapshot, ManifestRow, Marketplace, WatchlistEntry
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
from apps.buying.services import pipeline, scraper

logger = logging.getLogger(__name__)


class WatchlistAuctionViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    GET /api/buying/watchlist/ — auctions the staff user is watching (WatchlistEntry).

    Default ordering: ``end_time`` ascending (soonest ending first).
    """

    permission_classes = [IsAuthenticated, IsStaff]
    serializer_class = AuctionWatchlistListSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_class = WatchlistAuctionFilter
    ordering_fields = ['end_time', 'current_price', 'total_retail_value', 'added_at']
    ordering = ['end_time']

    def get_queryset(self):
        return (
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
    ]
    ordering = ['-end_time']

    def get_queryset(self):
        qs = super().get_queryset().select_related('marketplace')
        if self.action in ('list', 'summary'):
            qs = qs.exclude(listing_type__iexact=Auction.LISTING_TYPE_CONTRACT)
        if self.action == 'retrieve':
            qs = qs.annotate(manifest_rows_count=Count('manifest_rows', distinct=True))
            qs = qs.select_related('watchlist_entry')
        elif self.action in (
            'manifest_rows',
            'pull_manifest',
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
        paginator = ManifestRowsPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = ManifestRowSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(detail=True, methods=['post'], url_path='pull_manifest')
    def pull_manifest(self, request, pk=None):
        """Run pipeline manifest pull for this auction (requires B-Stock JWT on server)."""
        auction = self.get_object()
        if not (auction.lot_id or '').strip():
            return Response(
                {
                    'detail': (
                        'This auction has no lot_id; the B-Stock manifest API path uses '
                        'lotId. Refresh listing data (sweep) or verify the listing in B-Stock.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            summary = pipeline.run_manifest_pull(auction_ids=[auction.pk], force=False)
        except ValueError as e:
            msg = str(e)
            if 'No B-Stock token' in msg or 'bstock_token' in msg.lower():
                return Response(
                    {'detail': msg, 'code': 'bstock_token_missing'},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            raise
        except scraper.BStockAuthError:
            return Response(
                {
                    'detail': scraper.AUTH_TOKEN_EXPIRED_MESSAGE,
                    'code': 'bstock_token_expired',
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return Response(summary)

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
        """Run watch poll for this auction only (requires watchlist + B-Stock JWT on server)."""
        auction = self.get_object()
        if not getattr(auction, 'watchlist_entry', None):
            return Response(
                {
                    'detail': (
                        'Add this auction to your watchlist before polling. '
                        'Polling updates price history for watched auctions only.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            summary = pipeline.run_watch_poll(
                auction_ids=[auction.pk],
                force=True,
                dry_run=False,
            )
        except ValueError as e:
            msg = str(e)
            if 'No B-Stock token' in msg or 'bstock_token' in msg.lower():
                return Response(
                    {'detail': msg, 'code': 'bstock_token_missing'},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            raise
        except scraper.BStockAuthError:
            return Response(
                {
                    'detail': scraper.AUTH_TOKEN_EXPIRED_MESSAGE,
                    'code': 'bstock_token_expired',
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return Response(summary)


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
        return Response(summary)
