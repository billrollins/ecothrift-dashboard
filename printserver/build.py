"""PyInstaller build script — produces a single-file .exe for the print server."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXE_NAME = "ecothrift-printserver.exe"


def kill_running_server() -> None:
    """Kill any running instance of the print server so the exe isn't locked."""
    result = subprocess.run(
        ["taskkill", "/F", "/IM", EXE_NAME],
        capture_output=True, text=True,
    )
    if "SUCCESS" in result.stdout:
        print(f"  Stopped running {EXE_NAME} (was locked).")


def build() -> None:
    kill_running_server()
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--onefile",
        "--noconsole",
        "--name",
        "ecothrift-printserver",
        # PyInstaller discovers config, routers.*, services.* via import analysis.
        # These hidden imports cover libraries that use dynamic/lazy loading.
        "--hidden-import",
        "win32print",
        "--hidden-import",
        "win32api",
        "--hidden-import",
        "uvicorn.logging",
        "--hidden-import",
        "uvicorn.protocols.http.auto",
        "--hidden-import",
        "uvicorn.protocols.http.h11_impl",
        "--hidden-import",
        "uvicorn.protocols.websockets.auto",
        "--hidden-import",
        "uvicorn.lifespan.on",
        "--hidden-import",
        "uvicorn.lifespan.off",
        "--paths",
        str(ROOT),
        "--distpath",
        str(ROOT / "dist"),
        "--workpath",
        str(ROOT / "build"),
        "--specpath",
        str(ROOT),
        str(ROOT / "main.py"),
    ]
    print(f"Running: {' '.join(cmd)}")
    subprocess.check_call(cmd)
    exe = ROOT / "dist" / "ecothrift-printserver.exe"
    print(f"\nBuild complete: {exe}  ({exe.stat().st_size / 1024 / 1024:.1f} MB)")


def build_installer() -> None:
    """Build the setup.exe installer."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "build_installer", ROOT / "installer" / "build_installer.py"
    )
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    mod.build()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--server-only", action="store_true",
                        help="Build only the server exe, skip the installer")
    args = parser.parse_args()

    build()
    if not args.server_only:
        print("\n")
        build_installer()
