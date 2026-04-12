"""Allocate PurchaseOrder.total_cost to items (retail-weighted); pink tag loads use full-lot retail."""

from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef, Sum

from apps.inventory.management.command_db import (
    add_database_argument,
    add_no_input_argument,
    confirm_production_write,
    resolve_database_alias,
)
from apps.inventory.models import Item, PurchaseOrder
from apps.pos.models import CartLine

MONEY = Decimal('0.01')
PINK_TAG_FULFILLMENT_MAX = Decimal('0.15')


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


def _item_retail_sum_positive(po_id: int, db: str) -> Decimal:
    """Sum of retail_value for all items on the PO with retail_value > 0."""
    return (
        Item.objects.using(db)
        .filter(purchase_order_id=po_id, retail_value__gt=0)
        .aggregate(s=Sum('retail_value'))['s']
        or Decimal('0')
    )


class Command(BaseCommand):
    help = (
        'Set Item.cost from PO total_cost for non-MISFIT costed POs. '
        'Normal POs: sold items only, retail-weighted vs sold retail + mistracked. '
        'Pink tag POs (<15%% itemized retail vs PO retail): all items with retail spread vs PO retail.'
    )

    def add_arguments(self, parser):
        add_database_argument(parser)
        add_no_input_argument(parser)
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print counts only; no writes.',
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

        eligible = PurchaseOrder.objects.using(db).filter(
            total_cost__gt=0,
            total_cost__isnull=False,
        ).exclude(order_number__startswith='MISFIT')

        eligible_ids = list(eligible.values_list('id', flat=True))

        nulled_misfit = 0
        if not dry_run:
            nulled_misfit = Item.objects.using(db).filter(
                purchase_order__order_number__startswith='MISFIT',
            ).update(cost=None)
            if eligible_ids:
                Item.objects.using(db).filter(purchase_order_id__in=eligible_ids).update(cost=None)

        updated = 0
        chunk = 500
        normal_po_count = 0
        pink_po_count = 0

        for po in eligible.select_related('vendor').iterator(chunk_size=200):
            item_retail_sum = _item_retail_sum_positive(po.id, db)
            po_rv = po.retail_value
            if po_rv is not None and po_rv > 0:
                fulfillment_rate = item_retail_sum / po_rv
            else:
                fulfillment_rate = None

            is_pink = fulfillment_rate is not None and fulfillment_rate < PINK_TAG_FULFILLMENT_MAX

            if is_pink:
                pink_po_count += 1
                if not po_rv or po_rv <= 0:
                    if not dry_run:
                        Item.objects.using(db).filter(purchase_order_id=po.id).update(cost=None)
                    elif dry_run:
                        self.stdout.write(
                            f'[dry-run] {po.order_number}: pink tag but po.retail_value missing/zero -> all costs null',
                        )
                    continue

                total_cost = po.total_cost
                items_qs = Item.objects.using(db).filter(
                    purchase_order_id=po.id,
                    retail_value__gt=0,
                )
                if dry_run:
                    n = items_qs.count()
                    updated += n
                    allocated = Decimal('0')
                    for it in items_qs.only('retail_value').iterator(chunk_size=500):
                        allocated += (it.retail_value / po_rv * total_cost)
                    self.stdout.write(
                        f'[dry-run] {po.order_number}: PINK TAG items={n} '
                        f'allocated~={allocated.quantize(MONEY)} total_cost={total_cost} '
                        f'fulfillment={fulfillment_rate:.4f}',
                    )
                    continue

                batch: list[Item] = []
                for item in items_qs.only('id', 'retail_value', 'cost', 'purchase_order_id').iterator(
                    chunk_size=200,
                ):
                    share = item.retail_value / po_rv
                    item.cost = (share * total_cost).quantize(MONEY)
                    batch.append(item)
                    updated += 1
                    if len(batch) >= chunk:
                        Item.objects.using(db).bulk_update(batch, ['cost'])
                        batch.clear()
                if batch:
                    Item.objects.using(db).bulk_update(batch, ['cost'])
                continue

            # Normal PO
            normal_po_count += 1
            item_retail = _item_retail_sum_sold(po.id, db)
            mistr = po.mistracked_retail if po.mistracked_retail is not None else Decimal('0')
            denom = item_retail + mistr

            sold_qs = Item.objects.using(db).filter(
                purchase_order_id=po.id,
                retail_value__gt=0,
            ).filter(_sold_item_exists(db))

            if denom <= 0:
                if dry_run:
                    self.stdout.write(
                        f'[dry-run] {po.order_number}: denom<=0 -> all items stay null',
                    )
                continue

            total_cost = po.total_cost
            if dry_run:
                n = sold_qs.count()
                updated += n
                allocated = Decimal('0')
                for it in sold_qs.only('retail_value').iterator(chunk_size=500):
                    allocated += (it.retail_value / denom * total_cost)
                self.stdout.write(
                    f'[dry-run] {po.order_number}: sold_items={n} '
                    f'allocated~={allocated.quantize(MONEY)} total_cost={total_cost}',
                )
                continue

            batch = []
            for item in sold_qs.only('id', 'retail_value', 'cost', 'purchase_order_id').iterator(
                chunk_size=200,
            ):
                share = item.retail_value / denom
                item.cost = (share * total_cost).quantize(MONEY)
                batch.append(item)
                updated += 1
                if len(batch) >= chunk:
                    Item.objects.using(db).bulk_update(batch, ['cost'])
                    batch.clear()
            if batch:
                Item.objects.using(db).bulk_update(batch, ['cost'])

        self.stdout.write(f'Normal POs: {normal_po_count}, Pink tag POs: {pink_po_count}')

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Dry-run: would set cost on {updated} item row(s).',
                ),
            )
            return

        self.stdout.write(
            self.style.SUCCESS(
                f'Updated {updated} item(s). MISFIT items nulled at start: {nulled_misfit}',
            ),
        )
