"""Receipt formatting — ESC/POS for thermal printers, plain-text for GDI."""

from __future__ import annotations

from typing import Any

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

    Expected keys in `data`:
        store_name, store_address, store_phone  (header)
        receipt_number, date, time, cashier      (meta)
        items: [{name, quantity, unit_price, line_total}]
        subtotal, tax, total                     (totals)
        payment_method, amount_tendered, change  (payment)
        footer                                   (optional)
    """
    buf = bytearray(INIT)

    # --- Store header ---
    buf += CENTER + DOUBLE_HW + BOLD_ON
    buf += _line(data.get("store_name", "Eco-Thrift"))
    buf += NORMAL + BOLD_OFF
    if data.get("store_address"):
        buf += _line(data["store_address"])
    if data.get("store_phone"):
        buf += _line(data["store_phone"])
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
            buf += _line(name)
            buf += _lr(f"  {qty} x ${unit:.2f}", f"${total:.2f}")
        else:
            buf += _lr(name, f"${total:.2f}")

    buf += _separator()

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
    buf += _center_text(footer)

    # --- Feed & cut ---
    buf += FEED_LINES(4)
    buf += PARTIAL_CUT

    return bytes(buf)


_TEST_DATA: dict[str, Any] = {
    "store_name": "Eco-Thrift",
    "store_address": "Omaha, NE",
    "receipt_number": "R-TEST-001",
    "date": "2026-01-01",
    "time": "12:00 PM",
    "cashier": "Test Cashier",
    "items": [
        {"name": "Widget", "quantity": 2, "unit_price": 4.99, "line_total": 9.98},
        {"name": "Gadget", "quantity": 1, "unit_price": 12.50, "line_total": 12.50},
    ],
    "subtotal": 22.48,
    "tax": 1.57,
    "total": 24.05,
    "payment_method": "Cash",
    "amount_tendered": 25.00,
    "change": 0.95,
    "footer": "TEST RECEIPT -- Print Server OK",
}


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
    """Plain-text receipt (no ESC/POS control codes)."""
    lines: list[str] = []

    lines.append(data.get("store_name", "Eco-Thrift").center(W))
    if data.get("store_address"):
        lines.append(data["store_address"].center(W))
    if data.get("store_phone"):
        lines.append(data["store_phone"].center(W))
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
    lines.append(footer.center(W))
    lines.append("")

    return "\n".join(lines)


def format_test_receipt_text() -> str:
    return format_receipt_text(_TEST_DATA)
