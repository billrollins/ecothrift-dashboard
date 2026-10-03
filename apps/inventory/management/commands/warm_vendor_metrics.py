"""Work out the vendor metrics for every period and keep them for the Vendors list (Heroku Scheduler, nightly)."""
import time

from django.core.management.base import BaseCommand

from apps.inventory.services.vendor_metrics import PERIODS, all_vendors


class Command(BaseCommand):
    help = 'Refresh the cached vendor metrics (Vendors list) for every period.'

    def handle(self, *args, **options):
        for period in PERIODS:
            t = time.time()
            payload = all_vendors(period, fresh=True)
            self.stdout.write(f"{period}: {len(payload['vendors'])} vendors in {time.time() - t:.1f} s")
