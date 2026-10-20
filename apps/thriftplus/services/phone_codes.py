"""
Texted sign-in codes for the Thrift+ app (Join v2, owner 2026-10-19), through Twilio Verify (no SDK: two POSTs).

- **Live only in production with the keys:** ``TWILIO_ACCOUNT_SID``, ``TWILIO_API_KEY``, ``TWILIO_API_SECRET`` and
  ``TWILIO_VERIFY_SERVICE_SID`` all set, not DEBUG and not a test run. Otherwise ``available()`` is False and ``send``
  and ``check`` refuse: a dev or test machine never texts a real number (tests patch these).
- **US numbers only** (``us_number``): 10 digits (or +1), a real area code and exchange, never the 555-01xx fakes.
- Verify makes, texts and checks the 6-digit code; our own limits sit on top (``member_auth``).
- **Our own number (Phase 4, owner 2026-10-20):** with the ``thrift_plus.own_number_codes`` switch ON (default OFF),
  we make the code, keep only keyed hashes of it (``PhoneCode``), text it from the toll-free number
  (``apps.texting.service.send_sign_in_text``, which honors the stop list first) and check it ourselves: 10 minutes,
  one use, 5 wrong tries kill it. The send and try limits and the 15-minute lock on top are the same (``member_auth``).
  OFF: Verify, exactly as before. Dev and tests never text either way.
"""
from __future__ import annotations

import hmac
import logging
import re
import secrets
from datetime import timedelta

from decouple import config
from django.conf import settings
from django.utils import timezone
from django.utils.crypto import salted_hmac

logger = logging.getLogger(__name__)

KEYS = ('TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_VERIFY_SERVICE_SID')
VERIFY_URL = 'https://verify.twilio.com/v2/Services/{sid}/{what}'
TIMEOUT = 10
OWN_CODE_MINUTES = 10
OWN_CODE_TRIES = 5  # wrong codes before one texted code dies


class PhoneCodeError(Exception):
    """Twilio refused or could not be reached."""


def _env(name: str) -> str:
    return str(config(name, default='') or '').strip()


def configured() -> bool:
    return all(_env(name) for name in KEYS)


def own_number_on() -> bool:
    """The ``thrift_plus.own_number_codes`` switch: we send and check the codes from our own number."""
    from apps.texting import service as texting

    return texting.own_number_on()


def available() -> bool:
    """Texted codes can go out: production (never DEBUG, never a test run) with the keys for the way in use: our own
    number's sender when the switch is on, else the Verify keys."""
    if own_number_on():
        from apps.texting import service as texting

        return texting.sender_ready()
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


def _own_hash(value: str, what: str) -> str:
    return salted_hmac(f'thriftplus.phone-code.{what}', value, algorithm='sha256').hexdigest()


def _own_send(phone: str) -> None:
    from apps.texting import service as texting
    from apps.thriftplus.models import PhoneCode

    if not texting.sender_ready():
        raise PhoneCodeError('Texted codes are off here (dev, a test run, or no Twilio keys).')
    code = f'{secrets.randbelow(1_000_000):06d}'
    key = _own_hash(phone, 'number')
    now = timezone.now()
    PhoneCode.objects.filter(phone_hash=key, used_at__isnull=True).update(used_at=now)  # only the newest code works
    row = PhoneCode.objects.create(phone_hash=key, code_hash=_own_hash(f'{phone}:{code}', 'code'),
                                   expires_at=now + timedelta(minutes=OWN_CODE_MINUTES))
    message = texting.send_sign_in_text(
        phone=phone, key='sign_in_code', ref=f'phonecode:{row.pk}',
        body=f'Eco-Thrift: Your Thrift+ sign-in code is {code}. It works for {OWN_CODE_MINUTES} minutes. '
             f'Reply STOP to opt out.')
    if message.status != message.STATUS_SENT:
        PhoneCode.objects.filter(pk=row.pk).update(used_at=timezone.now())
        raise PhoneCodeError(f'The code text was not sent ({message.status}).')


def _own_check(phone: str, code: str) -> bool:
    from django.db import transaction
    from django.db.models import F

    from apps.thriftplus.models import PhoneCode

    with transaction.atomic():
        row = (PhoneCode.objects.select_for_update()
               .filter(phone_hash=_own_hash(phone, 'number'), used_at__isnull=True).order_by('-created_at', '-pk').first())
        now = timezone.now()
        if row is None or row.expires_at <= now or row.wrong_codes >= OWN_CODE_TRIES:
            return False
        if not hmac.compare_digest(row.code_hash, _own_hash(f'{phone}:{code}', 'code')):
            PhoneCode.objects.filter(pk=row.pk).update(wrong_codes=F('wrong_codes') + 1)
            return False
        PhoneCode.objects.filter(pk=row.pk).update(used_at=now)
        return True


def send(phone: str) -> None:
    """Text a code to a US number (10 digits): ours when the switch is on, else a Verify code. Raises
    ``PhoneCodeError`` when it could not go out."""
    if own_number_on():
        return _own_send(phone)
    response = _post('Verifications', {'To': f'+1{phone}', 'Channel': 'sms'})
    if response.status_code >= 400:
        raise PhoneCodeError(f'Twilio refused the send ({response.status_code}).')


def check(phone: str, code: str) -> bool:
    """Whether the code is the one Verify texted to that number. A code Verify no longer knows (expired, used, too many
    tries: Twilio answers 404) is simply not right. With the switch on, the code is ours to check."""
    if own_number_on():
        return _own_check(phone, code)
    response = _post('VerificationCheck', {'To': f'+1{phone}', 'Code': code})
    if response.status_code == 404:
        return False
    if response.status_code >= 400:
        raise PhoneCodeError(f'Twilio refused the check ({response.status_code}).')
    try:
        return response.json().get('status') == 'approved'
    except ValueError:
        return False
