"""Backfill helpers for Delivery Day / JobItem / stop snapshots.

Important: when called from migration 0021, pass the historical ``apps`` registry so
ORM queries do not reference columns added in later migrations (e.g. 0023).
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.core.models import WorkLocation

SOURCE_CART_LINES_RE = re.compile(
    r'Source cart lines:\s*([0-9,\s]+)',
    re.IGNORECASE,
)


def default_location_id() -> int | None:
    locs = list(WorkLocation.objects.filter(is_active=True).order_by('id')[:2])
    if len(locs) == 1:
        return locs[0].id
    if not locs:
        first = WorkLocation.objects.order_by('id').first()
        return first.id if first else None
    return None


def parse_source_cart_line_ids(notes: str) -> list[int]:
    match = SOURCE_CART_LINES_RE.search(notes or '')
    if not match:
        return []
    ids: list[int] = []
    for part in match.group(1).split(','):
        part = part.strip()
        if not part:
            continue
        try:
            ids.append(int(part))
        except ValueError:
            return []
    return ids


def _exact_user_match(assigned_to: str) -> User | None:
    text = (assigned_to or '').strip()
    if not text:
        return None
    matches = [
        u for u in User.objects.filter(is_active=True)
        if u.full_name.strip().lower() == text.lower()
    ]
    return matches[0] if len(matches) == 1 else None


def _models(apps=None):
    """Return model classes — historical when ``apps`` is provided."""
    if apps is None:
        from apps.pos.models import (
            CartLine,
            DeliveryDay,
            DeliveryDayAssignment,
            DeliveryItemScan,
            DeliveryJob,
            DeliveryJobItem,
            DeliveryRun,
            DeliveryRunStop,
            DeliveryRunStopItem,
        )

        return {
            'CartLine': CartLine,
            'DeliveryDay': DeliveryDay,
            'DeliveryDayAssignment': DeliveryDayAssignment,
            'DeliveryItemScan': DeliveryItemScan,
            'DeliveryJob': DeliveryJob,
            'DeliveryJobItem': DeliveryJobItem,
            'DeliveryRun': DeliveryRun,
            'DeliveryRunStop': DeliveryRunStop,
            'DeliveryRunStopItem': DeliveryRunStopItem,
        }
    return {
        'CartLine': apps.get_model('pos', 'CartLine'),
        'DeliveryDay': apps.get_model('pos', 'DeliveryDay'),
        'DeliveryDayAssignment': apps.get_model('pos', 'DeliveryDayAssignment'),
        'DeliveryItemScan': apps.get_model('pos', 'DeliveryItemScan'),
        'DeliveryJob': apps.get_model('pos', 'DeliveryJob'),
        'DeliveryJobItem': apps.get_model('pos', 'DeliveryJobItem'),
        'DeliveryRun': apps.get_model('pos', 'DeliveryRun'),
        'DeliveryRunStop': apps.get_model('pos', 'DeliveryRunStop'),
        'DeliveryRunStopItem': apps.get_model('pos', 'DeliveryRunStopItem'),
    }


def _resolve_job_line_items_safe(job, *, CartLine, apps=None) -> list[dict[str, Any]]:
    """Resolve line items without importing live delivery_run helpers during migrate."""
    if apps is None:
        from apps.pos.services.delivery_run import resolve_job_line_items

        return resolve_job_line_items(job)

    # Historical path: prefer job items if any already exist, else cart meta / text.
    DeliveryJobItem = apps.get_model('pos', 'DeliveryJobItem')
    existing = list(
        DeliveryJobItem.objects.filter(job_id=job.id, is_active=True).order_by('position', 'id')
    )
    if existing:
        return [
            {
                'line_id': it.source_cart_line_id,
                'sku': it.sku,
                'description': it.description,
                'quantity': int(it.quantity or 1),
                'scannable': bool(it.is_scannable and it.sku),
                'item_id': it.source_item_id,
            }
            for it in existing
        ]

    meta = {}
    if getattr(job, 'cart_line_id', None):
        try:
            line = CartLine.objects.filter(pk=job.cart_line_id).first()
            if line and isinstance(getattr(line, 'meta', None), dict):
                meta = line.meta or {}
        except Exception:
            meta = {}
    raw_ids = meta.get('cart_line_ids') if isinstance(meta.get('cart_line_ids'), list) else []
    cleaned: list[int] = []
    for raw in raw_ids:
        try:
            cleaned.append(int(raw))
        except (TypeError, ValueError):
            continue
    items: list[dict[str, Any]] = []
    if cleaned:
        lines = {
            ln.id: ln
            for ln in CartLine.objects.filter(pk__in=cleaned).select_related('item')
        }
        for lid in cleaned:
            ln = lines.get(lid)
            if not ln:
                continue
            sku = ''
            if ln.item_id and getattr(ln, 'item', None):
                sku = (ln.item.sku or '').strip()
            if not sku:
                sku = (getattr(ln, 'resale_source_sku', None) or '').strip()
            items.append(
                {
                    'line_id': ln.id,
                    'sku': sku,
                    'description': (ln.description or '').strip() or 'Item',
                    'quantity': int(ln.quantity or 1),
                    'scannable': bool(sku),
                    'item_id': ln.item_id,
                }
            )
    if items:
        return items
    parts = [
        p.strip()
        for p in (job.items_delivered or '').replace(';', ',').split(',')
        if p.strip()
    ]
    if not parts:
        parts = ['Delivery items']
    return [
        {
            'line_id': None,
            'sku': '',
            'description': part,
            'quantity': 1,
            'scannable': False,
            'item_id': None,
        }
        for part in parts
    ]


@transaction.atomic
def backfill_delivery_days(*, dry_run: bool = False, apps=None) -> dict[str, Any]:
    """Map jobs/runs to days, fill location/driver, create orphan days, items, snapshots."""
    m = _models(apps)
    CartLine = m['CartLine']
    DeliveryDay = m['DeliveryDay']
    DeliveryDayAssignment = m['DeliveryDayAssignment']
    DeliveryItemScan = m['DeliveryItemScan']
    DeliveryJob = m['DeliveryJob']
    DeliveryJobItem = m['DeliveryJobItem']
    DeliveryRun = m['DeliveryRun']
    DeliveryRunStop = m['DeliveryRunStop']
    DeliveryRunStopItem = m['DeliveryRunStopItem']

    disposition_planned = getattr(DeliveryDay, 'DISPOSITION_PLANNED', 'planned')
    role_lead = getattr(DeliveryDayAssignment, 'ROLE_LEAD', 'lead')
    status_scheduled = getattr(DeliveryJob, 'STATUS_SCHEDULED', 'scheduled')
    status_completed = getattr(DeliveryRun, 'STATUS_COMPLETED', 'completed')

    summary: dict[str, Any] = {
        'location_id': default_location_id(),
        'days_location_set': 0,
        'days_driver_set': 0,
        'assignments_created': 0,
        'orphan_days_created': 0,
        'jobs_linked': 0,
        'runs_linked': 0,
        'runs_superseded': 0,
        'job_items_created': 0,
        'stop_items_created': 0,
        'scans_created': 0,
        'leftovers': [],
    }
    loc_id = summary['location_id']

    if not dry_run and loc_id:
        summary['days_location_set'] = DeliveryDay.objects.filter(location__isnull=True).update(
            location_id=loc_id,
        )

    for day in DeliveryDay.objects.all().iterator(chunk_size=100):
        driver = _exact_user_match(day.assigned_to)
        if driver and not day.primary_driver_id:
            summary['days_driver_set'] += 1
            if not dry_run:
                day.primary_driver = driver
                day.save(update_fields=['primary_driver', 'updated_at'])
                DeliveryDayAssignment.objects.get_or_create(
                    day=day,
                    user=driver,
                    defaults={'role': role_lead, 'display_order': 0},
                )
                summary['assignments_created'] += 1

    # Orphan scheduled dates without a Day.
    existing_dates = set(DeliveryDay.objects.values_list('date', flat=True))
    orphan_dates = (
        DeliveryJob.objects.filter(
            scheduled_date__isnull=False,
            availability__isnull=True,
            status=status_scheduled,
        )
        .exclude(scheduled_date__in=existing_dates)
        .values_list('scheduled_date', flat=True)
        .distinct()
    )
    for d in orphan_dates:
        summary['orphan_days_created'] += 1
        if dry_run:
            continue
        day = DeliveryDay.objects.create(
            date=d,
            time_start=timezone.datetime.strptime('09:00', '%H:%M').time(),
            time_end=timezone.datetime.strptime('17:00', '%H:%M').time(),
            crew_size=2,
            notes='Auto-created for orphan scheduled jobs (non-bookable)',
            is_active=False,
            planning_disposition=disposition_planned,
            location_id=loc_id,
        )
        existing_dates.add(d)
        linked = DeliveryJob.objects.filter(
            scheduled_date=d,
            availability__isnull=True,
            status=status_scheduled,
        ).update(availability=day)
        summary['jobs_linked'] += linked

    # Link runs missing availability by date (prefer oldest active day).
    for run in DeliveryRun.objects.filter(availability__isnull=True).iterator(chunk_size=100):
        day = (
            DeliveryDay.objects.filter(date=run.date)
            .order_by('id')
            .first()
        )
        if not day:
            if not dry_run:
                day = DeliveryDay.objects.create(
                    date=run.date,
                    time_start=timezone.datetime.strptime('09:00', '%H:%M').time(),
                    time_end=timezone.datetime.strptime('17:00', '%H:%M').time(),
                    crew_size=2,
                    notes='Auto-created for orphan run (non-bookable)',
                    is_active=False,
                    location_id=loc_id,
                )
                summary['orphan_days_created'] += 1
            else:
                summary['orphan_days_created'] += 1
                continue
        summary['runs_linked'] += 1
        if not dry_run:
            run.availability = day
            run.save(update_fields=['availability', 'updated_at'])

    # Mark non-canonical extras when multiple runs share a day.
    by_day: dict[int, list] = defaultdict(list)
    for run in DeliveryRun.objects.filter(availability__isnull=False).order_by('id'):
        by_day[run.availability_id].append(run)
    for _day_id, runs in by_day.items():
        if len(runs) <= 1:
            continue
        open_runs = [r for r in runs if r.status != status_completed]
        canonical = open_runs[-1] if open_runs else runs[-1]
        for r in runs:
            should_canonical = r.id == canonical.id
            if r.is_canonical != should_canonical or (
                not should_canonical and r.superseded_by_id != canonical.id
            ):
                summary['runs_superseded'] += 0 if should_canonical else 1
                if not dry_run:
                    r.is_canonical = should_canonical
                    r.superseded_by = None if should_canonical else canonical
                    r.save(update_fields=['is_canonical', 'superseded_by', 'updated_at'])

    # Job items
    for job in DeliveryJob.objects.iterator(chunk_size=100):
        if DeliveryJobItem.objects.filter(job=job).exists():
            continue
        items = _resolve_job_line_items_safe(job, CartLine=CartLine, apps=apps)
        note_ids = parse_source_cart_line_ids(job.notes or '')
        if note_ids and job.cart_id and not any(it.get('line_id') for it in items):
            lines = {
                ln.id: ln
                for ln in CartLine.objects.filter(pk__in=note_ids, cart_id=job.cart_id).select_related(
                    'item'
                )
            }
            rebuilt = []
            for lid in note_ids:
                ln = lines.get(lid)
                if not ln:
                    summary['leftovers'].append(
                        {'job_id': job.id, 'reason': 'missing_note_line', 'line_id': lid}
                    )
                    continue
                sku = ''
                if ln.item_id and getattr(ln, 'item', None):
                    sku = (ln.item.sku or '').strip()
                if not sku:
                    sku = (getattr(ln, 'resale_source_sku', None) or '').strip()
                rebuilt.append(
                    {
                        'line_id': ln.id,
                        'sku': sku,
                        'description': (ln.description or '').strip() or 'Item',
                        'quantity': int(ln.quantity or 1),
                        'scannable': bool(sku),
                        'item_id': ln.item_id,
                    }
                )
            if rebuilt:
                items = rebuilt
        if not items:
            items = [
                {
                    'line_id': None,
                    'sku': '',
                    'description': (job.items_delivered or 'Delivery items')[:300],
                    'quantity': max(1, int(job.item_count or 1)),
                    'scannable': False,
                }
            ]
            summary['leftovers'].append({'job_id': job.id, 'reason': 'text_fallback'})

        if dry_run:
            summary['job_items_created'] += len(items)
            continue

        for idx, it in enumerate(items):
            DeliveryJobItem.objects.create(
                job=job,
                source_cart_line_id=it.get('line_id'),
                source_item_id=it.get('item_id'),
                sku=(it.get('sku') or '')[:64],
                description=(it.get('description') or 'Item')[:300],
                quantity=max(1, int(it.get('quantity') or 1)),
                position=idx,
                is_scannable=bool(it.get('scannable')),
                is_active=True,
            )
            summary['job_items_created'] += 1

    # Stop item snapshots + scan translation
    for stop in DeliveryRunStop.objects.select_related('job').iterator(chunk_size=100):
        if DeliveryRunStopItem.objects.filter(stop=stop).exists():
            continue
        job_items = list(
            DeliveryJobItem.objects.filter(job_id=stop.job_id, is_active=True).order_by(
                'position', 'id'
            )
        )
        if not job_items:
            resolved = _resolve_job_line_items_safe(stop.job, CartLine=CartLine, apps=apps)
            if dry_run:
                summary['stop_items_created'] += max(1, len(resolved))
                continue
            for idx, it in enumerate(
                resolved
                or [{'description': 'Delivery items', 'quantity': 1, 'sku': '', 'scannable': False}]
            ):
                DeliveryRunStopItem.objects.create(
                    stop=stop,
                    sku=(it.get('sku') or '')[:64],
                    description=(it.get('description') or 'Item')[:300],
                    quantity=max(1, int(it.get('quantity') or 1)),
                    position=idx,
                    is_scannable=bool(it.get('scannable')),
                    source_cart_line_id_snapshot=it.get('line_id'),
                )
                summary['stop_items_created'] += 1
        else:
            if dry_run:
                summary['stop_items_created'] += len(job_items)
            else:
                for ji in job_items:
                    DeliveryRunStopItem.objects.create(
                        stop=stop,
                        job_item=ji,
                        sku=ji.sku,
                        description=ji.description,
                        quantity=ji.quantity,
                        position=ji.position,
                        is_scannable=ji.is_scannable,
                        source_cart_line_id_snapshot=ji.source_cart_line_id,
                    )
                    summary['stop_items_created'] += 1

        raw_scans = stop.scan_verified if isinstance(stop.scan_verified, list) else []
        if not raw_scans or dry_run:
            if dry_run:
                summary['scans_created'] += len(raw_scans)
            continue
        stop_items = list(DeliveryRunStopItem.objects.filter(stop=stop).order_by('position', 'id'))
        for entry in raw_scans:
            if not isinstance(entry, dict):
                continue
            code = (entry.get('sku') or '').strip()
            if not code:
                continue
            match = next((si for si in stop_items if si.sku and si.sku.upper() == code.upper()), None)
            if not match and stop_items:
                match = stop_items[0]
            if not match:
                continue
            DeliveryItemScan.objects.create(
                stop_item=match,
                scanned_code=code[:64],
            )
            summary['scans_created'] += 1

    return summary
