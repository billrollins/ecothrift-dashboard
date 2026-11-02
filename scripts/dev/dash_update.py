"""
Dash Updates from a coding session: read and set one update's status, waiting_on, session and notes.
The token is DASH_CODER_TOKEN, read from `.envprod` (production, the default) or `.env` (--local);
it is sent as X-Coder-Token and never printed. Protocol: .ai/protocols/mainline_updates.md.

    python scripts/dev/dash_update.py                                     # the open list: id, rank, status, blocked_by
    python scripts/dev/dash_update.py 12                                  # status + every note
    python scripts/dev/dash_update.py 12 --since 2026-11-02T14:00:00Z     # notes newer than that
    python scripts/dev/dash_update.py 12 --status working --session "Dash Updates: desktop view" --note "Started."
    python scripts/dev/dash_update.py 12 --status almost --waiting-on "ship"
    python scripts/dev/dash_update.py 12 --status hold --note "Parked: waits on the Perks build."
    python scripts/dev/dash_update.py 12 --status done --version v2.234.0
    python scripts/dev/dash_update.py 12 --local ...                      # http://127.0.0.1:8000 (or ECOTHRIFT_API_PORT) and .env

Statuses: accepted (back in line), working, almost (set --waiting-on), hold, done (set --version).
Output: one JSON object (id, title, status, rank, waiting_on, session, done_version, updated_at, notes).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROD_URL = 'https://dash.ecothrift.us'
LOCAL_URL = f"http://127.0.0.1:{os.environ.get('ECOTHRIFT_API_PORT') or 8000}"


def env_value(name: str, local: bool) -> str:
    """The value from the env file; a worktree falls back to the main checkout's copy."""
    file_name = '.env' if local else '.envprod'
    candidates = [ROOT / file_name]
    if (ROOT / '.git').is_file():  # a worktree: .git is a file pointing at the main repo
        text = (ROOT / '.git').read_text(encoding='utf-8').strip()
        if text.startswith('gitdir:'):
            main = Path(text.split(':', 1)[1].strip()).resolve().parents[2]
            candidates.append(main / file_name)
    for path in candidates:
        if not path.exists():
            continue
        for line in path.read_text(encoding='utf-8').splitlines():
            key, sep, value = line.partition('=')
            if sep and key.strip() == name:
                return value.strip().strip('"').strip("'")
    return ''


def main() -> int:
    parser = argparse.ArgumentParser(description='Read or set one Dash Update from a coding session.')
    parser.add_argument('id', type=int, nargs='?', help='the update id; leave out for the open list')
    parser.add_argument('--status', choices=['accepted', 'working', 'almost', 'hold', 'done'])
    parser.add_argument('--waiting-on')
    parser.add_argument('--session')
    parser.add_argument('--note')
    parser.add_argument('--version')
    parser.add_argument('--since', help='ISO time: only notes newer than this (read only)')
    parser.add_argument('--local', action='store_true', help='local server and .env instead of production')
    args = parser.parse_args()

    token = env_value('DASH_CODER_TOKEN', args.local)
    if not token:
        print(f"DASH_CODER_TOKEN is not set in {'.env' if args.local else '.envprod'}.", file=sys.stderr)
        return 2
    base = f"{LOCAL_URL if args.local else PROD_URL}/api/core/dash-updates"
    url = f"{base}/{args.id}/coder/" if args.id is not None else f"{base}/coder/"
    body = {key: value for key, value in {
        'status': args.status, 'waiting_on': args.waiting_on, 'session': args.session,
        'note': args.note, 'version': args.version,
    }.items() if value is not None}
    headers = {'X-Coder-Token': token, 'Accept': 'application/json'}
    if body and args.id is None:
        parser.error('give the update id to change it')
    if body:
        request = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
                                         headers={**headers, 'Content-Type': 'application/json'})
    else:
        query = f"?{urllib.parse.urlencode({'since': args.since})}" if args.since else ''
        request = urllib.request.Request(url + query, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            print(json.dumps(json.loads(response.read()), indent=2, ensure_ascii=False))
            return 0
    except urllib.error.HTTPError as error:
        print(f'HTTP {error.code}: {error.read().decode(errors="replace")[:500]}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
