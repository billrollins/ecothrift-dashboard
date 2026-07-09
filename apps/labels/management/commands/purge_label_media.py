from django.core.management.base import BaseCommand

from apps.labels.services import purge_orphan_label_media


class Command(BaseCommand):
    help = 'Delete unreferenced Label Studio media older than the grace period.'

    def handle(self, *args, **options):
        count = purge_orphan_label_media()
        self.stdout.write(f'Purged {count} label media file(s).')
