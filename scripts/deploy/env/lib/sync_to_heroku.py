#!/usr/bin/env python3
"""Push repo-root ``.envprod`` to Heroku Config Vars."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_io import mask_value, parse_env_file, repo_root

DEFAULT_APP = 'ecothrift-dashboard'
SKIP_KEYS = frozenset(
    {
        'DATABASE_URL',
        'HEROKU_APP_NAME',
        'HEROKU_RELEASE_VERSION',
        'HEROKU_SLUG_COMMIT',
        'DATABASE_NAME',
        'DATABASE_USER',
        'DATABASE_PASSWORD',
        'DATABASE_HOST',
        'DATABASE_PORT',
        'PROD_DATABASE_NAME',
        'PROD_DATABASE_HOST',
        'PROD_DATABASE_PORT',
        'PROD_DATABASE_USER',
        'PROD_DATABASE_PASSWORD',
        'VITE_DEV_LOG',
    },
)
BATCH_SIZE = 20


def heroku_cli() -> str:
    """Full path to a Windows-executable Heroku CLI entry point.

    PATH carries both an extensionless unix shim and heroku.cmd; bare
    'heroku' resolves to the shim, which CreateProcess cannot run."""
    for name in ('heroku.cmd', 'heroku.exe', 'heroku.bat', 'heroku'):
        path = shutil.which(name)
        if path:
            return path
    print('ERROR: Heroku CLI not found on PATH. Install it or restart the shell.', file=sys.stderr)
    raise SystemExit(1)


def run_heroku_config_set(heroku: str, app: str, pairs: dict[str, str]) -> None:
    items = list(pairs.items())
    for i in range(0, len(items), BATCH_SIZE):
        chunk = items[i : i + BATCH_SIZE]
        args = [heroku, 'config:set', *[f'{k}={v}' for k, v in chunk], '-a', app]
        subprocess.run(args, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description='Sync repo-root .envprod → Heroku Config Vars')
    parser.add_argument('--app', default=DEFAULT_APP, help=f'Heroku app (default: {DEFAULT_APP})')
    parser.add_argument('--dry-run', action='store_true', help='Print keys only; do not call Heroku')
    args = parser.parse_args()

    env_path = repo_root() / '.envprod'
    if not env_path.is_file():
        print(f'ERROR: {env_path} not found.', file=sys.stderr)
        print('Edit .envprod at the repo root, then run sync_to_heroku.bat', file=sys.stderr)
        return 1

    raw = parse_env_file(env_path)

    # Prod-sanity guard: .envprod must carry production values in its top section.
    problems = []
    if raw.get('DEBUG', '').strip().lower() in ('true', '1', 'yes'):
        problems.append('DEBUG must be False in .envprod')
    hosts = raw.get('ALLOWED_HOSTS', '')
    if 'localhost' in hosts or 'testserver' in hosts:
        problems.append('ALLOWED_HOSTS contains localhost/testserver (dev values)')
    if raw.get('ENVIRONMENT', '').strip().lower() == 'development':
        problems.append('ENVIRONMENT is development')
    if problems:
        print('ERROR: .envprod still has dev values — fix before syncing:', file=sys.stderr)
        for prob in problems:
            print(f'  - {prob}', file=sys.stderr)
        return 1

    skipped: list[str] = []
    pairs: dict[str, str] = {}
    for key, value in sorted(raw.items()):
        if key in SKIP_KEYS:
            skipped.append(key)
            continue
        if value == '':
            print(f'SKIP (empty): {key}')
            continue
        pairs[key] = value

    if skipped:
        print(f'Skipped (Heroku-managed or local-only): {", ".join(skipped)}')

    if not pairs:
        print('Nothing to sync.')
        return 0

    print(f'{"Would sync" if args.dry_run else "Syncing"} {len(pairs)} var(s) to {args.app}:')
    for key in sorted(pairs):
        print(f'  {key}={mask_value(key, pairs[key])}')

    if args.dry_run:
        print('\nDry run — no changes made.')
        return 0

    heroku = heroku_cli()
    try:
        subprocess.run([heroku, 'auth:whoami'], check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError:
        print('ERROR: Not logged into Heroku CLI. Run: heroku login', file=sys.stderr)
        return 1

    try:
        run_heroku_config_set(heroku, args.app, pairs)
    except subprocess.CalledProcessError as exc:
        print(f'ERROR: heroku config:set failed (exit {exc.returncode})', file=sys.stderr)
        return exc.returncode or 1

    print(f'\nDone — {len(pairs)} Config Var(s) updated on {args.app}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
