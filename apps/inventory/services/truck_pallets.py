"""Truck pallets: each pallet's number from arrival through processing, and received vs manifest per pallet.

A truck (``PurchaseOrder``) has ``TruckPallet`` rows numbered 1..N. Their codes come from the manifest's pallet ids
(``ManifestRow.tracking['pallet_id']``) when it has them, else from the label typed at arrival. Every check-in carries
the pallet being processed (``ItemCheckIn.pallet`` / ``Item.pallet``).

The ledger (``pallet_ledger``) puts the manifest beside what was checked in:

- **Manifest units and $** are the manifest's own: ``ManifestRow.quantity`` x ``unit_retail``.
- **Received** per manifest line is the share of its processing rows' units checked in (items no longer in
  intake/processing, and not marked lost), capped at 100%; a break-apart or set row therefore still compares
  like with like. Extras on a line are counted as ``over_units`` (processing units), never netted against
  another line's missing.
- **Missing** = manifest units (and $) not received. A pallet's missing counts its manifest lines (by the
  manifest pallet id), wherever the units were found.
- **Running missing %** is over finished pallets only, so it means something while the truck is in progress.
  With no pallet ids on the manifest it is unknown until the truck is done (shown as such, never guessed).
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.inventory.models import (
    Item,
    ItemCheckIn,
    ManifestRow,
    ProcessingRow,
    PurchaseOrder,
    Receiving,
    TruckPallet,
)

_NOT_RECEIVED_STATUSES = ('intake', 'processing', 'lost')
_ZERO = Decimal('0')


def pallet_code_of(tracking: Any) -> str:
    if not isinstance(tracking, dict):
        return ''
    return str(tracking.get('pallet_id') or '').strip()


def short_label(code: str) -> str:
    """``LIQ:3PL:PALLET:LNRM:PAL-82404`` -> ``PAL-82404``; plain codes stay as they are."""
    code = (code or '').strip()
    if ':' in code:
        tail = code.rsplit(':', 1)[-1].strip()
        if tail:
            return tail
    return code


def _norm(code: str) -> str:
    return (code or '').strip().lower()


def manifest_pallet_codes(order: PurchaseOrder) -> list[str]:
    """Distinct manifest pallet ids, in the order they first appear on the manifest."""
    seen: dict[str, str] = {}
    rows = (
        ManifestRow.objects.filter(purchase_order=order)
        .exclude(tracking__pallet_id__isnull=True)
        .order_by('row_number')
        .values_list('tracking__pallet_id', flat=True)
    )
    for raw in rows:
        code = str(raw or '').strip()
        if code and _norm(code) not in seen:
            seen[_norm(code)] = code
    return list(seen.values())


def _target_count(order: PurchaseOrder, n_codes: int) -> int:
    received = (
        Receiving.objects.filter(purchase_order=order).values_list('received_pallet_count', flat=True).first() or 0
    )
    return max(int(order.pallet_count or 0), int(received), n_codes)


def ensure_truck_pallets(order: PurchaseOrder) -> list[TruckPallet]:
    """Create the truck's pallets: one per manifest pallet id, then blanks up to the expected pallet count."""
    with transaction.atomic():
        existing = list(TruckPallet.objects.select_for_update().filter(purchase_order=order).order_by('number'))
        by_code = {_norm(p.code): p for p in existing if p.code}
        next_number = max((p.number for p in existing), default=0) + 1
        blanks = [p for p in existing if not p.code]
        for code in manifest_pallet_codes(order):
            if _norm(code) in by_code:
                continue
            if blanks:
                p = blanks.pop(0)
                p.code = code
                p.from_manifest = True
                p.save(update_fields=['code', 'from_manifest', 'updated_at'])
            else:
                p = TruckPallet.objects.create(
                    purchase_order=order, number=next_number, code=code, from_manifest=True,
                )
                existing.append(p)
                next_number += 1
            by_code[_norm(code)] = p
        target = _target_count(order, len(by_code))
        while len(existing) < target:
            existing.append(TruckPallet.objects.create(purchase_order=order, number=next_number))
            next_number += 1
    return sorted(existing, key=lambda p: p.number)


def find_pallet(order: PurchaseOrder, raw: Any) -> TruckPallet | None:
    """Match a scanned or typed pallet: the full code, its short label, a code ending, or the pallet number."""
    text = str(raw or '').strip()
    if not text:
        return None
    pallets = list(TruckPallet.objects.filter(purchase_order=order).order_by('number'))
    low = text.lower()
    for p in pallets:
        if p.code and (_norm(p.code) == low or _norm(short_label(p.code)) == low):
            return p
    if len(low) >= 3:
        ends = [p for p in pallets if p.code and _norm(p.code).endswith(low)]
        if len(ends) == 1:
            return ends[0]
    digits = low.lstrip('#')
    if digits.isdigit():
        for p in pallets:
            if p.number == int(digits):
                return p
    return None


def _pallet_has_units(pallet: TruckPallet) -> bool:
    return Item.objects.filter(pallet=pallet).exists() or ItemCheckIn.objects.filter(pallet=pallet).exists()


def record_arrival(user, order: PurchaseOrder, number: int, code: str | None = None) -> TruckPallet:
    """Receiving: pallet slot ``number`` arrived, with the number on its label.

    A label that is already another slot's code swaps the two codes (the manifest's pallet 7 was unloaded as the
    third pallet); refused once either pallet has units checked in.
    """
    ensure_truck_pallets(order)
    with transaction.atomic():
        pallet = TruckPallet.objects.select_for_update().filter(purchase_order=order, number=number).first()
        if pallet is None:
            if number < 1 or number > 200:
                raise ValueError('Pallet number must be 1-200.')
            pallet = TruckPallet.objects.create(purchase_order=order, number=number)
        fields = ['updated_at']
        if code is not None:
            new_code = str(code).strip()[:120]
            if _norm(new_code) != _norm(pallet.code):
                other = None
                if new_code:
                    other = (
                        TruckPallet.objects.select_for_update()
                        .filter(purchase_order=order, code__iexact=new_code)
                        .exclude(pk=pallet.pk)
                        .first()
                    )
                if other is not None:
                    if _pallet_has_units(other) or _pallet_has_units(pallet):
                        raise ValueError(
                            f'Pallet {new_code} is already pallet #{other.number} with items checked in.',
                        )
                    other.code, other.from_manifest, pallet.from_manifest = pallet.code, pallet.from_manifest, True
                    other.save(update_fields=['code', 'from_manifest', 'updated_at'])
                else:
                    pallet.from_manifest = False
                pallet.code = new_code
                fields += ['code', 'from_manifest']
        if pallet.arrived_at is None:
            pallet.arrived_at = timezone.now()
            pallet.arrived_by = user if getattr(user, 'is_authenticated', False) else None
            fields += ['arrived_at', 'arrived_by']
        pallet.save(update_fields=fields)
    return pallet


def start_pallet(user, order: PurchaseOrder, pallet: TruckPallet) -> TruckPallet:
    """Processing starts (or picks back up) this pallet; the user's check-ins go to it from now on."""
    now = timezone.now()
    pallet.started_by = user
    if pallet.started_at is None:
        pallet.started_at = now
    pallet.done_at = None
    pallet.done_by = None
    if pallet.arrived_at is None:
        pallet.arrived_at = now
        pallet.arrived_by = user
    # started_at keeps the first start; updated_at is the "most recent pick" for current_pallet_for.
    pallet.save()
    return pallet


def finish_pallet(user, order: PurchaseOrder, pallet: TruckPallet) -> TruckPallet:
    pallet.done_at = timezone.now()
    pallet.done_by = user
    if pallet.started_at is None:
        pallet.started_at = pallet.done_at
        pallet.started_by = user
    pallet.save()
    return pallet


def reopen_pallet(user, order: PurchaseOrder, pallet: TruckPallet) -> TruckPallet:
    pallet.done_at = None
    pallet.done_by = None
    pallet.started_by = user
    pallet.save()
    return pallet


def current_pallet_for(user, order: PurchaseOrder) -> TruckPallet | None:
    """The open pallet this user picked last; else the one open pallet on the truck being worked most recently."""
    open_qs = TruckPallet.objects.filter(purchase_order=order, started_at__isnull=False, done_at__isnull=True)
    if getattr(user, 'is_authenticated', False):
        mine = open_qs.filter(started_by=user).order_by('-updated_at').first()
        if mine is not None:
            return mine
    return open_qs.order_by('-updated_at').first()


def resolve_check_in_pallet(user, order: PurchaseOrder, data: dict, manifest_row: ManifestRow | None):
    """Pallet for a check-in: the one sent, else the pallet being processed, else the manifest line's pallet."""
    raw = data.get('pallet_id') if isinstance(data, dict) else None
    if raw not in (None, ''):
        try:
            pallet = TruckPallet.objects.filter(purchase_order=order, pk=int(raw)).first()
        except (TypeError, ValueError):
            pallet = None
        if pallet is None:
            raise ValueError('That pallet is not on this order.')
        return pallet
    pallet = current_pallet_for(user, order)
    if pallet is not None:
        return pallet
    code = pallet_code_of(getattr(manifest_row, 'tracking', None)) if manifest_row is not None else ''
    if code:
        return TruckPallet.objects.filter(purchase_order=order, code__iexact=code).first()
    return None


# --- ledger -------------------------------------------------------------------------------------------------


def _money(v: Decimal | None) -> str | None:
    if v is None:
        return None
    return str(Decimal(v).quantize(Decimal('0.01')))


def _units(v: Decimal) -> float:
    q = float(v)
    return round(q, 1) if abs(q - round(q)) > 0.05 else float(round(q))


def _pct(part: Decimal, whole: Decimal) -> float | None:
    if not whole:
        return None
    return round(float(part) * 100.0 / float(whole), 1)


def _bucket() -> dict[str, Any]:
    return {
        'manifest_lines': 0,
        'manifest_units': _ZERO,
        'manifest_retail': _ZERO,
        'lines_without_retail': 0,
        'received_units': _ZERO,
        'received_retail': _ZERO,
        'missing_units': _ZERO,
        'missing_retail': _ZERO,
        'over_units': 0,
        'broken_units': 0,
    }


def _bucket_out(b: dict[str, Any]) -> dict[str, Any]:
    return {
        'manifest_lines': b['manifest_lines'],
        'manifest_units': _units(b['manifest_units']),
        'manifest_retail': _money(b['manifest_retail']),
        'lines_without_retail': b['lines_without_retail'],
        'received_units': _units(b['received_units']),
        'received_retail': _money(b['received_retail']),
        'missing_units': _units(b['missing_units']),
        'missing_retail': _money(b['missing_retail']),
        'missing_pct_units': _pct(b['missing_units'], b['manifest_units']),
        'missing_pct_retail': _pct(b['missing_retail'], b['manifest_retail']),
        'over_units': b['over_units'],
        'broken_units': b['broken_units'],
    }


def manifest_line_accounting(order: PurchaseOrder) -> list[dict[str, Any]]:
    """One entry per manifest line: manifest units/$ and the received / missing share (see module docstring)."""
    expected: dict[int, int] = defaultdict(int)
    for mr_id, qty in ProcessingRow.objects.filter(
        purchase_order=order, manifest_row_id__isnull=False,
    ).values_list('manifest_row_id', 'quantity'):
        expected[mr_id] += max(0, int(qty or 0))

    received: dict[int, int] = defaultdict(int)
    broken: dict[int, int] = defaultdict(int)
    lost: dict[int, int] = defaultdict(int)
    for row in (
        Item.objects.filter(purchase_order=order, manifest_row_id__isnull=False)
        .values('manifest_row_id')
        .annotate(
            here=Count('pk', filter=~Q(status__in=_NOT_RECEIVED_STATUSES)),
            broken=Count(
                'pk',
                filter=~Q(status__in=_NOT_RECEIVED_STATUSES)
                & (Q(status='scrapped') | Q(dispute_type='broken') | Q(condition='salvage')),
            ),
            lost=Count('pk', filter=Q(status='lost')),
        )
    ):
        received[row['manifest_row_id']] = row['here']
        broken[row['manifest_row_id']] = row['broken']
        lost[row['manifest_row_id']] = row['lost']

    out = []
    for mr in ManifestRow.objects.filter(purchase_order=order).values(
        'id', 'row_number', 'quantity', 'unit_retail', 'title', 'tracking__pallet_id',
    ).order_by('row_number'):
        m_units = Decimal(max(0, int(mr['quantity'] or 0)))
        exp = expected.get(mr['id']) or int(m_units)
        got = received.get(mr['id'], 0)
        share = Decimal(1) if exp <= 0 else min(Decimal(1), Decimal(got) / Decimal(exp))
        unit_retail = mr['unit_retail']
        m_retail = (m_units * unit_retail) if unit_retail is not None else None
        out.append({
            'manifest_row_id': mr['id'],
            'row_number': mr['row_number'],
            'title': mr['title'] or '',
            'pallet_code': str(mr['tracking__pallet_id'] or '').strip(),
            'unit_retail': unit_retail,
            'manifest_units': m_units,
            'manifest_retail': m_retail,
            'expected_units': exp,
            'checked_in_units': got,
            'received_units': m_units * share,
            'missing_units': m_units * (1 - share),
            'received_retail': (m_retail * share) if m_retail is not None else None,
            'missing_retail': (m_retail * (1 - share)) if m_retail is not None else None,
            'over_units': max(0, got - exp),
            'broken_units': broken.get(mr['id'], 0),
            'lost_units': lost.get(mr['id'], 0),
        })
    return out


def _add_line(b: dict[str, Any], line: dict[str, Any]) -> None:
    b['manifest_lines'] += 1
    b['manifest_units'] += line['manifest_units']
    b['received_units'] += line['received_units']
    b['missing_units'] += line['missing_units']
    b['over_units'] += line['over_units']
    b['broken_units'] += line['broken_units']
    if line['manifest_retail'] is None:
        b['lines_without_retail'] += 1
    else:
        b['manifest_retail'] += line['manifest_retail']
        b['received_retail'] += line['received_retail']
        b['missing_retail'] += line['missing_retail']


def _user_name(u) -> str:
    if u is None:
        return ''
    return (getattr(u, 'full_name', '') or '').strip() or getattr(u, 'email', '') or ''


def pallet_ledger(order: PurchaseOrder, *, user=None) -> dict[str, Any]:
    """Per pallet and per truck: manifest vs received, missing so far, and the running missing %."""
    pallets = ensure_truck_pallets(order)
    pallets = list(
        TruckPallet.objects.filter(purchase_order=order)
        .select_related('started_by', 'done_by', 'arrived_by')
        .order_by('number'),
    )
    by_code = {_norm(p.code): p for p in pallets if p.code}
    lines = manifest_line_accounting(order)
    has_manifest_pallets = any(line['pallet_code'] for line in lines)

    per: dict[int, dict[str, Any]] = {p.pk: _bucket() for p in pallets}
    unassigned = _bucket()
    truck = _bucket()
    line_pallet: dict[int, int | None] = {}
    for line in lines:
        _add_line(truck, line)
        p = by_code.get(_norm(line['pallet_code'])) if line['pallet_code'] else None
        line_pallet[line['manifest_row_id']] = p.pk if p else None
        _add_line(per[p.pk] if p else unassigned, line)

    # Where units were physically checked in (Item.pallet): totals, extras, and units found on another pallet.
    here: dict[int, dict[str, int]] = defaultdict(lambda: {'checked_in': 0, 'added': 0, 'from_other': 0})
    no_pallet_units = 0
    for row in (
        Item.objects.filter(purchase_order=order)
        .exclude(status__in=_NOT_RECEIVED_STATUSES)
        .values('pallet_id', 'manifest_row_id')
        .annotate(n=Count('pk'))
    ):
        pid, mr_id, n = row['pallet_id'], row['manifest_row_id'], row['n']
        if pid is None:
            no_pallet_units += n
            continue
        here[pid]['checked_in'] += n
        if mr_id is None:
            here[pid]['added'] += n
        elif has_manifest_pallets and line_pallet.get(mr_id) not in (None, pid):
            here[pid]['from_other'] += n

    done_bucket = _bucket()
    pallet_rows = []
    for p in pallets:
        b = per[p.pk]
        status = 'done' if p.done_at else ('processing' if p.started_at else 'waiting')
        if status == 'done':
            for k in ('manifest_lines', 'manifest_units', 'manifest_retail', 'lines_without_retail',
                      'received_units', 'received_retail', 'missing_units', 'missing_retail',
                      'over_units', 'broken_units'):
                done_bucket[k] += b[k]
        h = here.get(p.pk, {'checked_in': 0, 'added': 0, 'from_other': 0})
        pallet_rows.append({
            'id': p.pk,
            'number': p.number,
            'code': p.code,
            'label': short_label(p.code) or f'#{p.number}',
            'from_manifest': p.from_manifest,
            'status': status,
            'arrived_at': p.arrived_at.isoformat() if p.arrived_at else None,
            'started_at': p.started_at.isoformat() if p.started_at else None,
            'started_by': _user_name(p.started_by),
            'done_at': p.done_at.isoformat() if p.done_at else None,
            'done_by': _user_name(p.done_by),
            'checked_in_units': h['checked_in'],
            'added_units': h['added'],
            'from_other_pallets_units': h['from_other'],
            **_bucket_out(b),
        })

    added_total = Item.objects.filter(
        purchase_order=order, manifest_row__isnull=True,
    ).exclude(status__in=_NOT_RECEIVED_STATUSES).count()
    n_done = sum(1 for p in pallets if p.done_at)
    running = _bucket_out(done_bucket) if has_manifest_pallets and n_done else None
    current = current_pallet_for(user, order) if user is not None else None
    return {
        'order_id': order.pk,
        'has_manifest_pallets': has_manifest_pallets,
        'pallets_total': len(pallets),
        'pallets_arrived': sum(1 for p in pallets if p.arrived_at),
        'pallets_started': sum(1 for p in pallets if p.started_at),
        'pallets_done': n_done,
        'current_pallet_id': current.pk if current else None,
        'pallets': pallet_rows,
        'unassigned': _bucket_out(unassigned) if unassigned['manifest_lines'] else None,
        'truck': {
            **_bucket_out(truck),
            'added_units': added_total,
            'units_without_pallet': no_pallet_units,
        },
        # Missing over finished pallets only; null until a pallet is finished, or when the manifest has no pallet ids.
        'running': running,
        'running_basis': 'finished_pallets' if has_manifest_pallets else 'no_manifest_pallet_ids',
    }
