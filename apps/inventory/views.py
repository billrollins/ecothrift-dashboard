import csv
import hashlib
import io
import logging
import re
from decimal import Decimal, InvalidOperation

from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Count, Q, Sum, F
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes as perm_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from apps.accounts.permissions import IsStaff
from apps.core.models import S3File
from .formula_engine import evaluate_formula, FormulaError

logger = logging.getLogger(__name__)
from .models import (
    Vendor, Category, PurchaseOrder, CSVTemplate, ManifestRow,
    Product, VendorProductRef, BatchGroup, Item, ProcessingBatch,
    ItemHistory, ItemScanHistory,
)
from .serializers import (
    VendorSerializer, PurchaseOrderSerializer, PurchaseOrderDetailSerializer,
    CategorySerializer, CSVTemplateSerializer, ManifestRowSerializer,
    VendorProductRefSerializer, BatchGroupSerializer,
    ProductSerializer, ItemSerializer, ItemPublicSerializer,
    ProcessingBatchSerializer, ItemHistorySerializer,
)


MANIFEST_TARGET_FIELDS = (
    'quantity',
    'description',
    'title',
    'brand',
    'model',
    'category',
    'condition',
    'retail_value',
    'upc',
    'vendor_item_number',
    'notes',
)

MANIFEST_STANDARD_COLUMNS = (
    {'key': 'quantity', 'label': 'Quantity', 'required': True},
    {'key': 'description', 'label': 'Description', 'required': True},
    {'key': 'title', 'label': 'Title', 'required': False},
    {'key': 'brand', 'label': 'Brand', 'required': False},
    {'key': 'model', 'label': 'Model', 'required': False},
    {'key': 'category', 'label': 'Category', 'required': False},
    {'key': 'condition', 'label': 'Condition', 'required': False},
    {'key': 'retail_value', 'label': 'Retail Cost', 'required': False},
    {'key': 'upc', 'label': 'UPC', 'required': False},
    {'key': 'vendor_item_number', 'label': 'Vendor Item #', 'required': False},
    {'key': 'notes', 'label': 'Notes', 'required': False},
)

MANIFEST_FUNCTION_OPTIONS = (
    {'id': 'trim', 'label': 'Trim'},
    {'id': 'title_case', 'label': 'Title Case'},
    {'id': 'upper', 'label': 'Uppercase'},
    {'id': 'lower', 'label': 'Lowercase'},
    {'id': 'remove_special_chars', 'label': 'Remove Special Characters'},
    {'id': 'replace', 'label': 'Replace Text'},
)

MANIFEST_SOURCE_ALIASES = {
    'quantity': ['quantity', 'qty', 'units', 'count', 'qnty'],
    'description': ['description', 'item description', 'title', 'product', 'item'],
    'brand': ['brand', 'manufacturer'],
    'model': ['model', 'model_number', 'model number'],
    'category': ['category', 'department'],
    'retail_value': ['retail_value', 'retail value', 'unit_cost', 'unit cost', 'cost', 'price'],
    'upc': ['upc', 'upc/ean', 'barcode'],
    'vendor_item_number': [
        'vendor_item_number',
        'vendor item number',
        'item #',
        'item number',
        'tcin',
        'walmart item id',
        'sku',
    ],
    'notes': ['notes', 'comment'],
}


def header_signature(headers):
    return hashlib.md5(','.join(h.strip().lower() for h in headers).encode()).hexdigest()


def parse_manifest_file(order):
    if not order.manifest:
        return [], []
    with default_storage.open(order.manifest.key, 'rb') as manifest_file:
        content = manifest_file.read().decode('utf-8-sig', errors='ignore')
    reader = csv.reader(io.StringIO(content))
    headers = next(reader, [])
    rows = []
    for i, row in enumerate(reader, start=1):
        if not any((cell or '').strip() for cell in row):
            continue
        raw = {}
        for idx, header in enumerate(headers):
            raw[header] = row[idx].strip() if idx < len(row) else ''
        rows.append({'row_number': i, 'raw': raw})
    return headers, rows


def default_column_mappings(headers):
    normalized_headers = [(h, h.strip().lower()) for h in headers]
    mappings = []
    for target in MANIFEST_TARGET_FIELDS:
        source = ''
        for alias in MANIFEST_SOURCE_ALIASES.get(target, []):
            match = next(
                (header for header, lowered in normalized_headers if lowered == alias),
                None,
            )
            if match:
                source = match
                break
        mappings.append({
            'target': target,
            'source': source,
            'transforms': [],
        })
    return mappings


def normalize_standard_mappings(mappings):
    """Normalize mixed mapping payloads to {target, source, transforms[]} or {target, formula}."""
    normalized = []
    for mapping in mappings or []:
        if not isinstance(mapping, dict):
            continue
        target = mapping.get('target') or mapping.get('standard_column') or mapping.get('standardColumn')
        if target not in MANIFEST_TARGET_FIELDS:
            continue

        formula = mapping.get('formula', '').strip() if mapping.get('formula') else ''
        if formula:
            normalized.append({'target': target, 'formula': formula})
            continue

        source = mapping.get('source') or mapping.get('source_header') or mapping.get('sourceHeader')

        raw_transforms = (
            mapping.get('transforms')
            if mapping.get('transforms') is not None
            else mapping.get('functions')
        )
        if raw_transforms is None and mapping.get('transform'):
            raw_transforms = [{'type': mapping.get('transform')}]

        transforms = []
        for transform in raw_transforms or []:
            if isinstance(transform, str):
                transform_type = transform
                transform_data = {'type': transform_type}
            elif isinstance(transform, dict):
                transform_type = transform.get('type') or transform.get('id')
                if not transform_type:
                    continue
                transform_data = {'type': transform_type}
                if transform_type == 'replace':
                    transform_data['from'] = str(
                        transform.get('from', transform.get('value_from', '')),
                    )
                    transform_data['to'] = str(
                        transform.get('to', transform.get('value_to', '')),
                    )
            else:
                continue
            transforms.append(transform_data)

        normalized.append({
            'target': target,
            'source': str(source or ''),
            'transforms': transforms,
        })
    return normalized


def effective_manifest_row_price(row):
    if row.final_price is not None:
        return row.final_price
    if row.proposed_price is not None:
        return row.proposed_price
    return None


def parse_id_list(raw_values):
    ids = []
    for value in raw_values or []:
        try:
            ids.append(int(value))
        except (TypeError, ValueError):
            continue
    return ids


def _build_check_in_queue_from_manifest(order, user):
    """
    Create Item and BatchGroup records from manifest rows.
    Returns (items_created, batch_groups_created) or (None, None) if preconditions fail.
    """
    if order.status not in ['delivered', 'processing', 'complete']:
        return None, None
    if order.items.exists():
        return None, None
    rows = ManifestRow.objects.filter(
        purchase_order=order,
    ).select_related('matched_product')
    if not rows.exists():
        return None, None

    batch = ProcessingBatch.objects.create(
        purchase_order=order,
        status='in_progress',
        total_rows=rows.count(),
        started_at=timezone.now(),
        created_by=user,
    )

    items_created = 0
    batch_groups_created = 0
    histories = []

    for row in rows:
        product = row.matched_product
        if not product:
            product = Product.objects.create(
                title=(row.description or 'Untitled Item')[:300],
                brand=row.brand or '',
                model=row.model or '',
                category=row.category or '',
                upc=row.upc or '',
            )
            row.matched_product = product
            row.match_status = 'matched'
            row.save(update_fields=['matched_product', 'match_status'])

        quantity = row.quantity if row.quantity and row.quantity > 0 else 1
        row_cost = row.retail_value if row.retail_value is not None else None
        row_price = effective_manifest_row_price(row)
        is_batch = False
        if row_price is not None:
            is_batch = quantity >= 6 and float(row_price) < 75
        elif quantity >= 10:
            is_batch = True
        processing_tier = 'batch' if is_batch else 'individual'

        batch_group = None
        if is_batch:
            batch_group = BatchGroup.objects.create(
                batch_number=BatchGroup.generate_batch_number(),
                product=product,
                purchase_order=order,
                manifest_row=row,
                total_qty=quantity,
                unit_price=row_price,
                unit_cost=row_cost,
                condition='unknown',
                status='pending',
            )
            batch_groups_created += 1

        for _ in range(quantity):
            item_price = row_price if row_price is not None else (
                product.default_price if product.default_price is not None else Decimal('0.00')
            )
            item = Item.objects.create(
                sku=Item.generate_sku(),
                product=product,
                purchase_order=order,
                manifest_row=row,
                batch_group=batch_group,
                processing_tier=processing_tier,
                title=(row.title or product.title or row.description or '')[:300],
                brand=row.brand or product.brand or '',
                category=row.category or product.category or '',
                price=item_price,
                cost=row_cost,
                source='purchased',
                status='intake',
                condition=row.condition or 'unknown',
                specifications=row.specifications or {},
            )
            histories.append(
                ItemHistory(
                    item=item,
                    event_type='created',
                    new_value=f'po={order.order_number},row={row.row_number}',
                    note=(
                        f'Created from manifest row {row.row_number}'
                        + (f' in {batch_group.batch_number}' if batch_group else '')
                    ),
                    created_by=user,
                ),
            )
            items_created += 1

    if histories:
        ItemHistory.objects.bulk_create(histories, batch_size=1000)

    batch.processed_count = rows.count()
    batch.items_created = items_created
    batch.status = 'complete'
    batch.completed_at = timezone.now()
    batch.save()

    order.status = 'processing'
    order.item_count = items_created
    order.save(update_fields=['status', 'item_count', 'updated_at'])

    return items_created, batch_groups_created


def row_matches_search(raw_dict, search_term):
    if not search_term:
        return True
    needle = str(search_term).strip().lower()
    if not needle:
        return True
    for value in (raw_dict or {}).values():
        if needle in str(value or '').lower():
            return True
    return False


def normalized_row_matches_search(row, search_term):
    if not search_term:
        return True
    needle = str(search_term).strip().lower()
    if not needle:
        return True
    for key, value in (row or {}).items():
        if key == 'row_number':
            continue
        if needle in str(value or '').lower():
            return True
    return False


def apply_transform(value, transform):
    text = '' if value is None else str(value)
    if not transform:
        return text
    if isinstance(transform, str):
        transform_type = transform
        transform_args = {}
    else:
        transform_type = transform.get('type')
        transform_args = transform

    if transform_type == 'trim':
        return text.strip()
    if transform_type == 'title_case':
        return text.title()
    if transform_type == 'upper':
        return text.upper()
    if transform_type == 'lower':
        return text.lower()
    if transform_type == 'remove_special_chars':
        return re.sub(r'[^A-Za-z0-9\s\-_./]', '', text)
    if transform_type == 'replace':
        from_val = str(transform_args.get('from', ''))
        to_val = str(transform_args.get('to', ''))
        return text.replace(from_val, to_val)
    return text


def apply_transforms(value, transforms):
    current = '' if value is None else str(value)
    for transform in transforms or []:
        current = apply_transform(current, transform)
    return current


def parse_int(value, default=1):
    if value is None:
        return default
    if isinstance(value, (int, float)):
        out = int(value)
        return out if out > 0 else default
    cleaned = re.sub(r'[^0-9-]', '', str(value))
    if not cleaned:
        return default
    try:
        out = int(cleaned)
    except ValueError:
        return default
    return out if out > 0 else default


def parse_decimal(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    cleaned = re.sub(r'[^0-9.\-]', '', str(value))
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def normalize_row(raw, row_number, column_mappings):
    mapped = {}
    mappings_by_target = {
        m.get('target'): m for m in (column_mappings or []) if isinstance(m, dict)
    }
    for target in MANIFEST_TARGET_FIELDS:
        mapping = mappings_by_target.get(target, {})
        formula = mapping.get('formula', '').strip()
        if formula:
            try:
                mapped[target] = evaluate_formula(formula, raw)
            except FormulaError:
                mapped[target] = ''
        else:
            source = mapping.get('source', '')
            raw_value = raw.get(source, '') if source else ''
            transforms = mapping.get('transforms')
            if transforms is None and mapping.get('transform'):
                transforms = [{'type': mapping.get('transform')}]
            mapped[target] = apply_transforms(raw_value, transforms or [])

    return {
        'row_number': row_number,
        'quantity': parse_int(mapped.get('quantity'), default=1),
        'description': str(mapped.get('description') or '').strip(),
        'title': str(mapped.get('title') or '').strip(),
        'brand': str(mapped.get('brand') or '').strip(),
        'model': str(mapped.get('model') or '').strip(),
        'category': str(mapped.get('category') or '').strip(),
        'condition': str(mapped.get('condition') or '').strip(),
        'retail_value': parse_decimal(mapped.get('retail_value')),
        'upc': str(mapped.get('upc') or '').strip(),
        'vendor_item_number': str(mapped.get('vendor_item_number') or '').strip(),
        'notes': str(mapped.get('notes') or '').strip(),
    }


def resolve_manifest_mappings(order, headers, template_id=None, mappings_payload=None):
    sig = header_signature(headers)
    used_template = None
    if template_id:
        used_template = CSVTemplate.objects.filter(
            id=template_id,
            vendor=order.vendor,
        ).first()
    if not used_template:
        used_template = CSVTemplate.objects.filter(
            vendor=order.vendor,
            header_signature=sig,
        ).order_by('-is_default', '-id').first()

    normalized_mappings = normalize_standard_mappings(mappings_payload or [])
    if not normalized_mappings:
        if used_template and used_template.column_mappings:
            normalized_mappings = normalize_standard_mappings(
                used_template.column_mappings,
            )
        if not normalized_mappings:
            normalized_mappings = default_column_mappings(headers)
    return sig, used_template, normalized_mappings


def build_normalized_manifest_rows(order, selected_row_numbers=None, template_id=None, mappings_payload=None):
    headers, raw_rows = parse_manifest_file(order)
    if not headers:
        return {
            'error': 'No manifest file uploaded for this order.',
        }
    if not raw_rows:
        return {
            'error': 'Manifest has no usable rows.',
        }

    sig, used_template, mappings = resolve_manifest_mappings(
        order=order,
        headers=headers,
        template_id=template_id,
        mappings_payload=mappings_payload,
    )

    selected_set = set(parse_id_list(selected_row_numbers))
    filtered_rows = raw_rows
    if selected_set:
        filtered_rows = [r for r in raw_rows if r['row_number'] in selected_set]

    normalized_rows = [
        normalize_row(raw=row['raw'], row_number=row['row_number'], column_mappings=mappings)
        for row in filtered_rows
    ]

    return {
        'headers': headers,
        'header_signature': sig,
        'used_template': used_template,
        'mappings': mappings,
        'row_count_in_file': len(raw_rows),
        'rows_selected': len(filtered_rows),
        'normalized_rows': normalized_rows,
    }


def history_event_type_for_field(field_name):
    if field_name == 'status':
        return 'status_change'
    if field_name == 'price':
        return 'price_change'
    if field_name == 'condition':
        return 'condition_change'
    if field_name == 'location':
        return 'location_change'
    return 'note'


def apply_item_updates(item, updates):
    changed = []
    for field, value in updates.items():
        old_value = getattr(item, field)
        if old_value == value:
            continue
        setattr(item, field, value)
        changed.append((field, old_value, value))
    return changed


def build_order_delete_preview(order, include_items=True):
    """
    Summarize all order-owned artifacts that can be safely purged.

    Deletion sequence intentionally runs in reverse operational order:
    history/scans -> items -> batch/process artifacts -> manifest rows/file -> order.
    """
    base_items_qs = Item.objects.filter(purchase_order=order)
    if include_items:
        item_objects = list(base_items_qs.select_related('batch_group').order_by('id'))
        items_preview = [
            {
                'id': item.id,
                'sku': item.sku,
                'title': item.title,
                'status': item.status,
                'processing_tier': item.processing_tier,
                'batch_number': item.batch_group.batch_number if item.batch_group_id else '',
            }
            for item in item_objects
        ]
        item_count = len(item_objects)
        sold_item_count = sum(1 for item in item_objects if item.status == 'sold')
    else:
        items_preview = []
        item_count = base_items_qs.count()
        sold_item_count = base_items_qs.filter(status='sold').count()

    item_history_count = ItemHistory.objects.filter(item__purchase_order=order).count()
    item_scan_count = ItemScanHistory.objects.filter(item__purchase_order=order).count()

    batch_group_count = BatchGroup.objects.filter(purchase_order=order).count()
    processing_batch_count = ProcessingBatch.objects.filter(purchase_order=order).count()
    manifest_row_count = ManifestRow.objects.filter(purchase_order=order).count()
    manifest_file_count = 1 if order.manifest_id else 0

    manifest_file_shared = False
    if order.manifest_id:
        manifest_file_shared = PurchaseOrder.objects.filter(
            manifest_id=order.manifest_id,
        ).exclude(id=order.id).exists()

    warnings = [
        (
            'Shared catalog artifacts are retained: Product, VendorProductRef, '
            'and CSVTemplate records are not deleted.'
        ),
    ]
    if sold_item_count:
        warnings.append(
            (
                f'{sold_item_count} sold item(s) are linked to this order and will be '
                'deleted if you continue.'
            ),
        )
    if manifest_file_shared:
        warnings.append(
            'Uploaded manifest file record is referenced by another order and will be retained.',
        )

    return {
        'order_id': order.id,
        'order_number': order.order_number,
        'steps': [
            {
                'key': 'item_history',
                'label': 'Delete Item History',
                'description': 'Remove all ItemHistory records linked to this order',
                'count': item_history_count,
            },
            {
                'key': 'item_scans',
                'label': 'Delete Item Scan History',
                'description': 'Remove all ItemScanHistory records linked to this order',
                'count': item_scan_count,
            },
            {
                'key': 'items',
                'label': 'Delete Items',
                'description': 'Remove all Item records created from this order',
                'count': item_count,
            },
            {
                'key': 'batch_groups',
                'label': 'Delete Batch Groups',
                'description': 'Remove all BatchGroup records linked to this order',
                'count': batch_group_count,
            },
            {
                'key': 'processing_batches',
                'label': 'Delete Processing Batches',
                'description': 'Remove all ProcessingBatch runs linked to this order',
                'count': processing_batch_count,
            },
            {
                'key': 'manifest_rows',
                'label': 'Delete Manifest Rows',
                'description': 'Remove all standardized ManifestRow records',
                'count': manifest_row_count,
            },
            {
                'key': 'manifest_file',
                'label': 'Delete Uploaded Manifest File',
                'description': (
                    'Remove uploaded S3File record and underlying manifest file'
                    if not manifest_file_shared
                    else 'Retained because it is referenced by another order'
                ),
                'count': manifest_file_count if not manifest_file_shared else 0,
            },
            {
                'key': 'order',
                'label': 'Delete Order',
                'description': 'Delete the purchase order record itself',
                'count': 1,
            },
        ],
        'items': items_preview,
        'warnings': warnings,
    }


class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['name', 'code', 'contact_name']
    filterset_fields = ['vendor_type', 'is_active']
    ordering_fields = ['name', 'code', 'created_at']

    def perform_destroy(self, instance):
        """Soft delete — set is_active=False."""
        instance.is_active = False
        instance.save()


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.select_related('parent').all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['name', 'slug']
    filterset_fields = ['parent']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['order_number']
    filterset_fields = {
        'vendor': ['exact'],
        'status': ['exact', 'in'],
    }
    ordering_fields = ['ordered_date', 'expected_delivery', 'created_at']
    ordering = ['-ordered_date']

    def get_queryset(self):
        return PurchaseOrder.objects.select_related(
            'vendor', 'created_by',
        ).prefetch_related(
            'manifest_rows',
            'batch_groups',
        ).all()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PurchaseOrderDetailSerializer
        return PurchaseOrderSerializer

    def perform_create(self, serializer):
        extra = {'created_by': self.request.user}
        if not serializer.validated_data.get('order_number'):
            extra['order_number'] = PurchaseOrder.generate_order_number()
        if 'ordered_date' not in serializer.validated_data:
            extra['ordered_date'] = timezone.now().date()
        serializer.save(**extra)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        """Mark a PO as paid."""
        order = self.get_object()
        order.status = 'paid'
        order.paid_date = request.data.get('paid_date', timezone.now().date())
        order.save()
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='revert-paid')
    def revert_paid(self, request, pk=None):
        """Revert a PO from paid back to ordered."""
        order = self.get_object()
        order.status = 'ordered'
        order.paid_date = None
        order.save()
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='mark-shipped')
    def mark_shipped(self, request, pk=None):
        """Mark a PO as shipped."""
        order = self.get_object()
        order.status = 'shipped'
        order.shipped_date = request.data.get('shipped_date', timezone.now().date())
        if request.data.get('expected_delivery'):
            order.expected_delivery = request.data['expected_delivery']
        order.save()
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='revert-shipped')
    def revert_shipped(self, request, pk=None):
        """Revert a PO from shipped back to paid (or ordered)."""
        order = self.get_object()
        order.shipped_date = None
        order.expected_delivery = None
        order.status = 'paid' if order.paid_date else 'ordered'
        order.save()
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def deliver(self, request, pk=None):
        """Mark a PO as delivered. Auto-builds check-in queue if manifest rows exist."""
        order = self.get_object()
        order.status = 'delivered'
        order.delivered_date = request.data.get('delivered_date', timezone.now().date())
        order.save()

        items_created, batch_groups_created = None, None
        if order.manifest_rows.exists() and not order.items.exists():
            items_created, batch_groups_created = _build_check_in_queue_from_manifest(
                order, request.user,
            )
            order.refresh_from_db()

        data = PurchaseOrderSerializer(order).data
        if items_created is not None:
            data['items_created'] = items_created
            data['batch_groups_created'] = batch_groups_created
        return Response(data)

    @action(detail=True, methods=['post'], url_path='revert-delivered')
    def revert_delivered(self, request, pk=None):
        """Revert a PO from delivered back to paid (or ordered if no paid_date)."""
        order = self.get_object()
        order.delivered_date = None
        order.status = 'paid' if order.paid_date else 'ordered'
        order.save()
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='upload-manifest')
    def upload_manifest(self, request, pk=None):
        """Upload a CSV manifest file for a PO — saves to S3 and persists preview."""
        order = self.get_object()
        file = request.FILES.get('file')
        if not file:
            return Response(
                {'detail': 'No file provided.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Parse CSV ────────────────────────────────────────────────────
        content = file.read().decode('utf-8-sig')
        reader = csv.reader(io.StringIO(content))
        headers = next(reader, [])

        sig = header_signature(headers)
        template = CSVTemplate.objects.filter(
            vendor=order.vendor, header_signature=sig,
        ).first()

        rows_data = []
        for i, row in enumerate(reader, start=1):
            if not any(row):
                continue
            rows_data.append({
                'row_number': i,
                'raw': dict(zip(headers, row)),
            })

        # ── Save file to storage (S3 or local) ──────────────────────────
        s3_key = f'manifests/orders/{order.id}/{file.name}'
        file.seek(0)
        saved_path = default_storage.save(s3_key, file)

        # Delete old S3File record if replacing
        if order.manifest:
            try:
                default_storage.delete(order.manifest.key)
            except Exception:
                pass
            order.manifest.delete()

        s3_file = S3File.objects.create(
            key=saved_path,
            filename=file.name,
            size=file.size,
            content_type=file.content_type or 'text/csv',
            uploaded_by=request.user,
        )

        # ── Persist preview + link to PO ─────────────────────────────────
        preview_data = {
            'headers': headers,
            'signature': sig,
            'template_id': template.id if template else None,
            'template_name': template.name if template else None,
            'template_mappings': template.column_mappings if template else None,
            'row_count': len(rows_data),
            'rows': rows_data[:20],
        }
        order.manifest = s3_file
        order.manifest_preview = preview_data
        order.save(update_fields=['manifest', 'manifest_preview'])

        # Return the updated order so the frontend gets everything
        return Response(PurchaseOrderDetailSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='process-manifest')
    def process_manifest(self, request, pk=None):
        """Standardize selected/full manifest rows into persisted ManifestRow records."""
        order = self.get_object()
        rows = request.data.get('rows')
        selected_row_numbers = request.data.get('selected_row_numbers') or []
        mapping_payload = (
            request.data.get('standard_mappings')
            or request.data.get('column_mappings')
            or []
        )
        template_id = request.data.get('template_id')
        save_template = bool(request.data.get('save_template', False))
        template_name = str(request.data.get('template_name') or '').strip()
        header_sig = None
        row_count_in_file = None
        rows_selected = None
        used_template = None
        normalized_mappings = normalize_standard_mappings(mapping_payload)

        if rows:
            normalized_rows = rows
        else:
            prepared = build_normalized_manifest_rows(
                order=order,
                selected_row_numbers=selected_row_numbers,
                template_id=template_id,
                mappings_payload=mapping_payload,
            )
            if prepared.get('error'):
                return Response(
                    {'detail': prepared['error']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            header_sig = prepared['header_signature']
            used_template = prepared['used_template']
            normalized_mappings = prepared['mappings']
            row_count_in_file = prepared['row_count_in_file']
            rows_selected = prepared['rows_selected']
            normalized_rows = prepared['normalized_rows']

            if save_template and normalized_mappings:
                default_template_name = (
                    f'{order.vendor.code} Standard Manifest {timezone.now().date().isoformat()}'
                )
                if used_template:
                    used_template.name = template_name or used_template.name
                    used_template.header_signature = header_sig
                    used_template.column_mappings = normalized_mappings
                    used_template.save(
                        update_fields=['name', 'header_signature', 'column_mappings'],
                    )
                else:
                    used_template = CSVTemplate.objects.create(
                        vendor=order.vendor,
                        name=template_name or default_template_name,
                        header_signature=header_sig,
                        column_mappings=normalized_mappings,
                        is_default=False,
                    )

        if not normalized_rows:
            return Response(
                {'detail': 'No rows selected for processing.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Delete existing manifest rows for this PO
        ManifestRow.objects.filter(purchase_order=order).delete()

        created = []
        for row_data in normalized_rows:
            proposed_price = parse_decimal(row_data.get('proposed_price'))
            final_price = parse_decimal(row_data.get('final_price'))
            pricing_stage = str(row_data.get('pricing_stage') or 'unpriced')
            if pricing_stage not in dict(ManifestRow.PRICING_STAGE_CHOICES):
                pricing_stage = 'unpriced'
            if final_price is not None:
                pricing_stage = 'final'
            elif proposed_price is not None and pricing_stage == 'unpriced':
                pricing_stage = 'draft'

            manifest_row = ManifestRow.objects.create(
                purchase_order=order,
                row_number=row_data.get('row_number', 0),
                quantity=row_data.get('quantity', 1),
                description=row_data.get('description', ''),
                title=row_data.get('title', ''),
                brand=row_data.get('brand', ''),
                model=row_data.get('model', ''),
                category=row_data.get('category', ''),
                condition=row_data.get('condition', ''),
                retail_value=row_data.get('retail_value'),
                proposed_price=proposed_price,
                final_price=final_price,
                pricing_stage=pricing_stage,
                pricing_notes=str(row_data.get('pricing_notes') or ''),
                upc=row_data.get('upc', ''),
                vendor_item_number=row_data.get('vendor_item_number', ''),
                matched_product=None,
                match_status='pending',
                notes=row_data.get('notes', ''),
            )
            created.append(manifest_row)

        if used_template and order.manifest_preview:
            preview = dict(order.manifest_preview)
            preview['template_id'] = used_template.id
            preview['template_name'] = used_template.name
            preview['template_mappings'] = normalized_mappings
            order.manifest_preview = preview
            order.save(update_fields=['manifest_preview', 'updated_at'])

        response_data = {
            'rows_created': len(created),
            'order_status': order.status,
            'standard_columns': MANIFEST_STANDARD_COLUMNS,
            'mappings_used': normalized_mappings,
        }
        if row_count_in_file is not None:
            response_data['row_count_in_file'] = row_count_in_file
        if rows_selected is not None:
            response_data['rows_selected'] = rows_selected
        if header_sig:
            response_data['header_signature'] = header_sig
        if used_template:
            response_data['template_id'] = used_template.id
            response_data['template_name'] = used_template.name
        return Response(response_data)

    @action(detail=True, methods=['post'], url_path='preview-standardize')
    def preview_standardize(self, request, pk=None):
        """Preview standardized manifest output without writing ManifestRows."""
        order = self.get_object()
        rows = request.data.get('rows')
        selected_row_numbers = request.data.get('selected_row_numbers') or []
        template_id = request.data.get('template_id')
        mapping_payload = (
            request.data.get('standard_mappings')
            or request.data.get('column_mappings')
            or []
        )
        preview_limit = parse_int(request.data.get('preview_limit'), default=50)
        preview_limit = max(1, min(preview_limit, 250))
        search_term = str(request.data.get('search_term') or '').strip()

        if rows:
            normalized_rows = rows
            header_sig = None
            used_template = None
            row_count_in_file = len(rows)
            rows_selected = len(rows)
            mappings_used = normalize_standard_mappings(mapping_payload)
        else:
            prepared = build_normalized_manifest_rows(
                order=order,
                selected_row_numbers=selected_row_numbers,
                template_id=template_id,
                mappings_payload=mapping_payload,
            )
            if prepared.get('error'):
                return Response(
                    {'detail': prepared['error']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            normalized_rows = prepared['normalized_rows']
            header_sig = prepared['header_signature']
            used_template = prepared['used_template']
            row_count_in_file = prepared['row_count_in_file']
            rows_selected = prepared['rows_selected']
            mappings_used = prepared['mappings']

        if search_term:
            normalized_rows = [
                row for row in normalized_rows
                if normalized_row_matches_search(row, search_term)
            ]

        if not normalized_rows:
            return Response(
                {'detail': 'No rows selected for preview.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_data = {
            'row_count_in_file': row_count_in_file,
            'rows_selected': len(normalized_rows),
            'preview_count': min(preview_limit, len(normalized_rows)),
            'normalized_preview': normalized_rows[:preview_limit],
            'standard_columns': MANIFEST_STANDARD_COLUMNS,
            'available_functions': MANIFEST_FUNCTION_OPTIONS,
            'mappings_used': mappings_used,
            'search_term': search_term,
        }
        if header_sig:
            response_data['header_signature'] = header_sig
        if used_template:
            response_data['template_id'] = used_template.id
            response_data['template_name'] = used_template.name
        return Response(response_data)

    @action(detail=True, methods=['post'], url_path='suggest-formulas')
    def suggest_formulas(self, request, pk=None):
        """Ask Claude to suggest formula mappings for all standard fields."""
        from django.conf import settings as django_settings
        import anthropic as anthropic_lib
        import json as json_lib

        order = self.get_object()
        model_id = request.data.get('model', '')
        template_id = request.data.get('template_id')

        api_key = getattr(django_settings, 'ANTHROPIC_API_KEY', '')
        if not api_key:
            return Response(
                {'error': 'ANTHROPIC_API_KEY not configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        headers_list, raw_rows = parse_manifest_file(order)
        if not headers_list:
            return Response(
                {'error': 'No manifest file uploaded for this order.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sample_rows = raw_rows[:10]
        prior_templates = []
        if template_id:
            tpl = CSVTemplate.objects.filter(id=template_id, vendor=order.vendor).first()
            if tpl:
                prior_templates.append({'name': tpl.name, 'mappings': tpl.column_mappings})
        if not prior_templates:
            sig = header_signature(headers_list)
            for tpl in CSVTemplate.objects.filter(vendor=order.vendor, header_signature=sig)[:3]:
                prior_templates.append({'name': tpl.name, 'mappings': tpl.column_mappings})

        standard_fields_desc = []
        for col in MANIFEST_STANDARD_COLUMNS:
            standard_fields_desc.append(f"- {col['key']}: {col['label']} ({'required' if col['required'] else 'optional'})")

        system_prompt = (
            "You are an assistant for a thrift store that processes liquidation manifests. "
            "Given CSV column headers and sample rows, suggest formula expressions to map "
            "raw CSV columns into standardized fields.\n\n"
            "Formula syntax:\n"
            "- Column references: [COLUMN_NAME] (exact header name from the CSV)\n"
            "- Functions: UPPER(expr), LOWER(expr), TITLE(expr), TRIM(expr), "
            "REPLACE(expr, \"find\", \"replace\"), CONCAT(expr, ...), LEFT(expr, n), RIGHT(expr, n)\n"
            "- String concatenation: expr + \" \" + expr\n"
            "- String literals: \"quoted text\"\n\n"
            "Standard fields:\n" + "\n".join(standard_fields_desc) + "\n\n"
            "Return ONLY valid JSON with this structure:\n"
            '{"suggestions": [{"target": "field_key", "formula": "expression", "reasoning": "brief explanation"}]}\n'
            "Only include fields where you can identify a reasonable mapping. "
            "Use TRIM() liberally. If a column clearly maps to a field, a simple [Column] reference is fine."
        )

        user_message_parts = [f"CSV Headers: {json_lib.dumps(headers_list)}"]
        if sample_rows:
            user_message_parts.append(f"Sample rows (first {len(sample_rows)}):")
            for row in sample_rows:
                user_message_parts.append(json_lib.dumps(row['raw']))
        if prior_templates:
            user_message_parts.append(f"Prior templates for this vendor: {json_lib.dumps(prior_templates)}")

        try:
            client = anthropic_lib.Anthropic(api_key=api_key)
            if not model_id:
                model_id = 'claude-sonnet-4-6'

            response = client.messages.create(
                model=model_id,
                max_tokens=2048,
                system=system_prompt,
                messages=[{'role': 'user', 'content': '\n'.join(user_message_parts)}],
            )

            content_text = ''
            for block in response.content:
                if block.type == 'text':
                    content_text += block.text

            json_match = re.search(r'\{[\s\S]*\}', content_text)
            if not json_match:
                return Response(
                    {'error': 'AI returned non-JSON response.', 'raw': content_text},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            parsed = json_lib.loads(json_match.group())
            suggestions = parsed.get('suggestions', [])

            return Response({
                'suggestions': suggestions,
                'model_used': response.model,
            })

        except anthropic_lib.APIError as e:
            logger.error('Anthropic API error in suggest-formulas: %s', e)
            return Response(
                {'error': f'AI service error: {e}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except (json_lib.JSONDecodeError, KeyError) as e:
            return Response(
                {'error': f'Failed to parse AI response: {e}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=['post'], url_path='ai-cleanup-rows')
    def ai_cleanup_rows(self, request, pk=None):
        """AI-assisted row-level cleanup: process a single batch of rows."""
        import json as json_lib
        import time as _time

        try:
            import anthropic as anthropic_lib
        except ImportError:
            return Response(
                {'error': 'anthropic library is not installed.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        timing = {}
        t_total_start = _time.perf_counter()
        max_retries = 1

        try:
            from django.conf import settings as django_settings

            order = self.get_object()
            model_id = request.data.get('model', '') or 'claude-sonnet-4-6'
            batch_size = int(request.data.get('batch_size', 25))
            offset = int(request.data.get('offset', 0))
            api_key = getattr(django_settings, 'ANTHROPIC_API_KEY', '')
            if not api_key:
                return Response(
                    {'error': 'ANTHROPIC_API_KEY not configured.'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            t0 = _time.perf_counter()
            qs = ManifestRow.objects.filter(purchase_order=order).order_by('row_number')
            total_rows = qs.count()
            if total_rows == 0:
                return Response(
                    {'error': 'No manifest rows to process.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            batch = list(qs[offset:offset + batch_size])
            timing['db_fetch_ms'] = round((_time.perf_counter() - t0) * 1000, 1)

            if not batch:
                return Response({
                    'rows_processed': 0,
                    'total_rows': total_rows,
                    'offset': offset,
                    'suggestions': [],
                    'model_used': model_id,
                    'has_more': False,
                    'timing': timing,
                })

            t0 = _time.perf_counter()
            client = anthropic_lib.Anthropic(api_key=api_key)

            system_prompt = (
                "You are a product data specialist for a thrift store that processes liquidation manifests. "
                "For each row, review the description and any existing brand/model data. "
                "Suggest a clean, standardized Title, Brand, Model, and any relevant specifications.\n\n"
                "Guidelines:\n"
                "- Title should be concise and descriptive (e.g. 'Samsung 55\" 4K Smart TV')\n"
                "- Extract Brand from description if not already set\n"
                "- Extract Model number if identifiable\n"
                "- Specifications should be key-value pairs of notable product attributes\n"
                "- Search tags should be comma-separated keywords useful for search\n"
                "- Fix obvious typos and formatting issues\n"
                "- If the existing data looks correct, return it as-is\n\n"
                "Return ONLY valid JSON array:\n"
                '[{"row_id": N, "title": "Clean Title", "brand": "Brand", "model": "Model", '
                '"search_tags": "tag1, tag2", "specifications": {"key": "value"}, '
                '"reasoning": "brief explanation of changes"}]'
            )

            batch_data = []
            for r in batch:
                batch_data.append({
                    'row_id': r.id,
                    'description': r.description,
                    'title': r.title,
                    'brand': r.brand,
                    'model': r.model,
                    'category': r.category,
                    'condition': r.condition,
                    'upc': r.upc,
                    'retail_value': str(r.retail_value) if r.retail_value else '',
                })
            timing['prompt_build_ms'] = round((_time.perf_counter() - t0) * 1000, 1)

            calculated_max_tokens = max(4096, len(batch) * 250)

            t0 = _time.perf_counter()
            response = None
            for attempt in range(max_retries + 1):
                try:
                    response = client.messages.create(
                        model=model_id,
                        max_tokens=calculated_max_tokens,
                        system=system_prompt,
                        messages=[{'role': 'user', 'content': json_lib.dumps(batch_data)}],
                        timeout=90.0,
                    )
                    break
                except (anthropic_lib.APIConnectionError, anthropic_lib.RateLimitError) as e:
                    if attempt < max_retries:
                        logger.warning('AI cleanup retry %d after: %s', attempt + 1, e)
                        _time.sleep(2 ** attempt)
                    else:
                        raise
            timing['api_call_ms'] = round((_time.perf_counter() - t0) * 1000, 1)
            timing['retries'] = attempt

            stop_reason = getattr(response, 'stop_reason', None)

            t0 = _time.perf_counter()
            content_text = ''
            for block in response.content:
                if block.type == 'text':
                    content_text += block.text

            suggestions = []
            rows_to_update = []
            json_match = re.search(r'\[[\s\S]*\]', content_text)
            if not json_match and stop_reason == 'max_tokens':
                bracket_pos = content_text.find('[')
                if bracket_pos >= 0:
                    json_match = re.search(r'\[[\s\S]*\]', content_text[bracket_pos:] + ']')
                    if json_match:
                        logger.warning(
                            'AI cleanup response truncated (max_tokens=%d, batch=%d rows). '
                            'Recovered partial JSON.',
                            calculated_max_tokens, len(batch),
                        )

            if json_match:
                parsed = json_lib.loads(json_match.group())
                suggestions_by_id = {
                    s['row_id']: s for s in parsed if isinstance(s, dict)
                }

                for r in batch:
                    suggestion = suggestions_by_id.get(r.id, {})
                    if suggestion:
                        r.ai_suggested_title = (suggestion.get('title') or '')[:300]
                        r.ai_suggested_brand = (suggestion.get('brand') or '')[:200]
                        r.ai_suggested_model = (suggestion.get('model') or '')[:200]
                        r.ai_reasoning = suggestion.get('reasoning') or ''
                        if suggestion.get('search_tags'):
                            r.search_tags = suggestion['search_tags']
                        if isinstance(suggestion.get('specifications'), dict):
                            r.specifications = suggestion['specifications']
                        rows_to_update.append(r)
                        suggestions.append(suggestion)
            timing['response_parse_ms'] = round((_time.perf_counter() - t0) * 1000, 1)

            t0 = _time.perf_counter()
            if rows_to_update:
                ManifestRow.objects.bulk_update(rows_to_update, [
                    'ai_suggested_title', 'ai_suggested_brand',
                    'ai_suggested_model', 'ai_reasoning',
                    'search_tags', 'specifications',
                ])
            timing['db_save_ms'] = round((_time.perf_counter() - t0) * 1000, 1)
            timing['total_ms'] = round((_time.perf_counter() - t_total_start) * 1000, 1)

            next_offset = offset + batch_size
            return Response({
                'rows_processed': len(batch),
                'rows_saved': len(rows_to_update),
                'total_rows': total_rows,
                'offset': offset,
                'suggestions': suggestions,
                'model_used': model_id,
                'has_more': next_offset < total_rows,
                'timing': timing,
                'stop_reason': stop_reason,
            })

        except anthropic_lib.APIError as e:
            timing['total_ms'] = round((_time.perf_counter() - t_total_start) * 1000, 1)
            logger.error('AI cleanup API error: %s', e)
            return Response(
                {'error': f'AI service error: {e}', 'timing': timing},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except (json_lib.JSONDecodeError, KeyError) as e:
            timing['total_ms'] = round((_time.perf_counter() - t_total_start) * 1000, 1)
            logger.warning('Failed to parse AI cleanup response: %s', e)
            return Response(
                {'error': f'Failed to parse AI response: {e}', 'timing': timing},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as e:
            timing['total_ms'] = round((_time.perf_counter() - t_total_start) * 1000, 1)
            logger.exception('Unexpected error in ai_cleanup_rows')
            return Response(
                {'error': f'Unexpected error: {e}', 'timing': timing},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['get'], url_path='ai-cleanup-status')
    def ai_cleanup_status(self, request, pk=None):
        """Return progress of AI cleanup for this order's manifest rows."""
        order = self.get_object()
        qs = ManifestRow.objects.filter(purchase_order=order)
        total = qs.count()
        cleaned = qs.exclude(ai_reasoning='').count()
        return Response({
            'total_rows': total,
            'cleaned_rows': cleaned,
            'remaining_rows': total - cleaned,
        })

    @action(detail=True, methods=['post'], url_path='cancel-ai-cleanup')
    def cancel_ai_cleanup(self, request, pk=None):
        """Clear AI-generated fields AND cascade-clear product matching (matching depends on cleaned data)."""
        order = self.get_object()
        updated = ManifestRow.objects.filter(purchase_order=order).update(
            ai_suggested_title='',
            ai_suggested_brand='',
            ai_suggested_model='',
            ai_reasoning='',
            search_tags='',
            specifications={},
            # Cascade: clear Step 3 matching data since matching depends on cleaned titles/brands
            matched_product=None,
            match_status='pending',
            match_candidates=[],
            ai_match_decision='',
        )
        return Response({
            'rows_cleared': updated,
        })

    @action(detail=True, methods=['post'], url_path='clear-manifest-rows')
    def clear_manifest_rows(self, request, pk=None):
        """Delete all ManifestRow records for this order, resetting standardization.
        Blocked if Items already exist (queue was already built from these rows).
        """
        order = self.get_object()
        if order.items.exists():
            return Response(
                {'detail': 'Cannot clear manifest rows — items have already been created from this manifest. Undo the check-in queue first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deleted_count, _ = ManifestRow.objects.filter(purchase_order=order).delete()
        return Response({'rows_deleted': deleted_count})

    @action(detail=True, methods=['post'], url_path='undo-product-matching')
    def undo_product_matching(self, request, pk=None):
        """Clear product matching data from manifest rows (Undo Step 3). Pricing is preserved."""
        order = self.get_object()
        updated = ManifestRow.objects.filter(purchase_order=order).update(
            matched_product=None,
            match_status='pending',
            match_candidates=[],
            ai_match_decision='',
        )
        return Response({'rows_cleared': updated})

    @action(detail=True, methods=['post'], url_path='clear-pricing')
    def clear_pricing(self, request, pk=None):
        """Clear all pricing data from manifest rows (Undo Step 4)."""
        order = self.get_object()
        updated = ManifestRow.objects.filter(purchase_order=order).update(
            proposed_price=None,
            final_price=None,
            pricing_stage='unpriced',
            pricing_notes='',
        )
        return Response({'rows_cleared': updated})

    @action(detail=True, methods=['post'], url_path='update-manifest-pricing')
    def update_manifest_pricing(self, request, pk=None):
        """Update manifest-row pricing in bulk while order is pre-arrival/pre-check-in."""
        order = self.get_object()
        rows_qs = ManifestRow.objects.filter(purchase_order=order)
        rows_payload = request.data.get('rows')

        valid_pricing_stages = dict(ManifestRow.PRICING_STAGE_CHOICES)
        rows_updated = 0

        if isinstance(rows_payload, list):
            for row_payload in rows_payload:
                if not isinstance(row_payload, dict):
                    continue
                row_id = row_payload.get('id')
                if not row_id:
                    continue
                row = rows_qs.filter(id=row_id).first()
                if not row:
                    continue

                update_fields = []
                if 'proposed_price' in row_payload:
                    row.proposed_price = parse_decimal(row_payload.get('proposed_price'))
                    update_fields.append('proposed_price')
                if 'final_price' in row_payload:
                    row.final_price = parse_decimal(row_payload.get('final_price'))
                    update_fields.append('final_price')
                if 'pricing_notes' in row_payload:
                    row.pricing_notes = str(row_payload.get('pricing_notes') or '')
                    update_fields.append('pricing_notes')
                if 'pricing_stage' in row_payload:
                    stage = str(row_payload.get('pricing_stage') or '').strip().lower()
                    if stage in valid_pricing_stages:
                        row.pricing_stage = stage
                        update_fields.append('pricing_stage')

                if 'pricing_stage' not in row_payload:
                    if row.final_price is not None:
                        row.pricing_stage = 'final'
                        update_fields.append('pricing_stage')
                    elif row.proposed_price is not None and row.pricing_stage == 'unpriced':
                        row.pricing_stage = 'draft'
                        update_fields.append('pricing_stage')

                if update_fields:
                    deduped_fields = list(dict.fromkeys(update_fields))
                    row.save(update_fields=deduped_fields)
                    rows_updated += 1
        else:
            target_qs = rows_qs
            row_ids = parse_id_list(request.data.get('row_ids') or [])
            if row_ids:
                target_qs = target_qs.filter(id__in=row_ids)

            updates = {}
            has_change = False
            if 'proposed_price' in request.data:
                updates['proposed_price'] = parse_decimal(request.data.get('proposed_price'))
                has_change = True
            if 'final_price' in request.data:
                updates['final_price'] = parse_decimal(request.data.get('final_price'))
                has_change = True
            if 'pricing_notes' in request.data:
                updates['pricing_notes'] = str(request.data.get('pricing_notes') or '')
                has_change = True
            if 'pricing_stage' in request.data:
                stage = str(request.data.get('pricing_stage') or '').strip().lower()
                if stage in valid_pricing_stages:
                    updates['pricing_stage'] = stage
                    has_change = True

            if 'pricing_stage' not in updates:
                if updates.get('final_price') is not None:
                    updates['pricing_stage'] = 'final'
                    has_change = True
                elif updates.get('proposed_price') is not None:
                    updates['pricing_stage'] = 'draft'
                    has_change = True

            if not has_change:
                return Response(
                    {'detail': 'No pricing fields were provided.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            rows_updated = target_qs.update(**updates)

        return Response({
            'rows_updated': rows_updated,
            'order_id': order.id,
        })

    @action(detail=True, methods=['get'], url_path='manifest-rows')
    def manifest_rows(self, request, pk=None):
        """Return parsed rows from uploaded manifest for preprocessing and row selection."""
        order = self.get_object()
        headers, rows = parse_manifest_file(order)
        if not headers:
            return Response(
                {'detail': 'No manifest file uploaded for this order.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            limit = int(request.query_params.get('limit', 1000))
        except (TypeError, ValueError):
            limit = 1000
        limit = max(1, min(limit, 5000))
        search_term = str(request.query_params.get('search') or '').strip()

        filtered_rows = rows
        if search_term:
            filtered_rows = [
                row for row in rows
                if row_matches_search(row.get('raw', {}), search_term)
            ]

        sig = header_signature(headers)
        template = CSVTemplate.objects.filter(
            vendor=order.vendor,
            header_signature=sig,
        ).order_by('-is_default', '-id').first()
        template_mappings = normalize_standard_mappings(
            template.column_mappings if template and template.column_mappings else None,
        )
        if not template_mappings:
            template_mappings = default_column_mappings(headers)

        return Response({
            'headers': headers,
            'signature': sig,
            'row_count': len(rows),
            'row_count_filtered': len(filtered_rows),
            'search_term': search_term,
            'rows': filtered_rows[:limit],
            'template_id': template.id if template else None,
            'template_name': template.name if template else None,
            'template_mappings': template_mappings,
            'standard_columns': MANIFEST_STANDARD_COLUMNS,
            'available_functions': MANIFEST_FUNCTION_OPTIONS,
        })

    @action(detail=True, methods=['post'], url_path='match-products')
    def match_products(self, request, pk=None):
        """Match manifest rows to products: fuzzy scoring + optional AI batch decisions."""
        from django.conf import settings as django_settings
        import json as json_lib

        order = self.get_object()
        use_ai = request.data.get('use_ai', True)
        ai_model = request.data.get('model', '')
        rows = ManifestRow.objects.filter(
            purchase_order=order,
        ).select_related('matched_product')
        if not rows.exists():
            return Response(
                {'detail': 'No manifest rows to match.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for row in rows:
            candidates = []
            best_product = None
            best_score = 0.0

            if row.upc:
                product = Product.objects.filter(upc=row.upc).first()
                if product:
                    candidates.append({
                        'product_id': product.id,
                        'product_title': product.title,
                        'score': 1.0,
                        'match_type': 'upc',
                    })
                    best_product = product
                    best_score = 1.0

            lookup_key = row.vendor_item_number or row.upc
            if not best_product and lookup_key:
                ref = VendorProductRef.objects.filter(
                    vendor=order.vendor,
                    vendor_item_number=lookup_key,
                ).select_related('product').first()
                if ref:
                    candidates.append({
                        'product_id': ref.product.id,
                        'product_title': ref.product.title,
                        'score': 0.95,
                        'match_type': 'vendor_ref',
                    })
                    best_product = ref.product
                    best_score = 0.95
                    ref.times_seen += 1
                    if row.retail_value is not None:
                        ref.last_unit_cost = row.retail_value
                    ref.save(update_fields=['times_seen', 'last_unit_cost', 'updated_at'])

            if best_score < 0.95:
                desc = row.ai_suggested_title or row.title or row.description or ''
                match_brand = row.ai_suggested_brand or row.brand or ''
                match_model = row.ai_suggested_model or row.model or ''
                if desc:
                    text_query = Product.objects.filter(
                        Q(title__icontains=desc[:60]) |
                        (Q(brand__icontains=match_brand) if match_brand else Q())
                    )
                    for prod in text_query[:3]:
                        score = 0.0
                        if match_brand and match_brand.lower() in (prod.brand or '').lower():
                            score += 0.3
                        if desc[:30].lower() in (prod.title or '').lower():
                            score += 0.4
                        if match_model and match_model.lower() in (prod.model or '').lower():
                            score += 0.2
                        score = min(score, 0.9)
                        candidates.append({
                            'product_id': prod.id,
                            'product_title': prod.title,
                            'score': round(score, 2),
                            'match_type': 'text',
                        })
                        if score > best_score:
                            best_product = prod
                            best_score = score

            candidates.sort(key=lambda c: c['score'], reverse=True)
            row.match_candidates = candidates[:3]

            if best_score >= 0.95:
                row.matched_product = best_product
                row.match_status = 'matched'
                row.ai_match_decision = 'confirmed'
                row.ai_reasoning = 'High-confidence exact match (UPC or vendor ref).'
            elif candidates:
                row.ai_match_decision = 'pending_review'
            else:
                row.ai_match_decision = 'new_product'

            row.save(update_fields=[
                'match_candidates', 'matched_product', 'match_status',
                'ai_match_decision', 'ai_reasoning',
            ])

        api_key = getattr(django_settings, 'ANTHROPIC_API_KEY', '')
        if use_ai and api_key:
            import anthropic as anthropic_lib
            try:
                client = anthropic_lib.Anthropic(api_key=api_key)
                model_id = ai_model or 'claude-sonnet-4-6'

                pending_rows = ManifestRow.objects.filter(
                    purchase_order=order,
                    ai_match_decision__in=['pending_review', 'new_product'],
                )

                batch_size = 25
                all_rows_list = list(pending_rows)
                for i in range(0, len(all_rows_list), batch_size):
                    batch = all_rows_list[i:i + batch_size]
                    batch_data = []
                    for r in batch:
                        entry = {
                            'row_id': r.id,
                            'description': r.description,
                            'title': r.title,
                            'brand': r.brand,
                            'model': r.model,
                            'category': r.category,
                            'candidates': r.match_candidates or [],
                        }
                        batch_data.append(entry)

                    system_prompt = (
                        "You are a product matching assistant for a thrift store. "
                        "For each row, determine if any candidate product matches, or suggest new product data.\n\n"
                        "Return ONLY valid JSON array:\n"
                        '[{"row_id": N, "decision": "confirmed|rejected|uncertain|new_product", '
                        '"product_id": N_or_null, "confidence": 0.0-1.0, "reasoning": "brief", '
                        '"suggested_title": "", "suggested_brand": "", "suggested_model": ""}]'
                    )

                    response = client.messages.create(
                        model=model_id,
                        max_tokens=4096,
                        system=system_prompt,
                        messages=[{
                            'role': 'user',
                            'content': json_lib.dumps(batch_data),
                        }],
                    )

                    content_text = ''
                    for block in response.content:
                        if block.type == 'text':
                            content_text += block.text

                    json_match = re.search(r'\[[\s\S]*\]', content_text)
                    if json_match:
                        try:
                            decisions = json_lib.loads(json_match.group())
                            decisions_by_id = {d['row_id']: d for d in decisions if isinstance(d, dict)}

                            for r in batch:
                                decision_data = decisions_by_id.get(r.id, {})
                                ai_decision = decision_data.get('decision', '')
                                if ai_decision in ('confirmed', 'rejected', 'uncertain', 'new_product'):
                                    r.ai_match_decision = ai_decision
                                r.ai_reasoning = decision_data.get('reasoning', '')
                                r.ai_suggested_title = decision_data.get('suggested_title', '')
                                r.ai_suggested_brand = decision_data.get('suggested_brand', '')
                                r.ai_suggested_model = decision_data.get('suggested_model', '')

                                if ai_decision == 'confirmed' and decision_data.get('product_id'):
                                    try:
                                        product = Product.objects.get(id=decision_data['product_id'])
                                        r.matched_product = product
                                        r.match_status = 'matched'
                                    except Product.DoesNotExist:
                                        pass

                                r.save(update_fields=[
                                    'ai_match_decision', 'ai_reasoning',
                                    'ai_suggested_title', 'ai_suggested_brand', 'ai_suggested_model',
                                    'matched_product', 'match_status',
                                ])
                        except (json_lib.JSONDecodeError, KeyError):
                            logger.warning('Failed to parse AI match decisions for batch')

            except Exception:
                logger.exception('AI matching failed, fuzzy results preserved')

        final_rows = ManifestRow.objects.filter(purchase_order=order)
        return Response({
            'total_rows': final_rows.count(),
            'matched': final_rows.filter(match_status='matched').count(),
            'pending_review': final_rows.filter(ai_match_decision='pending_review').count(),
            'confirmed': final_rows.filter(ai_match_decision='confirmed').count(),
            'uncertain': final_rows.filter(ai_match_decision='uncertain').count(),
            'new_products': final_rows.filter(ai_match_decision='new_product').count(),
        })

    @action(detail=True, methods=['get'], url_path='match-results')
    def match_results(self, request, pk=None):
        """Return all manifest rows with match candidates, AI decisions, and scores."""
        order = self.get_object()
        rows = ManifestRow.objects.filter(purchase_order=order).select_related('matched_product')
        serializer = ManifestRowSerializer(rows, many=True)
        return Response({
            'rows': serializer.data,
            'summary': {
                'total': rows.count(),
                'matched': rows.filter(match_status='matched').count(),
                'pending_review': rows.filter(ai_match_decision='pending_review').count(),
                'confirmed': rows.filter(ai_match_decision='confirmed').count(),
                'uncertain': rows.filter(ai_match_decision='uncertain').count(),
                'new_product': rows.filter(ai_match_decision='new_product').count(),
            },
        })

    @action(detail=True, methods=['post'], url_path='review-matches')
    def review_matches(self, request, pk=None):
        """Accept user review decisions for product matches."""
        order = self.get_object()
        decisions = request.data.get('decisions', [])
        if not isinstance(decisions, list):
            return Response({'detail': 'decisions must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        accepted = 0
        rejected = 0
        created_products = 0
        matched_product_ids = set()

        for decision in decisions:
            row_id = decision.get('row_id')
            action_type = decision.get('decision')
            if not row_id or action_type not in ('accept', 'reject', 'modify'):
                continue

            row = ManifestRow.objects.filter(id=row_id, purchase_order=order).first()
            if not row:
                continue

            if action_type == 'accept':
                product_id = decision.get('product_id') or (
                    row.matched_product_id if row.matched_product_id else
                    (row.match_candidates[0]['product_id'] if row.match_candidates else None)
                )
                if product_id:
                    try:
                        product = Product.objects.get(id=product_id)
                        if decision.get('update_product'):
                            product.title = row.ai_suggested_title or row.title or product.title
                            product.brand = row.ai_suggested_brand or row.brand or product.brand
                            product.model = row.ai_suggested_model or row.model or product.model
                            if row.category:
                                product.category = row.category
                            if row.upc:
                                product.upc = row.upc
                            if row.specifications:
                                product.specifications = row.specifications
                            product.save()
                        row.matched_product = product
                        row.match_status = 'matched'
                        row.ai_match_decision = 'confirmed'
                        matched_product_ids.add(product.id)
                        accepted += 1
                    except Product.DoesNotExist:
                        continue
                else:
                    product = Product.objects.create(
                        title=row.ai_suggested_title or row.title or row.description[:300] or 'Untitled',
                        brand=row.ai_suggested_brand or row.brand or '',
                        model=row.ai_suggested_model or row.model or '',
                        category=row.category or '',
                        upc=row.upc or '',
                        default_price=row.retail_value,
                    )
                    row.matched_product = product
                    row.match_status = 'new'
                    row.ai_match_decision = 'new_product'
                    matched_product_ids.add(product.id)
                    created_products += 1
                    accepted += 1

            elif action_type == 'reject':
                product = Product.objects.create(
                    title=row.ai_suggested_title or row.title or row.description[:300] or 'Untitled',
                    brand=row.ai_suggested_brand or row.brand or '',
                    model=row.ai_suggested_model or row.model or '',
                    category=row.category or '',
                    upc=row.upc or '',
                    default_price=row.retail_value,
                )
                row.matched_product = product
                row.match_status = 'new'
                row.ai_match_decision = 'new_product'
                matched_product_ids.add(product.id)
                created_products += 1
                rejected += 1

            elif action_type == 'modify':
                mods = decision.get('modifications', {})
                product_id = decision.get('product_id')
                if product_id:
                    try:
                        product = Product.objects.get(id=product_id)
                        row.matched_product = product
                        row.match_status = 'matched'
                        row.ai_match_decision = 'confirmed'
                        matched_product_ids.add(product.id)
                        accepted += 1
                    except Product.DoesNotExist:
                        continue
                else:
                    product = Product.objects.create(
                        title=mods.get('title', row.title or row.description[:300] or 'Untitled'),
                        brand=mods.get('brand', row.brand or ''),
                        model=mods.get('model', row.model or ''),
                        category=mods.get('category', row.category or ''),
                        upc=row.upc or '',
                        default_price=row.retail_value,
                    )
                    row.matched_product = product
                    row.match_status = 'new'
                    row.ai_match_decision = 'new_product'
                    matched_product_ids.add(product.id)
                    created_products += 1
                    accepted += 1

            row.save(update_fields=['matched_product', 'match_status', 'ai_match_decision'])

            lookup_key = row.vendor_item_number or row.upc
            if lookup_key and row.matched_product:
                VendorProductRef.objects.get_or_create(
                    vendor=order.vendor,
                    vendor_item_number=lookup_key,
                    defaults={
                        'product': row.matched_product,
                        'vendor_description': (row.description or '')[:500],
                        'last_unit_cost': row.retail_value,
                        'times_seen': 1,
                    },
                )

        for product_id in matched_product_ids:
            qty = ManifestRow.objects.filter(
                purchase_order=order, matched_product_id=product_id,
            ).aggregate(total=Sum('quantity'))['total'] or 0
            Product.objects.filter(id=product_id).update(
                times_ordered=F('times_ordered') + 1,
                total_units_received=F('total_units_received') + qty,
            )

        return Response({
            'accepted': accepted,
            'rejected': rejected,
            'new_products': created_products,
        })

    @action(detail=True, methods=['post'], url_path='suggest-finalization')
    def suggest_finalization(self, request, pk=None):
        """Ask Claude to suggest formatting and spec fields for manifest rows."""
        from django.conf import settings as django_settings
        import anthropic as anthropic_lib
        import json as json_lib

        order = self.get_object()
        model_id = request.data.get('model', '')
        api_key = getattr(django_settings, 'ANTHROPIC_API_KEY', '')
        if not api_key:
            return Response(
                {'error': 'ANTHROPIC_API_KEY not configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        rows = ManifestRow.objects.filter(purchase_order=order)[:50]
        rows_data = []
        for r in rows:
            rows_data.append({
                'row_id': r.id,
                'title': r.title or r.ai_suggested_title or '',
                'description': r.description,
                'brand': r.brand or r.ai_suggested_brand or '',
                'model': r.model or r.ai_suggested_model or '',
                'category': r.category,
                'quantity': r.quantity,
                'retail_value': str(r.retail_value) if r.retail_value else '',
            })

        system_prompt = (
            "You are a product data specialist for a thrift store. "
            "Clean up and standardize product data for each row. "
            "Suggest: clean title formatting, any relevant specification fields.\n\n"
            "Return ONLY valid JSON array:\n"
            '[{"row_id": N, "title": "Clean Title", "brand": "Brand", "model": "Model", '
            '"search_tags": "tag1, tag2", "specifications": {"key": "value"}, '
            '"batch_flag": true/false, "reasoning": "brief"}]'
        )

        try:
            client = anthropic_lib.Anthropic(api_key=api_key)
            if not model_id:
                model_id = 'claude-sonnet-4-6'

            response = client.messages.create(
                model=model_id,
                max_tokens=4096,
                system=system_prompt,
                messages=[{'role': 'user', 'content': json_lib.dumps(rows_data)}],
            )

            content_text = ''
            for block in response.content:
                if block.type == 'text':
                    content_text += block.text

            json_match = re.search(r'\[[\s\S]*\]', content_text)
            if not json_match:
                logger.warning('AI finalization: no JSON array in response. Content length=%s', len(content_text))
                return Response(
                    {'error': 'AI returned non-JSON response.'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            try:
                suggestions = json_lib.loads(json_match.group())
            except json_lib.JSONDecodeError as parse_err:
                logger.warning('AI finalization: JSON parse failed: %s. Snippet: %s', parse_err, content_text[:500])
                return Response(
                    {'error': f'AI returned invalid JSON: {parse_err}'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            return Response({
                'suggestions': suggestions,
                'model_used': response.model,
            })

        except Exception as e:
            logger.error('AI finalization suggestion failed: %s', e)
            return Response(
                {'error': f'AI service error: {e}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=['post'], url_path='finalize-rows')
    def finalize_rows(self, request, pk=None):
        """Bulk update finalized fields on manifest rows."""
        order = self.get_object()
        rows_payload = request.data.get('rows', [])
        if not isinstance(rows_payload, list):
            return Response({'detail': 'rows must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        rows_qs = ManifestRow.objects.filter(purchase_order=order)
        updated = 0

        for row_data in rows_payload:
            if not isinstance(row_data, dict):
                continue
            row_id = row_data.get('id')
            if not row_id:
                continue
            row = rows_qs.filter(id=row_id).first()
            if not row:
                continue

            update_fields = []
            for field in ('title', 'brand', 'model', 'category', 'condition',
                          'search_tags', 'notes'):
                if field in row_data:
                    setattr(row, field, str(row_data[field] or ''))
                    update_fields.append(field)

            if 'batch_flag' in row_data:
                row.batch_flag = bool(row_data['batch_flag'])
                update_fields.append('batch_flag')

            if 'specifications' in row_data and isinstance(row_data['specifications'], dict):
                row.specifications = row_data['specifications']
                update_fields.append('specifications')

            if 'final_price' in row_data:
                row.final_price = parse_decimal(row_data.get('final_price'))
                update_fields.append('final_price')

            if 'proposed_price' in row_data:
                row.proposed_price = parse_decimal(row_data.get('proposed_price'))
                update_fields.append('proposed_price')

            if update_fields:
                row.pricing_stage = 'final'
                update_fields.append('pricing_stage')
                row.save(update_fields=update_fields)
                updated += 1

        return Response({'rows_updated': updated, 'order_id': order.id})

    @action(detail=True, methods=['post'], url_path='create-items')
    def create_items(self, request, pk=None):
        """Build check-in queue: create items from standardized manifest rows."""
        order = self.get_object()
        if order.status not in ['delivered', 'processing', 'complete']:
            return Response(
                {
                    'detail': (
                        'Items can only be created after delivery. '
                        'You can standardize and price manifest rows before arrival.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if order.items.exists():
            return Response(
                {'detail': 'Items already exist for this order.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows = ManifestRow.objects.filter(
            purchase_order=order,
        ).select_related('matched_product')
        if not rows.exists():
            return Response(
                {'detail': 'No manifest rows to process.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items_created, batch_groups_created = _build_check_in_queue_from_manifest(
            order, request.user,
        )
        if items_created is None:
            return Response(
                {'detail': 'Could not build check-in queue.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        batch = ProcessingBatch.objects.filter(
            purchase_order=order,
        ).order_by('-started_at').first()
        return Response({
            'batch_id': batch.id if batch else None,
            'items_created': items_created,
            'batch_groups_created': batch_groups_created,
        })

    @action(detail=True, methods=['post'], url_path='check-in-items')
    def check_in_items(self, request, pk=None):
        """Bulk check-in selected order items and mark them shelf-ready."""
        order = self.get_object()
        item_ids = parse_id_list(request.data.get('item_ids') or [])
        processing_tier = request.data.get('processing_tier')
        batch_group_id = request.data.get('batch_group_id')
        selected_statuses = request.data.get('statuses') or []

        items_qs = order.items.exclude(status__in=['sold', 'scrapped', 'lost'])
        if item_ids:
            items_qs = items_qs.filter(id__in=item_ids)
        if processing_tier in ['individual', 'batch']:
            items_qs = items_qs.filter(processing_tier=processing_tier)
        if batch_group_id:
            try:
                items_qs = items_qs.filter(batch_group_id=int(batch_group_id))
            except (TypeError, ValueError):
                pass
        if selected_statuses:
            items_qs = items_qs.filter(status__in=selected_statuses)

        items = list(items_qs.select_related('batch_group'))
        if not items:
            return Response(
                {'detail': 'No items found for check-in.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shared_updates = {}
        if 'price' in request.data:
            parsed_price = parse_decimal(request.data.get('price'))
            if parsed_price is not None:
                shared_updates['price'] = parsed_price
        if 'cost' in request.data:
            shared_updates['cost'] = parse_decimal(request.data.get('cost'))
        for field in ['title', 'brand', 'category', 'condition', 'location', 'notes']:
            if field in request.data:
                value = request.data.get(field)
                if value is not None:
                    shared_updates[field] = value

        now = timezone.now()
        histories = []
        checked_in = 0

        for item in items:
            changed = apply_item_updates(item, shared_updates)
            old_status = item.status
            item.status = 'on_shelf'
            item.listed_at = now
            item.checked_in_at = now
            item.checked_in_by = request.user
            item.save()
            checked_in += 1

            if old_status != 'on_shelf':
                histories.append(
                    ItemHistory(
                        item=item,
                        event_type='status_change',
                        old_value=old_status,
                        new_value='on_shelf',
                        note='Checked in and marked shelf-ready',
                        created_by=request.user,
                    ),
                )

            for field, old_value, new_value in changed:
                histories.append(
                    ItemHistory(
                        item=item,
                        event_type=history_event_type_for_field(field),
                        old_value='' if old_value is None else str(old_value),
                        new_value='' if new_value is None else str(new_value),
                        note=f'Bulk check-in updated {field}',
                        created_by=request.user,
                    ),
                )

        if histories:
            ItemHistory.objects.bulk_create(histories, batch_size=1000)

        if order.status in ['delivered', 'ordered', 'paid', 'shipped']:
            order.status = 'processing'
            order.save(update_fields=['status', 'updated_at'])

        return Response({
            'checked_in': checked_in,
            'order_status': order.status,
        })

    @action(detail=True, methods=['post'], url_path='mark-complete')
    def mark_complete(self, request, pk=None):
        """Mark a purchase order complete when no intake/processing items remain."""
        order = self.get_object()
        pending = order.items.filter(status__in=['intake', 'processing']).count()
        if pending > 0:
            return Response(
                {'detail': f'{pending} item(s) still pending processing.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.status = 'complete'
        order.save(update_fields=['status', 'updated_at'])
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=['get'], url_path='delete-preview')
    def delete_preview(self, request, pk=None):
        """Preview reverse-sequence deletion counts before purging an order."""
        order = self.get_object()
        return Response(build_order_delete_preview(order, include_items=True))

    @action(detail=True, methods=['post'], url_path='purge-delete')
    def purge_delete(self, request, pk=None):
        """
        Purge all order-owned artifacts in reverse sequence, then delete the order.

        Requires confirm_order_number to guard accidental destructive deletion.
        """
        order = self.get_object()
        confirmation = str(request.data.get('confirm_order_number') or '').strip()
        if not confirmation:
            return Response(
                {'detail': 'confirm_order_number is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if confirmation != order.order_number:
            return Response(
                {'detail': 'Confirmation value does not match this order number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        preview = build_order_delete_preview(order, include_items=False)
        deleted = {
            'item_history': 0,
            'item_scans': 0,
            'items': 0,
            'batch_groups': 0,
            'processing_batches': 0,
            'manifest_rows': 0,
            'manifest_file': 0,
            'order': 0,
        }

        manifest_file = order.manifest
        manifest_key = manifest_file.key if manifest_file else ''
        manifest_file_id = manifest_file.id if manifest_file else None
        manifest_file_shared = False
        if manifest_file_id:
            manifest_file_shared = PurchaseOrder.objects.filter(
                manifest_id=manifest_file_id,
            ).exclude(id=order.id).exists()

        order_id = order.id
        order_number = order.order_number

        with transaction.atomic():
            item_history_qs = ItemHistory.objects.filter(item__purchase_order=order)
            deleted['item_history'] = item_history_qs.count()
            if deleted['item_history']:
                item_history_qs.delete()

            item_scan_qs = ItemScanHistory.objects.filter(item__purchase_order=order)
            deleted['item_scans'] = item_scan_qs.count()
            if deleted['item_scans']:
                item_scan_qs.delete()

            items_qs = Item.objects.filter(purchase_order=order)
            deleted['items'] = items_qs.count()
            if deleted['items']:
                items_qs.delete()

            batch_qs = BatchGroup.objects.filter(purchase_order=order)
            deleted['batch_groups'] = batch_qs.count()
            if deleted['batch_groups']:
                batch_qs.delete()

            processing_batch_qs = ProcessingBatch.objects.filter(purchase_order=order)
            deleted['processing_batches'] = processing_batch_qs.count()
            if deleted['processing_batches']:
                processing_batch_qs.delete()

            manifest_rows_qs = ManifestRow.objects.filter(purchase_order=order)
            deleted['manifest_rows'] = manifest_rows_qs.count()
            if deleted['manifest_rows']:
                manifest_rows_qs.delete()

            if manifest_file_id and not manifest_file_shared:
                deleted['manifest_file'] = 1
                S3File.objects.filter(id=manifest_file_id).delete()

            order.delete()
            deleted['order'] = 1

        if deleted['manifest_file'] and manifest_key:
            try:
                default_storage.delete(manifest_key)
            except Exception:
                # Storage cleanup failures should not rollback DB purge.
                pass

        return Response({
            'order_id': order_id,
            'order_number': order_number,
            'deleted': deleted,
            'steps': preview.get('steps', []),
            'manifest_file_shared': manifest_file_shared,
        })


class CSVTemplateViewSet(viewsets.ModelViewSet):
    queryset = CSVTemplate.objects.select_related('vendor').all()
    serializer_class = CSVTemplateSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['vendor', 'header_signature', 'is_default']


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related('category_ref').all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['product_number', 'title', 'brand', 'model', 'category', 'upc']
    ordering_fields = ['title', 'created_at']


class BatchGroupViewSet(viewsets.ModelViewSet):
    serializer_class = BatchGroupSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'purchase_order', 'product']
    search_fields = ['batch_number', 'product__title', 'purchase_order__order_number']
    ordering_fields = ['created_at', 'processed_at', 'batch_number']
    ordering = ['-created_at']

    def get_queryset(self):
        return BatchGroup.objects.select_related(
            'product', 'purchase_order', 'manifest_row', 'processed_by',
        ).annotate(
            items_count=Count('items'),
            intake_items_count=Count('items', filter=Q(items__status='intake')),
        )

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Apply shared processing values to all batch items."""
        batch = self.get_object()
        unit_price = request.data.get('unit_price')
        unit_cost = request.data.get('unit_cost')
        condition = request.data.get('condition')
        location = request.data.get('location')

        update_fields = []
        if unit_price is not None:
            batch.unit_price = unit_price
            update_fields.append('unit_price')
        if unit_cost is not None:
            batch.unit_cost = unit_cost
            update_fields.append('unit_cost')
        if condition:
            batch.condition = condition
            update_fields.append('condition')
        if location is not None:
            batch.location = location
            update_fields.append('location')

        batch.status = 'in_progress'
        batch.processed_by = request.user
        update_fields.extend(['status', 'processed_by', 'updated_at'])
        batch.save(update_fields=update_fields)

        item_ids = list(
            batch.items.exclude(status__in=['sold', 'scrapped', 'lost']).values_list('id', flat=True),
        )
        updated_count = batch.apply_to_items()
        if item_ids:
            ItemHistory.objects.bulk_create(
                [
                    ItemHistory(
                        item_id=item_id,
                        event_type='batch_processed',
                        note=f'Processed via {batch.batch_number}',
                        created_by=request.user,
                    )
                    for item_id in item_ids
                ],
                batch_size=1000,
            )

        serializer = self.get_serializer(batch)
        data = serializer.data
        data['updated_items'] = updated_count
        return Response(data)

    @action(detail=True, methods=['post'], url_path='check-in')
    def check_in(self, request, pk=None):
        """Check in all pending items in this batch and mark shelf-ready."""
        batch = self.get_object()
        unit_price = request.data.get('unit_price')
        unit_cost = request.data.get('unit_cost')
        condition = request.data.get('condition')
        location = request.data.get('location')

        update_fields = []
        if unit_price is not None:
            batch.unit_price = parse_decimal(unit_price)
            update_fields.append('unit_price')
        if unit_cost is not None:
            batch.unit_cost = parse_decimal(unit_cost)
            update_fields.append('unit_cost')
        if condition:
            batch.condition = condition
            update_fields.append('condition')
        if location is not None:
            batch.location = location
            update_fields.append('location')

        batch.status = 'in_progress'
        batch.processed_by = request.user
        update_fields.extend(['status', 'processed_by', 'updated_at'])
        batch.save(update_fields=update_fields)

        pending_items = batch.items.exclude(status__in=['sold', 'scrapped', 'lost'])
        item_ids = list(pending_items.values_list('id', flat=True))
        checked_in_count = batch.apply_to_items()
        now = timezone.now()

        if item_ids:
            Item.objects.filter(id__in=item_ids).update(
                checked_in_at=now,
                checked_in_by=request.user,
            )
            ItemHistory.objects.bulk_create(
                [
                    ItemHistory(
                        item_id=item_id,
                        event_type='batch_processed',
                        note=f'Checked in via {batch.batch_number}',
                        created_by=request.user,
                    )
                    for item_id in item_ids
                ],
                batch_size=1000,
            )

        serializer = self.get_serializer(batch)
        data = serializer.data
        data['checked_in'] = checked_in_count
        return Response(data)

    @action(detail=True, methods=['post'])
    def detach(self, request, pk=None):
        """Detach one item from a batch into individual processing."""
        batch = self.get_object()
        item_id = request.data.get('item_id')

        item_qs = batch.items.exclude(status__in=['sold', 'scrapped', 'lost'])
        if item_id:
            item = item_qs.filter(id=item_id).first()
        else:
            item = item_qs.order_by('id').first()

        if not item:
            return Response(
                {'detail': 'No detachable item found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_batch = batch.batch_number
        item.batch_group = None
        item.processing_tier = 'individual'
        item.status = 'processing'
        item.save(update_fields=['batch_group', 'processing_tier', 'status', 'updated_at'])

        ItemHistory.objects.create(
            item=item,
            event_type='detached_from_batch',
            old_value=old_batch,
            new_value='individual',
            note=f'Detached from {old_batch}',
            created_by=request.user,
        )

        remaining = batch.items.count()
        batch.total_qty = remaining
        if remaining == 0 and batch.status != 'complete':
            batch.status = 'complete'
            batch.processed_at = timezone.now()
            batch.save(update_fields=['total_qty', 'status', 'processed_at', 'updated_at'])
        else:
            batch.save(update_fields=['total_qty', 'updated_at'])

        return Response({
            'detached_item_id': item.id,
            'detached_item_sku': item.sku,
            'remaining_in_batch': remaining,
        })


class VendorProductRefViewSet(viewsets.ModelViewSet):
    queryset = VendorProductRef.objects.select_related('vendor', 'product').all()
    serializer_class = VendorProductRefSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['vendor', 'product']
    search_fields = ['vendor_item_number', 'vendor__code', 'product__title']
    ordering_fields = ['last_seen_date', 'times_seen']


class ItemViewSet(viewsets.ModelViewSet):
    serializer_class = ItemSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['sku', 'title', 'brand', 'category', 'product__product_number']
    filterset_fields = [
        'status', 'source', 'purchase_order', 'category',
        'processing_tier', 'batch_group', 'condition',
    ]
    ordering_fields = ['created_at', 'price', 'title', 'sku']
    ordering = ['-created_at']

    def get_queryset(self):
        return Item.objects.select_related(
            'product', 'purchase_order', 'manifest_row', 'batch_group',
        ).all()

    def perform_create(self, serializer):
        serializer.save(sku=Item.generate_sku())

    @action(detail=True, methods=['post'], url_path='check-in')
    def check_in(self, request, pk=None):
        """Check in an individual item and mark shelf-ready."""
        item = self.get_object()
        updates = {}
        if 'price' in request.data:
            parsed_price = parse_decimal(request.data.get('price'))
            if parsed_price is not None:
                updates['price'] = parsed_price
        if 'cost' in request.data:
            updates['cost'] = parse_decimal(request.data.get('cost'))
        for field in ['title', 'brand', 'category', 'condition', 'location', 'notes']:
            if field in request.data:
                value = request.data.get(field)
                if value is not None:
                    updates[field] = value
        if 'specifications' in request.data:
            updates['specifications'] = request.data.get('specifications') or {}

        changed = apply_item_updates(item, updates)
        old_status = item.status
        now = timezone.now()
        item.status = 'on_shelf'
        item.listed_at = now
        item.checked_in_at = now
        item.checked_in_by = request.user
        item.save()

        history_events = []
        if old_status != 'on_shelf':
            history_events.append(
                ItemHistory(
                    item=item,
                    event_type='status_change',
                    old_value=old_status,
                    new_value='on_shelf',
                    note='Checked in and marked shelf-ready',
                    created_by=request.user,
                ),
            )

        for field, old_value, new_value in changed:
            history_events.append(
                ItemHistory(
                    item=item,
                    event_type=history_event_type_for_field(field),
                    old_value='' if old_value is None else str(old_value),
                    new_value='' if new_value is None else str(new_value),
                    note=f'Check-in updated {field}',
                    created_by=request.user,
                ),
            )

        if history_events:
            ItemHistory.objects.bulk_create(history_events)

        data = ItemSerializer(item).data
        data['checked_in'] = True
        return Response(data)

    @action(detail=True, methods=['post'])
    def ready(self, request, pk=None):
        """Mark item as ready for shelf."""
        item = self.get_object()
        old_status = item.status
        item.status = 'on_shelf'
        now = timezone.now()
        item.listed_at = now
        item.checked_in_at = now
        item.checked_in_by = request.user
        item.save()
        ItemHistory.objects.create(
            item=item,
            event_type='status_change',
            old_value=old_status,
            new_value='on_shelf',
            note='Marked ready for shelf',
            created_by=request.user,
        )
        return Response(ItemSerializer(item).data)


class ItemHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ItemHistory.objects.select_related('item', 'created_by').all()
    serializer_class = ItemHistorySerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['item', 'event_type']
    ordering_fields = ['created_at']
    ordering = ['-created_at']


@api_view(['GET'])
@perm_classes([AllowAny])
def item_lookup(request, sku):
    """Public item lookup by SKU (no auth required)."""
    try:
        item = Item.objects.get(sku=sku)
    except Item.DoesNotExist:
        return Response(
            {'detail': 'Item not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Record scan
    ItemScanHistory.objects.create(
        item=item,
        ip_address=request.META.get('REMOTE_ADDR'),
        source='public_lookup',
    )

    return Response(ItemPublicSerializer(item).data)
