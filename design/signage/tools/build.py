"""Build store signs: copy (JSON) + a Jinja2 template -> HTML -> PDF (headless Edge) -> PNG preview + 600 dpi flat PDF + QA.

Run from the repo root with the tool venv (jinja2, pymupdf, pillow, opencv-python-headless, qrcode):
    workspace/signage/.venv/Scripts/python.exe design/signage/tools/build.py hours            # every variant of one sign
    workspace/signage/.venv/Scripts/python.exe design/signage/tools/build.py hours A-letter   # one variant

A sign is design/signage/copy/<sign>.json: {"template": "<file in templates/>", "variants": {"<name>": {"size": "letter", ...}},
"need": [words that must print], ...}. Live data: "hours": "live" fills `hours` from the public site (the same text
customers see; Dash setting online_sales.hours), so a sign can never disagree with Dash.
Out: workspace/signage/out/<sign>/<variant>.pdf (vector), -flat.pdf (one opaque 600 dpi image per page, for the Canon
PRO-100), .png (preview, 100 dpi). The build fails on a missing required word, a banned word, an em or en dash, a QR
that does not read back, or text outside the safe area.
"""
from __future__ import annotations

import io
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.request

import jinja2
import pymupdf
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parents[1]          # design/signage
ROOT = HERE.parents[1]                                       # repo root
OUT = ROOT / 'workspace' / 'signage' / 'out'
SIZES = {'letter': (8.5, 11), 'letter-land': (11, 8.5), 'tabloid': (11, 17), 'poster': (13, 19), 'half': (8.5, 5.5),
         '5x7': (5, 7), '7x5': (7, 5), 'outdoor-12x18': (12, 18),
         'tabloid-land': (17, 11)}
SAFE_IN = 0.35
BANNED = [r'[–—]', r'\bcard\b', r'\bguest\b', r'\bfees?\b', r'\bcash back\b']
PUBLIC_CONFIG = 'https://ecothrift.us/api/webstore/config/'
DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']


def edge() -> str:
    """Edge from PATH, then the EDGE env var, then the path in docs/machines.md."""
    for cand in ('msedge', os.environ.get('EDGE', '')):
        if cand and (pathlib.Path(cand).exists() or subprocess.run(['where', cand], capture_output=True).returncode == 0):
            return cand
    m = re.search(r'`EDGE`\s*\|\s*`([^`]+)`', (ROOT / 'docs' / 'machines.md').read_text(encoding='utf-8'))
    if m and pathlib.Path(m.group(1)).exists():
        return m.group(1)
    sys.exit('Edge not found (PATH, EDGE, docs/machines.md).')


def clock(hhmm: str) -> str:
    h, m = (int(x) for x in hhmm.split(':'))
    suffix = 'AM' if h < 12 else 'PM'
    h12 = h % 12 or 12
    return f'{h12} {suffix}' if m == 0 else f'{h12}:{m:02d} {suffix}'


def live_hours() -> dict:
    """Store hours from the public site (Dash setting online_sales.hours). Weekdays: 0 = Monday."""
    with urllib.request.urlopen(PUBLIC_CONFIG, timeout=30) as r:
        h = json.load(r)['hours']
    closed = set(h.get('closed_weekdays') or [])
    open_t, close_t = clock(h['open']), clock(h['close'])
    days = [{'day': d, 'short': d[:3], 'closed': i in closed, 'open': open_t, 'close': close_t} for i, d in enumerate(DAYS)]
    open_days = [d['day'] for d in days if not d['closed']]
    # One run of open days (Monday to Saturday) reads as a range; anything else is listed.
    idx = [i for i, d in enumerate(days) if not d['closed']]
    run = idx == list(range(idx[0], idx[-1] + 1)) if idx else False
    return {
        'days': days, 'open': open_t, 'close': close_t,
        'open_range': f'{open_days[0]} to {open_days[-1]}' if run and len(open_days) > 1 else ', '.join(open_days),
        'closed_days': [d['day'] for d in days if d['closed']],
        'site_label': h.get('label', ''), 'overrides': h.get('overrides') or [],
    }


def qr_svg(url: str, color: str = '#1b1f1b') -> str:
    """A QR code as one vector SVG path (quiet zone included); the QA reads it back from the PDF."""
    import markupsafe
    import qrcode
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
    q.add_data(url)
    q.make(fit=True)
    m = q.get_matrix()
    n, b = len(m), 2
    d = ''.join(f'M{x + b},{y + b}h1v1h-1z' for y, row in enumerate(m) for x, on in enumerate(row) if on)
    return markupsafe.Markup(f'<svg class="qr" viewBox="0 0 {n + 2 * b} {n + 2 * b}" xmlns="http://www.w3.org/2000/svg" '
                             f'shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/>'
                             f'<path d="{d}" fill="{color}"/></svg>')


def render_pdf(html: pathlib.Path, pdf: pathlib.Path) -> None:
    pdf.unlink(missing_ok=True)
    subprocess.run([edge(), '--headless', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw',
                    '--virtual-time-budget=15000', f'--print-to-pdf={pdf}', html.as_uri()],
                   capture_output=True, timeout=120)
    for _ in range(60):   # Edge's launcher can return before its child writes the file
        if pdf.exists() and pdf.stat().st_size > 0:
            return
        import time
        time.sleep(0.5)
    sys.exit(f'Edge wrote no PDF for {html.name}')


def flatten(pdf: pathlib.Path, dpi: int = 600) -> pathlib.Path:
    src, out = pymupdf.open(str(pdf)), pymupdf.open()
    for page in src:
        pix = page.get_pixmap(dpi=dpi, alpha=False)
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=94, subsampling=0, dpi=(dpi, dpi))
        new = out.new_page(width=page.rect.width, height=page.rect.height)
        new.insert_image(new.rect, stream=buf.getvalue())
    dest = pdf.with_name(pdf.stem + '-flat.pdf')
    out.save(str(dest), deflate=True)
    return dest


def two_up(flat: pathlib.Path, size: tuple[float, float]) -> pathlib.Path:
    """Two copies of a small sign on one Letter sheet (5 x 7 portrait on Letter landscape, 7 x 5 landscape on Letter
    portrait), centred, with thin grey cut marks outside the trim."""
    w, h = size
    sheet = (11, 8.5) if w < h else (8.5, 11)
    src = pymupdf.open(str(flat))
    out = pymupdf.open()
    page = out.new_page(width=sheet[0] * 72, height=sheet[1] * 72)
    if w < h:   # side by side
        gap = 0.25
        x0 = (sheet[0] - 2 * w - gap) / 2
        y0 = (sheet[1] - h) / 2
        boxes = [(x0, y0), (x0 + w + gap, y0)]
    else:       # one above the other
        gap = 0.25
        x0 = (sheet[0] - w) / 2
        y0 = (sheet[1] - 2 * h - gap) / 2
        boxes = [(x0, y0), (x0, y0 + h + gap)]
    for bx, by in boxes:
        r = pymupdf.Rect(bx * 72, by * 72, (bx + w) * 72, (by + h) * 72)
        page.show_pdf_page(r, src, 0)
        m = 0.18 * 72
        for (cx, cy) in ((r.x0, r.y0), (r.x1, r.y0), (r.x0, r.y1), (r.x1, r.y1)):
            sx = -1 if cx == r.x0 else 1
            sy = -1 if cy == r.y0 else 1
            page.draw_line((cx + sx * 3, cy), (cx + sx * (3 + m), cy), color=(0.6, 0.6, 0.6), width=0.4)
            page.draw_line((cx, cy + sy * 3), (cx, cy + sy * (3 + m)), color=(0.6, 0.6, 0.6), width=0.4)
    dest = flat.with_name(flat.stem.replace('-flat', '') + '-2up-flat.pdf')
    out.save(str(dest), deflate=True)
    return dest


def qr_read(pdf: pathlib.Path) -> set[str]:
    import cv2
    import numpy as np
    page = pymupdf.open(str(pdf))[0]
    pix = page.get_pixmap(dpi=200, alpha=False)
    img = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3)[..., ::-1].copy()
    ok, dec, _, _ = cv2.QRCodeDetector().detectAndDecodeMulti(img)
    return {d for d in dec if d} if ok else set()


def qa(pdf: pathlib.Path, size: tuple[float, float], need: list[str], qr_want: list[str],
       banned: list[str] = (), web_fonts: list[str] = ()) -> list[str]:
    problems = []
    doc = pymupdf.open(str(pdf))
    if len(doc) != 1:
        problems.append(f'{len(doc)} pages (want 1)')
    page = doc[0]
    w, h = page.rect.width / 72, page.rect.height / 72
    if abs(w - size[0]) > 0.02 or abs(h - size[1]) > 0.02:
        problems.append(f'page is {w:.2f} x {h:.2f} in (want {size[0]} x {size[1]})')
    text = page.get_text()
    flat = ' '.join(text.split())
    squeezed = re.sub(r'\s+', '', flat).lower()   # letter-spaced labels extract as 'C L O T H I N G'
    for word in need:
        if word.lower() not in flat.lower() and re.sub(r'\s+', '', word).lower() not in squeezed:
            problems.append(f'missing "{word}"')
    for pat in BANNED + list(banned):
        if re.search(pat, flat, re.I):
            problems.append(f'banned: {pat}')
    safe = pymupdf.Rect(SAFE_IN * 72, SAFE_IN * 72, page.rect.width - SAFE_IN * 72, page.rect.height - SAFE_IN * 72)
    for b in page.get_text('blocks'):
        r = pymupdf.Rect(b[:4])
        if b[4].strip() and not safe.contains(r):
            problems.append(f'text outside the safe area: "{b[4].strip()[:30]}"')
    # Chromium embeds variable Google web fonts (Manrope, Nunito) as unnamed Type3 outlines and static ones (Barlow
    # Condensed, Poppins...) as named TrueType subsets; any other named font means a web font failed to load and the
    # browser fell back (Arial, Times, Segoe...).
    loaded = [f.replace(' ', '').lower() for f in web_fonts]
    fallback = sorted({f[3] for f in page.get_fonts() if f[2] != 'Type3' and f[3]
                       and not any(f[3].split('+')[-1].lower().startswith(w) for w in loaded)})
    if fallback:
        problems.append(f'fallback fonts in the PDF (a web font did not load): {fallback}')
    if qr_want:
        got = qr_read(pdf)
        for u in qr_want:
            if u not in got:
                problems.append(f'QR does not read back: {u} (read {sorted(got)})')
    return problems


def build(sign: str, only: str | None = None) -> int:
    spec = json.loads((HERE / 'copy' / f'{sign}.json').read_text(encoding='utf-8'))
    env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(HERE / 'templates')), autoescape=True)
    env.globals['qr'] = qr_svg
    data = {k: v for k, v in spec.items() if k not in ('variants', 'template', 'need', 'qr', 'banned')}
    if spec.get('hours') == 'live':
        data['hours'] = live_hours()
        print(f"hours (ecothrift.us): {data['hours']['site_label']}")
    dest = OUT / sign
    dest.mkdir(parents=True, exist_ok=True)
    failed = 0
    for name, var in spec['variants'].items():
        if only and name != only:
            continue
        size = SIZES[var['size']]
        tpl = env.get_template(var.get('template', spec['template']))
        html = dest / f'{name}.html'
        html.write_text(tpl.render(**data, v=var, w_in=size[0], h_in=size[1],
                                   art=(HERE / 'art').as_uri(), name=name), encoding='utf-8')
        pdf = dest / f'{name}.pdf'
        render_pdf(html, pdf)
        web_fonts = [f.replace('+', ' ') for f in re.findall(r'family=([^:&"]+)', html.read_text(encoding='utf-8'))]
        problems = qa(pdf, size, spec.get('need', []) + var.get('need', []), var.get('qr', spec.get('qr', [])),
                      spec.get('banned', []), web_fonts)
        flat = flatten(pdf)
        if var.get('two_up'):
            two_up(flat, size)
        pix = pymupdf.open(str(pdf))[0].get_pixmap(dpi=100, alpha=False)
        pix.save(str(dest / f'{name}.png'))
        status = 'PASS' if not problems else 'FAIL: ' + '; '.join(problems)
        failed += bool(problems)
        print(f'{name}: {size[0]} x {size[1]} in, flat {flat.stat().st_size // 1024} KB, {status}')
    return failed


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    sys.exit(1 if build(args[0], args[1] if len(args) > 1 else None) else 0)
