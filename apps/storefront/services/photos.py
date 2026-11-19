"""A product's public photo: the one rule every feed, the item page and the photo address share.

Owner, 2026-11-19: "NEVER EVER EVER use photos you got from us for other purposes. like the add item photos. you CAN use
the photo sheets photos." So only two sources, in this order:

1. **sheet**: the first photo of the product's latest photo sheet that has photos (``inventory.PhotoSheet``; files in
   ``core.S3File`` under ``photo-sheets/``). A sheet belongs to a product by its own ``product``, else by its item's.
2. **stock**: a ``StockPhoto`` of the product that is found or approved (never rejected, never a miss).

Never ``Product.photo`` / ``photo_thumb`` (Add item), marketing, staff, dispute, receiving or any other photo.
"""
from __future__ import annotations

from django.db.models import Exists, OuterRef, Q

KIND_NONE, KIND_SHEET, KIND_STOCK = 0, 1, 2
KIND_NAMES = {KIND_SHEET: 'sheet', KIND_STOCK: 'stock'}


def photo_url(pid: int) -> str:
    return f'/api/storefront/photo/{pid}/'


def kinds_sql() -> str:
    """One query: (product id, kind) for every product with a sheet photo (1) or a public stock photo (2)."""
    from apps.inventory.models import Item, PhotoSheet
    from apps.storefront.models import StockPhoto

    public = ', '.join(f"'{s}'" for s in StockPhoto.PUBLIC)
    return f"""
SELECT COALESCE(s.product_id, i.product_id) AS pid, 1 AS kind
FROM {PhotoSheet._meta.db_table} s
LEFT JOIN {Item._meta.db_table} i ON i.id = s.item_id
WHERE jsonb_typeof(s.photos) = 'array' AND jsonb_array_length(s.photos) > 0
  AND COALESCE(s.product_id, i.product_id) IS NOT NULL
UNION ALL
SELECT sp.product_id, 2 FROM {StockPhoto._meta.db_table} sp
WHERE sp.product_id IS NOT NULL AND sp.status IN ({public}) AND sp.image <> ''"""


def kinds(cursor) -> dict[int, int]:
    """{product id: 1 sheet | 2 stock}; a sheet wins."""
    cursor.execute(kinds_sql())
    out: dict[int, int] = {}
    for pid, kind in cursor.fetchall():
        if out.get(pid, 9) > kind:
            out[pid] = kind
    return out


def _sheets_of(pid_ref):
    from apps.inventory.models import PhotoSheet

    return (PhotoSheet.objects.filter(Q(product_id=pid_ref) | Q(product__isnull=True, item__product_id=pid_ref))
            .exclude(photos=[]))


def annotate(queryset):
    """Products with ``has_sheet`` and ``has_stock`` (no extra query: two EXISTS in the same SELECT)."""
    from apps.storefront.models import StockPhoto

    return queryset.annotate(
        has_sheet=Exists(_sheets_of(OuterRef('pk'))),
        has_stock=Exists(StockPhoto.objects.filter(product_id=OuterRef('pk'), status__in=StockPhoto.PUBLIC)
                         .exclude(image='')),
    )


def kind_of(product) -> int:
    """For a product from ``annotate()``."""
    if getattr(product, 'has_sheet', False):
        return KIND_SHEET
    if getattr(product, 'has_stock', False):
        return KIND_STOCK
    return KIND_NONE


def public_file(pid: int) -> str | None:
    """The stored file name (default storage) of the product's public photo, or None."""
    from apps.inventory.services.photo_sheets import sheet_photo
    from apps.storefront.models import StockPhoto

    for photos in _sheets_of(pid).order_by('-updated_at', '-id').values_list('photos', flat=True)[:5]:
        first = photos[0] if isinstance(photos, list) and photos else None
        file_id = first.get('file') if isinstance(first, dict) else None
        if isinstance(file_id, int):
            s3 = sheet_photo(file_id)  # only files saved for a sheet
            if s3 is not None:
                return s3.key
    name = (StockPhoto.objects.filter(product_id=pid, status__in=StockPhoto.PUBLIC).exclude(image='')
            .order_by('status', '-found_at')  # approved before found
            .values_list('image', flat=True).first())
    return name or None
