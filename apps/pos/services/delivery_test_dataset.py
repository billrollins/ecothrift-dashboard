"""Named delivery test dataset seed / show / reset lifecycle."""

from __future__ import annotations

from datetime import time, timedelta
from typing import Any

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone

from apps.core.models import S3File, WorkLocation
from apps.pos.models import (
    DeliveryAttachment,
    DeliveryCallAttempt,
    DeliveryDay,
    DeliveryJob,
    DeliveryJobItem,
    DeliveryRun,
    DeliveryRunStop,
    DeliveryTestArtifact,
    DeliveryTestDataset,
)
from apps.pos.services import delivery_phase2 as phase2
from apps.pos.services.delivery_migration_backfill import default_location_id

SCENARIO_VERSION = '2'


class DeliveryDatasetError(Exception):
    pass


def _require_mutation_allowed(*, allow_production: bool, confirm_dataset: str, key: str, execute: bool):
    if not execute:
        return
    if settings.DEBUG:
        return
    if not allow_production:
        raise DeliveryDatasetError(
            'Production mutation requires --allow-production and --confirm-dataset KEY'
        )
    if (confirm_dataset or '').strip() != key:
        raise DeliveryDatasetError(
            f'--confirm-dataset must exactly match dataset key ({key!r})'
        )


def get_active_dataset(key: str) -> DeliveryTestDataset | None:
    return (
        DeliveryTestDataset.objects.filter(key=key, status=DeliveryTestDataset.STATUS_ACTIVE)
        .order_by('-generation')
        .first()
    )


def show_dataset(key: str) -> dict[str, Any]:
    datasets = list(DeliveryTestDataset.objects.filter(key=key).order_by('-generation'))
    if not datasets:
        raise DeliveryDatasetError(f'No dataset found for key={key!r}')
    active = next((d for d in datasets if d.status == DeliveryTestDataset.STATUS_ACTIVE), datasets[0])
    days = list(DeliveryDay.objects.filter(test_dataset=active).order_by('date'))
    jobs = list(DeliveryJob.objects.filter(test_dataset=active).order_by('id'))
    runs = list(DeliveryRun.objects.filter(availability__test_dataset=active).order_by('id'))
    artifacts = list(active.artifacts.all())
    open_run = next((r for r in runs if r.status != DeliveryRun.STATUS_COMPLETED), None)
    contact = phase2.contact_progress(open_run) if open_run else None
    load = phase2.load_progress(open_run) if open_run else None
    return {
        'key': key,
        'active': {
            'id': active.id,
            'generation': active.generation,
            'status': active.status,
            'target_date': active.target_date.isoformat() if active.target_date else None,
            'scenario_version': active.scenario_version,
            'summary': active.summary,
            'reset_error': active.reset_error,
        },
        'generations': [
            {
                'id': d.id,
                'generation': d.generation,
                'status': d.status,
                'created_at': d.created_at.isoformat() if d.created_at else None,
                'reset_at': d.reset_at.isoformat() if d.reset_at else None,
            }
            for d in datasets
        ],
        'days': [
            {'id': d.id, 'date': d.date.isoformat(), 'is_active': d.is_active}
            for d in days
        ],
        'jobs': [
            {
                'id': j.id,
                'customer_name': j.customer_name,
                'status': j.status,
                'scheduled_date': j.scheduled_date.isoformat() if j.scheduled_date else None,
                'phone': j.phone,
            }
            for j in jobs
        ],
        'runs': [
            {
                'id': r.id,
                'date': r.date.isoformat(),
                'status': r.status,
                'phase': r.phase,
                'truck_closed_at': r.truck_closed_at.isoformat() if r.truck_closed_at else None,
            }
            for r in runs
        ],
        'contact': contact,
        'load': load,
        'artifacts': [
            {
                'id': a.id,
                'artifact_type': a.artifact_type,
                'object_id': a.object_id,
                'storage_key': a.storage_key,
            }
            for a in artifacts
        ],
    }


def _ledger(dataset: DeliveryTestDataset, artifact_type: str, *, object_id=None, storage_key='', meta=None):
    return DeliveryTestArtifact.objects.create(
        dataset=dataset,
        artifact_type=artifact_type,
        object_id=object_id,
        storage_key=storage_key or '',
        meta=meta or {},
    )


@transaction.atomic
def _seed_active_run_for_today(
    *,
    today_day: DeliveryDay,
    jobs: list[DeliveryJob],
    created_by,
    stage: str = 'calls',
) -> DeliveryRun:
    """Seed a truthful open run for phone QA at a chosen Phase 2 stage."""
    from apps.pos.services.delivery_run import start_or_resume_run

    stage = (stage or 'calls').strip().lower()
    run = start_or_resume_run(
        date=today_day.date,
        user=created_by,
        availability_id=today_day.id,
    )
    by_name = {j.customer_name: j for j in jobs}

    def stop_for(suffix: str) -> DeliveryRunStop:
        job = next(j for name, j in by_name.items() if name.endswith(suffix))
        return run.stops.get(job=job)

    # Contact truth scenarios
    confirmed = stop_for('Confirmed Customer')
    awaiting = stop_for('Awaiting Reply')
    no_answer = stop_for('No Answer')
    reschedule = stop_for('Wants Reschedule')
    cancel = stop_for('Wants Cancel')
    wrong = stop_for('Wrong Number')
    apt = stop_for('Apt Unit Stop')

    phase2.record_contact_attempt(
        confirmed,
        user=created_by,
        channel=DeliveryCallAttempt.CHANNEL_CALL,
        action=DeliveryCallAttempt.ACTION_CALL_PLACED,
    )
    phase2.set_contact_disposition(
        confirmed, user=created_by, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
    )
    phase2.record_contact_attempt(
        awaiting,
        user=created_by,
        channel=DeliveryCallAttempt.CHANNEL_TEXT,
        action=DeliveryCallAttempt.ACTION_COMPOSER_OPENED,
    )
    phase2.set_contact_disposition(
        awaiting, user=created_by, disposition=DeliveryRunStop.DISPOSITION_AWAITING_REPLY
    )
    phase2.set_contact_disposition(
        no_answer, user=created_by, disposition=DeliveryRunStop.DISPOSITION_NO_ANSWER
    )
    phase2.set_contact_disposition(
        reschedule,
        user=created_by,
        disposition=DeliveryRunStop.DISPOSITION_RESCHEDULE_REQUESTED,
    )
    phase2.set_contact_disposition(
        cancel, user=created_by, disposition=DeliveryRunStop.DISPOSITION_CANCEL_REQUESTED
    )
    phase2.set_contact_disposition(
        wrong, user=created_by, disposition=DeliveryRunStop.DISPOSITION_WRONG_NUMBER
    )
    phase2.set_contact_disposition(
        apt, user=created_by, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
    )

    if stage == 'calls':
        run.phase = DeliveryRun.PHASE_CALLS
        run.save(update_fields=['phase', 'updated_at'])
        return run

    # Advance load readiness for confirmed/apt stops (and leave others pending).
    for stop in (confirmed, apt):
        for item in stop.stop_items.all():
            if item.is_scannable and item.sku:
                for _ in range(max(1, int(item.quantity or 1))):
                    phase2.scan_stop_item(item, user=created_by, scanned_code=item.sku)
            else:
                phase2.skip_stop_item_verification(
                    item, user=created_by, reason='[TEST] seeded skip'
                )
            phase2.set_stop_item_loaded(item, user=created_by, loaded=True)
            phase2.set_stop_item_photo_exception(
                item, user=created_by, reason='[TEST] seeded photo slot'
            )

    # Also load awaiting-reply candidates (allowed while pending).
    for item in awaiting.stop_items.all():
        phase2.skip_stop_item_verification(item, user=created_by, reason='[TEST] load while pending')
        phase2.set_stop_item_loaded(item, user=created_by, loaded=True)
        phase2.set_stop_item_photo_exception(
            item, user=created_by, reason='[TEST] seeded photo slot'
        )

    if stage == 'load':
        run.phase = DeliveryRun.PHASE_LOAD
        run.save(update_fields=['phase', 'updated_at'])
        return run

    # Truck close seed
    from django.core.files.base import ContentFile

    truck_key = f'delivery/test/{run.id}/truck-close.jpg'
    saved = default_storage.save(truck_key, ContentFile(b'\xff\xd8\xff\xd9'))
    s3 = S3File.objects.create(
        key=saved,
        filename='truck-close.jpg',
        size=4,
        content_type='image/jpeg',
        uploaded_by=created_by,
    )
    DeliveryAttachment.objects.create(
        run=run,
        kind=DeliveryAttachment.KIND_TRUCK,
        s3_file=s3,
        created_by=created_by,
    )
    # Resolve remaining candidates for departure.
    # cancel_requested counts as resolved; reschedule_requested / no_answer / wrong need
    # explicit exclusion (or a real reschedule/cancel action) before departure.
    for stop in (no_answer, reschedule, wrong):
        stop.refresh_from_db()
        if not stop.excluded_unconfirmed_at and not phase2.stop_has_contact_resolution(stop):
            phase2.exclude_unconfirmed_stop(
                stop, user=created_by, reason='[TEST] left off departure'
            )
    # Load remaining non-confirmed candidates so truck close gate passes.
    for stop in run.stops.all():
        for item in stop.stop_items.all():
            if not phase2.stop_item_is_ready(item):
                if not phase2.stop_item_is_verified(item):
                    phase2.skip_stop_item_verification(
                        item, user=created_by, reason='[TEST] truck prep'
                    )
                if not item.loaded_at:
                    phase2.set_stop_item_loaded(item, user=created_by, loaded=True)
                if not phase2.stop_item_has_photo(item):
                    phase2.set_stop_item_photo_exception(
                        item, user=created_by, reason='[TEST] truck prep photo'
                    )
    phase2.close_truck(run, user=created_by)
    run.refresh_from_db()

    if stage == 'truck':
        return run

    run.phase = DeliveryRun.PHASE_ROUTE
    run.save(update_fields=['phase', 'updated_at'])
    if stage == 'route':
        return run

    if stage in ('active', 'drive', 'return'):
        run.status = DeliveryRun.STATUS_EN_ROUTE
        run.phase = DeliveryRun.PHASE_ACTIVE if stage != 'return' else DeliveryRun.PHASE_RETURN
        if stage == 'return':
            run.returned_to_store_at = timezone.now()
        run.save(
            update_fields=['status', 'phase', 'returned_to_store_at', 'updated_at']
            if stage == 'return'
            else ['status', 'phase', 'updated_at']
        )
    return run


def seed_dataset(
    *,
    key: str,
    target_date=None,
    date_offset: int = 0,
    created_by=None,
    test_phone: str = '402-555-0142',
    with_active_run: bool = False,
    active_run_stage: str = 'calls',
) -> dict[str, Any]:
    key = (key or '').strip()
    if not key:
        raise DeliveryDatasetError('Dataset key is required')
    if get_active_dataset(key):
        raise DeliveryDatasetError(
            f'Active dataset already exists for key={key!r}. Reset it before reseeding.'
        )

    prior = (
        DeliveryTestDataset.objects.filter(key=key)
        .order_by('-generation')
        .values_list('generation', flat=True)
        .first()
    )
    generation = int(prior or 0) + 1
    today = timezone.localdate()
    base = target_date or (today + timedelta(days=date_offset))
    loc_id = default_location_id()
    if not loc_id:
        loc = WorkLocation.objects.create(name='[TEST] Delivery Location', is_active=True)
        loc_id = loc.id

    dataset = DeliveryTestDataset.objects.create(
        key=key,
        generation=generation,
        scenario_version=SCENARIO_VERSION,
        target_date=base,
        status=DeliveryTestDataset.STATUS_ACTIVE,
        created_by=created_by,
        summary={},
    )

    def _free_date(preferred):
        candidate = preferred
        for _ in range(60):
            exists = DeliveryDay.objects.filter(
                date=candidate,
                archived_at__isnull=True,
                location_id=loc_id,
            ).exists()
            if not exists:
                return candidate
            candidate = candidate + timedelta(days=1)
        raise DeliveryDatasetError(f'Could not find free delivery day near {preferred}')

    def make_day(d, *, bookable=True, notes=''):
        day = DeliveryDay.objects.create(
            date=_free_date(d),
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=2,
            assigned_to='[TEST] Driver',
            notes=notes or '[TEST] seeded day',
            is_active=bookable,
            location_id=loc_id,
            test_dataset=dataset,
        )
        _ledger(dataset, DeliveryTestArtifact.ARTIFACT_DAY, object_id=day.id)
        return day

    today_day = make_day(base, notes='[TEST] Today planned')
    past_day = make_day(base - timedelta(days=7), notes='[TEST] Past completed')
    future_day = make_day(base + timedelta(days=7), notes='[TEST] Future planned')

    scenarios = [
        (today_day, 'Confirmed Customer', '402-555-0101', 'scheduled', 'Washer', 1, True),
        (today_day, 'Awaiting Reply', '402-555-0102', 'scheduled', 'Dryer', 1, False),
        (today_day, 'No Answer', '402-555-0103', 'scheduled', 'Fridge', 1, False),
        (today_day, 'Wants Reschedule', '402-555-0104', 'scheduled', 'Stove', 1, False),
        (today_day, 'Wants Cancel', '402-555-0105', 'scheduled', 'Microwave', 1, False),
        (today_day, 'Wrong Number', '402-555-0106', 'scheduled', 'Dishwasher', 1, False),
        (today_day, 'Apt Unit Stop', '402-555-0107', 'scheduled', 'Freezer', 1, True),
        (past_day, 'Past Completed', '402-555-0108', 'completed', 'Washer', 1, False),
        (future_day, 'Future Booked', '402-555-0109', 'scheduled', 'Dryer', 1, False),
        (None, 'Unscheduled Job', '402-555-0110', 'needs_scheduling', 'Range', 1, False),
    ]

    jobs_created = []
    for day, name, phone, status, item_desc, qty, is_apt in scenarios:
        job = DeliveryJob.objects.create(
            availability=day,
            scheduled_date=day.date if day else None,
            customer_name=f'[TEST] {name}',
            phone=phone if phone.startswith('402-555') else test_phone,
            address='123 [TEST] Main St' if not is_apt else '500 [TEST] Apt Blvd',
            is_apt=is_apt,
            unit='12B' if is_apt else '',
            items_delivered=item_desc,
            item_count=qty,
            status=status,
            notes='[TEST] seeded delivery',
            test_dataset=dataset,
            created_by=created_by,
        )
        _ledger(dataset, DeliveryTestArtifact.ARTIFACT_JOB, object_id=job.id)
        DeliveryJobItem.objects.create(
            job=job,
            description=item_desc,
            quantity=qty,
            position=0,
            sku='TESTSKU01' if name == 'Confirmed Customer' else '',
            is_scannable=name == 'Confirmed Customer',
            created_by=created_by,
        )
        if name == 'Confirmed Customer':
            DeliveryJobItem.objects.create(
                job=job,
                description='Washer Extra',
                quantity=2,
                position=1,
                sku='TESTSKU02',
                is_scannable=True,
                created_by=created_by,
            )
            job.item_count = 3
            job.save(update_fields=['item_count', 'updated_at'])
        if name == 'Awaiting Reply':
            DeliveryJobItem.objects.create(
                job=job,
                description='Manual non-scannable part',
                quantity=1,
                position=1,
                is_scannable=False,
                created_by=created_by,
            )
        jobs_created.append(job)

    # Past completed run with stop snapshot
    past_job = next(j for j in jobs_created if j.customer_name.endswith('Past Completed'))
    run = DeliveryRun.objects.create(
        date=past_day.date,
        availability=past_day,
        status=DeliveryRun.STATUS_COMPLETED,
        phase=DeliveryRun.PHASE_RETURN,
        started_at=timezone.now() - timedelta(hours=6),
        ended_at=timezone.now() - timedelta(hours=1),
        started_by=created_by,
        is_canonical=True,
    )
    _ledger(dataset, DeliveryTestArtifact.ARTIFACT_RUN, object_id=run.id)
    past_stop = DeliveryRunStop.objects.create(
        run=run,
        job=past_job,
        position=0,
        state=DeliveryRunStop.STATE_COMPLETED,
        completed_at=timezone.now() - timedelta(hours=2),
        contact_disposition=DeliveryRunStop.DISPOSITION_CONFIRMED,
    )
    phase2.snapshot_stop_items(past_stop, user=created_by)

    active_run = None
    if with_active_run:
        if created_by is None:
            raise DeliveryDatasetError('--with-active-run requires an authenticated/created_by user')
        active_run = _seed_active_run_for_today(
            today_day=today_day,
            jobs=jobs_created,
            created_by=created_by,
            stage=active_run_stage,
        )
        _ledger(dataset, DeliveryTestArtifact.ARTIFACT_RUN, object_id=active_run.id)

    summary = {
        'days': 3,
        'jobs': len(jobs_created),
        'runs': 1 + (1 if active_run else 0),
        'target_date': base.isoformat(),
        'scenario_version': SCENARIO_VERSION,
        'with_active_run': bool(active_run),
        'active_run_stage': active_run.phase if active_run else None,
        'active_run_id': active_run.id if active_run else None,
        'today_day_id': today_day.id,
    }
    dataset.summary = summary
    dataset.save(update_fields=['summary'])
    return {'dataset_id': dataset.id, 'key': key, 'generation': generation, **summary}


def reset_dataset(
    *,
    key: str,
    execute: bool = False,
    allow_production: bool = False,
    confirm_dataset: str = '',
    reset_by=None,
) -> dict[str, Any]:
    _require_mutation_allowed(
        allow_production=allow_production,
        confirm_dataset=confirm_dataset,
        key=key,
        execute=execute,
    )
    dataset = get_active_dataset(key)
    if not dataset:
        # Allow retry of reset_failed tombstones.
        dataset = (
            DeliveryTestDataset.objects.filter(
                key=key,
                status__in=[DeliveryTestDataset.STATUS_RESET_FAILED, DeliveryTestDataset.STATUS_RESETTING],
            )
            .order_by('-generation')
            .first()
        )
    if not dataset:
        raise DeliveryDatasetError(f'No active/resettable dataset for key={key!r}')

    artifacts = list(dataset.artifacts.all())
    plan = {
        'key': key,
        'generation': dataset.generation,
        'dataset_id': dataset.id,
        'execute': execute,
        'artifact_count': len(artifacts),
        'by_type': {},
        'storage_keys': [a.storage_key for a in artifacts if a.storage_key],
        'deleted': {},
    }
    for a in artifacts:
        plan['by_type'][a.artifact_type] = plan['by_type'].get(a.artifact_type, 0) + 1

    if not execute:
        plan['dry_run'] = True
        return plan

    dataset.status = DeliveryTestDataset.STATUS_RESETTING
    dataset.reset_error = ''
    dataset.save(update_fields=['status', 'reset_error'])

    deleted = {
        'storage_ok': 0,
        'storage_missing': 0,
        'storage_failed': 0,
        'attachments': 0,
        'runs': 0,
        'jobs': 0,
        'days': 0,
        's3_files': 0,
    }
    storage_errors: list[str] = []

    try:
        # Storage first (exact ledger keys).
        for art in artifacts:
            if art.artifact_type != DeliveryTestArtifact.ARTIFACT_S3_KEY or not art.storage_key:
                continue
            try:
                if default_storage.exists(art.storage_key):
                    default_storage.delete(art.storage_key)
                    deleted['storage_ok'] += 1
                else:
                    deleted['storage_missing'] += 1
            except Exception as exc:  # noqa: BLE001
                deleted['storage_failed'] += 1
                storage_errors.append(f'{art.storage_key}: {exc}')

        if storage_errors:
            dataset.status = DeliveryTestDataset.STATUS_RESET_FAILED
            dataset.reset_error = '\n'.join(storage_errors)[:2000]
            dataset.reset_at = timezone.now()
            dataset.reset_by = reset_by
            dataset.save(update_fields=['status', 'reset_error', 'reset_at', 'reset_by'])
            plan['deleted'] = deleted
            plan['storage_errors'] = storage_errors
            raise DeliveryDatasetError('Storage cleanup failed; dataset marked reset_failed')

        with transaction.atomic():
            day_ids = list(
                DeliveryDay.objects.filter(test_dataset=dataset).values_list('id', flat=True)
            )
            job_ids = list(
                DeliveryJob.objects.filter(test_dataset=dataset).values_list('id', flat=True)
            )
            run_ids = list(
                DeliveryRun.objects.filter(availability_id__in=day_ids).values_list('id', flat=True)
            )
            att_qs = DeliveryAttachment.objects.filter(run_id__in=run_ids)
            s3_ids = list(att_qs.values_list('s3_file_id', flat=True))
            deleted['attachments'] = att_qs.count()
            att_qs.delete()
            if s3_ids:
                deleted['s3_files'] = S3File.objects.filter(id__in=s3_ids).count()
                S3File.objects.filter(id__in=s3_ids).delete()
            deleted['runs'] = DeliveryRun.objects.filter(id__in=run_ids).count()
            DeliveryRun.objects.filter(id__in=run_ids).delete()
            deleted['jobs'] = DeliveryJob.objects.filter(id__in=job_ids).count()
            DeliveryJob.objects.filter(id__in=job_ids).delete()
            deleted['days'] = DeliveryDay.objects.filter(id__in=day_ids).count()
            DeliveryDay.objects.filter(id__in=day_ids).delete()
            # Keep artifact ledger + dataset tombstone.
            dataset.status = DeliveryTestDataset.STATUS_RESET
            dataset.reset_at = timezone.now()
            dataset.reset_by = reset_by
            dataset.reset_error = ''
            dataset.summary = {**(dataset.summary or {}), 'last_reset_deleted': deleted}
            dataset.save(update_fields=['status', 'reset_at', 'reset_by', 'reset_error', 'summary'])
    except DeliveryDatasetError:
        raise
    except Exception as exc:  # noqa: BLE001
        dataset.status = DeliveryTestDataset.STATUS_RESET_FAILED
        dataset.reset_error = str(exc)[:2000]
        dataset.reset_at = timezone.now()
        dataset.reset_by = reset_by
        dataset.save(update_fields=['status', 'reset_error', 'reset_at', 'reset_by'])
        raise DeliveryDatasetError(str(exc)) from exc

    plan['deleted'] = deleted
    plan['status'] = dataset.status
    return plan
