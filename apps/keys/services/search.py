"""Find a key from a photo: read its metrics (AI call 1), rank the logged keys by those metrics (no AI), put the top 9
on a numbered 3x3 grid, and ask the AI which number is the same key (call 2). The person confirms on screen."""
from __future__ import annotations

import base64
import io
import re

from PIL import Image, ImageDraw, ImageFont

from apps.keys.models import Key

from . import ai

GRID_SIZE = 9
CELL = 400
BADGE = 64


def _norm(value) -> str:
    return re.sub(r'[^A-Z0-9]', '', str(value or '').upper())


def _depths(value) -> list[int]:
    return [int(d) for d in re.findall(r'\d', str(value or ''))]


def score(query: dict, key) -> float:
    """How well a logged key's metrics fit the photo's. Higher is closer; 0 means nothing to compare.

    A stamped code that matches wins outright. Type and keyway are the strong signs; brand, head shape and the cuts
    add to them. A clear difference in type takes points away, so a padlock key never outranks a house key that fits."""
    s = 0.0
    if _norm(query.get('stamped_code')) and _norm(query.get('stamped_code')) == _norm(key.stamped_code):
        s += 10
    q_type, k_type = query.get('key_type') or '', key.key_type or ''
    if q_type and k_type and q_type != 'other' and k_type != 'other':
        s += 3 if q_type == k_type else -3
    q_way, k_way = _norm(query.get('keyway')), _norm(key.keyway)
    if q_way and k_way:
        s += 4 if q_way == k_way else -1
    if _norm(query.get('brand')) and _norm(query.get('brand')) == _norm(key.brand):
        s += 2
    if _norm(query.get('head_shape')) and _norm(query.get('head_shape')) == _norm(key.head_shape):
        s += 1
    q_count, k_count = query.get('cut_count'), key.cut_count
    if q_count and k_count:
        gap = abs(q_count - k_count)
        s += 2 if gap == 0 else 1 if gap == 1 else -1
    q_cuts, k_cuts = _depths(query.get('cut_depths')), _depths(key.cut_depths)
    if q_cuts and k_cuts:
        n = min(len(q_cuts), len(k_cuts))
        mean_gap = sum(abs(a - b) for a, b in zip(q_cuts[:n], k_cuts[:n])) / n
        s += max(0.0, 3 - mean_gap)
    return round(s, 2)


def rank(query: dict, keys=None, limit: int = GRID_SIZE) -> list[tuple[object, float]]:
    """The logged keys with a photo, closest first (ties by name). Keys with no metrics still come in at 0, so the
    picture check can catch a key whose photo was never read."""
    if keys is None:
        keys = Key.objects.filter(is_archived=False).exclude(thumbnail='').select_related('ring')
    scored = [(k, score(query, k)) for k in keys]
    scored.sort(key=lambda pair: (-pair[1], pair[0].name.lower(), pair[0].pk))
    return scored[:limit]


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # pragma: no cover - an old Pillow
        return ImageFont.load_default()


def _thumb(key) -> Image.Image | None:
    try:
        with key.thumbnail.open('rb') as fh:
            img = Image.open(io.BytesIO(fh.read()))
            img.load()
        return img.convert('RGB')
    except Exception:  # noqa: BLE001 - a missing file leaves its cell blank
        return None


def build_grid(keys: list) -> bytes:
    """A 3x3 JPEG of the keys' thumbnails on white, each numbered 1-9 in the top-left corner."""
    grid = Image.new('RGB', (CELL * 3, CELL * 3), 'white')
    draw = ImageDraw.Draw(grid)
    font = _font(44)
    for index, key in enumerate(keys[:GRID_SIZE]):
        x, y = (index % 3) * CELL, (index // 3) * CELL
        img = _thumb(key)
        if img is not None:
            img.thumbnail((CELL - 16, CELL - 16))
            grid.paste(img, (x + (CELL - img.width) // 2, y + (CELL - img.height) // 2))
        draw.rectangle([x, y, x + CELL - 1, y + CELL - 1], outline=(160, 160, 160), width=2)
        draw.rectangle([x + 4, y + 4, x + 4 + BADGE, y + 4 + BADGE], fill=(0, 0, 0))
        draw.text((x + 4 + BADGE // 2, y + 4 + BADGE // 2), str(index + 1), fill='white', font=font, anchor='mm')
    buf = io.BytesIO()
    grid.save(buf, format='JPEG', quality=85)
    return buf.getvalue()


def find(raw_photo: bytes) -> dict:
    """The whole search for one photo. Raises ai.KeyAIError when the first call fails."""
    metrics, model = ai.read_metrics(raw_photo)
    out = {'metrics': metrics, 'model': model, 'candidates': [], 'answer': None, 'reason': '', 'grid': None}
    # A "not a key" read still goes on to the picture check: the read can be wrong, and the grid shows the person.
    top = rank(metrics)
    out['candidates'] = [{'number': i + 1, 'key': key, 'score': s} for i, (key, s) in enumerate(top)]
    if not top:
        out['reason'] = 'No logged key has a photo yet.'
        return out
    grid = build_grid([key for key, _ in top])
    out['grid'] = 'data:image/jpeg;base64,' + base64.b64encode(grid).decode('ascii')
    try:
        out['answer'], out['reason'], _ = ai.pick_match(raw_photo, grid, len(top))
    except ai.KeyAIError as exc:
        out['reason'] = str(exc)
    return out
