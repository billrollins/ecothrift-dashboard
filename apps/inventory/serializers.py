from rest_framework import serializers
from apps.core.serializers import S3FileSerializer
from .models import (
    Vendor, Category, PurchaseOrder, CSVTemplate, ManifestRow,
    Product, VendorProductRef, BatchGroup, Item, ProcessingBatch,
    ItemHistory, ItemScanHistory,
)


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class CategorySerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.name', read_only=True, default=None)

    class Meta:
        model = Category
        fields = '__all__'
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']


class VendorProductRefSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    vendor_code = serializers.CharField(source='vendor.code', read_only=True)
    product_title = serializers.CharField(source='product.title', read_only=True)
    product_number = serializers.CharField(source='product.product_number', read_only=True)

    class Meta:
        model = VendorProductRef
        fields = '__all__'
        read_only_fields = ['id', 'last_seen_date', 'created_at', 'updated_at']


class ManifestRowSerializer(serializers.ModelSerializer):
    matched_product_title = serializers.CharField(
        source='matched_product.title',
        read_only=True,
        default=None,
    )
    matched_product_number = serializers.CharField(
        source='matched_product.product_number',
        read_only=True,
        default=None,
    )

    class Meta:
        model = ManifestRow
        fields = '__all__'
        read_only_fields = ['id']


class PurchaseOrderSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    vendor_code = serializers.CharField(source='vendor.code', read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default=None)
    order_number = serializers.CharField(required=False, allow_blank=True)
    ordered_date = serializers.DateField(required=False)
    processing_stats = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'vendor', 'vendor_name', 'vendor_code', 'order_number',
            'status', 'ordered_date', 'paid_date', 'shipped_date',
            'expected_delivery', 'delivered_date',
            'purchase_cost', 'shipping_cost', 'fees',
            'total_cost', 'retail_value', 'condition', 'description',
            'item_count', 'notes', 'manifest', 'manifest_file', 'manifest_preview',
            'processing_stats',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'total_cost', 'manifest_preview', 'created_at', 'updated_at']

    manifest_file = S3FileSerializer(source='manifest', read_only=True)

    def get_processing_stats(self, obj):
        status_counts = {
            'intake': obj.items.filter(status='intake').count(),
            'processing': obj.items.filter(status='processing').count(),
            'on_shelf': obj.items.filter(status='on_shelf').count(),
            'sold': obj.items.filter(status='sold').count(),
            'returned': obj.items.filter(status='returned').count(),
            'scrapped': obj.items.filter(status='scrapped').count(),
            'lost': obj.items.filter(status='lost').count(),
        }
        return {
            'item_status_counts': status_counts,
            'pending_items': status_counts['intake'] + status_counts['processing'],
            'batch_groups_pending': obj.batch_groups.exclude(status='complete').count(),
            'batch_groups_total': obj.batch_groups.count(),
        }


class PurchaseOrderDetailSerializer(PurchaseOrderSerializer):
    manifest_rows = ManifestRowSerializer(many=True, read_only=True)

    class Meta(PurchaseOrderSerializer.Meta):
        fields = PurchaseOrderSerializer.Meta.fields + ['manifest_rows']


class CSVTemplateSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)

    class Meta:
        model = CSVTemplate
        fields = [
            'id', 'vendor', 'vendor_name', 'name',
            'header_signature', 'column_mappings', 'is_default', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category_ref.name', read_only=True, default=None)

    class Meta:
        model = Product
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class BatchGroupSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source='product.title', read_only=True, default=None)
    product_number = serializers.CharField(source='product.product_number', read_only=True, default=None)
    purchase_order_number = serializers.CharField(
        source='purchase_order.order_number',
        read_only=True,
        default=None,
    )
    manifest_row_number = serializers.IntegerField(
        source='manifest_row.row_number',
        read_only=True,
        default=None,
    )
    items_count = serializers.IntegerField(read_only=True)
    intake_items_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = BatchGroup
        fields = '__all__'
        read_only_fields = ['id', 'batch_number', 'created_at', 'updated_at']


class ItemSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source='product.title', read_only=True, default=None)
    product_number = serializers.CharField(source='product.product_number', read_only=True, default=None)
    batch_group_number = serializers.CharField(
        source='batch_group.batch_number',
        read_only=True,
        default=None,
    )
    batch_group_status = serializers.CharField(
        source='batch_group.status',
        read_only=True,
        default=None,
    )

    class Meta:
        model = Item
        fields = [
            'id', 'sku', 'product', 'product_title', 'purchase_order',
            'manifest_row', 'batch_group', 'batch_group_number', 'batch_group_status',
            'processing_tier', 'product_number',
            'title', 'brand', 'category', 'price', 'cost',
            'source', 'status', 'condition', 'specifications',
            'location', 'listed_at', 'checked_in_at', 'checked_in_by',
            'sold_at', 'sold_for', 'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id',
            'sku',
            'listed_at',
            'checked_in_at',
            'checked_in_by',
            'created_at',
            'updated_at',
        ]


class ItemPublicSerializer(serializers.ModelSerializer):
    """Public-facing item info for price lookup (no cost, no internal fields)."""
    class Meta:
        model = Item
        fields = ['sku', 'title', 'brand', 'category', 'price', 'status']


class ProcessingBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcessingBatch
        fields = '__all__'
        read_only_fields = ['id']


class ItemHistorySerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default=None)

    class Meta:
        model = ItemHistory
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class ItemScanHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemScanHistory
        fields = '__all__'
        read_only_fields = ['id', 'scanned_at']
