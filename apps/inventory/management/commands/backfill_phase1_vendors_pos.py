"""
Backfill Phase 1: legacy V1/V2 vendors and purchase orders into V3 (raw psycopg2 reads).

Idempotent: get_or_create on Vendor.code and PurchaseOrder.order_number.
Skips Misfit POs MISFIT-V1-2024 / MISFIT-V2-2025. Does not recreate vendor MIS (Phase 0).
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime
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
from apps.inventory.models import PurchaseOrder, Vendor

MISFIT_ORDER_NUMBERS = frozenset({'MISFIT-V1-2024', 'MISFIT-V2-2025'})

V1_PREFIX_TO_VENDOR = {
    'AMZ': ('AMZ', 'Amazon'),
    'TGT': ('TGT', 'Target'),
    'WAL': ('WAL', 'Walmart'),
    'CST': ('CST', 'Costco'),
    'WFR': ('WFR', 'Wayfair'),
    'HMD': ('HMD', 'Home Depot'),
    'ESS': ('ESS', 'Essendant'),
    'GEN': ('GEN', 'Generic'),
}


def legacy_connect(dbname: str):
    cfg = settings.DATABASES['default']
    return psycopg2.connect(
        host=cfg['HOST'],
        port=cfg['PORT'],
        user=cfg['USER'],
        password=cfg['PASSWORD'],
        dbname=dbname,
    )


def to_date(val: Any) -> date | None:
    if val is None:
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    return None


def to_decimal(val: Any) -> Decimal | None:
    if val is None:
        return None
    return Decimal(str(val))


def map_v1_condition(name: str | None) -> str:
    if not name:
        return ''
    n = name.strip().lower()
    mapping = {
        'new': 'new',
        'like new': 'like_new',
        'good': 'good',
        'fair': 'fair',
        'repairable': 'salvage',
        'very good': 'good',
    }
    return mapping.get(n, '')


def map_v2_condition(raw: str | None) -> str:
    if not raw:
        return ''
    n = (raw or '').strip().lower()
    mapping = {
        'new': 'new',
        'like_new': 'like_new',
        'good': 'good',
        'fair': 'fair',
        'salvage': 'salvage',
        'mixed': 'mixed',
        'very_good': 'good',
    }
    return mapping.get(n, '')


def v1_status(row: dict) -> str:
    if row.get('processed_on'):
        return 'complete'
    if row.get('received_on'):
        return 'delivered'
    if row.get('paid_on'):
        return 'paid'
    return 'ordered'


def v2_status(raw: str | None) -> str:
    if not raw:
        return 'ordered'
    s = raw.strip().lower()
    return {
        'confirmed': 'ordered',
        'items_generated': 'processing',
        'received': 'delivered',
    }.get(s, 'ordered')


def map_v2_vendor_type(raw: str | None) -> str:
    if not raw:
        return 'other'
    s = raw.strip().lower()
    allowed = {c[0] for c in Vendor.VENDOR_TYPES}
    if s in allowed:
        return s
    return 'other'


def truncate_description(s: str | None, max_len: int = 500) -> str:
    if not s:
        return ''
    s = s.strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rstrip() + '…'


def parse_description_metadata(description: str) -> dict[str, Any]:
    """Extract structured hints from auction-style PO descriptions. Returns only keys found."""
    if not description or not description.strip():
        return {}
    text = description.strip()
    out: dict[str, Any] = {}

    m = re.search(r'Ext\.?\s*Retail\s*\$?\s*([\d,]+)', text, re.I)
    if m:
        try:
            out['ext_retail'] = int(m.group(1).replace(',', ''))
        except ValueError:
            pass

    m = re.search(r'([\d,]+)\s+Units?\b', text, re.I)
    if m:
        try:
            out['units'] = int(m.group(1).replace(',', ''))
        except ValueError:
            pass

    m = re.search(r'\((\d+)\s+Pallets?\)', text, re.I)
    if m:
        try:
            out['pallets'] = int(m.group(1))
        except ValueError:
            pass

    m = re.search(r'(?:,\s*)?([A-Za-z][A-Za-z\s\.\-]+?),\s*([A-Z]{2})\s*$', text)
    if m:
        city = m.group(1).strip()
        st = m.group(2).strip()
        if len(st) == 2 and len(city) >= 2:
            out['city'] = city
            out['state'] = st

    lower = text.lower()
    of_idx = lower.find(' of ')
    if of_idx != -1:
        tail = text[of_idx + 4 :]
        cut = len(tail)
        for marker in (' Ext.', ' Ext ', ' — ', ' - Like ', ' (', '\n'):
            j = tail.find(marker)
            if j != -1 and j < cut:
                cut = j
        cat = tail[:cut].strip(' -—\t ')
        if len(cat) >= 3:
            out['category_text'] = cat

    return out


def notes_last_line_is_json_object(notes: str) -> bool:
    if not notes or not notes.strip():
        return False
    last = notes.strip().split('\n')[-1].strip()
    if not last.startswith('{'):
        return False
    try:
        obj = json.loads(last)
    except json.JSONDecodeError:
        return False
    return isinstance(obj, dict)


def build_v1_notes(legacy_id: int) -> str:
    return f'BACKFILL:v1:{legacy_id}'


def build_v2_notes(legacy_id: int, legacy_notes: str | None) -> str:
    lines = [f'BACKFILL:v2:{legacy_id}']
    if legacy_notes and str(legacy_notes).strip():
        lines.append(str(legacy_notes).strip())
    return '\n'.join(lines)


def append_json_last_line(notes: str, payload: dict[str, Any]) -> str:
    line = json.dumps(payload, separators=(',', ':'), ensure_ascii=False)
    base = notes.rstrip()
    if notes_last_line_is_json_object(base):
        lines = base.split('\n')
        lines[-1] = line
        return '\n'.join(lines)
    return f'{base}\n{line}'


class Command(BaseCommand):
    help = (
        'Backfill vendors and purchase orders from ecothrift_v1 / ecothrift_v2 into V3 '
        '(psycopg2 reads; idempotent get_or_create).'
    )

    def add_arguments(self, parser):
        add_database_argument(parser)
        add_no_input_argument(parser)
        parser.add_argument(
            '--skip-enrichment',
            action='store_true',
            help='Load vendors/POs only; skip description metadata JSON pass.',
        )

    def handle(self, *args, **options):
        db = resolve_database_alias(options['database'])
        confirm_production_write(
            stdout=self.stdout,
            stderr=self.stderr,
            db_alias=db,
            no_input=options['no_input'],
            dry_run=False,
        )
        skip_enrichment = options['skip_enrichment']
        v_created = v_existed = 0
        po_v1_c = po_v1_e = po_v2_c = po_v2_e = 0
        warn_prefix = warn_v1_cond = warn_v2_cond = 0

        with legacy_connect('ecothrift_v2') as conn_v2:
            with conn_v2.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, name, code, vendor_type
                    FROM inventory_vendor
                    ORDER BY id
                    """
                )
                rows = cur.fetchall()
            for row in rows:
                code = (row['code'] or '').strip()
                if not code:
                    self.stdout.write(self.style.WARNING(f'Skip V2 vendor id={row["id"]}: empty code'))
                    continue
                defaults = {
                    'name': (row['name'] or code).strip() or code,
                    'vendor_type': map_v2_vendor_type(row.get('vendor_type')),
                    'is_active': True,
                }
                _, created = Vendor.objects.using(db).get_or_create(code=code[:20], defaults=defaults)
                if created:
                    v_created += 1
                else:
                    v_existed += 1

        for code, (vc, vname) in V1_PREFIX_TO_VENDOR.items():
            _, created = Vendor.objects.using(db).get_or_create(
                code=vc,
                defaults={
                    'name': vname,
                    'vendor_type': 'other',
                    'is_active': True,
                },
            )
            if created:
                v_created += 1
            else:
                v_existed += 1

        sql_v1 = """
            SELECT po.*, lc.condition_name
            FROM purchase_order po
            LEFT JOIN list_condition lc ON lc.id = po.condition_id
            ORDER BY po.purchased_on NULLS LAST
        """
        with legacy_connect('ecothrift_v1') as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql_v1)
                v1_rows = cur.fetchall()

        for row in v1_rows:
            onum = (row['number'] or '').strip()
            if not onum or onum in MISFIT_ORDER_NUMBERS:
                continue
            prefix = onum[:3].upper() if len(onum) >= 3 else ''
            if prefix not in V1_PREFIX_TO_VENDOR:
                warn_prefix += 1
                self.stdout.write(
                    self.style.WARNING(f'Unknown V1 prefix for {onum!r} — using GEN')
                )
                prefix = 'GEN'
            vcode, vname = V1_PREFIX_TO_VENDOR[prefix]
            vendor, _ = Vendor.objects.using(db).get_or_create(
                code=vcode,
                defaults={'name': vname, 'vendor_type': 'other', 'is_active': True},
            )

            cond = map_v1_condition(row.get('condition_name'))
            if row.get('condition_name') and not cond:
                warn_v1_cond += 1

            ordered = to_date(row.get('purchased_on')) or to_date(row.get('created_on'))
            if not ordered:
                self.stdout.write(self.style.ERROR(f'V1 PO id={row["id"]} has no order date; skipping'))
                continue

            defaults = {
                'vendor': vendor,
                'status': v1_status(row),
                'ordered_date': ordered,
                'paid_date': to_date(row.get('paid_on')),
                'shipped_date': None,
                'expected_delivery': to_date(row.get('scheduled_delivery')),
                'delivered_date': to_date(row.get('received_on')),
                'purchase_cost': to_decimal(row.get('price_amt')),
                'shipping_cost': to_decimal(row.get('shipping_amt')),
                'fees': to_decimal(row.get('fee_amt')),
                'retail_value': to_decimal(row.get('retail_amt')),
                'item_count': int(row.get('quantity') or 0),
                'description': truncate_description(row.get('description')),
                'condition': cond,
                'notes': build_v1_notes(row['id']),
            }
            _, created = PurchaseOrder.objects.using(db).get_or_create(order_number=onum[:100], defaults=defaults)
            if created:
                po_v1_c += 1
            else:
                po_v1_e += 1

        sql_v2 = """
            SELECT po.*, v.name AS vendor_name, v.code AS vendor_code
            FROM inventory_purchase_order po
            LEFT JOIN inventory_vendor v ON v.id = po.vendor_id
            ORDER BY po.purchase_date NULLS LAST
        """
        with legacy_connect('ecothrift_v2') as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql_v2)
                v2_rows = cur.fetchall()

        for row in v2_rows:
            onum = (row['order_number'] or '').strip()
            if not onum or onum in MISFIT_ORDER_NUMBERS:
                continue
            vcode = (row.get('vendor_code') or '').strip()
            if not vcode:
                self.stdout.write(self.style.WARNING(f'V2 PO id={row["id"]} missing vendor_code; skipping'))
                continue
            try:
                vendor = Vendor.objects.using(db).get(code=vcode[:20])
            except Vendor.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(f'V2 PO {onum!r}: vendor {vcode!r} not in V3; skipping')
                )
                continue

            cond = map_v2_condition(row.get('condition'))
            if row.get('condition') and not cond:
                warn_v2_cond += 1

            ordered = to_date(row.get('purchase_date'))
            if not ordered:
                self.stdout.write(self.style.ERROR(f'V2 PO id={row["id"]} has no purchase_date; skipping'))
                continue

            defaults = {
                'vendor': vendor,
                'status': v2_status(row.get('status')),
                'ordered_date': ordered,
                'paid_date': None,
                'shipped_date': None,
                'expected_delivery': to_date(row.get('expected_delivery')),
                'delivered_date': to_date(row.get('received_date')),
                'purchase_cost': to_decimal(row.get('purchase_price')),
                'shipping_cost': to_decimal(row.get('shipping_cost')),
                'fees': to_decimal(row.get('other_fees')),
                'retail_value': to_decimal(row.get('retail_value')),
                'item_count': int(row.get('quantity') or 0),
                'description': truncate_description(row.get('description')),
                'condition': cond,
                'notes': build_v2_notes(row['id'], row.get('notes')),
            }
            _, created = PurchaseOrder.objects.using(db).get_or_create(order_number=onum[:100], defaults=defaults)
            if created:
                po_v2_c += 1
            else:
                po_v2_e += 1

        enrich_updated = 0
        if not skip_enrichment:
            tag_pat = re.compile(r'^BACKFILL:v[12]:\d+$')
            for po in (
                PurchaseOrder.objects.using(db)
                .exclude(order_number__in=MISFIT_ORDER_NUMBERS)
                .order_by('id')
                .iterator(chunk_size=100)
            ):
                first = (po.notes or '').split('\n')[0].strip() if po.notes else ''
                if not tag_pat.match(first):
                    continue
                if notes_last_line_is_json_object(po.notes or ''):
                    continue
                meta = parse_description_metadata(po.description or '')
                if not meta:
                    continue
                new_notes = append_json_last_line(po.notes or '', meta)
                if new_notes != (po.notes or ''):
                    po.notes = new_notes
                    po.save(update_fields=['notes'], using=db)
                    enrich_updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Vendors: created={v_created}, already existed={v_existed}\n'
                f'V1 POs: created={po_v1_c}, existed={po_v1_e}\n'
                f'V2 POs: created={po_v2_c}, existed={po_v2_e}\n'
                f'Enrichment: JSON appended to {enrich_updated} PO(s)\n'
                f'Warnings: unknown_prefix={warn_prefix}, v1_unmapped_condition={warn_v1_cond}, '
                f'v2_unmapped_condition={warn_v2_cond}'
            )
        )
