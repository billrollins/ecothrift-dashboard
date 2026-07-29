"""Finalize complete-but-unsubmitted quality audit drafts.

Default is dry-run. Use --apply to write. Scope with --ids.

Example:
  python manage.py finalize_stranded_qa_audits --ids 15 17 --database production
  python manage.py finalize_stranded_qa_audits --ids 15 17 --database production --apply
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.pos.models import QualityAudit
from apps.pos.services.quality_audit import compute_overall_grade, validate_responses_complete


class Command(BaseCommand):
    help = 'Finalize stranded complete draft quality audits (dry-run by default).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--ids',
            nargs='+',
            type=int,
            required=True,
            help='QualityAudit primary keys to finalize.',
        )
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Write changes. Without this flag, only report what would happen.',
        )
        parser.add_argument(
            '--database',
            default='default',
            help='Database alias (default: default). Use production for prod.',
        )

    def handle(self, *args, **options):
        db = options['database']
        apply = options['apply']
        ids = options['ids']
        if not ids:
            raise CommandError('Provide at least one --ids value.')

        qs = (
            QualityAudit.objects.using(db)
            .select_related('conducted_by', 'form')
            .filter(pk__in=ids)
            .order_by('id')
        )
        found = {a.id: a for a in qs}
        missing = [i for i in ids if i not in found]
        if missing:
            self.stdout.write(self.style.WARNING(f'Missing ids (skipped): {missing}'))

        finalized = 0
        skipped = 0
        for audit_id in ids:
            audit = found.get(audit_id)
            if audit is None:
                continue
            who = getattr(audit.conducted_by, 'email', None) or str(audit.conducted_by_id)
            form_label = audit.form.slug if audit.form_id else audit.audit_type
            if audit.status != QualityAudit.STATUS_DRAFT:
                self.stdout.write(
                    f'SKIP {audit.id} — status={audit.status} (not draft) '
                    f'form={form_label} by={who}',
                )
                skipped += 1
                continue
            errors = validate_responses_complete(audit.responses or {})
            if errors:
                self.stdout.write(
                    f'SKIP {audit.id} — incomplete ({len(errors)} missing) '
                    f'form={form_label} by={who} first={errors[0]}',
                )
                skipped += 1
                continue
            grade = compute_overall_grade(audit.responses or {})
            stamp = audit.started_at
            self.stdout.write(
                f'{"APPLY" if apply else "DRY"} {audit.id} — grade={grade} '
                f'submitted_at={stamp.isoformat()} form={form_label} by={who}',
            )
            if apply:
                with transaction.atomic(using=db):
                    audit.overall_grade = grade
                    audit.status = QualityAudit.STATUS_SUBMITTED
                    audit.submitted_at = stamp
                    audit.save(
                        using=db,
                        update_fields=['overall_grade', 'status', 'submitted_at', 'updated_at'],
                    )
            finalized += 1

        if apply and finalized:
            from django.core.cache import cache
            from django.db import connections
            from django.utils import timezone

            from apps.pos.services.dashboard_metrics import invalidate_dashboard_metrics_cache

            invalidate_dashboard_metrics_cache()
            # When writing to a non-default DB (e.g. production), also clear that
            # host's DatabaseCache table so the live dashboard refreshes immediately.
            if db != 'default':
                today = timezone.now().date().isoformat()
                pattern = f'%dashboard:metrics:{today}%'
                with connections[db].cursor() as cursor:
                    cursor.execute(
                        'DELETE FROM django_cache_table WHERE cache_key LIKE %s',
                        [pattern],
                    )
                    cleared = cursor.rowcount
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Dashboard metrics cache invalidated (default + {db}: {cleared} rows).',
                    ),
                )
            else:
                # Touch default cache so LocMem/DatabaseCache backends stay consistent.
                cache.delete(f'dashboard:metrics:{timezone.now().date().isoformat()}')
                self.stdout.write(self.style.SUCCESS('Dashboard metrics cache invalidated.'))

        mode = 'applied' if apply else 'would finalize'
        self.stdout.write(
            self.style.SUCCESS(f'Done: {finalized} {mode}, {skipped} skipped.'),
        )
        if not apply and finalized:
            self.stdout.write('Re-run with --apply to write changes.')
