"""Interviews (Phase 2): open times, the private booking link, book / change / cancel, emails with .ics,
staff actions (interviewer, reschedule, done, no-show, scorecard), and day-before reminders.

One interview at a time across the store. Open times = the weekly hours in the careers file
(``interviews``), plus extra openings, minus blocked times, minus booked interviews.
"""
from __future__ import annotations

import secrets
from datetime import datetime, time, timedelta
from datetime import timezone as dt_timezone

from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.hiring import emails
from apps.hiring.careers import WEEKDAYS, load_setting, staff_users, template as email_template
from apps.hiring.models import Application, ApplicationEvent, Interview, InterviewTime

_LOCK_KEY = 738_204_117  # pg advisory lock: one booking decision at a time


# ── Settings and formatting ─────────────────────────────────────────────────


def config() -> dict:
    return load_setting()['interviews']


def _local(dt: datetime) -> datetime:
    return timezone.localtime(dt)


def when_text(dt: datetime) -> str:
    """'Tuesday, October 14 at 2:00 PM' (store time)."""
    local = _local(dt)
    hour = local.strftime('%I').lstrip('0') or '12'
    return f'{local.strftime("%A, %B")} {local.day} at {hour}:{local.strftime("%M %p")}'


def first_name(user) -> str:
    if not user:
        return 'our team'
    return (user.first_name or '').strip() or (user.full_name or '').strip() or user.email


def public_link(token: str) -> str:
    base = (getattr(settings, 'ONLINE_SALES_PUBLIC_BASE_URL', None) or 'https://ecothrift.us').rstrip('/')
    return f'{base}/careers/interview?t={token}'


# ── Open times ──────────────────────────────────────────────────────────────


def _slots_in(window_start: datetime, window_end: datetime, length: timedelta):
    cursor = window_start
    while cursor + length <= window_end:
        yield cursor, cursor + length
        cursor += length


def _overlaps(start: datetime, end: datetime, ranges) -> bool:
    return any(start < r_end and r_start < end for r_start, r_end in ranges)


def open_times(*, now: datetime | None = None, exclude: Interview | None = None) -> list[tuple[datetime, datetime]]:
    """Every bookable (start, end) from the minimum notice to ``days_ahead`` days out."""
    cfg = config()
    now = now or timezone.now()
    length = timedelta(minutes=int(cfg['length_minutes']))
    earliest = now + timedelta(hours=int(cfg['min_notice_hours']))
    first_day = timezone.localdate(now)
    last_day = first_day + timedelta(days=int(cfg['days_ahead']))
    tz = timezone.get_current_timezone()
    range_start = timezone.make_aware(datetime.combine(first_day, time.min), tz)
    range_end = timezone.make_aware(datetime.combine(last_day + timedelta(days=1), time.min), tz)

    extras = InterviewTime.objects.filter(start__lt=range_end, end__gt=range_start)
    blocks = [(t.start, t.end) for t in extras if t.kind == InterviewTime.KIND_BLOCK]
    windows = [(t.start, t.end) for t in extras if t.kind == InterviewTime.KIND_OPEN]
    booked_qs = Interview.objects.filter(status=Interview.STATUS_SCHEDULED, start__lt=range_end, end__gt=range_start)
    # A practice run never takes a time away from a real applicant.
    booked_qs = booked_qs.exclude(application__is_practice=True)
    if exclude is not None and exclude.pk:
        booked_qs = booked_qs.exclude(pk=exclude.pk)
    booked = list(booked_qs.values_list('start', 'end'))

    open_hour = time.fromisoformat(cfg['start'])
    close_hour = time.fromisoformat(cfg['end'])
    day = first_day
    while day <= last_day:
        if WEEKDAYS[day.weekday()] in cfg['weekdays']:
            windows.append((timezone.make_aware(datetime.combine(day, open_hour), tz),
                            timezone.make_aware(datetime.combine(day, close_hour), tz)))
        day += timedelta(days=1)

    out: set[tuple[datetime, datetime]] = set()
    for window_start, window_end in windows:
        for start, end in _slots_in(window_start, window_end, length):
            if start < earliest or start >= range_end:
                continue
            if _overlaps(start, end, blocks) or _overlaps(start, end, booked):
                continue
            out.add((start, end))
    return sorted(out)


def _parse_start(value) -> datetime:
    if isinstance(value, datetime):
        start = value
    else:
        try:
            start = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        except ValueError:
            raise ValidationError({'start': 'Pick a time from the list.'})
    if timezone.is_naive(start):
        start = timezone.make_aware(start, timezone.get_current_timezone())
    return start


# ── The private link ────────────────────────────────────────────────────────


def ensure_link(application: Application) -> str:
    """The applicant's booking link; a fresh one when there is none or it has run out."""
    now = timezone.now()
    if not application.booking_token or not application.booking_token_expires or \
            application.booking_token_expires <= now:
        application.booking_token = secrets.token_urlsafe(24)
    application.booking_token_expires = now + timedelta(days=int(config()['link_days']))
    application.save(update_fields=['booking_token', 'booking_token_expires', 'updated_at'])
    return public_link(application.booking_token)


def application_for_token(token: str) -> Application | None:
    token = (token or '').strip()
    if len(token) < 20:
        return None
    application = Application.objects.filter(booking_token=token).first()
    if application is None or application.stage in (Application.STAGE_HIRED, Application.STAGE_NOT_NOW):
        return None
    if not application.booking_token_expires or application.booking_token_expires <= timezone.now():
        return None
    return application


def current_interview(application: Application) -> Interview | None:
    return application.interviews.filter(status=Interview.STATUS_SCHEDULED).order_by('start').first()


# ── Emails ──────────────────────────────────────────────────────────────────


def _values(interview: Interview, *, action: str = '') -> dict:
    from apps.hiring.services import dash_link

    application = interview.application
    cfg = config()
    return emails.values_for(application, extra={
        'when': when_text(interview.start),
        'place': interview.place or cfg['place'],
        'interviewer': first_name(interview.interviewer),
        'link': public_link(application.booking_token) if application.booking_token else 'ecothrift.us/careers',
        'link_days': cfg['link_days'],
        'length': cfg['length_minutes'],
        'applicant': application.full_name,
        'action': action,
        'dash_link': dash_link(application),
    })


def ics(interview: Interview, *, cancel: bool = False) -> bytes:
    """A calendar file the phone understands (one event; same UID across changes)."""
    def stamp(dt: datetime) -> str:
        return dt.astimezone(dt_timezone.utc).strftime('%Y%m%dT%H%M%SZ')

    def clean(text: str) -> str:
        return (text or '').replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\n', '\\n')

    roles = ', '.join(j.title for j in interview.application.jobs.all()) or 'a role'
    lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eco-Thrift//Hiring//EN',
        f'METHOD:{"CANCEL" if cancel else "PUBLISH"}', 'BEGIN:VEVENT',
        f'UID:interview-{interview.pk}@ecothrift.us', f'SEQUENCE:{interview.ics_sequence}',
        f'DTSTAMP:{stamp(timezone.now())}', f'DTSTART:{stamp(interview.start)}', f'DTEND:{stamp(interview.end)}',
        f'SUMMARY:{clean(("[Practice] " if interview.application.is_practice else "") + f"Eco-Thrift interview: {interview.application.full_name} ({roles})")}',
        f'LOCATION:{clean(interview.place or config()["place"])}',
        f'DESCRIPTION:{clean(f"With {first_name(interview.interviewer)}. Ask at the register.")}',
        f'STATUS:{"CANCELLED" if cancel else "CONFIRMED"}', 'END:VEVENT', 'END:VCALENDAR',
    ]
    return ('\r\n'.join(lines) + '\r\n').encode('utf-8')


def _send_template(key: str, to, values: dict, *, application, attachment: bytes | None = None) -> bool:
    attachments = [('interview.ics', attachment, 'text/calendar')] if attachment else None
    return emails.send_template(key, to=to, template=email_template(key, application), values=values,
                                application=application, attachments=attachments, practice=application.is_practice)


def _staff_recipients(interview: Interview) -> list[str]:
    out = []
    people = [interview.interviewer, *(j.hiring_manager for j in interview.application.jobs.all())]
    for person in people:
        if person and person.is_active and person.email and person.email.lower() not in out:
            out.append(person.email.lower())
    return out


def _notify(interview: Interview, *, applicant_key: str, action: str, cancel: bool = False) -> bool:
    from apps.hiring import compose

    calendar = ics(interview, cancel=cancel)
    sent = False
    # No address: a review still shows the words, so they can be copied into a text.
    if interview.application.email or compose.capturing():
        sent = _send_template(applicant_key, interview.application.email, _values(interview),
                              application=interview.application, attachment=calendar)
    staff = _staff_recipients(interview)
    if staff:
        _send_template('interview_notice', staff, _values(interview, action=action), application=interview.application,
                       attachment=calendar)
    return sent


# ── Booking ─────────────────────────────────────────────────────────────────


def _event(application, text: str, *, by=None, data: dict | None = None, from_stage='', to_stage=''):
    kind = ApplicationEvent.KIND_STAGE if to_stage else ApplicationEvent.KIND_INTERVIEW
    return ApplicationEvent.objects.create(application=application, kind=kind, by=by, text=text, data=data or {},
                                           from_stage=from_stage, to_stage=to_stage)


def _move_stage(application, stage: str, *, by, text: str):
    if application.stage == stage:
        return
    previous = application.stage
    application.stage = stage
    application.stage_changed_at = timezone.now()
    application.save(update_fields=['stage', 'stage_changed_at', 'updated_at'])
    _event(application, text, by=by, from_stage=previous, to_stage=stage)


def default_interviewer(application):
    staff = staff_users()
    for job in application.jobs.all():
        person = job.interviewers.filter(pk__in=staff).order_by('first_name').first()
        if person:
            return person
    defaults = load_setting()['defaults']
    for email in defaults.get('interviewers') or []:
        person = staff.filter(email__iexact=email).first()
        if person:
            return person
    return next((j.hiring_manager for j in application.jobs.all() if j.hiring_manager_id), None)


@transaction.atomic
def book(application: Application, start_value, *, by=None, interviewer=None) -> Interview:
    """Book or move this applicant's interview to an open time. ``by`` None = the applicant."""
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(%s)', [_LOCK_KEY])
    start = _parse_start(start_value)
    existing = current_interview(application)
    times = dict(open_times(exclude=existing))
    if start not in times:
        raise ValidationError({'start': 'That time was just taken or is no longer open. Pick another.'})
    who = 'staff' if by else 'applicant'
    if existing:
        existing.start, existing.end = start, times[start]
        if interviewer is not None:
            existing.interviewer = interviewer
        existing.ics_sequence += 1
        existing.reminder_sent_at = None
        existing.save()
        _skip_reminder_if_close(existing)
        _event(application, f'Interview moved to {when_text(start)} (by {who})', by=by,
               data={'interview': existing.pk})
        _notify(existing, applicant_key='interview_changed', action='moved')
        return existing
    interview = Interview.objects.create(
        application=application,
        job=application.jobs.order_by('sort_order').first(),
        start=start,
        end=times[start],
        interviewer=interviewer or default_interviewer(application),
        place=config()['place'],
        booked_by=Interview.BY_STAFF if by else Interview.BY_APPLICANT,
    )
    _skip_reminder_if_close(interview)
    _event(application, f'Interview booked: {when_text(start)} with {first_name(interview.interviewer)} (by {who})',
           by=by, data={'interview': interview.pk})
    _move_stage(application, Application.STAGE_INTERVIEW_SCHEDULED, by=by, text='')
    _notify(interview, applicant_key='interview_booked', action='booked')
    return interview


def _skip_reminder_if_close(interview: Interview):
    """Booked under a day ahead: the confirmation is the reminder."""
    if interview.start - timezone.now() < timedelta(hours=24):
        interview.reminder_sent_at = timezone.now()
        interview.save(update_fields=['reminder_sent_at'])


@transaction.atomic
def cancel(interview: Interview, *, by=None, notify: bool = True) -> Interview:
    if interview.status != Interview.STATUS_SCHEDULED:
        raise ValidationError({'detail': 'This interview is not scheduled.'})
    interview.status = Interview.STATUS_CANCELLED
    interview.ics_sequence += 1
    interview.save(update_fields=['status', 'ics_sequence', 'updated_at'])
    application = interview.application
    who = 'staff' if by else 'applicant'
    _event(application, f'Interview cancelled: {when_text(interview.start)} (by {who})', by=by,
           data={'interview': interview.pk})
    if application.stage == Application.STAGE_INTERVIEW_SCHEDULED:
        _move_stage(application, Application.STAGE_CONTACTED, by=by, text='')
    if notify:
        _notify(interview, applicant_key='interview_cancelled', action='cancelled', cancel=True)
    return interview


# ── Staff ───────────────────────────────────────────────────────────────────


@transaction.atomic
def invite(application: Application, *, by, send: bool) -> dict:
    """Make (or reuse) the booking link; email it when ``send``. Moves New/Reviewed to Contacted."""
    if send and not application.email:
        raise ValidationError({'detail': 'This applicant has no email. Use Copy link and text it instead.'})
    link = ensure_link(application)
    application.invited_at = timezone.now()
    application.save(update_fields=['invited_at', 'updated_at'])
    sent = False
    if send:
        values = emails.values_for(application, extra={
            'link': link, 'link_days': config()['link_days'], 'length': config()['length_minutes'],
        })
        # The email itself goes on the history, with its words.
        sent = _send_template('interview_invite', application.email, values, application=application)
    else:
        _event(application, 'Interview link copied (to text or send)', by=by, data={'sent': False})
    if application.stage in (Application.STAGE_NEW, Application.STAGE_REVIEWED):
        _move_stage(application, Application.STAGE_CONTACTED, by=by, text='')
    return {'link': link, 'sent': sent}


def set_interviewer(interview: Interview, user, *, by) -> Interview:
    if interview.interviewer_id == (user.pk if user else None):
        return interview
    interview.interviewer = user
    interview.ics_sequence += 1
    interview.save(update_fields=['interviewer', 'ics_sequence', 'updated_at'])
    _event(interview.application, f'Interviewer: {first_name(user)}', by=by, data={'interview': interview.pk})
    staff = _staff_recipients(interview)
    if staff and interview.status == Interview.STATUS_SCHEDULED:
        _send_template('interview_notice', staff, _values(interview, action='assigned'),
                       application=interview.application, attachment=ics(interview))
    return interview


SCORE_OVERALL = ('hire', 'maybe', 'no')
SCORE_LEAD = ('yes', 'maybe', 'no')


def _clean_scorecard(raw: dict, interview: Interview) -> dict:
    questions = {q['key']: q for q in (interview.job.interview_questions if interview.job else []) or []}
    answers = []
    for item in (raw or {}).get('answers') or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get('key') or '')[:60]
        rating = item.get('rating')
        try:
            rating = int(rating) if rating not in (None, '') else None
        except (TypeError, ValueError):
            rating = None
        if rating is not None and not 1 <= rating <= 5:
            raise ValidationError({'answers': 'Ratings are 1 to 5.'})
        label = questions.get(key, {}).get('label') or str(item.get('label') or key)[:300]
        answers.append({'key': key, 'label': label, 'rating': rating, 'note': str(item.get('note') or '')[:2000]})
    overall = str((raw or {}).get('overall') or '')
    lead = str((raw or {}).get('lead_potential') or '')
    if overall and overall not in SCORE_OVERALL:
        raise ValidationError({'overall': 'Overall is hire, maybe or no.'})
    if lead and lead not in SCORE_LEAD:
        raise ValidationError({'lead_potential': 'Lead potential is yes, maybe or no.'})
    return {'answers': answers, 'overall': overall, 'lead_potential': lead,
            'notes': str((raw or {}).get('notes') or '')[:4000]}


@transaction.atomic
def save_scorecard(interview: Interview, raw: dict, *, by, done: bool = False) -> Interview:
    interview.scorecard = _clean_scorecard(raw, interview)
    interview.scored_by = by
    interview.scored_at = timezone.now()
    fields = ['scorecard', 'scored_by', 'scored_at', 'updated_at']
    if done and interview.status == Interview.STATUS_SCHEDULED:
        interview.status = Interview.STATUS_DONE
        fields.append('status')
    interview.save(update_fields=fields)
    application = interview.application
    overall = interview.scorecard.get('overall')
    _event(application, 'Interview done' + (f': {overall}' if overall else '') if done else 'Scorecard saved',
           by=by, data={'interview': interview.pk, 'overall': overall})
    if done and application.stage in (Application.STAGE_INTERVIEW_SCHEDULED, Application.STAGE_CONTACTED,
                                      Application.STAGE_REVIEWED, Application.STAGE_NEW):
        _move_stage(application, Application.STAGE_INTERVIEWED, by=by, text='')
    return interview


@transaction.atomic
def mark_no_show(interview: Interview, *, by) -> Interview:
    if interview.status != Interview.STATUS_SCHEDULED:
        raise ValidationError({'detail': 'Only a scheduled interview can be a no-show.'})
    interview.status = Interview.STATUS_NO_SHOW
    interview.save(update_fields=['status', 'updated_at'])
    _event(interview.application, f'No-show: {when_text(interview.start)}', by=by, data={'interview': interview.pk})
    return interview


# ── Reminders ───────────────────────────────────────────────────────────────


def send_due_reminders(*, now: datetime | None = None) -> int:
    """Remind applicants the day before. Safe to run often: each interview is reminded once."""
    now = now or timezone.now()
    due = (Interview.objects.select_related('application', 'interviewer')
           .filter(status=Interview.STATUS_SCHEDULED, reminder_sent_at__isnull=True,
                   start__gt=now + timedelta(hours=1), start__lte=now + timedelta(hours=24)))
    sent = 0
    for interview in due:
        interview.reminder_sent_at = now
        interview.save(update_fields=['reminder_sent_at'])
        if interview.application.email and _send_template(
                'interview_reminder', interview.application.email, _values(interview),
                application=interview.application):
            sent += 1
            _event(interview.application, 'Interview reminder sent', data={'interview': interview.pk})
    return sent
