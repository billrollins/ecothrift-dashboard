<!-- Archived 2026-03-27: disposition=pending — moved from `_archived/_backlog`; manifests/pipeline deferred. -->
<!-- Last updated: 2026-03-27T16:00:00-05:00 -->
# Initiative: B-Stock auction scraper (pending)

**Status:** **Pending (archived)** — notebook package is in good shape for Phase 1; manifests and further pipeline work deferred.

**Source brief:** User `Downloads/bstock_scraper_instructions.md` (2026). Constraints: no automated login; API-first; optional Playwright fallback.

---

## Objective

Collect **B-Stock** auction/listing data for analysis using a **notebook-first** Python API, with optional CSV/JSON export. All code lives under **`workspace/notebooks/Scraper/`** (selective git track); secrets stay in gitignored **`Scraper/bstock_config_local.py`**.

---

## Progress (2026-03)

- **v1 (superseded):** Flat scripts under `workspace/notebooks/` (`bstock_scraper.py`, browser + refresh helpers). Removed in favor of the package below.
- **Learned:** `https://bstock.com/api/auctions` and similar paths often return **HTML** (Next shell), not JSON. Real data appears on **`search.bstock.com`** (e.g. `v1/all-listings/listings`) and **`auction.bstock.com`** (e.g. `v1/auctions?listingId=...` hydration). DevTools **Copy as cURL** is required; include **Authorization** / **Referer** / **Origin** as the browser sends.
- **v2 (current):** Package **`Scraper`** with `BStockScraper`, `client`, `config`, `browser.py`, `refresh_token.py`, `examples/bstock_quickstart.ipynb`, CLI `python -m Scraper` from `workspace/notebooks`.

---

## Notebook API (target ergonomics)

Python uses **snake_case** (same ideas as `getAuctions` / `getManifests`):

```python
from Scraper import BStockScraper
scraper = BStockScraper()
auctions = scraper.get_auctions()   # pandas.DataFrame
scraper.update()                    # clear cache, re-fetch
scraper.save_to_disk()              # CSV + JSON under Scraper/output/
# scraper.get_manifests(auctions)  # Phase 2 — NotImplementedError until manifest XHR captured
```

---

## Constraints (non-negotiable)

- Do not automate login or solve CAPTCHAs; do not rely on HTML-only scraping for listing JSON.
- Throttle requests; do not hammer APIs.

---

## Deliverables (current)

| Path | Role |
|------|------|
| `Scraper/__init__.py` | Exports `BStockScraper` |
| `Scraper/scraper.py` | Class API + cache |
| `Scraper/client.py` | `requests` session, pagination, JSON extraction, save |
| `Scraper/config.py` | Load `bstock_config_local` from package dir |
| `Scraper/config.example.py` | Tracked template |
| `Scraper/browser.py` | Playwright persistent profile under `Scraper/bstock_auth/` |
| `Scraper/refresh_token.py` | Experimental refresh |
| `Scraper/examples/bstock_quickstart.ipynb` | Minimal notebook |
| `Scraper/__main__.py` | CLI entry |

---

## Open questions / Phase 2 (when resumed)

- **`get_manifests`:** Capture manifest XHR from DevTools; add config keys (e.g. `MANIFEST_API_URL`) and implement batching in `client.py`.
- Optional **two-step pipeline** in class: listings index then `auction.bstock.com` hydration by `listingId` batches (config-driven).

---

## Related

- [.ai/extended/development.md](../../extended/development.md) (Jupyter / notebook paths)
- [requirements-notebooks.txt](../../../workspace/notebooks/requirements-notebooks.txt)
