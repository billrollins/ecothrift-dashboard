"""Applicant texts (Phase 6): interview booked / moved / cancelled, the day-before reminder, and the first-day reminder,
for applicants who ticked the text box. The words are in the careers file (``texts``); the opt-in confirmation is the
10DLC campaign's sample, word for word.

Everything goes through ``apps.texting.service.send``, which checks consent and, until texting is live, holds each text
(recorded, not sent). A staff button that texts (book, move, cancel) shows the text on the review screen first,
like its email (``compose``).
"""
from __future__ import annotations

from datetime import datetime, time, timedelta

from django.utils import timezone

from apps.hiring import compose
from apps.hiring.careers import (
    FIRST_DAY_VERSIONS, OPT_IN_TEXT, SMS_CONSENT_TEXT, SMS_CONSENT_VERSION, fill, load_setting,
)
from apps.hiring.models import ApplicationEvent
from apps.texting import service as texting
from apps.texting.models import TextConsent, TextMessage

KIND = TextConsent.KIND_JOB

LABELS = {
    'opt_in': 'Texts confirmation',
    'interview_booked': 'Interview booked',
    'interview_changed': 'Interview moved',
    'interview_cancelled': 'Interview cancelled',
    'interview_reminder': 'Interview reminder',
    'first_day': 'First-day reminder',
}

FIELD_LABELS = {
    'first_name': 'First name', 'role': 'Role', 'when': 'Interview time', 'place': 'Place (short)',
    'link': 'Their private link', 'start_date': 'First day', 'start_time': 'Start time', 'supervisor': 'Reports to',
}


def ref(application) -> str:
    return f'hiring.application:{application.pk}'


def short_when(dt: datetime) -> str:
    """'Wed, Oct 14 at 2:00 PM' (store time)."""
    local = timezone.localtime(dt)
    hour = local.strftime('%I').lstrip('0') or '12'
    return f'{local:%a}, {local:%b} {local.day} at {hour}:{local:%M %p}'


def template(key: str) -> str:
    return OPT_IN_TEXT if key == 'opt_in' else load_setting()['texts'][key]


def interview_values(interview) -> dict:
    from apps.hiring.interviews import public_link

    application = interview.application
    job = interview.job or application.jobs.order_by('sort_order').first()
    return {
        'first_name': application.first_name,
        'role': job.title if job else 'a role at Eco-Thrift',
        'when': short_when(interview.start),
        'place': load_setting()['texts']['place'],
        'link': public_link(application.booking_token) if application.booking_token else 'ecothrift.us/careers',
    }


def first_day_values(onboarding) -> dict:
    from apps.hiring.offers import time_text
    from apps.hiring.onboarding import _person

    user = onboarding.user
    return {
        'first_name': user.first_name or (user.full_name or '').split(' ')[0],
        'role': onboarding.position or 'our team',
        'start_date': f'{onboarding.start_date:%a}, {onboarding.start_date:%b} {onboarding.start_date.day}',
        'start_time': time_text(onboarding.start_time) or '9:00 AM',
        'supervisor': _person(onboarding.manager),
        'place': load_setting()['texts']['place'],
    }


def consent_summary(phone: str) -> dict:
    """For the applicant page: may we text them, and why (or why not). ``first_day``: their tick's wording also
    covers the first-day text (T71: the 2026-10-07 wording; an older tick gets interview texts only)."""
    if not texting.digits(phone):
        return {'state': 'no_number', 'at': None, 'how': '', 'first_day': False}
    state = texting.consent_state(phone, KIND)
    if state is None:
        return {'state': 'never', 'at': None, 'how': '', 'first_day': False}
    return {'state': 'agreed' if state.opted_in else 'stopped', 'at': state.at, 'how': state.how,
            'first_day': state.opted_in and state.wording_version in FIRST_DAY_VERSIONS}


def _draft(application, key: str, values: dict) -> dict:
    words = template(key)
    names = [n for n in FIELD_LABELS if '{' + n + '}' in words]
    summary = consent_summary(application.phone)
    allowed = summary['state'] == 'agreed' and not application.is_practice
    missing = texting.waiting_on()
    if application.is_practice:
        note = 'A practice run: never texted.'
    elif summary['state'] == 'no_number':
        note = 'No mobile number on file: no text.'
    elif summary['state'] == 'never':
        note = 'They did not tick the text box: no text.'
    elif summary['state'] == 'stopped':
        note = f'They asked not to be texted ({summary["how"]}): no text.'
    elif missing:
        note = 'Texting is not live yet, so this text is held: recorded on their history, not sent.'
    else:
        note = ''
    return {
        'key': key,
        'label': LABELS.get(key, key),
        'to': application.phone,
        'template': words,
        'values': {n: str(values.get(n, '')) for n in names},
        'fields': {n: FIELD_LABELS[n] for n in names},
        'allowed': allowed,
        'live': not missing,
        'note': note,
        'max': 320,
    }


def _log(application, message: TextMessage, label: str, by) -> None:
    text = {
        TextMessage.STATUS_SENT: f'Texted: {label}',
        TextMessage.STATUS_HELD: f'Text held: {label} (texting not live yet)',
        TextMessage.STATUS_FAILED: f'Text could not be sent: {label}',
        TextMessage.STATUS_OPTED_OUT: f'Not texted: {label} (they asked not to be texted)',
    }.get(message.status)
    if text is None:  # no consent, no number, practice: nothing to say on the history
        return
    ApplicationEvent.objects.create(
        application=application, kind=ApplicationEvent.KIND_TEXT, by=by, text=text + (' (edited)' if message.edited else ''),
        data={'text': message.key, 'status': message.status, 'body': message.body, 'message': message.pk,
              'edited': message.edited},
    )


def send(application, key: str, *, values: dict, by=None) -> TextMessage | None:
    """One applicant text. A review (staff button) shows it first; otherwise it goes (or is held) as it is."""
    review = compose.current() if key in compose.REVIEWED_TEXTS else None
    if review is not None and review.text_capture is not None:
        review.text_capture.append(_draft(application, key, values))
        return None
    by = by or (review.user if review is not None else None)
    label = LABELS.get(key, key)
    if review is not None and review.text_skip:
        if consent_summary(application.phone)['state'] == 'agreed':
            ApplicationEvent.objects.create(application=application, kind=ApplicationEvent.KIND_TEXT, by=by,
                                            text=f'Not texted: {label} (staff chose no text)', data={'text': key})
        return None
    words = template(key)
    used = review.text_body if review is not None and review.text_body is not None else words
    message = texting.send(
        phone=application.phone, kind=KIND, key=key, body=fill(used, values), ref=ref(application), by=by,
        practice=application.is_practice, edited=' '.join(used.split()) != ' '.join(words.split()),
        first_text=OPT_IN_TEXT, versions=FIRST_DAY_VERSIONS if key == 'first_day' else (),
    )
    _log(application, message, label, by)
    return message


def record_offer_tick(application) -> None:
    """The new hire ticked the text box on the offer page (the current wording, which covers the first day).
    The confirmation text follows unless they already had one."""
    if application.is_practice or not texting.digits(application.phone):
        return
    texting.record_consent(
        application.phone, kind=KIND, opted_in=True, how='Offer page (ticked when signing the offer)',
        wording_version=SMS_CONSENT_VERSION, wording=SMS_CONSENT_TEXT, ref=ref(application),
    )
    ApplicationEvent.objects.create(application=application, kind=ApplicationEvent.KIND_TEXT,
                                    text='Agreed to texts about their first day (offer page)', data={'consent': True})
    if not TextMessage.objects.filter(phone=texting.digits(application.phone), kind=KIND, key='opt_in').exists():
        send(application, 'opt_in', values={})


def record_opt_in(application) -> None:
    """Right after an application with the tick: the consent record, then the confirmation text."""
    if not application.sms_consent or application.is_practice:
        return
    texting.record_consent(
        application.phone, kind=KIND, opted_in=True, how='Online job application (ecothrift.us/careers)',
        wording_version=application.sms_consent_version or SMS_CONSENT_VERSION,
        wording=application.sms_consent_text or SMS_CONSENT_TEXT, ref=ref(application),
        at=application.sms_consent_at,
    )
    send(application, 'opt_in', values={})


def stop(application, *, by) -> None:
    """Staff: they asked not to be texted (recorded like a STOP; only they can opt back in, on a new application)."""
    who = (getattr(by, 'full_name', '') or '').strip() or getattr(by, 'email', '') or 'staff'
    texting.record_consent(application.phone, kind=KIND, opted_in=False, how=f'Staff: {who} (they asked)',
                           ref=ref(application), by=by)
    ApplicationEvent.objects.create(application=application, kind=ApplicationEvent.KIND_TEXT, by=by,
                                    text='Texts stopped: they asked not to be texted', data={'stopped': True})


def send_due_first_day(*, now: datetime | None = None) -> int:
    """The day-before first-day reminder, once per onboarding. Safe to run often."""
    from apps.hiring.models import Onboarding

    now = now or timezone.now()
    tz = timezone.get_current_timezone()
    count = 0
    candidates = Onboarding.objects.filter(
        status=Onboarding.STATUS_ACTIVE, first_day_text_at__isnull=True,
        start_date__gte=timezone.localdate(now), start_date__lte=timezone.localdate(now) + timedelta(days=1),
    ).select_related('application', 'user', 'manager')
    for onboarding in candidates:
        start = timezone.make_aware(datetime.combine(onboarding.start_date, onboarding.start_time or time(9, 0)), tz)
        if not (now + timedelta(hours=1) < start <= now + timedelta(hours=24)):
            continue
        onboarding.first_day_text_at = now
        onboarding.save(update_fields=['first_day_text_at'])
        if onboarding.application_id:
            send(onboarding.application, 'first_day', values=first_day_values(onboarding))
            count += 1
    return count


def recent(limit: int = 100) -> list[dict]:
    """The texts log for People → Emails: newest first, with whose application each was."""
    from apps.hiring.models import Application

    rows = list(TextMessage.objects.filter(kind=KIND).order_by('-created_at', '-id')[:limit])
    ids = {int(r.ref.split(':')[1]) for r in rows if r.ref.startswith('hiring.application:')}
    names = {a.pk: a.full_name for a in Application.objects.filter(pk__in=ids)}
    out = []
    for r in rows:
        app_id = int(r.ref.split(':')[1]) if r.ref.startswith('hiring.application:') else None
        out.append({
            'id': r.pk, 'at': r.created_at, 'key': r.key, 'label': LABELS.get(r.key, r.key), 'status': r.status,
            'status_label': r.get_status_display(), 'body': r.body, 'reason': r.reason, 'edited': r.edited,
            'phone_last4': r.phone[-4:] if r.phone else '',
            'applicant': {'id': app_id, 'name': names.get(app_id, '')} if app_id else None,
        })
    return out
