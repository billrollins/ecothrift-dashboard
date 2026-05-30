"""API for the curated web catalog.

  * `WebListingViewSet` — staff CRUD (`/api/webstore/listings/`), plus image
    upload / delete / reorder actions. Requires staff auth.
  * Public read endpoints (`AllowAny`): catalog list, detail-by-slug, categories.
  * `listing_image` — public image proxy that keeps S3 private (302 → presigned URL
    on S3, or streams the file in local dev).
"""
import os
import uuid
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Count, F, Max, Q
from django.http import FileResponse, Http404, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.decorators import permission_classes as perm_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff
from apps.core.models import S3File

from .emails import send_order_confirmation
from .models import Order, OrderLine, WebListing, WebListingImage
from .payments import get_payment_provider
from .serializers import (
    OrderPublicSerializer,
    OrderStaffSerializer,
    WebListingDetailPublicSerializer,
    WebListingImageSerializer,
    WebListingListPublicSerializer,
    WebListingSerializer,
)

PAGE_SIZE_DEFAULT = 24
PAGE_SIZE_MAX = 60
_TRUTHY = ('1', 'true', 'True', 'yes')


class WebListingViewSet(viewsets.ModelViewSet):
    """Staff-only CRUD for curated web listings."""

    queryset = (
        WebListing.objects
        .select_related('category', 'item')
        .prefetch_related('images__s3_file')
        .all()
    )
    serializer_class = WebListingSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'category', 'featured', 'condition']
    search_fields = ['title', 'sku', 'description']
    ordering_fields = ['created_at', 'updated_at', 'price', 'title', 'featured', 'stock']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='images')
    def add_image(self, request, pk=None):
        listing = self.get_object()
        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'No file provided.'}, status=400)
        ext = os.path.splitext(file.name or '')[1].lower() or '.jpg'
        key = f'webstore/listings/{listing.id}/{uuid.uuid4().hex}{ext}'
        saved_path = default_storage.save(key, file)
        s3_file = S3File.objects.create(
            key=saved_path,
            filename=file.name or saved_path.split('/')[-1],
            size=getattr(file, 'size', 0) or 0,
            content_type=getattr(file, 'content_type', '') or '',
            uploaded_by=request.user,
        )
        next_pos = (listing.images.aggregate(m=Max('position'))['m'] or 0) + 1
        image = WebListingImage.objects.create(
            listing=listing,
            s3_file=s3_file,
            alt=request.data.get('alt', ''),
            position=next_pos,
        )
        return Response(WebListingImageSerializer(image).data, status=201)

    @action(detail=True, methods=['post'], url_path='images/reorder')
    def reorder_images(self, request, pk=None):
        listing = self.get_object()
        order = request.data.get('order') or []
        for idx, image_id in enumerate(order):
            WebListingImage.objects.filter(pk=image_id, listing=listing).update(position=idx)
        listing = self.get_queryset().get(pk=listing.pk)
        return Response(WebListingSerializer(listing).data)

    @action(detail=True, methods=['delete'], url_path=r'images/(?P<image_id>[0-9]+)')
    def delete_image(self, request, pk=None, image_id=None):
        listing = self.get_object()
        image = get_object_or_404(WebListingImage, pk=image_id, listing=listing)
        s3_file = image.s3_file
        image.delete()
        try:
            default_storage.delete(s3_file.key)
        except Exception:
            pass
        s3_file.delete()
        return Response(status=204)


@api_view(['GET'])
@perm_classes([AllowAny])
def public_catalog(request):
    """Public, paginated catalog of published listings."""
    qs = (
        WebListing.objects.filter(status='published')
        .select_related('category')
        .prefetch_related('images')
    )

    category = request.query_params.get('category')
    if category:
        qs = qs.filter(category__slug=category)

    q = request.query_params.get('q')
    if q:
        qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q))

    if request.query_params.get('featured') in _TRUTHY:
        qs = qs.filter(featured=True)
    if request.query_params.get('on_sale') in _TRUTHY:
        qs = qs.filter(compare_at_price__gt=F('price'))
    if request.query_params.get('available') in _TRUTHY:
        qs = qs.filter(stock__gt=0)

    sort_map = {
        'price_asc': ('price', '-created_at'),
        'price_desc': ('-price', '-created_at'),
        'new': ('-created_at',),
        'featured': ('-featured', '-created_at'),
    }
    sort = request.query_params.get('sort', 'featured')
    qs = qs.order_by(*sort_map.get(sort, sort_map['featured']))

    try:
        page = max(1, int(request.query_params.get('page', 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.query_params.get('page_size', PAGE_SIZE_DEFAULT))
    except (TypeError, ValueError):
        page_size = PAGE_SIZE_DEFAULT
    page_size = max(1, min(page_size, PAGE_SIZE_MAX))

    total = qs.count()
    start = (page - 1) * page_size
    results = WebListingListPublicSerializer(list(qs[start:start + page_size]), many=True).data
    return Response({
        'count': total,
        'page': page,
        'page_size': page_size,
        'num_pages': (total + page_size - 1) // page_size if page_size else 1,
        'results': results,
    })


@api_view(['GET'])
@perm_classes([AllowAny])
def public_listing_detail(request, slug):
    """Public detail for one published listing."""
    try:
        listing = (
            WebListing.objects.select_related('category')
            .prefetch_related('images')
            .get(slug=slug, status='published')
        )
    except WebListing.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    return Response(WebListingDetailPublicSerializer(listing).data)


@api_view(['GET'])
@perm_classes([AllowAny])
def public_categories(request):
    """All web-shop categories in display order, with published listing counts."""
    from apps.inventory.models import Category
    from apps.webstore.shop_categories import SHOP_CATEGORIES

    count_by_slug = {
        r['category__slug']: r['count']
        for r in (
            WebListing.objects.filter(status='published', category__isnull=False)
            .values('category__slug')
            .annotate(count=Count('id'))
        )
    }

    categories = []
    for row in SHOP_CATEGORIES:
        slug = row['slug']
        db_cat = Category.objects.filter(slug=slug).first()
        categories.append(
            {
                'id': db_cat.id if db_cat else None,
                'name': row['name'],
                'slug': slug,
                'description': row['description'],
                'count': count_by_slug.get(slug, 0),
            }
        )

    total = WebListing.objects.filter(status='published').count()
    return Response({'total': total, 'categories': categories})


def listing_image(request, image_id):
    """Public image proxy. Keeps the S3 bucket private:

    redirects to a short-lived presigned URL when the storage backend exposes one
    (production S3), otherwise streams the bytes from storage (local dev).
    """
    try:
        image = WebListingImage.objects.select_related('s3_file').get(pk=image_id)
    except WebListingImage.DoesNotExist:
        raise Http404('Image not found.')

    key = image.s3_file.key
    try:
        url = default_storage.url(key)
    except Exception:
        url = None

    if url and str(url).lower().startswith(('http://', 'https://')):
        response = HttpResponseRedirect(url)
        response['Cache-Control'] = 'public, max-age=300'
        return response

    try:
        handle = default_storage.open(key, 'rb')
    except (OSError, FileNotFoundError):
        raise Http404('Image file missing.')
    response = FileResponse(
        handle, content_type=image.s3_file.content_type or 'application/octet-stream',
    )
    response['Cache-Control'] = 'public, max-age=300'
    return response


# ── Checkout + orders ────────────────────────────────────────────────────────

def _money(value) -> Decimal:
    try:
        return Decimal(value).quantize(Decimal('0.01'))
    except (InvalidOperation, TypeError):
        return Decimal('0.00')


@api_view(['POST'])
@perm_classes([AllowAny])
def checkout(request):
    """Place a public order. Validates + reserves stock atomically, computes
    shipping/tax, creates the order, then hands off to the configured payment
    provider (stubbed `manual` for now). Payment failures to a real provider would
    surface here; the manual provider always succeeds."""
    data = request.data
    items = data.get('items') or []
    name = (data.get('customer_name') or '').strip()
    email = (data.get('email') or '').strip()
    fulfillment = (data.get('fulfillment') or 'pickup').strip()
    if fulfillment not in ('pickup', 'ship'):
        fulfillment = 'pickup'

    if not items:
        return Response({'detail': 'Your cart is empty.'}, status=400)
    if not name or not email:
        return Response({'detail': 'Name and email are required.'}, status=400)

    ship = {
        k: (data.get(k) or '').strip()
        for k in ('ship_address1', 'ship_address2', 'ship_city', 'ship_state', 'ship_postal')
    }
    if fulfillment == 'ship' and not (
        ship['ship_address1'] and ship['ship_city'] and ship['ship_state'] and ship['ship_postal']
    ):
        return Response({'detail': 'A full shipping address is required for delivery.'}, status=400)

    tax_rate = Decimal(str(getattr(settings, 'WEBSTORE_SALES_TAX_RATE', '0') or '0'))
    ship_flat = Decimal(str(getattr(settings, 'WEBSTORE_SHIP_FLAT', '0') or '0'))

    try:
        with transaction.atomic():
            planned = []
            subtotal = Decimal('0.00')
            for raw in items:
                slug = (raw.get('slug') or '').strip()
                try:
                    qty = int(raw.get('qty') or 1)
                except (TypeError, ValueError):
                    qty = 1
                if not slug or qty < 1:
                    continue
                try:
                    listing = WebListing.objects.select_for_update().get(slug=slug, status='published')
                except WebListing.DoesNotExist:
                    return Response({'detail': f'“{slug}” is no longer available.'}, status=409)
                if listing.stock < qty:
                    return Response(
                        {'detail': f'Only {listing.stock} left of “{listing.title}”.'}, status=409,
                    )
                line_total = _money(listing.price * qty)
                subtotal += line_total
                planned.append((listing, qty, listing.price, line_total))

            if not planned:
                return Response({'detail': 'No valid items in your cart.'}, status=400)

            shipping = ship_flat if fulfillment == 'ship' else Decimal('0.00')
            tax = _money((subtotal + shipping) * tax_rate)
            total = _money(subtotal + shipping + tax)

            order = Order.objects.create(
                customer_name=name,
                email=email,
                phone=(data.get('phone') or '').strip(),
                fulfillment=fulfillment,
                subtotal=_money(subtotal),
                shipping=_money(shipping),
                tax=tax,
                total=total,
                customer_note=(data.get('note') or '').strip(),
                **ship,
            )
            for listing, qty, unit_price, line_total in planned:
                OrderLine.objects.create(
                    order=order, listing=listing, title=listing.title, slug=listing.slug,
                    sku=listing.sku, unit_price=unit_price, quantity=qty, line_total=line_total,
                )
                listing.stock = max(0, listing.stock - qty)
                listing.save(update_fields=['stock', 'updated_at'])

            payment = get_payment_provider().start(order)
    except NotImplementedError as exc:
        return Response({'detail': str(exc)}, status=503)

    send_order_confirmation(order)
    payload = OrderPublicSerializer(order).data
    payload['payment'] = payment
    return Response(payload, status=201)


@api_view(['GET'])
@perm_classes([AllowAny])
def order_status(request, order_number):
    """Public order status by number (the number acts as the customer's token)."""
    try:
        order = Order.objects.prefetch_related('lines').get(order_number=order_number)
    except Order.DoesNotExist:
        return Response({'detail': 'Order not found.'}, status=404)
    return Response(OrderPublicSerializer(order).data)


class OrderViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Staff order management (orders are created by checkout, not here)."""

    queryset = Order.objects.prefetch_related('lines').all()
    serializer_class = OrderStaffSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'payment_status', 'fulfillment']
    search_fields = ['order_number', 'email', 'customer_name']
    ordering_fields = ['created_at', 'total', 'status']

    @action(detail=True, methods=['post'], url_path='set-status')
    def set_status(self, request, pk=None):
        order = self.get_object()
        new_status = request.data.get('status')
        if new_status not in dict(Order.STATUS_CHOICES):
            return Response({'detail': 'Invalid status.'}, status=400)

        old_status = order.status
        if new_status != old_status:
            with transaction.atomic():
                # Cancelling returns reserved stock to the catalog.
                if new_status == 'cancelled' and old_status != 'cancelled':
                    for line in order.lines.all():
                        if line.listing_id:
                            listing = WebListing.objects.select_for_update().get(pk=line.listing_id)
                            listing.stock = listing.stock + line.quantity
                            listing.save(update_fields=['stock', 'updated_at'])
                order.status = new_status
                if new_status == 'paid' and order.payment_status != 'paid':
                    order.payment_status = 'paid'
                order.save(update_fields=['status', 'payment_status', 'updated_at'])
        return Response(OrderStaffSerializer(order).data)
