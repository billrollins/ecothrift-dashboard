"""
Which category an item counts under in buying's numbers (data-quality row ITM-15; owner, 2026-10-02).

`Product.category` says "Mixed lots" for most history, so Need, recovery and the category stats lumped years of
sales into one bucket. The product standard (`ProductProfile.category`, written by the standardize pipeline and at
intake) has a real category for almost every product.

With the switch `category_from_profile` on, a product's **profile category wins when it is a real one** (a canon
name, not Mixed lots); otherwise the old order stands: the product's own category, then the manifest row's. With
the switch off nothing changes. It changes buying valuations, so it is the owner's switch.
"""
from __future__ import annotations

from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES
from apps.core.models import AppSetting

SWITCH_KEY = 'category_from_profile'
REAL_CATEGORIES = tuple(n for n in TAXONOMY_V1_CATEGORY_NAMES if n != MIXED_LOTS_UNCATEGORIZED)


def is_enabled() -> bool:
    value = AppSetting.objects.filter(key=SWITCH_KEY).values_list('value', flat=True).first()
    return value is True or str(value).lower() in ('true', '1', 'yes', 'on')


def profile_category(product) -> str:
    """The product's profile category when it is a real one, else ''."""
    from apps.inventory.models import ProductProfile

    name = ProductProfile.objects.filter(product_id=product.pk).values_list('category', flat=True).first() or ''
    return name if name in REAL_CATEGORIES else ''


def category_name_expression(prefix: str = 'product__'):
    """A queryset expression for the category name of the product at `prefix` (honours the switch)."""
    from django.db.models import Case, CharField, F, When

    own = F(f'{prefix}category__name')
    if not is_enabled():
        return own
    return Case(When(**{f'{prefix}profile__category__in': REAL_CATEGORIES}, then=F(f'{prefix}profile__category')),
                default=own, output_field=CharField())
