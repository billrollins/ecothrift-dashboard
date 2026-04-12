"""Compute Vendor shrinkage_rate, misfit_rate, avg_sell_through, avg_fulfillment from costed POs."""

from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import (
    DecimalField,
    Exists,
    ExpressionWrapper,
    F,
    OuterRef,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce

from apps.inventory.management.command_db import (
    add_database_argument,
    add_no_input_argument,
    confirm_production_write,
    resolve_database_alias,
)
from apps.inventory.models import Item, PurchaseOrder, Vendor
from apps.pos.models import CartLine

DEC4 = Decimal('0.0001')

MARKETPLACE_CODES = frozenset({'AMZ', 'CST', 'ESS', 'HMD', 'TRGET', 'WAL', 'WFR'})


def _eligible_pos_for_vendor(vendor_id: int, db: str):
    return PurchaseOrder.objects.using(db).filter(
        vendor_id=vendor_id,
        total_cost__gt=0,
        total_cost__isnull=False,
    ).exclude(order_number__startswith='MISFIT')


def _eligible_pos_marketplace(db: str):
    return PurchaseOrder.objects.using(db).filter(
        total_cost__gt=0,
        total_cost__isnull=False,
        vendor__code__in=MARKETPLACE_CODES,
    ).exclude(order_number__startswith='MISFIT')


def _completed_line_exists(db: str):
    return Exists(
        CartLine.objects.using(db).filter(
            item_id=OuterRef('pk'),
            cart__status='completed',
        ),
    )


def _clamp01(x: Decimal) -> Decimal:
    return max(Decimal('0'), min(Decimal('1'), x))


def _legacy_shrinkage(total_item_retail_sold: Decimal, total_item_retail: Decimal):
    if total_item_retail <= 0:
        return None
    r = (Decimal('1') - (total_item_retail_sold / total_item_retail)).quantize(DEC4)
    return _clamp01(r)


class Command(BaseCommand):
    help = (
        'Set Vendor shrinkage_rate, misfit_rate, avg_sell_through, avg_fulfillment from items on '
        'costed non-MISFIT POs. Marketplace vendors get shrink/misfit decomposition.'
    )

    def add_arguments(self, parser):
        add_database_argument(parser)
        add_no_input_argument(parser)
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print metrics only; do not write.',
        )

    def handle(self, *args, **options):
        db = resolve_database_alias(options['database'])
        dry_run: bool = options['dry_run']
        no_input: bool = options['no_input']
        confirm_production_write(
            stdout=self.stdout,
            stderr=self.stderr,
            db_alias=db,
            no_input=no_input,
            dry_run=dry_run,
        )

        zero = Value(Decimal('0'), output_field=DecimalField(max_digits=10, decimal_places=2))
        rev_expr = ExpressionWrapper(
            F('unit_price') * F('quantity'),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        )

        mp_pos = _eligible_pos_marketplace(db)
        total_po_retail_all = mp_pos.aggregate(s=Sum(Coalesce(F('retail_value'), zero)))['s'] or Decimal(
            '0',
        )

        mp_sold_items = Item.objects.using(db).filter(
            purchase_order__in=mp_pos,
            retail_value__gt=0,
        ).filter(_completed_line_exists(db))
        total_sold_item_retail_all = mp_sold_items.aggregate(s=Sum('retail_value'))['s'] or Decimal('0')

        total_tracked_revenue_all = (
            CartLine.objects.using(db).filter(
                cart__status='completed',
                item__purchase_order__in=mp_pos,
            ).aggregate(s=Sum(rev_expr))['s']
            or Decimal('0')
        )

        total_orphan_revenue = (
            CartLine.objects.using(db).filter(cart__status='completed', item_id__isnull=True).aggregate(
                s=Sum(rev_expr),
            )['s']
            or Decimal('0')
        )

        total_missing_retail = total_po_retail_all - total_sold_item_retail_all

        global_discount_rate = None
        if total_sold_item_retail_all > 0:
            global_discount_rate = total_tracked_revenue_all / total_sold_item_retail_all

        orphan_retail_est = None
        if global_discount_rate is not None and global_discount_rate > 0:
            orphan_retail_est = total_orphan_revenue / global_discount_rate

        untracked_share = None
        shrink_share = None
        if (
            orphan_retail_est is not None
            and total_missing_retail > 0
        ):
            raw_u = orphan_retail_est / total_missing_retail
            untracked_share = _clamp01(raw_u.quantize(DEC4))
            shrink_share = _clamp01((Decimal('1') - untracked_share).quantize(DEC4))

        decompose_ok = (
            untracked_share is not None
            and shrink_share is not None
            and total_po_retail_all > 0
        )

        vendors = Vendor.objects.using(db).order_by('id')
        to_update: list[Vendor] = []
        skipped = 0

        for v in vendors.iterator(chunk_size=500):
            po_qs = _eligible_pos_for_vendor(v.id, db)
            if not po_qs.exists():
                if (
                    v.shrinkage_rate is not None
                    or v.misfit_rate is not None
                    or v.avg_sell_through is not None
                    or v.avg_fulfillment is not None
                ):
                    v.shrinkage_rate = None
                    v.misfit_rate = None
                    v.avg_sell_through = None
                    v.avg_fulfillment = None
                    if not dry_run:
                        to_update.append(v)
                    else:
                        self.stdout.write(
                            f'[dry-run] Vendor {v.code} id={v.id}: no costed POs -> metrics None',
                        )
                else:
                    skipped += 1
                continue

            base_items = Item.objects.using(db).filter(
                purchase_order__in=po_qs,
                retail_value__gt=0,
            )
            total_item_retail = base_items.aggregate(s=Sum('retail_value'))['s'] or Decimal('0')
            sold_qs = base_items.filter(_completed_line_exists(db))
            total_item_retail_sold = sold_qs.aggregate(s=Sum('retail_value'))['s'] or Decimal('0')

            total_po_retail = po_qs.aggregate(
                s=Sum(Coalesce(F('retail_value'), zero)),
            )['s'] or Decimal('0')

            if total_item_retail > 0:
                avg_sell_through = (total_item_retail_sold / total_item_retail).quantize(DEC4)
            else:
                avg_sell_through = None

            if total_po_retail > 0 and total_item_retail > 0:
                avg_fulfillment = (total_item_retail / total_po_retail).quantize(DEC4)
            else:
                avg_fulfillment = None

            legacy_shrink = _legacy_shrinkage(total_item_retail_sold, total_item_retail)

            vendor_po_retail = total_po_retail
            vendor_sold_item_retail = total_item_retail_sold
            vendor_missing = vendor_po_retail - vendor_sold_item_retail

            misfit_rate = None
            shrinkage_rate = None

            if (
                v.code in MARKETPLACE_CODES
                and decompose_ok
                and vendor_po_retail > 0
                and vendor_missing >= 0
                and untracked_share is not None
                and shrink_share is not None
            ):
                misfit_rate = ((vendor_missing * untracked_share) / vendor_po_retail).quantize(DEC4)
                shrinkage_rate = ((vendor_missing * shrink_share) / vendor_po_retail).quantize(DEC4)
                misfit_rate = _clamp01(misfit_rate)
                shrinkage_rate = _clamp01(shrinkage_rate)
            else:
                shrinkage_rate = legacy_shrink
                misfit_rate = None

            if dry_run:
                self.stdout.write(
                    f'[dry-run] {v.code} id={v.id}: sell_through={avg_sell_through} '
                    f'shrinkage={shrinkage_rate} misfit={misfit_rate} fulfillment={avg_fulfillment} '
                    f'(retail_total={total_item_retail} retail_sold={total_item_retail_sold} '
                    f'po_retail={total_po_retail})',
                )
            else:
                v.avg_sell_through = avg_sell_through
                v.avg_fulfillment = avg_fulfillment
                v.shrinkage_rate = shrinkage_rate
                v.misfit_rate = misfit_rate
                to_update.append(v)

        if not dry_run and to_update:
            chunk = 500
            for i in range(0, len(to_update), chunk):
                Vendor.objects.using(db).bulk_update(
                    to_update[i : i + chunk],
                    ['shrinkage_rate', 'misfit_rate', 'avg_sell_through', 'avg_fulfillment'],
                )
            self.stdout.write(
                self.style.SUCCESS(
                    f'Updated {len(to_update)} vendor(s). Skipped unchanged (no POs): {skipped}',
                ),
            )
        elif dry_run:
            self.stdout.write(self.style.SUCCESS('Dry-run complete (no writes).'))
        else:
            self.stdout.write(
                self.style.SUCCESS(f'No vendor rows to update. Skipped: {skipped}'),
            )
