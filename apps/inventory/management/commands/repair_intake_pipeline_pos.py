"""Repair intake pipeline POs 316-319 (manifest denorm + deterministic trains)."""

from django.core.management.base import BaseCommand, CommandError

from apps.inventory.models import PurchaseOrder
from apps.inventory.services.intake_po_repair import (
    EXPECTED_INTAKE_POS,
    apply_intake_po_repairs,
    verify_intake_po,
)


class Command(BaseCommand):
    help = (
        'Repair target intake POs: backfill manifest denormalized fields, then apply '
        'deterministic receiving/processing train fixes. Use --verify to validate invariants.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--orders',
            type=int,
            nargs='*',
            default=sorted(EXPECTED_INTAKE_POS.keys()),
            help='PurchaseOrder primary keys (default: 316 317 318 319)',
        )
        mx = parser.add_mutually_exclusive_group(required=True)
        mx.add_argument('--apply', action='store_true', help='Apply repairs')
        mx.add_argument('--verify', action='store_true', help='Verify invariants only')

    def handle(self, *args, **options):
        order_ids = options['orders']
        unknown = [pk for pk in order_ids if pk not in EXPECTED_INTAKE_POS]
        if unknown:
            raise CommandError(f'Unknown PO id(s) {unknown}; allowed {sorted(EXPECTED_INTAKE_POS.keys())}')

        if options['verify']:
            errors: list[str] = []
            for pk in sorted(order_ids):
                po = PurchaseOrder.objects.filter(pk=pk).first()
                if po is None:
                    errors.append(f'PO {pk} not found')
                    continue
                errors.extend(verify_intake_po(po))
            if errors:
                for line in errors:
                    self.stderr.write(line)
                raise CommandError(f'verify failed ({len(errors)} issue(s))')
            self.stdout.write(self.style.SUCCESS('verify ok'))
            return

        if options['apply']:
            for pk in sorted(order_ids):
                po = PurchaseOrder.objects.filter(pk=pk).first()
                if po is None:
                    raise CommandError(f'PO {pk} not found')
                self.stdout.write(f'Applying PO {pk} {po.order_number}…')
                summary = apply_intake_po_repairs(po)
                self.stdout.write(str(summary))
            self.stdout.write(self.style.SUCCESS('apply complete'))
