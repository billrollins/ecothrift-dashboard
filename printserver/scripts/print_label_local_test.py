#!/usr/bin/env python3
"""
Print Eco-Thrift labels locally without starting the FastAPI server.

Default data: ``workspace/testing/data/retag_e2e_10_items.json`` (repo root relative to
``printserver/``). Use ``--sample`` for embedded ``label_test_data.SAMPLE_LABEL_ROWS``.

Run from the printserver directory (see dev_print_label_test.bat):
  python scripts/print_label_local_test.py --dry-run
  python scripts/print_label_local_test.py --printer "Rollo Printer" --preset 1.5x1 --limit 3
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# printserver/ as cwd — same as main.py
ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
DEFAULT_E2E_JSON = REPO_ROOT / "workspace" / "testing" / "data" / "retag_e2e_10_items.json"

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import DEFAULT_LABEL_PRINTER


def _load_rows(
    *,
    file: Path | None,
    sample: bool,
) -> tuple[list[dict[str, object]], str]:
    """Return rows and a stem for output filenames."""
    if sample:
        from label_test_data import SAMPLE_LABEL_ROWS

        return [dict(r) for r in SAMPLE_LABEL_ROWS], "sample_label_rows"

    path = file if file is not None else DEFAULT_E2E_JSON
    if path.is_file():
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            raise SystemExit("Error: JSON root must be an array")
        return [dict(r) for r in raw], path.stem

    from label_test_data import SAMPLE_LABEL_ROWS

    print(
        f"Note: label data file not found ({path}); using label_test_data.SAMPLE_LABEL_ROWS",
        file=sys.stderr,
    )
    return [dict(r) for r in SAMPLE_LABEL_ROWS], "sample_label_rows"


def main() -> int:
    parser = argparse.ArgumentParser(description="Print sample labels to a Windows printer (no HTTP server).")
    parser.add_argument(
        "--printer",
        default=DEFAULT_LABEL_PRINTER,
        help=f"Windows printer queue name (default: {DEFAULT_LABEL_PRINTER})",
    )
    parser.add_argument(
        "--preset",
        choices=("3x2", "1.5x1"),
        default="3x2",
        help="Label paper preset (default: 3x2)",
    )
    parser.add_argument(
        "--file",
        "-f",
        type=Path,
        default=None,
        help=f"JSON array of label objects (default: {DEFAULT_E2E_JSON})",
    )
    parser.add_argument(
        "--sample",
        action="store_true",
        help="Use embedded SAMPLE_LABEL_ROWS instead of the default JSON file",
    )
    parser.add_argument(
        "--limit",
        "-n",
        type=int,
        default=None,
        metavar="N",
        help="Print only the first N rows (default: all)",
    )
    parser.add_argument(
        "--row",
        default="all",
        help='Row index (0-based) or "all" to print every loaded row (applied after --limit)',
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Write PNG files instead of sending to the printer",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=ROOT / "output",
        help="Directory for --dry-run PNGs (default: printserver/output/)",
    )
    args = parser.parse_args()

    try:
        rows, stem = _load_rows(file=args.file, sample=args.sample)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.limit is not None and args.limit > 0:
        rows = rows[: args.limit]

    if args.row.lower() != "all":
        try:
            idx = int(args.row, 10)
        except ValueError:
            print("Error: --row must be an integer or 'all'", file=sys.stderr)
            return 1
        if idx < 0 or idx >= len(rows):
            print(f"Error: --row {idx} out of range (0..{len(rows) - 1})", file=sys.stderr)
            return 1
        rows = [rows[idx]]

    if args.dry_run:
        args.out_dir.mkdir(parents=True, exist_ok=True)

    from config import LABEL_DPI
    from models import LabelPrintRequest
    from services.label_printer import generate_label
    from services.printer_manager import send_image

    for i, row in enumerate(rows):
        req = LabelPrintRequest(
            text=str(row["text"]),
            qr_data=str(row["qr_data"]),
            include_text=bool(row.get("include_text", True)),
            product_title=row.get("product_title"),
            product_brand=row.get("product_brand"),
            product_model=row.get("product_model"),
        )
        image = generate_label(req, label_size_preset=args.preset)
        if args.dry_run:
            out = args.out_dir / f"{stem}_{args.preset}_{i}.png"
            image.save(out)
            print(f"Wrote {out}")
        else:
            send_image(args.printer, image, LABEL_DPI, doc_name=f"LabelTest-{row['qr_data']}")
            print(f"Sent label {i} to {args.printer!r} ({args.preset})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
