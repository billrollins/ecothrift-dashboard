"""Documents and e-sign: templates, filling, freezing, parties in order, links, signing, completion, notice, void.
Uploaded PDFs with placed boxes are in ``placed.py``; sending one template to many people in ``batches.py``; asking for
a document to be deleted, restoring it and purging it in ``purge.py``.

Rules every signing follows (house standard documents.md section 2): consent tick, the exact text frozen when sent
with its SHA-256, a single-use link that expires (or a signed-in signer), the time / IP / browser of every step on an
audit page, the same final PDF to every party, no account for a link signer, sensitive uploads owner-only.

Parties sign one after another: only the party whose turn it is can sign. When the last one signs, the final PDF is
made once and the same bytes go to every party.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import re
import secrets
from datetime import date, timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from . import adapter, pdf
from .models import AuditEvent, Envelope, Party, Signature, SigningLink, Template, TemplateVersion, Upload

CONSENT_TEXT = (
    'I agree to sign this document electronically. I have read all of it. My typed name and the signature I draw '
    'are my legal signature on exactly this document.'
)
PNG_MAGIC = b'\x89PNG\r\n\x1a\n'
MAX_SIGNATURE_BYTES = 400_000
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PARTIES = 8
UPLOAD_TYPES = {b'%PDF-': 'application/pdf', b'\x89PNG': 'image/png', b'\xff\xd8\xff': 'image/jpeg'}
FIELD_KINDS = ('text', 'textarea', 'date', 'choice')
BUILTIN_FIELDS = ('signer_name', 'signer_title', 'signer_email', 'company_name', 'agreement_date')
_PARTY_BLANK = re.compile(r'^party_(\d)_(name|title|role)$')
_BLANK = re.compile(r'\{\{\s*([a-z][a-z0-9_]*)\s*\}\}')
_EMAIL = re.compile(r'[^@\s]+@[^@\s]+\.[^@\s]+')


def link_days() -> int:
    return int(getattr(settings, 'ESIGN_LINK_DAYS', 14))


def notice_days() -> int:
    return int(getattr(settings, 'ESIGN_NOTICE_DAYS', 14))


def hash_token(token: str) -> str:
    return hashlib.sha256((token or '').encode('utf-8')).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def log(envelope: Envelope, kind: str, *, actor: str = '', ip: str | None = None, user_agent: str = '',
        detail: str = '') -> AuditEvent:
    return AuditEvent.objects.create(envelope=envelope, kind=kind, actor=actor[:200], ip=ip or '',
                                     user_agent=(user_agent or '')[:300], detail=detail[:500])


def person(user) -> str:
    if not user:
        return 'system'
    full = user.get_full_name() if hasattr(user, 'get_full_name') else ''
    return (full or getattr(user, 'full_name', '') or '').strip() or getattr(user, 'email', '') or str(user)


# -- Templates ------------------------------------------------------------------


def blanks_in(sections: list[dict]) -> list[str]:
    seen: list[str] = []
    for section in sections:
        for text in (section.get('heading', ''), section.get('body', '')):
            for key in _BLANK.findall(text):
                if key not in seen:
                    seen.append(key)
    return seen


def is_builtin(key: str) -> bool:
    return key in BUILTIN_FIELDS or bool(_PARTY_BLANK.match(key))


def clean_sections(raw) -> list[dict]:
    if not isinstance(raw, list) or not raw:
        raise ValidationError({'sections': 'Add at least one section.'})
    out = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValidationError({'sections': 'Each section needs a heading and text.'})
        heading = str(item.get('heading') or '').strip()[:200]
        body = str(item.get('body') or '').strip()
        if not heading and not body:
            continue
        out.append({'heading': heading, 'body': body})
    if not out:
        raise ValidationError({'sections': 'Add at least one section with some text.'})
    return out


def clean_fields(raw, sections: list[dict]) -> list[dict]:
    """The field list always covers every {{blank}} in the text (a missing one is added as a required text field)."""
    given = {}
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get('key') or '').strip()
        if not re.fullmatch(r'[a-z][a-z0-9_]*', key):
            raise ValidationError({'fields': f'"{key}" is not a valid blank name. Use lowercase letters, digits and _.'})
        kind = item.get('kind') or 'text'
        if kind not in FIELD_KINDS:
            raise ValidationError({'fields': f'Field "{key}": kind must be one of {", ".join(FIELD_KINDS)}.'})
        options = [str(o).strip() for o in (item.get('options') or []) if str(o).strip()]
        if kind == 'choice' and len(options) < 2:
            raise ValidationError({'fields': f'Field "{key}": a choice needs at least two options.'})
        given[key] = {'key': key, 'label': str(item.get('label') or key.replace('_', ' ').capitalize())[:120],
                      'kind': kind, 'required': bool(item.get('required', True)), 'options': options,
                      'default': str(item.get('default') or '')[:500]}
    out = []
    for key in blanks_in(sections):
        if is_builtin(key):
            continue
        out.append(given.get(key) or {'key': key, 'label': key.replace('_', ' ').capitalize(), 'kind': 'text',
                                      'required': True, 'options': [], 'default': ''})
    return out


def clean_acknowledgments(raw) -> list[str]:
    out = []
    for item in raw or []:
        text = ' '.join(str(item or '').split())[:300]
        if text and text not in out:
            out.append(text)
    return out[:10]


def clean_kind(kind) -> str:
    keys = [k['key'] for k in adapter.get().kinds()]
    kind = str(kind or '').strip() or (keys[0] if keys else 'agreement')
    if keys and kind not in keys:
        raise ValidationError({'kind': f'Pick one of: {", ".join(keys)}.'})
    return kind[:60]


@transaction.atomic
def create_template(*, name: str, kind: str, title: str, sections, fields, by, acknowledgments=None) -> Template:
    name = (name or '').strip()[:160]
    if not name:
        raise ValidationError({'name': 'Give the template a name.'})
    template = Template.objects.create(name=name, kind=clean_kind(kind), created_by=by)
    save_version(template, title=title or name, sections=sections, fields=fields, by=by, note='First version',
                 acknowledgments=acknowledgments)
    return template


@transaction.atomic
def save_version(template: Template, *, title: str, sections, fields, by, note: str = '',
                 acknowledgments=None) -> TemplateVersion:
    """Every save is a new version. An old version is never changed (documents already sent keep their words)."""
    title = (title or '').strip()[:200]
    if not title:
        raise ValidationError({'title': 'Give the document a title.'})
    sections = clean_sections(sections)
    fields = clean_fields(fields, sections)
    last = template.versions.select_for_update().order_by('-number').first()
    return TemplateVersion.objects.create(
        template=template, number=(last.number + 1) if last else 1, title=title, sections=sections, fields=fields,
        acknowledgments=clean_acknowledgments(acknowledgments), note=(note or '')[:300], created_by=by)


# -- Filling and freezing --------------------------------------------------------


def long_date(value: date) -> str:
    return f'{value.strftime("%B")} {value.day}, {value.year}'


def clean_values(version: TemplateVersion, raw: dict | None, *, strict: bool) -> dict:
    """Keep only the template's own fields; with ``strict`` every required one must be filled."""
    raw = raw or {}
    values, errors = {}, {}
    for field in version.fields:
        key = field['key']
        value = str(raw.get(key, field.get('default', '')) or '').strip()
        if value:
            if field['kind'] == 'choice' and value not in field['options']:
                errors[key] = f'Pick one of: {", ".join(field["options"])}.'
            if field['kind'] == 'date':
                try:
                    date.fromisoformat(value)
                except ValueError:
                    errors[key] = 'Pick a date.'
            if field['kind'] != 'textarea' and len(value) > 500:
                errors[key] = 'Too long.'
            values[key] = value[:5000]
        elif strict and field.get('required', True):
            errors[key] = f'Fill in "{field["label"]}".'
    if errors:
        raise ValidationError(errors)
    return values


def render(version: TemplateVersion, values: dict, parties: list, *, on: date | None = None) -> str:
    """The document as plain text. Blanks that are not filled show as a visible gap, never silently vanish.

    ``parties`` are Party rows or dicts in signing order; {{party_1_name}} ... and {{signer_*}} (the first party)."""
    on = on or timezone.localdate()

    def get(p, key):
        return (p.get(key) if isinstance(p, dict) else getattr(p, key, '')) or ''

    first = parties[0] if parties else {}
    shown = {
        'signer_name': get(first, 'name'), 'signer_title': get(first, 'title'), 'signer_email': get(first, 'email'),
        'company_name': adapter.get().branding().get('company_name', ''), 'agreement_date': long_date(on),
    }
    for n, p in enumerate(parties, 1):
        shown[f'party_{n}_name'] = get(p, 'name')
        shown[f'party_{n}_title'] = get(p, 'title')
        shown[f'party_{n}_role'] = get(p, 'role_label')
    kinds = {f['key']: f['kind'] for f in version.fields}
    for key, value in values.items():
        if kinds.get(key) == 'date':
            try:
                value = long_date(date.fromisoformat(value))
            except ValueError:
                pass
        shown[key] = value

    def fill(text: str) -> str:
        return _BLANK.sub(lambda m: shown.get(m.group(1)) or '________', text)

    parts = [fill(version.title)]
    for section in version.sections:
        heading, body = fill(section['heading']), fill(section['body'])
        parts.append('\n'.join(x for x in ((f'## {heading}' if heading else ''), body) if x))
    return '\n\n'.join(parts).strip() + '\n'


def split_text(text: str) -> tuple[str, list[tuple[str, str]]]:
    """The frozen text back into (title, [(heading, body)]) for the PDF and the signer's screen."""
    blocks = text.strip().split('\n\n')
    title = blocks[0] if blocks else ''
    sections: list[list[str]] = []
    for block in blocks[1:]:
        if block.startswith('## '):
            head, _, rest = block.partition('\n')
            sections.append([head[3:], rest])
        elif sections:
            sections[-1][1] = (sections[-1][1] + '\n\n' + block).strip()
        else:
            sections.append(['', block])
    return title, [(h, b) for h, b in sections]


def preview(version: TemplateVersion, values: dict, parties: list[dict]) -> str:
    return render(version, clean_values(version, values, strict=False), parties or [])


# -- Parties -----------------------------------------------------------------------


def clean_parties(raw) -> list[dict]:
    """[{'name', 'email', 'title', 'role_label', 'user_id'?}] in signing order. A host user fills name and email."""
    if not isinstance(raw, list) or not raw:
        raise ValidationError({'parties': 'Add at least one person to sign.'})
    if len(raw) > MAX_PARTIES:
        raise ValidationError({'parties': f'At most {MAX_PARTIES} people can sign one document.'})
    out, users = [], set()
    for i, item in enumerate(raw, 1):
        if not isinstance(item, dict):
            raise ValidationError({'parties': f'Signer {i} is not complete.'})
        user_id = item.get('user_id') or None
        found = None
        if user_id:
            found = adapter.get().user_party(user_id)
            if found is None:
                raise ValidationError({'parties': f'Signer {i}: that person is not an active user.'})
            if user_id in users:
                raise ValidationError({'parties': f'{found["name"]} is listed twice.'})
            users.add(user_id)
        name = ' '.join(str(item.get('name') or (found or {}).get('name') or '').split())[:160]
        email = str(item.get('email') or (found or {}).get('email') or '').strip()[:254]
        title = ' '.join(str(item.get('title') or (found or {}).get('title') or '').split())[:160]
        if len(name) < 2:
            raise ValidationError({'parties': f'Signer {i}: enter a name.'})
        if email and not _EMAIL.fullmatch(email):
            raise ValidationError({'parties': f'Signer {i}: that email is not valid.'})
        if not email and not user_id:
            raise ValidationError({'parties': f'Signer {i}: an email is needed for someone without a Dash sign-in.'})
        out.append({'name': name, 'email': email, 'title': title,
                    'role_label': ' '.join(str(item.get('role_label') or '').split())[:80], 'user_id': user_id})
    return out


def _set_parties(envelope: Envelope, parties: list[dict]) -> None:
    envelope.parties.all().delete()
    for order, p in enumerate(parties, 1):
        Party.objects.create(envelope=envelope, order=order, name=p['name'], email=p['email'], title=p['title'],
                             role_label=p['role_label'], user_id=p['user_id'])


def current_party(envelope: Envelope) -> Party | None:
    """Whose turn it is (None when nobody's: a draft, or everyone has signed)."""
    return envelope.parties.filter(status=Party.READY).order_by('order').first()


# -- Documents ----------------------------------------------------------------------


@transaction.atomic
def create_envelope(*, version: TemplateVersion, parties, values: dict, requires_w9: bool = False, by,
                    attached_type: str = '', attached_id: str = '', title: str = '') -> Envelope:
    cleaned = clean_parties(parties)
    envelope = Envelope.objects.create(
        template_version=version, kind=version.template.kind, title=(title or version.title)[:200],
        values=clean_values(version, values, strict=False), requires_w9=bool(requires_w9), created_by=by,
        attached_type=str(attached_type or '')[:60], attached_id=str(attached_id or '')[:60])
    _set_parties(envelope, cleaned)
    log(envelope, 'created', actor=person(by), detail=f'From {version}')
    return envelope


@transaction.atomic
def update_draft(envelope: Envelope, *, parties=None, values: dict | None = None, requires_w9: bool | None = None,
                 title: str | None = None, by) -> Envelope:
    envelope = Envelope.objects.select_for_update().get(pk=envelope.pk)
    if envelope.status != Envelope.DRAFT:
        raise ValidationError({'detail': 'Only a draft can be changed. What was sent is frozen.'})
    if parties is not None:
        cleaned = clean_parties(parties)
        _set_parties(envelope, cleaned)
        envelope.placed.filter(signer__gt=len(cleaned)).delete()  # boxes for a signer who is gone
    if values is not None and envelope.template_version_id:
        envelope.values = clean_values(envelope.template_version, values, strict=False)
    if requires_w9 is not None:
        envelope.requires_w9 = bool(requires_w9)
    if title is not None and title.strip():
        envelope.title = title.strip()[:200]
    envelope.save(update_fields=['values', 'requires_w9', 'title'])
    log(envelope, 'edited', actor=person(by))
    return envelope


def sign_url(token: str) -> str:
    path = getattr(settings, 'ESIGN_SIGN_PATH', '/sign')
    return f'{adapter.get().public_base_url()}{path}?t={token}'


def _new_link(party: Party) -> str:
    party.links.filter(used_at__isnull=True, revoked_at__isnull=True).update(revoked_at=timezone.now())
    token = secrets.token_urlsafe(32)
    SigningLink.objects.create(party=party, token_hash=hash_token(token),
                               expires_at=timezone.now() + timedelta(days=link_days()))
    return token


def _email_link(party: Party, token: str) -> bool:
    if not party.email:
        return False
    brand = adapter.get().branding()
    company = brand.get('company_name', '')
    title = party.envelope.title
    in_app = adapter.get().in_app_sign_path(party.pk) if party.user_id else ''
    also = f'\n\nYou can also sign it in Dash: {adapter.get().public_base_url()}{in_app}' if in_app else ''
    body = (
        f'Hello {party.name},\n\n{company} sent you "{title}" to read and sign. '
        f'It takes a few minutes and works on your phone.\n\nOpen your private link:\n{sign_url(token)}\n\n'
        f'The link works once and expires in {link_days()} days. You do not need an account.{also}\n\n'
        f'If you did not expect this, reply to this email.\n\n{company}\n'
    )
    return adapter.get().send_mail(to=[party.email], subject=f'{company}: please sign "{title}"', body=body)


def _make_ready(party: Party, *, by=None) -> tuple[str, bool]:
    """It is this party's turn: a fresh link, emailed when there is an address. Returns (token, emailed)."""
    party.status = Party.READY
    party.ready_at = timezone.now()
    party.save(update_fields=['status', 'ready_at'])
    token = _new_link(party)
    emailed = _email_link(party, token)
    where = f'to {party.email}' if emailed else ('email could not be sent; copy the link' if party.email else 'no email')
    signed_in = '; can sign in Dash' if party.user_id else ''
    log(party.envelope, 'turn', actor=person(by) if by else 'system', detail=f'{party.name}\'s turn ({where}{signed_in})')
    return token, emailed


def _hand_over(party: Party, *, by) -> None:
    """The link was not emailed, so the sender is given it to pass on (D22 § 2 rule 3): the audit says who holds it."""
    why = 'the email could not be sent' if party.email else 'no email address'
    log(party.envelope, 'link_given', actor=person(by),
        detail=f"{person(by)} was given {party.name}'s link to hand over ({why})")


@transaction.atomic
def send(envelope: Envelope, *, by, ip: str | None = None, hand_over: bool = True) -> tuple[Envelope, str, bool]:
    """Freeze the text, the statements and the consent words; hash the text; open the first party's turn.
    Returns (envelope, token of the first party's link, whether it was emailed). Show the sender the link only
    when it was not emailed (D22 § 2 rule 3). ``hand_over=False`` when no link is shown to anyone (Send to everyone)."""
    envelope = Envelope.objects.select_for_update(of=('self',)).select_related('template_version').get(pk=envelope.pk)
    if envelope.status != Envelope.DRAFT:
        raise ValidationError({'detail': 'Only a draft can be sent. Use Send again for one already out.'})
    parties = list(envelope.parties.order_by('order'))
    if not parties:
        raise ValidationError({'parties': 'Add at least one person to sign.'})
    version = envelope.template_version
    if envelope.source == Envelope.PDF:
        from .placed import check_ready_to_send

        check_ready_to_send(envelope, parties)
    else:
        values = clean_values(version, envelope.values, strict=True)
        envelope.values = values
        envelope.body_text = render(version, values, parties)
        envelope.body_sha256 = sha256_text(envelope.body_text)
        envelope.acknowledgments = list(version.acknowledgments or [])
    envelope.consent_text = CONSENT_TEXT
    envelope.status = Envelope.OUT
    envelope.sent_at = timezone.now()
    envelope.save()
    if version is not None and not version.frozen:
        TemplateVersion.objects.filter(pk=version.pk).update(frozen=True)
    log(envelope, 'sent', actor=person(by), ip=ip,
        detail=f'{len(parties)} to sign, in order: ' + ', '.join(p.name for p in parties) +
               f'; SHA-256 {envelope.fingerprint}')
    token, emailed = _make_ready(parties[0], by=by)
    if not emailed and hand_over:
        _hand_over(parties[0], by=by)
    return envelope, token, emailed


@transaction.atomic
def resend(envelope: Envelope, *, by) -> tuple[Envelope, str, bool]:
    """A new link for whoever's turn it is (older ones stop working). Returns (envelope, token, emailed), as send."""
    envelope = Envelope.objects.select_for_update().get(pk=envelope.pk)
    party = current_party(envelope) if envelope.status == Envelope.OUT else None
    if party is None:
        raise ValidationError({'detail': 'Only a document waiting for someone can be sent again.'})
    token = _new_link(party)
    emailed = _email_link(party, token)
    log(envelope, 'resent', actor=person(by), detail=f'New link for {party.name}' + ('' if emailed else ' (not emailed)'))
    if not emailed:
        _hand_over(party, by=by)
    return envelope, token, emailed


@transaction.atomic
def void(envelope: Envelope, *, by, reason: str) -> Envelope:
    envelope = Envelope.objects.select_for_update().get(pk=envelope.pk)
    if envelope.status in (Envelope.VOID, Envelope.SIGNED, Envelope.ENDED):
        raise ValidationError({'detail': 'This document can no longer be voided. Record notice to end a signed one.'})
    if envelope.delete_requested_at:
        raise ValidationError({'detail': 'This document is being deleted. Restore it first.'})
    reason = (reason or '').strip()[:300]
    if not reason:
        raise ValidationError({'reason': 'Say why it is voided.'})
    envelope.status = Envelope.VOID
    envelope.void_reason = reason
    envelope.save(update_fields=['status', 'void_reason'])
    SigningLink.objects.filter(party__envelope=envelope, revoked_at__isnull=True).update(revoked_at=timezone.now())
    log(envelope, 'voided', actor=person(by), detail=reason)
    return envelope


@transaction.atomic
def record_notice(envelope: Envelope, *, by) -> Envelope:
    envelope = Envelope.objects.select_for_update().get(pk=envelope.pk)
    if envelope.status != Envelope.SIGNED:
        raise ValidationError({'detail': 'Notice can be recorded once everyone has signed.'})
    if envelope.end_date:
        raise ValidationError({'detail': f'Notice was already recorded. It ends {long_date(envelope.end_date)}.'})
    envelope.notice_given_at = timezone.now()
    envelope.end_date = timezone.localdate() + timedelta(days=notice_days())
    envelope.save(update_fields=['notice_given_at', 'end_date'])
    log(envelope, 'notice_recorded', actor=person(by), detail=f'Ends {long_date(envelope.end_date)}')
    return envelope


def refresh(envelope: Envelope) -> Envelope:
    """A signed document past its end date becomes Ended."""
    if envelope.status == Envelope.SIGNED and envelope.end_date and envelope.end_date < timezone.localdate():
        envelope.status = Envelope.ENDED
        envelope.save(update_fields=['status'])
        log(envelope, 'ended', detail=f'End date {long_date(envelope.end_date)} passed')
    return envelope


# -- Signing ----------------------------------------------------------------------------------

LINK_OK, LINK_USED, LINK_EXPIRED, LINK_VOID, LINK_NONE = 'ok', 'used', 'expired', 'void', 'invalid'
LINK_MESSAGES = {
    LINK_USED: 'This link was already used. Each link works once. Check your email for the signed copy, or ask for a new link.',
    LINK_EXPIRED: 'This link has expired. Ask the sender for a new one.',
    LINK_VOID: 'This document was cancelled by the sender. Ask them if you need a new one.',
    LINK_NONE: 'This link is not valid. Open the newest email you were sent, or ask the sender for a new link.',
}


class LinkError(Exception):
    """The signing link cannot be used (state: used, expired, void, invalid)."""

    def __init__(self, state: str):
        super().__init__(LINK_MESSAGES[state])
        self.state = state


def lookup(token: str) -> tuple[SigningLink | None, str]:
    token = (token or '').strip()
    if len(token) < 20:
        return None, LINK_NONE
    link = SigningLink.objects.select_related('party__envelope__template_version').filter(
        token_hash=hash_token(token)).first()
    if link is None:
        return None, LINK_NONE
    envelope = link.party.envelope
    state = LINK_OK
    if envelope.status == Envelope.VOID:
        state = LINK_VOID
    elif link.used_at or link.party.status != Party.READY or envelope.status != Envelope.OUT:
        state = LINK_USED
    elif link.revoked_at or link.expires_at <= timezone.now():
        state = LINK_EXPIRED  # replaced by a newer link, or too old
    return link, state


def mark_opened(party: Party, *, ip, user_agent, via: str) -> None:
    if not party.envelope.events.filter(kind='opened', detail__startswith=f'{party.name} ').exists():
        log(party.envelope, 'opened', actor=party.name, ip=ip, user_agent=user_agent, detail=f'{party.name} ({via})')


def signature_png(data_url) -> bytes:
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


def _ticked(value) -> bool:
    return value in (True, 'true', '1', 1)


def _check_acknowledgments(envelope: Envelope, ticked) -> list[str]:
    """Every statement must be ticked; returns them word for word."""
    statements = list(envelope.acknowledgments or [])
    if not statements:
        return []
    ticked = ticked if isinstance(ticked, list) else []
    marks = [_ticked(ticked[i]) if i < len(ticked) else False for i in range(len(statements))]
    if not all(marks):
        raise ValidationError({'acknowledgments': 'Tick every statement to sign.'})
    return statements


def _sign(party: Party, *, name, title, consent, acknowledgments, signature, ip, user_agent: str, via: str,
          user=None) -> Envelope:
    """The signature itself. The caller has checked whose turn it is and locked the rows."""
    envelope = party.envelope
    errors = {}
    if not _ticked(consent):
        errors['consent'] = 'Tick the box to sign electronically.'
    name = ' '.join(str(name or '').split())[:160]
    if len(name) < 3:
        errors['name'] = 'Type your full legal name.'
    title = ' '.join(str(title or '').split())[:160]
    if errors:
        raise ValidationError(errors)
    statements = _check_acknowledgments(envelope, acknowledgments)
    png = signature_png(signature)
    if not _still_what_was_sent(envelope):
        raise ValidationError({'detail': 'This document changed after it was sent. Ask the sender for a new one.'})
    now = timezone.now()
    Signature.objects.create(party=party, name=name, title=title, image=png, consent_text=envelope.consent_text,
                             consent_at=now, acknowledged=statements, signed_at=now, via=via, ip=ip or '',
                             user_agent=(user_agent or '')[:300], user=user if getattr(user, 'pk', None) else None)
    party.status = Party.SIGNED
    party.signed_at = now
    party.save(update_fields=['status', 'signed_at'])
    party.links.filter(used_at__isnull=True, revoked_at__isnull=True).update(revoked_at=now)
    log(envelope, 'consented', actor=name, ip=ip, user_agent=user_agent, detail='Agreed to sign electronically')
    if statements:
        log(envelope, 'acknowledged', actor=name, ip=ip, user_agent=user_agent, detail=f'Ticked {len(statements)} statement(s)')
    log(envelope, 'signed', actor=name, ip=ip, user_agent=user_agent,
        detail=f'{title + "; " if title else ""}{"signed in" if via == Signature.VIA_SIGNED_IN else "by link"}; '
               f'SHA-256 {envelope.fingerprint}')
    following = envelope.parties.filter(status=Party.WAITING).order_by('order').first()
    if following is not None:
        _make_ready(following)
    else:
        _complete(envelope)
    return envelope


def _still_what_was_sent(envelope: Envelope) -> bool:
    """The frozen text, or the stored PDF, must still be exactly what was hashed when it was sent."""
    if envelope.source == Envelope.PDF:
        data = adapter.get().storage_read(envelope.source_pdf_key)
        return hashlib.sha256(data).hexdigest() == envelope.source_pdf_sha256
    return sha256_text(envelope.body_text) == envelope.body_sha256


@transaction.atomic
def sign_by_link(token: str, *, name: str, title: str, consent, acknowledgments=None, signature, ip,
                 user_agent: str) -> Envelope:
    link, state = lookup(token)
    if link is None or state != LINK_OK:
        raise LinkError(state)
    link = SigningLink.objects.select_for_update().get(pk=link.pk)
    party = Party.objects.select_for_update(of=('self',)).select_related('envelope').get(pk=link.party_id)
    Envelope.objects.select_for_update().get(pk=party.envelope_id)
    if link.used_at or party.status != Party.READY:  # a second tap landed first
        raise LinkError(LINK_USED)
    envelope = _sign(party, name=name, title=title, consent=consent, acknowledgments=acknowledgments,
                     signature=signature, ip=ip, user_agent=user_agent, via=Signature.VIA_LINK)
    link.used_at = timezone.now()
    link.save(update_fields=['used_at'])
    return envelope


@transaction.atomic
def sign_signed_in(party: Party, *, user, name: str, title: str, consent, acknowledgments=None, signature, ip,
                   user_agent: str) -> Envelope:
    party = Party.objects.select_for_update(of=('self',)).select_related('envelope').get(pk=party.pk)
    Envelope.objects.select_for_update().get(pk=party.envelope_id)
    if not party.user_id or party.user_id != getattr(user, 'pk', None):
        raise PermissionDenied('This is not yours to sign.')
    if party.envelope.status != Envelope.OUT or party.status != Party.READY:
        raise ValidationError({'detail': 'It is not your turn to sign this, or it is already signed.'})
    return _sign(party, name=name, title=title, consent=consent, acknowledgments=acknowledgments, signature=signature,
                 ip=ip, user_agent=user_agent, via=Signature.VIA_SIGNED_IN, user=user)


@transaction.atomic
def add_upload(token: str, *, uploaded, ip, kind: str = Upload.KIND_W9) -> Upload:
    """A signer's optional W-9, while the link still works. Owner-only afterwards."""
    link, state = lookup(token)
    if link is None or state != LINK_OK:
        raise LinkError(state)
    envelope = link.party.envelope
    if not envelope.requires_w9:
        raise ValidationError({'detail': 'This document does not ask for a W-9.'})
    if uploaded is None:
        raise ValidationError({'file': 'Choose a file.'})
    data = uploaded.read(MAX_UPLOAD_BYTES + 1)
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise ValidationError({'file': 'The file must be under 10 MB.'})
    content_type = next((mime for magic, mime in UPLOAD_TYPES.items() if data.startswith(magic)), None)
    if not content_type:
        raise ValidationError({'file': 'Upload a PDF, JPG or PNG.'})
    ext = {'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg'}[content_type]
    key = adapter.get().storage_save(f'esign/private/{envelope.pk}/{secrets.token_hex(16)}.{ext}', data, content_type)
    envelope.uploads.filter(kind=kind).delete()  # a replacement, not a pile
    upload = Upload.objects.create(envelope=envelope, kind=kind, storage_key=key, filename=f'{kind}-{envelope.pk}.{ext}',
                                   content_type=content_type, size=len(data), ip=ip or '')
    log(envelope, 'upload_added', actor=link.party.name, ip=ip, detail=f'{kind.upper()} received (kept private)')
    return upload


# -- Completion and the final PDF ------------------------------------------------------------


def _complete(envelope: Envelope) -> None:
    now = timezone.now()
    envelope.status = Envelope.SIGNED
    envelope.completed_at = now
    log(envelope, 'completed', detail='Everyone has signed')
    if envelope.source == Envelope.PDF:
        from .placed import build_final

        data = build_final(envelope)
    else:
        data = pdf.build(envelope)
    envelope.final_pdf_sha256 = hashlib.sha256(data).hexdigest()
    envelope.final_pdf_key = adapter.get().storage_save(
        f'esign/final/{envelope.pk}-{secrets.token_hex(8)}.pdf', data, 'application/pdf')
    envelope.save()
    # Once the signature is saved for good: a rollback never sends a "signed" email, and the mail holds no row locks.
    transaction.on_commit(lambda: mail_final(envelope, data))


def mail_final(envelope: Envelope, data: bytes) -> None:
    """The SAME PDF to every party (and the host's owners)."""
    company = adapter.get().branding().get('company_name', '')
    attachment = [(f'{envelope.title}.pdf', data, 'application/pdf')]
    targets = [(p.email, p.name) for p in envelope.parties.order_by('order') if p.email]
    targets += [(e, '') for e in adapter.get().owner_emails()]
    sent_to, failed = [], []
    for email, who in targets:
        if email in sent_to or email in failed:
            continue
        body = (f'Hello{" " + who if who else ""},\n\n"{envelope.title}" is signed by everyone. The signed copy is '
                f'attached; it is the same file everyone receives, and it ends with a page listing every step.\n\n'
                f'Keep it for your records.\n\n{company}\n')
        ok = adapter.get().send_mail(to=[email], subject=f'{company}: signed copy of "{envelope.title}"', body=body,
                                     attachments=attachment)
        (sent_to if ok else failed).append(email)
    detail = ('Sent to ' + ', '.join(sent_to)) if sent_to else 'Not emailed'
    if failed:
        detail += '; could not email ' + ', '.join(failed)
    log(envelope, 'emailed_final', detail=detail)


def final_pdf_bytes(envelope: Envelope) -> bytes:
    if not envelope.final_pdf_key:
        raise ValidationError({'detail': 'There is no signed PDF yet.'})
    return adapter.get().storage_read(envelope.final_pdf_key)


def may_see(user, envelope: Envelope) -> bool:
    """An owner sees everything; a signed-in party sees the documents they are on."""
    if adapter.get().is_owner(user):
        return True
    return bool(getattr(user, 'pk', None)) and envelope.parties.filter(user_id=user.pk).exists()
