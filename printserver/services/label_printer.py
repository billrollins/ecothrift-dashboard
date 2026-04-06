"""Generate and print barcode/QR labels — Side Stripe variant: price + QR in column 1; copy + logo in column 2."""

from __future__ import annotations

import logging
import re
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any

import qrcode
from PIL import Image, ImageDraw, ImageFont

from config import DEFAULT_LABEL_SIZE_PRESET, LABEL_DPI, LABEL_SIZE_PRESETS

if TYPE_CHECKING:
    from models import LabelPrintRequest

logger = logging.getLogger(__name__)

# Reference canvas from original consultant spec (scaling ratios).
REF_W = 305
REF_H = 203

# Title / brand scaled by fs (see generate_label). Slightly larger — copy is clipped to a few words.
TEXT_TITLE_MAIN = 28
TEXT_TITLE_SUB = 22
TEXT_META = 20

# Right column: only leading words (full detail is in QR / POS).
TITLE_MAX_WORDS = 15
TITLE_BOLD_MAX_LINES = 2
TITLE_SUB_MAX_LINES = 2
BRAND_MAX_WORDS = 6
BRAND_MAX_LINES = 1

# Price stripe: try scales 1.0 → 0.5 step 0.01; int(font sizes) may plateau across steps.
_PRICE_SCALE_STEPS = tuple(round(1.0 - i * 0.01, 2) for i in range(51))

# Single lime/chartreuse for green stock: price ink on black band + preview paper tint (same hue).
GREEN_LABEL_STOCK = (200, 228, 130)


def _assets_dir() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass) / "assets"
        return Path(sys.executable).parent / "assets"
    return Path(__file__).resolve().parent.parent / "assets"


def _font_bold(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for family in ("arialbd.ttf", "DejaVuSans-Bold.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(family, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _font_regular(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for family in ("arial.ttf", "DejaVuSans.ttf", "arialbd.ttf"):
        try:
            return ImageFont.truetype(family, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _label_dimensions_px(label_size_preset: str | None = None) -> tuple[int, int, str]:
    from services import settings_store

    if label_size_preset and label_size_preset in LABEL_SIZE_PRESETS:
        preset = label_size_preset
    else:
        preset = settings_store.get("label_size_preset") or DEFAULT_LABEL_SIZE_PRESET
        if preset not in LABEL_SIZE_PRESETS:
            preset = DEFAULT_LABEL_SIZE_PRESET
    w_in, h_in = LABEL_SIZE_PRESETS[preset]
    return int(w_in * LABEL_DPI), int(h_in * LABEL_DPI), preset


def _scale_fs(w_px: int, h_px: int) -> float:
    return min(w_px / REF_W, h_px / REF_H)


def _sy(y: float, h_px: int) -> int:
    return max(1, round(y * h_px / REF_H))


def _parse_price_stripe(raw: str) -> tuple[str | None, str | None, bool]:
    """Return (dollars display with thousands commas, cents like ``.99``, ok)."""
    s = (raw or "").strip()
    s = re.sub(r"^\$", "", s).strip()
    if not s or s.upper() == "N/A" or s == "—":
        return None, None, False
    try:
        if "." in s:
            a, b = s.split(".", 1)
            digits_only = "".join(c for c in a if c.isdigit())
            if not digits_only:
                digits_only = "0"
            frac = "".join(c for c in b if c.isdigit())[:2].ljust(2, "0")[:2]
            display = f"{int(digits_only):,}"
            return display, f".{frac}", True
        digits_only = "".join(c for c in s if c.isdigit())
        if not digits_only:
            return None, None, False
        display = f"{int(digits_only):,}"
        return display, ".00", True
    except Exception:
        return None, None, False


def _dollar_digit_count(dollars_display: str) -> int:
    return len(re.sub(r"\D", "", dollars_display))


def _whole_dollars_int(dollars_display: str) -> int:
    """Integer part of the dollars field (commas stripped)."""
    return int(re.sub(r"\D", "", dollars_display) or "0")


def _draw_price_zero_whole_block(
    draw: ImageDraw.ImageDraw,
    col1_w: int,
    price_blk_h: int,
    pad_x: int,
    pad_y: int,
    gap: int,
    fs: float,
    cents: str,
    price_fit_stats: dict[str, Any] | None,
    *,
    price_text_fill: int | tuple[int, int, int],
) -> None:
    """Black band: ``$`` top-left; **cents only** (hero) bottom-right — no whole-dollar digit line."""
    sym = "$"
    cx = col1_w - pad_x
    cy = price_blk_h - pad_y
    chosen_scale: float | None = None
    big_cents = 48
    font_dollar: ImageFont.FreeTypeFont | ImageFont.ImageFont
    font_cents: ImageFont.FreeTypeFont | ImageFont.ImageFont

    for scale in _PRICE_SCALE_STEPS:
        d_sz = max(12, int(28 * fs * scale))
        c_sz = max(9, int(big_cents * fs * scale))
        font_dollar = _font_bold(d_sz)
        font_cents = _font_bold(c_sz)
        w_sym = _text_width(draw, sym, font_dollar)
        w_c = _text_width(draw, cents, font_cents)
        sym_bb = draw.textbbox((pad_x, pad_y), sym, font=font_dollar, anchor="lt")
        sym_bottom = sym_bb[3]
        cents_bb = draw.textbbox((cx, cy), cents, font=font_cents, anchor="rb")
        cents_top = cents_bb[1]
        cents_left = cx - w_c
        fits_width = pad_x + w_sym + gap <= cents_left
        fits_vertical = sym_bottom + gap <= cents_top and cents_top >= pad_y
        if fits_width and fits_vertical:
            chosen_scale = scale
            break
    else:
        chosen_scale = None
        d_sz = max(10, int(22 * fs))
        c_sz = max(9, int(24 * fs))
        font_dollar = _font_bold(d_sz)
        font_cents = _font_bold(c_sz)

    if price_fit_stats is not None:
        price_fit_stats["first_fit_scale"] = chosen_scale
        price_fit_stats["used_fallback"] = chosen_scale is None

    draw.text((pad_x, pad_y), sym, font=font_dollar, fill=price_text_fill, anchor="lt")
    draw.text((cx, cy), cents, font=font_cents, fill=price_text_fill, anchor="rb")


def _make_qr(data: str, box_px: int) -> Image.Image:
    """Plain QR, error correction H; grayscale for thermal (no center logo)."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=4,
        border=1,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("L")
    return img.resize((box_px, box_px), Image.NEAREST)


def _load_logo_bw_contain(max_w: int, max_h: int) -> Image.Image | None:
    """Legacy full logo: uniform scale to fit ``max_w`` × ``max_h``."""
    path = _assets_dir() / "ecothrift_logo_bw.png"
    if not path.is_file():
        return None
    try:
        im = Image.open(path).convert("L")
        w, h = im.size
        if w <= 0 or h <= 0:
            return None
        scale = min(max_w / w, max_h / h)
        nw = max(1, int(w * scale))
        nh = max(1, int(h * scale))
        return im.resize((nw, nh), Image.NEAREST)
    except Exception as exc:
        logger.warning("Logo load failed: %s", exc)
        return None


def _wrap_words_to_lines(
    draw: ImageDraw.ImageDraw,
    words: list[str],
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    max_width: int,
    max_lines: int,
) -> tuple[list[str], list[str]]:
    lines: list[str] = []
    cur = ""
    i = 0
    while i < len(words) and len(lines) < max_lines:
        w = words[i]
        test = f"{cur} {w}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            cur = test
            i += 1
        else:
            if cur:
                lines.append(cur)
                cur = ""
            else:
                lines.append(w)
                i += 1
    if cur and len(lines) < max_lines:
        lines.append(cur)
    return lines, words[i:]


def _wrap_lines(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    max_width: int,
    max_lines: int,
) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
                if len(lines) >= max_lines:
                    return lines
            current = word
    if current and len(lines) < max_lines:
        lines.append(current)
    return lines[:max_lines]


def _text_width(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
) -> int:
    b = draw.textbbox((0, 0), text, font=font)
    return b[2] - b[0]


def _bbox_height(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
) -> int:
    b = draw.textbbox((0, 0), text, font=font)
    return b[3] - b[1]


def _first_words(text: str, max_words: int) -> str:
    """First ``max_words`` words only; ellipsis if truncated (readable shelf label, not full catalog copy)."""
    if not text or max_words <= 0:
        return ""
    words = text.split()
    if len(words) <= max_words:
        return text.strip()
    return " ".join(words[:max_words]) + "\u2026"


def _draw_price_block(
    draw: ImageDraw.ImageDraw,
    col1_w: int,
    price_blk_h: int,
    req: LabelPrintRequest,
    fs: float,
    price_fit_stats: dict[str, Any] | None = None,
    *,
    band_fill: int | tuple[int, int, int],
    price_text_fill: int | tuple[int, int, int],
) -> None:
    """Black band with **white** (thermal) or **green** (``GREEN_LABEL_STOCK``) price glyphs.

    When whole dollars are **0**, only ``$`` + cents are drawn (no middle ``0`` line). No SKU.
    """
    draw.rectangle((0, 0, col1_w, price_blk_h), fill=band_fill)
    pad_x = max(2, col1_w // 36)
    pad_y = max(1, col1_w // 48)
    # Large dollar digits: left-aligned but inset past the band edge (and past the $ glyph).
    dollar_digits_inset = max(3, col1_w // 22)
    dollars_x = pad_x + dollar_digits_inset
    usable_w = col1_w - 2 * pad_x
    usable_h = price_blk_h - 2 * pad_y
    gap = max(1, int(1.0 * fs))

    def center_x(text: str, font: ImageFont.FreeTypeFont | ImageFont.ImageFont) -> int:
        tw = _text_width(draw, text, font)
        return (col1_w - tw) // 2

    def draw_centered_line(
        text: str,
        font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
        y: int,
    ) -> int:
        x = center_x(text, font)
        draw.text((x, y), text, font=font, fill=price_text_fill, anchor="lt")
        b = draw.textbbox((x, y), text, font=font, anchor="lt")
        return b[3]

    if not req.include_text:
        na = _font_bold(max(10, int(TEXT_TITLE_MAIN * fs)))
        t = "N/A"
        h = _bbox_height(draw, t, na)
        y = pad_y + max(0, (usable_h - h) // 2)
        draw_centered_line(t, na, y)
        if price_fit_stats is not None:
            price_fit_stats["first_fit_scale"] = None
            price_fit_stats["used_fallback"] = False
        return

    dollars, cents, ok = _parse_price_stripe(req.text)
    if not ok:
        na = _font_bold(max(10, int(TEXT_TITLE_MAIN * fs)))
        t = "N/A"
        h = _bbox_height(draw, t, na)
        y = pad_y + max(0, (usable_h - h) // 2)
        draw_centered_line(t, na, y)
        if price_fit_stats is not None:
            price_fit_stats["first_fit_scale"] = None
            price_fit_stats["used_fallback"] = False
        return

    assert dollars is not None and cents is not None
    if _whole_dollars_int(dollars) == 0:
        _draw_price_zero_whole_block(
            draw,
            col1_w,
            price_blk_h,
            pad_x,
            pad_y,
            gap,
            fs,
            cents,
            price_fit_stats,
            price_text_fill=price_text_fill,
        )
        return

    sym = "$"
    nd = _dollar_digit_count(dollars)
    # Tiers tuned so first_fit_scale stays near 1.0 on 1.5×1 for long comma-formatted strings.
    if nd <= 2:
        big_base = 48
    elif nd <= 3:
        big_base = 42
    elif nd <= 4:
        big_base = 37
    elif nd <= 5:
        big_base = 35
    elif nd <= 6:
        big_base = 26
    elif nd <= 7:
        big_base = 20
    else:
        big_base = 18

    # Smaller ``$`` (top-left); larger dollar line + cents; dollar line fills vertical gap, left at pad_x.
    chosen_scale: float | None = None
    for scale in _PRICE_SCALE_STEPS:
        d_sz = max(12, int(28 * fs * scale))
        b_sz = max(9, int(big_base * fs * scale))
        c_sz = max(9, int(28 * fs * scale))
        font_dollar = _font_bold(d_sz)
        font_big = _font_bold(b_sz)
        font_cents = _font_bold(c_sz)
        h_d = _bbox_height(draw, dollars, font_big)
        w_d = _text_width(draw, dollars, font_big)

        sym_bb = draw.textbbox((pad_x, pad_y), sym, font=font_dollar, anchor="lt")
        sym_bottom = sym_bb[3]
        cx = col1_w - pad_x
        cy = price_blk_h - pad_y
        cents_bb = draw.textbbox((cx, cy), cents, font=font_cents, anchor="rb")
        cents_top = cents_bb[1]

        mid_top = sym_bottom + gap
        mid_bottom = cents_top - gap
        mid_h = mid_bottom - mid_top
        fits_width = dollars_x + w_d <= col1_w - pad_x
        fits_middle = mid_h >= h_d and mid_top < mid_bottom and sym_bottom < cents_top
        if fits_width and fits_middle:
            chosen_scale = scale
            break
    else:
        chosen_scale = None
        d_sz = max(10, int(22 * fs))
        b_sz = max(9, int(24 * fs))
        c_sz = max(9, int(24 * fs))
        font_dollar = _font_bold(d_sz)
        font_big = _font_bold(b_sz)
        font_cents = _font_bold(c_sz)
        h_d = _bbox_height(draw, dollars, font_big)
        w_d = _text_width(draw, dollars, font_big)
        sym_bb = draw.textbbox((pad_x, pad_y), sym, font=font_dollar, anchor="lt")
        sym_bottom = sym_bb[3]
        cx = col1_w - pad_x
        cy = price_blk_h - pad_y
        cents_bb = draw.textbbox((cx, cy), cents, font=font_cents, anchor="rb")
        cents_top = cents_bb[1]
        mid_top = sym_bottom + gap
        mid_bottom = cents_top - gap
        mid_h = mid_bottom - mid_top

    if price_fit_stats is not None:
        price_fit_stats["first_fit_scale"] = chosen_scale
        price_fit_stats["used_fallback"] = chosen_scale is None

    cx = col1_w - pad_x
    cy = price_blk_h - pad_y
    sym_bb = draw.textbbox((pad_x, pad_y), sym, font=font_dollar, anchor="lt")
    sym_bottom = sym_bb[3]
    cents_bb = draw.textbbox((cx, cy), cents, font=font_cents, anchor="rb")
    cents_top = cents_bb[1]
    mid_top = sym_bottom + gap
    mid_bottom = cents_top - gap
    mid_h = mid_bottom - mid_top
    y_dollar = mid_top + max(0, (mid_h - h_d) // 2)
    draw.text((pad_x, pad_y), sym, font=font_dollar, fill=price_text_fill, anchor="lt")
    draw.text((dollars_x, y_dollar), dollars, font=font_big, fill=price_text_fill, anchor="lt")
    draw.text((cx, cy), cents, font=font_cents, fill=price_text_fill, anchor="rb")


def generate_label(
    req: LabelPrintRequest,
    *,
    label_size_preset: str | None = None,
    price_fit_stats: dict[str, Any] | None = None,
) -> Image.Image:
    """Two columns: (1) **⅓** width — top **half** price, bottom **half** QR; (2) **⅔** text + logo.

    Same *proportions* for ``3x2`` and ``1.5x1`` (3:2 aspect): one code path; small stock is half-scale via ``fs``.
    QR target is derived from stripe width (same relative size on both presets), clamped to the lower cell.

    If ``price_fit_stats`` is a dict, it is filled with ``first_fit_scale`` (``float`` or ``None``) and
    ``used_fallback`` (``bool``) for the price stripe fit (ignored for N/A / no-text rows).

    ``req.green_label_stock``: colored stock — **black** price band, **green** price text (RGB); title/QR black on white.

    Default mode is grayscale (``L``) only. Green-stock mode uses ``RGB`` for the price color.
    """
    w_px, h_px, _ = _label_dimensions_px(label_size_preset)
    fs = _scale_fs(w_px, h_px)

    green_stock = bool(req.green_label_stock)
    if green_stock:
        label = Image.new("RGB", (w_px, h_px), (255, 255, 255))
        band_fill: int | tuple[int, int, int] = (0, 0, 0)
        price_text_fill: int | tuple[int, int, int] = GREEN_LABEL_STOCK
        ink: int | tuple[int, int, int] = (0, 0, 0)
    else:
        label = Image.new("L", (w_px, h_px), 255)
        band_fill = 0
        price_text_fill = 255
        ink = 0

    draw = ImageDraw.Draw(label)

    # Column 1: exactly one third of label width; column 2 gets the remainder (≈⅔ minus gap/margins).
    col1_w = max(1, w_px // 3)
    col_gap = max(1, int(3 * w_px / REF_W))
    right_x = col1_w + col_gap
    margin_r = max(1, int(4 * w_px / REF_W))
    right_w = w_px - right_x - margin_r

    # Left column: top half = price band, bottom half = QR (equal heights).
    price_blk_h = h_px // 2
    qr_area_h = h_px - price_blk_h

    _draw_price_block(
        draw,
        col1_w,
        price_blk_h,
        req,
        fs,
        price_fit_stats,
        band_fill=band_fill,
        price_text_fill=price_text_fill,
    )

    # Same layout on 3×2 and 1.5×1: target QR side ~ full stripe width (matches former 1″ / 0.5″ at 203 DPI).
    qr_target_px = max(24, int(round(col1_w * 0.98)))
    inner_m = max(2, int(4 * min(fs, 1.35)))
    qr_inner_w = max(16, col1_w - 2 * inner_m)
    qr_inner_h = max(16, qr_area_h - 2 * inner_m)
    qr_size = max(24, min(qr_target_px, qr_inner_w, qr_inner_h))
    qr_img = _make_qr(req.qr_data, qr_size)
    if green_stock:
        qr_img = qr_img.convert("RGB")
    qx = (col1_w - qr_size) // 2
    qy = price_blk_h + (qr_area_h - qr_size) // 2
    label.paste(qr_img, (qx, qy))

    # Column divider
    draw.line((col1_w, 0, col1_w, h_px - 1), fill=ink, width=1)

    # --- Right column (≈⅔): text upper band, legacy BW logo band at bottom ---
    text_margin = max(1, int(3 * min(fs, 1.35)))
    logo_zone_h = max(_sy(28, h_px), int(h_px * 0.26))
    text_bottom = h_px - logo_zone_h
    x_text = right_x + text_margin
    text_max_w = right_w - 2 * text_margin

    title_main = _font_bold(max(10, int(TEXT_TITLE_MAIN * fs)))
    title_sub = _font_regular(max(8, int(TEXT_TITLE_SUB * fs)))
    meta_font = _font_regular(max(8, int(TEXT_META * fs)))

    y_t = max(1, _sy(1, h_px))
    title_text = _first_words((req.product_title or "").strip(), TITLE_MAX_WORDS)
    brand_text = _first_words((req.product_brand or "").strip(), BRAND_MAX_WORDS)
    # `product_model` / SKU not printed — remains in QR (`qr_data`).

    if text_max_w > 10:

        def _draw_lines(lines: list[str], font: ImageFont.FreeTypeFont | ImageFont.ImageFont) -> None:
            nonlocal y_t
            for line in lines:
                if y_t >= text_bottom - 2:
                    return
                draw.text((x_text, y_t), line, font=font, fill=ink)
                y_t += draw.textbbox((0, 0), line, font=font)[3] + max(1, _sy(2, h_px))

        if title_text:
            tw = title_text.split()
            bold_part, rest_w = _wrap_words_to_lines(
                draw, tw, title_main, text_max_w, TITLE_BOLD_MAX_LINES
            )
            _draw_lines(bold_part, title_main)
            if rest_w and y_t < text_bottom:
                sub_lines, _ = _wrap_words_to_lines(
                    draw, rest_w, title_sub, text_max_w, TITLE_SUB_MAX_LINES
                )
                _draw_lines(sub_lines, title_sub)

        if brand_text and y_t < text_bottom:
            for line in _wrap_lines(draw, brand_text, meta_font, text_max_w, BRAND_MAX_LINES):
                if y_t >= text_bottom - 2:
                    break
                draw.text((x_text, y_t), line, font=meta_font, fill=ink)
                y_t += draw.textbbox((0, 0), line, font=meta_font)[3] + max(1, _sy(1, h_px))

    # Legacy full logo: uniform scale to fit footer band; centered in band.
    logo = _load_logo_bw_contain(right_w, logo_zone_h)
    if logo:
        if green_stock:
            logo = logo.convert("RGB")
        lx = right_x + (right_w - logo.width) // 2
        ly = h_px - logo_zone_h + (logo_zone_h - logo.height) // 2
        ly = min(ly, h_px - 2 - logo.height)
        label.paste(logo, (lx, ly))

    draw.rectangle((0, 0, w_px - 1, h_px - 1), outline=ink, width=1)

    return label


def _near_green_label_stock(r: int, gch: int, b: int) -> bool:
    """True if pixel matches ``GREEN_LABEL_STOCK`` (price text on black)."""
    gr, gg, gb = GREEN_LABEL_STOCK
    dr, dg, db = r - gr, gch - gg, b - gb
    return dr * dr + dg * dg + db * db <= 55 * 55


def rgb_green_stock_preview(img: Image.Image) -> Image.Image:
    """Simulate stock: paper (white) → ``GREEN_LABEL_STOCK``; preserve black and same-green price ink."""
    gr, gg, gb = GREEN_LABEL_STOCK

    if img.mode == "L":
        w, h = img.size
        out = Image.new("RGB", (w, h))
        px = img.load()
        op = out.load()
        for y in range(h):
            for x in range(w):
                v = px[x, y]
                ink = (255 - v) / 255.0
                op[x, y] = (
                    int(gr * (1.0 - ink)),
                    int(gg * (1.0 - ink)),
                    int(gb * (1.0 - ink)),
                )
        return out

    img = img.convert("RGB")
    w, h = img.size
    out = Image.new("RGB", (w, h))
    px = img.load()
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, gch, b = px[x, y]
            lum = 0.299 * r + 0.587 * gch + 0.114 * b
            if _near_green_label_stock(r, gch, b):
                op[x, y] = (r, gch, b)
            elif lum > 250:
                op[x, y] = GREEN_LABEL_STOCK
            elif lum < 22:
                op[x, y] = (0, 0, 0)
            else:
                ink_amt = (255.0 - lum) / 255.0
                op[x, y] = (
                    int(gr * (1.0 - ink_amt)),
                    int(gg * (1.0 - ink_amt)),
                    int(gb * (1.0 - ink_amt)),
                )
    return out


def generate_test_label() -> Image.Image:
    from label_test_data import SAMPLE_LABEL_ROWS
    from models import LabelPrintRequest

    row = SAMPLE_LABEL_ROWS[0]
    return generate_label(
        LabelPrintRequest(
            text=row["text"],
            qr_data=row["qr_data"],
            include_text=True,
            product_title=row["product_title"],
            product_brand=row.get("product_brand"),
            product_model=row.get("product_model"),
        )
    )


def generate_customer_info_test_label(*, label_size_preset: str | None = None, green_stock_preview: bool = False) -> Image.Image:
    """Green-stock sample (``CUSTOMER_INFO_TEST_ROW``); optional paper-color preview PNG."""
    from label_test_data import CUSTOMER_INFO_TEST_ROW
    from models import LabelPrintRequest

    row = CUSTOMER_INFO_TEST_ROW
    img = generate_label(
        LabelPrintRequest(
            text=row["text"],
            qr_data=row["qr_data"],
            include_text=True,
            product_title=row["product_title"],
            product_brand=row.get("product_brand"),
            product_model=row.get("product_model"),
            green_label_stock=True,
        ),
        label_size_preset=label_size_preset,
    )
    if green_stock_preview:
        return rgb_green_stock_preview(img)
    return img
