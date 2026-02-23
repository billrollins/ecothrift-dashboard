from django.contrib import admin
from .models import (
    Vendor, Category, PurchaseOrder, CSVTemplate, ManifestRow,
    Product, VendorProductRef, BatchGroup, Item, ProcessingBatch,
    ItemHistory, ItemScanHistory,
)


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'vendor_type', 'is_active')
    search_fields = ('name', 'code')
    list_filter = ('vendor_type', 'is_active')


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ('order_number', 'vendor', 'status', 'ordered_date', 'paid_date', 'total_cost')
    list_filter = ('status',)
    search_fields = ('order_number',)


@admin.register(CSVTemplate)
class CSVTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'vendor', 'is_default')


@admin.register(ManifestRow)
class ManifestRowAdmin(admin.ModelAdmin):
    list_display = (
        'purchase_order', 'row_number', 'description', 'quantity',
        'match_status', 'matched_product',
    )


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'parent')
    search_fields = ('name', 'slug')


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('product_number', 'title', 'brand', 'category', 'default_price', 'is_active')
    search_fields = ('product_number', 'title', 'brand', 'upc')
    list_filter = ('is_active',)


@admin.register(VendorProductRef)
class VendorProductRefAdmin(admin.ModelAdmin):
    list_display = ('vendor', 'vendor_item_number', 'product', 'times_seen', 'last_seen_date')
    search_fields = ('vendor_item_number', 'vendor__code', 'product__title')
    list_filter = ('vendor',)


@admin.register(BatchGroup)
class BatchGroupAdmin(admin.ModelAdmin):
    list_display = ('batch_number', 'purchase_order', 'product', 'total_qty', 'status', 'processed_at')
    search_fields = ('batch_number', 'purchase_order__order_number', 'product__title')
    list_filter = ('status',)


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ('sku', 'title', 'price', 'status', 'processing_tier', 'batch_group', 'source')
    list_filter = ('status', 'processing_tier', 'source')
    search_fields = ('sku', 'title')


@admin.register(ProcessingBatch)
class ProcessingBatchAdmin(admin.ModelAdmin):
    list_display = ('purchase_order', 'status', 'items_created', 'started_at')


@admin.register(ItemHistory)
class ItemHistoryAdmin(admin.ModelAdmin):
    list_display = ('item', 'event_type', 'created_by', 'created_at')
    list_filter = ('event_type',)
    search_fields = ('item__sku', 'note')


@admin.register(ItemScanHistory)
class ItemScanHistoryAdmin(admin.ModelAdmin):
    list_display = ('item', 'scanned_at', 'source', 'ip_address')
