#!/usr/bin/env python3
"""
Push key=value pairs from a local .env file to Heroku config.

Safety defaults (never synced unless you pass the matching override flag):
  - Local PostgreSQL split vars (DATABASE_* / PROD_DATABASE_*) — Heroku uses DATABASE_URL
  - SECRET_KEY — production must keep its own key unless --allow-secret-key
  - DATABASE_URL in .env — often a local tunnel; skipped unless --allow-database-url

Usage (from repo root, venv active):
  python scripts/deploy/sync_env_to_heroku.py --dry-run
  python scripts/deploy/sync_env_to_heroku.py --apply
  python scripts/deploy/sync_env_to_heroku.py --apply --force-production

  python scripts/deploy/sync_env_to_heroku.py --apply --allow-secret-key   # rare; usually never

Requires: Heroku CLI logged in (`heroku login`).
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


# Keys that must not leave local dev machine → Heroku without explicit opt-in.
DEFAULT_SKIP = frozenset(
    {
        "DATABASE_NAME",
        "DATABASE_USER",
        "DATABASE_PASSWORD",
        "DATABASE_HOST",
        "DATABASE_PORT",
        "PROD_DATABASE_NAME",
        "PROD_DATABASE_HOST",
        "PROD_DATABASE_PORT",
        "PROD_DATABASE_USER",
        "PROD_DATABASE_PASSWORD",
        "SECRET_KEY",
        "DATABASE_URL",
    }
)


def parse_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    raw = path.read_text(encoding="utf-8", errors="replace")
    for line in raw.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if s.startswith("export "):
            s = s[7:].strip()
        if "=" not in s:
            continue
        key, _, val = s.partition("=")
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        out[key] = val
    return out


def build_heroku_pairs(
    env: dict[str, str],
    *,
    skip: frozenset[str],
    allow_secret_key: bool,
    allow_database_url: bool,
    force_production: bool,
) -> tuple[list[tuple[str, str]], list[str]]:
    """Returns (pairs_to_set, skip_reasons)."""
    reasons: list[str] = []
    pairs: list[tuple[str, str]] = []
    skip_effective = set(skip)
    if allow_secret_key:
        skip_effective.discard("SECRET_KEY")
    if allow_database_url:
        skip_effective.discard("DATABASE_URL")

    for k, v in sorted(env.items()):
        if k in skip_effective:
            reasons.append(f"skip (safety): {k}")
            continue
        pairs.append((k, v))

    if force_production:
        merged = dict(pairs)
        merged["ENVIRONMENT"] = "production"
        merged["DEBUG"] = "False"
        pairs = sorted(merged.items(), key=lambda x: x[0])
        reasons.append("note: --force-production set ENVIRONMENT=production DEBUG=False")

    return pairs, reasons


def run_heroku_config_set(
    app: str,
    pairs: list[tuple[str, str]],
    *,
    dry_run: bool,
    verbose_dry_run: bool,
) -> int:
    if not pairs:
        print("Nothing to set (all keys skipped or empty .env).", file=sys.stderr)
        return 0

    # Heroku accepts multiple KEY=value in one invocation; batch to avoid command-line limits.
    batch_size = 25
    for i in range(0, len(pairs), batch_size):
        chunk = pairs[i : i + batch_size]
        args = ["heroku", "config:set"]
        for k, v in chunk:
            # heroku CLI: value is part of KEY=value; avoid newlines in key
            if "\n" in v or "\r" in v:
                print(f"Refusing: value for {k} contains newline; set manually.", file=sys.stderr)
                return 1
            args.append(f"{k}={v}")
        args.extend(["-a", app])

        if dry_run:
            keys = [k for k, _ in chunk]
            print(
                f"DRY-RUN batch: heroku config:set ({len(chunk)} keys) "
                f"{', '.join(keys)} … -a {app}"
            )
            if verbose_dry_run:
                print("  " + subprocess.list2cmdline(args), file=sys.stderr)
            continue

        r = subprocess.run(args, check=False)
        if r.returncode != 0:
            return r.returncode
    return 0


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    default_env = repo_root / ".env"

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--env-file",
        type=Path,
        default=default_env,
        help=f"Path to .env (default: {default_env})",
    )
    p.add_argument("-a", "--app", default="ecothrift-dashboard", help="Heroku app name")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print heroku commands only (default if neither --dry-run nor --apply)",
    )
    p.add_argument(
        "--apply",
        action="store_true",
        help="Actually run heroku config:set",
    )
    p.add_argument(
        "--allow-secret-key",
        action="store_true",
        help="Include SECRET_KEY from .env (overwrites Heroku SECRET_KEY — usually a bad idea)",
    )
    p.add_argument(
        "--allow-database-url",
        action="store_true",
        help="Include DATABASE_URL from .env (overwrites Heroku Postgres URL — almost always wrong)",
    )
    p.add_argument(
        "--force-production",
        action="store_true",
        help="After building pairs, force ENVIRONMENT=production and DEBUG=False",
    )
    p.add_argument(
        "--verbose-dry-run",
        action="store_true",
        help="With --dry-run, also print full heroku argv to stderr (leaks secrets — avoid in screen shares)",
    )
    p.add_argument(
        "--extra-skip",
        action="append",
        default=[],
        metavar="KEY",
        help="Additional env key to skip (repeatable)",
    )
    args = p.parse_args()

    if not args.apply and not args.dry_run:
        args.dry_run = True

    env_path: Path = args.env_file
    if not env_path.is_file():
        print(f"Missing file: {env_path}", file=sys.stderr)
        return 1

    env_map = parse_env_file(env_path)
    skip = DEFAULT_SKIP | frozenset(args.extra_skip)

    pairs, reasons = build_heroku_pairs(
        env_map,
        skip=skip,
        allow_secret_key=args.allow_secret_key,
        allow_database_url=args.allow_database_url,
        force_production=args.force_production,
    )

    print(f"Source: {env_path}")
    print(f"Heroku app: {args.app}")
    print(f"Keys in .env: {len(env_map)}")
    print(f"Keys to push: {len(pairs)}")
    for line in reasons:
        print(f"  ({line})")
    print()

    for k, v in pairs:
        if k == "ALLOWED_HOSTS" and "localhost" in v and "dash.ecothrift" not in v:
            print(
                "WARNING: ALLOWED_HOSTS looks local-only (contains localhost). "
                "Heroku needs your real hostname (e.g. dash.ecothrift.us). "
                "Use --extra-skip ALLOWED_HOSTS or fix .env before --apply.\n"
            )
            break

    if args.dry_run and not args.apply:
        print("Mode: DRY-RUN (no changes). Pass --apply to run heroku config:set.\n")

    rc = run_heroku_config_set(
        args.app,
        pairs,
        dry_run=args.dry_run or not args.apply,
        verbose_dry_run=args.verbose_dry_run,
    )
    if rc != 0:
        return rc

    if args.dry_run or not args.apply:
        print("\nDone (dry-run).")
    else:
        print("\nDone. Verify: heroku config -a", args.app)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
