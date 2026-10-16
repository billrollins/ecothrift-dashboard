"""Receipt formatting — ESC/POS for thermal printers, plain-text for GDI."""

from __future__ import annotations

import logging
import re
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
FONT_SMALL = ESC + b"!\x01"  # font B (smaller); printers without it print font A
UNDERLINE_ON = ESC + b"-\x01"

UNDERLINE_OFF = ESC + b"-\x00"
REVERSE_ON = GS + b"B\x01"  # white on black
REVERSE_OFF = GS + b"B\x00"
FEED_LINES = lambda n: ESC + b"d" + bytes([n])  # noqa: E731
CUT_PAPER = GS + b"V\x00"
PARTIAL_CUT = GS + b"V\x01"

W = RECEIPT_WIDTH_CHARS

logger = logging.getLogger(__name__)

# After footer + optional address (GDI + ESC/POS + PNG policy body).
RECEIPT_POLICY_LINES: tuple[str, ...] = (
    "All sales are final. No refunds or exchanges.",
    "We test as much as we can, but we cannot test everything.",
    "Please test items before you buy.",
)

# Large type on PNG policy card only (print uses RECEIPT_POLICY_LINES).
RECEIPT_POLICY_PNG_HEADLINE = "NO REFUNDS"
RECEIPT_POLICY_PNG_SUB = "ALL SALES FINAL — TEST BEFORE YOU BUY"

# The black block's words (owner 2026-10-16: "black says if thrift+ or not, ThriftBucks either used, instant OR
# collected, OR missed for non-members, and a quick note AS IS unless noted above").
BLOCK_HEAD_MEMBER = "THRIFT+ MEMBER"
BLOCK_HEAD_NON_MEMBER = "NON-MEMBER"
BLOCK_AS_IS_MEMBER = "SOLD AS IS unless marked 3-day return"
BLOCK_JOIN = "Join free: ecothrift.us/join"

# Thrift+ block words (V2/V4/V8, B2, B5, B12, W1). ThriftBucks are numbers next to their label,
# never "$"; Thrift+ credit and the instant redemption are dollars.
# B12, word for word: the legal disclosure that makes the 30 days work. There is no Thrift+ card to print it on
# (owner 2026-10-14), so every member receipt carries it.
# Owner 2026-10-16 (receipt redesign): "Use ThriftBucks tomorrow; expire in 30 days". Keeps the memo's three
# conditions (the word "rewards", the expiry rule, no cash value). Attorney to confirm the new words (B12).
THRIFT_PLUS_TERMS_LINE = (
    "ThriftBucks are Thrift+ rewards. Use them starting tomorrow; they expire 30 days after you collect them. "
    "No cash value. Terms: ecothrift.us/terms"
)
THRIFT_PLUS_RETURNS_LINE = (
    "Thrift+ 3-day returns: lines marked 3-day return, any reason, 80% back as Thrift+ credit."
)
# Owner 2026-10-15 (design language v2.8): "Non-member" replaces "guest" wherever a customer reads. The dashboard may
# send the words as ``thrift_plus.non_member_line``; these are the same words, for a payload without them.
THRIFT_PLUS_GUEST_AS_IS = "Non-member: All sales final. Sold AS IS."
BLOCK_NON_MEMBER_AS_IS = "All sales final · Sold AS IS"
# In the block the head already says NON-MEMBER, so the line drops its "Non-member: " lead.
_NON_MEMBER_LEAD = "Non-member:"
MARK_3_DAY_RETURN = "3-day return"
MARK_AS_IS = "AS IS"

# A training register's practice sale (payload ``training: true``), at the top and the bottom.
TRAINING_BANNER = "TRAINING - NOT A SALE"


# cp437 has no en/em dash, bullet, or curly quotes — they printed as "?".
_ASCII_FOLD = str.maketrans({
    "–": "-",
    "—": "-",
    "‑": "-",
    "·": "*",
    "•": "*",
    "’": "'",
    "‘": "'",
    "“": '"',
    "”": '"',
    "…": "...",
    "×": "x",
    "é": "e",
    "\u00a0": " ",
})


def _ascii(text: str) -> str:
    return str(text).translate(_ASCII_FOLD)


def _encode(text: str) -> bytes:
    return _ascii(text).encode("cp437", errors="replace")


def _line(text: str = "") -> bytes:
    return _encode(text) + b"\n"


def _separator(char: str = "-") -> bytes:
    return _line(char * W)


def _lr(left: str, right: str) -> bytes:
    """Left-right aligned line within receipt width."""
    left, right = _ascii(left), _ascii(right)
    gap = W - len(left) - len(right)
    if gap < 1:
        left = left[: W - len(right) - 1]
        gap = 1
    return _line(f"{left}{' ' * gap}{right}")


def _center_text(text: str) -> bytes:
    return CENTER + _line(text) + LEFT


def _savings_rows(data: dict[str, Any]) -> tuple[float, list[tuple[str, float]]] | None:
    """(total, [(label, amount)]) from receipt_data.savings, else legacy you_saved, else None."""
    sav = data.get("savings")
    if isinstance(sav, dict):
        rows: list[tuple[str, float]] = []
        for row in sav.get("lines") or []:
            try:
                amt = float(row.get("amount", 0))
            except (TypeError, ValueError):
                continue
            if amt > 0:
                rows.append((str(row.get("label", "Savings"))[:30], amt))
        if not rows:
            return None
        try:
            total = float(sav.get("total", sum(a for _, a in rows)))
        except (TypeError, ValueError):
            total = sum(a for _, a in rows)
        return total, rows
    if data.get("you_saved") is not None:
        try:
            ys = float(data["you_saved"])
        except (TypeError, ValueError):
            return None
        return (ys, []) if ys > 0 else None
    return None


def _savings_amount(label: str, amount: float) -> str:
    """A savings breakdown amount: dollars, except a ThriftBucks row (e.g. "ThriftBucks used"), which is a
    number with no "$" (V8)."""
    if "thriftbucks" in str(label).lower():
        return f"{amount:.2f}"
    return f"${amount:.2f}"


CARD_SURCHARGE_DISCLOSURE = "Surcharge applies to credit cards only, not debit or cash."


def _as_money(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _card_payment_rows(data: dict[str, Any]) -> list[tuple[str, str | None, bool]]:
    """Card tender lines: (label, amount or None, bold). Disclosure has no amount."""
    card_type = str(data.get("card_type") or "").strip().lower()
    if card_type not in ("credit", "debit"):
        return []
    label = "Credit" if card_type == "credit" else "Debit"
    rows: list[tuple[str, str | None, bool]] = []
    card_amt = _as_money(data.get("card_amount"))
    if card_amt is not None:
        rows.append((f"Card ({label})", f"${card_amt:.2f}", False))
    surcharge = _as_money(data.get("card_surcharge")) or 0.0
    if card_type == "credit" and surcharge > 0:
        pct = _as_money(data.get("card_surcharge_percent"))
        pct_s = f"{pct:g}" if pct is not None else "3"
        rows.append((f"Credit card surcharge {pct_s}%", f"${surcharge:.2f}", False))
        charged = _as_money(data.get("card_charged_total"))
        if charged is not None:
            rows.append(("Card total charged", f"${charged:.2f}", True))
    rows.append((CARD_SURCHARGE_DISCLOSURE, None, False))
    return rows


def _tb(amount: float) -> str:
    """ThriftBucks (owner 2026-10-10, V8): the number alone, never "$" and never a symbol; the label beside it
    names the unit."""
    return f"{amount:.2f}"


def _truthy(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "y", "on")
    return bool(value)


def _is_training(data: dict[str, Any]) -> bool:
    """A training register's practice sale (payload ``training: true``)."""
    return _truthy(data.get("training"))


def _tp(data: dict[str, Any]) -> dict[str, Any] | None:
    tp = data.get("thrift_plus")
    return tp if isinstance(tp, dict) else None


def _tp_member(data: dict[str, Any]) -> str:
    """The member's first name on a Thrift+ member receipt, else ""."""
    tp = _tp(data)
    if tp is None:
        return ""
    return str(tp.get("member") or "").strip()


def _is_member_receipt(data: dict[str, Any]) -> bool:
    """A Thrift+ member's receipt: it carries the member's first name, or says it is not a guest's
    (``guest_all_as_is: false``) when there is no name to print (owner 2026-10-14: the first name, or nothing)."""
    tp = _tp(data)
    if tp is None:
        return False
    return bool(_tp_member(data)) or tp.get("guest_all_as_is") is False


def _is_guest_as_is(data: dict[str, Any]) -> bool:
    """A non-member's receipt while Thrift+ is on: every item is sold AS IS (W9, A3)."""
    tp = _tp(data)
    return tp is not None and not _is_member_receipt(data) and _truthy(tp.get("guest_all_as_is"))


def _non_member_as_is(data: dict[str, Any]) -> str:
    """The block's AS IS line for a non-member ("All sales final. Sold AS IS."): the dashboard's
    ``non_member_line`` when sent, else the same words from here, without the "Non-member:" lead."""
    tp = _tp(data) or {}
    sent = tp.get("non_member_line")
    text = sent.strip() if isinstance(sent, str) and sent.strip() else THRIFT_PLUS_GUEST_AS_IS
    if text.lower().startswith(_NON_MEMBER_LEAD.lower()):
        text = text[len(_NON_MEMBER_LEAD):].strip()
    return text[:200]


_MISSED = re.compile(r"(\d[\d,]*\.\d{2}) ThriftBucks")


def _missed_bucks(data: dict[str, Any]) -> str:
    """What membership would have collected on this trip ("12.60"), from the dashboard's ``guest_line`` ("This trip
    would have collected 12.60 ThriftBucks."); "" when there is nothing to miss."""
    tp = _tp(data) or {}
    m = _MISSED.search(str(tp.get("guest_line") or ""))
    if not m or (_as_money(m.group(1).replace(",", "")) or 0) <= 0:
        return ""
    return m.group(1)


def _is_return_mark(value: Any) -> bool:
    return str(value or "").strip().lower() in ("3-day return", "3-day returns", "3 day return")


def _return_items(data: dict[str, Any]) -> int | None:
    """How many items (by quantity) qualify for 3-day returns: a member's lines marked 3-day return, or for a
    non-member the lines that would be (``join_mark``). None when a non-member's payload has no ``join_mark`` (an
    older dashboard): the count is unknown, so it is not printed."""
    items = [it for it in (data.get("items") or []) if isinstance(it, dict)]
    if _is_member_receipt(data):
        key = "mark"
    else:
        key = "join_mark"
        if not any(key in it for it in items):
            return None
    count = 0
    for it in items:
        if _is_return_mark(it.get(key)):
            try:
                count += max(1, int(it.get("quantity") or 1))
            except (TypeError, ValueError):
                count += 1
    return count


def _items_word(n: int) -> str:
    return "1 item" if n == 1 else f"{n} items"


def _tp_amount(tp: dict[str, Any] | None, key: str) -> float:
    if not tp:
        return 0.0
    return _as_money(tp.get(key)) or 0.0


_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def _use_by(value: Any) -> str:
    """A use-by date as the receipt prints it ("Nov 19"). An ISO date is shortened; any other text prints as sent."""
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    head = text[:10]
    if len(head) == 10 and head[4] == "-" and head[7] == "-":
        try:
            month, day = int(head[5:7]), int(head[8:10])
            if 1 <= month <= 12 and 1 <= day <= 31:
                return f"{_MONTHS[month - 1]} {day}"
        except ValueError:
            pass
    return text


def _item_mark(item: dict[str, Any], data: dict[str, Any]) -> str:
    """The line's mark on a member receipt (A3): "3-day return" or "AS IS". Guests get one line for the whole
    receipt instead (``_is_guest_as_is``); anything else (no mark, an unknown value, no member) prints nothing."""
    if not _is_member_receipt(data) or not isinstance(item, dict):
        return ""
    raw = str(item.get("mark") or "").strip().lower()
    if raw in ("3-day return", "3-day returns", "3 day return"):
        return MARK_3_DAY_RETURN
    if raw in ("as is", "as-is"):
        return MARK_AS_IS
    return ""


def _item_subparts(item: dict[str, Any], data: dict[str, Any]) -> tuple[str, str]:
    """The line under each item, in two parts (owner 2026-10-16: "ThriftBucks first ... separate ThriftBucks from the
    AS IS or Return note"): (ThriftBucks, the mark).
    - a member: ("+9.60 ThriftBucks", "3-day return") or ("+1.60 ThriftBucks", "AS IS"); the mark alone when the
      dashboard sends no ``bucks``;
    - a non-member: what joining would have given, ("Join for +9.60 ThriftBucks", "3-day return"); a line that would
      be AS IS anyway shows only its ThriftBucks.
    ThriftBucks are a number next to the word, never "$"."""
    if _tp(data) is None or not isinstance(item, dict):
        return ("", "")
    bucks = _as_money(item.get("bucks")) or 0.0
    bucks_text = f"+{_tb(bucks)} ThriftBucks" if bucks > 0 else ""
    if _is_member_receipt(data):
        return (bucks_text, _item_mark(item, data))
    mark = MARK_3_DAY_RETURN if _is_return_mark(item.get("join_mark")) else ""
    if not bucks_text and not mark:
        return ("", "")
    return ((f"Join for {bucks_text}" if bucks_text else "Join for:"), mark)


def _item_subline(item: dict[str, Any], data: dict[str, Any]) -> str:
    """The sub-line as one line of text (the text tape): "+9.60 ThriftBucks | 3-day return"."""
    return " | ".join(part for part in _item_subparts(item, data) if part)


def _comma_lines(text: str, width: int = W) -> list[str]:
    """Split a Thrift+ line at ", " when it is wider than the tape, so "$17.50 off" or "use by Nov 19" never
    wraps apart. The continuation is indented two spaces."""
    if len(text) <= width:
        return [text]
    parts = text.split(", ")
    lines: list[str] = []
    cur = ""
    for i, part in enumerate(parts):
        piece = part + ("," if i < len(parts) - 1 else "")
        if not cur:
            cur = piece
        elif len(cur) + 1 + len(piece) <= width:
            cur = f"{cur} {piece}"
        else:
            lines.append(cur)
            cur = f"  {piece}"
    lines.append(cur)
    return lines


def _bucks_used_row(data: dict[str, Any]) -> tuple[str, str] | None:
    """ "ThriftBucks used 33.27": kept ThriftBucks spent on this trip, a discount before tax (T3), so the row sits
    above Subtotal. A number, never "$"."""
    if not _is_member_receipt(data):
        return None
    used = _tp_amount(_tp(data), "bucks_used")
    if used <= 0:
        return None
    return ("ThriftBucks used", _tb(used))


def _bottom_block(data: dict[str, Any]) -> tuple[str, list[tuple[str, bool]], list[str]]:
    """The black block at the bottom of every receipt (owner 2026-10-16): (head, lines as (text, bold), fine print).
    No balances (owner: "do not say anything about balance").

    - A member: "THRIFT+ MEMBER Pat" (the first name, or the words alone; no card, no last 4); "You collected 20.00
      ThriftBucks, use by Nov 19" and/or "You used 35.00 ThriftBucks" (or "You used 35.00 ThriftBucks instantly:
      $17.50 off"); "You have 2 items that qualify for 3-day returns"; "SOLD AS IS unless marked 3-day return"; then
      B12 word for word in small type.
    - A non-member: "NON-MEMBER", "You missed out on 12.60 ThriftBucks and 1 item that qualifies for a 3-day return",
      how to join, "All sales final. Sold AS IS."
    - No Thrift+ on the payload (Thrift+ off, an old dashboard): the NO REFUNDS block as before.

    "Collected", never "earned" (V2: a receipt never says "earn").
    """
    tp = _tp(data)
    if tp is None:
        return (RECEIPT_POLICY_PNG_HEADLINE, [(RECEIPT_POLICY_PNG_SUB, True)], list(RECEIPT_POLICY_LINES))
    returns = _return_items(data)
    if not _is_member_receipt(data):
        lines: list[tuple[str, bool]] = []
        missed = _missed_bucks(data)
        parts = []
        if missed:
            parts.append(f"+{missed} ThriftBucks")
        if returns:
            parts.append("1 return" if returns == 1 else f"{returns} returns")
        if parts:
            lines.append(("You missed " + " and ".join(parts), True))
        lines.append((BLOCK_JOIN, False))
        lines.append((BLOCK_NON_MEMBER_AS_IS, True))
        return (BLOCK_HEAD_NON_MEMBER, lines, [])

    member = _tp_member(data)
    head = f"{BLOCK_HEAD_MEMBER} {member}" if member else BLOCK_HEAD_MEMBER
    # Today's ThriftBucks on one line (owner 2026-10-16: no use-by date, no balances):
    # "+20.00 ThriftBucks today · -35.00 used", or "-35.00 ThriftBucks instantly: $17.50 off".
    instant_off = _tp_amount(tp, "instant_off")
    instant_bucks = _tp_amount(tp, "instant_bucks")
    collected = _tp_amount(tp, "collected")
    used = _tp_amount(tp, "bucks_used")
    parts = []
    if instant_off > 0 or instant_bucks > 0:  # one choice per trip (B1): redeemed instantly, nothing kept
        text = f"-{_tb(instant_bucks)} ThriftBucks instantly" if instant_bucks > 0 else "ThriftBucks instantly"
        parts.append(text + (f": ${instant_off:.2f} off" if instant_off > 0 else ""))
    elif collected > 0:
        parts.append(f"+{_tb(collected)} ThriftBucks today")
    if used > 0:
        parts.append(f"-{_tb(used)} used")
    lines = [(" · ".join(parts), True)] if parts else []
    # B12 (the new words) at normal size in the block; the item groups say what is AS IS.
    return (head, lines, [THRIFT_PLUS_TERMS_LINE])


def _credit_paid_row(data: dict[str, Any]) -> tuple[str, str] | None:
    """Thrift+ credit that paid part of a member's total, a payment row ("Thrift+ credit  $40.00")."""
    if not _is_member_receipt(data):
        return None
    paid = _tp_amount(_tp(data), "credit_used")
    return ("Thrift+ credit", f"${paid:.2f}") if paid > 0 else None


def _block_text_lines(text: str) -> list[str]:
    """One block line on the tape: split at ", " first (so "use by Nov 19" never wraps apart), then by words."""
    out: list[str] = []
    for part in _comma_lines(text):
        out.extend(_wrap_chars(part.strip()))
    return out


# Phrases a wrap never splits (Thrift+ words read as one term on the tape).
_WRAP_GLUE: tuple[str, ...] = ("3-day return", "Thrift+ credit", "30 days")


def _wrap_chars(text: str, width: int = W) -> list[str]:
    """Word-wrap so no line is longer than ``width`` (GDI font is sized for ``W``)."""
    glued = text or ""
    for phrase in _WRAP_GLUE:
        glued = glued.replace(phrase, phrase.replace(" ", "\x00"))
    if glued != (text or ""):
        return [ln.replace("\x00", " ") for ln in _wrap_chars_plain(glued, width)]
    return _wrap_chars_plain(glued, width)


def _wrap_chars_plain(text: str, width: int = W) -> list[str]:
    words = (text or "").split()
    if not words:
        return [""]
    lines: list[str] = []
    cur: list[str] = []
    for word in words:
        trial = " ".join(cur + [word])
        if len(trial) <= width:
            cur.append(word)
            continue
        if cur:
            lines.append(" ".join(cur))
        while len(word) > width:
            lines.append(word[:width])
            word = word[width:]
        cur = [word] if word else []
    if cur:
        lines.append(" ".join(cur))
    return lines


# Storefront is print-server owned. Incoming receipt_data must not override it
# (POS and Admin → Settings used to send / expose a different name, hours, footer).
RECEIPT_STORE_NAME = "Eco-Thrift - Canfield"
RECEIPT_TAGLINE = "Another chance for everything and everyone"
RECEIPT_STORE_ADDRESS: tuple[str, ...] = (
    "8425 W Center Rd",
    "Omaha, NE 68124",
)
RECEIPT_STORE_PHONE = "(402) 881-9861"
RECEIPT_STORE_HOURS: tuple[str, ...] = (
    "Tue - Sat 9 AM - 6 PM",
    "Sun & Mon Closed",
)
RECEIPT_FOOTER = "Thank you for shopping Eco-Thrift Canfield"
RECEIPT_WEBSITE = "ecothrift.us"

# The Google review note: one small line right above the black block (owner 2026-10-16: "VERY small, 1 line").
RECEIPT_REVIEW_LINE = "Google review: 5% off your next visit, max $5"

def format_receipt(data: dict[str, Any]) -> bytes:
    """The print job for a sale: the receipt as one picture (``receipt_raster``, 1.9.2), or the text tape if drawing
    it fails for any reason (a sale's receipt must always print)."""
    try:
        from services.receipt_raster import receipt_escpos

        return receipt_escpos(data)
    except Exception:  # noqa: BLE001
        logger.exception("Receipt picture failed; printing the text tape")
        return format_receipt_tape(data)


def format_receipt_tape(data: dict[str, Any]) -> bytes:
    """The text tape (the fallback): a complete ESC/POS byte stream from receipt_data.

    Header is the hardcoded storefront (name, tagline, address, phone, hours).
    Sale payload may only supply lines, totals, and payment — never branding.
    """
    buf = bytearray(INIT)
    training = _is_training(data)

    def training_banner() -> bytes:
        return (
            CENTER + BOLD_ON + DOUBLE_HW + _line(TRAINING_BANNER) + NORMAL + BOLD_OFF + LEFT + _separator("*")
        )

    def emit_rows(rows: list[tuple[str, str | None, bool]]) -> None:
        nonlocal buf
        for label, amount, bold in rows:
            if amount is None:
                segs = [label] if len(_ascii(label)) <= W else _wrap_chars(label)
                body = b"".join(_line(w) for w in segs)
                buf += (BOLD_ON + body + BOLD_OFF) if bold else body
            elif bold:
                buf += BOLD_ON + _lr(label, amount) + BOLD_OFF
            else:
                buf += _lr(label, amount)

    if training:
        buf += training_banner()

    # --- Store header (always the Canfield storefront; ignore payload branding) ---
    buf += CENTER
    buf += DOUBLE_HW + BOLD_ON
    buf += _line(RECEIPT_STORE_NAME)
    buf += NORMAL + BOLD_OFF
    buf += _line(RECEIPT_TAGLINE)
    buf += _line()
    for part in RECEIPT_STORE_ADDRESS:
        buf += _line(part)
    buf += _line()
    buf += BOLD_ON + _line("STORE HOURS") + BOLD_OFF
    for part in RECEIPT_STORE_HOURS:
        buf += _line(part)
    buf += LEFT
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
            for wrapped in _wrap_chars(str(name)):
                buf += _line(wrapped)
            buf += _lr(f"  {qty} x ${unit:.2f}", f"${total:.2f}")
        else:
            buf += _lr(name, f"${total:.2f}")
        sub = _item_subline(item, data)
        if sub:
            buf += FONT_SMALL + b"".join(_line(f"    {ln}") for ln in _wrap_chars(sub, W - 4)) + NORMAL

    buf += _separator()

    # --- Totals ---
    subtotal = data.get("subtotal", 0)
    tax = data.get("tax", 0)
    total = data.get("total", subtotal + tax)
    bucks_used = _bucks_used_row(data)
    if bucks_used:
        buf += _lr(*bucks_used)
    buf += _lr("Subtotal", f"${subtotal:.2f}")
    if tax:
        buf += _lr("Tax", f"${tax:.2f}")
    buf += BOLD_ON + DOUBLE_HEIGHT
    buf += _lr("TOTAL", f"${total:.2f}")
    buf += NORMAL + BOLD_OFF
    buf += _separator()

    sav = _savings_rows(data)
    if sav:
        total_saved, rows = sav
        buf += REVERSE_ON + BOLD_ON
        buf += _lr(" YOU SAVED", f"${total_saved:.2f} ")
        buf += BOLD_OFF + REVERSE_OFF
        for label, amt in rows:
            buf += _lr(f"   {label}", _savings_amount(label, amt))
        buf += _separator()

    # --- Payment ---
    if data.get("payment_method"):
        buf += _lr("Payment", data["payment_method"])
    if data.get("amount_tendered") is not None:
        buf += _lr("Tendered", f"${data['amount_tendered']:.2f}")
    if data.get("change") is not None:
        buf += _lr("Change", f"${data['change']:.2f}")
    credit = _credit_paid_row(data)
    if credit:
        buf += _lr(*credit)
    emit_rows(_card_payment_rows(data))
    buf += _separator("=")

    # --- Footer: thanks, the review line, then the block between two heavy rules ---
    buf += CENTER + _line(RECEIPT_FOOTER)
    buf += BOLD_ON + _line(RECEIPT_REVIEW_LINE) + BOLD_OFF
    buf += LEFT + _separator("=")
    head, block_lines, fine = _bottom_block(data)
    buf += CENTER + BOLD_ON + DOUBLE_HEIGHT + b"".join(_line(ln) for ln in _wrap_chars(head)) + NORMAL + BOLD_OFF
    for text, bold in block_lines:
        body = b"".join(_line(ln) for ln in _block_text_lines(text))
        buf += (BOLD_ON + body + BOLD_OFF) if bold else body
    for text in fine:
        buf += FONT_SMALL + b"".join(_line(ln) for ln in _wrap_chars(text)) + NORMAL
    buf += LEFT + _separator("=")

    if training:
        buf += _line()
        buf += _separator("*")
        buf += training_banner()

    # --- Feed & cut ---
    buf += FEED_LINES(4)
    buf += PARTIAL_CUT

    return bytes(buf)


_TEST_DATA: dict[str, Any] = {
    "store_name": "Eco-Thrift - Canfield",
    "store_address": "8425 W Center Rd\nOmaha, NE 68124",
    "store_hours": "Tue - Sat 9 AM - 6 PM\nSun & Mon Closed",
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
    "savings": {
        "total": 18.50,
        "lines": [
            {"label": "Labor Day 10%", "amount": 10.00},
            {"label": "Summer 50%", "amount": 8.50},
        ],
    },
    "subtotal": 22.48,
    "tax": 1.57,
    "total": 24.05,
    "payment_method": "Cash",
    "amount_tendered": 25.00,
    "change": 0.95,
    "footer": "Thank you for shopping Eco-Thrift Canfield",
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
    training = _is_training(data)
    if training:
        lines.extend(["*" * W, TRAINING_BANNER.center(W), "*" * W])

    def emit_rows(rows: list[tuple[str, str | None, bool]]) -> None:
        for label, amount, _bold in rows:
            if amount is None:
                lines.extend([label] if len(label) <= W else _wrap_chars(label))
            else:
                lines.append(_txt_lr(label, amount))

    for part in _wrap_chars(str(data.get("store_name", "Eco-Thrift"))):
        lines.append(part.center(W))
    if data.get("store_phone"):
        lines.append(_txt_lr("Phone:", str(data["store_phone"]).strip()))
    if data.get("store_hours"):
        lines.append("Hours:")
        for part in str(data["store_hours"]).split("\n"):
            if part.strip():
                for wrapped in _wrap_chars(part.strip()):
                    lines.append(wrapped.center(W))
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
            lines.extend(_wrap_chars(str(name)))
            lines.append(_txt_lr(f"  {qty} x ${unit:.2f}", f"${total:.2f}"))
        else:
            lines.append(_txt_lr(name, f"${total:.2f}"))
        sub = _item_subline(item, data)
        if sub:
            lines.extend(f"    {ln}" for ln in _wrap_chars(sub, W - 4))

    lines.append("-" * W)

    subtotal = data.get("subtotal", 0)
    tax = data.get("tax", 0)
    total = data.get("total", subtotal + tax)
    bucks_used = _bucks_used_row(data)
    if bucks_used:
        lines.append(_txt_lr(*bucks_used))
    lines.append(_txt_lr("Subtotal", f"${subtotal:.2f}"))
    if tax:
        lines.append(_txt_lr("Tax", f"${tax:.2f}"))
    lines.append(_txt_lr("TOTAL", f"${total:.2f}"))
    lines.append("-" * W)

    sav = _savings_rows(data)
    if sav:
        total_saved, rows = sav
        lines.append(_txt_lr("YOU SAVED", f"${total_saved:.2f}"))
        for label, amt in rows:
            lines.append(_txt_lr(f"   {label}", _savings_amount(label, amt)))
        lines.append("-" * W)

    if data.get("payment_method"):
        lines.append(_txt_lr("Payment", data["payment_method"]))
    if data.get("amount_tendered") is not None:
        lines.append(_txt_lr("Tendered", f"${data['amount_tendered']:.2f}"))
    if data.get("change") is not None:
        lines.append(_txt_lr("Change", f"${data['change']:.2f}"))
    credit = _credit_paid_row(data)
    if credit:
        lines.append(_txt_lr(*credit))
    emit_rows(_card_payment_rows(data))

    lines.append("=" * W)
    footer = data.get("footer", "Thank you for shopping at Eco-Thrift!")
    for part in str(footer).split("\n"):
        if part.strip():
            for wrapped in _wrap_chars(part.strip()):
                lines.append(wrapped.center(W).rstrip())
    if data.get("store_address"):
        lines.append("-" * W)
        for part in str(data["store_address"]).split("\n"):
            if part.strip():
                for wrapped in _wrap_chars(part.strip()):
                    lines.append(wrapped.center(W).rstrip())
    lines.append(RECEIPT_REVIEW_LINE.center(W).rstrip())
    head, block_lines, fine = _bottom_block(data)
    lines.append("#" * W)
    lines.extend(ln.center(W).rstrip() for ln in _wrap_chars(head))
    for text, _bold in block_lines:
        lines.extend(ln.center(W).rstrip() for ln in _block_text_lines(text))
    for text in fine:
        lines.extend(ln.center(W).rstrip() for ln in _wrap_chars(text))
    lines.append("#" * W)
    if training:
        lines.extend(["*" * W, TRAINING_BANNER.center(W), "*" * W])
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
    glued = text or ""
    for phrase in _WRAP_GLUE:
        glued = glued.replace(phrase, phrase.replace(" ", "\x00"))
    words = glued.split()
    if not words:
        return [""]
    lines: list[str] = []
    cur: list[str] = []
    for w in words:
        trial = " ".join(cur + [w]).replace("\x00", " ")
        if _text_w(draw, trial, font) <= max_w:
            cur.append(w)
        else:
            if cur:
                lines.append(" ".join(cur))
            cur = [w]
    if cur:
        lines.append(" ".join(cur))
    return [ln.replace("\x00", " ") for ln in lines]


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
    training = _is_training(data)

    def _training_band() -> None:
        """Black band, white type: a practice sale must not pass for a real receipt."""
        nonlocal y
        band_h = 52 * S
        draw.rectangle([x0, y, x1, y + band_h], fill=(0, 0, 0))
        tw = _text_w(draw, TRAINING_BANNER, f_saved)
        draw.text(
            (x0 + (inner - tw) / 2, y + (band_h - _text_h(f_saved)) // 2),
            TRAINING_BANNER,
            font=f_saved,
            fill=(255, 255, 255),
        )
        y += band_h + 14 * S

    if training:
        _training_band()

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
        sub = _item_subline(item, data)
        if sub:
            y -= 4 * S
            draw.text((x0 + 14 * S, y), sub, font=f_small, fill=t["muted"])
            y += _text_h(f_small) + 6 * S

    draw.line([x0, y, x1, y], fill=t["rule"], width=lw1)
    y += 14 * S

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

    bucks_used = _bucks_used_row(data)
    if bucks_used:
        _lr_money(bucks_used[0], bucks_used[1], f_sub, f_money)
    _lr_money("Subtotal", f"${subtotal:.2f}", f_sub, f_money)
    if tax:
        _lr_money("Tax", f"${tax:.2f}", f_sub, f_money)
    _lr_money("TOTAL", f"${total:.2f}", f_total_row_label, f_total, big=True)
    y += 8 * S

    sav = _savings_rows(data)
    if sav:
        total_saved, rows = sav
        banner_h = 58 * S
        _fill_rounded(draw, (x0, y, x1, y + banner_h), max(2, 8 * S), t["saved_bg"])
        msg = f"YOU SAVED  ${total_saved:.2f}"
        if theme_key == "emoji":
            msg = f"💚 YOU SAVED  ${total_saved:.2f}  💚"
        tw = _text_w(draw, msg, f_saved)
        draw.text(
            (x0 + (inner - tw) / 2, y + (banner_h - _text_h(f_saved)) // 2),
            msg,
            font=f_saved,
            fill=t["saved_text"],
        )
        y += banner_h + 10 * S
        for label, amt in rows:
            _lr_money(f"   {label}", _savings_amount(label, amt), f_sub, f_money)
        y += 6 * S

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

    def _emit_rows(rows: list[tuple[str, str | None, bool]], *, text_rows_plain: bool) -> None:
        nonlocal y
        merged: list[tuple[str, str | None, bool]] = []
        for row in rows:  # the tape splits long Thrift+ lines at a comma; the PNG has room to rejoin them
            if merged and row[1] is None and merged[-1][1] is None and row[0].startswith("  "):
                prev = merged.pop()
                row = (f"{prev[0]} {row[0].strip()}", None, prev[2])
            merged.append(row)
        for label, amount, bold in merged:
            if amount is None:
                font = f_label_b if bold else (f_sub if text_rows_plain else f_small)
                fill = t["text"] if (bold or text_rows_plain) else t["muted"]
                if text_rows_plain and label.startswith("  "):
                    y -= 4 * S  # a continuation sits under its first line
                fits = _text_w(draw, label, font) <= inner
                for ln in ([label] if fits else _wrap_text(label, font, draw, inner)):
                    draw.text((x0, y), ln, font=font, fill=fill)
                    y += _text_h(font) + 2 * S
                if text_rows_plain:
                    y += 4 * S
            else:
                _lr_money(label, amount, f_total if bold else f_sub, f_money)

    _emit_rows(_card_payment_rows(data), text_rows_plain=False)

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

    # --- The review note (one small line), then the black block ---
    f_review = _sans_reg(11 * S)
    rw = _text_w(draw, RECEIPT_REVIEW_LINE, f_review)
    draw.text((x0 + (inner - rw) / 2, y), RECEIPT_REVIEW_LINE, font=f_review, fill=t["muted"])
    y += _text_h(f_review) + 8 * S

    policy_top = y
    head, block_lines, fine = _bottom_block(data)
    pad = 16 * S
    box_w = inner - 2 * pad
    f_head = f_policy_h
    for size in (34, 30, 26, 22):
        f_head = _sans_bold(size * S)
        if _text_w(draw, head, f_head) <= box_w:
            break
    f_line_b = _sans_bold(16 * S)
    f_line = _sans_reg(15 * S)
    rows: list[tuple[str, ImageFont.ImageFont, tuple[int, int, int], int]] = []  # text, font, fill, gap after
    for ln in _wrap_text(head, f_head, draw, box_w):
        rows.append((ln, f_head, t["policy_text"], 4 * S))
    rows[-1] = (*rows[-1][:3], 12 * S)
    for text, bold in block_lines:
        font = f_line_b if bold else f_line
        for ln in _wrap_text(text, font, draw, box_w):
            rows.append((ln, font, t["policy_text"] if bold else t["policy_sub"], 5 * S))
    if fine:
        rows[-1] = (*rows[-1][:3], 12 * S)
        for text in fine:
            for ln in _wrap_text(text, f_policy_s, draw, box_w):
                rows.append((ln, f_policy_s, t["policy_sub"], 2 * S))
            rows[-1] = (*rows[-1][:3], 6 * S)
    policy_h = 2 * pad + sum(_text_h(f) + gap for _ln, f, _fill, gap in rows)
    _fill_rounded(draw, (x0, policy_top, x1, policy_top + policy_h), max(2, 10 * S), t["policy_bg"])
    py = policy_top + pad
    for ln, font, fill, gap in rows:
        lw = _text_w(draw, ln, font)
        draw.text((x0 + (inner - lw) / 2, py), ln, font=font, fill=fill)
        py += _text_h(font) + gap

    y = policy_top + policy_h + margin
    if training:
        y = policy_top + policy_h + 16 * S
        _training_band()
        y += margin - 14 * S
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
