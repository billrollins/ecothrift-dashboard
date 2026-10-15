"""
Card backs as a PDF, one CR80 card (3.375 × 2.125 in) per page: the QR (``TP`` + code), the number printed
for typing by hand, and the rewards line across the bottom.

The stock cards already have full-colour fronts, so this prints only the backs, fed through the
card printer by the print server's ``/print/pdf-copies``. That route takes at most 10 pages a job,
so ``pdf_chunks`` splits a batch into jobs of 10. This layout is a first draft for the owner to
redesign (thrift_plus_rewards Phase 1).

The rewards line is legally required (rule B12, 10-12): the 30-day expiry of ThriftBucks holds only when
the card itself says "rewards" and the expiry rule. It is printed word for word, full width, and always
wins over the optional "free" line when space is short.
"""
from __future__ import annotations

import io

import qrcode
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from apps.thriftplus.services.cards import display, qr_payload

CARD_W = 3.375 * inch
CARD_H = 2.125 * inch
MAX_PAGES_PER_JOB = 10  # printserver/routers/custom.py MAX_PDF_PAGES

# Rule B12 (.ai/extended/thrift-plus-decisions.md): word for word. Keep the word "rewards".
CARD_TERMS_LINE = (
    'ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value. Terms: ecothrift.us/terms'
)
# Owner-approved; printed only when it fits without crowding the B12 line.
CARD_FREE_LINE = 'Free to join. Nothing owed.'

MARGIN = 0.14 * inch
TERMS_FONT = 'Helvetica'
TERMS_SIZE = 7.0  # smallest size we print the legal line at
TERMS_LEADING = 8.4
QR_SIZE = 1.4 * inch
FREE_SIZE = 6.5


def _qr_image(payload: str):
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=1)
    qr.add_data(payload)
    qr.make(fit=True)
    buf = io.BytesIO()
    qr.make_image(fill_color='black', back_color='white').save(buf, format='PNG')
    buf.seek(0)
    return ImageReader(buf)


def terms_lines(width: float = CARD_W - 2 * MARGIN) -> list[str]:
    """The B12 line wrapped to ``width``, breaking between sentences where it can (never shortened)."""
    sentences = [s.strip() for s in CARD_TERMS_LINE.replace('. ', '.\n').split('\n') if s.strip()]
    lines: list[str] = []
    cur = ''
    for sentence in sentences:
        trial = f'{cur} {sentence}'.strip()
        if stringWidth(trial, TERMS_FONT, TERMS_SIZE) <= width:
            cur = trial
            continue
        if cur:
            lines.append(cur)
        if stringWidth(sentence, TERMS_FONT, TERMS_SIZE) <= width:
            cur = sentence
        else:
            parts = simpleSplit(sentence, TERMS_FONT, TERMS_SIZE, width)
            lines.extend(parts[:-1])
            cur = parts[-1]
    if cur:
        lines.append(cur)
    return lines


def card_backs_pdf(codes: list[str]) -> bytes:
    buf = io.BytesIO()
    pdf = canvas.Canvas(buf, pagesize=(CARD_W, CARD_H))
    pdf.setTitle('Thrift+ card backs')

    # Bottom band: the B12 line, full width.
    terms = terms_lines()
    terms_base = MARGIN  # baseline of the last line
    terms_top = terms_base + (len(terms) - 1) * TERMS_LEADING + TERMS_SIZE
    # Above it: QR on the left, title, number and the free line on the right.
    area_bottom = terms_top + 0.06 * inch
    area_top = CARD_H - MARGIN
    qr_y = area_bottom + (area_top - area_bottom - QR_SIZE) / 2
    x = MARGIN + QR_SIZE + 0.15 * inch
    title_base = qr_y + QR_SIZE - 13
    code_base = qr_y + 0.42 * inch
    free_base = qr_y + 1  # lines up with the QR's bottom edge
    free_fits = (
        free_base + FREE_SIZE + 4 <= code_base - 11
        and stringWidth(CARD_FREE_LINE, 'Helvetica', FREE_SIZE) <= CARD_W - MARGIN - x
    )

    for code in codes:
        pdf.drawImage(_qr_image(qr_payload(code)), MARGIN, qr_y, QR_SIZE, QR_SIZE)
        pdf.setFont('Helvetica-Bold', 13)
        pdf.drawString(x, title_base, 'Thrift+')
        pdf.setFont('Helvetica', 6.5)
        pdf.drawString(x, title_base - 11, 'Scan at the register.')
        pdf.setFont('Courier-Bold', 11)
        parts = display(code).split(' ')
        pdf.drawString(x, code_base + 13, ' '.join(parts[:2]))
        pdf.drawString(x, code_base, parts[2] if len(parts) > 2 else '')
        if free_fits:
            pdf.setFont('Helvetica', FREE_SIZE)
            pdf.drawString(x, free_base, CARD_FREE_LINE)
        pdf.setFont(TERMS_FONT, TERMS_SIZE)
        for i, line in enumerate(terms):
            pdf.drawString(MARGIN, terms_base + (len(terms) - 1 - i) * TERMS_LEADING, line)
        pdf.showPage()
    pdf.save()
    return buf.getvalue()


def pdf_chunks(codes: list[str], per_job: int = MAX_PAGES_PER_JOB) -> list[bytes]:
    return [card_backs_pdf(codes[i:i + per_job]) for i in range(0, len(codes), per_job)]
