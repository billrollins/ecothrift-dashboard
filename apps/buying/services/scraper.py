"""
B-Stock microservice HTTP client. Endpoints are fixed infrastructure URLs.

Search listings POST does not require auth. **Auction state** GET
(``auction.bstock.com/v1/auctions``) works anonymously by default via
``get_auction_states_batch(auth=False)``. **Manifest** GET
(``order-process.bstock.com/v1/manifests/{lotId}``) is **anonymous** via
``get_manifest`` (no JWT). Other listing and shipment calls normally require a
JWT; when ``JWT_BSTOCK_CALLS_DISABLED`` is True (ban prevention),
**authenticated** calls are skipped—see each function's guard.

When ``BUYING_SOCKS5_PROXY_ENABLED`` is True, **all** ``*.bstock.com`` requests
made via ``_request_json`` use that SOCKS5 proxy (not only search). Dev opt-in
``BUYING_SOCKS5_DEV_AUDIT`` logs the redacted proxy URL per request and probes
egress IP through the same proxy (see ``logs/bstock_api.log``).

Token resolution when JWT calls are enabled (first match
wins):

1. File ``workspace/.bstock_token`` (from ``python manage.py bstock_token``)
2. Environment variable ``BSTOCK_AUTH_TOKEN``

Do not automate login or bypass CAPTCHA. Throttle requests.
"""

from __future__ import annotations

import base64
import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from django.apps import apps as django_apps
from django.conf import settings
from urllib.parse import quote, urlparse

logger = logging.getLogger(__name__)
# Dedicated logger for one-line outbound request audit (console + logs/bstock_api.log via settings).
bstock_logger = logging.getLogger('buying.scraper')

_SOCKS5_EGRESS_LOCK = threading.Lock()
_SOCKS5_LAST_EGRESS_MONO = 0.0
_SOCKS5_LAST_EGRESS_IP: str | None = None

# Reused for manifest pagination (same host, keep-alive / connection pooling).
_MANIFEST_HTTP_SESSION_LOCK = threading.Lock()
_MANIFEST_HTTP_SESSION: requests.Session | None = None

# Ban prevention: skip all JWT-backed B-Stock HTTP calls. Public search (`discover_auctions`) is unchanged.
# Set False to re-enable authenticated endpoints.
JWT_BSTOCK_CALLS_DISABLED = True

SEARCH_LISTINGS_URL = 'https://search.bstock.com/v1/all-listings/listings'
LISTING_GROUPS_URL = 'https://listing.bstock.com/v1/groups'
AUCTION_STATE_URL = 'https://auction.bstock.com/v1/auctions'
AUCTION_UNIQUE_BIDS_URL = 'https://auction.bstock.com/v1/auctions/bids/unique'
SHIPMENT_QUOTES_URL = 'https://shipment.bstock.com/v1/quotes'
# Path segment is lotId (search `lotId` / Auction.lot_id). Browsers call GET here.
ORDER_MANIFEST_BASE = 'https://order-process.bstock.com/v1/manifests'

BASE_HEADERS: dict[str, str] = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Origin': 'https://bstock.com',
    'Referer': 'https://bstock.com/',
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
    ),
}


class BStockAuthError(Exception):
    """HTTP 401: JWT missing, invalid, or expired."""


AUTH_TOKEN_EXPIRED_MESSAGE = 'Token expired. Run: python manage.py bstock_token'


def _token_file_path() -> Path:
    return Path(settings.BASE_DIR) / 'workspace' / '.bstock_token'


def _read_token_from_file() -> str:
    path = _token_file_path()
    try:
        if path.is_file():
            raw = path.read_text(encoding='utf-8').strip()
            if raw.lower().startswith('bearer '):
                raw = raw[7:].strip()
            return raw
    except OSError as e:
        logger.warning('Could not read B-Stock token file %s: %s', path, e)
    return ''


def _delay_between_requests() -> None:
    sec = float(getattr(settings, 'BUYING_REQUEST_DELAY_SECONDS', 2.0))
    if sec > 0:
        time.sleep(sec)


def _auth_token_value() -> str:
    file_token = _read_token_from_file()
    if file_token:
        return file_token
    raw = (getattr(settings, 'BSTOCK_AUTH_TOKEN', '') or '').strip()
    if raw.lower().startswith('bearer '):
        return raw[7:].strip()
    return raw


def bstock_token_available() -> bool:
    """True when a JWT is available for authenticated B-Stock HTTP (file or env)."""
    return bool(_auth_token_value())


def get_auth_headers() -> dict[str, str]:
    """Return BASE_HEADERS plus Authorization. Used for authenticated calls only."""
    token = _auth_token_value()
    if not token:
        raise ValueError(
            'No B-Stock token. Run: python manage.py bstock_token '
            '(writes workspace/.bstock_token) or set BSTOCK_AUTH_TOKEN in .env.'
        )
    out = dict(BASE_HEADERS)
    out['Authorization'] = f'Bearer {token}'
    return out


def _sanitize_headers_for_log(headers: dict[str, str]) -> dict[str, str]:
    """Loggable copy with Authorization redacted (last 8 chars of JWT shown)."""
    out: dict[str, str] = {}
    for k, v in headers.items():
        if k.lower() == 'authorization':
            if v.lower().startswith('bearer '):
                tok = v[7:].strip()
                tail = tok[-8:] if len(tok) > 8 else '***'
                out[k] = f'Bearer …{tail} (len={len(tok)})'
            else:
                out[k] = '***'
        else:
            out[k] = v
    return out


def _jwt_exp_summary(headers: dict[str, str]) -> str:
    """Decode JWT `exp` without verifying signature (debug only)."""
    auth = headers.get('Authorization') or ''
    if not auth.lower().startswith('bearer '):
        return 'no Bearer token'
    token = auth[7:].strip()
    parts = token.split('.')
    if len(parts) < 2:
        return 'JWT does not look like three segments'
    payload_b64 = parts[1]
    mp = len(payload_b64) % 4
    if mp:
        payload_b64 += '=' * (4 - mp)
    try:
        raw = base64.urlsafe_b64decode(payload_b64)
        data = json.loads(raw.decode('utf-8'))
    except (json.JSONDecodeError, TypeError, ValueError, UnicodeDecodeError) as e:
        return (
            f'JWT middle segment not plain JSON (encrypted JWE or non-JWT token?): {e}'
        )
    exp = data.get('exp')
    if exp is None:
        return 'JWT has no exp claim'
    try:
        exp_ts = int(exp)
    except (TypeError, ValueError):
        return f'JWT exp not int: {exp!r}'
    exp_dt = datetime.fromtimestamp(exp_ts, tz=timezone.utc)
    now = datetime.now(timezone.utc)
    if exp_dt <= now:
        return (
            f'EXPIRED exp={exp_dt.isoformat()} '
            f'(now={now.isoformat()}, {int((now - exp_dt).total_seconds())}s past exp)'
        )
    return (
        f'valid exp={exp_dt.isoformat()} '
        f'(≈{int((exp_dt - now).total_seconds())}s remaining)'
    )


def _is_manifest_url(url: str) -> bool:
    return 'order-process.bstock.com' in url and '/manifests/' in url


def _bstock_url_display(full_url: str) -> str:
    """Host + path + query, no scheme (matches ops log line style)."""
    p = urlparse(full_url)
    if not p.netloc:
        return full_url[:400]
    q = f'?{p.query}' if p.query else ''
    base = f'{p.netloc}{p.path}{q}'.rstrip('/') or p.netloc
    return base


def _log_bstock_request(
    method: str,
    full_url: str,
    *,
    auth: bool,
    status_code: int | str,
    elapsed_ms: float,
) -> None:
    bstock_logger.info(
        '%s %s | auth=%s | %s | %.0fms',
        method.upper(),
        _bstock_url_display(full_url),
        'jwt' if auth else 'none',
        status_code,
        elapsed_ms,
    )


def _merge_headers(auth: bool) -> dict[str, str]:
    if auth:
        return get_auth_headers()
    return dict(BASE_HEADERS)


def _headers_for_request(method: str, auth: bool) -> dict[str, str]:
    """Headers actually sent (GET omits Content-Type to match browser behavior)."""
    h = _merge_headers(auth)
    if method.upper() == 'GET':
        h = {k: v for k, v in h.items() if k.lower() != 'content-type'}
    return h


def _manifest_http_session() -> requests.Session:
    """Lazy singleton Session for repeated manifest GETs (TLS reuse on same host)."""
    global _MANIFEST_HTTP_SESSION
    with _MANIFEST_HTTP_SESSION_LOCK:
        if _MANIFEST_HTTP_SESSION is None:
            _MANIFEST_HTTP_SESSION = requests.Session()
        return _MANIFEST_HTTP_SESSION


def _request_json(
    method: str,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    auth: bool = False,
    timeout: int = 30,
    proxies: dict[str, str] | None = None,
    session: requests.Session | None = None,
) -> Any | None:
    """
    Perform one HTTP request and return parsed JSON.

    On 401 with auth=True, raises BStockAuthError (no retry).
    On 403, logs and returns None.
    On 429, retries with exponential backoff up to BSTOCK_MAX_RETRIES.
    Network errors: log and return None.
    """
    max_retries = int(getattr(settings, 'BSTOCK_MAX_RETRIES', 3))
    headers = _headers_for_request(method, auth)
    backoff_base = 2.0

    try:
        prepared = requests.Request(
            method.upper(), url, params=params, json=json_body
        ).prepare()
        prepared_url = prepared.url
    except Exception:
        prepared_url = url

    if proxies is None:
        proxies = _bstock_socks5_proxies_for_url(url)

    _socks5_dev_audit_request_line(method, prepared_url, url, proxies)

    for attempt in range(max_retries + 1):
        start = time.perf_counter()
        try:
            req_kw: dict[str, Any] = {
                'params': params,
                'json': json_body,
                'headers': headers,
                'timeout': timeout,
            }
            if proxies:
                req_kw['proxies'] = proxies
            http_call = session.request if session is not None else requests.request
            resp = http_call(method.upper(), url, **req_kw)
            if proxies:
                _socks5_dev_audit_maybe_egress(proxies)
        except requests.exceptions.RequestException as e:
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            _log_bstock_request(
                method, prepared_url, auth=auth, status_code='ERR', elapsed_ms=elapsed_ms
            )
            logger.error('B-Stock request error %s %s: %s', method, url[:160], e)
            return None

        elapsed_ms = (time.perf_counter() - start) * 1000.0
        effective_url = getattr(resp, 'url', None) or prepared_url
        _log_bstock_request(
            method,
            effective_url,
            auth=auth,
            status_code=resp.status_code,
            elapsed_ms=elapsed_ms,
        )

        if resp.status_code == 401:
            if auth:
                logger.error('B-Stock 401 Unauthorized: %s', AUTH_TOKEN_EXPIRED_MESSAGE)
                raise BStockAuthError(AUTH_TOKEN_EXPIRED_MESSAGE)
            logger.error('B-Stock 401 on unauthenticated request: %s', url[:160])
            return None

        if resp.status_code == 403:
            logger.warning(
                'B-Stock 403 Forbidden (access denied or marketplace not available): %s',
                url[:160],
            )
            return None

        if resp.status_code == 429:
            retry_after = resp.headers.get('Retry-After')
            wait = backoff_base * (2**attempt)
            if retry_after:
                try:
                    wait = max(wait, float(retry_after))
                except ValueError:
                    pass
            if attempt < max_retries:
                logger.warning(
                    'B-Stock 429 rate limited. Retry-After=%s sleeping %.1fs (attempt %s/%s)',
                    retry_after,
                    wait,
                    attempt + 1,
                    max_retries,
                )
                time.sleep(wait)
                continue
            logger.error('B-Stock 429 after %s retries: %s', max_retries, url[:160])
            return None

        try:
            resp.raise_for_status()
        except requests.exceptions.HTTPError:
            body_preview = ''
            try:
                body_preview = (resp.text or '')[:1200]
            except Exception:
                pass
            err_url = getattr(resp, 'url', None) or url
            logger.error(
                'B-Stock HTTP %s for %s body_preview=%r',
                resp.status_code,
                err_url[:400],
                body_preview,
            )
            if resp.status_code == 400 and auth and _is_manifest_url(url):
                logger.warning(
                    'Manifest 400 with auth: compare logged Accept/Origin/Referer/Authorization '
                    'to a working browser cURL. If the JWT was near expiry, sweep may have used '
                    'the last seconds of a valid token before pull_manifests ran; try a fresh '
                    'token; this service may return 400 instead of 401 for expired/invalid JWT.'
                )
            return None

        if not (resp.content or '').strip():
            return None

        try:
            return resp.json()
        except (json.JSONDecodeError, ValueError) as e:
            logger.error('B-Stock response is not JSON: %s body_preview=%r', e, resp.text[:400])
            return None

    return None


def extract_listings_from_search_response(data: Any) -> list[dict[str, Any]]:
    """
    Pull listing dicts from POST /v1/all-listings/listings response.

    Schema varies; we try common keys. Logged on first run for tuning.
    """
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if not isinstance(data, dict):
        return []
    for key in ('listings', 'results', 'items', 'data', 'nodes'):
        v = data.get(key)
        if isinstance(v, list):
            return [x for x in v if isinstance(x, dict)]
        if isinstance(v, dict):
            for inner in ('listings', 'items', 'results', 'records'):
                inner_v = v.get(inner)
                if isinstance(inner_v, list):
                    return [x for x in inner_v if isinstance(x, dict)]
    return []


def total_from_search_response(data: Any) -> int | None:
    """Best-effort total count from search API JSON (used to stop pagination early)."""
    if not isinstance(data, dict):
        return None
    for key in ('total', 'totalCount', 'total_count', 'count'):
        v = data.get(key)
        if isinstance(v, int):
            return v
        if isinstance(v, float) and v == int(v):
            return int(v)
        if isinstance(v, str) and v.isdigit():
            return int(v)
    return None


def _host_is_bstock_api(url: str) -> bool:
    try:
        netloc = urlparse(url).netloc.lower()
    except Exception:
        return False
    if not netloc:
        return False
    return netloc == 'bstock.com' or netloc.endswith('.bstock.com')


def _build_bstock_socks5_proxies_dict() -> dict[str, str] | None:
    """SOCKS5 proxy dict for requests. None when incomplete config (even if enabled)."""
    host = (getattr(settings, 'BUYING_SOCKS5_PROXY_HOST', '') or '').strip()
    port = getattr(settings, 'BUYING_SOCKS5_PROXY_PORT', '') or ''
    if not host or not str(port).strip():
        return None
    # Optional resolved IP overrides hostname (avoids DNS issues with some SOCKS providers).
    ip_override = (getattr(settings, 'BUYING_SOCKS5_PROXY_IP', '') or '').strip()
    effective_host = ip_override or host
    user = (getattr(settings, 'BUYING_SOCKS5_PROXY_USER', '') or '').strip()
    pw = (getattr(settings, 'BUYING_SOCKS5_PROXY_PASSWORD', '') or '').strip()
    if user or pw:
        uq = quote(user, safe='')
        pq = quote(pw, safe='')
        auth = f'{uq}:{pq}@'
    else:
        auth = ''
    # socks5 = local DNS then CONNECT via proxy (needed for PIA if socks5h → 0x04).
    # socks5h = proxy resolves DNS.
    use_local = getattr(settings, 'BUYING_SOCKS5_LOCAL_DNS', False)
    scheme = 'socks5' if use_local else 'socks5h'
    purl = f'{scheme}://{auth}{effective_host}:{port}'
    return {'http': purl, 'https': purl}


def _bstock_socks5_proxies_for_url(url: str) -> dict[str, str] | None:
    if not getattr(settings, 'BUYING_SOCKS5_PROXY_ENABLED', False):
        return None
    if not _host_is_bstock_api(url):
        return None
    return _build_bstock_socks5_proxies_dict()


def _redact_socks_proxy_url_for_log(proxy_url: str) -> str:
    try:
        p = urlparse(proxy_url)
    except Exception:
        return '***'
    if not p.scheme or not p.hostname:
        return '***'
    port = f':{p.port}' if p.port else ''
    if p.password is not None:
        u = p.username or ''
        user_part = f'{u}:***@' if u else '***@'
    elif p.username:
        user_part = f'{p.username}@'
    else:
        user_part = ''
    return f'{p.scheme}://{user_part}{p.hostname}{port}'


def _redact_proxies_dict_for_log(proxies: dict[str, str]) -> str:
    u = (proxies.get('https') or proxies.get('http') or '').strip()
    if not u:
        return '{}'
    return _redact_socks_proxy_url_for_log(u)


def _socks5_dev_audit_request_line(
    method: str,
    prepared_url: str,
    url: str,
    proxies: dict[str, str] | None,
) -> None:
    if not getattr(settings, 'BUYING_SOCKS5_DEV_AUDIT', False):
        return
    if not _host_is_bstock_api(url):
        return
    display = _bstock_url_display(prepared_url)
    if proxies:
        bstock_logger.info(
            'B-Stock SOCKS5 route | %s %s | %s',
            method.upper(),
            display,
            _redact_proxies_dict_for_log(proxies),
        )
    else:
        bstock_logger.info(
            'B-Stock direct (no SOCKS5) | %s %s',
            method.upper(),
            display,
        )


def _fetch_public_egress_ip(proxies: dict[str, str]) -> str | None:
    try:
        r = requests.get(
            'https://api.ipify.org?format=json',
            proxies=proxies,
            timeout=12,
            headers={
                'User-Agent': 'EcoThriftDashboard/bstock-socks-audit',
                'Accept': 'application/json',
            },
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if isinstance(data, dict) and data.get('ip'):
            return str(data['ip']).strip() or None
    except (requests.RequestException, ValueError, TypeError, json.JSONDecodeError) as e:
        logger.debug('SOCKS5 egress probe failed: %s', e)
    return None


def _socks5_dev_audit_maybe_egress(proxies: dict[str, str] | None) -> None:
    """Throttled probe of public IPv4 seen when using the same SOCKS proxy."""
    global _SOCKS5_LAST_EGRESS_MONO, _SOCKS5_LAST_EGRESS_IP
    if not getattr(settings, 'BUYING_SOCKS5_DEV_AUDIT', False):
        return
    if not proxies:
        return
    interval = float(getattr(settings, 'BUYING_SOCKS5_EGRESS_PROBE_SECONDS', 45.0))
    now = time.monotonic()
    with _SOCKS5_EGRESS_LOCK:
        if _SOCKS5_LAST_EGRESS_MONO > 0.0 and (now - _SOCKS5_LAST_EGRESS_MONO) < interval:
            return
        _SOCKS5_LAST_EGRESS_MONO = now
    ip = _fetch_public_egress_ip(proxies)
    if not ip:
        return
    with _SOCKS5_EGRESS_LOCK:
        prev = _SOCKS5_LAST_EGRESS_IP
        _SOCKS5_LAST_EGRESS_IP = ip
    if prev is None:
        bstock_logger.info(
            'B-Stock SOCKS5 egress IP (public, via api.ipify.org): %s', ip
        )
    elif ip != prev:
        bstock_logger.info(
            'B-Stock SOCKS5 egress IP changed: %s -> %s', prev, ip
        )


def _search_post_paginate(
    storefront: str,
    *,
    page_limit: int,
    max_pages: int | None,
    log_full_first_response: bool,
    slug_for_log: str = '',
) -> tuple[list[dict[str, Any]], str | None, float]:
    """
    POST all pages for one storeFrontId. Returns (rows, error_or_none, total_elapsed_ms).

    Runs in the calling thread (sequential caller or one ThreadPoolExecutor worker).
    """
    all_rows: list[dict[str, Any]] = []
    offset = 0
    page_num = 0
    safety = int(getattr(settings, 'BSTOCK_SEARCH_MAX_PAGES', 5000))
    http_ms_total = 0.0
    total_available: int | None = None

    while True:
        page_num += 1
        if max_pages is not None and page_num > max_pages:
            break
        if page_num > safety:
            logger.warning('BSTOCK_SEARCH_MAX_PAGES safety cap (%s) reached.', safety)
            break

        body = {
            'limit': page_limit,
            'offset': offset,
            'sortBy': 'recommended',
            'sortOrder': 'asc',
            'storeFrontId': [storefront],
        }

        t0 = time.perf_counter()
        data = _request_json(
            'POST',
            SEARCH_LISTINGS_URL,
            json_body=body,
            auth=False,
            timeout=120,
        )
        http_ms_total += (time.perf_counter() - t0) * 1000.0

        if data is None:
            logger.error(
                'Search listings failed slug=%s offset=%s', slug_for_log, offset
            )
            return all_rows, 'Search listings request failed', http_ms_total

        if page_num == 1:
            total_available = total_from_search_response(data)

        if log_full_first_response and offset == 0:
            try:
                logger.info(
                    'B-Stock search first page raw JSON (for schema discovery):\n%s',
                    json.dumps(data, indent=2, default=str)[:50000],
                )
            except (TypeError, ValueError):
                logger.info(
                    'B-Stock search first page keys: %s',
                    list(data.keys()) if isinstance(data, dict) else type(data),
                )

        rows = extract_listings_from_search_response(data)
        if not rows:
            logger.info('Search returned no listing rows at offset=%s (done).', offset)
            break

        all_rows.extend(rows)
        if len(rows) < page_limit:
            break

        if (
            total_available is not None
            and offset + len(rows) >= total_available
        ):
            break

        offset += page_limit
        _delay_between_requests()

    return all_rows, None, http_ms_total


def discover_auctions(
    marketplace_slug: str,
    *,
    page_limit: int = 200,
    max_pages: int | None = None,
    log_full_first_response: bool = False,
) -> list[dict[str, Any]]:
    """
    Paginate POST search.bstock.com/v1/all-listings/listings for one marketplace.

    Basic search does not require auth. Requires Marketplace.external_id (storeFrontId).
    """
    Marketplace = django_apps.get_model('buying', 'Marketplace')
    mp = Marketplace.objects.filter(slug=marketplace_slug, is_active=True).first()
    if not mp:
        raise ValueError(
            f'No active marketplace with slug={marketplace_slug!r}. '
            'Run migrations to seed marketplaces or add one in Django admin.'
        )
    storefront = (mp.external_id or '').strip()
    if not storefront:
        raise ValueError(
            f'Marketplace {marketplace_slug!r} has no external_id (storeFrontId). '
            'Set it in Django admin.'
        )

    rows, _err, _ms = _search_post_paginate(
        storefront,
        page_limit=page_limit,
        max_pages=max_pages,
        log_full_first_response=log_full_first_response,
        slug_for_log=marketplace_slug,
    )
    return rows


@dataclass
class MarketplaceSearchBatch:
    """One marketplace result from parallel search (HTTP only; no DB)."""

    slug: str
    name: str
    store_front_id: str
    rows: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    http_ms: float = 0.0


def discover_auctions_parallel(
    *,
    page_limit: int = 200,
    max_pages: int | None = None,
    log_full_first_response: bool = False,
    marketplace_slug: str | None = None,
) -> list[MarketplaceSearchBatch]:
    """
    POST search for one or all active marketplaces in parallel (ThreadPoolExecutor).

    Each task paginates one storefront. No Django ORM inside worker threads beyond
    the initial queryset read on the main thread.
    """
    Marketplace = django_apps.get_model('buying', 'Marketplace')
    qs = Marketplace.objects.filter(is_active=True).order_by('slug')
    if marketplace_slug:
        qs = qs.filter(slug=marketplace_slug)
    mps: list[Any] = list(qs)
    if not mps:
        return []

    tasks: list[tuple[str, str, str]] = []
    results_by_slug: dict[str, MarketplaceSearchBatch] = {}
    slug_order: list[str] = []

    for mp in mps:
        slug_order.append(mp.slug)
        sid = (mp.external_id or '').strip()
        if not sid:
            results_by_slug[mp.slug] = MarketplaceSearchBatch(
                slug=mp.slug,
                name=mp.name,
                store_front_id='',
                rows=[],
                error='No external_id (storeFrontId) in Django admin',
                http_ms=0.0,
            )
            continue
        tasks.append((mp.slug, mp.name, sid))

    max_workers = int(getattr(settings, 'BUYING_SWEEP_MAX_WORKERS', 8))
    max_workers = max(1, min(max_workers, len(tasks) or 1))

    def _work(item: tuple[str, str, str]) -> MarketplaceSearchBatch:
        slug, name, storefront = item
        rows, err, ms = _search_post_paginate(
            storefront,
            page_limit=page_limit,
            max_pages=max_pages,
            log_full_first_response=log_full_first_response,
            slug_for_log=slug,
        )
        return MarketplaceSearchBatch(
            slug=slug,
            name=name,
            store_front_id=storefront,
            rows=rows,
            error=err,
            http_ms=ms,
        )

    if len(tasks) == 1:
        b = _work(tasks[0])
        results_by_slug[b.slug] = b
    elif tasks:
        with ThreadPoolExecutor(max_workers=max_workers) as ex:
            futs = {ex.submit(_work, t): t[0] for t in tasks}
            for fut in as_completed(futs):
                b = fut.result()
                results_by_slug[b.slug] = b

    return [results_by_slug[s] for s in slug_order if s in results_by_slug]


def _extract_auction_objects(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if not isinstance(data, dict):
        return []
    for key in ('auctions', 'results', 'items', 'data'):
        v = data.get(key)
        if isinstance(v, list):
            return [x for x in v if isinstance(x, dict)]
    return []


def get_auction_detail(listing_id: str) -> dict[str, Any]:
    """
    GET auction.bstock.com/v1/auctions?listingId=...&limit=100

    Auth required. Returns the first auction object as a flat dict for merging, or {}.
    """
    if JWT_BSTOCK_CALLS_DISABLED:
        logger.warning(
            'JWT-backed B-Stock call disabled (ban prevention): %s', 'get_auction_detail'
        )
        return {}
    params: dict[str, Any] = {'listingId': listing_id, 'limit': 100}
    try:
        data = _request_json('GET', AUCTION_STATE_URL, params=params, auth=True)
    except BStockAuthError:
        raise
    if data is None:
        return {}
    auctions = _extract_auction_objects(data)
    if not auctions:
        return {}
    return auctions[0]


def _listing_id_from_auction_object(obj: dict[str, Any]) -> str | None:
    for k in ('listingId', 'listing_id'):
        v = obj.get(k)
        if v is not None and v != '':
            return str(v).strip()
    return None


def get_auction_states_batch(
    listing_ids: list[str],
    *,
    chunk_size: int = 25,
    auth: bool = False,
) -> dict[str, dict[str, Any]]:
    """
    GET auction.bstock.com/v1/auctions with comma-separated listingId (batch).

    Default ``auth=False``: anonymous GET (no JWT); public auction state including
    prices, bids, and timing (see bstock_api_research).

    With ``auth=True``, sends Authorization; when ``JWT_BSTOCK_CALLS_DISABLED`` is True,
    authenticated calls are skipped and {} is returned.

    Returns mapping listing_id -> auction state dict (last wins if duplicates).
    Chunks requests to respect URL length and rate limits.
    """
    if auth and JWT_BSTOCK_CALLS_DISABLED:
        logger.warning(
            'JWT-backed B-Stock call disabled (ban prevention): %s',
            'get_auction_states_batch',
        )
        return {}
    out: dict[str, dict[str, Any]] = {}
    seen: list[str] = []
    for raw in listing_ids:
        x = (raw or '').strip()
        if x and x not in seen:
            seen.append(x)
    for i in range(0, len(seen), chunk_size):
        chunk = seen[i : i + chunk_size]
        listing_param = ','.join(chunk)
        params: dict[str, Any] = {'listingId': listing_param, 'limit': 100}
        data = _request_json('GET', AUCTION_STATE_URL, params=params, auth=auth)
        if data is None:
            logger.warning(
                'Batch auction state returned no data for chunk starting %s', chunk[:1]
            )
            continue
        auctions = _extract_auction_objects(data)
        for obj in auctions:
            if not isinstance(obj, dict):
                continue
            lid = _listing_id_from_auction_object(obj)
            if lid:
                out[lid] = obj
        _delay_between_requests()
    return out


def get_lot_detail(lot_id: str) -> dict[str, Any]:
    """
    GET listing.bstock.com/v1/groups?lotId=...

    Auth required.
    """
    if JWT_BSTOCK_CALLS_DISABLED:
        logger.warning(
            'JWT-backed B-Stock call disabled (ban prevention): %s', 'get_lot_detail'
        )
        return {}
    params = {'lotId': lot_id}
    try:
        data = _request_json('GET', LISTING_GROUPS_URL, params=params, auth=True)
    except BStockAuthError:
        raise
    if data is None:
        return {}
    if isinstance(data, dict):
        return data
    return {'data': data}


@dataclass
class ManifestFetchResult:
    """Result of anonymous manifest GET pagination (for pull logs / SOCKS5 badge)."""

    rows: list[dict[str, Any]] | None
    api_calls: int
    duration_seconds: float


def _manifest_items_from_response(data: Any) -> tuple[list[dict[str, Any]], int | None, int]:
    """
    Parse one manifest API response page.

    Returns (item dicts, total count if given, number of items on this page).
    """
    if data is None:
        return [], None, 0
    if isinstance(data, list):
        rows = [x for x in data if isinstance(x, dict)]
        return rows, None, len(rows)
    if not isinstance(data, dict):
        return [], None, 0
    total_raw = data.get('total')
    total: int | None
    try:
        total = int(total_raw) if total_raw is not None else None
    except (TypeError, ValueError):
        total = None
    for key in ('items', 'rows', 'manifest', 'lines', 'data', 'results'):
        v = data.get(key)
        if isinstance(v, list):
            out = [x for x in v if isinstance(x, dict)]
            return out, total, len(out)
    return [data], total, 1


def _resolve_manifest_lot_id(
    lot_id: str | None,
    auction_id: int | None,
) -> str | None:
    resolved = (lot_id or '').strip()
    if not resolved and auction_id is not None:
        from apps.buying.models import Auction

        resolved = (
            Auction.objects.filter(pk=auction_id).values_list('lot_id', flat=True).first()
            or ''
        ).strip()
        if not resolved:
            logger.warning(
                'get_manifest: auction_id=%s has no lot_id; cannot fetch manifest',
                auction_id,
            )
            return None
    if not resolved:
        logger.warning('get_manifest: pass lot_id or auction_id with a valid lot_id')
        return None
    return resolved


def _fetch_manifest_paginated(
    resolved_lot_id: str,
    *,
    page_limit: int,
    max_rows: int,
) -> tuple[list[dict[str, Any]] | None, int]:
    """
    Returns (rows or None if empty and no partial data, api_calls).
    Partial accumulated data on first failed request after some rows still returns rows.
    """
    pl = max(1, min(int(page_limit), 1000))
    cap = max(1, int(max_rows))

    url = f'{ORDER_MANIFEST_BASE}/{resolved_lot_id}'
    accumulated: list[dict[str, Any]] = []
    offset = 0
    total: int | None = None
    max_iterations = cap
    api_calls = 0

    for round_i in range(max_iterations):
        params: dict[str, Any] = {
            'limit': pl,
            'offset': offset,
            'sortBy': 'attributes.description',
            'sortOrder': 'ASC',
            'exclude': 'metadata',
        }
        if offset == 0:
            try:
                hdrs = _headers_for_request('GET', False)
                prep = requests.Request('GET', url, params=params, headers=hdrs).prepare()
                logger.info(
                    'B-Stock manifest request (anonymous): method=%s url=%s',
                    prep.method,
                    prep.url,
                )
            except Exception as e:
                logger.warning('B-Stock manifest could not log prepared request: %s', e)

        api_calls += 1
        data = _request_json(
            'GET',
            url,
            params=params,
            auth=False,
            session=_manifest_http_session(),
        )
        if data is None:
            return (None if not accumulated else accumulated, api_calls)

        items, page_total, n = _manifest_items_from_response(data)
        if page_total is not None:
            total = page_total
        if round_i == 0 and total is not None:
            logger.info(
                'B-Stock manifest pagination: total=%s page_limit=%s (first page items=%s)',
                total,
                pl,
                n,
            )

        accumulated.extend(items)
        if len(accumulated) > cap:
            accumulated = accumulated[:cap]
            break
        if not items:
            break
        if total is not None and len(accumulated) >= total:
            break
        offset += n

    out = accumulated if accumulated else None
    return (out, api_calls)


def get_manifest(
    lot_id: str | None = None,
    *,
    auction_id: int | None = None,
    page_limit: int = 1000,
    max_rows: int = 10000,
) -> list[dict[str, Any]] | None:
    """
    GET order-process.bstock.com/v1/manifests/{lotId}?... (anonymous; no JWT).

    SOCKS5: same as other B-Stock traffic — ``_request_json`` applies the proxy
    for ``*.bstock.com`` when ``BUYING_SOCKS5_PROXY_ENABLED`` is True.

    Provide ``lot_id`` (B-Stock lot id path segment) and/or ``auction_id`` (Django
    ``Auction`` primary key). Non-empty ``lot_id`` wins over ``auction_id``.

    The API caps ``limit`` at 1000; larger values return 400 — we clamp ``page_limit``
    to 1..1000. Pagination stops at ``max_rows`` rows (default 10_000) or when the
    manifest is fully fetched, whichever comes first.
    """
    resolved = _resolve_manifest_lot_id(lot_id, auction_id)
    if not resolved:
        return None
    rows, _ = _fetch_manifest_paginated(resolved, page_limit=page_limit, max_rows=max_rows)
    return rows


def get_manifest_with_stats(
    lot_id: str | None = None,
    *,
    auction_id: int | None = None,
    page_limit: int = 1000,
    max_rows: int = 10000,
) -> ManifestFetchResult:
    """
    Same as ``get_manifest`` but returns API call count and wall duration for logging.
    """
    from django.conf import settings

    t0 = time.perf_counter()
    resolved = _resolve_manifest_lot_id(lot_id, auction_id)
    if not resolved:
        return ManifestFetchResult(
            rows=None,
            api_calls=0,
            duration_seconds=time.perf_counter() - t0,
        )
    rows, api_calls = _fetch_manifest_paginated(
        resolved, page_limit=page_limit, max_rows=max_rows
    )
    elapsed = time.perf_counter() - t0
    return ManifestFetchResult(
        rows=rows,
        api_calls=api_calls,
        duration_seconds=elapsed,
    )


def iter_manifest_pages(
    lot_id: str | None = None,
    *,
    auction_id: int | None = None,
    page_limit: int = 10,
    max_rows: int = 10000,
):
    """
    Generator that yields one manifest page (``list[dict]``) per HTTP call.

    Each iteration returns ``(items, api_calls_so_far, total_hint)``; ``total_hint``
    is the ``total`` field reported by the API when present (else None). Used by the
    two-worker API manifest pipeline so Worker 2 can start processing the first batch
    while Worker 1 keeps fetching. Mirrors ``_fetch_manifest_paginated`` pagination /
    cap semantics; uses the same session-reused HTTP path.
    """
    resolved = _resolve_manifest_lot_id(lot_id, auction_id)
    if not resolved:
        return
    pl = max(1, min(int(page_limit), 1000))
    cap = max(1, int(max_rows))

    url = f'{ORDER_MANIFEST_BASE}/{resolved}'
    offset = 0
    total: int | None = None
    api_calls = 0
    accumulated_count = 0

    for round_i in range(cap):
        params: dict[str, Any] = {
            'limit': pl,
            'offset': offset,
            'sortBy': 'attributes.description',
            'sortOrder': 'ASC',
            'exclude': 'metadata',
        }
        api_calls += 1
        data = _request_json(
            'GET',
            url,
            params=params,
            auth=False,
            session=_manifest_http_session(),
        )
        if data is None:
            return

        items, page_total, n = _manifest_items_from_response(data)
        if page_total is not None:
            total = page_total
        if round_i == 0 and total is not None:
            logger.info(
                'B-Stock manifest pagination (iterator): total=%s page_limit=%s (first page items=%s)',
                total,
                pl,
                n,
            )

        if not items:
            return

        room = cap - accumulated_count
        if len(items) > room:
            items = items[:room]

        accumulated_count += len(items)
        yield items, api_calls, total

        if accumulated_count >= cap:
            return
        if total is not None and accumulated_count >= total:
            return
        offset += n


def get_shipping_quotes(listing_id: str) -> dict[str, Any] | None:
    """
    GET shipment.bstock.com/v1/quotes?listingId=...&selected=true

    Auth required. Returns parsed JSON or None.
    """
    if JWT_BSTOCK_CALLS_DISABLED:
        logger.warning(
            'JWT-backed B-Stock call disabled (ban prevention): %s',
            'get_shipping_quotes',
        )
        return {}
    params = {'listingId': listing_id, 'selected': 'true'}
    try:
        return _request_json('GET', SHIPMENT_QUOTES_URL, params=params, auth=True)
    except BStockAuthError:
        raise


def get_unique_bid_counts(auction_ids_csv: str) -> dict[str, Any] | None:
    """
    GET auction.bstock.com/v1/auctions/bids/unique?auctionId=...

    Comma-separated auction ids. Auth required.
    """
    if JWT_BSTOCK_CALLS_DISABLED:
        logger.warning(
            'JWT-backed B-Stock call disabled (ban prevention): %s',
            'get_unique_bid_counts',
        )
        return {}
    params = {'auctionId': auction_ids_csv, 'limit': 100}
    try:
        return _request_json('GET', AUCTION_UNIQUE_BIDS_URL, params=params, auth=True)
    except BStockAuthError:
        raise
