"""Second-pass review of low/medium-confidence standardized answers (see services/std_review.py)."""
import json

from django.core.management.base import BaseCommand

from apps.inventory.services import std_review


class Command(BaseCommand):
    help = 'Spark judges the uncertain answers; Gemini re-checks what Spark flags. Resumable.'

    def handle(self, *args, **options):
        self.stdout.write(json.dumps(std_review.run(log=self.stdout.write), indent=1))
