"""Offers (Phase 3): make an offer, the private link, sign with a finger on a phone, the signed PDF.

What the applicant signs is frozen on the offer when it is sent (letter text, acknowledgments, consent).
Signing records the typed name, the drawn signature, the time, IP and device, and a SHA-256 of the letter,
then writes one PDF (the letter; the ticked acknowledgments, signature and audit trail) kept privately.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import html
import re
import secrets
from datetime import date, datetime, time, timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.files import save_upload
from apps.hiring import emails
from apps.hiring.careers import fill, load_setting, template as email_template, universal_template
from apps.hiring.models import Application, ApplicationEvent, Offer

EMPLOYMENT_LABEL = {'part_time': 'Part time', 'full_time': 'Full time', 'seasonal': 'Seasonal'}
MAX_SIGNATURE_BYTES = 400_000
PNG_MAGIC = b'\x89PNG\r\n\x1a\n'


# ── Text ────────────────────────────────────────────────────────────────────


def date_text(value: date) -> str:
    return f'{value.strftime("%A, %B")} {value.day}' if value else ''


def time_text(value: time | None) -> str:
    if not value:
        return 'a time we will confirm'
    hour = value.strftime('%I').lstrip('0') or '12'
    return f'{hour}:{value.strftime("%M %p")}'


def money(value) -> str:
    return f'{Decimal(value):.2f}'


def person_name(user) -> str:
    if not user:
        return 'the hiring manager'
    return (user.full_name or '').strip() or user.email


def public_link(token: str) -> str:
    base = (getattr(settings, 'ONLINE_SALES_PUBLIC_BASE_URL', None) or 'https://ecothrift.us').rstrip('/')
    return f'{base}/careers/offer?t={token}'


def _template(key: str, application: Application, job=None) -> dict:
    """The offer's own role first, then any applied role's version, then the universal one."""
    if job is not None:
        block = (job.emails or {}).get(key)
        if isinstance(block, dict) and block.get('subject') and block.get('body'):
            return block
    return email_template(key, application) if application.pk else universal_template(key)


def values(application: Application, terms: dict) -> dict:
    cfg = load_setting()['offer']
    return {
        **emails.values_for(application),
        'full_name': application.full_name,
        'role': terms['position'],
        'pay_rate': money(terms['pay_rate']),
        'employment_type': EMPLOYMENT_LABEL.get(terms['employment_type'], terms['employment_type']),
        'start_date': date_text(terms['start_date']),
        'start_time': time_text(terms.get('start_time')),
        'schedule': terms.get('schedule') or 'set together before your first week',
        'supervisor': person_name(terms.get('supervisor')),
        'respond_by': date_text(terms['respond_by']),
        'note': (terms.get('note') or '').strip(),
        'offer_date': date_text(timezone.localdate()),
        'signer_name': cfg['signer_name'],
        'signer_title': cfg['signer_title'],
    }


def render(application: Application, terms: dict, *, job=None) -> tuple[str, str]:
    """The letter's subject and text as the applicant will read and sign it."""
    block = _template('offer_letter', application, job)
    filled = values(application, terms)
    text = fill(block['body'], filled)
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    return fill(block['subject'], filled).strip(), text


# ── Making an offer ─────────────────────────────────────────────────────────


def _event(application, text: str, *, by=None, data: dict | None = None, from_stage='', to_stage=''):
    kind = ApplicationEvent.KIND_STAGE if to_stage else ApplicationEvent.KIND_OFFER
    return ApplicationEvent.objects.create(application=application, kind=kind, by=by, text=text, data=data or {},
                                           from_stage=from_stage, to_stage=to_stage)


def _move_stage(application, stage: str, *, by):
    if application.stage == stage:
        return
    previous = application.stage
    application.stage = stage
    application.stage_changed_at = timezone.now()
    application.save(update_fields=['stage', 'stage_changed_at', 'updated_at'])
    _event(application, '', by=by, from_stage=previous, to_stage=stage)


def clean_terms(raw: dict, application: Application) -> dict:
    """Validate the staff form. Returns terms (position, pay_rate, …) or raises ValidationError."""
    from apps.hiring.careers import staff_users
    from apps.hiring.models import Job

    errors = {}
    job = None
    if raw.get('job'):
        job = application.jobs.filter(pk=raw.get('job')).first() or Job.objects.filter(pk=raw.get('job')).first()
    job = job or application.jobs.order_by('sort_order').first()
    position = (raw.get('position') or (job.title if job else '')).strip()[:120]
    if not position:
        errors['position'] = 'Name the position.'
    try:
        pay_rate = Decimal(str(raw.get('pay_rate')).replace('$', '').strip())
        if pay_rate <= 0 or pay_rate > 200:
            raise InvalidOperation
    except (InvalidOperation, ValueError, TypeError):
        errors['pay_rate'] = 'Enter the hourly pay, like 16.50.'
        pay_rate = None
    try:
        start_date = date.fromisoformat(str(raw.get('start_date')))
        if start_date < timezone.localdate():
            errors['start_date'] = 'The start date is in the past.'
    except ValueError:
        errors['start_date'] = 'Pick a start date.'
        start_date = None
    start_time = None
    if raw.get('start_time'):
        try:
            start_time = time.fromisoformat(str(raw.get('start_time')))
        except ValueError:
            errors['start_time'] = 'Use a time like 09:00.'
    respond_days = int(load_setting()['offer']['respond_days'])
    try:
        respond_by = date.fromisoformat(str(raw.get('respond_by'))) if raw.get('respond_by') else \
            timezone.localdate() + timedelta(days=respond_days)
        if respond_by < timezone.localdate():
            errors['respond_by'] = 'The reply-by date is in the past.'
    except ValueError:
        errors['respond_by'] = 'Pick a reply-by date.'
        respond_by = None
    employment_type = raw.get('employment_type') or 'part_time'
    if employment_type not in EMPLOYMENT_LABEL:
        errors['employment_type'] = 'Part time, full time or seasonal.'
    supervisor = None
    if raw.get('supervisor'):
        supervisor = staff_users().filter(pk=raw.get('supervisor')).first()
        if supervisor is None:
            errors['supervisor'] = 'Pick a staff member.'
    elif job and job.hiring_manager_id:
        supervisor = job.hiring_manager
    if errors:
        raise ValidationError(errors)
    return {
        'job': job, 'position': position, 'pay_rate': pay_rate, 'start_date': start_date, 'start_time': start_time,
        'schedule': (raw.get('schedule') or (job.schedule if job else '') or '').strip()[:300],
        'employment_type': employment_type, 'supervisor': supervisor, 'respond_by': respond_by,
        'note': (raw.get('note') or '').strip()[:2000],
    }


def preview(application: Application, raw: dict) -> dict:
    terms = clean_terms(raw, application)
    subject, text = render(application, terms, job=terms['job'])
    cfg = load_setting()['offer']
    return {'subject': subject, 'letter': text, 'acknowledgments': cfg['acknowledgments'], 'consent': cfg['consent']}


@transaction.atomic
def make(application: Application, raw: dict, *, by, send: bool) -> tuple[Offer, str, bool]:
    if application.stage in (Application.STAGE_HIRED, Application.STAGE_NOT_NOW):
        raise ValidationError({'detail': 'This applicant is already hired or marked Not now.'})
    if send and not application.email:
        raise ValidationError({'detail': 'This applicant has no email. Use Copy link and text it instead.'})
    terms = clean_terms(raw, application)
    for old in application.offers.filter(status__in=Offer.OPEN):
        withdraw(old, by=by, quiet=True)
    subject, text = render(application, terms, job=terms['job'])
    cfg = load_setting()['offer']
    offer = Offer.objects.create(
        application=application, job=terms['job'], token=secrets.token_urlsafe(24), position=terms['position'],
        pay_rate=terms['pay_rate'], employment_type=terms['employment_type'], start_date=terms['start_date'],
        start_time=terms['start_time'], schedule=terms['schedule'], supervisor=terms['supervisor'],
        respond_by=terms['respond_by'], note=terms['note'], letter_subject=subject, letter_text=text,
        acknowledgments=list(cfg['acknowledgments']), consent_text=cfg['consent'], sent_at=timezone.now(),
        created_by=by,
    )
    link = public_link(offer.token)
    sent = _send(offer, 'offer_sent', application.email) if send else False
    _event(application, f'Offer made: {offer.position}, ${money(offer.pay_rate)} an hour, starts '
                        f'{date_text(offer.start_date)}' + (' (emailed)' if sent else ' (link copied)'),
           by=by, data={'offer': offer.pk, 'sent': sent})
    _move_stage(application, Application.STAGE_OFFER, by=by)
    return offer, link, sent


def _offer_values(offer: Offer, **extra) -> dict:
    terms = {
        'position': offer.position, 'pay_rate': offer.pay_rate, 'employment_type': offer.employment_type,
        'start_date': offer.start_date, 'start_time': offer.start_time, 'schedule': offer.schedule,
        'supervisor': offer.supervisor, 'respond_by': offer.respond_by, 'note': offer.note,
    }
    from apps.hiring.services import dash_link
    return {**values(offer.application, terms), 'link': public_link(offer.token),
            'applicant': offer.application.full_name, 'dash_link': dash_link(offer.application), **extra}


def _send(offer: Offer, key: str, to, *, attachment: bytes | None = None, **extra) -> bool:
    block = _template(key, offer.application, offer.job)
    filled = _offer_values(offer, **extra)
    attachments = [(f'Eco-Thrift offer - {offer.application.full_name}.pdf', attachment, 'application/pdf')] \
        if attachment else None
    return emails.send(to=to, subject=fill(block['subject'], filled), body=fill(block['body'], filled),
                       attachments=attachments, practice=offer.application.is_practice)


def resend(offer: Offer, *, by) -> bool:
    refresh(offer)
    if offer.status not in Offer.OPEN:
        raise ValidationError({'detail': 'Only an open offer can be sent again.'})
    sent = _send(offer, 'offer_sent', offer.application.email)
    _event(offer.application, 'Offer emailed again' if sent else 'Offer email could not be sent', by=by,
           data={'offer': offer.pk})
    return sent


def withdraw(offer: Offer, *, by, quiet: bool = False) -> Offer:
    if offer.status not in Offer.OPEN:
        raise ValidationError({'detail': 'Only an open offer can be withdrawn.'})
    offer.status = Offer.STATUS_WITHDRAWN
    offer.withdrawn_at = timezone.now()
    offer.save(update_fields=['status', 'withdrawn_at'])
    _event(offer.application, 'Offer withdrawn' + (' (replaced by a new offer)' if quiet else ''), by=by,
           data={'offer': offer.pk})
    return offer


# ── The applicant's side ────────────────────────────────────────────────────


def refresh(offer: Offer) -> Offer:
    """An open offer past its reply-by date becomes Expired."""
    if offer.status in Offer.OPEN and offer.respond_by < timezone.localdate():
        offer.status = Offer.STATUS_EXPIRED
        offer.save(update_fields=['status'])
        _event(offer.application, 'Offer expired (not signed by the reply-by date)', data={'offer': offer.pk})
    return offer


def for_token(token: str) -> Offer | None:
    token = (token or '').strip()
    if len(token) < 20:
        return None
    offer = Offer.objects.select_related('application', 'job', 'supervisor').filter(token=token).first()
    return refresh(offer) if offer else None


def mark_viewed(offer: Offer) -> Offer:
    if offer.status == Offer.STATUS_SENT:
        offer.status = Offer.STATUS_VIEWED
        offer.viewed_at = timezone.now()
        offer.save(update_fields=['status', 'viewed_at'])
        _event(offer.application, 'Offer opened', data={'offer': offer.pk})
    return offer


def _signature_png(data_url: str) -> bytes:
    prefix = 'data:image/png;base64,'
    if not isinstance(data_url, str) or not data_url.startswith(prefix):
        raise ValidationError({'signature': 'Draw your signature in the box.'})
    try:
        raw = base64.b64decode(data_url[len(prefix):], validate=True)
    except (binascii.Error, ValueError):
        raise ValidationError({'signature': 'The signature did not come through. Draw it again.'})
    if not raw.startswith(PNG_MAGIC) or len(raw) > MAX_SIGNATURE_BYTES or len(raw) < 200:
        raise ValidationError({'signature': 'The signature did not come through. Draw it again.'})
    return raw


@transaction.atomic
def sign(offer: Offer, *, name: str, signature: str, acks, consent, ip: str | None, user_agent: str) -> Offer:
    offer = Offer.objects.select_for_update().get(pk=offer.pk)
    refresh(offer)
    if offer.status not in Offer.OPEN:
        raise ValidationError({'detail': f'This offer is {offer.get_status_display().lower()} and can no longer be signed.'})
    name = ' '.join((name or '').split())[:160]
    errors = {}
    if len(name) < 3:
        errors['name'] = 'Type your full legal name.'
    if consent not in (True, 'true', '1', 1):
        errors['consent'] = 'Tick the box to sign electronically.'
    ticks = list(acks or [])
    if len(ticks) != len(offer.acknowledgments) or not all(t in (True, 'true', '1', 1) for t in ticks):
        errors['acks'] = 'Tick each statement to accept.'
    if errors:
        raise ValidationError(errors)
    png = _signature_png(signature)
    now = timezone.now()
    offer.signature = save_upload(ContentFile(png, name='signature.png'), user=None, key_prefix='hiring/offers')
    offer.signer_name = name
    offer.signer_ip = ip
    offer.signer_user_agent = (user_agent or '')[:300]
    offer.signed_at = now
    offer.letter_sha256 = hashlib.sha256(offer.letter_text.encode('utf-8')).hexdigest()
    offer.status = Offer.STATUS_SIGNED
    pdf = build_pdf(offer, png)
    upload = ContentFile(pdf, name=f'offer-{offer.pk}.pdf')
    upload.content_type = 'application/pdf'
    offer.signed_pdf = save_upload(upload, user=None, key_prefix='hiring/offers')
    offer.save()
    application = offer.application
    _event(application, f'Offer signed by {name}', data={'offer': offer.pk})
    _move_stage(application, Application.STAGE_HIRED, by=None)
    if application.email:
        _send(offer, 'offer_signed', application.email, attachment=pdf)
    staff = emails.alert_recipients(application)
    if staff:
        _send(offer, 'offer_notice', staff, attachment=pdf, action='signed', reason='')
    return offer


@transaction.atomic
def decline(offer: Offer, *, reason: str) -> Offer:
    refresh(offer)
    if offer.status not in Offer.OPEN:
        raise ValidationError({'detail': f'This offer is {offer.get_status_display().lower()}.'})
    offer.status = Offer.STATUS_DECLINED
    offer.declined_at = timezone.now()
    offer.decline_reason = (reason or '').strip()[:2000]
    offer.save(update_fields=['status', 'declined_at', 'decline_reason'])
    _event(offer.application, 'Offer declined' + (f': {offer.decline_reason}' if offer.decline_reason else ''),
           data={'offer': offer.pk})
    staff = emails.alert_recipients(offer.application)
    if staff:
        _send(offer, 'offer_notice', staff, action='declined',
              reason=f'Their reason: {offer.decline_reason}' if offer.decline_reason else 'No reason given.')
    return offer


# ── The signed PDF ──────────────────────────────────────────────────────────


def _letter_html(subject: str, text: str) -> str:
    today = timezone.localdate()
    parts = [f'<h1>{html.escape(subject)}</h1>',
             f'<p class="date">{html.escape(today.strftime("%B"))} {today.day}, {today.year}</p>']
    for para in text.split('\n\n'):
        lines = [line for line in para.split('\n') if line.strip()]
        if lines and all(line.lstrip().startswith('- ') for line in lines):
            parts.append('<ul>' + ''.join(f'<li>{html.escape(line.lstrip()[2:])}</li>' for line in lines) + '</ul>')
        elif lines:
            parts.append('<p>' + '<br>'.join(html.escape(line) for line in lines) + '</p>')
    return ''.join(parts)


_CSS = (
    'body{font-family:sans-serif;font-size:11pt;line-height:1.45;color:#1a1f1c}'
    'h1{font-size:16pt;margin:0 0 4pt 0}h2{font-size:13pt;margin:10pt 0 4pt 0}'
    '.date{color:#5b635e;margin:0 0 12pt 0}p{margin:0 0 8pt 0}ul{margin:0 0 8pt 0}'
    '.small{font-size:8.5pt;color:#5b635e}.mono{font-family:monospace}'
)


def audit_rows(audit: list[tuple[str, str]]) -> str:
    """The audit trail as HTML. A fingerprint is set in monospace: a proportional font joins "ff" or "fi" into
    one ligature, and then the hash copied out of the PDF no longer matches."""
    def value(key: str, text: str) -> str:
        return f'<span class="mono">{html.escape(text)}</span>' if 'fingerprint' in key.lower() else html.escape(text)

    return ''.join(f'<p class="small"><b>{html.escape(k)}:</b> {value(k, v)}</p>' for k, v in audit)


def build_pdf(offer: Offer, signature_png: bytes) -> bytes:
    import pymupdf

    doc = pymupdf.open()
    try:
        width, height, margin = 612, 792, 54
        page = doc.new_page(width=width, height=height)
        page.insert_htmlbox(pymupdf.Rect(margin, margin, width - margin, height - margin),
                            _letter_html(offer.letter_subject or 'Offer of employment', offer.letter_text), css=_CSS)

        page = doc.new_page(width=width, height=height)
        acks = ''.join(f'<li>[X] {html.escape(a)}</li>' for a in offer.acknowledgments)
        local = timezone.localtime(offer.signed_at)
        top = (f'<h2>Accepted by {html.escape(offer.signer_name)}</h2>'
               f'<p>{html.escape(offer.application.full_name)} ticked each statement:</p><ul>{acks}</ul>'
               f'<p>Agreed to sign electronically: "{html.escape(offer.consent_text)}"</p><h2>Signature</h2>')
        box = pymupdf.Rect(margin, margin, width - margin, 420)
        spare, _ = page.insert_htmlbox(box, top, css=_CSS)
        y = box.y1 - max(spare, 0) + 4  # right under the text, however long the statements are
        page.insert_image(pymupdf.Rect(margin, y, margin + 260, y + 80), stream=signature_png, keep_proportion=True)
        y += 84
        page.draw_line(pymupdf.Point(margin, y), pymupdf.Point(margin + 260, y), color=(0.4, 0.4, 0.4), width=0.6)
        signed_line = (f'<p>{html.escape(offer.signer_name)}<br>Signed {html.escape(local.strftime("%B %d, %Y at %I:%M %p"))} '
                       f'(store time)</p>')
        page.insert_htmlbox(pymupdf.Rect(margin, y + 4, width - margin, y + 50), signed_line, css=_CSS)
        audit_top = y + 64
        audit = [
            ('Offer', f'#{offer.pk}: {offer.position}, ${money(offer.pay_rate)} an hour, starts {date_text(offer.start_date)}'),
            ('Sent to', f'{offer.application.email or "(no email)"} by private link on '
                        f'{timezone.localtime(offer.sent_at).strftime("%B %d, %Y %I:%M %p") if offer.sent_at else ""}'),
            ('Opened', timezone.localtime(offer.viewed_at).strftime('%B %d, %Y %I:%M %p') if offer.viewed_at else 'at signing'),
            ('Signed (UTC)', offer.signed_at.astimezone(dt_timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')),
            ('IP address', offer.signer_ip or 'unknown'),
            ('Device', offer.signer_user_agent or 'unknown'),
            ('Letter fingerprint', f'SHA-256 {offer.letter_sha256}'),
        ]
        rows = audit_rows(audit)
        page.insert_htmlbox(pymupdf.Rect(margin, audit_top, width - margin, height - margin),
                            f'<h2>Signing audit trail</h2>{rows}', css=_CSS)
        if offer.application.is_practice:
            for each in doc:
                each.insert_text(pymupdf.Point(margin, 34), 'PRACTICE RUN - NOT A REAL OFFER', fontsize=12,
                                 fontname='hebo', color=(0.75, 0.1, 0.1))
        doc.subset_fonts()
        return doc.tobytes(garbage=3, deflate=True)
    finally:
        doc.close()
