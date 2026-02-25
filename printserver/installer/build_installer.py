"""Build the Windows installer exe via PyInstaller."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent        # installer/
PRINTSERVER = ROOT.parent                     # printserver/


def build() -> None:
    subprocess.run(["taskkill", "/F", "/IM", "ecothrift-printserver-setup.exe"],
                   capture_output=True)

    server_exe = PRINTSERVER / "dist" / "ecothrift-printserver.exe"
    if not server_exe.exists():
        raise FileNotFoundError(
            f"Server exe not found at {server_exe}\n"
            "Build the server first: python build.py --server-only"
        )

    # Embed the server exe inside setup.exe so users only need one download.
    add_data = f"{server_exe};."

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--onefile",
        "--noconsole",
        "--name",
        "ecothrift-printserver-setup",
        "--add-data", add_data,
        "--hidden-import",
        "winreg",
        "--hidden-import",
        "tkinter",
        "--hidden-import",
        "tkinter.ttk",
        "--hidden-import",
        "tkinter.messagebox",
        "--paths",
        str(PRINTSERVER),
        "--distpath",
        str(PRINTSERVER / "dist"),
        "--workpath",
        str(ROOT / "build"),
        "--specpath",
        str(ROOT),
        str(ROOT / "setup.py"),
    ]
    print(f"Running: {' '.join(cmd)}")
    subprocess.check_call(cmd)
    exe = PRINTSERVER / "dist" / "ecothrift-printserver-setup.exe"
    print(f"\nBuild complete: {exe}  ({exe.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    build()
