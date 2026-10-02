"""
Standardize products with Spark under the hard rules (owner, 2026-09-29). See services/standardize.py.

    python manage.py standardize_products --batch std-001 --size 10000   # write workspace/standardize/std-001.jsonl
    python manage.py vet_standardize std-001                              # Claude judges a random 200
    python manage.py standardize_products --load std-001                  # proposals (auto / pending)
"""
from django.core.management.base import BaseCommand, CommandError

from apps.inventory.services import standardize


class Command(BaseCommand):
    help = 'Standardize the next products by sold dollars (Spark), or load a finished batch as proposals.'

    def add_arguments(self, parser):
        parser.add_argument('--batch', help='Batch name, e.g. std-001.')
        parser.add_argument('--size', type=int, default=10000)
        parser.add_argument('--load', metavar='BATCH', help='Load this finished batch as ProductProposal rows.')
        parser.add_argument('--effort', choices=['low', 'medium', 'high'])
        parser.add_argument('--per-call', type=int)
        parser.add_argument('--grouped', action='store_true',
                            help='One answer per title group (same normalized title and brand).')

    def handle(self, *args, batch=None, size=10000, load=None, effort=None, per_call=None, grouped=False, **options):
        if load:
            self.stdout.write(str(standardize.load(load)))
            return
        if not batch:
            raise CommandError('Give --batch NAME (or --load NAME).')
        self.stdout.write(f'rules {standardize.rules_version()}; batch {batch}, {size} products')
        stats = standardize.run_batch(batch, size, log=self.stdout.write, effort=effort, per_call=per_call,
                                       grouped=grouped)
        self.stdout.write(self.style.SUCCESS(str(stats)))
        self.stdout.write(f'Next: python manage.py vet_standardize {batch}')
