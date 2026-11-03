"""Staff permissions: what one person can do, and changing it (Dash Update #53, owner 2026-11-03).

Three layers, per area (``capabilities.py``):

1. the person's **level** (Employee or Manager) sets the base dial;
2. their **department** can add (a higher dial, or single items), never take away;
3. their own **exceptions** have the last word: a dial set for them (up or down), single items added, and single items
   taken away. A personal "no" beats everything. An exception can end on a date.

The Owner (superuser) holds everything, always. Only active staff logins hold anything: customers and consignees never.

Phase 1 (this release): a grant opens the doors the old checks kept shut (``request_granted`` in the permission
classes, ``manager_or`` / ``owner_or`` in inline checks), and the sidebar and pages follow the result both ways.
Taking access away is enforced on the server in phase 2, area by area.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

from django.db import transaction
from django.utils import timezone

from apps.accounts import capabilities as cat

STAFF_ROLES = ('Employee', 'Manager', 'Admin')
SOURCE_LEVEL = 'level'
SOURCE_DEPARTMENT = 'department'
SOURCE_PERSON = 'person'
SOURCE_OWNER = 'owner'


def is_staff_login(user) -> bool:
    if user is None or not getattr(user, 'is_authenticated', False) or not getattr(user, 'is_active', False):
        return False
    return bool(user.is_superuser or getattr(user, 'role', None) in STAFF_ROLES)


def level_of(user) -> str | None:
    """Owner, Manager or Employee. The retired Admin group counts as Manager; only the superuser is the Owner."""
    if not is_staff_login(user):
        return None
    if user.is_superuser:
        return cat.LEVEL_OWNER
    return cat.LEVEL_MANAGER if user.role in ('Manager', 'Admin') else cat.LEVEL_EMPLOYEE


# ── Layers ────────────────────────────────────────────────────────────────

def _entry(raw) -> dict:
    """One area of one layer, cleaned: step (None = not set), add and remove (only this area's open items)."""
    raw = raw if isinstance(raw, dict) else {}
    step = raw.get('step')
    step = int(step) if isinstance(step, (int, float)) and 0 <= int(step) <= cat.FULL else None
    until = raw.get('until') or None
    if until:
        try:
            until = dt.date.fromisoformat(str(until)[:10])
        except ValueError:
            until = None
    return {
        'step': step,
        'add': [i for i in raw.get('add') or [] if i in cat.ITEM_BY_ID and not cat.ITEM_BY_ID[i].locked],
        'remove': [i for i in raw.get('remove') or [] if i in cat.ITEM_BY_ID and not cat.ITEM_BY_ID[i].locked],
        'until': until,
        'note': str(raw.get('note') or '')[:200],
    }


def level_areas(level: str, row=None) -> dict[str, dict]:
    """A level's preset: the day-one defaults, with whatever the owner saved over them."""
    saved = (row.areas if row is not None else {}) or {}
    out = {}
    for area in cat.AREA_IDS:
        entry = _entry(saved.get(area))
        if entry['step'] is None:
            entry['step'] = cat.LEVEL_DEFAULTS.get(level, {}).get(area, cat.NONE)
        out[area] = entry
    return out


def department_areas(row=None) -> dict[str, dict]:
    saved = (row.areas if row is not None else {}) or {}
    out = {}
    for area in cat.AREA_IDS:
        entry = _entry(saved.get(area))
        entry['step'] = entry['step'] or cat.NONE
        out[area] = entry
    return out


def person_areas(row=None, *, today: dt.date | None = None) -> dict[str, dict]:
    """A person's exceptions that are still on (an exception with an end date stops after that day)."""
    today = today or timezone.localdate()
    saved = (row.areas if row is not None else {}) or {}
    out = {}
    for area in cat.AREA_IDS:
        entry = _entry(saved.get(area))
        if entry['until'] and entry['until'] < today:
            continue
        if entry['step'] is None and not entry['add'] and not entry['remove']:
            continue
        out[area] = entry
    return out


def _sets_for(users) -> dict[str, object]:
    from apps.accounts.models import AccessSet

    keys = {f'level:{lv}' for lv in cat.LEVELS}
    for user in users:
        keys.add(f'person:{user.pk}')
        dept_id = _department_id(user)
        if dept_id:
            keys.add(f'department:{dept_id}')
    return {row.key: row for row in AccessSet.objects.filter(key__in=keys)}


def _department_id(user):
    try:
        return user.employee.department_id
    except Exception:  # no EmployeeProfile (RelatedObjectDoesNotExist) or not a saved user
        return None


# ── Resolving one person ──────────────────────────────────────────────────

@dataclass
class Resolved:
    level: str | None
    steps: dict[str, int] = field(default_factory=dict)
    step_from: dict[str, str] = field(default_factory=dict)
    items: dict[str, str] = field(default_factory=dict)   # held item id → where it came from
    denied: set[str] = field(default_factory=set)         # items a personal "no" took away

    def ids(self) -> list[str]:
        """Held item ids plus each dial step reached (``buying:view`` … ``buying:full``): what the sidebar reads."""
        out = [i.id for i in cat.ITEMS if i.id in self.items]
        for area in cat.AREA_IDS:
            for step in range(1, self.steps.get(area, 0) + 1):
                out.append(cat.step_key(area, step))
        return out


def resolve(user, *, sets: dict | None = None, today: dt.date | None = None) -> Resolved:
    level = level_of(user)
    if level is None:
        return Resolved(level=None)
    if level == cat.LEVEL_OWNER:
        return Resolved(
            level=level,
            steps={a: cat.FULL for a in cat.AREA_IDS},
            step_from={a: SOURCE_OWNER for a in cat.AREA_IDS},
            items={i.id: SOURCE_OWNER for i in cat.ITEMS},
        )
    dept_id = _department_id(user)
    own_lookup = sets is None
    if own_lookup:
        # Kept for the request, and only while the level and department are the same (a level change recomputes).
        cached = getattr(user, '_access_resolved', None)
        if cached is not None and cached[0] == (level, dept_id):
            return cached[1]
        sets = _sets_for([user])
    lv = level_areas(level, sets.get(f'level:{level}'))
    dp = department_areas(sets.get(f'department:{dept_id}')) if dept_id else department_areas(None)
    me = person_areas(sets.get(f'person:{user.pk}'), today=today)

    out = Resolved(level=level)
    for area in cat.AREA_IDS:
        l_entry, d_entry = lv[area], dp[area]
        from_level = {i.id for i in cat.items_at(area, l_entry['step'])} | set(l_entry['add'])
        from_level -= set(l_entry['remove'])
        from_dept = {i.id for i in cat.items_at(area, d_entry['step'])} | set(d_entry['add'])
        from_dept -= set(d_entry['remove'])
        held = {i: SOURCE_LEVEL for i in from_level}
        held.update({i: SOURCE_DEPARTMENT for i in from_dept - from_level})
        step = max(l_entry['step'], d_entry['step'])
        source = SOURCE_DEPARTMENT if d_entry['step'] > l_entry['step'] else SOURCE_LEVEL

        mine = me.get(area)
        if mine:
            if mine['step'] is not None:
                step, source = mine['step'], SOURCE_PERSON
                dial = {i.id for i in cat.items_at(area, mine['step'])}
                held = {i: held.get(i, SOURCE_PERSON) for i in dial}
            for item_id in mine['add']:
                held.setdefault(item_id, SOURCE_PERSON)
            for item_id in mine['remove']:
                held.pop(item_id, None)
                out.denied.add(item_id)
        out.steps[area] = step
        out.step_from[area] = source
        out.items.update(held)
    if own_lookup:
        user._access_resolved = ((level, dept_id), out)  # request.user is a fresh object each request
    return out


def forget(user) -> None:
    """Drop the answer kept on this user object (``resolve`` keeps one per request)."""
    if user is not None:
        user.__dict__.pop('_access_resolved', None)


def access_ids(user) -> list[str]:
    """What the signed-in person holds, for the sidebar and pages (``/api/auth/me/`` → ``access``)."""
    return resolve(user).ids()


def holds(user, need: str) -> bool:
    """``need`` is an item id or a dial step (``admin:manage``)."""
    if not is_staff_login(user):
        return False
    if user.is_superuser:
        return True
    resolved = resolve(user)
    if need in resolved.items:
        return True
    area, _, key = need.partition(':')
    if area in cat.AREA_BY_ID and key in cat.STEP_KEYS:
        return resolved.steps.get(area, 0) >= cat.STEP_KEYS.index(key)
    return False


def manager_or(user, need: str) -> bool:
    """The old manager rule (Manager, Admin or the owner), or a grant of ``need`` on the Permissions page."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if user.is_superuser or getattr(user, 'role', None) in ('Manager', 'Admin'):
        return True
    return holds(user, need)


def owner_or(user, need: str) -> bool:
    """The owner, or a grant of ``need``."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    return bool(user.is_superuser) or holds(user, need)


def admin_or(user, need: str) -> bool:
    """The owner or the retired Admin group, or a grant of ``need``."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    return bool(user.is_superuser or getattr(user, 'role', None) == 'Admin') or holds(user, need)


def request_granted(request, need_step: int) -> bool:
    """For a gate that only checked the level: does this person's dial for the path's area reach the gate's step, or
    do they hold an item at that step (or higher) that names this path? Staff logins only."""
    user = getattr(request, 'user', None)
    if not is_staff_login(user):
        return False
    if user.is_superuser:
        return True
    path = request.path
    resolved = resolve(user)
    area = cat.area_for_path(path)
    if area and resolved.steps.get(area, 0) >= need_step:
        return True
    return any(item.step >= need_step and item.id in resolved.items for item in cat.items_for_path(path))


# ── The page ──────────────────────────────────────────────────────────────

def _areas_json(areas: dict[str, dict], *, keep_empty_steps: bool) -> dict:
    out = {}
    for area, entry in areas.items():
        row = {}
        if entry.get('step') is not None and (keep_empty_steps or entry['step']):
            row['step'] = entry['step']
        if entry.get('add'):
            row['add'] = sorted(entry['add'])
        if entry.get('remove'):
            row['remove'] = sorted(entry['remove'])
        if entry.get('until'):
            row['until'] = entry['until'].isoformat()
        if entry.get('note'):
            row['note'] = entry['note']
        if row:
            out[area] = row
    return out


def staff_queryset():
    from django.db.models import Q

    from apps.accounts.models import User

    return (User.objects.filter(is_active=True)
            .filter(Q(is_superuser=True) | Q(groups__name__in=STAFF_ROLES))
            .select_related('employee__department').prefetch_related('groups').distinct()
            .order_by('first_name', 'last_name'))


def page_payload(viewer) -> dict:
    """Everything the Permissions page draws: the catalog, each level, each department, each person, and whether
    the viewer may change it."""
    from apps.accounts.models import AccessSet
    from apps.hr.models import Department

    people = list(staff_queryset())
    rows = {row.key: row for row in AccessSet.objects.all()}
    today = timezone.localdate()
    departments = list(Department.objects.filter(is_active=True).order_by('sort_order', 'name'))
    dept_counts: dict[int, int] = {}
    for person in people:
        dept_id = _department_id(person)
        if dept_id:
            dept_counts[dept_id] = dept_counts.get(dept_id, 0) + 1

    def person_row(person):
        resolved = resolve(person, sets=rows, today=today)
        mine = person_areas(rows.get(f'person:{person.pk}'), today=today)
        profile = getattr(person, 'employee', None)
        dept = getattr(profile, 'department', None) if profile else None
        return {
            'id': person.pk,
            'name': person.full_name.strip() or person.email,
            'level': resolved.level,
            'department': {'id': dept.pk, 'name': dept.name} if dept else None,
            'position': getattr(profile, 'position', '') if profile else '',
            'steps': resolved.steps,
            'step_from': resolved.step_from,
            'items': resolved.items,
            'denied': sorted(resolved.denied),
            'exceptions': _areas_json(mine, keep_empty_steps=True),
            'exception_count': sum(
                (1 if e['step'] is not None else 0) + len(e['add']) + len(e['remove']) for e in mine.values()
            ),
        }

    return {
        'catalog': cat.catalog_payload(),
        'levels': {
            lv: _areas_json(level_areas(lv, rows.get(f'level:{lv}')), keep_empty_steps=True) for lv in cat.LEVELS
        },
        'departments': [
            {
                'id': d.pk,
                'name': d.name,
                'people': dept_counts.get(d.pk, 0),
                'areas': _areas_json(department_areas(rows.get(f'department:{d.pk}')), keep_empty_steps=False),
            }
            for d in departments
        ],
        'people': [person_row(p) for p in people],
        'can_edit': bool(getattr(viewer, 'is_superuser', False)),
    }


# ── Changing it ───────────────────────────────────────────────────────────

class AccessError(ValueError):
    pass


def _clean_areas(raw, *, kind: str) -> dict[str, dict]:
    from apps.accounts.models import AccessSet

    if not isinstance(raw, dict):
        raise AccessError('areas must be an object.')
    out = {}
    for area, value in raw.items():
        if area not in cat.AREA_BY_ID:
            raise AccessError(f'Unknown area: {area}.')
        if not isinstance(value, dict):
            raise AccessError(f'{area}: must be an object.')
        step = value.get('step')
        if step is not None and (not isinstance(step, int) or not 0 <= step <= cat.FULL):
            raise AccessError(f'{area}: the step must be 0 to 4.')
        if kind == AccessSet.KIND_LEVEL and step is None:
            raise AccessError(f'{area}: a level needs a step.')
        lists = {}
        for key in ('add', 'remove'):
            ids = value.get(key) or []
            if not isinstance(ids, list):
                raise AccessError(f'{area}: {key} must be a list.')
            for item_id in ids:
                item = cat.ITEM_BY_ID.get(item_id)
                if item is None or item.area != area:
                    raise AccessError(f'{area}: {item_id} is not an item of this area.')
                if item.locked:
                    raise AccessError(f'{item.label}: only the owner has this.')
            lists[key] = sorted(set(ids))
        if set(lists['add']) & set(lists['remove']):
            raise AccessError(f'{area}: an item cannot be both added and taken away.')
        if kind == AccessSet.KIND_DEPARTMENT and lists['remove']:
            raise AccessError('A department only adds.')
        until = value.get('until') or None
        if until is not None:
            if kind != AccessSet.KIND_PERSON:
                raise AccessError('Only an exception for one person can end on a date.')
            try:
                until = dt.date.fromisoformat(str(until)[:10])
            except ValueError as exc:
                raise AccessError(f'{area}: the end date must be YYYY-MM-DD.') from exc
        entry = {'step': step, 'add': lists['add'], 'remove': lists['remove'], 'until': until,
                 'note': str(value.get('note') or '')[:200]}
        if kind == AccessSet.KIND_PERSON and step is None and not entry['add'] and not entry['remove']:
            continue  # nothing left for this area: back to their level and department
        out[area] = entry
    return out


def _describe(area: str, before: dict | None, after: dict | None, *, kind: str) -> list[str]:
    """Plain words for one area's change: "Work → Manage", "+ Approve time-change requests", "until Nov 20"."""
    before = dict(before or {'step': None, 'add': [], 'remove': [], 'until': None})
    after = dict(after or {'step': None, 'add': [], 'remove': [], 'until': None})
    if kind == 'department':  # a department with no step adds nothing: the same as None
        before['step'], after['step'] = before.get('step') or None, after.get('step') or None
    words = []
    if before.get('step') != after.get('step'):
        old = 'not set' if before.get('step') is None else cat.STEP_NAMES[before['step']]
        new = ('back to their level' if kind == 'person' else 'not set') if after.get('step') is None \
            else cat.STEP_NAMES[after['step']]
        words.append(f'{old} → {new}')
    for item_id in sorted(set(after.get('add') or []) - set(before.get('add') or [])):
        words.append(f'+ {cat.ITEM_BY_ID[item_id].label}')
    for item_id in sorted(set(before.get('add') or []) - set(after.get('add') or [])):
        words.append(f'no longer added: {cat.ITEM_BY_ID[item_id].label}')
    for item_id in sorted(set(after.get('remove') or []) - set(before.get('remove') or [])):
        words.append(f'− {cat.ITEM_BY_ID[item_id].label}')
    for item_id in sorted(set(before.get('remove') or []) - set(after.get('remove') or [])):
        words.append(f'no longer taken away: {cat.ITEM_BY_ID[item_id].label}')
    if before.get('until') != after.get('until') and (after.get('step') is not None or after.get('add')
                                                       or after.get('remove')):
        until = after.get('until')
        words.append(f'until {until:%b} {until.day}, {until.year}' if until else 'no end date')
    return words


def save_layer(*, kind: str, actor, areas, level: str | None = None, department=None, user=None) -> dict:
    """Save one layer whole (the page sends every area of it) and log each change in History."""
    from apps.accounts.models import AccessEvent, AccessSet

    if kind == AccessSet.KIND_LEVEL:
        if level not in cat.LEVELS:
            raise AccessError('The level must be Employee or Manager. The Owner always has everything.')
        key, target, old_areas = f'level:{level}', f'{level} level', level_areas(level, None)
    elif kind == AccessSet.KIND_DEPARTMENT:
        if department is None:
            raise AccessError('Pick a department.')
        key, target, old_areas = f'department:{department.pk}', f'{department.name} department', {}
    elif kind == AccessSet.KIND_PERSON:
        if user is None or not is_staff_login(user):
            raise AccessError('Pick an active staff member.')
        if user.is_superuser:
            raise AccessError('The owner always has everything.')
        key, target, old_areas = f'person:{user.pk}', user.full_name, {}
    else:
        raise AccessError('Unknown layer.')

    new_areas = _clean_areas(areas, kind=kind)
    with transaction.atomic():
        row = AccessSet.objects.select_for_update().filter(key=key).first()
        if row is not None:
            saved = row.areas or {}
            if kind == AccessSet.KIND_LEVEL:
                old_areas = level_areas(level, row)
            else:
                old_areas = {a: _entry(v) for a, v in saved.items()}
        if kind == AccessSet.KIND_LEVEL:
            # A level keeps every area; one the page left out stays as it was.
            merged = {a: old_areas[a] for a in cat.AREA_IDS}
            merged.update(new_areas)
            new_areas = merged
        stored = _areas_json(new_areas, keep_empty_steps=kind != AccessSet.KIND_DEPARTMENT)
        if row is None:
            row = AccessSet(kind=kind, key=key, department=department if kind == AccessSet.KIND_DEPARTMENT else None,
                            user=user if kind == AccessSet.KIND_PERSON else None)
        row.areas = stored
        row.updated_by = actor if getattr(actor, 'pk', None) else None
        row.save()
        events = []
        for area in cat.AREA_IDS:
            for words in _describe(area, old_areas.get(area), new_areas.get(area), kind=kind):
                events.append(AccessEvent(
                    actor=row.updated_by, target=target[:120], user=user if kind == AccessSet.KIND_PERSON else None,
                    area=area, change=words[:300], note=(new_areas.get(area) or {}).get('note', '')[:300],
                ))
        AccessEvent.objects.bulk_create(events)
    forget(user)
    return {'key': key, 'areas': stored, 'changes': len(events)}


def set_level(*, user, level: str, actor) -> str:
    """Make a staff member an Employee or a Manager (their staff group). The owner's level never changes here."""
    from django.contrib.auth.models import Group

    from apps.accounts.models import AccessEvent, AccountEvent

    if level not in cat.LEVELS:
        raise AccessError('The level must be Employee or Manager.')
    if not is_staff_login(user):
        raise AccessError('Pick an active staff member.')
    if user.is_superuser:
        raise AccessError('The owner always has everything.')
    old = level_of(user)
    if old == level and user.role == level:
        return level
    with transaction.atomic():
        for group in list(user.groups.filter(name__in=STAFF_ROLES)):
            user.groups.remove(group)
        group, _ = Group.objects.get_or_create(name=level)
        user.groups.add(group)
        if not user.is_staff:
            user.is_staff = True
            user.save(update_fields=['is_staff', 'updated_at'])
        AccountEvent.log(user, AccountEvent.KIND_ROLE, actor=actor, detail=f'{old} → {level}')
        AccessEvent.objects.create(actor=actor if getattr(actor, 'pk', None) else None, target=user.full_name[:120],
                                   user=user, change=f'Level: {old} → {level}')
    forget(user)
    return level


def history(limit: int = 200) -> list[dict]:
    from apps.accounts.models import AccessEvent

    rows = AccessEvent.objects.select_related('actor').order_by('-at')[:limit]
    return [
        {
            'id': row.pk,
            'at': row.at.isoformat(),
            'actor': row.actor.full_name if row.actor_id else '',
            'target': row.target,
            'area': cat.AREA_BY_ID[row.area].label if row.area in cat.AREA_BY_ID else '',
            'change': row.change,
            'note': row.note,
        }
        for row in rows
    ]
