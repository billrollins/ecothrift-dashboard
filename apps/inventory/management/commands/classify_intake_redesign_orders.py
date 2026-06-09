"""Classify purchase orders for intake redesign migration safety."""

from __future__ import annotations

import json
from collections import Counter, defaultdict

from django.core.management.base import BaseCommand
from django.db.models import Count, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce

from apps.inventory.models import Item, ManifestRow, PreprocessingRow, ProcessingRow, PurchaseOrder


TERMINAL_ITEM_STATUSES = ('sold', 'scrapped', 'lost')


class Command(BaseCommand):
    help = (
        'Dry-run classifier for intake redesign safety cohorts. '
        'Does not modify data.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--json', action='store_true', help='Emit JSON instead of text.')
        parser.add_argument('--limit', type=int, default=50, help='Max example PO ids per cohort.')
        parser.add_argument(
            '--include-complete',
            action='store_true',
            help='Include completed/cancelled orders in examples.',
        )

    def handle(self, *args, **options):
        limit = max(0, int(options['limit']))
        def _count_subquery(model, **filters):
            return Coalesce(
                Subquery(
                    model.objects
                    .filter(**filters)
                    .order_by()
                    .values('purchase_order')
                    .annotate(n=Count('pk'))
                    .values('n')[:1],
                    output_field=IntegerField(),
                ),
                0,
            )

        qs = (
            PurchaseOrder.objects
            .annotate(
                manifest_rows_n=_count_subquery(ManifestRow, purchase_order=OuterRef('pk')),
                preprocessing_rows_n=_count_subquery(PreprocessingRow, purchase_order=OuterRef('pk')),
                processing_rows_n=_count_subquery(ProcessingRow, purchase_order=OuterRef('pk')),
                items_n=_count_subquery(Item, purchase_order=OuterRef('pk')),
                terminal_items_n=_count_subquery(
                    Item,
                    purchase_order=OuterRef('pk'),
                    status__in=TERMINAL_ITEM_STATUSES,
                ),
                linked_items_n=_count_subquery(
                    Item,
                    purchase_order=OuterRef('pk'),
                    manifest_row__isnull=False,
                ),
            )
            .order_by('id')
        )
        if not options['include_complete']:
            qs = qs.exclude(status__in=('complete', 'cancelled'))

        counts: Counter[str] = Counter()
        examples: dict[str, list[dict]] = defaultdict(list)

        for po in qs:
            cohort = self._cohort(po)
            counts[cohort] += 1
            if len(examples[cohort]) < limit:
                examples[cohort].append({
                    'id': po.id,
                    'order_number': po.order_number,
                    'status': po.status,
                    'preprocess_status': po.preprocess_status,
                    'processing_status': po.processing_status,
                    'manifest_rows': po.manifest_rows_n,
                    'preprocessing_rows': po.preprocessing_rows_n,
                    'processing_rows': po.processing_rows_n,
                    'items': po.items_n,
                    'terminal_items': po.terminal_items_n,
                    'linked_items': po.linked_items_n,
                })

        payload = {
            'counts': dict(counts),
            'examples': examples,
            'notes': {
                'locked_with_real_items': 'Do not destructive-reset without owner sign-off.',
                'terminal_history_locked': 'Contains sold/scrapped/lost items; preserve Item ids/SKUs.',
                'preprocessing_only': 'Best candidate for ManifestRow-spine migration.',
                'raw_only': 'Use new standardize path.',
            },
        }
        if options['json']:
            self.stdout.write(json.dumps(payload, indent=2, default=list))
            return

        self.stdout.write('Intake redesign PO cohorts (dry run):')
        for cohort, count in sorted(counts.items()):
            self.stdout.write(f'- {cohort}: {count}')
            for ex in examples.get(cohort, []):
                self.stdout.write(
                    '  '
                    + f"#{ex['id']} {ex['order_number']} "
                    + f"status={ex['status']} pre={ex['preprocess_status']} proc={ex['processing_status']} "
                    + f"mr={ex['manifest_rows']} pr={ex['preprocessing_rows']} bk={ex['processing_rows']} "
                    + f"items={ex['items']} terminal={ex['terminal_items']}"
                )

    @staticmethod
    def _cohort(po: PurchaseOrder) -> str:
        if po.terminal_items_n:
            return 'terminal_history_locked'
        if po.items_n:
            return 'locked_with_real_items'
        if po.processing_rows_n:
            if po.manifest_rows_n:
                return 'finalized_no_items_manifest_linked'
            return 'finalized_no_items_needs_manifest_spine'
        if po.preprocessing_rows_n:
            if po.manifest_rows_n:
                return 'preprocessing_manifest_linked'
            return 'preprocessing_only'
        if po.manifest_id:
            return 'raw_only'
        return 'order_only'
