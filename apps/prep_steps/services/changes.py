"""Changing lines: every change is recorded under an action, so it can be previewed, applied and undone.

A change is ``{"line": id, "field": name, "new": value, "reason": "a few words"}``. ``old`` is read from the line when
the change is applied. Only the fields in ``EDITABLE`` can be changed; values are cleaned to the field's type.
"""
from __future__ import annotations

import time
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable

from django.db import transaction
from django.utils import timezone

from apps.prep_steps.models import STEPS, PrepAction, PrepChange, PrepLine

# field -> type
EDITABLE: dict[str, str] = {
    'title': 'text', 'brand': 'text', 'model': 'text', 'qty': 'int',
    'match_product_id': 'int_or_none', 'match_kind': 'text', 'match_confidence': 'int_or_none',
    'match_candidates': 'json', 'product_draft': 'json',
    'category': 'text', 'subcategory': 'text',
    'retail': 'money', 'price': 'money', 'price_class': 'text',
    'unit_count': 'int_or_none', 'unit_name': 'text', 'pack_units': 'int_or_none', 'pieces': 'int', 'sell_as': 'text',
    'search_tags': 'json',
}
MAX_LEN = {'title': 300, 'brand': 200, 'model': 200, 'category': 100, 'subcategory': 100, 'unit_name': 40,
           'match_kind': 8, 'price_class': 8, 'sell_as': 12}


class ChangeError(ValueError):
    """The request can't be done; the message is for the person."""


def clean_value(field: str, value: Any) -> Any:
    kind = EDITABLE.get(field)
    if kind is None:
        raise ChangeError(f'{field} cannot be changed here.')
    if kind == 'text':
        return str(value or '').strip()[:MAX_LEN.get(field, 300)]
    if kind == 'int':
        try:
            return max(1, int(Decimal(str(value))))
        except (InvalidOperation, TypeError, ValueError):
            raise ChangeError(f'{field} must be a whole number.') from None
    if kind == 'int_or_none':
        if value in (None, ''):
            return None
        try:
            return max(0, int(Decimal(str(value))))
        except (InvalidOperation, TypeError, ValueError):
            raise ChangeError(f'{field} must be a whole number.') from None
    if kind == 'money':
        if value in (None, ''):
            return None
        try:
            d = Decimal(str(value).replace('$', '').replace(',', '').strip())
        except (InvalidOperation, TypeError, ValueError):
            raise ChangeError(f'{field} must be a dollar amount.') from None
        if not d.is_finite() or d < 0 or d > Decimal('99999999'):
            raise ChangeError(f'{field} must be a dollar amount.')
        return d.quantize(Decimal('0.01'))
    return value  # json


def to_json(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    return value


def same(a: Any, b: Any) -> bool:
    if isinstance(a, Decimal) or isinstance(b, Decimal):
        try:
            return a is not None and b is not None and Decimal(str(a)) == Decimal(str(b))
        except (InvalidOperation, TypeError, ValueError):
            return False
    return a == b


def start(run, step: str, kind: str, name: str, *, label: str = '', model: str = '', effort: str = '',
          prompt: str = '', user=None, line_count: int = 0, status: str = PrepAction.STATUS_RUNNING) -> PrepAction:
    if step not in STEPS:
        raise ChangeError('Unknown step.')
    return PrepAction.objects.create(
        run=run, step=step, kind=kind, name=name, label=label or name, model=model, effort=effort, prompt=prompt,
        status=status, line_count=line_count, created_by=user if getattr(user, 'pk', None) else None,
    )


def diff(lines: dict[int, PrepLine], changes: Iterable[dict]) -> list[dict]:
    """The changes that would really change something, with ``old`` filled in (one per line and field, last wins)."""
    out: dict[tuple[int, str], dict] = {}
    for c in changes:
        line = lines.get(int(c['line']))
        if line is None:
            continue
        field = c['field']
        new = clean_value(field, c.get('new'))
        old = getattr(line, field)
        if same(old, new):
            out.pop((line.pk, field), None)
            continue
        out[(line.pk, field)] = {'line': line.pk, 'field': field, 'old': to_json(old), 'new': to_json(new),
                                 'reason': str(c.get('reason') or '')[:300]}
    return list(out.values())


def _source(action: PrepAction) -> str:
    if action.kind == PrepAction.KIND_EDIT:
        return 'staff'
    if action.model:
        return f'ai:{action.model}'
    return f'rule:{action.name}'


@transaction.atomic
def apply(action: PrepAction, changes: list[dict], *, seconds: float | None = None) -> PrepAction:
    """Write the changes to the lines and record them. ``changes`` come from ``diff`` (or a stored preview)."""
    ids = {int(c['line']) for c in changes}
    lines = {x.pk: x for x in PrepLine.objects.select_for_update().filter(run_id=action.run_id, pk__in=ids)}
    real = diff(lines, changes)
    touched: dict[int, set[str]] = {}
    rows: list[PrepChange] = []
    src = _source(action)
    for c in real:
        line = lines[c['line']]
        value = clean_value(c['field'], c['new'])
        rows.append(PrepChange(action=action, line=line, field=c['field'], old=c['old'], new=c['new'],
                               reason=c['reason']))
        setattr(line, c['field'], value)
        if c['reason']:
            line.reasons = {**(line.reasons or {}), c['field']: c['reason']}
        line.sources = {**(line.sources or {}), c['field']: src}
        touched.setdefault(line.pk, set()).add(c['field'])
    fields = sorted({f for fs in touched.values() for f in fs} | {'reasons', 'sources'})
    if touched:
        PrepLine.objects.bulk_update([lines[i] for i in touched], fields + ['updated_at'], batch_size=500)
        PrepChange.objects.bulk_create(rows, batch_size=1000)
    action.changed_count = len(touched)
    action.status = PrepAction.STATUS_APPLIED
    action.preview = []
    if seconds is not None:
        action.seconds = round(seconds, 2)
    action.finished_at = timezone.now()
    action.save()
    return action


def run_rule(run, step: str, name: str, label: str, lines: list[PrepLine], fn, *, user=None) -> PrepAction:
    """Run a rule (``fn(lines) -> changes``) and apply it at once (rules are code: shown, undoable)."""
    started = time.monotonic()
    action = start(run, step, PrepAction.KIND_RULE, name, label=label, user=user, line_count=len(lines))
    changes = fn(lines)
    return apply(action, changes, seconds=time.monotonic() - started)


@transaction.atomic
def undo(action: PrepAction) -> dict[str, int]:
    """Put back the old values, where the line still holds what this action wrote."""
    if action.status != PrepAction.STATUS_APPLIED:
        raise ChangeError('Only an applied action can be undone.')
    changes = list(action.changes.select_related('line'))
    lines = {x.pk: x for x in PrepLine.objects.select_for_update().filter(pk__in={c.line_id for c in changes})}
    put_back, kept = 0, 0
    touched: dict[int, set[str]] = {}
    for c in changes:
        line = lines.get(c.line_id)
        if line is None:
            continue
        current = getattr(line, c.field)
        if not same(current, clean_value(c.field, c.new)) and not (current is None and c.new is None):
            kept += 1  # a later action changed it again: leave that one
            continue
        setattr(line, c.field, clean_value(c.field, c.old))
        reasons = dict(line.reasons or {})
        reasons.pop(c.field, None)
        line.reasons = reasons
        sources = dict(line.sources or {})
        sources.pop(c.field, None)
        line.sources = sources
        touched.setdefault(line.pk, set()).add(c.field)
        put_back += 1
    if touched:
        fields = sorted({f for fs in touched.values() for f in fs} | {'reasons', 'sources'})
        PrepLine.objects.bulk_update([lines[i] for i in touched], fields + ['updated_at'], batch_size=500)
    action.status = PrepAction.STATUS_UNDONE
    action.save(update_fields=['status'])
    return {'put_back': put_back, 'kept': kept}
