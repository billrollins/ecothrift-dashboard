"""The receipt as one picture at the printer's width, sent as ESC/POS raster (GS v 0).

Owner 2026-10-16: the 1.9.1 tape printed the black block as white-on-black text lines, and the printer leaves a white
strip between lines, so it came out striped. Drawing the whole receipt as a picture gives a solid black block, the
logo at the top and the same layout as the preview. ``format_receipt`` falls back to the text tape if this fails.

Layout (owner 2026-10-16, decided line by line in chat):
- the logo, then the address and the hours (no phone);
- one line: receipt number, date and time, cashier;
- items in groups: a member's 3-DAY RETURN items under a framed heading (then, 1.9.7, "Returns through Thu Oct 23 ·
  80% of value as store credit"), then SOLD AS IS under a thin rule; a non-member's
  all under ALL SALES FINAL · SOLD AS IS. A THRIFTBUCKS column ("+9.60"; for a non-member, IF MEMBER) before PRICE;
- Items total (when ThriftBucks paid part), ThriftBucks used, Subtotal, Tax, TOTAL; payment on one line;
- one bold Google review line, then the black block: who, today's ThriftBucks, and the B12 line at normal size.
"""
from __future__ import annotations

import datetime as dt
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from services import receipt_printer as rp

DOTS = 576  # 80mm paper at 203 dpi: 72 bytes a row (the 48-character tape is 48 x 12 dots)
SIDE = 8
BAND_ROWS = 64  # rows per GS v 0 command (4.6 KB): small strips, sent one at a time (1.9.5)
# How fast to send (1.9.5): about the printer's own speed, so its memory never fills. A thermal printer slows down on
# solid black to protect its head, so a dark strip gets more time. Rows a second, and the extra share for black.
SEND_ROWS_PER_SECOND = 800
DARK_SLOWDOWN = 3.0
INK = 150  # darker than this prints black
# Owner 2026-10-19: never a solid black area. The office POS-80 stalls or restarts on solid black (every dot of a line
# heated at once), and the restart reprinted the receipt's top over and over. Bars and the Thrift+ block are outlines
# (OUTLINE dots thick) with black text.
OUTLINE = 4  # the outer line of a double frame; the inner line is 1 dot, INNER_GAP inside it
INNER_GAP = 4


def _font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    return rp._sans_bold(size) if bold else rp._sans_reg(size)


def _heavy(size: int) -> ImageFont.ImageFont:
    """The headings' heavy type (Arial Black; Arial Bold where it is missing): bold without solid black (1.9.6)."""
    for family in ("ariblk.ttf", "seguibl.ttf"):
        try:
            return ImageFont.truetype(family, size)
        except OSError:
            continue
    return _font(size, True)


def _when(data: dict[str, Any]) -> str:
    """ "Oct 20, 2:14 PM" from ``date`` (ISO) and ``time``; anything else prints as sent."""
    raw = str(data.get("date") or "").strip()
    time = str(data.get("time") or "").strip()
    try:
        day = dt.date.fromisoformat(raw[:10])
        raw = f"{day.strftime('%b')} {day.day}"
    except ValueError:
        pass
    return ", ".join(part for part in (raw, time) if part)


def _payment_line(data: dict[str, Any]) -> str:
    """Payment on one line: "Thrift+ credit $40.00 · Cash $20.00 · Change $3.29". Card payments keep their own rows
    (the surcharge disclosure), so a card sale names no method here."""
    parts = []
    credit = rp._credit_paid_row(data)
    if credit:
        parts.append(f"{credit[0]} {credit[1]}")
    method = str(data.get("payment_method") or "").strip()
    tendered = rp._as_money(data.get("amount_tendered"))
    if method and not rp._card_payment_rows(data):
        label = method if any(c.isupper() for c in method) else method.title()
        parts.append(f"{label} ${tendered:.2f}" if tendered is not None else label)
    elif tendered is not None:
        parts.append(f"Tendered ${tendered:.2f}")
    change = rp._as_money(data.get("change"))
    if change is not None:
        parts.append(f"Change ${change:.2f}")
    return " · ".join(parts)


def render_thermal_receipt(data: dict[str, Any]) -> Image.Image:
    """The receipt exactly as the printer prints it (1 bit, ``DOTS`` wide)."""
    im = Image.new("L", (DOTS, 9000), 255)
    d = ImageDraw.Draw(im)
    x0, x1 = SIDE, DOTS - SIDE
    inner = x1 - x0
    y = 4

    def h(font: ImageFont.ImageFont) -> int:
        return rp._text_h(font)

    def w(text: str, font: ImageFont.ImageFont) -> float:
        return rp._text_w(d, text, font)

    def fit(text: str, size: int, bold: bool, max_w: float, smallest: int = 16) -> ImageFont.ImageFont:
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
        """Too wide: break at ". ", "; ", ", " or before " and " first, so phrases stay whole."""
        if w(text, font) <= max_w:
            return [text]
        for sep, keep_head, keep_tail in ((". ", ".", ""), ("; ", ";", ""), (", ", ",", ""), (" and ", "", "and ")):
            if sep in text:
                head, tail = text.split(sep, 1)
                if w(head + keep_head, font) <= max_w:
                    return [head + keep_head] + wrap_phrases(keep_tail + tail, font, max_w)
        return rp._wrap_text(text, font, d, max_w)

    def rule(thick: int = 2, pad: int = 8) -> None:
        nonlocal y
        y += pad
        d.rectangle([x0, y, x1, y + thick - 1], fill=0)
        y += thick + pad

    def frame(box: tuple[int, int, int, int], radius: int = 0) -> None:
        """A double frame: a thick outer line and a thin inner one (bold, and never solid black, 1.9.6)."""
        l, t, r, b = box
        k = OUTLINE + INNER_GAP
        if radius:
            d.rounded_rectangle([l, t, r, b], radius=radius, outline=0, width=OUTLINE)
            d.rounded_rectangle([l + k, t + k, r - k, b - k], radius=max(2, radius - k), outline=0, width=1)
        else:
            d.rectangle([l, t, r, b], outline=0, width=OUTLINE)
            d.rectangle([l + k, t + k, r - k, b - k], outline=0, width=1)

    def band(text: str, size: int = 30, sub: tuple[str, ...] = ()) -> None:
        """A heading bar: a double frame with heavy black type (never solid black, 1.9.6). ``sub``: lines set inside the
        same frame under the heading (the returns line, owner 2026-10-20: "IN the returns header box, not under")."""
        nonlocal y
        sub = tuple(s for s in sub if s)
        f = _heavy(size)
        edge = OUTLINE + INNER_GAP
        room = inner - 2 * (edge + 10)
        line = "  ·  ".join(sub)
        f_sub = fit(line, 22, True, room, smallest=19) if sub else None
        rows = [line] if sub and w(line, f_sub) <= room else list(sub)
        if sub and len(rows) > 1:
            f_sub = _font(21, True)
        sub_h = sum(h(f_sub) + 3 for _ in rows) + 4 if rows else 0
        bar_h = h(f) + 2 * edge + 4 + sub_h
        frame((x0, y, x1, y + bar_h))
        top = y + edge + 3
        d.text((x0 + (inner - w(text, f)) / 2, top), text, font=f, fill=0)
        ty = top + h(f) + 5
        for row in rows:
            d.text((x0 + (inner - w(row, f_sub)) / 2, ty), row, font=f_sub, fill=0)
            ty += h(f_sub) + 3
        y += bar_h + 8

    banners = rp._banners(data)
    for text in banners:
        band(text)

    # --- The logo says the name; under it, where and when (no phone) ---
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

    # --- Receipt, date and cashier on one line ---
    rule()
    meta = [str(data.get("receipt_number") or "").strip(), _when(data), str(data.get("cashier") or "").strip()]
    meta = [m for m in meta if m]
    if meta:
        f_meta = _font(21)
        if len(meta) == 3 and w(meta[0], f_meta) + w(meta[1], f_meta) + w(meta[2], f_meta) + 40 <= inner:
            d.text((x0, y), meta[0], font=f_meta, fill=0)
            d.text((x0 + (inner - w(meta[1], f_meta)) / 2, y), meta[1], font=f_meta, fill=0)
            d.text((x1 - w(meta[2], f_meta), y), meta[2], font=f_meta, fill=0)
            y += h(f_meta)
        else:
            center("   ".join(meta), f_meta)
    rule()

    # --- Items: in groups, with a ThriftBucks column ---
    tp = rp._tp(data)
    member = rp._is_member_receipt(data)
    items = [it for it in (data.get("items") or []) if isinstance(it, dict)]
    f_item, f_detail, f_head = _font(23), _font(19), _font(17, True)
    price_w = w("$0000.00", f_item)
    bucks_right = x1 - price_w - 14
    bucks_w = w("+000.00", f_item)
    name_w = int(bucks_right - bucks_w - 12 - x0) if tp is not None else int(inner - price_w - 14)

    def item_row(item: dict[str, Any]) -> None:
        nonlocal y
        qty = item.get("quantity", 1) or 1
        unit = rp._as_money(item.get("unit_price")) or 0.0
        total = rp._as_money(item.get("line_total"))
        total = qty * unit if total is None else total
        price = f"${total:.2f}"
        d.text((x1 - w(price, f_item), y), price, font=f_item, fill=0)
        if tp is not None:
            bucks = rp._as_money(item.get("bucks")) or 0.0
            if bucks > 0:
                text = f"+{rp._tb(bucks)}"
                d.text((bucks_right - w(text, f_item), y), text, font=f_item, fill=0)
        for ln in rp._wrap_text(str(item.get("name", "Item")), f_item, d, name_w):
            d.text((x0, y), ln, font=f_item, fill=0)
            y += h(f_item)
        if qty > 1:
            d.text((x0 + 16, y - 2), f"{qty} × ${unit:.2f}", font=f_detail, fill=0)
            y += h(f_detail)
        y += 6

    def col_heads() -> None:
        """ITEM · THRIFTBUCKS (IF MEMBER) · PRICE, under each section's heading (owner 2026-10-16)."""
        nonlocal y
        d.text((x0, y), "ITEM", font=f_head, fill=0)
        col = "THRIFTBUCKS" if member else "IF MEMBER"
        d.text((bucks_right - w(col, f_head), y), col, font=f_head, fill=0)
        d.text((x1 - w("PRICE", f_head), y), "PRICE", font=f_head, fill=0)
        y += h(f_head) + 6

    if tp is not None:
        if member:
            returns = [it for it in items if rp._is_return_mark(it.get("mark"))]
            rest = [it for it in items if not rp._is_return_mark(it.get("mark"))]
            if returns:
                # The last day and what comes back, inside the heading's frame (release 4, owner 2026-10-20).
                band("3-DAY RETURN", size=24, sub=tuple(rp._returns_parts(data) or ()))
                col_heads()
                for it in returns:
                    item_row(it)
            if rest:
                if returns:
                    y += 8
                # The same heading as 3-DAY RETURN (owner 2026-10-19), with no returns said inside it (10-20).
                band("SOLD AS IS", size=24, sub=(rp.AS_IS_NO_RETURNS_LINE,))
                col_heads()
                for it in rest:
                    item_row(it)
        else:
            band("ALL SALES FINAL · SOLD AS IS", size=24, sub=(rp.AS_IS_NO_RETURNS_LINE,))
            col_heads()
            for it in items:
                item_row(it)
    else:
        for it in items:
            item_row(it)
    rule(pad=4)

    # --- Totals: Items total, ThriftBucks used, Subtotal, Tax, TOTAL ---
    f_row = _font(22)
    used = rp._bucks_used_row(data)
    subtotal = rp._as_money(data.get("subtotal")) or 0.0
    if used:
        items_total = sum(
            (rp._as_money(it.get("line_total")) if rp._as_money(it.get("line_total")) is not None
             else (rp._as_money(it.get("unit_price")) or 0.0) * (it.get("quantity", 1) or 1))
            for it in items
        )
        lr("Items total", f"${items_total:.2f}", f_row, gap=2)
        lr(used[0], f"-{used[1]}", f_row, gap=2)
    tax = rp._as_money(data.get("tax")) or 0.0
    total = rp._as_money(data.get("total"))
    total = subtotal + tax if total is None else total
    lr("Subtotal", f"${subtotal:.2f}", f_row, gap=2)
    if tax:
        lr("Tax", f"${tax:.2f}", f_row, gap=2)
    for row in rp._wrap_chars(rp._tax_exempt_line(data)) if rp._tax_exempt_line(data) else []:
        center(row, _font(22, True), gap=2)
    lr("TOTAL", f"${total:.2f}", _font(30, True), _font(40, True), gap=2)

    sav = rp._savings_rows(data)
    if sav:
        total_saved, rows = sav
        y += 6
        f_sav = _font(24, True)
        top = y
        d.rectangle([x0, top, x1, top + h(f_sav) + 8], outline=0, width=OUTLINE)
        d.text((x0 + 10, top + 4), "YOU SAVED", font=f_sav, fill=0)
        amt = f"${total_saved:.2f}"
        d.text((x1 - 10 - w(amt, f_sav), top + 4), amt, font=f_sav, fill=0)
        y = top + h(f_sav) + 14
        for label, amount in rows:
            lr(label, rp._savings_amount(label, amount), _font(20), gap=0, indent=18)
    rule()

    # --- Payment on one line (card sales keep their rows: the surcharge disclosure) ---
    pay = _payment_line(data)
    if pay:
        center(pay, fit(pay, 22, False, inner, smallest=18))
    for label, amount, bold in rp._card_payment_rows(data):
        if amount is None:
            center(label, _font(18, bold))
        else:
            lr(label, amount, _font(22, bold), gap=2)

    # --- The Google review line, then the black block ---
    y += 16
    center(rp.RECEIPT_REVIEW_LINE, fit(rp.RECEIPT_REVIEW_LINE, 25, True, inner))
    y += 10

    head, block_lines, fine = rp._bottom_block(data)
    pad = 22
    box = (x0 + pad, x1 - pad)
    box_w = box[1] - box[0]
    f_head = _heavy(40)
    for size in range(40, 23, -1):  # heavy type, as large as fits
        f_head = _heavy(size)
        if w(head, f_head) <= box_w:
            break
    plan: list[tuple[str, ImageFont.ImageFont, int]] = []  # line, font, gap after
    for ln in rp._wrap_text(head, f_head, d, box_w):
        plan.append((ln, f_head, 2))
    plan[-1] = (plan[-1][0], plan[-1][1], 12)
    for text, bold in block_lines:
        font = _font(24, True) if bold else _font(22)
        for ln in wrap_phrases(text, font, box_w):
            plan.append((ln, font, 4))
    if fine:  # the B12 line: normal size (owner 2026-10-16), not fine print
        plan[-1] = (plan[-1][0], plan[-1][1], 14)
        for text in fine:
            for ln in rp._wrap_text(text, _font(21), d, box_w):
                plan.append((ln, _font(21), 2))
    block_h = 2 * pad + sum(h(f) + gap for _ln, f, gap in plan)
    # Owner 2026-10-19: no deep black (a gray dot fill printed "ugly"): a bold outlined box, black text, a rule under
    # the member line.
    frame((x0, y, x1, y + block_h), radius=18)
    y += pad
    for i, (ln, font, gap) in enumerate(plan):
        d.text((box[0] + (box_w - w(ln, font)) / 2, y), ln, font=font, fill=0)
        y += h(font) + gap
        if font is f_head and (i + 1 == len(plan) or plan[i + 1][1] is not f_head):
            d.rectangle([box[0] + 40, y - 7, box[1] - 40, y - 5], fill=0)
    y += pad + 10

    if banners:
        y += 6
        for text in banners:
            band(text)

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


def raster_parts(image: Image.Image) -> list[tuple[bytes, float]]:
    """The picture as GS v 0 strips, each with the seconds to wait after sending it (its print time, longer when
    dark). Joined, the strips are exactly ``raster_bytes``."""
    bw = image.convert("L").point(lambda v: 255 if v < 128 else 0).convert("1", dither=Image.Dither.NONE)
    width_bytes = (bw.width + 7) // 8
    parts: list[tuple[bytes, float]] = []
    for top in range(0, bw.height, BAND_ROWS):
        part = bw.crop((0, top, bw.width, min(bw.height, top + BAND_ROWS)))
        rows = part.height
        body = part.tobytes()
        black = sum(bin(b).count("1") for b in body) / max(1, len(body) * 8)
        wait = rows / SEND_ROWS_PER_SECOND * (1 + DARK_SLOWDOWN * black)
        head = b"\x1dv0\x00" + bytes([width_bytes % 256, width_bytes // 256, rows % 256, rows // 256])
        parts.append((head + body, round(wait, 3)))
    return parts


def receipt_parts(data: dict[str, Any]) -> list[tuple[bytes, float]]:
    """The whole print job in strips (1.9.5): reset and left align on the first, feed and cut on the last."""
    parts = raster_parts(render_thermal_receipt(data))
    first, wait = parts[0]
    parts[0] = (rp.INIT + rp.LEFT + first, wait)
    last, wait = parts[-1]
    parts[-1] = (last + rp.FEED_LINES(4) + rp.PARTIAL_CUT, wait)
    return parts


def receipt_escpos(data: dict[str, Any]) -> bytes:
    """The whole print job in one piece: reset, left align, the picture, feed and cut."""
    return b"".join(part for part, _wait in receipt_parts(data))
