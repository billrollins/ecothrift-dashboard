"""Serializers for the curated web catalog.

Two audiences:
  * Staff (dashboard CRUD) — `WebListingSerializer` (read/write, all fields).
  * Public storefront — `WebListing{List,Detail}PublicSerializer` (no internal fields).

Image URLs always point at the host-agnostic proxy endpoint
(`/api/webstore/images/<id>/`) so S3 can stay private (the proxy 302-redirects to a
short-lived presigned URL, or streams the bytes in local dev).
"""
from rest_framework import serializers

from .models import Order, OrderLine, WebListing, WebListingImage


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


class WebListingSerializer(serializers.ModelSerializer):
    """Staff read/write serializer."""

    images = WebListingImageSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    item_sku = serializers.CharField(source='item.sku', read_only=True, default=None)
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    on_sale = serializers.BooleanField(read_only=True)
    is_available = serializers.BooleanField(read_only=True)
    image_count = serializers.IntegerField(source='images.count', read_only=True)

    class Meta:
        model = WebListing
        fields = [
            'id', 'title', 'slug', 'category', 'category_name', 'item', 'item_sku',
            'sku', 'description', 'condition', 'condition_display',
            'price', 'compare_at_price', 'stock',
            'status', 'status_display', 'featured',
            'images', 'image_count', 'on_sale', 'is_available',
            'created_by', 'published_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'slug', 'category_name', 'item_sku', 'condition_display', 'status_display',
            'images', 'image_count', 'on_sale', 'is_available',
            'created_by', 'published_at', 'created_at', 'updated_at',
        ]


class WebListingListPublicSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the public catalog grid."""

    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    category_slug = serializers.CharField(source='category.slug', read_only=True, default=None)
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)
    on_sale = serializers.BooleanField(read_only=True)
    available = serializers.BooleanField(source='is_available', read_only=True)
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
    """Full public detail (adds description, stock, and the full image list)."""

    images = serializers.SerializerMethodField()

    class Meta(WebListingListPublicSerializer.Meta):
        fields = WebListingListPublicSerializer.Meta.fields + ['description', 'sku', 'images']

    def get_images(self, obj):
        return [
            {'id': im.id, 'url': _image_url(im.id), 'alt': im.alt or obj.title}
            for im in obj.images.all()
        ]


class OrderLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderLine
        fields = ['id', 'listing', 'title', 'slug', 'sku', 'unit_price', 'quantity', 'line_total']
        read_only_fields = fields


class OrderPublicSerializer(serializers.ModelSerializer):
    """Customer-facing order view (checkout response + status-by-number page)."""

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
    """Staff order view. Status changes go through the `set-status` action (handles
    stock restock on cancel); only payment fields + staff note are writable here."""

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
