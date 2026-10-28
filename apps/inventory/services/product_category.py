"""
Edit category (Bill, 2026-10-28): staff set a product's category and subcategory by hand, from the taxonomy.

The choices are the taxonomy's own table (`standardize.canon()`, the one answer key). The values go on the product's
standard (`ProductProfile`, through `product_profile.set_field` with source ``human``, so no machine pass overwrites
them) and the product's own category row follows the category, as Add item does. Every change is logged.
"""
from __future__ import annotations

from django.db import transaction

from apps.core.logging import get_logger
from apps.inventory.models import Product, ProductProfile

logger = get_logger(__name__, 'LOG_INVENTORY')


class CategoryError(ValueError):
    pass


def current(product: Product) -> dict:
    """The product's category and subcategory on its standard ('' when it has none)."""
    row = ProductProfile.objects.filter(product_id=product.pk).values('category', 'subcategory').first() or {}
    return {'product_id': product.pk, 'category': row.get('category') or '', 'subcategory': row.get('subcategory') or ''}


def set_category(product: Product, category: str, subcategory: str, *, user=None) -> dict:
    """Set both by hand. The pair must be in the taxonomy: a category with subcategories needs one of them."""
    from apps.inventory.services import standardize as std
    from apps.inventory.services.manual_item import _category_for_name
    from apps.inventory.services.product_profile import set_field

    category, subcategory = (category or '').strip(), (subcategory or '').strip()
    canon = std.canon()
    if category not in canon:
        raise CategoryError('Pick a category.')
    subs = canon[category]
    if subs and subcategory not in subs:
        raise CategoryError('Pick a subcategory.')
    if not subs:
        subcategory = ''
    before = current(product)
    with transaction.atomic():
        profile, _ = ProductProfile.objects.get_or_create(product=product)
        set_field(product, 'category', category, source='human', confidence='confirmed', profile=profile)
        set_field(product, 'subcategory', subcategory, source='human', confidence='confirmed', profile=profile)
        cat_row = _category_for_name(category)
        if product.category_id != cat_row.pk:
            product.category = cat_row
            product.save(update_fields=['category', 'updated_at'])
    after = current(product)
    logger.info(
        'Edit category: product %s (%s) %s > %s -> %s > %s by %s', product.pk, product.product_number or '',
        before['category'] or '-', before['subcategory'] or '-', after['category'], after['subcategory'] or '-',
        getattr(user, 'email', None) or 'unknown',
    )
    return after
