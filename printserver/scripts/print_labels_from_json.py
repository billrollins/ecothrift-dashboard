#!/usr/bin/env python3
"""
Print labels from a JSON array of LabelPrintRequest-shaped objects.

Run from the printserver directory:
  python scripts/print_labels_from_json.py --file path/to/labels.json
  python scripts/print_labels_from_json.py --file path/to/labels.json --dry-run --limit 3
  python scripts/print_labels_from_json.py --file path/to/labels.json --preset 1.5x1   # smaller stock
  python scripts/print_labels_from_json.py --file path/to/labels.json --limit 0   # all rows in JSON
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import DEFAULT_LABEL_PRINTER


def main() -> int:
    parser = argparse.ArgumentParser(description="Print labels from a JSON file (array of label objects).")
    parser.add_argument(
        "--file",
        "-f",
        type=Path,
        required=True,
        help="JSON file: [ { text, qr_data, product_title, product_brand?, product_model? }, ... ]",
    )
    parser.add_argument(
        "--printer",
        default=DEFAULT_LABEL_PRINTER,
        help=f"Windows printer queue name (default: {DEFAULT_LABEL_PRINTER})",
    )
    parser.add_argument(
        "--preset",
        choices=("3x2", "1.5x1"),
        default="3x2",
        help="Label paper size in inches (default: 3x2 — same as DEFAULT_LABEL_SIZE_PRESET / Rollo 3×2 stock)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Write PNGs instead of printing")
    parser.add_argument("--out-dir", type=Path, default=None, help="Output dir for --dry-run (default: printserver/output/e2e_retag)")
    parser.add_argument(
        "--limit",
        "-n",
        type=int,
        default=None,
        metavar="N",
        help="Print only the first N rows (omit or use 0 for all rows in the JSON file).",
    )
    args = parser.parse_args()

    path = args.file.resolve()
    if not path.is_file():
        print(f"Error: file not found: {path}", file=sys.stderr)
        return 1

    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        print("Error: JSON root must be an array", file=sys.stderr)
        return 1

    if args.limit is not None and args.limit > 0:
        raw = raw[: args.limit]

    from config import LABEL_DPI
    from models import LabelPrintRequest
    from services.label_printer import generate_label
    from services.printer_manager import send_image

    out_dir = args.out_dir or (ROOT / "output" / "e2e_retag")
    if args.dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)

    for i, row in enumerate(raw):
        if not isinstance(row, dict):
            print(f"Error: row {i} must be an object", file=sys.stderr)
            return 1
        req = LabelPrintRequest(
            text=row["text"],
            qr_data=row["qr_data"],
            include_text=row.get("include_text", True),
            product_title=row.get("product_title"),
            product_brand=row.get("product_brand"),
            product_model=row.get("product_model"),
        )
        image = generate_label(req, label_size_preset=args.preset)
        if args.dry_run:
            stem = path.stem
            out = out_dir / f"{stem}_{args.preset}_{i}.png"
            image.save(out)
            print(f"Wrote {out}")
        else:
            send_image(args.printer, image, LABEL_DPI, doc_name=f"E2E-{row.get('qr_data', i)}")
            print(f"Sent label {i} to {args.printer!r} ({args.preset})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
