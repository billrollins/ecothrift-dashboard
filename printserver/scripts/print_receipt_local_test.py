#!/usr/bin/env python3
"""
Render a sample Eco-Thrift receipt to PNG under printserver/output/ (no HTTP server).

Default: writes a PNG (no Windows printer). Use --print when a receipt printer is available.

Run from the printserver directory (see dev_print_receipt_test.bat):
  python scripts/print_receipt_local_test.py
  python scripts/print_receipt_local_test.py --all-fixtures
  python scripts/print_receipt_local_test.py --print
  python scripts/print_receipt_local_test.py path\\to\\receipt_data.json

Drag-drop: drop the .bat with a JSON path (same keys as POST /print/receipt receipt_data).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

FIXTURES_DIR = ROOT / "fixtures"


def _load_receipt_json(path: Path) -> dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except OSError as e:
        print(f"Error: cannot read {path}: {e}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: invalid JSON in {path}: {e}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, dict):
        print("Error: JSON root must be an object (receipt_data dict)", file=sys.stderr)
        sys.exit(1)
    return data


def _render_one(
    receipt_data: dict[str, Any],
    *,
    out_path: Path,
    also_txt: bool,
    send_print: bool,
    printer: str | None,
    layout_style: str | None = None,
) -> None:
    from services.receipt_printer import format_receipt_text, render_receipt_to_image

    text = format_receipt_text(receipt_data)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image = render_receipt_to_image(receipt_data, layout_style=layout_style)
    image.save(out_path, format="PNG")
    print(f"Wrote {out_path}")

    if also_txt:
        txt_path = out_path.with_suffix(".txt")
        txt_path.write_text(text, encoding="utf-8", newline="\n")
        print(f"Wrote {txt_path}")

    if send_print:
        from services.printer_manager import resolve_printer, send_text

        queue = resolve_printer(printer, role="receipt")
        send_text(queue, text, doc_name="ReceiptLocalTest")
        print(f"Sent receipt to {queue!r}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render a test receipt to PNG in printserver/output/ (optional Windows print).",
    )
    parser.add_argument(
        "data_file",
        nargs="?",
        default=None,
        type=Path,
        help="JSON file: receipt_data object (same shape as POST /print/receipt)",
    )
    parser.add_argument(
        "--all-fixtures",
        action="store_true",
        help=f"Render every printserver/fixtures/receipt_*.json to --out-dir (default: {ROOT / 'output'})",
    )
    parser.add_argument(
        "--print",
        dest="send_print",
        action="store_true",
        help="Also send plain text to a Windows printer (single file only; not with --all-fixtures)",
    )
    parser.add_argument(
        "--printer",
        default=None,
        help="With --print: Windows printer queue name (overrides saved receipt_printer)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=ROOT / "output",
        help="Directory for PNG output (default: printserver/output/)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Explicit PNG path (single file only; overrides --out-dir / default filename)",
    )
    parser.add_argument(
        "--txt",
        action="store_true",
        help="Also write a .txt copy next to the PNG (same basename)",
    )
    parser.add_argument(
        "--style",
        choices=("professional", "cool", "emoji"),
        default=None,
        help="Override receipt PNG layout (else use receipt_layout / receipt_style in JSON)",
    )
    args = parser.parse_args()

    from services.receipt_printer import format_test_receipt_text, render_receipt_to_image, sample_receipt_dict

    if args.all_fixtures:
        if args.data_file is not None:
            print("Error: do not pass a JSON path with --all-fixtures", file=sys.stderr)
            return 1
        if args.out is not None:
            print("Error: --out is not valid with --all-fixtures (use --out-dir)", file=sys.stderr)
            return 1
        if args.send_print:
            print("Error: --print is not supported with --all-fixtures", file=sys.stderr)
            return 1
        paths = sorted(FIXTURES_DIR.glob("receipt_*.json"))
        if not paths:
            print(f"Error: no receipt_*.json under {FIXTURES_DIR}", file=sys.stderr)
            return 1
        args.out_dir.mkdir(parents=True, exist_ok=True)
        for path in paths:
            data = _load_receipt_json(path)
            png_path = args.out_dir / f"{path.stem}.png"
            _render_one(
                data,
                out_path=png_path,
                also_txt=args.txt,
                send_print=False,
                printer=args.printer,
            )
        return 0

    if args.data_file is not None:
        if not args.data_file.is_file():
            print(f"Error: not a file: {args.data_file}", file=sys.stderr)
            return 1
        receipt_data = _load_receipt_json(args.data_file)
        stem = args.data_file.stem
    else:
        receipt_data = None
        stem = "receipt_test"

    png_path = args.out or (args.out_dir / f"{stem}.png")

    if receipt_data is not None:
        _render_one(
            receipt_data,
            out_path=png_path,
            also_txt=args.txt,
            send_print=args.send_print,
            printer=args.printer,
            layout_style=args.style,
        )
    else:
        text = format_test_receipt_text()
        png_path.parent.mkdir(parents=True, exist_ok=True)
        image = render_receipt_to_image(sample_receipt_dict(), layout_style=args.style)
        image.save(png_path, format="PNG")
        print(f"Wrote {png_path}")
        if args.txt:
            txt_path = png_path.with_suffix(".txt")
            txt_path.write_text(text, encoding="utf-8", newline="\n")
            print(f"Wrote {txt_path}")
        if args.send_print:
            from services.printer_manager import resolve_printer, send_text

            queue = resolve_printer(args.printer, role="receipt")
            send_text(queue, text, doc_name="ReceiptLocalTest")
            print(f"Sent receipt to {queue!r}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
