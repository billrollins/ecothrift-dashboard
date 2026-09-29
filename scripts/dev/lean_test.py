"""
Lean test runner. It runs named suites or single targets, and prints only a summary plus NEW
failures (known ones are listed in `.ai/comm/runner/baseline.md`). Output is a few lines, so an AI
coder or a free runner model can babysit it cheaply.

    python scripts/dev/lean_test.py suite thriftplus       # one named suite (see SUITES)
    python scripts/dev/lean_test.py suite ship             # the pre-ship gate: everything below
    python scripts/dev/lean_test.py py apps/qa             # any pytest targets
    python scripts/dev/lean_test.py vitest src/pages/admin/QAPage.test.tsx
    python scripts/dev/lean_test.py tsc
    python scripts/dev/lean_test.py migrations
    python scripts/dev/lean_test.py warehouse              # rebuild the Analytical layer; its checks

- **The result file:** every run also writes its output to `workspace/lean/last-<name>.txt`. A runner
  pastes that file, nothing else.
- **Adding tests:** add the path to a suite in SUITES. A new suite is one more entry.
- **Exit code:** non-zero when there is a NEW failure.
"""
from __future__ import annotations

import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PY = str(ROOT / 'venv' / 'Scripts' / 'python.exe') if (ROOT / 'venv' / 'Scripts' / 'python.exe').exists() else sys.executable
NPX = 'npx.cmd' if sys.platform == 'win32' else 'npx'
BASELINE = ROOT / '.ai' / 'comm' / 'runner' / 'baseline.md'
OUT_DIR = ROOT / 'workspace' / 'lean'

# name → {'py': [pytest targets], 'vitest': [files or dirs, relative to frontend/; [] = none, ['*'] = all],
#          'tsc': bool, 'migrations': bool}
SUITES: dict[str, dict] = {
    'thriftplus': {
        'py': ['apps/thriftplus'],
        'vitest': ['src/pages/thriftplus', 'src/components/pos/ThriftPlusPanel.test.tsx', 'src/api/thriftPlusScanner.api.test.ts',
                   'src/utils/thriftPlusCard.test.ts', 'src/utils/posReceipt.test.ts'],
    },
    'pos': {'py': ['apps/pos'], 'vitest': ['src/utils/posReceipt.test.ts', 'src/components/pos']},
    'qa': {'py': ['apps/qa'], 'vitest': ['src/pages/admin/QAPage.test.tsx']},
    'core': {'py': ['apps/core', 'apps/accounts', 'apps/ai'], 'vitest': ['src/pages/admin/RequestsPage.test.tsx', 'src/pages/brief']},
    'buying': {'py': ['apps/buying'], 'vitest': ['src/pages/buying']},
    'quick': {'tsc': True, 'migrations': True},
    'ship': {
        'py': ['apps/thriftplus', 'apps/pos', 'apps/core', 'apps/accounts', 'apps/ai', 'apps/qa', 'apps/inventory', 'apps/buying',
               'apps/webstore', 'apps/routines/tests.py::NoDashesTests'],
        'vitest': ['*'], 'tsc': True, 'migrations': True,
    },
}

LINES: list[str] = []


def say(line: str) -> None:
    LINES.append(line)
    print(line)


def _run(cmd: list[str], cwd: Path) -> tuple[int, str]:
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return p.returncode, (p.stdout or '') + (p.stderr or '')


def _known() -> str:
    try:
        return BASELINE.read_text(encoding='utf-8')
    except OSError:
        return ''


def _split(fails: list[str], id_of) -> tuple[list[str], int]:
    known_text, new, known = _known(), [], 0
    for line in fails:
        if id_of(line) and id_of(line) in known_text:
            known += 1
        else:
            new.append(line)
    return new, known


def py(targets: list[str]) -> bool:
    started = time.time()
    _, out = _run([PY, '-m', 'pytest', '-q', '-p', 'no:warnings', '--no-header', '-rfE', '--tb=line', *targets], ROOT)
    summary = [l for l in out.splitlines() if re.search(r'\d+ (passed|failed|error)', l)]
    fails = [l for l in out.splitlines() if l.startswith(('FAILED ', 'ERROR '))]
    new, known = _split(fails, lambda l: l.split()[1] if len(l.split()) > 1 else '')
    say(f"py {' '.join(targets)[:80]}: {summary[-1].strip() if summary else 'no summary (see below)'} "
        f"[{known} known, {len(new)} NEW, {time.time() - started:.0f}s]")
    if not summary:
        say(out[-800:])
    for l in new[:25]:
        say('  NEW ' + l[:220])
    return not new and bool(summary)


def vitest(files: list[str]) -> bool:
    started = time.time()
    args = [] if files == ['*'] else files
    _, out = _run([NPX, 'vitest', 'run', '--reporter=dot', *args], ROOT / 'frontend')
    lines = out.splitlines()
    totals = ' | '.join(l.strip() for l in lines if re.match(r'\s*(Test Files|Tests)\s', l))
    fails = sorted({l.strip() for l in lines if l.strip().startswith('FAIL ')})
    new, known = _split(fails, lambda l: l[5:].split(' [')[0].strip())
    say(f"vitest {' '.join(files)[:80]}: {totals or 'no totals (see below)'} [{known} known, {len(new)} NEW, {time.time() - started:.0f}s]")
    if not totals:
        say(out[-800:])
    for l in new[:25]:
        say('  NEW ' + l[:220])
    return not new and bool(totals)


def tsc() -> bool:
    _, out = _run([NPX, 'tsc', '--noEmit', '-p', '.'], ROOT / 'frontend')
    errs = [l for l in out.splitlines() if 'error TS' in l]
    new, known = _split(errs, lambda l: l.split('(')[0].strip())
    say(f'tsc: {len(errs)} errors [{known} known, {len(new)} NEW]')
    for l in new[:20]:
        say('  NEW ' + l[:220])
    return not new


def migrations() -> bool:
    _, out = _run([PY, 'manage.py', 'makemigrations', '--check', '--dry-run'], ROOT)
    ops = [l.strip() for l in out.splitlines() if l.strip().startswith(('+', '~', '-')) and 'webstore' not in l.lower()]
    say('migrations: ' + ('clean (the 2 known webstore renames ignored)' if not ops else f'{len(ops)} pending'))
    for l in ops[:10]:
        say('  NEW ' + l)
    return not ops


def warehouse() -> bool:
    started = time.time()
    code, out = _run([PY, '-m', 'warehouse.build'], ROOT)
    failed = [l.strip() for l in out.splitlines() if 'FAILED' in l]
    say(f"warehouse: {'GREEN' if code == 0 else 'RED'} [{len(failed)} failed checks, {time.time() - started:.0f}s]")
    if code != 0 and not failed:
        say(out[-800:])
    for l in failed[:20]:
        say('  NEW ' + l[:220])
    return code == 0


def suite(name: str) -> bool:
    if name not in SUITES:
        say(f'Unknown suite {name!r}. Suites: {", ".join(SUITES)}')
        return False
    s, ok = SUITES[name], True
    if s.get('py'):
        ok &= py(s['py'])
    if s.get('vitest'):
        ok &= vitest(s['vitest'])
    if s.get('tsc'):
        ok &= tsc()
    if s.get('migrations'):
        ok &= migrations()
    return ok


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    kind, rest = sys.argv[1], sys.argv[2:]
    runners = {'suite': lambda: suite(rest[0] if rest else ''), 'py': lambda: py(rest), 'vitest': lambda: vitest(rest),
               'tsc': tsc, 'migrations': migrations, 'warehouse': warehouse}
    if kind not in runners:
        print(__doc__)
        return 2
    ok = runners[kind]()
    say('RESULT: ' + ('GREEN (no NEW failures)' if ok else 'RED (NEW failures above)'))
    name = rest[0] if kind == 'suite' and rest else kind
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f'last-{name}.txt').write_text(time.strftime('%Y-%m-%d %H:%M ') + ' '.join(sys.argv[1:]) + '\n' + '\n'.join(LINES) + '\n',
                                               encoding='utf-8')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
