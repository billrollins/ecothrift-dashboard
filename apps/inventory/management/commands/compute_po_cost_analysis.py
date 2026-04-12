"""Compute PurchaseOrder shrink_retail_est, mistracked_retail, misfit_sales_amt."""

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
)

from apps.inventory.management.command_db import (
    add_database_argument,
    add_no_input_argument,
    confirm_production_write,
    resolve_database_alias,
)
from apps.inventory.models import Item, PurchaseOrder
from apps.pos.models import CartLine

MONEY = Decimal('0.01')


def _sold_item_exists(db: str):
    return Exists(
        CartLine.objects.using(db).filter(
            item_id=OuterRef('pk'),
            cart__status='completed',
        ),
    )


def _item_retail_sum_sold(po_id: int, db: str) -> Decimal:
    qs = Item.objects.using(db).filter(
        purchase_order_id=po_id,
        retail_value__gt=0,
    ).filter(_sold_item_exists(db))
    return qs.aggregate(s=Sum('retail_value'))['s'] or Decimal('0')


def _item_revenue_sum_optional(po_id: int, db: str) -> Decimal:
    """Sum of all completed cart line totals for lines whose item is on this PO."""
    return (
        CartLine.objects.using(db).filter(
            cart__status='completed',
            item__purchase_order_id=po_id,
        ).aggregate(s=Sum('line_total'))['s']
        or Decimal('0')
    )


def _shrink_retail_est(item_retail_sum_sold: Decimal, vendor_shrinkage) -> Decimal:
    vs = vendor_shrinkage or Decimal('0')
    if vs >= 1:
        return Decimal('0')
    return (item_retail_sum_sold * (vs / (Decimal('1') - vs))).quantize(MONEY)


class Command(BaseCommand):
    help = (
        'Compute shrink_retail_est, mistracked_retail, and misfit_sales_amt on costed '
        'non-MISFIT POs (requires compute_vendor_metrics).'
    )

    def add_arguments(self, parser):
        add_database_argument(parser)
        add_no_input_argument(parser)
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print sample rows only; no writes.',
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

        base_po = PurchaseOrder.objects.using(db).filter(
            total_cost__gt=0,
            total_cost__isnull=False,
        ).exclude(order_number__startswith='MISFIT')

        line_amt = ExpressionWrapper(
            F('unit_price') * F('quantity'),
            output_field=DecimalField(max_digits=10, decimal_places=2),
        )
        total_misfit_sales = (
            CartLine.objects.using(db).filter(
                cart__status='completed',
                item_id__isnull=True,
            ).aggregate(s=Sum(line_amt))['s']
            or Decimal('0')
        )

        rows: list[tuple[PurchaseOrder, Decimal, Decimal, Decimal]] = []

        for po in base_po.select_related('vendor').iterator(chunk_size=200):
            item_retail = _item_retail_sum_sold(po.id, db)
            vs = po.vendor.shrinkage_rate
            shrink = _shrink_retail_est(item_retail, vs)
            po_rv = po.retail_value if po.retail_value is not None else Decimal('0')
            mistracked = po_rv - item_retail - shrink
            if mistracked < 0:
                mistracked = Decimal('0')
            else:
                mistracked = mistracked.quantize(MONEY)
            shrink = shrink.quantize(MONEY)
            rows.append((po, shrink, mistracked, item_retail))

            if dry_run:
                rev = _item_revenue_sum_optional(po.id, db)
                self.stdout.write(
                    f'[dry-run] {po.order_number} item_retail_sold={item_retail} '
                    f'item_revenue_sum={rev} shrink_est={shrink} mistracked={mistracked}',
                )

        total_mistracked = sum(r[2] for r in rows) or Decimal('0')

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Dry-run: total_misfit_sales={total_misfit_sales} '
                    f'total_mistracked={total_mistracked} POs={len(rows)}',
                ),
            )
            return

        for po, shrink, mistracked, _ in rows:
            if total_mistracked > 0:
                po.misfit_sales_amt = (
                    total_misfit_sales * (mistracked / total_mistracked)
                ).quantize(MONEY)
            else:
                po.misfit_sales_amt = Decimal('0')
            po.shrink_retail_est = shrink
            po.mistracked_retail = mistracked

        misfit_qs = PurchaseOrder.objects.using(db).filter(
            total_cost__gt=0,
            total_cost__isnull=False,
            order_number__startswith='MISFIT',
        )
        misfit_updates = []
        for po in misfit_qs.only('id', 'misfit_sales_amt').iterator(chunk_size=500):
            po.misfit_sales_amt = Decimal('0')
            misfit_updates.append(po)

        to_write = [r[0] for r in rows]
        chunk = 500
        for i in range(0, len(to_write), chunk):
            PurchaseOrder.objects.using(db).bulk_update(
                to_write[i : i + chunk],
                ['shrink_retail_est', 'mistracked_retail', 'misfit_sales_amt'],
            )
        if misfit_updates:
            for i in range(0, len(misfit_updates), chunk):
                PurchaseOrder.objects.using(db).bulk_update(
                    misfit_updates[i : i + chunk],
                    ['misfit_sales_amt'],
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'Updated {len(to_write)} PO(s); MISFIT misfit_sales_amt=0: '
                f'{len(misfit_updates)}',
            ),
        )
