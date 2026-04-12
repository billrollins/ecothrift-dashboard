"""
Backfill Phase 5: assign taxonomy_v1 categories to backfilled items/products; export V2 products for
classification; import CSVs; recompute PricingRule sell-through from sold BACKFILL items.

Steps (run in order for full pipeline):
  --map-v1              V1 department → taxonomy_v1; bulk_update Item + Product (BACKFILL:v1)
  --export-v2           CSV batches under workspace/data/v2_classify/
  --import-v2           Read completed CSVs; update Product; propagate to V2 items
  --recompute-pricing   PricingRule per TAXONOMY_V1_CATEGORY_NAMES from sold items
  --preclassify-v2      Conservative auto-fill on V2 CSVs (PO / brand / title signals)

Catch-all: Mixed lots & uncategorized (see apps.buying.taxonomy_v1.MIXED_LOTS_UNCATEGORIZED).
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from apps.buying.models import PricingRule
from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES, MIXED_LOTS_UNCATEGORIZED
from apps.inventory.management.command_db import (
    add_database_argument,
    add_no_input_argument,
    confirm_production_write,
    resolve_database_alias,
)
from apps.inventory.management.commands.backfill_phase1_vendors_pos import (
    parse_description_metadata,
)
from apps.inventory.models import Item, Product, PurchaseOrder

TAXONOMY_SET = frozenset(TAXONOMY_V1_CATEGORY_NAMES)
BATCH_SIZE = 2000
# Smaller bulk_update batches for remote DBs (e.g. Heroku) — large batches can appear to hang.
MAP_V1_BATCH_SIZE_REMOTE = 500
V2_EXPORT_CHUNK = 400
CSV_PREFIX = "v2_products_"
TAXONOMY_LIST = list(TAXONOMY_V1_CATEGORY_NAMES)

# Conservative brand -> taxonomy (lowercase key = normalized brand). Omit ambiguous brands (Mainstays, etc.).
_PRECLASSIFY_BRAND_TO_TAXONOMY: dict[str, str] = {
    "nintendo": "Toys & games",
    "pokemon": "Toys & games",
    "hasbro": "Toys & games",
    "mattel": "Toys & games",
    "fisher-price": "Toys & games",
    "fisher price": "Toys & games",
    "lego": "Toys & games",
    "barbie": "Toys & games",
    "hot wheels": "Toys & games",
    "nerf": "Toys & games",
    "kitchenaid": "Kitchen & dining",
    "cuisinart": "Kitchen & dining",
    "pyrex": "Kitchen & dining",
    "lodge": "Kitchen & dining",
    "hartz": "Pet supplies",
    "purina": "Pet supplies",
    "pedigree": "Pet supplies",
    "iams": "Pet supplies",
    "friskies": "Pet supplies",
    "pampers": "Baby & kids",
    "huggies": "Baby & kids",
    "graco": "Baby & kids",
    "cosco kids": "Baby & kids",
    "neutrogena": "Health, beauty & personal care",
    "maybelline": "Health, beauty & personal care",
    "l'oreal": "Health, beauty & personal care",
    "loreal": "Health, beauty & personal care",
    "cerave": "Health, beauty & personal care",
    "oral-b": "Health, beauty & personal care",
    "oral b": "Health, beauty & personal care",
    "dewalt": "Tools & hardware",
    "makita": "Tools & hardware",
    "craftsman": "Tools & hardware",
    "stanley": "Tools & hardware",
    "dove": "Health, beauty & personal care",
    "coleman": "Sports & outdoors",
    "ozark trail": "Sports & outdoors",
}

# Extra PO substrings not covered by DEPARTMENT_TO_TAXONOMY keys (lowercase substring -> taxonomy).
_PRECLASSIFY_PO_EXTRA: list[tuple[str, str]] = [
    ("home goods", "Home décor & lighting"),
    ("pc electronics", "Electronics"),
    ("sporting goods", "Sports & outdoors"),
]


def _normalize_brand_key(raw: str | None) -> str:
    if not raw:
        return ""
    s = str(raw).strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def _preclassify_title_signal(title: str | None) -> str | None:
    """Signal C: only obvious generic / placeholder titles -> Mixed."""
    if not title or not str(title).strip():
        return None
    t = str(title).strip()
    low = t.lower()
    if low.startswith("generic merchandise") or low.startswith("generic general merchandise"):
        return MIXED_LOTS_UNCATEGORIZED
    if re.fullmatch(r"(?i)bag\b", t.strip()):
        return MIXED_LOTS_UNCATEGORIZED
    if len(t.split()) == 1 and len(t) <= 4 and low in ("bag", "box", "case"):
        return MIXED_LOTS_UNCATEGORIZED
    return None


def _preclassify_brand_signal(brand: str | None, title: str | None) -> str | None:
    """Signal B: high-confidence brand only."""
    key = _normalize_brand_key(brand)
    if not key:
        return None
    if key in _PRECLASSIFY_BRAND_TO_TAXONOMY:
        return _PRECLASSIFY_BRAND_TO_TAXONOMY[key]
    # Ninja: kitchen small appliance only (avoid gaming/other "Ninja" products).
    if key == "ninja" or key.startswith("ninja "):
        tl = (title or "").lower()
        if re.search(
            r"\b(blender|foodi|kitchen|processor|air fryer|toaster|coffee|kettle|cooker)\b", tl
        ):
            return "Kitchen & dining"
    return None


def _preclassify_po_signal(po_category_text: str | None, title: str | None) -> str | None:
    """Signal A: conservative substring match on PO category text."""
    if not po_category_text or not str(po_category_text).strip():
        return None
    low = str(po_category_text).strip().lower()
    tl = (title or "").lower()

    # Longer department labels first to avoid "Baby" beating "Baby & Kids..."
    for dept in sorted(DEPARTMENT_TO_TAXONOMY.keys(), key=len, reverse=True):
        if dept.lower() in low:
            return DEPARTMENT_TO_TAXONOMY[dept]

    for sub, cat in _PRECLASSIFY_PO_EXTRA:
        if sub in low:
            if sub == "sporting goods":
                if re.search(
                    r"\b(ball|dumbbell|treadmill|golf|soccer|basketball|fishing|camp|tent|kayak|yoga|"
                    r"weight|sport|fitness|bike|bicycle|helmet|cleat)\b",
                    tl,
                ):
                    return "Sports & outdoors"
                if re.search(
                    r"\b(doll|toy|lego|figure|plush|board game|puzzle|nerf|playset)\b",
                    tl,
                ):
                    return "Toys & games"
                return None
            return cat

    return None


def _preclassify_v2_row(
    title: str | None,
    brand: str | None,
    po_category_text: str | None,
) -> str | None:
    """Return a taxonomy name or None if ambiguous / skip."""
    sig = _preclassify_title_signal(title)
    if sig is not None:
        return sig
    sig = _preclassify_brand_signal(brand, title)
    if sig is not None:
        return sig
    sig = _preclassify_po_signal(po_category_text, title)
    if sig is not None:
        return sig
    return None


def _detect_csv_encoding(path: Path) -> str:
    raw = path.read_bytes()[:4]
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return "utf-16"
    if raw[:3] == b"\xef\xbb\xbf":
        return "utf-8-sig"
    return "utf-8"


# V1 legacy "Department / Subcategory" — map department prefix (or full string when no slash) to
# taxonomy_v1. Ambiguous departments (e.g. Home & Decor spans kitchen/bedding) use a single best-fit.
# Junk / unknown vendor codes → Mixed lots.
DEPARTMENT_TO_TAXONOMY: dict[str, str] = {
    "Arts & Crafts": "Party, seasonal & novelty",
    "Arts, Crafts & Sewing": "Party, seasonal & novelty",
    "Arts, Crafts And Sewing": "Party, seasonal & novelty",
    "Arts, Games & Arts": "Toys & games",
    "Arts, Toys & Games": "Toys & games",
    "Automotive & Garage": "Tools & hardware",
    "Babies & Kids": "Baby & kids",
    "Baby": "Baby & kids",
    "Baby & Kids": "Baby & kids",
    "Baby & Toddler": "Baby & kids",
    "Baby & Toddler Toys": "Toys & games",
    "Baby Care": "Baby & kids",
    "Baby Products": "Baby & kids",
    "Baby, Health & Personal Care": "Baby & kids",
    "Baby, Kids & Maternity": "Baby & kids",
    "Baby, Toddler & Maternity": "Baby & kids",
    "Bags & Luggage": "Apparel & accessories",
    "Beauty, Health & Personal Care": "Health, beauty & personal care",
    "Bedding & Bath": "Bedding & bath",
    "Clothing, Shoes & Accessories": "Apparel & accessories",
    "Education Supplies": "Office & school supplies",
    "Electronics": "Electronics",
    "Electronics & Technology": "Electronics",
    "Event & Party Supplies": "Party, seasonal & novelty",
    "Garden, Patio & Outdoor Living": "Outdoor & patio furniture",
    "Health & Medical": "Health, beauty & personal care",
    "Health & Wellness": "Health, beauty & personal care",
    "Home & Decor": "Home décor & lighting",
    "Home Improvement": "Tools & hardware",
    "Home Improvement & Tools": "Tools & hardware",
    "Imaging-Office": "Office & school supplies",
    "Janitorial & Sanitation": "Household & cleaning",
    "Kids Home": "Furniture",
    "Kids' & Baby Clothing": "Apparel & accessories",
    "Kids' Bedding & Decor": "Bedding & bath",
    "Kitchen": "Kitchen & dining",
    "Media & Entertainment": "Books & media",
    "Medical & Mobility": "Health, beauty & personal care",
    "Medical Supplies & Equipment": "Health, beauty & personal care",
    "Miscellaneous & Uncategorized": MIXED_LOTS_UNCATEGORIZED,
    "Musical Instruments": MIXED_LOTS_UNCATEGORIZED,
    "Nursery": "Baby & kids",
    "Nursery & Kids": "Baby & kids",
    "Office & School Supplies": "Office & school supplies",
    "Outdoor Furniture": "Outdoor & patio furniture",
    "Outdoor Play": "Toys & games",
    "Outdoor Power Equipment": "Tools & hardware",
    "Outdoor Recreation": "Sports & outdoors",
    "Party & Celebration": "Party, seasonal & novelty",
    "Pets & Animal Care": "Pet supplies",
    "Seasonal & Holiday": "Party, seasonal & novelty",
    "Sports, Fitness & Outdoors": "Sports & outdoors",
    "Toys, Games & Arts": "Toys & games",
    "Travel": "Apparel & accessories",
    "Travel & Luggage": "Apparel & accessories",
    "Usark31120001": MIXED_LOTS_UNCATEGORIZED,
    "Wayfair": MIXED_LOTS_UNCATEGORIZED,
}


def normalize_category_label(raw: str | None) -> str:
    if not raw:
        return ""
    s = str(raw).strip()
    if len(s) >= 2 and s[0] == s[-1] == '"':
        s = s[1:-1].strip()
    return s


def department_key(normalized: str) -> str:
    if " / " in normalized:
        return normalized.split(" / ", 1)[0].strip()
    return normalized


def map_department_to_taxonomy(
    normalized_label: str,
    unmapped_log: set[str],
) -> str:
    if not normalized_label:
        return MIXED_LOTS_UNCATEGORIZED
    dept = department_key(normalized_label)
    if dept in DEPARTMENT_TO_TAXONOMY:
        return DEPARTMENT_TO_TAXONOMY[dept]
    unmapped_log.add(dept)
    return MIXED_LOTS_UNCATEGORIZED


def _po_notes_last_json(notes: str) -> dict[str, Any]:
    if not notes or not notes.strip():
        return {}
    last = notes.strip().split("\n")[-1].strip()
    if not last.startswith("{"):
        return {}
    try:
        obj = json.loads(last)
    except json.JSONDecodeError:
        return {}
    return obj if isinstance(obj, dict) else {}


def _mode_from_counter(c: Counter[str]) -> str | None:
    if not c:
        return None
    return c.most_common(1)[0][0]


class Command(BaseCommand):
    help = (
        "Phase 5: taxonomy_v1 categories for backfill; V2 CSV export/import; PricingRule recomputation."
    )

    def add_arguments(self, parser) -> None:
        add_database_argument(parser)
        add_no_input_argument(parser)
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Do not write DB or CSV files; print counts only.",
        )
        parser.add_argument("--map-v1", action="store_true", help="Step 1: map V1 labels to taxonomy_v1.")
        parser.add_argument(
            "--export-v2",
            action="store_true",
            help="Step 2: export V2 products to batched CSVs for classification.",
        )
        parser.add_argument(
            "--import-v2",
            action="store_true",
            help="Step 3: import classification CSVs and propagate to items.",
        )
        parser.add_argument(
            "--recompute-pricing",
            action="store_true",
            help="Step 4: recompute PricingRule from sold BACKFILL items.",
        )
        parser.add_argument(
            "--preclassify-v2",
            action="store_true",
            help=(
                "Conservative auto-fill of taxonomy_v1_category on V2 CSVs under "
                "workspace/data/v2_classify/ (including agent_* subdirs) where PO text, "
                "brand, or title is unambiguous."
            ),
        )

    def handle(self, *args: Any, **options: Any) -> None:
        db = resolve_database_alias(options["database"])
        dry_run: bool = options["dry_run"]
        confirm_production_write(
            stdout=self.stdout,
            stderr=self.stderr,
            db_alias=db,
            no_input=options["no_input"],
            dry_run=dry_run,
        )
        steps = [
            options["map_v1"],
            options["export_v2"],
            options["import_v2"],
            options["recompute_pricing"],
            options["preclassify_v2"],
        ]
        if not any(steps):
            raise CommandError(
                "Specify at least one of: --map-v1, --export-v2, --import-v2, "
                "--recompute-pricing, --preclassify-v2"
            )

        if options["map_v1"]:
            self._step_map_v1(dry_run, db)
        if options["export_v2"]:
            self._step_export_v2(dry_run, db)
        if options["import_v2"]:
            self._step_import_v2(dry_run, db)
        if options["recompute_pricing"]:
            self._step_recompute_pricing(dry_run, db)
        if options["preclassify_v2"]:
            self._step_preclassify_v2(dry_run)

    def _map_v1_batch_size(self, db: str) -> int:
        """Remote production DBs: smaller bulk_update batches to avoid long stalls."""
        return MAP_V1_BATCH_SIZE_REMOTE if db == "production" else BATCH_SIZE

    def _step_map_v1(self, dry_run: bool, db: str) -> None:
        self.stdout.write(self.style.NOTICE("=== Step 1: --map-v1 (V1 -> taxonomy_v1) ==="))
        self.stdout.flush()
        bs = self._map_v1_batch_size(db)
        unmapped: set[str] = set()

        # All reads/writes use *db* (e.g. production). No legacy ecothrift_v1 connection here.
        self.stdout.write("Collecting distinct V1 category labels (query may take a moment)…")
        self.stdout.flush()

        # Distinct labels → taxonomy
        raw_labels = (
            Item.objects.using(db)
            .filter(notes__startswith="BACKFILL:v1:")
            .exclude(category="")
            .exclude(category__isnull=True)
            .values_list("category", flat=True)
            .distinct()
        )
        label_to_tax: dict[str, str] = {}
        for raw in raw_labels:
            norm = normalize_category_label(raw)
            if not norm:
                continue
            label_to_tax[norm] = map_department_to_taxonomy(norm, unmapped)

        self.stdout.write(f"Distinct normalized V1 labels: {len(label_to_tax)}")
        self.stdout.flush()
        if unmapped:
            self.stdout.write(
                self.style.WARNING(
                    f"Unmapped department keys (-> {MIXED_LOTS_UNCATEGORIZED}) -- extend DEPARTMENT_TO_TAXONOMY if needed:"
                )
            )
            for d in sorted(unmapped):
                self.stdout.write(f"  {d}")
            self.stdout.flush()

        self.stdout.write(
            f"Pass 1: remap items with category — iterator chunk_size={bs}, bulk_update batch_size={bs}…"
        )
        self.stdout.flush()

        updated_items = 0
        sim_counts: Counter[str] = Counter()

        batch: list[Item] = []
        batch_num = 0
        qs1 = (
            Item.objects.using(db)
            .filter(notes__startswith="BACKFILL:v1:")
            .exclude(category="")
            .exclude(category__isnull=True)
            .only("id", "category")
        )
        for row in qs1.iterator(chunk_size=bs):
            norm = normalize_category_label(row.category)
            new_cat = label_to_tax.get(norm) or map_department_to_taxonomy(norm, unmapped)
            row.category = new_cat
            sim_counts[new_cat] += 1
            batch.append(row)
            if len(batch) >= bs:
                batch_num += 1
                verb = "would bulk_update" if dry_run else "bulk_update"
                self.stdout.write(f"  Pass 1 batch {batch_num}: {verb} {len(batch)} items…")
                self.stdout.flush()
                if not dry_run:
                    Item.objects.using(db).bulk_update(batch, ["category"])
                    updated_items += len(batch)
                else:
                    updated_items += len(batch)
                batch = []
        if batch:
            batch_num += 1
            verb = "would bulk_update" if dry_run else "bulk_update"
            self.stdout.write(f"  Pass 1 batch {batch_num} (final): {verb} {len(batch)} items…")
            self.stdout.flush()
            if not dry_run:
                Item.objects.using(db).bulk_update(batch, ["category"])
                updated_items += len(batch)
            else:
                updated_items += len(batch)

        self.stdout.write("Pass 2: aggregate taxonomy per product (values scan)…")
        self.stdout.flush()

        # Per-product taxonomy counts from non-empty V1 items (after pass1 semantics)
        product_tax: defaultdict[int, Counter[str]] = defaultdict(Counter)
        pass2_rows = 0
        for row in (
            Item.objects.using(db)
            .filter(notes__startswith="BACKFILL:v1:")
            .exclude(category="")
            .exclude(category__isnull=True)
            .values("product_id", "category")
            .iterator(chunk_size=bs)
        ):
            pid = row["product_id"]
            if not pid:
                continue
            norm = normalize_category_label(row["category"])
            tx = label_to_tax.get(norm) or map_department_to_taxonomy(norm, unmapped)
            product_tax[pid][tx] += 1
            pass2_rows += 1
            if pass2_rows % 100_000 == 0:
                self.stdout.write(f"  Pass 2 rows processed: {pass2_rows:,}…")
                self.stdout.flush()

        self.stdout.write("Pass 3: fill empty item categories from product consensus…")
        self.stdout.flush()

        fix_batch: list[Item] = []
        fix_batch_num = 0
        qs2 = Item.objects.using(db).filter(notes__startswith="BACKFILL:v1:").filter(
            Q(category="") | Q(category__isnull=True)
        ).only("id", "category", "product_id")
        for row in qs2.iterator(chunk_size=bs):
            new_cat = MIXED_LOTS_UNCATEGORIZED
            pid = row.product_id
            if pid and product_tax.get(pid):
                new_cat = product_tax[pid].most_common(1)[0][0]
            row.category = new_cat
            sim_counts[new_cat] += 1
            fix_batch.append(row)
            if len(fix_batch) >= bs:
                fix_batch_num += 1
                verb = "would bulk_update" if dry_run else "bulk_update"
                self.stdout.write(f"  Pass 3 batch {fix_batch_num}: {verb} {len(fix_batch)} items…")
                self.stdout.flush()
                if not dry_run:
                    Item.objects.using(db).bulk_update(fix_batch, ["category"])
                    updated_items += len(fix_batch)
                else:
                    updated_items += len(fix_batch)
                fix_batch = []
        if fix_batch:
            fix_batch_num += 1
            verb = "would bulk_update" if dry_run else "bulk_update"
            self.stdout.write(f"  Pass 3 batch {fix_batch_num} (final): {verb} {len(fix_batch)} items…")
            self.stdout.flush()
            if not dry_run:
                Item.objects.using(db).bulk_update(fix_batch, ["category"])
                updated_items += len(fix_batch)
            else:
                updated_items += len(fix_batch)

        self.stdout.write("Pass 4: build per-product category histogram (full V1 item scan)…")
        self.stdout.flush()

        # Final item category per product (for Product.category mode) — one scan
        product_item_cats: defaultdict[int, Counter[str]] = defaultdict(Counter)
        pass4_rows = 0
        for row in (
            Item.objects.using(db)
            .filter(notes__startswith="BACKFILL:v1:")
            .values("product_id", "category")
            .iterator(chunk_size=bs)
        ):
            pid = row["product_id"]
            if not pid:
                continue
            raw = row["category"] or ""
            if raw:
                norm = normalize_category_label(raw)
                tx = label_to_tax.get(norm) or map_department_to_taxonomy(norm, unmapped)
            else:
                tx = MIXED_LOTS_UNCATEGORIZED
                if pid and product_tax.get(pid):
                    tx = product_tax[pid].most_common(1)[0][0]
            product_item_cats[pid][tx] += 1
            pass4_rows += 1
            if pass4_rows % 100_000 == 0:
                self.stdout.write(f"  Pass 4 item rows scanned: {pass4_rows:,}…")
                self.stdout.flush()

        self.stdout.write("Pass 5: set Product.category from item histogram…")
        self.stdout.flush()

        prod_qs = Product.objects.using(db).filter(description__startswith="BACKFILL:v1:")
        prod_updated = 0
        for p in prod_qs.iterator(chunk_size=bs):
            mode = _mode_from_counter(product_item_cats.get(p.pk, Counter())) or MIXED_LOTS_UNCATEGORIZED
            if dry_run:
                prod_updated += 1
            else:
                Product.objects.using(db).filter(pk=p.pk).update(category=mode)
                prod_updated += 1
            if prod_updated % 2000 == 0:
                self.stdout.write(f"  Pass 5 products updated: {prod_updated:,}…")
                self.stdout.flush()

        self.stdout.write("\nV1 items per taxonomy_v1:")
        for name in TAXONOMY_V1_CATEGORY_NAMES:
            if dry_run:
                n = sim_counts.get(name, 0)
            else:
                n = Item.objects.using(db).filter(notes__startswith="BACKFILL:v1:", category=name).count()
            self.stdout.write(f"  {n:>8}  {name}")
        self.stdout.write(
            self.style.SUCCESS(
                f"\nmap-v1: items updated {updated_items}, products set {prod_updated}, dry_run={dry_run}"
            )
        )

    def _step_export_v2(self, dry_run: bool, db: str) -> None:
        self.stdout.write(self.style.NOTICE("=== Step 2: --export-v2 ==="))
        base = Path(settings.BASE_DIR) / "workspace" / "data" / "v2_classify"

        prod_qs = (
            Product.objects.using(db)
            .filter(description__startswith="BACKFILL:v2:")
            .exclude(category__in=TAXONOMY_LIST)
            .annotate(ic=Count("items"))
        )
        total = prod_qs.count()
        if total == 0:
            self.stdout.write("No V2 products to export (all have valid taxonomy or none loaded).")
            return

        product_ids = list(prod_qs.values_list("id", flat=True))
        # Vendor mode per product
        mode_vendor: dict[int, str] = {}
        agg = (
            Item.objects.using(db)
            .filter(product_id__in=product_ids, purchase_order__isnull=False)
            .values("product_id", "purchase_order__vendor__code")
            .annotate(c=Count("id"))
        )
        rows_by_pid: dict[int, list[tuple[str, int]]] = {}
        for row in agg:
            pid = row["product_id"]
            code = row["purchase_order__vendor__code"] or ""
            c = row["c"]
            rows_by_pid.setdefault(pid, []).append((code, c))
        for pid, pairs in rows_by_pid.items():
            pairs.sort(key=lambda x: (-x[1], x[0]))
            mode_vendor[pid] = pairs[0][0] if pairs else ""

        # Sample PO per product (min item id with PO)
        sample_po: dict[int, tuple[Any, str, str]] = {}
        items_with_po = (
            Item.objects.using(db)
            .filter(product_id__in=product_ids, purchase_order__isnull=False)
            .values("id", "product_id", "purchase_order_id")
            .order_by("id")
        )
        seen_p: set[int] = set()

        for row in items_with_po.iterator(chunk_size=5000):
            pid = row["product_id"]
            if pid in seen_p:
                continue
            seen_p.add(pid)
            po = PurchaseOrder.objects.using(db).filter(pk=row["purchase_order_id"]).first()
            if not po:
                continue
            j = _po_notes_last_json(po.notes or "")
            cat_txt = j.get("category_text") or ""
            if not cat_txt and po.description:
                meta = parse_description_metadata(po.description)
                cat_txt = meta.get("category_text") or ""
            sample_po[pid] = (po, po.description or "", cat_txt)

        export_rows: list[dict[str, Any]] = []
        for p in prod_qs.order_by("title"):
            pid = p.id
            vc = mode_vendor.get(pid, "")
            po_tup = sample_po.get(pid)
            po_desc = ""
            po_cat = ""
            if po_tup:
                po_desc = po_tup[1][:2000]
                po_cat = (po_tup[2] or "")[:500]
            ic = getattr(p, "ic", 0)
            export_rows.append(
                {
                    "product_id": pid,
                    "title": p.title,
                    "brand": p.brand,
                    "model": p.model,
                    "upc": p.upc,
                    "vendor": vc,
                    "po_description": po_desc,
                    "po_category_text": po_cat,
                    "item_count": ic,
                    "taxonomy_v1_category": "",
                    "_sort_v": vc,
                    "_sort_t": p.title,
                }
            )

        export_rows.sort(key=lambda r: (r["_sort_v"], r["_sort_t"]))
        for r in export_rows:
            del r["_sort_v"]
            del r["_sort_t"]

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Would export {total} products in {(total + V2_EXPORT_CHUNK - 1) // V2_EXPORT_CHUNK} files -> {base}"
                )
            )
            return

        base.mkdir(parents=True, exist_ok=True)
        fieldnames = [
            "product_id",
            "title",
            "brand",
            "model",
            "upc",
            "vendor",
            "po_description",
            "po_category_text",
            "item_count",
            "taxonomy_v1_category",
        ]
        n_files = (len(export_rows) + V2_EXPORT_CHUNK - 1) // V2_EXPORT_CHUNK
        for fi in range(n_files):
            chunk = export_rows[fi * V2_EXPORT_CHUNK : (fi + 1) * V2_EXPORT_CHUNK]
            path = base / f"{CSV_PREFIX}{fi + 1:03d}.csv"
            with path.open("w", encoding="utf-8", newline="") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames)
                w.writeheader()
                for r in chunk:
                    w.writerow({k: r.get(k, "") for k in fieldnames})
            self.stdout.write(f"Wrote {path} ({len(chunk)} rows)")

        self.stdout.write(
            self.style.SUCCESS(
                f"export-v2: {total} products, {n_files} files, ~{V2_EXPORT_CHUNK} rows/file (last may be shorter)"
            )
        )

    def _step_import_v2(self, dry_run: bool, db: str) -> None:
        self.stdout.write(self.style.NOTICE("=== Step 3: --import-v2 ==="))
        base = Path(settings.BASE_DIR) / "workspace" / "data" / "v2_classify"
        if not base.is_dir():
            if dry_run:
                self.stdout.write(
                    self.style.WARNING(
                        f"import-v2: directory not found ({base}); run --export-v2 first. Skipping."
                    )
                )
                return
            raise CommandError(f"Directory not found: {base}")

        files = sorted(base.glob(f"{CSV_PREFIX}*.csv"))
        if not files:
            files = list(base.glob("*.csv"))
        invalid: list[tuple[str, int, str]] = []
        product_updates: dict[int, str] = {}
        for path in files:
            with path.open(encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                if not reader.fieldnames or "taxonomy_v1_category" not in reader.fieldnames:
                    self.stdout.write(self.style.WARNING(f"Skip (no taxonomy_v1_column): {path}"))
                    continue
                for i, row in enumerate(reader, start=2):
                    raw = (row.get("taxonomy_v1_category") or "").strip()
                    if not raw:
                        continue
                    if raw not in TAXONOMY_SET:
                        invalid.append((str(path), i, raw))
                        continue
                    try:
                        pid = int(row.get("product_id") or "0")
                    except ValueError:
                        invalid.append((str(path), i, f"bad product_id {row.get('product_id')!r}"))
                        continue
                    product_updates[pid] = raw

        if invalid:
            self.stdout.write(self.style.WARNING(f"Invalid category values (rows): {len(invalid)}"))
            for p, line, msg in invalid[:30]:
                self.stdout.write(f"  {p}:{line} {msg}")
            if len(invalid) > 30:
                self.stdout.write("  ...")

        pu = 0
        if not dry_run:
            for pid, cat in product_updates.items():
                Product.objects.using(db).filter(pk=pid).update(category=cat)
                pu += 1
        else:
            pu = len(product_updates)

        v2_need_prop = Item.objects.using(db).filter(
            notes__startswith="BACKFILL:v2:",
            product__isnull=False,
            product__category__in=TAXONOMY_LIST,
        ).filter(Q(category="") | ~Q(category__in=TAXONOMY_LIST))
        if dry_run:
            iu = v2_need_prop.count()
        else:
            iu = 0
            chunk: list[Item] = []
            for item in v2_need_prop.select_related("product").iterator(chunk_size=1000):
                item.category = item.product.category
                chunk.append(item)
                if len(chunk) >= 2000:
                    Item.objects.using(db).bulk_update(chunk, ["category"])
                    iu += len(chunk)
                    chunk = []
            if chunk:
                Item.objects.using(db).bulk_update(chunk, ["category"])
                iu += len(chunk)

        still_bad = (
            Item.objects.using(db)
            .filter(notes__startswith="BACKFILL:v2:")
            .filter(Q(category="") | ~Q(category__in=TAXONOMY_LIST))
            .count()
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"import-v2: products updated {pu}, items propagated {iu}, "
                f"items still invalid/empty: {still_bad}, dry_run={dry_run}"
            )
        )

    def _step_recompute_pricing(self, dry_run: bool, db: str) -> None:
        self.stdout.write(self.style.NOTICE("=== Step 4: --recompute-pricing ==="))
        version_date = timezone.now().date()
        for category_name in TAXONOMY_V1_CATEGORY_NAMES:
            sold_items = Item.objects.using(db).filter(
                notes__startswith="BACKFILL:",
                category=category_name,
                status="sold",
                sold_for__isnull=False,
                price__isnull=False,
                price__gt=0,
            )
            agg = sold_items.aggregate(
                total_sf=Sum("sold_for"),
                total_pr=Sum("price"),
                n=Count("id"),
                avg_p=Avg("price"),
                avg_s=Avg("sold_for"),
            )
            total_sf = agg["total_sf"] or Decimal("0")
            total_pr = agg["total_pr"] or Decimal("0")
            n = agg["n"] or 0
            if isinstance(total_sf, float):
                total_sf = Decimal(str(total_sf))
            if isinstance(total_pr, float):
                total_pr = Decimal(str(total_pr))
            rate = (
                (total_sf / total_pr).quantize(Decimal("0.0001"))
                if total_pr > 0
                else Decimal("0")
            )
            avg_p = agg["avg_p"]
            avg_s = agg["avg_s"]
            if avg_p is not None and not isinstance(avg_p, Decimal):
                avg_p = Decimal(str(avg_p)).quantize(Decimal("0.01"))
            if avg_s is not None and not isinstance(avg_s, Decimal):
                avg_s = Decimal(str(avg_s)).quantize(Decimal("0.01"))

            self.stdout.write(
                f"  {category_name}: rate={rate} sample={n} "
                f"sold_for_sum={total_sf} price_sum={total_pr}"
            )

            if dry_run:
                continue
            PricingRule.objects.using(db).update_or_create(
                category=category_name,
                defaults={
                    "sell_through_rate": rate,
                    "sample_size": n,
                    "avg_retail": avg_p,
                    "avg_sold_price": avg_s,
                    "version_date": version_date,
                    "notes": "backfill_phase5",
                },
            )

        self.stdout.write(self.style.SUCCESS(f"recompute-pricing complete, dry_run={dry_run}"))

    def _step_preclassify_v2(self, dry_run: bool) -> None:
        self.stdout.write(self.style.NOTICE("=== --preclassify-v2 ==="))
        base = Path(settings.BASE_DIR) / "workspace" / "data" / "v2_classify"
        if not base.is_dir():
            raise CommandError(f"Directory not found: {base}")
        paths = sorted(base.rglob(f"{CSV_PREFIX}*.csv"))
        if not paths:
            self.stdout.write(self.style.WARNING(f"No {CSV_PREFIX}*.csv under {base}"))
            return

        total_rows = 0
        already_filled = 0
        preclassified = 0
        still_empty = 0
        by_category: Counter[str] = Counter()
        files_written = 0

        for path in paths:
            enc = _detect_csv_encoding(path)
            with path.open(encoding=enc, newline="") as f:
                reader = csv.DictReader(f)
                if not reader.fieldnames or "taxonomy_v1_category" not in reader.fieldnames:
                    self.stdout.write(
                        self.style.WARNING(f"Skip (no taxonomy_v1_category column): {path}")
                    )
                    continue
                fieldnames = list(reader.fieldnames)
                rows = list(reader)

            changed = False
            for row in rows:
                total_rows += 1
                raw = (row.get("taxonomy_v1_category") or "").strip()
                if raw:
                    already_filled += 1
                    continue
                cat = _preclassify_v2_row(
                    row.get("title"),
                    row.get("brand"),
                    row.get("po_category_text"),
                )
                if cat and cat in TAXONOMY_SET:
                    if not dry_run:
                        row["taxonomy_v1_category"] = cat
                    preclassified += 1
                    by_category[cat] += 1
                    changed = True
                else:
                    still_empty += 1

            if changed and not dry_run:
                with path.open("w", encoding="utf-8", newline="") as f:
                    w = csv.DictWriter(f, fieldnames=fieldnames)
                    w.writeheader()
                    w.writerows(rows)
                files_written += 1

        self.stdout.write(
            f"preclassify-v2: files_scanned={len(paths)} files_written={files_written} "
            f"total_rows={total_rows} already_filled={already_filled} "
            f"preclassified={preclassified} still_empty={still_empty} dry_run={dry_run}"
        )
        if by_category:
            self.stdout.write("  By category:")
            for name in sorted(by_category.keys()):
                self.stdout.write(f"    {name}: {by_category[name]}")
        self.stdout.write(self.style.SUCCESS("preclassify-v2 complete"))
