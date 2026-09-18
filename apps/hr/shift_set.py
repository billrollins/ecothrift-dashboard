"""Canonical seven-shift set. Match by punch_code; never rewrite an existing name.

Editing names in Admin Shifts is kept on a rerun. Times, weekdays, department,
is_active, and the Open/Day/Close locks are reset to this file.
"""
from __future__ import annotations

import logging
from datetime import time

logger = logging.getLogger(__name__)

TUE_SAT = [1, 2, 3, 4, 5]
MON = [0]
MON_FRI = [0, 1, 2, 3, 4]

DEPTS = {
    'retail-operations': {'name': 'Retail', 'icon': 'cart', 'sort_order': 0},
    'processing': {'name': 'Processing', 'icon': 'box', 'sort_order': 1},
    'restoration': {'name': 'Restoration', 'icon': 'tool', 'sort_order': 2},
    'office': {'name': 'Management', 'icon': 'home', 'sort_order': 3},
}

SHIFT_SPECS = (
    {
        'punch_code': 'retail_open',
        'name': 'Cashier - Open',
        'dept_slug': 'retail-operations',
        'weekdays': TUE_SAT,
        'time_in': time(8, 30),
        'time_out': time(14, 30),
        'is_active': True,
        'lock_key': 'retail.open',
    },
    {
        'punch_code': 'retail_day',
        'name': 'Cashier - Day',
        'dept_slug': 'retail-operations',
        'weekdays': TUE_SAT,
        'time_in': time(11, 0),
        'time_out': time(19, 0),
        'is_active': False,
        'lock_key': 'retail.day',
    },
    {
        'punch_code': 'retail_close',
        'name': 'Cashier - Close',
        'dept_slug': 'retail-operations',
        'weekdays': TUE_SAT,
        'time_in': time(12, 30),
        'time_out': time(18, 30),
        'is_active': True,
        'lock_key': 'retail.close',
    },
    {
        'punch_code': 'retail_reset',
        'name': 'Retail - Reset',
        'dept_slug': 'retail-operations',
        'weekdays': MON,
        'time_in': time(9, 0),
        'time_out': time(17, 0),
        'is_active': True,
        'lock_key': None,
    },
    {
        'punch_code': 'processing',
        'name': 'Processing - Day',
        'dept_slug': 'processing',
        'weekdays': MON_FRI,
        'time_in': time(9, 0),
        'time_out': time(17, 0),
        'is_active': True,
        'lock_key': None,
    },
    {
        'punch_code': 'restoration',
        'name': 'Restoration - Day',
        'dept_slug': 'restoration',
        'weekdays': MON_FRI,
        'time_in': time(9, 0),
        'time_out': time(17, 0),
        'is_active': True,
        'lock_key': None,
    },
    {
        'punch_code': 'office',
        'name': 'Office - Day',
        'dept_slug': 'office',
        'weekdays': MON_FRI,
        'time_in': time(9, 0),
        'time_out': time(17, 0),
        'is_active': True,
        'lock_key': None,
    },
)

SEEDED_CODES = {spec['punch_code'] for spec in SHIFT_SPECS}


def apply_shift_set(*, apps=None, stdout=None) -> list[str]:
    """Upsert the seven shifts, drop unused rows with no punches or assignments."""
    if apps is None:
        from apps.hr.models import Department, Shift, ShiftAssignment, TimeEntry
        from apps.routines.models import Routine
    else:
        Department = apps.get_model('hr', 'Department')
        Shift = apps.get_model('hr', 'Shift')
        ShiftAssignment = apps.get_model('hr', 'ShiftAssignment')
        TimeEntry = apps.get_model('hr', 'TimeEntry')
        Routine = apps.get_model('routines', 'Routine')

    log: list[str] = []
    depts = {slug: _department(Department, slug, spec, log) for slug, spec in DEPTS.items()}
    keepers: dict[str, object] = {}

    for spec in SHIFT_SPECS:
        code = spec['punch_code']
        dept = depts[spec['dept_slug']]
        rows = list(Shift.objects.filter(punch_code=code).order_by('id'))
        if not rows:
            row = Shift.objects.create(
                name=spec['name'],
                department=dept,
                punch_code=code,
                weekdays=list(spec['weekdays']),
                time_in=spec['time_in'],
                time_out=spec['time_out'],
                is_active=spec['is_active'],
            )
            log.append(f'created {spec["name"]} punch={code} id={row.pk}')
        else:
            row = rows[0]
            row.department = dept
            row.weekdays = list(spec['weekdays'])
            row.time_in = spec['time_in']
            row.time_out = spec['time_out']
            row.is_active = spec['is_active']
            row.save(update_fields=['department', 'weekdays', 'time_in', 'time_out', 'is_active'])
            log.append(f'updated {code} id={row.pk} kept name={row.name}')
            for extra in rows[1:]:
                _merge_or_drop_extra(extra, row, ShiftAssignment, log)
        keepers[code] = row

    for spec in SHIFT_SPECS:
        key = spec['lock_key']
        if not key:
            continue
        shift = keepers[spec['punch_code']]
        for routine in Routine.objects.filter(system_key=key):
            routine.shift_id = shift.pk
            if hasattr(routine, 'shift_locked'):
                routine.shift_locked = True
                routine.save(update_fields=['shift', 'shift_locked'])
            else:
                routine.save(update_fields=['shift'])
            log.append(f'locked {key} → {shift.pk}')

    for leftover in Shift.objects.exclude(punch_code__in=SEEDED_CODES):
        code = leftover.punch_code or ''
        has_punch = bool(code) and TimeEntry.objects.filter(shift=code).exists()
        has_assignment = leftover.assignments.exists()
        if has_punch or has_assignment:
            log.append(f'kept leftover {leftover.name} punch={code} id={leftover.pk}')
            continue
        leftover.delete()
        log.append(f'deleted leftover {leftover.name} punch={code}')

    text = '; '.join(log) or 'no shift changes'
    logger.info('shift set: %s', text)
    if stdout:
        stdout.write(text)
    return log


def _department(Department, slug: str, spec: dict, log: list[str]):
    row = Department.objects.filter(slug=slug).first()
    if row is not None:
        return row
    row = Department.objects.filter(name=spec['name']).first()
    if row is not None:
        return row
    kwargs = {'name': spec['name'], 'slug': slug}
    fields = {field.name for field in Department._meta.fields}
    if 'icon' in fields:
        kwargs['icon'] = spec['icon']
    if 'sort_order' in fields:
        kwargs['sort_order'] = spec['sort_order']
    row = Department.objects.create(**kwargs)
    log.append(f'created department {spec["name"]} slug={slug}')
    return row


def _merge_or_drop_extra(extra, keeper, ShiftAssignment, log: list[str]) -> None:
    """Collapse a duplicate punch_code onto the keeper. Never touch TimeEntry."""
    taken = set(
        ShiftAssignment.objects.filter(shift=keeper).values_list('employee_id', flat=True)
    )
    for assignment in list(ShiftAssignment.objects.filter(shift=extra)):
        if assignment.employee_id in taken:
            assignment.delete()
        else:
            assignment.shift = keeper
            assignment.save(update_fields=['shift'])
            taken.add(assignment.employee_id)
    extra.delete()
    log.append(f'merged duplicate punch={keeper.punch_code} extra={extra.pk} into {keeper.pk}')
