#!/usr/bin/env python3
"""Copy this app's S3 objects from the shared bucket into its own bucket (house standard D12).

    dashboard-basic/<key>                 -> ecothrift-dashboard-files/prod/<key>
    dashboard-basic/ecothrift/dev/<rest>  -> ecothrift-dashboard-files/dev/<rest>

Safety:
  * Dry run unless --apply is given.
  * Server-side copy_object only. NEVER writes to or deletes from the source bucket.
  * Only the prefixes in OWN_PREFIXES are copied (unknown prefixes are listed, not copied).
  * Re-runnable: an object already at the destination with the same size and ETag is skipped
    (use again on switch day to pick up new files).
  * Reads AWS credentials from the repo-root .env; values are never printed.

Usage (repo root):
    venv\\Scripts\\python.exe scripts\\s3\\copy_to_own_bucket.py --inventory
    venv\\Scripts\\python.exe scripts\\s3\\copy_to_own_bucket.py            # dry run
    venv\\Scripts\\python.exe scripts\\s3\\copy_to_own_bucket.py --apply
Logs: workspace/s3/copy_<timestamp>.log
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_BUCKET = 'dashboard-basic'
DST_BUCKET = 'ecothrift-dashboard-files'
DEV_PREFIX = 'ecothrift/dev/'

# Prefixes this app writes (from the code: upload_to, hand-built keys, save_upload key_prefix).
OWN_PREFIXES = (
    'blog/images/',
    'delivery/',
    'demo/',
    # 'documents/' is NOT ours: master matched all 20 objects to Dark Horse's DB (2026-09-30). Never copy it.
    # docs/, library/acks/, downloads/ are unclaimed by both apps: left alone until Bill decides.
    'label-studio/',
    'manifests/orders/',
    'manifests/2025/',  # 73 PO_*.csv; unclaimed by Dark Horse, master OK 2026-09-30
    'print-server/',
    'receiving/orders/',
    'routines/submissions/',
    'thriftplus/',
    'webstore/',
)


def read_env() -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in (ROOT / '.env').read_text(encoding='utf-8-sig').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, _, v = line.partition('=')
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
            v = v[1:-1]
        out[k.strip()] = v
    return out


def client():
    import boto3

    env = read_env()
    return boto3.client(
        's3',
        region_name=env.get('AWS_S3_REGION_NAME', 'us-east-2'),
        aws_access_key_id=env['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=env['AWS_SECRET_ACCESS_KEY'],
    )


def list_keys(s3, bucket: str, prefix: str = ''):
    for page in s3.get_paginator('list_objects_v2').paginate(Bucket=bucket, Prefix=prefix):
        yield from page.get('Contents', [])


def destination(key: str) -> str | None:
    """Destination key for a source key, or None when it isn't ours."""
    if key.startswith(DEV_PREFIX):
        rest = key[len(DEV_PREFIX):]
        return f'dev/{rest}' if rest else None
    if key.endswith('/'):
        return None
    if key.startswith(OWN_PREFIXES):
        return f'prod/{key}'
    return None


def inventory(s3) -> None:
    """Top-level prefixes in the shared bucket with counts/bytes, marked ours / not ours."""
    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for obj in list_keys(s3, SRC_BUCKET):
        key = obj['Key']
        top = key.split('/', 1)[0] + '/' if '/' in key else '(root file)'
        c = counts[top]
        c[0] += 1
        c[1] += obj['Size']
    print(f'{"prefix":28s} {"objects":>9s} {"MB":>10s}  owner')
    for top, (n, b) in sorted(counts.items()):
        if top == 'ecothrift/':
            owner = 'ours (dev interim; only ecothrift/dev/ is copied)'
        elif any(p.startswith(top) for p in OWN_PREFIXES):
            owner = 'ours (in OWN_PREFIXES)'
        else:
            owner = 'NOT copied: not in OWN_PREFIXES (other app or unknown)'
        print(f'{top:28s} {n:9d} {b / 1e6:10.1f}  {owner}')


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--inventory', action='store_true', help='List top-level prefixes (read-only) and exit')
    ap.add_argument('--apply', action='store_true', help='Really copy (default is a dry run)')
    args = ap.parse_args()

    s3 = client()
    if args.inventory:
        inventory(s3)
        return 0

    log_dir = ROOT / 'workspace' / 's3'
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f'copy_{dt.datetime.now():%Y%m%d_%H%M%S}.log'
    log = open(log_path, 'w', encoding='utf-8')

    def say(msg: str) -> None:
        print(msg)
        log.write(msg + '\n')

    mode = 'APPLY' if args.apply else 'DRY RUN'
    say(f'{mode}: {SRC_BUCKET} -> {DST_BUCKET} (source is read-only)')

    existing = {o['Key']: (o['Size'], o['ETag']) for o in list_keys(s3, DST_BUCKET)}
    copied = skipped = failed = 0
    copied_bytes = 0
    by_prefix: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    not_ours: dict[str, int] = defaultdict(int)

    for obj in list_keys(s3, SRC_BUCKET):
        key = obj['Key']
        dest = destination(key)
        if dest is None:
            not_ours[key.split('/', 1)[0] + '/' if '/' in key else '(root file)'] += 1
            continue
        have = existing.get(dest)
        # Same size and ETag = already copied. A source uploaded in parts has an ETag like 'abc-12';
        # the server-side copy gets a new ETag, so for those compare size only.
        if have and have[0] == obj['Size'] and (have[1] == obj['ETag'] or '-' in obj['ETag']):
            skipped += 1
            continue
        top = dest.split('/', 2)[0] + '/' + (dest.split('/', 2)[1] if '/' in dest else '')
        if args.apply:
            try:
                s3.copy_object(
                    Bucket=DST_BUCKET, Key=dest,
                    CopySource={'Bucket': SRC_BUCKET, 'Key': key},
                )
            except Exception as exc:  # noqa: BLE001 - keep going, report at the end
                failed += 1
                say(f'FAILED {key}: {type(exc).__name__}')
                continue
        copied += 1
        copied_bytes += obj['Size']
        by_prefix[top][0] += 1
        by_prefix[top][1] += obj['Size']

    verb = 'copied' if args.apply else 'would copy'
    say(f'{verb}: {copied} objects, {copied_bytes / 1e6:.1f} MB; already there (skipped): {skipped}; failed: {failed}')
    for top, (n, b) in sorted(by_prefix.items()):
        say(f'  {top:32s} {n:8d} objects {b / 1e6:10.1f} MB')
    if not_ours:
        say('not copied (not in OWN_PREFIXES):')
        for top, n in sorted(not_ours.items()):
            say(f'  {top:32s} {n:8d} objects')
    say(f'log: {log_path}')
    log.close()
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
