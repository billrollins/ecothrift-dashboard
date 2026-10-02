#!/usr/bin/env python3
"""House env sync: repo-root .envprod <-> Heroku Config Vars.

Vendored from C:\\Coding\\.ai\\packages\\env-sync — do not edit here; send changes to master
via .ai/reference/to-master/. Standard: C:\\Coding\\.ai\\standards\\scripts-and-env.md.

Commands (run from anywhere; the repo root is two levels up from this file):
  pull   Heroku -> .envprod (the production mirror). Never touches .env.
  diff   Key NAMES only: .envprod vs Heroku, and .env vs .envprod.
  push   .envprod -> Heroku: only changed/added keys, one release. A real push needs
         --confirm <app name>; the tool never waits for typed input.
         Never unsets a key unless named with --unset. Never writes DATABASE_URL.

Values are never printed. Python standard library only.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

VERSION = "1.1.0"
API = "https://api.heroku.com"

# Heroku manages these (add-on attachments, dyno metadata). Never pulled into .envprod, never pushed.
MANAGED_EXACT = {
    "DATABASE_URL", "HEROKU_APP_ID", "HEROKU_APP_NAME", "HEROKU_DYNO_ID",
    "HEROKU_RELEASE_CREATED_AT", "HEROKU_RELEASE_VERSION", "HEROKU_SLUG_COMMIT", "HEROKU_SLUG_DESCRIPTION",
}
MANAGED_PREFIX = ("HEROKU_POSTGRESQL_",)
# Local-only keys: belong in .env, never on Heroku.
LOCAL_ONLY_EXACT = {"DATABASE_NAME", "DATABASE_USER", "DATABASE_PASSWORD", "DATABASE_HOST", "DATABASE_PORT"}
LOCAL_ONLY_PREFIX = ("PROD_DATABASE_", "LOCAL_")

HERE = Path(__file__).resolve()
ROOT = HERE.parents[2]  # scripts/env/env_sync.py -> repo root
CONFIG = HERE.parent / "env_sync.json"


# ---------------------------------------------------------------- files

def parse_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        out[key] = value
    return out


def _quote(value: str) -> str:
    needs = value != value.strip() or "#" in value or (value[:1] in "\"'")
    if not needs:
        return value
    return f'"{value}"' if '"' not in value else f"'{value}'"


def write_envprod(path: Path, app: str, pairs: dict[str, str]) -> None:
    stamp = _dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "# .envprod - production mirror of Heroku Config Vars (gitignored).",
        f"# App: {app} - pulled {stamp} by scripts/env/env_sync.py pull (v{VERSION}).",
        "# Edit here only to prepare a push: scripts\\env\\push.bat. Heroku is the source of truth.",
        "",
    ]
    lines += [f"{k}={_quote(pairs[k])}" for k in sorted(pairs)]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- config / heroku

def load_config() -> dict:
    if not CONFIG.is_file():
        sys.exit(f"ERROR: {CONFIG} not found. It holds {{\"app\": \"<heroku app>\"}}.")
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    if not cfg.get("app"):
        sys.exit(f"ERROR: {CONFIG} has no \"app\".")
    cfg.setdefault("local_only", [])
    cfg.setdefault("managed", [])
    return cfg


def is_managed(key: str, cfg: dict) -> bool:
    return key in MANAGED_EXACT or key.startswith(MANAGED_PREFIX) or key in cfg["managed"]


def is_local_only(key: str, cfg: dict) -> bool:
    return key in LOCAL_ONLY_EXACT or key.startswith(LOCAL_ONLY_PREFIX) or key in cfg["local_only"]


def heroku_token() -> str:
    cli = None
    for name in ("heroku.cmd", "heroku.exe", "heroku"):
        cli = shutil.which(name)
        if cli:
            break
    if not cli:
        sys.exit("ERROR: Heroku CLI not found on PATH.")
    res = subprocess.run([cli, "auth:token"], capture_output=True, text=True)
    token = (res.stdout or "").strip().splitlines()[-1:] or [""]
    if res.returncode != 0 or not token[0]:
        sys.exit("ERROR: not logged in to the Heroku CLI. Run: heroku login")
    return token[0]


def api(method: str, path: str, token: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        "Accept": "application/vnd.heroku+json; version=3",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": f"house-env-sync/{VERSION}",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        sys.exit(f"ERROR: Heroku API {method} {path} -> {exc.code}: {detail}")


def fetch_remote(app: str, token: str) -> dict[str, str]:
    raw = api("GET", f"/apps/{app}/config-vars", token)
    return {k: ("" if v is None else str(v)) for k, v in raw.items()}


def names(title: str, keys) -> None:
    keys = sorted(keys)
    if keys:
        print(f"  {title} ({len(keys)}): " + ", ".join(keys))


# ---------------------------------------------------------------- commands

def cmd_pull(args, cfg) -> int:
    token = heroku_token()
    remote = fetch_remote(cfg["app"], token)
    pairs = {k: v for k, v in remote.items() if not is_managed(k, cfg) and v != ""}
    old = parse_env(ROOT / ".envprod")
    print(f"Heroku {cfg['app']}: {len(remote)} vars; {len(pairs)} go to .envprod "
          f"({len(remote) - len(pairs)} Heroku-managed or empty, left out).")
    names("new vs your .envprod", set(pairs) - set(old))
    names("gone from Heroku", set(old) - set(pairs))
    names("changed", {k for k in pairs if k in old and old[k] != pairs[k]})
    if args.dry_run:
        print("Dry run - nothing written.")
        return 0
    write_envprod(ROOT / ".envprod", cfg["app"], pairs)
    print(f"Wrote {ROOT / '.envprod'}. Your .env was not touched.")
    return 0


def cmd_diff(args, cfg) -> int:
    local = parse_env(ROOT / ".envprod")
    dev = parse_env(ROOT / ".env")
    token = heroku_token()
    remote = {k: v for k, v in fetch_remote(cfg["app"], token).items() if not is_managed(k, cfg)}
    print(f".envprod vs Heroku {cfg['app']} (names only):")
    names("only in .envprod (a push would add)", set(local) - set(remote))
    names("only on Heroku (pull, or unset on purpose)", set(remote) - set(local))
    names("different values", {k for k in local if k in remote and local[k] != remote[k]})
    if set(local) == set(remote) and all(local[k] == remote[k] for k in local):
        print("  in sync.")
    print(".env vs .envprod key names (local-only and Heroku-managed keys ignored):")
    dev_k = {k for k in dev if not is_local_only(k, cfg) and not is_managed(k, cfg)}
    prod_k = {k for k in local if not is_local_only(k, cfg)}
    names("in .env only (missing in prod?)", dev_k - prod_k)
    names("in .envprod only (missing locally?)", prod_k - dev_k)
    if dev_k == prod_k:
        print("  same names.")
    return 0


def prod_problems(pairs: dict[str, str]) -> list[str]:
    out = []
    if pairs.get("DEBUG", "").lower() in ("true", "1", "yes"):
        out.append("DEBUG is on")
    if any(h in pairs.get("ALLOWED_HOSTS", "") for h in ("localhost", "127.0.0.1", "testserver")):
        out.append("ALLOWED_HOSTS has local hosts")
    env = pairs.get("ENVIRONMENT", "prod").lower()
    if env not in ("prod", "production"):
        out.append(f"ENVIRONMENT is '{env}', not prod")
    return out


def cmd_push(args, cfg) -> int:
    path = ROOT / ".envprod"
    if not path.is_file():
        sys.exit("ERROR: no .envprod. Run pull first; edit it; then push.")
    local = parse_env(path)
    skipped = sorted(k for k in local if is_managed(k, cfg) or is_local_only(k, cfg))
    pairs = {k: v for k, v in local.items() if k not in skipped and v != ""}
    problems = prod_problems(pairs)
    if problems:
        sys.exit("ERROR: .envprod has dev values - " + "; ".join(problems))

    token = heroku_token()
    remote = fetch_remote(cfg["app"], token)
    to_set = {k: v for k, v in pairs.items() if remote.get(k) != v}
    unset = [k.strip() for k in (args.unset or "").split(",") if k.strip()]
    bad = [k for k in unset if is_managed(k, cfg)]
    if bad:
        sys.exit("ERROR: refusing to unset Heroku-managed keys: " + ", ".join(bad))
    orphans = {k for k in remote if k not in pairs and not is_managed(k, cfg)} - set(unset)

    print(f"Push .envprod -> Heroku {cfg['app']} (names only):")
    names("add", {k for k in to_set if k not in remote})
    names("change", {k for k in to_set if k in remote})
    names("unset (you asked)", unset)
    names("skipped (Heroku-managed / local-only)", skipped)
    names("on Heroku, not in .envprod - left alone", orphans)
    if not to_set and not unset:
        print("Nothing to push - Heroku already matches .envprod.")
        return 0
    if args.dry_run:
        print("Dry run - nothing pushed.")
        return 0
    if args.confirm != cfg["app"]:
        print(f"Nothing pushed. A real push is ONE release (restarts the dynos once): run again with --confirm {cfg['app']}")
        return 1
    body: dict = dict(to_set)
    body.update({k: None for k in unset})
    api("PATCH", f"/apps/{cfg['app']}/config-vars", token, body)
    print(f"Done: {len(to_set)} set, {len(unset)} unset on {cfg['app']}. Run pull to refresh .envprod.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=f"House env sync v{VERSION}: .envprod <-> Heroku")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("pull", help="Heroku -> .envprod")
    p.add_argument("--dry-run", action="store_true")
    sub.add_parser("diff", help="names only: .envprod vs Heroku, .env vs .envprod")
    p = sub.add_parser("push", help=".envprod -> Heroku (changed keys only)")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--unset", help="comma-separated keys to remove from Heroku")
    p.add_argument("--confirm", metavar="APP", help="the Heroku app name; required for a real push")
    args = ap.parse_args()
    cfg = load_config()
    return {"pull": cmd_pull, "diff": cmd_diff, "push": cmd_push}[args.cmd](args, cfg)


if __name__ == "__main__":
    raise SystemExit(main())
