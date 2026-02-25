"""
Eco-Thrift Print Server — Distribution Script
Run distribute.bat to build and publish a new release.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
MANAGE = PROJECT / "manage.py"
# Users download the setup exe — it is self-contained (server exe bundled inside).
SETUP_EXE_NAME = "ecothrift-printserver-setup.exe"
SETUP_EXE_PATH = ROOT / "dist" / SETUP_EXE_NAME
# Server exe is still built; it gets embedded into setup.exe by build_installer.py
SERVER_EXE_NAME = "ecothrift-printserver.exe"
SERVER_EXE_PATH = ROOT / "dist" / SERVER_EXE_NAME

# Alias used by register_release / size reporting
EXE_NAME = SETUP_EXE_NAME
EXE_PATH = SETUP_EXE_PATH


def _load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (PROJECT / ".env").read_text("utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


def _load_config():
    spec = importlib.util.spec_from_file_location("config", ROOT / "config.py")
    cfg = importlib.util.module_from_spec(spec)    # type: ignore[arg-type]
    spec.loader.exec_module(cfg)                   # type: ignore[union-attr]
    return cfg


def _run(cmd: list[str], cwd: Path) -> None:
    result = subprocess.run(cmd, cwd=cwd)
    if result.returncode != 0:
        print(f"\n  FAILED: {' '.join(cmd)}", file=sys.stderr)
        sys.exit(1)


def get_current_version() -> str | None:
    script = (
        "from apps.core.models import PrintServerRelease; "
        "r = PrintServerRelease.objects.filter(is_current=True).first(); "
        "print(r.version if r else '')"
    )
    result = subprocess.run(
        [sys.executable, str(MANAGE), "shell", "-c", script],
        cwd=PROJECT, capture_output=True, text=True,
    )
    # Django shell can print noise like "46 objects imported automatically" before our output.
    # Take the last non-empty, non-noise line as the actual version.
    lines = [
        l.strip() for l in result.stdout.splitlines()
        if l.strip() and "imported" not in l and "use -v" not in l
    ]
    v = lines[-1] if lines else ""
    return v or None


def build_exes() -> None:
    print("  Building exes...")
    _run([sys.executable, str(ROOT / "build.py")], cwd=ROOT)
    print(f"  Server : {SERVER_EXE_PATH}  ({SERVER_EXE_PATH.stat().st_size / 1024 / 1024:.1f} MB)")
    print(f"  Setup  : {SETUP_EXE_PATH}  ({SETUP_EXE_PATH.stat().st_size / 1024 / 1024:.1f} MB)")


def upload_to_s3(env: dict[str, str], version: str) -> str:
    try:
        import boto3  # type: ignore[import-untyped]
    except ImportError:
        print("  ERROR: boto3 not installed — run: pip install boto3", file=sys.stderr)
        sys.exit(1)

    bucket  = env.get("AWS_STORAGE_BUCKET_NAME", "")
    region  = env.get("AWS_S3_REGION_NAME", "us-east-1")
    key_id  = env.get("AWS_ACCESS_KEY_ID", "")
    secret  = env.get("AWS_SECRET_ACCESS_KEY", "")

    if not all([bucket, key_id, secret]):
        print("  ERROR: Missing AWS credentials in .env", file=sys.stderr)
        sys.exit(1)

    s3_key = f"print-server/ecothrift-printserver-setup-v{version}.exe"
    print(f"  Uploading to s3://{bucket}/{s3_key} ...")
    boto3.client(
        "s3", region_name=region,
        aws_access_key_id=key_id, aws_secret_access_key=secret,
    ).upload_file(
        str(EXE_PATH), bucket, s3_key,
        ExtraArgs={"ContentType": "application/octet-stream"},
    )
    print("  Uploaded.")
    return s3_key


def register_release(version: str, s3_key: str, release_notes: str) -> None:
    print("  Registering release in database...")
    _run(
        [
            sys.executable, str(MANAGE), "publish_printserver",
            "--ps-version", version,
            "--s3-key",     s3_key,
            "--filename",   EXE_NAME,
            "--size",       str(EXE_PATH.stat().st_size),
            "--release-notes", release_notes,
        ],
        cwd=PROJECT,
    )


def main() -> None:
    print("=" * 50)
    print("  Eco-Thrift Print Server — Distribute")
    print("=" * 50)

    # --- Fast-fail checks (before any building or uploading) ---
    cfg = _load_config()
    version       = cfg.VERSION
    release_notes = getattr(cfg, "RELEASE_NOTES", f"Release v{version}")

    print(f"\n  Version : {version}")
    print(f"  Notes   : {release_notes}")

    current = get_current_version()
    if current == version:
        print(f"\n  STOP: v{version} is already the current release.")
        print("  Update VERSION and RELEASE_NOTES in config.py, then re-run.")
        sys.exit(1)
    if current:
        print(f"  Replacing: v{current}  →  v{version}")

    env = _load_env()
    if not all([env.get("AWS_STORAGE_BUCKET_NAME"), env.get("AWS_ACCESS_KEY_ID"), env.get("AWS_SECRET_ACCESS_KEY")]):
        print("\n  STOP: Missing AWS credentials in .env", file=sys.stderr)
        sys.exit(1)

    print()
    # --- All clear — build, upload, register ---
    build_exes()
    s3_key = upload_to_s3(env, version)
    register_release(version, s3_key, release_notes)

    print()
    print("=" * 50)
    print(f"  Done. v{version} is live on the settings page.")
    print("=" * 50)


if __name__ == "__main__":
    main()
