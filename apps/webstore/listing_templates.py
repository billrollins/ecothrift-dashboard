"""
Online Sales listing templates (Dash Updates #51) and the phone test report, in one place.

A listing has a template: Standard (photos, words, price) or Phone / device, which adds a test report. More templates
are added to TEMPLATES. The report is stored on WebListing.device_test and checked here (clean_device_test); the shop
page, the staff preview and the channel copy all read the same rows (report_rows / report_text), so it looks the same
everywhere.

device_test:
  tested          bool. False (or missing) = no report anywhere.
  <check key>     'pass' | 'fail' | 'not_checked' (CHECKS)
  <lock key>      'no' | 'yes' | 'not_checked' (LOCKS; 'no' is the good answer)
  carrier         CARRIERS key, when carrier_locked is 'yes'; carrier_other when carrier is 'other'
  battery_health  0-100 or None
  storage         short text, e.g. '128 GB'
  note            short text

Bill's five (turns on, charges, holds a charge, carrier lock, demo lock) always show once tested, "Not checked"
included; the rest show only when checked.
"""
from __future__ import annotations

from rest_framework import serializers

TEMPLATES = {
    'standard': {'label': 'Standard'},
    'phone': {'label': 'Phone / device', 'report': True},
}
TEMPLATE_CHOICES = [(k, v['label']) for k, v in TEMPLATES.items()]

PASS_FAIL = ('pass', 'fail', 'not_checked')
YES_NO = ('no', 'yes', 'not_checked')

# key, label, always shown once tested
CHECKS = (
    ('powers_on', 'Turns on', True),
    ('charges', 'Charges', True),
    ('holds_charge', 'Holds a charge', True),
    ('screen_touch', 'Screen and touch', False),
    ('buttons', 'Buttons', False),
    ('speaker_mic', 'Speaker and mic', False),
    ('cameras', 'Cameras', False),
    ('wifi', 'Wi-Fi', False),
)
# key, label, good answer's words, bad answer's words, always shown
LOCKS = (
    ('carrier_locked', 'Carrier lock', 'Unlocked', 'Locked', True),
    ('demo_locked', 'Demo lock', 'Not demo locked', 'Demo locked', True),
    ('activation_locked', 'iCloud / Google lock', 'Off', 'On', False),
)
CARRIERS = {
    'att': 'AT&T', 'verizon': 'Verizon', 'tmobile': 'T-Mobile', 'us_cellular': 'US Cellular',
    'cricket': 'Cricket', 'metro': 'Metro', 'boost': 'Boost', 'straight_talk': 'Straight Talk',
    'tracfone': 'Tracfone', 'visible': 'Visible', 'mint': 'Mint', 'other': 'Other',
}
TEXT_LIMITS = {'storage': 20, 'carrier_other': 40, 'note': 300}


def template_has_report(template: str) -> bool:
    return bool(TEMPLATES.get(template, {}).get('report'))


def clean_device_test(value) -> dict:
    """The stored shape, or a ValidationError naming the bad field. Unknown keys are refused."""
    if value in (None, ''):
        return {}
    if not isinstance(value, dict):
        raise serializers.ValidationError('Device test must be an object.')
    known = {'tested', 'carrier', 'battery_health', *TEXT_LIMITS, *(k for k, *_ in CHECKS), *(k for k, *_ in LOCKS)}
    unknown = sorted(set(value) - known)
    if unknown:
        raise serializers.ValidationError(f'Unknown device test field: {", ".join(unknown)}.')
    out: dict = {'tested': bool(value.get('tested'))}
    for key, *_ in CHECKS:
        v = value.get(key) or 'not_checked'
        if v not in PASS_FAIL:
            raise serializers.ValidationError(f'{key} must be pass, fail or not_checked.')
        out[key] = v
    for key, *_ in LOCKS:
        v = value.get(key) or 'not_checked'
        if v not in YES_NO:
            raise serializers.ValidationError(f'{key} must be yes, no or not_checked.')
        out[key] = v
    carrier = value.get('carrier') or ''
    if carrier and carrier not in CARRIERS:
        raise serializers.ValidationError('carrier is not on the list.')
    # The carrier is kept even when the lock is not 'yes', so switching back and forth loses nothing.
    out['carrier'] = carrier
    battery = value.get('battery_health')
    if battery in (None, ''):
        out['battery_health'] = None
    else:
        try:
            battery = int(battery)
        except (TypeError, ValueError):
            raise serializers.ValidationError('battery_health must be a whole number.') from None
        if not 0 <= battery <= 100:
            raise serializers.ValidationError('battery_health must be 0 to 100.')
        out['battery_health'] = battery
    for key, limit in TEXT_LIMITS.items():
        text = str(value.get(key) or '').strip()
        if len(text) > limit:
            raise serializers.ValidationError(f'{key} is longer than {limit} characters.')
        out[key] = text
    return out


def _carrier_name(test: dict) -> str:
    if test.get('carrier') == 'other':
        return test.get('carrier_other') or 'another carrier'
    return CARRIERS.get(test.get('carrier') or '', '')


def report_rows(template: str, test: dict | None) -> list[dict] | None:
    """The report as rows of {label, result, tone}; tone is 'good', 'bad' or 'none'. None when there is no report."""
    test = test or {}
    if not template_has_report(template) or not test.get('tested'):
        return None
    rows: list[dict] = []
    # Bill's five first, then the extra checks that were made.
    for first in (True, False):
        for key, label, always in CHECKS:
            v = test.get(key) or 'not_checked'
            if always != first or (v == 'not_checked' and not always):
                continue
            rows.append({'key': key, 'label': label, 'result': {'pass': 'Pass', 'fail': 'Fail'}.get(v, 'Not checked'),
                         'tone': {'pass': 'good', 'fail': 'bad'}.get(v, 'none')})
        for key, label, good, bad, always in LOCKS:
            v = test.get(key) or 'not_checked'
            if always != first or (v == 'not_checked' and not always):
                continue
            result = {'no': good, 'yes': bad}.get(v, 'Not checked')
            if key == 'carrier_locked' and v == 'yes' and _carrier_name(test):
                result = f'Locked to {_carrier_name(test)}'
            rows.append({'key': key, 'label': label, 'result': result,
                         'tone': {'no': 'good', 'yes': 'bad'}.get(v, 'none')})
    if test.get('battery_health') is not None:
        rows.append({'key': 'battery_health', 'label': 'Battery health', 'result': f'{test["battery_health"]}%', 'tone': 'none'})
    if test.get('storage'):
        rows.append({'key': 'storage', 'label': 'Storage', 'result': test['storage'], 'tone': 'none'})
    return rows


MARK = {'good': '✓', 'bad': '✗', 'none': '•'}


def report_text(template: str, test: dict | None, tested_on=None) -> str:
    """The report as plain text for channel copy (Facebook, eBay). Empty when there is no report."""
    rows = report_rows(template, test)
    if rows is None:
        return ''
    head = 'Tested by Eco-Thrift' + (f' on {tested_on:%b} {tested_on.day}, {tested_on.year}' if tested_on else '')
    lines = [f'{head}:'] + [f'{MARK[r["tone"]]} {r["label"]}: {r["result"]}' for r in rows]
    if (test or {}).get('note'):
        lines.append(f'Note: {test["note"]}')
    return '\n'.join(lines)
