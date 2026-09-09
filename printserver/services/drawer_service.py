"""Cash drawer control via ESC/POS kick-pulse command."""

from __future__ import annotations

import logging

from config import DRAWER_OFF_MS, DRAWER_ON_MS, DRAWER_PIN
from services.printer_manager import send_raw
from services.settings_store import get as get_setting

logger = logging.getLogger(__name__)

ESC = b"\x1b"


def _resolve_pin(pin: int | None) -> int:
    if pin is not None:
        return pin if pin in (0, 1) else DRAWER_PIN
    saved = get_setting("drawer_pin")
    try:
        saved_i = int(saved)
    except (TypeError, ValueError):
        saved_i = DRAWER_PIN
    return saved_i if saved_i in (0, 1) else DRAWER_PIN


def _build_kick_command(pin: int = DRAWER_PIN, on_ms: int = DRAWER_ON_MS, off_ms: int = DRAWER_OFF_MS) -> bytes:
    """ESC p <pin> <on_time> <off_time>  — standard drawer kick pulse."""
    return ESC + b"p" + bytes([pin, on_ms, off_ms])


def kick_drawer(printer_name: str, pin: int | None = None) -> None:
    resolved = _resolve_pin(pin)
    cmd = _build_kick_command(resolved)
    send_raw(printer_name, "Drawer-Kick", cmd)
    logger.info("Cash drawer kick sent to %s (pin %d)", printer_name, resolved)
