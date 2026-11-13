"""Place sign(s) on a photo of a real wall or door at true scale (brand board #134, mock-up method).

Run from the repo root with the tool venv:
    workspace/signage/.venv/Scripts/python.exe design/signage/tools/mockup.py door-block workspace/signage/out/theme-warning/A-camera.pdf
    workspace/signage/.venv/Scripts/python.exe design/signage/tools/mockup.py store-front a.pdf@30,60 b.png=8.5x11@70,60 --out x.png

WALL is a name in design/signage/art/walls/ (door-block, store-front) or a path to any photo with a JSON sidecar beside it.
The sidecar says where a known rectangle sits on the wall plane:
    {"ref": {"px": [[x,y] TL, TR, BR, BL], "in": [width, height]}, "ref_top_in": <height of the ref's top edge above the
     floor>, "spots": {"door": {"x_in": <from the ref's left edge>, "center_h_in": <sign centre above the floor>}}}
For a new store photo: measure one real rectangle with a tape (a door leaf, a 4 ft panel), click its four corners in any
image viewer, and write those numbers. The four corners can be in perspective; the sign is warped onto the same plane.

Each SIGN is a PDF (true size read from the page) or a PNG with its size, path=WxH (inches). Where it goes: @x,h (x
from the ref's left edge, centre height above the floor, inches) or @spotname; default the first spot. Output: the whole
photo (--out, default workspace/signage/out/mockups/<wall>-<sign>.png) and a crop around the signs (-crop.png).
The sign is lit by the wall's own light and casts a small soft shadow, so it reads as printed and hung, not pasted.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re

import cv2
import numpy as np
import pymupdf
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parents[1]
ROOT = HERE.parents[1]
WALLS = HERE / 'art' / 'walls'
OUT = ROOT / 'workspace' / 'signage' / 'out' / 'mockups'


def load_wall(arg: str):
    p = pathlib.Path(arg)
    if not p.exists():
        p = WALLS / f'{arg}.jpg'
    meta = json.loads(p.with_suffix('.json').read_text(encoding='utf-8'))
    img = np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255
    w_in, h_in = meta['ref']['in']
    src = np.float32([[0, 0], [w_in, 0], [w_in, h_in], [0, h_in]])
    H = cv2.getPerspectiveTransform(src, np.float32(meta['ref']['px']))
    return p, img, meta, H


def px_per_in(H, x, y) -> float:
    a = cv2.perspectiveTransform(np.float32([[[x, y], [x + 1, y]]]), H)[0]
    return float(np.linalg.norm(a[1] - a[0]))


def load_sign(spec: str, ppi: float):
    m = re.match(r'^(.*?)(?:=([\d.]+)x([\d.]+))?(?:@(.+))?$', spec)
    path, w, h, where = m.group(1), m.group(2), m.group(3), m.group(4)
    path = pathlib.Path(path)
    if path.suffix.lower() == '.pdf':
        page = pymupdf.open(str(path))[0]
        w_in, h_in = page.rect.width / 72, page.rect.height / 72
        pix = page.get_pixmap(dpi=max(72, int(ppi * 2)), alpha=False)
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    else:
        if not w:
            raise SystemExit(f'{path}: a PNG needs its size, {path}=WxH (inches)')
        w_in, h_in = float(w), float(h)
        im = Image.open(path).convert('RGB')
    return path, im, w_in, h_in, where


def place(img, H, meta, sign, where, shadow=True):
    path, im, w_in, h_in, _ = sign
    spots = meta.get('spots', {})
    if where and ',' in where:
        x_c, h_c = (float(v) for v in where.split(','))
    else:
        s = spots[where] if where else next(iter(spots.values()))
        x_c, h_c = s['x_in'], s['center_h_in']
    y_c = meta['ref_top_in'] - h_c                      # plane y runs down from the ref's top edge
    corners = np.float32([[x_c - w_in / 2, y_c - h_in / 2], [x_c + w_in / 2, y_c - h_in / 2],
                          [x_c + w_in / 2, y_c + h_in / 2], [x_c - w_in / 2, y_c + h_in / 2]])
    dst = cv2.perspectiveTransform(corners[None], H)[0]
    sw, sh = im.size
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [sw, 0], [sw, sh], [0, sh]]), dst)
    rows, cols = img.shape[:2]
    a = np.asarray(im).astype(np.float32) / 255
    warped = cv2.warpPerspective(a, M, (cols, rows), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT)
    mask = cv2.warpPerspective(np.ones((sh, sw), np.float32), M, (cols, rows), flags=cv2.INTER_LINEAR)
    ppi = px_per_in(H, x_c, y_c)
    # Soft contact shadow: down and a little right, about 0.12 in, blurred 0.25 in.
    if shadow:
        sm = np.roll(np.roll(mask, int(0.12 * ppi), 0), int(0.05 * ppi), 1)
        sm = cv2.GaussianBlur(sm, (0, 0), max(1, 0.25 * ppi))
        img = img * (1 - 0.28 * sm[..., None])
    # Light the sign with the wall's own light: the wall's blurred brightness relative to its median under the sign.
    lum = cv2.GaussianBlur(img.mean(2), (0, 0), max(2, 1.5 * ppi))
    ref = np.median(lum[mask > 0.5]) if (mask > 0.5).any() else 1
    light = np.clip((lum / max(ref, 1e-3)) ** 0.7, 0.7, 1.12)
    tone = np.median(img[mask > 0.5], axis=0) / max(np.median(img[mask > 0.5]), 1e-3)   # wall colour cast, gently
    tone = 1 + 0.25 * (tone - 1)
    lit = np.clip(warped * light[..., None] * tone * 0.97, 0, 1)
    lit = cv2.GaussianBlur(lit, (0, 0), 0.5)          # match the photo's softness
    out = img * (1 - mask[..., None]) + lit * mask[..., None]
    return out, dst


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('wall')
    ap.add_argument('signs', nargs='+')
    ap.add_argument('--out')
    ap.add_argument('--margin', type=float, default=14, help='crop margin around the signs, inches')
    args = ap.parse_args()
    wall_path, img, meta, H = load_wall(args.wall)
    w0, h0 = meta['ref']['in']
    ppi = px_per_in(H, w0 / 2, h0 / 2)
    boxes = []
    for spec in args.signs:
        sign = load_sign(spec, ppi)
        img, dst = place(img, H, meta, sign, sign[4])
        boxes.append(dst)
    out = pathlib.Path(args.out) if args.out else OUT / f'{wall_path.stem}-{pathlib.Path(args.signs[0].split("=")[0].split("@")[0]).stem}.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    full = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    full.save(out)
    pts = np.concatenate(boxes)
    m = args.margin * ppi
    x0, y0 = max(0, pts[:, 0].min() - m), max(0, pts[:, 1].min() - m)
    x1, y1 = min(full.width, pts[:, 0].max() + m), min(full.height, pts[:, 1].max() + m)
    full.crop((int(x0), int(y0), int(x1), int(y1))).save(out.with_name(out.stem + '-crop.png'))
    print(f'{out} ({full.width} x {full.height}, {ppi:.1f} px/in on the wall)')


if __name__ == '__main__':
    main()
