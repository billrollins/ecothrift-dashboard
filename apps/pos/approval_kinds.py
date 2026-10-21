"""
Register fixes that go through Superuser → Requests (staged in production, approved by the owner).

- ``pos.thrift_paid`` (Bill, 2026-10-21, R-20261020-009): a completed sale that Thrift+ credit and/or ThriftBucks paid in
  full but that was recorded as cash or card. It becomes paid with Thrift+: the payment method, and no cash tendered,
  change or card amount. The money in every report is the same (nothing was due, so no cash or card was counted); only
  how it was paid changes. Undo puts each sale back as it was.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Exists, F, OuterRef, Q

from apps.core.models import ApprovalRequest
from apps.core.services.approval_requests import Kind, Progress, register

CHUNK = 200
_FIELDS = ('payment_method', 'cash_tendered', 'change_given', 'card_amount', 'card_type', 'card_surcharge_rate',
           'card_surcharge_amount', 'card_charged_total')


def thrift_paid_as_other():
    """Completed real sales with nothing due after Thrift+ (credit, ThriftBucks or both) still marked cash or card."""
    from apps.pos.models import Cart, CartLine

    bucks = CartLine.objects.filter(cart=OuterRef('pk'), line_kind=CartLine.LINE_KIND_DISCOUNT, meta__thrift='bucks')
    return (
        Cart.objects.filter(status='completed', drawer__register__is_training=False,
                            payment_method__in=('cash', 'card', 'split'), total__lte=F('thrift_credit'))
        .annotate(has_bucks=Exists(bucks))
        .filter(Q(thrift_credit__gt=0) | Q(has_bucks=True))
    )


def _row(cart) -> dict:
    receipt = getattr(cart, 'receipt', None)
    return {
        'sale': cart.pk, 'receipt': receipt.receipt_number if receipt else None,
        'completed': cart.completed_at.date().isoformat() if cart.completed_at else None,
        'recorded_as': cart.payment_method, 'total': str(cart.total), 'thrift_credit': str(cart.thrift_credit),
    }


def _preview(params: dict) -> dict:
    qs = thrift_paid_as_other().select_related('receipt').order_by('completed_at')
    ids = list(qs.values_list('pk', flat=True))
    return {
        'counts': {'Sales paid in full with Thrift+ but recorded as cash or card': len(ids)},
        'changes': [
            f'Marks {len(ids):,} sales as paid with Thrift+, with no cash tendered, change or card amount.',
            'No money moves: nothing was due on them, so no report counted cash or card for them. Undo puts them back.',
        ],
        'sample': [_row(c) for c in qs[:20]],
        'params': {'ids': ids},
    }


def _apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.pos.models import Cart

    ids = sorted(int(i) for i in request.params.get('ids') or [])
    before = dict(progress.state.get('before') or {})
    start = int(progress.cursor or 0)
    still = thrift_paid_as_other()
    for i in range(start, len(ids), CHUNK):
        with transaction.atomic():
            for cart in Cart.objects.select_for_update().filter(pk__in=still.filter(pk__in=ids[i:i + CHUNK]).values('pk')):
                before[str(cart.pk)] = {f: (str(getattr(cart, f)) if getattr(cart, f) is not None else None) for f in _FIELDS}
                cart.payment_method = 'thrift'
                cart.cash_tendered = cart.change_given = cart.card_amount = cart.card_charged_total = None
                cart.card_type = ''
                cart.card_surcharge_rate = Decimal('0')
                cart.card_surcharge_amount = Decimal('0')
                cart.save(update_fields=list(_FIELDS))
        progress.update(done=min(i + CHUNK, len(ids)), total=len(ids), cursor=i + CHUNK, before=before,
                        log=f'{len(before):,} marked paid with Thrift+ so far.')
    return {'marked_thrift': len(before), 'before': before}


def _undo(request: ApprovalRequest) -> dict:
    from apps.pos.models import Cart

    before = (request.result or {}).get('before') or {}
    n = 0
    with transaction.atomic():
        for pk, fields in before.items():
            cart = Cart.objects.select_for_update().filter(pk=int(pk), payment_method='thrift').first()
            if cart is None:
                continue
            for f in _FIELDS:
                raw = fields.get(f)
                if f in ('payment_method', 'card_type'):
                    setattr(cart, f, raw or '')
                else:
                    setattr(cart, f, Decimal(raw) if raw is not None else None)
            cart.save(update_fields=list(_FIELDS))
            n += 1
    return {'put_back': n}


register(Kind(
    kind='pos.thrift_paid', label='Register: sales paid in full with Thrift+ marked paid with Thrift+',
    preview=_preview, apply=_apply, undo=_undo,
))
