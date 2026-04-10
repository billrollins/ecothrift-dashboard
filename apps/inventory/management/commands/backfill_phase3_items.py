"""
Backfill Phase 3: historical V1/V2 items into V3 Item (psycopg2 reads, bulk_create with search_text).

Recon (local ecothrift_v1 / ecothrift_v2): V1 sold via latest item_status (16 Sales - Sold, 23 Retail - Sold);
no sold_items table. V1 sold_for left null (no legacy sold price column on item). V2 sold_at / sold_for on
inventory_item; prefix V2- when legacy sku matches ^ITM[0-9]+$ (3 rows in sample DB).

Idempotent: skips rows whose notes are already BACKFILL:v1:{code} / BACKFILL:v2:{id}.

V1: legacy `product` can have multiple rows per `code` (Phase 2 dedup creates one V3 Product per code).
The V1 SQL must not use a plain JOIN to `product` or the result set multiplies rows (inflates skipped_exists).
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

import psycopg2
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone
from psycopg2.extras import RealDictCursor

from apps.inventory.models import Item, Product, PurchaseOrder

V1_PRODUCT_TAG = re.compile(r"^BACKFILL:v1:(.+)$")
V2_PRODUCT_TAG = re.compile(r"^BACKFILL:v2:(\d+)$")
V2_PO_TAG = re.compile(r"^BACKFILL:v2:(\d+)$")
V2_ITM_NUMERIC = re.compile(r"^ITM[0-9]+$")

MISFIT_V1 = "MISFIT-V1-2024"
MISFIT_V2 = "MISFIT-V2-2025"


def legacy_connect(dbname: str):
    cfg = settings.DATABASES["default"]
    return psycopg2.connect(
        host=cfg["HOST"],
        port=cfg["PORT"],
        user=cfg["USER"],
        password=cfg["PASSWORD"],
        dbname=dbname,
    )


def to_decimal(val: Any) -> Decimal | None:
    if val is None:
        return None
    return Decimal(str(val))


def truncate(s: str | None, max_len: int) -> str:
    if not s:
        return ""
    s = str(s).strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rstrip() + "..."


def build_category_display(cat: str | None, sub: str | None) -> str:
    c = (cat or "").strip()
    s = (sub or "").strip()
    if c and s:
        out = f"{c} / {s}"
    elif c:
        out = c
    elif s:
        out = s
    else:
        out = ""
    return truncate(out, 200)


def map_v1_condition_name(name: str | None) -> str:
    if not name:
        return "unknown"
    n = name.strip().lower()
    mapping = {
        "new": "new",
        "like new": "like_new",
        "very good": "very_good",
        "good": "good",
        "fair": "fair",
        "parts only": "salvage",
        "repairable": "fair",
    }
    return mapping.get(n, "unknown")


def map_v2_condition(raw: str | None) -> str:
    if not raw:
        return "unknown"
    k = raw.strip().lower().replace(" ", "_")
    if k == "poor":
        return "fair"
    mapping = {
        "new": "new",
        "like_new": "like_new",
        "very_good": "very_good",
        "good": "good",
        "fair": "fair",
        "salvage": "salvage",
        "unknown": "unknown",
    }
    return mapping.get(k, "unknown")


def unit_cost_from_po(po: PurchaseOrder | None) -> Decimal | None:
    if po is None:
        return None
    if po.purchase_cost is not None and po.item_count and po.item_count > 0:
        return po.purchase_cost / Decimal(po.item_count)
    return None


def build_search_text(
    sku: str,
    title: str,
    brand: str,
    category: str,
    notes: str,
    location: str,
    status: str,
    condition: str,
    source: str,
    product_pk: int | None,
    product_cache: dict[int, dict[str, str]],
) -> str:
    parts = [
        sku or "",
        title or "",
        brand or "",
        category or "",
        notes or "",
        location or "",
        status or "",
        condition or "",
        source or "",
    ]
    if product_pk:
        pc = product_cache.get(product_pk)
        if pc:
            parts.extend(
                [
                    pc.get("title") or "",
                    pc.get("product_number") or "",
                    pc.get("model") or "",
                    pc.get("upc") or "",
                    pc.get("brand") or "",
                ]
            )
    text = " ".join(parts).lower()
    return re.sub(r"\s+", " ", text).strip()


def allocate_sku(base: str, used: set[str]) -> str | None:
    base = truncate(base.strip(), 20)
    if not base:
        return None
    candidate = base
    n = 0
    while candidate in used:
        n += 1
        suffix = f"~{n}"
        candidate = (base[: max(0, 20 - len(suffix))] + suffix)[:20]
        if n > 10000:
            return None
    used.add(candidate)
    return candidate


class Command(BaseCommand):
    help = (
        "Backfill historical items from ecothrift_v1 / ecothrift_v2 into Item "
        "(bulk_create with precomputed search_text; idempotent on BACKFILL notes)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse legacy DBs and report counts only (no Item rows created).",
        )
        parser.add_argument(
            "--skip-v1",
            action="store_true",
            help="Only load V2 items.",
        )
        parser.add_argument(
            "--skip-v2",
            action="store_true",
            help="Only load V1 items.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Max rows per source (for testing).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        skip_v1 = options["skip_v1"]
        skip_v2 = options["skip_v2"]
        limit = options["limit"]

        stats: dict[str, int] = {
            "v1_created": 0,
            "v1_would_create": 0,
            "v1_skipped_exists": 0,
            "v1_skipped_no_sku": 0,
            "v1_sku_collision_abort": 0,
            "v1_missing_product_map": 0,
            "v2_created": 0,
            "v2_would_create": 0,
            "v2_skipped_exists": 0,
            "v2_skipped_no_sku": 0,
            "v2_missing_product_map": 0,
            "v2_sku_collision_abort": 0,
        }

        existing_v1_notes = set(
            Item.objects.filter(notes__startswith="BACKFILL:v1:").values_list("notes", flat=True)
        )
        existing_v2_notes = set(
            Item.objects.filter(notes__startswith="BACKFILL:v2:").values_list("notes", flat=True)
        )

        po_by_order: dict[str, PurchaseOrder] = {
            p.order_number: p
            for p in PurchaseOrder.objects.all().only(
                "id",
                "order_number",
                "purchase_cost",
                "item_count",
            )
        }
        misfit_v1 = po_by_order.get(MISFIT_V1)
        misfit_v2 = po_by_order.get(MISFIT_V2)
        if not misfit_v1 or not misfit_v2:
            self.stderr.write(
                self.style.ERROR(
                    f"Missing Misfit POs ({MISFIT_V1}, {MISFIT_V2}). Run setup_misfit_backfill_pos first."
                )
            )
            return

        v2_po_by_legacy_id: dict[int, PurchaseOrder] = {}
        for po in PurchaseOrder.objects.filter(notes__startswith="BACKFILL:v2:").iterator(
            chunk_size=2000
        ):
            first = (po.notes or "").split("\n")[0].strip()
            m = V2_PO_TAG.match(first)
            if m:
                v2_po_by_legacy_id[int(m.group(1))] = po

        v1_code_to_product_id: dict[str, int] = {}
        v2_id_to_product_id: dict[int, int] = {}
        for p in Product.objects.filter(description__startswith="BACKFILL:").iterator(chunk_size=2000):
            desc = (p.description or "").strip()
            m1 = V1_PRODUCT_TAG.match(desc)
            if m1:
                v1_code_to_product_id[m1.group(1)] = p.pk
            m2 = V2_PRODUCT_TAG.match(desc)
            if m2:
                v2_id_to_product_id[int(m2.group(1))] = p.pk

        product_ids: set[int] = set(v1_code_to_product_id.values()) | set(v2_id_to_product_id.values())
        product_cache: dict[int, dict[str, str]] = {}
        for p in Product.objects.filter(pk__in=product_ids).only(
            "id", "title", "product_number", "model", "upc", "brand"
        ).iterator(chunk_size=2000):
            product_cache[p.pk] = {
                "title": p.title or "",
                "product_number": p.product_number or "",
                "model": p.model or "",
                "upc": p.upc or "",
                "brand": p.brand or "",
            }

        used_skus: set[str] = set(Item.objects.values_list("sku", flat=True))
        # dry_run: single copy so V1 + V2 dry-run SKU allocation matches a real combined run
        sku_pool: set[str] = set(used_skus) if dry_run else used_skus

        if not skip_v1:
            self._load_v1(
                existing_v1_notes,
                v1_code_to_product_id,
                product_cache,
                po_by_order,
                misfit_v1,
                sku_pool,
                stats,
                dry_run,
                limit,
            )

        if not skip_v2:
            self._load_v2(
                existing_v2_notes,
                v2_id_to_product_id,
                v2_po_by_legacy_id,
                product_cache,
                misfit_v2,
                sku_pool,
                stats,
                dry_run,
                limit,
            )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "DRY RUN - no database writes.\n"
                    f"V1: would_create={stats['v1_would_create']}, skipped_exists={stats['v1_skipped_exists']}, "
                    f"skipped_no_sku={stats['v1_skipped_no_sku']}, sku_abort={stats['v1_sku_collision_abort']}, "
                    f"missing_product_map={stats['v1_missing_product_map']}\n"
                    f"V2: would_create={stats['v2_would_create']}, skipped_exists={stats['v2_skipped_exists']}, "
                    f"skipped_no_sku={stats['v2_skipped_no_sku']}, missing_product_map={stats['v2_missing_product_map']}, "
                    f"sku_abort={stats['v2_sku_collision_abort']}"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"V1: created={stats['v1_created']}, skipped_exists={stats['v1_skipped_exists']}, "
                    f"skipped_no_sku={stats['v1_skipped_no_sku']}, sku_abort={stats['v1_sku_collision_abort']}, "
                    f"missing_product_map={stats['v1_missing_product_map']}\n"
                    f"V2: created={stats['v2_created']}, skipped_exists={stats['v2_skipped_exists']}, "
                    f"skipped_no_sku={stats['v2_skipped_no_sku']}, missing_product_map={stats['v2_missing_product_map']}, "
                    f"sku_abort={stats['v2_sku_collision_abort']}"
                )
            )

    def _resolve_v1_po(
        self,
        order_number: str | None,
        po_by_order: dict[str, PurchaseOrder],
        misfit_v1: PurchaseOrder,
    ) -> PurchaseOrder:
        onum = (order_number or "").strip()
        if onum and onum in po_by_order:
            return po_by_order[onum]
        return misfit_v1

    def _resolve_v2_po(
        self,
        legacy_poid: Any,
        v2_po_by_legacy_id: dict[int, PurchaseOrder],
        misfit_v2: PurchaseOrder,
    ) -> PurchaseOrder:
        if legacy_poid is None:
            return misfit_v2
        try:
            lid = int(legacy_poid)
        except (TypeError, ValueError):
            return misfit_v2
        return v2_po_by_legacy_id.get(lid, misfit_v2)

    def _flush_item_batch(
        self,
        batch: list[Item],
        batch_size: int,
        dry_run: bool,
        stats: dict,
        source: str,
    ) -> None:
        """Persist batch or count dry-run; never increment *_created when dry_run."""
        if not batch:
            return
        n = len(batch)
        if dry_run:
            stats[f"{source}_would_create"] += n
            return
        try:
            Item.objects.bulk_create(batch, batch_size=batch_size)
        except Exception as exc:
            self.stderr.write(
                self.style.ERROR(f"Item bulk_create failed ({n} rows, source={source}): {exc}")
            )
            raise
        stats[f"{source}_created"] += n

    def _load_v1(
        self,
        existing_notes: set,
        v1_code_to_product_id: dict[str, int],
        product_cache: dict[int, dict[str, str]],
        po_by_order: dict[str, PurchaseOrder],
        misfit_v1: PurchaseOrder,
        sku_pool: set[str],
        stats: dict,
        dry_run: bool,
        limit: int | None,
    ) -> None:
        sql = """
            SELECT
                i.id,
                i.code,
                i.order_number,
                i.product_cde,
                i.retail_amt,
                i.starting_price_amt,
                st.status_id,
                cn.condition_name,
                p.title AS product_title,
                p.brand AS product_brand,
                pa.category,
                pa.subcategory
            FROM item i
            LEFT JOIN LATERAL (
                SELECT ist.status_id
                FROM item_status ist
                WHERE ist.item_cde = i.code
                ORDER BY ist.as_of DESC
                LIMIT 1
            ) st ON true
            LEFT JOIN LATERAL (
                SELECT lc.condition_name
                FROM item_condition ic
                LEFT JOIN list_condition lc ON lc.id = ic.condition_id
                WHERE ic.item_cde = i.code
                ORDER BY ic.as_of DESC
                LIMIT 1
            ) cn ON true
            LEFT JOIN LATERAL (
                SELECT p2.title, p2.brand
                FROM product p2
                WHERE p2.code = i.product_cde
                ORDER BY p2.id
                LIMIT 1
            ) p ON true
            LEFT JOIN LATERAL (
                SELECT pa2.category, pa2.subcategory
                FROM product_attrs pa2
                WHERE pa2.product_cde = i.product_cde
                ORDER BY pa2.category IS NULL, pa2.id
                LIMIT 1
            ) pa ON true
            ORDER BY i.id
        """
        batch: list[Item] = []
        batch_size = 2000
        n = 0
        stop = False
        with legacy_connect("ecothrift_v1") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                while not stop:
                    rows = cur.fetchmany(2000)
                    if not rows:
                        break
                    for row in rows:
                        if limit is not None and n >= limit:
                            stop = True
                            break
                        code = (row.get("code") or "").strip()
                        if not code:
                            stats["v1_skipped_no_sku"] += 1
                            continue
                        tag = f"BACKFILL:v1:{code}"
                        if tag in existing_notes:
                            stats["v1_skipped_exists"] += 1
                            continue

                        sku = allocate_sku(code, sku_pool)
                        if not sku:
                            stats["v1_sku_collision_abort"] += 1
                            continue

                        status_id = row.get("status_id")
                        is_sold = status_id in (16, 23)
                        status = "sold" if is_sold else "scrapped"
                        cond = map_v1_condition_name(row.get("condition_name"))

                        pcde = (row.get("product_cde") or "").strip()
                        product_pk = v1_code_to_product_id.get(pcde) if pcde else None
                        if pcde and product_pk is None:
                            stats["v1_missing_product_map"] += 1

                        po = self._resolve_v1_po(row.get("order_number"), po_by_order, misfit_v1)
                        cost = unit_cost_from_po(po)

                        title_src = row.get("product_title") or ""
                        title = truncate(title_src, 300) or f"[v1 item {code}]"
                        brand = truncate(row.get("product_brand"), 200)
                        category = build_category_display(row.get("category"), row.get("subcategory"))

                        price = to_decimal(row.get("starting_price_amt"))
                        if price is None:
                            price = to_decimal(row.get("retail_amt"))
                        if price is None:
                            price = Decimal("0")

                        sold_at = None
                        sold_for = None

                        notes = tag
                        specs = {"backfill": {"source": "v1", "legacy_id": row["id"]}}

                        search_text = build_search_text(
                            sku,
                            title,
                            brand,
                            category,
                            notes,
                            "",
                            status,
                            cond,
                            "purchased",
                            product_pk,
                            product_cache,
                        )

                        item = Item(
                            sku=sku,
                            product_id=product_pk,
                            purchase_order=po,
                            title=title,
                            brand=brand,
                            category=category,
                            price=price,
                            cost=cost,
                            source="purchased",
                            status=status,
                            condition=cond,
                            specifications=specs,
                            location="",
                            listed_at=None,
                            sold_at=sold_at,
                            sold_for=sold_for,
                            notes=notes,
                            search_text=search_text,
                        )
                        batch.append(item)
                        existing_notes.add(tag)
                        n += 1
                        if len(batch) >= batch_size:
                            self._flush_item_batch(batch, batch_size, dry_run, stats, "v1")
                            batch = []
                            self.stdout.write(f"  V1 items... {n} staged")
                    if stop:
                        break
                if batch:
                    self._flush_item_batch(batch, batch_size, dry_run, stats, "v1")

    def _load_v2(
        self,
        existing_notes: set,
        v2_id_to_product_id: dict[int, int],
        v2_po_by_legacy_id: dict[int, PurchaseOrder],
        product_cache: dict[int, dict[str, str]],
        misfit_v2: PurchaseOrder,
        sku_pool: set[str],
        stats: dict,
        dry_run: bool,
        limit: int | None,
    ) -> None:
        sql = """
            SELECT
                i.id,
                i.sku,
                i.product_id,
                i.inventory_purchase_order_id,
                i.starting_price,
                i.retail_amt,
                i.sold_at,
                i.sold_for,
                p.title AS product_title,
                p.brand AS product_brand,
                COALESCE(
                    (SELECT ih.condition
                     FROM inventory_item_history ih
                     WHERE ih.item_id = i.id
                     ORDER BY ih.updated_on DESC
                     LIMIT 1),
                    'unknown'
                ) AS condition_raw
            FROM inventory_item i
            JOIN inventory_product p ON p.id = i.product_id
            ORDER BY i.id
        """
        batch: list[Item] = []
        batch_size = 2000
        n = 0
        stop = False
        with legacy_connect("ecothrift_v2") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                while not stop:
                    rows = cur.fetchmany(2000)
                    if not rows:
                        break
                    for row in rows:
                        if limit is not None and n >= limit:
                            stop = True
                            break
                        lid = row["id"]
                        tag = f"BACKFILL:v2:{lid}"
                        if tag in existing_notes:
                            stats["v2_skipped_exists"] += 1
                            continue

                        raw_sku = (row.get("sku") or "").strip()
                        if not raw_sku:
                            stats["v2_skipped_no_sku"] += 1
                            continue

                        sku_base = raw_sku
                        if V2_ITM_NUMERIC.match(sku_base):
                            sku_base = f"V2-{sku_base}"

                        sku = allocate_sku(sku_base, sku_pool)
                        if not sku:
                            stats["v2_sku_collision_abort"] += 1
                            continue

                        legacy_pid = row.get("product_id")
                        product_pk = None
                        if legacy_pid is not None:
                            product_pk = v2_id_to_product_id.get(int(legacy_pid))
                            if product_pk is None:
                                stats["v2_missing_product_map"] += 1

                        po = self._resolve_v2_po(
                            row.get("inventory_purchase_order_id"),
                            v2_po_by_legacy_id,
                            misfit_v2,
                        )
                        cost = unit_cost_from_po(po)

                        sold_at = row.get("sold_at")
                        is_sold = sold_at is not None
                        status = "sold" if is_sold else "scrapped"
                        cond = map_v2_condition(row.get("condition_raw"))

                        title = truncate(row.get("product_title"), 300) or f"[v2 item {lid}]"
                        brand = truncate(row.get("product_brand"), 200)

                        price = to_decimal(row.get("starting_price"))
                        if price is None:
                            price = to_decimal(row.get("retail_amt"))
                        if price is None:
                            price = Decimal("0")

                        sold_for = None
                        if is_sold:
                            sold_for = to_decimal(row.get("sold_for"))

                        if sold_at is not None and timezone.is_naive(sold_at):
                            sold_at = timezone.make_aware(sold_at, timezone.get_current_timezone())

                        notes = tag
                        specs = {"backfill": {"source": "v2", "legacy_id": lid}}

                        search_text = build_search_text(
                            sku,
                            title,
                            brand,
                            "",
                            notes,
                            "",
                            status,
                            cond,
                            "purchased",
                            product_pk,
                            product_cache,
                        )

                        item = Item(
                            sku=sku,
                            product_id=product_pk,
                            purchase_order=po,
                            title=title,
                            brand=brand,
                            category="",
                            price=price,
                            cost=cost,
                            source="purchased",
                            status=status,
                            condition=cond,
                            specifications=specs,
                            location="",
                            listed_at=None,
                            sold_at=sold_at if is_sold else None,
                            sold_for=sold_for,
                            notes=notes,
                            search_text=search_text,
                        )
                        batch.append(item)
                        existing_notes.add(tag)
                        n += 1
                        if len(batch) >= batch_size:
                            self._flush_item_batch(batch, batch_size, dry_run, stats, "v2")
                            batch = []
                            self.stdout.write(f"  V2 items... {n} staged")
                    if stop:
                        break
                if batch:
                    self._flush_item_batch(batch, batch_size, dry_run, stats, "v2")
