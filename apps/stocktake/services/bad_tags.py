"""Bad tags: a wrong tag found on the floor, traced back and sent to PR Fix-it (retail_tags_and_social Phase 1).

Staff scan the tag from a section check, a cross-check, the register, Today, or the fresh-tag spot check, and pick
why: retail overstated, wrong item, price too high, price too low, tag missing or unreadable. ``record`` copies the
trace (who checked it in, the PO, the manifest row, the pallet, what the tag said) and opens an Issue with no count,
so the item is on PR Fix-it. The "Tag incorrect" tally on a section walk stays as the count; the scan is the record.

Retail QA reads ``week_summary`` (tag errors by processor and by truck); Processing reads ``bad_tag_list`` (theirs).
"""
from __future__ import annotations

import base64
import re
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.inventory.models import Item

from ..models import BadTag, Issue
from .counting import BadRequest, item_payload, normalize_code, person

KIND_FOR_REASON = {
    BadTag.REASON_RETAIL_HIGH: Issue.KIND_RETAIL_HIGH,
    BadTag.REASON_WRONG_ITEM: Issue.KIND_WRONG_TITLE,
    BadTag.REASON_PRICE_HIGH: Issue.KIND_PRICE_HIGH,
    BadTag.REASON_PRICE_LOW: Issue.KIND_PRICE_LOW,
    BadTag.REASON_MISSING: Issue.KIND_NO_TAG,
}
REASON_ES = {
    BadTag.REASON_RETAIL_HIGH: 'Precio de lista inflado',
    BadTag.REASON_WRONG_ITEM: 'Articulo equivocado',
    BadTag.REASON_PRICE_HIGH: 'Precio muy alto',
    BadTag.REASON_PRICE_LOW: 'Precio muy bajo',
    BadTag.REASON_MISSING: 'Falta etiqueta o no se lee',
}
_DATA_URL = re.compile(r'^data:(image/[a-z+.-]+);base64,(.+)$', re.IGNORECASE | re.DOTALL)
_MAX_PHOTO_BYTES = 8 * 1024 * 1024


def reasons() -> list[dict]:
    return [{'key': k, 'label': label, 'label_es': REASON_ES[k]} for k, label in BadTag.REASON_CHOICES]


def _money(value, name: str) -> Decimal | None:
    if value in (None, ''):
        return None
    try:
        amount = Decimal(str(value).replace('$', '').strip()).quantize(Decimal('0.01'))
    except (InvalidOperation, TypeError, ValueError):
        raise BadRequest(f'{name} must be a number.')
    if amount < 0 or amount > Decimal('99999.99'):
        raise BadRequest(f'{name} is out of range.')
    return amount


def _store_photo(bad: BadTag, photo, user) -> None:
    from apps.core.files import save_upload

    if not isinstance(photo, str):
        return
    match = _DATA_URL.match(photo.strip())
    if not match:
        return
    try:
        raw = base64.b64decode(match.group(2))
    except (ValueError, TypeError):
        return
    if not raw or len(raw) > _MAX_PHOTO_BYTES:
        return
    content_type = match.group(1).lower()
    ext = '.png' if 'png' in content_type else '.jpg'
    uploaded = ContentFile(raw, name=f'bad-tag{ext}')
    uploaded.content_type = content_type
    bad.photo = save_upload(uploaded, user=user, key_prefix=f'stocktake/bad-tags/{bad.pk}')
    bad.save(update_fields=['photo'])


def _issue_detail(reason: str, detail: str, right_price, right_retail) -> str:
    parts = []
    if right_price is not None and reason in (BadTag.REASON_PRICE_HIGH, BadTag.REASON_PRICE_LOW):
        parts.append(f'should be ${right_price}')
    if right_retail is not None and reason == BadTag.REASON_RETAIL_HIGH:
        parts.append(f'retail should be ${right_retail}')
    if detail:
        parts.append(detail)
    return '; '.join(parts)[:300]


def record(
    *,
    user,
    code: str,
    reason: str,
    where: str,
    detail: str = '',
    right_price=None,
    right_retail=None,
    photo=None,
    routine_run=None,
) -> BadTag:
    """One bad tag, traced, with its PR Fix-it row. A second report of the same open problem returns the first."""
    if reason not in KIND_FOR_REASON:
        raise BadRequest('Pick what is wrong with the tag.')
    if where not in dict(BadTag.WHERE_CHOICES):
        raise BadRequest('Unknown place.')
    code = normalize_code(code)
    detail = str(detail or '').strip()[:300]
    right_price = _money(right_price, 'Right price')
    right_retail = _money(right_retail, 'Right retail')
    item = Item.objects.select_related('product').filter(sku=code).first() if code else None
    if item is None and reason != BadTag.REASON_MISSING:
        raise BadRequest('No item has this tag. Pick "Tag missing or unreadable" and say what it is.' if code
                         else 'Scan the tag first.')
    if item is None and not detail:
        raise BadRequest('Say what the item is, so Processing can find it.')
    if item is not None:
        open_same = BadTag.objects.filter(item=item, reason=reason, issue__fixed_at__isnull=True).first()
        if open_same is not None:
            return open_same
    with transaction.atomic():
        now = timezone.now()
        issue = Issue.objects.create(
            count=None, run=None, item=item, code=code, kind=KIND_FOR_REASON[reason], action=Issue.ACTION_PR_CART,
            detail=_issue_detail(reason, detail, right_price, right_retail), created_by=user, answered_at=now,
        )
        bad = BadTag.objects.create(
            item=item, code=code, reason=reason, found_where=where, detail=detail,
            right_price=right_price, right_retail=right_retail, routine_run=routine_run, found_by=user,
            checked_in_by_id=item.checked_in_by_id if item else None,
            checked_in_at=item.checked_in_at if item else None,
            purchase_order_id=item.purchase_order_id if item else None,
            manifest_row_id=item.manifest_row_id if item else None,
            pallet_id=item.pallet_id if item else None,
            tag_price=item.price if item else None,
            tag_retail=item.retail if item else None,
            retail_check=(item.retail_check or '') if item else '',
            issue=issue,
        )
    _store_photo(bad, photo, user)
    return bad


def bad_tags_qs():
    return BadTag.objects.select_related(
        'item__product', 'found_by', 'checked_in_by', 'purchase_order', 'manifest_row', 'pallet', 'issue',
        'issue__fixed_by',
    )


def trace_payload(bad: BadTag) -> dict:
    po = bad.purchase_order
    return {
        'checked_in_by': person(bad.checked_in_by),
        'checked_in_by_id': bad.checked_in_by_id,
        'checked_in_at': bad.checked_in_at,
        'purchase_order_id': bad.purchase_order_id,
        'order_number': po.order_number if po else '',
        'manifest_row_id': bad.manifest_row_id,
        'manifest_row_number': bad.manifest_row.row_number if bad.manifest_row_id and bad.manifest_row else None,
        'pallet': (
            {'id': bad.pallet_id, 'number': bad.pallet.number, 'code': bad.pallet.code} if bad.pallet_id and bad.pallet
            else None
        ),
    }


def bad_tag_payload(bad: BadTag) -> dict:
    issue = bad.issue
    return {
        'id': bad.pk,
        'code': bad.code,
        'reason': bad.reason,
        'reason_label': bad.get_reason_display(),
        'reason_label_es': REASON_ES.get(bad.reason, ''),
        'where': bad.found_where,
        'where_label': bad.get_found_where_display(),
        'detail': bad.detail,
        'right_price': str(bad.right_price) if bad.right_price is not None else None,
        'right_retail': str(bad.right_retail) if bad.right_retail is not None else None,
        'photo_url': f'/api/stocktake/bad-tags/{bad.pk}/photo/' if bad.photo_id else None,
        'found_by': person(bad.found_by),
        'found_at': bad.found_at,
        'tag_price': str(bad.tag_price) if bad.tag_price is not None else None,
        'tag_retail': str(bad.tag_retail) if bad.tag_retail is not None else None,
        'retail_check': bad.retail_check,
        'item': item_payload(bad.item),
        'trace': trace_payload(bad),
        'issue_id': bad.issue_id,
        'fixed_at': issue.fixed_at if issue else None,
        'fixed_by': person(issue.fixed_by) if issue else '',
        'fix': issue.fix if issue else '',
    }


def week_bounds(monday: date) -> tuple[datetime, datetime]:
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(monday, time.min), tz)
    return start, start + timedelta(days=7)


def bad_tag_list(*, user=None, monday: date | None = None, processor_id=None, po_id=None, reason='',
                 show='all', limit: int = 300) -> tuple[list[dict], bool]:
    """Newest first, and whether more than ``limit`` matched. ``user`` keeps it to tags this person checked in
    or found (staff who are not managers)."""
    qs = bad_tags_qs()
    if user is not None:
        qs = qs.filter(Q(checked_in_by=user) | Q(found_by=user))
    if monday is not None:
        start, end = week_bounds(monday)
        qs = qs.filter(found_at__gte=start, found_at__lt=end)
    if processor_id:
        qs = qs.filter(checked_in_by_id=processor_id)
    if po_id:
        qs = qs.filter(purchase_order_id=po_id)
    if reason in KIND_FOR_REASON:
        qs = qs.filter(reason=reason)
    if show == 'open':
        qs = qs.filter(issue__fixed_at__isnull=True)
    elif show == 'fixed':
        qs = qs.filter(issue__fixed_at__isnull=False)
    rows = list(qs[:limit + 1])
    return [bad_tag_payload(b) for b in rows[:limit]], len(rows) > limit


def week_summary(monday: date) -> dict:
    """Tag errors found this week, by processor and by truck, with the reasons."""
    start, end = week_bounds(monday)
    rows = list(bad_tags_qs().filter(found_at__gte=start, found_at__lt=end))
    by_reason: dict[str, int] = defaultdict(int)
    procs: dict = {}
    trucks: dict = {}
    for bad in rows:
        by_reason[bad.reason] += 1
        pkey = bad.checked_in_by_id or 0
        p = procs.setdefault(pkey, {
            'user_id': bad.checked_in_by_id, 'name': person(bad.checked_in_by) or 'No processor',
            'count': 0, 'by_reason': defaultdict(int),
        })
        p['count'] += 1
        p['by_reason'][bad.reason] += 1
        tkey = bad.purchase_order_id or 0
        t = trucks.setdefault(tkey, {
            'purchase_order_id': bad.purchase_order_id,
            'order_number': bad.purchase_order.order_number if bad.purchase_order else 'No truck',
            'count': 0, 'by_reason': defaultdict(int),
        })
        t['count'] += 1
        t['by_reason'][bad.reason] += 1
    # Context for a rate: tags each processor checked in that week.
    checked = defaultdict(int)
    for uid in Item.objects.filter(checked_in_at__gte=start, checked_in_at__lt=end).values_list('checked_in_by_id', flat=True):
        checked[uid or 0] += 1
    processors = []
    for key, p in procs.items():
        processors.append({**p, 'by_reason': dict(p['by_reason']), 'checked_in_this_week': checked.get(key, 0)})
    processors.sort(key=lambda r: (-r['count'], r['name']))
    truck_rows = [{**t, 'by_reason': dict(t['by_reason'])} for t in trucks.values()]
    truck_rows.sort(key=lambda r: (-r['count'], r['order_number']))
    return {
        'week_start': monday.isoformat(),
        'total': len(rows),
        'open': sum(1 for b in rows if b.issue is not None and b.issue.fixed_at is None),
        'by_reason': [{'key': k, 'label': label, 'count': by_reason.get(k, 0)} for k, label in BadTag.REASON_CHOICES],
        'by_processor': processors,
        'by_truck': truck_rows,
    }


def lookup(code: str) -> dict:
    """What the scanned tag is, before a bad tag is saved."""
    code = normalize_code(code)
    item = Item.objects.select_related('product', 'checked_in_by', 'purchase_order').filter(sku=code).first() if code else None
    if item is None:
        return {'found': False, 'code': code, 'item': None}
    from apps.inventory.services.tag_retail import tag_retail

    shown = tag_retail(item)
    return {
        'found': True,
        'code': code,
        'item': item_payload(item),
        'tag_retail': str(shown) if shown is not None else None,
        'retail_check': item.retail_check or '',
        'checked_in_by': person(item.checked_in_by),
        'checked_in_at': item.checked_in_at,
        'order_number': item.purchase_order.order_number if item.purchase_order_id and item.purchase_order else '',
    }
