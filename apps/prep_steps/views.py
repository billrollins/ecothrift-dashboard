"""Truck Prep A API (``/api/prep-steps/``), staff like Preprocessing. Bulk endpoints only: one call per action."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff
from apps.inventory.models import PurchaseOrder

from .models import STEPS, PrepAction, PrepLine, PrepRun
from .services import ai
from .services import changes as ch
from .services import load as L
from .services import steps as S

STAFF = [IsAuthenticated, IsStaff]


def _bad(msg: str, status: int = 400) -> Response:
    return Response({'detail': msg}, status=status)


def _run(order_id: int) -> PrepRun:
    return get_object_or_404(PrepRun.objects.select_related('purchase_order__vendor'), purchase_order_id=order_id)


def _ids(value) -> list[int] | None:
    if value is None:
        return None
    try:
        return [int(v) for v in value]
    except (TypeError, ValueError):
        raise ch.ChangeError('Bad line ids.') from None


def _state(run: PrepRun, line_ids=None, *, all_lines: bool = False) -> dict:
    """The summary, and the lines that changed (or all of them)."""
    lines = list(run.lines.all())
    stats = S.stats_for(lines)
    out = {'run': S.summary(run, lines, stats)}
    if all_lines:
        out['lines'] = S.serialize(lines, run, stats=stats)
    elif line_ids is not None:
        want = set(line_ids)
        out['lines'] = S.serialize([x for x in lines if x.pk in want], run, stats=stats)
    return out


def _changed(action: PrepAction) -> list[int]:
    return list(action.changes.values_list('line_id', flat=True).distinct())


@api_view(['GET'])
@permission_classes(STAFF)
def orders_view(request):
    """Trucks with a manifest, newest first, with their prep state."""
    q = (request.query_params.get('q') or '').strip()
    qs = (PurchaseOrder.objects.select_related('vendor')
          .annotate(pre=Count('preprocessing_rows', distinct=True))
          .filter(Q(pre__gt=0) | Q(manifest_row_count__gt=0)).order_by('-created_at'))
    if q:
        cond = Q(order_number__icontains=q) | Q(vendor__name__icontains=q) | Q(description__icontains=q)
        if q.isdigit():
            cond |= Q(pk=int(q))
        qs = qs.filter(cond)
    orders = list(qs[:80])
    runs = {r.purchase_order_id: r for r in PrepRun.objects.filter(purchase_order__in=orders)}
    rows = []
    for o in orders:
        r = runs.get(o.pk)
        rows.append({
            'id': o.pk, 'order_number': o.order_number, 'vendor': getattr(o.vendor, 'name', ''),
            'description': o.description, 'lines': o.pre or o.manifest_row_count or 0,
            'retail': float(o.retail_value or 0), 'cost': float(o.total_cost or 0),
            'created_at': o.created_at.isoformat() if o.created_at else None,
            'prep': {'step': r.step, 'steps': r.steps, 'updated_at': r.updated_at.isoformat()} if r else None,
        })
    return Response({'orders': rows})


@api_view(['GET'])
@permission_classes(STAFF)
def run_view(request, order_id: int):
    run = PrepRun.objects.filter(purchase_order_id=order_id).select_related('purchase_order__vendor').first()
    if run is None:
        order = get_object_or_404(PurchaseOrder.objects.select_related('vendor'), pk=order_id)
        return Response({'run': None, 'order': {'id': order.pk, 'order_number': order.order_number,
                                                'vendor': getattr(order.vendor, 'name', ''),
                                                'description': order.description}})
    return Response({'run': S.summary(run)})


@api_view(['GET'])
@permission_classes(STAFF)
def lines_view(request, order_id: int):
    run = _run(order_id)
    lines = list(run.lines.all())
    return Response({'lines': S.serialize(lines, run, raw=request.query_params.get('raw') == '1')})


@api_view(['POST'])
@permission_classes(STAFF)
def start_view(request, order_id: int):
    order = get_object_or_404(PurchaseOrder, pk=order_id)
    columns = request.data.get('columns') if isinstance(request.data, dict) else None
    if columns is not None and not isinstance(columns, dict):
        return _bad('Bad columns.')
    run = L.load(order, user=request.user, columns={str(k): str(v or '') for k, v in (columns or {}).items()})
    run = _run(order_id)
    return Response(_state(run, all_lines=True))


@api_view(['POST'])
@permission_classes(STAFF)
def step_view(request, order_id: int):
    run = _run(order_id)
    to = str(request.data.get('to') or '')
    try:
        if to == 'next':
            S.next_step(run, user=request.user)
        elif to == 'back':
            S.back_step(run)
        elif to in STEPS:
            S.enter(run, to, user=request.user)
        else:
            return _bad('Unknown step.')
    except ch.ChangeError as exc:
        return _bad(str(exc))
    run.refresh_from_db()
    return Response(_state(run, all_lines=True))


@api_view(['POST'])
@permission_classes(STAFF)
def rule_view(request, order_id: int):
    run = _run(order_id)
    try:
        action = S.run_rule(run, str(request.data.get('name') or ''), _ids(request.data.get('ids')),
                            user=request.user, force=bool(request.data.get('force')),
                            extra=request.data.get('extra') or {})
    except (ch.ChangeError, InvalidOperation) as exc:
        return _bad(str(exc) or 'Bad value.')
    return Response({**_state(run, _changed(action)), 'action': S._action_row(action)})


@api_view(['POST'])
@permission_classes(STAFF)
def edit_view(request, order_id: int):
    run = _run(order_id)
    step = str(request.data.get('step') or run.step)
    raw = request.data.get('changes') or []
    if not isinstance(raw, list):
        return _bad('Bad changes.')
    try:
        changes = [{'line': int(c['line']), 'field': str(c['field']), 'new': c.get('new'),
                    'reason': str(c.get('reason') or '')} for c in raw]
        action = S.edit(run, step, changes, user=request.user)
    except (KeyError, TypeError, ValueError, ch.ChangeError) as exc:
        return _bad(str(exc) or 'Bad changes.')
    return Response({**_state(run, _changed(action)), 'action': S._action_row(action)})


@api_view(['POST'])
@permission_classes(STAFF)
def accept_view(request, order_id: int):
    run = _run(order_id)
    step = str(request.data.get('step') or run.step)
    if step not in STEPS:
        return _bad('Unknown step.')
    try:
        ids = _ids(request.data.get('ids')) or []
    except ch.ChangeError as exc:
        return _bad(str(exc))
    S.accept(run, step, ids, bool(request.data.get('value', True)))
    return Response(_state(run, ids))


@api_view(['PATCH', 'POST'])
@permission_classes(STAFF)
def target_view(request, order_id: int):
    run = _run(order_id)
    t = dict(run.target or {})
    try:
        if 'share' in request.data:
            share = Decimal(str(request.data['share']))
            if not (Decimal('0.05') <= share <= Decimal('1')):
                return _bad('Target must be 5% to 100% of retail.')
            t['share'] = float(share)
        if 'band' in request.data:
            band = Decimal(str(request.data['band']))
            if not (Decimal('0.01') <= band <= Decimal('0.5')):
                return _bad('Band must be 1% to 50%.')
            t['band'] = float(band)
    except (InvalidOperation, TypeError, ValueError):
        return _bad('Bad number.')
    run.target = t
    run.save(update_fields=['target', 'updated_at'])
    return Response(_state(run, all_lines=True))


@api_view(['POST'])
@permission_classes(STAFF)
def ai_view(request, order_id: int):
    run = _run(order_id)
    try:
        action = ai.start_job(
            run, str(request.data.get('name') or ''), _ids(request.data.get('ids')) or [], user=request.user,
            prompt=str(request.data.get('prompt') or ''), fields=request.data.get('fields') or None,
            strength=str(request.data.get('strength') or 'fast'), step=str(request.data.get('step') or run.step),
        )
    except ch.ChangeError as exc:
        return _bad(str(exc))
    return Response({'action': _action_detail(action)})


def _action_detail(action: PrepAction) -> dict:
    d = S._action_row(action)
    preview = action.preview or []
    if preview:
        lines = {x['id']: x for x in PrepLine.objects.filter(pk__in={c['line'] for c in preview})
                 .values('id', 'row_number', 'title', 'src_title')}
        d['preview'] = [{**c, 'i': i, 'row_number': lines.get(c['line'], {}).get('row_number'),
                         'title': lines.get(c['line'], {}).get('title') or lines.get(c['line'], {}).get('src_title', '')}
                        for i, c in enumerate(preview)]
    else:
        d['preview'] = []
    return d


@api_view(['GET'])
@permission_classes(STAFF)
def action_view(request, action_id: int):
    action = get_object_or_404(PrepAction, pk=action_id)
    d = _action_detail(action)
    if action.status in (PrepAction.STATUS_APPLIED, PrepAction.STATUS_UNDONE):
        d['changes'] = [{'line': c.line_id, 'row_number': c.line.row_number, 'title': c.line.title, 'field': c.field,
                         'old': c.old, 'new': c.new, 'reason': c.reason}
                        for c in action.changes.select_related('line').order_by('line__row_number')[:3000]]
    return Response({'action': d})


@api_view(['POST'])
@permission_classes(STAFF)
def apply_view(request, action_id: int):
    action = get_object_or_404(PrepAction.objects.select_related('run'), pk=action_id)
    try:
        skip = [int(i) for i in (request.data.get('skip') or [])]
        ai.apply_preview(action, skip)
    except (ch.ChangeError, TypeError, ValueError) as exc:
        return _bad(str(exc) or 'Bad request.')
    run = _run(action.run.purchase_order_id)
    return Response({**_state(run, _changed(action)), 'action': S._action_row(action)})


@api_view(['POST'])
@permission_classes(STAFF)
def discard_view(request, action_id: int):
    action = get_object_or_404(PrepAction.objects.select_related('run'), pk=action_id)
    try:
        ai.discard(action)
    except ch.ChangeError as exc:
        return _bad(str(exc))
    return Response(_state(_run(action.run.purchase_order_id)))


@api_view(['POST'])
@permission_classes(STAFF)
def undo_view(request, action_id: int):
    action = get_object_or_404(PrepAction.objects.select_related('run'), pk=action_id)
    try:
        result = ch.undo(action)
    except ch.ChangeError as exc:
        return _bad(str(exc))
    return Response({**_state(_run(action.run.purchase_order_id), _changed(action)), 'undo': result})


@api_view(['GET'])
@permission_classes(STAFF)
def line_view(request, order_id: int, line_id: int):
    """One line: the manifest row as uploaded, every field now, and every change made to it (who, when, why)."""
    run = _run(order_id)
    line = get_object_or_404(PrepLine, run=run, pk=line_id)
    row = S.serialize([line], run, raw=True)[0]
    history = [{
        'action': c.action_id, 'step': c.action.step, 'label': c.action.label, 'kind': c.action.kind,
        'model': c.action.model, 'status': c.action.status, 'field': c.field, 'old': c.old, 'new': c.new,
        'reason': c.reason, 'at': c.action.created_at.isoformat(),
    } for c in line.changes.select_related('action').order_by('-action__created_at', '-id')[:300]]
    return Response({'line': row, 'history': history})


@api_view(['GET'])
@permission_classes(STAFF)
def send_view(request, order_id: int):
    return Response(S.send_dry_run(_run(order_id)))
