"""Check-ins (Phase 5): 30, 60 and 90 days after the start, met in person, signed by both, read by the employee.

They are made when onboarding starts (``careers.checkin.days``), assigned to the new hire's manager, and appear in
People → Check-ins from a week before they are due. The manager fills the form on a phone or tablet in the meeting;
both sign with a finger on that device; a PDF with an audit trail is kept, and the employee reads it under My
check-ins. Signing the last check-in can close onboarding (anything still open is marked not needed).
"""
from __future__ import annotations

import html
import io
from datetime import date, timedelta
from datetime import timezone as dt_timezone

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.files import save_upload
from apps.hiring.careers import load_setting
from apps.hiring.models import CheckIn, Onboarding, OnboardingTask

SOON_DAYS = 7  # a check-in shows as due this many days ahead


def schedule(*, user, start_date: date, manager=None, onboarding: Onboarding | None = None) -> list[CheckIn]:
    """One check-in per day in the careers file, from the start date. Days already scheduled are left alone."""
    have = set(CheckIn.objects.filter(user=user, onboarding=onboarding).values_list('day', flat=True))
    rows = [
        CheckIn(user=user, manager=manager, onboarding=onboarding, day=day, due_date=start_date + timedelta(days=day))
        for day in load_setting()['checkin']['days'] if day not in have
    ]
    return CheckIn.objects.bulk_create(rows)


def is_due(row: CheckIn, today: date | None = None) -> bool:
    return row.status == CheckIn.STATUS_SCHEDULED and row.due_date <= (today or timezone.localdate()) + timedelta(
        days=SOON_DAYS)


def is_overdue(row: CheckIn, today: date | None = None) -> bool:
    return row.status == CheckIn.STATUS_SCHEDULED and row.due_date < (today or timezone.localdate())


def is_last(row: CheckIn) -> bool:
    days = CheckIn.objects.filter(user=row.user, onboarding=row.onboarding).values_list('day', flat=True)
    return row.day == max(days, default=row.day)


def form_of(row: CheckIn) -> dict:
    """The form this check-in uses: its own copy once saved, else today's careers file."""
    if row.form:
        return row.form
    cfg = load_setting()['checkin']
    return {k: cfg[k] for k in ('questions', 'areas', 'area_ratings', 'employee_statement')}


def _clean_answers(form: dict, raw) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    questions = raw.get('questions') if isinstance(raw.get('questions'), dict) else {}
    areas = raw.get('areas') if isinstance(raw.get('areas'), dict) else {}
    out = {'questions': {}, 'areas': {}}
    for q in form.get('questions', []):
        out['questions'][q['key']] = str(questions.get(q['key']) or '').strip()[:4000]
    for area in form.get('areas', []):
        given = areas.get(area) if isinstance(areas.get(area), dict) else {}
        rating = str(given.get('rating') or '')
        if rating and rating not in form.get('area_ratings', []):
            raise ValidationError({'areas': f'"{rating}" is not one of the ratings for {area}.'})
        out['areas'][area] = {'rating': rating, 'note': str(given.get('note') or '').strip()[:1000]}
    return out


def save(row: CheckIn, *, answers=None, employee_comments=None, close_onboarding=None, manager=None) -> CheckIn:
    """Save the form as it is filled (any time before signing). The first save keeps a copy of the form."""
    if row.status != CheckIn.STATUS_SCHEDULED:
        raise ValidationError({'detail': 'This check-in is signed (or skipped) and can no longer change.'})
    if not row.form:
        row.form = form_of(row)
    if answers is not None:
        row.answers = _clean_answers(row.form, answers)
    if employee_comments is not None:
        row.employee_comments = str(employee_comments).strip()[:4000]
    if close_onboarding is not None:
        row.close_onboarding = bool(close_onboarding) and is_last(row)
    if manager is not None:
        row.manager = manager
    row.save()
    return row


@transaction.atomic
def sign(row: CheckIn, *, manager_name: str, manager_signature: str, employee_name: str, employee_signature: str,
         acknowledged, by, ip: str | None, user_agent: str) -> CheckIn:
    """Both sign on this device in the meeting. Then it is locked, the PDF is kept, and the employee can read it."""
    from apps.hiring.offers import _signature_png

    row = CheckIn.objects.select_for_update().get(pk=row.pk)
    if row.status != CheckIn.STATUS_SCHEDULED:
        raise ValidationError({'detail': 'This check-in is already signed or skipped.'})
    if not row.form:
        row.form = form_of(row)
    errors = {}
    manager_name = ' '.join((manager_name or '').split())[:160]
    employee_name = ' '.join((employee_name or '').split())[:160]
    if len(manager_name) < 3:
        errors['manager_name'] = "Type the manager's full name."
    if len(employee_name) < 3:
        errors['employee_name'] = "Type the employee's full name."
    if acknowledged not in (True, 'true', '1', 1):
        errors['acknowledged'] = 'The employee ticks the statement.'
    answered = any(v for v in (row.answers.get('questions') or {}).values()) or any(
        a.get('rating') for a in (row.answers.get('areas') or {}).values())
    if not answered:
        errors['answers'] = 'Fill in the check-in before signing.'
    if errors:
        raise ValidationError(errors)
    try:
        manager_png = _signature_png(manager_signature)
    except ValidationError:
        raise ValidationError({'manager_signature': 'The manager signs in their box.'})
    try:
        employee_png = _signature_png(employee_signature)
    except ValidationError:
        raise ValidationError({'employee_signature': 'The employee signs in their box.'})
    row.manager_name, row.employee_name = manager_name, employee_name
    row.manager_signature = save_upload(ContentFile(manager_png, name='manager.png'), user=by,
                                        key_prefix='hiring/checkins')
    row.employee_signature = save_upload(ContentFile(employee_png, name='employee.png'), user=by,
                                         key_prefix='hiring/checkins')
    row.signed_at, row.signed_by = timezone.now(), by
    row.signer_ip, row.signer_user_agent = ip, (user_agent or '')[:300]
    row.status = CheckIn.STATUS_DONE
    upload = ContentFile(build_pdf(row, manager_png, employee_png), name=f'checkin-{row.day}-{row.user_id}.pdf')
    upload.content_type = 'application/pdf'
    row.signed_pdf = save_upload(upload, user=by, key_prefix='hiring/checkins')
    row.save()
    if row.close_onboarding and row.onboarding_id and row.onboarding.status == Onboarding.STATUS_ACTIVE:
        _close_onboarding(row, by=by)
    return row


def _close_onboarding(row: CheckIn, *, by) -> None:
    from apps.hiring.onboarding import _event, refresh

    onboarding = row.onboarding
    now = timezone.now()
    onboarding.tasks.filter(status=OnboardingTask.STATUS_OPEN).update(
        status=OnboardingTask.STATUS_SKIPPED, done_at=now, done_by=by, note=f'Closed by the {row.day}-day check-in')
    refresh(onboarding)
    _event(onboarding, f'Onboarding closed by the {row.day}-day check-in', by=by)


def skip(row: CheckIn, *, reason: str, by) -> CheckIn:
    if row.status != CheckIn.STATUS_SCHEDULED:
        raise ValidationError({'detail': 'Only a check-in coming up can be skipped.'})
    reason = (reason or '').strip()[:300]
    if not reason:
        raise ValidationError({'reason': 'Say why (for example: they left).'})
    row.status, row.skipped_reason = CheckIn.STATUS_SKIPPED, reason
    row.save(update_fields=['status', 'skipped_reason', 'updated_at'])
    return row


# ── The signed PDF ──────────────────────────────────────────────────────────


def _html(row: CheckIn) -> str:
    form, answers = row.form, row.answers
    when = timezone.localtime(row.signed_at)
    parts = [
        f'<h1>{row.day}-day check-in: {html.escape(row.employee_name)}</h1>',
        f'<p class="date">Due {row.due_date:%B %d, %Y}; met and signed {when:%B %d, %Y at %I:%M %p} (store time). '
        f'Manager: {html.escape(row.manager_name)}.</p>',
    ]
    for q in form.get('questions', []):
        text = (answers.get('questions') or {}).get(q['key']) or '(blank)'
        parts.append(f'<h2>{html.escape(q["label"])}</h2><p>{"<br>".join(html.escape(t) for t in text.splitlines())}</p>')
    if form.get('areas'):
        parts.append('<h2>Areas</h2><ul>')
        for area in form['areas']:
            given = (answers.get('areas') or {}).get(area) or {}
            note = f': {html.escape(given["note"])}' if given.get('note') else ''
            parts.append(f'<li><b>{html.escape(area)}</b>: {html.escape(given.get("rating") or "not rated")}{note}</li>')
        parts.append('</ul>')
    parts.append(f'<h2>The employee\'s comments</h2><p>{html.escape(row.employee_comments or "(none)")}</p>')
    if row.close_onboarding:
        parts.append('<p><b>This check-in closes onboarding.</b></p>')
    return ''.join(parts)


def build_pdf(row: CheckIn, manager_png: bytes, employee_png: bytes) -> bytes:
    import pymupdf

    from apps.hiring.offers import _CSS, audit_rows

    margin = 54
    buffer = io.BytesIO()
    writer = pymupdf.DocumentWriter(buffer)
    story = pymupdf.Story(html=_html(row), user_css=_CSS)
    mediabox = pymupdf.Rect(0, 0, 612, 792)
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
        statement = (row.form or {}).get('employee_statement') or ''
        top = f'<h2>Signatures</h2><p>[X] {html.escape(statement)}</p>'
        box = pymupdf.Rect(margin, margin, 612 - margin, 300)
        spare, _ = page.insert_htmlbox(box, top, css=_CSS)
        y = box.y1 - max(spare, 0) + 8
        for label, name, png in (('Manager', row.manager_name, manager_png), ('Employee', row.employee_name, employee_png)):
            page.insert_image(pymupdf.Rect(margin, y, margin + 240, y + 72), stream=png, keep_proportion=True)
            y += 76
            page.draw_line(pymupdf.Point(margin, y), pymupdf.Point(margin + 240, y), color=(0.4, 0.4, 0.4), width=0.6)
            page.insert_htmlbox(pymupdf.Rect(margin, y + 2, 612 - margin, y + 22),
                                f'<p class="small">{label}: {html.escape(name)}</p>', css=_CSS)
            y += 30
        audit = [
            ('Check-in', f'#{row.pk}, the {row.day}-day check-in, due {row.due_date:%B %d, %Y}'),
            ('Signed in Dash by', (row.signed_by.email if row.signed_by_id else 'unknown') + ' (both signed on this device)'),
            ('Signed (UTC)', row.signed_at.astimezone(dt_timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')),
            ('IP address', row.signer_ip or 'unknown'),
            ('Device', row.signer_user_agent or 'unknown'),
        ]
        page.insert_htmlbox(pymupdf.Rect(margin, y + 10, 612 - margin, 792 - margin),
                            f'<h2>Signing audit trail</h2>{audit_rows(audit)}', css=_CSS)
        doc.subset_fonts()
        return doc.tobytes(garbage=3, deflate=True)
    finally:
        doc.close()
