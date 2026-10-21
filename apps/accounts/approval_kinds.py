"""
Accounts work that goes through Superuser → Requests (staged in production, approved there).

- ``accounts.issue_register_pins`` (owner 2026-10-21): manager-PIN approvals at the register need every manager to have
  a PIN. Params ``{"users": [id or email, ...], "replace": false}``. For each person it makes a random 4-digit PIN that
  passes the too-easy check and nobody else has, sets it (``register_pin.set_pin``), and sends them a one-time secret
  message in Dash with it. The preview shows names only. The PIN is never printed, logged or stored anywhere but its
  hash and the one-time secret (deleted once shown). Someone who already has a PIN is skipped unless ``replace``.
  Safe to run again: a person done in this request is skipped. It cannot be undone (they change it on their Me page).
"""
from __future__ import annotations

import secrets

from apps.core.models import ApprovalRequest
from apps.core.services.approval_requests import Kind, Progress, register

SUBJECT = 'Your register PIN'
BODY = ('Your register PIN is in the box below: tap Show to see it. It shows only once, then it is deleted, so learn '
        'it. Use it to approve price changes, discounts, voids and late returns. Change it any time on your Me page.')


def _resolve(raw) -> tuple[list, list[str]]:
    from apps.accounts.models import User

    users, problems, seen = [], [], set()
    for item in raw or []:
        user = None
        if isinstance(item, str) and '@' in item:
            user = User.objects.filter(email__iexact=item.strip()).first()
        else:
            try:
                user = User.objects.filter(pk=int(item)).first()
            except (TypeError, ValueError):
                user = None
        if user is None:
            problems.append(f'{item!r}: no such login')
        elif user.pk not in seen:
            seen.add(user.pk)
            users.append(user)
    return users, problems


def _why_not(user, replace: bool) -> str:
    from apps.accounts.services import register_pin

    if not register_pin.can_hold_pin(user):
        return 'not active staff'
    if register_pin.has_pin(user) and not replace:
        return 'already has a PIN (skipped; pass "replace": true to issue a new one)'
    return ''


def _preview(params: dict) -> dict:
    replace = bool(params.get('replace'))
    users, problems = _resolve(params.get('users'))
    changes, sample, ok = [], [], []
    for user in users:
        why = _why_not(user, replace)
        if why:
            changes.append(f'{user.full_name}: {why}.')
        else:
            ok.append(user.pk)
            changes.append(f'{user.full_name}: gets a new register PIN and a one-time message with it in Dash.')
        sample.append({'who': user.full_name, 'role': user.role or '', 'will': why or 'New PIN, sent once in Dash'})
    changes.extend(f'Problem: {p}.' for p in problems)
    if not users:
        changes.insert(0, 'Nobody to do: name people by id or email in "users".')
    counts = {'PINs to issue': len(ok)}
    if len(users) - len(ok):
        counts['Skipped'] = len(users) - len(ok)
    return {'counts': counts, 'changes': changes, 'sample': sample,
            'params': {'user_ids': [u.pk for u in users], 'replace': replace}}


def _new_pin() -> str:
    from apps.accounts.models import User
    from apps.accounts.services import register_pin

    for _ in range(200):
        pin = f'{secrets.randbelow(10_000):04d}'
        if register_pin._too_easy(pin):
            continue
        if not User.objects.filter(register_pin_hash=register_pin._hash(pin)).exists():
            return pin
    raise RuntimeError('Could not find a free PIN.')


def _apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.accounts.models import User
    from apps.accounts.services import register_pin, staff_messages

    params = request.params or {}
    replace = bool(params.get('replace'))
    ids = list(params.get('user_ids') or [u.pk for u in _resolve(params.get('users'))[0]])
    done = list(progress.state.get('done_ids') or [])
    issued, skipped = list(progress.state.get('issued') or []), list(progress.state.get('skipped') or [])
    for user in User.objects.filter(pk__in=ids).order_by('first_name'):
        if user.pk in done:
            continue
        why = _why_not(user, replace)
        if not why and request.decided_by_id == user.pk:
            why = 'is the approver (set your own on your Me page)'
        if why:
            skipped.append(f'{user.full_name}: {why}')
            done.append(user.pk)
            progress.update(done=len(done), total=len(ids), done_ids=done, skipped=skipped,
                            log=f'{user.full_name}: skipped, {why}.')
            continue
        pin = _new_pin()
        register_pin.set_pin(user, pin, actor=request.decided_by)
        staff_messages.start_thread(request.decided_by, subject=SUBJECT, body=BODY, to_user=user, secret=pin,
                                    system=True)
        del pin
        issued.append(user.full_name)
        done.append(user.pk)
        progress.update(done=len(done), total=len(ids), done_ids=done, issued=issued,
                        log=f'{user.full_name}: PIN set and sent once in Dash.')
    if not ids:
        progress.log('Nothing to do.')
    return {'issued': issued, 'skipped': skipped}


register(Kind(kind='accounts.issue_register_pins', label='Issue register PINs (sent once in Dash)', preview=_preview,
              apply=_apply))
