"""
Standardize the whole catalog (owner, 2026-09-29: Spark high, answering once): 10,000 products at a time by sold
dollars, each batch vetted (Gemini judges 200, Claude confirms what it flags and proposes rules). Nothing is
loaded or applied here; batches that fail the 95% bar still run (plan B: learn from the whole catalog, then
re-run under the final rules). One line per batch goes to workspace/standardize/catalog.log.

    python manage.py standardize_all --prefix cat5 --size 10000
"""
import json
import sys
import time

from django.core.management.base import BaseCommand

from apps.inventory.services import standardize


class Command(BaseCommand):
    help = 'Standardize every remaining product in vetted 10k batches.'

    def add_arguments(self, parser):
        parser.add_argument('--prefix', default='cat5')
        parser.add_argument('--size', type=int, default=10000)
        parser.add_argument('--max-batches', type=int, default=40)
        parser.add_argument('--no-vet', action='store_true', help='Rules are frozen: write only, no per-batch vet.')

    def handle(self, *args, prefix, size, max_batches, no_vet=False, **options):
        # Keep Windows from idle-sleeping while this runs (the 2026-09-29 run paused 13 hours when the PC slept).
        # Released automatically when the process ends; the user's power settings are not changed.
        if sys.platform == 'win32':
            import ctypes
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
        log = standardize.OUT_DIR / 'catalog.log'
        for n in range(1, max_batches + 1):
            batch = f'{prefix}-{n:03d}'
            path = standardize.OUT_DIR / f'{batch}.jsonl'
            done_marker = standardize.OUT_DIR / f'{batch}.done'
            if (standardize.OUT_DIR / f'{batch}.vet.json').exists() or done_marker.exists():
                continue  # done in an earlier run
            t0 = time.time()
            stats = standardize.run_batch(batch, size, log=self.stdout.write, grouped=True)
            rows = stats.get('rows', 0) if not path.exists() else sum(1 for _ in path.open(encoding='utf-8'))
            if not rows:
                self.stdout.write('No products left.')
                break
            done_marker.write_text('written', encoding='utf-8')
            try:
                if no_vet:
                    raise RuntimeError('vetting off (rules frozen)')
                vet = standardize.vet(batch, log=self.stdout.write)
            except Exception as exc:  # noqa: BLE001 - a failed vet never stops the run
                vet = {'share_right': None, 'passed': False, 'confirmed_wrong': None, 'rule_proposals': [],
                       'error': str(exc)[:200]}
            line = {'batch': batch, 'rows': rows, 'minutes': round((time.time() - t0) / 60), 'rules': standardize.rules_version(),
                    'errors': stats.get('errors'), 'invalid': stats.get('invalid'), 'right': vet.get('share_right'),
                    'passed': vet.get('passed'), 'proposals': len(vet.get('rule_proposals') or []), 'vet_error': vet.get('error')}
            with log.open('a', encoding='utf-8') as f:
                f.write(json.dumps(line) + chr(10))
            self.stdout.write(json.dumps(line))
