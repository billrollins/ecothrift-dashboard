from django.contrib import admin

from .models import (
    Conversation,
    Message,
    Order,
    OrderLine,
    Reservation,
    WebListing,
    WebListingImage,
)


class WebListingImageInline(admin.TabularInline):
    model = WebListingImage
    extra = 0
    fields = ['s3_file', 'alt', 'position']
    raw_id_fields = ['s3_file']


@admin.register(WebListing)
class WebListingAdmin(admin.ModelAdmin):
    list_display = [
        'title', 'status', 'category', 'price', 'compare_at_price',
        'on_hand', 'reserved', 'stock', 'featured', 'updated_at',
    ]
    list_filter = ['status', 'featured', 'condition', 'category']
    search_fields = ['title', 'sku', 'description']
    raw_id_fields = ['item', 'category', 'created_by']
    readonly_fields = ['slug', 'created_at', 'updated_at', 'published_at', 'stock']
    inlines = [WebListingImageInline]


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'listing', 'customer_name', 'email', 'status', 'quantity',
        'expires_at', 'created_at',
    ]
    list_filter = ['status']
    search_fields = ['customer_name', 'email', 'phone', 'status_token', 'listing__title']
    raw_id_fields = ['listing', 'item', 'staged_by', 'confirmed_by', 'completed_by', 'pos_cart']
    readonly_fields = [
        'status_token', 'idempotency_key', 'unit_price_snapshot', 'cost_snapshot',
        'created_at', 'updated_at', 'staged_at', 'confirmed_at', 'completed_at',
    ]


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    fields = ['author_kind', 'author_user', 'body', 'created_at']
    readonly_fields = ['created_at']
    raw_id_fields = ['author_user']


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'state', 'guest_name', 'guest_email', 'listing', 'reservation',
        'staff_unread', 'customer_unread', 'last_message_at',
    ]
    list_filter = ['state']
    search_fields = ['guest_name', 'guest_email', 'public_token', 'listing__title']
    raw_id_fields = ['listing', 'reservation', 'customer', 'staff_owner']
    readonly_fields = ['public_token', 'created_at', 'updated_at', 'last_message_at']
    inlines = [MessageInline]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['id', 'conversation', 'author_kind', 'created_at']
    list_filter = ['author_kind']
    search_fields = ['body', 'conversation__public_token']
    raw_id_fields = ['conversation', 'author_user']
    readonly_fields = ['created_at']


class OrderLineInline(admin.TabularInline):
    model = OrderLine
    extra = 0
    fields = ['title', 'sku', 'unit_price', 'quantity', 'line_total']
    readonly_fields = ['title', 'sku', 'unit_price', 'quantity', 'line_total']
    raw_id_fields = ['listing']
    can_delete = False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = [
        'order_number', 'customer_name', 'status', 'payment_status',
        'fulfillment', 'total', 'created_at',
    ]
    list_filter = ['status', 'payment_status', 'fulfillment']
    search_fields = ['order_number', 'customer_name', 'email']
    readonly_fields = [
        'order_number', 'subtotal', 'shipping', 'tax', 'total',
        'payment_provider', 'created_at', 'updated_at',
    ]
    inlines = [OrderLineInline]
