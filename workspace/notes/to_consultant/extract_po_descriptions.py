"""
Extract PO descriptions from V1/V2/V3, parse category signals, join sell-through.

Run from repo root:
  python workspace/notes/to_consultant/extract_po_descriptions.py
"""

from __future__ import annotations

import csv
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

import psycopg2
from psycopg2.extras import RealDictCursor

REPO_ROOT = Path(__file__).resolve().parents[3]
if load_dotenv:
    load_dotenv(REPO_ROOT / ".env")

OUT_DATA = REPO_ROOT / "workspace" / "data"
OUT_CONSULTANT = REPO_ROOT / "workspace" / "notes" / "to_consultant"
OUT_MD = OUT_CONSULTANT / "po_description_analysis.md"
SELL_THROUGH_PO = OUT_DATA / "sell_through_by_po.csv"

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


def connect(dbname: str):
    return psycopg2.connect(
        host=os.environ.get("DATABASE_HOST", "localhost"),
        port=int(os.environ.get("DATABASE_PORT", "5432")),
        dbname=dbname,
        user=os.environ.get("DATABASE_USER", "postgres"),
        password=os.environ.get("DATABASE_PASSWORD", "password"),
    )


def normalize_vendor_v1(prefix: str) -> str:
    p = (prefix or "").strip().upper()[:3]
    if len(p) < 3:
        p = p.ljust(3, "x")
    return V1_PREFIX_TO_CODE.get(p, p.lower())


def normalize_vendor_name(name: str) -> str:
    n = (name or "").strip()
    if n in V2_VENDOR_TO_CODE:
        return V2_VENDOR_TO_CODE[n]
    slug = re.sub(r"[^a-z0-9]+", "", n.lower())[:3]
    return slug.ljust(3, "x") if len(slug) < 3 else slug[:3]


def to_dec(x) -> Decimal | None:
    if x is None:
        return None
    if isinstance(x, Decimal):
        return x
    try:
        return Decimal(str(x))
    except Exception:
        return None


def parse_ext_retail(s: str) -> Decimal | None:
    m = re.search(r"Ext\.?\s*Retail\s*\$?\s*([\d,]+)", s, re.I)
    if not m:
        return None
    try:
        return Decimal(m.group(1).replace(",", ""))
    except Exception:
        return None


def parse_location(s: str) -> str:
    m = re.search(r",\s*([^,]+),\s*([A-Z]{2})\s*(?:-\s*[^,]+)?\s*$", s)
    if m:
        return f"{m.group(1).strip()}, {m.group(2)}"
    return ""


def parse_units(s: str) -> int | None:
    m = re.search(r"([\d,]+)\s+Units", s, re.I)
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", ""))
    except Exception:
        return None


def parse_description(raw: str | None) -> dict[str, object | None]:
    """Extract lot_type, pallet_count, category_text from B-Stock-style titles."""
    out: dict[str, object | None] = {
        "lot_type": "",
        "pallet_count": None,
        "category_text": "",
        "unit_count": None,
        "ext_retail_from_desc": None,
        "location": "",
    }
    if not raw or not str(raw).strip():
        return out
    s = str(raw).strip()
    out["ext_retail_from_desc"] = parse_ext_retail(s)
    out["location"] = parse_location(s)
    out["unit_count"] = parse_units(s)

    low = s.lower()
    of_idx = low.find(" of ")
    if of_idx == -1:
        out["lot_type"] = s[:120]
        return out

    head = s[:of_idx].strip()
    tail = s[of_idx + 4 :].strip()

    pm = re.search(r"\((\d+)\s+Pallet(?:\s+Spaces)?s?", head, re.I)
    if pm:
        try:
            out["pallet_count"] = int(pm.group(1))
        except Exception:
            pass

    head_clean = re.sub(r"\s*\([^)]*\)\s*$", "", head).strip()
    head_clean = re.sub(r"^Fast\s+Shipping\s*-\s*", "", head_clean, flags=re.I)
    out["lot_type"] = head_clean[:300]

    cat = tail
    for stop in (
        ", Used",
        ", New",
        ", Like",
        ", Est",
        "Ext. Retail",
        "EST Retail",
        "Ext Retail",
    ):
        idx = cat.find(stop)
        if idx != -1:
            cat = cat[:idx]
            break
    cat = re.sub(r",\s*$", "", cat.strip())
    out["category_text"] = cat.strip()[:2000]

    return out


def clean_category_text(cat: str) -> str:
    s = (cat or "").lower()
    s = s.replace("&", " and ")
    s = re.sub(r"\band\s+more\b", "", s, flags=re.I)
    s = re.sub(r"\bmore\b", "", s, flags=re.I)
    s = re.sub(r"\bmixed\b", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r",\s*$", "", s)
    return s[:500]


SQL_V1 = """
SELECT
    po.number AS po_number,
    LEFT(po.number, 3) AS vendor_prefix,
    po.description AS raw_description,
    po.retail_amt AS po_retail,
    po.price_amt AS purchase_price,
    po.fee_amt AS fees,
    po.shipping_amt AS shipping,
    lc.condition_name AS condition,
    po.quantity AS po_quantity,
    po.purchased_on,
    po.received_on,
    COUNT(DISTINCT m.id) AS manifest_line_count
FROM purchase_order po
LEFT JOIN list_condition lc ON lc.id = po.condition_id
LEFT JOIN manifest m ON m.order_number = po.number
GROUP BY
    po.number,
    po.description,
    po.retail_amt,
    po.price_amt,
    po.fee_amt,
    po.shipping_amt,
    lc.condition_name,
    po.quantity,
    po.purchased_on,
    po.received_on
ORDER BY po.purchased_on NULLS LAST
"""

SQL_V2 = """
SELECT
    po.order_number AS po_number,
    v.name AS vendor_name,
    po.description AS raw_description,
    po.retail_value AS po_retail,
    po.purchase_price,
    po.other_fees AS fees,
    po.shipping_cost AS shipping,
    po.condition,
    po.quantity AS po_quantity,
    po.purchase_date AS purchased_on,
    po.received_date AS received_on,
    COUNT(DISTINCT mr.id) AS manifest_line_count
FROM inventory_purchase_order po
LEFT JOIN inventory_vendor v ON v.id = po.vendor_id
LEFT JOIN inventory_manifest_rows mr ON mr.purchase_order_id = po.id
GROUP BY
    po.order_number,
    v.name,
    po.description,
    po.retail_value,
    po.purchase_price,
    po.other_fees,
    po.shipping_cost,
    po.condition,
    po.quantity,
    po.purchase_date,
    po.received_date
ORDER BY po.purchase_date NULLS LAST
"""

# V3: Django inventory.PurchaseOrder — retail_value, purchase_cost, item_count (no quantity on PO)
SQL_V3 = """
SELECT
    po.order_number AS po_number,
    v.name AS vendor_name,
    po.description AS raw_description,
    po.retail_value AS po_retail,
    po.purchase_cost AS purchase_price,
    po.fees,
    po.shipping_cost AS shipping,
    po.condition,
    po.item_count AS po_quantity,
    po.ordered_date AS purchased_on,
    po.delivered_date AS received_on,
    COUNT(DISTINCT mr.id) AS manifest_line_count
FROM inventory_purchaseorder po
LEFT JOIN inventory_vendor v ON v.id = po.vendor_id
LEFT JOIN inventory_manifestrow mr ON mr.purchase_order_id = po.id
GROUP BY
    po.order_number,
    v.name,
    po.description,
    po.retail_value,
    po.purchase_cost,
    po.fees,
    po.shipping_cost,
    po.condition,
    po.item_count,
    po.ordered_date,
    po.delivered_date
ORDER BY po.ordered_date NULLS LAST
"""


def fmt_dt(x) -> str:
    if x is None:
        return ""
    if isinstance(x, datetime):
        return x.isoformat()
    if isinstance(x, date):
        return x.isoformat()
    return str(x)


def load_sell_through_by_po() -> dict[str, dict]:
    """po_number -> {total_retail, total_sold, sell_through_rate, source}"""
    out: dict[str, dict] = {}
    if not SELL_THROUGH_PO.is_file():
        return out
    with SELL_THROUGH_PO.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            pn = (row.get("po_number") or "").strip()
            if not pn:
                continue
            out[pn] = {
                "total_retail": Decimal((row.get("total_retail") or "0").replace(",", "")),
                "total_sold": Decimal((row.get("total_sold") or "0").replace(",", "")),
                "sell_through_rate": Decimal((row.get("sell_through_rate") or "0")),
                "source": row.get("source") or "",
            }
    return out


def fetch_v3_rows():
    """Try ecothrift_v3; Django table is ``inventory_purchaseorder`` in ``public``."""
    try:
        with connect("ecothrift_v3") as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'inventory_purchaseorder'
                    """
                )
                if not cur.fetchone():
                    return [], (
                        "public.inventory_purchaseorder not found — apply inventory migrations "
                        "to ecothrift_v3 or point DATABASE at a DB with Django inventory tables."
                    )
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(SQL_V3)
                return list(cur.fetchall()), None
    except Exception as e:
        return [], str(e).replace("\n", " ")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    OUT_DATA.mkdir(parents=True, exist_ok=True)

    rows_all: list[dict] = []
    counts_by_db: Counter[str] = Counter()
    v3_err: str | None = None

    with connect("ecothrift_v1") as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(SQL_V1)
            for r in cur:
                vp = r.get("vendor_prefix") or ""
                vendor = normalize_vendor_v1(vp)
                raw = r.get("raw_description") or ""
                parsed = parse_description(raw)
                cc = clean_category_text(str(parsed["category_text"] or ""))
                rows_all.append(
                    {
                        "source_db": "v1",
                        "po_number": (r.get("po_number") or "").strip(),
                        "vendor": vendor,
                        "raw_description": raw,
                        "lot_type": parsed["lot_type"],
                        "pallet_count": parsed["pallet_count"],
                        "category_text": parsed["category_text"],
                        "cleaned_category": cc,
                        "unit_count": parsed["unit_count"],
                        "ext_retail_from_desc": parsed["ext_retail_from_desc"],
                        "location": parsed["location"],
                        "condition": r.get("condition") or "",
                        "po_retail": to_dec(r.get("po_retail")),
                        "purchase_price": to_dec(r.get("purchase_price")),
                        "fees": to_dec(r.get("fees")),
                        "shipping": to_dec(r.get("shipping")),
                        "manifest_line_count": int(r.get("manifest_line_count") or 0),
                        "purchased_on": fmt_dt(r.get("purchased_on")),
                        "received_on": fmt_dt(r.get("received_on")),
                    }
                )
                counts_by_db["v1"] += 1

    with connect("ecothrift_v2") as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(SQL_V2)
            for r in cur:
                vendor = normalize_vendor_name(r.get("vendor_name") or "")
                raw = r.get("raw_description") or ""
                parsed = parse_description(raw)
                cc = clean_category_text(str(parsed["category_text"] or ""))
                rows_all.append(
                    {
                        "source_db": "v2",
                        "po_number": (r.get("po_number") or "").strip(),
                        "vendor": vendor,
                        "raw_description": raw,
                        "lot_type": parsed["lot_type"],
                        "pallet_count": parsed["pallet_count"],
                        "category_text": parsed["category_text"],
                        "cleaned_category": cc,
                        "unit_count": parsed["unit_count"],
                        "ext_retail_from_desc": parsed["ext_retail_from_desc"],
                        "location": parsed["location"],
                        "condition": r.get("condition") or "",
                        "po_retail": to_dec(r.get("po_retail")),
                        "purchase_price": to_dec(r.get("purchase_price")),
                        "fees": to_dec(r.get("fees")),
                        "shipping": to_dec(r.get("shipping")),
                        "manifest_line_count": int(r.get("manifest_line_count") or 0),
                        "purchased_on": fmt_dt(r.get("purchased_on")),
                        "received_on": fmt_dt(r.get("received_on")),
                    }
                )
                counts_by_db["v2"] += 1

    v3_rows, v3_err = fetch_v3_rows()
    for r in v3_rows:
        vendor = normalize_vendor_name(r.get("vendor_name") or "")
        raw = r.get("raw_description") or ""
        parsed = parse_description(raw)
        cc = clean_category_text(str(parsed["category_text"] or ""))
        rows_all.append(
            {
                "source_db": "v3",
                "po_number": (r.get("po_number") or "").strip(),
                "vendor": vendor,
                "raw_description": raw,
                "lot_type": parsed["lot_type"],
                "pallet_count": parsed["pallet_count"],
                "category_text": parsed["category_text"],
                "cleaned_category": cc,
                "unit_count": parsed["unit_count"],
                "ext_retail_from_desc": parsed["ext_retail_from_desc"],
                "location": parsed["location"],
                "condition": r.get("condition") or "",
                "po_retail": to_dec(r.get("po_retail")),
                "purchase_price": to_dec(r.get("purchase_price")),
                "fees": to_dec(r.get("fees")),
                "shipping": to_dec(r.get("shipping")),
                "manifest_line_count": int(r.get("manifest_line_count") or 0),
                "purchased_on": fmt_dt(r.get("purchased_on")),
                "received_on": fmt_dt(r.get("received_on")),
            }
        )
        counts_by_db["v3"] += 1

    parseable = sum(1 for r in rows_all if (r.get("category_text") or "").strip())
    unparseable = len(rows_all) - parseable

    sell_map = load_sell_through_by_po()

    # --- All POs (full detail): workspace/data + to_consultant copy ---
    p1 = OUT_DATA / "po_descriptions_all.csv"
    p_consultant = OUT_CONSULTANT / "purchase_orders_all_details.csv"
    fields = [
        "source_db",
        "po_number",
        "vendor",
        "raw_description",
        "lot_type",
        "pallet_count",
        "category_text",
        "cleaned_category",
        "unit_count",
        "ext_retail_from_desc",
        "location",
        "condition",
        "po_retail",
        "purchase_price",
        "fees",
        "shipping",
        "manifest_line_count",
        "purchased_on",
        "received_on",
    ]

    def write_po_rows_csv(path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            w.writeheader()
            for r in rows_all:
                row = dict(r)
                for k in ("ext_retail_from_desc", "po_retail", "purchase_price", "fees", "shipping"):
                    v = row.get(k)
                    if isinstance(v, Decimal):
                        row[k] = f"{v:.2f}"
                    elif v is None:
                        row[k] = ""
                if row.get("pallet_count") is None:
                    row["pallet_count"] = ""
                if row.get("unit_count") is None:
                    row["unit_count"] = ""
                w.writerow(row)

    write_po_rows_csv(p1)
    write_po_rows_csv(p_consultant)

    # --- po_category_distribution.csv ---
    dist: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"po_count": 0, "total_po_retail": Decimal("0"), "retail_list": []}
    )
    for r in rows_all:
        cc = (r.get("cleaned_category") or "").strip() or "(empty)"
        key = (r["vendor"], cc)
        dist[key]["po_count"] += 1
        pr = r.get("po_retail")
        if pr is not None:
            dist[key]["total_po_retail"] += pr
        dist[key]["retail_list"].append(pr)

    dist_rows = []
    for (vendor, cc), a in dist.items():
        n = a["po_count"]
        tr = a["total_po_retail"]
        avg = (tr / Decimal(n)) if n and tr is not None else Decimal("0")
        dist_rows.append(
            {
                "vendor": vendor,
                "cleaned_category": cc,
                "po_count": n,
                "total_po_retail": tr,
                "avg_po_retail": avg,
            }
        )
    dist_rows.sort(key=lambda x: (-x["po_count"], -x["total_po_retail"]))

    p2 = OUT_DATA / "po_category_distribution.csv"
    with p2.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["vendor", "cleaned_category", "po_count", "total_po_retail", "avg_po_retail"])
        for r in dist_rows:
            w.writerow(
                [
                    r["vendor"],
                    r["cleaned_category"],
                    r["po_count"],
                    f"{r['total_po_retail']:.2f}",
                    f"{r['avg_po_retail']:.2f}",
                ]
            )

    # --- po_category_sell_through.csv (join sell_through_by_po on po_number) ---
    st_agg: dict[tuple[str, str], dict] = defaultdict(
        lambda: {
            "po_count": 0,
            "total_retail_sold": Decimal("0"),
            "total_sold_amount": Decimal("0"),
            "total_manifest_lines": 0,
            "sold_po_hits": 0,
        }
    )
    for r in rows_all:
        pn = r["po_number"]
        cc = (r.get("cleaned_category") or "").strip() or "(empty)"
        key = (r["vendor"], cc)
        st_agg[key]["po_count"] += 1
        st_agg[key]["total_manifest_lines"] += int(r.get("manifest_line_count") or 0)
        sm = sell_map.get(pn)
        if sm:
            st_agg[key]["sold_po_hits"] += 1
            st_agg[key]["total_retail_sold"] += sm["total_retail"]
            st_agg[key]["total_sold_amount"] += sm["total_sold"]

    st_rows = []
    for (vendor, cc), a in st_agg.items():
        trs = a["total_retail_sold"]
        tsa = a["total_sold_amount"]
        rate = (tsa / trs) if trs > 0 else Decimal("0")
        st_rows.append(
            {
                "vendor": vendor,
                "cleaned_category": cc,
                "po_count": a["po_count"],
                "total_retail_sold_lines": trs,
                "total_sold_amount": tsa,
                "sell_through_rate": rate,
                "total_manifest_lines": a["total_manifest_lines"],
                "sold_line_count": a["sold_po_hits"],
            }
        )
    st_rows.sort(key=lambda x: (-x["po_count"], -x["total_retail_sold_lines"]))

    p3 = OUT_DATA / "po_category_sell_through.csv"
    with p3.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "vendor",
                "cleaned_category",
                "po_count",
                "total_retail_sold_lines",
                "total_sold_amount",
                "sell_through_rate",
                "total_manifest_lines",
                "sold_line_count",
            ]
        )
        for r in st_rows:
            w.writerow(
                [
                    r["vendor"],
                    r["cleaned_category"],
                    r["po_count"],
                    f"{r['total_retail_sold_lines']:.2f}",
                    f"{r['total_sold_amount']:.2f}",
                    f"{r['sell_through_rate']:.6f}",
                    r["total_manifest_lines"],
                    r["sold_line_count"],
                ]
            )

    # --- Markdown + stdout ---
    top30_dist = dist_rows[:30]
    top30_st = sorted(st_rows, key=lambda x: -x["po_count"])[:30]

    # bucket stats: how many (vendor, cat) have po_count 1-2 vs 3+
    bucket_po = Counter()
    for r in dist_rows:
        c = r["po_count"]
        if c == 1:
            bucket_po["1"] += 1
        elif c == 2:
            bucket_po["2"] += 1
        elif c <= 5:
            bucket_po["3-5"] += 1
        else:
            bucket_po["6+"] += 1

    lines_md: list[str] = []
    lines_md.append("# PO description analysis\n")
    lines_md.append("Generated by `extract_po_descriptions.py`.\n")

    lines_md.append("\n## Database coverage\n")
    lines_md.append(f"- **V1 POs:** {counts_by_db['v1']}\n")
    lines_md.append(f"- **V2 POs:** {counts_by_db['v2']}\n")
    lines_md.append(f"- **V3 POs:** {counts_by_db['v3']}\n")
    if v3_err:
        lines_md.append(f"- **V3 error (no rows or connection):** {v3_err}\n")

    lines_md.append("\n## Parse quality\n")
    lines_md.append(f"- **Non-empty `category_text`:** {parseable}\n")
    lines_md.append(f"- **Empty category (no ` of ` or unparseable tail):** {unparseable}\n")

    lines_md.append("\n## Vendor + cleaned_category bucket sizes (PO count)\n")
    lines_md.append("| bucket | distinct vendor+category combos |\n| --- | --- |\n")
    for k in ["1", "2", "3-5", "6+"]:
        if k in bucket_po:
            lines_md.append(f"| {k} PO(s) | {bucket_po[k]} |\n")

    lines_md.append("\n### Top 30 vendor + category (by PO count)\n")
    lines_md.append("| vendor | cleaned_category | po_count | total_po_retail | avg_po_retail |\n")
    lines_md.append("| --- | --- | --- | --- | --- |\n")
    for r in top30_dist:
        lines_md.append(
            f"| {r['vendor']} | {r['cleaned_category'][:80]} | {r['po_count']} | "
            f"{r['total_po_retail']:.2f} | {r['avg_po_retail']:.2f} |\n"
        )

    lines_md.append("\n### Top 30 vendor + category sell-through (by PO count in extract)\n")
    lines_md.append(
        "Rates use **only POs that matched** `sell_through_by_po.csv` on `po_number` for retail/sold sums; "
        "`sold_line_count` = number of those POs in the bucket (not cart line count).\n\n"
    )
    lines_md.append(
        "| vendor | cleaned_category | po_count | retail(sell file) | sold | STR | manifest_lines | sell_POs |\n"
        "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
    )
    for r in top30_st:
        lines_md.append(
            f"| {r['vendor']} | {r['cleaned_category'][:60]} | {r['po_count']} | "
            f"{r['total_retail_sold_lines']:.2f} | {r['total_sold_amount']:.2f} | "
            f"{float(r['sell_through_rate']):.2%} | {r['total_manifest_lines']} | {r['sold_line_count']} |\n"
        )

    lines_md.append("\n## Assessment\n")
    lines_md.append(
        "- **Statistical power:** Most `vendor + cleaned_category` buckets will have **1–2 POs** because "
        "auction titles are long and varied; only buckets with **≥5–10 POs** support stable sell-through estimates.\n"
        "- **Sell-through join:** Historical `sell_through_by_po.csv` covers **sold** POs only; many extracted POs "
        "won’t match if they never had linked sales in that pipeline.\n"
    )

    lines_md.append("\n## Output files\n")
    lines_md.append(f"- `{p1.relative_to(REPO_ROOT)}` (same rows as consultant PO export)\n")
    lines_md.append(f"- `{p_consultant.relative_to(REPO_ROOT)}` — **all POs, full detail** (consultant deliverable)\n")
    lines_md.append(f"- `{p2.relative_to(REPO_ROOT)}`\n")
    lines_md.append(f"- `{p3.relative_to(REPO_ROOT)}`\n")

    OUT_MD.write_text("".join(lines_md), encoding="utf-8")

    print("=== POs per DB ===")
    print(dict(counts_by_db))
    if v3_err:
        print("V3 error:", v3_err)
    print("\n=== Parseable category_text ===", parseable, "/", len(rows_all))
    print("\n=== Top 30 distribution (vendor + cleaned_category) ===")
    for r in top30_dist:
        print(f"  {r['vendor']!s:4} {r['po_count']:5}  {r['cleaned_category'][:70]!s}")
    print("\n=== Top 30 sell-through buckets (by po_count) ===")
    for r in top30_st:
        print(
            f"  {r['vendor']!s:4} {r['po_count']:5}  STR={float(r['sell_through_rate']):.2%}  "
            f"sell_POs={r['sold_line_count']}  {r['cleaned_category'][:50]!s}"
        )
    print(f"\nWrote {p1}, {p_consultant}, {p2}, {p3}, {OUT_MD}")


if __name__ == "__main__":
    main()
