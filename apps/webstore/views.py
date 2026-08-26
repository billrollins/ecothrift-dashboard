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
    ReservationDetailSerializer,
    ReservationEventSerializer,
    ReservationPublicSerializer,
    ReservationStaffSerializer,
    WebListingDetailPublicSerializer,
    WebListingImageSerializer,
    WebListingListPublicSerializer,
    WebListingSerializer,
)
from .services.reservations import (
    complete_reservation,
    add_staff_note,
    confirm_reservation,
    create_hold,
    record_event,
    release_reservation,
    reopen_reservation,
    stage_reservation,
)

PAGE_SIZE_DEFAULT = 24
PAGE_SIZE_MAX = 60
_TRUTHY = ('1', 'true', 'True', 'yes')
_FALSY = ('0', 'false', 'False', 'no')


def _apply_archived_filter(qs, request):
    """`archived=0` hides archived rows, `archived=1` shows only them.

    Omitting the param returns both, so a search reaches archived rows and no
    existing caller silently loses data.
    """
    value = request.query_params.get('archived')
    if value in _TRUTHY:
        return qs.filter(archived_at__isnull=False)
    if value in _FALSY:
        return qs.filter(archived_at__isnull=True)
    return qs


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
    ordering_fields = [
        'created_at', 'updated_at', 'price', 'title', 'featured', 'on_hand', 'fb_posted_at',
    ]

    def get_queryset(self):
        qs = super().get_queryset()
        # Staff catalog filter: Facebook posted vs never posted.
        fb = self.request.query_params.get('fb_posted')
        if fb == '1':
            qs = qs.filter(fb_posted_at__isnull=False)
        elif fb == '0':
            qs = qs.filter(fb_posted_at__isnull=True)
        return qs

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
            f"Pay & pick up in store - no shipping or online payment."
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
    serializer_class = ReservationStaffSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'listing']
    # phone_digits is an annotated digit-stripped phone for counter lookup.
    search_fields = [
        'customer_name', 'email', 'phone', 'phone_digits',
        'pickup_code', 'status_token', 'listing__title',
    ]
    ordering_fields = ['created_at', 'expires_at', 'status']

    def get_queryset(self):
        # Include pending_verification - stock is already reserved, so staff must
        # see why Available is 0. Internal confirm still refuses until verified.
        from django.db.models import Count, Prefetch, Value
        from django.db.models.functions import Replace

        from apps.webstore.models import ReservationEvent

        phone_digits = Replace(
            Replace(
                Replace(
                    Replace('phone', Value('('), Value('')),
                    Value(')'), Value(''),
                ),
                Value('-'), Value(''),
            ),
            Value(' '), Value(''),
        )
        qs = (
            Reservation.objects
            .select_related('listing', 'item', 'pos_cart', 'conversation')
            .prefetch_related(
                Prefetch(
                    'events',
                    queryset=(
                        ReservationEvent.objects
                        .select_related('actor')
                        .order_by('created_at', 'id')
                    ),
                ),
            )
            .annotate(
                phone_digits=phone_digits,
                _message_count=Count('conversation__messages'),
            )
            .all()
        )
        # Comma-separated status list for Released tab (cancelled,declined,expired).
        status_in = (self.request.query_params.get('status__in') or '').strip()
        if status_in:
            wanted = [s.strip() for s in status_in.split(',') if s.strip()]
            if wanted:
                qs = qs.filter(status__in=wanted)
        return _apply_archived_filter(qs, self.request)

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm(self, request, pk=None):
        reservation = confirm_reservation(self.get_object(), user=request.user)
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='stage')
    def stage(self, request, pk=None):
        reservation = stage_reservation(self.get_object(), user=request.user)
        return Response(ReservationStaffSerializer(reservation).data)

    def _require_reason(self, request):
        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return None, Response({'detail': 'A reason is required.'}, status=400)
        return reason[:200], None

    @action(detail=True, methods=['post'], url_path='decline')
    def decline(self, request, pk=None):
        reason, err = self._require_reason(request)
        if err is not None:
            return err
        reservation = release_reservation(
            self.get_object(), 'declined', user=request.user, reason=reason,
        )
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        reason, err = self._require_reason(request)
        if err is not None:
            return err
        reservation = release_reservation(
            self.get_object(), 'cancelled', user=request.user, reason=reason,
        )
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='expire')
    def expire(self, request, pk=None):
        reason = (request.data.get('reason') or '').strip()[:200] or 'No-show / expired by staff'
        reservation = release_reservation(
            self.get_object(), 'expired', user=request.user, reason=reason,
        )
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='reopen')
    def reopen(self, request, pk=None):
        """Bring a declined/cancelled/expired hold back to Approved."""
        note = (request.data.get('note') or request.data.get('reason') or '').strip()
        if not note:
            return Response({'detail': 'A note is required to reopen a hold.'}, status=400)
        reservation = reopen_reservation(self.get_object(), user=request.user, note=note)
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        reservation = complete_reservation(self.get_object(), user=request.user)
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='archive')
    def archive(self, request, pk=None):
        """Hide a finished hold from the queues. Status and stock untouched."""
        from apps.webstore.services.retention import archive_reservation

        reservation = archive_reservation(self.get_object(), user=request.user)
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='unarchive')
    def unarchive(self, request, pk=None):
        from apps.webstore.services.retention import unarchive_reservation

        reservation = unarchive_reservation(self.get_object())
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['post'], url_path='notes')
    def notes(self, request, pk=None):
        """Append an internal staff-only note to the hold timeline."""
        note = (request.data.get('note') or '').strip()
        if not note:
            return Response({'detail': 'Note cannot be empty.'}, status=400)
        reservation = self.get_object()
        event = add_staff_note(reservation, request.user, note)
        return Response(ReservationEventSerializer(event).data, status=201)

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
        record_event(
            reservation,
            'extended',
            actor=request.user,
            from_status=reservation.status,
            to_status=reservation.status,
            note=f'Expires {reservation.expires_at.isoformat()}' if reservation.expires_at else '',
        )
        return Response(ReservationStaffSerializer(reservation).data)

    @action(detail=True, methods=['get'], url_path='detail')
    def sale_detail(self, request, pk=None):
        """Sales-log / hold detail: reservation + event timeline + thread messages."""
        # Method cannot be named `detail` - that shadows DRF's action.detail flag.
        reservation = (
            Reservation.objects
            .select_related(
                'listing', 'item', 'pos_cart',
                'confirmed_by', 'staged_by', 'completed_by',
            )
            .prefetch_related('events__actor', 'conversation__messages')
            .get(pk=self.get_object().pk)
        )
        events = reservation.events.select_related('actor').all()
        thread = None
        try:
            conv = reservation.conversation
        except Conversation.DoesNotExist:
            conv = None
        if conv is not None:
            thread = {
                'public_token': conv.public_token,
                'state': conv.state,
                'id': conv.id,
                'messages': MessagePublicSerializer(conv.messages.all(), many=True).data,
            }
        return Response({
            'reservation': ReservationDetailSerializer(reservation).data,
            'events': ReservationEventSerializer(events, many=True).data,
            'thread': thread,
        })


class ConversationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    serializer_class = ConversationStaffSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['state', 'listing', 'staff_owner', 'customer']
    search_fields = [
        'guest_name', 'guest_email', 'guest_phone', 'public_token',
        'listing__title', 'customer__email', 'customer__first_name', 'customer__last_name',
    ]
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
        # Hide unverified threads unless staff explicitly filters state=pending_verification.
        if self.request.query_params.get('state') != 'pending_verification':
            qs = qs.exclude(state='pending_verification')
        has_hold = self.request.query_params.get('has_hold')
        if has_hold in _TRUTHY:
            qs = qs.filter(reservation__isnull=False)
        elif has_hold in _FALSY:
            qs = qs.filter(reservation__isnull=True)
        # Unread for staff - distinct from state=needs_reply (already-read
        # threads can still need a reply; the red badge is unread only).
        unread = self.request.query_params.get('unread')
        if unread in _TRUTHY:
            qs = qs.filter(staff_unread__gt=0)
        elif unread in _FALSY:
            qs = qs.filter(staff_unread=0)
        return _apply_archived_filter(qs, self.request)

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

    @action(detail=True, methods=['post'], url_path='archive')
    def archive(self, request, pk=None):
        """Drop a resolved thread out of the inbox. The customer keeps it."""
        from apps.webstore.services.retention import archive_conversation

        conv = archive_conversation(self.get_object(), user=request.user)
        return Response(ConversationStaffSerializer(conv).data)

    @action(detail=True, methods=['post'], url_path='unarchive')
    def unarchive(self, request, pk=None):
        from apps.webstore.services.retention import unarchive_conversation

        conv = unarchive_conversation(self.get_object())
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

    from apps.webstore.services.hours import public_hours_payload

    public_base = (
        getattr(dj_settings, 'ONLINE_SALES_PUBLIC_BASE_URL', None) or 'https://ecothrift.us'
    ).rstrip('/')
    return Response({
        'online_sales_enabled': online_sales_enabled(),
        'inquiries_enabled': bool(getattr(dj_settings, 'ONLINE_SALES_INQUIRIES_ENABLED', True)),
        'accounts_enabled': bool(getattr(dj_settings, 'ONLINE_SALES_ACCOUNTS_ENABLED', True)),
        'public_base_url': public_base,
        'hours': public_hours_payload(),
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
                'Online checkout is no longer available. Request a hold instead - '
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

    from apps.accounts.services.magic_link import customer_email_verified

    verified = False
    user = getattr(request, 'user', None)
    if user is not None and user.is_authenticated:
        # Signed-in verified customers skip the confirm-email step.
        if customer_email_verified(user) and (
            not email or email.lower() == (user.email or '').strip().lower()
        ):
            verified = True
            email = (user.email or '').strip()
            if not name:
                name = (user.first_name or user.email or '').strip()

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
                    verified=verified,
                )
                created.append(reservation)
    except ValidationError as exc:
        detail = exc.detail
        if isinstance(detail, dict):
            return Response(detail, status=409)
        return Response({'detail': detail}, status=409)

    if not created:
        return Response({'detail': 'No valid listings to hold.'}, status=400)

    if not verified:
        _send_hold_verification_emails(created, request)

    if len(created) == 1:
        return Response(ReservationPublicSerializer(created[0]).data, status=201)
    return Response(
        {
            'holds': ReservationPublicSerializer(created, many=True).data,
            'count': len(created),
        },
        status=201,
    )


def _client_ip(request) -> str | None:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
    return forwarded or request.META.get('REMOTE_ADDR') or None


def _public_base_url() -> str:
    from django.conf import settings as dj_settings
    return (
        getattr(dj_settings, 'ONLINE_SALES_PUBLIC_BASE_URL', None) or 'https://ecothrift.us'
    ).rstrip('/')


def _issue_and_email_confirmation(reservation, *, force: bool = False) -> tuple:
    """Issue a HoldConfirmation and email code + link. Returns (row, code, token)."""
    from apps.webstore.emails import send_hold_verification
    from apps.webstore.services.hold_confirmations import issue_confirmation

    row, plain_code, plain_token = issue_confirmation(reservation, force=force)
    confirm_link = f'{_public_base_url()}/api/webstore/holds/confirm/?t={plain_token}'
    try:
        send_hold_verification(
            reservation,
            confirm_link=confirm_link,
            code=plain_code,
        )
    except Exception:
        pass
    return row, plain_code, plain_token


def _send_hold_verification_emails(reservations, request) -> None:
    """Send the confirm-email for each pending hold.

    The code and link token are never returned to the caller. Confirming a hold
    must go through the emailed code/link so local testing exercises the real
    path; when mail is not configured the console backend prints both.
    """
    for reservation in reservations:
        if reservation.status != 'pending_verification':
            continue
        try:
            _issue_and_email_confirmation(reservation)
        except Exception:
            pass


def _pending_hold_or_response(token: str):
    """Return (reservation, None) or (None, Response) for pending-verification holds."""
    from apps.webstore.services.feature import online_sales_enabled

    if not online_sales_enabled():
        return None, _public_surface_disabled_response()
    try:
        reservation = Reservation.objects.select_related('listing', 'conversation').get(
            status_token=token,
        )
    except Reservation.DoesNotExist:
        return None, Response({'detail': 'Hold not found.'}, status=404)
    return reservation, None


@api_view(['POST'])
@perm_classes([AllowAny])
@throttle_classes([OnlineHoldThrottle])
def create_hold_confirmation(request, token):
    """Create a confirmation record + email. Rate-limited to one per 60s per hold."""
    from apps.webstore.services.hold_confirmations import (
        ConfirmationCooldown,
        ConfirmationHoldEnded,
        ConfirmationNotPending,
        RESEND_COOLDOWN_SECONDS,
        attempts_remaining,
        issue_confirmation,
    )
    from apps.webstore.emails import send_hold_verification

    reservation, err = _pending_hold_or_response(token)
    if err is not None:
        return err
    if reservation.status != 'pending_verification':
        return Response(
            {'detail': 'This hold does not need email confirmation.', 'status': reservation.status},
            status=400,
        )

    try:
        row, plain_code, plain_token = issue_confirmation(reservation)
    except ConfirmationCooldown as exc:
        resp = Response(
            {
                'detail': 'A code was just sent. Try again shortly.',
                'retry_after_seconds': exc.seconds,
            },
            status=429,
        )
        resp['Retry-After'] = str(exc.seconds)
        return resp
    except ConfirmationHoldEnded:
        return Response({'detail': 'This hold has ended.'}, status=400)
    except ConfirmationNotPending:
        return Response(
            {'detail': 'This hold does not need email confirmation.', 'status': reservation.status},
            status=400,
        )

    confirm_link = f'{_public_base_url()}/api/webstore/holds/confirm/?t={plain_token}'
    try:
        send_hold_verification(reservation, confirm_link=confirm_link, code=plain_code)
    except Exception:
        pass

    return Response(
        {
            'detail': 'If that email can receive mail, a confirmation code is on its way.',
            'code_expires_at': row.expires_at.isoformat() if row.expires_at else None,
            'resend_available_in': RESEND_COOLDOWN_SECONDS,
            'attempts_remaining': attempts_remaining(row),
        },
        status=201,
    )


@api_view(['POST'])
@perm_classes([AllowAny])
@throttle_classes([OnlineHoldThrottle])
def confirm_hold_code(request, token):
    """Confirm a pending hold with the emailed 6-digit code."""
    from apps.webstore.services.hold_confirmations import (
        ConfirmationHoldEnded,
        ConfirmationLocked,
        ConfirmationMismatch,
        ConfirmationNoActive,
        ConfirmationNotPending,
        confirm_with_code,
    )

    reservation, err = _pending_hold_or_response(token)
    if err is not None:
        return err

    code = (request.data or {}).get('code') or ''
    try:
        updated = confirm_with_code(reservation, code)
    except ConfirmationLocked:
        return Response(
            {
                'detail': 'Too many attempts. Request a fresh code.',
                'attempts_remaining': 0,
                'locked': True,
            },
            status=429,
        )
    except ConfirmationMismatch as exc:
        return Response(
            {
                'detail': 'That code does not match.',
                'attempts_remaining': exc.attempts_remaining,
            },
            status=400,
        )
    except ConfirmationNoActive:
        return Response(
            {'detail': 'No active confirmation. Request a fresh code.', 'attempts_remaining': 0},
            status=400,
        )
    except ConfirmationHoldEnded:
        return Response({'detail': 'This hold has ended.'}, status=400)
    except ConfirmationNotPending:
        return Response(
            {'detail': 'This hold does not need email confirmation.', 'status': reservation.status},
            status=400,
        )

    updated = (
        Reservation.objects
        .select_related('listing', 'listing__category', 'conversation')
        .prefetch_related('conversation__messages', 'events')
        .get(pk=updated.pk)
    )
    payload = ReservationPublicSerializer(updated).data
    payload['held_until'] = updated.expires_at.isoformat() if updated.expires_at else None
    return Response(payload)


@api_view(['GET'])
@perm_classes([AllowAny])
def confirm_hold_link(request):
    """Prefetch-safe email link. Idempotent - scanners may hit this before the customer."""
    from apps.webstore.services.hold_confirmations import confirm_with_token

    raw = (request.query_params.get('t') or '').strip()
    result = confirm_with_token(raw)
    base = _public_base_url()

    if result.kind in ('success', 'already_confirmed') and result.reservation is not None:
        return HttpResponseRedirect(
            f'{base}/hold/{result.reservation.status_token}?confirmed=1',
        )
    if result.kind == 'expired' and result.reservation is not None:
        return HttpResponseRedirect(
            f'{base}/hold/{result.reservation.status_token}?link=expired',
        )
    return HttpResponseRedirect(f'{base}/hold-link-expired')


@api_view(['GET'])
@perm_classes([AllowAny])
def hold_confirmation_status(request, token):
    """Lightweight poll payload for cross-device confirmation detection."""
    from apps.webstore.services.hold_confirmations import confirmation_status_payload
    from apps.webstore.services.feature import online_sales_enabled

    if not online_sales_enabled():
        return _public_surface_disabled_response()
    try:
        reservation = Reservation.objects.only('status', 'expires_at', 'status_token').get(
            status_token=token,
        )
    except Reservation.DoesNotExist:
        return Response({'detail': 'Hold not found.'}, status=404)
    return Response(confirmation_status_payload(reservation))


# resend_hold_verification URL maps to create_hold_confirmation (same behavior).


@api_view(['POST'])
@perm_classes([AllowAny])
@throttle_classes([OnlineHoldThrottle])
def change_hold_email(request, token):
    """Correct a typo'd email on a pending hold and resend the confirm code in place."""
    from django.core.validators import validate_email
    from django.core.exceptions import ValidationError as DjangoValidationError

    from apps.webstore.services.feature import online_sales_enabled
    from apps.webstore.services.hold_confirmations import (
        ConfirmationCooldown,
        ConfirmationHoldEnded,
        ConfirmationNotPending,
    )
    from apps.webstore.services.reservations import record_event

    if not online_sales_enabled():
        return _public_surface_disabled_response()

    try:
        reservation = Reservation.objects.select_related('listing', 'conversation').get(
            status_token=token,
        )
    except Reservation.DoesNotExist:
        return Response({'detail': 'Hold not found.'}, status=404)

    if reservation.status != 'pending_verification':
        return Response(
            {'detail': 'This hold does not need email confirmation.', 'status': reservation.status},
            status=400,
        )

    new_email = ((request.data or {}).get('email') or '').strip()
    if not new_email:
        return Response({'detail': 'Email is required.'}, status=400)
    try:
        validate_email(new_email)
    except DjangoValidationError:
        return Response({'detail': 'Enter a valid email address.'}, status=400)

    old_email = reservation.email
    email_changed = new_email.lower() != old_email.lower()
    if email_changed:
        reservation.email = new_email
        reservation.save(update_fields=['email', 'updated_at'])
        try:
            conv = reservation.conversation
        except Conversation.DoesNotExist:
            conv = None
        if conv is not None and (conv.guest_email or '').lower() == old_email.lower():
            conv.guest_email = new_email
            conv.save(update_fields=['guest_email', 'updated_at'])
        record_event(
            reservation,
            'note',
            from_status=reservation.status,
            to_status=reservation.status,
            note=f'Customer corrected email from {old_email} to {new_email}',
        )

    try:
        # Force when the address changed so the new inbox gets a code immediately.
        _issue_and_email_confirmation(reservation, force=email_changed)
    except ConfirmationCooldown as exc:
        resp = Response(
            {
                'detail': 'A code was just sent. Try again shortly.',
                'retry_after_seconds': exc.seconds,
            },
            status=429,
        )
        resp['Retry-After'] = str(exc.seconds)
        return resp
    except (ConfirmationHoldEnded, ConfirmationNotPending):
        pass
    except Exception:
        pass

    reservation = (
        Reservation.objects
        .select_related('listing', 'conversation')
        .prefetch_related('conversation__messages', 'events')
        .get(pk=reservation.pk)
    )
    return Response(ReservationPublicSerializer(reservation).data)


@api_view(['GET'])
@perm_classes([AllowAny])
def hold_status(request, token):
    try:
        reservation = (
            Reservation.objects
            .select_related('listing', 'listing__category', 'conversation')
            .prefetch_related('conversation__messages', 'events', 'listing__images')
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

    from apps.accounts.models import MagicLinkToken
    from apps.accounts.services.magic_link import customer_email_verified, issue_magic_link
    from apps.webstore.emails import send_inquiry_verification

    data = request.data or {}
    name = data.get('name') or data.get('customer_name') or ''
    email = data.get('email') or ''
    user = getattr(request, 'user', None)
    verified = False
    if user is not None and user.is_authenticated and customer_email_verified(user):
        if not email or email.strip().lower() == (user.email or '').strip().lower():
            verified = True
            email = (user.email or '').strip()
            if not (name or '').strip():
                name = user.first_name or user.email or ''

    try:
        conv = open_inquiry(
            listing=listing,
            name=name,
            email=email,
            phone=data.get('phone') or '',
            body=data.get('body') or data.get('message') or '',
            verified=verified,
        )
    except ValidationError as exc:
        return Response(exc.detail, status=400)

    if not verified and conv.state == 'pending_verification':
        base = getattr(dj_settings, 'ONLINE_SALES_PUBLIC_BASE_URL', 'https://ecothrift.us').rstrip('/')
        try:
            token_row = issue_magic_link(
                email=conv.guest_email,
                request_ip=_client_ip(request),
                purpose=MagicLinkToken.PURPOSE_VERIFY_THREAD,
                thread_token=conv.public_token,
            )
            send_inquiry_verification(
                conv,
                magic_link=f'{base}/verify?token={token_row.token}',
            )
        except Exception:
            pass

    mark_customer_read(conv)
    payload = {
        'public_token': conv.public_token,
        'state': conv.state,
        'listing_title': listing.title,
        'customer_unread': 0,
        'messages': MessagePublicSerializer(conv.messages.all(), many=True).data,
        'needs_verification': conv.state == 'pending_verification',
    }
    return Response(payload, status=201)


def _customer_conversation_qs(user, *, include_deleted=False):
    """Conversations claimed to this customer or matching their email."""
    email = (user.email or '').strip()
    qs = Conversation.objects.filter(
        Q(customer=user) | Q(guest_email__iexact=email),
    )
    if not include_deleted:
        qs = qs.filter(customer_deleted_at__isnull=True)
    return qs


def _last_message_preview(messages, *, limit=120):
    """Newest prefetched message → short preview for inbox list rows."""
    if not messages:
        return None, None
    last = messages[-1]
    body = (last.body or '').strip().replace('\n', ' ')
    if len(body) > limit:
        body = body[: limit - 1].rstrip() + '…'
    return body or None, last.author_kind


def _customer_owned_hold(user, token: str) -> Reservation | None:
    email = (user.email or '').strip()
    if not email or not token:
        return None
    return (
        Reservation.objects.filter(email__iexact=email, status_token=token)
        .select_related('listing', 'listing__category', 'conversation')
        .prefetch_related('events', 'listing__images')
        .first()
    )


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
        .select_related('listing', 'listing__category', 'conversation')
        .prefetch_related('events', 'listing__images')
        .order_by('-created_at')[:100]
    )
    return Response(
        ReservationPublicSerializer(
            qs,
            many=True,
            context={'include_thread_messages': False},
        ).data,
    )


@api_view(['POST'])
@perm_classes([IsAuthenticated])
def my_hold_archive(request, token):
    """Customer: hide a finished hold from History (restore from Account)."""
    from apps.accounts.permissions import IsCustomer

    if not IsCustomer().has_permission(request, None):
        return Response({'detail': 'Customer accounts only.'}, status=403)
    hold = _customer_owned_hold(request.user, token)
    if hold is None:
        return Response({'detail': 'Hold not found.'}, status=404)
    if hold.status not in Reservation.TERMINAL_STATUSES:
        return Response(
            {'detail': 'Only finished holds can be archived.'},
            status=400,
        )
    if hold.customer_archived_at is None:
        hold.customer_archived_at = timezone.now()
        hold.save(update_fields=['customer_archived_at', 'updated_at'])
    return Response(
        ReservationPublicSerializer(
            hold,
            context={'include_thread_messages': False},
        ).data,
    )


@api_view(['POST'])
@perm_classes([IsAuthenticated])
def my_hold_unarchive(request, token):
    """Customer: put an archived hold back in History."""
    from apps.accounts.permissions import IsCustomer

    if not IsCustomer().has_permission(request, None):
        return Response({'detail': 'Customer accounts only.'}, status=403)
    hold = _customer_owned_hold(request.user, token)
    if hold is None:
        return Response({'detail': 'Hold not found.'}, status=404)
    if hold.customer_archived_at is not None:
        hold.customer_archived_at = None
        hold.save(update_fields=['customer_archived_at', 'updated_at'])
    return Response(
        ReservationPublicSerializer(
            hold,
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
    qs = (
        _customer_conversation_qs(request.user)
        .select_related('listing', 'reservation')
        .prefetch_related('messages')
        .order_by('-last_message_at', '-created_at')[:100]
    )
    # List shape - preview only; open detail for full history.
    rows = []
    for c in qs:
        messages = list(c.messages.all())
        preview, author = _last_message_preview(messages)
        rows.append({
            'public_token': c.public_token,
            'state': c.state,
            'listing_title': c.listing.title if c.listing_id else None,
            'listing_slug': c.listing.slug if c.listing_id else None,
            'reservation_status_token': (
                c.reservation.status_token if c.reservation_id else None
            ),
            'customer_unread': c.customer_unread,
            'last_message_at': c.last_message_at,
            'last_message_preview': preview,
            'last_message_author': author,
        })
    return Response(rows)


@api_view(['GET'])
@perm_classes([IsAuthenticated])
def my_conversation_detail(request, token):
    """Customer: full thread for an owned conversation (messages included)."""
    from apps.accounts.permissions import IsCustomer

    if not IsCustomer().has_permission(request, None):
        return Response({'detail': 'Customer accounts only.'}, status=403)
    try:
        conv = (
            _customer_conversation_qs(request.user)
            .select_related('listing', 'reservation')
            .prefetch_related('messages')
            .get(public_token=token)
        )
    except Conversation.DoesNotExist:
        return Response({'detail': 'Thread not found.'}, status=404)
    return Response({
        'public_token': conv.public_token,
        'state': conv.state,
        'listing_title': conv.listing.title if conv.listing_id else None,
        'listing_slug': conv.listing.slug if conv.listing_id else None,
        'reservation_status_token': (
            conv.reservation.status_token if conv.reservation_id else None
        ),
        'customer_unread': conv.customer_unread,
        'last_message_at': conv.last_message_at,
        'messages': MessagePublicSerializer(conv.messages.all(), many=True).data,
    })


@api_view(['POST'])
@perm_classes([IsAuthenticated])
def my_conversation_mark_unread(request, token):
    """Customer: put a thread back in the Unread filter."""
    from apps.accounts.permissions import IsCustomer
    from apps.webstore.services.conversations import mark_customer_unread

    if not IsCustomer().has_permission(request, None):
        return Response({'detail': 'Customer accounts only.'}, status=403)
    try:
        conv = _customer_conversation_qs(request.user).get(public_token=token)
    except Conversation.DoesNotExist:
        return Response({'detail': 'Thread not found.'}, status=404)
    mark_customer_unread(conv)
    return Response({'public_token': token, 'customer_unread': 1})


@api_view(['POST'])
@perm_classes([IsAuthenticated])
def my_conversation_delete(request, token):
    """Customer: soft-delete a thread from Messages (staff/DB keep the row)."""
    from apps.accounts.permissions import IsCustomer
    from apps.webstore.services.conversations import soft_delete_for_customer

    if not IsCustomer().has_permission(request, None):
        return Response({'detail': 'Customer accounts only.'}, status=403)
    try:
        conv = _customer_conversation_qs(request.user).get(public_token=token)
    except Conversation.DoesNotExist:
        return Response({'detail': 'Thread not found.'}, status=404)
    soft_delete_for_customer(conv)
    return Response({'detail': 'Deleted.', 'public_token': token})


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


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsManagerOrAdmin])
def work_queue_remove_item(request, item_id: int):
    """Pull an inventory item out of the Online Sales to-list queue.

    Sets location back to on_shelf. Does not delete draft listings - those stay
    under Drafts until staff delete them separately.
    """
    from apps.inventory.models import Item

    try:
        item = Item.objects.select_related('product').get(pk=item_id)
    except Item.DoesNotExist:
        return Response({'detail': 'Item not found.'}, status=404)
    if item.location != 'online_sales':
        return Response(
            {'detail': 'Item is not on the Online Sales queue.'},
            status=400,
        )
    item.location = 'on_shelf'
    item.save(update_fields=['location', 'updated_at'])
    return Response({
        'id': item.id,
        'sku': item.sku,
        'location': item.location,
        'detail': 'Removed from Online Sales queue.',
    })


@api_view(['GET'])
@perm_classes([IsAuthenticated, IsManagerOrAdmin])
def sales_log(request):
    from datetime import timedelta

    from django.db.models import Prefetch

    from apps.webstore.models import ReservationEvent

    from django.db.models import Count

    qs = (
        Reservation.objects.filter(status='completed')
        .select_related('listing', 'item', 'pos_cart', 'conversation')
        .prefetch_related(
            Prefetch(
                'events',
                queryset=(
                    ReservationEvent.objects
                    .select_related('actor')
                    .order_by('created_at', 'id')
                ),
            ),
        )
        .annotate(_message_count=Count('conversation__messages'))
        .order_by('-completed_at')
    )
    days_raw = (request.query_params.get('days') or '').strip()
    if days_raw != '':
        try:
            days = int(days_raw)
        except (TypeError, ValueError):
            days = None
        else:
            if days == 0:
                # Calendar today (local).
                qs = qs.filter(completed_at__date=timezone.localdate())
            elif days > 0:
                cutoff = timezone.now() - timedelta(days=days)
                qs = qs.filter(completed_at__gte=cutoff)

    search = (request.query_params.get('search') or '').strip()
    if search:
        qs = qs.filter(
            Q(listing__title__icontains=search)
            | Q(customer_name__icontains=search)
            | Q(email__icontains=search)
            | Q(item__sku__icontains=search)
        )

    qs = qs[:500]
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
