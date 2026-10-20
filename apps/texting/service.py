"""Texting: consent records and the one way Dash texts anyone (house standard texting.md, D17).

``send()`` checks consent (no consent row, no text; the newest record wins; STOP ends every kind), shapes the words
(the sender's name first, a STOP line), and records the text. Nothing leaves until texting is **live**, which needs
all of these:

1. the send step written (``_deliver`` against Twilio's Messages API with the Messaging Service or the toll-free number;
   ``WIRED`` below, true since 2026-10-20). This app is the house sender: master's planned ``notify`` package was
   dropped (T60, 2026-10-07);
2. the Eco-Thrift Twilio account's key and a sender (``TWILIO_MESSAGING_SERVICE_SID`` or ``TWILIO_FROM_NUMBER``) in the environment;
3. the ``texting.live`` switch on (after the 10DLC campaign is approved);
4. not a dev or test machine (dev never texts real numbers).

Until then every text is recorded as **held**, with what is still missing, so the owner can read exactly what would
have gone. When texting is live, the opt-in confirmation goes before anyone's first text of a kind.

Thrift+ sign-in texts (Phase 4, owner 2026-10-20) are a separate path: ``send_sign_in_text`` (a code the customer asks
for, or a link staff text them). They need no consent row, only that the number is not on the stop list, and they have
their own switch, ``thrift_plus.own_number_codes`` (``own_number_on``). ``handle_inbound`` is Twilio's STOP / HELP webhook
(``views.py``).
"""
from __future__ import annotations

import logging
import re

from decouple import config
from django.conf import settings
from django.utils import timezone

from apps.texting.models import EmailConsent, TextConsent, TextMessage

logger = logging.getLogger(__name__)

SENDER = 'Eco-Thrift:'
STOP_LINE = 'Reply STOP to opt out.'
TWILIO_KEYS = ('TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET')
# Owner 2026-10-20 (Phase 4): the toll-free number sends through a Messaging Service (``TWILIO_MESSAGING_SERVICE_SID``),
# or straight from the number (``TWILIO_FROM_NUMBER``) when there is no service. Either one completes the sender.
SENDER_KEYS = ('TWILIO_MESSAGING_SERVICE_SID', 'TWILIO_FROM_NUMBER')
MESSAGES_URL = 'https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json'
TIMEOUT = 10
OWN_NUMBER_SETTING = 'thrift_plus.own_number_codes'
LIVE_SETTING = 'texting.live'
MAX_LENGTH = 320  # two text segments

# True now that _deliver() below really sends through Twilio (Phase 4, 2026-10-20). Nothing leaves until the other gates
# in the docstring clear; sign-in texts have their own switch (``own_number_on``).
WIRED = True

# D20 (Bill, 2026-10-08; standards T73): email first, texting parked. No text tick is offered anywhere and nothing is
# texted; the records and this code stay. Set False only when Bill brings texting back.
PARKED = True

_STOP = re.compile(r'\bSTOP\b')


# ── Numbers and words ───────────────────────────────────────────────────────


def digits(phone: str | None) -> str:
    """A US mobile number as 10 digits ('' when it is not one)."""
    raw = re.sub(r'\D', '', phone or '')
    if len(raw) == 11 and raw.startswith('1'):
        raw = raw[1:]
    return raw if len(raw) == 10 else ''


def masked(number: str) -> str:
    return f'***-***-{number[-4:]}' if number else '(none)'


def shape(body: str) -> str:
    """Every text starts with the sender's name and carries a way to stop."""
    text = '\n'.join(line.rstrip() for line in (body or '').replace('\r\n', '\n').strip().split('\n'))
    if not text.startswith(SENDER):
        text = f'{SENDER} {text}'
    if not _STOP.search(text):
        text = f'{text} {STOP_LINE}'
    return text


# ── Consent ─────────────────────────────────────────────────────────────────


def record_consent(phone: str, *, kind: str, opted_in: bool, how: str, wording_version: str = '', wording: str = '',
                   ref: str = '', by=None, at=None) -> TextConsent | None:
    number = digits(phone)
    if not number:
        return None
    return TextConsent.objects.create(
        phone=number, kind=kind, opted_in=opted_in, how=how[:160], wording_version=wording_version[:40],
        wording=wording, ref=ref[:80], by=by, at=at or timezone.now(),
    )


# ── Email consent (shared: Thrift+ sign-up boxes; T73) ─────────────────────


_EMAIL = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def normalize_email(email: str | None) -> str:
    """Lower-case and trimmed ('' when it is not an email address)."""
    value = (email or '').strip().lower()
    return value if len(value) <= 254 and _EMAIL.match(value) else ''


def record_email_consent(email: str, *, kind: str, opted_in: bool, how: str, wording_version: str = '',
                         wording: str = '', ref: str = '', by=None, at=None) -> EmailConsent | None:
    address = normalize_email(email)
    if not address:
        return None
    return EmailConsent.objects.create(
        email=address, kind=kind, opted_in=opted_in, how=how[:160], wording_version=wording_version[:40],
        wording=wording, ref=ref[:80], by=by, at=at or timezone.now(),
    )


def email_consent_state(email: str, kind: str) -> EmailConsent | None:
    """The newest record that decides whether this kind may be emailed to this address ('all' = unsubscribe)."""
    address = normalize_email(email)
    if not address:
        return None
    return EmailConsent.objects.filter(email=address, kind__in=(kind, EmailConsent.KIND_ALL)).order_by(
        '-at', '-id').first()


def may_email(email: str, kind: str) -> bool:
    state = email_consent_state(email, kind)
    return bool(state and state.opted_in)


def record_stop(phone: str, *, how: str = 'Replied STOP', by=None) -> TextConsent | None:
    """STOP ends every kind of text to this number until they opt back in."""
    return record_consent(phone, kind=TextConsent.KIND_ALL, opted_in=False, how=how, by=by)


def consent_state(phone: str, kind: str) -> TextConsent | None:
    """The newest record that decides whether this kind may be texted to this number."""
    number = digits(phone)
    if not number:
        return None
    return TextConsent.objects.filter(phone=number, kind__in=(kind, TextConsent.KIND_ALL)).order_by('-at', '-id').first()


def may_text(phone: str, kind: str) -> bool:
    state = consent_state(phone, kind)
    return bool(state and state.opted_in)


# ── Live or held ────────────────────────────────────────────────────────────


def _switch_on() -> bool:
    from apps.core.models import AppSetting

    row = AppSetting.objects.filter(key=LIVE_SETTING).first()
    return bool(row and row.value is True)


def waiting_on() -> list[str]:
    """What still stands between Dash and a real text (empty = live)."""
    missing = []
    if PARKED:
        missing.append('texting is parked (email first, D20)')
    if not WIRED:
        missing.append('the send step to Twilio')
    if not sender_configured():
        missing.append('the Eco-Thrift Twilio key')
    if not _switch_on():
        missing.append('the switch (on once the 10DLC campaign is approved)')
    if settings.DEBUG:
        missing.append('production (dev never texts)')
    return missing


def live() -> bool:
    return not waiting_on()


def _env(name: str) -> str:
    return str(config(name, default='') or '').strip()


def sender_configured() -> bool:
    """The Twilio key and a way to send (the Messaging Service or the number) are in the environment."""
    return all(_env(name) for name in TWILIO_KEYS) and any(_env(name) for name in SENDER_KEYS)


def sender_ready() -> bool:
    """A text can really leave: the sender is configured and this is production (never DEBUG, never a test run)."""
    return sender_configured() and not settings.DEBUG and not getattr(settings, 'RUNNING_TESTS', False)


def _deliver(number: str, body: str) -> tuple[bool, str, str]:
    """(sent, provider id, error): Twilio's Messages API (no SDK) from the toll-free number, through the Messaging
    Service when one is set. Never reached from dev or a test run (``sender_ready``); tests mock this."""
    import requests

    if not sender_ready():
        return False, '', 'The sender is off here (dev, a test run, or no Twilio keys).'
    data = {'To': f'+1{number}', 'Body': body}
    if _env('TWILIO_MESSAGING_SERVICE_SID'):
        data['MessagingServiceSid'] = _env('TWILIO_MESSAGING_SERVICE_SID')
    else:
        data['From'] = _env('TWILIO_FROM_NUMBER')
    try:
        response = requests.post(MESSAGES_URL.format(sid=_env('TWILIO_ACCOUNT_SID')), data=data,
                                 auth=(_env('TWILIO_API_KEY'), _env('TWILIO_API_SECRET')), timeout=TIMEOUT)
    except requests.RequestException as exc:
        return False, '', f'Twilio could not be reached: {exc.__class__.__name__}'
    if response.status_code >= 400:
        return False, '', f'Twilio refused the text ({response.status_code}).'
    try:
        return True, str(response.json().get('sid') or '')[:64], ''
    except ValueError:
        return True, '', ''


# ── Sign-in texts from our own number (Phase 4, owner 2026-10-20) ───────────
#
# A code the customer asks for, or a staff-sent sign-in link, is not a marketing or notice text: it needs no consent
# row (asking for it is the consent, J18), only that the number has not said STOP. Its own switch
# (``thrift_plus.own_number_codes``, default OFF) decides whether any of it goes out from our number.


def own_number_on() -> bool:
    from apps.core.models import AppSetting

    row = AppSetting.objects.filter(key=OWN_NUMBER_SETTING).first()
    return bool(row and (row.value is True or str(row.value).lower() in ('true', '1', 'yes', 'on')))


def stopped(phone: str) -> bool:
    """The number is on the stop list: its newest "every kind" record is a STOP and nothing has opted it back in since.
    Honored before any send."""
    number = digits(phone)
    if not number:
        return False
    newest = TextConsent.objects.filter(phone=number, kind=TextConsent.KIND_ALL).order_by('-at', '-id').first()
    if newest is None or newest.opted_in:
        return False
    return not TextConsent.objects.filter(phone=number, opted_in=True, id__gt=newest.id).exists()


def send_sign_in_text(*, phone: str, key: str, body: str, ref: str = '', by=None) -> TextMessage:
    """Text a sign-in code or link from our number (``key``: ``sign_in_code`` or ``sign_in_link``). Recorded either way:
    sent, failed, or not sent because the number said STOP. The code or the link's token is kept hidden in the record."""
    number = digits(phone)
    text = shape(body)
    kept = text
    if key == 'sign_in_code':
        kept = re.sub(r'\b\d{6}\b', '######', text)
    elif key == 'sign_in_link':
        kept = re.sub(r'signin=\S+', 'signin=######', text)
    kind = TextConsent.KIND_THRIFTPLUS
    if not number:
        return TextMessage.objects.create(phone='', kind=kind, key=key, body=kept,
                                          status=TextMessage.STATUS_NO_NUMBER, ref=ref, by=by)
    if stopped(number):
        return TextMessage.objects.create(phone=number, kind=kind, key=key, body=kept,
                                          status=TextMessage.STATUS_OPTED_OUT, reason='Replied STOP', ref=ref, by=by)
    try:
        ok, provider_id, error = _deliver(number, text)
    except Exception as exc:  # noqa: BLE001 - a text never breaks the action that sent it
        ok, provider_id, error = False, '', str(exc)[:200]
    return TextMessage.objects.create(
        phone=number, kind=kind, key=key, body=kept, ref=ref, by=by,
        status=TextMessage.STATUS_SENT if ok else TextMessage.STATUS_FAILED, reason=error[:200],
        provider_id=provider_id, sent_at=timezone.now() if ok else None,
    )


# ── Inbound: STOP and HELP (the words given to Twilio's toll-free review) ───

HELP_REPLY = ('Eco-Thrift: These texts are Thrift+ sign-in codes and links you asked for. Help: call (402) 881-9861 or '
              'visit ecothrift.us/terms. Msg & data rates may apply. Reply STOP to opt out.')
STOP_WORDS = {'STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'}
START_WORDS = {'START', 'UNSTOP', 'YES'}
HELP_WORDS = {'HELP', 'INFO'}


def handle_inbound(phone: str, body: str, *, verified: bool) -> str | None:
    """What a customer replied. STOP words put the number on the stop list (every kind). HELP answers the submitted
    help text (the reply, or None for nothing to say). START takes the number off the stop list only when Twilio's
    signature proved the message is really Twilio's (``verified``); an unsigned START is ignored."""
    word = re.sub(r'[^A-Za-z]', '', body or '').upper()  # the whole message, as the carriers read it
    if word in STOP_WORDS:
        record_stop(phone, how='Replied STOP')
        return None  # Twilio sends the carriers' STOP confirmation itself
    if word in START_WORDS:
        if verified and stopped(phone):
            record_consent(phone, kind=TextConsent.KIND_ALL, opted_in=True, how='Replied START')
        return None
    if word in HELP_WORDS:
        return HELP_REPLY
    return None


# ── Send ────────────────────────────────────────────────────────────────────


def send(*, phone: str, kind: str, key: str, body: str, ref: str = '', by=None, practice: bool = False,
         edited: bool = False, first_text: str = '', versions: tuple[str, ...] = ()) -> TextMessage:
    """Record (and, once live, send) one text. ``first_text``: the opt-in confirmation for this kind, sent first
    to anyone who has not had it yet. ``versions``: only a consent given on one of these wordings covers this text."""
    number = digits(phone)
    text = shape(body)
    status, reason = TextMessage.STATUS_HELD, ''
    if not number:
        status = TextMessage.STATUS_NO_NUMBER
    elif practice:
        status, reason = TextMessage.STATUS_PRACTICE, 'Practice runs are never texted.'
    else:
        state = consent_state(number, kind)
        if state is None:
            status = TextMessage.STATUS_NO_CONSENT
        elif not state.opted_in:
            status, reason = TextMessage.STATUS_OPTED_OUT, state.how
        elif versions and state.wording_version not in versions:
            status, reason = TextMessage.STATUS_NO_CONSENT, (
                f'Their tick ({state.wording_version or "older wording"}) does not cover this text.')
    if status == TextMessage.STATUS_HELD:
        missing = waiting_on()
        if missing:
            reason = 'Texting is not live yet. Waiting on: ' + '; '.join(missing) + '.'
        else:
            if first_text and key != 'opt_in' and not TextMessage.objects.filter(
                    phone=number, kind=kind, key='opt_in', status=TextMessage.STATUS_SENT).exists():
                send(phone=number, kind=kind, key='opt_in', body=first_text, ref=ref, by=by)
            try:
                ok, provider_id, error = _deliver(number, text)
            except Exception as exc:  # noqa: BLE001 - a text never breaks the action that sent it
                ok, provider_id, error = False, '', str(exc)[:200]
            message = TextMessage.objects.create(
                phone=number, kind=kind, key=key, body=text, ref=ref, by=by, edited=edited,
                status=TextMessage.STATUS_SENT if ok else TextMessage.STATUS_FAILED, reason=error,
                provider_id=provider_id, sent_at=timezone.now() if ok else None,
            )
            return message
    message = TextMessage.objects.create(phone=number, kind=kind, key=key, body=text, status=status,
                                         reason=reason[:200], ref=ref, by=by, edited=edited)
    if status == TextMessage.STATUS_HELD:
        logger.info('Text held (%s) to %s: %s', key, masked(number), text)
    return message
