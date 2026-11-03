"""
The Product window (Dash Updates #11): one product as staff need to see it, in one call, built like the Item card.

GET /api/inventory/products/<id>/card/

Header facts, how many of it are on the shelf / in processing / sold / gone, the average sold, tag and retail
prices and days to sell, the newest items, the orders it came on, and a short journey (check-ins, first and last
sale). Every number is one aggregate or a small slice, so a product with thousands of items costs the same as one.
"Sold" is status ``sold`` (the Item window's and the reports' meaning). Read-only.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Max, Min, Q, Sum

from apps.inventory.models import Item, ItemCheckIn, Product

ITEMS = 10
CHECK_INS = 10
ORDERS = 10


def _money(v) -> str | None:
    return str(Decimal(v).quantize(Decimal('0.01'))) if v is not None else None


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def _url(field) -> str | None:
    try:
        return field.url if field else None
    except Exception:  # noqa: BLE001 - storage without a URL (tests)
        return None


def _photo(product: Product) -> str | None:
    """The product's own stock photo; only when it has none, the newest item's photo. (The Item window is the other
    way round on purpose: the item's own photos first, the product's as the fallback.)"""
    url = _url(product.photo) or _url(product.photo_thumb)
    if url:
        return url
    try:
        from django.core.files.storage import default_storage

        from apps.marketing.models import SocialPhoto

        row = (SocialPhoto.objects.filter(item__product=product, is_archived=False)
               .order_by('-uploaded_at').values_list('thumbnail', 'image').first())
        if row and (row[1] or row[0]):
            return default_storage.url(row[1] or row[0])
    except Exception:  # noqa: BLE001 - a photo is a nice-to-have
        pass
    return None


def product_card(product_id: int) -> dict | None:
    product = Product.objects.select_related('category').filter(pk=product_id).first()
    if product is None:
        return None
    items = Item.objects.filter(product=product)
    sold = Q(status='sold')
    days = ExpressionWrapper(F('sold_at') - F('listed_at'), output_field=DurationField())
    stats = items.aggregate(
        total=Count('id'),
        on_shelf=Count('id', filter=Q(status='on_shelf')),
        processing=Count('id', filter=Q(status__in=('intake', 'processing'))),
        sold=Count('id', filter=sold),
        gone=Count('id', filter=Q(status__in=('scrapped', 'lost'))),
        returned=Count('id', filter=Q(status='returned')),
        avg_sold=Avg('sold_for', filter=sold & Q(sold_for__isnull=False)),
        avg_price=Avg('price'),
        avg_retail=Avg('retail'),
        avg_days=Avg(days, filter=sold & Q(sold_at__isnull=False, listed_at__isnull=False)),
    )
    avg_days = stats['avg_days']
    newest = list(items.select_related('purchase_order').order_by('-created_at', '-id')[:ITEMS])
    sale_dates = items.filter(sold, sold_at__isnull=False)
    first_sale = sale_dates.order_by('sold_at').values_list('sold_at', flat=True).first()
    last_sale = sale_dates.order_by('-sold_at').values_list('sold_at', flat=True).first()
    orders = list(items.filter(purchase_order__isnull=False).values('purchase_order_id', 'purchase_order__order_number')
                  .annotate(n=Count('id')).order_by('-purchase_order_id')[:ORDERS + 1])
    # One line per order it was checked in on (a truck checked in one at a time is one line, not hundreds).
    check_ins = list(ItemCheckIn.objects.filter(product=product)
                     .values('purchase_order_id', 'purchase_order__order_number')
                     .annotate(qty=Sum('quantity'), first=Min('created_at'), last=Max('created_at'), times=Count('id'))
                     .order_by('-last')[:CHECK_INS])

    journey = [{'kind': 'created', 'at': _iso(product.created_at), 'label': 'Product created', 'detail': ''}]
    for c in check_ins:
        days = (c['last'].date() - c['first'].date()).days if c['first'] and c['last'] else 0
        journey.append({'kind': 'check_in', 'at': _iso(c['last']), 'label': f"Checked in × {c['qty'] or 0}",
                        'detail': ' · '.join(x for x in [c['purchase_order__order_number'] or '',
                                                          f'over {days + 1} days' if days else ''] if x)})
    if first_sale:
        journey.append({'kind': 'sale', 'at': _iso(first_sale), 'label': 'First sale', 'detail': ''})
    if last_sale and last_sale != first_sale:
        journey.append({'kind': 'sale', 'at': _iso(last_sale), 'label': 'Last sale', 'detail': ''})
    journey.sort(key=lambda e: e['at'] or '', reverse=True)

    return {
        'id': product.pk,
        'product_number': product.product_number,
        'title': product.title,
        'brand': product.brand,
        'model': product.model,
        'category': product.category.name if product.category_id else '',
        'is_active': product.is_active,
        'photo_url': _photo(product),
        'upc': product.primary_upc,
        'identifiers': {k: v for k, v in (product.identifiers or {}).items() if v not in (None, '', [], {})},
        'tags': [t for t in (product.tags or []) if t],
        'created_at': _iso(product.created_at),
        'counts': {k: stats[k] for k in ('total', 'on_shelf', 'processing', 'sold', 'gone', 'returned')},
        'avg_sold': _money(stats['avg_sold']),
        'avg_price': _money(stats['avg_price']),
        'avg_retail': _money(stats['avg_retail']),
        'avg_days_to_sell': round(avg_days / timedelta(days=1), 1) if avg_days is not None else None,
        'items': [{'id': it.pk, 'sku': it.sku, 'status': it.status, 'status_label': it.get_status_display(),
                   'price': _money(it.price), 'sold_for': _money(it.sold_for),
                   'order_number': it.purchase_order.order_number if it.purchase_order_id else ''} for it in newest],
        'orders': [{'id': o['purchase_order_id'], 'order_number': o['purchase_order__order_number'], 'items': o['n']}
                   for o in orders[:ORDERS]],
        'more_orders': len(orders) > ORDERS,
        'journey': journey,
    }
