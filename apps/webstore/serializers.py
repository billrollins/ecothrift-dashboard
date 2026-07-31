"""Serializers for the curated web catalog and reservations."""
from rest_framework import serializers

from .models import (
    ChannelPublication,
    Conversation,
    Message,
    Order,
    OrderLine,
    Reservation,
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
            'Request a hold online. Pay and pick up in store — no shipping, '
            'delivery, or online payment. Holds confirmed by staff last until '
            'store close the next business day. Final sale unless noted.'
        )


class ReservationStaffSerializer(serializers.ModelSerializer):
    listing_title = serializers.CharField(source='listing.title', read_only=True)
    listing_slug = serializers.CharField(source='listing.slug', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    contribution = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Reservation
        fields = [
            'id', 'status_token', 'listing', 'listing_title', 'listing_slug',
            'item', 'item_sku', 'customer_name', 'email', 'phone', 'quantity',
            'customer_note', 'staff_note', 'status', 'status_display',
            'expires_at', 'staged_at', 'confirmed_at', 'completed_at',
            'unit_price_snapshot', 'cost_snapshot', 'fee_amount', 'direct_expense',
            'line_total', 'contribution', 'pos_cart',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'status_token', 'listing_title', 'listing_slug', 'item_sku',
            'status_display', 'expires_at', 'staged_at', 'confirmed_at', 'completed_at',
            'unit_price_snapshot', 'line_total', 'contribution', 'pos_cart',
            'created_at', 'updated_at',
        ]


class MessagePublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'author_kind', 'body', 'created_at']
        read_only_fields = fields


class ReservationPublicSerializer(serializers.ModelSerializer):
    """Minimal public status payload — no address, no unrelated PII dumps."""

    listing_title = serializers.CharField(source='listing.title', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    policy = serializers.SerializerMethodField()
    thread = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = [
            'status_token', 'listing_title', 'quantity', 'status', 'status_display',
            'expires_at', 'created_at', 'policy', 'thread',
        ]
        read_only_fields = fields

    def get_policy(self, obj):
        return (
            'Pay and pick up in store. No shipping, delivery, or online payment. '
            'Confirmed holds expire at store close on the next business day.'
        )

    def get_thread(self, obj):
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
    """Inbox list — no message bodies (fetch on retrieve)."""

    listing_title = serializers.CharField(source='listing.title', read_only=True, default=None)
    reservation_id = serializers.IntegerField(read_only=True, allow_null=True)
    staff_owner_email = serializers.EmailField(source='staff_owner.email', read_only=True, default=None)

    class Meta:
        model = Conversation
        fields = [
            'id', 'public_token', 'state', 'listing', 'listing_title', 'reservation_id',
            'guest_name', 'guest_email', 'guest_phone', 'customer',
            'staff_owner', 'staff_owner_email', 'staff_unread', 'customer_unread',
            'last_message_at', 'created_at', 'updated_at',
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
            'last_message_at', 'created_at', 'updated_at', 'messages',
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
