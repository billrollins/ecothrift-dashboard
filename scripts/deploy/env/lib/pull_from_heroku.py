#!/usr/bin/env python3
"""Pull Heroku Config Vars into repo-root ``.envprod``, optionally merge shared keys into ``.env``."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_io import mask_value, parse_env_file, repo_root
from sync_to_heroku import DEFAULT_APP, SKIP_KEYS, heroku_cli

# Never copy these from Heroku into local ``.env``. Prod hosts, the prod secret,
# and Heroku's DATABASE_URL would break the local stack.
LOCAL_ONLY_KEYS = frozenset(
    {
        *SKIP_KEYS,
        'SECRET_KEY',
        'DEBUG',
        'ENVIRONMENT',
        'ALLOWED_HOSTS',
        'DJANGO_SETTINGS_MODULE',
        'STAFF_DASHBOARD_HOST',
        'ONLINE_SALES_PUBLIC_BASE_URL',
        'PUBLIC_SITE_HOSTS',
        'PUBLIC_SITE_CANONICAL_HOST',
    }
)

ENVPROD_HEADER = """\
# Production mirror (gitignored). Written by pull_from_heroku.bat.
# Top section is Heroku / prod. Shared keys (AI, AWS, …) also belong in .env.
# Push back with: scripts\\deploy\\env\\sync_to_heroku.bat
"""


def fetch_heroku_config(heroku: str, app: str) -> dict[str, str]:
    result = subprocess.run(
        [heroku, 'config', '-a', app, '--json'],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        err = (result.stderr or result.stdout or '').strip() or f'exit {result.returncode}'
        print(f'ERROR: heroku config failed: {err}', file=sys.stderr)
        raise SystemExit(result.returncode or 1)
    try:
        remote = json.loads(result.stdout)
    except json.JSONDecodeError:
        print('ERROR: could not parse Heroku config JSON.', file=sys.stderr)
        raise SystemExit(1)
    if not isinstance(remote, dict):
        print('ERROR: Heroku config JSON was not an object.', file=sys.stderr)
        raise SystemExit(1)
    return {str(key): '' if value is None else str(value) for key, value in remote.items()}


def for_envprod(remote: dict[str, str]) -> dict[str, str]:
    return {
        key: value
        for key, value in remote.items()
        if key not in SKIP_KEYS and value != ''
    }


def for_local_env(remote: dict[str, str]) -> dict[str, str]:
    return {
        key: value
        for key, value in remote.items()
        if key not in LOCAL_ONLY_KEYS and value != ''
    }


def write_envprod(path: Path, pairs: dict[str, str]) -> None:
    lines = [ENVPROD_HEADER.rstrip(), '']
    for key in sorted(pairs):
        lines.append(f'{key}={pairs[key]}')
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def merge_into_env(path: Path, incoming: dict[str, str]) -> tuple[list[str], list[str]]:
    """Update or append shared keys. Local-only lines stay as they are."""
    existing = parse_env_file(path) if path.is_file() else {}
    updated: list[str] = []
    added: list[str] = []
    if path.is_file():
        lines = path.read_text(encoding='utf-8').splitlines()
    else:
        lines = [
            '# Local-only starter. Shared keys below were pulled from Heroku.',
            '',
        ]

    seen: set[str] = set()
    new_lines: list[str] = []
    for raw in lines:
        stripped = raw.strip()
        if not stripped or stripped.startswith('#') or '=' not in stripped:
            new_lines.append(raw)
            continue
        work = stripped[7:].strip() if stripped.startswith('export ') else stripped
        key, _, _value = work.partition('=')
        key = key.strip()
        if key in incoming:
            new_lines.append(f'{key}={incoming[key]}')
            seen.add(key)
            if existing.get(key) != incoming[key]:
                updated.append(key)
            continue
        new_lines.append(raw)

    missing = [key for key in sorted(incoming) if key not in seen]
    if missing:
        if new_lines and new_lines[-1].strip():
            new_lines.append('')
        new_lines.append('# Shared keys pulled from Heroku (AI, AWS, …)')
        for key in missing:
            new_lines.append(f'{key}={incoming[key]}')
            added.append(key)

    path.write_text('\n'.join(new_lines) + '\n', encoding='utf-8')
    return updated, added


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Pull Heroku Config Vars → .envprod, optionally merge shared keys into .env',
    )
    parser.add_argument('--app', default=DEFAULT_APP, help=f'Heroku app (default: {DEFAULT_APP})')
    parser.add_argument(
        '--into-local',
        action='store_true',
        help='Also merge shared keys into .env (skips database, debug, hosts, secret)',
    )
    parser.add_argument('--dry-run', action='store_true', help='Print key names only; write nothing')
    args = parser.parse_args()

    heroku = heroku_cli()
    try:
        subprocess.run([heroku, 'auth:whoami'], check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError:
        print('ERROR: Not logged into Heroku CLI. Run: heroku login', file=sys.stderr)
        return 1

    remote = fetch_heroku_config(heroku, args.app)
    prod_pairs = for_envprod(remote)
    local_pairs = for_local_env(remote)

    print(f'Read {len(remote)} Config Var(s) from {args.app}.')
    skipped = sorted(k for k in remote if k in SKIP_KEYS)
    if skipped:
        print(f'Skipped (Heroku-managed or local-only): {", ".join(skipped)}')

    print(f'{"Would write" if args.dry_run else "Writing"} {len(prod_pairs)} var(s) to .envprod:')
    for key in sorted(prod_pairs):
        print(f'  {key}={mask_value(key, prod_pairs[key])}')

    if args.into_local:
        print(f'\n{"Would merge" if args.dry_run else "Merging"} {len(local_pairs)} shared var(s) into .env:')
        for key in sorted(local_pairs):
            print(f'  {key}={mask_value(key, local_pairs[key])}')

    if args.dry_run:
        print('\nDry run — no files written.')
        return 0

    root = repo_root()
    envprod_path = root / '.envprod'
    write_envprod(envprod_path, prod_pairs)
    print(f'\nWrote {envprod_path}')

    if args.into_local:
        env_path = root / '.env'
        updated, added = merge_into_env(env_path, local_pairs)
        print(f'Merged into {env_path} (updated {len(updated)}, added {len(added)}).')
        print('Local DEBUG, DATABASE_*, SECRET_KEY, and hosts were left alone.')

    print('Restart Django so it reloads .env.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
