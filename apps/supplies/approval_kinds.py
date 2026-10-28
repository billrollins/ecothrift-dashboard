"""Supplies work that goes through Superuser → Requests (staged in production, approved there).

- ``supplies.load_lists``: make supply lists and their items from a data file in ``apps/supplies/data/`` (the first
  one is the owner's PR Supply List sheet, 2026-10-28). A list is matched by name and gets the department of the same
  name; an item already on the list (same name) is updated, any other is added, with the same checks as a CSV import.
  A file's ``last_count`` numbers are saved as the count for the week whose deadline last passed, so Monday's count
  shows them grey for reference; they order nothing (a list made after a deadline is never ordered for it). Undo
  deletes the lists it made and takes off the items it added to lists that were already there.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from django.db import transaction
from django.utils import timezone

from apps.core.models import ApprovalRequest
from apps.core.services.approval_requests import Kind, Progress, RequestError, register

DATA_DIR = Path(__file__).resolve().parent / 'data'
_FILE = re.compile(r'^[\w.-]+\.json$')


def _load(params: dict) -> dict:
    name = str(params.get('file') or '')
    if not _FILE.match(name) or not (DATA_DIR / name).is_file():
        raise RequestError(f'No supplies data file {name!r} in apps/supplies/data/.')
    data = json.loads((DATA_DIR / name).read_text(encoding='utf-8'))
    if not isinstance(data.get('lists'), list) or not data['lists']:
        raise RequestError('The data file has no lists.')
    return data


def _fields(row: dict) -> dict:
    from .services.csv_import import parse_row

    try:
        return parse_row({
            'name': row.get('name'), 'description': row.get('description'), 'vendor': row.get('vendor'),
            'vendor_url': row.get('vendor_url'), 'url': row.get('url'), 'vendor_item_id': row.get('vendor_item_id'),
            'pack_size': row.get('pack_size'), 'unit': row.get('unit'), 'min': row.get('min'), 'max': row.get('max'),
            'price': row.get('price'),
        })
    except ValueError as exc:
        raise RequestError(f"{row.get('name')!r}: {exc}") from None


def _department(name: str):
    from apps.hr.models import Department

    return Department.objects.filter(name__iexact=str(name or '').strip()).first() if name else None


def _preview(params: dict) -> dict:
    from .models import SupplyList
    from .services import schedule

    data = _load(params)
    counts, changes, sample = {}, [], []
    new_lists = new_items = updated = no_link = with_count = 0
    for block in data['lists']:
        existing = SupplyList.objects.filter(name__iexact=block['name']).first()
        names = {n.lower() for n in existing.items.values_list('name', flat=True)} if existing else set()
        dept = _department(block.get('department'))
        new_lists += 0 if existing else 1
        line = f"{block['name']}: {'already there' if existing else 'new list'}, department {dept.name if dept else 'none found'}"
        adds = ups = 0
        for row in block['items']:
            fields = _fields(row)
            if fields['name'].lower() in names:
                ups += 1
            else:
                adds += 1
            no_link += 0 if fields['url'] else 1
            with_count += 1 if row.get('last_count') is not None else 0
            if len(sample) < 12:
                sample.append({
                    'list': block['name'], 'item': fields['name'], 'min': fields['min_qty'], 'max': fields['max_qty'],
                    'last_count': row.get('last_count'), 'asin': fields['vendor_item_id'] or '-',
                })
        new_items += adds
        updated += ups
        changes.append(f'{line}; {adds} items to add, {ups} to update.')
    week = schedule.last_closed_cycle()
    counts.update({
        'Lists to make': new_lists, 'Items to add': new_items, 'Items to update': updated,
        'Items with no product link': no_link, 'Last counts to save': with_count,
    })
    changes.append(
        f"The sheet's current numbers are saved as each list's count for the week of {week:%b} {week.day}: Monday's "
        'count shows them grey for reference, and they order nothing.'
    )
    changes.append('No prices yet: add them on each item (Edit, or Fill with AI with the page text).')
    changes.append('Undo deletes the lists this made, and takes off items it added to lists that were already there.')
    return {'counts': counts, 'changes': changes, 'sample': sample}


def _apply(request: ApprovalRequest, progress: Progress) -> dict:
    from .models import SupplyCount, SupplyCountLine, SupplyItem, SupplyList
    from .services import schedule

    data = _load(request.params)
    state = progress.state
    made_lists = list(state.get('made_lists') or [])
    added_items = list(state.get('added_items') or [])
    made_counts = list(state.get('made_counts') or [])
    week = schedule.last_closed_cycle()
    start = int(progress.cursor or 0)
    blocks = data['lists']
    for i in range(start, len(blocks)):
        block = blocks[i]
        with transaction.atomic():
            supply_list = SupplyList.objects.filter(name__iexact=block['name']).first()
            if supply_list is None:
                dept = _department(block.get('department'))
                supply_list = SupplyList.objects.create(name=block['name'], department=dept, sort_order=i + 1)
                made_lists.append(supply_list.pk)
            by_name = {it.name.lower(): it for it in supply_list.items.all()}
            order = max((it.sort_order for it in by_name.values()), default=0)
            counted = []
            for row in block['items']:
                fields = _fields(row)
                item = by_name.get(fields['name'].lower())
                if item:
                    for key, value in fields.items():
                        setattr(item, key, value)
                    item.is_active = True
                    item.save()
                else:
                    order += 1
                    item = SupplyItem.objects.create(supply_list=supply_list, sort_order=order, **fields)
                    by_name[item.name.lower()] = item
                    if supply_list.pk not in made_lists:
                        added_items.append(item.pk)
                if row.get('last_count') is not None:
                    counted.append((item, int(row['last_count'])))
            if counted and not SupplyCount.objects.filter(supply_list=supply_list, week_start=week).exists():
                count = SupplyCount.objects.create(
                    supply_list=supply_list, week_start=week, counted_by=request.decided_by,
                    submitted_at=timezone.now(),
                )
                SupplyCountLine.objects.bulk_create([SupplyCountLine(count=count, item=it, on_hand=n) for it, n in counted])
                made_counts.append(count.pk)
        progress.update(done=i + 1, total=len(blocks), cursor=i + 1, made_lists=made_lists, added_items=added_items,
                        made_counts=made_counts, log=f"{block['name']}: {len(block['items'])} items loaded.")
    return {'made_lists': made_lists, 'added_items': added_items, 'made_counts': made_counts, 'week': week.isoformat()}


def _undo(request: ApprovalRequest) -> dict:
    from .models import SupplyCount, SupplyItem, SupplyList

    result = request.result or {}
    counts = SupplyCount.objects.filter(pk__in=result.get('made_counts') or []).delete()[0]
    items = SupplyItem.objects.filter(pk__in=result.get('added_items') or []).update(is_active=False)
    lists = SupplyList.objects.filter(pk__in=result.get('made_lists') or []).delete()[0]
    return {'deleted_rows': lists + counts, 'items_taken_off': items}


register(Kind(
    kind='supplies.load_lists', label='Supplies: make supply lists and items from a data file',
    preview=_preview, apply=_apply, undo=_undo,
))
