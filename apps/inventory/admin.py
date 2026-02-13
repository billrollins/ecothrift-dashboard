from django.contrib import admin
from .models import (
    Vendor, PurchaseOrder, CSVTemplate, ManifestRow,
    Product, Item, ProcessingBatch, ItemScanHistory,
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
    list_display = ('purchase_order', 'row_number', 'description', 'quantity')


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('title', 'brand', 'category', 'default_price')
    search_fields = ('title', 'brand')


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ('sku', 'title', 'price', 'status', 'source')
    list_filter = ('status', 'source')
    search_fields = ('sku', 'title')


@admin.register(ProcessingBatch)
class ProcessingBatchAdmin(admin.ModelAdmin):
    list_display = ('purchase_order', 'status', 'items_created', 'started_at')


@admin.register(ItemScanHistory)
class ItemScanHistoryAdmin(admin.ModelAdmin):
    list_display = ('item', 'scanned_at', 'source', 'ip_address')
