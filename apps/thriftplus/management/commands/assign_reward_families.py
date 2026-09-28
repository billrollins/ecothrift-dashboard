"""
Thrift+ reward families (thrift_plus_rewards Phase 2): check floor products once for a family.

    python manage.py assign_reward_families              # up to 200 products, most units first
    python manage.py assign_reward_families --limit 50
    python manage.py assign_reward_families --dry-run    # how many are waiting; no model calls

Each check is a vector search plus, when close neighbours exist, one model call
(``THRIFTPLUS_FAMILY`` in Settings → AI). Schedule it before ``recompute_rewards``.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.thriftplus.services import families


class Command(BaseCommand):
    help = 'Check floor products for a reward family (vector neighbours, then one model call).'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=200)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        if opts['dry_run']:
            waiting = families.candidates(limit=100000)
            self.stdout.write(f'{len(waiting)} floor products with a vector are waiting for a family check.')
            return
        counts = families.assign(limit=opts['limit'])
        self.stdout.write(self.style.SUCCESS(f'Family checks: {counts}'))
