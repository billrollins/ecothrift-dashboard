"""
B-Stock scraper config — copy to bstock_config_local.py in this folder (gitignored).

Capture from Chrome DevTools: Network, XHR on https://bstock.com/all-auctions,
Copy as cURL: URL, Authorization Bearer, headers.

Real JSON often uses search.bstock.com or auction.bstock.com, not bstock.com HTML paths.

Do not commit real tokens in this example file.
"""

# JWT from Authorization header (value only, no "Bearer " prefix)
TOKEN = ""

# Listings/search JSON URL (e.g. search.bstock.com/v1/all-listings/listings) from DevTools
API_URL = ""

EXTRA_HEADERS: dict[str, str] = {
    # "Referer": "https://bstock.com/all-auctions",
    # "Origin": "https://bstock.com",
}

# Use PAGE_PARAM = "offset" for search.bstock.com all-listings (client uses (page-1)*PAGE_SIZE).
PAGE_PARAM = "page"
LIMIT_PARAM = "limit"
# Per-request batch size (limit/size param name is LIMIT_PARAM). API may cap lower than this.
PAGE_SIZE = 100
EXTRA_QUERY_PARAMS: dict[str, str | int] = {}

HTTP_METHOD = "GET"
POST_JSON: dict | None = None
APPEND_PAGINATION_PARAMS = True
# Max page index to fetch. None = no limit (stop when a page returns 0 rows).
# If APPEND_PAGINATION_PARAMS is False, default is 1 (same URL each time would duplicate).
# MAX_PAGES = None
# Safety brake when MAX_PAGES is None (set 0 to disable — risk of infinite loop if API never empties).
MAX_PAGES_SAFETY = 50_000

OUTPUT_DIR = "output"
OUTPUT_PREFIX = "bstock_auctions"

REFRESH_TOKEN = ""

# Phase 2: optional manifest batch URL template after DevTools capture
# MANIFEST_API_URL = ""
