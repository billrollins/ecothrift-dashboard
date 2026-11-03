"""
HR work that goes through Superuser → Requests (staged in production, approved there).

- ``hr.wifi_clock_pilot`` (D23, owner 2026-11-03): sets up the Wi-Fi time clock pilot. Params
  ``{"user": id or email, "mac": "aa:bb:cc:dd:ee:ff", "device": "Bench", "token_sha256": "<hex>",
  "shifts": [{"weekdays": [0, 1, 2, 3], "start": "09:00", "end": "17:00", "punch_code": "office"}]}``.
  Puts the Wi-Fi address on the person's profile, adds (or re-keys) the store PC helper by name with the hash of its
  token, and replaces that person's pilot schedule. Each part is optional. Staged through ``POST
  /api/hr/wifi-clock/stage-setup/`` so the address never goes on a command line; the preview masks it and the apply
  scrubs it from the request. Safe to run again. No undo (run it again with the old values).
"""
from __future__ import annotations

import re
from datetime import time

from apps.core.models import ApprovalRequest
from apps.core.services.approval_requests import Kind, Progress, register

_HHMM = re.compile(r'^([01]?\d|2[0-3]):([0-5]\d)$')


def _user(raw):
    from apps.accounts.models import User
    if isinstance(raw, str) and '@' in raw:
        return User.objects.filter(email__iexact=raw.strip()).first()
    try:
        return User.objects.filter(pk=int(raw)).first()
    except (TypeError, ValueError):
        return None


def _shifts(raw) -> tuple[list[dict], list[str]]:
    rows, problems = [], []
    for item in raw or []:
        if not isinstance(item, dict):
            problems.append('a shift is not an object')
            continue
        start, end = _HHMM.match(str(item.get('start') or '')), _HHMM.match(str(item.get('end') or ''))
        days = [d for d in (item.get('weekdays') or []) if isinstance(d, int) and 0 <= d <= 6]
        if not (start and end and days):
            problems.append(f'shift {item!r} needs weekdays 0-6, start and end as HH:MM')
            continue
        for day in sorted(set(days)):
            rows.append({'weekday': day, 'start': f'{int(start[1]):02d}:{start[2]}', 'end': f'{int(end[1]):02d}:{end[2]}',
                         'punch_code': str(item.get('punch_code') or '')[:20]})
    return rows, problems


def _preview(params: dict) -> dict:
    from apps.hr import wifi_clock
    from apps.hr.shifts import active_punch_codes

    changes, problems = [], []
    user = _user(params.get('user'))
    if user is None:
        problems.append('name the person by id or email in "user"')
    raw_mac = str(params.get('mac') or '')
    mac = wifi_clock.normalize_mac(raw_mac)
    if raw_mac and not mac:
        problems.append('"mac" is not a Wi-Fi address')
    if user and mac:
        if not hasattr(user, 'employee'):
            problems.append(f'{user.full_name} has no staff profile')
        elif not wifi_clock.can_use(user):
            problems.append(f'{user.full_name} is not active staff (employees only)')
        else:
            changes.append(f'{user.full_name}: phone Wi-Fi address {wifi_clock.masked(mac)} on the profile.')
            if wifi_clock.is_randomized(mac):
                changes.append('Warning: that looks like a randomized (private) address. Set the store network to '
                               'use the device MAC first, or the phone will not be found.')
    token_hash = str(params.get('token_sha256') or '').lower()
    device = str(params.get('device') or '').strip()[:60]
    if token_hash or device:
        if not (re.fullmatch(r'[0-9a-f]{64}', token_hash) and device):
            problems.append('a helper needs "device" (its name) and "token_sha256" (64 hex)')
        else:
            changes.append(f'Store PC helper "{device}": new device token (only its hash is kept).')
    shifts, shift_problems = _shifts(params.get('shifts'))
    problems.extend(shift_problems)
    if shifts and user:
        days = 'Mon Tue Wed Thu Fri Sat Sun'.split()
        codes = active_punch_codes()
        for row in shifts:
            note = '' if not row['punch_code'] or row['punch_code'] in codes else ' (not an active shift code)'
            changes.append(f'Pilot shift {days[row["weekday"]]} {row["start"]}-{row["end"]} {row["punch_code"]}{note}.')
        changes.append('The pilot schedule replaces any earlier one. It does not show on the staff Schedule.')
    changes.extend(f'Problem: {p}.' for p in problems)
    sample = [{'who': user.full_name if user else '?', 'phone': wifi_clock.masked(mac), 'helper': device,
               'pilot shifts': len(shifts)}]
    return {
        'counts': {'Phones': int(bool(user and mac)), 'Helpers': int(bool(device and token_hash)),
                   'Pilot shifts': len(shifts), 'Problems': len(problems)},
        'changes': changes, 'sample': sample,
        'params': {'user_id': user.pk if user else None, 'shift_rows': shifts, 'problems': len(problems)},
    }


def _apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.hr import wifi_clock
    from apps.hr.models import WifiClockDevice, WifiPilotShift

    params = dict(request.params or {})
    if params.get('problems'):
        progress.log('The preview had problems; nothing done. Stage it again.')
        return {'done': False}
    user = _user(params.get('user_id'))
    mac = wifi_clock.normalize_mac(str(params.get('mac') or ''))
    result = {}
    if user and mac:
        profile = user.employee
        profile.wifi_mac = mac
        profile.save(update_fields=['wifi_mac'])
        result['phone'] = wifi_clock.masked(mac)
        progress.log(f'{user.full_name}: phone {wifi_clock.masked(mac)} on the profile.')
    device, token_hash = str(params.get('device') or '').strip()[:60], str(params.get('token_sha256') or '').lower()
    if device and token_hash:
        row, _ = WifiClockDevice.objects.update_or_create(name=device, defaults={'token_hash': token_hash,
                                                                                  'is_active': True})
        result['helper'] = row.name
        progress.log(f'Helper "{row.name}" keyed.')
    rows = params.get('shift_rows') or []
    if user and rows:
        WifiPilotShift.objects.filter(employee=user).delete()
        for item in rows:
            sh, sm = (int(x) for x in item['start'].split(':'))
            eh, em = (int(x) for x in item['end'].split(':'))
            WifiPilotShift.objects.create(employee=user, weekday=item['weekday'], start=time(sh, sm),
                                          end=time(eh, em), punch_code=item['punch_code'])
        result['pilot_shifts'] = len(rows)
        progress.log(f'{len(rows)} pilot shifts set.')
    # The address lives on the profile only (D23 § 2.4).
    if params.get('mac'):
        params['mac'] = wifi_clock.masked(mac)
        request.params = params
        request.save(update_fields=['params'])
    progress.update(done=1, total=1)
    return result


register(Kind(kind='hr.wifi_clock_pilot', label='Wi-Fi clock pilot: phone, helper, pilot schedule',
              preview=_preview, apply=_apply))
