#!/usr/bin/env python3
"""
Write two plain QR PNGs (website + SKU) matching label print pipeline (no center logo).

Run from repo root:
  python workspace/testing/branded_qr_smoke_test.py

Requires: printserver deps (qrcode, Pillow); optional pyzbar for decode check.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PRINTSERVER = REPO / "printserver"
sys.path.insert(0, str(PRINTSERVER))

OUT = Path(__file__).resolve().parent / "output"


def _try_decode_qr_l(image_l):
    try:
        from pyzbar.pyzbar import decode  # type: ignore[import-untyped]
    except ImportError:
        return None
    rgb = image_l.convert("RGB")
    decoded = decode(rgb)
    if not decoded:
        return None
    return decoded[0].data.decode("utf-8", errors="replace")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    from services.label_printer import _make_qr

    samples: list[tuple[str, str]] = [
        ("https://eco-thrift.com/item/demo-001", "plain_qr_website.png"),
        ("ITMCD58LS5", "plain_qr_sku.png"),
    ]

    for payload, filename in samples:
        im = _make_qr(payload, 150)
        path = OUT / filename
        im.save(path)
        print(f"Wrote {path} ({payload!r}, plain QR)")
        decoded = _try_decode_qr_l(im)
        if decoded is None:
            print("  (install pyzbar to verify decode, or scan with phone)")
        elif decoded != payload:
            print(f"  WARNING decode mismatch: {decoded!r} != {payload!r}")
        else:
            print(f"  OK pyzbar: {decoded!r}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
