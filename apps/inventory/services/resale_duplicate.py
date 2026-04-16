"""Shared logic for creating a new on-shelf item from a sold unit (duplicate for resale)."""
from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Item, ItemHistory


def duplicate_item_for_resale(user, src: Item) -> Item:
    """Create a new on-shelf `Item` copied from a sold unit (new SKU).

    Caller must ensure ``src.status == 'sold'``.
    """
    base_notes = (src.notes or '').strip()
    dup_line = f'DUPLICATE_FOR_RESALE_FROM:{src.sku}'
    new_notes = f'{base_notes}\n{dup_line}' if base_notes else dup_line
    if src.source == 'consignment':
        new_notes = f'{new_notes}\nORIGINAL_WAS_CONSIGNMENT:{src.sku}'

    new_source = 'purchased' if src.source == 'consignment' else src.source
    now = timezone.now()

    po = src.purchase_order
    dup_cost = po.compute_item_cost(src.retail_value) if po else None

    with transaction.atomic():
        new_item = Item.objects.create(
            sku=Item.generate_sku(),
            product=src.product,
            purchase_order=src.purchase_order,
            manifest_row=src.manifest_row,
            batch_group=src.batch_group,
            processing_tier=src.processing_tier,
            title=src.title,
            brand=src.brand,
            category=src.category,
            price=src.price,
            retail_value=src.retail_value,
            cost=dup_cost,
            source=new_source,
            status='on_shelf',
            condition=src.condition,
            specifications=src.specifications if src.specifications is not None else {},
            location=src.location,
            notes=new_notes,
            listed_at=now,
            checked_in_at=now,
            checked_in_by=user,
        )
        ItemHistory.objects.create(
            item=new_item,
            event_type='created',
            old_value='',
            new_value=new_item.sku,
            note=f'Duplicate for resale from sold item {src.sku}',
            created_by=user,
        )

    return new_item
