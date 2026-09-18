"""Department directory helpers: counts, summary, and JSON cleanup."""
from datetime import timedelta

from django.utils import timezone

from apps.hr.models import Department, ShiftAssignment


PROGRAM_DEPARTMENT_KEY = 'retail_qa.program_department'
SOFT_FIELDS = frozenset({'description', 'location', 'manager'})
HARD_FIELDS = frozenset({'name', 'slug', 'icon', 'sort_order', 'is_active'})


def parse_department_ids(routine) -> set[int]:
    ids = set()
    fk = getattr(routine, 'assigned_department_id', None)
    if fk:
        ids.add(int(fk))
    for value in getattr(routine, 'assigned_department_ids', None) or []:
        try:
            ids.add(int(value))
        except (TypeError, ValueError):
            continue
    return ids


def routines_for_department(dept_id: int):
    from apps.routines.models import Routine

    hits = []
    for row in Routine.objects.all().only(
        'id', 'title', 'audience_type', 'system_key',
        'assigned_department_id', 'assigned_department_ids',
    ):
        if dept_id in parse_department_ids(row):
            hits.append(row)
    return hits


def strip_department_from_routines(dept_id: int) -> None:
    from apps.routines.models import Routine

    for row in Routine.objects.all():
        raw = list(row.assigned_department_ids or [])
        cleaned = []
        changed = False
        for value in raw:
            try:
                number = int(value)
            except (TypeError, ValueError):
                cleaned.append(value)
                continue
            if number == dept_id:
                changed = True
                continue
            cleaned.append(number)
        clear_fk = row.assigned_department_id == dept_id
        if not changed and not clear_fk:
            continue
        row.assigned_department_ids = cleaned
        fields = ['assigned_department_ids']
        if clear_fk:
            row.assigned_department_id = None
            fields.append('assigned_department')
        row.save(update_fields=fields)


def department_dependencies(dept: Department) -> dict[str, int]:
    from apps.documents.models import DocumentAssignment
    from apps.routines.models import Section

    return {
        'shifts': dept.shifts.count(),
        'assignments': ShiftAssignment.objects.filter(shift__department=dept).count(),
        'sections': Section.objects.filter(department=dept).count(),
        'routines': len(routines_for_department(dept.pk)),
        'documents': DocumentAssignment.objects.filter(assigned_department=dept).count(),
    }


def sync_program_department_slug(old_slug: str, new_slug: str) -> None:
    if not old_slug or old_slug == new_slug:
        return
    from apps.core.models import AppSetting

    row = AppSetting.objects.filter(key=PROGRAM_DEPARTMENT_KEY).first()
    if row is None:
        return
    if row.value == old_slug:
        row.value = new_slug
        row.save(update_fields=['value'])


def _iso_week_days():
    today = timezone.localdate()
    monday = today - timedelta(days=today.weekday())
    return [monday + timedelta(days=offset) for offset in range(7)]


def _person_row(user) -> dict:
    return {
        'id': user.id,
        'full_name': user.full_name,
        'role': user.role,
        'is_active': user.is_active,
    }


def build_department_summary(dept: Department) -> dict:
    from apps.routines.models import Section

    week_days = _iso_week_days()
    deps = department_dependencies(dept)
    home_profiles = list(dept.employees.select_related('user').all())
    home_staff = [_person_row(profile.user) for profile in home_profiles]
    home_ids = {profile.user_id for profile in home_profiles}

    shifts = []
    for shift in dept.shifts.all().prefetch_related('assignments__employee'):
        assigned = list(shift.assignments.select_related('employee').all())
        shifts.append({
            'id': shift.id,
            'name': shift.name,
            'time_in': shift.time_in.strftime('%H:%M:%S'),
            'time_out': shift.time_out.strftime('%H:%M:%S'),
            'weekdays': shift.weekday_list(),
            'assigned_count': len(assigned),
            'assignments': [
                {
                    'id': row.id,
                    'employee': row.employee_id,
                    'employee_name': row.employee.full_name,
                    'weekdays': row.weekday_list(),
                }
                for row in assigned
            ],
        })

    also_scheduled_here = []
    seen_also = set()
    for row in ShiftAssignment.objects.filter(shift__department=dept).select_related(
        'employee', 'employee__employee', 'shift',
    ):
        home = getattr(row.employee, 'employee', None)
        home_id = getattr(home, 'department_id', None)
        if home_id == dept.id:
            continue
        key = (row.employee_id, row.shift_id)
        if key in seen_also:
            continue
        seen_also.add(key)
        also_scheduled_here.append({
            'id': row.employee_id,
            'full_name': row.employee.full_name,
            'shift_name': row.shift.name,
        })

    home_scheduled_elsewhere = []
    seen_else = set()
    for row in ShiftAssignment.objects.filter(
        employee_id__in=home_ids,
    ).exclude(shift__department=dept).select_related('employee', 'shift', 'shift__department'):
        if not any(row.runs_on(day) for day in week_days):
            continue
        key = (row.employee_id, row.shift_id)
        if key in seen_else:
            continue
        seen_else.add(key)
        home_scheduled_elsewhere.append({
            'id': row.employee_id,
            'full_name': row.employee.full_name,
            'shift_name': row.shift.name,
            'department_name': row.shift.department.name,
        })

    live_sections = list(
        Section.objects.filter(department=dept, is_active=True).select_related('owner'),
    )
    payload = {
        'id': dept.id,
        'name': dept.name,
        'slug': dept.slug,
        'icon': dept.icon,
        'sort_order': dept.sort_order,
        'description': dept.description,
        'location': dept.location_id,
        'location_name': dept.location.name if dept.location_id else None,
        'manager': dept.manager_id,
        'manager_name': dept.manager.full_name if dept.manager_id else None,
        'is_active': dept.is_active,
        'home_staff': home_staff,
        'shifts': shifts,
        'also_scheduled_here': also_scheduled_here,
        'home_scheduled_elsewhere': home_scheduled_elsewhere,
        'routines': [
            {
                'id': row.id,
                'title': row.title,
                'audience_type': row.audience_type,
                'system_key': row.system_key,
            }
            for row in routines_for_department(dept.pk)
        ],
        'document_count': deps['documents'],
        'dependencies': deps,
    }

    if live_sections:
        owned: dict[int, dict] = {}
        for section in live_sections:
            if section.owner_id is None:
                continue
            seen = owned.get(section.owner_id)
            if seen:
                seen['count'] += 1
            else:
                owned[section.owner_id] = {
                    'name': section.owner.full_name if section.owner_id else 'Someone',
                    'count': 1,
                }
        idle = [
            _person_row(profile.user)
            for profile in home_profiles
            if profile.user_id not in owned
        ]
        payload['sections'] = {
            'items': [
                {
                    'id': section.id,
                    'name': section.name,
                    'owner': section.owner_id,
                    'owner_name': section.owner.full_name if section.owner_id else None,
                }
                for section in live_sections
            ],
            'orphans': [
                {'id': section.id, 'name': section.name}
                for section in live_sections
                if section.owner_id is None
            ],
            'idle': idle,
            'doubled': [
                {'owner': row['name'], 'count': row['count']}
                for row in owned.values()
                if row['count'] > 1
            ],
        }

    return payload
