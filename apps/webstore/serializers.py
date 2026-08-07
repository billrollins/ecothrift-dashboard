"""Serializers for the curated web catalog and reservations."""
from rest_framework import serializers

from .models import (
    ChannelPublication,
    Conversation,
    Message,
    Order,
    OrderLine,
    Reservation,
    ReservationEvent,
    WebListing,
    WebListingImage,
)


def _image_url(image_id) -> str:
    return f'/api/webstore/images/{image_id}/'


class WebListingImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = WebListingImage
        fields = ['id', 'alt', 'position', 'url', 'created_at']
        read_only_fields = ['id', 'url', 'created_at']

    def get_url(self, obj) -> str:
        return _image_url(obj.id)


class ChannelPublicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChannelPublication
        fields = [
            'id', 'channel', 'status', 'title', 'body', 'external_url',
            'posted_at', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class WebListingSerializer(serializers.ModelSerializer):
    """Staff read/write serializer."""

    images = WebListingImageSerializer(many=True, read_only=True)
    channel_publications = ChannelPublicationSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    item_sku = serializers.CharField(source='item.sku', read_only=True, default=None)
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    return_policy_display = serializers.CharField(
        source='get_return_policy_display', read_only=True,
    )
    on_sale = serializers.BooleanField(read_only=True)
    is_available = serializers.BooleanField(read_only=True)
    available = serializers.IntegerField(read_only=True)
    image_count = serializers.IntegerField(source='images.count', read_only=True)
    readiness_errors = serializers.SerializerMethodField()

    class Meta:
        model = WebListing
        fields = [
            'id', 'title', 'slug', 'category', 'category_name', 'item', 'item_sku',
            'sku', 'description', 'condition', 'condition_display',
            'price', 'compare_at_price',
            'on_hand', 'reserved', 'available', 'stock',
            'status', 'status_display', 'featured',
            'return_policy', 'return_policy_display',
            'fb_title', 'fb_body', 'fb_posted_url', 'fb_posted_at',
            'images', 'image_count', 'channel_publications',
            'on_sale', 'is_available', 'readiness_errors',
            'created_by', 'published_at', 'archived_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'slug', 'category_name', 'item_sku', 'condition_display', 'status_display',
            'return_policy_display', 'reserved', 'available', 'stock',
            'images', 'image_count', 'channel_publications',
            'on_sale', 'is_available', 'readiness_errors',
            'created_by', 'published_at', 'archived_at', 'created_at', 'updated_at',
            'fb_posted_at',
        ]

    def get_readiness_errors(self, obj):
        return obj.publish_readiness_errors()

    def validate_status(self, value):
        if value == 'published':
            raise serializers.ValidationError(
                'Use POST …/publish/ to publish a listing; status cannot be set to published here.',
            )
        if value == 'sold':
            raise serializers.ValidationError(
                'Use POST …/mark-sold/ to mark a listing sold; status cannot be set to sold here.',
            )
        return value


class WebListingListPublicSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    category_slug = serializers.CharField(source='category.slug', read_only=True, default=None)
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)
    on_sale = serializers.BooleanField(read_only=True)
    available = serializers.IntegerField(read_only=True)
    stock = serializers.IntegerField(source='available', read_only=True)
    image = serializers.SerializerMethodField()

    class Meta:
        model = WebListing
        fields = [
            'id', 'title', 'slug', 'category_name', 'category_slug',
            'condition', 'condition_display', 'price', 'compare_at_price',
            'on_sale', 'available', 'featured', 'stock', 'image',
            'created_at', 'published_at',
        ]

    def get_image(self, obj):
        first = list(obj.images.all()[:1])
        if not first:
            return None
        im = first[0]
        return {'url': _image_url(im.id), 'alt': im.alt or obj.title}


class WebListingDetailPublicSerializer(WebListingListPublicSerializer):
    images = serializers.SerializerMethodField()
    return_policy = serializers.CharField(read_only=True)
    hold_policy = serializers.SerializerMethodField()

    class Meta(WebListingListPublicSerializer.Meta):
        fields = WebListingListPublicSerializer.Meta.fields + [
            'description', 'sku', 'images', 'return_policy', 'hold_policy',
        ]

    def get_images(self, obj):
        return [
            {'id': im.id, 'url': _image_url(im.id), 'alt': im.alt or obj.title}
            for im in obj.images.all()
        ]

    def get_hold_policy(self, obj):
        return (
            'Request a hold online. Pay and pick up in store - no shipping, '
            'delivery, or online payment. Holds confirmed by staff last until '
            'store close the next business day. Final sale unless noted.'
        )


# Staff-facing labels for the hold timeline (list Status hover).
# Keep in sync with frontend/src/pages/online-sales/presentation.tsx HOLD_EVENT_LABELS.
STAFF_TIMELINE_LABELS = {
    'requested': 'Hold requested',
    'verified': 'Email verified',
    'confirmed': 'Pulled for hold',
    'staged': 'Marked ready',
    'extended': 'Extended',
    'completed': 'Completed',
    'declined': 'Declined',
    'expired': 'No-show / expired',
    'cancelled': 'Cancelled',
    'reopened': 'Reopened',
    'note': 'Staff note',
}


def _actor_display(user) -> str | None:
    if user is None:
        return None
    name = (getattr(user, 'full_name', None) or '').strip()
    if name:
        return name
    return getattr(user, 'email', None) or str(user)


def _timeline_actor(event) -> str:
    name = _actor_display(event.actor)
    if name:
        return name
    if event.kind in ('requested', 'verified'):
        return 'Customer'
    return 'System'


def _reservation_timeline(reservation) -> list[dict]:
    """Compact action history for list-row Status hover tooltips."""
    events = getattr(reservation, '_prefetched_objects_cache', {}).get('events')
    if events is None:
        events = reservation.events.select_related('actor').all()
    rows = []
    for ev in events:
        rows.append({
            'kind': ev.kind,
            'label': STAFF_TIMELINE_LABELS.get(ev.kind, ev.get_kind_display()),
            'actor_name': _timeline_actor(ev),
            'created_at': ev.created_at,
            'note': (ev.note or '').strip(),
        })
    return rows


class ReservationStaffSerializer(serializers.ModelSerializer):
    listing_title = serializers.CharField(source='listing.title', read_only=True)
    listing_slug = serializers.CharField(source='listing.slug', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    contribution = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    # Unread count on the hold's own thread, so the holds queue can show that a
    # customer wrote in without staff opening the Messages tab.
    unread = serializers.SerializerMethodField()
    # Deep-link into Customers → Messages when this hold has a thread.
    conversation_id = serializers.SerializerMethodField()
    has_messages = serializers.SerializerMethodField()
    # Full action history for the Status column hover - who did what, when.
    timeline = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = [
            'id', 'status_token', 'pickup_code', 'listing', 'listing_title', 'listing_slug',
            'item', 'item_sku', 'customer_name', 'email', 'phone', 'quantity',
            'customer_note', 'staff_note', 'release_reason',
            'status', 'status_display',
            'expires_at', 'staged_at', 'confirmed_at', 'completed_at',
            'unit_price_snapshot', 'cost_snapshot', 'fee_amount', 'direct_expense',
            'line_total', 'contribution', 'pos_cart', 'unread', 'conversation_id',
            'has_messages', 'timeline',
            'archived_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'status_token', 'pickup_code', 'listing_title', 'listing_slug', 'item_sku',
            'release_reason', 'status_display',
            'expires_at', 'staged_at', 'confirmed_at', 'completed_at',
            'unit_price_snapshot', 'line_total', 'contribution', 'pos_cart', 'unread',
            'conversation_id', 'has_messages',
            'timeline', 'archived_at', 'created_at', 'updated_at',
        ]

    def get_unread(self, obj) -> int:
        conversation = getattr(obj, 'conversation', None)
        return conversation.staff_unread if conversation is not None else 0

    def get_conversation_id(self, obj) -> int | None:
        conversation = getattr(obj, 'conversation', None)
        return conversation.id if conversation is not None else None

    def get_has_messages(self, obj) -> bool:
        count = getattr(obj, '_message_count', None)
        if count is not None:
            return count > 0
        conversation = getattr(obj, 'conversation', None)
        if conversation is None:
            return False
        return conversation.messages.exists()

    def get_timeline(self, obj) -> list:
        return _reservation_timeline(obj)


class ReservationEventSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = ReservationEvent
        fields = [
            'id', 'kind', 'kind_display', 'from_status', 'to_status',
            'actor_name', 'note', 'created_at',
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        return _actor_display(obj.actor)


class ReservationDetailSerializer(ReservationStaffSerializer):
    confirmed_by_name = serializers.SerializerMethodField()
    staged_by_name = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()

    class Meta(ReservationStaffSerializer.Meta):
        fields = ReservationStaffSerializer.Meta.fields + [
            'confirmed_by_name', 'staged_by_name', 'completed_by_name',
        ]
        read_only_fields = ReservationStaffSerializer.Meta.read_only_fields + [
            'confirmed_by_name', 'staged_by_name', 'completed_by_name',
        ]

    def get_confirmed_by_name(self, obj):
        return _actor_display(obj.confirmed_by)

    def get_staged_by_name(self, obj):
        return _actor_display(obj.staged_by)

    def get_completed_by_name(self, obj):
        return _actor_display(obj.completed_by)


class MessagePublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'author_kind', 'body', 'created_at']
        read_only_fields = fields


class ReservationPublicSerializer(serializers.ModelSerializer):
    """Minimal public status payload - no address, no unrelated PII dumps."""

    listing_title = serializers.CharField(source='listing.title', read_only=True)
    listing_slug = serializers.CharField(source='listing.slug', read_only=True, default=None)
    listing_image = serializers.SerializerMethodField()
    listing_category_slug = serializers.SerializerMethodField()
    listing_category_name = serializers.SerializerMethodField()
    unit_price = serializers.DecimalField(
        source='unit_price_snapshot', max_digits=10, decimal_places=2, read_only=True,
    )
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    policy = serializers.SerializerMethodField()
    thread = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    stage = serializers.SerializerMethodField()
    stage_total = serializers.SerializerMethodField()
    stages = serializers.SerializerMethodField()
    customer_status = serializers.SerializerMethodField()
    headline = serializers.SerializerMethodField()
    next_step = serializers.SerializerMethodField()
    can_pickup = serializers.SerializerMethodField()
    tone = serializers.SerializerMethodField()
    timeline = serializers.SerializerMethodField()
    pickup_code = serializers.SerializerMethodField()
    expires_label = serializers.SerializerMethodField()
    expires_secondary = serializers.SerializerMethodField()
    expires_kind = serializers.SerializerMethodField()
    confirmed_until_preview = serializers.SerializerMethodField()
    confirmed_until_label = serializers.SerializerMethodField()
    provisional_label = serializers.SerializerMethodField()
    do_nothing_label = serializers.SerializerMethodField()
    if_confirmed_label = serializers.SerializerMethodField()
    code_expires_at = serializers.SerializerMethodField()
    attempts_remaining = serializers.SerializerMethodField()
    resend_available_in = serializers.SerializerMethodField()
    has_active_confirmation = serializers.SerializerMethodField()
    staff_note_public = serializers.SerializerMethodField()
    release_reason = serializers.CharField(read_only=True)

    class Meta:
        model = Reservation
        fields = [
            'status_token', 'listing_title', 'listing_slug', 'listing_image',
            'listing_category_slug', 'listing_category_name',
            'quantity', 'unit_price', 'status', 'status_display',
            'email', 'customer_name', 'expires_at', 'created_at', 'policy', 'thread',
            'stage', 'stage_total', 'stages', 'customer_status', 'headline', 'next_step',
            'can_pickup', 'tone', 'timeline', 'release_reason',
            'pickup_code', 'expires_label', 'expires_secondary', 'expires_kind',
            'confirmed_until_preview', 'confirmed_until_label', 'provisional_label',
            'do_nothing_label', 'if_confirmed_label',
            'code_expires_at', 'attempts_remaining', 'resend_available_in',
            'has_active_confirmation',
            'staff_note_public',
            'customer_archived_at',
        ]
        read_only_fields = fields

    def _view(self, obj):
        cached = getattr(obj, '_customer_view_cache', None)
        if cached is None:
            from apps.webstore.services.hold_status import customer_view
            cached = customer_view(obj)
            obj._customer_view_cache = cached
        return cached

    def get_listing_image(self, obj):
        if not obj.listing_id:
            return None
        images = list(obj.listing.images.all()[:1])
        if not images:
            return None
        im = images[0]
        return {'url': _image_url(im.id), 'alt': im.alt or obj.listing.title}

    def get_listing_category_slug(self, obj):
        cat = getattr(obj.listing, 'category', None) if obj.listing_id else None
        return getattr(cat, 'slug', None) if cat else None

    def get_listing_category_name(self, obj):
        cat = getattr(obj.listing, 'category', None) if obj.listing_id else None
        return getattr(cat, 'name', None) if cat else None

    def get_email(self, obj):
        # Only expose email while confirming - needed for the pending UI copy.
        if obj.status == 'pending_verification':
            return obj.email
        return None

    def get_customer_name(self, obj):
        if obj.status == 'pending_verification':
            return obj.customer_name
        return None

    def get_policy(self, obj):
        return self._view(obj)['next_step']

    def get_stage(self, obj):
        return self._view(obj)['stage']

    def get_stage_total(self, obj):
        return self._view(obj)['stage_total']

    def get_stages(self, obj):
        return self._view(obj).get('stages') or []

    def get_customer_status(self, obj):
        return self._view(obj)['customer_status']

    def get_headline(self, obj):
        return self._view(obj)['headline']

    def get_next_step(self, obj):
        return self._view(obj)['next_step']

    def get_can_pickup(self, obj):
        return self._view(obj)['can_pickup']

    def get_tone(self, obj):
        return self._view(obj)['tone']

    def get_pickup_code(self, obj):
        # Only from stage 2 onward (never while pending verification).
        return self._view(obj).get('pickup_code')

    def get_expires_label(self, obj):
        return self._view(obj).get('expires_label') or ''

    def get_expires_secondary(self, obj):
        return self._view(obj).get('expires_secondary') or ''

    def get_expires_kind(self, obj):
        return self._view(obj).get('expires_kind') or 'day'

    def get_confirmed_until_preview(self, obj):
        return self._view(obj).get('confirmed_until_preview')

    def get_confirmed_until_label(self, obj):
        return self._view(obj).get('confirmed_until_label')

    def get_provisional_label(self, obj):
        return self._view(obj).get('provisional_label')

    def get_do_nothing_label(self, obj):
        return self._view(obj).get('do_nothing_label')

    def get_if_confirmed_label(self, obj):
        return self._view(obj).get('if_confirmed_label')

    def get_code_expires_at(self, obj):
        return self._view(obj).get('code_expires_at')

    def get_attempts_remaining(self, obj):
        return self._view(obj).get('attempts_remaining')

    def get_resend_available_in(self, obj):
        return self._view(obj).get('resend_available_in')

    def get_has_active_confirmation(self, obj):
        return self._view(obj).get('has_active_confirmation')

    def get_staff_note_public(self, obj):
        return self._view(obj).get('staff_note_public') or ''

    def get_timeline(self, obj):
        from apps.webstore.services.hold_status import public_timeline
        return public_timeline(obj)

    def get_thread(self, obj):
        # Hide the conversation until the email is proven.
        if obj.status == 'pending_verification':
            return None
        try:
            conv = obj.conversation
        except Conversation.DoesNotExist:
            return None
        payload = {
            'public_token': conv.public_token,
            'state': conv.state,
            'customer_unread': conv.customer_unread,
        }
        # List endpoints (my_holds) omit history; detail/hold-status include it.
        if self.context.get('include_thread_messages', True):
            messages = list(conv.messages.all())
            payload['messages'] = MessagePublicSerializer(messages, many=True).data
        return payload


class ConversationStaffListSerializer(serializers.ModelSerializer):
    """Inbox list - no message bodies (fetch on retrieve)."""

    listing_title = serializers.CharField(source='listing.title', read_only=True, default=None)
    reservation_id = serializers.IntegerField(read_only=True, allow_null=True)
    staff_owner_email = serializers.EmailField(source='staff_owner.email', read_only=True, default=None)

    class Meta:
        model = Conversation
        fields = [
            'id', 'public_token', 'state', 'listing', 'listing_title', 'reservation_id',
            'guest_name', 'guest_email', 'guest_phone', 'customer',
            'staff_owner', 'staff_owner_email', 'staff_unread', 'customer_unread',
            'last_message_at', 'created_at', 'updated_at', 'archived_at',
        ]
        read_only_fields = fields


class ConversationStaffSerializer(serializers.ModelSerializer):
    listing_title = serializers.CharField(source='listing.title', read_only=True, default=None)
    reservation_id = serializers.IntegerField(read_only=True, allow_null=True)
    staff_owner_email = serializers.EmailField(source='staff_owner.email', read_only=True, default=None)
    messages = MessagePublicSerializer(many=True, read_only=True)

    class Meta:
        model = Conversation
        fields = [
            'id', 'public_token', 'state', 'listing', 'listing_title', 'reservation_id',
            'guest_name', 'guest_email', 'guest_phone', 'customer',
            'staff_owner', 'staff_owner_email', 'staff_unread', 'customer_unread',
            'last_message_at', 'created_at', 'updated_at', 'archived_at', 'messages',
        ]
        read_only_fields = fields


class OrderLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderLine
        fields = ['id', 'listing', 'title', 'slug', 'sku', 'unit_price', 'quantity', 'line_total']
        read_only_fields = fields


class OrderPublicSerializer(serializers.ModelSerializer):
    lines = OrderLineSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    fulfillment_display = serializers.CharField(source='get_fulfillment_display', read_only=True)
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Order
        fields = [
            'order_number', 'status', 'status_display',
            'payment_status', 'payment_status_display',
            'fulfillment', 'fulfillment_display',
            'customer_name', 'email', 'phone',
            'ship_address1', 'ship_address2', 'ship_city', 'ship_state', 'ship_postal',
            'subtotal', 'shipping', 'tax', 'total', 'item_count',
            'customer_note', 'lines', 'created_at',
        ]
        read_only_fields = fields


class OrderStaffSerializer(serializers.ModelSerializer):
    lines = OrderLineSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    fulfillment_display = serializers.CharField(source='get_fulfillment_display', read_only=True)
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'status', 'status_display',
            'payment_provider', 'payment_status', 'payment_status_display', 'payment_reference',
            'fulfillment', 'fulfillment_display',
            'customer_name', 'email', 'phone',
            'ship_address1', 'ship_address2', 'ship_city', 'ship_state', 'ship_postal',
            'subtotal', 'shipping', 'tax', 'total', 'item_count',
            'customer_note', 'staff_note', 'lines', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'order_number', 'status', 'status_display', 'payment_provider',
            'payment_status_display', 'fulfillment', 'fulfillment_display',
            'customer_name', 'email', 'phone',
            'ship_address1', 'ship_address2', 'ship_city', 'ship_state', 'ship_postal',
            'subtotal', 'shipping', 'tax', 'total', 'item_count',
            'customer_note', 'lines', 'created_at', 'updated_at',
        ]
