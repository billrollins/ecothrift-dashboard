"""
Bulk price change from Inventory search (owner, 2026-10-02; managers and the owner only).

- **What is changed:** items on the shelf, picked one by one or as "every shelf item of this product".
- **The rule:** set a price, take a percent off, or take an amount off; then optionally round to .99 or to a whole
  dollar. A price never goes below `MIN_PRICE` (the same floor Quick reprice uses).
- **Preview first:** the same code computes the preview and the change, so approval applies what was shown.
- **Every change is kept** (`BulkPriceChange`: who, the rule, each item's price before and after) and each item
  gets a `price_change` history line. **Undo** puts back the old price on every item that still holds the new one.
- A tag shows the price, so a changed item needs its tag reprinted: the record carries what the label needs.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.inventory.models import BulkPriceChange, Item, ItemHistory, ProductProfile

MAX_ITEMS = 5000
MIN_PRICE = Decimal('0.50')
MODES = ('set', 'percent_off', 'amount_off')
ROUNDING = ('none', '99', 'dollar')
CENT = Decimal('0.01')


class RuleError(ValueError):
    """The rule can't be used; the message is for the person."""


def clean_rule(raw: dict | None) -> dict[str, Any]:
    raw = raw or {}
    mode, rounding = str(raw.get('mode') or ''), str(raw.get('round') or 'none')
    if mode not in MODES:
        raise RuleError('Choose how to change the price.')
    if rounding not in ROUNDING:
        raise RuleError('Unknown rounding.')
    try:
        value = Decimal(str(raw.get('value'))).quantize(CENT)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise RuleError('Enter a number.') from exc
    if mode == 'percent_off' and not (Decimal('0') < value < Decimal('100')):
        raise RuleError('Percent off must be between 1 and 99.')
    if mode in ('set', 'amount_off') and value <= 0:
        raise RuleError('Enter an amount above zero.')
    return {'mode': mode, 'value': str(value), 'round': rounding}


def describe(rule: dict[str, Any]) -> str:
    value = Decimal(rule['value'])
    text = {'set': f'Set to ${value}', 'percent_off': f'{value.normalize():f}% off', 'amount_off': f'${value} off'}[rule['mode']]
    tail = {'none': '', '99': ', rounded to .99', 'dollar': ', rounded to the dollar'}[rule['round']]
    return text + tail


def new_price(old: Decimal, rule: dict[str, Any]) -> Decimal:
    value = Decimal(rule['value'])
    if rule['mode'] == 'set':
        price = value
    elif rule['mode'] == 'percent_off':
        price = old * (Decimal('100') - value) / Decimal('100')
    else:
        price = old - value
    if rule['round'] == 'dollar':
        price = price.quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    elif rule['round'] == '99':
        price = price.quantize(Decimal('1'), rounding=ROUND_HALF_UP) - CENT
    return max(price, MIN_PRICE).quantize(CENT, rounding=ROUND_HALF_UP)


def _selected(item_ids: list[int], product_ids: list[int]):
    pick = Q(pk__in=item_ids or []) | Q(product_id__in=product_ids or [])
    return Item.objects.filter(pick, status='on_shelf')


def _label_names(product_ids: set[int]) -> dict[int, str]:
    return {pid: name for pid, name in ProductProfile.objects.filter(product_id__in=product_ids)
            .exclude(short_name='').values_list('product_id', 'short_name')}


def _rows(items: list[Item], rule: dict[str, Any] | None) -> list[dict[str, Any]]:
    names = _label_names({i.product_id for i in items if i.product_id})
    rows = []
    for i in items:
        old = i.price if i.price is not None else Decimal('0.00')
        rows.append({
            'id': i.pk, 'sku': i.sku, 'old': str(old), 'new': str(new_price(old, rule)) if rule else str(old),
            'title': names.get(i.product_id) or (i.product.title if i.product_id else i.sku),
            'brand': (i.product.brand if i.product_id else '') or '',
            'product_number': (i.product.product_number if i.product_id else '') or '',
        })
    return rows


def labels(item_ids: list[int], product_ids: list[int]) -> dict[str, Any]:
    """What a tag needs for every selected shelf item (bulk reprint)."""
    qs = _selected(item_ids, product_ids).select_related('product').order_by('pk')
    total = qs.count()
    return {'count': total, 'over_cap': total > MAX_ITEMS, 'items': _rows(list(qs[:MAX_ITEMS]), None)}


def preview(item_ids: list[int], product_ids: list[int], raw_rule: dict | None) -> dict[str, Any]:
    rule = clean_rule(raw_rule)
    qs = _selected(item_ids, product_ids).select_related('product').order_by('pk')
    total = qs.count()
    rows = [r for r in _rows(list(qs[:MAX_ITEMS]), rule)]
    changing = [r for r in rows if r['old'] != r['new']]
    return {
        'rule': rule, 'describe': describe(rule),
        'selected': total, 'over_cap': total > MAX_ITEMS, 'cap': MAX_ITEMS,
        'count': len(changing), 'unchanged': len(rows) - len(changing),
        'total_before': str(sum((Decimal(r['old']) for r in changing), Decimal('0'))),
        'total_after': str(sum((Decimal(r['new']) for r in changing), Decimal('0'))),
        'at_floor': sum(1 for r in changing if Decimal(r['new']) == MIN_PRICE),
        'sample': changing[:20],
    }


@transaction.atomic
def apply(user, item_ids: list[int], product_ids: list[int], raw_rule: dict | None) -> BulkPriceChange:
    rule = clean_rule(raw_rule)
    qs = _selected(item_ids, product_ids)
    if qs.count() > MAX_ITEMS:
        raise RuleError(f'That is more than {MAX_ITEMS:,} items. Narrow the selection.')
    items = list(Item.objects.select_for_update().filter(pk__in=qs.values('pk')).select_related('product').order_by('pk'))
    rows = [r for r in _rows(items, rule) if r['old'] != r['new']]
    if not rows:
        raise RuleError('No price would change.')
    change = BulkPriceChange.objects.create(
        rule=rule, description=describe(rule), item_count=len(rows), changes=rows, created_by=user,
        total_before=sum((Decimal(r['old']) for r in rows), Decimal('0')),
        total_after=sum((Decimal(r['new']) for r in rows), Decimal('0')),
    )
    _write(items, {r['id']: r['new'] for r in rows}, user, f'Bulk price change #{change.pk}: {change.description}')
    return change


def _write(items: list[Item], prices: dict[int, str], user, note: str) -> int:
    now = timezone.now()
    touched, history = [], []
    for item in items:
        if item.pk not in prices:
            continue
        old, item.price, item.updated_at = item.price, Decimal(prices[item.pk]), now
        touched.append(item)
        history.append(ItemHistory(item=item, event_type='price_change', old_value=str(old), new_value=str(item.price),
                                   note=note, created_by=user))
    Item.objects.bulk_update(touched, ['price', 'updated_at'], batch_size=1000)
    ItemHistory.objects.bulk_create(history, batch_size=1000)
    return len(touched)


@transaction.atomic
def undo(change: BulkPriceChange, user) -> dict[str, int]:
    """Put the old price back on every item that still holds the new one and is still on the shelf."""
    change = BulkPriceChange.objects.select_for_update().get(pk=change.pk)
    if change.undone_at:
        raise RuleError('This change was already undone.')
    by_id = {r['id']: r for r in change.changes}
    items = list(Item.objects.select_for_update().filter(pk__in=list(by_id), status='on_shelf'))
    back = {i.pk: by_id[i.pk]['old'] for i in items if str(i.price) == by_id[i.pk]['new']}
    restored = _write(items, back, user, f'Undo of bulk price change #{change.pk}')
    change.undone_at, change.undone_by = timezone.now(), user
    change.undo_result = {'restored': restored, 'left_alone': len(by_id) - restored}
    change.save(update_fields=['undone_at', 'undone_by', 'undo_result'])
    return change.undo_result


def recent(limit: int = 20) -> list[dict[str, Any]]:
    out = []
    for c in BulkPriceChange.objects.select_related('created_by', 'undone_by').order_by('-pk')[:limit]:
        out.append(summary(c))
    return out


def summary(c: BulkPriceChange, *, with_items: bool = False) -> dict[str, Any]:
    def name(u) -> str:
        return (getattr(u, 'first_name', '') or getattr(u, 'email', '') or '') if u else ''

    data = {
        'id': c.pk, 'description': c.description, 'item_count': c.item_count,
        'total_before': str(c.total_before), 'total_after': str(c.total_after),
        'created_at': c.created_at, 'created_by': name(c.created_by),
        'undone_at': c.undone_at, 'undone_by': name(c.undone_by), 'undo_result': c.undo_result or None,
    }
    if with_items:
        data['items'] = c.changes
    return data
