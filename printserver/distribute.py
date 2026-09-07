"""
Eco-Thrift Print Server — Distribution Script
Run from repo or printserver/. Each step is skip-if-done.

  python printserver/distribute.py --install-local
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
MANAGE = PROJECT / "manage.py"
SETUP_EXE_NAME = "ecothrift-printserver-setup.exe"
SETUP_EXE_PATH = ROOT / "dist" / SETUP_EXE_NAME
SERVER_EXE_NAME = "ecothrift-printserver.exe"
SERVER_EXE_PATH = ROOT / "dist" / SERVER_EXE_NAME
INSTALL_EXE = (
    Path(os.environ.get("LOCALAPPDATA", "")) / "EcoThrift" / "PrintServer" / SERVER_EXE_NAME
)
HEALTH_URL = "http://127.0.0.1:8888/health"

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
    cfg = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(cfg)  # type: ignore[union-attr]
    return cfg


def _run(cmd: list[str], cwd: Path) -> None:
    result = subprocess.run(cmd, cwd=cwd)
    if result.returncode != 0:
        print(f"\n  FAILED: {' '.join(cmd)}", file=sys.stderr)
        sys.exit(1)


def _norm_ver(v: str | None) -> str | None:
    if not v:
        return None
    v = v.strip()
    parts = v.split(".")
    while len(parts) > 3 and parts[-1] == "0":
        parts.pop()
    return ".".join(parts) or None


def _exe_file_version(path: Path) -> str | None:
    if not path.exists():
        return None
    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            f"(Get-Item -LiteralPath '{path}').VersionInfo.FileVersion",
        ],
        capture_output=True,
        text=True,
    )
    return _norm_ver((result.stdout or "").strip() or None)


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
    lines = [
        l.strip() for l in result.stdout.splitlines()
        if l.strip() and "imported" not in l and "use -v" not in l
    ]
    v = lines[-1] if lines else ""
    return v or None


def get_local_health_version() -> str | None:
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return _norm_ver(str(data.get("version") or "") or None)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None


def _s3_client(env: dict[str, str]):
    try:
        import boto3  # type: ignore[import-untyped]
    except ImportError:
        print("  ERROR: boto3 not installed — run: pip install boto3", file=sys.stderr)
        sys.exit(1)
    return boto3.client(
        "s3",
        region_name=env.get("AWS_S3_REGION_NAME", "us-east-1"),
        aws_access_key_id=env.get("AWS_ACCESS_KEY_ID", ""),
        aws_secret_access_key=env.get("AWS_SECRET_ACCESS_KEY", ""),
    )


def s3_object_exists(env: dict[str, str], s3_key: str) -> bool:
    from botocore.exceptions import ClientError  # type: ignore[import-untyped]

    client = _s3_client(env)
    bucket = env.get("AWS_STORAGE_BUCKET_NAME", "")
    try:
        client.head_object(Bucket=bucket, Key=s3_key)
        return True
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in ("404", "NoSuchKey", "NotFound"):
            return False
        raise


def build_exes() -> None:
    print("  Building exes...")
    _run([sys.executable, str(ROOT / "build.py")], cwd=ROOT)
    print(f"  Server : {SERVER_EXE_PATH}  ({SERVER_EXE_PATH.stat().st_size / 1024 / 1024:.1f} MB)")
    print(f"  Setup  : {SETUP_EXE_PATH}  ({SETUP_EXE_PATH.stat().st_size / 1024 / 1024:.1f} MB)")


def upload_to_s3(env: dict[str, str], version: str) -> str:
    bucket = env.get("AWS_STORAGE_BUCKET_NAME", "")
    s3_key = f"print-server/ecothrift-printserver-setup-v{version}.exe"
    print(f"  Uploading to s3://{bucket}/{s3_key} ...")
    _s3_client(env).upload_file(
        str(EXE_PATH), bucket, s3_key,
        ExtraArgs={"ContentType": "application/octet-stream"},
    )
    print("  Uploaded.")
    return s3_key


def register_release(version: str, s3_key: str, release_notes: str) -> None:
    print("  Registering release in local database...")
    _run(
        [
            sys.executable, str(MANAGE), "publish_printserver",
            "--ps-version", version,
            "--s3-key", s3_key,
            "--filename", EXE_NAME,
            "--size", str(EXE_PATH.stat().st_size),
            "--release-notes", release_notes,
        ],
        cwd=PROJECT,
    )


def wait_health(version: str, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if get_local_health_version() == version:
            return True
        time.sleep(1)
    return False


def install_local(version: str) -> None:
    health = get_local_health_version()
    installed = _exe_file_version(INSTALL_EXE)
    if health == version:
        print(f"  Local already running v{version} — skip install.")
        return
    print(f"  Local health={health or 'offline'}  installed exe={installed or 'missing'}")
    print("  Installing locally (stops port 8888 + frozen exe, copies, starts)...")
    _run(
        [sys.executable, str(ROOT / "installer" / "setup.py"), "--install"],
        cwd=ROOT,
    )
    if wait_health(version):
        print(f"  Local health is v{version}.")
        return
    print(f"  ERROR: local /health is not v{version} after install.", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build, upload, register, optionally install.")
    parser.add_argument("--force-build", action="store_true")
    parser.add_argument("--force-upload", action="store_true")
    parser.add_argument(
        "--install-local",
        action="store_true",
        help="Stop local instances and install this VERSION if /health is not already it.",
    )
    parser.add_argument("--no-install-local", action="store_true")
    args = parser.parse_args()
    do_install = args.install_local and not args.no_install_local

    print("=" * 50)
    print("  Eco-Thrift Print Server — Distribute")
    print("=" * 50)

    cfg = _load_config()
    version = cfg.VERSION
    release_notes = getattr(cfg, "RELEASE_NOTES", f"Release v{version}")
    s3_key = f"print-server/ecothrift-printserver-setup-v{version}.exe"

    print(f"\n  Version : {version}")
    print(f"  Notes   : {release_notes}")

    current = get_current_version()
    dist_ver = _exe_file_version(SERVER_EXE_PATH)
    health = get_local_health_version()
    print(f"  Local DB current : {current or '(none)'}")
    print(f"  Dist exe version : {dist_ver or '(missing)'}")
    print(f"  Local /health    : {health or 'offline'}")

    env = _load_env()
    has_aws = all([
        env.get("AWS_STORAGE_BUCKET_NAME"),
        env.get("AWS_ACCESS_KEY_ID"),
        env.get("AWS_SECRET_ACCESS_KEY"),
    ])

    need_build = (
        args.force_build
        or dist_ver != version
        or not SETUP_EXE_PATH.exists()
    )
    s3_exists = False
    if has_aws:
        s3_exists = s3_object_exists(env, s3_key)
        print(f"  S3 object        : {'yes' if s3_exists else 'no'}  ({s3_key})")
    else:
        print("  S3 object        : unknown (missing AWS credentials in .env)")

    need_upload = args.force_upload or not s3_exists
    need_register = current != version

    if need_upload and not has_aws:
        print("\n  STOP: Missing AWS credentials in .env", file=sys.stderr)
        sys.exit(1)

    print()
    if need_build:
        build_exes()
    else:
        print(f"  Skip build — dist exe is already v{version}.")

    if need_upload:
        upload_to_s3(env, version)
    else:
        print(f"  Skip upload — s3://…/{s3_key} already exists.")

    if need_register or need_upload:
        if not EXE_PATH.exists():
            print(f"  ERROR: setup exe missing at {EXE_PATH}", file=sys.stderr)
            sys.exit(1)
        register_release(version, s3_key, release_notes)
    else:
        print(f"  Skip register — local PrintServerRelease current is already v{version}.")

    if do_install:
        install_local(version)
    else:
        print("  Skip local install (pass --install-local).")

    print()
    print("=" * 50)
    print(f"  Done. v{version} — Settings download is this release on the local DB.")
    print("=" * 50)


if __name__ == "__main__":
    main()
