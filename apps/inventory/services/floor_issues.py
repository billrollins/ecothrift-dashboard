"""Floor issues: an item with a problem, reported from the retail floor (Dash Update #84).

One report, one button ("Report a problem"): scan or type the tag, pick what is wrong, optional note and photo.

- **The item** is wrong (broken or damaged, missing parts, does not work, dirty, other): a ``FloorIssue``.
- **The tag** is wrong (retail overstated, wrong item, price too high or low, tag missing): the bad-tag report that
  already existed (``stocktake.BadTag``, traced to who checked the item in). ``stocktake.services.bad_tags.record``
  calls ``open_for_bad_tag`` so it is a ``FloorIssue`` too.

Either way the item waits on Processing > Floor issues, where one action finishes it. Its status does not change
(D20): the open row on the list is the mark that it is in Processing's hands. A tag with no item behind it cannot be a floor issue (the actions need an item): it
stays a bad tag on PR Fix-it, as before.

**The list and the actions are shared with Returns** (``services/reentry.py``, Dash Update #83): a report opens a
``ProcessingReentry`` row with source ``floor`` (``FloorIssue.reentry``). When that row closes, ``reentry_closed``
(a signal, ``apps/inventory/signals.py``) closes the report and the bad tag's PR Fix-it row. The other way round,
``fixed_on_pr_fixit`` closes the row when PR Fix-it fixes the bad tag first.
"""
from __future__ import annotations

import base64
import re

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from apps.inventory.models import FloorIssue, Item, ItemHistory, ProcessingReentry
from apps.inventory.services import reentry

_DATA_URL = re.compile(r'^data:(image/[a-z+.-]+);base64,(.+)$', re.IGNORECASE | re.DOTALL)
_MAX_PHOTO_BYTES = 8 * 1024 * 1024

ITEM_REASON_ES = {
    FloorIssue.REASON_BROKEN: 'Roto',
    FloorIssue.REASON_MISSING_PARTS: 'Faltan piezas',
    FloorIssue.REASON_NOT_WORKING: 'No funciona',
    FloorIssue.REASON_DIRTY: 'Sucio',
    FloorIssue.REASON_OTHER: 'Otro',
}
ITEM_REASONS = dict(FloorIssue.ITEM_REASON_CHOICES)
NOTE = 'Floor issue'


class BadRequest(Exception):
    pass


def _tag_reasons() -> dict[str, str]:
    from apps.stocktake.models import BadTag

    return dict(BadTag.REASON_CHOICES)


def reason_label(reason: str) -> str:
    return ITEM_REASONS.get(reason) or _tag_reasons().get(reason) or reason


def reasons() -> list[dict]:
    """The one list the report shows: the item's problems first, then the tag's."""
    from apps.stocktake.services.bad_tags import REASON_ES

    rows = [
        {'key': k, 'label': label, 'label_es': ITEM_REASON_ES[k], 'about': 'item'}
        for k, label in FloorIssue.ITEM_REASON_CHOICES
    ]
    rows += [
        {'key': k, 'label': label, 'label_es': REASON_ES.get(k, label), 'about': 'tag'}
        for k, label in _tag_reasons().items()
    ]
    return rows


def _where_labels() -> dict[str, str]:
    from apps.stocktake.models import BadTag

    return dict(BadTag.WHERE_CHOICES)


def open_issue_for(item: Item | None) -> FloorIssue | None:
    if item is None:
        return None
    return FloorIssue.objects.filter(item=item, closed_at__isnull=True).order_by('reported_at', 'pk').first()


def _store_photo(issue: FloorIssue, photo, user) -> None:
    """A data URL from the phone (Dash Update #82 replaces every photo input with one shared control)."""
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
    uploaded = ContentFile(raw, name=f'floor-issue{".png" if "png" in content_type else ".jpg"}')
    uploaded.content_type = content_type
    issue.photo = save_upload(uploaded, user=user, key_prefix=f'inventory/floor-issues/{issue.pk}')
    issue.save(update_fields=['photo'])


def _row_reason(reason: str, note: str, bad_tag=None) -> str:
    """The "Why" line on the Floor issues page: "Price too high: should be $6.00; way over"."""
    parts = []
    if bad_tag is not None and bad_tag.right_price is not None:
        parts.append(f'should be ${bad_tag.right_price}')
    if bad_tag is not None and bad_tag.right_retail is not None:
        parts.append(f'retail should be ${bad_tag.right_retail}')
    if note:
        parts.append(note)
    label = reason_label(reason)
    return f'{label}: {"; ".join(parts)}'[:300] if parts else label


def _open(*, item: Item, reason: str, note: str, where: str, user, bad_tag=None) -> tuple[FloorIssue, bool]:
    """The item's open floor issue, and whether this call opened it."""
    with transaction.atomic():
        item = Item.objects.select_for_update().select_related('product').get(pk=item.pk)
        existing = open_issue_for(item)
        if existing is not None:
            if bad_tag is not None and existing.bad_tag_id is None:
                existing.bad_tag = bad_tag
                existing.save(update_fields=['bad_tag'])
            return existing, False
        issue = FloorIssue.objects.create(
            item=item, reason=reason, note=note, found_where=where, status_before=item.status, reported_by=user,
            bad_tag=bad_tag,
        )
        # The shared list of items back in Processing: the row the Floor issues page shows and acts on. An item
        # that already waits there (a customer return) keeps its row; this reason is added to it.
        issue.reentry = reentry.report(
            item, ProcessingReentry.SOURCE_FLOOR, reason=_row_reason(reason, note, bad_tag), user=user,
            source_ref=issue.pk,
        )
        issue.save(update_fields=['reentry'])
        # The status is never changed here (D20): "processing" means never received to the pallet and truck
        # accounting, so it would turn a reported item into a false missing item and a false dispute.
        ItemHistory.objects.create(
            item=item, event_type='note', new_value=reason_label(reason)[:300],
            note=f'{NOTE}: {reason_label(reason)}{". " + note if note else ""}'[:500], created_by=user,
        )
    return issue, True


def open_for_bad_tag(bad, user) -> FloorIssue | None:
    """Called by the bad-tag report: a wrong tag on a known item waits on Floor issues like any other problem.
    A sold item is left to PR Fix-it (its tag is a duplicate; the actions here do not fit)."""
    item = bad.item
    if item is None or item.status == 'sold':
        return None
    issue, _ = _open(item=item, reason=bad.reason, note=bad.detail, where=bad.found_where, user=user, bad_tag=bad)
    return issue


def report(*, user, code: str, reason: str, where: str = 'floor', note: str = '', photo=None,
           right_price=None, right_retail=None) -> dict:
    """One report from the floor. Returns ``{'floor_issue', 'bad_tag', 'already'}`` (payloads; either may be None)."""
    from apps.stocktake.services import bad_tags
    from apps.stocktake.services.counting import BadRequest as TagBadRequest, normalize_code

    note = str(note or '').strip()[:300]
    if where not in _where_labels():
        raise BadRequest('Unknown place.')
    if reason in _tag_reasons():
        try:
            bad = bad_tags.record(
                user=user, code=code, reason=reason, where=where, detail=note,
                right_price=right_price, right_retail=right_retail, photo=photo,
            )
        except TagBadRequest as e:
            raise BadRequest(str(e))
        bad = bad_tags.bad_tags_qs().get(pk=bad.pk)
        issue = issues_qs().filter(bad_tag=bad).first() or open_issue_for(bad.item)
        return {
            'floor_issue': payload(issue) if issue else None,
            'bad_tag': bad_tags.bad_tag_payload(bad),
            'already': False,
        }
    if reason not in ITEM_REASONS:
        raise BadRequest('Pick what is wrong.')
    code = normalize_code(code)
    if not code:
        raise BadRequest('Scan the tag first.')
    item = Item.objects.select_related('product').filter(sku=code).first()
    if item is None:
        raise BadRequest('No item has this tag. Pick "Tag missing or unreadable" and say what it is.')
    if item.status == 'sold':
        raise BadRequest('The system says this item was sold, so the tag is wrong. Pick "Wrong item".')
    if reason == FloorIssue.REASON_OTHER and not note:
        raise BadRequest('Say what is wrong in the note.')
    issue, opened = _open(item=item, reason=reason, note=note, where=where, user=user)
    if opened:
        _store_photo(issue, photo, user)
    return {'floor_issue': payload(issues_qs().get(pk=issue.pk)), 'bad_tag': None, 'already': not opened}


def close(issue: FloorIssue, *, user, outcome: str) -> FloorIssue:
    """Processing finished it. Also closes the bad tag's PR Fix-it row, so Tag errors shows it fixed."""
    if issue.closed_at is not None:
        return issue
    now = timezone.now()
    issue.closed_at, issue.closed_by, issue.outcome = now, user, str(outcome or '')[:40]
    issue.save(update_fields=['closed_at', 'closed_by', 'outcome'])
    bad = issue.bad_tag
    fixit_row = bad.issue if bad is not None else None
    if fixit_row is not None and fixit_row.fixed_at is None:
        fixit_row.fixed_at, fixit_row.fixed_by = now, user
        fixit_row.fix, fixit_row.fix_note = 'floor', f'Floor issues: {issue.outcome}'[:300]
        fixit_row.save(update_fields=['fixed_at', 'fixed_by', 'fix', 'fix_note'])
    return issue


def fixed_on_pr_fixit(fixit_row, user) -> None:
    """PR Fix-it fixed the bad tag first: its floor issue is done too and its row leaves the list."""
    bad = getattr(fixit_row, 'bad_tag', None)
    issue = getattr(bad, 'floor_issue', None) if bad is not None else None
    if issue is None or issue.closed_at is not None:
        return
    close(issue, user=user, outcome='Fixed on PR Fix-it')
    row = issue.reentry
    if row is not None and row.decided_at is None and row.source == ProcessingReentry.SOURCE_FLOOR:
        reentry._close(row, ProcessingReentry.OUTCOME_HANDLED, user, note='Fixed on PR Fix-it.')


def reentry_closed(row: ProcessingReentry) -> None:
    """The shared row was decided (one of the four actions, or handled another way): its reports are done."""
    if row.decided_at is None:
        return
    for issue in FloorIssue.objects.filter(reentry=row, closed_at__isnull=True).select_related('bad_tag__issue'):
        close(issue, user=row.decided_by, outcome=row.get_outcome_display() or 'Handled')


def issues_qs():
    return FloorIssue.objects.select_related('item__product', 'reported_by', 'closed_by', 'bad_tag__photo', 'photo')


def _person(user) -> str:
    if user is None:
        return ''
    return (getattr(user, 'first_name', '') or '').strip() or (getattr(user, 'email', '') or '').split('@')[0]


def _has_photo(issue: FloorIssue) -> bool:
    return bool(issue.photo_id or (issue.bad_tag_id and issue.bad_tag.photo_id))


def payload(issue: FloorIssue) -> dict:
    item = issue.item
    product = item.product
    brand = (product.brand or '').strip()
    return {
        'id': issue.pk,
        'reason': issue.reason,
        'reason_label': reason_label(issue.reason),
        'about': 'item' if issue.reason in ITEM_REASONS else 'tag',
        'note': issue.note,
        'where': issue.found_where,
        'where_label': _where_labels().get(issue.found_where, issue.found_where),
        'photo_url': f'/api/inventory/floor-issues/{issue.pk}/photo/' if _has_photo(issue) else None,
        'reported_by': _person(issue.reported_by),
        'reported_at': issue.reported_at,
        'status_before': issue.status_before,
        'bad_tag_id': issue.bad_tag_id,
        'reentry_id': issue.reentry_id,
        'closed_at': issue.closed_at,
        'closed_by': _person(issue.closed_by),
        'outcome': issue.outcome,
        'item': {
            'id': item.pk,
            'sku': item.sku,
            'title': product.title,
            'brand': brand if brand.lower() != 'generic' else '',
            'price': str(item.price),
            'retail': str(item.retail) if item.retail is not None else None,
            'status': item.status,
        },
    }


def waiting_reports(limit: int = 300) -> list[dict]:
    """The reports still waiting, oldest first: what the Floor issues page adds to the shared rows (photo, where)."""
    return [payload(i) for i in issues_qs().filter(closed_at__isnull=True).order_by('reported_at', 'pk')[:limit]]


def lookup(code: str) -> dict:
    """What the scanned tag is, and whether it is already waiting on Floor issues."""
    from apps.stocktake.services import bad_tags

    found = bad_tags.lookup(code)
    waiting = None
    if found.get('found'):
        item = Item.objects.filter(sku=found['code']).first()
        issue = open_issue_for(item)
        waiting = payload(issues_qs().get(pk=issue.pk)) if issue else None
    return {**found, 'floor_issue': waiting, 'reasons': reasons()}


def photo_file(issue: FloorIssue):
    if issue.photo_id:
        return issue.photo
    return issue.bad_tag.photo if issue.bad_tag_id and issue.bad_tag.photo_id else None
