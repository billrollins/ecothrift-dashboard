#!/usr/bin/env python3
"""
Print three rich receipt PNGs (same layout as receipt_test.png) to a Windows queue.

Uses render_receipt_to_image (native render_scale) + send_image (GDI raster), not plain format_receipt_text.
Run from the printserver directory (see workspace/receipt_printer/*.bat).

Example (from printserver/):
  python scripts/print_receipt_template_batch.py
  python scripts/print_receipt_template_batch.py --printer "Receipt Printer"
  python scripts/print_receipt_template_batch.py --scale 4
  python scripts/print_receipt_template_batch.py --sweep-third-receipt
  python scripts/print_receipt_template_batch.py --sweep-third-receipt --sweep-scales 1 2 3 4 5 6

``--sweep-third-receipt``: print only the 3rd default fixture (showcase) once per scale for comparing DPI on paper.

PowerShell: run with ``python`` and a path (e.g. ``python scripts/print_receipt_template_batch.py`` from ``printserver/``) — not a bare ``*.py`` name. For ``.bat`` files, use ``.\print_showcase_scale_sweep.bat`` from ``printserver/scripts/`` or pass the full path to ``workspace/receipt_printer/print_showcase_scale_sweep.bat``.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Three distinct receipt_data payloads (fixtures/receipt_data shape).
DEFAULT_FIXTURES: tuple[Path, ...] = (
    ROOT / "fixtures" / "receipt_var_01_minimal.json",
    ROOT / "fixtures" / "receipt_canfield_1.json",
    ROOT / "fixtures" / "receipt_showcase_professional.json",
)

THIRD_DEFAULT_FIXTURE: Path = DEFAULT_FIXTURES[2]


def _load(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path} root must be an object")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Print template receipts (PIL layout) to a thermal/GDI printer.",
    )
    parser.add_argument(
        "--printer",
        default=None,
        help="Windows queue name (default: config DEFAULT_RECEIPT_PRINTER)",
    )
    parser.add_argument(
        "--scale",
        type=int,
        default=None,
        metavar="N",
        help="Native render_scale for render_receipt_to_image (default: config RECEIPT_RENDER_SCALE; "
        "1 = base 680px-wide layout). Ignored when --sweep-third-receipt is set.",
    )
    parser.add_argument(
        "--sweep-third-receipt",
        action="store_true",
        help="Print only receipt_showcase_professional.json (3rd default fixture) once per "
        "--sweep-scales value (native render at each scale) for side-by-side comparison.",
    )
    parser.add_argument(
        "--sweep-scales",
        nargs="+",
        type=int,
        default=None,
        metavar="N",
        help="Scale factors for --sweep-third-receipt (default: 1 2 3 4 5).",
    )
    parser.add_argument(
        "json_files",
        nargs="*",
        help="Optional receipt_data JSON paths (default: 3 built-in fixtures)",
    )
    args = parser.parse_args()

    from config import (
        DEFAULT_RECEIPT_PRINTER,
        LABEL_DPI,
        RECEIPT_RENDER_SCALE,
    )
    from services.printer_manager import send_image
    from services.receipt_printer import render_receipt_to_image

    printer = args.printer or DEFAULT_RECEIPT_PRINTER

    if args.sweep_third_receipt:
        scales = args.sweep_scales if args.sweep_scales is not None else [1, 2, 3, 4, 5]
        for s in scales:
            if s < 1:
                print("Error: each --sweep-scales value must be >= 1", file=sys.stderr)
                return 1
        path = THIRD_DEFAULT_FIXTURE
        if not path.is_file():
            print(f"Error: not a file: {path}", file=sys.stderr)
            return 1
        data = _load(path)
        for scale in scales:
            image = render_receipt_to_image(data, render_scale=scale)
            source_dpi = LABEL_DPI * scale
            doc = f"Receipt-showcase-scale{scale}"
            send_image(printer, image, source_dpi, doc_name=doc)
            print(
                f"Printed {doc} -> {printer!r} ({path.name}, {image.size[0]}x{image.size[1]} px, "
                f"render_scale={scale}, source_dpi={source_dpi})"
            )
        return 0

    scale = args.scale if args.scale is not None else RECEIPT_RENDER_SCALE
    if scale < 1:
        print("Error: --scale must be >= 1", file=sys.stderr)
        return 1

    paths = [Path(p) for p in args.json_files] if args.json_files else list(DEFAULT_FIXTURES)

    for i, path in enumerate(paths):
        if not path.is_file():
            print(f"Error: not a file: {path}", file=sys.stderr)
            return 1
        data = _load(path)
        image = render_receipt_to_image(data, render_scale=scale)
        source_dpi = LABEL_DPI * scale
        doc = f"Receipt-{i + 1}-{path.stem}"
        send_image(printer, image, source_dpi, doc_name=doc)
        print(
            f"Printed {doc} -> {printer!r} ({path.name}, {image.size[0]}x{image.size[1]} px, "
            f"render_scale={scale}, source_dpi={source_dpi})"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
