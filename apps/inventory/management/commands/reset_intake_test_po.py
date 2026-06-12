"""Reset WLMRT-OJU-3V74 to post-manifest-upload for local intake pipeline testing."""

from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from apps.inventory.services.intake_test_reset import (
    DEFAULT_ORDER_NUMBER,
    IntakeTestResetError,
    RESET_STAGE_AFTER_UPLOAD,
    RESET_STAGE_BEFORE_UPLOAD,
    apply_reset,
    capture_fixture,
    fixture_csv_path,
    get_test_po,
    resolve_fixture_csv,
    summarize_po,
)


class Command(BaseCommand):
    help = (
        'Reset WLMRT-OJU-3V74 for local intake testing: purge pipeline artifacts and '
        'restore post-CSV-upload (default) or pre-upload state.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--order-number',
            default=DEFAULT_ORDER_NUMBER,
            help=f'PurchaseOrder.order_number (default: {DEFAULT_ORDER_NUMBER})',
        )
        mx = parser.add_mutually_exclusive_group()
        mx.add_argument(
            '--apply',
            action='store_true',
            help='Purge pipeline artifacts and restore target stage (default action)',
        )
        mx.add_argument(
            '--capture-fixture',
            action='store_true',
            help='Cache current PO manifest CSV to workspace/intake-test-fixtures/',
        )
        mx.add_argument(
            '--status',
            action='store_true',
            help='Print PO + fixture status only',
        )
        parser.add_argument(
            '--stage',
            choices=[RESET_STAGE_AFTER_UPLOAD, RESET_STAGE_BEFORE_UPLOAD],
            default=RESET_STAGE_AFTER_UPLOAD,
            help=(
                'after-upload (default): keep/reapply manifest CSV, preprocess not_started; '
                'before-upload: remove manifest too (re-upload in UI)'
            ),
        )
        parser.add_argument(
            '--allow-non-dev',
            action='store_true',
            help='Skip local-dev guard (dangerous)',
        )

    def handle(self, *args, **options):
        order_number = options['order_number']
        allow_non_dev = options['allow_non_dev']

        if options['capture_fixture']:
            try:
                summary = capture_fixture(order_number=order_number)
            except IntakeTestResetError as exc:
                raise CommandError(str(exc)) from exc
            self.stdout.write(self.style.SUCCESS('Fixture captured.'))
            self.stdout.write(json.dumps(summary, indent=2, default=str))
            return

        if options['status']:
            try:
                po = get_test_po(order_number)
            except IntakeTestResetError as exc:
                raise CommandError(str(exc)) from exc
            fixture = resolve_fixture_csv()
            payload = {
                'fixture_csv': str(fixture) if fixture else None,
                'expected_fixture': str(fixture_csv_path()),
                **summarize_po(po),
            }
            self.stdout.write(json.dumps(payload, indent=2, default=str))
            return

        if not options['apply']:
            options['apply'] = True

        try:
            summary = apply_reset(
                order_number=order_number,
                allow_non_dev=allow_non_dev,
                stage=options['stage'],
            )
        except IntakeTestResetError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS(f'Reset complete for {order_number}.'))
        self.stdout.write(json.dumps(summary, indent=2, default=str))
