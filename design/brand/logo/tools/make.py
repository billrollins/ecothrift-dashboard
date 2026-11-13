"""Rebuild the whole Eco-Thrift logo set: svg/, pdf/, eps/, png/ (design/brand/logo/README.md says what each is for).

Run from the repo root with the sign tool venv (pymupdf):
    workspace/signage/.venv/Scripts/python.exe design/brand/logo/tools/make.py

Steps:
 1. ai2svg.py     the designer's AI file -> the mark and the 2021 wordmark as exact SVG paths
 2. Edge          tools/text.html (Varela Round, Crimson Pro Bold, Montserrat Bold from Google Fonts) -> text.pdf
 3. build_logo.py every lockup and colourway -> svg/ (filled paths only: no fonts, strokes or pictures)
 4. Edge          each SVG -> a vector PDF in pdf/ (transparent background)
 5. svg2eps.py    each SVG -> a level-3 EPS in eps/ (gradients stay smooth shading)
 6. pymupdf       transparent PNGs in png/ at the widths below
Edge comes from PATH, then the EDGE env var, then docs/machines.md. Scratch goes to workspace/logo-build/.
"""
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time

import pymupdf

TOOLS = pathlib.Path(__file__).resolve().parent
LOGO = TOOLS.parent
ROOT = LOGO.parents[2]
BUILD = ROOT / 'workspace' / 'logo-build'
PNG_WIDTHS = {'eco-thrift-logo-store-line-': [1200, 2400], 'eco-thrift-logo-stacked-2021-': [600, 1200],
              'eco-thrift-logo-': [600, 1200, 2400], 'eco-thrift-mark-': [256, 512, 1024], 'eco-thrift-wordmark-': [1200]}


def edge() -> str:
    for cand in ('msedge', os.environ.get('EDGE', '')):
        if cand and (shutil.which(cand) or pathlib.Path(cand).exists()):
            return shutil.which(cand) or cand
    m = re.search(r'`EDGE`\s*\|\s*`([^`]+)`', (ROOT / 'docs' / 'machines.md').read_text(encoding='utf-8'))
    if m and pathlib.Path(m.group(1)).exists():
        return m.group(1)
    sys.exit('Edge not found (PATH, EDGE, docs/machines.md).')


def print_pdf(html: pathlib.Path, pdf: pathlib.Path):
    """Headless Edge prints a page to PDF. The launcher returns at once and a background Edge writes the file a moment
    later, so wait for it (and try again if it never comes)."""
    profile = BUILD / 'edge-profile'
    for _ in range(3):
        pdf.unlink(missing_ok=True)
        subprocess.run([edge(), '--headless', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw',
                        f'--user-data-dir={profile}', f'--print-to-pdf={pdf}', html.as_uri()], capture_output=True, timeout=120)
        for _ in range(60):
            if pdf.exists() and pdf.stat().st_size:
                time.sleep(0.5)  # let it finish writing
                return
            time.sleep(0.5)
    sys.exit(f'Edge did not write {pdf}')


def run(script: str, *args):
    subprocess.run([sys.executable, str(TOOLS / script), *args], check=True, cwd=TOOLS)


def main():
    BUILD.mkdir(parents=True, exist_ok=True)
    run('ai2svg.py')
    shutil.copy(TOOLS / 'text.html', BUILD / 'text.html')
    print_pdf(BUILD / 'text.html', BUILD / 'text.pdf')
    run('build_logo.py')
    svgs = sorted((LOGO / 'svg').glob('*.svg'))
    (LOGO / 'pdf').mkdir(exist_ok=True)
    for f in svgs:
        svg = f.read_text(encoding='utf-8')
        w, h = re.search(r'viewBox="0 0 ([^ ]+) ([^"]+)"', svg).groups()
        page = BUILD / f'{f.stem}.html'
        page.write_text(f'<!doctype html><html><head><style>@page{{size:{w}pt {h}pt;margin:0}}html,body{{margin:0;background:transparent}}'
                        f'svg{{display:block}}</style></head><body>{svg}</body></html>', encoding='utf-8')
        print_pdf(page, LOGO / 'pdf' / f'{f.stem}.pdf')
    run('svg2eps.py', *[str(f) for f in svgs])
    (LOGO / 'png').mkdir(exist_ok=True)
    for f in sorted((LOGO / 'pdf').glob('*.pdf')):
        widths = PNG_WIDTHS[max((k for k in PNG_WIDTHS if f.stem.startswith(k)), key=len)]
        page = pymupdf.open(f)[0]
        for w in widths:
            z = w / page.rect.width
            page.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=True).save(LOGO / 'png' / f'{f.stem}-{w}w.png')
    print(f'{len(svgs)} logos: svg/, pdf/, eps/, png/ in {LOGO.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
