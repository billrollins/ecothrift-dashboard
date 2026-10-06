"""Count data work the owner approves on Superuser → Requests (``apps.core.services.approval_requests``).

- ``stocktake.merge_counts``: merge one inventory into another, e.g. the 10-06 half of the first full count into the
  10-05 one (inventory_effort Phase 1). Undo puts it back.
"""
from __future__ import annotations

from apps.core.models import ApprovalRequest
from apps.core.services.approval_requests import Kind, Progress, register

from .services import merge as merge_service


def _ids(params: dict) -> tuple[int, int]:
    try:
        return int(params['into']), int(params['from'])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError('params need "into" and "from" inventory ids.') from exc


def _merge_preview(params: dict) -> dict:
    into, src = _ids(params)
    info = merge_service.preview(into, src)
    f = info['from']
    people = ', '.join(f'{k} {v}' for k, v in sorted(f['runs_by_person'].items()))
    return {
        'counts': {
            f'Runs moving from "{f["name"]}"': f['runs'],
            'Scans moving': f['scans'],
            'Problems moving': f['issues'],
            'Runs still open (stopped at their last scan)': f['open_runs'],
            'Items counted in both (the later scan becomes "already")': info['counted_in_both'],
            'Items counted only in the second half': info['new_items_counted'],
        },
        'changes': [
            f'Moves every run, scan and problem of "{f["name"]}" (#{f["id"]}; runs by {people or "nobody"}) into '
            f'"{info["into"]["name"]}" (#{info["into"]["id"]}), so the inventory is one again.',
            'An item counted in both halves keeps its first scan as counted; the later one becomes "already".',
            f'Then deletes the empty #{f["id"]}. Undo recreates it with the same id and moves everything back.',
        ],
        'sample': [],
        'params': {'into': into, 'from': src},
    }


def _merge_apply(request: ApprovalRequest, progress: Progress) -> dict:
    into, src = _ids(request.params or {})
    result = merge_service.merge(into, src)
    progress.update(log=f"merged: {result.get('moved') or result.get('skipped')}")
    return result


def _merge_undo(request: ApprovalRequest) -> dict:
    return merge_service.undo(request.result or {})


register(Kind(
    kind='stocktake.merge_counts', label='Merge one inventory into another',
    preview=_merge_preview, apply=_merge_apply, undo=_merge_undo,
))
