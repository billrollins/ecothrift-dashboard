"""Cash drawer control via ESC/POS kick-pulse command."""

from __future__ import annotations

import logging
from typing import Literal

from config import DRAWER_OFF_MS, DRAWER_ON_MS, DRAWER_PIN
from services.printer_manager import send_raw
from services.settings_store import get as get_setting

logger = logging.getLogger(__name__)

ESC = b"\x1b"

DrawerPin = Literal[0, 1, "both"]


def normalize_drawer_pin(raw) -> DrawerPin:
    if raw == "both" or raw is True:
        return "both"
    if raw in (0, "0"):
        return 0
    if raw in (1, "1"):
        return 1
    return DRAWER_PIN if DRAWER_PIN in (0, 1, "both") else "both"


def _resolve_pin(pin: DrawerPin | int | str | None) -> DrawerPin:
    if pin is not None:
        return normalize_drawer_pin(pin)
    return normalize_drawer_pin(get_setting("drawer_pin"))


def _build_kick_command(pin: int, on_ms: int = DRAWER_ON_MS, off_ms: int = DRAWER_OFF_MS) -> bytes:
    """ESC p <pin> <on_time> <off_time>  — standard drawer kick pulse."""
    return ESC + b"p" + bytes([pin, on_ms, off_ms])


def build_kick_bytes(pin: DrawerPin | int | str | None = None) -> bytes:
    resolved = _resolve_pin(pin)
    if resolved == "both":
        return _build_kick_command(0) + _build_kick_command(1)
    return _build_kick_command(int(resolved))


def kick_drawer(printer_name: str, pin: DrawerPin | int | str | None = None) -> None:
    resolved = _resolve_pin(pin)
    cmd = build_kick_bytes(resolved)
    send_raw(printer_name, "Drawer-Kick", cmd)
    logger.info("Cash drawer kick sent to %s (pin %s)", printer_name, resolved)
