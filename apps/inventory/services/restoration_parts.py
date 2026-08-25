"""Named parts orders: list, request, approve, buy, receive, inspect."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.inventory.models import (
    RestorationJob,
    RestorationPart,
    RestorationPartsOrder,
    RestorationPartsOrderLine,
)

MONEY = Decimal('0.01')
ZERO = Decimal('0')

OPEN_STATUSES = (
    RestorationPartsOrder.STATUS_REQUESTED,
    RestorationPartsOrder.STATUS_APPROVED,
    RestorationPartsOrder.STATUS_PURCHASED,
)
COMMITTED_STATUSES = (
    RestorationPartsOrder.STATUS_REQUESTED,
    RestorationPartsOrder.STATUS_APPROVED,
    RestorationPartsOrder.STATUS_PURCHASED,
    RestorationPartsOrder.STATUS_RECEIVED,
)
SPEND_STATUSES = (
    RestorationPartsOrder.STATUS_PURCHASED,
    RestorationPartsOrder.STATUS_RECEIVED,
)
LINE_INSPECT_ACCEPTABLE = 'acceptable'
LINE_INSPECT_ISSUES = 'issues'
CHICAGO = ZoneInfo('America/Chicago')

ATTENTION_CANCEL_ASK = 'cancel_ask'
ATTENTION_APPROVAL = 'approval'
ATTENTION_TO_PLACE = 'to_place'
ATTENTION_LATE = 'late'
ATTENTION_REVIEW = 'review'

FINISH_BLOCKED_MESSAGE = (
    'Parts are on order for this item. Receive or cancel the order before finishing.'
)


def _as_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def chicago_today() -> date:
    return timezone.now().astimezone(CHICAGO).date()


def chicago_date(when: datetime | None) -> date | None:
    if when is None:
        return None
    if timezone.is_naive(when):
        when = timezone.make_aware(when, CHICAGO)
    return when.astimezone(CHICAGO).date()


def expected_delivery_on(order: RestorationPartsOrder) -> date | None:
    """Purchase date plus shipping days, as an America/Chicago calendar day."""

    if order.purchased_at is None or order.est_shipping_days is None:
        return None
    if order.status not in (
        RestorationPartsOrder.STATUS_PURCHASED,
        RestorationPartsOrder.STATUS_RECEIVED,
        RestorationPartsOrder.STATUS_CANCELLED,
    ):
        return None
    start = chicago_date(order.purchased_at)
    if start is None:
        return None
    return start + timedelta(days=int(order.est_shipping_days))


def days_late(order: RestorationPartsOrder) -> int | None:
    """Positive only while the order is still purchased and the date has passed."""

    if order.status != RestorationPartsOrder.STATUS_PURCHASED:
        return None
    due = expected_delivery_on(order)
    if due is None:
        return None
    late = (chicago_today() - due).days
    return late if late > 0 else None


def order_needs_review(order: RestorationPartsOrder) -> bool:
    """Received, not yet inspected. Separate from marking it delivered."""

    return (
        order.status == RestorationPartsOrder.STATUS_RECEIVED
        and order.review_state != RestorationPartsOrder.REVIEW_REVIEWED
    )


def attention_for(order: RestorationPartsOrder) -> str:
    """One attention word. First match wins so counters, filters, and ribbons agree."""

    if order.cancel_requested_at is not None:
        return ATTENTION_CANCEL_ASK
    if order.status == RestorationPartsOrder.STATUS_REQUESTED:
        return ATTENTION_APPROVAL
    if order.status == RestorationPartsOrder.STATUS_APPROVED:
        return ATTENTION_TO_PLACE
    if days_late(order):
        return ATTENTION_LATE
    if order_needs_review(order):
        return ATTENTION_REVIEW
    return ''


def live_orders_filter() -> Q:
    """In-flight orders, plus received rows that have not been inspected yet."""

    return Q(
        status__in=(
            RestorationPartsOrder.STATUS_REQUESTED,
            RestorationPartsOrder.STATUS_APPROVED,
            RestorationPartsOrder.STATUS_PURCHASED,
        )
    ) | (
        Q(status=RestorationPartsOrder.STATUS_RECEIVED)
        & ~Q(review_state=RestorationPartsOrder.REVIEW_REVIEWED)
    )


def history_orders_filter() -> Q:
    """Settled spend: cancelled, denied, or inspected received orders."""

    return Q(
        status__in=(
            RestorationPartsOrder.STATUS_CANCELLED,
            RestorationPartsOrder.STATUS_DENIED,
        )
    ) | (
        Q(status=RestorationPartsOrder.STATUS_RECEIVED)
        & Q(review_state=RestorationPartsOrder.REVIEW_REVIEWED)
    )


def _eta_days(
    *,
    purchased_at: datetime,
    expected_on: Any = None,
    est_shipping_days: Any = None,
) -> int:
    due = _as_date(expected_on)
    if due is not None:
        start = chicago_date(purchased_at)
        if start is None:
            raise ValueError('That order has no purchase date.')
        days = (due - start).days
        if days < 0:
            raise ValueError('Delivery cannot be before the purchase date.')
        return days
    if est_shipping_days is None:
        raise ValueError('Say when it will arrive.')
    try:
        days = int(est_shipping_days)
    except (TypeError, ValueError) as exc:
        raise ValueError('Say how many days shipping will take.') from exc
    if days < 0:
        raise ValueError('Shipping days cannot be negative.')
    return days


def _money(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0)).quantize(MONEY, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        return ZERO


def _qty(value: Any) -> int:
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return 1


def _user_or_none(user):
    return user if getattr(user, 'pk', None) else None


def line_unit_cost(line: RestorationPartsOrderLine) -> Decimal:
    if line.unit_cost is not None:
        return _money(line.unit_cost)
    return _money(line.part.unit_price)


def line_subtotal(line: RestorationPartsOrderLine) -> Decimal:
    return line_unit_cost(line) * _qty(line.qty)


def order_all_lines_subtotal(order: RestorationPartsOrder) -> Decimal:
    return sum((line_subtotal(line) for line in order.lines.all()), ZERO)


def order_parts_lines_subtotal(order: RestorationPartsOrder) -> Decimal:
    total = ZERO
    for line in order.lines.all():
        if line.part.category != RestorationPart.CATEGORY_PARTS:
            continue
        total += line_subtotal(line)
    return total


def order_fees_total(order: RestorationPartsOrder) -> Decimal:
    return _money(order.shipping) + _money(order.tax) + _money(order.fees)


def order_total(order: RestorationPartsOrder) -> Decimal:
    return order_all_lines_subtotal(order) + order_fees_total(order)


def order_parts_cost(order: RestorationPartsOrder) -> Decimal:
    """Parts-category lines plus their pro-rata share of shipping, tax, and fees."""

    parts = order_parts_lines_subtotal(order)
    all_lines = order_all_lines_subtotal(order)
    fees = order_fees_total(order)
    if fees <= ZERO or all_lines <= ZERO:
        return parts
    return (parts + (fees * parts / all_lines)).quantize(MONEY, rounding=ROUND_HALF_UP)


def item_count(order: RestorationPartsOrder) -> int:
    """One inspectable row per bought line. Qty still multiplies cost only."""

    return len(order.lines.all())


def committed_parts_cost_for_grade(job: RestorationJob, grade: str) -> Decimal:
    total = ZERO
    for order in RestorationPartsOrder.objects.filter(
        job=job,
        target_grade=grade,
        status__in=COMMITTED_STATUSES,
    ).prefetch_related('lines__part'):
        total += order_parts_cost(order)
    return total


def actual_parts_cost_for_job(job: RestorationJob) -> Decimal:
    total = ZERO
    for order in RestorationPartsOrder.objects.filter(job=job).prefetch_related('lines__part'):
        if order.status in SPEND_STATUSES:
            total += order_parts_cost(order)
            continue
        if (
            order.status == RestorationPartsOrder.STATUS_CANCELLED
            and order.purchased_at
            and not order.refunded
        ):
            total += order_parts_cost(order)
    return total


class BlockingOrderError(ValueError):
    """Raised when requesting would collide with an approved or purchased order."""

    def __init__(self, order: RestorationPartsOrder):
        self.blocking_order = order
        word = 'purchased' if order.status == RestorationPartsOrder.STATUS_PURCHASED else 'approved'
        super().__init__(f'{order.name} is already {word}. Ask the owner to cancel it first.')


def _blocking_sibling(order: RestorationPartsOrder) -> RestorationPartsOrder | None:
    return (
        RestorationPartsOrder.objects.filter(
            job=order.job,
            status__in=(
                RestorationPartsOrder.STATUS_APPROVED,
                RestorationPartsOrder.STATUS_PURCHASED,
            ),
        )
        .exclude(pk=order.pk)
        .order_by('id')
        .first()
    )


def _clear_cancel_ask(order: RestorationPartsOrder, *, save: bool = False) -> list[str]:
    order.cancel_requested_at = None
    order.cancel_requested_by = None
    order.cancel_reason = ''
    if save:
        order.save(update_fields=['cancel_requested_at', 'cancel_requested_by', 'cancel_reason', 'updated_at'])
    return ['cancel_requested_at', 'cancel_requested_by', 'cancel_reason']


def _clear_queued_behind(order: RestorationPartsOrder) -> None:
    RestorationPartsOrder.objects.filter(queued_behind=order).update(queued_behind=None)


def job_has_open_parts_order(job: RestorationJob) -> bool:
    return RestorationPartsOrder.objects.filter(job=job, status__in=OPEN_STATUSES).exists()


def _timeline(job: RestorationJob, event_type: str, payload: dict[str, Any], *, user=None) -> None:
    from apps.inventory.services.restoration_bench import _timeline_event

    order_id = payload.get('order_id')
    _timeline_event(
        job,
        event_type,
        payload,
        actor=user,
        entity_id=f'parts-order:{order_id}' if order_id else 'parts-order',
    )


def _assert_status(order: RestorationPartsOrder, expected: str, *, doing: str) -> None:
    if order.status != expected:
        raise ValueError(f'That order cannot be {doing} from {order.status}.')


def _replace_lines(order: RestorationPartsOrder, lines: list[dict[str, Any]]) -> None:
    if not lines:
        raise ValueError('Add at least one part to the order.')
    seen: set[int] = set()
    order.lines.all().delete()
    for raw in lines:
        part_id = raw.get('part_id') or raw.get('part')
        try:
            part_id = int(part_id)
        except (TypeError, ValueError) as exc:
            raise ValueError('Each order line needs a part.') from exc
        if part_id in seen:
            raise ValueError('A part can only appear once on an order.')
        seen.add(part_id)
        try:
            part = RestorationPart.objects.get(pk=part_id, job=order.job)
        except RestorationPart.DoesNotExist as exc:
            raise ValueError('That part is not on this item.') from exc
        unit_cost = raw.get('unit_cost', None)
        RestorationPartsOrderLine.objects.create(
            order=order,
            part=part,
            qty=_qty(raw.get('qty', part.qty)),
            unit_cost=_money(unit_cost) if unit_cost not in (None, '') else None,
        )


@transaction.atomic
def create_part(
    job: RestorationJob,
    *,
    description: str = '',
    url: str = '',
    qty: Any = 1,
    unit_price: Any = 0,
    category: str = RestorationPart.CATEGORY_PARTS,
    part_number: str = '',
    user=None,
) -> RestorationPart:
    cat = str(category or RestorationPart.CATEGORY_PARTS).strip().lower()
    valid = {c[0] for c in RestorationPart.CATEGORY_CHOICES}
    if cat not in valid:
        raise ValueError(f'Unknown part category: {category}')
    return RestorationPart.objects.create(
        job=job,
        part_number=str(part_number or '').strip()[:64],
        description=str(description or '').strip()[:300],
        url=str(url or '').strip()[:200],
        qty=_qty(qty),
        unit_price=_money(unit_price),
        category=cat,
        created_by=_user_or_none(user),
    )


@transaction.atomic
def update_part(
    part: RestorationPart,
    *,
    description: str | None = None,
    url: str | None = None,
    qty: Any = None,
    unit_price: Any = None,
    category: str | None = None,
    part_number: str | None = None,
) -> RestorationPart:
    fields = ['updated_at']
    if description is not None:
        part.description = str(description).strip()[:300]
        fields.append('description')
    if url is not None:
        part.url = str(url).strip()[:200]
        fields.append('url')
    if qty is not None:
        part.qty = _qty(qty)
        fields.append('qty')
    if unit_price is not None:
        part.unit_price = _money(unit_price)
        fields.append('unit_price')
    if category is not None:
        cat = str(category).strip().lower()
        valid = {c[0] for c in RestorationPart.CATEGORY_CHOICES}
        if cat not in valid:
            raise ValueError(f'Unknown part category: {category}')
        part.category = cat
        fields.append('category')
    if part_number is not None:
        part.part_number = str(part_number).strip()[:64]
        fields.append('part_number')
    part.save(update_fields=fields)
    return part


@transaction.atomic
def delete_part(part: RestorationPart) -> None:
    if RestorationPartsOrderLine.objects.filter(part=part).exclude(
        order__status__in=(
            RestorationPartsOrder.STATUS_CANCELLED,
            RestorationPartsOrder.STATUS_DENIED,
        ),
    ).exists():
        raise ValueError('That part is on an order. Remove it from the order first.')
    RestorationPartsOrderLine.objects.filter(part=part).delete()
    part.delete()


@transaction.atomic
def create_order(
    job: RestorationJob,
    *,
    name: str,
    target_grade: str = '',
    shipping: Any = 0,
    tax: Any = 0,
    fees: Any = 0,
    lines: list[dict[str, Any]] | None = None,
    user=None,
) -> RestorationPartsOrder:
    name = str(name or '').strip()[:128]
    if not name:
        raise ValueError('Name the order.')
    grade = str(target_grade or '').strip()[:64]
    if not grade:
        raise ValueError('Say which grade this order would achieve.')
    order = RestorationPartsOrder.objects.create(
        job=job,
        name=name,
        target_grade=grade,
        shipping=_money(shipping),
        tax=_money(tax),
        fees=_money(fees),
        status=RestorationPartsOrder.STATUS_DRAFT,
    )
    _replace_lines(order, lines or [])
    return order


@transaction.atomic
def update_order(
    order: RestorationPartsOrder,
    *,
    name: str | None = None,
    target_grade: str | None = None,
    shipping: Any = None,
    tax: Any = None,
    fees: Any = None,
    lines: list[dict[str, Any]] | None = None,
) -> RestorationPartsOrder:
    if order.status != RestorationPartsOrder.STATUS_DRAFT:
        raise ValueError('Only a draft order can still be edited.')
    fields = ['updated_at']
    if name is not None:
        cleaned = str(name).strip()[:128]
        if not cleaned:
            raise ValueError('Name the order.')
        order.name = cleaned
        fields.append('name')
    if target_grade is not None:
        grade = str(target_grade).strip()[:64]
        if not grade:
            raise ValueError('Say which grade this order would achieve.')
        order.target_grade = grade
        fields.append('target_grade')
    if shipping is not None:
        order.shipping = _money(shipping)
        fields.append('shipping')
    if tax is not None:
        order.tax = _money(tax)
        fields.append('tax')
    if fees is not None:
        order.fees = _money(fees)
        fields.append('fees')
    order.save(update_fields=fields)
    if lines is not None:
        _replace_lines(order, lines)
    return order


@transaction.atomic
def withdraw_order(order: RestorationPartsOrder, *, user=None) -> RestorationPartsOrder:
    _assert_status(order, RestorationPartsOrder.STATUS_REQUESTED, doing='withdrawn')
    order.status = RestorationPartsOrder.STATUS_DRAFT
    order.requested_at = None
    order.requested_by = None
    order.save(update_fields=['status', 'requested_at', 'requested_by', 'updated_at'])
    _timeline(
        order.job,
        'parts.order_withdrawn',
        {'order_id': order.pk, 'name': order.name, 'target_grade': order.target_grade},
        user=user,
    )
    return order


@transaction.atomic
def request_order(
    order: RestorationPartsOrder,
    *,
    user=None,
    target_grade: str | None = None,
) -> RestorationPartsOrder:
    _assert_status(order, RestorationPartsOrder.STATUS_DRAFT, doing='requested')
    if target_grade is not None:
        grade = str(target_grade).strip()[:64]
        if grade:
            order.target_grade = grade
    if not order.target_grade:
        raise ValueError('Say which grade this order would achieve.')
    if not order.lines.exists():
        raise ValueError('Add at least one part to the order.')
    blocking = _blocking_sibling(order)
    if blocking:
        raise BlockingOrderError(blocking)
    for sibling in RestorationPartsOrder.objects.filter(
        job=order.job,
        status=RestorationPartsOrder.STATUS_REQUESTED,
    ).exclude(pk=order.pk):
        withdraw_order(sibling, user=user)
    now = timezone.now()
    order.status = RestorationPartsOrder.STATUS_REQUESTED
    order.requested_at = now
    order.requested_by = _user_or_none(user)
    order.queued_behind = None
    order.save(
        update_fields=['status', 'requested_at', 'requested_by', 'queued_behind', 'target_grade', 'updated_at']
    )
    _timeline(
        order.job,
        'parts.order_requested',
        {
            'order_id': order.pk,
            'name': order.name,
            'target_grade': order.target_grade,
            'total': str(order_total(order)),
        },
        user=user,
    )
    return order


@transaction.atomic
def request_cancel(
    order: RestorationPartsOrder,
    *,
    replacement: RestorationPartsOrder | None = None,
    reason: str = '',
    user=None,
) -> RestorationPartsOrder:
    if order.status not in (
        RestorationPartsOrder.STATUS_APPROVED,
        RestorationPartsOrder.STATUS_PURCHASED,
    ):
        raise ValueError('Only an approved or purchased order can be asked to cancel.')
    if replacement is not None:
        if replacement.job_id != order.job_id:
            raise ValueError('That replacement is not on this item.')
        if replacement.status != RestorationPartsOrder.STATUS_DRAFT:
            raise ValueError('Only a draft order can wait behind a cancel.')
        if replacement.pk == order.pk:
            raise ValueError('An order cannot replace itself.')
    RestorationPartsOrder.objects.filter(queued_behind=order).exclude(
        pk=replacement.pk if replacement else 0,
    ).update(queued_behind=None)
    if replacement is not None:
        replacement.queued_behind = order
        replacement.save(update_fields=['queued_behind', 'updated_at'])
    now = timezone.now()
    order.cancel_requested_at = now
    order.cancel_requested_by = _user_or_none(user)
    order.cancel_reason = str(reason or '').strip()[:2000]
    order.save(update_fields=['cancel_requested_at', 'cancel_requested_by', 'cancel_reason', 'updated_at'])
    _timeline(
        order.job,
        'parts.cancel_asked',
        {
            'order_id': order.pk,
            'name': order.name,
            'reason': order.cancel_reason,
            'replacement_id': replacement.pk if replacement else None,
            'replacement_name': replacement.name if replacement else '',
        },
        user=user,
    )
    return order


@transaction.atomic
def drop_queue(order: RestorationPartsOrder, *, user=None) -> RestorationPartsOrder:
    if order.queued_behind_id is None:
        raise ValueError('That order is not waiting on a cancel.')
    order.queued_behind = None
    order.save(update_fields=['queued_behind', 'updated_at'])
    return order


@transaction.atomic
def resolve_cancel(
    order: RestorationPartsOrder,
    *,
    confirmed: bool,
    refunded: bool = False,
    user=None,
) -> RestorationPartsOrder:
    if not order.cancel_requested_at:
        raise ValueError('Nobody has asked to cancel that order.')
    if order.status not in (
        RestorationPartsOrder.STATUS_APPROVED,
        RestorationPartsOrder.STATUS_PURCHASED,
    ):
        raise ValueError('That order is no longer waiting on a cancel.')
    replacement = order.queued_replacements.order_by('id').first()
    if confirmed:
        cancelled = cancel_order(order, user=user, force=True, refunded=refunded)
        _timeline(
            cancelled.job,
            'parts.cancel_confirmed',
            {
                'order_id': cancelled.pk,
                'name': cancelled.name,
                'refunded': cancelled.refunded,
                'replacement_id': replacement.pk if replacement else None,
                'replacement_name': replacement.name if replacement else '',
            },
            user=user,
        )
        if replacement is not None:
            replacement.queued_behind = None
            replacement.save(update_fields=['queued_behind', 'updated_at'])
            try:
                request_order(replacement, user=user)
            except ValueError:
                _timeline(
                    cancelled.job,
                    'parts.order_withdrawn',
                    {
                        'order_id': replacement.pk,
                        'name': replacement.name,
                        'note': 'Queued replacement could not be requested after the cancel.',
                    },
                    user=user,
                )
        return cancelled
    _clear_queued_behind(order)
    _clear_cancel_ask(order, save=True)
    _timeline(
        order.job,
        'parts.cancel_refused',
        {
            'order_id': order.pk,
            'name': order.name,
            'replacement_id': replacement.pk if replacement else None,
            'replacement_name': replacement.name if replacement else '',
        },
        user=user,
    )
    return order


@transaction.atomic
def cancel_order(
    order: RestorationPartsOrder,
    *,
    user=None,
    force: bool = False,
    refunded: bool = False,
) -> RestorationPartsOrder:
    allowed = (
        RestorationPartsOrder.STATUS_DRAFT,
        RestorationPartsOrder.STATUS_REQUESTED,
    )
    if force:
        allowed = allowed + (
            RestorationPartsOrder.STATUS_APPROVED,
            RestorationPartsOrder.STATUS_PURCHASED,
        )
    if order.status not in allowed:
        raise ValueError('Only a draft or requested order can be cancelled.')
    order.status = RestorationPartsOrder.STATUS_CANCELLED
    if refunded:
        order.refunded = True
    fields = ['status', 'updated_at']
    if refunded:
        fields.append('refunded')
    fields.extend(_clear_cancel_ask(order))
    order.queued_behind = None
    fields.append('queued_behind')
    order.save(update_fields=fields)
    _clear_queued_behind(order)
    _timeline(
        order.job,
        'parts.order_cancelled',
        {'order_id': order.pk, 'name': order.name, 'refunded': order.refunded},
        user=user,
    )
    return order


@transaction.atomic
def approve_order(order: RestorationPartsOrder, *, user=None) -> RestorationPartsOrder:
    _assert_status(order, RestorationPartsOrder.STATUS_REQUESTED, doing='approved')
    now = timezone.now()
    order.status = RestorationPartsOrder.STATUS_APPROVED
    order.approved_at = now
    order.approved_by = _user_or_none(user)
    order.save(update_fields=['status', 'approved_at', 'approved_by', 'updated_at'])
    _timeline(
        order.job,
        'parts.order_approved',
        {'order_id': order.pk, 'name': order.name, 'target_grade': order.target_grade},
        user=user,
    )
    return order


@transaction.atomic
def deny_order(order: RestorationPartsOrder, *, reason: str, user=None) -> RestorationPartsOrder:
    _assert_status(order, RestorationPartsOrder.STATUS_REQUESTED, doing='denied')
    reason = str(reason or '').strip()
    if not reason:
        raise ValueError('Say why this order is denied.')
    order.status = RestorationPartsOrder.STATUS_DENIED
    order.denied_reason = reason[:2000]
    order.save(update_fields=['status', 'denied_reason', 'updated_at'])
    _timeline(
        order.job,
        'parts.order_denied',
        {'order_id': order.pk, 'name': order.name, 'reason': order.denied_reason},
        user=user,
    )
    return order


@transaction.atomic
def purchase_order(
    order: RestorationPartsOrder,
    *,
    est_shipping_days: int | None = None,
    expected_on: Any = None,
    user=None,
) -> RestorationPartsOrder:
    _assert_status(order, RestorationPartsOrder.STATUS_APPROVED, doing='purchased')
    now = timezone.now()
    days = _eta_days(purchased_at=now, expected_on=expected_on, est_shipping_days=est_shipping_days)
    order.status = RestorationPartsOrder.STATUS_PURCHASED
    order.est_shipping_days = days
    order.purchased_at = now
    order.purchased_by = _user_or_none(user)
    order.save(update_fields=['status', 'est_shipping_days', 'purchased_at', 'purchased_by', 'updated_at'])
    due = expected_delivery_on(order)
    _timeline(
        order.job,
        'parts.order_purchased',
        {
            'order_id': order.pk,
            'name': order.name,
            'est_shipping_days': days,
            'expected_delivery_on': due.isoformat() if due else '',
            'total': str(order_total(order)),
        },
        user=user,
    )
    return order


@transaction.atomic
def revise_eta(
    order: RestorationPartsOrder,
    *,
    expected_on: Any = None,
    est_shipping_days: int | None = None,
    user=None,
) -> RestorationPartsOrder:
    _assert_status(order, RestorationPartsOrder.STATUS_PURCHASED, doing='revised')
    if order.purchased_at is None:
        raise ValueError('That order has no purchase date.')
    previous_days = order.est_shipping_days
    previous_on = expected_delivery_on(order)
    days = _eta_days(
        purchased_at=order.purchased_at,
        expected_on=expected_on,
        est_shipping_days=est_shipping_days,
    )
    order.est_shipping_days = days
    order.save(update_fields=['est_shipping_days', 'updated_at'])
    due = expected_delivery_on(order)
    _timeline(
        order.job,
        'parts.order_eta_revised',
        {
            'order_id': order.pk,
            'name': order.name,
            'previous_days': previous_days,
            'est_shipping_days': days,
            'previous_on': previous_on.isoformat() if previous_on else '',
            'expected_delivery_on': due.isoformat() if due else '',
        },
        user=user,
    )
    return order


@transaction.atomic
def receive_order(order: RestorationPartsOrder, *, user=None) -> RestorationPartsOrder:
    _assert_status(order, RestorationPartsOrder.STATUS_PURCHASED, doing='received')
    now = timezone.now()
    order.status = RestorationPartsOrder.STATUS_RECEIVED
    order.received_at = now
    order.received_by = _user_or_none(user)
    if order.review_state != RestorationPartsOrder.REVIEW_REVIEWED:
        order.review_state = RestorationPartsOrder.REVIEW_NEEDS
    order.save(update_fields=['status', 'received_at', 'received_by', 'review_state', 'updated_at'])
    _timeline(
        order.job,
        'parts.order_received',
        {'order_id': order.pk, 'name': order.name, 'target_grade': order.target_grade},
        user=user,
    )
    return order


def _inspect_verdict(raw: dict) -> str:
    verdict = str(raw.get('verdict') or raw.get('result') or '').strip()
    if verdict == 'issue':
        return LINE_INSPECT_ISSUES
    return verdict


@transaction.atomic
def inspect_order(order: RestorationPartsOrder, *, lines: list[dict], user=None) -> RestorationPartsOrder:
    if order.status != RestorationPartsOrder.STATUS_RECEIVED:
        raise ValueError('Receive the order before inspecting it.')
    if order.review_state == RestorationPartsOrder.REVIEW_REVIEWED:
        raise ValueError('That order is already inspected.')
    existing = list(order.lines.all())
    if not existing:
        raise ValueError('This order has no lines to inspect.')
    incoming: dict[int, dict] = {}
    for row in lines or []:
        try:
            line_id = int(row.get('id'))
        except (TypeError, ValueError, AttributeError):
            raise ValueError('Mark every line Acceptable or Issues.') from None
        incoming[line_id] = row
    missing = [line.pk for line in existing if line.pk not in incoming]
    if missing:
        raise ValueError('Mark every line Acceptable or Issues.')
    extra = set(incoming) - {line.pk for line in existing}
    if extra:
        raise ValueError('That line is not on this order.')

    issues: list[str] = []
    for line in existing:
        raw = incoming[line.pk]
        verdict = _inspect_verdict(raw)
        note = str(raw.get('note') or '').strip()
        if verdict not in (LINE_INSPECT_ACCEPTABLE, LINE_INSPECT_ISSUES):
            raise ValueError('Mark every line Acceptable or Issues.')
        if verdict == LINE_INSPECT_ISSUES and not note:
            label = (line.part.description or 'that part').strip() or 'that part'
            raise ValueError(f'Say what is wrong with {label}.')
        if verdict == LINE_INSPECT_ACCEPTABLE:
            note = ''
        line.inspect_verdict = verdict
        line.inspect_note = note[:2000]
        line.save(update_fields=['inspect_verdict', 'inspect_note'])
        if verdict == LINE_INSPECT_ISSUES:
            issues.append(f'{line.part.description or "Part"}: {note}')

    order.review_state = RestorationPartsOrder.REVIEW_REVIEWED
    order.review_note = '; '.join(issues) if issues else 'All acceptable'
    order.save(update_fields=['review_state', 'review_note', 'updated_at'])
    _timeline(
        order.job,
        'parts.order_inspected',
        {
            'order_id': order.pk,
            'name': order.name,
            'target_grade': order.target_grade,
            'issues': len(issues),
            'note': order.review_note,
        },
        user=user,
    )
    return order


def parts_orders_needing_review():
    """Received orders that have not been inspected yet."""

    return RestorationPartsOrder.objects.filter(
        status=RestorationPartsOrder.STATUS_RECEIVED,
    ).exclude(review_state=RestorationPartsOrder.REVIEW_REVIEWED).select_related(
        'job',
        'job__product',
        'job__item_check_in',
    )
