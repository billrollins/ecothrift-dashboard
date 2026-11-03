"""Bank deposits (Retail 5 step 2, Bill 2026-11-02: "BANK deposits (multiple cash drops or money from supplemental
drawer deposits)").

- **Bags:** the drawers' cash drops and the drops from their close-outs that have not gone to the bank. A bag is a label
  only: its cash was already in the office (a drop posts there; the close posts everything counted). One bag, one deposit.
- **Deposit:** the cash counted for the bank leaves the office or the safe (one ledger line: ``to_bank`` or a
  ``SafeLine`` deposit), never below zero by bill or coin. Counted less the bags' sum is kept as the difference, shown to
  whoever records it; past the drawer close's limit it needs a note. Pending until the bank has it (Mark deposited).
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.pos.services import safe as safe_service
from apps.pos.services.cash_counts import add_counts, clean_count, count_total
from apps.pos.services.drawer_life import close_note_over

BAG_DAYS = 45


class BankError(ValueError):
    def __init__(self, message: str, code: str = 'BANK_REFUSED'):
        super().__init__(message)
        self.code = code


def open_bags() -> list[dict]:
    """Bags not yet in a deposit, newest first (the last ``BAG_DAYS`` days)."""
    from apps.pos.models import CashDrop, DepositBag, Drawer

    since = timezone.now() - timedelta(days=BAG_DAYS)
    used_drops = DepositBag.objects.filter(kind=DepositBag.KIND_DROP).values('ref')
    used_closes = DepositBag.objects.filter(kind=DepositBag.KIND_CLOSE_OUT).values('ref')
    bags = []
    for d in (CashDrop.objects.filter(dropped_at__gte=since, drawer__register__is_training=False)
              .exclude(pk__in=used_drops).select_related('drawer__register')):
        bags.append({'kind': 'drop', 'ref': d.pk, 'at': d.dropped_at.isoformat(), 'register': d.drawer.register.name,
                     'total': str(d.total), 'count': {k: v for k, v in (d.amount or {}).items() if v},
                     'note': d.reason or ''})
    for dr in (Drawer.objects.filter(status='closed', closed_at__gte=since, close_out__isnull=False,
                                     register__is_training=False)
               .exclude(pk__in=used_closes).select_related('register')):
        out = dr.close_out or {}
        if Decimal(str(out.get('drop_total') or '0')) <= 0:
            continue
        pieces = {k: v for k, v in (out.get('drop') or {}).items() if v}
        # The close-out's drop pieces include what the office swapped back; offer them only when they add up.
        if count_total(pieces) != Decimal(str(out['drop_total'])):
            pieces = {}
        bags.append({'kind': 'close_out', 'ref': dr.pk, 'at': dr.closed_at.isoformat(), 'register': dr.register.name,
                     'total': str(out['drop_total']), 'count': pieces, 'note': ''})
    bags.sort(key=lambda b: b['at'], reverse=True)
    return bags


def deposit(bags, counted, source: str, user, *, note: str = ''):
    """Record a deposit: the bags it covers and the cash counted for the bank, out of the office or the safe."""
    from apps.pos.models import BankTransaction, DepositBag, SafeLine, SupplementalTransaction

    if source not in ('office', 'safe'):
        raise BankError('Say where the cash comes from: the office or the safe.')
    count = {k: v for k, v in clean_count(counted, 'Deposit').items() if v}
    total = count_total(count)
    if total <= 0:
        raise BankError('Count the cash going to the bank.')
    wanted = {(b.get('kind'), int(b.get('ref') or 0)) for b in (bags or []) if isinstance(b, dict)}
    open_by_key = {(b['kind'], b['ref']): b for b in open_bags()}
    missing = [k for k in wanted if k not in open_by_key]
    if missing:
        raise BankError('A bag is already in a deposit or no longer open.', 'BAG_TAKEN')
    chosen = [open_by_key[k] for k in wanted]
    bags_total = sum((Decimal(b['total']) for b in chosen), Decimal('0.00'))
    difference = total - bags_total if chosen else None
    note = (note or '').strip()
    if difference is not None and abs(difference) > close_note_over() and not note:
        raise BankError(f'The count is more than ${close_note_over()} off the bags. Add a note saying why.',
                        'NOTE_REQUIRED')
    try:
        with transaction.atomic():
            office = safe_service.office(lock=True)
            if office is None:
                raise BankError('There is no office cash set up.')
            if source == 'safe':
                holder = safe_service.get_safe(office.location, lock=True)
                have = holder.balance or {}
            else:
                holder, have = office, office.current_balance or {}
            if source == 'safe':
                lacking = [k for k, v in count.items() if int(have.get(k) or 0) < v]
                if lacking:
                    raise BankError(f'The safe does not hold enough {", ".join(lacking)}.')
            elif (office.current_total or Decimal('0')) < total:
                # The office by bill drifts (openings and close-out swaps are not piece-exact): its total is the check.
                raise BankError(f'The office holds only ${office.current_total}.')
            txn = BankTransaction.objects.create(
                location=office.location, transaction_type='deposit', amount=count, total=total, status='pending',
                performed_by=user, notes=note[:2000], source=source, bags_total=bags_total if chosen else None,
                difference=difference,
            )
            for b in chosen:
                DepositBag.objects.create(deposit=txn, kind=b['kind'], ref=b['ref'], total=Decimal(b['total']))
            if source == 'safe':
                SafeLine.objects.create(safe=holder, kind=SafeLine.KIND_DEPOSIT, out_of_safe=count, out_total=total,
                                        performed_by=user, note=f'Deposit #{txn.pk}')
                holder.balance = add_counts(holder.balance, count, -1)
                holder.total = (holder.total or Decimal('0')) - total
                holder.save(update_fields=['balance', 'total'])
            else:
                SupplementalTransaction.objects.create(supplemental=office, transaction_type='to_bank', amount=count,
                                                       total=total, performed_by=user, notes=f'Deposit #{txn.pk}')
                office.current_balance = add_counts(office.current_balance, count, -1)
                office.current_total = (office.current_total or Decimal('0')) - total
                office.save(update_fields=['current_balance', 'current_total'])
    except IntegrityError as exc:  # two people took the same bag at once
        raise BankError('A bag is already in a deposit.', 'BAG_TAKEN') from exc
    return txn


def change(counted, into: str, user, *, note: str = ''):
    """Change from the bank (Retail 5 step 3, Bill 2026-11-02: "bank change withdraws"): the bills and coins that came
    back go into the office or the safe. Paid from the bank account, so no cash leaves here. Done when recorded."""
    from apps.pos.models import BankTransaction, SafeLine, SupplementalTransaction

    if into not in ('office', 'safe'):
        raise BankError('Say where the change goes: the office or the safe.')
    count = {k: v for k, v in clean_count(counted, 'Change').items() if v}
    total = count_total(count)
    if total <= 0:
        raise BankError('Count the change that came from the bank.')
    with transaction.atomic():
        office = safe_service.office(lock=True)
        if office is None:
            raise BankError('There is no office cash set up.')
        txn = BankTransaction.objects.create(
            location=office.location, transaction_type='change_pickup', amount=count, total=total, status='completed',
            completed_at=timezone.now(), performed_by=user, notes=(note or '').strip()[:2000], source=into,
        )
        if into == 'safe':
            safe = safe_service.get_safe(office.location, lock=True)
            SafeLine.objects.create(safe=safe, kind=SafeLine.KIND_CHANGE, into_safe=count, into_total=total,
                                    performed_by=user, note=f'Change #{txn.pk}')
            safe.balance = add_counts(safe.balance, count)
            safe.total = (safe.total or Decimal('0')) + total
            safe.save(update_fields=['balance', 'total'])
        else:
            SupplementalTransaction.objects.create(supplemental=office, transaction_type='from_bank', amount=count,
                                                   total=total, performed_by=user, notes=f'Change #{txn.pk}')
            office.current_balance = add_counts(office.current_balance, count)
            office.current_total = (office.current_total or Decimal('0')) + total
            office.save(update_fields=['current_balance', 'current_total'])
    return txn
