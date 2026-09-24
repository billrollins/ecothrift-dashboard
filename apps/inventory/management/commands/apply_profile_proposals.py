"""
Apply proposals to product profiles.

    python manage.py apply_profile_proposals --status auto [--batch NAME] [--limit N] [--dry-run]

Only ``auto`` and ``accepted`` proposals can be applied. A human value on the profile always wins
(the proposal is marked rejected). Product rows are not changed.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.inventory.models import ProductProposal
from apps.inventory.services.product_profile import apply_proposals


class Command(BaseCommand):
    help = 'Apply auto/accepted ProductProposal rows to ProductProfile.'

    def add_arguments(self, parser):
        parser.add_argument('--status', choices=['auto', 'accepted'], required=True)
        parser.add_argument('--batch', default='')
        parser.add_argument('--limit', type=int, default=0)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, status, batch, limit, dry_run, **options):
        qs = ProductProposal.objects.filter(status=status).order_by('-dollars', 'id')
        if batch:
            qs = qs.filter(batch=batch)
        if limit:
            qs = qs[:limit]
        n = qs.count() if not limit else len(qs)
        self.stdout.write(f'{n} {status} proposals to apply.')
        if dry_run or not n:
            return
        done = {'applied': 0, 'kept_human': 0}
        chunk = []
        for p in qs.iterator(chunk_size=2000) if not limit else qs:
            chunk.append(p)
            if len(chunk) >= 2000:
                for k, v in apply_proposals(chunk).items():
                    done[k] += v
                chunk = []
                self.stdout.write(f"  applied {done['applied']}...")
        if chunk:
            for k, v in apply_proposals(chunk).items():
                done[k] += v
        if done['applied'] + done['kept_human'] == 0:
            raise CommandError('Nothing applied.')
        self.stdout.write(self.style.SUCCESS(f"Applied {done['applied']}; kept human values on {done['kept_human']}."))
