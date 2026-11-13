"""Build the Eco-Thrift sign brand board (Dash Update #134) in one go:
1. Warning A (theme-warning A-camera), the board's first family member, through build.py;
2. its board image (200 dpi) and its mock-up on the door wall (mockup.py) into workspace/signage/out/brand-board/;
3. the board itself through build.py (copy/brand-board.json + templates/brand-board.html.j2): vector PDF, 600 dpi flat
   PDF for the Canon PRO-100 (Tabloid, 17 x 11 in), and a 150 dpi PNG (brand-board.png) to look at.

Run from the repo root:  workspace/signage/.venv/Scripts/python.exe design/signage/tools/brand_board.py
"""
from __future__ import annotations

import pathlib
import subprocess
import sys

import pymupdf

TOOLS = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import build  # noqa: E402

OUT = build.OUT / 'brand-board'


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    if build.build('theme-warning', 'A-camera'):
        return 1
    sign = build.OUT / 'theme-warning' / 'A-camera.pdf'
    pymupdf.open(str(sign))[0].get_pixmap(dpi=200, alpha=False).save(str(OUT / 'A-camera-board.png'))
    subprocess.run([sys.executable, str(TOOLS / 'mockup.py'), 'door-block', str(sign), '--out', str(OUT / 'mockup-door.png')],
                   check=True)
    failed = build.build('brand-board')
    pymupdf.open(str(OUT / 'board-flat.pdf'))[0].get_pixmap(dpi=150, alpha=False).save(str(OUT / 'brand-board.png'))
    print(f'board PNG: {OUT / "brand-board.png"}')
    return failed


if __name__ == '__main__':
    sys.exit(1 if main() else 0)
