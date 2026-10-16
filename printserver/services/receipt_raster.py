"""The receipt as one picture at the printer's width, sent as ESC/POS raster (GS v 0).

Owner 2026-10-16: the 1.9.1 tape printed the black block as white-on-black text lines, and the printer leaves a white
strip between lines, so it came out striped. Drawing the whole receipt as a picture gives a solid black block, the
logo at the top and the same layout as the preview. ``format_receipt`` falls back to the text tape if this fails.
"""
from __future__ import annotations

from typing import Any

from PIL import Image, ImageDraw, ImageFont

from services import receipt_printer as rp

DOTS = 576  # 80mm paper at 203 dpi: 72 bytes a row (the 48-character tape is 48 x 12 dots)
SIDE = 8
BAND_ROWS = 128  # rows per GS v 0 command; small bands suit every printer's buffer
INK = 150  # darker than this prints black


def _font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    return rp._sans_bold(size) if bold else rp._sans_reg(size)


def render_thermal_receipt(data: dict[str, Any]) -> Image.Image:
    """The receipt exactly as the printer prints it (1 bit, ``DOTS`` wide)."""
    im = Image.new("L", (DOTS, 8000), 255)
    d = ImageDraw.Draw(im)
    x0, x1 = SIDE, DOTS - SIDE
    inner = x1 - x0
    y = 4

    def h(font: ImageFont.ImageFont) -> int:
        return rp._text_h(font)

    def w(text: str, font: ImageFont.ImageFont) -> float:
        return rp._text_w(d, text, font)

    def fit(text: str, size: int, bold: bool, max_w: int, smallest: int = 16) -> ImageFont.ImageFont:
        while size > smallest and w(text, _font(size, bold)) > max_w:
            size -= 1
        return _font(size, bold)

    def center(text: str, font: ImageFont.ImageFont, gap: int = 2, fill: int = 0, box: tuple[int, int] = (x0, x1)) -> None:
        nonlocal y
        left, right = box
        for ln in rp._wrap_text(text, font, d, right - left):
            d.text((left + (right - left - w(ln, font)) / 2, y), ln, font=font, fill=fill)
            y += h(font) + gap

    def lr(left: str, right: str, font_l: ImageFont.ImageFont, font_r: ImageFont.ImageFont | None = None,
           gap: int = 4, indent: int = 0) -> None:
        nonlocal y
        font_r = font_r or font_l
        rw = w(right, font_r)
        lines = rp._wrap_text(left, font_l, d, int(inner - indent - rw - 16)) if left else [""]
        base = y + max(0, h(font_r) - h(font_l))  # big amounts sit on the label's baseline
        d.text((x1 - rw, y), right, font=font_r, fill=0)
        ly = base
        for ln in lines:
            d.text((x0 + indent, ly), ln, font=font_l, fill=0)
            ly += h(font_l)
        y = max(ly, y + h(font_r)) + gap

    def wrap_phrases(text: str, font: ImageFont.ImageFont, max_w: int) -> list[str]:
        """Too wide: break at ", " and before " and " first, so "use by Nov 19" or "and 1 item ..." stay whole."""
        if w(text, font) <= max_w:
            return [text]
        for sep, keep in ((", ", ""), (" and ", "and ")):
            if sep in text:
                head, tail = text.split(sep, 1)
                tail = keep + tail
                if w(head, font) <= max_w:
                    return [head + ("," if sep == ", " else "")] + wrap_phrases(tail, font, max_w)
        return rp._wrap_text(text, font, d, max_w)

    def rule(thick: int = 2, pad: int = 8) -> None:
        nonlocal y
        y += pad
        d.rectangle([x0, y, x1, y + thick - 1], fill=0)
        y += thick + pad

    def band(text: str) -> None:
        nonlocal y
        f = _font(30, True)
        d.rectangle([x0, y, x1, y + h(f) + 12], fill=0)
        d.text((x0 + (inner - w(text, f)) / 2, y + 6), text, font=f, fill=255)
        y += h(f) + 20

    training = rp._is_training(data)
    if training:
        band(rp.TRAINING_BANNER)

    # --- The logo says the name; under it, where and when (owner 2026-10-16; no phone) ---
    logo = rp._load_receipt_logo_content_width(inner, 150)
    if logo is not None:
        flat = Image.new("RGB", logo.size, (255, 255, 255))
        flat.paste(logo, (0, 0), logo if logo.mode == "RGBA" else None)
        im.paste(flat.convert("L"), (x0 + (inner - logo.width) // 2, y))
        y += logo.height + 8
    else:
        center(rp.RECEIPT_STORE_NAME, _font(36, True), gap=4)
    f_store = _font(21)
    center("  ·  ".join(rp.RECEIPT_STORE_ADDRESS), f_store)
    center("  ·  ".join(rp.RECEIPT_STORE_HOURS), f_store)

    # --- Receipt, date, cashier ---
    rule()
    f_meta, f_meta_b = _font(21), _font(21, True)
    if data.get("receipt_number"):
        lr("Receipt", str(data["receipt_number"]), f_meta, f_meta_b, gap=2)
    if data.get("date"):
        lr("Date", f"{data['date']} {data.get('time', '')}".strip(), f_meta, f_meta_b, gap=2)
    if data.get("cashier"):
        lr("Cashier", str(data["cashier"]), f_meta, f_meta_b, gap=2)
    rule()

    # --- Items, each with its sub-line ---
    f_item, f_detail, f_sub, f_mark = _font(24), _font(20), _font(21), _font(21, True)
    for item in data.get("items", []) or []:
        if not isinstance(item, dict):
            continue
        qty = item.get("quantity", 1) or 1
        unit = rp._as_money(item.get("unit_price")) or 0.0
        total = rp._as_money(item.get("line_total"))
        total = qty * unit if total is None else total
        lr(str(item.get("name", "Item")), f"${total:.2f}", f_item, gap=0)
        if qty > 1:
            d.text((x0 + 18, y), f"{qty} × ${unit:.2f}", font=f_detail, fill=0)
            y += h(f_detail)
        bucks_text, mark = rp._item_subparts(item, data)
        if bucks_text or mark:
            if bucks_text:
                d.text((x0 + 18, y), bucks_text, font=f_sub, fill=0)
            if mark:
                d.text((x1 - w(mark, f_mark), y + h(f_sub) - h(f_mark)), mark, font=f_mark, fill=0)
            y += max(h(f_sub), h(f_mark))
        y += 10
    rule(pad=4)

    # --- Totals ---
    f_row = _font(22)
    used = rp._bucks_used_row(data)
    if used:
        lr(*used, f_row, gap=2)
    subtotal = rp._as_money(data.get("subtotal")) or 0.0
    tax = rp._as_money(data.get("tax")) or 0.0
    total = rp._as_money(data.get("total"))
    total = subtotal + tax if total is None else total
    lr("Subtotal", f"${subtotal:.2f}", f_row, gap=2)
    if tax:
        lr("Tax", f"${tax:.2f}", f_row, gap=2)
    lr("TOTAL", f"${total:.2f}", _font(30, True), _font(40, True), gap=2)

    sav = rp._savings_rows(data)
    if sav:
        total_saved, rows = sav
        y += 6
        f_sav = _font(24, True)
        top = y
        d.rectangle([x0, top, x1, top + h(f_sav) + 8], fill=0)
        d.text((x0 + 10, top + 4), "YOU SAVED", font=f_sav, fill=255)
        amt = f"${total_saved:.2f}"
        d.text((x1 - 10 - w(amt, f_sav), top + 4), amt, font=f_sav, fill=255)
        y = top + h(f_sav) + 14
        for label, amount in rows:
            lr(label, rp._savings_amount(label, amount), _font(20), gap=0, indent=18)
    rule()

    # --- Payment ---
    if data.get("payment_method"):
        lr("Payment", str(data["payment_method"]), f_row, gap=2)
    tendered = rp._as_money(data.get("amount_tendered"))
    if tendered is not None:
        lr("Tendered", f"${tendered:.2f}", f_row, gap=2)
    change = rp._as_money(data.get("change"))
    if change is not None:
        lr("Change", f"${change:.2f}", f_row, gap=2)
    credit = rp._credit_paid_row(data)
    if credit:
        lr(*credit, f_row, gap=2)
    for label, amount, bold in rp._card_payment_rows(data):
        if amount is None:
            center(label, _font(18, bold))
        else:
            lr(label, amount, _font(22, bold), gap=2)

    # --- Thanks, the Google review line, then the black block ---
    y += 18
    center(rp.RECEIPT_FOOTER, _font(20))
    y += 4
    center(rp.RECEIPT_REVIEW_LINE, fit(rp.RECEIPT_REVIEW_LINE, 25, True, inner))
    y += 10

    head, block_lines, fine = rp._bottom_block(data)
    pad = 18
    box = (x0 + pad, x1 - pad)
    f_head = fit(head, 40, True, box[1] - box[0], smallest=24)
    plan: list[tuple[str, ImageFont.ImageFont, int]] = []  # line, font, gap after
    for ln in rp._wrap_text(head, f_head, d, box[1] - box[0]):
        plan.append((ln, f_head, 2))
    plan[-1] = (plan[-1][0], plan[-1][1], 12)
    for text, bold in block_lines:
        font = _font(24, True) if bold else _font(22)
        for ln in wrap_phrases(text, font, box[1] - box[0]):
            plan.append((ln, font, 4))
    if fine:
        plan[-1] = (plan[-1][0], plan[-1][1], 12)
        for text in fine:
            for ln in rp._wrap_text(text, _font(17), d, box[1] - box[0]):
                plan.append((ln, _font(17), 1))
    block_h = 2 * pad + sum(h(f) + gap for _ln, f, gap in plan)
    d.rounded_rectangle([x0, y, x1, y + block_h], radius=16, fill=0)
    y += pad
    for ln, font, gap in plan:
        d.text((box[0] + (box[1] - box[0] - w(ln, font)) / 2, y), ln, font=font, fill=255)
        y += h(font) + gap
    y += pad + 10

    if training:
        y += 6
        band(rp.TRAINING_BANNER)

    out = im.crop((0, 0, DOTS, y + 4))
    return out.point(lambda v: 0 if v < INK else 255).convert("1", dither=Image.Dither.NONE)


def raster_bytes(image: Image.Image) -> bytes:
    """GS v 0 bands: one bit a dot, 1 = black, rows of ``DOTS`` / 8 bytes."""
    bw = image.convert("L").point(lambda v: 255 if v < 128 else 0).convert("1", dither=Image.Dither.NONE)
    width_bytes = (bw.width + 7) // 8
    out = bytearray()
    for top in range(0, bw.height, BAND_ROWS):
        part = bw.crop((0, top, bw.width, min(bw.height, top + BAND_ROWS)))
        rows = part.height
        out += b"\x1dv0\x00" + bytes([width_bytes % 256, width_bytes // 256, rows % 256, rows // 256])
        out += part.tobytes()
    return bytes(out)


def receipt_escpos(data: dict[str, Any]) -> bytes:
    """The whole print job: reset, left align, the picture, feed and cut."""
    image = render_thermal_receipt(data)
    return rp.INIT + rp.LEFT + raster_bytes(image) + rp.FEED_LINES(4) + rp.PARTIAL_CUT
