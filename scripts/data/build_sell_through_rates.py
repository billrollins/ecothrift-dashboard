"""
One-shot pipeline: export V1/V2 category combos, compute sell-through by canonical
category using workspace/notes/to_consultant/historical_keys_mapped.csv.

No Django. Requires: psycopg2-binary, optional python-dotenv.

Run from repo root:
  python scripts/data/build_sell_through_rates.py

Or: scripts/data/build_sell_through_rates.bat
"""

from __future__ import annotations

import csv
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError as e:
    raise SystemExit("psycopg2 is required: pip install psycopg2-binary") from e

# scripts/data -> parents[2] = repo root
REPO_ROOT = Path(__file__).resolve().parents[2]
if load_dotenv:
    load_dotenv(REPO_ROOT / ".env")

DATA_DIR = REPO_ROOT / "workspace" / "data"
MAPPING_PATH = REPO_ROOT / "workspace" / "notes" / "to_consultant" / "historical_keys_mapped.csv"

# --- Mirrored from workspace/notes/to_consultant/build_key_mapping.py ---
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


def clean_segment(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"[^a-z0-9\-]+", "", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


def build_fast_cat_key(vendor_code: str, raw_category: str, raw_subcategory: str) -> str:
    cat = clean_segment(raw_category)
    sub = clean_segment(raw_subcategory)
    parts = [vendor_code, cat]
    if sub:
        parts.append(sub)
    return "-".join(p for p in parts if p)


def build_vendorless_key(raw_category: str, raw_subcategory: str) -> str:
    cat = clean_segment(raw_category)
    sub = clean_segment(raw_subcategory)
    if sub:
        return f"{cat}-{sub}"
    return cat


def to_decimal(x) -> Decimal:
    if x is None:
        return Decimal("0")
    if isinstance(x, Decimal):
        return x
    return Decimal(str(x))


def load_key_mapping(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            fk = (row.get("fast_cat_key") or "").strip()
            if not fk:
                continue
            out[fk] = (row.get("canonical_category") or "").strip()
    return out


def connect(dbname: str):
    return psycopg2.connect(
        host=os.environ.get("DATABASE_HOST", "localhost"),
        port=int(os.environ.get("DATABASE_PORT", "5432")),
        dbname=dbname,
        user=os.environ.get("DATABASE_USER", "postgres"),
        password=os.environ.get("DATABASE_PASSWORD", "password"),
    )


# Distinct category/subcategory combos (manifest inventory), same role as v1/v2_category_combos exports.
SQL_COMBO_V1 = """
SELECT
    LEFT(po.number, 3) AS vendor_prefix,
    m.category AS raw_category,
    COALESCE(m.subcategory, '') AS raw_subcategory,
    COUNT(*)::bigint AS row_count
FROM manifest m
JOIN purchase_order po ON po.number = m.order_number
WHERE m.category IS NOT NULL AND TRIM(m.category) != ''
GROUP BY LEFT(po.number, 3), m.category, COALESCE(m.subcategory, '')
ORDER BY row_count DESC
"""

SQL_COMBO_V2 = """
SELECT
    v.name AS vendor_name,
    mr.category AS raw_category,
    COALESCE(mr.subcategory, '') AS raw_subcategory,
    COUNT(*)::bigint AS row_count
FROM inventory_manifest_rows mr
JOIN inventory_purchase_order po ON po.id = mr.purchase_order_id
JOIN inventory_vendor v ON v.id = po.vendor_id
WHERE mr.category IS NOT NULL AND TRIM(mr.category) != ''
GROUP BY v.name, mr.category, COALESCE(mr.subcategory, '')
ORDER BY row_count DESC
"""

SQL_SOLD_V1 = """
SELECT
    LEFT(po.number, 3) AS vendor_prefix,
    m.category AS raw_category,
    m.subcategory AS raw_subcategory,
    m.retail_amt AS retail_value,
    cl.unit_price_amt AS sold_price,
    cl.quantity AS sold_qty,
    c.close_time AS sold_date
FROM manifest m
JOIN purchase_order po ON po.number = m.order_number
JOIN item i ON i.order_number = m.order_number AND i.line_number = m.line_number
JOIN cart_line cl ON cl.item_cde = i.code::varchar
JOIN cart c ON c.code = cl.cart_cde
WHERE c.close_time < '2030-01-01'
  AND m.category IS NOT NULL AND m.category != ''
  AND m.retail_amt IS NOT NULL AND m.retail_amt > 0
  AND cl.unit_price_amt IS NOT NULL AND cl.unit_price_amt > 0
"""

SQL_SOLD_V2 = """
SELECT
    v.name AS vendor_name,
    mr.category AS raw_category,
    mr.subcategory AS raw_subcategory,
    mr.retail_value AS retail_value,
    cl.unit_price AS sold_price,
    cl.quantity AS sold_qty,
    c.completed_at AS sold_date
FROM inventory_manifest_rows mr
JOIN inventory_purchase_order po ON po.id = mr.purchase_order_id
JOIN inventory_vendor v ON v.id = po.vendor_id
JOIN inventory_item i ON i.manifest_row_id = mr.id
JOIN pos_cart_line cl ON cl.item_id = i.id
JOIN pos_cart c ON c.id = cl.cart_id
WHERE c.status = 'completed'
  AND c.completed_at IS NOT NULL
  AND mr.category IS NOT NULL AND mr.category != ''
  AND mr.retail_value IS NOT NULL AND mr.retail_value > 0
  AND cl.unit_price IS NOT NULL AND cl.unit_price > 0
"""


def export_category_combos() -> tuple[int, int]:
    """Write v1_category_combos.csv and v2_category_combos.csv with vendorless_key column."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    v1_path = DATA_DIR / "v1_category_combos.csv"
    v2_path = DATA_DIR / "v2_category_combos.csv"
    n1 = n2 = 0
    with connect("ecothrift_v1") as conn, v1_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["vendor_prefix", "raw_category", "raw_subcategory", "vendorless_key", "row_count"])
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(SQL_COMBO_V1)
            for row in cur:
                vk = build_vendorless_key(row["raw_category"] or "", row["raw_subcategory"] or "")
                w.writerow(
                    [
                        (row["vendor_prefix"] or "").strip(),
                        row["raw_category"] or "",
                        row["raw_subcategory"] or "",
                        vk,
                        row["row_count"],
                    ]
                )
                n1 += 1
    with connect("ecothrift_v2") as conn, v2_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["vendor_name", "raw_category", "raw_subcategory", "vendorless_key", "row_count"])
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(SQL_COMBO_V2)
            for row in cur:
                vk = build_vendorless_key(row["raw_category"] or "", row["raw_subcategory"] or "")
                w.writerow(
                    [
                        row["vendor_name"] or "",
                        row["raw_category"] or "",
                        row["raw_subcategory"] or "",
                        vk,
                        row["row_count"],
                    ]
                )
                n2 += 1
    return n1, n2


def compute_sell_through(key_map: dict[str, str]) -> tuple[list[dict], int, int, Decimal, Decimal, int]:
    agg: dict[str, dict] = defaultdict(
        lambda: {
            "total_retail": Decimal("0"),
            "total_sold": Decimal("0"),
            "v1_lines": 0,
            "v2_lines": 0,
        }
    )
    unmatched_v1 = 0
    unmatched_v2 = 0

    with connect("ecothrift_v1") as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(SQL_SOLD_V1)
            for row in cur:
                vcode = normalize_vendor_code_v1(row["vendor_prefix"])
                fk = build_fast_cat_key(
                    vcode,
                    row["raw_category"] or "",
                    row["raw_subcategory"] or "",
                )
                cat = key_map.get(fk)
                if not cat or not cat.strip():
                    unmatched_v1 += 1
                    continue
                qty = to_decimal(row["sold_qty"])
                if qty <= 0:
                    qty = Decimal("1")
                unit_retail = to_decimal(row["retail_value"])
                unit_sold = to_decimal(row["sold_price"])
                a = agg[cat]
                a["total_retail"] += unit_retail * qty
                a["total_sold"] += unit_sold * qty
                a["v1_lines"] += 1

    with connect("ecothrift_v2") as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(SQL_SOLD_V2)
            for row in cur:
                vcode = normalize_vendor_code_v2(row["vendor_name"] or "")
                fk = build_fast_cat_key(
                    vcode,
                    row["raw_category"] or "",
                    row["raw_subcategory"] or "",
                )
                cat = key_map.get(fk)
                if not cat or not cat.strip():
                    unmatched_v2 += 1
                    continue
                qty = to_decimal(row["sold_qty"])
                if qty <= 0:
                    qty = Decimal("1")
                unit_retail = to_decimal(row["retail_value"])
                unit_sold = to_decimal(row["sold_price"])
                a = agg[cat]
                a["total_retail"] += unit_retail * qty
                a["total_sold"] += unit_sold * qty
                a["v2_lines"] += 1

    rows_out: list[dict] = []
    grand_retail = Decimal("0")
    grand_sold = Decimal("0")
    grand_lines = 0

    for cat, a in sorted(agg.items(), key=lambda x: -(x[1]["v1_lines"] + x[1]["v2_lines"])):
        tr = a["total_retail"]
        ts = a["total_sold"]
        lc = a["v1_lines"] + a["v2_lines"]
        if lc == 0:
            continue
        strate = (ts / tr) if tr > 0 else Decimal("0")
        avg_r = tr / Decimal(lc)
        avg_s = ts / Decimal(lc)
        rows_out.append(
            {
                "canonical_category": cat,
                "total_retail": tr,
                "total_sold": ts,
                "sell_through_rate": strate,
                "line_count": lc,
                "avg_retail": avg_r,
                "avg_sold_price": avg_s,
                "v1_lines": a["v1_lines"],
                "v2_lines": a["v2_lines"],
            }
        )
        grand_retail += tr
        grand_sold += ts
        grand_lines += lc

    rows_out.sort(key=lambda r: -r["line_count"])
    return rows_out, unmatched_v1, unmatched_v2, grand_retail, grand_sold, grand_lines


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    if not MAPPING_PATH.is_file():
        raise SystemExit(f"Mapping file not found: {MAPPING_PATH}")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    key_map = load_key_mapping(MAPPING_PATH)

    print("Step 1–2: Exporting V1/V2 category combos (with vendorless_key)…")
    n1, n2 = export_category_combos()
    print(f"  Wrote {n1} combo rows → {DATA_DIR / 'v1_category_combos.csv'}")
    print(f"  Wrote {n2} combo rows → {DATA_DIR / 'v2_category_combos.csv'}")

    print("Step 3–6: Computing sell-through from sold lines…")
    rows_out, unmatched_v1, unmatched_v2, grand_retail, grand_sold, grand_lines = compute_sell_through(
        key_map
    )

    csv_path = DATA_DIR / "sell_through_by_category.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "canonical_category",
                "total_retail",
                "total_sold",
                "sell_through_rate",
                "line_count",
                "avg_retail",
                "avg_sold_price",
                "v1_lines",
                "v2_lines",
            ]
        )
        for r in rows_out:
            w.writerow(
                [
                    r["canonical_category"],
                    f"{r['total_retail']:.2f}",
                    f"{r['total_sold']:.2f}",
                    f"{r['sell_through_rate']:.6f}",
                    r["line_count"],
                    f"{r['avg_retail']:.2f}",
                    f"{r['avg_sold_price']:.2f}",
                    r["v1_lines"],
                    r["v2_lines"],
                ]
            )

    overall = (grand_sold / grand_retail) if grand_retail > 0 else Decimal("0")
    grand_v1 = sum(r["v1_lines"] for r in rows_out)
    grand_v2 = sum(r["v2_lines"] for r in rows_out)
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines_summary: list[str] = []
    lines_summary.append(f"build_sell_through_rates — {ts}")
    lines_summary.append(f"Mapping: {MAPPING_PATH}")
    lines_summary.append(f"Category combos: V1={n1} rows, V2={n2} rows")
    lines_summary.append("")
    lines_summary.append("Sell-through by canonical category (matched lines only)")
    lines_summary.append("=" * 88)
    lines_summary.append(
        f"{'Category':<34} {'Lines':>8} {'V1':>8} {'V2':>8} "
        f"{'Total retail':>14} {'Total sold':>14} {'Sell-through':>12}"
    )
    lines_summary.append("-" * 88)
    for r in rows_out:
        lines_summary.append(
            f"{r['canonical_category']:<34} {r['line_count']:>8} {r['v1_lines']:>8} {r['v2_lines']:>8} "
            f"{r['total_retail']:>14,.2f} {r['total_sold']:>14,.2f} {r['sell_through_rate']:>11.2%}"
        )
    lines_summary.append("-" * 88)
    lines_summary.append(
        f"{'TOTAL (matched)':<34} {grand_lines:>8} {grand_v1:>8} {grand_v2:>8} "
        f"{grand_retail:>14,.2f} {grand_sold:>14,.2f} {overall:>11.2%}"
    )
    lines_summary.append("")
    lines_summary.append(f"Overall sell-through (total_sold / total_retail): {overall:.4%}")
    lines_summary.append(f"Unmatched V1 sale lines (no fast_cat_key in mapping): {unmatched_v1:,}")
    lines_summary.append(f"Unmatched V2 sale lines (no fast_cat_key in mapping): {unmatched_v2:,}")
    lines_summary.append("")
    lines_summary.append(
        "Money math: total_retail = sum(retail_value * sold_qty), "
        "total_sold = sum(unit_price * sold_qty) per matched cart line (Decimal)."
    )

    txt = "\n".join(lines_summary) + "\n"
    summary_path = DATA_DIR / "sell_through_summary.txt"
    summary_path.write_text(txt, encoding="utf-8")
    print(txt)
    print(f"Wrote {csv_path}")
    print(f"Wrote {summary_path}")


if __name__ == "__main__":
    main()
