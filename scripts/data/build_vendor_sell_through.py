"""
Tier 1: vendor- and PO-level sell-through (no manifest categories).

Outputs:
  workspace/data/sell_through_by_vendor.csv
  workspace/data/sell_through_by_po.csv
  workspace/data/sell_through_by_vendor_category.csv  (groups with >= min_group_pos POs)

Run from repo root:
  python scripts/data/build_vendor_sell_through.py
"""

from __future__ import annotations

import csv
import os
import re
import statistics
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

import psycopg2
from psycopg2.extras import RealDictCursor

REPO_ROOT = Path(__file__).resolve().parents[2]
if load_dotenv:
    load_dotenv(REPO_ROOT / ".env")

DATA_DIR = REPO_ROOT / "workspace" / "data"

# Same vendor codes as build_sell_through_rates.py
V1_PREFIX_TO_CODE = {
    "TGT": "tgt",
    "AMZ": "amz",
    "WAL": "wal",
    "HMD": "hdp",
    "CST": "cos",
    "WFR": "wfr",
    "ESS": "ess",
}

V2_VENDOR_TO_CODE = {
    "Amazon": "amz",
    "Target": "tgt",
    "Walmart": "wal",
    "Home Depot": "hdp",
    "Costco": "cos",
    "Wayfair": "wfr",
    "Essendant": "ess",
    "Generic": "gen",
    "Ramaekers": "ram",
}


def normalize_vendor_code_v1(prefix: str) -> str:
    p = (prefix or "").strip().upper()[:3]
    if len(p) < 3:
        p = p.ljust(3, "x")
    return V1_PREFIX_TO_CODE.get(p, p.lower())


def normalize_vendor_code_v2(name: str) -> str:
    n = (name or "").strip()
    if n in V2_VENDOR_TO_CODE:
        return V2_VENDOR_TO_CODE[n]
    slug = re.sub(r"[^a-z0-9]+", "", n.lower())[:3]
    return slug.ljust(3, "x") if len(slug) < 3 else slug[:3]


def connect(dbname: str):
    return psycopg2.connect(
        host=os.environ.get("DATABASE_HOST", "localhost"),
        port=int(os.environ.get("DATABASE_PORT", "5432")),
        dbname=dbname,
        user=os.environ.get("DATABASE_USER", "postgres"),
        password=os.environ.get("DATABASE_PASSWORD", "password"),
    )


def to_dec(x) -> Decimal:
    if x is None:
        return Decimal("0")
    return x if isinstance(x, Decimal) else Decimal(str(x))


SQL_PO_V1 = """
SELECT
    LEFT(po.number, 3) AS vendor_prefix,
    po.number AS po_number,
    po.description AS po_description,
    SUM(m.retail_amt * COALESCE(NULLIF(cl.quantity, 0), 1)) AS po_total_retail,
    SUM(cl.unit_price_amt * COALESCE(NULLIF(cl.quantity, 0), 1)) AS po_total_sold
FROM manifest m
JOIN purchase_order po ON po.number = m.order_number
JOIN item i ON i.order_number = m.order_number AND i.line_number = m.line_number
JOIN cart_line cl ON cl.item_cde = i.code::varchar
JOIN cart c ON c.code = cl.cart_cde
WHERE c.close_time < '2030-01-01'
  AND m.retail_amt IS NOT NULL AND m.retail_amt > 0
  AND cl.unit_price_amt IS NOT NULL AND cl.unit_price_amt > 0
GROUP BY LEFT(po.number, 3), po.number, po.description
"""

SQL_PO_V2 = """
SELECT
    v.name AS vendor_name,
    po.order_number AS po_number,
    po.description AS po_description,
    SUM(mr.retail_value * COALESCE(NULLIF(cl.quantity, 0), 1)) AS po_total_retail,
    SUM(cl.unit_price * COALESCE(NULLIF(cl.quantity, 0), 1)) AS po_total_sold
FROM inventory_manifest_rows mr
JOIN inventory_purchase_order po ON po.id = mr.purchase_order_id
JOIN inventory_vendor v ON v.id = po.vendor_id
JOIN inventory_item i ON i.manifest_row_id = mr.id
JOIN pos_cart_line cl ON cl.item_id = i.id
JOIN pos_cart c ON c.id = cl.cart_id
WHERE c.status = 'completed'
  AND c.completed_at IS NOT NULL
  AND mr.retail_value IS NOT NULL AND mr.retail_value > 0
  AND cl.unit_price IS NOT NULL AND cl.unit_price > 0
GROUP BY v.name, po.order_number, po.description
"""


def norm_desc_key(desc: str, max_len: int = 100) -> str:
    """Loose normalization for grouping auction-style titles (still often unique)."""
    s = (desc or "").lower().strip()
    s = re.sub(r"\s+", " ", s)
    # drop trailing location-ish noise (very light)
    s = re.sub(r",\s*[A-Z]{2}\s*$", "", s)
    return s[:max_len]


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    min_group_pos = 2  # minimum POs in a (vendor, description_key) group for vendor_category file

    po_rows: list[dict] = []

    with connect("ecothrift_v1") as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(SQL_PO_V1)
            for row in cur:
                vc = normalize_vendor_code_v1(row["vendor_prefix"])
                tr = to_dec(row["po_total_retail"])
                ts = to_dec(row["po_total_sold"])
                if tr <= 0:
                    continue
                st = ts / tr
                po_rows.append(
                    {
                        "vendor": vc,
                        "source": "v1",
                        "po_number": (row["po_number"] or "").strip(),
                        "po_description": row["po_description"] or "",
                        "total_retail": tr,
                        "total_sold": ts,
                        "sell_through_rate": st,
                    }
                )

    with connect("ecothrift_v2") as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(SQL_PO_V2)
            for row in cur:
                vc = normalize_vendor_code_v2(row["vendor_name"] or "")
                tr = to_dec(row["po_total_retail"])
                ts = to_dec(row["po_total_sold"])
                if tr <= 0:
                    continue
                st = ts / tr
                po_rows.append(
                    {
                        "vendor": vc,
                        "source": "v2",
                        "po_number": (row["po_number"] or "").strip(),
                        "po_description": row["po_description"] or "",
                        "total_retail": tr,
                        "total_sold": ts,
                        "sell_through_rate": st,
                    }
                )

    # --- By vendor ---
    v_agg: dict[str, dict] = defaultdict(
        lambda: {"total_retail": Decimal("0"), "total_sold": Decimal("0"), "po_count": 0}
    )
    for r in po_rows:
        a = v_agg[r["vendor"]]
        a["total_retail"] += r["total_retail"]
        a["total_sold"] += r["total_sold"]
        a["po_count"] += 1

    vendor_rows = []
    for v, a in sorted(v_agg.items(), key=lambda x: -x[1]["po_count"]):
        tr, ts = a["total_retail"], a["total_sold"]
        rate = (ts / tr) if tr > 0 else Decimal("0")
        vendor_rows.append(
            {
                "vendor": v,
                "po_count": a["po_count"],
                "total_retail": tr,
                "total_sold": ts,
                "sell_through_rate": rate,
            }
        )

    po_path = DATA_DIR / "sell_through_by_po.csv"
    with po_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            ["vendor", "po_number", "po_description", "total_retail", "total_sold", "sell_through_rate", "source"]
        )
        for r in sorted(po_rows, key=lambda x: (-x["total_retail"], x["vendor"])):
            w.writerow(
                [
                    r["vendor"],
                    r["po_number"],
                    r["po_description"],
                    f"{r['total_retail']:.2f}",
                    f"{r['total_sold']:.2f}",
                    f"{r['sell_through_rate']:.6f}",
                    r["source"],
                ]
            )

    ven_path = DATA_DIR / "sell_through_by_vendor.csv"
    with ven_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["vendor", "po_count", "total_retail", "total_sold", "sell_through_rate"])
        for r in vendor_rows:
            w.writerow(
                [
                    r["vendor"],
                    r["po_count"],
                    f"{r['total_retail']:.2f}",
                    f"{r['total_sold']:.2f}",
                    f"{r['sell_through_rate']:.6f}",
                ]
            )

    # --- By vendor + normalized description (multi-PO groups only) ---
    g_agg: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"total_retail": Decimal("0"), "total_sold": Decimal("0"), "po_count": 0}
    )
    for r in po_rows:
        key = norm_desc_key(r["po_description"])
        g = g_agg[(r["vendor"], key)]
        g["total_retail"] += r["total_retail"]
        g["total_sold"] += r["total_sold"]
        g["po_count"] += 1

    vc_rows = []
    for (v, dk), a in g_agg.items():
        if a["po_count"] < min_group_pos:
            continue
        tr, ts = a["total_retail"], a["total_sold"]
        rate = (ts / tr) if tr > 0 else Decimal("0")
        vc_rows.append(
            {
                "vendor": v,
                "description_key": dk,
                "po_count": a["po_count"],
                "total_retail": tr,
                "total_sold": ts,
                "sell_through_rate": rate,
            }
        )
    vc_rows.sort(key=lambda x: (-x["po_count"], -x["total_retail"]))

    vc_path = DATA_DIR / "sell_through_by_vendor_category.csv"
    with vc_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            ["vendor", "description_key", "po_count", "total_retail", "total_sold", "sell_through_rate"]
        )
        for r in vc_rows:
            w.writerow(
                [
                    r["vendor"],
                    r["description_key"],
                    r["po_count"],
                    f"{r['total_retail']:.2f}",
                    f"{r['total_sold']:.2f}",
                    f"{r['sell_through_rate']:.6f}",
                ]
            )

    # --- Per-vendor PO rate stats ---
    by_v: dict[str, list[float]] = defaultdict(list)
    for r in po_rows:
        by_v[r["vendor"]].append(float(r["sell_through_rate"]))

    lines = []
    lines.append("Vendor-level sell-through (sum sold / sum retail across POs)")
    lines.append("=" * 72)
    lines.append(f"{'Vendor':<8} {'POs':>6} {'Vendor STR':>12} {'PO-rate min':>12} {'max':>10} {'stdev':>10}")
    lines.append("-" * 72)
    for r in vendor_rows:
        v = r["vendor"]
        rates = by_v.get(v, [])
        if len(rates) >= 2:
            mn, mx, sd = min(rates), max(rates), statistics.stdev(rates)
        elif len(rates) == 1:
            mn = mx = rates[0]
            sd = 0.0
        else:
            mn = mx = sd = 0.0
        lines.append(
            f"{v:<8} {r['po_count']:>6} {float(r['sell_through_rate']):>11.2%} "
            f"{mn:>11.2%} {mx:>9.2%} {sd:>9.4f}"
        )
    lines.append("-" * 72)
    lines.append(f"Total POs: {len(po_rows)}")
    lines.append(f"Vendor+description groups (>= {min_group_pos} POs): {len(vc_rows)}")
    lines.append("")
    lines.append(f"Wrote {po_path}")
    lines.append(f"Wrote {ven_path}")
    lines.append(f"Wrote {vc_path}")
    txt = "\n".join(lines) + "\n"
    print(txt)
    (DATA_DIR / "vendor_sell_through_summary.txt").write_text(txt, encoding="utf-8")


if __name__ == "__main__":
    main()
