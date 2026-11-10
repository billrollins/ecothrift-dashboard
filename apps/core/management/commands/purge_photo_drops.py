from django.core.management.base import BaseCommand

from apps.core.services.photo_drops import KEEP_DAYS, purge_old


class Command(BaseCommand):
    help = (
        'Remove photo drawer photos older than 30 days, used or not (Dash Updates #82). '
        'Opening a drawer already does this about once an hour; this is the same clean-up on demand.'
    )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(f'Removed {purge_old()} photo drops older than {KEEP_DAYS} days.'))
