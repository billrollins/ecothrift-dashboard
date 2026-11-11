"""
Items back in Processing (Processing Enhancements D14-D16, Bill 2026-11-10; Dash Updates #83 and #84).

A customer return and a floor issue are the same thing to a processor: one item that came back and needs one
decision. They share one list (``ProcessingReentry``) and one set of actions; ``source`` says which page shows a row
(``return``: Processing > Returns, ``floor``: Processing > Floor issues).

**Getting on the list**
- ``report(item, source, reason=, user=, source_ref=)``: put an item on the list. An item waits there once: a second
  report of an item that is already waiting adds its reason to that row (a return outranks a floor issue).
- ``report_return(record)``: every Thrift+ return (``thriftplus.ReturnRecord``) calls it from ``returns.do_return``.
  The refund is settled before this and is never touched here.
- ``sync_returns()``: a safety net, run when the list is read. Returns waiting for staff that have no row get one
  (returns taken before this list existed, or a hook that failed), and rows that were settled some other way close.

**The actions** (one tap each; each closes the row with who and when, and the item leaves the list)
- ``price_again(id, price, user)``: a new price, back on the shelf. The page prints the tag.
- ``back_to_shelf(id, user)``: back on the shelf as it is.
- ``send_to_restoration(id, request, user)``: the usual Restoration request (``restoration_request.py``) and queue.
- ``scrap(id, reason, user)``: scrapped, with the reason.

**A returned item is still "sold" until someone decides.** The register does not change the item on a return (the
refund is ``ReturnRecord``; nothing else moves). When an action puts it back in stock, its old sale moves to a new
item number the same way the register does it when a sold tag is scanned (``duplicate_tag.move_sale_to_new_item``,
owner 2026-10-06): the tag in hand is live again, the sale and its receipt are untouched, and no item is both on the
shelf and on a finished sale (the QA check ``shelf_but_sold`` would flag that). A consignment item, or one with an
online listing or hold, is not moved by itself: a manager decides.
"""
from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Item, ItemHistory, ProcessingReentry

logger = logging.getLogger(__name__)

SOURCES = (ProcessingReentry.SOURCE_RETURN, ProcessingReentry.SOURCE_FLOOR)
# The page a row shows on, and the words history notes use for where it came from.
PAGE = {ProcessingReentry.SOURCE_RETURN: 'Returns', ProcessingReentry.SOURCE_FLOOR: 'Floor issues'}
CAME_FROM = {ProcessingReentry.SOURCE_RETURN: 'customer return', ProcessingReentry.SOURCE_FLOOR: 'floor issue'}
MAX_PRICE = Decimal('99999.99')
CENT = Decimal('0.01')
LIST_LIMIT = 200
DONE_LIMIT = 50
SYNC_LIMIT = 300
NOT_MOVED = {
    'consignment': 'This is a consignment item. A manager has to decide this one.',
    'online': 'This item has an online listing or hold. A manager has to decide this one.',
}


class ReentryError(ValueError):
    """A plain sentence for the screen, with a short code."""

    def __init__(self, message: str, code: str = 'BAD_REQUEST'):
        super().__init__(message)
        self.code = code

    def payload(self) -> dict[str, str]:
        return {'detail': str(self), 'code': self.code}


# ── Getting on the list ────────────────────────────────────────────────────────────────────────────────────────────


def _clean(text: Any, limit: int = 300) -> str:
    return ' '.join(str(text or '').split())[:limit]


def _source(source: str) -> str:
    source = str(source or '').strip().lower()
    if source not in SOURCES:
        raise ReentryError('Say where it came from: a return or the floor.', 'BAD_SOURCE')
    return source


@transaction.atomic
def report(item: Item, source: str, *, reason: str = '', user=None, source_ref: int | None = None,
           reported_at=None) -> ProcessingReentry:
    """Put ``item`` on the list. Safe to call twice: the same source row, or an item already waiting, answers the row
    that is there (with the new reason added to it)."""
    source = _source(source)
    reason = _clean(reason)
    if source_ref is not None:
        known = ProcessingReentry.objects.filter(source=source, source_ref=source_ref).first()
        if known is not None:
            return known
    Item.objects.select_for_update().filter(pk=item.pk).first()  # one report of an item at a time
    row = ProcessingReentry.objects.filter(item=item, decided_at__isnull=True).first()
    if row is not None:
        fields = []
        if source == ProcessingReentry.SOURCE_RETURN and row.source != source:
            row.source, row.source_ref = source, source_ref  # a return outranks a floor issue
            fields += ['source', 'source_ref']
        elif row.source == source and row.source_ref is None and source_ref is not None:
            row.source_ref = source_ref
            fields.append('source_ref')
        if reason and reason.lower() not in row.reason.lower():
            row.reason = _clean(f'{row.reason}; {reason}' if row.reason else reason)
            fields.append('reason')
        if fields:
            row.save(update_fields=fields)
        return row
    return ProcessingReentry.objects.create(
        item=item, source=source, source_ref=source_ref, reason=reason, reported_by=user,
        reported_at=reported_at or timezone.now(),
    )


def report_return(record) -> ProcessingReentry | None:
    """A Thrift+ return (``ReturnRecord``) puts its item on the Returns list. None when the line had no item."""
    if record.item_id is None:
        return None
    # The row's why is the reason the cashier picked for this item (#90); an older return has only its free note.
    return report(record.item, ProcessingReentry.SOURCE_RETURN, reason=record.why, user=record.returned_by,
                  source_ref=record.pk, reported_at=record.created_at)


def _return_still_stands(record) -> bool:
    """The returned sale is still the sale on this tag: nobody has put the item back in stock yet."""
    return record.item_id is not None and record.item.status == 'sold' and record.cart_line.item_id == record.item_id


def sync_returns() -> int:
    """The safety net behind ``report_return`` (see the module note). Answers how many rows it added or closed."""
    from apps.thriftplus.models import ReturnRecord

    touched = 0
    have = ProcessingReentry.objects.filter(source=ProcessingReentry.SOURCE_RETURN, source_ref__isnull=False)
    missing = (ReturnRecord.objects.filter(status=ReturnRecord.STATUS_OPEN, item__isnull=False)
               .exclude(pk__in=have.values('source_ref'))
               .select_related('item', 'cart_line', 'returned_by').order_by('created_at')[:SYNC_LIMIT])
    for record in missing:
        with transaction.atomic():
            if _return_still_stands(record):
                report_return(record)
            else:  # an old return whose item someone already put back: recorded as handled, never shown as waiting
                ProcessingReentry.objects.get_or_create(  # two pages may read the list at the same moment
                    source=ProcessingReentry.SOURCE_RETURN, source_ref=record.pk,
                    defaults={
                        'item': record.item, 'reason': _clean(record.why), 'reported_by': record.returned_by,
                        'reported_at': record.created_at, 'outcome': ProcessingReentry.OUTCOME_HANDLED,
                        'outcome_note': 'Already back in stock.', 'decided_at': timezone.now(),
                    },
                )
                ReturnRecord.objects.filter(pk=record.pk).update(status=ReturnRecord.STATUS_DONE)
            touched += 1
    # Rows still waiting whose item moved on without us: back in stock another way, or sold again at the register.
    waiting = list(ProcessingReentry.objects.filter(decided_at__isnull=True, source_ref__isnull=False,
                                                    source=ProcessingReentry.SOURCE_RETURN)
                   .select_related('item')[:SYNC_LIMIT])
    records = {r.pk: r for r in ReturnRecord.objects.filter(pk__in=[w.source_ref for w in waiting])
               .select_related('item', 'cart_line')}
    for row in waiting:
        record = records.get(row.source_ref)
        if record is None:
            note = 'The return was removed.'
        elif row.item.status != 'sold':
            note = 'Already back in stock.'
        elif record.cart_line.item_id != row.item_id:
            note = 'Sold again at the register.'
        else:
            continue
        with transaction.atomic():
            _close(row, ProcessingReentry.OUTCOME_HANDLED, None, note=note)
        touched += 1
    return touched


def close_for_return(record_id: int, user, *, note: str = 'Marked handled on the Thrift+ page.') -> bool:
    """A return marked handled somewhere else (Thrift+ > Register > Returned items) leaves this list too."""
    with transaction.atomic():
        row = (ProcessingReentry.objects.select_for_update()
               .filter(source=ProcessingReentry.SOURCE_RETURN, source_ref=record_id, decided_at__isnull=True).first())
        if row is None:
            return False
        _close(row, ProcessingReentry.OUTCOME_HANDLED, user, note=note)
    return True


# ── Reading the list ───────────────────────────────────────────────────────────────────────────────────────────────


def _name(user) -> str:
    return (user.full_name or user.email) if user else ''


def _money(value) -> str | None:
    return None if value is None else str(Decimal(value).quantize(CENT))


def label(item: Item) -> dict[str, Any]:
    """What the page needs to print this item's price tag (``printProcessingLabel``'s input)."""
    from apps.inventory.services.tag_retail import tag_retail

    product = item.product if item.product_id else None
    return {
        'id': item.pk, 'sku': item.sku, 'price': _money(item.price),
        'product_title': product.title if product else '', 'product_brand': (product.brand or '') if product else '',
        'product_number': (product.product_number or '') if product else '',
        'tag_retail': _money(tag_retail(item)),
    }


def _sales(rows: list[ProcessingReentry]) -> dict[int, dict[str, Any]]:
    """For rows that came from a Thrift+ return: when it sold, for how much, and the receipt."""
    from apps.thriftplus.models import ReturnRecord

    ids = [r.source_ref for r in rows if r.source == ProcessingReentry.SOURCE_RETURN and r.source_ref]
    out: dict[int, dict[str, Any]] = {}
    for record in (ReturnRecord.objects.filter(pk__in=ids)
                   .select_related('cart_line__cart__receipt')):
        line = record.cart_line
        cart = line.cart
        receipt = getattr(cart, 'receipt', None)
        out[record.pk] = {
            'sold_at': cart.completed_at, 'sold_price': _money(line.unit_price),
            'receipt_number': receipt.receipt_number if receipt else f'Sale {cart.pk}', 'cart': cart.pk,
        }
    return out


def as_row(row: ProcessingReentry, sale: dict[str, Any] | None = None) -> dict[str, Any]:
    item = row.item
    return {
        'id': row.pk, 'source': row.source, 'source_label': row.get_source_display(), 'reason': row.reason,
        'reported_by': _name(row.reported_by), 'reported_at': row.reported_at,
        'item': {**label(item), 'status': item.status, 'status_label': item.get_status_display(),
                 'condition_label': item.get_condition_display(), 'retail': _money(item.retail)},
        'sale': sale,
        'outcome': row.outcome, 'outcome_label': row.get_outcome_display() if row.outcome else '',
        'outcome_note': row.outcome_note, 'old_price': _money(row.old_price), 'new_price': _money(row.new_price),
        'restoration_job': row.restoration_job_id, 'decided_by': _name(row.decided_by), 'decided_at': row.decided_at,
    }


def counts() -> dict[str, int]:
    """How many are waiting, by source."""
    found = dict.fromkeys(SOURCES, 0)
    for source in ProcessingReentry.objects.filter(decided_at__isnull=True).values_list('source', flat=True):
        found[source] = found.get(source, 0) + 1
    return found


def done_today() -> dict[str, int]:
    """How many were decided today (store time), by source: the count beside Done."""
    start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    found = dict.fromkeys(SOURCES, 0)
    for source in ProcessingReentry.objects.filter(decided_at__gte=start).values_list('source', flat=True):
        found[source] = found.get(source, 0) + 1
    return found


def rows(source: str, *, done: bool = False) -> dict[str, Any]:
    """The list for one page: the rows waiting (oldest first), or with ``done`` the last ones decided (newest
    first). ``waiting`` counts both sources so a page can show the other one's number."""
    source = _source(source)
    if source == ProcessingReentry.SOURCE_RETURN and not done:
        try:
            sync_returns()
        except Exception:  # noqa: BLE001 - the list still opens when the safety net trips
            logger.exception('reentry: sync_returns failed')
    qs = (ProcessingReentry.objects.filter(source=source)
          .select_related('item__product', 'reported_by', 'decided_by'))
    if done:
        found = list(qs.filter(decided_at__isnull=False).order_by('-decided_at', '-pk')[:DONE_LIMIT])
    else:
        found = list(qs.filter(decided_at__isnull=True).order_by('reported_at', 'pk')[:LIST_LIMIT])
    sales = _sales(found)
    return {'source': source, 'done': done, 'waiting': counts(), 'done_today': done_today(),
            'results': [as_row(r, sales.get(r.source_ref) if r.source_ref else None) for r in found]}


def find(code: str, source: str) -> dict[str, Any]:
    """A scanned tag on one of the pages: the item, and its row when it is waiting (on either page)."""
    from apps.inventory.services.scan_code import sku_from_scan

    _source(source)
    sku = sku_from_scan(code).strip().rstrip('.,;')
    if not sku:
        raise ReentryError('Scan a tag or type an item number.', 'NO_CODE')
    item = Item.objects.select_related('product').filter(sku__iexact=sku).first()
    if item is None:
        raise ReentryError(f'No item with the number {sku}.', 'NO_ITEM')
    row = (ProcessingReentry.objects.filter(item=item, decided_at__isnull=True)
           .select_related('item__product', 'reported_by', 'decided_by').first())
    sale = _sales([row]).get(row.source_ref) if row is not None and row.source_ref else None
    # Not waiting: the last time it was decided, so the page can say "already handled" instead of offering it again.
    last = None if row is not None else (
        ProcessingReentry.objects.filter(item=item, decided_at__isnull=False)
        .select_related('item__product', 'reported_by', 'decided_by').order_by('-decided_at', '-pk').first())
    return {'item': {**label(item), 'status': item.status, 'status_label': item.get_status_display()},
            'row': as_row(row, sale) if row is not None else None,
            'last': as_row(last) if last is not None else None}


# ── The actions ────────────────────────────────────────────────────────────────────────────────────────────────────


def _price(value) -> Decimal:
    try:
        amount = Decimal(str(value).strip().replace('$', '').replace(',', '')).quantize(CENT)
    except (InvalidOperation, TypeError, ValueError, AttributeError):
        raise ReentryError('Type the new price.', 'BAD_PRICE')
    if amount <= 0 or amount > MAX_PRICE:
        raise ReentryError('The new price has to be more than $0.', 'BAD_PRICE')
    return amount


def _waiting(reentry_id: int) -> ProcessingReentry:
    row = ProcessingReentry.objects.select_for_update().filter(pk=reentry_id).first()
    if row is None:
        raise ReentryError('That one is not on the list.', 'NOT_FOUND')
    if not row.is_open:
        raise ReentryError('Someone already handled this one.', 'ALREADY_DONE')
    return row


def _close(row: ProcessingReentry, outcome: str, user, *, note: str = '', **fields) -> ProcessingReentry:
    row.outcome = outcome
    row.outcome_note = _clean(note)
    row.decided_by = user
    row.decided_at = timezone.now()
    for name, value in fields.items():
        setattr(row, name, value)
    row.save(update_fields=['outcome', 'outcome_note', 'decided_by', 'decided_at', *fields])
    if row.source == ProcessingReentry.SOURCE_RETURN and row.source_ref:
        from apps.thriftplus.models import ReturnRecord

        # The same return also sits under Thrift+ > Register > Returned items: it is handled there too.
        ReturnRecord.objects.filter(pk=row.source_ref).update(status=ReturnRecord.STATUS_DONE)
    return row


def _in_hand(row: ProcessingReentry, user) -> Item:
    """The item, locked, with the tag live again: a sale still on it moves to a new item number (module note)."""
    from apps.inventory.services import duplicate_tag

    item = Item.objects.select_for_update().select_related('product').get(pk=row.item_id)
    if item.status == 'sold':
        reason = duplicate_tag.why_not(item)
        if reason:
            raise ReentryError(NOT_MOVED.get(reason, 'A manager has to decide this one.'), 'NEEDS_MANAGER')
        duplicate_tag.move_sale_to_new_item(item, user, where=f'a {CAME_FROM[row.source]}')
        item = Item.objects.select_for_update().select_related('product').get(pk=row.item_id)
    return item


def _to_shelf(item: Item, user, note: str) -> None:
    if item.status == 'on_shelf':
        return
    old = item.status
    item.status = 'on_shelf'
    fields = ['status', 'updated_at']
    if item.listed_at is None:
        item.listed_at = timezone.now()
        fields.append('listed_at')
    item.save(update_fields=fields)
    ItemHistory.objects.create(item=item, event_type='status_change', old_value=old, new_value='on_shelf', note=note,
                               created_by=user)


@transaction.atomic
def price_again(reentry_id: int, price, user) -> ProcessingReentry:
    """A new price and back on the shelf. The page prints the tag from the answer's ``item``."""
    amount = _price(price)
    row = _waiting(reentry_id)
    item = _in_hand(row, user)
    came = CAME_FROM[row.source]
    old = item.price
    _to_shelf(item, user, f'Back on the shelf with a new price ({came})')
    if amount != old:
        item.price = amount
        item.save(update_fields=['price', 'updated_at'])
        ItemHistory.objects.create(item=item, event_type='price_change', old_value=str(old), new_value=str(amount),
                                   note=f'Priced again ({came})', created_by=user)
    row.item = item
    return _close(row, ProcessingReentry.OUTCOME_REPRICED, user, old_price=old, new_price=amount)


@transaction.atomic
def back_to_shelf(reentry_id: int, user) -> ProcessingReentry:
    """Back on the shelf as it is: same price, same tag."""
    row = _waiting(reentry_id)
    item = _in_hand(row, user)
    came = CAME_FROM[row.source]
    if item.status == 'on_shelf':
        ItemHistory.objects.create(item=item, event_type='note', note=f'Back on the shelf as is ({came})',
                                   created_by=user)
    else:
        _to_shelf(item, user, f'Back on the shelf as is ({came})')
    row.item = item
    return _close(row, ProcessingReentry.OUTCOME_SHELF, user)


@transaction.atomic
def send_to_restoration(reentry_id: int, request: Any, user) -> tuple[ProcessingReentry, dict[str, Any] | None]:
    """The usual send: the Restoration request (what it needs, the done price) and the queue. Answers the row and the
    facts for the restoration tag (None when the job was already past the queue)."""
    from apps.inventory.models import RestorationJob
    from apps.inventory.services import restoration_request as rr
    from apps.inventory.services.restoration import queue_add_restoration_item

    checked = rr.restoration_request(request)  # a ValueError with the sentence to show
    row = _waiting(reentry_id)
    item = _in_hand(row, user)
    came = CAME_FROM[row.source]
    _to_shelf(item, user, f'Going to Restoration ({came})')
    result = queue_add_restoration_item(item.sku, user)  # a ValueError: salvage, or no order to hang the job on
    job = result.job
    tag = None
    if job.stage == RestorationJob.STAGE_QUEUED:
        check_in = job.item_check_in
        snapshot = dict(check_in.defaults_snapshot or {})
        snapshot[rr.SNAPSHOT_KEY] = rr.stamped(checked, user)
        check_in.defaults_snapshot = snapshot
        check_in.save(update_fields=['defaults_snapshot', 'updated_at'])
        rr.apply_to_job(job, checked, user, new_job=result.status in ('created', 'requeued'))
        tag = rr.tag_facts(job)
    ItemHistory.objects.create(item=item, event_type='note', note=f'Sent to Restoration ({came})', created_by=user)
    item.refresh_from_db()
    row.item = item
    return _close(row, ProcessingReentry.OUTCOME_RESTORATION, user, restoration_job=job), tag


@transaction.atomic
def scrap(reentry_id: int, reason: str, user) -> ProcessingReentry:
    """Scrapped, with the reason."""
    reason = _clean(reason)
    if not reason:
        raise ReentryError('Say why it is scrapped.', 'NO_REASON')
    row = _waiting(reentry_id)
    item = _in_hand(row, user)
    old = item.status
    if old != 'scrapped':
        item.status = 'scrapped'
        item.save(update_fields=['status', 'updated_at'])
        ItemHistory.objects.create(item=item, event_type='status_change', old_value=old, new_value='scrapped',
                                   note=f'Scrapped ({CAME_FROM[row.source]}): {reason}'[:500], created_by=user)
    row.item = item
    return _close(row, ProcessingReentry.OUTCOME_SCRAPPED, user, note=reason)
