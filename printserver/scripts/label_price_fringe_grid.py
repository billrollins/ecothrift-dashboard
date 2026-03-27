#!/usr/bin/env python3
"""
Fringe-case label PNGs + price-stripe fit stats (first_fit_scale, used_fallback).

Writes to ``printserver/output_label_fringe_review/`` (gitignored).
Run from repo root or printserver:

  python printserver/scripts/label_price_fringe_grid.py
  python printserver/scripts/label_price_fringe_grid.py --preset both

Default is **1.5×1** (1.5\" stock) only. Use ``--preset both`` for 3×2 + 1.5×1.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

OUT_DIR = ROOT / "output_label_fringe_review"

# Curated prices (stress width / big_base tiers) + embedded sample rows.
FRINGE_TEXTS: list[str] = [
    "$0.01",
    "$0.75",
    "$0.99",
    "$1.75",
    "$1.99",
    "$9.99",
    "$25.00",
    "$99.99",
    "$999.99",
    "$1,123.75",
    "$9,999.99",
    "$999,999.99",
    "$1,234,567.89",
]

def _slug(text: str) -> str:
    s = re.sub(r"[^\w.]+", "_", text.strip().replace(",", "_"))
    return s.strip("_") or "price"


def main() -> int:
    parser = argparse.ArgumentParser(description="Fringe label PNGs + price-stripe fit stats.")
    parser.add_argument(
        "--preset",
        choices=("1.5x1", "3x2", "both"),
        default="1.5x1",
        help="Label preset (default: 1.5x1 only). Use 'both' for 3x2 + 1.5x1.",
    )
    args = parser.parse_args()
    if args.preset == "both":
        presets: tuple[str, ...] = ("3x2", "1.5x1")
    else:
        presets = (args.preset,)

    from label_test_data import SAMPLE_LABEL_ROWS

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    from models import LabelPrintRequest
    from services.label_printer import generate_label

    base = SAMPLE_LABEL_ROWS[0]
    rows: list[dict[str, object]] = []
    for t in FRINGE_TEXTS:
        rows.append({**base, "text": t})
    for i, r in enumerate(SAMPLE_LABEL_ROWS):
        rows.append({**r, "text": r["text"], "qr_data": f"{r['qr_data']}-S{i}"})

    summary: list[tuple[str, str, float | None, bool]] = []
    at_100 = 0
    total_fit = 0
    n_fallback = 0

    for preset in presets:
        for idx, row in enumerate(rows):
            text = str(row["text"])
            stats: dict[str, object] = {}
            req = LabelPrintRequest(
                text=text,
                qr_data=str(row["qr_data"]),
                include_text=bool(row.get("include_text", True)),
                product_title=row.get("product_title"),
                product_brand=row.get("product_brand"),
                product_model=row.get("product_model"),
            )
            image = generate_label(req, label_size_preset=preset, price_fit_stats=stats)
            first = stats.get("first_fit_scale")
            fallback = bool(stats.get("used_fallback"))
            scale_val: float | None = None
            if isinstance(first, (int, float)):
                scale_val = float(first)
                total_fit += 1
                if scale_val >= 1.0:
                    at_100 += 1
            if fallback:
                n_fallback += 1
            summary.append((preset, text, scale_val, fallback))

            name = f"{idx:03d}_{preset.replace('.', '_')}_{_slug(text)}.png"
            out = OUT_DIR / name
            image.save(out)

    print(f"Wrote {len(summary)} PNGs under {OUT_DIR}\n")
    print(f"{'preset':<8} {'price':<18} {'first_fit_scale':<16} {'fallback'}")
    print("-" * 60)
    for preset, text, scale, fb in summary:
        sc = "—" if scale is None else f"{scale:.2f}"
        print(f"{preset:<8} {text:<18} {sc:<16} {fb}")

    print("-" * 60)
    n = len(summary)
    print(f"Used fallback (no scale in 1.0-0.5 grid): {n_fallback} / {n}")
    print(f"Rows with numeric first_fit_scale: {total_fit} / {n}")
    if total_fit:
        print(f"first_fit_scale >= 1.00 (among those): {at_100} / {total_fit}")
    else:
        print("No numeric first_fit_scale (unexpected).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
