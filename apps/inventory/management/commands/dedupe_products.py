"""
The dedupe loop (see services/dedupe.py). Run after standardized products are applied and embedded.

    python manage.py embed_products                       # vectors from the vector text
    python manage.py dedupe_products --find --limit 5000  # candidates -> Spark decisions (DedupeDecision)
    python manage.py dedupe_products --vet                # Claude judges 200 "same" answers (95% to pass)
    python manage.py dedupe_products --merge              # reversible merges (undo: merge_duplicate_products --undo)
"""
from django.core.management.base import BaseCommand, CommandError

from apps.inventory.services import dedupe


class Command(BaseCommand):
    help = 'Find, decide, vet and merge duplicate products under the spec rules.'

    def add_arguments(self, parser):
        parser.add_argument('--find', action='store_true', help='Find candidates and let Spark decide.')
        parser.add_argument('--limit', type=int, default=0)
        parser.add_argument('--escalate', action='store_true',
                            help='Sonnet decides the Spark "same" pairs below the trusted similarity.')
        parser.add_argument('--vet', action='store_true')
        parser.add_argument('--merge', action='store_true')

    def handle(self, *args, find=False, limit=0, vet=False, merge=False, escalate=False, **options):
        if not (find or vet or merge or escalate):
            raise CommandError('Give --find, --escalate, --vet or --merge.')
        if escalate:
            self.stdout.write(str(dedupe.escalate(log=self.stdout.write)))
        if find:
            pairs = dedupe.candidates(limit)
            self.stdout.write(f'{len(pairs):,} candidate pairs')
            self.stdout.write(str(dedupe.decide(pairs, log=self.stdout.write)))
        if vet:
            r = dedupe.vet(log=self.stdout.write)
            self.stdout.write(f"{r['right']}/{r['judged']} right ({r['share_right']:.1%})")
            self.stdout.write(self.style.SUCCESS('PASSED') if r['passed'] else self.style.ERROR('FAILED: do not merge'))
        if merge:
            if not dedupe.vet_passed():
                raise CommandError('The last vet under these rules did not pass (or none ran): run --vet first.')
            self.stdout.write(str(dedupe.merge_same()))
