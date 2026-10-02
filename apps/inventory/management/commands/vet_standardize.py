"""Vet a standardize batch: Claude judges a random 200 answers; the batch passes at 95% fully right."""
from django.core.management.base import BaseCommand

from apps.inventory.services import standardize


class Command(BaseCommand):
    help = 'Vet a standardize batch (random sample judged by Claude). Writes <batch>.vet.json.'

    def add_arguments(self, parser):
        parser.add_argument('batch')
        parser.add_argument('--n', type=int, default=200)

    def handle(self, *args, batch, n, **options):
        r = standardize.vet(batch, n, log=self.stdout.write)
        self.stdout.write(
            f"{batch}: {r['right']}/{r['judged']} right ({r['share_right']:.1%}); judge flagged {r['flagged_by_judge']}, "
            f"{r['escalated_to'] or 'no escalation'} confirmed {r['confirmed_wrong']}; empty {r['empty_answers']}; "
            f"wrong by field {r['wrong_by_field']}; {len(r['rule_proposals'])} rule proposals"
        )
        if r['passed']:
            self.stdout.write(self.style.SUCCESS('PASSED'))
        else:
            self.stdout.write(self.style.ERROR('FAILED: fix the rules or prompt before the next batch'))
