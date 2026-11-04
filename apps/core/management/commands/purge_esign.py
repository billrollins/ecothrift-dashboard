from django.core.management.base import BaseCommand

from apps.esign.purge import purge_due


class Command(BaseCommand):
    help = 'Purge e-sign documents whose delete wait (ESIGN_PURGE_DAYS, 90) is over; the purge log keeps a line each. Daily.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(f'Purged {purge_due()} e-sign documents.'))
