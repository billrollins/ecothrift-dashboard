"""Applications: build the answer snapshot, apply, move stages, Not now, create the employee."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.hiring import emails
from apps.hiring.careers import (
    SMS_CONSENT_TEXT, SMS_CONSENT_VERSION, fill, load_setting, not_now_template,
)
from apps.hiring.models import Application, ApplicationEvent, Job

STAGES = [key for key, _ in Application.STAGE_CHOICES]


def digits_of(phone: str) -> str:
    return ''.join(ch for ch in (phone or '') if ch.isdigit())[-20:]
REASONS = dict(Application.NOT_NOW_REASONS)


def dash_link(application) -> str:
    host = (getattr(settings, 'STAFF_DASHBOARD_HOST', '') or 'dash.ecothrift.us').strip()
    scheme = 'http' if host.startswith(('localhost', '127.0.0.1')) else 'https'
    return f'{scheme}://{host}/people/applicants?id={application.pk}'


# ── Answers ─────────────────────────────────────────────────────────────────


def _clean_answer(question: dict, raw):
    """Normalize one answer by type. Returns (value, error)."""
    qtype = question['type']
    if raw is None or raw == '' or raw == []:
        return None, None
    if qtype == 'yes_no':
        value = str(raw).strip().lower()
        if value in ('yes', 'true', '1', 'y'):
            return 'yes', None
        if value in ('no', 'false', '0', 'n'):
            return 'no', None
        return None, 'Answer yes or no.'
    if qtype == 'number':
        try:
            number = float(str(raw).strip())
        except ValueError:
            return None, 'Enter a number.'
        if number < 0 or number > 1000:
            return None, 'Enter a number between 0 and 1000.'
        return int(number) if number == int(number) else number, None
    if qtype == 'choice':
        value = str(raw).strip()
        if value not in question.get('options', []):
            return None, 'Pick one of the choices.'
        return value, None
    if qtype == 'multi':
        values = raw if isinstance(raw, list) else [raw]
        picked = [str(v).strip() for v in values if str(v).strip() in question.get('options', [])]
        return (picked or None), None
    limit = 4000 if qtype == 'long_text' else 300
    return str(raw).strip()[:limit], None


def build_answers(*, form_questions: list[dict], jobs: list[Job], raw: dict) -> tuple[list[dict], dict, int]:
    """The answer snapshot, field errors keyed by question key, and the red-flag count."""
    snapshot, errors, red = [], {}, 0
    blocks = [(None, q) for q in form_questions]
    for job in jobs:
        blocks += [(job, q) for q in (job.questions or [])]
    for job, question in blocks:
        key = f'{job.slug}.{question["key"]}' if job else question['key']
        value, error = _clean_answer(question, raw.get(key))
        if error:
            errors[key] = error
        elif value is None and question.get('required'):
            errors[key] = 'Required.'
        entry = {
            'key': key,
            'label': question['label'],
            'type': question['type'],
            'answer': value,
        }
        if job:
            entry['job'] = job.slug
        if question.get('must_be'):
            ok = value == question['must_be'] if value is not None else None
            entry.update({'must_be': question['must_be'], 'flag_label': question.get('flag_label') or question['label'],
                          'ok': ok})
            if ok is False:
                red += 1
        snapshot.append(entry)
    return snapshot, errors, red


def flags_of(application) -> list[dict]:
    return [
        {'key': a['key'], 'label': a.get('flag_label') or a['label'], 'ok': a.get('ok')}
        for a in application.answers or [] if a.get('must_be')
    ]


# ── Practice runs ───────────────────────────────────────────────────────────

PRACTICE_FIRST = 'Practice'
PRACTICE_LAST = 'Applicant'
PRACTICE_PHONE = '402-555-0100'  # 555-01xx numbers are reserved for fiction


def practice_answer(question: dict):
    """A stand-in for a blank answer. Must-haves get the passing answer, so a practice run stays green."""
    qtype = question['type']
    options = question.get('options') or []
    if qtype == 'yes_no':
        return question.get('must_be') or 'yes'
    if qtype == 'number':
        return 20
    if qtype == 'choice':
        return options[0] if options else 'Practice'
    if qtype == 'multi':
        return options[:1] or ['Practice']
    if qtype == 'date':
        return (timezone.localdate() + timedelta(days=7)).isoformat()
    if qtype == 'time':
        return '09:00'
    if qtype == 'long_text':
        return 'Practice answer (left blank).'
    return 'Practice answer'


def practice_fill(*, form_questions: list[dict], jobs: list[Job], raw: dict) -> dict:
    """The raw answers with every required or must-have question that was left blank (or wrong) filled in."""
    out = dict(raw)
    blocks = [(None, q) for q in form_questions]
    for job in jobs:
        blocks += [(job, q) for q in (job.questions or [])]
    for job, question in blocks:
        key = f'{job.slug}.{question["key"]}' if job else question['key']
        value, error = _clean_answer(question, raw.get(key))
        if (value is None or error) and (question.get('required') or question.get('must_be')):
            out[key] = practice_answer(question)
    return out


def create_practice(*, job: Job | None, first_name: str = '', last_name: str = '', email: str = '',
                    phone: str = '', by) -> Application:
    """Dash's Practice run: an applicant with placeholders for everything left out, then the usual first emails."""
    job = job or Job.objects.filter(status=Job.STATUS_OPEN).first() or Job.objects.first()
    if job is None:
        raise ValidationError({'job': 'Add a role first.'})
    email = (email or '').strip()
    if email and ('@' not in email or '.' not in email.split('@')[-1]):
        raise ValidationError({'email': 'Enter an email address, or leave it blank.'})
    jobs = [job]
    raw = practice_fill(form_questions=form_questions(), jobs=jobs, raw={})
    answers, _, red = build_answers(form_questions=form_questions(), jobs=jobs, raw=raw)
    application = create_application(
        first_name=(first_name or '').strip() or PRACTICE_FIRST, last_name=(last_name or '').strip() or PRACTICE_LAST,
        email=email, phone=(phone or '').strip() or PRACTICE_PHONE, jobs=jobs, answers=answers, red_flags=red,
        source=Application.SOURCE_OTHER, by=by, practice=True, note='Practice run (made in Dash)',
    )
    send_first_touch(application)
    return application


def clear_practice() -> int:
    """Delete every practice applicant with their interviews, offers, history and files."""
    from django.core.files.storage import default_storage

    apps = list(Application.objects.filter(is_practice=True).select_related('resume'))
    files = [a.resume for a in apps if a.resume_id]
    for app in apps:
        for offer in app.offers.select_related('signature', 'signed_pdf'):
            files += [f for f in (offer.signature, offer.signed_pdf) if f]
    with transaction.atomic():
        for app in apps:
            app.delete()
        for s3 in files:
            try:
                default_storage.delete(s3.key)
            except Exception:
                pass
            s3.delete()
    return len(apps)


# ── Apply ───────────────────────────────────────────────────────────────────


def _event(application, kind: str, *, by=None, text: str = '', from_stage: str = '', to_stage: str = '',
           data: dict | None = None):
    return ApplicationEvent.objects.create(
        application=application, kind=kind, by=by, text=text, from_stage=from_stage, to_stage=to_stage,
        data=data or {},
    )


@transaction.atomic
def create_application(*, first_name: str, last_name: str, email: str, phone: str, jobs: list[Job],
                       answers: list[dict], red_flags: int, sms_consent: bool = False, resume=None,
                       source: str = Application.SOURCE_WEB, by=None, ip: str | None = None,
                       user_agent: str = '', note: str = '', practice: bool = False) -> Application:
    now = timezone.now()
    application = Application.objects.create(
        first_name=first_name.strip()[:80],
        last_name=last_name.strip()[:80],
        email=email.strip().lower()[:254],
        phone=phone.strip()[:30],
        phone_digits=digits_of(phone),
        answers=answers,
        red_flags=red_flags,
        resume=resume,
        source=source,
        stage=Application.STAGE_NEW,
        stage_changed_at=now,
        sms_consent=bool(sms_consent),
        sms_consent_at=now if sms_consent else None,
        sms_consent_version=SMS_CONSENT_VERSION if sms_consent else '',
        sms_consent_text=SMS_CONSENT_TEXT if sms_consent else '',
        created_by=by,
        ip_address=ip,
        user_agent=(user_agent or '')[:300],
        is_practice=practice,
    )
    application.jobs.set(jobs)
    how = dict(Application.SOURCE_CHOICES).get(source, source)
    _event(application, ApplicationEvent.KIND_CREATED, by=by, to_stage=Application.STAGE_NEW,
           text=note or f'Applied ({how})', data={'sms_consent': bool(sms_consent)})
    return application


def send_first_touch(application) -> None:
    """Auto-reply to the applicant and the alert to the owner. Best effort; logged on the timeline."""
    if application.email:
        sent = emails.send_received(application)
        if sent:
            application.received_email_sent = True
            application.save(update_fields=['received_email_sent'])
        _event(application, ApplicationEvent.KIND_EMAIL,
               text='Auto-reply sent' if sent else 'Auto-reply could not be sent',
               data={'email': 'received', 'sent': sent})
    emails.send_alert(application, dash_link=dash_link(application))


# ── Staff actions ───────────────────────────────────────────────────────────


@transaction.atomic
def set_stage(application, stage: str, *, by, note: str = '') -> Application:
    if stage not in STAGES:
        raise ValidationError({'stage': 'Unknown stage.'})
    if stage == Application.STAGE_NOT_NOW:
        raise ValidationError({'stage': 'Use Not now, which asks for the reason.'})
    previous = application.stage
    if previous == stage:
        return application
    application.stage = stage
    application.stage_changed_at = timezone.now()
    fields = ['stage', 'stage_changed_at', 'updated_at']
    if previous == Application.STAGE_NOT_NOW:
        # Re-opened: the reason and the email stay in the timeline.
        application.not_now_reason = ''
        application.not_now_note = ''
        application.not_now_stage = ''
        application.not_now_email_status = ''
        application.not_now_at = None
        fields += ['not_now_reason', 'not_now_note', 'not_now_stage', 'not_now_email_status', 'not_now_at']
    application.save(update_fields=fields)
    _event(application, ApplicationEvent.KIND_STAGE, by=by, from_stage=previous, to_stage=stage, text=note.strip())
    return application


def add_note(application, text: str, *, by) -> ApplicationEvent:
    text = (text or '').strip()
    if not text:
        raise ValidationError({'text': 'Write a note first.'})
    application.save(update_fields=['updated_at'])
    return _event(application, ApplicationEvent.KIND_NOTE, by=by, text=text[:4000])


def set_rating(application, rating, *, by) -> Application:
    if rating in (None, '', 0, '0'):
        value = None
    else:
        try:
            value = int(rating)
        except (TypeError, ValueError):
            raise ValidationError({'rating': 'Rating is 1 to 5.'})
        if not 1 <= value <= 5:
            raise ValidationError({'rating': 'Rating is 1 to 5.'})
    if application.rating == value:
        return application
    application.rating = value
    application.save(update_fields=['rating', 'updated_at'])
    _event(application, ApplicationEvent.KIND_RATING, by=by, text=f'Rated {value}' if value else 'Rating cleared',
           data={'rating': value})
    return application


def not_now_draft(application, reason: str) -> dict:
    template = not_now_template(reason, application)
    values = emails.values_for(application)
    return {'subject': fill(template['subject'], values), 'body': fill(template['body'], values)}


@transaction.atomic
def mark_not_now(application, *, reason: str, note: str, send: bool, subject: str, body: str, by) -> Application:
    if reason not in REASONS:
        raise ValidationError({'reason': 'Pick a reason.'})
    if reason == 'other' and not (note or '').strip():
        raise ValidationError({'note': 'Say why (required for Other).'})
    if send:
        if not application.email:
            raise ValidationError({'send': 'This applicant has no email address. Choose Don\'t send.'})
        if not (subject or '').strip() or not (body or '').strip():
            raise ValidationError({'body': 'The email needs a subject and a message.'})
    previous = application.stage
    now = timezone.now()
    application.stage = Application.STAGE_NOT_NOW
    application.stage_changed_at = now
    application.not_now_reason = reason
    application.not_now_note = (note or '').strip()[:4000]
    application.not_now_stage = previous if previous != Application.STAGE_NOT_NOW else application.not_now_stage
    application.not_now_at = now
    application.not_now_email_subject = (subject or '').strip()[:200]
    application.not_now_email_body = (body or '').strip()[:6000]
    if send:
        sent = emails.send(to=application.email, subject=application.not_now_email_subject,
                           body=application.not_now_email_body, practice=application.is_practice)
        application.not_now_email_status = Application.EMAIL_SENT if sent else Application.EMAIL_FAILED
    else:
        application.not_now_email_status = Application.EMAIL_NOT_SENT
    application.save()
    text = f'Not now: {REASONS[reason]}' + (f'. {application.not_now_note}' if application.not_now_note else '')
    _event(application, ApplicationEvent.KIND_STAGE, by=by, from_stage=previous, to_stage=Application.STAGE_NOT_NOW,
           text=text, data={'reason': reason})
    email_text = {
        Application.EMAIL_SENT: 'Not now email sent',
        Application.EMAIL_FAILED: 'Not now email could not be sent',
        Application.EMAIL_NOT_SENT: "Not now: no email (Don't send)",
    }[application.not_now_email_status]
    _event(application, ApplicationEvent.KIND_EMAIL, by=by, text=email_text,
           data={'email': 'not_now', 'status': application.not_now_email_status,
                 'subject': application.not_now_email_subject, 'body': application.not_now_email_body})
    return application


@transaction.atomic
def create_employee(application, *, by, request, pay_rate, start_date: date | None, position: str = '',
                    department: int | None = None, employment_type: str = 'part_time') -> dict:
    """Hired → a Dash user (Employee role) with an employee profile. Nothing is emailed: the new hire picks a password
    from a one-time link shown as a QR on day one (D16; People → Onboarding → Set password)."""
    from apps.accounts.models import User
    from apps.accounts.serializers import UserCreateSerializer

    if application.is_practice:
        raise ValidationError({'detail': 'This is a practice applicant. Create employee makes a real Dash login, '
                                         'so it is off for practice runs.'})
    if application.employee_user_id:
        raise ValidationError({'detail': 'This applicant already has a Dash account.'})
    if not application.email:
        raise ValidationError({'detail': 'Add an email address first; the new hire signs in with it.'})
    if User.objects.filter(email__iexact=application.email).exists():
        raise ValidationError({'detail': f'A Dash account already uses {application.email}. Link it in Admin → Users.'})
    try:
        rate = Decimal(str(pay_rate))
    except Exception:
        raise ValidationError({'pay_rate': 'Pay rate must be a number.'})
    if rate <= 0 or rate > 200:
        raise ValidationError({'pay_rate': 'Pay rate looks wrong.'})
    position = (position or '').strip() or ', '.join(j.title for j in application.jobs.all())[:100]
    if department is None:
        # The role's department, so the new hire lands in the right place on the schedule.
        department = next((j.department_id for j in application.jobs.all() if j.department_id), None)
    serializer = UserCreateSerializer(data={
        'email': application.email,
        'first_name': application.first_name,
        'last_name': application.last_name,
        'phone': application.phone,
        'role': 'Employee',
        'is_active': True,
        'position': position,
        'employment_type': employment_type if employment_type in ('full_time', 'part_time', 'seasonal') else 'part_time',
        'pay_rate': str(rate),
        'hire_date': (start_date or timezone.localdate()).isoformat(),
        'department': department,
    })
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    if user.has_usable_password():
        user.set_unusable_password()
        user.save(update_fields=['password'])

    previous = application.stage
    application.employee_user = user
    application.stage = Application.STAGE_HIRED
    if previous != Application.STAGE_HIRED:
        application.stage_changed_at = timezone.now()
    application.save()
    if previous != Application.STAGE_HIRED:
        _event(application, ApplicationEvent.KIND_STAGE, by=by, from_stage=previous, to_stage=Application.STAGE_HIRED)

    from apps.accounts.services.usernames import assign_username

    username = assign_username(user) or ''
    profile = getattr(user, 'employee', None)
    _event(application, ApplicationEvent.KIND_EMPLOYEE, by=by,
           text=f'Dash account created ({profile.employee_number if profile else user.email}, username {username})',
           data={'user_id': user.pk, 'pay_rate': str(rate), 'start_date': serializer.validated_data.get('hire_date').isoformat()
                 if serializer.validated_data.get('hire_date') else None})
    return {'user_id': user.pk, 'employee_number': profile.employee_number if profile else '', 'username': username}


def public_job_list() -> list[Job]:
    return list(Job.objects.filter(status=Job.STATUS_OPEN))


def form_questions() -> list[dict]:
    return load_setting()['form']['questions']
