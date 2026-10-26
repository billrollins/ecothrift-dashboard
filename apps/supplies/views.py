"""Supplies API (`/api/supplies/`). Everyone on the team sees the lists and counts; managers and the owner edit
lists; only the owner (superuser) sees and ticks the order."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsSuperAdmin, IsTeamMember

from .models import SupplyCount, SupplyCountLine, SupplyItem, SupplyList, SupplyOrder
from .services import ai_fill, csv_import, orders, schedule
from .services.rules import order_packs
from .settings import supplies_settings

TEAM = [IsAuthenticated, IsTeamMember]
MANAGER = [IsAuthenticated, IsManagerOrAdmin]
OWNER = [IsAuthenticated, IsSuperAdmin]

ITEM_FIELDS = ('name', 'description', 'vendor', 'vendor_url', 'url', 'vendor_item_id', 'pack_size', 'unit',
               'min_qty', 'max_qty', 'price', 'sort_order')


def _err(detail, status=400, **extra):
    return Response({'detail': detail, **extra}, status=status)


def _can_edit(user) -> bool:
    return bool(user.is_superuser or getattr(user, 'role', '') in ('Manager', 'Admin'))


def _who(user) -> str:
    return (user.full_name or user.email) if user else ''


def item_payload(item: SupplyItem) -> dict:
    return {
        'id': item.pk,
        'list': item.supply_list_id,
        'name': item.name,
        'description': item.description,
        'vendor': item.vendor,
        'vendor_url': item.vendor_url,
        'url': item.url,
        'vendor_item_id': item.vendor_item_id,
        'pack_size': item.pack_size,
        'unit': item.unit,
        'min_qty': item.min_qty,
        'max_qty': item.max_qty,
        'price': None if item.price is None else f'{item.price:.2f}',
        'sort_order': item.sort_order,
    }


def _count_status(supply_list: SupplyList, week_start) -> dict | None:
    count = supply_list.counts.filter(week_start=week_start).select_related('counted_by').first()
    if not count:
        return None
    return {'id': count.pk, 'submitted_at': count.submitted_at.isoformat(), 'counted_by': _who(count.counted_by)}


def list_payload(supply_list: SupplyList, week_start, *, items: bool = False) -> dict:
    out = {
        'id': supply_list.pk,
        'name': supply_list.name,
        'department': supply_list.department_id,
        'department_name': supply_list.department.name if supply_list.department_id else '',
        'is_active': supply_list.is_active,
        'sort_order': supply_list.sort_order,
        'item_count': getattr(supply_list, 'n_items', None),
        'count': _count_status(supply_list, week_start),
    }
    if items:
        rows = list(supply_list.items.filter(is_active=True))
        out['items'] = [item_payload(i) for i in rows]
        out['item_count'] = len(rows)
    return out


def _cycle_payload(now=None) -> dict:
    cfg = supplies_settings()
    ws = schedule.current_cycle(now, cfg)
    return {'week_start': ws.isoformat(), 'deadline': schedule.deadline(ws, cfg).isoformat()}


# ── Lists ───────────────────────────────────────────────────────────────────────


@api_view(['GET', 'POST'])
@permission_classes(TEAM)
def lists(request):
    if request.method == 'POST':
        if not _can_edit(request.user):
            return _err('Only a manager or the owner can make lists.', 403)
        name = str(request.data.get('name') or '').strip()
        if not name:
            return _err('Give the list a name.')
        department = request.data.get('department') or None
        supply_list = SupplyList.objects.create(name=name[:120], department_id=department)
        return Response(list_payload(supply_list, schedule.current_cycle(), items=True), status=201)
    show_all = request.query_params.get('all') == '1'
    qs = SupplyList.objects.select_related('department').annotate(
        n_items=Count('items', filter=Q(items__is_active=True)),
    )
    if not show_all:
        qs = qs.filter(is_active=True)
    cycle = _cycle_payload()
    ws = schedule.current_cycle()
    return Response({
        'cycle': cycle,
        'can_edit': _can_edit(request.user),
        'is_owner': bool(request.user.is_superuser),
        'lists': [list_payload(sl, ws) for sl in qs],
    })


@api_view(['GET', 'PATCH'])
@permission_classes(TEAM)
def list_detail(request, pk):
    supply_list = SupplyList.objects.select_related('department').filter(pk=pk).first()
    if not supply_list:
        return _err('No such list.', 404)
    if request.method == 'PATCH':
        if not _can_edit(request.user):
            return _err('Only a manager or the owner can change lists.', 403)
        data = request.data
        if 'name' in data:
            name = str(data.get('name') or '').strip()
            if not name:
                return _err('Give the list a name.')
            supply_list.name = name[:120]
        if 'department' in data:
            supply_list.department_id = data.get('department') or None
        if 'is_active' in data:
            supply_list.is_active = bool(data.get('is_active'))
        if 'sort_order' in data:
            try:
                supply_list.sort_order = max(0, int(data.get('sort_order')))
            except (TypeError, ValueError):
                return _err('Order must be a whole number.')
        supply_list.save()
    payload = list_payload(supply_list, schedule.current_cycle(), items=True)
    payload['can_edit'] = _can_edit(request.user)
    payload['cycle'] = _cycle_payload()
    return Response(payload)


def _item_fields(data, *, partial: bool) -> dict:
    """Checked item fields from a request. Raises ValueError with a message for the person."""
    row = {}
    for key in ITEM_FIELDS:
        if key in data:
            row[key] = data.get(key)
    if not partial and not str(row.get('name') or '').strip():
        raise ValueError('Give the item a name.')
    # The same checks as a CSV row; only the fields sent are kept (a PATCH changes just those).
    clean = csv_import.parse_row({
        'name': row.get('name', 'x'), 'description': row.get('description'), 'vendor': row.get('vendor'),
        'vendor_url': row.get('vendor_url'), 'url': row.get('url'), 'vendor_item_id': row.get('vendor_item_id'),
        'pack_size': row.get('pack_size'), 'unit': row.get('unit'), 'min': row.get('min_qty'),
        'max': row.get('max_qty'), 'price': row.get('price'),
    }, check_range=not partial)
    out = {}
    for key in row:
        if key == 'sort_order':
            try:
                out['sort_order'] = max(0, int(row['sort_order']))
            except (TypeError, ValueError):
                raise ValueError('Order must be a whole number.') from None
            continue
        out[key] = clean[key]
    return out


@api_view(['POST'])
@permission_classes(MANAGER)
def list_items(request, pk):
    supply_list = SupplyList.objects.filter(pk=pk).first()
    if not supply_list:
        return _err('No such list.', 404)
    try:
        fields = _item_fields(request.data, partial=False)
    except ValueError as exc:
        return _err(str(exc))
    if 'sort_order' not in fields:
        last = supply_list.items.order_by('-sort_order').values_list('sort_order', flat=True).first() or 0
        fields['sort_order'] = last + 1
    item = SupplyItem.objects.create(supply_list=supply_list, **fields)
    return Response(item_payload(item), status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes(MANAGER)
def item_detail(request, pk):
    item = SupplyItem.objects.filter(pk=pk, is_active=True).first()
    if not item:
        return _err('No such item.', 404)
    if request.method == 'DELETE':
        # Taken off the list; past counts and orders keep it.
        item.is_active = False
        item.save(update_fields=['is_active', 'updated_at'])
        return Response(status=204)
    try:
        fields = _item_fields(request.data, partial=True)
    except ValueError as exc:
        return _err(str(exc))
    for key, value in fields.items():
        setattr(item, key, value)
    if item.max_qty < item.min_qty:
        return _err('Max is below min.')
    item.save()
    return Response(item_payload(item))


@api_view(['GET'])
@permission_classes(TEAM)
def import_template(request):
    resp = HttpResponse(csv_import.template_csv(), content_type='text/csv')
    resp['Content-Disposition'] = 'attachment; filename="supply-list-template.csv"'
    return resp


@api_view(['POST'])
@permission_classes(MANAGER)
@parser_classes([MultiPartParser, FormParser, JSONParser])
def list_import(request, pk):
    supply_list = SupplyList.objects.filter(pk=pk).first()
    if not supply_list:
        return _err('No such list.', 404)
    upload = request.FILES.get('file')
    if upload is not None:
        raw = upload.read()
        try:
            text = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = raw.decode('cp1252', errors='replace')
    else:
        text = str(request.data.get('text') or '')
    if not text.strip():
        return _err('Choose a CSV file.')
    result = csv_import.import_csv(supply_list, text)
    return Response(result, status=400 if result['errors'] else 200)


@api_view(['POST'])
@permission_classes(MANAGER)
def ai_fill_view(request):
    try:
        return Response(ai_fill.fill(request.data.get('url'), request.data.get('page_text') or '', user=request.user))
    except ai_fill.FillError as exc:
        return _err(str(exc))


# ── The weekly count ────────────────────────────────────────────────────────────


@api_view(['GET', 'POST'])
@permission_classes(TEAM)
def list_count(request, pk):
    """GET: the items to count, each with its last count (for reference). POST: every item's on-hand number."""
    supply_list = SupplyList.objects.filter(pk=pk, is_active=True).first()
    if not supply_list:
        return _err('No such list.', 404)
    ws = schedule.current_cycle()
    items = list(supply_list.items.filter(is_active=True))
    if request.method == 'POST':
        raw = request.data.get('lines')
        if not isinstance(raw, list):
            return _err('Send a number for every item.')
        given: dict[int, int] = {}
        for row in raw:
            if not isinstance(row, dict):
                continue
            text = str(row.get('on_hand') if row.get('on_hand') is not None else '').strip()
            try:
                value = Decimal(text)
            except InvalidOperation:
                continue
            if value < 0 or value != value.to_integral_value():
                return _err('Counts are whole numbers, 0 or more.')
            try:
                given[int(row.get('item'))] = int(value)
            except (TypeError, ValueError):
                continue
        missing = [i.name for i in items if i.pk not in given]
        if missing:
            return _err('Every item needs a number (0 if there are none).', missing=missing)
        with transaction.atomic():
            count, _ = SupplyCount.objects.update_or_create(
                supply_list=supply_list, week_start=ws,
                defaults={'counted_by': request.user, 'submitted_at': timezone.now()},
            )
            count.lines.all().delete()
            SupplyCountLine.objects.bulk_create(
                [SupplyCountLine(count=count, item=i, on_hand=given[i.pk]) for i in items],
            )
    last_lines = {}
    previous = (
        SupplyCount.objects.filter(supply_list=supply_list, week_start__lt=ws)
        .select_related('counted_by').order_by('-week_start').first()
    )
    if previous:
        last_lines = dict(previous.lines.values_list('item_id', 'on_hand'))
    current = supply_list.counts.filter(week_start=ws).first()
    mine = dict(current.lines.values_list('item_id', 'on_hand')) if current else {}
    rows = []
    for item in items:
        row = item_payload(item)
        row['last_count'] = last_lines.get(item.pk)
        row['this_count'] = mine.get(item.pk)
        if item.pk in mine:
            row['packs'], row['reason'] = order_packs(mine[item.pk], item.min_qty, item.max_qty, item.pack_size, item.unit)
        rows.append(row)
    return Response({
        'list': {'id': supply_list.pk, 'name': supply_list.name},
        'cycle': _cycle_payload(),
        'count': _count_status(supply_list, ws),
        'last_count_week': previous.week_start.isoformat() if previous else None,
        'items': rows,
    }, status=201 if request.method == 'POST' else 200)


# ── The order (owner) ───────────────────────────────────────────────────────────


@api_view(['GET'])
@permission_classes(OWNER)
def order_latest(request):
    week = request.query_params.get('week')
    qs = SupplyOrder.objects.all()
    order = qs.filter(week_start=week).first() if week else qs.first()
    weeks = list(qs.values_list('week_start', flat=True)[:12])
    return Response({
        'order': orders.order_payload(order) if order else None,
        'weeks': [w.isoformat() for w in weeks],
        'missed_now': orders.missed_lists(),
        'cycle': _cycle_payload(),
    })


@api_view(['POST'])
@permission_classes(OWNER)
def order_build(request):
    """Build the order for the deadline that just passed, if the hourly job has not yet."""
    message = orders.run_due()
    return Response({'detail': message})


@api_view(['POST'])
@permission_classes(OWNER)
def order_ordered(request, pk):
    order = SupplyOrder.objects.filter(pk=pk).first()
    if not order:
        return _err('No such order.', 404)
    ids = request.data.get('line_ids')
    if not isinstance(ids, list) or not ids:
        return _err('Pick the lines.')
    orders.mark_ordered(order, ids, ordered=bool(request.data.get('ordered', True)), user=request.user)
    return Response(orders.order_payload(order))
