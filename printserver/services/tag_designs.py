"""Tags the print server draws itself at the label size Dash sends (owner, 2026-10-29: tags are drawn here, never sent
as a picture from Dash). Printed through ``send_image`` fitted to the printable area, like the price tag.

- **Restoration tag** (owner 10-28, layout A): a black RESTORATION band, the QR of the plain SKU, the SKU big, a short
  title, the work in big words (or HOLDOUT), and a SENT / BY strip. No price.
- **Test label:** a frame on the edge, quarter-inch ticks along the top and left, and the size it was drawn for.
"""
from __future__ import annotations

from datetime import date

from PIL import Image, ImageDraw, ImageFont

from services.label_printer import _font_bold, _font_regular, _make_qr

_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def _font_black(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for family in ("ariblk.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(family, size)
        except OSError:
            continue
    return ImageFont.load_default()


_FONTS = {"black": _font_black, "bold": _font_bold, "regular": _font_regular}


def _width(draw: ImageDraw.ImageDraw, text: str, font) -> float:
    return draw.textlength(text, font=font)


def _fit(draw: ImageDraw.ImageDraw, text: str, max_w: float, max_h: float, min_size: int, kind: str) -> int:
    """The biggest size (dots) at which ``text`` fits ``max_w`` and ``max_h``."""
    size = max(min_size, int(max_h))
    while size > min_size and _width(draw, text, _FONTS[kind](size)) > max_w:
        size -= 1
    return size


def _wrap(draw, text: str, size: int, kind: str, max_w: float, max_lines: int) -> list[str]:
    font = _FONTS[kind](size)
    lines: list[str] = []
    cur = ""
    for word in (text or "").split():
        trial = f"{cur} {word}".strip()
        if _width(draw, trial, font) <= max_w:
            cur = trial
            continue
        if cur:
            lines.append(cur)
        cur = word
        if len(lines) == max_lines:
            break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    if len(lines) == max_lines and " ".join(lines) != " ".join((text or "").split()):
        last = lines[-1]
        while last and _width(draw, last + "...", font) > max_w:
            last = last[:-1]
        lines[-1] = last.rstrip() + "..."
    return lines


def _text_mid(draw, x: float, y_mid: float, text: str, size: int, kind: str, fill: int, center: bool = False) -> None:
    font = _FONTS[kind](size)
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    tx = x - (right - left) / 2 - left if center else x - left
    draw.text((tx, y_mid - (top + bottom) / 2), text, font=font, fill=fill)


def sent_label(iso: str | None) -> str:
    """"WED OCT 28" from an ISO date (the calendar day)."""
    try:
        d = date.fromisoformat((iso or "")[:10])
    except ValueError:
        return ""
    return f"{_DAYS[d.weekday()]} {_MONTHS[d.month - 1]} {d.day}"


def work_words(needs: list[str], holdout: bool) -> str:
    if holdout:
        return "HOLDOUT · SELL AS IS"
    return " · ".join(n.upper() for n in needs if n)


def draw_restoration_tag(data: dict, w_in: float, h_in: float, dpi: int) -> Image.Image:
    w, h = max(1, round(w_in * dpi)), max(1, round(h_in * dpi))
    img = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(img)
    m = max(3, round(h * 0.03))
    sku = str(data.get("sku") or "")

    band = round(h * 0.19)
    d.rectangle([0, 0, w, band], fill=0)
    _text_mid(d, w / 2, band / 2, "RESTORATION", _fit(d, "RESTORATION", w - 4 * m, band * 0.8, 6, "black"), "black",
              255, center=True)

    strip = round(h * 0.2)
    top = h - strip
    rule = max(2, round(h * 0.008))

    qr = max(24, min(top - band - 2 * m, round(w * 0.42)))
    img.paste(_make_qr(sku, qr), (m, band + (top - band - qr) // 2))
    x = m + qr + m
    max_w = w - x - m
    y = band + m
    sku_size = _fit(d, sku, max_w, h * 0.17, 6, "bold")
    left, t, _, _ = d.textbbox((0, 0), sku, font=_font_bold(sku_size))
    d.text((x - left, y - t), sku, font=_font_bold(sku_size), fill=0)
    y += sku_size * 1.05 + m / 2

    words = work_words(list(data.get("needs") or []), bool(data.get("holdout")))
    work_min = h * 0.11
    bottom = top - m
    title_size = max(6, round(h * 0.075))
    title_lines = 2 if h_in >= 1.5 else 1
    for line in _wrap(d, str(data.get("title") or sku), title_size, "bold", max_w, title_lines):
        if y + title_size * 1.1 + (work_min if words else 0) > bottom:
            break
        left, t, _, _ = d.textbbox((0, 0), line, font=_font_bold(title_size))
        d.text((x - left, y - t), line, font=_font_bold(title_size), fill=0)
        y += title_size * 1.1

    if words:
        room = bottom - y
        one = _fit(d, words, max_w, min(h * 0.13, room * 0.9), 5, "black")
        parts = words.split(" · ")
        half = (len(parts) + 1) // 2
        lines = [" · ".join(parts[:half]), " · ".join(parts[half:])]
        two = (min(_fit(d, ln, max_w, min(h * 0.13, room / 2.2), 5, "black") for ln in lines)
               if len(parts) > 1 else 0)
        if one >= two:
            _text_mid(d, x, y + room / 2, words, one, "black", 0)
        else:
            gap = (room - 2 * two) / 3
            for i, ln in enumerate(lines):
                _text_mid(d, x, y + gap + two / 2 + i * (two + gap), ln, two, "black", 0)

    d.rectangle([0, top - rule // 2, w, top + rule // 2], fill=0)
    d.rectangle([w // 2 - rule // 2, top, w // 2 + rule // 2, h], fill=0)
    mid = top + strip / 2
    cap = max(5, round(strip * 0.3))

    def cell(caption: str, value: str, x0: float) -> None:
        _text_mid(d, x0 + m, mid, caption, cap, "regular", 0)
        vx = x0 + m + _width(d, caption, _font_regular(cap)) + m
        _text_mid(d, vx, mid, value, _fit(d, value, x0 + w / 2 - m - vx, strip * 0.55, 5, "black"), "black", 0)

    cell("SENT", sent_label(data.get("sent_on")) or "-", 0)
    cell("BY", str(data.get("sent_by") or "-"), w / 2)
    d.rectangle([0, 0, w - 1, h - 1], outline=0, width=rule)
    return img


def draw_test_label(w_in: float, h_in: float, dpi: int) -> Image.Image:
    w, h = max(1, round(w_in * dpi)), max(1, round(h_in * dpi))
    img = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(img)
    line = max(2, round(dpi / 100))
    d.rectangle([0, 0, w - 1, h - 1], outline=0, width=line)
    long_, half, short = round(dpi * 0.14), round(dpi * 0.1), round(dpi * 0.07)

    def tick_len(q: int) -> int:
        return long_ if q % 4 == 0 else half if q % 4 == 2 else short

    q = 1
    while q * dpi / 4 < w - 1:
        at = round(q * dpi / 4)
        d.rectangle([at - line // 2, 0, at + line // 2, tick_len(q)], fill=0)
        q += 1
    q = 1
    while q * dpi / 4 < h - 1:
        at = round(q * dpi / 4)
        d.rectangle([0, at - line // 2, tick_len(q), at + line // 2], fill=0)
        q += 1
    inner = long_ + round(dpi * 0.05)
    max_w = w - inner - round(dpi * 0.08)
    cx = inner + max_w / 2
    head = f"{w_in:g} x {h_in:g} in"
    _text_mid(d, cx, inner + (h - inner) * 0.35, head, _fit(d, head, max_w, h * 0.28, 8, "black"), "black", 0,
              center=True)
    sub = f"{dpi} dpi · ticks every 1/4 in · print server"
    _text_mid(d, cx, inner + (h - inner) * 0.72, sub, _fit(d, sub, max_w, h * 0.11, 6, "regular"), "regular", 0,
              center=True)
    return img
