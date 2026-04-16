"""One-shot backfill: set Item.cost from PurchaseOrder.compute_item_cost (est_shrink formula).

Use when Django ``save()`` paths did not run (e.g. after raw SQL, bulk imports, or restoring a DB
snapshot). **Not** for routine operations: normal API and model saves keep ``Item.cost`` aligned
when PO fields or line ``Item.retail_value`` / PO assignment change.

See ``.ai/extended/backend.md`` — *Item acquisition cost (inventory)*.
"""

from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef

from apps.inventory.models import Item, PurchaseOrder


class Command(BaseCommand):
    help = (
        'Backfill only: recompute Item.cost for every item on every PO that has items. '
        'Use after migrations or data repair — not part of daily/Heroku jobs. '
        'Optional --database for production alias.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--database',
            default='default',
            help='Django DB alias (default: default).',
        )

    def handle(self, *args, **options):
        db = options['database']
        qs = (
            PurchaseOrder.objects.using(db)
            .filter(Exists(Item.objects.filter(purchase_order_id=OuterRef('pk'))))
            .order_by('id')
        )
        total_items = 0
        n_po = 0
        for po in qs.iterator(chunk_size=200):
            n = po.recompute_item_costs(using=db)
            total_items += n
            n_po += 1
            if n_po % 500 == 0:
                self.stdout.write(f'  … {n_po} PO(s) processed')
        self.stdout.write(
            self.style.SUCCESS(f'Done: {n_po} purchase order(s), {total_items} item row(s) updated.')
        )
