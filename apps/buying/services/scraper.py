"""
B-Stock microservice HTTP client. Endpoints are fixed infrastructure URLs.

Search listings POST does not require auth. **Auction state** GET
(``auction.bstock.com/v1/auctions``) works anonymously by default via
``get_auction_states_batch(auth=False)``. Other listing and shipment calls normally require a
JWT; when ``JWT_BSTOCK_CALLS_DISABLED`` is True (ban prevention),
**authenticated** calls are skipped-see each function's guard. The exceptions send only the
login the owner hands over from the daily routine: ``fetch_manifest_items``,
``fetch_shipping_quote``, and the search for signed-in-only sellers such as Costco
(``Marketplace.requires_login``), which B-Stock hides from anonymous search.

When ``BUYING_SOCKS5_PROXY_ENABLED`` is True, ``*.bstock.com`` requests made via
``_request_json`` use that SOCKS5 proxy, except the authenticated manifest pull
(``fetch_manifest_items``), which always goes direct with the owner's login. Dev opt-in
``BUYING_SOCKS5_DEV_AUDIT`` logs the redacted proxy URL per request and probes
egress IP through the same proxy (see ``logs/bstock_api.log``).

Token resolution for authenticated calls (first match wins):

1. The ``BStockToken`` row the owner hands over from the daily routine
2. File ``workspace/.bstock_token`` (from ``python manage.py bstock_token``)
3. Environment variable ``BSTOCK_AUTH_TOKEN``

The manifest pull uses only (1), passed in explicitly as ``bearer``.

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
from collections.abc import Callable
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

# Ban prevention: skip JWT-backed B-Stock HTTP calls. Public search (`discover_auctions`) is unchanged.
# fetch_manifest_items is exempt: it sends the login the owner handed over for manifests.
# Set False to re-enable authenticated endpoints.
JWT_BSTOCK_CALLS_DISABLED = True

SEARCH_LISTINGS_URL = 'https://search.bstock.com/v1/all-listings/listings'
LISTING_GROUPS_URL = 'https://listing.bstock.com/v1/groups'
AUCTION_STATE_URL = 'https://auction.bstock.com/v1/auctions'
AUCTION_UNIQUE_BIDS_URL = 'https://auction.bstock.com/v1/auctions/bids/unique'
SHIPMENT_QUOTES_URL = 'https://shipment.bstock.com/v1/quotes'
# Full manifests need the buyer's JWT; anonymous callers get a 10-line preview.
ORDER_MANIFEST_URL = 'https://order-process.bstock.com/v1/manifests'

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


class BStockUnavailable(Exception):
    """B-Stock or the network did not answer usefully (timeout, 5xx, rate limit). Try later."""


class BStockLotError(Exception):
    """One lot's manifest cannot be had (404, other 4xx): record it on that auction only."""

    def __init__(self, message: str, *, permanent: bool = False):
        super().__init__(message)
        self.permanent = permanent


class BStockLotRefused(Exception):
    """
    B-Stock refused the authenticated call for one lot (400, 403, or the anonymous preview).

    Ambiguous: an expired or ignored login looks like this, and so does a lot this buyer may
    not see. The pull job decides: two different lots refused in a row means the login.
    """


class BStockHTTPError(Exception):
    """A non-2xx answer, raised only by ``_request_json(raise_errors=True)`` (an authenticated 401 raises ``BStockAuthError``)."""

    def __init__(self, status_code: int, message: str = ''):
        super().__init__(message or f'B-Stock answered HTTP {status_code}')
        self.status_code = status_code


AUTH_TOKEN_EXPIRED_MESSAGE = 'Token expired. Run: python manage.py bstock_token'

# A long Retry-After would stall a pull job past its heartbeat; give up and try later instead.
RETRY_AFTER_CAP_SECONDS = 60.0


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


def _db_token_value() -> str:
    """Newest unexpired token handed over from bstock.com (see ``bstock_token_store``)."""
    try:
        from apps.buying.services.bstock_token_store import current_token

        return current_token()
    except Exception as e:  # no table yet (early migrate), or DB down
        logger.debug('B-Stock DB token unavailable: %s', e)
        return ''


def _auth_token_value() -> str:
    db_token = _db_token_value()
    if db_token:
        return db_token
    file_token = _read_token_from_file()
    if file_token:
        return file_token
    raw = (getattr(settings, 'BSTOCK_AUTH_TOKEN', '') or '').strip()
    if raw.lower().startswith('bearer '):
        return raw[7:].strip()
    return raw


def bstock_token_available() -> bool:
    """True when a JWT is available for authenticated B-Stock HTTP (DB, file, or env)."""
    return bool(_auth_token_value())


def get_auth_headers() -> dict[str, str]:
    """Return BASE_HEADERS plus Authorization. Used for authenticated calls only."""
    token = _auth_token_value()
    if not token:
        raise ValueError(
            'No B-Stock token. Hand one over from the Pull B-Stock manifests routine, run '
            'python manage.py bstock_token (writes workspace/.bstock_token), or set '
            'BSTOCK_AUTH_TOKEN in .env.'
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


def jwt_expiry(token: str) -> datetime | None:
    """The JWT's ``exp`` as an aware datetime, read without verifying; None if unreadable."""
    parts = (token or '').split('.')
    if len(parts) < 2:
        return None
    payload_b64 = parts[1] + '=' * (-len(parts[1]) % 4)
    try:
        data = json.loads(base64.urlsafe_b64decode(payload_b64).decode('utf-8'))
        return datetime.fromtimestamp(int(data['exp']), tz=timezone.utc)
    except (KeyError, TypeError, ValueError, UnicodeDecodeError, OverflowError, OSError):
        return None


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
    raise_errors: bool = False,
    bearer: str | None = None,
) -> Any | None:
    """
    Perform one HTTP request and return parsed JSON.

    On 401 with auth=True, raises BStockAuthError (no retry).
    On 403, logs and returns None.
    On 429, retries with exponential backoff up to BSTOCK_MAX_RETRIES (Retry-After capped
    at ``RETRY_AFTER_CAP_SECONDS``).
    Network errors: log and return None.

    ``raise_errors``: instead of returning None, raise ``BStockUnavailable`` (network error,
    5xx, rate limit after retries, empty or non-JSON body) or ``BStockHTTPError`` (any
    other non-2xx, including 401 on an anonymous call). ``proxies={}`` forces a direct call.
    ``bearer``: send exactly this token (implies ``auth``) instead of resolving one.
    """
    max_retries = int(getattr(settings, 'BSTOCK_MAX_RETRIES', 3))
    if bearer:
        auth = True
        headers = _headers_for_request(method, False)
        headers['Authorization'] = f'Bearer {bearer}'
    else:
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
    # A bad token can put its own text in a requests exception; never log that.
    redact = auth

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
            detail = type(e).__name__ if redact else str(e)
            logger.error('B-Stock request error %s %s: %s', method, url[:160], detail)
            if raise_errors:
                raise BStockUnavailable(f'B-Stock did not answer ({type(e).__name__}).') from e
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
            if raise_errors:
                raise BStockHTTPError(401)
            return None

        if resp.status_code == 403:
            logger.warning(
                'B-Stock 403 Forbidden (access denied or marketplace not available): %s',
                url[:160],
            )
            if raise_errors:
                raise BStockHTTPError(403)
            return None

        if resp.status_code == 429:
            retry_after = resp.headers.get('Retry-After')
            wait = backoff_base * (2**attempt)
            if retry_after:
                try:
                    wait = max(wait, float(retry_after))
                except ValueError:
                    pass
            wait = min(wait, RETRY_AFTER_CAP_SECONDS)
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
            if raise_errors:
                raise BStockUnavailable('B-Stock is rate limiting right now.')
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
            if raise_errors:
                if resp.status_code >= 500:
                    raise BStockUnavailable(f'B-Stock answered HTTP {resp.status_code}.')
                raise BStockHTTPError(resp.status_code)
            return None

        if not (resp.content or '').strip():
            if raise_errors:
                raise BStockUnavailable('B-Stock answered with an empty body.')
            return None

        try:
            return resp.json()
        except (json.JSONDecodeError, ValueError) as e:
            logger.error('B-Stock response is not JSON: %s body_preview=%r', e, resp.text[:400])
            if raise_errors:
                raise BStockUnavailable('B-Stock answered with something that is not JSON.') from e
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
    bearer: str | None = None,
) -> tuple[list[dict[str, Any]], str | None, float]:
    """
    POST all pages for one storeFrontId. Returns (rows, error_or_none, total_elapsed_ms).

    ``bearer``: search as the owner (a signed-in-only seller such as Costco), direct, never
    through SOCKS5. Anonymous otherwise.

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
        try:
            data = _request_json(
                'POST',
                SEARCH_LISTINGS_URL,
                json_body=body,
                auth=False,
                timeout=120,
                bearer=bearer,
                proxies={} if bearer else None,
            )
        except BStockAuthError:
            return all_rows, 'B-Stock refused the login for this search.', http_ms_total
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

    bearer = None
    if getattr(mp, 'requires_login', False):
        bearer = login_for_signed_in_sellers([mp])
        if not bearer:
            logger.info('%s: %s', marketplace_slug, LOGIN_NEEDED_FOR_SEARCH)
            return []
    rows, _err, _ms = _search_post_paginate(
        storefront,
        page_limit=page_limit,
        max_pages=max_pages,
        log_full_first_response=log_full_first_response,
        slug_for_log=marketplace_slug,
        bearer=bearer,
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


LOGIN_NEEDED_FOR_SEARCH = (
    'Signed-in only on B-Stock: send your login from the Pull B-Stock manifests routine to load it.'
)


def login_for_signed_in_sellers(marketplaces: list[Any]) -> str:
    """The owner's handed-over login when any of these sellers is signed-in only, else ''."""
    if not any(getattr(mp, 'requires_login', False) for mp in marketplaces):
        return ''
    from apps.buying.services.bstock_token_store import current_token

    return current_token()


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

    tasks: list[tuple[str, str, str, str | None]] = []
    results_by_slug: dict[str, MarketplaceSearchBatch] = {}
    slug_order: list[str] = []
    login = login_for_signed_in_sellers(mps)

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
        bearer = None
        if getattr(mp, 'requires_login', False):
            if not login:
                results_by_slug[mp.slug] = MarketplaceSearchBatch(
                    slug=mp.slug,
                    name=mp.name,
                    store_front_id=sid,
                    rows=[],
                    error=LOGIN_NEEDED_FOR_SEARCH,
                    http_ms=0.0,
                )
                continue
            bearer = login
        tasks.append((mp.slug, mp.name, sid, bearer))

    max_workers = int(getattr(settings, 'BUYING_SWEEP_MAX_WORKERS', 8))
    max_workers = max(1, min(max_workers, len(tasks) or 1))

    def _work(item: tuple[str, str, str, str | None]) -> MarketplaceSearchBatch:
        slug, name, storefront, bearer = item
        rows, err, ms = _search_post_paginate(
            storefront,
            page_limit=page_limit,
            max_pages=max_pages,
            log_full_first_response=log_full_first_response,
            slug_for_log=slug,
            bearer=bearer,
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


@dataclass
class ShippingQuote:
    """B-Stock's freight quote for one listing to the buyer's saved address."""

    amount_cents: int
    carrier: str = ''
    mode: str = ''  # TL (truckload) or LTL
    trucks: int | None = None
    destination_zip: str = ''
    quote_id: str = ''
    quoted_at: str = ''  # B-Stock's own timestamp (ISO)

    def info(self) -> dict[str, Any]:
        return {
            'carrier': self.carrier,
            'mode': self.mode,
            'trucks': self.trucks,
            'destination_zip': self.destination_zip,
            'quote_id': self.quote_id,
            'quoted_at': self.quoted_at,
        }


def pick_shipping_quote(data: Any) -> ShippingQuote | None:
    """The selected active quote in a ``/v1/quotes`` body (else the first active one), or None."""
    quotes = data.get('quotes') if isinstance(data, dict) else None
    if not isinstance(quotes, list):
        return None
    usable = [
        q
        for q in quotes
        if isinstance(q, dict)
        and q.get('active', True) is not False
        and isinstance(q.get('totalPrice'), (int, float))
        and not isinstance(q.get('totalPrice'), bool)
        and q['totalPrice'] > 0
    ]
    if not usable:
        return None
    q = next((q for q in usable if q.get('selected')), usable[0])
    carrier = q.get('carrier') if isinstance(q.get('carrier'), dict) else {}
    destination = q.get('destination') if isinstance(q.get('destination'), dict) else {}
    trucks = q.get('truckCount')
    return ShippingQuote(
        amount_cents=int(round(q['totalPrice'])),
        carrier=str(carrier.get('name') or carrier.get('code') or '')[:80],
        mode=str(q.get('transportMode') or '')[:20],
        trucks=trucks if isinstance(trucks, int) and not isinstance(trucks, bool) else None,
        destination_zip=str(destination.get('zip') or '')[:20],
        quote_id=str(q.get('_id') or '')[:40],
        quoted_at=str(q.get('updatedAt') or q.get('createdAt') or '')[:40],
    )


def fetch_shipping_quote(
    listing_id: str,
    *,
    bearer: str,
    session: requests.Session | None = None,
) -> ShippingQuote | None:
    """
    GET shipment.bstock.com/v1/quotes?listingId=...&selected=true with the login the owner
    handed over. Returns the quote to the buyer's address, or None when B-Stock has none yet
    (it makes one when the buyer opens the listing). Like ``fetch_manifest_items`` this is
    exempt from ``JWT_BSTOCK_CALLS_DISABLED`` and always goes direct, never through SOCKS5.

    Raises ``BStockAuthError`` (401), ``BStockUnavailable``, or ``BStockHTTPError``.
    """
    data = _request_json(
        'GET',
        SHIPMENT_QUOTES_URL,
        params={'listingId': listing_id, 'selected': 'true'},
        bearer=bearer,
        session=session,
        proxies={},
        raise_errors=True,
    )
    return pick_shipping_quote(data)


# The anonymous preview is this many lines; a page this small with more to come is not a manifest.
MANIFEST_PREVIEW_LINES = 10
# Hard stop on requests for one manifest, whatever page size B-Stock honours.
MAX_MANIFEST_CALLS = 25


@dataclass
class ManifestFetch:
    """One manifest download: unique rows, what the API said the total was, and cost."""

    items: list[dict[str, Any]]
    total: int | None
    api_calls: int
    complete: bool
    # '' when complete; 'preview' (anonymous 10 lines), 'too_large', 'unstable' (paging
    # gave duplicate or missing lines), or 'too_many_calls'.
    reason: str = ''


def fetch_manifest_items(
    lot_id: str,
    *,
    bearer: str | None = None,
    auth: bool = True,
    page_delay_seconds: float = 0.5,
    max_rows: int = 10000,
    session: requests.Session | None = None,
    on_page: Callable[[], None] | None = None,
) -> ManifestFetch:
    """
    Page through ``GET order-process.bstock.com/v1/manifests/{lotId}``, sorted by ``_id``.

    With the buyer's JWT (``bearer``, the owner's handed-over login) B-Stock answers up to
    1,000 lines a page. Without it every page is the same first 10 lines (``offset`` and
    ``limit`` come back as 0 and 10). This is the one JWT call ``JWT_BSTOCK_CALLS_DISABLED``
    does not block: the owner hands over the token for exactly this.

    Authenticated calls go direct, never through the SOCKS5 pool: the owner's login showing
    up from rotating foreign IPs would look like a stolen session.

    Raises (each with ``api_calls`` set):
    - ``BStockAuthError``: 401, the login is refused outright.
    - ``BStockLotRefused``: 400 / 403, or the anonymous preview despite the token. One lot or
      the login; the caller decides.
    - ``BStockLotError``: 404 or another 4xx for this lot (``permanent`` for 404).
    - ``BStockUnavailable``: timeout, 5xx, rate limit after retries, a reply with no items.

    ``on_page`` runs after every page (the pull job's heartbeat; it may raise to abort).
    Rows are de-duplicated by ``_id``; ``complete`` is True only when the unique count
    reaches ``total`` (or, with no ``total``, when a short page ends the list).
    """
    url = f'{ORDER_MANIFEST_URL}/{quote(lot_id.strip(), safe="")}'
    session = session or requests.Session()
    authed = bool(auth or bearer)
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    total: int | None = None
    api_calls = 0
    page_limit = 1000

    def result(complete: bool, reason: str = '') -> ManifestFetch:
        return ManifestFetch(items=items, total=total, api_calls=api_calls, complete=complete, reason=reason)

    def tagged(exc: Exception) -> Exception:
        exc.api_calls = api_calls  # type: ignore[attr-defined]
        return exc

    offset = 0
    while True:
        if api_calls >= MAX_MANIFEST_CALLS:
            return result(False, 'too_many_calls')
        if api_calls and page_delay_seconds > 0:
            time.sleep(page_delay_seconds)
        api_calls += 1
        try:
            data = _request_json(
                'GET',
                url,
                params={
                    'limit': page_limit,
                    'offset': offset,
                    'sortBy': '_id',
                    'sortOrder': 'ASC',
                    'exclude': 'metadata',
                },
                auth=auth,
                bearer=bearer,
                session=session,
                proxies={} if authed else None,
                raise_errors=True,
            )
        except (BStockAuthError, BStockUnavailable) as e:
            raise tagged(e)
        except BStockHTTPError as e:
            if authed and e.status_code == 401:
                raise tagged(BStockAuthError('B-Stock refused the login (HTTP 401).')) from e
            if authed and e.status_code in (400, 403):
                raise tagged(BStockLotRefused(f'B-Stock refused this lot (HTTP {e.status_code}).')) from e
            if e.status_code == 404:
                raise tagged(
                    BStockLotError('B-Stock has no manifest for this lot (HTTP 404).', permanent=True)
                ) from e
            raise tagged(BStockLotError(f'B-Stock answered HTTP {e.status_code} for this lot.')) from e
        if on_page is not None:
            try:
                on_page()
            except Exception as e:
                raise tagged(e)
        if not isinstance(data, dict) or not isinstance(data.get('items'), list):
            raise tagged(BStockUnavailable('B-Stock answered without a manifest.'))
        try:
            total = int(data['total']) if data.get('total') is not None else total
        except (TypeError, ValueError):
            pass
        if api_calls == 1 and total is not None and total > max_rows:
            return result(False, 'too_large')
        page = [row for row in data['items'] if isinstance(row, dict)]
        echoed_offset = data.get('offset')
        echoed_limit = data.get('limit')
        more_expected = total is not None and offset + len(page) < total
        preview = (echoed_offset is not None and echoed_offset != offset) or (
            more_expected
            and isinstance(echoed_limit, int)
            and echoed_limit <= MANIFEST_PREVIEW_LINES
        )
        if preview:
            if authed:
                raise tagged(BStockLotRefused('B-Stock sent only the 10-line preview for this lot.'))
            if api_calls == 1:
                items.extend(page)
            return result(False, 'preview')
        for row in page:
            key = str(row.get('_id') or '')
            if key and key in seen:
                continue
            if key:
                seen.add(key)
            items.append(row)
        offset += len(page)
        if not page:
            break
        if total is None:
            # No total: keep going while pages come back full.
            size = echoed_limit if isinstance(echoed_limit, int) and echoed_limit > 0 else page_limit
            if len(page) < size:
                break
            if len(items) > max_rows:
                return result(False, 'too_large')
            continue
        if offset >= total:
            break
    if total is not None and len(items) != total:
        return result(False, 'unstable')
    return result(True)
