import csv
import hashlib
import io

from django.core.files.storage import default_storage
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes as perm_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff
from apps.core.models import S3File
from .models import (
    Vendor, PurchaseOrder, CSVTemplate, ManifestRow,
    Product, Item, ProcessingBatch, ItemScanHistory,
)
from .serializers import (
    VendorSerializer, PurchaseOrderSerializer, PurchaseOrderDetailSerializer,
    CSVTemplateSerializer, ManifestRowSerializer,
    ProductSerializer, ItemSerializer, ItemPublicSerializer,
    ProcessingBatchSerializer,
)


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


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['order_number']
    filterset_fields = ['vendor', 'status']
    ordering_fields = ['ordered_date', 'expected_delivery', 'created_at']
    ordering = ['-ordered_date']

    def get_queryset(self):
        return PurchaseOrder.objects.select_related('vendor', 'created_by').all()

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
        """Mark a PO as delivered."""
        order = self.get_object()
        order.status = 'delivered'
        order.delivered_date = request.data.get('delivered_date', timezone.now().date())
        order.save()
        return Response(PurchaseOrderSerializer(order).data)

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

        sig = hashlib.md5(','.join(h.strip().lower() for h in headers).encode()).hexdigest()
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
        """Parse CSV into ManifestRows using a template."""
        order = self.get_object()
        template_id = request.data.get('template_id')
        rows = request.data.get('rows', [])

        if not rows:
            return Response(
                {'detail': 'No rows provided.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Delete existing manifest rows for this PO
        ManifestRow.objects.filter(purchase_order=order).delete()

        created = []
        for row_data in rows:
            manifest_row = ManifestRow.objects.create(
                purchase_order=order,
                row_number=row_data.get('row_number', 0),
                quantity=row_data.get('quantity', 1),
                description=row_data.get('description', ''),
                brand=row_data.get('brand', ''),
                model=row_data.get('model', ''),
                category=row_data.get('category', ''),
                retail_value=row_data.get('retail_value'),
                upc=row_data.get('upc', ''),
                notes=row_data.get('notes', ''),
            )
            created.append(manifest_row)

        order.status = 'processing'
        order.item_count = len(created)
        order.save()

        return Response({
            'rows_created': len(created),
            'order_status': order.status,
        })

    @action(detail=True, methods=['post'], url_path='create-items')
    def create_items(self, request, pk=None):
        """Create Items from ManifestRows."""
        order = self.get_object()
        rows = ManifestRow.objects.filter(purchase_order=order)
        if not rows.exists():
            return Response(
                {'detail': 'No manifest rows to process.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create processing batch
        batch = ProcessingBatch.objects.create(
            purchase_order=order,
            status='in_progress',
            total_rows=rows.count(),
            started_at=timezone.now(),
            created_by=request.user,
        )

        items_created = 0
        for row in rows:
            for _ in range(row.quantity):
                Item.objects.create(
                    sku=Item.generate_sku(),
                    purchase_order=order,
                    title=row.description[:300],
                    brand=row.brand,
                    category=row.category,
                    cost=row.retail_value,
                    source='purchased',
                    status='intake',
                )
                items_created += 1

        batch.processed_count = rows.count()
        batch.items_created = items_created
        batch.status = 'complete'
        batch.completed_at = timezone.now()
        batch.save()

        order.item_count = items_created
        order.save()

        return Response({
            'batch_id': batch.id,
            'items_created': items_created,
        })


class CSVTemplateViewSet(viewsets.ModelViewSet):
    queryset = CSVTemplate.objects.select_related('vendor').all()
    serializer_class = CSVTemplateSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['vendor']


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['title', 'brand', 'model', 'category']
    ordering_fields = ['title', 'created_at']


class ItemViewSet(viewsets.ModelViewSet):
    serializer_class = ItemSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['sku', 'title', 'brand', 'category']
    filterset_fields = ['status', 'source', 'purchase_order', 'category']
    ordering_fields = ['created_at', 'price', 'title', 'sku']
    ordering = ['-created_at']

    def get_queryset(self):
        return Item.objects.select_related('product', 'purchase_order').all()

    def perform_create(self, serializer):
        serializer.save(sku=Item.generate_sku())

    @action(detail=True, methods=['post'])
    def ready(self, request, pk=None):
        """Mark item as ready for shelf."""
        item = self.get_object()
        item.status = 'on_shelf'
        item.listed_at = timezone.now()
        item.save()
        return Response(ItemSerializer(item).data)


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
