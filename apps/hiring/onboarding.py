"""Onboarding (Phase 4): Start onboarding sends the first-day email and runs a checklist to done.

The checklist is copied from the careers file (``onboarding.items``) when onboarding starts, with due dates worked
out from the start date. Some items finish themselves from what Dash already knows: the emergency contact on the
profile, a password set and a first sign-in, the first clock-in, shifts on the schedule, a kiosk badge, the handbook
signature and the I-9. The I-9 is Admin only and kept apart from the employee record (decision 12). The handbook is
signed in Dash the way an offer is: a tick, a typed name, a finger signature, and a PDF with an audit trail.
"""
from __future__ import annotations

import hashlib
import html
import io
from datetime import date, timedelta
from datetime import timezone as dt_timezone

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.files import save_upload, upload_has_signature
from apps.hiring import emails
from apps.hiring.careers import HANDBOOK_CONFIRM, fill, load_setting, template as email_template
from apps.hiring.models import (
    ApplicationEvent, Handbook, HandbookSignature, I9File, I9Record, Onboarding, OnboardingTask,
)

DUE_LABELS = {
    'before_day1': 'Before day 1', 'day1': 'Day 1', 'i9': 'Within 3 business days', 'week1': 'Week 1',
    'day20': 'By day 20',
}
OWNER_LABELS = {'new_hire': 'New hire', 'manager': 'Manager', 'owner': 'Owner'}
HANDBOOK_CONSENT = (
    'I agree to sign electronically. My typed name and the signature I draw are my legal signature, the same as '
    'signing on paper.'
)
MAX_SCAN_BYTES = 20 * 1024 * 1024


# ── Dates ───────────────────────────────────────────────────────────────────


def add_business_days(day: date, count: int) -> date:
    while count > 0:
        day += timedelta(days=1)
        if day.weekday() < 5:
            count -= 1
    return day


def due_date_for(due: str, start: date) -> date:
    """before_day1: the day before; day1: the start; i9: 3 business days after; week1: +6 days; day20: +20 days."""
    return {
        'before_day1': start - timedelta(days=1),
        'day1': start,
        'i9': add_business_days(start, 3),
        'week1': start + timedelta(days=6),
        'day20': start + timedelta(days=20),
    }.get(due, start)


def _date_text(day) -> str:
    from apps.hiring.offers import date_text
    return date_text(day)


def _person(user) -> str:
    from apps.hiring.offers import person_name
    return person_name(user)


# ── Start ───────────────────────────────────────────────────────────────────


def _event(onboarding: Onboarding, text: str, *, by=None, data: dict | None = None) -> None:
    if onboarding.application_id:
        ApplicationEvent.objects.create(application_id=onboarding.application_id, kind=ApplicationEvent.KIND_EMPLOYEE,
                                        by=by, text=text, data={'onboarding': onboarding.pk, **(data or {})})


@transaction.atomic
def start(*, user, by, start_date: date, start_time=None, manager=None, position: str = '', job=None,
          application=None, send_email: bool = True) -> tuple[Onboarding, bool]:
    """The checklist (from the careers file), the I-9 record, and the first-day email when ``send_email``."""
    if Onboarding.objects.filter(user=user, status=Onboarding.STATUS_ACTIVE).exists():
        raise ValidationError({'detail': f'{user.full_name or user.email} already has onboarding in progress.'})
    if application is not None and Onboarding.objects.filter(application=application).exists():
        raise ValidationError({'detail': 'This applicant already has an onboarding.'})
    profile = _profile(user)
    position = (position or (profile.position if profile else '') or (job.title if job else '')).strip()[:120]
    onboarding = Onboarding.objects.create(
        user=user, application=application, job=job, position=position, start_date=start_date,
        start_time=start_time, manager=manager, created_by=by,
    )
    items = load_setting()['onboarding']['items']
    OnboardingTask.objects.bulk_create([
        OnboardingTask(
            onboarding=onboarding, key=item['key'], label=item['label'], help=item.get('help', ''),
            owner=item['owner'], due=item['due'], due_date=due_date_for(item['due'], start_date), kind=item['kind'],
            auto=item.get('auto', ''), sort=index,
        )
        for index, item in enumerate(items)
    ])
    I9Record.objects.create(onboarding=onboarding, user=user, hire_date=start_date)
    refresh(onboarding)
    _event(onboarding, f'Onboarding started: first day {_date_text(start_date)}', by=by)
    sent = send_first_day(onboarding, by=by) if send_email else False
    return onboarding, sent


def first_day_values(onboarding: Onboarding) -> dict:
    from apps.hiring.offers import time_text

    user = onboarding.user
    return {
        'first_name': user.first_name or (user.full_name or '').split(' ')[0],
        'role': onboarding.position or 'our team',
        'start_date': _date_text(onboarding.start_date),
        'start_time': time_text(onboarding.start_time),
        'supervisor': _person(onboarding.manager),
        'place': load_setting()['interviews']['place'],
    }


def send_first_day(onboarding: Onboarding, *, by=None) -> bool:
    if not onboarding.user.email:
        raise ValidationError({'detail': 'This person has no email address.'})
    block = email_template('first_day', onboarding.application)
    values = first_day_values(onboarding)
    sent = emails.send(to=onboarding.user.email, subject=fill(block['subject'], values),
                       body=fill(block['body'], values))
    if sent:
        onboarding.first_day_email_sent_at = timezone.now()
        onboarding.save(update_fields=['first_day_email_sent_at'])
    _event(onboarding, 'First-day email sent' if sent else 'First-day email could not be sent', by=by,
           data={'sent': sent})
    return sent


def cancel(onboarding: Onboarding, *, by) -> Onboarding:
    if onboarding.status != Onboarding.STATUS_ACTIVE:
        raise ValidationError({'detail': 'Only onboarding in progress can be cancelled.'})
    onboarding.status = Onboarding.STATUS_CANCELLED
    onboarding.save(update_fields=['status'])
    _event(onboarding, 'Onboarding cancelled', by=by)
    return onboarding


# ── The checklist ───────────────────────────────────────────────────────────


def _profile(user):
    try:
        return user.employee
    except Exception:  # RelatedObjectDoesNotExist: a user with no employee profile
        return None


def auto_state(onboarding: Onboarding, task: OnboardingTask) -> bool | None:
    """Whether Dash sees this item done (None for items a person ticks)."""
    from apps.hr.models import ShiftAssignment, TimeEntry

    user = onboarding.user
    if task.kind == 'handbook':
        return HandbookSignature.objects.filter(user=user).exists()
    if task.kind == 'i9':
        record = getattr(onboarding, 'i9', None)
        return bool(record and record.section2_done_at)
    if task.kind != 'auto':
        return None
    profile = _profile(user)
    if task.auto == 'emergency_contact':
        return bool(profile and profile.emergency_name.strip() and profile.emergency_phone.strip())
    if task.auto == 'dash_login':
        return bool(user.last_login and user.has_usable_password())
    if task.auto == 'first_clock_in':
        return TimeEntry.objects.filter(employee=user, deleted_at__isnull=True).exists()
    if task.auto == 'schedule':
        return ShiftAssignment.objects.filter(employee=user).exists()
    if task.auto == 'kiosk_badge':
        return bool(profile and profile.badge_issued_at and not profile.badge_revoked_at)
    return None


def refresh(onboarding: Onboarding) -> Onboarding:
    """Mark the items Dash can see, then the whole onboarding done when nothing is left (or back in progress)."""
    if onboarding.status == Onboarding.STATUS_CANCELLED:
        return onboarding
    now = timezone.now()
    for task in onboarding.tasks.all():
        seen = auto_state(onboarding, task)
        if seen is None or task.status == OnboardingTask.STATUS_SKIPPED:
            continue
        if seen and task.status == OnboardingTask.STATUS_OPEN:
            task.status, task.done_at, task.done_by = OnboardingTask.STATUS_DONE, now, None
            task.save(update_fields=['status', 'done_at', 'done_by'])
        elif not seen and task.status == OnboardingTask.STATUS_DONE and task.done_by_id is None:
            task.status, task.done_at = OnboardingTask.STATUS_OPEN, None  # e.g. a badge was revoked
            task.save(update_fields=['status', 'done_at'])
    left = onboarding.tasks.filter(status=OnboardingTask.STATUS_OPEN).exists()
    if not left and onboarding.status == Onboarding.STATUS_ACTIVE:
        onboarding.status, onboarding.completed_at = Onboarding.STATUS_DONE, now
        onboarding.save(update_fields=['status', 'completed_at'])
        _event(onboarding, 'Onboarding done')
    elif left and onboarding.status == Onboarding.STATUS_DONE:
        onboarding.status, onboarding.completed_at = Onboarding.STATUS_ACTIVE, None
        onboarding.save(update_fields=['status', 'completed_at'])
    return onboarding


@transaction.atomic
def set_task(task: OnboardingTask, *, by, status: str, data: dict | None = None, note: str | None = None,
             as_new_hire: bool = False) -> OnboardingTask:
    """Tick, untick, skip. A new hire may only tick their own tick items; Dash's own items can only be skipped."""
    if status not in (OnboardingTask.STATUS_OPEN, OnboardingTask.STATUS_DONE, OnboardingTask.STATUS_SKIPPED):
        raise ValidationError({'status': 'Use open, done or skipped.'})
    if task.onboarding.status == Onboarding.STATUS_CANCELLED:
        raise ValidationError({'detail': 'This onboarding was cancelled.'})
    if as_new_hire and (task.owner != 'new_hire' or task.kind != 'tick' or status == OnboardingTask.STATUS_SKIPPED):
        raise PermissionDenied('Your manager ticks this one.')
    if status == OnboardingTask.STATUS_DONE and task.kind not in ('tick', 'count'):
        raise ValidationError({'detail': 'Dash ticks this one itself when it sees it done.'})
    if task.kind == 'count' and status == OnboardingTask.STATUS_DONE:
        data = data or {}
        try:
            count = int(data.get('count'))
        except (TypeError, ValueError):
            count = 0
        if count < 1 or count > 20:
            raise ValidationError({'count': 'How many? (1 to 20)'})
        task.data = {'count': count, 'size': str(data.get('size') or '').strip()[:10]}
    task.status = status
    task.done_at = timezone.now() if status != OnboardingTask.STATUS_OPEN else None
    task.done_by = by if status != OnboardingTask.STATUS_OPEN else None
    if note is not None:
        task.note = (note or '').strip()[:500]
    task.save()
    refresh(task.onboarding)
    return task


def overdue(task: OnboardingTask, today: date | None = None) -> bool:
    return task.status == OnboardingTask.STATUS_OPEN and task.due_date < (today or timezone.localdate())


# ── Set password (shown on screen, never emailed) ───────────────────────────


def password_link(onboarding: Onboarding, *, request) -> dict:
    """The new hire's one-time set-password link (48 hours), for a QR on day one (D16: nothing is emailed)."""
    from apps.accounts.models import AccountEvent
    from apps.accounts.services.staff_password import SET_PASSWORD_TTL, issue_staff_reset, is_staff_account, staff_reset_link
    from apps.accounts.services.usernames import assign_username

    user = onboarding.user
    actor = request.user
    if not (actor.is_superuser or actor.role == 'Admin') and user.role != 'Employee':
        raise PermissionDenied('Only an Admin can make a set-password link for a manager or an Admin.')
    if not is_staff_account(user) or not user.is_active:
        raise ValidationError({'detail': 'This person is switched off, or not staff.'})
    forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
    row = issue_staff_reset(user=user, request_ip=forwarded or request.META.get('REMOTE_ADDR'), ttl=SET_PASSWORD_TTL)
    AccountEvent.log(user, AccountEvent.KIND_LINK, actor=actor)
    return {'link': staff_reset_link(row.token) + '&set=1', 'expires_at': row.expires_at,
            'username': assign_username(user)}


# ── Emergency contact (the new hire fills it in) ────────────────────────────


def save_emergency_contact(user, *, name: str, phone: str):
    profile = _profile(user)
    if profile is None:
        raise ValidationError({'detail': 'Your employee record is missing. Ask your manager.'})
    name, phone = ' '.join((name or '').split())[:100], (phone or '').strip()[:20]
    if len(name) < 2:
        raise ValidationError({'name': 'Who should we call?'})
    if sum(ch.isdigit() for ch in phone) < 10:
        raise ValidationError({'phone': 'A phone number with area code.'})
    profile.emergency_name, profile.emergency_phone = name, phone
    profile.save(update_fields=['emergency_name', 'emergency_phone'])
    for onboarding in Onboarding.objects.filter(user=user, status=Onboarding.STATUS_ACTIVE):
        refresh(onboarding)
    return profile


# ── I-9 (Admin only) ────────────────────────────────────────────────────────


def _scan_type(uploaded) -> str | None:
    def sniff(header: bytes) -> bool:
        return header.startswith(b'%PDF-') or header.startswith(b'\xff\xd8\xff') or \
            header.startswith(b'\x89PNG\r\n\x1a\n') or header[4:12] in (b'ftypheic', b'ftypheix', b'ftypmif1')

    if not upload_has_signature(uploaded, sniff):
        return None
    uploaded.seek(0)
    head = uploaded.read(12)
    uploaded.seek(0)
    if head.startswith(b'%PDF-'):
        return 'application/pdf'
    if head.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if head.startswith(b'\x89PNG'):
        return 'image/png'
    return 'image/heic'


def i9_upload(record: I9Record, uploaded, *, kind: str, label: str, by) -> I9File:
    if uploaded is None:
        raise ValidationError({'file': 'Pick a file.'})
    if uploaded.size > MAX_SCAN_BYTES:
        raise ValidationError({'file': 'That file is over 20 MB.'})
    content_type = _scan_type(uploaded)
    if content_type is None:
        raise ValidationError({'file': 'Use a PDF or a photo (JPEG, PNG or HEIC).'})
    if kind not in (I9File.KIND_FORM, I9File.KIND_DOCUMENT):
        raise ValidationError({'kind': 'form or document'})
    s3 = save_upload(uploaded, user=by, key_prefix='hiring/i9')
    if s3.content_type != content_type:
        s3.content_type = content_type
        s3.save(update_fields=['content_type'])
    return I9File.objects.create(record=record, kind=kind, label=(label or '').strip()[:120], file=s3, uploaded_by=by)


def i9_delete_file(item: I9File) -> None:
    if item.record.section2_done_at:
        raise ValidationError({'detail': 'Section 2 is done; the files are kept as they are.'})
    from django.core.files.storage import default_storage

    s3 = item.file
    item.delete()
    try:
        default_storage.delete(s3.key)
    except Exception:
        pass
    s3.delete()


@transaction.atomic
def i9_section2(record: I9Record, *, documents_seen: str, by) -> I9Record:
    if not record.files.filter(kind=I9File.KIND_FORM).exists():
        raise ValidationError({'detail': 'Upload the completed Form I-9 first.'})
    documents_seen = (documents_seen or '').strip()[:300]
    if not documents_seen:
        raise ValidationError({'documents_seen': 'Which documents did you see? e.g. List B driver\'s license + List C '
                                                 'Social Security card'})
    record.documents_seen = documents_seen
    record.section2_done_at = timezone.now()
    record.section2_by = by
    record.save(update_fields=['documents_seen', 'section2_done_at', 'section2_by'])
    refresh(record.onboarding)
    return record


# ── Handbook ────────────────────────────────────────────────────────────────


def latest_handbook() -> Handbook | None:
    return Handbook.objects.order_by('-version').first()


def _handbook_sha(title: str, text: str, acknowledgment: str) -> str:
    return hashlib.sha256('\n\n'.join((title, text, acknowledgment)).encode('utf-8')).hexdigest()


def confirm_marks(draft: dict) -> int:
    return sum((draft.get(k) or '').count(HANDBOOK_CONFIRM) for k in ('title', 'text', 'acknowledgment'))


def handbook_state() -> dict:
    from django.db.models import Count

    draft = load_setting()['handbook']
    latest = latest_handbook()
    sha = _handbook_sha(draft['title'], draft['text'], draft['acknowledgment'])
    return {
        'draft': draft,
        'confirm_marks': confirm_marks(draft),
        'draft_changed': latest is None or latest.sha256 != sha,
        'versions': [
            {'version': h.version, 'title': h.title, 'published_at': h.published_at, 'signatures': h.n}
            for h in Handbook.objects.annotate(n=Count('signatures')).order_by('-version')
        ],
    }


def publish_handbook(*, by) -> Handbook:
    draft = load_setting()['handbook']
    marks = confirm_marks(draft)
    if marks:
        raise ValidationError({'detail': f'{marks} "[confirm" mark(s) are still in the draft. Settle each one, take '
                                         'the mark out, then publish.'})
    sha = _handbook_sha(draft['title'], draft['text'], draft['acknowledgment'])
    latest = latest_handbook()
    if latest is not None and latest.sha256 == sha:
        raise ValidationError({'detail': f'Nothing changed since version {latest.version}.'})
    return Handbook.objects.create(
        version=(latest.version + 1) if latest else 1, title=draft['title'], text=draft['text'],
        acknowledgment=draft['acknowledgment'], sha256=sha, published_by=by,
    )


def handbook_html(title: str, text: str) -> str:
    """The handbook's light markup: "## " headings, "- " bullet lines, blank lines between paragraphs."""
    parts = [f'<h1>{html.escape(title)}</h1>']
    for block in (text or '').split('\n\n'):
        lines = [line for line in block.split('\n') if line.strip()]
        while lines and lines[0].startswith('## '):
            parts.append(f'<h2>{html.escape(lines.pop(0)[3:].strip())}</h2>')
        if lines and all(line.lstrip().startswith('- ') for line in lines):
            parts.append('<ul>' + ''.join(f'<li>{html.escape(line.lstrip()[2:])}</li>' for line in lines) + '</ul>')
        elif lines:
            parts.append('<p>' + '<br>'.join(html.escape(line) for line in lines) + '</p>')
    return ''.join(parts)


@transaction.atomic
def sign_handbook(*, user, name: str, signature: str, acknowledged, consent, ip: str | None,
                  user_agent: str) -> HandbookSignature:
    from apps.hiring.offers import _signature_png

    handbook = latest_handbook()
    if handbook is None:
        raise ValidationError({'detail': 'The handbook is not published yet. Your manager will tell you when.'})
    if HandbookSignature.objects.filter(handbook=handbook, user=user).exists():
        raise ValidationError({'detail': f'You already signed version {handbook.version}.'})
    name = ' '.join((name or '').split())[:160]
    errors = {}
    if len(name) < 3:
        errors['name'] = 'Type your full legal name.'
    if acknowledged not in (True, 'true', '1', 1):
        errors['acknowledged'] = 'Tick the box to say you read it.'
    if consent not in (True, 'true', '1', 1):
        errors['consent'] = 'Tick the box to sign electronically.'
    if errors:
        raise ValidationError(errors)
    png = _signature_png(signature)
    row = HandbookSignature.objects.create(
        handbook=handbook, user=user, signer_name=name, consent_text=HANDBOOK_CONSENT, signer_ip=ip,
        signer_user_agent=(user_agent or '')[:300],
        signature=save_upload(ContentFile(png, name='signature.png'), user=user, key_prefix='hiring/handbook'),
    )
    upload = ContentFile(build_handbook_pdf(row, png), name=f'handbook-v{handbook.version}-{user.pk}.pdf')
    upload.content_type = 'application/pdf'
    row.signed_pdf = save_upload(upload, user=user, key_prefix='hiring/handbook')
    row.save(update_fields=['signed_pdf'])
    for onboarding in Onboarding.objects.filter(user=user, status=Onboarding.STATUS_ACTIVE):
        refresh(onboarding)
        _event(onboarding, f'Handbook v{handbook.version} signed by {name}')
    return row


def build_handbook_pdf(row: HandbookSignature, signature_png: bytes) -> bytes:
    """The handbook as signed (as many pages as it takes), then a page with the tick, the signature and the audit."""
    import pymupdf

    from apps.hiring.offers import _CSS, audit_rows

    handbook = row.handbook
    buffer = io.BytesIO()
    writer = pymupdf.DocumentWriter(buffer)
    story = pymupdf.Story(html=handbook_html(f'{handbook.title} (version {handbook.version})', handbook.text),
                          user_css=_CSS)
    mediabox = pymupdf.Rect(0, 0, 612, 792)
    margin = 54
    more = True
    while more:
        device = writer.begin_page(mediabox)
        more, _ = story.place(mediabox + (margin, margin, -margin, -margin))
        story.draw(device)
        writer.end_page()
    writer.close()
    doc = pymupdf.open('pdf', buffer.getvalue())
    try:
        page = doc.new_page(width=612, height=792)
        local = timezone.localtime(row.signed_at)
        top = (f'<h2>Signed by {html.escape(row.signer_name)}</h2>'
               f'<p>[X] {html.escape(handbook.acknowledgment)}</p>'
               f'<p>Agreed to sign electronically: "{html.escape(row.consent_text)}"</p><h2>Signature</h2>')
        box = pymupdf.Rect(margin, margin, 612 - margin, 420)
        spare, _ = page.insert_htmlbox(box, top, css=_CSS)
        y = box.y1 - max(spare, 0) + 4
        page.insert_image(pymupdf.Rect(margin, y, margin + 260, y + 80), stream=signature_png, keep_proportion=True)
        y += 84
        page.draw_line(pymupdf.Point(margin, y), pymupdf.Point(margin + 260, y), color=(0.4, 0.4, 0.4), width=0.6)
        page.insert_htmlbox(pymupdf.Rect(margin, y + 4, 612 - margin, y + 50),
                            f'<p>{html.escape(row.signer_name)}<br>Signed '
                            f'{html.escape(local.strftime("%B %d, %Y at %I:%M %p"))} (store time)</p>', css=_CSS)
        audit = [
            ('Handbook', f'version {handbook.version}, published {timezone.localtime(handbook.published_at):%B %d, %Y}'),
            ('Signed in Dash as', row.user.email or str(row.user_id)),
            ('Signed (UTC)', row.signed_at.astimezone(dt_timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')),
            ('IP address', row.signer_ip or 'unknown'),
            ('Device', row.signer_user_agent or 'unknown'),
            ('Text fingerprint', f'SHA-256 {handbook.sha256}'),
        ]
        rows = audit_rows(audit)
        page.insert_htmlbox(pymupdf.Rect(margin, y + 64, 612 - margin, 792 - margin),
                            f'<h2>Signing audit trail</h2>{rows}', css=_CSS)
        doc.subset_fonts()
        return doc.tobytes(garbage=3, deflate=True)
    finally:
        doc.close()


# ── The new hire's own view ─────────────────────────────────────────────────


def mine(user) -> Onboarding | None:
    """The new hire's onboarding in progress, or the last one finished in the past 30 days."""
    active = Onboarding.objects.filter(user=user, status=Onboarding.STATUS_ACTIVE).first()
    if active:
        return refresh(active)
    since = timezone.now() - timedelta(days=30)
    return Onboarding.objects.filter(user=user, status=Onboarding.STATUS_DONE, completed_at__gte=since).first()
