"""Idempotent backfill of 480px thumbnails for existing Receiving photos."""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.inventory.management.command_db import (
    add_database_argument,
    add_no_input_argument,
    confirm_production_write,
    resolve_database_alias,
)
from apps.inventory.models import ReceivingAttachment
from apps.inventory.services.receiving_photos import ensure_thumbnail_for_attachment


class Command(BaseCommand):
    help = (
        'Create missing 480px JPEG thumbnails for ReceivingAttachment rows. '
        'Keeps existing high-res s3_file objects untouched.'
    )

    def add_arguments(self, parser):
        add_database_argument(parser)
        add_no_input_argument(parser)
        parser.add_argument('--dry-run', action='store_true', help='Count only; no writes.')
        parser.add_argument('--limit', type=int, default=0, help='Max attachments to process (0 = all).')
        parser.add_argument('--after-id', type=int, default=0, help='Resume after this attachment id.')
        parser.add_argument('--order-id', type=int, default=0, help='Limit to one purchase order id.')

    def handle(self, *args, **options):
        db = resolve_database_alias(options['database'])
        dry_run = bool(options['dry_run'])
        confirm_production_write(
            stdout=self.stdout,
            stderr=self.stderr,
            db_alias=db,
            no_input=bool(options['no_input']),
            dry_run=dry_run,
        )

        qs = (
            ReceivingAttachment.objects.using(db)
            .select_related('s3_file', 'thumbnail_file', 'receiving__purchase_order')
            .order_by('id')
        )
        after_id = int(options['after_id'] or 0)
        if after_id:
            qs = qs.filter(id__gt=after_id)
        order_id = int(options['order_id'] or 0)
        if order_id:
            qs = qs.filter(receiving__purchase_order_id=order_id)

        limit = int(options['limit'] or 0)
        total = qs.count()
        already = qs.filter(thumbnail_file__isnull=False).count()
        missing = total - already
        self.stdout.write(
            f'DB={db} dry_run={dry_run} candidates={total} '
            f'with_thumb={already} missing_thumb={missing}',
        )

        created = 0
        skipped = 0
        failed = 0
        processed = 0
        for att in qs.iterator(chunk_size=50):
            if limit and processed >= limit:
                break
            processed += 1
            if att.thumbnail_file_id:
                skipped += 1
                continue
            if dry_run:
                created += 1  # would create
                continue
            try:
                with transaction.atomic(using=db):
                    att_db = (
                        ReceivingAttachment.objects.using(db)
                        .select_related('s3_file', 'thumbnail_file')
                        .get(pk=att.pk)
                    )
                    result = ensure_thumbnail_for_attachment(att_db, using=db)
                if result is None:
                    failed += 1
                    self.stderr.write(f'FAILED att={att.pk} order={att.receiving.purchase_order_id}')
                else:
                    created += 1
                    if created % 25 == 0:
                        self.stdout.write(f'  … created {created} (last id={att.pk})')
            except Exception as exc:
                failed += 1
                self.stderr.write(f'FAILED att={att.pk}: {exc}')

        verb = 'would_create' if dry_run else 'created'
        self.stdout.write(
            self.style.SUCCESS(
                f'Done. processed={processed} {verb}={created} skipped={skipped} failed={failed}',
            ),
        )
