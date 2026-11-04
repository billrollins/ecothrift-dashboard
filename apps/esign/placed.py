"""Uploaded PDFs with placed boxes (D22 § 1, from Dark Horse's MyDocs).

The owner uploads a PDF, names the signers in order and places boxes on its pages, each for one signer: a signature,
initials, the printed name, the title or the date signed. Sending freezes it: its SHA-256 is the fingerprint everyone
signs, and the boxes can no longer move. Each signer draws one signature; it goes into every signature box of theirs.
When the last one signs, the boxes are drawn onto the PDF and the signing record is added at the end (every
signature, the consent, the audit trail). One file, the same bytes for everyone.

Coordinates are fractions of the page as it is shown (top-left origin, after the page's /Rotate), the same contract
as pdf.js on screen. ``_rect`` is the one place that turns them into PDF points.

pypdf (BSD) merges, reportlab (BSD) draws: no AGPL dependency.
"""
from __future__ import annotations

import hashlib
import io
import json
import secrets

from django.db import transaction
from django.utils import timezone
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas
from rest_framework.exceptions import ValidationError

from . import adapter, pdf
from .models import Envelope, Party, PlacedField

MAX_PDF_BYTES = 20 * 1024 * 1024
MAX_PAGES = 200
MAX_BOXES = 120
KINDS = [k for k, _ in PlacedField.KIND_CHOICES]
# A box no smaller than this share of the page, so it can be seen and signed.
MIN_SIDE = 0.01


# -- Making one ---------------------------------------------------------------------------


def read_pdf(uploaded) -> tuple[bytes, int]:
    """The bytes and page count of an uploaded PDF, or a plain error."""
    if uploaded is None:
        raise ValidationError({'file': 'Choose a PDF.'})
    data = uploaded.read(MAX_PDF_BYTES + 1) if hasattr(uploaded, 'read') else bytes(uploaded)
    if not data or len(data) > MAX_PDF_BYTES:
        raise ValidationError({'file': 'The PDF must be under 20 MB.'})
    if not data.startswith(b'%PDF-'):
        raise ValidationError({'file': 'That is not a PDF.'})
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ValidationError({'file': 'That PDF has a password. Save a copy without one and upload that.'})
        pages = len(reader.pages)
    except (PdfReadError, ValueError, KeyError, TypeError):
        raise ValidationError({'file': 'That PDF could not be read. Save it again as a PDF and upload that.'})
    if not 1 <= pages <= MAX_PAGES:
        raise ValidationError({'file': f'The PDF must have 1 to {MAX_PAGES} pages.'})
    return data, pages


def _loads(raw, default):
    """Multipart sends lists as JSON text."""
    if isinstance(raw, str):
        try:
            return json.loads(raw) if raw.strip() else default
        except ValueError:
            raise ValidationError({'detail': 'Something in the form did not come through. Try again.'})
    return default if raw is None else raw


@transaction.atomic
def create_pdf_envelope(*, uploaded, title: str, kind: str, parties, by, acknowledgments=None,
                        attached_type: str = '', attached_id: str = '') -> Envelope:
    from .services import clean_acknowledgments, clean_kind, clean_parties, log, person, _set_parties

    data, pages = read_pdf(uploaded)
    cleaned = clean_parties(_loads(parties, []))
    title = ' '.join(str(title or '').split())[:200]
    if len(title) < 2:
        raise ValidationError({'title': 'Give the document a title.'})
    envelope = Envelope.objects.create(
        source=Envelope.PDF, kind=clean_kind(kind), title=title, page_count=pages,
        source_pdf_sha256=hashlib.sha256(data).hexdigest(),
        acknowledgments=clean_acknowledgments(_loads(acknowledgments, [])), created_by=by,
        attached_type=str(attached_type or '')[:60], attached_id=str(attached_id or '')[:60])
    envelope.source_pdf_key = adapter.get().storage_save(
        f'esign/source/{envelope.pk}-{secrets.token_hex(8)}.pdf', data, 'application/pdf')
    envelope.save(update_fields=['source_pdf_key'])
    _set_parties(envelope, cleaned)
    log(envelope, 'created', actor=person(by),
        detail=f'Uploaded PDF, {pages} page{"s" if pages != 1 else ""}; SHA-256 {envelope.source_pdf_sha256}')
    return envelope


def clean_boxes(envelope: Envelope, raw) -> list[dict]:
    if not isinstance(raw, list):
        raise ValidationError({'fields': 'Send the boxes as a list.'})
    if len(raw) > MAX_BOXES:
        raise ValidationError({'fields': f'Up to {MAX_BOXES} boxes.'})
    signers = envelope.parties.count()
    out = []
    for i, box in enumerate(raw, 1):
        if not isinstance(box, dict):
            raise ValidationError({'fields': f'Box {i} is not readable.'})
        kind = box.get('kind')
        if kind not in KINDS:
            raise ValidationError({'fields': f'Box {i}: choose what it is for.'})
        try:
            signer, page = int(box.get('signer')), int(box.get('page'))
            x, y, w, h = (float(box.get(k)) for k in ('x', 'y', 'w', 'h'))
        except (TypeError, ValueError):
            raise ValidationError({'fields': f'Box {i} is not readable.'})
        if not 1 <= signer <= signers:
            raise ValidationError({'fields': f'Box {i} is for a signer who is not on the document.'})
        if not 1 <= page <= envelope.page_count:
            raise ValidationError({'fields': f'Box {i} is on a page the PDF does not have.'})
        if w < MIN_SIDE or h < MIN_SIDE or x < 0 or y < 0 or x + w > 1.0001 or y + h > 1.0001:
            raise ValidationError({'fields': f'Box {i} must sit inside the page.'})
        out.append({'signer': signer, 'kind': kind, 'page': page, 'x': x, 'y': y, 'w': w, 'h': h})
    return out


@transaction.atomic
def set_boxes(envelope: Envelope, raw, *, by) -> list[PlacedField]:
    from .services import log, person

    envelope = Envelope.objects.select_for_update().get(pk=envelope.pk)
    if envelope.source != Envelope.PDF:
        raise ValidationError({'detail': 'Boxes go on an uploaded PDF.'})
    if envelope.status != Envelope.DRAFT:
        raise ValidationError({'detail': 'Only a draft can be changed. What was sent is frozen.'})
    boxes = clean_boxes(envelope, raw)
    envelope.placed.all().delete()
    made = PlacedField.objects.bulk_create([PlacedField(envelope=envelope, **b) for b in boxes])
    log(envelope, 'boxes_placed', actor=person(by), detail=f'{len(made)} box{"es" if len(made) != 1 else ""}')
    return made


def check_ready_to_send(envelope: Envelope, parties: list[Party]) -> None:
    """Every signer needs a signature box of their own (initials alone are not a signature)."""
    have = set(envelope.placed.filter(kind=PlacedField.SIGNATURE).values_list('signer', flat=True))
    missing = [p.name for p in parties if p.order not in have]
    if missing:
        raise ValidationError({'fields': 'Place a signature box for ' + ', '.join(missing) + '.'})
    if not envelope.source_pdf_key:
        raise ValidationError({'detail': 'The PDF is missing. Upload it again.'})


def box_json(b: PlacedField) -> dict:
    return {'id': b.pk, 'signer': b.signer, 'kind': b.kind, 'page': b.page, 'x': b.x, 'y': b.y, 'w': b.w, 'h': b.h}


def source_bytes(envelope: Envelope) -> bytes:
    if envelope.source != Envelope.PDF or not envelope.source_pdf_key:
        raise ValidationError({'detail': 'This document has no uploaded PDF.'})
    return adapter.get().storage_read(envelope.source_pdf_key)


# -- The final PDF ---------------------------------------------------------------------------


def _rotation(page) -> int:
    try:
        rot = int(page.get('/Rotate', 0)) % 360
    except (TypeError, ValueError):
        rot = 0
    return rot if rot in (0, 90, 180, 270) else 0


def _rect(page, x, y, w, h):
    """Fractions of the page as shown -> (x, y, w, h) in MediaBox points (bottom-left origin), the turn to give the
    drawing so it reads upright once the viewer applies /Rotate, and the box's width and height as shown."""
    mb = page.mediabox
    left, bottom = float(mb.left), float(mb.bottom)
    pw, ph = float(mb.width), float(mb.height)
    rot = _rotation(page)
    vw, vh = (pw, ph) if rot in (0, 180) else (ph, pw)
    bx, by_top, bw, bh = x * vw, y * vh, w * vw, h * vh
    if rot == 0:
        out = (bx, ph - by_top - bh, bw, bh, 0)
    elif rot == 90:
        out = (by_top, bx, bh, bw, 90)
    elif rot == 180:
        out = (pw - bx - bw, by_top, bw, bh, 180)
    else:
        out = (pw - by_top - bh, ph - bx - bw, bh, bw, -90)
    mx, my, mw, mh, turn = out
    return left + mx, bottom + my, mw, mh, turn, bw, bh


def _draw_image(c, png: bytes, rect) -> None:
    mx, my, mw, mh, turn, vw, vh = rect
    c.saveState()
    c.translate(mx + mw / 2, my + mh / 2)
    if turn:
        c.rotate(turn)
    c.drawImage(ImageReader(io.BytesIO(png)), -vw / 2, -vh / 2, width=vw, height=vh, mask='auto',
                preserveAspectRatio=True)
    c.restoreState()


def _draw_text(c, text: str, rect, font: str = 'Helvetica') -> None:
    mx, my, mw, mh, turn, vw, vh = rect
    if not text:
        return
    size = max(6.0, min(vh * 0.6, vh - 2.0))
    width = c.stringWidth(text, font, size)
    if width > vw * 0.95:
        size *= (vw * 0.95) / width
        width = vw * 0.95
    c.saveState()
    c.translate(mx + mw / 2, my + mh / 2)
    if turn:
        c.rotate(turn)
    c.setFont(font, size)
    c.setFillColorRGB(0, 0, 0)
    c.drawString(-width / 2, -size * 0.35, text)
    c.restoreState()


def initials(name: str) -> str:
    return ''.join(part[0].upper() for part in name.replace('-', ' ').split() if part[:1].isalpha())[:4]


def _overlay(page, boxes: list[PlacedField], by_order: dict):
    mb = page.mediabox
    buffer = io.BytesIO()
    c = rl_canvas.Canvas(buffer, pagesize=(float(mb.right), float(mb.top)))
    for box in boxes:
        sig = by_order.get(box.signer)
        if sig is None:
            continue
        rect = _rect(page, box.x, box.y, box.w, box.h)
        if box.kind == PlacedField.SIGNATURE:
            _draw_image(c, bytes(sig.image), rect)
        elif box.kind == PlacedField.INITIALS:
            _draw_text(c, initials(sig.name), rect, 'Helvetica-BoldOblique')
        elif box.kind == PlacedField.NAME:
            _draw_text(c, sig.name, rect)
        elif box.kind == PlacedField.TITLE:
            _draw_text(c, sig.title, rect)
        elif box.kind == PlacedField.DATE:
            _draw_text(c, timezone.localtime(sig.signed_at).strftime('%m/%d/%Y'), rect)
    c.showPage()
    c.save()
    buffer.seek(0)
    return PdfReader(buffer).pages[0]


def build_final(envelope: Envelope) -> bytes:
    """The PDF as sent with every box filled in, then the signing record pages."""
    by_order = {p.order: p.signature for p in envelope.parties.select_related('signature') if hasattr(p, 'signature')}
    boxes_by_page: dict[int, list[PlacedField]] = {}
    for box in envelope.placed.all():
        boxes_by_page.setdefault(box.page, []).append(box)
    writer = PdfWriter(clone_from=io.BytesIO(source_bytes(envelope)))
    for number, page in enumerate(writer.pages, 1):
        if boxes_by_page.get(number):
            page.merge_page(_overlay(page, boxes_by_page[number], by_order))
    for page in PdfReader(io.BytesIO(pdf.record_pages(envelope))).pages:
        writer.add_page(page)
    writer.add_metadata({'/Title': envelope.title})
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
