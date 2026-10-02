"""Audition standardize writers and critics on the same random products (see services/std_audition.py)."""
import json

from django.core.management.base import BaseCommand

from apps.inventory.services import std_audition


class Command(BaseCommand):
    help = 'Writers x critics grid on a random sample; consensus scores in workspace/audition_std/<name>/.'

    def add_arguments(self, parser):
        parser.add_argument('--name', required=True)
        parser.add_argument('--n', type=int, default=160)
        parser.add_argument('--seed', type=int, default=29)
        parser.add_argument('--strategies', metavar='SOURCE', help='Strategy test on the sample of this earlier audition.')

    def handle(self, *args, name, n, seed, strategies=None, **options):
        if strategies:
            r = std_audition.run_strategies(name, strategies, log=self.stdout.write)
            self.stdout.write(json.dumps(r, indent=1))
            return
        r = std_audition.run(name, n, seed, log=self.stdout.write)
        for w, row in r['by_writer'].items():
            self.stdout.write(f"{w:<7} core all right {row['core_all_right']:.1%}  " + '  '.join(
                f"{f} {v['right']:.0%}" for f, v in row.items() if isinstance(v, dict)))
        for c, row in r['by_critic'].items():
            self.stdout.write(f"critic {c:<7} {json.dumps(row)}")
        self.stdout.write(f"{len(r['disputed_core'])} disputed core fields to review")
