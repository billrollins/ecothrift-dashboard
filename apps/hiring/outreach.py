"""Reaching applicants (owner 2026-10-12): an Initial and a Reminder, by email and by text.

- **Email Initial** (the interview link): due as soon as they apply; staff send it (reviewed, as before).
- **Email Reminder** ("Don't miss out"): sent automatically 24 hours after they **apply** (never later: the window
  closes a day after that), once the Initial has gone and if they haven't booked. Applicants who applied before this
  went live (``AUTO_REMINDER_FROM``) get theirs by hand only ("Send now").
- **Text Initial / Reminder**: staff send these from their own phone (texting isn't wired): the page shows the
  message and the number to copy, then "Text sent" records it. The Reminder is due a day after the Initial.
- Nothing is due once they book an interview, or once the application has moved past Contacted.

Texts go to anyone with a phone except a number that asked to stop.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.hiring.models import Application, ApplicationEvent, Interview

REMINDER_AFTER = timedelta(days=1)
# The automatic reminder goes from 24 hours after applying until 48 hours: if it can't go in that window (the Initial
# wasn't sent yet), it is never sent late by itself (owner 2026-10-12).
AUTO_REMINDER_WINDOW = (timedelta(hours=24), timedelta(hours=48))
# Applications from before the automatic reminder went live (v2.161.0, 2026-10-12 13:07 CT) get it by hand only.
AUTO_REMINDER_FROM = datetime(2026, 10, 12, 18, 7, 46, tzinfo=dt_timezone.utc)
ACTIVE_STAGES = (Application.STAGE_NEW, Application.STAGE_REVIEWED, Application.STAGE_CONTACTED)

# Sent by hand from a phone, so no STOP line is needed. {first_name}, {role}, {link}.
# One text holds 160 characters; a longer one arrives in pieces, and some phones show the pieces apart, which breaks
# the link (owner 2026-10-12: an applicant couldn't open it). So the short link, and words that fit: the role drops
# out when a long name or title would go over. "Reply with a good time" is the way in when a phone blocks the link
# (a reply also turns links on in a text from an unknown number).
SMS_LIMIT = 160
HAND_TEXTS = {
    'initial': "Hi {first_name}, it's Eco-Thrift! Book your {role} interview: {link} (or reply with a good time)",
    'reminder': (
        "Hi {first_name}, Eco-Thrift again. Don't miss out, book your {role} interview: {link} "
        '(or reply with a good time)'
    ),
}
# The offer (owner 2026-10-19: "the same text option as the interview"): its private link, read and signed on the phone.
OFFER_TEXT = "Hi {first_name}, it's Eco-Thrift! Your {role} job offer is ready. Read and sign it here: {link}"
SHORT_OFFER_TEXT = "Hi {first_name}, it's Eco-Thrift! Your job offer is ready. Read and sign it here: {link}"
SHORT_TEXTS = {
    'initial': "Hi {first_name}, it's Eco-Thrift! Book your interview: {link} (or reply with a good time)",
    'reminder': "Hi {first_name}, Eco-Thrift again. Don't miss out, book your interview: {link} (or reply with a good time)",
}
TEXT_LABELS = {'initial': 'Interview link text', 'reminder': 'Reminder text', 'offer': 'Offer text'}
TEXT_FIELDS = {'initial': 'invite_texted_at', 'reminder': 'reminder_texted_at'}


def _booked(application, booked: bool | None = None) -> bool:
    if booked is not None:
        return booked
    return application.interviews.filter(status__in=(Interview.STATUS_SCHEDULED, Interview.STATUS_DONE)).exists()


def _stopped(application, stopped: bool | None = None) -> bool:
    if stopped is not None:
        return stopped
    from apps.hiring.texts import consent_summary

    return consent_summary(application.phone)['state'] == 'stopped'


def steps(application, *, now: datetime | None = None, booked: bool | None = None, stopped: bool | None = None) -> dict:
    """Where each of the four stands: ``at`` (sent), ``due`` (now), ``due_at`` / ``auto_at`` (later)."""
    now = now or timezone.now()
    active = application.stage in ACTIVE_STAGES and not _booked(application, booked)
    has_email = bool(application.email)
    can_text = bool(application.phone_digits or application.phone) and not _stopped(application, stopped)
    email_at, email_rem = application.invite_emailed_at, application.reminder_emailed_at
    text_at, text_rem = application.invite_texted_at, application.reminder_texted_at
    text_due_at = text_at + REMINDER_AFTER if text_at and not text_rem else None
    return {
        'active': active,
        'email_initial': {'at': email_at, 'due': active and has_email and not email_at},
        'email_reminder': {
            'at': email_rem, 'due': False,
            'auto_at': _auto_at(application, now) if active and has_email and email_at and not email_rem else None,
        },
        'text_initial': {'at': text_at, 'due': active and can_text and not text_at, 'stopped': not can_text and bool(application.phone)},
        'text_reminder': {
            'at': text_rem, 'due_at': text_due_at if active and can_text else None,
            'due': bool(active and can_text and text_due_at and now >= text_due_at),
        },
    }


def _auto_at(application, now: datetime) -> datetime | None:
    """When the automatic reminder goes (24 hours after applying), or None: in progress before it went live, or
    the window has closed."""
    if application.created_at < AUTO_REMINDER_FROM:
        return None
    start, end = (application.created_at + w for w in AUTO_REMINDER_WINDOW)
    return None if now > end else start


def _role(application) -> str:
    job = application.jobs.order_by('sort_order').first()
    return job.title if job else ''


def hand_text(which: str, *, first_name: str, role: str, link: str) -> str:
    """The text's words, kept to one message (SMS_LIMIT)."""
    if role:
        body = HAND_TEXTS[which].format(first_name=first_name, role=role, link=link)
        if len(body) <= SMS_LIMIT:
            return body
    return SHORT_TEXTS[which].format(first_name=first_name, link=link)


def _open_offer(application):
    from apps.hiring.models import Offer
    from apps.hiring.offers import refresh

    offer = application.offers.filter(status__in=Offer.OPEN).order_by('-sent_at').first()
    if offer is not None:
        refresh(offer)
    if offer is None or offer.status not in Offer.OPEN:
        raise ValidationError({'detail': 'There is no open offer to text.'})
    return offer


def offer_text(*, first_name: str, role: str, link: str) -> str:
    """The offer text, kept to one message (SMS_LIMIT): the position drops out when it would go over."""
    if role:
        body = OFFER_TEXT.format(first_name=first_name, role=role, link=link)
        if len(body) <= SMS_LIMIT:
            return body
    return SHORT_OFFER_TEXT.format(first_name=first_name, link=link)


def text_draft(application, which: str) -> dict:
    """The message and the number to copy. Makes the private interview link (and its short link) if there isn't one;
    ``offer`` texts the open offer's private link."""
    from apps.hiring.interviews import ensure_short_link

    if which not in HAND_TEXTS and which != 'offer':
        raise ValidationError({'detail': 'Pick the first text, the reminder, or the offer.'})
    if not application.phone:
        raise ValidationError({'detail': 'This applicant has no phone number.'})
    if _stopped(application):
        raise ValidationError({'detail': 'They asked not to be texted.'})
    if which == 'offer':
        from apps.hiring.offers import public_link

        offer = _open_offer(application)
        first = (application.first_name or '').strip() or 'there'
        body = offer_text(first_name=first, role=offer.position, link=public_link(offer.token))
        return {'which': which, 'phone': application.phone, 'body': body}
    link = ensure_short_link(application)
    first = (application.first_name or '').strip() or 'there'
    body = hand_text(which, first_name=first, role=_role(application), link=link)
    return {'which': which, 'phone': application.phone, 'body': body}


@transaction.atomic
def text_sent(application, which: str, *, by, body: str = '') -> Application:
    """"Text sent": record it on the history (with its words) and stop showing it as due."""
    from apps.hiring.interviews import _move_stage

    if which not in HAND_TEXTS and which != 'offer':
        raise ValidationError({'detail': 'Pick the first text, the reminder, or the offer.'})
    body = (body or text_draft(application, which)['body']).strip()
    if which == 'offer':
        # The offer's own steps (opened, signed) show on its card; the text only goes on the history.
        _open_offer(application)
        ApplicationEvent.objects.create(
            application=application, kind=ApplicationEvent.KIND_TEXT, by=by,
            text=f'Offer text sent by hand to {application.phone}',
            data={'text': 'hand_offer', 'status': 'sent_by_hand', 'body': body},
        )
        return application
    now = timezone.now()
    field = TEXT_FIELDS[which]
    setattr(application, field, now)
    fields = [field, 'updated_at']
    if not application.invited_at:
        application.invited_at = now
        fields.append('invited_at')
    application.save(update_fields=fields)
    ApplicationEvent.objects.create(
        application=application, kind=ApplicationEvent.KIND_TEXT, by=by,
        text=f'{TEXT_LABELS[which]} sent by hand to {application.phone}',
        data={'text': f'hand_{which}', 'status': 'sent_by_hand', 'body': body},
    )
    if application.stage in (Application.STAGE_NEW, Application.STAGE_REVIEWED):
        _move_stage(application, Application.STAGE_CONTACTED, by=by, text='')
    return application


def send_due_email_reminders(*, now: datetime | None = None) -> int:
    """The automatic "Don't miss out" email: 24 hours after they applied (the Initial sent, no interview booked),
    never later than 48 hours, and only for applications from after it went live."""
    from apps.hiring.interviews import remind_to_book

    now = now or timezone.now()
    due = (
        Application.objects.filter(stage__in=ACTIVE_STAGES, invite_emailed_at__isnull=False,
                                   reminder_emailed_at__isnull=True,
                                   created_at__gte=max(AUTO_REMINDER_FROM, now - AUTO_REMINDER_WINDOW[1]),
                                   created_at__lte=now - AUTO_REMINDER_WINDOW[0])
        .exclude(email='')
        .exclude(interviews__status__in=(Interview.STATUS_SCHEDULED, Interview.STATUS_DONE))
        .distinct()
    )
    sent = 0
    for application in due:
        try:
            if remind_to_book(application, by=None)['sent']:
                sent += 1
        except ValidationError:
            continue
    return sent


def returning(applications) -> dict[int, dict]:
    """For each application: worked here before (an employee record with this phone or email) and interviewed
    before (an earlier application with this phone or email had an interview done). Two queries for the lot."""
    from apps.accounts.models import EmployeeProfile

    apps_ = list(applications)
    digits = {a.phone_digits for a in apps_ if a.phone_digits}
    emails = {a.email.lower() for a in apps_ if a.email}
    out = {a.pk: {'worked_here': False, 'interviewed_before': False} for a in apps_}
    if not digits and not emails:
        return out

    # Everyone who has an employee record (a small list): compare email and the last 10 digits of the phone.
    def last10(raw: str) -> str:
        return ''.join(ch for ch in (raw or '') if ch.isdigit())[-10:]

    staff_rows = [(p.user.email.lower(), last10(p.user.phone), p.user_id)
                  for p in EmployeeProfile.objects.select_related('user')]

    earlier = (
        Application.objects.filter(Q(phone_digits__in=digits) | Q(email__in=emails))
        .filter(interviews__status=Interview.STATUS_DONE).distinct().values('pk', 'phone_digits', 'email', 'created_at')
    )
    earlier = list(earlier)
    for a in apps_:
        a_digits = last10(a.phone_digits)
        a_email = (a.email or '').lower()
        out[a.pk]['worked_here'] = any(
            uid != a.employee_user_id and ((a_email and email == a_email) or (a_digits and d == a_digits))
            for email, d, uid in staff_rows
        )
        out[a.pk]['interviewed_before'] = any(
            row['pk'] != a.pk and row['created_at'] < a.created_at
            and ((a.phone_digits and row['phone_digits'] == a.phone_digits) or (a_email and (row['email'] or '').lower() == a_email))
            for row in earlier
        )
    return out


def stopped_phones(applications) -> set[str]:
    """Numbers (digits) whose newest job-or-all consent says stop, for the lot."""
    from apps.texting.models import TextConsent
    from apps.texting import service as texting

    numbers = {texting.digits(a.phone) for a in applications if a.phone}
    numbers.discard('')
    if not numbers:
        return set()
    newest: dict[str, bool] = {}
    rows = TextConsent.objects.filter(phone__in=numbers, kind__in=(TextConsent.KIND_JOB, TextConsent.KIND_ALL)).order_by('-at', '-id')
    for row in rows.values('phone', 'opted_in'):
        newest.setdefault(row['phone'], row['opted_in'])
    return {phone for phone, opted_in in newest.items() if not opted_in}
