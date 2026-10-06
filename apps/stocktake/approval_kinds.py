"""Count data work the owner approves on Superuser → Requests (``apps.core.services.approval_requests``).

- ``stocktake.merge_counts``: merge one inventory into another, e.g. the 10-06 half of the first full count into the
  10-05 one (inventory_effort Phase 1). Undo puts it back.
- Data quality from an inventory (inventory_effort Phase 7; ``services/quality.py`` finds them, the inventory page's
  Data quality tab stages them):
  - ``stocktake.link_retagged_orders``: items retagged from the old system with no order get the order of their old
    tag (named in their notes). Undo unlinks them.
  - ``stocktake.keep_found_sold``: sold tags found on the shelf keep their tag; the old sale moves to a new item.
    Undo moves each sale back (unless the item changed since).
  - ``stocktake.back_on_shelf``: items found on the floor that the system has as scrapped, intake or lost go back on
    the shelf. Undo restores the old status (unless the item changed since).
"""
from __future__ import annotations

from apps.core.models import ApprovalRequest
from apps.core.services.approval_requests import Kind, Progress, register

from .services import merge as merge_service
from .services import quality


def _ids(params: dict) -> tuple[int, int]:
    try:
        return int(params['into']), int(params['from'])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError('params need "into" and "from" inventory ids.') from exc


def _merge_preview(params: dict) -> dict:
    into, src = _ids(params)
    info = merge_service.preview(into, src)
    f = info['from']
    people = ', '.join(f'{k} {v}' for k, v in sorted(f['runs_by_person'].items()))
    return {
        'counts': {
            f'Runs moving from "{f["name"]}"': f['runs'],
            'Scans moving': f['scans'],
            'Problems moving': f['issues'],
            'Runs still open (stopped at their last scan)': f['open_runs'],
            'Items counted in both (the later scan becomes "already")': info['counted_in_both'],
            'Items counted only in the second half': info['new_items_counted'],
        },
        'changes': [
            f'Moves every run, scan and problem of "{f["name"]}" (#{f["id"]}; runs by {people or "nobody"}) into '
            f'"{info["into"]["name"]}" (#{info["into"]["id"]}), so the inventory is one again.',
            'An item counted in both halves keeps its first scan as counted; the later one becomes "already".',
            f'Then deletes the empty #{f["id"]}. Undo recreates it with the same id and moves everything back.',
        ],
        'sample': [],
        'params': {'into': into, 'from': src},
    }


def _merge_apply(request: ApprovalRequest, progress: Progress) -> dict:
    into, src = _ids(request.params or {})
    result = merge_service.merge(into, src)
    progress.update(log=f"merged: {result.get('moved') or result.get('skipped')}")
    return result


def _merge_undo(request: ApprovalRequest) -> dict:
    return merge_service.undo(request.result or {})


register(Kind(
    kind='stocktake.merge_counts', label='Merge one inventory into another',
    preview=_merge_preview, apply=_merge_apply, undo=_merge_undo,
))


# --- data quality (inventory_effort Phase 7) ---------------------------------------------------------

CHUNK = 200
LINK_MARK = 'ORDER_FROM_OLD_TAG'


def _count(params: dict):
    from .models import InventoryCount

    try:
        return InventoryCount.objects.get(pk=int(params['count']))
    except (KeyError, TypeError, ValueError, InventoryCount.DoesNotExist) as exc:
        raise ValueError('params need "count", an inventory id.') from exc


def _sample(items, detail) -> list[dict]:
    return [{'sku': it.sku, 'title': it.product.title if it.product_id else '', 'status': it.status,
             'price': str(it.price), **detail(it)} for it in items]


def _link_preview(params: dict) -> dict:
    from collections import Counter

    from apps.inventory.models import Item

    links = quality.retag_links()
    items = Item.objects.filter(pk__in=list(links))
    by_status = Counter(items.values_list('status', flat=True))
    sold = sum(v or 0 for v in items.filter(status='sold').values_list('sold_for', flat=True))
    sample = _sample(items.select_related('product').order_by('-price')[:12],
                     lambda it: {'old tag': links[it.pk][2], 'order': links[it.pk][1]})
    return {
        'counts': {
            'Items with no order whose old tag has one': len(links),
            'Orders they go to': len({v[0] for v in links.values()}),
            **{f'Now {k}': v for k, v in by_status.most_common()},
            'Sales ($) that move under those orders': f'{sold:,.2f}',
        },
        'changes': [
            'Each item gets the order of the old-system item named in its notes (RETAGGED_FROM_DB2:<old tag>). '
            'Nothing else on the item changes: price, retail, cost and status stay.',
            'Its sales and its shelf value then count under that order on Orders and in order estimates.',
            'Each item gets a history line. Undo unlinks every item this request linked.',
        ],
        'sample': sample,
        'params': {},
    }


def _link_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.inventory.models import Item, ItemHistory

    links = quality.retag_links()          # only items still without an order: safe to run again
    ids = sorted(links)
    done = int((progress.state or {}).get('done') or 0)
    progress.update(total=done + len(ids), log=f'{len(ids)} items to link')
    for i in range(0, len(ids), CHUNK):
        chunk = ids[i:i + CHUNK]
        by_po: dict[int, list[int]] = {}
        for pk in chunk:
            by_po.setdefault(links[pk][0], []).append(pk)
        for po_id, pks in by_po.items():
            # A plain update: linking must not re-cost the whole order.
            Item.objects.filter(pk__in=pks, purchase_order__isnull=True).update(purchase_order_id=po_id)
        ItemHistory.objects.bulk_create([
            ItemHistory(item_id=pk, event_type='note', new_value=links[pk][1],
                        note=f'{LINK_MARK} {links[pk][2]} (Request #{request.pk}): order from the old tag',
                        created_by=request.decided_by)
            for pk in chunk
        ])
        done += len(chunk)
        progress.update(done=done, cursor=chunk[-1], log=f'linked {done}')
    return {'linked': done}


def _link_undo(request: ApprovalRequest) -> dict:
    from apps.inventory.models import Item, ItemHistory

    rows = list(ItemHistory.objects.filter(event_type='note', note__contains=f'(Request #{request.pk})')
                .values_list('item_id', 'new_value'))
    n = 0
    for item_id, order_number in rows:
        n += Item.objects.filter(pk=item_id, purchase_order__order_number=order_number).update(purchase_order=None)
    ItemHistory.objects.bulk_create([
        ItemHistory(item_id=item_id, event_type='note', old_value=order_number,
                    note=f'Order link from the old tag undone (Request #{request.pk})')
        for item_id, order_number in rows
    ])
    return {'unlinked': n}


def _sold_preview(params: dict) -> dict:
    from apps.inventory.models import Item
    from apps.inventory.services.duplicate_tag import why_not

    count = _count(params)
    ids, copies = quality.sold_fixable(count)
    items = list(Item.objects.filter(pk__in=ids).select_related('product').order_by('-price'))
    person = [it for it in items if why_not(it)]
    return {
        'counts': {
            f'Sold tags found on the shelf in "{count.name}"': len(items),
            'Moved by this request': len(items) - len(person),
            'Left for a person in PR Fix-it (consignment or online)': len(person),
            'Left alone: an old tag already retagged in the spring (take the old tag off)': len(copies),
            'Sales ($) that move to new item numbers': f'{sum((it.sold_for or 0) for it in items if it not in person):,.2f}',
        },
        'changes': [
            'Each tag stays on the shelf with its number; the item goes back to "on the shelf".',
            'Its old sale moves to a new item number (same product, same order; completed register lines and '
            'delivery jobs move with it). The money does not change.',
            'Its open "already sold" problems in this inventory are marked fixed.',
            'Undo moves each sale back, unless the item has sold again since.',
        ],
        'sample': _sample(items[:12], lambda it: {'sold': f'{it.sold_at:%Y-%m-%d}' if it.sold_at else '',
                                                   'sold for': str(it.sold_for or '')}),
        'params': {'count': count.pk},
    }


def _sold_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from django.utils import timezone

    from apps.inventory.models import Item
    from apps.inventory.services.duplicate_tag import move_sale_to_new_item, why_not

    from .models import Issue

    count = _count(request.params or {})
    state = progress.state or {}
    moved: list[list[int]] = list(state.get('moved') or [])
    skipped = int(state.get('skipped') or 0)
    ids, _copies = quality.sold_fixable(count)    # only tags still sold: safe to run again
    progress.update(total=len(moved) + len(ids), log=f'{len(ids)} sold tags to keep')
    for item in Item.objects.filter(pk__in=ids).order_by('pk'):
        if why_not(item):
            skipped += 1
            continue
        twin = move_sale_to_new_item(item, request.decided_by, where=f'inventory data quality, Request #{request.pk}')
        Issue.objects.filter(count=count, item=item, kind=Issue.KIND_ALREADY_SOLD, fixed_at__isnull=True).update(
            fix='move_sale', fixed_at=timezone.now(), fixed_by=request.decided_by, new_item=twin,
        )
        moved.append([item.pk, twin.pk])
        if len(moved) % 20 == 0:
            progress.update(done=len(moved), cursor=item.pk, moved=moved, skipped=skipped, log=f'moved {len(moved)}')
    progress.update(done=len(moved), moved=moved, skipped=skipped)
    return {'moved': moved, 'skipped': skipped}


def _sold_undo(request: ApprovalRequest) -> dict:
    from apps.inventory.models import Item
    from apps.inventory.services.duplicate_tag import undo_move_sale

    back = kept = 0
    for item_id, twin_id in (request.result or {}).get('moved') or []:
        item = Item.objects.filter(pk=item_id).first()
        twin = Item.objects.filter(pk=twin_id).first()
        if item and twin and undo_move_sale(item, twin, request.undone_by or request.decided_by):
            back += 1
        else:
            kept += 1
    return {'moved_back': back, 'left_as_is': kept}


def _shelf_preview(params: dict) -> dict:
    from collections import Counter

    from apps.inventory.models import Item

    count = _count(params)
    off, copies = quality.shelf_fixable(count)
    items = Item.objects.filter(pk__in=list(off)).select_related('product').order_by('-price')
    return {
        'counts': {
            f'Found on the floor in "{count.name}" but not on the shelf in the system': len(off),
            **{f'Now {k}': v for k, v in Counter(off.values()).most_common()},
            'Left alone: an old tag already retagged in the spring (take the old tag off)': len(copies),
        },
        'changes': [
            'Each item goes back to "on the shelf", with a history line. Price, order and everything else stay.',
            'Its open "not on the shelf" problems in this inventory are marked fixed.',
            'Undo puts back the old status, unless the item has changed since.',
        ],
        'sample': _sample(items[:12], lambda it: {}),
        'params': {'count': count.pk},
    }


def _shelf_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from django.utils import timezone

    from apps.inventory.models import Item

    from .models import Issue
    from .services.counting import _back_on_shelf

    count = _count(request.params or {})
    state = progress.state or {}
    restored: list[list] = list(state.get('restored') or [])
    off, _copies = quality.shelf_fixable(count)    # only items still off the shelf: safe to run again
    progress.update(total=len(restored) + len(off), log=f'{len(off)} items to put back')
    for item in Item.objects.filter(pk__in=list(off)).order_by('pk'):
        old = item.status
        _back_on_shelf(item, request.decided_by)
        Issue.objects.filter(count=count, item=item, kind=Issue.KIND_NOT_ON_SHELF, fixed_at__isnull=True).update(
            fix='put_on_shelf', fixed_at=timezone.now(), fixed_by=request.decided_by,
        )
        restored.append([item.pk, old])
    progress.update(done=len(restored), restored=restored, log=f'put back {len(restored)}')
    return {'restored': restored}


def _shelf_undo(request: ApprovalRequest) -> dict:
    from apps.inventory.models import Item, ItemHistory

    n = 0
    for item_id, old in (request.result or {}).get('restored') or []:
        if Item.objects.filter(pk=item_id, status='on_shelf').update(status=old):
            ItemHistory.objects.create(item_id=item_id, event_type='status_change', old_value='on_shelf', new_value=old,
                                       note=f'Back on the shelf undone (Request #{request.pk})')
            n += 1
    return {'restored_old_status': n}


register(Kind(
    kind='stocktake.link_retagged_orders', label='Link retagged items to their old orders',
    preview=_link_preview, apply=_link_apply, undo=_link_undo,
))
register(Kind(
    kind='stocktake.keep_found_sold', label='Keep sold tags found on the shelf (move the old sales)',
    preview=_sold_preview, apply=_sold_apply, undo=_sold_undo,
))
register(Kind(
    kind='stocktake.back_on_shelf', label='Put items found on the floor back on the shelf',
    preview=_shelf_preview, apply=_shelf_apply, undo=_shelf_undo,
))
