"""TARS restoration queue — grade scales, job lifecycle helpers."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Literal

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Item, ItemCheckIn, RestorationJob

_SEED_SCALES: dict[str, list[str]] = {
    'Functional': ['Working', 'Repairable', 'Parts-only'],
    'Completeness': ['Complete', 'Incomplete'],
    'Assembly': ['Assembled', 'Flat-pack', 'Parts'],
    'Condition': ['New', 'Like-new', 'Good', 'Fair', 'Salvage'],
}

# Back-compat alias — prefer get_active_scales() for runtime validation.
TARS_GRADE_SCALES = _SEED_SCALES

RESTORATION_DISPATCH = 'restoration'

RESTORATION_RETURN_OUTCOME_UNTOUCHED = 'untouched'
RESTORATION_RETURN_OUTCOME_TARS_COMPLETED = 'tars_completed'

PROCESSING_HANDOFF_SCHEMA_VERSION = 1
PROCESSING_HANDOFF_TESTED_STATUSES = {'untested', 'partially_tested', 'tested'}
PROCESSING_HANDOFF_TEST_RESULTS = {
    'pass',
    'fail',
    'unknown',
    'not_applicable',
    'skipped',
}
PROCESSING_HANDOFF_MAX_QUICK_TESTS = 10
PROCESSING_HANDOFF_MAX_TEXT = 2_000

RESTORATION_UNTOUCHED_REASONS: dict[str, str] = {
    'recalled': 'Recalled',
    'not_worth_it': 'Not worth it from preliminary look',
    'other': 'Other',
}


def get_active_scales() -> dict[str, list[str]]:
    """Seed scales are always valid; active DB scales are added/override by name.

    Returning the union prevents a legacy/seed scale from ever 400ing with
    "Unknown grade scale" once custom DB scales exist.
    """

    from apps.inventory.models import RestorationGradeScale

    merged: dict[str, list[str]] = dict(_SEED_SCALES)
    rows = RestorationGradeScale.objects.filter(is_active=True).order_by('sort_order', 'name')
    for row in rows:
        merged[row.name] = [str(g) for g in (row.grades or [])]
    return merged


def is_known_active_scale(scale: str) -> bool:
    return bool(scale) and scale in get_active_scales()


def grades_for_scale(scale: str) -> list[str]:
    return list(get_active_scales().get(scale or '', []))


def normalize_grade_values(raw: Any) -> dict[str, float]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, float] = {}
    for grade, value in raw.items():
        try:
            amount = float(value)
        except (TypeError, ValueError):
            continue
        if amount > 0:
            out[str(grade)] = amount
    return out


def empty_values_for_scale(scale: str, prev: dict[str, float] | None = None) -> dict[str, float]:
    prev = prev or {}
    grades = grades_for_scale(scale)
    return {g: prev.get(g, 0.0) if prev.get(g, 0) > 0 else 0.0 for g in grades}


def grade_values_complete(scale: str, values: dict[str, float] | dict[str, Any]) -> bool:
    if not scale:
        return False
    grades = grades_for_scale(scale)
    if not grades:
        return False
    normalized = normalize_grade_values(values)
    return all(normalized.get(g, 0) > 0 for g in grades)


def validate_restoration_check_in_payload(data: dict) -> tuple[str, dict[str, float]]:
    """Accept restoration dispatch; grade scale/values may be completed on Restorations TO setup.

    Incomplete or missing grades create a queued job with ``needs_setup=True``.
    If a scale is provided it must be a known active scale. Partial grade maps are
    normalized; completeness is enforced before TARS bench check-in.
    """

    dispatch = str(data.get('dispatch') or 'on_shelf').strip()
    if dispatch != RESTORATION_DISPATCH:
        return '', {}
    scale = str(data.get('restoration_scale') or '').strip()
    grade_values = normalize_grade_values(data.get('restoration_grade_values'))
    if scale and not is_known_active_scale(scale):
        raise ValueError('restoration_scale must be a known grade scale when provided.')
    if scale and grade_values:
        # Keep only grades that belong to the scale; zeros already stripped by normalize.
        allowed = set(grades_for_scale(scale))
        grade_values = {g: v for g, v in grade_values.items() if g in allowed}
    elif scale:
        grade_values = empty_values_for_scale(scale, grade_values)
    return scale, grade_values


def _handoff_text(value: Any, field: str, *, limit: int = PROCESSING_HANDOFF_MAX_TEXT) -> str:
    text = str(value or '').strip()
    if len(text) > limit:
        raise ValueError(f'processing_handoff.{field} exceeds {limit} characters.')
    return text


def normalize_processing_handoff(raw: Any, *, user=None) -> dict[str, Any]:
    """Validate a versioned Processing-to-Restoration handoff and server-stamp it."""

    if not isinstance(raw, dict):
        raise ValueError('processing_handoff must be an object.')
    schema_version = raw.get('schema_version', PROCESSING_HANDOFF_SCHEMA_VERSION)
    if schema_version != PROCESSING_HANDOFF_SCHEMA_VERSION:
        raise ValueError(f'Unsupported processing_handoff schema_version: {schema_version}.')

    tested_status = _handoff_text(raw.get('tested_status'), 'tested_status', limit=32).lower()
    if tested_status not in PROCESSING_HANDOFF_TESTED_STATUSES:
        raise ValueError(
            'processing_handoff.tested_status is required and must be '
            'untested, partially_tested, or tested.',
        )

    quick_tests_raw = raw.get('quick_tests') or []
    if not isinstance(quick_tests_raw, list):
        raise ValueError('processing_handoff.quick_tests must be a list.')
    if len(quick_tests_raw) > PROCESSING_HANDOFF_MAX_QUICK_TESTS:
        raise ValueError(
            f'processing_handoff supports at most {PROCESSING_HANDOFF_MAX_QUICK_TESTS} quick tests.',
        )

    quick_tests: list[dict[str, str]] = []
    for index, entry in enumerate(quick_tests_raw):
        if not isinstance(entry, dict):
            raise ValueError(f'processing_handoff.quick_tests[{index}] must be an object.')
        test_id = _handoff_text(entry.get('test_id'), f'quick_tests[{index}].test_id', limit=80)
        name = _handoff_text(entry.get('name'), f'quick_tests[{index}].name', limit=300)
        if not test_id and not name:
            raise ValueError(
                f'processing_handoff.quick_tests[{index}] requires test_id or name.',
            )
        result = _handoff_text(
            entry.get('result'),
            f'quick_tests[{index}].result',
            limit=32,
        ).lower()
        if result not in PROCESSING_HANDOFF_TEST_RESULTS:
            raise ValueError(
                f'processing_handoff.quick_tests[{index}].result must be one of '
                f'{sorted(PROCESSING_HANDOFF_TEST_RESULTS)}.',
            )
        normalized = {
            'result': result,
            'notes': _handoff_text(entry.get('notes'), f'quick_tests[{index}].notes'),
        }
        if test_id:
            normalized['test_id'] = test_id
        if name:
            normalized['name'] = name
        quick_tests.append(normalized)

    unknowns_raw = raw.get('unknowns')
    if isinstance(unknowns_raw, list):
        if len(unknowns_raw) > 20:
            raise ValueError('processing_handoff.unknowns supports at most 20 entries.')
        unknowns: str | list[str] = [
            _handoff_text(value, f'unknowns[{index}]', limit=300)
            for index, value in enumerate(unknowns_raw)
            if str(value or '').strip()
        ]
    else:
        unknowns = _handoff_text(unknowns_raw, 'unknowns')

    user_id = None
    if user is not None and getattr(user, 'is_authenticated', False):
        user_id = getattr(user, 'pk', None)
    return {
        'schema_version': PROCESSING_HANDOFF_SCHEMA_VERSION,
        'tested_status': tested_status,
        'condition_evidence': _handoff_text(
            raw.get('condition_evidence'),
            'condition_evidence',
        ),
        'unknowns': unknowns,
        'quick_tests': quick_tests,
        'recorded_at': timezone.now().isoformat(),
        'recorded_by_id': user_id,
    }


def processing_handoff_from_check_in(check_in: ItemCheckIn | None) -> dict[str, Any] | None:
    if check_in is None or not isinstance(check_in.defaults_snapshot, dict):
        return None
    handoff = check_in.defaults_snapshot.get('processing_handoff')
    return handoff if isinstance(handoff, dict) else None


def map_vendor_name_to_tars_source(vendor_name: str | None) -> str | None:
    v = (vendor_name or '').strip().lower()
    if not v:
        return None
    if 'target' in v:
        return 'Target'
    if 'amazon' in v or 'b-stock' in v or 'bstock' in v:
        return 'Amazon'
    if 'walmart' in v:
        return 'Walmart'
    return None


def _vendor_source_q(source: str):
    from django.db.models import Q

    s = (source or '').strip().lower()
    if s == 'target':
        return Q(purchase_order__vendor__name__icontains='target')
    if s == 'amazon':
        return (
            Q(purchase_order__vendor__name__icontains='amazon')
            | Q(purchase_order__vendor__name__icontains='b-stock')
            | Q(purchase_order__vendor__name__icontains='bstock')
        )
    if s == 'walmart':
        return Q(purchase_order__vendor__name__icontains='walmart')
    return Q(pk__in=[])


def suggest_restoration_grade_scale(
    *,
    source: str | None = None,
    brand: str | None = None,
    category: str | None = None,
    filter_vendor: bool = False,
    filter_brand: bool = False,
    filter_category: bool = False,
) -> dict[str, Any] | None:
    """Most common scale from past restoration jobs matching selected dimensions."""

    from django.db.models import Count

    qs = RestorationJob.objects.exclude(scale='').filter(scale__isnull=False)
    if filter_vendor and source:
        qs = qs.filter(_vendor_source_q(source))
    if filter_brand and brand:
        qs = qs.filter(product__brand__iexact=brand.strip())
    if filter_category and category:
        qs = qs.filter(product__category__name__iexact=category.strip())

    rows = list(
        qs.values('scale')
        .annotate(count=Count('id'))
        .order_by('-count', 'scale')
    )
    if not rows:
        return None
    top = rows[0]
    return {
        'scale': top['scale'],
        'count': top['count'],
        'counts': rows,
    }


def restoration_job_needs_setup(job: RestorationJob) -> bool:
    return not grade_values_complete(job.scale, job.grade_values or {})


def merge_restoration_into_defaults_snapshot(
    snapshot: dict,
    scale: str,
    grade_values: dict[str, float],
    processing_handoff: dict[str, Any] | None = None,
) -> dict:
    merged = dict(snapshot or {})
    merged['restoration_scale'] = scale
    merged['restoration_grade_values'] = grade_values
    if processing_handoff is not None:
        merged['processing_handoff'] = processing_handoff
    return merged


@transaction.atomic
def create_restoration_job_from_check_in(
    check_in: ItemCheckIn,
    *,
    scale: str,
    grade_values: dict[str, float],
    user,
) -> RestorationJob:
    if RestorationJob.objects.filter(item_check_in=check_in).exists():
        job = RestorationJob.objects.select_for_update().get(item_check_in=check_in)
        job.scale = scale
        job.grade_values = grade_values
        job.quantity = check_in.quantity
        job.save(update_fields=['scale', 'grade_values', 'quantity', 'updated_at'])
        return job

    job = RestorationJob.objects.create(
        item_check_in=check_in,
        product=check_in.product,
        purchase_order=check_in.purchase_order,
        quantity=check_in.quantity,
        stage=RestorationJob.STAGE_QUEUED,
        scale=scale,
        grade_values=grade_values,
        created_by=user,
    )
    return job


def restoration_job_id_for_check_in(check_in_id: int | None) -> int | None:
    if not check_in_id:
        return None
    return (
        RestorationJob.objects.filter(item_check_in_id=check_in_id)
        .values_list('id', flat=True)
        .first()
    )


_BENCH_VERB_LABELS = {
    'test': 'Tested',
    'assemble': 'Assembled',
    'repair': 'Repaired',
    'salvage': 'Salvaged',
}


def _work_verbs_from_session(session: Any) -> list[str]:
    if not isinstance(session, dict):
        return []
    seen: list[str] = []
    for row in session.get('benchRows') or []:
        if not isinstance(row, dict):
            continue
        category = str(row.get('category') or '').strip().lower()
        label = _BENCH_VERB_LABELS.get(category)
        if label and label not in seen:
            seen.append(label)
    decision = session.get('decisionWork') if isinstance(session.get('decisionWork'), dict) else {}
    selection = decision.get('selection') if isinstance(decision.get('selection'), dict) else {}
    action = str(selection.get('action') or '').strip().lower()
    label = _BENCH_VERB_LABELS.get(action)
    if label and label not in seen:
        seen.append(label)
    return seen


def _unit_kind_for_job(job: RestorationJob) -> str:
    """Best-effort unit classification for Processing Restorations desk."""

    check_in = job.item_check_in if job.item_check_in_id else None
    snapshot = check_in.defaults_snapshot if check_in and isinstance(check_in.defaults_snapshot, dict) else {}
    if snapshot.get('restoration_unit_kind') in ('whole', 'part', 'added'):
        return str(snapshot['restoration_unit_kind'])
    if check_in is not None and getattr(check_in, 'processing_row_id', None) is None:
        # Scan-added / non-processing-row restoration jobs.
        return 'added'
    if job.quantity and job.quantity > 1:
        return 'part'
    return 'whole'


def _sale_state_from_session(session: Any) -> str | None:
    if not isinstance(session, dict):
        return None
    decision = session.get('decisionWork') if isinstance(session.get('decisionWork'), dict) else {}
    selection = decision.get('selection') if isinstance(decision.get('selection'), dict) else {}
    sale = selection.get('saleState') or selection.get('sale_state')
    return str(sale) if sale else None


def _decision_reason_from_session(session: Any) -> str:
    if not isinstance(session, dict):
        return ''
    decision = session.get('decisionWork') if isinstance(session.get('decisionWork'), dict) else {}
    selection = decision.get('selection') if isinstance(decision.get('selection'), dict) else {}
    return str(selection.get('reason') or '').strip()


def processing_desk_from_family(job: RestorationJob) -> str | None:
    """Return worked|untouched for FROM desk rows, else None for TO rows."""

    if (
        job.stage == RestorationJob.STAGE_DONE
        and job.bench_disposition == RestorationJob.BENCH_DISPOSITION_PROCESSING
    ):
        return 'worked'
    if job.stage == RestorationJob.STAGE_RETURNED:
        if job.return_disposition_type == RestorationJob.RETURN_DISPOSITION_UNTOUCHED:
            return 'untouched'
        if job.return_disposition_type == RestorationJob.RETURN_DISPOSITION_TARS_COMPLETED:
            return 'worked'
    return None


def is_processing_desk_from_eligible(job: RestorationJob) -> bool:
    return (
        job.processing_handled_at is None
        and processing_desk_from_family(job) is not None
    )


def build_processing_desk_summary(job: RestorationJob) -> dict[str, Any]:
    family = processing_desk_from_family(job)
    session = job.work_session if isinstance(job.work_session, dict) else {}
    handoff = processing_handoff_from_check_in(job.item_check_in if job.item_check_in_id else None)
    direction = 'from' if family else ('to' if job.stage in (
        RestorationJob.STAGE_QUEUED,
        RestorationJob.STAGE_SENT,
    ) else 'other')
    return {
        'direction': direction,
        'from_family': family,
        'work_verbs': _work_verbs_from_session(session) if family == 'worked' else [],
        'unit_kind': _unit_kind_for_job(job),
        'sale_state': _sale_state_from_session(session),
        'decision_reason': _decision_reason_from_session(session),
        'achieved_grade': job.final_grade or job.return_grade or '',
        'processing_handoff': handoff,
    }


def processing_desk_queryset():
    """TO (needs setup / queued) and FROM (unhandled returns) for Processing Restorations."""

    from django.db.models import Q

    return RestorationJob.objects.filter(
        Q(
            stage__in=[RestorationJob.STAGE_QUEUED, RestorationJob.STAGE_SENT],
        )
        | Q(
            processing_handled_at__isnull=True,
            stage=RestorationJob.STAGE_DONE,
            bench_disposition=RestorationJob.BENCH_DISPOSITION_PROCESSING,
        )
        | Q(
            processing_handled_at__isnull=True,
            stage=RestorationJob.STAGE_RETURNED,
            return_disposition_type__in=[
                RestorationJob.RETURN_DISPOSITION_TARS_COMPLETED,
                RestorationJob.RETURN_DISPOSITION_UNTOUCHED,
            ],
        ),
    )


def delete_restoration_job_for_check_in(check_in: ItemCheckIn) -> None:
    job = RestorationJob.objects.filter(item_check_in=check_in).first()
    if job is None:
        return
    if job.stage != RestorationJob.STAGE_QUEUED:
        raise ValueError('Restoration job has already left the queue — change dispatch is blocked.')
    job.delete()


def delete_restoration_job_if_removable(check_in: ItemCheckIn) -> None:
    """Delete linked job when check-in is removed (queued or sent only)."""

    job = RestorationJob.objects.filter(item_check_in=check_in).first()
    if job is None:
        return
    if job.stage not in (RestorationJob.STAGE_QUEUED, RestorationJob.STAGE_SENT):
        raise ValueError('Cannot delete check-in — restoration job is in progress.')
    job.delete()


def _normalize_scan_identifier(identifier: str) -> str:
    raw = (identifier or '').strip()
    while raw and raw[-1] in '.,;':
        raw = raw[:-1].strip()
    return raw


def _find_item_by_identifier(identifier: str) -> Item | None:
    raw = _normalize_scan_identifier(identifier)
    if not raw:
        return None
    if raw.isdigit():
        item = Item.objects.filter(pk=int(raw)).first()
        if item is not None:
            return item
    return Item.objects.filter(sku__iexact=raw).first()


QueueAddStatus = Literal['created', 'already_queued', 'requeued', 'on_bench', 'on_pending']


class RestorationItemNotFound(ValueError):
    """Scanned identifier did not match any Item."""


def _requeue_restoration_job(job: RestorationJob) -> RestorationJob:
    """Reset the full lifecycle so a done/returned item re-enters the queue clean.

    Parts requests/orders live in their own tables, so clearing work_session
    loses nothing that matters for purchasing history.
    """

    job.stage = RestorationJob.STAGE_QUEUED
    job.sent_at = None
    job.work_session = {}
    job.bench_started_at = None
    job.timer_started_at = None
    job.timer_started_by = None
    job.timer_is_running = False
    job.active_seconds = 0
    job.pending_reason = ''
    job.pending_notes = ''
    job.pending_storage_location = ''
    job.pending_started_at = None
    job.bench_disposition = ''
    job.final_grade = ''
    job.disposition_notes = ''
    job.spent_hours = None
    job.spent_parts_cost = None
    job.dispositioned_at = None
    job.dispositioned_by = None
    job.processing_handled_at = None
    job.processing_handled_by = None
    job.return_disposition_type = ''
    job.return_reason = ''
    job.return_scale = ''
    job.return_grade = ''
    job.return_notes = ''
    job.returned_at = None
    job.returned_by = None
    job.save(update_fields=[
        'stage',
        'sent_at',
        'work_session',
        'bench_started_at',
        'timer_started_at',
        'timer_started_by',
        'timer_is_running',
        'active_seconds',
        'pending_reason',
        'pending_notes',
        'pending_storage_location',
        'pending_started_at',
        'bench_disposition',
        'final_grade',
        'disposition_notes',
        'spent_hours',
        'spent_parts_cost',
        'dispositioned_at',
        'dispositioned_by',
        'processing_handled_at',
        'processing_handled_by',
        'return_disposition_type',
        'return_reason',
        'return_scale',
        'return_grade',
        'return_notes',
        'returned_at',
        'returned_by',
        'updated_at',
    ])
    return job


@dataclass(frozen=True)
class QueueAddResult:
    job: RestorationJob
    status: QueueAddStatus
    scanned_item: Item


def _ensure_check_in_for_item(item: Item, user) -> ItemCheckIn:
    if item.check_in_id:
        return ItemCheckIn.objects.select_for_update().get(pk=item.check_in_id)

    if not item.purchase_order_id:
        raise ValueError(f'{item.sku} has no purchase order — cannot queue for restoration.')

    from apps.inventory.models import ProcessingRow
    from apps.inventory.processing_ops import _sync_item_check_in_quantity

    processing_row = None
    if item.manifest_row_id:
        processing_row = (
            ProcessingRow.objects.filter(
                purchase_order_id=item.purchase_order_id,
                manifest_row_id=item.manifest_row_id,
            )
            .order_by('row_number')
            .first()
        )

    origin = ItemCheckIn.ORIGIN_PROCESSING if processing_row else ItemCheckIn.ORIGIN_MANUAL
    check_in = ItemCheckIn.objects.create(
        purchase_order_id=item.purchase_order_id,
        processing_row=processing_row,
        manifest_row_id=item.manifest_row_id,
        product_id=item.product_id,
        origin=origin,
        quantity=1,
        defaults_snapshot={
            'condition': item.condition,
            'dispatch': RESTORATION_DISPATCH,
            'location': RESTORATION_DISPATCH,
            'price': str(item.price),
            'retail': str(item.retail) if item.retail is not None else None,
        },
        created_by=user,
    )
    item.check_in = check_in
    item.save(update_fields=['check_in', 'updated_at'])
    _sync_item_check_in_quantity(check_in)
    return check_in


def _apply_restoration_dispatch_to_check_in(check_in: ItemCheckIn, user) -> None:
    from apps.inventory.models import ItemHistory
    from apps.inventory.processing_ops import apply_item_updates, _sync_item_check_in_quantity

    snapshot = dict(check_in.defaults_snapshot or {})
    snapshot['dispatch'] = RESTORATION_DISPATCH
    snapshot['location'] = RESTORATION_DISPATCH
    check_in.defaults_snapshot = snapshot
    check_in.save(update_fields=['defaults_snapshot', 'updated_at'])

    now = timezone.now()
    histories: list[ItemHistory] = []
    for item in check_in.items.select_for_update().all():
        if item.status == 'sold' or item.sold_at:
            continue

        old_status = item.status
        old_location = item.location or ''

        if item.status in ('intake', 'processing'):
            item.status = 'on_shelf'
            item.location = RESTORATION_DISPATCH
            item.listed_at = now
            item.checked_in_at = now
            item.checked_in_by = user
            item.save(
                update_fields=[
                    'status',
                    'location',
                    'listed_at',
                    'checked_in_at',
                    'checked_in_by',
                    'updated_at',
                ],
            )
            histories.append(
                ItemHistory(
                    item=item,
                    event_type='status_change',
                    old_value=old_status,
                    new_value='on_shelf',
                    note='Queued for restoration via scan',
                    created_by=user,
                ),
            )
            if old_location != RESTORATION_DISPATCH:
                histories.append(
                    ItemHistory(
                        item=item,
                        event_type='location_change',
                        old_value=old_location,
                        new_value=RESTORATION_DISPATCH,
                        note='Dispatch set to restoration via queue scan',
                        created_by=user,
                    ),
                )
        elif item.location != RESTORATION_DISPATCH:
            changed = apply_item_updates(item, {'location': RESTORATION_DISPATCH})
            if changed:
                item.save(update_fields=['location', 'updated_at'])
                histories.append(
                    ItemHistory(
                        item=item,
                        event_type='location_change',
                        old_value=old_location,
                        new_value=RESTORATION_DISPATCH,
                        note='Dispatch set to restoration via queue scan',
                        created_by=user,
                    ),
                )

    if histories:
        ItemHistory.objects.bulk_create(histories)
    _sync_item_check_in_quantity(check_in)


def _job_defaults_from_check_in(check_in: ItemCheckIn) -> tuple[str, dict[str, float]]:
    snapshot = check_in.defaults_snapshot if isinstance(check_in.defaults_snapshot, dict) else {}
    scale = str(snapshot.get('restoration_scale') or '').strip()
    grade_values = normalize_grade_values(snapshot.get('restoration_grade_values'))
    return scale, grade_values


def create_restoration_job_for_check_in(check_in: ItemCheckIn, user) -> RestorationJob:
    scale, grade_values = _job_defaults_from_check_in(check_in)
    job, _created = RestorationJob.objects.get_or_create(
        item_check_in=check_in,
        defaults={
            'product': check_in.product,
            'purchase_order': check_in.purchase_order,
            'quantity': check_in.quantity,
            'stage': RestorationJob.STAGE_QUEUED,
            'scale': scale,
            'grade_values': grade_values,
            'created_by': user,
        },
    )
    return job


@transaction.atomic
def sync_missing_restoration_jobs(user=None) -> int:
    """Backfill queued jobs for restoration check-ins that predate the feature."""

    from django.db.models import Exists, OuterRef

    has_job = RestorationJob.objects.filter(item_check_in_id=OuterRef('pk'))
    missing = (
        ItemCheckIn.objects.annotate(has_job=Exists(has_job))
        .filter(has_job=False)
        .filter(items__location=RESTORATION_DISPATCH, items__status='on_shelf')
        .select_related('product', 'purchase_order')
        .distinct()
    )
    created = 0
    for check_in in missing:
        create_restoration_job_for_check_in(check_in, user)
        created += 1
    return created


@transaction.atomic
def queue_add_restoration_item(identifier: str, user) -> QueueAddResult:
    """Scan-add: set dispatch to restoration and create or return the linked job."""

    raw = _normalize_scan_identifier(identifier)
    if not raw:
        raise ValueError('Enter a SKU or item number.')

    item = _find_item_by_identifier(raw)
    if item is None:
        raise RestorationItemNotFound(f'No item found for {raw}.')

    if item.status in ('sold', 'lost', 'scrapped'):
        raise ValueError(f'{item.sku} cannot be queued (status: {item.status}).')

    if item.condition == 'salvage':
        raise ValueError(f'{item.sku} is salvage and cannot be sent to restoration.')

    check_in = _ensure_check_in_for_item(item, user)
    _apply_restoration_dispatch_to_check_in(check_in, user)

    existing = RestorationJob.objects.filter(item_check_in=check_in).first()
    if existing and existing.quantity > 1:
        split_restoration_job(existing, groups=[[item.pk]], user=user)
        item.refresh_from_db()
        check_in = ItemCheckIn.objects.get(pk=item.check_in_id)
        existing = RestorationJob.objects.filter(item_check_in=check_in).first()

    if existing:
        if existing.stage in (RestorationJob.STAGE_QUEUED, RestorationJob.STAGE_SENT):
            return QueueAddResult(job=existing, status='already_queued', scanned_item=item)
        if existing.stage == RestorationJob.STAGE_BENCH:
            return QueueAddResult(job=existing, status='on_bench', scanned_item=item)
        if existing.stage == RestorationJob.STAGE_PENDING:
            return QueueAddResult(job=existing, status='on_pending', scanned_item=item)
        job = _requeue_restoration_job(existing)
        return QueueAddResult(job=job, status='requeued', scanned_item=item)

    job = create_restoration_job_for_check_in(check_in, user)
    return QueueAddResult(job=job, status='created', scanned_item=item)


@transaction.atomic
def create_or_get_restoration_job_for_sku(sku: str, user) -> RestorationJob:
    return queue_add_restoration_item(sku, user).job


@transaction.atomic
def send_restoration_job(job: RestorationJob) -> RestorationJob:
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if job.stage != RestorationJob.STAGE_QUEUED:
        raise ValueError('Only queued restoration jobs can be sent.')
    if restoration_job_needs_setup(job):
        raise ValueError('Enter a value for every grade before sending to restoration.')
    job.stage = RestorationJob.STAGE_SENT
    job.sent_at = timezone.now()
    job.save(update_fields=['stage', 'sent_at', 'updated_at'])
    return job


def _movable_items_for_check_in(check_in: ItemCheckIn) -> list[Item]:
    return list(
        check_in.items.select_for_update()
        .exclude(status='sold')
        .filter(sold_at__isnull=True)
        .order_by('id'),
    )


def _clone_check_in_from(source: ItemCheckIn, user) -> ItemCheckIn:
    return ItemCheckIn.objects.create(
        purchase_order=source.purchase_order,
        processing_row=source.processing_row,
        manifest_row=source.manifest_row,
        product=source.product,
        origin=source.origin,
        quantity=0,
        defaults_snapshot=dict(source.defaults_snapshot or {}),
        created_by=user,
    )


def _apply_return_snapshot_to_check_in(
    check_in: ItemCheckIn,
    *,
    disposition_type: str,
    reason: str,
    scale: str,
    grade: str,
    notes: str,
) -> None:
    snapshot = dict(check_in.defaults_snapshot or {})
    snapshot['dispatch'] = 'processing'
    snapshot['location'] = 'processing'
    snapshot['restoration_return_disposition_type'] = disposition_type
    snapshot['restoration_return_reason'] = reason
    snapshot['restoration_return_scale'] = scale
    snapshot['restoration_return_grade'] = grade
    snapshot['restoration_return_notes'] = notes
    check_in.defaults_snapshot = snapshot
    check_in.save(update_fields=['defaults_snapshot', 'updated_at'])


def _move_items_to_processing(
    items: list[Item],
    *,
    user,
    note: str = 'Returned to Processing from restoration queue',
) -> None:
    from apps.inventory.models import ItemHistory

    histories: list[ItemHistory] = []
    for item in items:
        old_location = item.location or ''
        if old_location == 'processing':
            continue
        item.location = 'processing'
        item.save(update_fields=['location', 'updated_at'])
        histories.append(
            ItemHistory(
                item=item,
                event_type='location_change',
                old_value=old_location,
                new_value='processing',
                note=note,
                created_by=user,
            ),
        )
    if histories:
        ItemHistory.objects.bulk_create(histories)


@transaction.atomic
def split_restoration_job(
    job: RestorationJob,
    *,
    groups: list[list[int]],
    user,
) -> dict[str, Any]:
    """Move item subsets into sibling check-ins, each with its own queued job."""

    if job.stage not in (RestorationJob.STAGE_QUEUED, RestorationJob.STAGE_SENT):
        raise ValueError('Only queued or sent restoration jobs can be split.')

    if not groups:
        raise ValueError('Provide at least one split group.')

    from apps.inventory.processing_ops import _sync_item_check_in_quantity

    check_in = ItemCheckIn.objects.select_for_update().get(pk=job.item_check_in_id)
    movable = _movable_items_for_check_in(check_in)
    movable_ids = {it.pk for it in movable}

    flat_selected: list[int] = []
    for group in groups:
        for item_id in group:
            if item_id in flat_selected:
                raise ValueError('Each item can only appear in one split group.')
            flat_selected.append(item_id)
            if item_id not in movable_ids:
                raise ValueError(f'Item {item_id} is not in this restoration batch.')

    if not flat_selected:
        raise ValueError('Select at least one item to split off.')

    created_jobs: list[RestorationJob] = []
    for item_ids in groups:
        if not item_ids:
            continue
        new_check_in = _clone_check_in_from(check_in, user)
        Item.objects.filter(pk__in=item_ids).update(check_in=new_check_in)
        _sync_item_check_in_quantity(new_check_in)
        created_jobs.append(
            RestorationJob.objects.create(
                item_check_in=new_check_in,
                product=job.product,
                purchase_order=job.purchase_order,
                quantity=new_check_in.quantity,
                stage=RestorationJob.STAGE_QUEUED,
                scale=job.scale,
                grade_values=dict(job.grade_values or {}),
                created_by=user,
            ),
        )

    _sync_item_check_in_quantity(check_in)
    remaining = check_in.items.count()
    source_job: RestorationJob | None
    if remaining == 0:
        job.delete()
        check_in.delete()
        source_job = None
    else:
        job.quantity = remaining
        job.save(update_fields=['quantity', 'updated_at'])
        source_job = job

    return {'source_job': source_job, 'created_jobs': created_jobs}


@transaction.atomic
def split_restoration_job_into_individuals(job: RestorationJob, *, user) -> list[RestorationJob]:
    """Ensure each queued/sent restoration job tracks a single physical item."""

    if job.quantity <= 1:
        return [job]
    if job.stage not in (RestorationJob.STAGE_QUEUED, RestorationJob.STAGE_SENT):
        return [job]

    check_in = ItemCheckIn.objects.select_for_update().get(pk=job.item_check_in_id)
    movable = _movable_items_for_check_in(check_in)
    if len(movable) <= 1:
        if job.quantity != len(movable):
            job.quantity = max(len(movable), 1)
            job.save(update_fields=['quantity', 'updated_at'])
        return [job]

    result = split_restoration_job(
        job,
        groups=[[item.pk] for item in movable],
        user=user,
    )
    return result['created_jobs']


@transaction.atomic
def normalize_multitem_restoration_jobs(user=None) -> int:
    """Split legacy multi-item queue jobs into one job per item."""

    normalized = 0
    while True:
        job = (
            RestorationJob.objects.filter(
                quantity__gt=1,
                stage__in=(RestorationJob.STAGE_QUEUED, RestorationJob.STAGE_SENT),
            )
            .order_by('id')
            .first()
        )
        if job is None:
            break
        before = job.quantity
        split_restoration_job_into_individuals(job, user=user)
        normalized += max(before - 1, 1)
    return normalized


@transaction.atomic
def combine_restoration_jobs(
    *,
    job_ids: list[int],
    replace_values: bool,
) -> RestorationJob:
    """Combine queued stacks into the first selected job."""

    if len(job_ids) < 2:
        raise ValueError('Select at least two stacks to combine.')

    from apps.inventory.processing_ops import _sync_item_check_in_quantity

    jobs_by_id = {
        job.pk: job
        for job in RestorationJob.objects.select_for_update()
        .select_related('item_check_in', 'product', 'purchase_order')
        .filter(pk__in=job_ids)
    }
    if len(jobs_by_id) != len(set(job_ids)):
        raise ValueError('One or more selected stacks no longer exists.')

    ordered_jobs = [jobs_by_id[int(job_id)] for job_id in job_ids]
    target = ordered_jobs[0]
    if any(job.stage != RestorationJob.STAGE_QUEUED for job in ordered_jobs):
        raise ValueError('Only queued restoration stacks can be combined.')
    if any(job.purchase_order_id != target.purchase_order_id for job in ordered_jobs):
        raise ValueError('Only stacks from the same order can be combined.')
    if any(job.product_id != target.product_id for job in ordered_jobs):
        raise ValueError('Only stacks for the same product can be combined.')

    target_check_in = ItemCheckIn.objects.select_for_update().get(pk=target.item_check_in_id)
    source_jobs = ordered_jobs[1:]
    retail_keys = {_decimal_compare_key(job_display_retail(job)) for job in ordered_jobs}
    price_keys = {_decimal_compare_key(job_display_price(job)) for job in ordered_jobs}
    if (len(retail_keys) > 1 or len(price_keys) > 1) and not replace_values:
        raise ValueError('Selected stacks have different retail or price. Confirm which values should carry forward.')

    merge_source = next((job for job in ordered_jobs if _job_has_complete_combine_data(job)), target)
    merge_retail = job_display_retail(merge_source)
    merge_price = job_display_price(merge_source)

    for source_job in source_jobs:
        source_check_in = ItemCheckIn.objects.select_for_update().get(pk=source_job.item_check_in_id)
        Item.objects.filter(check_in=source_check_in).update(check_in=target_check_in)
        source_job.delete()
        source_check_in.delete()

    _sync_item_check_in_quantity(target_check_in)
    snapshot = dict(target_check_in.defaults_snapshot or {})
    if merge_retail is not None:
        snapshot['retail'] = str(merge_retail)
    if merge_price is not None:
        snapshot['price'] = str(merge_price)
    if merge_source.scale:
        snapshot['restoration_scale'] = merge_source.scale
    snapshot['restoration_grade_values'] = normalize_grade_values(merge_source.grade_values)
    target_check_in.defaults_snapshot = snapshot
    target_check_in.save(update_fields=['defaults_snapshot', 'updated_at'])

    target.quantity = target_check_in.quantity
    target.scale = merge_source.scale
    target.grade_values = normalize_grade_values(merge_source.grade_values)
    target.save(update_fields=['quantity', 'scale', 'grade_values', 'updated_at'])
    return target


def _partial_return_restoration_items(
    job: RestorationJob,
    items: list[Item],
    *,
    disposition_type: str,
    reason: str,
    scale: str,
    grade: str,
    notes: str,
    user,
) -> RestorationJob:
    from apps.inventory.processing_ops import _sync_item_check_in_quantity

    check_in = ItemCheckIn.objects.select_for_update().get(pk=job.item_check_in_id)
    returned_check_in = _clone_check_in_from(check_in, user)
    item_pks = [it.pk for it in items]
    Item.objects.filter(pk__in=item_pks).update(check_in=returned_check_in)
    _sync_item_check_in_quantity(returned_check_in)
    _sync_item_check_in_quantity(check_in)

    _apply_return_snapshot_to_check_in(
        returned_check_in,
        disposition_type=disposition_type,
        reason=reason,
        scale=scale,
        grade=grade,
        notes=notes,
    )
    returned_items = list(returned_check_in.items.select_for_update().order_by('id'))
    _move_items_to_processing(returned_items, user=user)

    returned_job = RestorationJob.objects.create(
        item_check_in=returned_check_in,
        product=job.product,
        purchase_order=job.purchase_order,
        quantity=returned_check_in.quantity,
        stage=RestorationJob.STAGE_RETURNED,
        scale=job.scale,
        grade_values=dict(job.grade_values or {}),
        return_disposition_type=disposition_type,
        return_reason=reason,
        return_scale=scale,
        return_grade=grade,
        return_notes=notes,
        returned_at=timezone.now(),
        returned_by=user,
        created_by=user,
    )

    job.quantity = check_in.quantity
    job.save(update_fields=['quantity', 'updated_at'])
    return returned_job


@transaction.atomic
def return_restoration_job_to_processing(
    job: RestorationJob,
    *,
    disposition_type: str,
    reason: str = '',
    scale: str = '',
    grade: str = '',
    notes: str = '',
    item_ids: list[int] | None = None,
    user,
) -> RestorationJob:
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if job.stage not in (RestorationJob.STAGE_QUEUED, RestorationJob.STAGE_SENT):
        raise ValueError('Only queued or bench-ready restoration jobs can be returned to Processing.')

    disposition_type = (disposition_type or '').strip()
    reason = (reason or '').strip()
    scale = (scale or '').strip()
    grade = (grade or '').strip()
    notes = (notes or '').strip()

    if disposition_type == RESTORATION_RETURN_OUTCOME_UNTOUCHED:
        if reason not in RESTORATION_UNTOUCHED_REASONS:
            raise ValueError('Choose why the item is being returned untouched.')
        scale = ''
        grade = ''
    elif disposition_type == RESTORATION_RETURN_OUTCOME_TARS_COMPLETED:
        if not is_known_active_scale(scale):
            raise ValueError('Choose the achieved grade scale.')
        if grade not in grades_for_scale(scale):
            raise ValueError('Choose the achieved grade.')
        reason = ''
    else:
        raise ValueError('Choose a restoration return disposition.')

    check_in = ItemCheckIn.objects.select_for_update().get(pk=job.item_check_in_id)
    movable = _movable_items_for_check_in(check_in)

    if item_ids:
        item_ids_set = set(int(i) for i in item_ids)
        to_return = [it for it in movable if it.pk in item_ids_set]
        if len(to_return) != len(item_ids_set):
            raise ValueError('Some selected items are not in this restoration batch.')
        if not to_return:
            raise ValueError('Select at least one item to return.')
        if len(to_return) < len(movable):
            _partial_return_restoration_items(
                job,
                to_return,
                disposition_type=disposition_type,
                reason=reason,
                scale=scale,
                grade=grade,
                notes=notes,
                user=user,
            )
            job.refresh_from_db()
            return job

    from apps.inventory.models import ItemHistory
    from apps.inventory.processing_ops import _sync_item_check_in_quantity

    _apply_return_snapshot_to_check_in(
        check_in,
        disposition_type=disposition_type,
        reason=reason,
        scale=scale,
        grade=grade,
        notes=notes,
    )

    histories: list[ItemHistory] = []
    for item in check_in.items.select_for_update().all():
        if item.status == 'sold' or item.sold_at:
            continue
        old_location = item.location or ''
        if old_location == 'processing':
            continue
        item.location = 'processing'
        item.save(update_fields=['location', 'updated_at'])
        histories.append(
            ItemHistory(
                item=item,
                event_type='location_change',
                old_value=old_location,
                new_value='processing',
                note='Returned to Processing from restoration queue',
                created_by=user,
            ),
        )

    if histories:
        ItemHistory.objects.bulk_create(histories)
    _sync_item_check_in_quantity(check_in)

    job.stage = RestorationJob.STAGE_RETURNED
    job.return_disposition_type = disposition_type
    job.return_reason = reason
    job.return_scale = scale
    job.return_grade = grade
    job.return_notes = notes
    job.returned_at = timezone.now()
    job.returned_by = user
    job.save(update_fields=[
        'stage',
        'return_disposition_type',
        'return_reason',
        'return_scale',
        'return_grade',
        'return_notes',
        'returned_at',
        'returned_by',
        'updated_at',
    ])
    return job


def first_item_for_check_in(check_in: ItemCheckIn) -> Item | None:
    return check_in.items.order_by('id').first()


def job_display_retail(job: RestorationJob) -> Decimal | None:
    snap = job.item_check_in.defaults_snapshot if job.item_check_in_id else {}
    raw = (snap or {}).get('retail')
    if raw not in (None, ''):
        try:
            return Decimal(str(raw))
        except Exception:
            pass
    item = first_item_for_check_in(job.item_check_in) if job.item_check_in_id else None
    return item.retail if item else None


def job_display_price(job: RestorationJob) -> Decimal | None:
    snap = job.item_check_in.defaults_snapshot if job.item_check_in_id else {}
    raw = (snap or {}).get('price')
    if raw not in (None, ''):
        try:
            return Decimal(str(raw))
        except Exception:
            pass
    item = first_item_for_check_in(job.item_check_in) if job.item_check_in_id else None
    return item.price if item else None


def _decimal_compare_key(value: Decimal | None) -> str:
    if value is None:
        return ''
    return str(value.quantize(Decimal('0.01')))


def _job_has_complete_combine_data(job: RestorationJob) -> bool:
    return (
        job_display_retail(job) is not None
        and job_display_price(job) is not None
        and grade_values_complete(job.scale, job.grade_values or {})
    )
