"""What a person is doing on this punch.

Standing job title lives on EmployeeProfile. This is today's room: the
clock-in tiles grouped by department. Later a schedule will use the same codes.
"""

SHIFT_RETAIL_OPEN = 'retail_open'
SHIFT_RETAIL_DAY = 'retail_day'
SHIFT_RETAIL_CLOSE = 'retail_close'
SHIFT_RETAIL_CS = 'retail_cs'
SHIFT_PROCESSING = 'processing'
SHIFT_RESTORATION = 'restoration'
SHIFT_OFFICE = 'office'

DEPT_RETAIL = 'retail'
DEPT_WAREHOUSE = 'warehouse'
DEPT_OFFICE = 'office'

SHIFT_DEPARTMENTS = [
    {
        'key': DEPT_RETAIL,
        'en': 'Retail',
        'es': 'Tienda',
        'shifts': [
            SHIFT_RETAIL_OPEN,
            SHIFT_RETAIL_DAY,
            SHIFT_RETAIL_CLOSE,
            SHIFT_RETAIL_CS,
        ],
    },
    {
        'key': DEPT_WAREHOUSE,
        'en': 'Warehouse',
        'es': 'Bodega',
        'shifts': [SHIFT_PROCESSING, SHIFT_RESTORATION],
    },
    {
        'key': DEPT_OFFICE,
        'en': 'Office',
        'es': 'Oficina',
        'shifts': [SHIFT_OFFICE],
    },
]

# Historical labels only. Live names come from hr.Shift by punch_code.
SHIFT_LABELS = {
    SHIFT_RETAIL_OPEN: {
        'department': DEPT_RETAIL,
        'en': 'Cashier - Open',
        'es': 'Caja - Apertura',
    },
    SHIFT_RETAIL_DAY: {
        'department': DEPT_RETAIL,
        'en': 'Cashier - Day',
        'es': 'Caja - Dia',
    },
    SHIFT_RETAIL_CLOSE: {
        'department': DEPT_RETAIL,
        'en': 'Cashier - Close',
        'es': 'Caja - Cierre',
    },
    SHIFT_RETAIL_CS: {
        'department': DEPT_RETAIL,
        'en': 'Customer Service',
        'es': 'Atencion al cliente',
    },
    SHIFT_PROCESSING: {
        'department': DEPT_WAREHOUSE,
        'en': 'Processing',
        'es': 'Procesamiento',
    },
    SHIFT_RESTORATION: {
        'department': DEPT_WAREHOUSE,
        'en': 'Restoration',
        'es': 'Restauracion',
    },
    SHIFT_OFFICE: {
        'department': DEPT_OFFICE,
        'en': 'Management',
        'es': 'Gerencia',
    },
}


def _department_row(key: str | None) -> dict | None:
    if not key:
        return None
    for dept in SHIFT_DEPARTMENTS:
        if dept['key'] == key:
            return dept
    return None


SHIFT_CHOICES = [
    (code, SHIFT_LABELS[code]['en'])
    for dept in SHIFT_DEPARTMENTS
    for code in dept['shifts']
]

SHIFT_ORDER = [code for code, _label in SHIFT_CHOICES]

# Clock-in shift -> program routine that starts the day.
SHIFT_TO_SYSTEM_KEY = {
    SHIFT_RETAIL_OPEN: 'retail.open',
    SHIFT_RETAIL_DAY: 'retail.day',
    SHIFT_RETAIL_CLOSE: 'retail.close',
}

# The three shift checklists. Glance Due today never lists the other two.
SHIFT_CHECKLIST_KEYS = frozenset(SHIFT_TO_SYSTEM_KEY.values())


def _lang(language: str) -> str:
    return 'es' if language == 'es' else 'en'


def _shift_for_code(code: str, *, active_only: bool = False):
    if not code:
        return None
    from apps.hr.models import Shift
    qs = Shift.objects.filter(punch_code=code).select_related('department')
    if active_only:
        qs = qs.filter(is_active=True)
    return qs.order_by('-is_active', 'id').first()


def active_punch_codes() -> set[str]:
    from apps.hr.models import Shift
    return set(
        Shift.objects.filter(is_active=True).exclude(punch_code='').values_list('punch_code', flat=True)
    )


def known_punch_codes() -> set[str]:
    from apps.hr.models import Shift
    live = set(Shift.objects.exclude(punch_code='').values_list('punch_code', flat=True))
    return live | set(SHIFT_LABELS)


def system_key_for_punch(code: str) -> str | None:
    if not code:
        return None
    from apps.routines.models import Routine
    routine = (
        Routine.objects.filter(shift__punch_code=code, shift_locked=True, is_active=True)
        .order_by('id')
        .first()
    )
    if routine:
        return routine.system_key
    return SHIFT_TO_SYSTEM_KEY.get(code)


def shift_department(code: str, language: str = 'en') -> str:
    row = _shift_for_code(code)
    if row is not None and row.department_id:
        return row.department.name
    hist = SHIFT_LABELS.get(code) or {}
    dept = _department_row(hist.get('department'))
    if not dept:
        return ''
    lang = _lang(language)
    return dept.get(lang) or dept.get('en') or ''


def shift_label(code: str, language: str = 'en', with_department: bool = False) -> str:
    row = _shift_for_code(code)
    if row is not None:
        name = row.name
        dept = row.department.name if row.department_id else ''
        if with_department and dept:
            return f'{dept}: {name}'
        return name
    hist = SHIFT_LABELS.get(code) or {}
    lang = _lang(language)
    name = hist.get(lang) or hist.get('en') or code
    if with_department:
        dept = shift_department(code, language)
        if dept:
            return f'{dept}: {name}'
    return name
