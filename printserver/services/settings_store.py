"""Persist printer assignments to a JSON file next to the executable."""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# When frozen (PyInstaller), store next to the .exe; otherwise next to main.py.
if getattr(sys, "frozen", False):
    _BASE_DIR = Path(sys.executable).parent
else:
    _BASE_DIR = Path(__file__).resolve().parent.parent

SETTINGS_FILE = _BASE_DIR / "settings.json"

_DEFAULTS: dict[str, Any] = {
    "label_printer": None,
    "receipt_printer": None,
    # URL to the public version-check endpoint on the dashboard backend.
    # Example: https://yourdomain.com/api/core/system/print-server-version-public/
    "update_check_url": "",
}


def _read() -> dict[str, Any]:
    if SETTINGS_FILE.exists():
        try:
            return {**_DEFAULTS, **json.loads(SETTINGS_FILE.read_text("utf-8"))}
        except Exception:
            logger.warning("Corrupt settings file, using defaults")
    return dict(_DEFAULTS)


def _write(data: dict[str, Any]) -> None:
    SETTINGS_FILE.write_text(json.dumps(data, indent=2), "utf-8")
    logger.info("Settings saved to %s", SETTINGS_FILE)


def get_all() -> dict[str, Any]:
    return _read()


def get(key: str) -> Any:
    return _read().get(key)


def update(patch: dict[str, Any]) -> dict[str, Any]:
    current = _read()
    current.update(patch)
    _write(current)
    return current
