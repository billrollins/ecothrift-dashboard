"""Settings > AI "Estimate API costs": check every active model's exact price on its provider's pricing page."""
from django.core.management.base import BaseCommand

from apps.core.services import ai_prices


class Command(BaseCommand):
    help = "Check active AI models' exact prices per 1M tokens on the providers' pricing pages."

    def handle(self, *args, **options):
        s = ai_prices.run()
        self.stdout.write(f"{s['status']}: {len(s.get('results', []))} models {s.get('error', '')}")
