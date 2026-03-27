"""Load `bstock_config_local` from this package directory."""

from __future__ import annotations

import sys
from pathlib import Path
from types import ModuleType

PACKAGE_DIR = Path(__file__).resolve().parent


def package_dir() -> Path:
    return PACKAGE_DIR


def load_config() -> ModuleType:
    """Import bstock_config_local from Scraper/ (must sit next to this file)."""
    if str(PACKAGE_DIR) not in sys.path:
        sys.path.insert(0, str(PACKAGE_DIR))
    try:
        import bstock_config_local as cfg
    except ImportError as e:
        raise ImportError(
            "Missing Scraper/bstock_config_local.py. Copy Scraper/config.example.py "
            "to bstock_config_local.py and set TOKEN, API_URL, etc."
        ) from e
    return cfg


def config_valid(cfg: ModuleType) -> bool:
    t = (getattr(cfg, "TOKEN", None) or "").strip()
    u = (getattr(cfg, "API_URL", None) or "").strip()
    if not t or not u:
        return False
    if "PASTE" in t.upper() or "PASTE" in u.upper():
        return False
    return True
