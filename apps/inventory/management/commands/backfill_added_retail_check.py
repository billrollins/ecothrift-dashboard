"""Give units added by a check-in edit their retail check (Dash Update #65, 2026-11-04).

Before v2.259.0, raising a check-in's quantity made new units with the retail but no retail check, so their tags
printed no retail. This runs the same rule the fix uses: copy a checked sibling's answer when the retail matches,
otherwise run the check; a flag stays unchecked. Dry run by default; ``--apply`` writes.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.inventory.models import Item, ItemHistory
from apps.inventory.processing_ops import _added_unit_retail_check


class Command(BaseCommand):
    help = 'Retail check for units added by a check-in edit that never got one.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **opts):
        added_ids = ItemHistory.objects.filter(
            note='Added via check-in edit', event_type='status_change', old_value='',
        ).values_list('item_id', flat=True)
        items = (
            Item.objects.filter(id__in=added_ids, retail_check='', retail__gt=0)
            .exclude(status='sold')
            .select_related('check_in', 'product', 'manifest_row')
        )
        counts = {}
        changed = []
        for item in items:
            sibling = None
            if item.check_in_id:
                sibling = (
                    Item.objects.filter(check_in_id=item.check_in_id, retail=item.retail)
                    .exclude(retail_check='').order_by('id').first()
                )
            row = getattr(item.check_in, 'processing_row', None) if item.check_in_id else None
            check, source = _added_unit_retail_check(
                sibling, item.product, row, item.manifest_row, item.retail, item.price, retail_typed=False,
            )
            counts[check or 'unchecked'] = counts.get(check or 'unchecked', 0) + 1
            if check:
                item.retail_check = check
                item.retail_source = source
                changed.append(item)
        self.stdout.write(f'units found: {sum(counts.values())}; result: {counts}')
        if opts['apply'] and changed:
            with transaction.atomic():
                Item.objects.bulk_update(changed, ['retail_check', 'retail_source'], batch_size=500)
            self.stdout.write(f'updated {len(changed)}')
        elif not opts['apply']:
            self.stdout.write('dry run: nothing written (use --apply)')
