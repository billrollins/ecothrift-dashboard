from rest_framework import serializers
from apps.core.serializers import S3FileSerializer
from .models import (
    Vendor, Category, PurchaseOrder, CSVTemplate, ManifestRow,
    Product, VendorProductRef, BatchGroup, Item, ItemCheckIn, ProcessingBatch,
    ItemHistory, ItemScanHistory,
    PreprocessingRow,
    ProcessingRow,
    RestorationJob,
    RestorationTimelineEvent,
    Receiving, ReceivingPallet, ReceivingAttachment, ReceivingPhotoOverride,
    Dispute,
)
from .services.manual_item import find_or_create_product_for_manual_item
from .services.product_matching import product_snapshot
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


class PreprocessingReviewRowSerializer(serializers.ModelSerializer):
    """Staging review: exposes standard_/ai_/final_ layers plus effective flat aliases."""

    base_cost = serializers.SerializerMethodField()
    ideal_price = serializers.SerializerMethodField()
    set_price = serializers.SerializerMethodField()
    ideal_delta_pct = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()

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
    matched_product_detail = serializers.SerializerMethodField()
    same_product_row_numbers = serializers.SerializerMethodField()

    class Meta:
        model = PreprocessingRow
        fields = [
            'id',
            'row_number',
            # Effective (coalesced) aliases for legacy UI paths
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
            'match_candidates',
            'final_matched_product',
            'match_source',
            'matched_product_detail',
            'same_product_row_numbers',
            'final_layer_visible',
            'base_cost',
            'ideal_price',
            'set_price',
            'ideal_delta_pct',
        ]

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

    def get_matched_product_detail(self, obj):
        p = obj.final_matched_product
        if p is None:
            return None
        return {'id': p.id, **product_snapshot(p)}

    def get_same_product_row_numbers(self, obj):
        peers = self.context.get('same_product_peers_by_row_id') or {}
        return peers.get(obj.id, [])

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


class PreprocessingReviewRowMinimalSerializer(PreprocessingReviewRowSerializer):
    """Step 3 grid: slim JSON (no standard/ai/final triples or ai_status).

    Listing columns still use the same effective coalesce as the full serializer so the table
    is populated before finals exist or when only standard/ai layers are filled.
    """

    class Meta(PreprocessingReviewRowSerializer.Meta):
        fields = [
            'id',
            'manifest_row_id',
            'row_number',
            'quantity',
            'unit_retail',
            'proposed_price',
            'final_price',
            'pricing_stage',
            'pricing_notes',
            'batch_flag',
            'title',
            'brand',
            'model',
            'condition',
            'notes',
            'category',
            'specifications',
            'search_tags',
            'base_cost',
            'ideal_price',
            'set_price',
            'ideal_delta_pct',
            'final_layer_visible',
            'match_candidates',
            'final_matched_product',
            'match_source',
            'matched_product_detail',
            'same_product_row_numbers',
            # Scalar layer fields for hover tooltips + "Reset to AI condition" (cheap;
            # the heavy JSON triples stay excluded).
            'ai_title',
            'ai_brand',
            'ai_model',
            'ai_condition',
            'standard_brand',
            'standard_model',
            'standard_condition',
        ]


_READONLY_MANIFEST_PATCH_FIELDS = frozenset({
    'manifest_filename',
    'manifest_uploaded_at',
    'manifest_row_count',
    'manifest_category_count',
    'manifest_signature',
    'manifest_headers',
})


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
            'item_count', 'pallet_count', 'notes', 'manifest', 'manifest_file', 'manifest_preview',
            'manifest_filename', 'manifest_uploaded_at', 'manifest_row_count', 'manifest_category_count',
            'manifest_signature', 'manifest_headers',
            'template', 'template_name_cache', 'template_header_signature_cache',
            'template_column_mappings_cache', 'standardization_formulas',
            'preprocess_status', 'receiving_status', 'receiving_started_at', 'receiving_done_at',
            'processing_status', 'processing_started_at', 'processing_done_at',
            'uses_legacy_processing',
            'closeout_status',
            'intake_dispute_status', 'processing_dispute_status',
            'standardized_at', 'ai_cleaned_at', 'review_saved_at', 'finalized_at', 'closed_at',
            'processing_stats',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id',
            'total_cost',
            'est_shrink',
            'manifest_preview',
            'manifest_filename',
            'manifest_uploaded_at',
            'manifest_row_count',
            'manifest_category_count',
            'manifest_signature',
            'manifest_headers',
            'template',
            'template_name_cache',
            'template_header_signature_cache',
            'template_column_mappings_cache',
            'standardization_formulas',
            'preprocess_status',
            'receiving_status',
            'receiving_started_at',
            'receiving_done_at',
            'processing_status',
            'processing_started_at',
            'processing_done_at',
            'uses_legacy_processing',
            'closeout_status',
            'intake_dispute_status',
            'processing_dispute_status',
            'standardized_at',
            'ai_cleaned_at',
            'review_saved_at',
            'finalized_at',
            'closed_at',
            'created_at',
            'updated_at',
        ]

    manifest_file = S3FileSerializer(source='manifest', read_only=True)

    def validate(self, attrs):
        data = getattr(self, 'initial_data', None)
        if isinstance(data, dict):
            bad = _READONLY_MANIFEST_PATCH_FIELDS.intersection(data.keys())
            if bad:
                raise serializers.ValidationError(
                    {f: ['Manifest metadata fields are read-only.'] for f in sorted(bad)},
                )
        return attrs

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
            'paid_date',
            'shipped_date',
            'expected_delivery',
            'delivered_date',
            'condition',
            'description',
            'item_count',
            'pallet_count',
            'total_cost',
            'retail_value',
            'has_manifest',
            'receiving_status',
            'processing_status',
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
        if getattr(obj, 'manifest_row_count', None) is not None:
            return obj.manifest_row_count
        annotated = getattr(obj, '_preprocessing_staging_count', None)
        if annotated is not None:
            return annotated
        return PreprocessingRow.objects.filter(purchase_order=obj).count()


class PurchaseOrderDetailSerializer(PurchaseOrderSerializer):
    """PO retrieve: full manifest fields; no live ``processing_stats`` (use processing-stats action)."""

    inventory_manifest_row_count = serializers.SerializerMethodField()

    class Meta(PurchaseOrderSerializer.Meta):
        fields = [
            f
            for f in PurchaseOrderSerializer.Meta.fields
            if f != 'processing_stats'
        ] + ['inventory_manifest_row_count']

    def get_inventory_manifest_row_count(self, obj):
        if obj.manifest_row_count is not None:
            return obj.manifest_row_count
        annotated = getattr(obj, '_manifest_row_count', None)
        if annotated is not None:
            return annotated
        return obj.manifest_rows.count()


class PurchaseOrderDetailSurfaceSerializer(serializers.ModelSerializer):
    """Order Detail GET only: scalar PO fields + denormalized manifest meta — no previews, URLs, stats."""

    vendor_name = serializers.CharField(source='vendor_name_cache', read_only=True)
    vendor_code = serializers.CharField(source='vendor_code_cache', read_only=True)
    has_manifest = serializers.SerializerMethodField()
    manifest_filename = serializers.CharField(allow_null=True, read_only=True)
    manifest_uploaded_at = serializers.DateTimeField(allow_null=True, read_only=True)
    manifest_row_count = serializers.IntegerField(allow_null=True, read_only=True)
    manifest_category_count = serializers.IntegerField(allow_null=True, read_only=True)

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
            'paid_date',
            'shipped_date',
            'expected_delivery',
            'delivered_date',
            'purchase_cost',
            'shipping_cost',
            'fees',
            'total_cost',
            'retail_value',
            'est_shrink',
            'condition',
            'description',
            'item_count',
            'pallet_count',
            'notes',
            'manifest_filename',
            'manifest_uploaded_at',
            'manifest_row_count',
            'manifest_category_count',
            'manifest_signature',
            'manifest_headers',
            'template',
            'template_name_cache',
            'template_header_signature_cache',
            'template_column_mappings_cache',
            'standardization_formulas',
            'preprocess_status',
            'receiving_status',
            'receiving_started_at',
            'receiving_done_at',
            'processing_status',
            'processing_started_at',
            'processing_done_at',
            'uses_legacy_processing',
            'closeout_status',
            'intake_dispute_status',
            'processing_dispute_status',
            'standardized_at',
            'ai_cleaned_at',
            'review_saved_at',
            'finalized_at',
            'closed_at',
            'has_manifest',
            'created_at',
            'updated_at',
        ]

    def get_has_manifest(self, obj):
        return bool(getattr(obj, 'manifest_id', None))

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for k in (
            'manifest_filename',
            'manifest_uploaded_at',
            'manifest_row_count',
            'manifest_category_count',
            'manifest_signature',
            'manifest_headers',
        ):
            if data.get(k) == '':
                data[k] = None
        return data


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
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    upc = serializers.SerializerMethodField()
    catalog_display_label = serializers.CharField(read_only=True)

    def get_upc(self, obj):
        return obj.primary_upc

    class Meta:
        model = Product
        fields = [
            'id', 'product_number', 'title', 'brand', 'model', 'category',
            'category_name', 'specifications', 'identifiers', 'tags', 'upc',
            'catalog_display_label', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'product_number', 'upc', 'catalog_display_label', 'created_at', 'updated_at']
        extra_kwargs = {
            'category': {'required': False},
        }


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


def item_listing_category(obj: Item) -> str:
    """Category for staff item APIs — Product category, then manifest fallback."""

    if obj.product_id:
        prod = getattr(obj, 'product', None)
        if prod is not None:
            category = getattr(prod, 'category', None)
            name = getattr(category, 'name', '')
            if name:
                return str(name).strip()
    mr = getattr(obj, 'manifest_row', None)
    if mr is not None:
        flat = str(getattr(mr, 'category', None) or '').strip()
        if flat:
            return flat
        c = str((mr.taxonomy or {}).get('category') or '').strip()
        if c:
            return c
    return ''


class ItemSerializer(serializers.ModelSerializer):
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(),
        required=False,
        allow_null=True,
    )
    product_title = serializers.CharField(source='product.title', read_only=True, default=None)
    product_brand = serializers.CharField(source='product.brand', read_only=True, default='')
    product_number = serializers.CharField(source='product.product_number', read_only=True, default=None)
    product_model = serializers.CharField(source='product.model', read_only=True, default='')
    product_upc = serializers.SerializerMethodField()
    purchase_order_number = serializers.CharField(
        source='purchase_order.order_number',
        read_only=True,
        default=None,
    )
    category = serializers.SerializerMethodField()
    title = serializers.CharField(source='product.title', read_only=True, default='')
    brand = serializers.CharField(source='product.brand', read_only=True, default='')
    model = serializers.CharField(required=False, allow_blank=True, write_only=True)
    upc = serializers.CharField(required=False, allow_blank=True, write_only=True)
    identifiers = serializers.JSONField(required=False, write_only=True)
    tags = serializers.ListField(
        child=serializers.CharField(max_length=40),
        required=False,
        allow_empty=True,
        write_only=True,
    )
    search_tags = serializers.ListField(
        child=serializers.CharField(max_length=40),
        required=False,
        allow_empty=True,
        write_only=True,
    )
    retail_value = serializers.DecimalField(source='retail', max_digits=10, decimal_places=2, required=False, allow_null=True)
    item_check_in_id = serializers.IntegerField(source='check_in_id', read_only=True, allow_null=True)
    label_printed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    label_printed = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            'id', 'sku', 'product', 'product_title', 'product_brand', 'purchase_order', 'purchase_order_number',
            'manifest_row', 'product_number', 'product_model', 'product_upc',
            'title', 'brand', 'category', 'model', 'upc', 'identifiers', 'tags', 'search_tags',
            'price', 'retail', 'retail_value', 'cost', 'item_check_in_id',
            'source', 'status', 'condition', 'specifications',
            'location', 'listed_at', 'checked_in_at', 'checked_in_by',
            'label_printed_at', 'label_printed',
            'sold_at', 'sold_for', 'notes',
            'dispute_type', 'dispute_pct_loss', 'dispute_description',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id',
            'sku',
            'cost',
            'item_check_in_id',
            'listed_at',
            'checked_in_at',
            'checked_in_by',
            'label_printed_at',
            'label_printed',
            'dispute_type',
            'dispute_pct_loss',
            'dispute_description',
            'created_at',
            'updated_at',
        ]

    def get_label_printed(self, obj):
        return obj.label_printed_at is not None

    def get_category(self, obj):
        return item_listing_category(obj)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        raw = self.initial_data if isinstance(self.initial_data, dict) else {}
        for key in ('category', 'model', 'upc', 'identifiers', 'tags'):
            if key in raw:
                attrs[key] = raw.get(key) if key in {'identifiers', 'tags'} else str(raw.get(key) or '').strip()
        return attrs

    def get_product_upc(self, obj):
        product = getattr(obj, 'product', None)
        return product.primary_upc if product is not None else ''

    def create(self, validated_data):
        raw = self.initial_data if isinstance(self.initial_data, dict) else {}
        category = (validated_data.pop('category', None) or '').strip()
        model = (validated_data.pop('model', None) or '').strip()
        upc = (validated_data.pop('upc', None) or '').strip()
        identifiers = validated_data.pop('identifiers', None)
        tags = validated_data.pop('tags', None)
        search_tags = tags if tags is not None else validated_data.pop('search_tags', None)
        existing_product = validated_data.get('product')
        product = find_or_create_product_for_manual_item(
            title=(str(raw.get('title') or '').strip() or (getattr(existing_product, 'title', '') if existing_product else '')),
            brand=(str(raw.get('brand') or '').strip() or (getattr(existing_product, 'brand', '') if existing_product else 'Generic')),
            category=category,
            model=model,
            upc=upc,
            identifiers=identifiers,
            specifications=validated_data.get('specifications') or {},
            search_tags=search_tags,
            existing_product=existing_product,
        )
        validated_data['product'] = product
        return super().create(validated_data)

    def update(self, instance, validated_data):
        raw = self.initial_data if isinstance(self.initial_data, dict) else {}
        category = validated_data.pop('category', None)
        model = validated_data.pop('model', None)
        upc = validated_data.pop('upc', None)
        identifiers = validated_data.pop('identifiers', None)
        tags = validated_data.pop('tags', None)
        search_tags = tags if tags is not None else validated_data.pop('search_tags', None)
        item = super().update(instance, validated_data)
        title = str(raw.get('title') or '').strip() if 'title' in raw else ''
        brand = str(raw.get('brand') or '').strip() if 'brand' in raw else ''
        if (
            category is not None
            or model is not None
            or upc is not None
            or identifiers is not None
            or search_tags is not None
            or title
            or brand
        ):
            product = find_or_create_product_for_manual_item(
                title=title or (item.product.title if item.product_id else 'Generic Product'),
                brand=brand or (item.product.brand if item.product_id else 'Generic') or 'Generic',
                category=(category or item_listing_category(item) or '').strip(),
                model=(model if model is not None else getattr(item.product, 'model', '') if item.product_id else ''),
                upc=upc or '',
                identifiers=identifiers,
                specifications=item.specifications or {},
                search_tags=search_tags,
                existing_product=item.product if item.product_id else None,
            )
            if item.product_id != product.id:
                item.product = product
                item.save(update_fields=['product', 'search_text', 'updated_at'])
        return item


class ItemPublicSerializer(serializers.ModelSerializer):
    """Public-facing item info for customer scan — no cost, no internal fields."""

    estimated_retail_value = serializers.SerializerMethodField()
    savings_pct = serializers.SerializerMethodField()
    processing_notes = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()

    def get_category(self, obj):
        return item_listing_category(obj)

    def get_estimated_retail_value(self, obj):
        if obj.retail is not None:
            return str(obj.retail)
        return None

    def get_savings_pct(self, obj):
        retail = None
        if obj.retail is not None:
            retail = obj.retail
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

    title = serializers.CharField(source='product.title', read_only=True, default='')
    brand = serializers.CharField(source='product.brand', read_only=True, default='')


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
    received_pallet_count = serializers.IntegerField(required=False, min_value=0, max_value=99)
    pallets = ReceivingPalletWriteSerializer(many=True, required=False, allow_null=True)


class ReceivingPalletSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReceivingPallet
        fields = ['id', 'pallet_number', 'damaged']


class ReceivingAttachmentSerializer(serializers.ModelSerializer):
    s3_file = S3FileSerializer(read_only=True)
    thumbnail_file = S3FileSerializer(read_only=True, allow_null=True)

    class Meta:
        model = ReceivingAttachment
        fields = [
            'id',
            'kind',
            'pallet_number',
            'side',
            'client_photo_id',
            's3_file',
            'thumbnail_file',
            'created_at',
        ]


class ReceivingPhotoOverrideSerializer(serializers.ModelSerializer):
    key = serializers.SerializerMethodField()
    label = serializers.SerializerMethodField()
    overridden_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ReceivingPhotoOverride
        fields = [
            'id',
            'kind',
            'pallet_number',
            'side',
            'key',
            'label',
            'reason',
            'overridden_by',
            'overridden_by_name',
            'created_at',
        ]

    def get_key(self, obj):
        from apps.inventory.services.receiving import MissingPhotoSlot

        return MissingPhotoSlot(
            kind=obj.kind,
            pallet_number=obj.pallet_number,
            side=obj.side or '',
        ).key

    def get_label(self, obj):
        from apps.inventory.services.receiving import MissingPhotoSlot

        return MissingPhotoSlot(
            kind=obj.kind,
            pallet_number=obj.pallet_number,
            side=obj.side or '',
        ).label

    def get_overridden_by_name(self, obj):
        user = obj.overridden_by
        if not user:
            return None
        name = (getattr(user, 'full_name', None) or '').strip()
        return name or user.email


class ReceivingDetailSerializer(serializers.ModelSerializer):
    pallets = ReceivingPalletSerializer(many=True, read_only=True)
    attachments = ReceivingAttachmentSerializer(many=True, read_only=True)
    photo_overrides = ReceivingPhotoOverrideSerializer(many=True, read_only=True)
    missing_required_photos = serializers.SerializerMethodField()
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
            'received_pallet_count',
            'completed_at',
            'draft_version',
            'is_draft',
            'pallets',
            'attachments',
            'photo_overrides',
            'missing_required_photos',
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

    def get_missing_required_photos(self, obj):
        from apps.inventory.services.receiving import list_missing_photo_slots

        if obj.completed_at is not None:
            return []
        return [s.as_dict() for s in list_missing_photo_slots(obj)]


class DisputeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dispute
        fields = [
            'id',
            'purchase_order',
            'kind',
            'status',
            'title',
            'description',
            'opened_by',
            'opened_at',
            'resolved_by',
            'resolved_at',
            'subject_receiving',
            'subject_pallet',
            'subject_manifest_row',
            'subject_processing_row',
            'subject_item',
            'payload',
        ]
        read_only_fields = [
            'id',
            'purchase_order',
            'opened_by',
            'opened_at',
            'resolved_by',
            'resolved_at',
        ]


class DisputeCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=[Dispute.KIND_INTAKE, Dispute.KIND_PROCESSING])
    title = serializers.CharField(max_length=300)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    subject_receiving = serializers.PrimaryKeyRelatedField(
        queryset=Receiving.objects.all(),
        required=False,
        allow_null=True,
    )
    subject_pallet = serializers.PrimaryKeyRelatedField(
        queryset=ReceivingPallet.objects.all(),
        required=False,
        allow_null=True,
    )
    subject_manifest_row = serializers.PrimaryKeyRelatedField(
        queryset=ManifestRow.objects.all(),
        required=False,
        allow_null=True,
    )
    subject_processing_row = serializers.PrimaryKeyRelatedField(
        queryset=ProcessingRow.objects.all(),
        required=False,
        allow_null=True,
    )
    subject_item = serializers.PrimaryKeyRelatedField(
        queryset=Item.objects.all(),
        required=False,
        allow_null=True,
    )
    payload = serializers.JSONField(required=False, default=dict)


class DisputePatchSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[Dispute.STATUS_OPEN, Dispute.STATUS_RESOLVED, Dispute.STATUS_CANCELLED],
        required=False,
    )
    title = serializers.CharField(max_length=300, required=False)
    description = serializers.CharField(required=False, allow_blank=True)


class OrderForReceivingListSerializer(PurchaseOrderListSerializer):
    """Orders eligible for receiving + draft/complete flags."""

    has_receiving_draft = serializers.SerializerMethodField()
    has_receiving_complete = serializers.SerializerMethodField()

    class Meta(PurchaseOrderListSerializer.Meta):
        fields = PurchaseOrderListSerializer.Meta.fields + [
            'receiving_started_at',
            'receiving_done_at',
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


class ItemCheckInCatalogItemSerializer(serializers.Serializer):
    """Compact item row nested under catalog ItemCheckIn detail."""

    id = serializers.IntegerField()
    sku = serializers.CharField()
    status = serializers.CharField()
    condition = serializers.CharField()
    price = serializers.CharField()
    location = serializers.CharField()
    checked_in_at = serializers.DateTimeField(allow_null=True)
    label_printed_at = serializers.DateTimeField(allow_null=True)
    label_printed = serializers.BooleanField()


class ItemCheckInCatalogSerializer(serializers.ModelSerializer):
    """Catalog list/detail for ItemCheckIn workbench lookups."""

    purchase_order_number = serializers.CharField(
        source='purchase_order.order_number',
        read_only=True,
        default=None,
    )
    purchase_order_ordered_date = serializers.DateField(
        source='purchase_order.ordered_date',
        read_only=True,
        default=None,
    )
    purchase_order_vendor_name = serializers.CharField(
        source='purchase_order.vendor.name',
        read_only=True,
        default=None,
    )
    purchase_order_description = serializers.CharField(
        source='purchase_order.description',
        read_only=True,
        default='',
    )
    product_number = serializers.CharField(source='product.product_number', read_only=True, default=None)
    product_title = serializers.CharField(source='product.title', read_only=True, default='')
    product_brand = serializers.CharField(source='product.brand', read_only=True, default='')
    defaults = serializers.JSONField(source='defaults_snapshot', read_only=True)
    specifications = serializers.SerializerMethodField()
    dispute_count = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()

    class Meta:
        model = ItemCheckIn
        fields = [
            'id',
            'purchase_order',
            'purchase_order_number',
            'purchase_order_ordered_date',
            'purchase_order_vendor_name',
            'purchase_order_description',
            'processing_row',
            'manifest_row',
            'product',
            'product_number',
            'product_title',
            'product_brand',
            'origin',
            'quantity',
            'defaults',
            'specifications',
            'created_by',
            'created_at',
            'updated_at',
            'dispute_count',
            'item_count',
            'items',
        ]
        read_only_fields = fields

    def _check_in_items(self, obj):
        prefetched = getattr(obj, '_prefetched_objects_cache', None)
        if prefetched and 'items' in prefetched:
            return list(obj.items.all())
        return list(obj.items.order_by('pk'))

    def get_dispute_count(self, obj):
        return sum(
            1
            for it in self._check_in_items(obj)
            if it.status in ('scrapped', 'lost') or it.dispute_type or it.dispute_pct_loss
        )

    def get_item_count(self, obj):
        return len(self._check_in_items(obj))

    def get_specifications(self, obj):
        items = self._check_in_items(obj)
        if items:
            specs = items[0].specifications
            return specs if isinstance(specs, dict) else {}
        defaults = obj.defaults_snapshot if isinstance(obj.defaults_snapshot, dict) else {}
        raw = defaults.get('specifications')
        return raw if isinstance(raw, dict) else {}

    def get_items(self, obj):
        if self.context.get('compact'):
            return []
        out = []
        for it in self._check_in_items(obj):
            out.append({
                'id': it.id,
                'sku': it.sku,
                'status': it.status,
                'condition': it.condition,
                'price': str(it.price),
                'location': it.location or '',
                'checked_in_at': it.checked_in_at,
                'label_printed_at': it.label_printed_at,
                'label_printed': it.label_printed_at is not None,
            })
        return out


class RestorationJobSerializer(serializers.ModelSerializer):
    sku = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    brand = serializers.SerializerMethodField()
    model = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    product_number = serializers.SerializerMethodField()
    upc = serializers.SerializerMethodField()
    source = serializers.SerializerMethodField()
    condition = serializers.SerializerMethodField()
    retail = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    needs_setup = serializers.SerializerMethodField()
    valuation_pending = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    bench_ownership_ambiguous = serializers.SerializerMethodField()
    elapsed_seconds = serializers.SerializerMethodField()
    elapsed_hours = serializers.SerializerMethodField()
    processing_handoff = serializers.SerializerMethodField()
    direction = serializers.SerializerMethodField()
    from_family = serializers.SerializerMethodField()
    work_verbs = serializers.SerializerMethodField()
    unit_kind = serializers.SerializerMethodField()
    sale_state = serializers.SerializerMethodField()
    decision_reason = serializers.SerializerMethodField()
    purchase_order_number = serializers.CharField(
        source='purchase_order.order_number',
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = RestorationJob
        fields = [
            'id',
            'stage',
            'quantity',
            'scale',
            'grade_values',
            'work_session',
            'processing_handoff',
            'needs_setup',
            'valuation_pending',
            'valuation_requested_at',
            'valuation_requested_by_id',
            'valuation_request_notes',
            'valuation_requested_grades',
            'valuation_fulfilled_at',
            'direction',
            'from_family',
            'work_verbs',
            'unit_kind',
            'sale_state',
            'decision_reason',
            'product_id',
            'purchase_order_id',
            'sku',
            'name',
            'brand',
            'model',
            'category',
            'product_number',
            'upc',
            'source',
            'condition',
            'retail',
            'price',
            'purchase_order_number',
            'return_disposition_type',
            'return_reason',
            'return_scale',
            'return_grade',
            'return_notes',
            'item_check_in_id',
            'items',
            'created_at',
            'updated_at',
            'sent_at',
            'returned_at',
            'bench_started_at',
            'bench_owner_id',
            'bench_ownership_ambiguous',
            'timer_started_at',
            'active_seconds',
            'timer_is_running',
            'timer_started_by_id',
            'timer_mode',
            'timer_grade',
            'look_seconds',
            'work_seconds',
            'last_meaningful_action_at',
            'last_meaningful_active_seconds',
            'last_meaningful_action_label',
            'elapsed_seconds',
            'elapsed_hours',
            'pending_reason',
            'pending_notes',
            'pending_storage_location',
            'pending_started_at',
            'bench_disposition',
            'starting_grade',
            'final_grade',
            'disposition_notes',
            'spent_hours',
            'spent_parts_cost',
            'value_added',
            'dispositioned_at',
            'processing_handled_at',
        ]
        read_only_fields = fields

    def get_elapsed_seconds(self, obj):
        from apps.inventory.services.restoration_bench import elapsed_active_seconds

        return elapsed_active_seconds(obj)

    def get_bench_ownership_ambiguous(self, obj):
        return obj.stage == RestorationJob.STAGE_BENCH and obj.bench_owner_id is None

    def get_processing_handoff(self, obj):
        from apps.inventory.services.restoration import processing_handoff_from_check_in

        return processing_handoff_from_check_in(obj.item_check_in if obj.item_check_in_id else None)

    def _desk_summary(self, obj):
        cached = getattr(obj, '_desk_summary_cache', None)
        if cached is not None:
            return cached
        from apps.inventory.services.restoration import build_processing_desk_summary

        summary = build_processing_desk_summary(obj)
        obj._desk_summary_cache = summary
        return summary

    def get_direction(self, obj):
        return self._desk_summary(obj).get('direction')

    def get_from_family(self, obj):
        return self._desk_summary(obj).get('from_family')

    def get_work_verbs(self, obj):
        return self._desk_summary(obj).get('work_verbs') or []

    def get_unit_kind(self, obj):
        return self._desk_summary(obj).get('unit_kind')

    def get_sale_state(self, obj):
        return self._desk_summary(obj).get('sale_state')

    def get_decision_reason(self, obj):
        return self._desk_summary(obj).get('decision_reason') or ''

    def get_elapsed_hours(self, obj):
        from decimal import Decimal
        from apps.inventory.services.restoration_bench import elapsed_active_hours

        return str(elapsed_active_hours(obj).quantize(Decimal('0.01')))

    def _check_in_items(self, obj: RestorationJob):
        if not obj.item_check_in_id:
            return []
        check_in = obj.item_check_in
        prefetched = getattr(check_in, '_prefetched_objects_cache', None)
        if prefetched and 'items' in prefetched:
            return list(check_in.items.all())
        return list(check_in.items.order_by('id'))

    def get_items(self, obj):
        return [
            {
                'id': it.id,
                'sku': it.sku,
                'status': it.status,
                'condition': it.condition,
                'location': it.location or '',
            }
            for it in self._check_in_items(obj)
        ]

    def _first_item(self, obj: RestorationJob):
        cached = getattr(obj, '_first_item_cache', None)
        if cached is not None:
            return cached
        items = self._check_in_items(obj)
        item = items[0] if items else None
        obj._first_item_cache = item
        return item

    def get_sku(self, obj):
        item = self._first_item(obj)
        return item.sku if item else None

    def get_name(self, obj):
        if obj.product_id and obj.product:
            return obj.product.title
        return ''

    def get_brand(self, obj):
        if obj.product_id and obj.product:
            return obj.product.brand or ''
        return ''

    def get_model(self, obj):
        if obj.product_id and obj.product:
            return obj.product.model or ''
        return ''

    def get_category(self, obj):
        if obj.product_id and obj.product and obj.product.category_id:
            return obj.product.category.name
        return 'General'

    def get_product_number(self, obj):
        if obj.product_id and obj.product:
            return obj.product.product_number or ''
        return ''

    def get_upc(self, obj):
        if obj.product_id and obj.product:
            identifiers = obj.product.identifiers if isinstance(obj.product.identifiers, dict) else {}
            return str(identifiers.get('upc') or '')
        return ''

    def get_source(self, obj):
        from apps.inventory.services.restoration import map_vendor_name_to_tars_source

        vendor_name = None
        if obj.purchase_order_id and obj.purchase_order and obj.purchase_order.vendor_id:
            vendor_name = obj.purchase_order.vendor.name
        return map_vendor_name_to_tars_source(vendor_name)

    def get_condition(self, obj):
        defaults = obj.item_check_in.defaults_snapshot if obj.item_check_in_id else {}
        if isinstance(defaults, dict) and defaults.get('condition'):
            return str(defaults.get('condition'))
        item = self._first_item(obj)
        return item.condition if item else ''

    def get_retail(self, obj):
        from apps.inventory.services.restoration import job_display_retail

        value = job_display_retail(obj)
        return str(value) if value is not None else None

    def get_price(self, obj):
        from apps.inventory.services.restoration import job_display_price

        value = job_display_price(obj)
        return str(value) if value is not None else None

    def get_needs_setup(self, obj):
        from apps.inventory.services.restoration import restoration_job_needs_setup

        return restoration_job_needs_setup(obj)

    def get_valuation_pending(self, obj):
        from apps.inventory.services.restoration import restoration_job_valuation_pending

        return restoration_job_valuation_pending(obj)


class RestorationTimelineEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    voided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RestorationTimelineEvent
        fields = [
            'id',
            'job_id',
            'event_type',
            'entity_id',
            'occurred_at',
            'actor_id',
            'actor_name',
            'status',
            'supersedes_id',
            'voided_at',
            'voided_by_id',
            'voided_by_name',
            'void_reason',
            'correlation_id',
            'schema_version',
            'payload',
        ]
        read_only_fields = fields

    @staticmethod
    def _user_name(user) -> str:
        if user is None:
            return ''
        full_name = user.get_full_name() if hasattr(user, 'get_full_name') else ''
        return full_name or getattr(user, 'username', '') or getattr(user, 'email', '')

    def get_actor_name(self, obj):
        return self._user_name(obj.actor)

    def get_voided_by_name(self, obj):
        return self._user_name(obj.voided_by)


class RestorationTimelineEventWriteSerializer(serializers.Serializer):
    event_type = serializers.CharField(max_length=64)
    entity_id = serializers.CharField(max_length=128)
    payload = serializers.DictField()

    def validate_event_type(self, value):
        from apps.inventory.services.restoration_timeline import CLIENT_EVENT_TYPES

        if value not in CLIENT_EVENT_TYPES:
            raise serializers.ValidationError('This event type cannot be created directly.')
        return value

    def validate_payload(self, value):
        import json

        if len(json.dumps(value, default=str).encode('utf-8')) > 50_000:
            raise serializers.ValidationError('Timeline event payload is too large.')
        return value


class RestorationTimelineEventRevisionSerializer(serializers.Serializer):
    payload = serializers.DictField()

    def validate_payload(self, value):
        import json

        if len(json.dumps(value, default=str).encode('utf-8')) > 50_000:
            raise serializers.ValidationError('Timeline event payload is too large.')
        return value


class RestorationTimelineEventVoidSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500)


class RestorationJobPatchSerializer(serializers.Serializer):
    scale = serializers.CharField(required=False, allow_blank=True)
    grade_values = serializers.DictField(child=serializers.FloatField(), required=False)
    processing_handoff = serializers.DictField(required=False, allow_null=True)

    def validate_scale(self, value):
        from apps.inventory.services.restoration import is_known_active_scale

        if value and not is_known_active_scale(value):
            raise serializers.ValidationError('Unknown grade scale.')
        return value

    def validate(self, attrs):
        from apps.inventory.services.restoration import (
            empty_values_for_scale,
            normalize_grade_values,
            normalize_processing_handoff,
        )

        job = self.context['job']
        scale = attrs.get('scale', job.scale)
        if 'grade_values' in attrs:
            grade_values = normalize_grade_values(attrs['grade_values'])
        elif 'scale' in attrs and attrs['scale'] and attrs['scale'] != job.scale:
            grade_values = empty_values_for_scale(scale, normalize_grade_values(job.grade_values))
        else:
            grade_values = normalize_grade_values(job.grade_values)
        attrs['scale'] = scale
        attrs['grade_values'] = grade_values
        if 'processing_handoff' in attrs:
            raw = attrs.get('processing_handoff')
            if raw is None:
                attrs['processing_handoff'] = None
            else:
                try:
                    attrs['processing_handoff'] = normalize_processing_handoff(
                        raw,
                        user=self.context.get('user'),
                    )
                except ValueError as exc:
                    raise serializers.ValidationError({'processing_handoff': str(exc)}) from exc
        return attrs


class RestorationJobRequestValuationSerializer(serializers.Serializer):
    grades = serializers.ListField(
        child=serializers.CharField(max_length=64),
        required=False,
        allow_empty=True,
    )
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class RestorationJobWorkSessionSerializer(serializers.Serializer):
    MAX_WORK_SESSION_BYTES = 100_000

    work_session = serializers.DictField()

    def validate_work_session(self, value):
        import json
        from apps.inventory.services.tars_decision_work import (
            DecisionWorkValidationError,
            normalize_work_session,
        )

        actions = value.get('actions')
        if actions is not None:
            if not isinstance(actions, list):
                raise serializers.ValidationError('work_session.actions must be a list.')
            if not all(isinstance(action, dict) for action in actions):
                raise serializers.ValidationError('Each entry in work_session.actions must be an object.')
        try:
            value = normalize_work_session(
                value,
                job=self.context['job'],
                user=self.context.get('user'),
            )
        except DecisionWorkValidationError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        try:
            size = len(json.dumps(value, default=str).encode('utf-8'))
        except (TypeError, ValueError):
            raise serializers.ValidationError('work_session must be JSON-serializable.')
        if size > self.MAX_WORK_SESSION_BYTES:
            raise serializers.ValidationError(
                f'work_session payload is too large ({size} bytes; max {self.MAX_WORK_SESSION_BYTES}).',
            )
        return value


class RestorationJobHoldSerializer(serializers.Serializer):
    reason = serializers.CharField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    storage_location = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_reason(self, value):
        from apps.inventory.services.restoration_bench import PENDING_REASONS

        if value not in PENDING_REASONS:
            raise serializers.ValidationError('Invalid hold reason.')
        return value


class RestorationJobDoneSerializer(serializers.Serializer):
    destination = serializers.ChoiceField(
        choices=['processing', 'storage', 'salvage', 'online_sales'],
    )
    final_grade = serializers.CharField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    spent_hours = serializers.DecimalField(max_digits=8, decimal_places=2, required=False, allow_null=True)
    spent_parts_cost = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)


class RestorationPartsRequestLineSerializer(serializers.ModelSerializer):
    class Meta:
        from apps.inventory.models import RestorationPartsRequestLine

        model = RestorationPartsRequestLine
        fields = [
            'id',
            'part_number',
            'description',
            'url',
            'qty',
            'unit_price_estimate',
            'unit_price_actual',
            'status',
            'linked_grade',
        ]


class RestorationPartsRequestSiteSerializer(serializers.ModelSerializer):
    lines = RestorationPartsRequestLineSerializer(many=True, read_only=True)

    class Meta:
        from apps.inventory.models import RestorationPartsRequestSite

        model = RestorationPartsRequestSite
        fields = ['id', 'supplier_name', 'sort_order', 'lines']


class RestorationPartsOrderLineSerializer(serializers.ModelSerializer):
    request_line_id = serializers.IntegerField(source='request_line.id', read_only=True)

    class Meta:
        from apps.inventory.models import RestorationPartsOrderLine

        model = RestorationPartsOrderLine
        fields = ['id', 'request_line_id', 'qty', 'unit_cost', 'line_total']


class RestorationPartsOrderSerializer(serializers.ModelSerializer):
    lines = RestorationPartsOrderLineSerializer(many=True, read_only=True)

    class Meta:
        from apps.inventory.models import RestorationPartsOrder

        model = RestorationPartsOrder
        fields = [
            'id',
            'po_number',
            'supplier_name',
            'supplier_url',
            'subtotal',
            'shipping',
            'tax',
            'fees',
            'total',
            'ship_to_address',
            'expected_delivery',
            'ordered_at',
            'notes',
            'status',
            'site',
            'lines',
            'created_at',
            'updated_at',
        ]


class RestorationPartsRequestSerializer(serializers.ModelSerializer):
    sites = RestorationPartsRequestSiteSerializer(many=True, read_only=True)
    orders = RestorationPartsOrderSerializer(many=True, read_only=True)
    job_sku = serializers.SerializerMethodField()
    job_name = serializers.SerializerMethodField()

    class Meta:
        from apps.inventory.models import RestorationPartsRequest

        model = RestorationPartsRequest
        fields = [
            'id',
            'job',
            'job_sku',
            'job_name',
            'status',
            'selected_grade',
            'eval_snapshot',
            'notes',
            'requested_by',
            'sites',
            'orders',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    def get_job_sku(self, obj):
        item = obj.job.item_check_in.items.order_by('id').first() if obj.job.item_check_in_id else None
        return item.sku if item else None

    def get_job_name(self, obj):
        return obj.job.product.title if obj.job.product_id else ''


class RestorationPartsRequestUpsertSerializer(serializers.Serializer):
    grade = serializers.CharField(required=False, allow_blank=True)
    eval_snapshot = serializers.DictField(required=False)


class RestorationPartsOrderCreateSerializer(serializers.Serializer):
    site_id = serializers.IntegerField(required=False, allow_null=True)
    po_number = serializers.CharField(required=False, allow_blank=True, default='')
    supplier_name = serializers.CharField(required=False, allow_blank=True, default='')
    supplier_url = serializers.CharField(required=False, allow_blank=True, default='')
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)
    shipping = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    fees = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    ship_to_address = serializers.CharField(required=False, allow_blank=True, default='')
    expected_delivery = serializers.DateField(required=False, allow_null=True)
    line_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=True,
    )
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    lines = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        allow_empty=True,
    )


class RestorationJobCreateSerializer(serializers.Serializer):
    sku = serializers.CharField()


class RestorationJobReturnSerializer(serializers.Serializer):
    disposition_type = serializers.ChoiceField(choices=['tars_completed', 'untouched'])
    reason = serializers.CharField(required=False, allow_blank=True)
    scale = serializers.CharField(required=False, allow_blank=True)
    grade = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    item_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=False,
    )


class RestorationJobTimerAdjustSerializer(serializers.Serializer):
    active_seconds = serializers.IntegerField(min_value=0, max_value=86400)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=64, default='manual')


class RestorationJobMeaningfulActionSerializer(serializers.Serializer):
    label = serializers.CharField(required=False, allow_blank=True, max_length=128, default='TARS update')


class RestorationJobSplitGroupSerializer(serializers.Serializer):
    item_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )


class RestorationJobSplitSerializer(serializers.Serializer):
    groups = RestorationJobSplitGroupSerializer(many=True)

    def validate_groups(self, value):
        if not value:
            raise serializers.ValidationError('Provide at least one split group.')
        seen: set[int] = set()
        for group in value:
            for item_id in group['item_ids']:
                if item_id in seen:
                    raise serializers.ValidationError('Each item can only appear in one split group.')
                seen.add(item_id)
        return value


class RestorationJobCombineSerializer(serializers.Serializer):
    job_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )
    replace_values = serializers.BooleanField(required=False, default=False)

    def validate_job_ids(self, value):
        seen: set[int] = set()
        for job_id in value:
            if job_id in seen:
                raise serializers.ValidationError('Each stack can only be selected once.')
            seen.add(job_id)
        if len(value) < 2:
            raise serializers.ValidationError('Select at least two stacks to combine.')
        return value


class RestorationGradeScaleSerializer(serializers.ModelSerializer):
    class Meta:
        from apps.inventory.models import RestorationGradeScale

        model = RestorationGradeScale
        fields = ['id', 'name', 'grades', 'is_active', 'sort_order', 'created_at']
        read_only_fields = fields


class RestorationGradeScaleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        from apps.inventory.models import RestorationGradeScale

        model = RestorationGradeScale
        fields = ['name', 'grades']

    def validate_name(self, value):
        from apps.inventory.models import RestorationGradeScale

        name = (value or '').strip()
        if not name:
            raise serializers.ValidationError('Scale name is required.')
        if RestorationGradeScale.objects.filter(name__iexact=name).exists():
            raise serializers.ValidationError('A scale with this name already exists.')
        return name

    def validate_grades(self, value):
        if not isinstance(value, list) or len(value) < 1:
            raise serializers.ValidationError('At least one grade is required.')
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in value:
            grade = str(raw).strip()
            if not grade:
                continue
            key = grade.lower()
            if key in seen:
                raise serializers.ValidationError(f'Duplicate grade: {grade}')
            seen.add(key)
            cleaned.append(grade)
        if not cleaned:
            raise serializers.ValidationError('At least one grade is required.')
        return cleaned
