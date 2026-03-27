"""CLI: cd workspace/notebooks/bstock-scraper then python -m Scraper"""

from __future__ import annotations

from .scraper import BStockScraper


def main() -> None:
    scraper = BStockScraper()
    df = scraper.update()
    print(f"Fetched {len(df)} rows.")
    if len(df) > 0:
        scraper.save_to_disk(df)


if __name__ == "__main__":
    main()
