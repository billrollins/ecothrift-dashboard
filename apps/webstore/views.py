"""API for the curated web catalog and pickup holds."""
from __future__ import annotations

import os
import time
import uuid
from collections import defaultdict
from threading import Lock

from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Count, F, Max, Q
from django.http import FileResponse, Http404, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.decorators import permission_classes as perm_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin
from apps.core.models import S3File

from .models import ChannelPublication, Order, Reservation, WebListing, WebListingImage
from .serializers import (
    OrderStaffSerializer,
    ReservationPublicSerializer,
    ReservationStaffSerializer,
    WebListingDetailPublicSerializer,
    WebListingImageSerializer,
    WebListingListPublicSerializer,
    WebListingSerializer,
)
from .services.reservations import (
    complete_reservation,
    confirm_reservation,
    create_hold,
    release_reservation,
    stage_reservation,
)

PAGE_SIZE_DEFAULT = 24
PAGE_SIZE_MAX = 60
_TRUTHY = ('1', 'true', 'True', 'yes')

_HOLD_HITS: dict[str, list[float]] = defaultdict(list)
_HOLD_LOCK = Lock()
_HOLD_WINDOW_SEC = 60
_HOLD_MAX = 8


def _client_ip(request) -> str:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR') or 'unknown'


def _rate_limit_hold(request) -> bool:
    ip = _client_ip(request)
    now = time.time()
    with _HOLD_LOCK:
        hits = _HOLD_HITS[ip]
        _HOLD_HITS[ip] = [t for t in hits if now - t < _HOLD_WINDOW_SEC]
        if len(_HOLD_HITS[ip]) >= _HOLD_MAX:
            return False
        _HOLD_HITS[ip].append(now)
        return True


def _ensure_channel_rows(listing: WebListing) -> None:
    for channel in ('website', 'facebook_page'):
        ChannelPublication.objects.get_or_create(
            listing=listing,
            channel=channel,
            defaults={
                'title': (
                    listing.fb_title or listing.title
                    if channel == 'facebook_page'
                    else listing.title
                ),
                'body': listing.fb_body if channel == 'facebook_page' else (listing.description or ''),
                'status': 'posted' if listing.status == 'published' and channel == 'website' else 'draft',
            },
        )


class WebListingViewSet(viewsets.ModelViewSet):
    queryset = (
        WebListing.objects
        .select_related('category', 'item')
        .prefetch_related('images__s3_file', 'channel_publications')
        .all()
    )
    serializer_class = WebListingSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'category', 'featured', 'condition', 'return_policy']
    search_fields = ['title', 'sku', 'description']
    ordering_fields = ['created_at', 'updated_at', 'price', 'title', 'featured', 'on_hand']

    def perform_create(self, serializer):
        listing = serializer.save(created_by=self.request.user)
        listing.sync_stock_mirror()
        listing.save(update_fields=['stock', 'updated_at'])
        _ensure_channel_rows(listing)

    def perform_update(self, serializer):
        listing = serializer.save()
        listing.sync_stock_mirror()
        listing.save(update_fields=['stock', 'updated_at'])
        _ensure_channel_rows(listing)

    @action(detail=True, methods=['post'], url_path='publish')
    def publish(self, request, pk=None):
        listing = self.get_object()
        errors = listing.publish_readiness_errors()
        if errors:
            return Response({'detail': 'Not ready to publish.', 'errors': errors}, status=400)
        listing.status = 'published'
        if listing.published_at is None:
            listing.published_at = timezone.now()
        listing.save(update_fields=['status', 'published_at', 'updated_at'])
        ChannelPublication.objects.update_or_create(
            listing=listing,
            channel='website',
            defaults={'status': 'posted', 'title': listing.title, 'body': listing.description or ''},
        )
        return Response(WebListingSerializer(listing).data)

    @action(detail=True, methods=['post'], url_path='pause')
    def pause(self, request, pk=None):
        listing = self.get_object()
        if listing.status != 'published':
            return Response({'detail': 'Only published listings can be paused.'}, status=400)
        listing.status = 'paused'
        listing.save(update_fields=['status', 'updated_at'])
        return Response(WebListingSerializer(listing).data)

    @action(detail=True, methods=['post'], url_path='archive')
    def archive(self, request, pk=None):
        listing = self.get_object()
        listing.status = 'archived'
        listing.archived_at = timezone.now()
        listing.save(update_fields=['status', 'archived_at', 'updated_at'])
        return Response(WebListingSerializer(listing).data)

    @action(detail=True, methods=['post'], url_path='restore')
    def restore(self, request, pk=None):
        listing = self.get_object()
        if listing.status != 'archived':
            return Response({'detail': 'Only archived listings can be restored.'}, status=400)
        listing.status = 'draft'
        listing.archived_at = None
        listing.save(update_fields=['status', 'archived_at', 'updated_at'])
        return Response(WebListingSerializer(listing).data)

    @action(detail=True, methods=['post'], url_path='generate-fb-copy')
    def generate_fb_copy(self, request, pk=None):
        listing = self.get_object()
        title = listing.title[:200]
        body = (
            f"{listing.title}\n"
            f"Condition: {listing.get_condition_display()}\n"
            f"Price: ${listing.price}\n\n"
            f"{(listing.description or '').strip()}\n\n"
            f"Request a hold at ecothrift.us/shop/{listing.slug}\n"
            f"Pay & pick up in store — no shipping or online payment."
        ).strip()
        listing.fb_title = title
        listing.fb_body = body
        listing.save(update_fields=['fb_title', 'fb_body', 'updated_at'])
        ChannelPublication.objects.update_or_create(
            listing=listing,
            channel='facebook_page',
            defaults={'title': title, 'body': body, 'status': 'draft'},
        )
        return Response(WebListingSerializer(listing).data)

    @action(detail=True, methods=['post'], url_path='mark-fb-posted')
    def mark_fb_posted(self, request, pk=None):
        listing = self.get_object()
        url = (request.data.get('external_url') or '').strip()
        listing.fb_posted_url = url
        listing.fb_posted_at = timezone.now()
        listing.save(update_fields=['fb_posted_url', 'fb_posted_at', 'updated_at'])
        ChannelPublication.objects.update_or_create(
            listing=listing,
            channel='facebook_page',
            defaults={
                'title': listing.fb_title or listing.title,
                'body': listing.fb_body or '',
                'external_url': url,
                'status': 'posted',
                'posted_at': listing.fb_posted_at,
            },
        )
        return Response(WebListingSerializer(listing).data)

    @action(detail=True, methods=['post'], url_path='images')
    def add_image(self, request, pk=None):
        listing = self.get_object()
        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'No file provided.'}, status=400)
        ext = os.path.splitext(file.name or '')[1].lower() or '.jpg'
        key = f'webstore/listings/{listing.id}/{uuid.uuid4().hex}{ext}'
        saved_path = default_storage.save(key, file)
        s3_file = S3File.objects.create(
            key=saved_path,
            filename=file.name or saved_path.split('/')[-1],
            size=getattr(file, 'size', 0) or 0,
            content_type=getattr(file, 'content_type', '') or '',
            uploaded_by=request.user,
        )
        next_pos = (listing.images.aggregate(m=Max('position'))['m'] or 0) + 1
        image = WebListingImage.objects.create(
            listing=listing,
            s3_file=s3_file,
            alt=request.data.get('alt', ''),
            position=next_pos,
        )
        return Response(WebListingImageSerializer(image).data, status=201)

    @action(detail=True, methods=['post'], url_path='images/reorder')
    def reorder_images(self, request, pk=None):
        listing = self.get_object()
        order = request.data.get('order') or []
        for idx, image_id in enumerate(order):
            WebListingImage.objects.filter(pk=image_id, listing=listing).update(position=idx)
        listing = self.get_queryset().get(pk=listing.pk)
        return Response(WebListingSerializer(listing).data)

    @action(detail=True, methods=['delete'], url_path=r'images/(?P<image_id>[0-9]+)')
    def delete_image(self, request, pk=None, image_id=None):
        listing = self.get_object()
        image = get_object_or_404(WebListingImage, pk=image_id, listing=listing)
        s3_file = image.s3_file
        image.delete()
        try:
            default_storage.delete(s3_file.key)
        except Exception:
            pass
        s3_file.delete()
        return Response(status=204)


class ReservationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = (
        Reservation.objects
        .select_related('listing', 'item', 'pos_cart')
        .all()
    )
    serializer_class = ReservationStaffSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'listing']
    search_fields = ['customer_name', 'email', 'phone', 'status_token', 'listing__title']
    ordering_fields = ['created_at', 'expires_at', 'status']

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm(self, request, pk=None):
        reservation = confirm_reservation(self.get_object(), user=request.user)
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='stage')
    def stage(self, request, pk=None):
        reservation = stage_reservation(self.get_object(), user=request.user)
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='decline')
    def decline(self, request, pk=None):
        reservation = release_reservation(self.get_object(), 'declined')
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        reservation = release_reservation(self.get_object(), 'cancelled')
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='expire')
    def expire(self, request, pk=None):
        reservation = release_reservation(self.get_object(), 'expired')
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        reservation = complete_reservation(self.get_object(), user=request.user)
        return Response(ReservationStaffSerializer(reservation).data)


@api_view(['GET'])
@perm_classes([AllowAny])
def public_catalog(request):
    qs = (
        WebListing.objects.filter(status='published')
        .select_related('category')
        .prefetch_related('images')
    )
    category = request.query_params.get('category')
    if category:
        qs = qs.filter(category__slug=category)
    q = request.query_params.get('q')
    if q:
        qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q))
    if request.query_params.get('featured') in _TRUTHY:
        qs = qs.filter(featured=True)
    if request.query_params.get('on_sale') in _TRUTHY:
        qs = qs.filter(compare_at_price__gt=F('price'))
    if request.query_params.get('available') in _TRUTHY:
        qs = qs.filter(on_hand__gt=F('reserved'))

    sort_map = {
        'price_asc': ('price', '-created_at'),
        'price_desc': ('-price', '-created_at'),
        'new': ('-created_at',),
        'featured': ('-featured', '-created_at'),
    }
    sort = request.query_params.get('sort', 'featured')
    qs = qs.order_by(*sort_map.get(sort, sort_map['featured']))

    try:
        page = max(1, int(request.query_params.get('page', 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.query_params.get('page_size', PAGE_SIZE_DEFAULT))
    except (TypeError, ValueError):
        page_size = PAGE_SIZE_DEFAULT
    page_size = max(1, min(page_size, PAGE_SIZE_MAX))

    total = qs.count()
    start = (page - 1) * page_size
    results = WebListingListPublicSerializer(list(qs[start:start + page_size]), many=True).data
    return Response({
        'count': total,
        'page': page,
        'page_size': page_size,
        'num_pages': (total + page_size - 1) // page_size if page_size else 1,
        'results': results,
    })


@api_view(['GET'])
@perm_classes([AllowAny])
def public_listing_detail(request, slug):
    try:
        listing = (
            WebListing.objects.select_related('category')
            .prefetch_related('images')
            .get(slug=slug, status='published')
        )
    except WebListing.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    return Response(WebListingDetailPublicSerializer(listing).data)


@api_view(['GET'])
@perm_classes([AllowAny])
def public_categories(request):
    from apps.inventory.models import Category
    from apps.webstore.shop_categories import SHOP_CATEGORIES

    count_by_slug = {
        r['category__slug']: r['count']
        for r in (
            WebListing.objects.filter(status='published', category__isnull=False)
            .values('category__slug')
            .annotate(count=Count('id'))
        )
    }
    categories = []
    for row in SHOP_CATEGORIES:
        slug = row['slug']
        db_cat = Category.objects.filter(slug=slug).first()
        categories.append({
            'id': db_cat.id if db_cat else None,
            'name': row['name'],
            'slug': slug,
            'description': row['description'],
            'count': count_by_slug.get(slug, 0),
        })
    total = WebListing.objects.filter(status='published').count()
    return Response({'total': total, 'categories': categories})


def listing_image(request, image_id):
    try:
        image = WebListingImage.objects.select_related('s3_file').get(pk=image_id)
    except WebListingImage.DoesNotExist:
        raise Http404('Image not found.')
    key = image.s3_file.key
    try:
        url = default_storage.url(key)
    except Exception:
        url = None
    if url and str(url).lower().startswith(('http://', 'https://')):
        response = HttpResponseRedirect(url)
        response['Cache-Control'] = 'public, max-age=300'
        return response
    try:
        handle = default_storage.open(key, 'rb')
    except (OSError, FileNotFoundError):
        raise Http404('Image file missing.')
    response = FileResponse(
        handle, content_type=image.s3_file.content_type or 'application/octet-stream',
    )
    response['Cache-Control'] = 'public, max-age=300'
    return response


@api_view(['POST'])
@perm_classes([AllowAny])
def checkout(request):
    return Response(
        {
            'detail': (
                'Online checkout is no longer available. Request a hold instead — '
                'pay and pick up in store. No shipping, delivery, or online payment.'
            ),
            'code': 'CHECKOUT_DISABLED',
        },
        status=410,
    )


@api_view(['GET'])
@perm_classes([AllowAny])
def order_status(request, order_number):
    return Response(
        {
            'detail': 'Order status lookup is no longer available. Use your hold status link.',
            'code': 'ORDER_STATUS_DISABLED',
        },
        status=410,
    )


@api_view(['POST'])
@perm_classes([AllowAny])
def request_hold(request):
    if not _rate_limit_hold(request):
        return Response({'detail': 'Too many hold requests. Try again shortly.'}, status=429)

    data = request.data or {}
    fulfillment = (data.get('fulfillment') or '').strip().lower()
    if fulfillment == 'ship' or data.get('ship_address1') or data.get('shipping'):
        return Response(
            {'detail': 'Shipping and delivery are not available. Pickup holds only.', 'code': 'SHIP_REJECTED'},
            status=400,
        )
    if data.get('payment') or data.get('payment_method') or data.get('card'):
        return Response(
            {'detail': 'Online payment is not available. Pay in store at pickup.', 'code': 'PAY_REJECTED'},
            status=400,
        )

    items = data.get('items') or []
    slug = (data.get('slug') or '').strip()
    if slug and not items:
        try:
            qty = int(data.get('quantity') or data.get('qty') or 1)
        except (TypeError, ValueError):
            qty = 1
        items = [{'slug': slug, 'qty': qty}]

    if not items:
        return Response({'detail': 'Select at least one listing to hold.'}, status=400)

    name = (data.get('customer_name') or '').strip()
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip()
    note = (data.get('note') or data.get('customer_note') or '').strip()
    idem = (data.get('idempotency_key') or request.headers.get('Idempotency-Key') or '').strip()

    created = []
    try:
        with transaction.atomic():
            for raw in items:
                item_slug = (raw.get('slug') or '').strip()
                try:
                    qty = int(raw.get('qty') or raw.get('quantity') or 1)
                except (TypeError, ValueError):
                    qty = 1
                if not item_slug:
                    continue
                listing = get_object_or_404(WebListing, slug=item_slug)
                key = f'{idem}:{item_slug}' if idem else ''
                reservation = create_hold(
                    listing=listing,
                    quantity=qty,
                    customer_name=name,
                    email=email,
                    phone=phone,
                    customer_note=note,
                    idempotency_key=key,
                )
                created.append(reservation)
    except ValidationError as exc:
        detail = exc.detail
        if isinstance(detail, dict):
            return Response(detail, status=409)
        return Response({'detail': detail}, status=409)

    if not created:
        return Response({'detail': 'No valid listings to hold.'}, status=400)
    if len(created) == 1:
        return Response(ReservationPublicSerializer(created[0]).data, status=201)
    return Response(
        {'holds': ReservationPublicSerializer(created, many=True).data, 'count': len(created)},
        status=201,
    )


@api_view(['GET'])
@perm_classes([AllowAny])
def hold_status(request, token):
    try:
        reservation = Reservation.objects.select_related('listing').get(status_token=token)
    except Reservation.DoesNotExist:
        return Response({'detail': 'Hold not found.'}, status=404)
    return Response(ReservationPublicSerializer(reservation).data)


@api_view(['GET'])
@perm_classes([IsAuthenticated, IsManagerOrAdmin])
def work_queue(request):
    from apps.inventory.models import Item

    items = list(
        Item.objects.filter(location='online_sales')
        .exclude(status__in=('sold', 'scrapped', 'lost'))
        .select_related('product')
        .order_by('-updated_at')[:100]
    )
    drafts = list(
        WebListing.objects.filter(status__in=('draft', 'ready'))
        .select_related('item')
        .order_by('-updated_at')[:100]
    )
    return Response({
        'items': [
            {
                'id': it.id,
                'sku': it.sku,
                'title': it.product.title if it.product_id else '',
                'status': it.status,
                'location': it.location,
                'price': str(it.price) if it.price is not None else None,
            }
            for it in items
        ],
        'draft_listings': WebListingSerializer(drafts, many=True).data,
    })


@api_view(['GET'])
@perm_classes([IsAuthenticated, IsManagerOrAdmin])
def sales_log(request):
    qs = (
        Reservation.objects.filter(status='completed')
        .select_related('listing', 'item', 'pos_cart')
        .order_by('-completed_at')[:200]
    )
    return Response({'results': ReservationStaffSerializer(qs, many=True).data})


class OrderViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Order.objects.prefetch_related('lines').all()
    serializer_class = OrderStaffSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'payment_status', 'fulfillment']
    search_fields = ['order_number', 'email', 'customer_name']
    ordering_fields = ['created_at', 'total', 'status']
