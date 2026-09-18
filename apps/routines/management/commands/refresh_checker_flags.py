from django.core.management.base import BaseCommand

from apps.routines.flags import refresh_checker_flags


class Command(BaseCommand):
    help = 'Re-evaluate checker integrity flags for everyone who has audited.'

    def handle(self, *args, **options):
        count = refresh_checker_flags()
        self.stdout.write(f'Refreshed flags; {count} active rows kept or raised.')
