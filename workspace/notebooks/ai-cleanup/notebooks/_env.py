"""Imported by cleanup.ipynb after notebooks/ is placed on sys.path."""
from __future__ import annotations

import sys
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_SRC = _PROJECT_ROOT / "src"
if _SRC.is_dir() and str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

PROJECT_ROOT = _PROJECT_ROOT
