"""Dash Updates (Dash Fixes in code) as one JSON file for the owner and an AI (the same idea as the careers file).

``build_bundle`` gives everything: every task (private ones too), the pending requests, and the
instructions an AI needs. ``check_doc`` validates an edited file and lists what would change;
``apply_plan`` writes it. Nothing is deleted by a file: to drop a task, mark it declined.
"""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from .models import DashFix

FORMAT = 'ecothrift.dash-fixes/1'
LINE = DashFix.LINE_STATUSES
TASK_STATUSES = ('accepted', 'working', 'almost', 'done', 'hold', 'declined')
KINDS = [key for key, _ in DashFix.KIND_CHOICES]
SIZES = ['S', 'M', 'L']
FAR = 10 ** 6

INSTRUCTIONS = (
    'This is the whole Dash Updates list. "tasks" are the approved items (and any the owner made himself); '
    '"pending_requests" are staff reports waiting for the owner. Return the SAME JSON with your changes. '
    'Rules: rank is the place in the line (1 = next); only accepted and working tasks have a rank and the '
    'ranks are renumbered 1..N when the file is applied, so you may give any increasing numbers. '
    'depends_on lists the ids of tasks that must be done first (a new task may use the "ref" of another '
    'new task). A task cannot be working or done while something it depends on is not done; dependency '
    'loops are refused. status runs: accepted (approved, in line) -> working -> almost (almost done: put what it waits on in waiting_on, e.g. "your review") -> done; hold = on hold. size is S, M or L. project is a short group name (e.g. "Navigation redesign") and step is the order '
    'inside that project (1, 2, 3...); the page groups tasks by project, projects ordered by their best rank. coder_notes is for the AI coder and is owner-only. To ask the owner something, set question_for_owner; his answer comes back in owner_answer. '
    'private tasks are hidden from staff. To add a task, add an object without "id" (give it a "ref" if '
    'another new task depends on it); parent_request_id links it to the staff request it came from. To '
    'approve a pending request, set "decision": "accept" on it (optionally with rank, size, depends_on, '
    'coder_notes); to turn it down set "decision": "decline" and "decline_reason". Declined tasks need a '
    'decline_reason. Nothing is ever deleted: to drop a task, set its status to declined. Leave ids you '
    'do not want to change exactly as they are.'
)

TASK_FIELDS = ('title', 'details', 'page_path', 'kind', 'status', 'rank', 'size', 'depends_on', 'private',
               'parent_request_id', 'decline_reason', 'done_version', 'coder_notes', 'project', 'step', 'waiting_on',
               'question_for_owner', 'owner_answer')


def _task_doc(fix: DashFix) -> dict:
    return {
        'id': fix.id,
        'title': fix.title,
        'details': fix.details,
        'page_path': fix.page_path,
        'kind': fix.kind,
        'status': fix.status,
        'rank': fix.rank if fix.status in LINE else None,
        'size': fix.size,
        'depends_on': sorted(d.id for d in fix.depends_on.all()),
        'private': fix.private,
        'parent_request_id': fix.parent_id,
        'decline_reason': fix.decline_reason,
        'done_version': fix.done_version,
        'coder_notes': fix.coder_notes,
        'project': fix.project,
        'waiting_on': fix.waiting_on,
        'question_for_owner': fix.question_for_owner,
        'owner_answer': fix.owner_answer,
        'step': fix.step,
        'session': fix.session,  # read-only here; the coding session sets it through the coder API
        'reported_by': fix.submitted_by.full_name if fix.submitted_by_id else '',
        'created_at': fix.created_at.isoformat(),
    }


def build_bundle() -> dict:
    rows = list(DashFix.objects.select_related('submitted_by').prefetch_related('depends_on').order_by('id'))
    tasks = [_task_doc(r) for r in rows if r.status != DashFix.STATUS_NEW]
    tasks.sort(key=lambda t: (t['rank'] is None, t['rank'] or 0, t['id']))
    pending = [
        {
            'id': r.id, 'title': r.title, 'details': r.details, 'page_path': r.page_path,
            'reported_by': r.submitted_by.full_name if r.submitted_by_id else '',
            'created_at': r.created_at.isoformat(), 'photos': r.photos.count(), 'private': r.private,
            'decision': None, 'decline_reason': '', 'size': '', 'depends_on': [], 'coder_notes': '', 'rank': None,
        }
        for r in rows if r.status == DashFix.STATUS_NEW
    ]
    return {
        'format': FORMAT,
        'instructions': INSTRUCTIONS,
        'how_to_return': 'Return only the JSON (the whole file). Keep "format" as it is.',
        'indexes': {'kinds': KINDS, 'statuses': list(TASK_STATUSES), 'sizes': SIZES},
        'tasks': tasks,
        'pending_requests': pending,
    }


def _label(state: dict) -> str:
    rank = state.get('rank_now')
    return f"#{rank} '{state['title']}'" if rank else f"'{state['title']}'"


def check_doc(raw, *, allow_blocked: bool = False) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    changes: list[str] = []
    blocked: list[str] = []

    def result(plan=None):
        return {
            'ok': not errors and not (blocked and not allow_blocked),
            'errors': errors, 'warnings': warnings, 'blocked': blocked, 'changes': changes, 'plan': plan,
        }

    if not isinstance(raw, dict) or not str(raw.get('format', '')).startswith('ecothrift.dash-fixes/'):
        errors.append(f'This does not look like the Dash Updates file (it should have "format": "{FORMAT}").')
        return result()
    tasks_raw = raw.get('tasks', [])
    pending_raw = raw.get('pending_requests', [])
    if not isinstance(tasks_raw, list) or not isinstance(pending_raw, list):
        errors.append('"tasks" and "pending_requests" must be lists.')
        return result()

    db = {f.id: f for f in DashFix.objects.prefetch_related('depends_on')}

    # Current state of everything, keyed ('id', n) or ('ref', name).
    state: dict[tuple, dict] = {}
    for fix in db.values():
        state[('id', fix.id)] = {
            'obj': fix, 'title': fix.title, 'status': fix.status, 'rank_now': fix.rank or None,
            'deps': {('id', d.id) for d in fix.depends_on.all()}, 'explicit_rank': None,
            'touched': False, 'private': fix.private,
        }

    entries: list[dict] = []
    seen_ids: set[int] = set()
    refs: set[str] = set()

    def as_int(value):
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.strip().isdigit():
            return int(value.strip())
        return None

    def dep_key(token, where):
        if isinstance(token, str) and not token.strip().isdigit():
            return ('ref', token.strip())
        number = as_int(token)
        if number is None:
            errors.append(f'{where}: depends_on has "{token}", which is not an id.')
            return None
        return ('id', number)

    def read_entry(item, where, pending):
        if not isinstance(item, dict):
            errors.append(f'{where}: must be an object.')
            return
        fields: dict = {}
        number = as_int(item.get('id')) if item.get('id') not in (None, '') else None
        if item.get('id') not in (None, '') and number is None:
            errors.append(f'{where}: id "{item.get("id")}" is not a number.')
            return
        obj = db.get(number) if number is not None else None
        if number is not None and obj is None:
            errors.append(f'{where}: no item with id {number}.')
            return
        if number is not None:
            if number in seen_ids:
                errors.append(f'{where}: id {number} appears twice.')
                return
            seen_ids.add(number)
        if pending:
            if obj is None:
                errors.append(f'{where}: a pending request needs its id.')
                return
            if obj.status != DashFix.STATUS_NEW:
                errors.append(f'{where}: request {number} is not waiting any more (it is {obj.status}).')
                return
            decision = item.get('decision')
            if decision in (None, ''):
                pass
            elif decision == 'accept':
                fields['status'] = 'accepted'
            elif decision == 'decline':
                fields['status'] = 'declined'
            else:
                errors.append(f'{where}: decision must be "accept" or "decline".')
                return
            allowed = ('rank', 'size', 'depends_on', 'coder_notes', 'private', 'decline_reason', 'title', 'details', 'project', 'step')
        else:
            allowed = TASK_FIELDS
            if 'status' in item:
                fields['status'] = item['status']
        for key in allowed:
            if key in item and key != 'status':
                fields[key] = item[key]
        ref = item.get('ref')
        if ref is not None and obj is not None:
            errors.append(f'{where}: "ref" is only for new tasks.')
            return
        if ref is not None:
            ref = str(ref).strip()
            if not ref or ref in refs or ref.isdigit():
                errors.append(f'{where}: ref "{ref}" must be unique and not a number.')
                return
            refs.add(ref)
        if obj is None:
            if not str(fields.get('title') or '').strip():
                errors.append(f'{where}: a new task needs a title.')
                return
            fields.setdefault('status', 'accepted')
            fields.setdefault('kind', 'change')
        # Validate values.
        if 'status' in fields:
            ok_status = fields['status'] in TASK_STATUSES or (obj is not None and fields['status'] == obj.status)
            if not ok_status:
                errors.append(f'{where}: status "{fields["status"]}" is not one of {", ".join(TASK_STATUSES)}.')
                return
        if 'kind' in fields and fields['kind'] not in KINDS:
            errors.append(f'{where}: kind "{fields["kind"]}" is not one of {", ".join(KINDS)}.')
            return
        if 'size' in fields:
            size = fields['size']
            if size in (None, ''):
                fields['size'] = ''
            elif str(size).upper() in SIZES:
                fields['size'] = str(size).upper()
            else:
                errors.append(f'{where}: size must be S, M or L.')
                return
        if 'rank' in fields and fields['rank'] not in (None, ''):
            if as_int(fields['rank']) is None:
                errors.append(f'{where}: rank must be a number.')
                return
            fields['rank'] = as_int(fields['rank'])
        else:
            fields.pop('rank', None)
        if 'private' in fields:
            fields['private'] = bool(fields['private'])
        if 'step' in fields:
            if fields['step'] in (None, ''):
                fields['step'] = None
            elif as_int(fields['step']) is None or as_int(fields['step']) < 0:
                errors.append(f'{where}: step must be a whole number.')
                return
            else:
                fields['step'] = as_int(fields['step'])
        for key in ('title', 'details', 'page_path', 'decline_reason', 'done_version', 'coder_notes', 'project', 'waiting_on', 'question_for_owner', 'owner_answer'):
            if key in fields:
                fields[key] = str(fields[key] or '').strip()
        if 'title' in fields and len(fields['title']) > 200:
            fields['title'] = fields['title'][:199].rstrip() + '…'
        if 'title' in fields and not fields['title']:
            errors.append(f'{where}: title cannot be empty.')
            return
        parent_id = None
        if 'parent_request_id' in fields:
            if fields['parent_request_id'] in (None, ''):
                parent_id = 0
            else:
                parent_id = as_int(fields['parent_request_id'])
                if parent_id is None or parent_id not in db:
                    errors.append(f'{where}: parent_request_id {fields["parent_request_id"]} is not an item.')
                    return
                if obj is not None and parent_id == obj.id:
                    errors.append(f'{where}: an item cannot be its own parent.')
                    return
        deps = None
        if 'depends_on' in fields:
            raw_deps = fields['depends_on'] or []
            if not isinstance(raw_deps, list):
                errors.append(f'{where}: depends_on must be a list.')
                return
            deps = []
            for token in raw_deps:
                key = dep_key(token, where)
                if key is not None:
                    deps.append(key)
        entries.append({
            'obj': obj, 'fields': fields, 'deps': deps, 'ref': ref, 'where': where, 'parent': parent_id,
        })

    for index, item in enumerate(tasks_raw, start=1):
        read_entry(item, f'tasks[{index}]', pending=False)
    for index, item in enumerate(pending_raw, start=1):
        read_entry(item, f'pending_requests[{index}]', pending=True)
    if errors:
        return result()

    # Fold the entries into the state.
    order = 0
    for entry in entries:
        fields = entry['fields']
        obj = entry['obj']
        if obj is None:
            order += 1
            key = ('ref', entry['ref']) if entry['ref'] else ('new', order)
            state[key] = {
                'obj': None, 'title': fields['title'], 'status': fields['status'], 'rank_now': None,
                'deps': set(), 'explicit_rank': fields.get('rank'), 'touched': True, 'private': fields.get('private', False),
                'new_order': order,
            }
        else:
            key = ('id', obj.id)
            st = state[key]
            st['touched'] = True
            st['title'] = fields.get('title', st['title'])
            if 'status' in fields:
                st['status'] = fields['status']
            if 'private' in fields:
                st['private'] = fields['private']
            if 'rank' in fields:
                st['explicit_rank'] = fields['rank']
        entry['key'] = key
        if entry['deps'] is not None:
            state[key]['deps'] = set(entry['deps'])
    for key, st in state.items():
        for dep in st['deps']:
            if dep not in state:
                label = _label(st)
                errors.append(f'{label} depends on {dep[1]}, which is not an item.')
        if key in st['deps']:
            errors.append(f'{_label(st)} cannot depend on itself.')
    if errors:
        return result()

    # Dependency cycles.
    color: dict[tuple, int] = {}

    def visit(node, trail):
        color[node] = 1
        for dep in sorted(state[node]['deps'], key=str):
            if color.get(dep) == 1:
                names = ' -> '.join(_label(state[n]) for n in trail + [node, dep])
                errors.append(f'Dependency loop: {names}.')
                return
            if color.get(dep) is None:
                visit(dep, trail + [node])
                if errors:
                    return
        color[node] = 2

    for node in list(state):
        if color.get(node) is None:
            visit(node, [])
            if errors:
                return result()

    # Declined needs a reason; working/done wait on their dependencies.
    for entry in entries:
        key, fields, obj = entry['key'], entry['fields'], entry['obj']
        st = state[key]
        if st['status'] == 'declined' and (obj is None or obj.status != 'declined'):
            if not (fields.get('decline_reason') or (obj.decline_reason if obj else '')):
                errors.append(f'{entry["where"]}: {_label(st)} is declined, so it needs a decline_reason.')
        changed_deps = entry['deps'] is not None and (obj is None or set(entry['deps']) != {('id', d.id) for d in obj.depends_on.all()})
        status_changed = obj is None or st['status'] != obj.status
        if st['status'] in ('working', 'almost', 'done') and (status_changed or changed_deps):
            for dep in sorted(st['deps'], key=str):
                if state[dep]['status'] != 'done':
                    blocked.append(
                        f"{_label(st)} would be {st['status']} but waits on {_label(state[dep])} (not done)."
                    )
    if errors:
        return result()
    if blocked and allow_blocked:
        warnings.extend(f'Allowed anyway: {line}' for line in blocked)

    # Final line order.
    line_keys = [k for k, st in state.items() if st['status'] in LINE]

    def sort_key(k):
        st = state[k]
        explicit = st['explicit_rank']
        if explicit is not None:
            base, tie = explicit, 0
        elif st['rank_now']:
            base, tie = st['rank_now'], 1
        else:
            base, tie = FAR + st.get('new_order', 0), 2
        return (base, tie, k[1] if k[0] == 'id' else FAR, st.get('new_order', 0))

    line_keys.sort(key=sort_key)
    for index, k in enumerate(line_keys, start=1):
        state[k]['rank_final'] = index

    # Plain-language changes.
    for entry in entries:
        key, fields, obj = entry['key'], entry['fields'], entry['obj']
        st = state[key]
        if obj is None:
            changes.append(f"Add task '{st['title']}' ({st['status']})")
            continue
        label = _label(st)
        parts = []
        if st['status'] != obj.status:
            parts.append(f'{obj.status} to {st["status"]}')
        for name in ('title', 'details', 'page_path', 'kind', 'size', 'private', 'decline_reason', 'done_version', 'coder_notes', 'project', 'step', 'waiting_on', 'question_for_owner', 'owner_answer'):
            if name in fields and getattr(obj, name) != fields[name]:
                parts.append(f'{name} changed')
        if entry['deps'] is not None and set(entry['deps']) != {('id', d.id) for d in obj.depends_on.all()}:
            parts.append('depends_on changed')
        if entry['parent'] is not None and (entry['parent'] or None) != obj.parent_id:
            parts.append('parent changed')
        if parts:
            changes.append(f"{label}: " + ', '.join(parts))
    for k in line_keys:
        st = state[k]
        if st['obj'] is not None and st['rank_now'] and st['rank_now'] != st['rank_final']:
            changes.append(f"'{st['title']}' moves from #{st['rank_now']} to #{st['rank_final']}")
        elif st['obj'] is not None and not st['rank_now']:
            changes.append(f"'{st['title']}' joins the line at #{st['rank_final']}")

    plan = {'entries': entries, 'state': state, 'line_keys': line_keys}
    return result(plan)


@transaction.atomic
def apply_plan(plan: dict, *, user) -> None:
    now = timezone.now()
    entries, state = plan['entries'], plan['state']
    objs: dict[tuple, DashFix] = {}
    for key, st in state.items():
        if st['obj'] is not None:
            objs[key] = st['obj']

    # Create new tasks first (so dependencies can point at them).
    for entry in entries:
        if entry['obj'] is not None:
            continue
        f = entry['fields']
        fix = DashFix.objects.create(
            title=f['title'], details=f.get('details', ''), page_path=f.get('page_path', ''),
            kind=f.get('kind', 'change'), size=f.get('size', ''), coder_notes=f.get('coder_notes', ''),
            project=f.get('project', ''), step=f.get('step'),
            private=f.get('private', False), status=f['status'], submitted_by=user,
            decline_reason=f.get('decline_reason', ''), done_version=f.get('done_version', ''),
            status_changed_at=now, submitter_seen_at=now,
            accepted_at=now if f['status'] in ('accepted', 'working', 'almost', 'done', 'hold') else None,
            waiting_on=f.get('waiting_on', ''), question_for_owner=f.get('question_for_owner', ''),
            owner_answer=f.get('owner_answer', ''), answered_at=now if f.get('owner_answer') else None,
            done_at=now if f['status'] == 'done' else None,
        )
        objs[entry['key']] = fix

    for entry in entries:
        key, f = entry['key'], entry['fields']
        fix = objs[key]
        if entry['obj'] is not None:
            old_status = fix.status
            old_question, old_answer = fix.question_for_owner, fix.owner_answer
            for name in ('title', 'details', 'page_path', 'kind', 'size', 'coder_notes', 'project', 'step', 'private',
                         'decline_reason', 'done_version', 'waiting_on', 'question_for_owner', 'owner_answer'):
                if name in f:
                    setattr(fix, name, f[name])
            if 'question_for_owner' in f and f['question_for_owner'] != old_question and 'owner_answer' not in f:
                fix.owner_answer = ''  # a new question needs a new answer
            if 'owner_answer' in f and f['owner_answer'] != old_answer:
                fix.answered_at = now if f['owner_answer'] else None
            elif fix.owner_answer == '':
                fix.answered_at = None
            new_status = state[key]['status']
            if new_status != old_status:
                fix.status = new_status
                fix.status_changed_at = now
                if new_status in ('accepted', 'working', 'almost', 'done', 'hold') and not fix.accepted_at:
                    fix.accepted_at = now
                if new_status == 'done':
                    fix.done_at = now
                else:
                    fix.done_at = None
                    if 'done_version' not in f:
                        fix.done_version = ''
                if new_status != 'declined' and 'decline_reason' not in f:
                    fix.decline_reason = ''
        if entry['parent'] is not None:
            fix.parent = objs.get(('id', entry['parent'])) or DashFix.objects.filter(pk=entry['parent']).first() \
                if entry['parent'] else None
        fix.save()
        if entry['deps'] is not None:
            targets = []
            for dep in entry['deps']:
                target = objs.get(dep) or DashFix.objects.get(pk=dep[1])
                targets.append(target)
            fix.depends_on.set(targets)

    # Ranks 1..N for the line; everything else 0.
    in_line = set()
    for index, key in enumerate(plan['line_keys'], start=1):
        fix = objs.get(key) or DashFix.objects.get(pk=key[1])
        in_line.add(fix.pk)
        if fix.rank != index:
            DashFix.objects.filter(pk=fix.pk).update(rank=index)
    DashFix.objects.exclude(pk__in=in_line).exclude(rank=0).update(rank=0)
