"""Data quality from an inventory (inventory_effort Phase 7, 2026-10-06): the data errors a count exposes, each
with how many, examples, and the fix.

A fix that can be done in bulk is a **Request** the owner approves on Superuser → Requests (``approval_kinds.py``),
with a preview and an undo. The rest are handled by a rule (``extended/data-quality.md``) or one by one in PR Fix-it.

- **No order, retagged from the old system:** in March and April 2026 old-system (DB2) items were given new tags.
  The new item has no order, but its notes keep the old tag (``RETAGGED_FROM_DB2:<old tag>``), and the old tag's
  item has the order. Linking the new item to that order is a recorded fact, not a guess.
- **A sold tag found on the shelf** (scanned before "no errors", v2.138.0): two items shared the tag; the fix keeps
  the tag here and moves the old sale to a new item number (``duplicate_tag.move_sale_to_new_item``).
- **Found on the floor, but the system has it as scrapped, intake or lost** (also before v2.138.0): back on the shelf.
- The rest (no retail, price above retail, maker's barcodes scanned, two items with one tag...) are listed with
  their rule or their PR Fix-it path.
"""
from __future__ import annotations

import re
from collections import Counter
from decimal import Decimal
from typing import Any

from django.db.models import F, Min, Q, Sum

from apps.inventory.models import Item

from ..models import CountScan, InventoryCount, Issue
from .counting import good_scans

RETAG_RX = re.compile(r'RETAGGED_FROM_DB2:([A-Za-z0-9]+)')
EXAMPLES = 8
ZERO = Decimal('0')

REQUEST_KINDS = {
    'retagged_no_order': 'stocktake.link_retagged_orders',
    'sold_found': 'stocktake.keep_found_sold',
    'off_shelf_found': 'stocktake.back_on_shelf',
}


def _m(v) -> str:
    return str((v or ZERO).quantize(Decimal('0.01')))


def _rows(qs, detail=None, n: int = EXAMPLES) -> list[dict]:
    out = []
    for it in qs.select_related('product', 'purchase_order')[:n]:
        out.append({
            'id': it.pk, 'sku': it.sku, 'title': it.product.title if it.product_id else '', 'status': it.status,
            'price': _m(it.price), 'retail': _m(it.retail) if it.retail is not None else None,
            'order': it.purchase_order.order_number if it.purchase_order_id else '',
            'detail': detail(it) if detail else '',
        })
    return out


# --- the three bulk fixes: who they touch -----------------------------------------------------------

def retag_links(ids=None) -> dict[int, tuple[int, str, str]]:
    """Items with no order whose notes name an old-system tag that has one: ``{item_id: (po_id, order, old_tag)}``."""
    qs = Item.objects.filter(purchase_order__isnull=True, notes__contains='RETAGGED_FROM_DB2:')
    if ids is not None:
        qs = qs.filter(pk__in=list(ids))
    old_of: dict[int, str] = {}
    for pk, notes in qs.values_list('pk', 'notes'):
        m = RETAG_RX.search(notes or '')
        if m:
            old_of[pk] = m.group(1)
    orders = {
        sku: (po_id, number)
        for sku, po_id, number in Item.objects.filter(sku__in=set(old_of.values()), purchase_order__isnull=False)
        .values_list('sku', 'purchase_order_id', 'purchase_order__order_number')
    }
    return {pk: (*orders[old], old) for pk, old in old_of.items() if old in orders}


def found_sold_ids(count: InventoryCount) -> list[int]:
    """Tags the system called sold that were scanned on the floor and are still sold (sold before the scan)."""
    first = dict(
        good_scans(count).filter(item_status='sold', item__isnull=False)
        .values('item_id').annotate(at=Min('scanned_at')).values_list('item_id', 'at')
    )
    out = []
    for pk, sold_at in Item.objects.filter(pk__in=list(first), status='sold').values_list('pk', 'sold_at'):
        if sold_at is None or sold_at <= first[pk]:
            out.append(pk)
    return sorted(out)


def off_shelf_found_ids(count: InventoryCount) -> dict[int, str]:
    """Items scanned on the floor that the system still has as scrapped, intake, lost...: ``{item_id: status}``."""
    scanned = set(
        good_scans(count).filter(item__isnull=False).exclude(item_status__in=['on_shelf', 'sold'])
        .values_list('item_id', flat=True)
    )
    return dict(Item.objects.filter(pk__in=list(scanned)).exclude(status__in=['on_shelf', 'sold']).values_list('pk', 'status'))


def retagged_copies(item_ids) -> dict[int, list[str]]:
    """Old-system items that were already given a new tag in the spring: ``{item_id: [new tags]}``. Putting the
    old row back on the shelf would count the item twice, so a person takes the old tag off instead."""
    skus = dict(Item.objects.filter(pk__in=list(item_ids)).values_list('sku', 'pk'))
    out: dict[int, list[str]] = {}
    for new_sku, notes in Item.objects.filter(notes__contains='RETAGGED_FROM_DB2:').filter(
        Q(*[Q(notes__contains=f'RETAGGED_FROM_DB2:{sku}') for sku in skus], _connector=Q.OR) if skus else Q(pk__in=[]),
    ).values_list('sku', 'notes'):
        m = RETAG_RX.search(notes or '')
        if m and m.group(1) in skus:
            out.setdefault(skus[m.group(1)], []).append(new_sku)
    return out


def shelf_fixable(count: InventoryCount) -> tuple[dict[int, str], dict[int, list[str]]]:
    """What "back on the shelf" fixes, and what it leaves for a person (an old tag that was retagged already)."""
    off = off_shelf_found_ids(count)
    copies = retagged_copies(off)
    return {pk: st for pk, st in off.items() if pk not in copies}, copies


def sold_fixable(count: InventoryCount) -> tuple[list[int], dict[int, list[str]]]:
    """The sold tags "keep the tag" fixes, and old tags it leaves alone (retagged already)."""
    ids = found_sold_ids(count)
    copies = retagged_copies(ids)
    return [pk for pk in ids if pk not in copies], copies


# --- the findings -----------------------------------------------------------------------------------

def _requests(kind: str, count_id: int | None) -> list[dict]:
    from apps.core.models import ApprovalRequest

    qs = ApprovalRequest.objects.filter(kind=kind).order_by('-created_at')
    out = []
    for r in qs[:20]:
        params = r.params or {}
        if count_id is not None and 'count' in params and int(params['count']) != count_id:
            continue
        out.append({'id': r.pk, 'status': r.status, 'created_at': r.created_at})
    return out[:3]


def findings(count: InventoryCount) -> dict[str, Any]:
    from .report import counted_ok_ids
    from .shrink import missing_ids

    ok = counted_ok_ids(count)
    missing = missing_ids(count)
    counted = Item.objects.filter(pk__in=list(ok))
    scans = good_scans(count)
    out: list[dict] = []

    def add(key, title, what, n, *, money=None, examples=None, fix, register='', extra=None):
        row = {
            'key': key, 'title': title, 'what': what, 'n': n, 'money': money, 'examples': examples or [],
            'fix': fix, 'register': register, **(extra or {}),
        }
        if key in REQUEST_KINDS:
            row['fix']['request_kind'] = REQUEST_KINDS[key]
            row['requests'] = _requests(REQUEST_KINDS[key], count.pk if key != 'retagged_no_order' else None)
        out.append(row)

    # 1. No order, but the old tag says which.
    links = retag_links()
    linked = Item.objects.filter(pk__in=list(links))
    by_status = Counter(linked.values_list('status', flat=True))
    shelf_price = linked.filter(status='on_shelf').aggregate(s=Sum('price'))['s']
    add(
        'retagged_no_order', 'No order, but the old tag says which',
        f'{len(links):,} items were retagged from the old system in March and April with no order. Each keeps its old '
        f'tag in its notes, and the old tag has the order. {by_status.get("on_shelf", 0):,} are on the shelf '
        f'({len(set(links) & ok):,} counted, {len(set(links) & missing):,} not found), {by_status.get("sold", 0):,} sold. '
        f'Linking them puts them, and their sales, under their real orders.',
        len(links), money=_m(shelf_price),
        examples=_rows(linked.order_by('-price'), lambda it: f'old tag {links[it.pk][2]} → {links[it.pk][1]}'),
        fix={'kind': 'request', 'label': 'Link them to their orders'}, register='ITM-16',
        extra={'by_status': dict(by_status)},
    )

    # 2. Sold tags found on the shelf.
    from apps.inventory.services.duplicate_tag import why_not

    sold_ids, sold_copies = sold_fixable(count)
    sold_items = Item.objects.filter(pk__in=sold_ids)
    needs_person = [it.sku for it in sold_items if why_not(it)]
    add(
        'sold_found', 'Sold tags found on the shelf',
        f'{len(sold_ids):,} tags the system calls sold were scanned on the floor and are still sold. Two items shared '
        f'each tag; the one on the shelf is real. The fix keeps each tag on the shelf and moves its old sale to a new '
        f'item number (the money does not change).'
        + (f' {len(needs_person)} need a person (consignment or online) and are left for PR Fix-it.' if needs_person else '')
        + (f' {len(sold_copies)} old tags were retagged already in the spring: take the old tag off.' if sold_copies else ''),
        len(sold_ids), money=_m(sold_items.aggregate(s=Sum('price'))['s']),
        examples=_rows(sold_items.order_by('-price'), lambda it: f'sold {it.sold_at:%b %d}' if it.sold_at else 'sold, no date'),
        fix={'kind': 'request', 'label': 'Keep the tags, move the old sales'}, register='SHR-05',
    )

    # 3. Found on the floor; the system has it elsewhere.
    off, copies = shelf_fixable(count)
    statuses = ', '.join(f'{st} ({n})' for st, n in Counter(off.values()).most_common())
    copy_skus = {pk: tags for pk, tags in copies.items()}
    add(
        'off_shelf_found', 'Found on the floor, but the system has it elsewhere',
        f'{len(off):,} items were scanned on the floor while the system has them as {statuses or "something else"}. '
        f'They go back on the shelf.'
        + (f' {len(copies)} more carry an old tag that was already retagged in the spring (the new tag is on the '
           f'shelf): take the old tag off; nothing to change in the data.' if copies else ''),
        len(off), money=_m(Item.objects.filter(pk__in=list(off)).aggregate(s=Sum('price'))['s']),
        examples=_rows(Item.objects.filter(pk__in=list(off) + list(copies)).order_by('-price'),
                       lambda it: f'already retagged as {", ".join(copy_skus[it.pk])}: take the old tag off'
                       if it.pk in copy_skus else f'system: {it.status}'),
        fix={'kind': 'request', 'label': 'Put them back on the shelf'}, register='SHR-06',
    )

    # 4. No order and nothing says which.
    no_order = Item.objects.filter(status='on_shelf', purchase_order__isnull=True).exclude(pk__in=list(links))
    add(
        'no_order_other', 'No order, and nothing says which',
        f'{no_order.count():,} items on the shelf have no order and no old tag. Most were added by hand in March and '
        f'April. They stay "No order": costs unknown, left out of order estimates.',
        no_order.count(), money=_m(no_order.aggregate(s=Sum('price'))['s']),
        examples=_rows(no_order.order_by('-price')),
        fix={'kind': 'rule', 'how': 'Shown as "No order" everywhere. A purchased item gets its order at check-in.'},
        register='ITM-04',
    )

    # 5. Counted with no retail.
    no_retail = counted.filter(Q(retail__isnull=True) | Q(retail__lte=0))
    top = Counter(no_retail.values_list('purchase_order__order_number', flat=True)).most_common(3)
    add(
        'no_retail', 'Counted with no retail',
        f'{no_retail.count():,} counted items have no retail price, so "price % of retail" leaves them out. Most come '
        f'from ' + ', '.join(f'{o or "no order"} ({n})' for o, n in top) + '.',
        no_retail.count(), money=_m(no_retail.aggregate(s=Sum('price'))['s']),
        examples=_rows(no_retail.order_by('-price')),
        fix={'kind': 'rule', 'how': 'Left out of the retail numbers. Add the retail when the item is edited.'},
        register='ITM-08',
    )

    # 6. Price above retail; 7. price 0.
    over = counted.filter(retail__gt=0, price__gt=F('retail'))
    add(
        'price_over_retail', 'Priced above retail',
        f'{over.count():,} counted items are priced above their retail. The retail looks typed in cents or for one '
        f'piece of a pack ($0.42 retail on $4.99 sandals).',
        over.count(), examples=_rows(over.order_by('-price')),
        fix={'kind': 'by_hand', 'how': 'Fix the retail on each item (Search → the item → edit).'}, register='ITM-10',
    )
    zero = counted.filter(Q(price__isnull=True) | Q(price__lte=0))
    add(
        'price_zero', 'Price $0',
        f'{zero.count():,} counted items have a price of $0.',
        zero.count(), examples=_rows(zero),
        fix={'kind': 'by_hand', 'how': 'Price it in PR Fix-it → Quick reprice.'}, register='ITM-07',
    )

    # 8. Two items with one tag: the same tag scanned again in another session.
    first: dict[int, tuple[int, int]] = {}
    for item_id, run_id, section_id in scans.filter(result=CountScan.RESULT_OK, item__isnull=False).order_by('scanned_at', 'id').values_list('item_id', 'run_id', 'run__section_id'):
        first.setdefault(item_id, (run_id, section_id))
    again = Counter()
    twice: set[int] = set()
    for item_id, run_id, section_id in scans.filter(result=CountScan.RESULT_ALREADY, item__isnull=False).values_list('item_id', 'run_id', 'run__section_id'):
        f = first.get(item_id)
        if f is None:
            continue
        if f[0] == run_id:
            again['same'] += 1
        else:
            again['other'] += 1
            twice.add(item_id)
    in_carts = count.issues.filter(kind=Issue.KIND_ALREADY_SCANNED, action=Issue.ACTION_PR_CART, fixed_at__isnull=True).count()
    add(
        'two_tags', 'The same tag in two places',
        f'{len(twice):,} tags were scanned again in another session (another section or another person), so two items '
        f'may share each tag. {again["same"]:,} more repeats were in the same session: a double scan, not an error. '
        f'{in_carts:,} are in PR carts, where scanning one prints it a new tag.',
        len(twice), examples=_rows(Item.objects.filter(pk__in=list(twice))),
        fix={'kind': 'pr_fixit', 'how': 'PR Fix-it: scan the tag, a new tag prints.'}, register='',
    )

    # 9. Not our tag; 10. our tag format, no item.
    bad = scans.filter(result=CountScan.RESULT_BAD_FORMAT)
    codes = Counter(bad.values_list('code', flat=True))
    add(
        'not_our_tag', "Not our tag (the maker's barcode)",
        f"{bad.count():,} scans ({len(codes):,} different codes) were a maker's barcode or an old code, not an ITM tag. "
        f'Nothing in the data is wrong; the count answers "not our tag".',
        bad.count(),
        examples=[{'id': None, 'sku': c, 'title': f'scanned {n}×', 'status': '', 'price': None, 'retail': None,
                   'order': '', 'detail': ''} for c, n in codes.most_common(EXAMPLES)],
        fix={'kind': 'none', 'how': 'Scan the ITM tag, not the barcode on the box.'}, register='',
    )
    unknown = scans.filter(result=CountScan.RESULT_UNKNOWN)
    ucodes = Counter(unknown.values_list('code', flat=True))
    add(
        'unknown_tag', 'Our tag, but no such item',
        f'{len(ucodes):,} ITM tags ({unknown.count():,} scans) have no item: printed, then never saved.',
        len(ucodes),
        examples=[{'id': None, 'sku': c, 'title': f'scanned {n}×', 'status': '', 'price': None, 'retail': None,
                   'order': '', 'detail': ''} for c, n in ucodes.most_common(EXAMPLES)],
        fix={'kind': 'pr_fixit', 'how': 'PR Fix-it: find the product and print, or add it.'}, register='',
    )

    # 11. Counted, then sold (normal).
    sold_since = Item.objects.filter(pk__in=list(ok), status='sold').count()
    add(
        'sold_since', 'Counted, then sold',
        f'{sold_since:,} counted items sold after they were counted. Normal: the store was open.',
        sold_since, fix={'kind': 'none', 'how': 'Nothing to fix.'}, register='',
    )
    return {'count': {'id': count.pk, 'name': count.name}, 'findings': out}
