"""
Lean test runner. It runs the checks side by side and prints only a summary plus NEW failures (known
ones are listed in `.ai/comm/runner/baseline.md`). Output is a few lines, so an AI coder or a free
runner model can babysit it cheaply.

    python scripts/dev/lean_test.py changed                # the per-ship gate: only what changed against origin/main
    python scripts/dev/lean_test.py changed --base v2.269.3    # ... against another commit
    python scripts/dev/lean_test.py suite thriftplus       # one named suite (see SUITES)
    python scripts/dev/lean_test.py suite ship             # the full suite (nightly, or before a big release)
    python scripts/dev/lean_test.py py apps/qa             # any pytest targets
    python scripts/dev/lean_test.py vitest src/pages/admin/QAPage.test.tsx
    python scripts/dev/lean_test.py tsc                    # both front ends (Heroku's build no longer type-checks)
    python scripts/dev/lean_test.py compile                # every .py under apps/ and ecothrift/ compiles
    python scripts/dev/lean_test.py migrations
    python scripts/dev/lean_test.py paths                  # D21 lint: no drive-letter paths in tracked files
    python scripts/dev/lean_test.py warehouse              # rebuild the Analytical layer; its checks
    python scripts/dev/lean_test.py docs-only [A [B]]      # exit 0 when A..B (default origin/main..work tree) touches docs only

- **changed:** server tests of the apps whose files changed, front-end tests related to the changed files
  (`vitest related`), the type check of a changed front end, compile and the migrations check, all at once.
  A change to a shared server file (`ecothrift/`, requirements, `pytest.ini`) runs every server suite; a change
  to front-end setup (`package.json`, `vite.config.ts`, `src/test/`) runs every front-end test.
- **Side by side:** the checks of a suite run at the same time. Server tests use pytest-xdist when it is
  installed (`requirements-dev.txt`); `LEAN_PY_WORKERS` sets the worker count (1 = no xdist).
- **The result file:** every run also writes its output to `workspace/lean/last-<name>.txt`. A runner
  pastes that file, nothing else.
- **Adding tests:** add the path to a suite in SUITES. A new suite is one more entry.
- **Exit code:** non-zero when there is a NEW failure.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PY = str(ROOT / 'venv' / 'Scripts' / 'python.exe') if (ROOT / 'venv' / 'Scripts' / 'python.exe').exists() else sys.executable
NPX = 'npx.cmd' if sys.platform == 'win32' else 'npx'
BASELINE = ROOT / '.ai' / 'comm' / 'runner' / 'baseline.md'
OUT_DIR = ROOT / 'workspace' / 'lean'
FRONT_ENDS = ('frontend', 'frontend-public')
PY_WORKERS = int(os.environ.get('LEAN_PY_WORKERS') or 6)
VITEST_WORKERS = os.environ.get('LEAN_VITEST_WORKERS') or '8'  # the checks share the CPUs: uncapped, tests time out

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
    'hiring': {'py': ['apps/hiring'], 'vitest': ['src/pages/people'], 'tsc': True},
    'quick': {'tsc': True, 'migrations': True, 'paths': True},
    'ship': {
        'py': ['apps/thriftplus', 'apps/pos', 'apps/core', 'apps/accounts', 'apps/ai', 'apps/qa', 'apps/inventory', 'apps/stocktake', 'apps/hiring', 'apps/buying',
               'apps/webstore', 'apps/routines/tests.py::NoDashesTests'],
        'vitest': ['*'], 'tsc': True, 'migrations': True, 'paths': True, 'compile': True, 'full': True,
    },
}

# A change here can break any app: run every server suite.
SHARED_SERVER = ('ecothrift/', 'requirements', 'pytest.ini', 'manage.py', 'conftest.py')
# A change here can break any front-end test: run them all.
FRONT_SETUP = ('package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'src/test/')
# A release that touches only these is shipped and not deployed (ship.md, deploy.md § Project steps).
DOCS_ONLY = ('.ai/', 'docs/', 'CHANGELOG.md', '.version', 'scripts/deploy/commit_message.txt')

Check = tuple[bool, list[str]]  # green?, the lines to show


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


_XDIST: bool | None = None


def _xdist() -> bool:
    global _XDIST
    if _XDIST is None:
        _XDIST = PY_WORKERS > 1 and _run([PY, '-c', 'import xdist'], ROOT)[0] == 0
    return _XDIST


def py(targets: list[str]) -> Check:
    started, lines = time.time(), []
    spread = ['-n', str(PY_WORKERS)] if _xdist() else []  # each worker keeps its own test database (--reuse-db)
    _, out = _run([PY, '-m', 'pytest', '-q', '-p', 'no:warnings', '--no-header', '-rfE', '--tb=line', *spread, *targets], ROOT)
    summary = [l for l in out.splitlines() if re.search(r'\d+ (passed|failed|error)', l)]
    fails = [l for l in out.splitlines() if l.startswith(('FAILED ', 'ERROR '))]
    new, known = _split(fails, lambda l: l.split()[1] if len(l.split()) > 1 else '')
    lines.append(f"py {' '.join(targets)[:80]}: {summary[-1].strip() if summary else 'no summary (see below)'} "
                 f"[{known} known, {len(new)} NEW, {time.time() - started:.0f}s]")
    if not summary:
        lines.append(out[-800:])
    lines += ['  NEW ' + l[:220] for l in new[:25]]
    return not new and bool(summary), lines


def _vitest_run(mode: list[str], args: list[str], front: str) -> tuple[str, str, list[str]]:
    _, out = _run([NPX, 'vitest', *mode, '--reporter=dot', f'--maxWorkers={VITEST_WORKERS}', *args], ROOT / front)
    out_lines = out.splitlines()
    totals = ' | '.join(l.strip() for l in out_lines if re.match(r'\s*(Test Files|Tests)\s', l))
    return out, totals, sorted({l.strip() for l in out_lines if l.strip().startswith('FAIL ')})


def vitest(files: list[str], related: bool = False, front: str = 'frontend') -> Check:
    """`related`: the files are changed source files; run only the tests that import them."""
    started, lines = time.time(), []
    args = [] if files == ['*'] else files
    out, totals, fails = _vitest_run(['related', '--run', '--passWithNoTests'] if related and args else ['run'], args, front)
    if not totals and related and 'No test files found' in out:
        totals = 'no test covers the changed files'
    again = ''
    failed_files = sorted({l[5:].split(' > ')[0].split(' [')[0].strip() for l in fails})
    if fails and (related or files == ['*'] or len(failed_files) < len(files) or len(files) > 1):
        # Beside the other checks a slow test can time out. Run the failed files once more by themselves:
        # a real failure fails again, a starved one passes.
        _, _, fails_alone = _vitest_run(['run'], failed_files, front)
        again = f', {len(fails) - len(fails_alone)} of {len(fails)} failures passed when run again alone'
        fails = fails_alone
    new, known = _split(fails, lambda l: l[5:].split(' [')[0].strip())
    what = f'{len(args)} changed files' if related and args else ' '.join(files)[:80]
    label = 'vitest' if front == 'frontend' else f'vitest ({front})'
    lines.append(f"{label} {what}: {totals or 'no totals (see below)'}{again} [{known} known, {len(new)} NEW, {time.time() - started:.0f}s]")
    if not totals:
        lines.append(out[-800:])
    lines += ['  NEW ' + l[:220] for l in new[:25]]
    return not new and bool(totals), lines


def _tsc_one(front: str, full: bool) -> tuple[list[str], str]:
    """The `error TS` lines of one front end. Not full: reuse the last run's build info (unchanged files are not re-checked)."""
    tsc_js = ROOT / front / 'node_modules' / 'typescript' / 'bin' / 'tsc'
    if not tsc_js.exists():
        return [], f'{front}/node_modules is missing (npm install there, or junction it to the main checkout)'
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cache = [] if full else ['--incremental', '--tsBuildInfoFile', str(OUT_DIR / f'tsc-{front}.tsbuildinfo')]
    code, out = _run(['node', str(tsc_js), '--noEmit', '-p', '.', *cache], ROOT / front)
    errs = [f'{front}/{l}' for l in out.splitlines() if 'error TS' in l]
    return errs, ('' if errs or code == 0 else out[-400:] or f'tsc ended with code {code}')


def tsc(fronts: tuple[str, ...] = FRONT_ENDS, full: bool = False) -> Check:
    started, lines = time.time(), []
    with ThreadPoolExecutor(len(fronts)) as pool:
        got = list(pool.map(lambda f: _tsc_one(f, full), fronts))
    errs = [e for found, _ in got for e in found]
    broken = [b for _, b in got if b]
    new, known = _split(errs, lambda l: l.split('/', 1)[1].split('(')[0].strip())
    lines.append(f"tsc {' + '.join(fronts)}: {len(errs)} errors [{known} known, {len(new)} NEW, {time.time() - started:.0f}s]")
    lines += ['  NEW ' + l[:220] for l in new[:20]]
    lines += ['  NEW could not run: ' + b for b in broken]
    return not new and not broken, lines


def compile_py() -> Check:
    started = time.time()
    code, out = _run([PY, '-c', "import compileall, sys; sys.exit(0 if all(compileall.compile_dir(d, quiet=1) for d in ('apps', 'ecothrift')) else 1)"], ROOT)
    lines = [f"compile apps + ecothrift: {'clean' if code == 0 else 'ERRORS'} [{time.time() - started:.0f}s]"]
    if code != 0:
        lines += ['  NEW ' + l[:220] for l in out.splitlines()[:20]]
    return code == 0, lines


def migrations() -> Check:
    _, out = _run([PY, 'manage.py', 'makemigrations', '--check', '--dry-run'], ROOT)
    ops = [l.strip() for l in out.splitlines() if l.strip().startswith(('+', '~', '-')) and 'webstore' not in l.lower()]
    lines = ['migrations: ' + ('clean (the 2 known webstore renames ignored)' if not ops else f'{len(ops)} pending')]
    lines += ['  NEW ' + l for l in ops[:10]]
    return not ops, lines


def warehouse() -> Check:
    started = time.time()
    code, out = _run([PY, '-m', 'warehouse.build'], ROOT)
    failed = [l.strip() for l in out.splitlines() if 'FAILED' in l]
    lines = [f"warehouse: {'GREEN' if code == 0 else 'RED'} [{len(failed)} failed checks, {time.time() - started:.0f}s]"]
    if code != 0 and not failed:
        lines.append(out[-800:])
    lines += ['  NEW ' + l[:220] for l in failed[:20]]
    return code == 0, lines


# D21 § 1.6: a drive-letter path (a letter, a colon, then a slash or backslash) in a tracked file. Not after a letter or digit (https:),
# and not a single backslash escape like the \n in a notebook's "except Exception as e:\n".
DRIVE_PATH = re.compile(r'(?<![A-Za-z0-9_])[A-Za-z]:(?:\\\\|/|\\(?![nrt"](?![A-Za-z0-9])))')
PATH_LINT_SKIP = ('docs/machines.md', '.ai/comm/')  # plus every CHANGELOG.md and archive or retired folders (history)


def paths() -> Check:
    _, out = _run(['git', 'ls-files', '-z'], ROOT)
    hits = []
    for rel in filter(None, out.split('\0')):
        parts = rel.split('/')
        if (rel.startswith(PATH_LINT_SKIP) or parts[-1] == 'CHANGELOG.md'
                or any('archive' in p.lower() or 'retired' in p.lower() for p in parts[:-1])):
            continue
        try:
            text = (ROOT / rel).read_bytes()
        except OSError:
            continue
        if b'\0' in text[:8000]:
            continue  # binary
        for n, line in enumerate(text.decode('utf-8', errors='replace').splitlines(), 1):
            if DRIVE_PATH.search(line):
                hits.append(f'{rel}:{n}: {line.strip()[:160]}')
    lines = [f'paths: {len(hits)} drive-letter paths in tracked files (D21: repo-relative, {{master}}/..., or docs/machines.md)']
    lines += ['  NEW ' + h for h in hits[:25]]
    return not hits, lines


LINES: list[str] = []


def say(line: str) -> None:
    LINES.append(line)
    print(line, flush=True)


def together(jobs: list) -> bool:
    """Run the checks at the same time; show each one's lines when it ends. Green only when every check is."""
    if not jobs:
        return True
    started, ok = time.time(), True
    with ThreadPoolExecutor(len(jobs)) as pool:
        for done in as_completed([pool.submit(job) for job in jobs]):
            try:
                good, lines = done.result()
            except Exception as exc:  # a check that could not start is a failure, never a silent pass
                good, lines = False, [f'  NEW a check could not run: {exc!r}'[:300]]
            ok &= good
            for line in lines:
                say(line)
    if len(jobs) > 1:
        say(f'{len(jobs)} checks side by side: {time.time() - started:.0f}s')
    return ok


def suite(name: str) -> bool:
    if name not in SUITES:
        say(f'Unknown suite {name!r}. Suites: {", ".join(SUITES)}')
        return False
    s, jobs = SUITES[name], []
    if s.get('py'):
        jobs.append(lambda: py(s['py']))
    if s.get('vitest'):
        jobs.append(lambda: vitest(s['vitest']))
        if s['vitest'] == ['*']:
            jobs.append(lambda: vitest(['*'], front='frontend-public'))
    if s.get('tsc'):
        jobs.append(lambda: tsc(full=bool(s.get('full'))))
    if s.get('compile'):
        jobs.append(compile_py)
    if s.get('migrations'):
        jobs.append(migrations)
    if s.get('paths'):
        jobs.append(paths)
    return together(jobs)


def _git(*args: str) -> str:
    p = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if p.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)[:80]}: {(p.stderr or '').strip()[:200]}")
    return p.stdout or ''


def _only_version_line(a: str, b: str | None) -> bool:
    """Root package.json changed, but only its "version" line (the ship bump)."""
    diff = _git('diff', '-U0', a, *([b] if b else []), '--', 'package.json')
    body = [l for l in diff.splitlines() if l[:1] in '+-' and not l.startswith(('+++', '---'))]
    return bool(body) and all('"version"' in l for l in body)


def changed_files(base: str, to: str | None = None) -> list[str]:
    """Files that differ from `base`. Without `to`: the work tree, new untracked files included."""
    names = set(filter(None, _git('diff', '--name-only', base, *([to] if to else [])).splitlines()))
    if not to:
        names |= set(filter(None, _git('ls-files', '--others', '--exclude-standard').splitlines()))
    return sorted(names)


def is_docs_only(files: list[str], a: str, b: str | None = None) -> bool:
    rest = [f for f in files if not f.startswith(DOCS_ONLY)]
    return bool(files) and (not rest or (rest == ['package.json'] and _only_version_line(a, b)))


def _has_tests(app_dir: Path) -> bool:
    return any(p.name == 'tests.py' or p.name.startswith(('test_', 'tests_')) for p in app_dir.rglob('*.py'))


def changed(rest: list[str]) -> bool:
    ref = rest[rest.index('--base') + 1] if '--base' in rest and len(rest) > rest.index('--base') + 1 else 'origin/main'
    try:
        base = _git('merge-base', 'HEAD', ref).strip()
    except RuntimeError:
        say(f'No common commit with {ref!r} (git fetch origin first).')
        return False
    files = changed_files(base)
    say(f'changed against {ref} ({base[:8]}): {len(files)} files')
    if not files:
        return True
    if is_docs_only(files, base):
        say('docs only: nothing to test. Ship it; do not deploy (ship.md § Project steps).')
        return True

    jobs, notes = [], []
    server = [f for f in files if f.endswith('.py') or f.startswith(SHARED_SERVER)]
    apps = sorted({f.split('/')[1] for f in files if f.startswith('apps/') and f.count('/') >= 2})
    if any(f.startswith(SHARED_SERVER) for f in files):
        notes.append('a shared server file changed: every server suite runs')
        targets = list(SUITES['ship']['py'])
    else:
        targets = [f'apps/{a}' for a in apps if (ROOT / 'apps' / a).is_dir() and _has_tests(ROOT / 'apps' / a)]
        untested = [a for a in apps if f'apps/{a}' not in targets]
        if untested:
            notes.append('no server tests exist for: ' + ', '.join(untested))
    if targets:
        jobs.append(lambda: py(targets))
    if server:
        jobs.append(compile_py)
    if apps:
        jobs.append(migrations)

    for front in FRONT_ENDS:
        mine = [f[len(front) + 1:] for f in files if f.startswith(front + '/')]
        if not mine:
            continue
        jobs.append(lambda front=front: tsc((front,)))
        src = [f for f in mine if f.startswith('src/') and (ROOT / front / f).is_file()]
        if front != 'frontend' or any(f.startswith(FRONT_SETUP) for f in mine):
            jobs.append(lambda front=front: vitest(['*'], front=front))
        elif src:
            jobs.append(lambda front=front, src=src: vitest(src, related=True, front=front))

    for note in notes:
        say('note: ' + note)
    if not jobs:
        say('nothing here has a check (no app, front-end or shared server file changed)')
    return together(jobs)


def docs_only(rest: list[str]) -> bool:
    a = rest[0] if rest else 'origin/main'
    b = rest[1] if len(rest) > 1 else None
    try:
        files = changed_files(a, b)
        yes = is_docs_only(files, a, b)
    except RuntimeError as exc:  # an unknown commit is never "docs only"
        say(str(exc))
        return False
    code = [f for f in files if not f.startswith(DOCS_ONLY)]
    say(f"{a}..{b or 'work tree'}: {len(files)} files, " + ('docs only (ship, no deploy)' if yes else
        ('nothing changed' if not files else f'{len(code)} are not docs, e.g. ' + ', '.join(code[:3]))))
    return yes


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    kind, rest = sys.argv[1], sys.argv[2:]
    runners = {'suite': lambda: suite(rest[0] if rest else ''), 'py': lambda: together([lambda: py(rest)]),
               'vitest': lambda: together([lambda: vitest(rest)]), 'tsc': lambda: together([lambda: tsc(full='--full' in rest)]),
               'compile': lambda: together([compile_py]), 'migrations': lambda: together([migrations]),
               'warehouse': lambda: together([warehouse]), 'paths': lambda: together([paths]),
               'changed': lambda: changed(rest), 'docs-only': lambda: docs_only(rest)}
    if kind not in runners:
        print(__doc__)
        return 2
    started = time.time()
    ok = runners[kind]()
    if kind == 'docs-only':
        say('RESULT: ' + ('DOCS ONLY' if ok else 'NOT DOCS ONLY'))
    else:
        say('RESULT: ' + ('GREEN (no NEW failures)' if ok else 'RED (NEW failures above)') + f' [{time.time() - started:.0f}s]')
    name = rest[0] if kind == 'suite' and rest else kind
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f'last-{name}.txt').write_text(time.strftime('%Y-%m-%d %H:%M ') + ' '.join(sys.argv[1:]) + '\n' + '\n'.join(LINES) + '\n',
                                               encoding='utf-8')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
