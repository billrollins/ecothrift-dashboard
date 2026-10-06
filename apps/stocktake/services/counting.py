"""Inventories, runs, scans, problems and carts. The PR Fix-it actions live in ``fixit.py``.

One inventory (``InventoryCount``) stays open across days until a manager closes it (inventory_effort Phase 1,
2026-10-06: the per-day count split the first full count at midnight). Only one is open at a time.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from decimal import Decimal

from django.db import connection, transaction
from django.db.models import F, Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.inventory.models import Item

from ..models import Cart, CountScan, InventoryCount, Issue, Run, Section

MAX_BATCH = 300
SKU_RE = re.compile(r'^ITM\d{6,}$')

# A scan result that needs an answer from the person scanning, and the problem it opens.
RESULT_ISSUE_KIND = {
    CountScan.RESULT_BAD_FORMAT: Issue.KIND_NOT_SKU,
    CountScan.RESULT_UNKNOWN: Issue.KIND_NOT_RECOGNIZED,
    CountScan.RESULT_ALREADY: Issue.KIND_ALREADY_SCANNED,
}
# Problems a person reports on an item that scanned fine.
REPORTABLE_KINDS = {
    Issue.KIND_WRONG_TITLE, Issue.KIND_WRONG_TAG, Issue.KIND_PRICE_HIGH, Issue.KIND_PRICE_LOW,
    Issue.KIND_NO_TAG, Issue.KIND_WRONG_SECTION,
}
ANSWERS = {Issue.ACTION_CLEARED, Issue.ACTION_PR_CART, Issue.ACTION_LEFT, Issue.ACTION_RELOCATE}


class CountClosed(Exception):
    pass


class RunClosed(Exception):
    pass


class PendingIssues(Exception):
    def __init__(self, n: int):
        super().__init__(f'{n} problems need an answer')
        self.n = n


class BadRequest(Exception):
    """A request the caller can fix; the message is shown to the person."""


def normalize_code(raw) -> str:
    return str(raw or '').strip().upper()


def person(user) -> str:
    if user is None:
        return ''
    return (getattr(user, 'first_name', '') or '').strip() or (getattr(user, 'email', '') or '').split('@')[0]


# --- sections -------------------------------------------------------------------------------------

def section_payload(s: Section) -> dict:
    return {'id': s.pk, 'name': s.name, 'order': s.order, 'is_active': s.is_active}


# --- the open inventory ---------------------------------------------------------------------------

# One open inventory at a time: two people starting the first run together must not open two.
_EFFORT_LOCK = 7_250_106


def current_count() -> InventoryCount | None:
    """The open inventory (the oldest, if an old one was left open too). None when none is open."""
    return (
        InventoryCount.objects.filter(status=InventoryCount.STATUS_OPEN, day__isnull=False)
        .order_by('started_at', 'pk').first()
    )


def ensure_current_count(user) -> InventoryCount:
    """The open inventory. When none is open, the first run starts one and freezes what the system says is
    on the shelf. It stays open across days until a manager closes it."""
    with transaction.atomic():
        if connection.vendor == 'postgresql':
            with connection.cursor() as cur:
                cur.execute('SELECT pg_advisory_xact_lock(%s)', [_EFFORT_LOCK])
        count = current_count()
        if count is None:
            day = timezone.localdate()
            count = InventoryCount.objects.create(
                day=day,
                name=f'Inventory {day:%a %Y-%m-%d}',
                started_by=user,
                expected_item_ids=list(Item.objects.filter(status='on_shelf').values_list('id', flat=True)),
            )
    return count


def good_scans(count: InventoryCount):
    """Scans that count: not removed, and not in a run marked bad."""
    return count.scans.filter(removed_at__isnull=True).exclude(run__status=Run.STATUS_BAD)


def counted_ids(count: InventoryCount) -> set[int]:
    return set(good_scans(count).filter(item__isnull=False).values_list('item_id', flat=True))


def expected_ids(count: InventoryCount, seen: set[int] | None = None) -> set[int]:
    """What the inventory should find: the items on the shelf when it started, minus those that left the shelf
    since (sold, scrapped, lost) without being counted. Sales during a days-long inventory are not shrink.
    Items checked in after the start are not expected (they would look missing in sections counted earlier);
    scanned, they still count. A closed inventory keeps the set it had when it was closed."""
    if count.status == InventoryCount.STATUS_CLOSED and count.closed_expected_ids is not None:
        return set(count.closed_expected_ids)
    frozen = set(count.expected_item_ids or [])
    if not frozen:
        return frozen
    seen = counted_ids(count) if seen is None else seen
    on_shelf = set(Item.objects.filter(status='on_shelf').values_list('id', flat=True))
    return frozen - ((frozen - on_shelf) - seen)


def days_active(count: InventoryCount) -> list[str]:
    """The days the inventory had runs, oldest first (local dates)."""
    tz = timezone.get_current_timezone()
    dates = {timezone.localtime(t, tz).date() for t in count.runs.values_list('started_at', flat=True)}
    return [d.isoformat() for d in sorted(dates)]


def day_summary(count: InventoryCount) -> dict:
    seen = counted_ids(count)
    expected = expected_ids(count, seen)
    issues = Counter(count.issues.exclude(run__status=Run.STATUS_BAD).values_list('action', flat=True))
    done = set(
        count.runs.filter(section_complete=True).exclude(status=Run.STATUS_BAD).values_list('section_id', flat=True)
    )
    started = set(count.runs.exclude(status=Run.STATUS_BAD).values_list('section_id', flat=True))
    return {
        'id': count.pk,
        'name': count.name,
        'day': count.day,
        'status': count.status,
        'note': count.note,
        'started_at': count.started_at,
        'closed_at': count.closed_at,
        'closed_by': person(count.closed_by) if count.closed_by_id else '',
        'days_active': days_active(count),
        'expected': len(expected),
        'counted': len(seen & expected) if expected else len(seen),
        'scans': good_scans(count).count(),
        'runs': count.runs.count(),
        'sections_done': len(done),
        'sections_in_progress': len(started - done),
        'sections_total': Section.objects.filter(Q(is_active=True) | Q(pk__in=done)).count(),
        'issues_pending': issues[Issue.ACTION_PENDING],
        'issues_total': sum(issues.values()) - issues[Issue.ACTION_CLEARED],
        'to_fix': count.issues.filter(
            action__in=[Issue.ACTION_PR_CART, Issue.ACTION_RELOCATE], fixed_at__isnull=True,
        ).count(),
        'server_now': timezone.now(),  # so the phone's timer does not depend on its own clock
    }


def close_count(count: InventoryCount, user=None) -> InventoryCount:
    """Close the inventory: open runs stop, and what it expected is kept as it stands now."""
    if count.status == InventoryCount.STATUS_OPEN:
        now = timezone.now()
        with transaction.atomic():
            count.runs.filter(status=Run.STATUS_OPEN).update(status=Run.STATUS_STOPPED, stopped_at=now)
            count.closed_expected_ids = sorted(expected_ids(count))
            count.status = InventoryCount.STATUS_CLOSED
            count.closed_at = now
            count.closed_by = user if getattr(user, 'pk', None) else None
            count.save(update_fields=['status', 'closed_at', 'closed_by', 'closed_expected_ids'])
    return count


def reopen_count(count: InventoryCount) -> InventoryCount:
    """Open it again. Refused while another inventory is open: only one is open at a time."""
    if count.status == InventoryCount.STATUS_OPEN:
        return count
    other = current_count()
    if other is not None and other.pk != count.pk:
        raise BadRequest(f'"{other.name}" is open. Close it before reopening this one.')
    count.status = InventoryCount.STATUS_OPEN
    count.closed_at = None
    count.closed_by = None
    count.closed_expected_ids = None
    count.save(update_fields=['status', 'closed_at', 'closed_by', 'closed_expected_ids'])
    return count


# --- runs -----------------------------------------------------------------------------------------

def run_summary(run: Run) -> dict:
    scans = run.scans.filter(removed_at__isnull=True)
    return {
        'id': run.pk,
        'count_id': run.count_id,
        'section': {'id': run.section_id, 'name': run.section.name},
        'user': person(run.user),
        'user_id': run.user_id,
        'status': run.status,
        'section_complete': run.section_complete,
        'note': run.note,
        'started_at': run.started_at,
        'stopped_at': run.stopped_at,
        'scans': scans.count(),
        'counted': scans.filter(result=CountScan.RESULT_OK).count(),
        'removed': run.scans.filter(removed_at__isnull=False).count(),
        'issues_pending': run.issues.filter(action=Issue.ACTION_PENDING).count(),
        'issues_total': run.issues.exclude(action=Issue.ACTION_CLEARED).count(),
    }


def _stop_open_runs(user, now=None) -> None:
    Run.objects.filter(user=user, status=Run.STATUS_OPEN).update(status=Run.STATUS_STOPPED, stopped_at=now or timezone.now())


def open_run_for(user) -> Run | None:
    """The person's open run in the open inventory. A run left open in any other inventory is stopped."""
    run = Run.objects.filter(user=user, status=Run.STATUS_OPEN).select_related('section', 'count').first()
    if run is None:
        return None
    current = current_count()
    if current is None or run.count_id != current.pk:
        _stop_open_runs(user)
        return None
    return run


def start_run(*, user, section: Section) -> Run:
    """Start scanning a section. One open run per person: any other open run of theirs is stopped."""
    count = ensure_current_count(user)
    with transaction.atomic():
        _stop_open_runs(user)
        return Run.objects.create(count=count, section=section, user=user)


def stop_run(run: Run, *, outcome: str, note: str | None = None) -> Run:
    """``outcome``: ``complete`` (the section is done), ``partial`` (not finished) or ``bad`` (don't use it)."""
    if outcome not in ('complete', 'partial', 'bad'):
        raise BadRequest('outcome must be complete, partial or bad.')
    pending = run.issues.filter(action=Issue.ACTION_PENDING)
    if outcome == 'complete' and pending.exists():
        raise PendingIssues(pending.count())
    now = timezone.now()
    with transaction.atomic():
        if outcome == 'bad':
            pending.update(action=Issue.ACTION_CLEARED, answered_at=now)
        run.status = Run.STATUS_BAD if outcome == 'bad' else Run.STATUS_STOPPED
        run.section_complete = outcome == 'complete'
        run.stopped_at = run.stopped_at or now
        if note is not None:
            run.note = note
        run.save(update_fields=['status', 'section_complete', 'stopped_at', 'note'])
    return run


def update_run(run: Run, *, note=None, bad=None, section_complete=None) -> Run:
    """Edit a run after the fact: its note, whether it is bad, whether it finished the section."""
    if note is not None:
        run.note = str(note)
    if bad is not None and run.status != Run.STATUS_OPEN:
        run.status = Run.STATUS_BAD if bad else Run.STATUS_STOPPED
        if bad:
            run.section_complete = False
    if section_complete is not None and run.status == Run.STATUS_STOPPED:
        if section_complete and run.issues.filter(action=Issue.ACTION_PENDING).exists():
            raise PendingIssues(run.issues.filter(action=Issue.ACTION_PENDING).count())
        run.section_complete = bool(section_complete)
    run.save(update_fields=['note', 'status', 'section_complete'])
    return run


# --- scans ----------------------------------------------------------------------------------------

def _scan_time(value):
    parsed = parse_datetime(str(value)) if value else None
    return parsed or timezone.now()


def scan_payload(row: CountScan, item: Item | None = None, issue: Issue | None = None, first_seen: dict | None = None) -> dict:
    item = item or row.item
    return {
        'id': row.pk,
        'client_id': row.client_id,
        'seq': row.seq,
        'code': row.code,
        'result': row.result,
        'item_status': row.item_status,
        'title': item.product.title if item else '',
        'price': str(item.price) if item else None,
        'retail': str(item.retail) if item and item.retail is not None else None,
        'location': item.location if item else '',
        'scanned_at': row.scanned_at,
        'removed': row.removed_at is not None,
        'issue_id': issue.pk if issue else None,
        'issue_kind': issue.kind if issue else '',
        'issue_action': issue.action if issue else '',
        'first_seen': first_seen,
    }


def _first_seen(count: InventoryCount, item: Item) -> dict | None:
    first = (
        good_scans(count).filter(item=item).select_related('run__section', 'run__user').order_by('scanned_at', 'id').first()
    )
    if first is None or first.run is None:
        return None
    return {'section': first.run.section.name, 'by': person(first.run.user), 'at': first.scanned_at}


def record_scans(run: Run, scans: list[dict]) -> list[dict]:
    """Record a batch of ``{client_id, code, seq, scanned_at}``. Returns one result per input, in order.

    Safe to retry: a ``client_id`` already recorded returns its earlier result unchanged.
    A scan that isn't a clean find opens a problem that waits for the person's answer.
    """
    if run.status != Run.STATUS_OPEN:
        raise RunClosed()
    count = run.count
    if count.status != InventoryCount.STATUS_OPEN:
        raise CountClosed()
    scans = scans[:MAX_BATCH]
    client_ids = [str(s.get('client_id') or '') for s in scans]
    codes = {normalize_code(s.get('code')) for s in scans} - {''}

    with transaction.atomic():
        done = {
            s.client_id: s
            for s in count.scans.filter(client_id__in=[c for c in client_ids if c]).select_related('item__product')
        }
        items = {i.sku.upper(): i for i in Item.objects.filter(sku__in=codes).select_related('product')}
        # Only the items in this batch: a day's count can hold tens of thousands of scans.
        seen_items = set(
            good_scans(count).filter(item_id__in=[i.pk for i in items.values()]).values_list('item_id', flat=True)
        )
        out = []
        for raw in scans:
            cid = str(raw.get('client_id') or '')
            code = normalize_code(raw.get('code'))
            if cid in done:
                row = done[cid]
                out.append(scan_payload(row, issue=row.issues.first()))
                continue
            item = items.get(code)
            first_seen = None
            if item is None:
                result = CountScan.RESULT_UNKNOWN if SKU_RE.match(code) else CountScan.RESULT_BAD_FORMAT
                status = ''
            elif item.pk in seen_items:
                result, status = CountScan.RESULT_ALREADY, item.status
                first_seen = _first_seen(count, item)
            elif item.status == 'on_shelf':
                result, status = CountScan.RESULT_OK, item.status
            else:
                result, status = CountScan.RESULT_ODD, item.status
            row = CountScan.objects.create(
                count=count,
                run=run,
                client_id=cid or f'srv-{timezone.now().timestamp()}-{len(out)}',
                seq=int(raw.get('seq') or 0),
                code=code[:64],
                scanned_at=_scan_time(raw.get('scanned_at')),
                result=result,
                item=item,
                item_status=status,
            )
            issue = None
            if result != CountScan.RESULT_OK:
                kind = RESULT_ISSUE_KIND.get(result) or (
                    Issue.KIND_ALREADY_SOLD if status == 'sold' else Issue.KIND_NOT_ON_SHELF
                )
                issue = Issue.objects.create(
                    count=count, run=run, scan=row, item=item, code=row.code, kind=kind, created_by=run.user,
                )
            if item is not None:
                seen_items.add(item.pk)
            done[row.client_id] = row
            out.append(scan_payload(row, item, issue, first_seen))
        return out


def remove_scan(scan: CountScan, *, user) -> CountScan:
    """Take one scan out of the count. It is kept, greyed out, and can be put back."""
    if scan.removed_at is None:
        now = timezone.now()
        with transaction.atomic():
            scan.removed_at, scan.removed_by = now, user
            scan.save(update_fields=['removed_at', 'removed_by'])
            scan.issues.filter(action=Issue.ACTION_PENDING).update(action=Issue.ACTION_CLEARED, answered_at=now)
    return scan


def restore_scan(scan: CountScan) -> CountScan:
    if scan.removed_at is not None:
        scan.removed_at, scan.removed_by = None, None
        scan.save(update_fields=['removed_at', 'removed_by'])
    return scan


# --- carts ----------------------------------------------------------------------------------------

CART_WORDS = {Cart.KIND_PR: 'PR Cart', Cart.KIND_RELOCATE: 'Relocate Cart'}


def cart_payload(cart: Cart | None) -> dict | None:
    if cart is None:
        return None
    return {'id': cart.pk, 'kind': cart.kind, 'label': cart.label, 'items': cart.issues.count()}


def current_cart(user, kind: str, *, create: bool = True) -> Cart | None:
    cart = Cart.objects.filter(owner=user, kind=kind, closed_at__isnull=True).first()
    if cart is None and create:
        cart = new_cart(user, kind)
    return cart


def new_cart(user, kind: str) -> Cart:
    """The person's cart is full: close it and start the next one. Numbers start again each day."""
    if kind not in CART_WORDS:
        raise BadRequest('kind must be pr or relocate.')
    now = timezone.now()
    with transaction.atomic():
        Cart.objects.filter(owner=user, kind=kind, closed_at__isnull=True).update(closed_at=now)
        n = Cart.objects.filter(owner=user, kind=kind, created_at__date=timezone.localdate()).count() + 1
        return Cart.objects.create(owner=user, kind=kind, label=f'{person(user) or "Staff"} {CART_WORDS[kind]} {n}')


# --- problems -------------------------------------------------------------------------------------

def _apply_answer(issue: Issue, *, user, action: str, detail=None, target_section_id=None) -> None:
    if action not in ANSWERS:
        raise BadRequest('Pick what you did with the item.')
    if issue.fixed_at is not None:
        raise BadRequest('This problem is already fixed.')
    issue.action = action
    issue.cart = None
    if action == Issue.ACTION_PR_CART:
        issue.cart = current_cart(user, Cart.KIND_PR)
    elif action == Issue.ACTION_RELOCATE:
        issue.cart = current_cart(user, Cart.KIND_RELOCATE)
    if target_section_id:
        issue.target_section = Section.objects.filter(pk=target_section_id).first()
    if detail is not None:
        issue.detail = str(detail)[:300]
    issue.answered_at = timezone.now()


def answer_issue(issue: Issue, *, user, action: str, detail=None, target_section_id=None) -> Issue:
    """What the person did about a problem. Can be answered again (changed) until it is fixed."""
    _apply_answer(issue, user=user, action=action, detail=detail, target_section_id=target_section_id)
    issue.save()
    return issue


def report_issue(run: Run, *, user, kind: str, action: str, scan: CountScan | None = None,
                 detail: str = '', target_section_id=None) -> Issue:
    """A problem the person noticed on an item (wrong title, wrong price, no tag, wrong section...)."""
    if kind not in REPORTABLE_KINDS:
        raise BadRequest('Unknown problem.')
    if kind != Issue.KIND_NO_TAG and scan is None:
        raise BadRequest('Scan the item first.')
    issue = Issue(
        count=run.count, run=run, scan=scan, item=scan.item if scan else None,
        code=scan.code if scan else '', kind=kind, created_by=user,
    )
    _apply_answer(issue, user=user, action=action, detail=detail, target_section_id=target_section_id)
    issue.save()
    return issue


def item_payload(item: Item | None) -> dict | None:
    if item is None:
        return None
    p = item.product
    return {
        'id': item.pk,
        'sku': item.sku,
        'title': p.title,
        'brand': p.brand if (p.brand or '').lower() != 'generic' else '',
        'product_number': p.product_number or '',
        'price': str(item.price),
        'retail': str(item.retail) if item.retail is not None else None,
        'status': item.status,
        'location': item.location,
    }


def label_for(item: Item | None) -> dict | None:
    """What the print server needs to print this item's price tag."""
    if item is None:
        return None
    p = item.product
    brand = (p.brand or '').strip()
    return {
        'qr_data': item.sku,
        'text': f'${item.price:.2f}',
        'product_title': p.title,
        'product_brand': brand if brand.lower() != 'generic' else '',
        'product_model': (p.product_number or '').strip(),
        'include_text': True,
    }


def issue_payload(issue: Issue) -> dict:
    kinds = dict(Issue.KIND_CHOICES)
    return {
        'id': issue.pk,
        'count_id': issue.count_id,
        'day': issue.count.day,
        'run_id': issue.run_id,
        'run_bad': issue.run.status == Run.STATUS_BAD,
        'section': issue.run.section.name,
        'scan_id': issue.scan_id,
        'code': issue.code,
        'kind': issue.kind,
        'kind_label': kinds.get(issue.kind, issue.kind),
        'action': issue.action,
        'cart': issue.cart.label if issue.cart else '',
        'cart_kind': issue.cart.kind if issue.cart else '',
        'target_section': issue.target_section.name if issue.target_section else '',
        'detail': issue.detail,
        'by': person(issue.created_by),
        'created_at': issue.created_at,
        'item': item_payload(issue.item),
        'fixed_at': issue.fixed_at,
        'fixed_by': person(issue.fixed_by),
        'fix': issue.fix,
        'fix_note': issue.fix_note,
        'new_item': item_payload(issue.new_item),
    }


def issues_qs():
    return Issue.objects.select_related(
        'count', 'run__section', 'cart', 'target_section', 'created_by', 'fixed_by', 'item__product', 'new_item__product',
    )


def section_progress(count: InventoryCount | None) -> dict[int, dict]:
    """Per section: where it stands today, how many items are counted in it today, and what it held last time.

    ``expected`` is the number of items counted in the section the last earlier day it was completed:
    the best guess of what should be there now. None when the section has never been completed.
    """
    out: dict[int, dict] = defaultdict(
        lambda: {'state': 'not_started', 'counted': 0, 'expected': None, 'expected_day': None}
    )
    if count is not None:
        for section_id, complete in count.runs.exclude(status=Run.STATUS_BAD).values_list('section_id', 'section_complete'):
            row = out[section_id]
            if complete:
                row['state'] = 'done'
            elif row['state'] != 'done':
                row['state'] = 'in_progress'
        items: dict[int, set] = defaultdict(set)
        on_shelf = good_scans(count).filter(item__isnull=False, item_status='on_shelf')
        for item_id, section_id in on_shelf.values_list('item_id', 'run__section_id'):
            items[section_id].add(item_id)
        for section_id, ids in items.items():
            out[section_id]['counted'] = len(ids)
    earlier = Run.objects.filter(section_complete=True, count__day__isnull=False).exclude(status=Run.STATUS_BAD)
    if count is not None:
        earlier = earlier.filter(count__started_at__lt=count.started_at)
    earlier = earlier.order_by('-count__started_at').values_list('section_id', 'count_id', 'count__day')
    seen = set()
    for section_id, count_id, on_day in earlier:
        if section_id in seen:
            continue
        seen.add(section_id)
        out[section_id]['expected'] = (
            CountScan.objects.filter(
                count_id=count_id, run__section_id=section_id, removed_at__isnull=True,
                item__isnull=False, item_status='on_shelf',
            ).exclude(run__status=Run.STATUS_BAD).values('item_id').distinct().count()
        )
        out[section_id]['expected_day'] = on_day
    return out


def delete_run(run: Run) -> None:
    """Remove a run for good, with its scans and problems. Super User only (checked by the view)."""
    run.delete()


def delete_count(count: InventoryCount) -> None:
    """Remove a whole day's count for good. Super User only (checked by the view)."""
    count.delete()


# --- what the scan screen needs when it opens -----------------------------------------------------

def bootstrap(user) -> dict:
    count = current_count()
    run = open_run_for(user)
    mine = []
    progress = section_progress(count)
    if count is not None:
        mine = [
            issue_payload(i)
            for i in issues_qs().filter(count=count, created_by=user, action=Issue.ACTION_PENDING)
            .exclude(run__status=Run.STATUS_BAD)
        ]
    return {
        'day': day_summary(count) if count else None,
        'run': run_summary(run) if run else None,
        'sections': [
            {**section_payload(s), **progress[s.pk], 'complete': progress[s.pk]['state'] == 'done'}
            for s in Section.objects.filter(is_active=True)
        ],
        'pending': mine,
        'carts': {
            'pr': cart_payload(current_cart(user, Cart.KIND_PR, create=False)),
            'relocate': cart_payload(current_cart(user, Cart.KIND_RELOCATE, create=False)),
        },
        'server_now': timezone.now(),
    }


# --- overview and report --------------------------------------------------------------------------

def day_detail(count: InventoryCount) -> dict:
    """Everything about one day: each section, its runs, who, when, how many, and the problems."""
    runs = list(count.runs.select_related('section', 'user').order_by('started_at'))
    by_section: dict[int, list[Run]] = defaultdict(list)
    for r in runs:
        by_section[r.section_id].append(r)
    progress = section_progress(count)
    sections = []
    for s in Section.objects.filter(Q(is_active=True) | Q(pk__in=by_section.keys())):
        sections.append({
            **section_payload(s),
            **progress[s.pk],
            'complete': progress[s.pk]['state'] == 'done',
            'runs': [run_summary(r) for r in by_section.get(s.pk, [])],
        })
    tally = Counter(
        count.issues.exclude(run__status=Run.STATUS_BAD).exclude(action=Issue.ACTION_CLEARED).values_list('kind', flat=True)
    )
    kinds = dict(Issue.KIND_CHOICES)
    base = day_summary(count)
    base.update({
        'sections': sections,
        'tally': [{'kind': k, 'label': kinds.get(k, k), 'n': n} for k, n in tally.most_common()],
        'issues': [issue_payload(i) for i in issues_qs().filter(count=count).exclude(action=Issue.ACTION_CLEARED)[:500]],
    })
    return base


def run_scans(run: Run) -> list[dict]:
    rows = run.scans.select_related('item__product').prefetch_related('issues').order_by('-seq', '-id')[:2000]
    return [scan_payload(r, issue=next(iter(r.issues.all()), None)) for r in rows]


def report(count: InventoryCount) -> dict:
    """What was not found, what sold meanwhile, what was found but should not be on the shelf."""
    seen = counted_ids(count)
    expected = expected_ids(count, seen)
    frozen = set(count.expected_item_ids or [])
    not_scanned = (expected - seen) | (frozen - expected - seen)
    items = Item.objects.filter(pk__in=not_scanned).select_related('product')
    missing, sold_meanwhile = [], []
    for it in items:
        row = {
            'sku': it.sku,
            'title': it.product.title,
            'location': it.location,
            'price': str(it.price),
            'retail': str(it.retail) if it.retail is not None else None,
            'cost': str(it.cost) if it.cost is not None else None,
            'listed_at': it.listed_at,
            'status': it.status,
        }
        (missing if it.pk in expected else sold_meanwhile).append(row)
    missing.sort(key=lambda r: (r['location'], r['sku']))
    good = good_scans(count)
    odd = [
        {'sku': s.item.sku, 'title': s.item.product.title, 'status': s.item_status, 'location': s.item.location}
        for s in good.filter(result=CountScan.RESULT_ODD, item__isnull=False).select_related('item__product')
    ]
    unknown = sorted(set(
        good.filter(result__in=[CountScan.RESULT_UNKNOWN, CountScan.RESULT_BAD_FORMAT]).values_list('code', flat=True)
    ))
    by_result = Counter(good.values_list('result', flat=True))
    base = day_summary(count)
    base.update({
        'already': by_result[CountScan.RESULT_ALREADY],
        'odd': by_result[CountScan.RESULT_ODD],
        'unknown': by_result[CountScan.RESULT_UNKNOWN] + by_result[CountScan.RESULT_BAD_FORMAT],
        'missing_count': len(missing),
        'missing_price_total': str(sum((Decimal(r['price']) for r in missing), Decimal('0'))),
        'missing_retail_total': str(sum((Decimal(r['retail']) for r in missing if r['retail']), Decimal('0'))),
        'missing_cost_total': str(sum((Decimal(r['cost']) for r in missing if r['cost']), Decimal('0'))),
        'shrink_pct': round(100 * len(missing) / len(expected), 2) if expected else 0,
        'missing': missing,
        'sold_meanwhile': sold_meanwhile,
        'odd_items': odd,
        'unknown_codes': unknown,
    })
    return base


def days(limit: int = 30) -> list[dict]:
    out = []
    for c in InventoryCount.objects.order_by(F('day').desc(nulls_last=True), '-started_at')[:limit]:
        row = day_summary(c)
        row['trial'] = c.day is None
        out.append(row)
    return out


# --- search ---------------------------------------------------------------------------------------

def search_items(q: str, limit: int = 12) -> list[dict]:
    """Find items by any words on them (SKU, title, brand, product number). On-shelf items first."""
    words = [w for w in re.split(r'\s+', (q or '').strip().lower()) if w][:6]
    if not words or sum(len(w) for w in words) < 2:
        return []
    qs = Item.objects.select_related('product')
    for w in words:
        qs = qs.filter(search_text__contains=w)
    rows = list(qs.order_by('-created_at')[: limit * 4])
    rows.sort(key=lambda i: (i.status != 'on_shelf', i.status == 'sold'))
    return [item_payload(i) for i in rows[:limit]]
