"""Idempotent Retail Open/Mid/Close rows and locked routine links."""
from __future__ import annotations

import logging
from datetime import time

from apps.hr.shifts import SHIFT_RETAIL_CLOSE, SHIFT_RETAIL_DAY, SHIFT_RETAIL_OPEN

logger = logging.getLogger(__name__)

RENAME = {
    'Retail - Open': 'Retail Open',
    'Retail Opening': 'Retail Open',
    'Retail - Opening': 'Retail Open',
    'Cashier - Open': 'Retail Open',
    'Retail - Day': 'Retail Mid',
    'Retail Day': 'Retail Mid',
    'Cashier - Day': 'Retail Mid',
    'Retail - Close': 'Retail Close',
    'Retail Closing': 'Retail Close',
    'Retail - Closing': 'Retail Close',
    'Cashier - Close': 'Retail Close',
}

TEMPLATES = (
    ('Retail Open', SHIFT_RETAIL_OPEN),
    ('Retail Mid', SHIFT_RETAIL_DAY),
    ('Retail Close', SHIFT_RETAIL_CLOSE),
)

ROUTINE_KEYS = {
    'retail.open': 'Retail Open',
    'retail.day': 'Retail Mid',
    'retail.close': 'Retail Close',
}


def _retail_department(Department):
    fields = {f.name for f in Department._meta.fields}
    slug = 'retail-operations'
    if 'slug' in fields:
        try:
            from apps.routines.settings import retail_qa_settings
            slug = retail_qa_settings().get('program_department') or slug
        except Exception:
            pass
        row = Department.objects.filter(slug=slug).first()
        if row is not None:
            return row
    row = (
        Department.objects.filter(name__iexact='Retail').first()
        or Department.objects.filter(name__iexact='Retail Operations').first()
        or Department.objects.filter(name__icontains='retail').first()
    )
    if row is not None:
        return row
    kwargs = {'name': 'Retail'}
    if 'slug' in fields:
        kwargs['slug'] = slug
    if 'icon' in fields:
        kwargs['icon'] = 'cart'
    if 'sort_order' in fields:
        kwargs['sort_order'] = 0
    return Department.objects.create(**kwargs)


def _hours():
    # Must stay aligned with apps.hr.shift_set so a later call cannot revert 0012.
    open_t, mid, day_end, close_t = time(8, 30), time(11, 0), time(14, 30), time(18, 30)
    return open_t, mid, day_end, close_t, [1, 2, 3, 4, 5]


def seed_cashier_shifts(*, apps=None, stdout=None) -> list[str]:
    """Create or rename the three Retail Open/Mid/Close shifts and lock retail routines to them."""
    if apps is None:
        from apps.hr.models import Department, Shift
        from apps.routines.models import Routine
    else:
        Department = apps.get_model('hr', 'Department')
        Shift = apps.get_model('hr', 'Shift')
        Routine = apps.get_model('routines', 'Routine')

    log: list[str] = []
    dept = _retail_department(Department)
    _open_t, _mid, _day_end, _close_t, weekdays = _hours()
    times = {
        'Retail Open': (time(8, 30), time(14, 30)),
        'Retail Mid': (time(11, 0), time(19, 0)),
        'Retail Close': (time(12, 30), time(18, 30)),
    }
    active = {
        'Retail Open': True,
        'Retail Mid': False,
        'Retail Close': True,
    }

    for old, new in RENAME.items():
        row = Shift.objects.filter(department_id=dept.pk, name=old).first()
        if row is None:
            continue
        clash = Shift.objects.filter(department_id=dept.pk, name=new).exclude(pk=row.pk).first()
        if clash:
            log.append(f'merge {old} into existing {new} id={clash.pk}')
            row.delete()
            continue
        row.name = new
        row.save(update_fields=['name'])
        log.append(f'renamed {old} → {new} id={row.pk}')

    created = {}
    for name, punch in TEMPLATES:
        time_in, time_out = times[name]
        row = Shift.objects.filter(department_id=dept.pk, name=name).first()
        if row is None:
            row = Shift.objects.create(
                department_id=dept.pk,
                name=name,
                time_in=time_in,
                time_out=time_out,
                weekdays=weekdays,
                punch_code=punch,
                is_active=active[name],
            )
            log.append(f'created {name} punch={punch} id={row.pk}')
        else:
            updates = []
            if not row.punch_code:
                row.punch_code = punch
                updates.append('punch_code')
            if updates:
                row.save(update_fields=updates)
                log.append(f'updated {name} {",".join(updates)}')
            else:
                log.append(f'kept {name} id={row.pk}')
        created[name] = row

    for key, name in ROUTINE_KEYS.items():
        shift = created.get(name)
        if shift is None:
            continue
        qs = Routine.objects.filter(system_key=key)
        for routine in qs:
            routine.shift_id = shift.pk
            if hasattr(routine, 'shift_locked'):
                routine.shift_locked = True
                routine.save(update_fields=['shift', 'shift_locked'])
            else:
                routine.save(update_fields=['shift'])
            log.append(f'locked {key} → {name}')

    text = '; '.join(log) or 'no shift changes'
    logger.info('cashier shift seed: %s', text)
    if stdout:
        stdout.write(text)
    return log
