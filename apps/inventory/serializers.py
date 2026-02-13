from rest_framework import serializers
from apps.core.serializers import S3FileSerializer
from .models import (
    Vendor, PurchaseOrder, CSVTemplate, ManifestRow,
    Product, Item, ProcessingBatch, ItemScanHistory,
)


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class ManifestRowSerializer(serializers.ModelSerializer):
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

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'vendor', 'vendor_name', 'vendor_code', 'order_number',
            'status', 'ordered_date', 'paid_date', 'shipped_date',
            'expected_delivery', 'delivered_date',
            'purchase_cost', 'shipping_cost', 'fees',
            'total_cost', 'retail_value', 'condition', 'description',
            'item_count', 'notes', 'manifest', 'manifest_file', 'manifest_preview',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'total_cost', 'manifest_preview', 'created_at', 'updated_at']

    manifest_file = S3FileSerializer(source='manifest', read_only=True)


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
    class Meta:
        model = Product
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class ItemSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source='product.title', read_only=True, default=None)

    class Meta:
        model = Item
        fields = [
            'id', 'sku', 'product', 'product_title', 'purchase_order',
            'title', 'brand', 'category', 'price', 'cost',
            'source', 'status', 'location', 'listed_at',
            'sold_at', 'sold_for', 'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'sku', 'created_at', 'updated_at']


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


class ItemScanHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemScanHistory
        fields = '__all__'
        read_only_fields = ['id', 'scanned_at']
