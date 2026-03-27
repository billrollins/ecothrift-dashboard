"""Notebook-first BStockScraper API."""

from __future__ import annotations

from types import ModuleType
from typing import Any

import pandas as pd

from . import client
from .config import config_valid, load_config, package_dir


class BStockScraper:
    """
    Simple entry point for notebooks::

        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path("workspace/notebooks/bstock-scraper").resolve()))
        from Scraper import BStockScraper

        scraper = BStockScraper()
        auctions = scraper.get_auctions()
        scraper.update()
        scraper.get_manifests(auctions)  # Phase 2 until manifest XHR is wired
    """

    def __init__(self, cfg: ModuleType | None = None) -> None:
        self._cfg = cfg if cfg is not None else load_config()
        self._pkg = package_dir()
        self._session = client.create_session(self._cfg)
        self._cache_rows: list[dict[str, Any]] | None = None

    def _require_valid_config(self) -> None:
        if not config_valid(self._cfg):
            raise ValueError(
                "Set TOKEN and API_URL in Scraper/bstock_config_local.py "
                "(copy from Scraper/config.example.py)."
            )

    def get_auctions(
        self, *, use_cache: bool = True, max_pages: int | None = None
    ) -> pd.DataFrame:
        """
        Fetch auction rows (names + fields returned by your configured listings API).
        Returns a DataFrame. Uses in-memory cache when use_cache=True and cache exists.
        Pass max_pages to override config (see client.fetch_all_pages / MAX_PAGES).
        """
        self._require_valid_config()
        if use_cache and self._cache_rows is not None:
            return pd.DataFrame(self._cache_rows)
        http_method = (getattr(self._cfg, "HTTP_METHOD", "GET") or "GET").upper()
        post_json = getattr(self._cfg, "POST_JSON", None)
        if http_method == "POST" and post_json is None:
            print(
                "[WARNING] HTTP_METHOD is POST but POST_JSON is None; using empty body."
            )
        rows = client.fetch_all_pages(self._session, self._cfg, max_pages=max_pages)
        self._cache_rows = rows
        return pd.DataFrame(rows)

    def update(self) -> pd.DataFrame:
        """Clear cache and re-fetch all pages from the API."""
        self._cache_rows = None
        return self.get_auctions(use_cache=False)

    def get_manifests(self, auctions: pd.DataFrame | list) -> pd.DataFrame:
        """
        Placeholder: capture the manifest XHR from DevTools, then add MANIFEST_API_URL
        (and related settings) to bstock_config_local.py. See .ai/initiatives/_archived/_pending/bstock_scraper.md.
        """
        raise NotImplementedError(
            "Manifest API not configured. Capture the manifest request in Chrome DevTools, "
            "document it in the plan, then implement MANIFEST_API_URL in config or extend client."
        )

    def save_to_disk(self, rows: list | pd.DataFrame | None = None) -> None:
        """Write CSV + JSON under Scraper/output/ using config prefix."""
        self._require_valid_config()
        if rows is None:
            if self._cache_rows is None:
                rows = self.update()
            else:
                rows = self._cache_rows
        if isinstance(rows, pd.DataFrame):
            data = rows.to_dict("records")
        else:
            data = list(rows)
        out = client.output_dir_for_config(self._cfg, self._pkg)
        prefix = getattr(self._cfg, "OUTPUT_PREFIX", "bstock_auctions")
        client.save_results(data, out, prefix)
