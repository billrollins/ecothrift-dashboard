"""PR Fix-it: what processing does with the problem items a count sends back.

Each fix changes the item (when needed), closes the problem, and returns the tag to print.

**One scan, one answer** (inventory_effort Phase 2, owner 2026-10-06): ``scan_fix`` finds the open problem for a
scanned tag and, when the right fix is certain, applies it and returns the tag to print with no click:

- duplicate tag (the item is sold, or was already counted): a new item from the same product, new tag;
- the system says it is not on the shelf (intake, lost, scrapped) but it is here: back on the shelf, counted;
- a bad tag: reprint;
- a price the counter already wrote down: set it, reprint.

Wrong title, a price with no number, and items with no tag need one answer; ``product_options`` lists products
for them, with a one-tap **claim** of an item of that product that the inventory has not found yet (it leaves the
potential shrink). **Shrink** marks an item stolen, broken or scrap, and can salvage it as a new item.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.inventory.models import Item, ItemHistory, Product
from apps.inventory.services.resale_duplicate import duplicate_item_for_resale

from ..models import CountScan, Issue
from .counting import BadRequest, counted_ids, expected_ids, issue_payload, issues_qs, item_payload, label_for, normalize_code

FIXES = {
    'reprint', 'edit', 'print_as_new', 'put_on_shelf', 'use_item', 'quick_add', 'moved', 'dismiss',
    'shrink', 'set_product', 'new_from_product', 'move_sale',
}
SHRINK_REASONS = {'stolen': 'lost', 'broken': 'scrapped', 'scrap': 'scrapped'}
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
        elif fix == 'shrink':
            item = _need_item(issue)
            reason = str(data.get('reason') or '')
            if reason not in SHRINK_REASONS:
                raise BadRequest('Pick why: stolen, broken or scrap.')
            if item.status == 'sold':
                raise BadRequest('This item was sold; it cannot be shrink.')
            old = item.status
            item.status = SHRINK_REASONS[reason]
            item.save(update_fields=['status', 'search_text', 'updated_at'])
            ItemHistory.objects.create(
                item=item, event_type='status_change', old_value=old, new_value=item.status,
                note=f'{NOTE}: shrink ({reason})', created_by=user,
            )
            if data.get('salvage_price') not in (None, ''):
                printed = duplicate_item_for_resale(user, item)
                printed.condition = 'salvage'
                printed.save(update_fields=['condition', 'updated_at'])
                _set_price(printed, _money(data['salvage_price'], 'Salvage price'), user)
                issue.new_item = printed
            data = {**data, 'note': data.get('note') or f'shrink: {reason}'}
        elif fix == 'move_sale':
            # Two items, one tag: this one is real. Keep its tag; the old sale moves to a new item number.
            from apps.inventory.services.duplicate_tag import move_sale_to_new_item, why_not

            item = _need_item(issue)
            if item.status != 'sold':
                raise BadRequest('The system does not call this one sold.')
            if why_not(item):
                raise BadRequest('A consignment or online item: print it as new instead.')
            issue.new_item = move_sale_to_new_item(item, user, where='PR Fix-it')
            _count_it(issue, Item.objects.get(pk=item.pk))
        elif fix == 'set_product':
            item = _need_item(issue)
            product = Product.objects.filter(pk=data.get('product_id')).first()
            if product is None:
                raise BadRequest('Pick the right product.')
            if product.pk != item.product_id:
                old = item.product.title
                item.product = product
                item.save()  # rebuilds the search text
                ItemHistory.objects.create(
                    item=item, event_type='note', old_value=old[:300], new_value=product.title[:300],
                    note=f'{NOTE}: right product', created_by=user,
                )
            printed = item
        elif fix == 'new_from_product':
            product = Product.objects.filter(pk=data.get('product_id')).first()
            if product is None:
                raise BadRequest('Pick the product.')
            like = product.items.order_by('-created_at').first()
            if like is None:
                raise BadRequest('This product has no items to copy. Add it as a new item instead.')
            printed = duplicate_item_for_resale(user, like)
            if data.get('price') not in (None, ''):
                _set_price(printed, _money(data['price'], 'Price'), user)
            issue.new_item = printed
            issue.item = issue.item or printed
            _count_it(issue, printed)
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


# --- one scan, one answer -------------------------------------------------------------------------

def _price_in(detail: str) -> str | None:
    """A price the counter typed with the problem ("should be 12.99", "$8"), when there is exactly one."""
    import re

    found = re.findall(r'\$?\s*(\d{1,5}(?:\.\d{1,2})?)', detail or '')
    return found[0] if len(found) == 1 else None


def auto_fix(issue: Issue) -> tuple[str, dict, bool] | None:
    """The fix a scan alone can make for this problem: ``(fix, data, print)``, or None when it needs an answer."""
    item = issue.item
    if item is None:
        return None
    if item.status == 'sold':
        # The tag in hand stays; the old sale moves to a new number (owner, 2026-10-06). Nothing to print.
        from apps.inventory.services.duplicate_tag import why_not

        return ('move_sale', {}, False) if why_not(item) is None else None
    if issue.kind == Issue.KIND_ALREADY_SCANNED:
        return ('print_as_new', {}, True)
    if issue.kind == Issue.KIND_NOT_ON_SHELF and item.status != 'on_shelf':
        return ('put_on_shelf', {}, False)
    if issue.kind == Issue.KIND_WRONG_TAG:
        return ('reprint', {}, True)
    if issue.kind in (Issue.KIND_PRICE_HIGH, Issue.KIND_PRICE_LOW):
        price = _price_in(issue.detail)
        return ('edit', {'price': price}, True) if price else None
    if issue.kind == Issue.KIND_NOT_ON_SHELF:
        return ('reprint', {}, True)
    return None


def _open_issues_for(code: str, item: Item | None):
    qs = issues_qs().filter(action=Issue.ACTION_PR_CART, fixed_at__isnull=True)
    match = Q(code=code)
    if item is not None:
        match |= Q(item=item)
    return qs.filter(match).order_by('created_at', 'pk')


def scan_fix(code: str, *, user) -> dict:
    """PR Fix-it scan: fix it when the fix is certain; otherwise say which problem needs an answer."""
    code = normalize_code(code)
    if not code:
        raise BadRequest('Scan a tag.')
    item = Item.objects.select_related('product').filter(sku=code).first()
    issue = _open_issues_for(code, item).first()
    if issue is None:
        return {
            'status': 'no_problem' if item else 'unknown',
            'item': item_payload(item),
            'label': label_for(item),
            'message': 'No open problem for this tag.' if item else 'No item and no open problem has this code.',
        }
    decided = auto_fix(issue)
    if decided is None:
        return {'status': 'needs_input', 'issue': issue_payload(issue), 'message': 'This one needs an answer.'}
    fix, data, wants_print = decided
    label = fix_issue(issue, user=user, fix=fix, data=data)
    issue = issues_qs().get(pk=issue.pk)
    words = {
        'print_as_new': f'New tag {issue.new_item.sku if issue.new_item else ""}: this tag was a duplicate.',
        'move_sale': f'Kept here with its tag; the old sale moved to {issue.new_item.sku if issue.new_item else "a new item"}.',
        'put_on_shelf': 'Back on the shelf and counted. The tag is fine.',
        'reprint': 'Tag reprinted.',
        'edit': f'Price set to ${data.get("price")}. New tag printed.',
    }
    return {
        'status': 'fixed', 'fix': fix, 'print': wants_print and label is not None, 'label': label,
        'issue': issue_payload(issue), 'message': words.get(fix, 'Fixed.'),
    }


def product_options(q: str, *, issue: Issue | None = None, limit: int = 8) -> list[dict]:
    """Products matching the words, each with its last price and the items of it the open inventory has not
    found yet (the first can be claimed: the physical item becomes that item and leaves the potential shrink)."""
    words = [w for w in (q or '').strip().lower().split() if w][:6]
    if not words or sum(len(w) for w in words) < 2:
        return []
    qs = Product.objects.all()
    for w in words:
        qs = qs.filter(search_text__icontains=w)
    products = list(qs.order_by('-updated_at')[:limit])
    count = issue.count if issue is not None else None
    missing: set[int] = set()
    if count is not None:
        seen = counted_ids(count)
        missing = expected_ids(count, seen) - seen
    out = []
    for p in products:
        items = p.items.order_by('-created_at')
        last = items.first()
        shelf = items.filter(status='on_shelf').order_by('checked_in_at', 'pk').values_list('pk', 'sku')
        unfound = [(pk, sku) for pk, sku in shelf if pk in missing]
        brand = (p.brand or '').strip()
        out.append({
            'product_id': p.pk,
            'title': p.title,
            'brand': brand if brand.lower() != 'generic' else '',
            'product_number': p.product_number or '',
            'price': str(last.price) if last else None,
            'retail': str(last.retail) if last and last.retail is not None else None,
            'not_found': len(unfound),
            'claim_item_id': unfound[0][0] if unfound else None,
            'claim_sku': unfound[0][1] if unfound else None,
            'can_copy': last is not None,
        })
    out.sort(key=lambda r: -r['not_found'])
    return out
