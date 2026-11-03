"""The safe and the office cash (Retail 5 step 1, Bill 2026-11-02: "if supplemental cash needs to exchange with safe
that needs a process/app page and alert").

- **Target:** the owner sets what the office (the supplemental drawer) should hold, by bill and coin, and a cap on its
  total (AppSetting ``pos.office_target`` = ``{"count": {...}, "cap": "600.00"}``). No target, no alert.
- **Needs a swap:** a bill or coin is under its target, or the office total is over the cap.
- **Suggested swap:** take from the safe what the office lacks (as far as the safe has it); put in the safe what the
  office holds over its target.
- **Swap:** one ``SafeLine`` and the office ledger lines (``from_safe``, ``to_safe``), both balances moved, in one
  transaction. Neither side can go below zero.
- **Count:** blind; it sets the safe's balance and keeps the difference (only the owner sees it).
Owner and managers only (the views check it).
"""
from __future__ import annotations

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.pos.services.cash_counts import CashCountError, add_counts, clean_amount, clean_count, count_total

SETTING_KEY_OFFICE_TARGET = 'pos.office_target'


class SafeError(ValueError):
    """Refused; the message is shown as it is."""


def office(*, lock: bool = False):
    """The office cash (the supplemental drawer), or None when none is set up."""
    from apps.pos.models import SupplementalDrawer

    qs = SupplementalDrawer.objects.select_for_update() if lock else SupplementalDrawer.objects
    return qs.select_related('location').first()


def get_safe(location=None, *, lock: bool = False):
    """The store's safe (made, empty, the first time)."""
    from apps.pos.models import Safe

    qs = Safe.objects.select_for_update() if lock else Safe.objects
    safe = (qs.filter(location=location).first() if location is not None else None) or qs.first()
    if safe is None:
        try:
            with transaction.atomic():
                safe = Safe.objects.create(location=location)
        except IntegrityError:  # two first visits at once: the other one made it
            safe = qs.filter(location=location).first()
    return safe


def office_target() -> dict | None:
    from apps.core.models import AppSetting

    row = AppSetting.objects.filter(key=SETTING_KEY_OFFICE_TARGET).first()
    raw = row.value if row and isinstance(row.value, dict) else None
    if not raw:
        return None
    try:
        count = clean_count(raw.get('count'), 'Office target')
        cap = clean_amount(raw.get('cap'), 'Office cap')
    except CashCountError:
        return None
    count = {k: v for k, v in count.items() if v}
    if not count and cap is None:
        return None
    return {'count': count, 'total': str(count_total(count)), 'cap': str(cap) if cap is not None else None}


def set_office_target(count, cap, user) -> dict | None:
    from apps.core.models import AppSetting

    count = {k: v for k, v in clean_count(count, 'Office target').items() if v}
    cap = clean_amount(cap, 'Office cap')
    AppSetting.objects.update_or_create(
        key=SETTING_KEY_OFFICE_TARGET,
        defaults={'value': {'count': count, 'cap': str(cap) if cap is not None else None},
                  'description': 'What the office cash should hold, by bill and coin, and a cap on its total.',
                  'updated_by': user},
    )
    return office_target()


def status(the_office, safe, *, owner: bool = True) -> dict:
    """The office beside its target: what it is short of, whether it is over the cap, and the suggested swap."""
    target = office_target()
    nothing = {'target': target, 'needs_swap': False, 'short': {}, 'over_cap': False,
               'suggested': {'take_from_safe': {}, 'put_in_safe': {}}}
    if target is None or the_office is None:
        return nothing
    # A count below 0 means the office ledger drifted from the cash; it holds none of it, not a debt.
    have = {k: max(0, int(v or 0)) for k, v in (the_office.current_balance or {}).items()}
    in_safe = {k: max(0, int(v or 0)) for k, v in (safe.balance or {}).items()}
    want = target['count']
    short = {k: n - have.get(k, 0) for k, n in want.items() if have.get(k, 0) < n}
    over_cap = target['cap'] is not None and (the_office.current_total or Decimal('0')) > Decimal(target['cap'])
    # Trimmed to what the safe holds for the owner only: for a manager that would show the safe by bill (the swap
    # itself refuses what the safe lacks).
    take = ({k: min(n, in_safe.get(k, 0)) for k, n in short.items() if in_safe.get(k, 0) > 0} if owner
            else dict(short))
    put = {k: have[k] - want.get(k, 0) for k in have if have[k] > want.get(k, 0)} if over_cap else {
        k: have.get(k, 0) - n for k, n in want.items() if have.get(k, 0) > n}
    return {'target': target, 'needs_swap': bool(short) or over_cap, 'short': short, 'over_cap': over_cap,
            'suggested': {'take_from_safe': take, 'put_in_safe': put}}


def swap(put_in_safe, take_from_safe, user, *, note: str = ''):
    """Pieces from the office into the safe and from the safe into the office, all or nothing."""
    from apps.pos.models import SafeLine, SupplementalTransaction

    put = {k: v for k, v in clean_count(put_in_safe, 'Into the safe').items() if v}
    take = {k: v for k, v in clean_count(take_from_safe, 'Out of the safe').items() if v}
    if not put and not take:
        raise SafeError('Nothing to swap.')
    with transaction.atomic():
        the_office = office(lock=True)
        if the_office is None:
            raise SafeError('There is no office cash set up.')
        safe = get_safe(the_office.location, lock=True)
        lacking = [k for k, v in put.items() if int((the_office.current_balance or {}).get(k) or 0) < v]
        if lacking:
            raise SafeError(f'The office does not hold enough {", ".join(lacking)}.')
        lacking = [k for k, v in take.items() if int((safe.balance or {}).get(k) or 0) < v]
        if lacking:
            raise SafeError(f'The safe does not hold enough {", ".join(lacking)}.')
        put_total, take_total = count_total(put), count_total(take)
        line = SafeLine.objects.create(safe=safe, kind=SafeLine.KIND_SWAP, into_safe=put, into_total=put_total,
                                       out_of_safe=take, out_total=take_total, performed_by=user, note=note[:300])
        safe.balance = add_counts(add_counts(safe.balance, put), take, -1)
        safe.total = (safe.total or Decimal('0')) + put_total - take_total
        safe.save(update_fields=['balance', 'total'])
        if take:
            SupplementalTransaction.objects.create(supplemental=the_office, transaction_type='from_safe', amount=take,
                                                   total=take_total, performed_by=user, notes=note[:500])
        if put:
            SupplementalTransaction.objects.create(supplemental=the_office, transaction_type='to_safe', amount=put,
                                                   total=put_total, performed_by=user, notes=note[:500])
        the_office.current_balance = add_counts(add_counts(the_office.current_balance, take), put, -1)
        the_office.current_total = (the_office.current_total or Decimal('0')) + take_total - put_total
        the_office.save(update_fields=['current_balance', 'current_total'])
    return line


def count(counted, user, *, note: str = ''):
    """A blind count of the safe: it becomes the balance; the difference is kept on the line."""
    from apps.pos.models import SafeLine

    counted = {k: v for k, v in clean_count(counted, 'Safe count').items() if v}
    with transaction.atomic():
        the_office = office()
        safe = get_safe(the_office.location if the_office else None, lock=True)
        total = count_total(counted)
        line = SafeLine.objects.create(safe=safe, kind=SafeLine.KIND_COUNT, into_safe=counted, into_total=total,
                                       difference=total - (safe.total or Decimal('0')), performed_by=user,
                                       note=note[:300])
        safe.balance, safe.total = counted, total
        safe.last_counted_by, safe.last_counted_at = user, timezone.now()
        safe.save()
    return line
