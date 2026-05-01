from rest_framework import serializers
from apps.core.serializers import S3FileSerializer
from .models import (
    Vendor, Category, PurchaseOrder, CSVTemplate, ManifestRow,
    Product, VendorProductRef, BatchGroup, Item, ProcessingBatch,
    ItemHistory, ItemScanHistory,
    PreprocessingOrder, PreprocessingRow,
    Receiving, ReceivingPallet, ReceivingAttachment,
)
from .layer_helpers import (
    effective_preprocessing_title,
    effective_preprocessing_triple,
    effective_taxonomy_category_for_row,
    preprocessing_row_has_final,
)


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = '__all__'
        read_only_fields = [
            'id',
            'created_at',
        ]


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
    item_ids = serializers.SerializerMethodField()
    first_item_id = serializers.SerializerMethodField()
    first_item_sku = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    base_cost = serializers.SerializerMethodField()
    ideal_price = serializers.SerializerMethodField()
    set_price = serializers.SerializerMethodField()
    ideal_delta_pct = serializers.SerializerMethodField()

    class Meta:
        model = ManifestRow
        fields = '__all__'
        read_only_fields = ['id']

    def _items(self, obj):
        prefetched = getattr(obj, '_prefetched_objects_cache', {}).get('items')
        if prefetched is not None:
            return list(prefetched)
        return list(obj.items.all())

    def get_item_ids(self, obj):
        return [item.id for item in self._items(obj)]

    def get_first_item_id(self, obj):
        items = self._items(obj)
        return items[0].id if items else None

    def get_first_item_sku(self, obj):
        items = self._items(obj)
        return items[0].sku if items else None

    def get_item_count(self, obj):
        return len(self._items(obj))

    def get_base_cost(self, obj):
        if not obj.purchase_order_id:
            return None
        cost = obj.purchase_order.compute_item_cost(obj.unit_retail)
        return str(cost) if cost is not None else None

    def get_ideal_price(self, obj):
        if not obj.purchase_order_id:
            return None
        cost = obj.purchase_order.compute_item_cost(obj.unit_retail)
        return str(cost * 2) if cost is not None else None

    def get_set_price(self, obj):
        price = obj.final_price if obj.final_price is not None else obj.proposed_price
        return str(price) if price is not None else None

    def get_ideal_delta_pct(self, obj):
        price = obj.final_price if obj.final_price is not None else obj.proposed_price
        if price is None or not obj.purchase_order_id:
            return None
        cost = obj.purchase_order.compute_item_cost(obj.unit_retail)
        if cost is None or cost <= 0:
            return None
        ideal = cost * 2
        return round(float((price - ideal) / ideal * 100), 1)


class ManualReviewRowSerializer(serializers.ModelSerializer):
    first_item_sku = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    base_cost = serializers.SerializerMethodField()
    ideal_price = serializers.SerializerMethodField()
    set_price = serializers.SerializerMethodField()
    ideal_delta_pct = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()

    class Meta:
        model = ManifestRow
        fields = [
            'id',
            'row_number',
            'description',
            'title',
            'brand',
            'model',
            'category',
            'condition',
            'unit_retail',
            'identifiers',
            'taxonomy',
            'specifications',
            'tracking',
            'search_tags',
            'proposed_price',
            'final_price',
            'pricing_stage',
            'pricing_notes',
            'ai_reasoning',
            'notes',
            'first_item_sku',
            'item_count',
            'base_cost',
            'ideal_price',
            'set_price',
            'ideal_delta_pct',
        ]

    def get_category(self, obj):
        flat = str(getattr(obj, 'category', None) or '').strip()
        if flat:
            return flat[:200]
        return str((obj.taxonomy or {}).get('category') or '')[:200]

    def _items(self, obj):
        prefetched = getattr(obj, '_prefetched_objects_cache', {}).get('items')
        if prefetched is not None:
            return list(prefetched)
        return list(obj.items.all())

    def get_first_item_sku(self, obj):
        items = self._items(obj)
        return items[0].sku if items else None

    def get_item_count(self, obj):
        return len(self._items(obj))

    def get_base_cost(self, obj):
        if not obj.purchase_order_id:
            return None
        cost = obj.purchase_order.compute_item_cost(obj.unit_retail)
        return str(cost) if cost is not None else None

    def get_ideal_price(self, obj):
        if not obj.purchase_order_id:
            return None
        cost = obj.purchase_order.compute_item_cost(obj.unit_retail)
        return str(cost * 2) if cost is not None else None

    def get_set_price(self, obj):
        price = obj.final_price if obj.final_price is not None else obj.proposed_price
        return str(price) if price is not None else None

    def get_ideal_delta_pct(self, obj):
        price = obj.final_price if obj.final_price is not None else obj.proposed_price
        if price is None or not obj.purchase_order_id:
            return None
        cost = obj.purchase_order.compute_item_cost(obj.unit_retail)
        if cost is None or cost <= 0:
            return None
        ideal = cost * 2
        return round(float((price - ideal) / ideal * 100), 1)


class PreprocessingOrderSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='purchase_order.vendor.name', read_only=True)

    class Meta:
        model = PreprocessingOrder
        fields = [
            'id',
            'purchase_order',
            'workflow_status',
            'current_step',
            'manifest_headers',
            'header_signature',
            'standardization_formulas',
            'template',
            'template_name',
            'row_count',
            'standardized_at',
            'last_ai_import_at',
            'review_saved_at',
            'finalized_at',
            'vendor_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PreprocessingReviewRowSerializer(serializers.ModelSerializer):
    """Staging review: exposes standard_/ai_/final_ layers plus effective flat aliases."""

    base_cost = serializers.SerializerMethodField()
    ideal_price = serializers.SerializerMethodField()
    set_price = serializers.SerializerMethodField()
    ideal_delta_pct = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()

    description = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()
    brand = serializers.SerializerMethodField()
    model = serializers.SerializerMethodField()
    condition = serializers.SerializerMethodField()
    notes = serializers.SerializerMethodField()
    identifiers = serializers.SerializerMethodField()
    taxonomy = serializers.SerializerMethodField()
    specifications = serializers.SerializerMethodField()
    tracking = serializers.SerializerMethodField()
    search_tags = serializers.SerializerMethodField()

    final_layer_visible = serializers.SerializerMethodField()

    class Meta:
        model = PreprocessingRow
        fields = [
            'id',
            'row_number',
            # Effective (coalesced) aliases for legacy UI paths
            'description',
            'title',
            'brand',
            'model',
            'condition',
            'notes',
            'identifiers',
            'taxonomy',
            'specifications',
            'tracking',
            'search_tags',
            'category',
            # Triple layers (explicit)
            'standard_description',
            'ai_description',
            'final_description',
            'ai_title',
            'final_title',
            'ai_category',
            'final_category',
            'standard_brand',
            'ai_brand',
            'final_brand',
            'standard_model',
            'ai_model',
            'final_model',
            'standard_condition',
            'ai_condition',
            'final_condition',
            'standard_notes',
            'ai_notes',
            'final_notes',
            'standard_identifiers',
            'ai_identifiers',
            'final_identifiers',
            'standard_taxonomy',
            'ai_taxonomy',
            'final_taxonomy',
            'standard_specifications',
            'ai_specifications',
            'final_specifications',
            'standard_tracking',
            'ai_tracking',
            'final_tracking',
            'standard_search_tags',
            'ai_search_tags',
            'final_search_tags',
            'unit_retail',
            'quantity',
            'proposed_price',
            'final_price',
            'pricing_stage',
            'pricing_notes',
            'ai_reasoning',
            'ai_status',
            'batch_flag',
            'final_layer_visible',
            'base_cost',
            'ideal_price',
            'set_price',
            'ideal_delta_pct',
        ]

    def get_description(self, obj):
        return str(effective_preprocessing_triple(obj, 'description') or '')

    def get_title(self, obj):
        return effective_preprocessing_title(obj)

    def get_brand(self, obj):
        return str(effective_preprocessing_triple(obj, 'brand') or '')

    def get_model(self, obj):
        return str(effective_preprocessing_triple(obj, 'model') or '')

    def get_condition(self, obj):
        return str(effective_preprocessing_triple(obj, 'condition') or '')

    def get_notes(self, obj):
        return str(effective_preprocessing_triple(obj, 'notes') or '')

    def get_identifiers(self, obj):
        v = effective_preprocessing_triple(obj, 'identifiers')
        return v if isinstance(v, dict) else {}

    def get_taxonomy(self, obj):
        v = effective_preprocessing_triple(obj, 'taxonomy')
        return v if isinstance(v, dict) else {}

    def get_specifications(self, obj):
        v = effective_preprocessing_triple(obj, 'specifications')
        return v if isinstance(v, dict) else {}

    def get_tracking(self, obj):
        v = effective_preprocessing_triple(obj, 'tracking')
        return v if isinstance(v, dict) else {}

    def get_search_tags(self, obj):
        v = effective_preprocessing_triple(obj, 'search_tags')
        if isinstance(v, list):
            return v
        return []

    def get_category(self, obj):
        return effective_taxonomy_category_for_row(obj)

    def get_final_layer_visible(self, obj):
        return preprocessing_row_has_final(obj)

    def get_base_cost(self, obj):
        po = obj.purchase_order
        if not po:
            return None
        cost = po.compute_item_cost(obj.unit_retail)
        return str(cost) if cost is not None else None

    def get_ideal_price(self, obj):
        po = obj.purchase_order
        if not po:
            return None
        cost = po.compute_item_cost(obj.unit_retail)
        return str(cost * 2) if cost is not None else None

    def get_set_price(self, obj):
        price = obj.final_price if obj.final_price is not None else obj.proposed_price
        return str(price) if price is not None else None

    def get_ideal_delta_pct(self, obj):
        price = obj.final_price if obj.final_price is not None else obj.proposed_price
        po = obj.purchase_order
        if price is None or not po:
            return None
        cost = po.compute_item_cost(obj.unit_retail)
        if cost is None or cost <= 0:
            return None
        ideal = cost * 2
        return round(float((price - ideal) / ideal * 100), 1)


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
            'total_cost', 'retail_value', 'est_shrink',
            'condition', 'description',
            'item_count', 'order_pallet_count', 'notes', 'manifest', 'manifest_file', 'manifest_preview',
            'processing_stats',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id',
            'total_cost',
            'est_shrink',
            'manifest_preview',
            'created_at',
            'updated_at',
        ]

    manifest_file = S3FileSerializer(source='manifest', read_only=True)

    def get_processing_stats(self, obj):
        # List/detail querysets annotate these to avoid N+1 queries (see PurchaseOrderViewSet).
        if hasattr(obj, '_items_intake'):
            status_counts = {
                'intake': obj._items_intake,
                'processing': obj._items_processing,
                'on_shelf': obj._items_on_shelf,
                'sold': obj._items_sold,
                'returned': obj._items_returned,
                'scrapped': obj._items_scrapped,
                'lost': obj._items_lost,
            }
            return {
                'item_status_counts': status_counts,
                'pending_items': status_counts['intake'] + status_counts['processing'],
                'batch_groups_pending': obj._batch_groups_pending,
                'batch_groups_total': obj._batch_groups_total,
            }
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


class PurchaseOrderListSerializer(serializers.ModelSerializer):
    """Lean rows for GET /inventory/orders/ (list only). No manifest payload or processing_stats."""

    vendor_name = serializers.CharField(source='vendor_name_cache', read_only=True)
    vendor_code = serializers.CharField(source='vendor_code_cache', read_only=True)
    has_manifest = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            'id',
            'vendor',
            'vendor_name',
            'vendor_code',
            'order_number',
            'status',
            'ordered_date',
            'expected_delivery',
            'delivered_date',
            'condition',
            'description',
            'item_count',
            'order_pallet_count',
            'total_cost',
            'retail_value',
            'has_manifest',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'total_cost',
            'created_at',
            'updated_at',
        ]

    def get_has_manifest(self, obj):
        return bool(getattr(obj, 'manifest_id', None))


class PreprocessingQueueOrderSerializer(serializers.ModelSerializer):
    """Lean rows for GET …/orders/preprocessing-queue/ (navbar picker)."""

    vendor_name = serializers.CharField(source='vendor_name_cache', read_only=True)
    preprocessing_row_count = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = ['id', 'order_number', 'vendor_name', 'preprocessing_row_count']

    def get_preprocessing_row_count(self, obj):
        prep = getattr(obj, 'preprocessing', None)
        return prep.row_count if prep else 0


class PurchaseOrderDetailSerializer(PurchaseOrderSerializer):
    manifest_row_count = serializers.SerializerMethodField()

    class Meta(PurchaseOrderSerializer.Meta):
        fields = PurchaseOrderSerializer.Meta.fields + ['manifest_row_count']

    def get_manifest_row_count(self, obj):
        annotated = getattr(obj, '_manifest_row_count', None)
        if annotated is not None:
            return annotated
        return obj.manifest_rows.count()


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
            'title', 'brand', 'price', 'unit_retail', 'cost',
            'source', 'status', 'condition', 'specifications',
            'location', 'listed_at', 'checked_in_at', 'checked_in_by',
            'sold_at', 'sold_for', 'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id',
            'sku',
            'cost',
            'listed_at',
            'checked_in_at',
            'checked_in_by',
            'created_at',
            'updated_at',
        ]


class ItemPublicSerializer(serializers.ModelSerializer):
    """Public-facing item info for customer scan — no cost, no internal fields."""

    estimated_retail_value = serializers.SerializerMethodField()
    savings_pct = serializers.SerializerMethodField()
    processing_notes = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()

    def get_category(self, obj):
        mr = getattr(obj, 'manifest_row', None)
        if mr is not None:
            flat = str(getattr(mr, 'category', None) or '').strip()
            if flat:
                return flat
            c = str((mr.taxonomy or {}).get('category') or '').strip()
            if c:
                return c
        if obj.product_id:
            prod = getattr(obj, 'product', None)
            if prod is not None:
                return prod.category or ''
        return ''

    def get_estimated_retail_value(self, obj):
        mr = getattr(obj, 'manifest_row', None)
        if mr is not None and mr.unit_retail is not None:
            return str(mr.unit_retail)
        return None

    def get_savings_pct(self, obj):
        retail = None
        mr = getattr(obj, 'manifest_row', None)
        if mr is not None and mr.unit_retail is not None:
            retail = mr.unit_retail
        if retail and retail > 0 and obj.price > 0:
            savings = ((retail - obj.price) / retail * 100)
            if savings > 0:
                return round(float(savings), 1)
        return None

    def get_processing_notes(self, obj):
        """Return any test/restoration notes from item notes (public-safe subset)."""
        if not obj.notes:
            return None
        # Only include notes that were explicitly marked as public
        # by staff starting them with "NOTE:" prefix
        lines = [
            line.strip()
            for line in obj.notes.splitlines()
            if line.strip().upper().startswith('NOTE:')
        ]
        if lines:
            return ' '.join(line[5:].strip() for line in lines)
        return None

    class Meta:
        model = Item
        fields = [
            'sku', 'title', 'brand', 'category',
            'price', 'status', 'condition', 'source',
            'estimated_retail_value', 'savings_pct', 'processing_notes',
        ]


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
        read_only_fields = ['id', 'scanned_at', 'outcome', 'cart', 'created_by']


# --- Receiving ----------------------------------------------------------------

class ReceivingPalletWriteSerializer(serializers.Serializer):
    pallet_number = serializers.IntegerField(min_value=1, max_value=99)
    damaged = serializers.BooleanField(required=False, default=False)


class ReceivingDraftPatchSerializer(serializers.Serializer):
    received_date = serializers.DateField(required=False, allow_null=True)
    start_time = serializers.TimeField(required=False, allow_null=True)
    end_time = serializers.TimeField(required=False, allow_null=True)
    condition = serializers.ChoiceField(
        choices=['', 'good', 'mixed', 'damaged'],
        required=False,
        allow_blank=True,
    )
    issues = serializers.CharField(required=False, allow_blank=True)
    pallet_count = serializers.IntegerField(required=False, min_value=0, max_value=99)
    pallets = ReceivingPalletWriteSerializer(many=True, required=False, allow_null=True)


class ReceivingPalletSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReceivingPallet
        fields = ['pallet_number', 'damaged']


class ReceivingAttachmentSerializer(serializers.ModelSerializer):
    s3_file = S3FileSerializer(read_only=True)

    class Meta:
        model = ReceivingAttachment
        fields = [
            'id',
            'kind',
            'pallet_number',
            'side',
            'client_photo_id',
            's3_file',
            'created_at',
        ]


class ReceivingDetailSerializer(serializers.ModelSerializer):
    pallets = ReceivingPalletSerializer(many=True, read_only=True)
    attachments = ReceivingAttachmentSerializer(many=True, read_only=True)
    is_draft = serializers.SerializerMethodField()

    class Meta:
        model = Receiving
        fields = [
            'id',
            'purchase_order_id',
            'received_date',
            'start_time',
            'end_time',
            'condition',
            'issues',
            'pallet_count',
            'completed_at',
            'draft_version',
            'is_draft',
            'pallets',
            'attachments',
            'created_by',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'draft_version',
            'completed_at',
            'created_at',
            'updated_at',
        ]

    def get_is_draft(self, obj):
        return obj.completed_at is None


class OrderForReceivingListSerializer(PurchaseOrderListSerializer):
    """Orders eligible for receiving + draft/complete flags."""

    has_receiving_draft = serializers.SerializerMethodField()
    has_receiving_complete = serializers.SerializerMethodField()

    class Meta(PurchaseOrderListSerializer.Meta):
        fields = PurchaseOrderListSerializer.Meta.fields + [
            'has_receiving_draft',
            'has_receiving_complete',
        ]

    def get_has_receiving_draft(self, obj):
        if getattr(obj, '_recv_draft_exists', None) is not None:
            return bool(obj._recv_draft_exists)
        r = getattr(obj, '_receiving_flags', None)
        if r is not None:
            return r.get('draft', False)
        try:
            rec = obj.receiving_record
        except Receiving.DoesNotExist:
            return False
        return rec.completed_at is None

    def get_has_receiving_complete(self, obj):
        if getattr(obj, '_recv_complete_exists', None) is not None:
            return bool(obj._recv_complete_exists)
        r = getattr(obj, '_receiving_flags', None)
        if r is not None:
            return r.get('complete', False)
        try:
            rec = obj.receiving_record
        except Receiving.DoesNotExist:
            return False
        return rec.completed_at is not None
