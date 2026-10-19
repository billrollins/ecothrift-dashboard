"""
Texted sign-in codes for the Thrift+ app (Join v2, owner 2026-10-19), through Twilio Verify (no SDK: two POSTs).

- **Live only in production with the keys:** ``TWILIO_ACCOUNT_SID``, ``TWILIO_API_KEY``, ``TWILIO_API_SECRET`` and
  ``TWILIO_VERIFY_SERVICE_SID`` all set, not DEBUG and not a test run. Otherwise ``available()`` is False and ``send``
  and ``check`` refuse: a dev or test machine never texts a real number (tests patch these).
- **US numbers only** (``us_number``): 10 digits (or +1), a real area code and exchange, never the 555-01xx fakes.
- Verify makes, texts and checks the 6-digit code; our own limits sit on top (``member_auth``).
"""
from __future__ import annotations

import logging
import re

from decouple import config
from django.conf import settings

logger = logging.getLogger(__name__)

KEYS = ('TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_VERIFY_SERVICE_SID')
VERIFY_URL = 'https://verify.twilio.com/v2/Services/{sid}/{what}'
TIMEOUT = 10


class PhoneCodeError(Exception):
    """Twilio refused or could not be reached."""


def _env(name: str) -> str:
    return str(config(name, default='') or '').strip()


def configured() -> bool:
    return all(_env(name) for name in KEYS)


def available() -> bool:
    """Texted codes can go out: the keys are set and this is production (never DEBUG, never a test run)."""
    return configured() and not settings.DEBUG and not getattr(settings, 'RUNNING_TESTS', False)


def us_number(raw: str | None) -> str:
    """A US phone number as 10 digits, or '' when it is not one: any format, with or without +1. The area code and the
    exchange start with 2-9 and are not N11; the 555 area code and the 555-01xx fiction numbers are refused (practice
    members use the 555 area code)."""
    digits = re.sub(r'\D', '', raw or '')
    if len(digits) == 11 and digits.startswith('1'):
        digits = digits[1:]
    if len(digits) != 10:
        return ''
    area, exchange, line = digits[:3], digits[3:6], digits[6:]
    if area[0] in '01' or exchange[0] in '01' or area[1:] == '11' or exchange[1:] == '11':
        return ''
    if area == '555' or (exchange == '555' and line.startswith('01')):
        return ''
    return digits


def masked(digits: str) -> str:
    return f'***-***-{digits[-4:]}' if digits else '***'


def _post(what: str, data: dict):
    import requests

    if not available():
        raise PhoneCodeError('Texted codes are off here (dev, a test run, or no Twilio keys).')
    url = VERIFY_URL.format(sid=_env('TWILIO_VERIFY_SERVICE_SID'), what=what)
    try:
        return requests.post(url, data=data, auth=(_env('TWILIO_API_KEY'), _env('TWILIO_API_SECRET')), timeout=TIMEOUT)
    except requests.RequestException as exc:
        raise PhoneCodeError(f'Twilio could not be reached: {exc.__class__.__name__}') from exc


def send(phone: str) -> None:
    """Text a Verify code to a US number (10 digits). Raises ``PhoneCodeError`` when Twilio refuses."""
    response = _post('Verifications', {'To': f'+1{phone}', 'Channel': 'sms'})
    if response.status_code >= 400:
        raise PhoneCodeError(f'Twilio refused the send ({response.status_code}).')


def check(phone: str, code: str) -> bool:
    """Whether the code is the one Verify texted to that number. A code Verify no longer knows (expired, used, too many
    tries: Twilio answers 404) is simply not right."""
    response = _post('VerificationCheck', {'To': f'+1{phone}', 'Code': code})
    if response.status_code == 404:
        return False
    if response.status_code >= 400:
        raise PhoneCodeError(f'Twilio refused the check ({response.status_code}).')
    try:
        return response.json().get('status') == 'approved'
    except ValueError:
        return False
