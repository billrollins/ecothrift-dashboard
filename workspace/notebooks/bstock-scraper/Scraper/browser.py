"""Playwright fallback: persistent session + network JSON capture."""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

import pandas as pd

PACKAGE_DIR = Path(__file__).resolve().parent
AUTH_DIR = PACKAGE_DIR / "bstock_auth"
OUTPUT_DIR = PACKAGE_DIR / "output"
OUTPUT_PREFIX = "bstock_auctions"

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None  # type: ignore[misc, assignment]


def setup_session() -> None:
    if sync_playwright is None:
        print(
            "[ERROR] Install playwright: pip install playwright && playwright install chromium"
        )
        sys.exit(1)
    print("=" * 60)
    print("SESSION SETUP")
    print("=" * 60)
    print()
    print("A browser window will open. Then:")
    print("  1. Log into B-Stock")
    print("  2. Complete CAPTCHA if prompted")
    print("  3. Wait until you see the auction dashboard")
    print("  4. Press Enter here")
    print()

    AUTH_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(AUTH_DIR),
            headless=False,
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.goto("https://bstock.com", wait_until="domcontentloaded")

        input("\nPress Enter after you have logged in successfully...")

        cookies = context.cookies()
        token_cookies = [c for c in cookies if "token" in c["name"].lower()]
        if token_cookies:
            print(f"\nFound auth cookies: {[c['name'] for c in token_cookies]}")
        else:
            print("\nWarning: No obvious token cookies; session saved anyway.")

        context.close()

    print(f"\nSession saved under: {AUTH_DIR}")


def save_results(auctions: list) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_path = OUTPUT_DIR / f"{OUTPUT_PREFIX}_{ts}.csv"
    json_path = OUTPUT_DIR / f"{OUTPUT_PREFIX}_{ts}.json"
    df = pd.DataFrame(auctions)
    df.to_csv(csv_path, index=False, encoding="utf-8")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(auctions, f, indent=2, default=str)
    print(f"\nSaved CSV:  {csv_path} ({len(df)} rows)")
    print(f"Saved JSON: {json_path}")
    print(f"Columns: {list(df.columns)}")


def scrape_auctions() -> None:
    if sync_playwright is None:
        print(
            "[ERROR] Install playwright: pip install playwright && playwright install chromium"
        )
        sys.exit(1)
    if not AUTH_DIR.exists() or not any(AUTH_DIR.iterdir()):
        print("[ERROR] No saved session. Run: python -m Scraper.browser --setup")
        return

    captured: list = []
    auction_indicators = frozenset(
        {
            "currentBid",
            "closingAt",
            "retailPrice",
            "msrp",
            "bids",
            "auctionUrl",
            "listingPrettyId",
            "bidCount",
            "title",
            "lotSize",
        }
    )

    skip_patterns = (
        "launchdarkly",
        "google",
        "analytics",
        "gtm",
        "segment",
        "sentry",
        "hotjar",
        "facebook",
        "consent",
        "feature-flag",
    )

    def contains_auctions(obj: object) -> list | None:
        if isinstance(obj, list) and obj and isinstance(obj[0], dict):
            keys = set(obj[0].keys())
            if len(keys & auction_indicators) >= 2:
                return obj
        if isinstance(obj, dict):
            for v in obj.values():
                found = contains_auctions(v)
                if found is not None:
                    return found
        return None

    def handle_response(response) -> None:
        url = response.url
        if any(p in url.lower() for p in skip_patterns):
            return
        ct = response.headers.get("content-type", "")
        if "json" not in ct.lower():
            return
        try:
            body = response.json()
        except Exception:
            return
        block = contains_auctions(body)
        if block:
            print(f"  [CAPTURED] {url}")
            print(f"    -> {len(block)} items, keys: {list(block[0].keys())[:8]}...")
            captured.extend(block)

    print("=" * 60)
    print("B-Stock scraper (browser)")
    print("=" * 60)

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(AUTH_DIR),
            headless=True,
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.on("response", handle_response)

        print("\nNavigating to all-auctions...")
        page.goto("https://bstock.com/all-auctions", wait_until="networkidle")
        time.sleep(3)

        if "login" in page.url.lower() or "signin" in page.url.lower():
            print("\n[ERROR] Session expired or not logged in. Run --setup again.")
            context.close()
            return

        print(f"Page: {page.url} | captured rows so far: {len(captured)}")

        prev = len(captured)
        for scroll_attempt in range(10):
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(2)
            if len(captured) > prev:
                print(f"  Scroll {scroll_attempt + 1}: {len(captured)} total rows")
                prev = len(captured)
            else:
                for selector in (
                    "button:has-text('Load More')",
                    "button:has-text('Show More')",
                    "button:has-text('Next')",
                    "a:has-text('Next')",
                    "[class*='pagination'] button:last-child",
                    "[class*='loadMore']",
                ):
                    try:
                        btn = page.locator(selector).first
                        if btn.is_visible(timeout=500):
                            btn.click()
                            time.sleep(2)
                            break
                    except Exception:
                        continue
                if len(captured) == prev:
                    print(f"  No new data after scroll {scroll_attempt + 1}. Stopping.")
                    break

        context.close()

    if not captured:
        print("\n[WARNING] No auction JSON captured.")
        print("Try --setup again, or use BStockScraper + API config.")
        return

    seen: set = set()
    unique: list = []
    for item in captured:
        if not isinstance(item, dict):
            continue
        item_id = (
            item.get("id")
            or item.get("listingPrettyId")
            or item.get("auctionId")
            or json.dumps(item, sort_keys=True, default=str)
        )
        if item_id not in seen:
            seen.add(item_id)
            unique.append(item)

    print(f"\nTotal captured: {len(captured)}, unique: {len(unique)}")
    save_results(unique)


def main() -> None:
    parser = argparse.ArgumentParser(description="B-Stock scraper (Playwright)")
    parser.add_argument(
        "--setup",
        action="store_true",
        help="Open browser for one-time manual login",
    )
    args = parser.parse_args()
    if args.setup:
        setup_session()
    else:
        scrape_auctions()


if __name__ == "__main__":
    main()
