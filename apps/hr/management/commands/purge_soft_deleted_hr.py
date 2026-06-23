from django.core.management.base import BaseCommand

from apps.hr.models import TimeEntry, TimeEntryModificationRequest
from apps.hr.soft_delete import SOFT_DELETE_RETENTION_DAYS, purge_soft_deleted


class Command(BaseCommand):
    help = (
        f'Permanently remove HR rows soft-deleted more than '
        f'{SOFT_DELETE_RETENTION_DAYS} days ago.'
    )

    def handle(self, *args, **options):
        entry_result = purge_soft_deleted(TimeEntry)
        mod_result = purge_soft_deleted(TimeEntryModificationRequest)
        entries = entry_result[0] if entry_result else 0
        mods = mod_result[0] if mod_result else 0
        self.stdout.write(
            self.style.SUCCESS(
                f'Purged {entries} time entries and {mods} modification requests.'
            )
        )
