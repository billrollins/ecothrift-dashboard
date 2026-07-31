"""API for the curated web catalog and pickup holds."""
from __future__ import annotations

import os
import uuid

from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Count, F, Max, Q
from django.http import FileResponse, Http404, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action, api_view, throttle_classes
from rest_framework.decorators import permission_classes as perm_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from apps.accounts.permissions import IsManagerOrAdmin
from apps.core.models import S3File

from .models import ChannelPublication, Conversation, Order, Reservation, WebListing, WebListingImage
from .serializers import (
    ConversationStaffListSerializer,
    ConversationStaffSerializer,
    MessagePublicSerializer,
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


class _FixedScopeThrottle(SimpleRateThrottle):
    """SimpleRateThrottle with a class-level scope (ScopedRateThrottle needs view.throttle_scope)."""

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class OnlineHoldThrottle(_FixedScopeThrottle):
    scope = 'online_hold'


class OnlineMessageThrottle(_FixedScopeThrottle):
    scope = 'online_message'


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

    def destroy(self, request, *args, **kwargs):
        listing = self.get_object()
        if listing.reservations.filter(status__in=Reservation.ACTIVE_STATUSES).exists():
            return Response(
                {
                    'detail': (
                        'Cannot delete a listing with active holds. '
                        'Cancel, decline, expire, or complete holds first.'
                    ),
                },
                status=409,
            )
        return super().destroy(request, *args, **kwargs)

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

    @action(detail=True, methods=['post'], url_path='mark-sold')
    def mark_sold(self, request, pk=None):
        listing = self.get_object()
        if listing.status == 'archived':
            return Response({'detail': 'Archived listings cannot be marked sold.'}, status=400)
        if listing.reservations.filter(status__in=Reservation.ACTIVE_STATUSES).exists():
            return Response(
                {
                    'detail': (
                        'Cannot mark sold while active holds exist. '
                        'Cancel, decline, expire, or complete holds first.'
                    ),
                },
                status=409,
            )
        listing.status = 'sold'
        listing.save(update_fields=['status', 'updated_at'])
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

    @action(detail=True, methods=['patch', 'delete'], url_path=r'images/(?P<image_id>[0-9]+)')
    def delete_image(self, request, pk=None, image_id=None):
        listing = self.get_object()
        image = get_object_or_404(WebListingImage, pk=image_id, listing=listing)
        if request.method == 'PATCH':
            alt = request.data.get('alt')
            if alt is None:
                return Response({'detail': 'alt is required.'}, status=400)
            image.alt = str(alt)[:200]
            image.save(update_fields=['alt'])
            return Response(WebListingImageSerializer(image).data)
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

    @action(detail=True, methods=['post'], url_path='extend')
    def extend(self, request, pk=None):
        """Push expiry to next business-day close (ready/confirmed holds)."""
        from apps.webstore.services.hours import next_business_day_close_after

        reservation = self.get_object()
        if reservation.status not in ('confirmed', 'ready_for_pickup'):
            return Response(
                {'detail': f'Cannot extend from status {reservation.status}.'},
                status=400,
            )
        reservation.expires_at = next_business_day_close_after(timezone.now())
        reservation.save(update_fields=['expires_at', 'updated_at'])
        return Response(ReservationStaffSerializer(reservation).data)


class ConversationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    serializer_class = ConversationStaffSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['state', 'listing', 'staff_owner']
    search_fields = ['guest_name', 'guest_email', 'guest_phone', 'public_token', 'listing__title']
    ordering_fields = ['last_message_at', 'created_at', 'state']

    def get_serializer_class(self):
        if self.action == 'list':
            return ConversationStaffListSerializer
        return ConversationStaffSerializer

    def get_queryset(self):
        qs = Conversation.objects.select_related(
            'listing', 'reservation', 'staff_owner', 'customer',
        )
        if self.action != 'list':
            qs = qs.prefetch_related('messages')
        has_hold = self.request.query_params.get('has_hold')
        if has_hold in _TRUTHY:
            qs = qs.filter(reservation__isnull=False)
        elif has_hold in ('0', 'false', 'False', 'no'):
            qs = qs.filter(reservation__isnull=True)
        return qs

    def retrieve(self, request, *args, **kwargs):
        from apps.webstore.services.conversations import mark_staff_read
        conv = self.get_object()
        mark_staff_read(conv)
        conv = self.get_queryset().get(pk=conv.pk)
        return Response(ConversationStaffSerializer(conv).data)

    @action(detail=True, methods=['post'], url_path='reply')
    def reply(self, request, pk=None):
        from apps.webstore.emails import send_you_have_a_reply
        from apps.webstore.services.conversations import post_message
        body = (request.data or {}).get('body') or ''
        subject = (request.data or {}).get('subject') or ''
        conv = self.get_object()
        post_message(conv, author_kind='staff', body=body, author_user=request.user)
        conv = self.get_queryset().select_related('listing', 'reservation').get(pk=conv.pk)
        try:
            send_you_have_a_reply(conv, reply_body=body, subject_override=subject)
        except Exception:
            pass
        return Response(ConversationStaffSerializer(conv).data)

    @action(detail=True, methods=['post'], url_path='assign')
    def assign(self, request, pk=None):
        from apps.webstore.services.conversations import assign_conversation
        conv = assign_conversation(self.get_object(), request.user)
        return Response(ConversationStaffSerializer(conv).data)

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve(self, request, pk=None):
        from apps.webstore.services.conversations import resolve_conversation
        conv = resolve_conversation(self.get_object())
        return Response(ConversationStaffSerializer(conv).data)

    @action(detail=True, methods=['post'], url_path='reopen')
    def reopen(self, request, pk=None):
        from apps.webstore.services.conversations import reopen_conversation
        conv = reopen_conversation(self.get_object())
        return Response(ConversationStaffSerializer(conv).data)


def _public_surface_disabled_response():
    return Response(
        {
            'detail': 'Online listings and holds are not available yet.',
            'code': 'ONLINE_SALES_DISABLED',
        },
        status=410,
    )


@api_view(['GET'])
@perm_classes([AllowAny])
def public_config(request):
    """Kill-switch + feature flags for public/staff SPAs."""
    from apps.webstore.services.feature import online_sales_enabled
    from django.conf import settings as dj_settings

    public_base = (
        getattr(dj_settings, 'ONLINE_SALES_PUBLIC_BASE_URL', None) or 'https://ecothrift.us'
    ).rstrip('/')
    return Response({
        'online_sales_enabled': online_sales_enabled(),
        'inquiries_enabled': bool(getattr(dj_settings, 'ONLINE_SALES_INQUIRIES_ENABLED', True)),
        'accounts_enabled': bool(getattr(dj_settings, 'ONLINE_SALES_ACCOUNTS_ENABLED', True)),
        'public_base_url': public_base,
    })


@api_view(['GET'])
@perm_classes([AllowAny])
def public_catalog(request):
    from apps.webstore.services.feature import online_sales_enabled

    if not online_sales_enabled():
        return _public_surface_disabled_response()

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
    from apps.webstore.services.feature import online_sales_enabled

    if not online_sales_enabled():
        return _public_surface_disabled_response()

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
    from apps.webstore.services.feature import online_sales_enabled

    if not online_sales_enabled():
        return _public_surface_disabled_response()

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
@throttle_classes([OnlineHoldThrottle])
def request_hold(request):
    from apps.webstore.services.feature import online_sales_enabled

    if not online_sales_enabled():
        return Response(
            {
                'detail': (
                    'Online listings and holds are not available yet. '
                    'Please visit the store or check back later.'
                ),
                'code': 'HOLDS_DISABLED',
            },
            status=410,
        )

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
                # Client keys are often UUIDs; appending slug must stay within the column.
                key = f'{idem}:{item_slug}'[:128] if idem else ''
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
        reservation = (
            Reservation.objects
            .select_related('listing', 'conversation')
            .prefetch_related('conversation__messages')
            .get(status_token=token)
        )
    except Reservation.DoesNotExist:
        return Response({'detail': 'Hold not found.'}, status=404)
    return Response(ReservationPublicSerializer(reservation).data)


@api_view(['POST'])
@perm_classes([AllowAny])
@throttle_classes([OnlineMessageThrottle])
def thread_post_message(request, token):
    """Guest reply on a conversation public_token."""
    from apps.webstore.services.conversations import mark_customer_read, post_message
    from apps.webstore.services.feature import online_sales_enabled

    if not online_sales_enabled():
        return _public_surface_disabled_response()

    try:
        conv = Conversation.objects.prefetch_related('messages').get(public_token=token)
    except Conversation.DoesNotExist:
        return Response({'detail': 'Thread not found.'}, status=404)

    body = (request.data or {}).get('body') or ''
    try:
        post_message(conv, author_kind='customer', body=body)
    except ValidationError as exc:
        return Response(exc.detail, status=400)

    conv = Conversation.objects.prefetch_related('messages').get(pk=conv.pk)
    mark_customer_read(conv)
    return Response({
        'public_token': conv.public_token,
        'state': conv.state,
        'customer_unread': 0,
        'messages': MessagePublicSerializer(conv.messages.all(), many=True).data,
    }, status=201)


@api_view(['POST'])
@perm_classes([AllowAny])
def thread_mark_read(request, token):
    """Mark a conversation read for the customer (explicit; not a GET side effect)."""
    from apps.webstore.services.conversations import mark_customer_read

    try:
        conv = Conversation.objects.prefetch_related('messages').get(public_token=token)
    except Conversation.DoesNotExist:
        return Response({'detail': 'Thread not found.'}, status=404)

    mark_customer_read(conv)
    conv.refresh_from_db()
    return Response({
        'public_token': conv.public_token,
        'state': conv.state,
        'customer_unread': 0,
        'messages': MessagePublicSerializer(conv.messages.all(), many=True).data,
    })


@api_view(['POST'])
@perm_classes([AllowAny])
@throttle_classes([OnlineMessageThrottle])
def catalog_ask(request, slug):
    """Guest inquiry without a hold (gated by ONLINE_SALES_INQUIRIES_ENABLED)."""
    from django.conf import settings as dj_settings

    from apps.webstore.services.conversations import mark_customer_read, open_inquiry
    from apps.webstore.services.feature import online_sales_enabled

    if not online_sales_enabled():
        return _public_surface_disabled_response()
    if not bool(getattr(dj_settings, 'ONLINE_SALES_INQUIRIES_ENABLED', True)):
        return Response(
            {'detail': 'Inquiries are not available right now.', 'code': 'INQUIRIES_DISABLED'},
            status=410,
        )

    try:
        listing = WebListing.objects.get(slug=slug, status='published')
    except WebListing.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)

    data = request.data or {}
    try:
        conv = open_inquiry(
            listing=listing,
            name=data.get('name') or data.get('customer_name') or '',
            email=data.get('email') or '',
            phone=data.get('phone') or '',
            body=data.get('body') or data.get('message') or '',
        )
    except ValidationError as exc:
        return Response(exc.detail, status=400)

    mark_customer_read(conv)
    return Response({
        'public_token': conv.public_token,
        'state': conv.state,
        'listing_title': listing.title,
        'customer_unread': 0,
        'messages': MessagePublicSerializer(conv.messages.all(), many=True).data,
    }, status=201)


@api_view(['GET'])
@perm_classes([IsAuthenticated])
def my_holds(request):
    """Customer: reservations for the signed-in email only."""
    from apps.accounts.permissions import IsCustomer

    if not IsCustomer().has_permission(request, None):
        return Response({'detail': 'Customer accounts only.'}, status=403)
    email = (request.user.email or '').strip()
    qs = (
        Reservation.objects.filter(email__iexact=email)
        .select_related('listing', 'conversation')
        .order_by('-created_at')[:100]
    )
    return Response(
        ReservationPublicSerializer(
            qs,
            many=True,
            context={'include_thread_messages': False},
        ).data,
    )


@api_view(['GET'])
@perm_classes([IsAuthenticated])
def my_conversations(request):
    """Customer: conversations claimed to this user or matching email."""
    from apps.accounts.permissions import IsCustomer

    if not IsCustomer().has_permission(request, None):
        return Response({'detail': 'Customer accounts only.'}, status=403)
    email = (request.user.email or '').strip()
    qs = (
        Conversation.objects.filter(Q(customer=request.user) | Q(guest_email__iexact=email))
        .select_related('listing', 'reservation')
        .order_by('-last_message_at', '-created_at')[:100]
    )
    # List shape — no message bodies (open hold/thread token for history).
    return Response([
        {
            'public_token': c.public_token,
            'state': c.state,
            'listing_title': c.listing.title if c.listing_id else None,
            'reservation_status_token': (
                c.reservation.status_token if c.reservation_id else None
            ),
            'customer_unread': c.customer_unread,
            'last_message_at': c.last_message_at,
        }
        for c in qs
    ])


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
    item_ids = [it.id for it in items]
    existing_by_item: dict[int, int] = {}
    for wl in (
        WebListing.objects.filter(item_id__in=item_ids, status__in=('draft', 'ready'))
        .order_by('-updated_at')
        .only('id', 'item_id')
    ):
        if wl.item_id not in existing_by_item:
            existing_by_item[wl.item_id] = wl.id
    return Response({
        'items': [
            {
                'id': it.id,
                'sku': it.sku,
                'title': it.product.title if it.product_id else '',
                'status': it.status,
                'location': it.location,
                'price': str(it.price) if it.price is not None else None,
                'existing_listing_id': existing_by_item.get(it.id),
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
