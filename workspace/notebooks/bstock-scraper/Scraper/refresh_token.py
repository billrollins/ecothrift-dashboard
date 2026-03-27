"""Experimental refresh-token helper (run as module from notebooks dir)."""

from __future__ import annotations

import sys
from pathlib import Path

import requests

PACKAGE_DIR = Path(__file__).resolve().parent
if str(PACKAGE_DIR) not in sys.path:
    sys.path.insert(0, str(PACKAGE_DIR))

try:
    import bstock_config_local as cfg
except ImportError:
    print(
        "Copy Scraper/config.example.py to Scraper/bstock_config_local.py "
        "and set REFRESH_TOKEN."
    )
    sys.exit(1)

REFRESH_TOKEN = (getattr(cfg, "REFRESH_TOKEN", None) or "").strip()

REFRESH_URLS = [
    "https://bstock.com/api/auth/refresh",
    "https://bstock.com/api/token/refresh",
    "https://auth.bstock.com/oauth/token",
]


def try_refresh(refresh_token: str) -> str | None:
    for url in REFRESH_URLS:
        try:
            resp = requests.post(
                url,
                json={
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                new_token = (
                    data.get("access_token")
                    or data.get("token")
                    or data.get("accessToken")
                )
                if new_token:
                    print(f"[OK] New token from {url}")
                    print(f"First 50 chars: {new_token[:50]}...")
                    return str(new_token)
        except requests.RequestException:
            continue
    print("[FAILED] No refresh URL succeeded. Re-capture token via DevTools.")
    return None


def main() -> None:
    if not REFRESH_TOKEN or "PASTE" in REFRESH_TOKEN.upper():
        print("Set REFRESH_TOKEN in Scraper/bstock_config_local.py.")
        sys.exit(1)
    try_refresh(REFRESH_TOKEN)


if __name__ == "__main__":
    main()
