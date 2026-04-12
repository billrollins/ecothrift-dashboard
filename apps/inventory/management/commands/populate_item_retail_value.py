"""
One-shot: populate Item.retail_value from legacy DBs / manifest / legacy cost, then null Item.cost.

Order: BACKFILL v1 -> v2 -> manifest_row -> copy from cost; then optional Item.cost = NULL.
"""

from __future__ import annotations

import re
from typing import Any

import psycopg2
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import F, OuterRef, Subquery
from psycopg2.extras import RealDictCursor

from apps.inventory.management.command_db import (
    add_database_argument,
    add_no_input_argument,
    confirm_production_write,
    resolve_database_alias,
)
from apps.inventory.models import Item, ManifestRow

V1_TAG = re.compile(r"^BACKFILL:v1:(.+)$")
V2_TAG = re.compile(r"^BACKFILL:v2:(\d+)$")

CHUNK = 2000


def legacy_connect(dbname: str):
    cfg = settings.DATABASES["default"]
    return psycopg2.connect(
        host=cfg["HOST"],
        port=cfg["PORT"],
        user=cfg["USER"],
        password=cfg["PASSWORD"],
        dbname=dbname,
    )


def first_line(notes: str | None) -> str:
    if not notes:
        return ""
    return (notes.split("\n")[0] or "").strip()


class Command(BaseCommand):
    help = (
        "Populate Item.retail_value from ecothrift_v1/v2 retail_amt, ManifestRow, or legacy cost; "
        "then set Item.cost to NULL (unless --skip-null-cost)."
    )

    def add_arguments(self, parser):
        add_database_argument(parser)
        add_no_input_argument(parser)
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print counts only; no database writes.",
        )
        parser.add_argument(
            "--skip-null-cost",
            action="store_true",
            help="Do not run Item.objects.all().update(cost=None) after populating retail_value.",
        )

    def handle(self, *args, **options):
        db = resolve_database_alias(options["database"])
        dry_run = options["dry_run"]
        confirm_production_write(
            stdout=self.stdout,
            stderr=self.stderr,
            db_alias=db,
            no_input=options["no_input"],
            dry_run=dry_run,
        )
        skip_null_cost = options["skip_null_cost"]

        stats: dict[str, int] = {
            "v1_updated": 0,
            "v1_skipped_no_legacy": 0,
            "v2_updated": 0,
            "v2_skipped_no_legacy": 0,
            "manifest_updated": 0,
            "from_cost_updated": 0,
            "cost_nulled": 0,
        }

        # A: V1
        v1_ids = list(
            Item.objects.using(db).filter(notes__startswith="BACKFILL:v1:").values_list("id", "notes")
        )
        v1_codes: list[tuple[int, str]] = []
        for pk, notes in v1_ids:
            m = V1_TAG.match(first_line(notes))
            if m:
                v1_codes.append((pk, m.group(1).strip()))
        code_set = {c for _, c in v1_codes if c}
        retail_by_code: dict[str, Any] = {}
        if code_set:
            try:
                conn = legacy_connect("ecothrift_v1")
            except Exception as exc:
                raise SystemExit(f"Cannot connect to ecothrift_v1: {exc}") from exc
            try:
                codes_list = list(code_set)
                for i in range(0, len(codes_list), CHUNK):
                    chunk = codes_list[i : i + CHUNK]
                    placeholders = ",".join(["%s"] * len(chunk))
                    sql = f"""
                        SELECT code, retail_amt FROM item WHERE code IN ({placeholders})
                    """
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        cur.execute(sql, chunk)
                        for row in cur.fetchall():
                            c = (row.get("code") or "").strip()
                            if c:
                                retail_by_code[c] = row.get("retail_amt")
            finally:
                conn.close()

        to_update_v1: list[Item] = []
        for pk, code in v1_codes:
            ra = retail_by_code.get(code)
            if ra is None:
                stats["v1_skipped_no_legacy"] += 1
                continue
            to_update_v1.append(Item(id=pk, retail_value=ra))
        if to_update_v1 and not dry_run:
            Item.objects.using(db).bulk_update(to_update_v1, ["retail_value"], batch_size=CHUNK)
        stats["v1_updated"] = len(to_update_v1)

        # B: V2
        v2_ids = list(
            Item.objects.using(db).filter(notes__startswith="BACKFILL:v2:").values_list("id", "notes")
        )
        legacy_pairs: list[tuple[int, int]] = []
        for pk, notes in v2_ids:
            m = V2_TAG.match(first_line(notes))
            if m:
                legacy_pairs.append((pk, int(m.group(1))))
        id_set = {lid for _, lid in legacy_pairs}
        retail_by_legacy_id: dict[int, Any] = {}
        if id_set:
            try:
                conn = legacy_connect("ecothrift_v2")
            except Exception as exc:
                raise SystemExit(f"Cannot connect to ecothrift_v2: {exc}") from exc
            try:
                ids_list = list(id_set)
                for i in range(0, len(ids_list), CHUNK):
                    chunk = ids_list[i : i + CHUNK]
                    placeholders = ",".join(["%s"] * len(chunk))
                    sql = f"""
                        SELECT id, retail_amt FROM inventory_item WHERE id IN ({placeholders})
                    """
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        cur.execute(sql, chunk)
                        for row in cur.fetchall():
                            lid = row.get("id")
                            if lid is not None:
                                retail_by_legacy_id[int(lid)] = row.get("retail_amt")
            finally:
                conn.close()

        to_update_v2: list[Item] = []
        for pk, lid in legacy_pairs:
            ra = retail_by_legacy_id.get(lid)
            if ra is None:
                stats["v2_skipped_no_legacy"] += 1
                continue
            to_update_v2.append(Item(id=pk, retail_value=ra))
        if to_update_v2 and not dry_run:
            Item.objects.using(db).bulk_update(to_update_v2, ["retail_value"], batch_size=CHUNK)
        stats["v2_updated"] = len(to_update_v2)

        # C: manifest row (only where still null)
        mr_sub = (
            ManifestRow.objects.using(db)
            .filter(pk=OuterRef("manifest_row_id"))
            .values("retail_value")[:1]
        )
        if not dry_run:
            n = Item.objects.using(db).filter(
                manifest_row_id__isnull=False, retail_value__isnull=True
            ).update(
                retail_value=Subquery(mr_sub),
            )
            stats["manifest_updated"] = n
        else:
            stats["manifest_updated"] = Item.objects.using(db).filter(
                manifest_row_id__isnull=False, retail_value__isnull=True
            ).count()

        # D: copy from cost where retail still null
        if not dry_run:
            n = Item.objects.using(db).filter(retail_value__isnull=True, cost__isnull=False).update(
                retail_value=F("cost")
            )
            stats["from_cost_updated"] = n
        else:
            stats["from_cost_updated"] = Item.objects.using(db).filter(
                retail_value__isnull=True, cost__isnull=False
            ).count()

        # Null cost
        if not dry_run and not skip_null_cost:
            stats["cost_nulled"] = Item.objects.using(db).all().update(cost=None)
        elif dry_run and not skip_null_cost:
            stats["cost_nulled"] = Item.objects.using(db).exclude(cost__isnull=True).count()

        self.stdout.write(
            self.style.SUCCESS(
                f"V1 retail_value updated: {stats['v1_updated']} (skipped no legacy row: {stats['v1_skipped_no_legacy']})\n"
                f"V2 retail_value updated: {stats['v2_updated']} (skipped: {stats['v2_skipped_no_legacy']})\n"
                f"Manifest join updated: {stats['manifest_updated']}\n"
                f"Copied from cost: {stats['from_cost_updated']}\n"
                f"Cost nulled: {stats['cost_nulled'] if not skip_null_cost else '(skipped by --skip-null-cost)'}\n"
                f"dry_run={dry_run}"
            )
        )
