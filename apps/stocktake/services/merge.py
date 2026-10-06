"""Merge one inventory into another (inventory_effort Phase 1: the 10-05 count was split at midnight into a 10-06 one).

Runs, scans and problems move to the inventory kept. An item counted in both keeps its first ``ok``; the later one
becomes ``already``. Runs still open in the merged inventory stop at their last scan. Then the merged inventory is
deleted. Everything changed is recorded, so ``undo`` puts it back exactly.
"""
from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from ..models import CountScan, InventoryCount, Issue, Run
from .counting import good_scans

COUNT_FIELDS = ('name', 'day', 'status', 'note', 'started_by_id', 'started_at', 'closed_at', 'closed_by_id',
                'expected_item_ids', 'closed_expected_ids')


def _plain(v):
    return v.isoformat() if hasattr(v, 'isoformat') else v


def preview(into_id: int, from_id: int) -> dict[str, Any]:
    into = InventoryCount.objects.get(pk=into_id)
    src = InventoryCount.objects.get(pk=from_id)
    first_ok = set(good_scans(into).filter(result=CountScan.RESULT_OK, item__isnull=False).values_list('item_id', flat=True))
    src_ok = good_scans(src).filter(result=CountScan.RESULT_OK, item__isnull=False)
    by_person: dict[str, int] = {}
    for r in src.runs.select_related('user'):
        name = (r.user.first_name if r.user else '') or 'Someone'
        by_person[name] = by_person.get(name, 0) + 1
    return {
        'into': {'id': into.pk, 'name': into.name, 'runs': into.runs.count(), 'scans': into.scans.count()},
        'from': {'id': src.pk, 'name': src.name, 'runs': src.runs.count(), 'scans': src.scans.count(),
                 'issues': src.issues.count(), 'open_runs': src.runs.filter(status=Run.STATUS_OPEN).count(),
                 'runs_by_person': by_person},
        'counted_in_both': src_ok.filter(item_id__in=first_ok).count(),
        'new_items_counted': src_ok.exclude(item_id__in=first_ok).values('item_id').distinct().count(),
    }


@transaction.atomic
def merge(into_id: int, from_id: int) -> dict[str, Any]:
    if into_id == from_id:
        raise ValueError('An inventory cannot be merged into itself.')
    into = InventoryCount.objects.select_for_update().get(pk=into_id)
    src = InventoryCount.objects.select_for_update().filter(pk=from_id).first()
    if src is None:
        return {'skipped': f'Inventory {from_id} is gone; nothing to merge.'}
    record: dict[str, Any] = {'into': into.pk, 'from': {'id': src.pk, **{f: _plain(getattr(src, f)) for f in COUNT_FIELDS}}}

    # Runs still open stop at their last scan.
    stopped = []
    for run in src.runs.filter(status=Run.STATUS_OPEN):
        last = run.scans.order_by('-scanned_at').values_list('scanned_at', flat=True).first()
        stopped.append({'id': run.pk, 'status': run.status, 'stopped_at': _plain(run.stopped_at)})
        Run.objects.filter(pk=run.pk).update(status=Run.STATUS_STOPPED, stopped_at=last or timezone.now())
    record['stopped_runs'] = stopped

    # A scan's client id is unique within an inventory: rename the rare clash.
    taken = set(into.scans.values_list('client_id', flat=True))
    renamed = {}
    for scan in src.scans.filter(client_id__in=taken):
        renamed[str(scan.pk)] = scan.client_id
        CountScan.objects.filter(pk=scan.pk).update(client_id=f'{scan.client_id}-m{src.pk}'[:64])
    record['renamed'] = renamed

    # Counted in both: the later scan becomes "already".
    first_ok = set(good_scans(into).filter(result=CountScan.RESULT_OK, item__isnull=False).values_list('item_id', flat=True))
    dup = list(good_scans(src).filter(result=CountScan.RESULT_OK, item_id__in=first_ok).values_list('pk', flat=True))
    CountScan.objects.filter(pk__in=dup).update(result=CountScan.RESULT_ALREADY)
    record['already'] = dup

    record['runs'] = list(src.runs.values_list('pk', flat=True))
    record['scans'] = list(src.scans.values_list('pk', flat=True))
    record['issues'] = list(src.issues.values_list('pk', flat=True))
    Run.objects.filter(pk__in=record['runs']).update(count=into)
    CountScan.objects.filter(pk__in=record['scans']).update(count=into)
    Issue.objects.filter(pk__in=record['issues']).update(count=into)
    src.delete()
    InventoryCount.objects.filter(pk=into.pk).update(summary_cache=None)   # the list recomputes it
    record['moved'] = {'runs': len(record['runs']), 'scans': len(record['scans']), 'issues': len(record['issues']),
                       'counted_in_both': len(dup), 'runs_stopped': len(stopped)}
    return record


@transaction.atomic
def undo(record: dict[str, Any]) -> dict[str, Any]:
    if not record or 'from' not in record:
        return {'skipped': 'Nothing to undo.'}
    info = dict(record['from'])
    pk = info.pop('id')
    started_at = info.pop('started_at')
    src = InventoryCount.objects.create(pk=pk, **info)
    InventoryCount.objects.filter(pk=pk).update(started_at=started_at)
    Run.objects.filter(pk__in=record.get('runs') or []).update(count=src)
    CountScan.objects.filter(pk__in=record.get('scans') or []).update(count=src)
    Issue.objects.filter(pk__in=record.get('issues') or []).update(count=src)
    CountScan.objects.filter(pk__in=record.get('already') or []).update(result=CountScan.RESULT_OK)
    InventoryCount.objects.filter(pk__in=[pk, record.get('into') or 0]).update(summary_cache=None)
    for scan_id, client_id in (record.get('renamed') or {}).items():
        CountScan.objects.filter(pk=int(scan_id)).update(client_id=client_id)
    for r in record.get('stopped_runs') or []:
        Run.objects.filter(pk=r['id']).update(status=r['status'], stopped_at=r['stopped_at'])
    return {'restored': pk, 'runs': len(record.get('runs') or []), 'scans': len(record.get('scans') or [])}
