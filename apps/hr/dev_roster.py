"""Dev source of truth for who is on which local shift.

Replacing a mapped user's ShiftAssignment rows is intentional. Editing shifts
in the Admin Shifts UI locally is undone on the next pull unless this file is
edited too. Only mapped emails are touched; users not in the mapping keep
whatever assignments they have.
"""
from __future__ import annotations

import logging
from datetime import date

from django.contrib.auth import get_user_model

from apps.accounts.models import EmployeeProfile
from apps.hr.models import Department, Shift, ShiftAssignment
from apps.routines.models import Section

logger = logging.getLogger(__name__)
User = get_user_model()

TUE_SAT = [1, 2, 3, 4, 5]
MON = [0]
THU = [3]

DEV_ROSTER = {
    'bill_rollins@ecothrift.us': {
        'dept_slug': 'office',
        'shifts': [{'punch_code': 'office'}],
        'section': None,
    },
    'carrie_rollins.rf@outlook.com': {
        'dept_slug': 'retail-operations',
        'manages_department': True,
        'shifts': [
            {'punch_code': 'retail_open'},
            {'punch_code': 'retail_close', 'weekdays': THU},
            {'punch_code': 'retail_reset'},
        ],
        'section': 'Carrie',
    },
    'davidkilduff@outlook.com': {
        'dept_slug': 'retail-operations',
        'shifts': [
            {'punch_code': 'retail_close'},
            {'punch_code': 'retail_reset'},
        ],
        'section': 'David',
    },
    'kilduff.ashleym@outlook.com': {
        'dept_slug': 'processing',
        'manages_department': True,
        'shifts': [
            {'punch_code': 'processing'},
            {'punch_code': 'retail_reset'},
        ],
        'section': 'Ashley',
    },
    'm.tere.leondekilduff@gmail.com': {
        'dept_slug': 'processing',
        'shifts': [
            {'punch_code': 'processing'},
            {'punch_code': 'retail_reset'},
        ],
        'section': 'Tere',
    },
    'zatoichi82frieze@gmail.com': {
        'dept_slug': 'restoration',
        'manages_department': True,
        'shifts': [
            {'punch_code': 'restoration'},
            {'punch_code': 'retail_reset'},
        ],
        'section': 'Michael',
    },
}


def apply_dev_roster(*, warn=None) -> dict:
    """Replace assignments for mapped emails only. Missing users are skipped."""
    stats = {'skipped': [], 'applied': []}
    for email, spec in DEV_ROSTER.items():
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            message = f'seed_dev_roster: no user for {email}'
            logger.warning(message)
            if warn:
                warn(message)
            stats['skipped'].append(email)
            continue
        _apply_one(user, spec)
        stats['applied'].append(email)
    return stats


def _apply_one(user, spec: dict) -> None:
    dept = Department.objects.filter(slug=spec['dept_slug']).first()
    if dept is not None:
        profile = EmployeeProfile.objects.filter(user=user).first()
        if profile is None:
            profile = EmployeeProfile.objects.create(
                user=user,
                employee_number=EmployeeProfile.generate_employee_number(),
                hire_date=date(2020, 1, 1),
                department=dept,
            )
        elif profile.department_id != dept.pk:
            profile.department = dept
            profile.save(update_fields=['department'])
        if spec.get('manages_department') and dept.manager_id != user.pk:
            dept.manager = user
            dept.save(update_fields=['manager'])

    wanted = []
    for row in spec['shifts']:
        shift = Shift.objects.filter(punch_code=row['punch_code']).first()
        if shift is None:
            message = f'seed_dev_roster: no shift {row["punch_code"]} for {user.email}'
            logger.warning(message)
            continue
        weekdays = list(row.get('weekdays') or shift.weekday_list())
        wanted.append((shift, weekdays))

    ShiftAssignment.objects.filter(employee=user).delete()
    for shift, weekdays in wanted:
        ShiftAssignment.objects.create(employee=user, shift=shift, weekdays=weekdays)

    section_name = spec.get('section')
    if not section_name or dept is None:
        return
    section = Section.objects.filter(department=dept, name=section_name).first()
    if section is None or section.owner_id:
        return
    section.owner = user
    section.save(update_fields=['owner', 'updated_at'])
