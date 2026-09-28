"""Settings > AI Update: get exact prices for newly added models from the providers' pricing pages."""
from django.core.management.base import BaseCommand

from apps.core.services import ai_prices


class Command(BaseCommand):
    help = "Get prices per 1M tokens for the given models (blank ones only); all active blanks with no --slugs."

    def add_arguments(self, parser):
        parser.add_argument('--slugs', default='', help='Comma-separated model ids.')

    def handle(self, *args, slugs, **options):
        s = ai_prices.run([x for x in slugs.split(',') if x] if slugs else None)
        self.stdout.write(f"{s['status']}: {len(s.get('results', []))} models {s.get('error', '')}")
