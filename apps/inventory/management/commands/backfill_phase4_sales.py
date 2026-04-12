"""
Backfill Phase 4: legacy V1/V2 POS carts and cart lines into V3 Cart / CartLine (psycopg2 reads).

Infrastructure: WorkLocation "Eco-Thrift Main", Register code BACKFILL, system User backfill@system.local,
one Drawer per distinct sale date (America/Chicago) on that register.

Idempotency: without --clean, aborts if any Cart exists on the backfill register. --clean deletes those
carts (CASCADE CartLine). --reset-item-sales clears sold_at/sold_for on BACKFILL items before load.

Cart has no notes field; legacy cart keys are kept in memory maps during the run.

CartLine bulk_create: set line_total = unit_price * quantity (CartLine.save is not called).
"""

from __future__ import annotations

import re
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

import psycopg2
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from psycopg2.extras import RealDictCursor
from zoneinfo import ZoneInfo

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.inventory.management.command_db import (
    add_database_argument,
    add_no_input_argument,
    confirm_production_write,
    resolve_database_alias,
)
from apps.inventory.models import Item
from apps.pos.models import Cart, CartLine, Drawer, HistoricalTransaction, Register

V2_ITEM_TAG = re.compile(r"^BACKFILL:v2:(\d+)$")

BACKFILL_REGISTER_CODE = "BACKFILL"
BACKFILL_USER_EMAIL = "backfill@system.local"
WORK_LOCATION_NAME = "Eco-Thrift Main"
CHI = ZoneInfo("America/Chicago")


def legacy_connect(dbname: str):
    cfg = settings.DATABASES["default"]
    return psycopg2.connect(
        host=cfg["HOST"],
        port=cfg["PORT"],
        user=cfg["USER"],
        password=cfg["PASSWORD"],
        dbname=dbname,
    )


def to_decimal(val: Any) -> Decimal:
    if val is None:
        return Decimal("0")
    return Decimal(str(val))


def truncate(s: str | None, max_len: int) -> str:
    if not s:
        return ""
    s = str(s).strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rstrip() + "..."


def sale_date_local(dt: datetime | None) -> date | None:
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, datetime.timezone.utc)
    return dt.astimezone(CHI).date()


def drawer_open_close_times(d: date) -> tuple[datetime, datetime]:
    o = datetime.combine(d, time.min)
    c = datetime.combine(d, time(23, 59, 59))
    return (
        timezone.make_aware(o, CHI),
        timezone.make_aware(c, CHI),
    )


def classify_payment(has_cash: bool, has_card: bool) -> str:
    if has_cash and has_card:
        return "split"
    if has_card:
        return "card"
    return "cash"


def normalize_v1_tax_rate(pct: Any) -> Decimal:
    if pct is None:
        return Decimal("0")
    d = to_decimal(pct)
    if d > 1:
        return (d / Decimal("100")).quantize(Decimal("0.0001"))
    return d.quantize(Decimal("0.0001"))


def normalize_v2_tax_rate(rate: Any) -> Decimal:
    if rate is None:
        return Decimal("0")
    d = to_decimal(rate)
    if d > 1:
        return (d / Decimal("100")).quantize(Decimal("0.0001"))
    return d.quantize(Decimal("0.0001"))


class Command(BaseCommand):
    help = (
        "Backfill historical POS carts and cart lines from ecothrift_v1 / ecothrift_v2; "
        "update BACKFILL Item sold_at / sold_for from cart lines."
    )

    def add_arguments(self, parser):
        add_database_argument(parser)
        add_no_input_argument(parser)
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Count and validate only; no writes.",
        )
        parser.add_argument(
            "--clean",
            action="store_true",
            help="Delete existing Carts on the backfill register (CASCADE CartLines) before load.",
        )
        parser.add_argument(
            "--reset-item-sales",
            action="store_true",
            help="Clear sold_at and sold_for on all BACKFILL items before load (use with --clean for a full redo).",
        )
        parser.add_argument(
            "--delete-historical-transactions",
            action="store_true",
            help="After successful load, delete HistoricalTransaction rows for source_db db1 and db2 (avoids duplicate charts vs import_historical_transactions).",
        )
        parser.add_argument(
            "--skip-v1",
            action="store_true",
        )
        parser.add_argument(
            "--skip-v2",
            action="store_true",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Max carts per source (testing).",
        )
        parser.add_argument(
            "--skip-item-updates",
            action="store_true",
            help="Load carts/lines only; do not update Item sold_at/sold_for.",
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
        clean = options["clean"]
        reset_item_sales = options["reset_item_sales"]
        delete_ht = options["delete_historical_transactions"]
        skip_v1 = options["skip_v1"]
        skip_v2 = options["skip_v2"]
        limit = options["limit"]
        skip_item_updates = options["skip_item_updates"]

        stats: dict[str, int] = {
            "v1_carts": 0,
            "v1_carts_would": 0,
            "v2_carts": 0,
            "v2_carts_would": 0,
            "v1_lines": 0,
            "v1_lines_would": 0,
            "v2_lines": 0,
            "v2_lines_would": 0,
            "items_updated": 0,
            "items_scrapped_to_sold": 0,
            "ht_deleted": 0,
        }

        ht_count = HistoricalTransaction.objects.using(db).filter(source_db__in=["db1", "db2"]).count()
        if ht_count and not delete_ht and not dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"HistoricalTransaction has {ht_count:,} db1/db2 rows. "
                    "Charts may double-count until you run with --delete-historical-transactions "
                    "or delete those rows. historical_revenue excludes BACKFILL carts from db3 while db1/db2 HT rows exist."
                )
            )

        register = Register.objects.using(db).filter(code=BACKFILL_REGISTER_CODE).first()
        if register and Cart.objects.using(db).filter(drawer__register=register).exists() and not clean:
            raise CommandError(
                "Backfill register already has carts. Re-run with --clean to delete them first, "
                "or use --dry-run."
            )

        if clean and not dry_run:
            if register:
                deleted, _ = Cart.objects.using(db).filter(drawer__register=register).delete()
                self.stdout.write(self.style.WARNING(f"--clean: deleted {deleted} Cart-related rows (CASCADE)."))
            else:
                self.stdout.write("No backfill register yet; --clean has nothing to delete.")

        if reset_item_sales and not dry_run:
            n = Item.objects.using(db).filter(notes__startswith="BACKFILL:").update(sold_at=None, sold_for=None)
            self.stdout.write(self.style.WARNING(f"--reset-item-sales: cleared sold_at/sold_for on {n:,} BACKFILL items."))

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no database writes except optional resets skipped."))

        system_user = self._ensure_system_user(dry_run, db)
        work_location = self._ensure_work_location(dry_run, db)
        register = self._ensure_register(work_location, system_user, dry_run, db)

        v1_pay = self._load_v1_payment_map()
        v2_pay = self._load_v2_payment_map()
        sale_dates = self._distinct_sale_dates()
        drawers_by_date = self._ensure_drawers(register, system_user, sale_dates, dry_run, db)

        v1_cart_to_pk: dict[str, int] = {}
        v2_cart_to_pk: dict[int, int] = {}

        if not skip_v1:
            self._load_v1_carts(
                drawers_by_date,
                system_user,
                v1_pay,
                v1_cart_to_pk,
                stats,
                dry_run,
                limit,
                db,
            )
            self._load_v1_lines(v1_cart_to_pk, stats, dry_run, db)

        if not skip_v2:
            v2_cashier = self._build_v2_cashier_map(system_user, db)
            self._load_v2_carts(
                drawers_by_date,
                system_user,
                v2_cashier,
                v2_pay,
                v2_cart_to_pk,
                stats,
                dry_run,
                limit,
                db,
            )
            self._load_v2_lines(v2_cart_to_pk, stats, dry_run, db)

        if not skip_item_updates and not dry_run:
            self._update_backfill_items(stats, db)

        if dry_run:
            if not skip_v1:
                stats["v1_lines_would"] = self._sql_scalar(
                    "ecothrift_v1", "SELECT COUNT(*) FROM cart_line"
                )
            if not skip_v2:
                stats["v2_lines_would"] = self._sql_scalar(
                    "ecothrift_v2", "SELECT COUNT(*) FROM pos_cart_line"
                )

        if delete_ht and not dry_run:
            del_count, _ = HistoricalTransaction.objects.using(db).filter(source_db__in=["db1", "db2"]).delete()
            stats["ht_deleted"] = del_count
            self.stdout.write(self.style.SUCCESS(f"Deleted {del_count:,} HistoricalTransaction (db1/db2) rows."))

        self._print_summary(stats, dry_run)

    def _sql_scalar(self, dbname: str, sql: str) -> int:
        with legacy_connect(dbname) as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
                row = cur.fetchone()
                return int(row[0] or 0)

    def _ensure_system_user(self, dry_run: bool, db: str) -> User | None:
        if dry_run:
            return None
        u, created = User.objects.using(db).get_or_create(
            email=BACKFILL_USER_EMAIL,
            defaults={
                "first_name": "Backfill",
                "last_name": "System",
            },
        )
        if created:
            u.set_unusable_password()
            u.save(using=db)
        return u

    def _ensure_work_location(self, dry_run: bool, db: str) -> WorkLocation | None:
        if dry_run:
            return None
        wl, _ = WorkLocation.objects.using(db).get_or_create(
            name=WORK_LOCATION_NAME,
            defaults={"address": "", "phone": ""},
        )
        return wl

    def _ensure_register(
        self, work_location: WorkLocation | None, user: User | None, dry_run: bool, db: str
    ) -> Register | None:
        if dry_run or not work_location or not user:
            return Register.objects.using(db).filter(code=BACKFILL_REGISTER_CODE).first()
        reg, _ = Register.objects.using(db).get_or_create(
            code=BACKFILL_REGISTER_CODE,
            defaults={
                "location": work_location,
                "name": "Backfill Register",
            },
        )
        return reg

    def _load_v1_payment_map(self) -> dict[str, str]:
        out: dict[str, str] = {}
        sql = """
            SELECT cart_cde,
                   bool_or(lower(trim(type)) = 'cash') AS has_cash,
                   bool_or(lower(trim(type)) IN ('credit', 'debit', 'giftcard')) AS has_card
            FROM payment
            GROUP BY cart_cde
        """
        with legacy_connect("ecothrift_v1") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                for row in cur.fetchall():
                    code = (row["cart_cde"] or "").strip()
                    if not code:
                        continue
                    out[code] = classify_payment(bool(row["has_cash"]), bool(row["has_card"]))
        return out

    def _load_v2_payment_map(self) -> dict[int, str]:
        out: dict[int, str] = {}
        sql = """
            SELECT cart_id,
                   bool_or(payment_method = 'cash') AS has_cash,
                   bool_or(payment_method = 'card') AS has_card
            FROM pos_payment
            GROUP BY cart_id
        """
        with legacy_connect("ecothrift_v2") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                for row in cur.fetchall():
                    cid = row["cart_id"]
                    if cid is None:
                        continue
                    out[int(cid)] = classify_payment(bool(row["has_cash"]), bool(row["has_card"]))
        return out

    def _distinct_sale_dates(self) -> set[date]:
        """Match Python sale_date_local (America/Chicago calendar day)."""
        dates: set[date] = set()
        with legacy_connect("ecothrift_v1") as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT DATE(close_time AT TIME ZONE 'America/Chicago') AS d
                    FROM cart
                    WHERE void = false
                      AND close_time IS NOT NULL
                      AND EXTRACT(YEAR FROM close_time) < 9999
                    """
                )
                for (d,) in cur.fetchall():
                    if d:
                        dates.add(d)
        with legacy_connect("ecothrift_v2") as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT DATE(completed_at AT TIME ZONE 'America/Chicago') AS d
                    FROM pos_cart
                    WHERE status = 'completed'
                      AND completed_at IS NOT NULL
                    """
                )
                for (d,) in cur.fetchall():
                    if d:
                        dates.add(d)
        return dates

    def _ensure_drawers(
        self,
        register: Register | None,
        user: User | None,
        sale_dates: set[date],
        dry_run: bool,
        db: str,
    ) -> dict[date, Drawer]:
        out: dict[date, Drawer] = {}
        if dry_run or not register or not user:
            return out
        for d in sorted(sale_dates):
            opened_at, closed_at = drawer_open_close_times(d)
            dr, _ = Drawer.objects.using(db).get_or_create(
                register=register,
                date=d,
                defaults={
                    "current_cashier": user,
                    "opened_by": user,
                    "opened_at": opened_at,
                    "opening_count": {},
                    "opening_total": Decimal("0"),
                    "status": "closed",
                    "closed_by": user,
                    "closed_at": closed_at,
                    "cash_sales_total": Decimal("0"),
                },
            )
            out[d] = dr
        self.stdout.write(self.style.SUCCESS(f"Drawers available for {len(out)} distinct sale dates."))
        return out

    def _build_v2_cashier_map(self, system_user: User | None, db: str) -> dict[int, int]:
        """Map legacy core_user.id -> V3 User pk (by email), else system user."""
        out: dict[int, int] = {}
        if not system_user:
            return out
        sys_pk = system_user.pk
        with legacy_connect("ecothrift_v2") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT id, email FROM core_user WHERE email IS NOT NULL AND email != ''")
                rows = cur.fetchall()
        emails = [r["email"].strip().lower() for r in rows if r.get("email")]
        existing = {
            u.email.lower(): u.pk
            for u in User.objects.using(db).filter(email__in=[r["email"] for r in rows if r.get("email")])
        }
        for r in rows:
            lid = int(r["id"])
            em = (r.get("email") or "").strip().lower()
            if em and em in existing:
                out[lid] = existing[em]
            else:
                out[lid] = sys_pk
        return out

    def _load_v1_carts(
        self,
        drawers_by_date: dict[date, Drawer],
        system_user: User | None,
        v1_pay: dict[str, str],
        v1_cart_to_pk: dict[str, int],
        stats: dict,
        dry_run: bool,
        limit: int | None,
        db: str,
    ) -> None:
        sql = """
            SELECT code, close_time, subtotal_amt, sales_tax_percentage, tax_amt, total_amt
            FROM cart
            WHERE void = false
              AND close_time IS NOT NULL
              AND EXTRACT(YEAR FROM close_time) < 9999
            ORDER BY close_time
        """
        batch: list[Cart] = []
        batch_codes: list[str] = []
        batch_size = 500
        n = 0
        stop = False
        with legacy_connect("ecothrift_v1") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                while not stop:
                    rows = cur.fetchmany(1000)
                    if not rows:
                        break
                    for row in rows:
                        if limit is not None and n >= limit:
                            stop = True
                            break
                        code = (row["code"] or "").strip()
                        if not code:
                            continue
                        ct = row["close_time"]
                        d = sale_date_local(ct)
                        if d is None:
                            continue
                        if dry_run:
                            stats["v1_carts_would"] += 1
                            n += 1
                            continue
                        dr = drawers_by_date.get(d)
                        if not dr:
                            self.stderr.write(self.style.WARNING(f"No drawer for date {d} cart {code}; skip."))
                            continue
                        assert system_user is not None
                        pay = v1_pay.get(code, "cash")
                        cart = Cart(
                            drawer=dr,
                            cashier=system_user,
                            status="completed",
                            subtotal=to_decimal(row.get("subtotal_amt")),
                            tax_rate=normalize_v1_tax_rate(row.get("sales_tax_percentage")),
                            tax_amount=to_decimal(row.get("tax_amt")),
                            total=to_decimal(row.get("total_amt")),
                            payment_method=pay,
                            completed_at=ct
                            if ct is None or timezone.is_aware(ct)
                            else timezone.make_aware(ct, datetime.timezone.utc),
                        )
                        batch.append(cart)
                        batch_codes.append(code)
                        n += 1
                        if len(batch) >= batch_size:
                            self._flush_carts(batch, batch_codes, v1_cart_to_pk, stats, "v1", db)
                            batch = []
                            batch_codes = []
                    if stop:
                        break
                if batch and not dry_run:
                    self._flush_carts(batch, batch_codes, v1_cart_to_pk, stats, "v1", db)

    def _flush_carts(
        self,
        batch: list[Cart],
        batch_codes: list[str],
        dest: dict[str, int],
        stats: dict,
        label: str,
        db: str,
    ) -> None:
        created = Cart.objects.using(db).bulk_create(batch, batch_size=len(batch))
        for cart_obj, code in zip(created, batch_codes):
            dest[code] = cart_obj.pk
        stats[f"{label}_carts"] += len(created)

    def _load_v1_lines(
        self,
        v1_cart_to_pk: dict[str, int],
        stats: dict,
        dry_run: bool,
        db: str,
    ) -> None:
        sql = """
            SELECT cart_cde, item_cde, line_description, quantity, unit_price_amt, total_price_amt
            FROM cart_line
            ORDER BY cart_cde, line_num
        """
        sku_cache: dict[str, int | None] = {}
        batch: list[CartLine] = []
        batch_size = 2000
        with legacy_connect("ecothrift_v1") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                while True:
                    rows = cur.fetchmany(2000)
                    if not rows:
                        break
                    for row in rows:
                        cde = (row.get("cart_cde") or "").strip()
                        if not cde:
                            continue
                        cart_pk = v1_cart_to_pk.get(cde)
                        if cart_pk is None:
                            continue
                        item_cde = (row.get("item_cde") or "").strip() or None
                        item_pk = None
                        if item_cde:
                            if item_cde not in sku_cache:
                                sku_cache[item_cde] = (
                                    Item.objects.using(db)
                                    .filter(sku=item_cde)
                                    .values_list("id", flat=True)
                                    .first()
                                )
                            item_pk = sku_cache[item_cde]
                        qty = int(row.get("quantity") or 1)
                        if qty < 1:
                            qty = 1
                        unit = to_decimal(row.get("unit_price_amt"))
                        line_total = unit * qty
                        desc = truncate(row.get("line_description"), 300) or "(line)"
                        if dry_run:
                            stats["v1_lines_would"] += 1
                            continue
                        batch.append(
                            CartLine(
                                cart_id=cart_pk,
                                item_id=item_pk,
                                description=desc,
                                quantity=qty,
                                unit_price=unit,
                                line_total=line_total,
                            )
                        )
                        if len(batch) >= batch_size:
                            CartLine.objects.using(db).bulk_create(batch, batch_size=batch_size)
                            stats["v1_lines"] += len(batch)
                            batch = []
                if batch and not dry_run:
                    CartLine.objects.using(db).bulk_create(batch, batch_size=batch_size)
                    stats["v1_lines"] += len(batch)

    def _load_v2_carts(
        self,
        drawers_by_date: dict[date, Drawer],
        system_user: User | None,
        v2_cashier: dict[int, int],
        v2_pay: dict[int, str],
        v2_cart_to_pk: dict[int, int],
        stats: dict,
        dry_run: bool,
        limit: int | None,
        db: str,
    ) -> None:
        sql = """
            SELECT id, completed_at, subtotal, tax_rate, tax_amount, total, cashier_id, status
            FROM pos_cart
            WHERE status = 'completed'
              AND completed_at IS NOT NULL
            ORDER BY id
        """
        batch: list[Cart] = []
        batch_ids: list[int] = []
        batch_size = 500
        n = 0
        stop = False
        users_by_pk: dict[int, User] = {}
        if not dry_run and system_user:
            pks = set(v2_cashier.values()) | {system_user.pk}
            users_by_pk = {u.pk: u for u in User.objects.using(db).filter(pk__in=pks)}
        with legacy_connect("ecothrift_v2") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                while not stop:
                    rows = cur.fetchmany(1000)
                    if not rows:
                        break
                    for row in rows:
                        if limit is not None and n >= limit:
                            stop = True
                            break
                        cid = int(row["id"])
                        ct = row["completed_at"]
                        d = sale_date_local(ct)
                        if d is None:
                            continue
                        if dry_run:
                            stats["v2_carts_would"] += 1
                            n += 1
                            continue
                        assert system_user is not None
                        dr = drawers_by_date.get(d)
                        if not dr:
                            self.stderr.write(self.style.WARNING(f"No drawer for date {d} pos_cart {cid}; skip."))
                            continue
                        leg_cashier = row.get("cashier_id")
                        if leg_cashier is not None:
                            cashier_pk = v2_cashier.get(int(leg_cashier), system_user.pk)
                        else:
                            cashier_pk = system_user.pk
                        cashier = users_by_pk.get(cashier_pk) or users_by_pk[system_user.pk]
                        pay = v2_pay.get(cid, "cash")
                        ca = (
                            ct
                            if ct is None or timezone.is_aware(ct)
                            else timezone.make_aware(ct, datetime.timezone.utc)
                        )
                        cart = Cart(
                            drawer=dr,
                            cashier=cashier,
                            status="completed",
                            subtotal=to_decimal(row.get("subtotal")),
                            tax_rate=normalize_v2_tax_rate(row.get("tax_rate")),
                            tax_amount=to_decimal(row.get("tax_amount")),
                            total=to_decimal(row.get("total")),
                            payment_method=pay,
                            completed_at=ca,
                        )
                        batch.append(cart)
                        batch_ids.append(cid)
                        n += 1
                        if len(batch) >= batch_size:
                            self._flush_v2_carts(batch, batch_ids, v2_cart_to_pk, stats, db)
                            batch = []
                            batch_ids = []
                    if stop:
                        break
                if batch and not dry_run:
                    self._flush_v2_carts(batch, batch_ids, v2_cart_to_pk, stats, db)

    def _flush_v2_carts(
        self,
        batch: list[Cart],
        batch_ids: list[int],
        dest: dict[int, int],
        stats: dict,
        db: str,
    ) -> None:
        created = Cart.objects.using(db).bulk_create(batch, batch_size=len(batch))
        for cart_obj, lid in zip(created, batch_ids):
            dest[lid] = cart_obj.pk
        stats["v2_carts"] += len(created)

    def _load_v2_lines(
        self,
        v2_cart_to_pk: dict[int, int],
        stats: dict,
        dry_run: bool,
        db: str,
    ) -> None:
        v2_notes: dict[int, int] = {}
        for iid, notes in Item.objects.using(db).filter(notes__startswith="BACKFILL:v2:").values_list(
            "id", "notes"
        ):
            m = V2_ITEM_TAG.match((notes or "").strip())
            if m:
                v2_notes[int(m.group(1))] = iid
        sql = """
            SELECT cart_id, item_id, quantity, unit_price, line_total, product_title
            FROM pos_cart_line
            ORDER BY cart_id, id
        """
        batch: list[CartLine] = []
        batch_size = 2000
        with legacy_connect("ecothrift_v2") as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                while True:
                    rows = cur.fetchmany(2000)
                    if not rows:
                        break
                    for row in rows:
                        cart_id = row.get("cart_id")
                        if cart_id is None:
                            continue
                        cart_pk = v2_cart_to_pk.get(int(cart_id))
                        if cart_pk is None:
                            continue
                        leg_item = row.get("item_id")
                        item_pk = None
                        if leg_item is not None:
                            item_pk = v2_notes.get(int(leg_item))
                        qty = int(row.get("quantity") or 1)
                        if qty < 1:
                            qty = 1
                        unit = to_decimal(row.get("unit_price"))
                        line_total = to_decimal(row.get("line_total"))
                        if line_total == 0:
                            line_total = unit * qty
                        desc = truncate(row.get("product_title"), 300) or "(line)"
                        if dry_run:
                            stats["v2_lines_would"] += 1
                            continue
                        batch.append(
                            CartLine(
                                cart_id=cart_pk,
                                item_id=item_pk,
                                description=desc,
                                quantity=qty,
                                unit_price=unit,
                                line_total=line_total,
                            )
                        )
                        if len(batch) >= batch_size:
                            CartLine.objects.using(db).bulk_create(batch, batch_size=batch_size)
                            stats["v2_lines"] += len(batch)
                            batch = []
                if batch and not dry_run:
                    CartLine.objects.using(db).bulk_create(batch, batch_size=batch_size)
                    stats["v2_lines"] += len(batch)

    def _update_backfill_items(self, stats: dict, db: str) -> None:
        best: dict[int, tuple[datetime, Decimal]] = {}
        qs = CartLine.objects.using(db).filter(
            item__isnull=False,
            item__notes__startswith="BACKFILL:",
        ).select_related("cart")
        scrapped_before = set(
            Item.objects.using(db)
            .filter(notes__startswith="BACKFILL:", status="scrapped")
            .values_list("id", flat=True)
        )
        for cl in qs.iterator(chunk_size=5000):
            cart = cl.cart
            if not cart or not cart.completed_at:
                continue
            at = cart.completed_at
            pk = cl.item_id
            assert pk is not None
            prev = best.get(pk)
            if prev is None or at > prev[0]:
                best[pk] = (at, cl.unit_price)
        to_update: list[Item] = []
        for pk, (sold_at, sold_for) in best.items():
            to_update.append(
                Item(
                    pk=pk,
                    sold_at=sold_at,
                    sold_for=sold_for,
                    status="sold",
                )
            )
        for i in range(0, len(to_update), 500):
            chunk = to_update[i : i + 500]
            Item.objects.using(db).bulk_update(chunk, ["sold_at", "sold_for", "status"])
        stats["items_updated"] = len(to_update)
        stats["items_scrapped_to_sold"] = sum(1 for pk in best if pk in scrapped_before)
        self.stdout.write(
            self.style.SUCCESS(
                f"Updated {len(to_update):,} BACKFILL items (sold_at/sold_for/status=sold); "
                f"scrapped->sold: {stats['items_scrapped_to_sold']:,}."
            )
        )

    def _print_summary(self, stats: dict, dry_run: bool) -> None:
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN totals: V1 carts would={stats['v1_carts_would']}, "
                    f"V2 carts would={stats['v2_carts_would']}, "
                    f"V1 lines would={stats['v1_lines_would']}, V2 lines would={stats['v2_lines_would']}"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"V1 carts={stats['v1_carts']}, V2 carts={stats['v2_carts']}, "
                    f"V1 lines={stats['v1_lines']}, V2 lines={stats['v2_lines']}, "
                    f"items updated={stats['items_updated']}, HT deleted={stats['ht_deleted']}"
                )
            )
