"""The final PDF: the frozen text (as many pages as it takes), the statements ticked, every party's signature in
signing order, and an audit page. One file, one set of bytes: stored once, and the same bytes go to every party.

Built with reportlab (BSD), so the package carries no AGPL dependency.
"""
from __future__ import annotations

import io
from datetime import timezone as dt_timezone
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (Image, KeepTogether, ListFlowable, ListItem, PageBreak, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

from . import adapter

INK = colors.HexColor('#1a1f1c')
GREY = colors.HexColor('#555b57')
LINE = colors.HexColor('#9aa09c')

S = {
    'h1': ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=16, leading=20, textColor=INK, spaceAfter=10),
    'h2': ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=11.5, leading=15, textColor=INK, spaceBefore=10, spaceAfter=3),
    'h3': ParagraphStyle('h3', fontName='Helvetica-Bold', fontSize=13, leading=17, textColor=INK, spaceAfter=6),
    'p': ParagraphStyle('p', fontName='Helvetica', fontSize=10.5, leading=14.5, textColor=INK, spaceAfter=6),
    'small': ParagraphStyle('small', fontName='Helvetica', fontSize=8.5, leading=11.5, textColor=GREY, spaceAfter=4),
    'mono': ParagraphStyle('mono', fontName='Courier', fontSize=8.5, leading=11, textColor=INK, spaceAfter=4),
}


def _text(value: str) -> str:
    return escape(value or '').replace('\n', '<br/>')


def _body(body: str) -> list:
    out = []
    for para in body.split('\n\n'):
        lines = [line for line in para.split('\n') if line.strip()]
        if lines and all(line.lstrip().startswith('- ') for line in lines):
            items = [ListItem(Paragraph(_text(line.lstrip()[2:]), S['p']), leftIndent=12) for line in lines]
            out.append(ListFlowable(items, bulletType='bullet', start='•', leftIndent=12))
        elif lines:
            out.append(Paragraph('<br/>'.join(_text(line) for line in lines), S['p']))
    return out


def _when(value) -> str:
    return timezone.localtime(value).strftime('%B %d, %Y %I:%M %p %Z') if value else ''


def _utc(value) -> str:
    return value.astimezone(dt_timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')


def build(envelope) -> bytes:
    from .services import split_text

    brand = adapter.get().branding()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, leftMargin=0.75 * inch, rightMargin=0.75 * inch,
                            topMargin=0.8 * inch, bottomMargin=0.75 * inch, title=envelope.title,
                            author=brand.get('company_name', ''))

    story = []
    logo = brand.get('logo_png')
    if logo:
        story += [Image(io.BytesIO(logo), width=1.6 * inch, height=0.45 * inch, kind='proportional'), Spacer(1, 8)]
    title, sections = split_text(envelope.body_text)
    story.append(Paragraph(_text(title), S['h1']))
    for heading, body in sections:
        if heading:
            story.append(Paragraph(_text(heading), S['h2']))
        story += _body(body)

    parties = list(envelope.parties.select_related('signature').order_by('order'))
    if envelope.acknowledgments:
        story += [Spacer(1, 8), Paragraph('Each signer confirmed', S['h2'])]
        story += [Paragraph('[x] ' + _text(s), S['p']) for s in envelope.acknowledgments]
    story += [PageBreak()] + _signatures(envelope, parties) + [PageBreak()] + _audit(envelope, parties)
    doc.build(story, onFirstPage=_footer(envelope, brand), onLaterPages=_footer(envelope, brand))
    return buffer.getvalue()


def record_pages(envelope) -> bytes:
    """For an uploaded PDF: the pages added after it. The statements ticked, every signature, and the audit trail."""
    brand = adapter.get().branding()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, leftMargin=0.75 * inch, rightMargin=0.75 * inch,
                            topMargin=0.8 * inch, bottomMargin=0.75 * inch, title=envelope.title,
                            author=brand.get('company_name', ''))
    parties = list(envelope.parties.select_related('signature').order_by('order'))
    story = []
    if envelope.acknowledgments:
        story += [Paragraph('Each signer confirmed', S['h3'])]
        story += [Paragraph('[x] ' + _text(s), S['p']) for s in envelope.acknowledgments]
        story.append(Spacer(1, 10))
    story += _signatures(envelope, parties) + [PageBreak()] + _audit(envelope, parties)
    doc.build(story, onFirstPage=_footer(envelope, brand), onLaterPages=_footer(envelope, brand))
    return buffer.getvalue()


def _signatures(envelope, parties) -> list:
    """Every party's signature, in signing order."""
    story = [Paragraph('Signatures', S['h3']), Paragraph(_text(envelope.title), S['small']), Spacer(1, 6)]
    for party in parties:
        sig = getattr(party, 'signature', None)
        if sig is None:
            continue
        label = party.role_label or f'Signer {party.order}'
        image = Image(io.BytesIO(bytes(sig.image)), width=3.2 * inch, height=1.0 * inch, kind='proportional')
        line = Table([['']], colWidths=[3.4 * inch], rowHeights=[2])
        line.setStyle(TableStyle([('LINEABOVE', (0, 0), (-1, -1), 0.6, LINE)]))
        who = escape(sig.name) + (f', {escape(sig.title)}' if sig.title else '')
        story.append(KeepTogether([
            Paragraph(f'<b>{escape(label)}</b>', S['p']), image, line,
            Paragraph(f'{who}<br/>Signed {escape(_when(sig.signed_at))}', S['small']), Spacer(1, 14),
        ]))
    return story


def _audit(envelope, parties) -> list:
    """The audit trail: the fingerprint signed, each signer's consent, and every event."""
    if envelope.source == 'pdf':
        what = (f'<b>Document:</b> {escape(envelope.title)} (#{envelope.pk}, an uploaded PDF of {envelope.page_count} '
                f'page{"s" if envelope.page_count != 1 else ""})')
        label = '<b>Fingerprint of the PDF as sent, SHA-256:</b>'
    else:
        what = (f'<b>Document:</b> {escape(envelope.title)} (#{envelope.pk}, template '
                f'{escape(str(envelope.template_version))})')
        label = '<b>Text fingerprint, SHA-256:</b>'
    story = [Paragraph('Signing audit trail', S['h3']), Paragraph(what, S['small']), Paragraph(label, S['small']),
             # Fixed-width: a proportional font joins "ff" or "fi" into one ligature, and a copied hash would not match.
             Paragraph(escape(envelope.fingerprint), S['mono']),
             Paragraph('Electronic signature consent', S['h2'])]
    for party in parties:
        sig = getattr(party, 'signature', None)
        if sig is None:
            continue
        via = 'signed in to the dashboard' if sig.via == 'signed_in' else 'from a single-use link'
        lines = [f'<b>{escape(sig.name)}</b> ticked: "{escape(sig.consent_text)}"',
                 f'{escape(_when(sig.consent_at))}; {via}; IP {escape(sig.ip or "unknown")}']
        if sig.user_agent:
            lines.append(f'Device: {escape(sig.user_agent[:120])}')
        for statement in sig.acknowledged or []:
            lines.append(f'Ticked: "{escape(statement)}"')
        story.append(Paragraph('<br/>'.join(lines), S['small']))
    story.append(Paragraph('Events', S['h2']))
    for event in envelope.events.all():
        who = f'{escape(event.actor)}, ' if event.actor else ''
        ip = f' IP {escape(event.ip)}' if event.ip else ''
        detail = f': {escape(event.detail)}' if event.detail and 'SHA-256' not in event.detail else ''
        story.append(Paragraph(f'{_utc(event.at)} - <b>{escape(event.kind.replace("_", " "))}</b> {who}{ip}{detail}',
                               S['small']))
    return story


def _footer(envelope, brand):
    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont('Helvetica', 7.5)
        canvas.setFillColor(GREY)
        canvas.drawString(0.75 * inch, 0.45 * inch, f'{brand.get("company_name", "")}  -  {envelope.title}  -  #{envelope.pk}')
        canvas.drawRightString(letter[0] - 0.75 * inch, 0.45 * inch, f'Page {document.page}')
        canvas.restoreState()

    return footer
