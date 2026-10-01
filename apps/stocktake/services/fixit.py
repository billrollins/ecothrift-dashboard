"""PR Fix-it: what processing does with the problem items a count sends back.

Each fix changes the item (when needed), closes the problem, and returns the tag to print.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Item, ItemHistory, Product
from apps.inventory.services.resale_duplicate import duplicate_item_for_resale

from ..models import CountScan, Issue
from .counting import BadRequest, counted_ids, label_for

FIXES = {'reprint', 'edit', 'print_as_new', 'put_on_shelf', 'use_item', 'quick_add', 'moved', 'dismiss'}
NOTE = 'Inventory count fix'


def _money(value, name: str) -> Decimal:
    try:
        amount = Decimal(str(value)).quantize(Decimal('0.01'))
    except (InvalidOperation, TypeError, ValueError):
        raise BadRequest(f'{name} must be a number.')
    if amount < 0 or amount > Decimal('99999.99'):
        raise BadRequest(f'{name} is out of range.')
    return amount


def _need_item(issue: Issue) -> Item:
    if issue.item is None:
        raise BadRequest('No item is tied to this problem. Find the item or add it first.')
    return issue.item


def _set_price(item: Item, price: Decimal, user) -> None:
    if price == item.price:
        return
    old = item.price
    item.price = price
    item.save(update_fields=['price', 'updated_at'])
    ItemHistory.objects.create(
        item=item, event_type='price_change', old_value=str(old), new_value=str(price), note=NOTE, created_by=user,
    )


def _set_title(item: Item, title: str, user) -> None:
    """Rename this one item. A product shared with other items is left alone: the item gets its own."""
    title = title.strip()[:300]
    product = item.product
    if not title or title == product.title:
        return
    old = product.title
    if product.items.exclude(pk=item.pk).exists():
        item.product = Product.objects.create(
            title=title, brand=product.brand, model=product.model, category=product.category,
            specifications=product.specifications or {},
        )
    else:
        product.title = title
        product.save(update_fields=['title', 'updated_at'])
    item.save()  # rebuilds the search text
    ItemHistory.objects.create(
        item=item, event_type='note', old_value=old[:300], new_value=title, note=f'{NOTE}: title', created_by=user,
    )


def _put_on_shelf(item: Item, user) -> None:
    if item.status == 'on_shelf':
        return
    if item.status == 'sold':
        raise BadRequest('This item was sold. Print it as a new item instead.')
    old = item.status
    item.status = 'on_shelf'
    item.listed_at = item.listed_at or timezone.now()
    item.save(update_fields=['status', 'listed_at', 'search_text', 'updated_at'])
    ItemHistory.objects.create(
        item=item, event_type='found' if old == 'lost' else 'status_change', old_value=old, new_value='on_shelf',
        note=NOTE, created_by=user,
    )


def _count_it(issue: Issue, item: Item) -> None:
    """The item had no readable tag, so it was never scanned: count it now."""
    if item.pk in counted_ids(issue.count):
        return
    CountScan.objects.get_or_create(
        count=issue.count, client_id=f'fix-{issue.pk}',
        defaults={
            'run': issue.run, 'code': item.sku, 'scanned_at': timezone.now(), 'item': item, 'item_status': item.status,
            'result': CountScan.RESULT_OK if item.status == 'on_shelf' else CountScan.RESULT_ODD,
        },
    )


def fix_issue(issue: Issue, *, user, fix: str, data: dict) -> dict | None:
    """Apply one fix and close the problem. Returns the label to print, or None when nothing prints."""
    if fix not in FIXES:
        raise BadRequest('Unknown fix.')
    if issue.fixed_at is not None:
        raise BadRequest('This problem is already fixed.')
    printed: Item | None = None
    with transaction.atomic():
        if fix == 'reprint':
            printed = _need_item(issue)
        elif fix == 'edit':
            printed = _need_item(issue)
            if data.get('title'):
                _set_title(printed, str(data['title']), user)
            if data.get('price') not in (None, ''):
                _set_price(printed, _money(data['price'], 'Price'), user)
        elif fix == 'print_as_new':
            src = _need_item(issue)
            # Two items sharing one tag: the second one gets its own item too.
            if src.status != 'sold' and issue.kind != Issue.KIND_ALREADY_SCANNED:
                raise BadRequest('Only a sold item is printed as new. This one can be put back on the shelf.')
            printed = duplicate_item_for_resale(user, src)
            if data.get('price') not in (None, ''):
                _set_price(printed, _money(data['price'], 'Price'), user)
            issue.new_item = printed
        elif fix == 'put_on_shelf':
            printed = _need_item(issue)
            _put_on_shelf(printed, user)
        elif fix == 'use_item':
            target = Item.objects.select_related('product').filter(pk=data.get('item_id')).first()
            if target is None:
                raise BadRequest('Pick the item this is.')
            issue.item = target
            if target.status == 'sold':
                printed = duplicate_item_for_resale(user, target)
                issue.new_item = printed
            else:
                _put_on_shelf(target, user)
                printed = target
                _count_it(issue, target)
        elif fix == 'quick_add':
            title = str(data.get('title') or '').strip()[:300]
            if not title:
                raise BadRequest('Type what the item is.')
            price = _money(data.get('price'), 'Price')
            retail = _money(data['retail'], 'Retail') if data.get('retail') not in (None, '') else None
            now = timezone.now()
            printed = Item.objects.create(
                product=Product.objects.create(title=title), price=price, retail=retail, source='misc',
                status='on_shelf', listed_at=now, checked_in_at=now, checked_in_by=user,
                notes='INVENTORY_COUNT_QUICK_ADD',
            )
            ItemHistory.objects.create(
                item=printed, event_type='created', new_value=printed.sku,
                note=f'{NOTE}: found on the floor with no tag', created_by=user,
            )
            issue.new_item = printed
        # 'moved' and 'dismiss' change nothing on the item.
        issue.fix = fix
        issue.fix_note = str(data.get('note') or '')[:300]
        issue.fixed_at = timezone.now()
        issue.fixed_by = user
        issue.save()
    if printed is not None and fix != 'dismiss':
        printed.refresh_from_db()
        return label_for(printed)
    return None


def reopen_issue(issue: Issue) -> Issue:
    """Put a fixed problem back on the list (the changes to the item are kept)."""
    issue.fixed_at, issue.fixed_by, issue.fix = None, None, ''
    issue.save(update_fields=['fixed_at', 'fixed_by', 'fix'])
    return issue
