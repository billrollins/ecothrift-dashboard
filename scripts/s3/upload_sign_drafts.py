#!/usr/bin/env python3
"""Step 1 of loading sign drafts (#122): upload draft packages to the file store and write one manifest.

The packages are folders on this PC (spec: workspace/signage/DRAFT-PACKAGE-SPEC.md); the app that loads them runs
somewhere else (Heroku), so the files go to the file store first. Step 2, where the app runs:
    python manage.py load_sign_drafts --manifest-key <the key this prints>           # dry run
    python manage.py load_sign_drafts --manifest-key <key> --apply

Each argument is a package folder (has draft.json) or a folder of packages. Dry run unless --apply.
Files go to <AWS_LOCATION>/signage/drafts/<slug>/<sha256 12>-<file name>: the same file always gets the same key, and
one already there is not sent again, so running it twice is safe. The manifest goes to
signage/drafts/manifests/<UTC time>.json and a copy to workspace/signage/manifests/.

Store settings come from the environment (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_STORAGE_BUCKET_NAME,
AWS_S3_REGION_NAME, AWS_LOCATION), or from --env-file (for example .envprod) for the ones not set. AWS_LOCATION must be
the one the loading app uses (production: its Heroku value; this PC's .env: the dev folder). Values are never printed.

    venv\\Scripts\\python.exe scripts\\s3\\upload_sign_drafts.py <folder> [<folder> ...] [--env-file .envprod] [--apply]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from apps.signage import packages  # noqa: E402  (plain Python, no Django)

NEEDED = ('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_STORAGE_BUCKET_NAME')


def read_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in path.read_text(encoding='utf-8-sig').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, _, v = line.partition('=')
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def settings(env_file: str | None) -> dict[str, str]:
    file_vals = read_env_file((ROOT / env_file) if env_file and not Path(env_file).is_absolute() else Path(env_file)) if env_file else {}
    keys = NEEDED + ('AWS_S3_REGION_NAME', 'AWS_LOCATION')
    vals = {k: os.environ.get(k, file_vals.get(k, '')) for k in keys}
    missing = [k for k in NEEDED if not vals[k]]
    if missing:
        sys.exit(f'Missing store settings: {", ".join(missing)} (set them in the environment or pass --env-file).')
    vals['AWS_S3_REGION_NAME'] = vals['AWS_S3_REGION_NAME'] or 'us-east-2'
    vals['AWS_LOCATION'] = vals['AWS_LOCATION'].strip('/')
    return vals


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('folders', nargs='+')
    ap.add_argument('--apply', action='store_true', help='Upload. Without it, only check and show the plan.')
    ap.add_argument('--env-file', help='Read store settings not in the environment from this file (e.g. .envprod).')
    args = ap.parse_args()

    folders = packages.find_packages(args.folders)
    if not folders:
        sys.exit('No packages found (a package is a folder with draft.json).')
    drafts, problems, warnings = packages.check(folders)
    for w in warnings:
        print(f'  note: {w}')
    if problems:
        for p in problems:
            print(f'  problem: {p}')
        sys.exit(f'{len(problems)} problem(s); nothing uploaded. Fix the packages and run again.')

    env = settings(args.env_file)
    now = dt.datetime.now(dt.timezone.utc)
    manifest, uploads = packages.build_manifest(drafts, location=env['AWS_LOCATION'], made_at=now.isoformat(timespec='seconds'))
    mkey = packages.manifest_key(now.strftime('%Y%m%dT%H%M%SZ'))
    full = (lambda k: f'{env["AWS_LOCATION"]}/{k}' if env['AWS_LOCATION'] else k)

    for d in manifest['drafts']:
        print(f'{d["slug"]} ({d["kind"]}, #{d["dash_update"]}): {d["name"]!r}, {len(d["versions"])} version(s)')
    total = sum(p.stat().st_size for _, p, _ in uploads)
    print(f'{len(manifest["drafts"])} package(s), {len(uploads)} file(s), {total / 1048576:.1f} MB; '
          f'store folder {"(bucket root)" if not env["AWS_LOCATION"] else repr(env["AWS_LOCATION"])}')
    if not args.apply:
        print('Dry run: nothing uploaded. Add --apply to upload and write the manifest.')
        return 0

    import boto3
    from botocore.exceptions import ClientError
    s3 = boto3.client(
        's3', aws_access_key_id=env['AWS_ACCESS_KEY_ID'], aws_secret_access_key=env['AWS_SECRET_ACCESS_KEY'],
        region_name=env['AWS_S3_REGION_NAME'],
    )
    bucket = env['AWS_STORAGE_BUCKET_NAME']
    sent = skipped = 0
    for key, path, ctype in uploads:
        try:
            head = s3.head_object(Bucket=bucket, Key=full(key))
            if head.get('ContentLength') == path.stat().st_size:
                skipped += 1
                continue
        except ClientError:
            pass
        s3.upload_file(str(path), bucket, full(key), ExtraArgs={'ContentType': ctype})
        sent += 1
    body = json.dumps(manifest, indent=2).encode('utf-8')
    s3.put_object(Bucket=bucket, Key=full(mkey), Body=body, ContentType='application/json')
    local = ROOT / 'workspace' / 'signage' / 'manifests' / Path(mkey).name
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_bytes(body)
    print(f'Uploaded {sent} file(s), {skipped} already there. Manifest: {mkey}')
    print(f'Copy: {local.relative_to(ROOT)}')
    print(f'Next: python manage.py load_sign_drafts --manifest-key {mkey}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
