"""PyInstaller build script — produces a single-file .exe for the print server."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from config import VERSION

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


def write_version_metadata() -> Path:
    """Create PyInstaller Windows version metadata from the release version."""
    parts = [int(part) for part in VERSION.split(".")]
    if len(parts) > 4:
        raise ValueError(f"VERSION has too many components: {VERSION}")
    version_tuple = tuple((parts + [0] * 4)[:4])
    metadata_path = ROOT / "build" / "version_info.txt"
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(
        f"""VSVersionInfo(
  ffi=FixedFileInfo(
    filevers={version_tuple},
    prodvers={version_tuple},
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0),
  ),
  kids=[
    StringFileInfo([
      StringTable(
        '040904B0',
        [
          StringStruct('CompanyName', 'Eco-Thrift'),
          StringStruct('FileDescription', 'Eco-Thrift Print Server'),
          StringStruct('FileVersion', '{VERSION}'),
          StringStruct('InternalName', 'ecothrift-printserver'),
          StringStruct('OriginalFilename', '{EXE_NAME}'),
          StringStruct('ProductName', 'Eco-Thrift Print Server'),
          StringStruct('ProductVersion', '{VERSION}'),
        ],
      ),
    ]),
    VarFileInfo([VarStruct('Translation', [1033, 1200])]),
  ],
)""",
        encoding="utf-8",
    )
    return metadata_path


def build() -> None:
    kill_running_server()
    logo = ROOT / "assets" / "ecothrift_logo_bw.png"
    version_metadata = write_version_metadata()
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--onefile",
        "--noconsole",
        "--name",
        "ecothrift-printserver",
        "--version-file",
        str(version_metadata),
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
        "--hidden-import",
        "label_test_data",
        "--hidden-import",
        "fitz",
    ]
    if logo.exists():
        # Windows: source;dest inside bundle (extracted to _MEIPASS/assets/)
        cmd.extend(["--add-data", f"{logo};assets"])
    cmd.extend([
        "--paths",
        str(ROOT),
        "--distpath",
        str(ROOT / "dist"),
        "--workpath",
        str(ROOT / "build"),
        "--specpath",
        str(ROOT),
        str(ROOT / "main.py"),
    ])
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
