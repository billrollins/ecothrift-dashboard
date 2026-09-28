"""
Card backs as a PDF, one CR80 card (3.375 × 2.125 in) per page: the QR (``TP`` + code) and the
number printed for typing by hand.

The stock cards already have full-colour fronts, so this prints only the backs, fed through the
card printer by the print server's ``/print/pdf-copies``. That route takes at most 10 pages a job,
so ``pdf_chunks`` splits a batch into jobs of 10. This layout is a first draft for the owner to
redesign (thrift_plus_rewards Phase 1).
"""
from __future__ import annotations

import io

import qrcode
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from apps.thriftplus.services.cards import display, qr_payload

CARD_W = 3.375 * inch
CARD_H = 2.125 * inch
MAX_PAGES_PER_JOB = 10  # printserver/routers/custom.py MAX_PDF_PAGES


def _qr_image(payload: str):
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=1)
    qr.add_data(payload)
    qr.make(fit=True)
    buf = io.BytesIO()
    qr.make_image(fill_color='black', back_color='white').save(buf, format='PNG')
    buf.seek(0)
    return ImageReader(buf)


def card_backs_pdf(codes: list[str]) -> bytes:
    buf = io.BytesIO()
    pdf = canvas.Canvas(buf, pagesize=(CARD_W, CARD_H))
    pdf.setTitle('Thrift+ card backs')
    qr_size = 1.45 * inch
    margin = 0.2 * inch
    for code in codes:
        pdf.drawImage(_qr_image(qr_payload(code)), margin, (CARD_H - qr_size) / 2, qr_size, qr_size)
        x = margin + qr_size + 0.15 * inch
        pdf.setFont('Helvetica-Bold', 13)
        pdf.drawString(x, CARD_H - 0.55 * inch, 'Thrift+')
        pdf.setFont('Helvetica', 6.5)
        pdf.drawString(x, CARD_H - 0.72 * inch, 'Scan at the register.')
        pdf.setFont('Courier-Bold', 11)
        parts = display(code).split(' ')
        pdf.drawString(x, 0.62 * inch, ' '.join(parts[:2]))
        pdf.drawString(x, 0.45 * inch, parts[2] if len(parts) > 2 else '')
        pdf.setFont('Helvetica', 5.5)
        pdf.drawString(x, 0.22 * inch, 'Free to join. Never a bill.')
        pdf.showPage()
    pdf.save()
    return buf.getvalue()


def pdf_chunks(codes: list[str], per_job: int = MAX_PAGES_PER_JOB) -> list[bytes]:
    return [card_backs_pdf(codes[i:i + per_job]) for i in range(0, len(codes), per_job)]
