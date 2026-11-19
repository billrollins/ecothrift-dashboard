"""Brand board materials R, Real surface (Dash Update #134; Bill 11-19: "R is 100% done"): a preview of the board's
materials section with two sample signs (copy/texture-sign-r.json: a pallet wood directory where denim marks Clothing,
a kraft Customer header). Rounds 1 to 3 were rejected and their builders removed; see brand-board.md sections 9 to 11.

Out: workspace/signage/out/texture-study/R.png. Run from the repo root (brand_board.py first, once):
    workspace/signage/.venv/Scripts/python.exe design/signage/tools/texture_study.py
"""
from __future__ import annotations

import pathlib
import sys

import pymupdf
from PIL import Image, ImageDraw, ImageFont

TOOLS = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import build  # noqa: E402

OUT = build.OUT / 'texture-study'
PAGE = (242, 242, 238)


def font(size: int, bold=True):
    for f in (('C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf'), 'C:/Windows/Fonts/arial.ttf'):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def page_png(pdf: pathlib.Path, dpi: int) -> Image.Image:
    pix = pymupdf.open(str(pdf))[0].get_pixmap(dpi=dpi, alpha=False)
    return Image.frombytes('RGB', (pix.width, pix.height), pix.samples)


def fit(im: Image.Image, w: int, h: int) -> Image.Image:
    im = im.copy()
    im.thumbnail((w, h), Image.LANCZOS)
    return im


def shadowed(canvas: Image.Image, im: Image.Image, xy: tuple[int, int]):
    x, y = xy
    sh = Image.new('RGBA', (im.width + 16, im.height + 16), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rectangle((8, 10, im.width + 8, im.height + 10), fill=(0, 0, 0, 38))
    from PIL import ImageFilter
    canvas.paste(sh.filter(ImageFilter.GaussianBlur(5)), (x - 8, y - 8), sh.filter(ImageFilter.GaussianBlur(5)))
    canvas.paste(im, (x, y))


def real() -> int:
    """Round 4 (Bill 11-19 "i hate them all"; Astra, gpt-6.2-astra, art-directed; gpt-image-2.6 plates in
    art/materials/r4/): the board and two sample signs. Out: texture-study/R.png."""
    failed = build.build('brand-board', 'board')
    failed += build.build('texture-sign-r')
    OUT.mkdir(parents=True, exist_ok=True)
    s = 200
    bp = page_png(build.OUT / 'brand-board' / 'board.pdf', s)
    crop = bp.crop((int(0.45 * s), int(4.85 * s), int((0.45 + 9.0) * s), int((4.85 + 2.45) * s)))
    cv = Image.new('RGB', (1600, 1080), PAGE)
    d = ImageDraw.Draw(cv)
    d.text((40, 22), 'R: Real surface (Astra)', fill=(27, 31, 27), font=font(34))
    mat = fit(crop, 1520, 420)
    cv.paste(mat, (40, 78))
    d.text((40, 78 + mat.height + 8), 'The brand board, materials section', fill=(107, 113, 107), font=font(17, False))
    y2 = 78 + mat.height + 44
    for i, (v, cap) in enumerate((('R-dir', 'Information: pallet wood directory, denim marks Clothing'),
                                  ('R-kraft', 'Customer: kraft department header'))):
        sp = fit(page_png(build.OUT / 'texture-sign-r' / f'{v}.pdf', 150), 745, 1080 - y2 - 50)
        x = 40 + i * (745 + 30)
        shadowed(cv, sp, (x, y2))
        d.text((x, y2 + sp.height + 8), cap + ', Letter 11 x 8.5', fill=(107, 113, 107), font=font(17, False))
    cv.save(OUT / 'R.png', optimize=True)
    print(f'preview: {OUT / "R.png"}')
    return failed


if __name__ == '__main__':
    sys.exit(1 if real() else 0)
