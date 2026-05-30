from django.contrib import admin

from .models import Order, OrderLine, WebListing, WebListingImage


class WebListingImageInline(admin.TabularInline):
    model = WebListingImage
    extra = 0
    fields = ['s3_file', 'alt', 'position']
    raw_id_fields = ['s3_file']


@admin.register(WebListing)
class WebListingAdmin(admin.ModelAdmin):
    list_display = [
        'title', 'status', 'category', 'price', 'compare_at_price',
        'stock', 'featured', 'updated_at',
    ]
    list_filter = ['status', 'featured', 'condition', 'category']
    search_fields = ['title', 'sku', 'description']
    raw_id_fields = ['item', 'category', 'created_by']
    readonly_fields = ['slug', 'created_at', 'updated_at', 'published_at']
    inlines = [WebListingImageInline]


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
