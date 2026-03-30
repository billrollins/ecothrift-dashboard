"""Receipt formatting — ESC/POS for thermal printers, plain-text for GDI."""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from config import RECEIPT_WIDTH_CHARS

# ---------------------------------------------------------------------------
# ESC/POS constants
# ---------------------------------------------------------------------------
ESC = b"\x1b"
GS = b"\x1d"

INIT = ESC + b"@"
BOLD_ON = ESC + b"E\x01"
BOLD_OFF = ESC + b"E\x00"
CENTER = ESC + b"a\x01"
LEFT = ESC + b"a\x00"
RIGHT = ESC + b"a\x02"
DOUBLE_HEIGHT = ESC + b"!\x10"
DOUBLE_WIDTH = ESC + b"!\x20"
DOUBLE_HW = ESC + b"!\x30"
NORMAL = ESC + b"!\x00"
UNDERLINE_ON = ESC + b"-\x01"
UNDERLINE_OFF = ESC + b"-\x00"
FEED_LINES = lambda n: ESC + b"d" + bytes([n])  # noqa: E731
CUT_PAPER = GS + b"V\x00"
PARTIAL_CUT = GS + b"V\x01"

W = RECEIPT_WIDTH_CHARS

logger = logging.getLogger(__name__)

# After footer + optional address (GDI + ESC/POS + PNG policy body).
RECEIPT_POLICY_LINES: tuple[str, ...] = (
    "All sales are final. No refunds or exchanges.",
    "Merchandise is used or donated, sold AS-IS. Inspect before you buy.",
)

# Large type on PNG policy card only (print uses RECEIPT_POLICY_LINES).
RECEIPT_POLICY_PNG_HEADLINE = "NO REFUNDS"
RECEIPT_POLICY_PNG_SUB = "ALL SALES FINAL — AS-IS"


def _encode(text: str) -> bytes:
    return text.encode("cp437", errors="replace")


def _line(text: str = "") -> bytes:
    return _encode(text) + b"\n"


def _separator(char: str = "-") -> bytes:
    return _line(char * W)


def _lr(left: str, right: str) -> bytes:
    """Left-right aligned line within receipt width."""
    gap = W - len(left) - len(right)
    if gap < 1:
        left = left[: W - len(right) - 1]
        gap = 1
    return _line(f"{left}{' ' * gap}{right}")


def _center_text(text: str) -> bytes:
    return CENTER + _line(text) + LEFT


def format_receipt(data: dict[str, Any]) -> bytes:
    """Build a complete ESC/POS byte stream from receipt_data.

    Header: ``store_name``, optional ``store_phone`` / ``store_hours`` (no street
    address). ``store_address`` prints after ``footer``, then two policy lines
    (``RECEIPT_POLICY_LINES``).
    """
    buf = bytearray(INIT)

    # --- Store header (no street address here) ---
    buf += CENTER + DOUBLE_HW + BOLD_ON
    buf += _line(data.get("store_name", "Eco-Thrift"))
    buf += NORMAL + BOLD_OFF
    buf += LEFT
    if data.get("store_phone"):
        buf += _lr("Phone:", str(data["store_phone"]).strip())
    if data.get("store_hours"):
        buf += _line("Hours:")
        for part in str(data["store_hours"]).split("\n"):
            if part.strip():
                buf += _line(f"  {part.strip()}")
    buf += _separator("=")

    # --- Receipt meta ---
    if data.get("receipt_number"):
        buf += _lr("Receipt:", data["receipt_number"])
    if data.get("date"):
        time_str = data.get("time", "")
        buf += _lr("Date:", f"{data['date']} {time_str}".strip())
    if data.get("cashier"):
        buf += _lr("Cashier:", data["cashier"])
    buf += _separator()

    # --- Line items ---
    items: list[dict[str, Any]] = data.get("items", [])
    for item in items:
        name = item.get("name", "Item")
        qty = item.get("quantity", 1)
        unit = item.get("unit_price", 0)
        total = item.get("line_total", qty * unit)
        if qty > 1:
            buf += _line(name)
            buf += _lr(f"  {qty} x ${unit:.2f}", f"${total:.2f}")
        else:
            buf += _lr(name, f"${total:.2f}")

    buf += _separator()

    if data.get("you_saved") is not None:
        try:
            ys = float(data["you_saved"])
            buf += _lr("You saved", f"${ys:.2f}")
        except (TypeError, ValueError):
            pass

    # --- Totals ---
    subtotal = data.get("subtotal", 0)
    tax = data.get("tax", 0)
    total = data.get("total", subtotal + tax)
    buf += _lr("Subtotal", f"${subtotal:.2f}")
    if tax:
        buf += _lr("Tax", f"${tax:.2f}")
    buf += BOLD_ON + DOUBLE_HEIGHT
    buf += _lr("TOTAL", f"${total:.2f}")
    buf += NORMAL + BOLD_OFF
    buf += _separator()

    # --- Payment ---
    if data.get("payment_method"):
        buf += _lr("Payment", data["payment_method"])
    if data.get("amount_tendered") is not None:
        buf += _lr("Tendered", f"${data['amount_tendered']:.2f}")
    if data.get("change") is not None:
        buf += _lr("Change", f"${data['change']:.2f}")

    buf += _separator("=")

    # --- Footer ---
    footer = data.get("footer", "Thank you for shopping at Eco-Thrift!")
    for part in str(footer).split("\n"):
        if part.strip():
            buf += _center_text(part.strip())

    if data.get("store_address"):
        buf += _separator("-")
        for part in str(data["store_address"]).split("\n"):
            if part.strip():
                buf += _center_text(part.strip())

    buf += _separator("-")
    for pl in RECEIPT_POLICY_LINES:
        buf += _center_text(pl)

    # --- Feed & cut ---
    buf += FEED_LINES(4)
    buf += PARTIAL_CUT

    return bytes(buf)


_TEST_DATA: dict[str, Any] = {
    "store_name": "Eco-Thrift - Canfield",
    "store_address": "8425 W Center Rd\nOmaha, NE 68124",
    "store_hours": "Wed–Sat 9–6 · Sun closed\nMon–Tue 9–6",
    "store_phone": "(402) 881-9861",
    "receipt_number": "R-TEST-001",
    "date": "2026-01-01",
    "time": "12:00 PM",
    "cashier": "Test Cashier",
    "receipt_layout": "professional",
    "items": [
        {"name": "Widget", "quantity": 2, "unit_price": 4.99, "line_total": 9.98},
        {"name": "Gadget", "quantity": 1, "unit_price": 12.50, "line_total": 12.50},
    ],
    "you_saved": 18.5,
    "subtotal": 22.48,
    "tax": 1.57,
    "total": 24.05,
    "payment_method": "Cash",
    "amount_tendered": 25.00,
    "change": 0.95,
    "footer": "Another chance for everything and everyone\nThank you for shopping Eco-Thrift",
}


def sample_receipt_dict() -> dict[str, Any]:
    """Copy of built-in sample ``receipt_data`` for PNG preview / tests."""
    return dict(_TEST_DATA)


def format_test_receipt() -> bytes:
    return format_receipt(_TEST_DATA)


# ---------------------------------------------------------------------------
# Plain-text formatter (for GDI printing on any Windows printer)
# ---------------------------------------------------------------------------

def _txt_lr(left: str, right: str) -> str:
    gap = W - len(left) - len(right)
    if gap < 1:
        left = left[: W - len(right) - 1]
        gap = 1
    return f"{left}{' ' * gap}{right}"


def format_receipt_text(data: dict[str, Any]) -> str:
    """Plain-text receipt (no ESC/POS control codes).

    Header: name, phone, optional ``store_hours``. ``store_address`` prints after
    ``footer``, then policy lines.
    """
    lines: list[str] = []

    lines.append(data.get("store_name", "Eco-Thrift").center(W))
    if data.get("store_phone"):
        lines.append(_txt_lr("Phone:", str(data["store_phone"]).strip()))
    if data.get("store_hours"):
        lines.append("Hours:")
        for part in str(data["store_hours"]).split("\n"):
            if part.strip():
                lines.append(part.strip().center(W))
    lines.append("=" * W)

    if data.get("receipt_number"):
        lines.append(_txt_lr("Receipt:", data["receipt_number"]))
    if data.get("date"):
        time_str = data.get("time", "")
        lines.append(_txt_lr("Date:", f"{data['date']} {time_str}".strip()))
    if data.get("cashier"):
        lines.append(_txt_lr("Cashier:", data["cashier"]))
    lines.append("-" * W)

    items: list[dict[str, Any]] = data.get("items", [])
    for item in items:
        name = item.get("name", "Item")
        qty = item.get("quantity", 1)
        unit = item.get("unit_price", 0)
        total = item.get("line_total", qty * unit)
        if qty > 1:
            lines.append(name)
            lines.append(_txt_lr(f"  {qty} x ${unit:.2f}", f"${total:.2f}"))
        else:
            lines.append(_txt_lr(name, f"${total:.2f}"))

    lines.append("-" * W)

    if data.get("you_saved") is not None:
        try:
            ys = float(data["you_saved"])
            lines.append(_txt_lr("You saved", f"${ys:.2f}"))
        except (TypeError, ValueError):
            pass

    subtotal = data.get("subtotal", 0)
    tax = data.get("tax", 0)
    total = data.get("total", subtotal + tax)
    lines.append(_txt_lr("Subtotal", f"${subtotal:.2f}"))
    if tax:
        lines.append(_txt_lr("Tax", f"${tax:.2f}"))
    lines.append(_txt_lr("TOTAL", f"${total:.2f}"))
    lines.append("-" * W)

    if data.get("payment_method"):
        lines.append(_txt_lr("Payment", data["payment_method"]))
    if data.get("amount_tendered") is not None:
        lines.append(_txt_lr("Tendered", f"${data['amount_tendered']:.2f}"))
    if data.get("change") is not None:
        lines.append(_txt_lr("Change", f"${data['change']:.2f}"))

    lines.append("=" * W)
    footer = data.get("footer", "Thank you for shopping at Eco-Thrift!")
    for part in str(footer).split("\n"):
        if part.strip():
            lines.append(part.strip().center(W))
    if data.get("store_address"):
        lines.append("-" * W)
        for part in str(data["store_address"]).split("\n"):
            if part.strip():
                lines.append(part.strip().center(W))
    lines.append("-" * W)
    for pl in RECEIPT_POLICY_LINES:
        lines.append(pl.center(W))
    lines.append("")

    return "\n".join(lines)


def format_test_receipt_text() -> str:
    return format_receipt_text(_TEST_DATA)


# --- Rich PNG receipt (logo, sections, loud policy) ---------------------------------

CANVAS_W = 680
_MARGIN = 36
_INNER = CANVAS_W - 2 * _MARGIN

_RECEIPT_THEMES: dict[str, dict[str, Any]] = {
    "professional": {
        "bg": (255, 255, 255),
        "text": (18, 18, 18),
        "muted": (75, 75, 75),
        "accent": (40, 40, 40),
        "rule": (190, 190, 190),
        "saved_bg": (0, 0, 0),
        "saved_text": (255, 255, 255),
        "policy_bg": (0, 0, 0),
        "policy_text": (255, 255, 255),
        "policy_sub": (200, 200, 200),
        "meta_box": True,
        "meta_box_outline": (120, 120, 120),
        "thermal_mono": True,
    },
    "cool": {
        "bg": (241, 245, 249),
        "text": (15, 23, 42),
        "muted": (71, 85, 105),
        "accent": (13, 148, 136),
        "rule": (148, 163, 184),
        "saved_bg": (79, 70, 229),
        "saved_text": (255, 255, 255),
        "policy_bg": (190, 18, 60),
        "policy_text": (255, 255, 255),
        "policy_sub": (255, 228, 230),
        "meta_box": False,
        "meta_accent_bar": (13, 148, 136),
        "thermal_mono": False,
    },
    "emoji": {
        "bg": (255, 251, 235),
        "text": (120, 53, 15),
        "muted": (180, 83, 9),
        "accent": (194, 65, 12),
        "rule": (252, 211, 77),
        "saved_bg": (5, 150, 105),
        "saved_text": (255, 255, 255),
        "policy_bg": (153, 27, 27),
        "policy_text": (255, 255, 255),
        "policy_sub": (254, 226, 226),
        "meta_box": False,
        "meta_accent_bar": (234, 88, 12),
        "thermal_mono": False,
    },
}


def _receipt_assets_dir() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass) / "assets"
        return Path(sys.executable).parent / "assets"
    return Path(__file__).resolve().parent.parent / "assets"


def _sans_bold(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for family in ("arialbd.ttf", "DejaVuSans-Bold.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(family, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _sans_reg(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for family in ("arial.ttf", "DejaVuSans.ttf", "arialbd.ttf"):
        try:
            return ImageFont.truetype(family, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _mono_receipt(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for family in ("consola.ttf", "cour.ttf", "DejaVuSansMono.ttf", "LiberationMono-Regular.ttf"):
        try:
            return ImageFont.truetype(family, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _text_w(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> float:
    if hasattr(draw, "textlength"):
        return float(draw.textlength(text, font=font))
    bbox = font.getbbox(text)
    return float(bbox[2] - bbox[0])


def _text_h(font: ImageFont.ImageFont) -> int:
    a, b = font.getmetrics()
    return a + b + 2


def _fill_rounded(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, int, int],
) -> None:
    if hasattr(draw, "rounded_rectangle"):
        draw.rounded_rectangle(box, radius=radius, fill=fill)
    else:
        draw.rectangle(box, fill=fill)


def _wrap_text(text: str, font: ImageFont.ImageFont, draw: ImageDraw.ImageDraw, max_w: int) -> list[str]:
    words = (text or "").split()
    if not words:
        return [""]
    lines: list[str] = []
    cur: list[str] = []
    for w in words:
        trial = " ".join(cur + [w])
        if _text_w(draw, trial, font) <= max_w:
            cur.append(w)
        else:
            if cur:
                lines.append(" ".join(cur))
            cur = [w]
    if cur:
        lines.append(" ".join(cur))
    return lines


def _load_receipt_logo_content_width(inner_w: int, max_h: int) -> Image.Image | None:
    """Scale logo to span ``inner_w`` when height stays under ``max_h``; else cap height and center."""
    path = _receipt_assets_dir() / "ecothrift_logo_bw.png"
    if not path.is_file():
        return None
    try:
        im = Image.open(path).convert("RGBA")
        w, h = im.size
        if w <= 0 or h <= 0:
            return None
        nh_at_full_w = int(round(h * (inner_w / w)))
        if nh_at_full_w <= max_h:
            nw, nh = inner_w, max(1, nh_at_full_w)
        else:
            nh = max_h
            nw = max(1, int(round(w * (max_h / h))))
        return im.resize((nw, nh), Image.LANCZOS)
    except OSError as e:
        logger.warning("Receipt logo load failed: %s", e)
        return None


def resolve_receipt_layout(data: dict[str, Any], override: str | None = None) -> str:
    raw = override or data.get("receipt_layout") or data.get("receipt_style") or "professional"
    k = str(raw).strip().lower()
    if k in ("pro", "business"):
        k = "professional"
    if k not in _RECEIPT_THEMES:
        k = "professional"
    return k


def render_receipt_to_image(
    data: dict[str, Any],
    *,
    layout_style: str | None = None,
    dpi: int = 203,
    render_scale: int = 1,
) -> Image.Image:
    """Structured receipt PNG: large logo, clear sections, loud no-refund block.

    ``receipt_layout`` / ``receipt_style`` on ``data`` may be ``professional``,
    ``cool``, or ``emoji``. ``layout_style`` wins when set.

    ``render_scale`` multiplies canvas dimensions, fonts, and spacing so Pillow
    rasterizes at higher resolution. Use ``send_image(..., source_dpi=dpi * render_scale)``
    to keep physical print width unchanged.
    """
    S = max(1, int(render_scale))
    _ = dpi
    theme_key = resolve_receipt_layout(data, layout_style)
    t = _RECEIPT_THEMES[theme_key]

    canvas_w = CANVAS_W * S
    margin = _MARGIN * S
    inner = canvas_w - 2 * margin
    h_work = 4200 * S

    x0 = margin
    x1 = margin + inner
    y = margin

    im = Image.new("RGB", (canvas_w, h_work), t["bg"])
    draw = ImageDraw.Draw(im)

    f_title = _sans_bold(26 * S)
    f_sub = _sans_reg(16 * S)
    f_small = _sans_reg(14 * S)
    f_label = _sans_reg(14 * S)
    f_label_b = _sans_bold(14 * S)
    f_meta_val = _mono_receipt(23 * S)
    f_item = _sans_reg(16 * S)
    f_money = _sans_reg(16 * S)
    f_total = _sans_bold(32 * S)
    f_saved = _sans_bold(24 * S)
    f_policy_h = _sans_bold(34 * S)
    f_policy_m = _sans_bold(15 * S)
    f_policy_s = _sans_reg(13 * S)
    f_hdr_small = _sans_bold(12 * S)
    f_loc = _sans_bold(11 * S)
    f_total_row_label = _sans_bold(18 * S)
    lw1 = max(1, S)
    lw2 = max(2, 2 * S)

    # --- Logo: full content width, no pad/border strip (page bg only) ---
    logo_max_h = 200 * S
    logo = _load_receipt_logo_content_width(inner, logo_max_h)
    has_logo_image = logo is not None
    if logo:
        lx = x0 + (inner - logo.width) // 2
        ly = y
        if logo.mode == "RGBA":
            im.paste(logo, (lx, ly), logo)
        else:
            im.paste(logo, (lx, ly))
        y += logo.height + 18 * S
    else:
        fallback = data.get("store_name", "Eco-Thrift")
        band_h = 72 * S
        tw = _text_w(draw, fallback, f_title)
        draw.text((x0 + (inner - tw) / 2, y + band_h // 2 - 14 * S), fallback, font=f_title, fill=t["accent"])
        y += band_h + 16 * S

    # --- Store ---
    if has_logo_image:
        name = data.get("store_name", "Eco-Thrift")
        nw = _text_w(draw, name, f_title)
        draw.text((x0 + (inner - nw) / 2, y), name, font=f_title, fill=t["text"])
        y += _text_h(f_title) + 6 * S

    if data.get("store_phone"):
        ph = str(data["store_phone"]).strip()
        draw.text((x0, y), "Phone", font=f_label_b, fill=t["muted"])
        pw = _text_w(draw, ph, f_sub)
        draw.text((x1 - pw, y), ph, font=f_sub, fill=t["text"])
        y += max(_text_h(f_label_b), _text_h(f_sub)) + 6 * S
    if data.get("store_hours"):
        draw.text((x0, y), "Hours", font=f_label_b, fill=t["muted"])
        y += _text_h(f_label_b) + 4 * S
        for part in str(data["store_hours"]).split("\n"):
            if part.strip():
                for ln in _wrap_text(part.strip(), f_sub, draw, inner - 12 * S):
                    draw.text((x0 + 10 * S, y), ln, font=f_sub, fill=t["text"])
                    y += _text_h(f_sub) + 2 * S
        y += 6 * S

    # Section divider
    if theme_key == "emoji":
        sep = "✨ · · · · · · · · · · · · · · · · · · ✨"
        tw = _text_w(draw, sep, f_small)
        draw.text((x0 + (inner - tw) / 2, y), sep, font=f_small, fill=t["accent"])
        y += _text_h(f_small) + 12 * S
    elif theme_key == "cool":
        draw.rectangle([x0, y, x1, y + 3 * S], fill=t["accent"])
        y += 14 * S
    else:
        draw.line([x0, y + 6 * S, x1, y + 6 * S], fill=t["rule"], width=lw2)
        y += 18 * S

    # --- Transaction meta ---
    meta_top = y
    meta_pad = 14 * S
    if t.get("meta_box"):
        mx0 = x0 + meta_pad
        mx1 = x1 - meta_pad
    elif theme_key == "cool":
        mx0 = x0 + 5 * S + meta_pad
        mx1 = x1 - 10 * S
    else:
        mx0 = x0 + meta_pad
        mx1 = x1 - 10 * S

    y_meta = meta_top + 8 * S
    if theme_key == "emoji":
        draw.text((mx0, y_meta), "🧾 Transaction", font=f_label, fill=t["accent"])
        y_meta += _text_h(f_label) + 8 * S
    elif theme_key == "cool":
        draw.text((mx0, y_meta), "transaction //", font=f_hdr_small, fill=t["accent"])
        y_meta += _text_h(f_hdr_small) + 8 * S
    else:
        draw.text((mx0, y_meta), "TRANSACTION", font=f_hdr_small, fill=t["muted"])
        y_meta += _text_h(f_hdr_small) + 10 * S

    if data.get("receipt_number"):
        rn = str(data["receipt_number"])
        draw.text((mx0, y_meta), "Receipt #", font=f_label, fill=t["muted"])
        rw = _text_w(draw, rn, f_meta_val)
        draw.text((mx1 - rw, y_meta), rn, font=f_meta_val, fill=t["text"])
        y_meta += max(_text_h(f_label), _text_h(f_meta_val)) + 8 * S

    if data.get("date"):
        time_str = data.get("time", "")
        dt = f"{data['date']}  {time_str}".strip()
        draw.text((mx0, y_meta), "Date & time", font=f_label, fill=t["muted"])
        rw = _text_w(draw, dt, f_meta_val)
        draw.text((mx1 - rw, y_meta), dt, font=f_meta_val, fill=t["text"])
        y_meta += max(_text_h(f_label), _text_h(f_meta_val)) + 8 * S

    if data.get("cashier"):
        cs = str(data["cashier"])
        draw.text((mx0, y_meta), "Cashier", font=f_label, fill=t["muted"])
        rw = _text_w(draw, cs, f_sub)
        draw.text((mx1 - rw, y_meta), cs, font=f_sub, fill=t["text"])
        y_meta += max(_text_h(f_label), _text_h(f_sub)) + 4 * S

    y = y_meta + 12 * S
    if t.get("meta_box"):
        draw.rectangle([x0, meta_top, x1, y], outline=t["meta_box_outline"], width=lw2)
    elif theme_key == "cool":
        draw.rectangle(
            [x0, meta_top, x0 + 5 * S, y],
            fill=t.get("meta_accent_bar", t["accent"]),
        )

    y += 16 * S

    # --- Items header ---
    if theme_key == "emoji":
        hdr = "🛍  Line items"
    elif theme_key == "cool":
        hdr = "— items —"
    else:
        hdr = "ITEMS"
    tw = _text_w(draw, hdr, f_hdr_small)
    draw.text((x0 + (inner - tw) / 2, y), hdr, font=f_hdr_small, fill=t["muted"])
    y += _text_h(f_hdr_small) + 10 * S
    draw.line([x0, y, x1, y], fill=t["rule"], width=lw1)
    y += 12 * S

    items: list[dict[str, Any]] = data.get("items", [])
    for item in items:
        name = item.get("name", "Item")
        qty = item.get("quantity", 1)
        unit = item.get("unit_price", 0)
        total = item.get("line_total", qty * unit)
        price_s = f"${float(total):.2f}"
        if qty > 1:
            for ln in _wrap_text(name, f_item, draw, inner - 80 * S):
                draw.text((x0, y), ln, font=f_item, fill=t["text"])
                y += _text_h(f_item) + max(1, S)
            detail = f"  {qty} × ${float(unit):.2f}"
            pw = _text_w(draw, price_s, f_money)
            draw.text((x0, y), detail, font=f_small, fill=t["muted"])
            draw.text((x1 - pw, y), price_s, font=f_money, fill=t["text"])
            y += _text_h(f_money) + 8 * S
        else:
            lines = _wrap_text(name, f_item, draw, inner - 72 * S)
            pw = _text_w(draw, price_s, f_money)
            for i, ln in enumerate(lines):
                draw.text((x0, y), ln, font=f_item, fill=t["text"])
                if i == 0:
                    draw.text((x1 - pw, y), price_s, font=f_money, fill=t["text"])
                y += _text_h(f_item) + max(1, S)
            y += 6 * S

    draw.line([x0, y, x1, y], fill=t["rule"], width=lw1)
    y += 14 * S

    # --- You saved ---
    if data.get("you_saved") is not None:
        try:
            ys = float(data["you_saved"])
            banner_h = 58 * S
            _fill_rounded(draw, (x0, y, x1, y + banner_h), max(2, 8 * S), t["saved_bg"])
            msg = f"YOU SAVED  ${ys:.2f}"
            if theme_key == "emoji":
                msg = f"💚 YOU SAVED  ${ys:.2f}  💚"
            tw = _text_w(draw, msg, f_saved)
            draw.text(
                (x0 + (inner - tw) / 2, y + (banner_h - _text_h(f_saved)) // 2),
                msg,
                font=f_saved,
                fill=t["saved_text"],
            )
            y += banner_h + 16 * S
        except (TypeError, ValueError):
            pass

    subtotal = float(data.get("subtotal", 0))
    tax = float(data.get("tax", 0) or 0)
    total = float(data.get("total", subtotal + tax))

    def _lr_money(label: str, value: str, font_l: ImageFont.ImageFont, font_v: ImageFont.ImageFont, big: bool = False) -> None:
        nonlocal y
        draw.text((x0, y), label, font=font_l, fill=t["muted"])
        vw = _text_w(draw, value, font_v)
        draw.text((x1 - vw, y), value, font=font_v, fill=t["text"])
        y += max(_text_h(font_l), _text_h(font_v)) + (10 * S if big else 6 * S)

    if theme_key == "emoji":
        tw = _text_w(draw, "💵 Totals", f_label)
        draw.text((x0 + (inner - tw) / 2, y), "💵 Totals", font=f_label, fill=t["accent"])
        y += _text_h(f_label) + 8 * S

    _lr_money("Subtotal", f"${subtotal:.2f}", f_sub, f_money)
    if tax:
        _lr_money("Tax", f"${tax:.2f}", f_sub, f_money)
    _lr_money("TOTAL", f"${total:.2f}", f_total_row_label, f_total, big=True)
    y += 8 * S

    draw.line([x0, y, x1, y], fill=t["rule"], width=lw1)
    y += 14 * S

    if theme_key == "emoji":
        tw = _text_w(draw, "💳 Payment", f_label)
        draw.text((x0 + (inner - tw) / 2, y), "💳 Payment", font=f_label, fill=t["accent"])
        y += _text_h(f_label) + 8 * S

    if data.get("payment_method"):
        _lr_money("Payment", str(data["payment_method"]), f_sub, f_money)
    if data.get("amount_tendered") is not None:
        _lr_money("Tendered", f"${float(data['amount_tendered']):.2f}", f_sub, f_money)
    if data.get("change") is not None:
        _lr_money("Change", f"${float(data['change']):.2f}", f_sub, f_money)

    y += 10 * S
    footer = data.get("footer", "Thank you for shopping at Eco-Thrift!")
    for part in str(footer).split("\n"):
        if part.strip():
            for ln in _wrap_text(part.strip(), f_small, draw, inner):
                tw = _text_w(draw, ln, f_small)
                draw.text((x0 + (inner - tw) / 2, y), ln, font=f_small, fill=t["muted"])
                y += _text_h(f_small) + 2 * S
    y += 10 * S

    if data.get("store_address"):
        draw.line([x0, y, x1, y], fill=t["rule"], width=lw1)
        y += 14 * S
        loc = "Location"
        lw = _text_w(draw, loc, f_loc)
        draw.text((x0 + (inner - lw) / 2, y), loc, font=f_loc, fill=t["muted"])
        y += _text_h(f_loc) + 8 * S
        for part in str(data["store_address"]).split("\n"):
            if part.strip():
                for ln in _wrap_text(part.strip(), f_sub, draw, inner):
                    tw = _text_w(draw, ln, f_sub)
                    draw.text((x0 + (inner - tw) / 2, y), ln, font=f_sub, fill=t["text"])
                    y += _text_h(f_sub) + 2 * S
        y += 10 * S

    # --- Policy (very visible) ---
    policy_top = y
    policy_body: list[str] = []
    for pl in RECEIPT_POLICY_LINES:
        policy_body.extend(_wrap_text(pl, f_policy_s, draw, inner - 24 * S))
    lh_pol = _text_h(f_policy_s) + 2 * S
    policy_h = 92 * S + len(policy_body) * lh_pol
    policy_h = max(policy_h, 150 * S)

    _fill_rounded(draw, (x0, policy_top, x1, policy_top + policy_h), max(2, 10 * S), t["policy_bg"])

    headline = RECEIPT_POLICY_PNG_HEADLINE
    if theme_key == "emoji":
        headline = f"⛔ {RECEIPT_POLICY_PNG_HEADLINE} ⛔"
    hw = _text_w(draw, headline, f_policy_h)
    draw.text(
        (x0 + (inner - hw) / 2, policy_top + 12 * S),
        headline,
        font=f_policy_h,
        fill=t["policy_text"],
    )
    subh = RECEIPT_POLICY_PNG_SUB
    sw = _text_w(draw, subh, f_policy_m)
    draw.text(
        (x0 + (inner - sw) / 2, policy_top + 50 * S),
        subh,
        font=f_policy_m,
        fill=t["policy_sub"],
    )
    py = policy_top + 78 * S
    for ln in policy_body:
        lw = _text_w(draw, ln, f_policy_s)
        draw.text((x0 + (inner - lw) / 2, py), ln, font=f_policy_s, fill=t["policy_text"])
        py += lh_pol

    y = policy_top + policy_h + margin
    return im.crop((0, 0, canvas_w, min(y, h_work)))


def render_receipt_text_to_image(text: str, *, dpi: int = 203) -> Image.Image:
    """Backward-compatible: render plain text block (no logo/sections). Prefer ``render_receipt_to_image``."""
    pad = 20
    inner_w = max(360, round(80 * dpi / 25.4))
    lines = text.rstrip("\n").split("\n") if text else [""]

    def _mono(size: int) -> ImageFont.ImageFont:
        for name in ("consola.ttf", "cour.ttf", "DejaVuSansMono.ttf"):
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                continue
        return ImageFont.load_default()

    font = _mono(10)
    draw_probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    for size in range(22, 7, -1):
        trial = _mono(size)
        max_w = 0.0
        for line in lines:
            max_w = max(max_w, _text_w(draw_probe, line, trial))
        if max_w <= inner_w:
            font = trial
            break

    line_h = _text_h(font) + 4
    img_w = inner_w + 2 * pad
    img_h = pad * 2 + len(lines) * line_h + 8
    im = Image.new("RGB", (img_w, img_h), (255, 255, 255))
    draw = ImageDraw.Draw(im)
    y = pad
    for line in lines:
        draw.text((pad, y), line, font=font, fill=(0, 0, 0))
        y += line_h
    return im
