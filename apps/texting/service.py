"""Texting: consent records and the one way Dash texts anyone (house standard texting.md, D17).

``send()`` checks consent (no consent row, no text; the newest record wins; STOP ends every kind), shapes the words
(the sender's name first, a STOP line), and records the text. Nothing leaves until texting is **live**, which needs
all of these:

1. the send step written (``_deliver`` against Twilio's API with the account's messaging service; ``WIRED`` below).
   This app is the house sender: master's planned ``notify`` package was dropped (T60, 2026-10-07);
2. the Eco-Thrift Twilio account's key in the environment (typed by Bill; master is restructuring the account);
3. the ``texting.live`` switch on (after the 10DLC campaign is approved);
4. not a dev or test machine (dev never texts real numbers).

Until then every text is recorded as **held**, with what is still missing, so the owner can read exactly what would
have gone. When texting is live, the opt-in confirmation goes before anyone's first text of a kind.
"""
from __future__ import annotations

import logging
import re

from decouple import config
from django.conf import settings
from django.utils import timezone

from apps.texting.models import TextConsent, TextMessage

logger = logging.getLogger(__name__)

SENDER = 'Eco-Thrift:'
STOP_LINE = 'Reply STOP to opt out.'
TWILIO_KEYS = ('TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_FROM_NUMBER')
LIVE_SETTING = 'texting.live'
MAX_LENGTH = 320  # two text segments

# Set True only when _deliver() below really sends through Twilio (written when the account and key are ready).
WIRED = False

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
    if not WIRED:
        missing.append('the send step to Twilio')
    if not all(str(config(name, default='') or '').strip() for name in TWILIO_KEYS):
        missing.append('the Eco-Thrift Twilio key')
    if not _switch_on():
        missing.append('the switch (on once the 10DLC campaign is approved)')
    if settings.DEBUG:
        missing.append('production (dev never texts)')
    return missing


def live() -> bool:
    return not waiting_on()


def _deliver(number: str, body: str) -> tuple[bool, str, str]:
    """(sent, provider id, error). To write when the gates clear: Twilio's Messages API with the account's
    messaging service (house standard texting.md § Building it)."""
    raise RuntimeError('Texting is not wired to Twilio yet.')


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
