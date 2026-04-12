"""
Backfill Phase 2: legacy V1/V2 products and manifest rows into V3 (raw psycopg2 reads).

Products: individual Product.save() so generate_product_number() applies (idempotent on description tag).
ManifestRows: bulk_create in batches (no custom save on model).

Recon (local ecothrift_v1 / ecothrift_v2): ~140.6K V1 + ~41.5K V2 products; ~107.7K + ~36.3K manifest rows.
product_attrs has multiple rows per product_cde — pick one via LATERAL subquery.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

import psycopg2
from django.conf import settings
from django.core.management.base import BaseCommand
from psycopg2.extras import RealDictCursor

from apps.inventory.management.command_db import (
    add_database_argument,
    add_no_input_argument,
    confirm_production_write,
    resolve_database_alias,
)
from apps.inventory.models import ManifestRow, Product, PurchaseOrder


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


def build_legacy_specs(cat: str | None, sub: str | None) -> dict:
    d: dict = {}
    if cat and str(cat).strip():
        d["legacy_category"] = str(cat).strip()
    if sub and str(sub).strip():
        d["legacy_subcategory"] = str(sub).strip()
    return d


V2_PO_TAG = re.compile(r"^BACKFILL:v2:(\d+)$")


class Command(BaseCommand):
    help = (
        "Backfill products and manifest rows from ecothrift_v1 / ecothrift_v2 "
        "(psycopg2 reads; products via save(), manifests via bulk_create)."
    )

    def add_arguments(self, parser):
        add_database_argument(parser)
        add_no_input_argument(parser)
        parser.add_argument(
            "--skip-products",
            action="store_true",
            help="Only load manifest rows (products must already exist).",
        )
        parser.add_argument(
            "--skip-manifests",
            action="store_true",
            help="Only load products (manifest rows unchanged).",
        )

    def handle(self, *args, **options):
        db = resolve_database_alias(options["database"])
        confirm_production_write(
            stdout=self.stdout,
            stderr=self.stderr,
            db_alias=db,
            no_input=options["no_input"],
            dry_run=False,
        )
        skip_products = options["skip_products"]
        skip_manifests = options["skip_manifests"]

        stats = {
            "v1_products_created": 0,
            "v1_products_skipped": 0,
            "v2_products_created": 0,
            "v2_products_skipped": 0,
            "manifests_created": 0,
            "manifests_skipped_exists": 0,
            "manifests_skipped_no_po": 0,
        }

        existing_products = set(
            Product.objects.using(db).filter(description__startswith="BACKFILL:").values_list(
                "description", flat=True
            )
        )
        existing_manifest_notes = set(
            ManifestRow.objects.using(db).filter(notes__startswith="BACKFILL:").values_list(
                "notes", flat=True
            )
        )

        po_by_order_number = {
            p.order_number: p
            for p in PurchaseOrder.objects.using(db).all().only("id", "order_number")
        }

        v2_po_by_legacy_id: dict[int, PurchaseOrder] = {}
        for po in PurchaseOrder.objects.using(db).filter(notes__startswith="BACKFILL:v2:").iterator(
            chunk_size=2000
        ):
            first = (po.notes or "").split("\n")[0].strip()
            m = V2_PO_TAG.match(first)
            if m:
                v2_po_by_legacy_id[int(m.group(1))] = po

        if not skip_products:
            self._load_v1_products(existing_products, stats, db)
            self._load_v2_products(existing_products, stats, db)

        if not skip_manifests:
            self._load_v1_manifests(
                po_by_order_number,
                existing_manifest_notes,
                stats,
                db,
            )
            self._load_v2_manifests(
                v2_po_by_legacy_id,
                existing_manifest_notes,
                stats,
                db,
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"V1 products: created={stats['v1_products_created']}, skipped={stats['v1_products_skipped']}\n"
                f"V2 products: created={stats['v2_products_created']}, skipped={stats['v2_products_skipped']}\n"
                f"Manifest rows: created={stats['manifests_created']}, "
                f"skipped_existing={stats['manifests_skipped_exists']}, "
                f"skipped_no_po={stats['manifests_skipped_no_po']}"
            )
        )

    def _load_v1_products(self, existing: set, stats: dict, db: str) -> None:
        sql = """
            SELECT
                p.id,
                p.code,
                p.title,
                p.brand,
                p.model,
                pa.upc,
                pa.category,
                pa.subcategory,
                pa.retail_amt
            FROM product p
            LEFT JOIN LATERAL (
                SELECT upc, category, subcategory, retail_amt
                FROM product_attrs pa2
                WHERE pa2.product_cde = p.code
                ORDER BY pa2.category IS NULL, pa2.id
                LIMIT 1
            ) pa ON true
            ORDER BY p.id
        """
        n = 0
        with legacy_connect("ecothrift_v1") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                while True:
                    rows = cur.fetchmany(2000)
                    if not rows:
                        break
                    for row in rows:
                        code = (row.get("code") or "").strip()
                        if not code:
                            stats["v1_products_skipped"] += 1
                            continue
                        tag = f"BACKFILL:v1:{code}"
                        if tag in existing:
                            stats["v1_products_skipped"] += 1
                            continue
                        cat = row.get("category")
                        sub = row.get("subcategory")
                        specs = build_legacy_specs(cat, sub)
                        p = Product(
                            title=truncate(row.get("title"), 300) or "[no title]",
                            brand=truncate(row.get("brand"), 200),
                            model=truncate(row.get("model"), 200),
                            upc=truncate(row.get("upc"), 100),
                            category=build_category_display(cat, sub),
                            default_price=to_decimal(row.get("retail_amt")),
                            description=tag,
                            specifications=specs,
                        )
                        p.save(using=db)
                        existing.add(tag)
                        stats["v1_products_created"] += 1
                        n += 1
                        if n % 5000 == 0:
                            self.stdout.write(f"  V1 products... {n} saved")

    def _load_v2_products(self, existing: set, stats: dict, db: str) -> None:
        sql = """
            SELECT id, title, brand, model
            FROM inventory_product
            ORDER BY id
        """
        n = 0
        with legacy_connect("ecothrift_v2") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                while True:
                    rows = cur.fetchmany(2000)
                    if not rows:
                        break
                    for row in rows:
                        lid = row["id"]
                        tag = f"BACKFILL:v2:{lid}"
                        if tag in existing:
                            stats["v2_products_skipped"] += 1
                            continue
                        p = Product(
                            title=truncate(row.get("title"), 300) or "[no title]",
                            brand=truncate(row.get("brand"), 200),
                            model=truncate(row.get("model"), 200),
                            upc="",
                            category="",
                            default_price=None,
                            description=tag,
                            specifications={},
                        )
                        p.save(using=db)
                        existing.add(tag)
                        stats["v2_products_created"] += 1
                        n += 1
                        if n % 5000 == 0:
                            self.stdout.write(f"  V2 products... {n} saved")

    def _load_v1_manifests(
        self,
        po_by_order_number: dict[str, PurchaseOrder],
        existing_notes: set,
        stats: dict,
        db: str,
    ) -> None:
        sql = """
            SELECT
                id,
                order_number,
                line_number,
                quantity,
                retail_amt,
                ext_retail_amt,
                description,
                brand,
                model,
                category,
                subcategory,
                upc
            FROM manifest
            ORDER BY id
        """
        batch: list[ManifestRow] = []
        batch_size = 1500
        n = 0
        with legacy_connect("ecothrift_v1") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                while True:
                    rows = cur.fetchmany(2000)
                    if not rows:
                        break
                    for row in rows:
                        tag = f"BACKFILL:v1:{row['id']}"
                        if tag in existing_notes:
                            stats["manifests_skipped_exists"] += 1
                            continue
                        onum = (row.get("order_number") or "").strip()
                        if not onum:
                            stats["manifests_skipped_no_po"] += 1
                            continue
                        po = po_by_order_number.get(onum)
                        if not po:
                            stats["manifests_skipped_no_po"] += 1
                            continue
                        qty = row.get("quantity")
                        if qty is None:
                            qty = 1
                        rv = row.get("retail_amt")
                        if rv is None:
                            rv = row.get("ext_retail_amt")
                        desc = row.get("description") or ""
                        cat = row.get("category")
                        sub = row.get("subcategory")
                        specs = build_legacy_specs(cat, sub)
                        line = row.get("line_number")
                        if line is None:
                            line = row["id"]
                        mr = ManifestRow(
                            purchase_order=po,
                            row_number=int(line),
                            quantity=max(1, int(qty)),
                            description=desc,
                            title=truncate(desc, 300),
                            brand=truncate(row.get("brand"), 200),
                            model=truncate(row.get("model"), 200),
                            category=build_category_display(cat, sub),
                            retail_value=to_decimal(rv),
                            upc=truncate(row.get("upc"), 100),
                            notes=tag,
                            specifications=specs,
                        )
                        batch.append(mr)
                        existing_notes.add(tag)
                        n += 1
                        if len(batch) >= batch_size:
                            ManifestRow.objects.bulk_create(batch, batch_size=batch_size, using=db)
                            stats["manifests_created"] += len(batch)
                            batch = []
                            self.stdout.write(f"  V1 manifests... {n} staged")
                if batch:
                    ManifestRow.objects.bulk_create(batch, batch_size=batch_size, using=db)
                    stats["manifests_created"] += len(batch)

    def _load_v2_manifests(
        self,
        v2_po_by_legacy_id: dict[int, PurchaseOrder],
        existing_notes: set,
        stats: dict,
        db: str,
    ) -> None:
        sql = """
            SELECT
                id,
                row_number,
                quantity,
                description,
                retail_value,
                brand,
                model,
                category,
                subcategory,
                upc,
                purchase_order_id
            FROM inventory_manifest_rows
            ORDER BY id
        """
        batch: list[ManifestRow] = []
        batch_size = 1500
        n = 0
        with legacy_connect("ecothrift_v2") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                while True:
                    rows = cur.fetchmany(2000)
                    if not rows:
                        break
                    for row in rows:
                        tag = f"BACKFILL:v2:{row['id']}"
                        if tag in existing_notes:
                            stats["manifests_skipped_exists"] += 1
                            continue
                        poid = row.get("purchase_order_id")
                        if poid is None:
                            stats["manifests_skipped_no_po"] += 1
                            continue
                        po = v2_po_by_legacy_id.get(int(poid))
                        if not po:
                            stats["manifests_skipped_no_po"] += 1
                            continue
                        qty = row.get("quantity")
                        if qty is None:
                            qty = 1
                        desc = row.get("description") or ""
                        cat = row.get("category")
                        sub = row.get("subcategory")
                        specs = build_legacy_specs(cat, sub)
                        mr = ManifestRow(
                            purchase_order=po,
                            row_number=int(row.get("row_number") or 0),
                            quantity=max(1, int(qty)),
                            description=desc,
                            title=truncate(desc, 300),
                            brand=truncate(row.get("brand"), 200),
                            model=truncate(row.get("model"), 200),
                            category=build_category_display(cat, sub),
                            retail_value=to_decimal(row.get("retail_value")),
                            upc=truncate(row.get("upc"), 100),
                            notes=tag,
                            specifications=specs,
                        )
                        batch.append(mr)
                        existing_notes.add(tag)
                        n += 1
                        if len(batch) >= batch_size:
                            ManifestRow.objects.bulk_create(batch, batch_size=batch_size, using=db)
                            stats["manifests_created"] += len(batch)
                            batch = []
                            self.stdout.write(f"  V2 manifests... {n} staged")
                if batch:
                    ManifestRow.objects.bulk_create(batch, batch_size=batch_size, using=db)
                    stats["manifests_created"] += len(batch)
