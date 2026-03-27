"""HTTP client for B-Stock JSON APIs (session, pagination, export)."""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime
from pathlib import Path
from types import ModuleType

import pandas as pd
import requests


def create_session(cfg: ModuleType) -> requests.Session:
    token = (getattr(cfg, "TOKEN", "") or "").strip()
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Authorization": (
                f"Bearer {token}"
                if not token.lower().startswith("bearer ")
                else token
            ),
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    extra = getattr(cfg, "EXTRA_HEADERS", None) or {}
    if extra:
        s.headers.update(extra)
    return s


def extract_auction_list(data: object) -> list:
    if isinstance(data, list):
        return data
    if not isinstance(data, dict):
        return []

    for key in ("auctions", "results", "data", "items", "listings", "nodes"):
        v = data.get(key)
        if isinstance(v, list):
            return v

    if "pageProps" in data:
        props = data["pageProps"]
        if isinstance(props, dict):
            for key in ("auctions", "results", "data", "items", "listings"):
                v = props.get(key)
                if isinstance(v, list):
                    return v

    return []


def _print_non_json_help(resp: requests.Response) -> None:
    ct = (resp.headers.get("Content-Type") or "").split(";")[0].strip()
    raw = resp.text or ""
    snippet = raw[:600].replace("\r", " ").replace("\n", " ")
    print("\n[ERROR] Response is not JSON (or empty). Common cause: wrong API_URL.")
    print(f"  HTTP status: {resp.status_code}")
    print(f"  Final URL:   {resp.url}")
    print(f"  Content-Type: {ct or '(missing)'}")
    if "html" in ct.lower() or raw.lstrip().lower().startswith("<!"):
        print(
            "  Hint: You likely hit an HTML page (SPA shell or 404), not the XHR endpoint."
        )
        print(
            "  Fix: In DevTools Network, open the request whose Response is raw JSON"
        )
        print("  and copy that exact URL into API_URL (do not guess /api/auctions).")
    if snippet:
        print(f"  Body preview: {snippet!r}")
    else:
        print("  Body: (empty)")


def _jitter_delay(page_num: int) -> float:
    h = int(
        hashlib.md5(str(page_num).encode(), usedforsecurity=False).hexdigest()[:8], 16
    )
    return 1.0 + (h % 10) / 10.0


def fetch_page(session: requests.Session, cfg: ModuleType, page: int) -> list | None:
    api_url = (getattr(cfg, "API_URL", "") or "").strip()
    page_param = getattr(cfg, "PAGE_PARAM", "page")
    limit_param = getattr(cfg, "LIMIT_PARAM", "limit")
    page_size = int(getattr(cfg, "PAGE_SIZE", 100))
    extra_q = dict(getattr(cfg, "EXTRA_QUERY_PARAMS", {}) or {})
    append_pag = bool(getattr(cfg, "APPEND_PAGINATION_PARAMS", True))
    http_method = (getattr(cfg, "HTTP_METHOD", "GET") or "GET").upper()
    post_json = getattr(cfg, "POST_JSON", None)

    params: dict[str, str | int] = dict(extra_q)
    if append_pag:
        if str(page_param).lower() == "offset":
            params[page_param] = (page - 1) * page_size
        else:
            params[page_param] = page
        params[limit_param] = page_size

    try:
        if http_method == "POST":
            body: dict = dict(post_json) if isinstance(post_json, dict) else {}
            if append_pag:
                if str(page_param).lower() == "offset":
                    body[page_param] = (page - 1) * page_size
                else:
                    body[page_param] = page
                body[limit_param] = page_size
            resp = session.post(api_url, params=params, json=body, timeout=30)
        else:
            resp = session.get(api_url, params=params, timeout=30)

        if resp.status_code in (401, 403) or "login" in resp.url.lower():
            print("\n[ERROR] Authentication failed or token expired.")
            print("Re-capture cURL from DevTools and update bstock_config_local.py.")
            print(f"Status: {resp.status_code}, URL: {resp.url}")
            return None

        resp.raise_for_status()

        try:
            data = resp.json()
        except (json.JSONDecodeError, ValueError) as e:
            _print_non_json_help(resp)
            print(f"  Parse error: {e}")
            return None

        rows = extract_auction_list(data)
        if not rows and isinstance(data, dict):
            print(
                f"[WARNING] No auction list found. Top-level keys: {list(data.keys())}"
            )
            preview = json.dumps(data, indent=2, default=str)[:1200]
            print(f"Response preview:\n{preview}")
        return rows

    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Request failed: {e}")
        return None


_UNSET_MAX_PAGES = object()


def _resolve_max_pages_cap(cfg: ModuleType, max_pages: int | None) -> int | None:
    """
    Return max page index to fetch, or None = no cap (stop only on empty page).

    Single-shot APIs (APPEND_PAGINATION_PARAMS False) default to 1 request when
    MAX_PAGES is unset — each repeat would duplicate the same rows.
    """
    append_pag = bool(getattr(cfg, "APPEND_PAGINATION_PARAMS", True))
    cfg_raw = getattr(cfg, "MAX_PAGES", _UNSET_MAX_PAGES)
    if max_pages is not None:
        return int(max_pages)
    if not append_pag and cfg_raw is _UNSET_MAX_PAGES:
        return 1
    if cfg_raw is not _UNSET_MAX_PAGES:
        if cfg_raw is None:
            return None
        return int(cfg_raw)
    return None


def _max_pages_safety(cfg: ModuleType) -> int | None:
    """Hard ceiling when MAX_PAGES is unlimited; None/0 disables."""
    raw = getattr(cfg, "MAX_PAGES_SAFETY", 50_000)
    if raw is None or raw == 0:
        return None
    return int(raw)


def fetch_all_pages(
    session: requests.Session, cfg: ModuleType, max_pages: int | None = None
) -> list:
    page_cap = _resolve_max_pages_cap(cfg, max_pages)
    safety_cap = _max_pages_safety(cfg)
    all_rows: list = []
    page_num = 0
    while True:
        page_num += 1
        if page_cap is not None and page_num > page_cap:
            break
        if safety_cap is not None and page_num > safety_cap:
            print(
                f"[WARNING] MAX_PAGES_SAFETY ({safety_cap}) reached; stopping. "
                "Set MAX_PAGES_SAFETY = 0 in config to disable, or raise the cap."
            )
            break
        print(f"Fetching page {page_num}...", end=" ", flush=True)
        results = fetch_page(session, cfg, page_num)
        if results is None:
            print("FATAL - stopping.")
            break
        if len(results) == 0:
            print("empty page - done.")
            break
        all_rows.extend(results)
        print(f"got {len(results)} rows (total: {len(all_rows)})")
        time.sleep(_jitter_delay(page_num))
    return all_rows


def save_results(rows: list, output_dir: Path, prefix: str) -> Path | None:
    if not rows:
        return None
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_path = output_dir / f"{prefix}_{ts}.csv"
    json_path = output_dir / f"{prefix}_{ts}.json"

    df = pd.DataFrame(rows)
    df.to_csv(csv_path, index=False, encoding="utf-8")
    print(f"\nSaved CSV: {csv_path} ({len(df)} rows, {len(df.columns)} columns)")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, default=str)
    print(f"Saved JSON: {json_path}")
    print(f"Columns: {list(df.columns)}")
    if rows:
        print("\nFirst record preview:")
        print(json.dumps(rows[0], indent=2, default=str)[:800])
    return csv_path


def output_dir_for_config(cfg: ModuleType, package_dir: Path) -> Path:
    raw = getattr(cfg, "OUTPUT_DIR", "output")
    p = Path(raw)
    return p if p.is_absolute() else package_dir / p
