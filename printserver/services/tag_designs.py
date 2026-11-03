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


# ---------------------------------------------------------------------------
# Price tags (1.9.12): the Classic "side stripe" tag as Dash drew it, and the Thrift+ Perks tag. Both are ports of the
# browser layouts (frontend/src/printing/tags/priceTag.ts and perksTag.ts): a layout places *ops* in printer dots in
# proportion to the box, and ``_paint_ops`` draws them with PIL. Dash sends data only.
# ---------------------------------------------------------------------------
import math  # noqa: E402
from functools import lru_cache  # noqa: E402

import qrcode  # noqa: E402

from services.label_printer import _assets_dir  # noqa: E402

TAG_LINK_BASE = "HTTPS://ECOTHRIFT.US/I/"
LOGO_ASPECT = 4.06
LINE = 0.95  # a line of Arial, top of the tallest letter to the bottom of a descender
CAP = 0.72  # Arial Black digits stand about 0.72 of the size above the baseline
DOLLAR = 0.8
_SNAP = 140  # luminance below this prints black (same as the browser's snapToInk)


def _r(x: float) -> int:
    """JavaScript Math.round."""
    return math.floor(x + 0.5)


def tag_link(sku: str) -> str:
    return f"{TAG_LINK_BASE}{str(sku).strip().upper()}"


@lru_cache(maxsize=256)
def _font_for(kind: str, size: int):
    return _FONTS[kind](max(1, size))


_MEASURE_DRAW = ImageDraw.Draw(Image.new("L", (1, 1)))


def measure(text: str, size: float, kind: str) -> float:
    return _MEASURE_DRAW.textlength(text, font=_font_for(kind, _r(size)))


def fit_size(text: str, max_w: float, start: float, minimum: float, kind: str) -> int:
    size = math.floor(start)
    while size > minimum and measure(text, size, kind) > max_w:
        size -= 1
    return max(1, size)


def wrap_words(text: str, size: float, kind: str, max_w: float, max_lines: int) -> list[str]:
    lines: list[str] = []
    cur = ""
    for word in text.split():
        nxt = f"{cur} {word}" if cur else word
        if measure(nxt, size, kind) <= max_w or not cur:
            cur = nxt
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    if len(lines) <= max_lines:
        return lines
    kept = lines[:max_lines]
    last = kept[max_lines - 1]
    while " " in last and measure(f"{last}…", size, kind) > max_w:
        last = last[: last.rindex(" ")]
    kept[max_lines - 1] = f"{last}…"
    return kept


_ECC = {"H": qrcode.constants.ERROR_CORRECT_H, "Q": qrcode.constants.ERROR_CORRECT_Q,
        "M": qrcode.constants.ERROR_CORRECT_M}


@lru_cache(maxsize=256)
def qr_matrix(data: str, ecc: str = "H") -> list[list[bool]]:
    qr = qrcode.QRCode(error_correction=_ECC[ecc], border=0)
    qr.add_data(data)
    qr.make(fit=True)
    return qr.get_matrix()


def qr_modules(data: str, ecc: str = "H") -> int:
    return len(qr_matrix(data, ecc))


def qr_ecc_for(data: str, size: int) -> str:
    """The error correction that gives the biggest dots in a ``size`` square (a tie keeps the stronger one). On a
    1.5 x 1 Perks tag the link is 4 dots a module at M and 3 at H, which scans far better on a thermal print."""
    return max("HQM", key=lambda e: (size // (qr_modules(data, e) + 2), -"HQM".index(e)))


def _rect(x, y, w, h, fill="ink"):
    return {"kind": "rect", "x": x, "y": y, "w": w, "h": h, "fill": fill}


def _text(text, x, y, size, font, fill="ink", align="left", baseline="middle"):
    return {"kind": "text", "text": text, "x": x, "y": y, "size": size, "font": font, "fill": fill, "align": align,
            "baseline": baseline}


def _border(w, h):
    return [_rect(0, 0, w, 1), _rect(0, h - 1, w, 1), _rect(0, 0, 1, h), _rect(w - 1, 0, 1, h)]


def parse_price(raw) -> tuple[str, str] | None:
    """"$1,234.5" into ("1,234", ".50"); None for N/A or junk."""
    s = str(raw or "").strip()
    s = s[1:].strip() if s.startswith("$") else s
    if not s or s.upper() == "N/A":
        return None
    a, _, b = s.partition(".")
    whole = "".join(c for c in a if c.isdigit()) or ("0" if "." in s else "")
    if not whole:
        return None
    frac = "".join(c for c in b if c.isdigit())[:2].ljust(2, "0")
    return f"{int(whole):,}", f".{frac}"


def _first_words(text, max_words: int) -> str:
    words = str(text or "").split()
    return " ".join(words) if len(words) <= max_words else " ".join(words[:max_words]) + "…"


def _take_lines(words: list[str], size, kind, max_w, max_lines):
    lines: list[str] = []
    cur = ""
    i = 0
    while i < len(words) and len(lines) < max_lines:
        test = f"{cur} {words[i]}" if cur else words[i]
        if measure(test, size, kind) <= max_w:
            cur = test
            i += 1
        elif cur:
            lines.append(cur)
            cur = ""
        else:
            lines.append(words[i])
            i += 1
    if cur and len(lines) < max_lines:
        lines.append(cur)
    return lines, words[i:]


def _big_base(digits: int) -> int:
    for limit, base in ((2, 48), (3, 42), (4, 37), (5, 35), (6, 26), (7, 20)):
        if digits <= limit:
            return base
    return 18


_SCALES = [round((1 - i * 0.01) * 100) / 100 for i in range(51)]


def _price_band_ops(text, include: bool, band_w: int, band_h: int, fs: float) -> list[dict]:
    ops = [_rect(0, 0, band_w, band_h)]
    pad_x = max(2, band_w // 36)
    pad_y = max(1, band_w // 48)
    gap = max(1, math.floor(fs))
    price = parse_price(text) if include else None
    if not price:
        size = max(10, math.floor(28 * fs))
        ops.append(_text("N/A", band_w / 2, band_h / 2, size, "bold", "paper", "center"))
        return ops
    dollars, cents = price
    cx, cy = band_w - pad_x, band_h - pad_y
    digits = "".join(c for c in dollars if c.isdigit())
    zero = int(digits) == 0
    dollars_x = pad_x + max(3, band_w // 22)
    big = _big_base(len(digits))
    d = b = c = 0
    fitted = False
    for scale in _SCALES:
        d = max(12, math.floor(28 * fs * scale))
        c = max(9, math.floor((48 if zero else 28) * fs * scale))
        b = max(9, math.floor(big * fs * scale))
        sym_bottom = pad_y + d * DOLLAR
        cents_top = cy - c * CAP
        if zero:
            if pad_x + measure("$", d, "bold") + gap <= cx - measure(cents, c, "bold") and sym_bottom + gap <= cents_top:
                fitted = True
                break
        else:
            mid_h = cents_top - gap - (sym_bottom + gap)
            if dollars_x + measure(dollars, b, "bold") <= band_w - pad_x and mid_h >= b * CAP:
                fitted = True
                break
    if not fitted:
        d = max(10, math.floor(22 * fs))
        b = max(9, math.floor(24 * fs))
        c = max(9, math.floor(24 * fs))
    ops.append(_text("$", pad_x, pad_y + d * DOLLAR, d, "bold", "paper", baseline="alphabetic"))
    ops.append(_text(cents, cx, cy, c, "bold", "paper", "right", "bottom"))
    if not zero:
        mid_top = pad_y + d * DOLLAR + gap
        mid_bottom = cy - c * CAP - gap
        baseline = mid_top + max(0, (mid_bottom - mid_top - b * CAP) / 2) + b * CAP
        # The browser passed this baseline as "bottom" (em box), which lifted the digits into the "$"; here it is a true baseline.
        ops.append(_text(dollars, dollars_x, baseline, b, "bold", "paper", baseline="alphabetic"))
    return ops


def layout_price_tag(data: dict, w: int, h: int) -> list[dict]:
    """The Classic side-stripe tag (port of priceTag.ts, 305 x 203 reference)."""
    fs = min(w / 305, h / 203)

    def sy(y):
        return max(1, _r(y * h / 203))

    ops = [_rect(0, 0, w, h, "paper")]
    col1 = max(1, w // 3)
    band_h = h // 2
    ops += _price_band_ops(data.get("text"), data.get("include_text") is not False, col1, band_h, fs)
    qr_area_h = h - band_h
    inner_m = max(2, math.floor(4 * min(fs, 1.35)))
    qr = max(24, min(_r(col1 * 0.98), col1 - 2 * inner_m, qr_area_h - 2 * inner_m))
    ops.append({"kind": "qr", "data": str(data.get("qr_data") or ""), "x": (col1 - qr) // 2,
                "y": band_h + (qr_area_h - qr) // 2, "size": qr})
    ops.append({"kind": "line", "x1": col1, "y1": 0, "x2": col1, "y2": h, "width": max(1, _r(fs))})

    right_x = col1 + max(1, (3 * w) // 305)
    right_w = w - right_x - max(1, (4 * w) // 305)
    margin = max(1, math.floor(3 * min(fs, 1.35)))
    logo_h = max(sy(28), math.floor(h * 0.26))
    text_bottom = h - logo_h
    x = right_x + margin
    max_w = right_w - 2 * margin
    main = max(10, math.floor(28 * fs))
    sub = max(8, math.floor(22 * fs))
    meta = max(8, math.floor(20 * fs))

    retail = str(data.get("retail_text") or "").strip()[:24]
    if retail and max_w > 10:
        y = text_bottom - sy(2)
        ops.append(_text(retail, x, y, meta, "regular", baseline="bottom"))
        text_bottom = y - meta * LINE - sy(1)

    cursor = [sy(1)]

    def put(lines, size, kind, after):
        for line in lines:
            if cursor[0] + size * LINE > text_bottom:
                return
            # One word wider than the column shrinks to fit rather than run off the tag.
            fitted = min(size, fit_size(line, max_w, size, 6, kind))
            ops.append(_text(line, x, cursor[0], fitted, kind, baseline="top"))
            cursor[0] += size * LINE + after

    if max_w > 10:
        title = _first_words(data.get("product_title"), 15)
        if title:
            lines, rest = _take_lines(title.split(" "), main, "bold", max_w, 2)
            put(lines, main, "bold", sy(2))
            if rest:
                put(_take_lines(rest, sub, "regular", max_w, 2)[0], sub, "regular", sy(2))
        brand = _first_words(data.get("product_brand"), 6)
        if brand:
            put(_take_lines(brand.split(" "), meta, "regular", max_w, 1)[0], meta, "regular", sy(1))

    lw = min(right_w, math.floor(logo_h * LOGO_ASPECT))
    lh = math.floor(lw / LOGO_ASPECT)
    ops.append({"kind": "logo", "x": right_x + (right_w - lw) // 2,
                "y": min(h - logo_h + (logo_h - lh) // 2, h - 2 - lh), "w": lw, "h": lh})
    return ops + _border(w, h)


PERKS_HEADER = "THRIFT+ PERKS"
STRIP_RETURNS = "3-DAY RETURNS WITH THRIFT+"
STRIP_AS_IS = "AS IS  ·  NO RETURNS"
_MIN_QR_DOTS = 3


def perks_price(text, include: bool = True) -> str | None:
    price = parse_price(text) if include else None
    if not price:
        return None
    return f"${price[0]}" if price[1] == ".00" else f"${price[0]}{price[1]}"


def _header_lines(max_w: float, max_h: float):
    one = fit_size(PERKS_HEADER, max_w, max_h * 0.62, 5, "black")
    two_start = math.floor(max_h * 0.86 / (2 * LINE))
    two = min(fit_size("THRIFT+", max_w, two_start, 5, "black"), fit_size("PERKS", max_w, two_start, 5, "black"))
    return (["THRIFT+", "PERKS"], two) if two >= one * 1.25 else ([PERKS_HEADER], one)


def layout_perks_tag(data: dict, w: int, h: int, dpi: int) -> list[dict]:
    """The Thrift+ Perks tag (port of perksTag.ts, 457 x 254 reference)."""
    sx, sy = w / 457, h / 254
    fs = min(sx, sy)

    def px(n, minimum=1):
        return max(minimum, _r(n * fs))

    min_regular = _r(0.064 * dpi)
    min_bold = _r(0.058 * dpi)
    as_is = data.get("as_is") is True
    sku = str(data.get("qr_data") or "")
    ops = [_rect(0, 0, w, h, "paper")]

    strip_h = max(12, _r(38 * sy))  # 30 dots at 1.5 x 1: room for the QR at 4 dots a module
    body_h = h - strip_h
    ops.append(_rect(0, body_h, w, strip_h))
    strip_text = STRIP_AS_IS if as_is else STRIP_RETURNS
    strip_size = fit_size(strip_text, w - px(30, 6), min(24 * fs, strip_h * 0.62), 6, "bold")
    ops.append(_text(strip_text, w / 2, body_h + strip_h / 2, strip_size, "bold", "paper", "center"))

    split = _r(284 / 457 * w)
    right_w = w - split
    rcx = split + right_w / 2
    header_h = max(10, _r(40 / 212 * body_h))
    ops.append(_rect(split, 0, right_w, header_h))
    lines, hsize = _header_lines(right_w - px(16, 4), header_h)
    header_top = header_h / 2 - ((len(lines) - 1) * hsize * LINE) / 2
    for i, line in enumerate(lines):
        ops.append(_text(line, rcx, header_top + i * hsize * LINE, hsize, "black", "paper", "center"))
    ops.append({"kind": "line", "x1": split, "y1": header_h, "x2": split, "y2": body_h, "width": px(2)})

    qr_data = tag_link(sku)
    qr_need = (qr_modules(qr_data, "M") + 2) * _MIN_QR_DOTS
    # The QR draws its own one-module quiet zone, so the column keeps only a thin margin (1.5 x 1 needs every dot).
    m = px(4, 2)
    area_top = header_h + m
    area_h = body_h - m - area_top
    qr_wide = right_w - 2 * m
    p_size = px(17, min_bold)
    promise = ["Lower price", "with Thrift+"] if as_is else ["Lower price", "+ easy returns"]

    def block(size, n):
        return n * size * LINE + px(4) if n else 0

    def qr_for(size, n):
        return min(qr_wide, area_h - block(size, n))

    while p_size > min_bold and qr_for(p_size, 2) < qr_need:
        p_size -= 1
    if qr_for(p_size, 2) < qr_need:
        promise = []
    for line in promise:
        p_size = min(p_size, fit_size(line, qr_wide, p_size, min_bold, "bold"))
    qr = max(1, math.floor(qr_for(p_size, len(promise))))
    group_h = qr + block(p_size, len(promise))
    qr_y = _r(area_top + max(0, (area_h - group_h) / 2))
    ops.append({"kind": "qr", "data": qr_data, "x": _r(rcx - qr / 2), "y": qr_y, "size": qr,
                "ecc": qr_ecc_for(qr_data, qr)})
    for i, line in enumerate(promise):
        ops.append(_text(line, rcx, qr_y + qr + px(4) + i * p_size * LINE, p_size, "bold", "ink", "center", "top"))

    x = px(12, 3)
    max_w = split - 2 * x
    y = max(1, _r(6 * sy))
    retail = str(data.get("retail_text") or "").strip()[:24]
    if retail:
        size = fit_size(retail, max_w, px(20, min_regular), min_regular, "regular")
        ops.append(_text(retail, x, y, size, "regular", baseline="top"))
        tw = min(max_w, measure(retail, size, "regular"))
        ops.append({"kind": "line", "x1": x - px(2), "y1": _r(y + size * 0.42), "x2": x + tw + px(2),
                    "y2": _r(y + size * 0.42), "width": px(2)})
        y += size * LINE + _r(2 * sy)
    our = px(16, min_bold)
    ops.append(_text("OUR PRICE", x, y, our, "bold", baseline="top"))
    y += our * LINE + _r(2 * sy)

    bottom = body_h - max(1, _r(6 * sy))
    sku_size = px(15, min_regular)
    ops.append(_text(sku, x, bottom, sku_size, "regular", baseline="bottom"))
    bottom -= sku_size * LINE + _r(2 * sy)
    title = str(data.get("product_title") or "").strip()
    title_lines: list[tuple[str, int, str]] = []
    if title:
        t1, t2 = px(18, min_bold), px(16, min_regular)
        words = title.split()
        n = 1
        while n < len(words) and measure(" ".join(words[: n + 1]), t1, "bold") <= max_w:
            n += 1
        first = " ".join(words[:n])
        title_lines.append((first, min(t1, fit_size(first, max_w, t1, min_bold, "bold")), "bold"))
        if n < len(words):
            rest = wrap_words(" ".join(words[n:]), t2, "regular", max_w, 1)
            title_lines.append((rest[0] if rest else "", t2, "regular"))
    for text, size, kind in reversed(title_lines):
        ops.append(_text(text, x, bottom, size, kind, baseline="bottom"))
        bottom -= size * LINE

    gap = _r(3 * sy)
    price_h = bottom - gap - (y + gap)
    price_text = perks_price(data.get("text"), data.get("include_text") is not False) or "N/A"
    by_height = math.floor(price_h / 0.92)
    size = fit_size(price_text, max_w, min(by_height, _r(80 * fs * 1.15)), 8, "black")
    baseline = y + gap + (price_h + size * CAP) / 2
    ops.append(_text(price_text, x, baseline, size, "black", baseline="alphabetic"))
    return ops + _border(w, h)


@lru_cache(maxsize=1)
def _logo() -> Image.Image | None:
    path = _assets_dir() / "ecothrift_logo_bw.png"
    return Image.open(path).convert("L") if path.is_file() else None


def _box(x: float, y: float, w: float, h: float):
    x0, y0, x1, y1 = _r(x), _r(y), _r(x + w), _r(y + h)
    return x0, y0, max(x1, x0 + 1) - 1, max(y1, y0 + 1) - 1


def _text_place(op: dict):
    """The font, the (x, baseline) origin and the PIL anchor for a text op (canvas baselines: top / middle / bottom
    of the em box, or the alphabetic baseline)."""
    font = _font_for(op["font"], _r(op["size"]))
    ascent, descent = font.getmetrics()
    base, y = op["baseline"], op["y"]
    baseline_y = (y + ascent if base == "top" else y - descent if base == "bottom"
                  else y if base == "alphabetic" else y + (ascent - descent) / 2)
    return font, (op["x"], baseline_y), {"left": "ls", "center": "ms", "right": "rs"}[op["align"]]


def text_bounds(op: dict) -> tuple[float, float, float, float]:
    """Where the ink of a text op lands (left, top, right, bottom), for tests."""
    font, origin, anchor = _text_place(op)
    return _MEASURE_DRAW.textbbox(origin, op["text"], font=font, anchor=anchor)


def _paint_ops(ops: list[dict], w: int, h: int) -> Image.Image:
    img = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(img)
    for op in ops:
        kind = op["kind"]
        if kind == "rect":
            d.rectangle(_box(op["x"], op["y"], op["w"], op["h"]), fill=0 if op["fill"] == "ink" else 255)
        elif kind == "line":
            if op["y1"] == op["y2"]:
                d.rectangle(_box(op["x1"], op["y1"] - op["width"] / 2, op["x2"] - op["x1"], op["width"]), fill=0)
            else:
                d.rectangle(_box(op["x1"] - op["width"] / 2, op["y1"], op["width"], op["y2"] - op["y1"]), fill=0)
        elif kind == "text":
            font, origin, anchor = _text_place(op)
            d.text(origin, op["text"], font=font, fill=0 if op["fill"] == "ink" else 255, anchor=anchor)
        elif kind == "logo":
            logo = _logo()
            if logo is not None and op["w"] > 0 and op["h"] > 0:
                img.paste(logo.resize((op["w"], op["h"]), Image.LANCZOS), (op["x"], op["y"]))
        elif kind == "qr":
            matrix = qr_matrix(op["data"], op.get("ecc", "H"))
            n = len(matrix)
            cell = max(1, op["size"] // (n + 2))
            side = cell * (n + 2)
            ox = op["x"] + (op["size"] - side) // 2
            oy = op["y"] + (op["size"] - side) // 2
            d.rectangle([op["x"], op["y"], op["x"] + op["size"] - 1, op["y"] + op["size"] - 1], fill=255)
            for r, row in enumerate(matrix):
                for c, on in enumerate(row):
                    if on:
                        px0, py0 = ox + (c + 1) * cell, oy + (r + 1) * cell
                        d.rectangle([px0, py0, px0 + cell - 1, py0 + cell - 1], fill=0)
    return img.point(lambda v: 0 if v < _SNAP else 255)


def draw_price_tag(data: dict, w_in: float, h_in: float, dpi: int) -> Image.Image:
    """The Classic side-stripe price tag at the size Dash sends."""
    w, h = max(1, round(w_in * dpi)), max(1, round(h_in * dpi))
    return _paint_ops(layout_price_tag(data, w, h), w, h)


def draw_perks_tag(data: dict, w_in: float, h_in: float, dpi: int) -> Image.Image:
    """The Thrift+ Perks price tag at the size Dash sends (``as_is`` picks the strip)."""
    w, h = max(1, round(w_in * dpi)), max(1, round(h_in * dpi))
    return _paint_ops(layout_perks_tag(data, w, h, dpi), w, h)
