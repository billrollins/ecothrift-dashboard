"""Stock photos: the maker's or a large retailer's own picture of a product, for the phone site (Dash Update #185).

Owner, 2026-11-19: "yes we need this scheduled for daily. Pick the best items we have ensure they have nice stock photos.
need a small disclaimer once you do click into the product details". And: "NEVER EVER EVER use photos you got from us for
other purposes. like the add item photos. you CAN use the photo sheets photos."

**The finder** (``find_stock_photo``, also for the processing work that will look up truck pieces):

1. A piece already holding a found or approved photo, or a miss or a rejection not yet due, is returned as it is.
2. **Reuse:** another row with the same ``match_key`` (a valid UPC/EAN, else brand + model) and a public photo: its
   picture is reused, no AI call.
3. **The seller's manifest photo** (free, no AI): Wayfair truck manifests carry an "Image URL" per row, kept in the
   preprocessing row's ``raw_row``. Its address is a placeholder ("No Image Available"); ``manifest_image_url`` rebuilds
   the real one from the image id. Downloaded with the checks of step 5 (the placeholder refused) and saved as found:
   the seller's own photo of that SKU, lifestyle shots included; staff reject a wrong one in admin.
4. **Web search**, only when ``storefront.stock_photos_web`` is on (default OFF: the first real check found 0 of 7 at
   $0.068 each; the big retailers block the fetch). One routed call, Settings > AI purpose ``STOREFRONT_STOCK_PHOTO``, default Claude Sonnet 5.5 at medium,
   with Anthropic's web search and web fetch): identifiers first (UPC/EAN, ASIN, the retailer's item number), then brand +
   model, then the title; the maker's or a large retailer's page for THAT product; the URL of its main image. It answers
   through ``report_photo``. The answer tool rides in ``server_tools`` so the call's tool choice stays "auto": a forced
   tool would make the model answer before it searches. No answer = a miss.
5. **Download** by the server itself: https, a public host, at most 3 redirects, 8 s, 6 MB, an image content type, at
   least 400 px on its short side.
6. **Check** (web search only; a second, cheap call, purpose ``STOREFRONT_PHOTO_CHECK``, default Gemini 3.8 Flash at
   low; the image as ``add_item.ai_image_block`` makes it): does it show this product, and is it a clean product photo?
7. **Accept** when confidence >= 0.7, same product and clean: saved as a JPEG (long side 640 px, quality 82) under
   ``storefront/stock/``. Anything else is a miss (``none``), tried again in 30 days; an API failure, tomorrow.

Both calls log under ``storefront_stock_photos`` (the Owner page's AI spend). A person takes a wrong photo off with
Django admin > Stock photos > Reject (not searched again for 90 days).

**The daily run** (``daily``; ``manage.py storefront_stock_photos``; the end of ``materialize_routines``), no new
look-up after 10 minutes in all; a product with a photo-sheet photo uses that and is skipped:

1. **Manifest pass (free):** every in-store product with a shown retail, no photo and no miss still waiting, whose
   manifest has the seller's photo, best saving first; at most ``storefront.stock_photos_manifest_daily`` downloads
   (default 300).
2. **Web search (paid, only when ``storefront.stock_photos_web`` is on; default off):** the products the snapshot ranks
   best (shown retail, retail less price, at most 2 per category), top 40, still without a photo; at most
   ``storefront.stock_photos_daily`` (default 25).

``storefront.stock_photos`` = "off" turns the whole run off (default on).
"""
from __future__ import annotations

import io
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal
from urllib.parse import urljoin, urlparse

from django.core.files.base import ContentFile
from django.utils import timezone

from apps.storefront.models import StockPhoto

logger = logging.getLogger(__name__)

SOURCE = 'storefront_stock_photos'
FINDER_PURPOSE, FINDER_MODEL, FINDER_EFFORT = 'STOREFRONT_STOCK_PHOTO', 'claude-sonnet-5-5', 'medium'
CHECK_PURPOSE, CHECK_MODEL, CHECK_EFFORT = 'STOREFRONT_PHOTO_CHECK', 'gemini-3.8-flash', 'low'

SWITCH_KEY = 'storefront.stock_photos'
WEB_KEY = 'storefront.stock_photos_web'   # the AI web search; default off
DAILY_KEY = 'storefront.stock_photos_daily'   # web search look-ups a day
DAILY_DEFAULT = 25
MANIFEST_DAILY_KEY = 'storefront.stock_photos_manifest_daily'   # manifest photo downloads a run
MANIFEST_DAILY_DEFAULT = 300
CANDIDATES = 40
DAILY_SECONDS = 10 * 60          # no new look-up starts after this
MIN_CONFIDENCE = 0.7
MISS_DAYS = 30
REJECT_DAYS = 90
ERROR_DAYS = 1

# The download
TIMEOUT = 8
MAX_BYTES = 6 * 1024 * 1024
REDIRECTS = 3
MIN_SHORT_SIDE = 400
SAVE_EDGE = 640
SAVE_QUALITY = 82

# The seller's manifest photo
IMAGE_KEYS = ('Image URL', 'Image Url', 'image_url', 'Image')
MANIFEST_WHY = "The seller's manifest photo."
WFCDN_HOST = re.compile(r'(^|\.)wfcdn\.com$', re.I)
WFCDN_ID = re.compile(r'/(\d{5,})/[^/]*$')
WFCDN_REAL = 'https://assets.wfcdn.com/im/1/resize-h800-w800%5Ecompr-r85/{head}/{id}/x.jpg'
PLACEHOLDER_SIZE = (513, 321)        # Wayfair's "No Image Available" picture
PLACEHOLDER_BYTES = 37317

WEB_TOOLS = [
    {'type': 'web_search_20260209', 'name': 'web_search', 'max_uses': 4},
    {'type': 'web_fetch_20260209', 'name': 'web_fetch', 'max_uses': 4, 'max_content_tokens': 25000},
]

REPORT = 'report_photo'
REPORT_TOOL = {
    'name': REPORT,
    'description': 'Report the product page and its main product image. Call it once, last.',
    'strict': True,
    'input_schema': {
        'type': 'object',
        'properties': {
            'image_url': {'type': 'string', 'description': 'Direct https URL of the main product image; "" if none.'},
            'page_url': {'type': 'string', 'description': 'The product page it is on; "" if none.'},
            'confidence': {'type': 'number', 'description': '0 to 1: how sure this is THIS exact product.'},
            'why': {'type': 'string', 'description': 'One short sentence.'},
        },
        'required': ['image_url', 'page_url', 'confidence', 'why'],
        'additionalProperties': False,
    },
}

FINDER_SYSTEM = """You find the official product photo of one product, for a thrift store's website. The store sells \
this exact product; its page shows the maker's or a big retailer's own picture of it.

How to search, best first:
1. The identifiers you are given (UPC/EAN, ASIN, the retailer's item number): search them.
2. Brand + model number.
3. The title.
Find the maker's own product page or a large retailer's page (Amazon, Walmart, Target, Home Depot, Lowe's, Wayfair, \
Best Buy, Costco, Kohl's and the like) for THAT product: same brand, same model, same design. Open the page with web_fetch \
and take the URL of its main product image: the large picture of the product itself (not a thumbnail, logo, banner, \
icon, video still, lifestyle scene or a picture of a different variant). Prefer the largest size the page offers.

Rules:
- image_url must be a direct https link to the image file, copied from a page you opened. Never make one up.
- If you are not sure it is the same product, say so with a low confidence. A wrong photo is worse than none.
- If you find nothing, report empty strings and confidence 0.
- Finish by calling report_photo exactly once. Never answer in plain text."""

CHECK = 'check_photo'
CHECK_TOOL = {
    'name': CHECK,
    'description': 'Whether the photo shows this product and is a clean product photo.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'same_product': {'type': 'boolean'},
            'clean': {'type': 'boolean'},
            'why': {'type': 'string', 'description': 'One short sentence.'},
        },
        'required': ['same_product', 'clean', 'why'],
    },
}

CHECK_SYSTEM = """You check one photo for a thrift store's website before it is shown as the product's stock photo.

same_product: true only when the photo clearly shows the product described (the same kind of thing, and the same \
brand, model and design when they are given). A different product, a different model, an accessory, a box only, or a \
picture you cannot tell is false.
clean: true only when it is a clean product photo: the product itself as the subject, on a plain or white background or \
a simple studio setting. False for added text banners or badges, a watermark, a collage or several views in one image, \
a person as the subject, a drawing, a placeholder, or a blurry or tiny picture.
Answer by calling check_photo."""


class Miss(Exception):
    """Nothing usable this time; the words go in ``why``."""


# ── Identifiers and the match key ─────────────────────────────────────────────

def _gtin_ok(digits: str) -> bool:
    """A UPC/EAN/GTIN with a right check digit (a spreadsheet's 196507000000 is not one)."""
    if len(digits) not in (8, 12, 13, 14) or len(set(digits)) == 1:
        return False
    body, check = digits[:-1], int(digits[-1])
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def _gtin(value: str) -> str:
    """One UPC/EAN as 12 digits (UPC-A) or 13 (EAN), or '' for junk: a wrong check digit, or a number a spreadsheet
    rounded (196507000000: six or more zeros at the end). 047406182350 and 0047406182350 are the same code."""
    digits = re.sub(r'\D', '', str(value or ''))
    if not _gtin_ok(digits):
        return ''
    if len(digits) >= 12 and digits.endswith('000000'):
        return ''
    if len(digits) == 8:  # an EAN-8 / UPC-E stays as it is
        return digits
    core = digits.lstrip('0')
    return core.zfill(12) if len(core) <= 12 else core


def _values(raw) -> list[str]:
    if raw is None:
        return []
    items = raw if isinstance(raw, (list, tuple)) else [raw]
    out = []
    for item in items:
        out += [v.strip() for v in re.split(r'[,;\s]+', str(item)) if v.strip()]
    return out


def clean_identifiers(raw: dict | None) -> dict[str, list[str]]:
    """``{"gtin": [...], "asin": [...], "item_number": [...]}`` from a Product's or ManifestRow's ``identifiers`` (or a
    profile's ``aliases``): junk dropped (a UPC with a wrong check digit, an over-long number)."""
    out: dict[str, list[str]] = {'gtin': [], 'asin': [], 'item_number': []}
    if not isinstance(raw, dict):
        return out
    for name, value in raw.items():
        name = str(name).lower()
        for v in _values(value):
            if name in ('upc', 'upcs', 'ean', 'eans', 'gtin', 'gtins'):
                digits = _gtin(v)
                if digits and digits not in out['gtin']:
                    out['gtin'].append(digits)
            elif name in ('asin', 'asins'):
                if re.fullmatch(r'[A-Z0-9]{10}', v.upper()) and v.upper() not in out['asin']:
                    out['asin'].append(v.upper())
            elif name in ('item_number', 'sku', 'tcin', 'dpci', 'item', 'model_number'):
                if 3 <= len(v) <= 40 and v not in out['item_number']:
                    out['item_number'].append(v)
    return out


def merge_identifiers(*many: dict | None) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {'gtin': [], 'asin': [], 'item_number': []}
    for raw in many:
        for name, values in clean_identifiers(raw).items():
            out[name] += [v for v in values if v not in out[name]]
    return out


def _norm(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', (text or '').lower())


def _brand(brand: str) -> str:
    brand = (brand or '').strip()
    return '' if _norm(brand) in ('', 'generic', 'unbranded', 'unknown', 'na', 'none') else brand


def match_key(ids: dict[str, list[str]], brand: str = '', model: str = '') -> str:
    """``gtin:<14 digits>`` when there is a valid UPC/EAN, else ``bm:<brand>|<model>``, else '' (never reused)."""
    if ids.get('gtin'):
        return 'gtin:' + ids['gtin'][0].zfill(14)
    b, m = _norm(_brand(brand)), _norm(model)
    if b and len(m) >= 3:
        return f'bm:{b}|{m}'[:200]
    return ''


# ── The models (Settings > AI) ────────────────────────────────────────────────

def _choice(purpose: str, default_model: str, default_effort: str, *, anthropic: bool = False) -> tuple[str, str]:
    """The model and effort Settings > AI gives the purpose (its own, else its tier's); the defaults when it has
    neither (never ``settings.AI_MODEL``). The finder searches the web, which needs a Claude model."""
    from apps.core.ai_config import resolve
    from apps.core.services.llm_router import resolve_provider

    r = resolve(purpose)
    slug = r['model'] if r['model_from'] != 'env' else ''
    if not slug or (anthropic and resolve_provider(slug) != 'anthropic'):
        slug = default_model
    effort = r['effort'] if r['effort_from'] != 'none' else default_effort
    return slug, effort


def _cost(result) -> Decimal:
    from apps.core.services.ai_usage_log import WEB_SEARCH_USD, estimate_cost_usd

    return estimate_cost_usd(result.model_used, result.input_tokens, result.output_tokens, result.cache_creation_tokens,
                             result.cache_read_tokens) + WEB_SEARCH_USD * (result.web_search_requests or 0)


def _failed(model: str, purpose: str, started: float, detail: str, exc: Exception) -> None:
    from apps.core.services.ai_usage_log import log_ai_usage

    log_ai_usage(SOURCE, model, purpose=purpose, duration_ms=int((time.monotonic() - started) * 1000), detail=detail,
                 success=False, error=str(exc)[:500])


# ── The calls ─────────────────────────────────────────────────────────────────

@dataclass
class Facts:
    key: str
    title: str
    brand: str = ''
    model: str = ''
    ids: dict = field(default_factory=dict)
    avoid: str = ''  # an image a person rejected

    def as_text(self) -> str:
        lines = [f'Title: {self.title}']
        if self.brand:
            lines.append(f'Brand: {self.brand}')
        if self.model:
            lines.append(f'Model: {self.model}')
        if self.ids.get('gtin'):
            lines.append('UPC/EAN: ' + ', '.join(self.ids['gtin'][:3]))
        if self.ids.get('asin'):
            lines.append('Amazon ASIN: ' + ', '.join(self.ids['asin'][:3]))
        if self.ids.get('item_number'):
            lines.append("Retailer's item number: " + ', '.join(self.ids['item_number'][:3]))
        return '\n'.join(lines)


def _search(facts: Facts) -> tuple[dict | None, Decimal, dict]:
    """The finder's answer (or None), its cost, and what it used."""
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete

    model, effort = _choice(FINDER_PURPOSE, FINDER_MODEL, FINDER_EFFORT, anthropic=True)
    ask = facts.as_text()
    if facts.avoid:
        ask += f'\n\nA person rejected this image for this product; do not report it again: {facts.avoid}'
    started = time.monotonic()
    try:
        result = llm_complete(
            model_id=model, effort=effort, system=FINDER_SYSTEM, user=ask, max_tokens=4000, timeout=150,
            # The answer tool goes with the server tools: the tool choice stays "auto", so the model searches first.
            server_tools=[*WEB_TOOLS, REPORT_TOOL], tool_name=REPORT,
            log_source=SOURCE, log_purpose=FINDER_PURPOSE, log_detail=f'{facts.key} find',
        )
    except (LLMAPIError, LLMConfigError) as exc:
        _failed(model, FINDER_PURPOSE, started, f'{facts.key} find', exc)
        raise
    used = {'model': result.model_used, 'searches': result.web_search_requests, 'fetches': result.web_fetch_requests}
    return (result.tool_input if isinstance(result.tool_input, dict) else None), _cost(result), used


def _check(facts: Facts, raw: bytes) -> tuple[dict | None, Decimal]:
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete
    from apps.inventory.services.add_item import ai_image_block

    model, effort = _choice(CHECK_PURPOSE, CHECK_MODEL, CHECK_EFFORT)
    content = [{'type': 'text', 'text': 'The product:\n' + facts.as_text()}, ai_image_block(raw)]
    started = time.monotonic()
    try:
        result = llm_complete(
            model_id=model, effort=effort, system=CHECK_SYSTEM, messages=[{'role': 'user', 'content': content}],
            tools=[CHECK_TOOL], tool_name=CHECK, max_tokens=1000, timeout=60,
            log_source=SOURCE, log_purpose=CHECK_PURPOSE, log_detail=f'{facts.key} check',
        )
    except (LLMAPIError, LLMConfigError) as exc:
        _failed(model, CHECK_PURPOSE, started, f'{facts.key} check', exc)
        raise
    return (result.tool_input if isinstance(result.tool_input, dict) else None), _cost(result)


def download(url: str) -> bytes:
    """The picture, fetched by the server: https, public hosts only, small, an image. Raises ``Miss``."""
    import requests

    from apps.inventory.services.photo_sheets import _public_host

    for _ in range(REDIRECTS + 1):
        parsed = urlparse(url)
        if parsed.scheme != 'https' or not parsed.hostname:
            raise Miss('The image link is not https.')
        if not _public_host(parsed.hostname):
            raise Miss('The image host is not on the public internet.')
        try:
            resp = requests.get(url, stream=True, timeout=TIMEOUT, allow_redirects=False,
                                headers={'User-Agent': 'Mozilla/5.0 (Eco-Thrift stock photo)', 'Accept': 'image/*'})
        except requests.RequestException as exc:
            raise Miss(f'The image did not download ({type(exc).__name__}).') from exc
        if resp.is_redirect and resp.headers.get('location'):
            url = urljoin(url, resp.headers['location'])
            resp.close()
            continue
        break
    else:
        raise Miss('The image link redirects too many times.')
    with resp:
        if resp.status_code != 200:
            raise Miss(f'The image answered HTTP {resp.status_code}.')
        kind = (resp.headers.get('content-type') or '').split(';')[0].strip().lower()
        if not kind.startswith('image/'):
            raise Miss(f'The link is not an image ({kind or "no type"}).')
        if int(resp.headers.get('content-length') or 0) > MAX_BYTES:
            raise Miss('The image is over 6 MB.')
        data = b''
        started = time.monotonic()
        for chunk in resp.iter_content(64 * 1024):
            data += chunk
            if len(data) > MAX_BYTES:
                raise Miss('The image is over 6 MB.')
            if time.monotonic() - started > TIMEOUT:
                raise Miss('The image took too long.')
    return data


def to_jpeg(raw: bytes) -> tuple[bytes, int, int]:
    """The picture as a JPEG, long side 640 px. Raises ``Miss`` when it is not a picture or is too small."""
    from apps.core.services.photo_drops import PhotoDropError, _fit, _jpeg, _read_photo

    try:
        img = _read_photo(raw)
    except PhotoDropError as exc:
        raise Miss('The file is not a picture we can read.') from exc
    if min(img.size) < MIN_SHORT_SIDE:
        raise Miss(f'The image is too small ({img.width}x{img.height}).')
    img = _fit(img, SAVE_EDGE)
    return _jpeg(img, SAVE_QUALITY), img.width, img.height


# ── The seller's manifest photo ───────────────────────────────────────────────

def real_image_url(url: str | None) -> str | None:
    """A manifest's image address as one that shows the photo, or None. A Wayfair (wfcdn) address in a manifest is a
    placeholder ("No Image Available"); the real one is rebuilt from its image id. Another http(s) address is kept."""
    url = (url or '').strip()
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        return None
    if WFCDN_HOST.search(parsed.hostname):
        m = WFCDN_ID.search(parsed.path)
        if not m:
            return None
        image_id = m.group(1)
        return WFCDN_REAL.format(head=image_id[:4], id=image_id)
    return url


def _manifest_urls(where: str, params: list) -> list[tuple[int, str]]:
    """(manifest row id, real image address) for the manifest rows ``where`` selects, from their preprocessing rows'
    raw "Image URL" (joined by order and row number)."""
    from django.db import connection

    from apps.inventory.models import ManifestRow, PreprocessingRow

    cols = ', '.join(f"pr.raw_row->>'{k}'" for k in IMAGE_KEYS)
    sql = f"""
SELECT mr.id, {cols}
FROM {ManifestRow._meta.db_table} mr
JOIN {PreprocessingRow._meta.db_table} pr ON pr.purchase_order_id = mr.purchase_order_id AND pr.row_number = mr.row_number
WHERE {where}
ORDER BY mr.id DESC"""
    out: list[tuple[int, str]] = []
    with connection.cursor() as cur:
        cur.execute(sql, params)
        for rid, *raw in cur.fetchall():
            url = next((real_image_url(v) for v in raw if real_image_url(v)), None)
            if url:
                out.append((rid, url))
    return out


def manifest_image_url(manifest_row) -> str | None:
    """The real address of the seller's photo for one manifest row (its preprocessing row's "Image URL", a Wayfair
    placeholder rebuilt from the image id), or None. No download; for the truck-featuring work (#186)."""
    rid = getattr(manifest_row, 'pk', manifest_row)
    found = _manifest_urls('mr.id = %s', [rid]) if rid else []
    return found[0][1] if found else None


def product_manifest_urls(product) -> list[str]:
    """The seller's photo addresses for a product, through its items' manifest rows (newest row first)."""
    from apps.inventory.models import Item

    pid = getattr(product, 'pk', product)
    if not pid:
        return []
    where = f'mr.id IN (SELECT manifest_row_id FROM {Item._meta.db_table} WHERE product_id = %s)'
    return list(dict.fromkeys(url for _, url in _manifest_urls(where, [pid])))


def shelf_manifest_urls() -> dict[int, list[str]]:
    """{product id: the seller's photo addresses} for every product on the shelf whose items' manifest rows carry one
    (one query; newest manifest row first)."""
    from apps.inventory.models import Item

    sql_where = (f"mr.id IN (SELECT manifest_row_id FROM {Item._meta.db_table} "
                 f"WHERE status = 'on_shelf' AND manifest_row_id IS NOT NULL)")
    rows = dict(_manifest_urls(sql_where, []))
    out: dict[int, list[str]] = {}
    if not rows:
        return out
    for pid, rid in (Item.objects.filter(status='on_shelf', manifest_row_id__in=list(rows))
                     .values_list('product_id', 'manifest_row_id').distinct().order_by('-manifest_row_id')):
        urls = out.setdefault(pid, [])
        if rows[rid] not in urls:
            urls.append(rows[rid])
    return out


def _from_manifest(row: StockPhoto, why: list[str], avoid: str = '', urls: list[str] | None = None,
                   tried: list | None = None) -> bool | None:
    """Save the seller's manifest photo on ``row``. True: saved. False: the manifest had a photo but none was usable.
    None: no manifest photo at all. ``urls``: already read (the daily pass); ``tried`` gets one entry per download."""
    if urls is None:
        if row.manifest_row_id:
            url = manifest_image_url(row.manifest_row_id)
            urls = [url] if url else []
        else:
            urls = product_manifest_urls(row.product_id)
    if not urls:
        return None
    for url in urls[:3]:
        if avoid and url == avoid:
            why.append('Manifest photo: a person rejected it.')
            continue
        try:
            if tried is not None:
                tried.append(url)
            raw = download(url)
            if len(raw) == PLACEHOLDER_BYTES:
                raise Miss('the "No Image Available" placeholder.')
            from PIL import Image

            with Image.open(io.BytesIO(raw)) as probe:
                if probe.size == PLACEHOLDER_SIZE:
                    raise Miss('the "No Image Available" placeholder.')
            data, width, height = to_jpeg(raw)
        except Miss as exc:
            why.append(f'Manifest photo: {exc}')
            continue
        except Exception as exc:  # noqa: BLE001 - an unreadable file is a miss
            why.append(f'Manifest photo: unreadable ({type(exc).__name__}).')
            continue
        row.image.save(f'{row.key}-{uuid.uuid4().hex[:8]}.jpg', ContentFile(data), save=False)
        row.width, row.height, row.page_url, row.image_url, row.confidence = width, height, '', url[:1000], None
        row.status, row.found_at, row.next_try_on = StockPhoto.STATUS_FOUND, timezone.now(), None
        why[:] = [MANIFEST_WHY]
        return True
    return False


# ── The finder ────────────────────────────────────────────────────────────────

def _due(row: StockPhoto, today) -> bool:
    return row.next_try_on is None or row.next_try_on <= today


def _reuse(row: StockPhoto) -> bool:
    if not row.match_key:
        return False
    other = (StockPhoto.objects.filter(match_key=row.match_key, status__in=StockPhoto.PUBLIC).exclude(image='')
             .exclude(pk=row.pk).order_by('status', '-found_at').first())
    if other is None:
        return False
    row.status, row.image, row.width, row.height = other.status, other.image.name, other.width, other.height
    row.page_url, row.image_url, row.confidence = other.page_url, other.image_url, other.confidence
    row.why = f'Reused the photo of {other.key} (same {row.match_key.split(":")[0]}).'
    row.found_at, row.next_try_on = timezone.now(), None
    row.save()
    return True


def find_stock_photo(*, key: str, title: str, brand: str = '', model: str = '', identifiers: dict | None = None,
                     product=None, manifest_row=None, web: bool | None = None) -> StockPhoto:
    """Look up (or reuse) the stock photo of one piece and keep the result in its ``StockPhoto`` row.

    ``key``: ``p<product id>`` or ``m<manifest row id>``. ``identifiers``: a ``identifiers`` dict as Product and
    ManifestRow keep them (``upc``, ``ean``, ``asin``, ``item_number``, ``sku``; a value may be a list or a comma list).
    Sources in order: a reused photo of the same ``match_key``; the seller's manifest photo (``manifest_row``'s, else
    through ``product``'s items); the AI web search when ``web`` is True (None: the ``storefront.stock_photos_web``
    switch, default off).
    Returns the row: ``found`` with ``image`` set, or ``none`` with ``why`` and ``next_try_on``. A row already found or
    approved, or a miss or rejection not yet due, comes back unchanged. Raises nothing for a miss; an API outage is a
    miss tried again tomorrow.
    """
    today = timezone.localdate()
    ids = clean_identifiers(identifiers)
    brand = _brand(brand)
    row, _ = StockPhoto.objects.get_or_create(key=key, defaults={'product': product, 'manifest_row': manifest_row})
    if row.status in StockPhoto.PUBLIC and row.image:
        return row
    if not _due(row, today):
        return row
    row.product = product or row.product
    row.manifest_row = manifest_row or row.manifest_row
    row.title = (title or '')[:300]
    row.match_key = match_key(ids, brand, model)
    if _reuse(row):
        return row

    avoid = row.image_url if row.status == StockPhoto.STATUS_REJECTED else ''
    facts = Facts(key=key, title=row.title, brand=brand, model=(model or '').strip(), ids=ids, avoid=avoid)
    row.tries += 1
    why: list[str] = []
    retry_days = MISS_DAYS
    try:
        had = _from_manifest(row, why, avoid)
    except Exception as exc:  # noqa: BLE001 - one piece never stops the run
        logger.exception('stock photo: %s manifest photo failed', key)
        why.append(f'Manifest photo failed: {type(exc).__name__}')
        had = False
    if had is not True:
        if web if web is not None else web_on():
            retry_days = _web(row, facts, why)
        else:
            why.append(f'No web search ({WEB_KEY} is off).')
            if had is None:
                retry_days = 1  # nothing was tried: look again tomorrow (a new manifest, or the switch turned on)
    if row.status not in StockPhoto.PUBLIC or not row.image:
        row.status, row.next_try_on = StockPhoto.STATUS_NONE, today + timedelta(days=retry_days)
    row.why = ' | '.join(why)[:2000]
    row.save()
    return row


def _web(row: StockPhoto, facts: Facts, why: list[str]) -> int:
    """The AI web search and the photo check, onto ``row``. Returns the days until a miss is tried again."""
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError

    retry_days = MISS_DAYS
    try:
        answer, cost, used = _search(facts)
        row.cost_usd += cost
        if answer is None:
            raise Miss('The finder gave no answer.')
        image_url = str(answer.get('image_url') or '').strip()[:1000]
        page_url = str(answer.get('page_url') or '').strip()[:1000]
        try:
            confidence = max(0.0, min(1.0, float(answer.get('confidence') or 0)))
        except (TypeError, ValueError):
            confidence = 0.0
        why.append(f"Finder ({used['searches']} searches, {used['fetches']} pages, {confidence:.2f}): "
                   f"{str(answer.get('why') or '').strip()[:300]}")
        row.page_url, row.image_url, row.confidence = page_url, image_url, confidence
        if not image_url:
            raise Miss('No image found.')
        if facts.avoid and image_url == facts.avoid:
            raise Miss('It found the image a person rejected.')
        if confidence < MIN_CONFIDENCE:
            raise Miss('Not sure enough it is this product.')
        raw = download(image_url)
        data, width, height = to_jpeg(raw)
        verdict, cost = _check(facts, raw)
        row.cost_usd += cost
        if verdict is None:
            raise Miss('The photo check gave no answer.')
        why.append(f"Check: {str(verdict.get('why') or '').strip()[:300]}")
        if verdict.get('same_product') is not True:
            raise Miss('The check says it is not this product.')
        if verdict.get('clean') is not True:
            raise Miss('The check says it is not a clean product photo.')
        row.image.save(f'{row.key}-{uuid.uuid4().hex[:8]}.jpg', ContentFile(data), save=False)
        row.width, row.height = width, height
        row.status, row.found_at, row.next_try_on = StockPhoto.STATUS_FOUND, timezone.now(), None
    except Miss as exc:
        why.append(str(exc))
    except (LLMAPIError, LLMConfigError) as exc:
        why.append(f'The AI call failed: {str(exc)[:200]}')
        retry_days = ERROR_DAYS
    except Exception as exc:  # noqa: BLE001 - one piece never stops the run
        logger.exception('stock photo: %s failed', row.key)
        why.append(f'It failed: {type(exc).__name__}')
        retry_days = ERROR_DAYS
    return retry_days


def reject(rows, *, user=None) -> int:
    """Take these photos off the site (and every row sharing one of their pictures); not looked up again for 90 days."""
    today = timezone.localdate()
    rows = list(rows)
    names = {r.image.name for r in rows if r.image}
    targets = {r.pk: r for r in rows}
    for r in StockPhoto.objects.filter(image__in=names).exclude(image=''):
        targets.setdefault(r.pk, r)
    who = (getattr(user, 'full_name', '') or getattr(user, 'email', '') or 'staff') if user is not None else 'staff'
    for r in targets.values():
        r.status, r.next_try_on = StockPhoto.STATUS_REJECTED, today + timedelta(days=REJECT_DAYS)
        r.why = f'Rejected by {who} on {today.isoformat()}. ' + r.why
        r.save(update_fields=['status', 'next_try_on', 'why', 'updated_at'])
    return len(targets)


# ── The daily run ─────────────────────────────────────────────────────────────

def _setting(key: str):
    from apps.core.models import AppSetting

    return AppSetting.objects.filter(key=key).values_list('value', flat=True).first()


def is_on() -> bool:
    value = _setting(SWITCH_KEY)
    return not (value is False or str(value).strip().lower() in ('off', 'false', '0', 'no'))


def web_on() -> bool:
    """The AI web search (``storefront.stock_photos_web``): off unless set on."""
    value = _setting(WEB_KEY)
    return value is True or str(value).strip().lower() in ('on', 'true', '1', 'yes')


def daily_cap() -> int:
    try:
        return max(0, int(_setting(DAILY_KEY)))
    except (TypeError, ValueError):
        return DAILY_DEFAULT


@dataclass
class Plan:
    candidates: int = 0
    sheet: int = 0            # a photo-sheet photo: used as it is
    have: int = 0             # a found or approved stock photo already
    waiting: int = 0          # a miss or rejection not yet due
    todo: list = field(default_factory=list)   # [(pid, Facts kwargs)]


def plan(limit: int) -> Plan:
    """Which floor products to look up today (no AI call)."""
    from apps.inventory.models import ManifestRow, Product
    from apps.storefront.services import photos, snapshot

    snap = snapshot.build()
    best = snapshot.ranked(snap['instore'], CANDIDATES)
    out = Plan(candidates=len(best))
    today = timezone.localdate()
    rows = {r.product_id: r for r in StockPhoto.objects.filter(product_id__in=[b['pid'] for b in best])}
    wanted = []
    for b in best:
        if b['photo'] == photos.KIND_SHEET:
            out.sheet += 1
        elif b['photo'] == photos.KIND_STOCK:
            out.have += 1
        elif b['pid'] in rows and not _due(rows[b['pid']], today):
            out.waiting += 1
        else:
            wanted.append(b)
    wanted = wanted[:limit]
    pids = [b['pid'] for b in wanted]
    products = Product.objects.select_related('profile').in_bulk(pids)
    row_ids: dict[int, list[dict]] = {}
    for pid, ident in (ManifestRow.objects.filter(items__product_id__in=pids).exclude(identifiers={})
                       .values_list('items__product_id', 'identifiers').distinct()[:2000]):
        row_ids.setdefault(pid, []).append(ident)
    for b in wanted:
        p = products.get(b['pid'])
        if p is None:
            continue
        profile = getattr(p, 'profile', None)
        aliases = (profile.aliases or {}) if profile is not None else {}
        ids = merge_identifiers(p.identifiers, {'upcs': aliases.get('upcs')}, *row_ids.get(p.pk, [])[:5])
        out.todo.append((p.pk, {
            'title': ((profile.display_title if profile is not None else '') or p.title or b['name']).strip(),
            'brand': (profile.brand if profile is not None else '') or p.brand or '',
            'model': (profile.model_number if profile is not None else '') or p.model or '',
            'identifiers': {'upc': ids['gtin'], 'asin': ids['asin'], 'item_number': ids['item_number']},
            'product': p,
        }))
    return out


def _clock() -> float:
    return time.monotonic()


def manifest_cap() -> int:
    try:
        return max(0, int(_setting(MANIFEST_DAILY_KEY)))
    except (TypeError, ValueError):
        return MANIFEST_DAILY_DEFAULT


def _manifest_pass(done: dict, started: float, *, dry_run: bool, say) -> None:
    """The free pass: every in-store product with a shown retail and no photo-sheet or stock photo whose manifest has
    the seller's photo, best saving first; at most ``storefront.stock_photos_manifest_daily`` downloads (default 300)
    and the 10-minute cap. A product whose manifest has no photo gets no row."""
    from apps.storefront.services import photos, snapshot

    snap = snapshot.build()
    shown = snapshot.ranked(snap['instore'], len(snap['instore']), per_cat=len(snap['instore']) or 1)
    urls = shelf_manifest_urls()
    today = timezone.localdate()
    rows = {r.product_id: r for r in StockPhoto.objects.filter(product_id__in=list(urls))}
    budget = manifest_cap()
    tried: list[str] = []
    todo = []
    for r in shown:
        if r['photo'] == photos.KIND_SHEET:
            done['sheet'] += 1
        elif r['photo'] == photos.KIND_STOCK:
            done['have'] += 1
        elif r['pid'] in urls:
            row = rows.get(r['pid'])
            if row is not None and not _due(row, today):
                done['waiting'] += 1
            else:
                todo.append(r)
    done['manifest_candidates'] = len(todo)
    for r in todo:
        if dry_run:
            say(f"would take the manifest photo of p{r['pid']}: {r['name'][:70]}")
            continue
        if len(tried) >= budget or _clock() - started > DAILY_SECONDS:
            done['manifest_left'] = len(todo) - done['manifest'] - done['manifest_missed']
            break
        row, _ = StockPhoto.objects.get_or_create(key=f"p{r['pid']}", defaults={'product_id': r['pid']})
        row.product_id = row.product_id or r['pid']
        row.title = r['name'][:300]
        row.tries += 1
        why: list[str] = []
        avoid = row.image_url if row.status == StockPhoto.STATUS_REJECTED else ''
        if _from_manifest(row, why, avoid, urls=urls[r['pid']], tried=tried):
            done['manifest'] += 1
        else:
            row.status, row.next_try_on = StockPhoto.STATUS_NONE, today + timedelta(days=MISS_DAYS)
            done['manifest_missed'] += 1
        row.why = ' | '.join(why)[:2000]
        row.save()
        say(f"p{r['pid']} {row.status}: {r['name'][:60]} | {row.image_url or '-'} | {row.why[:120]}")
    done['downloads'] = len(tried)


def daily(limit: int | None = None, *, dry_run: bool = False, say=None) -> dict:
    """Today's photos: the free manifest pass over every in-store product with a shown retail, then (only when
    ``storefront.stock_photos_web`` is on) the paid web search for the top 40 still without a photo, at most ``limit``
    (default ``storefront.stock_photos_daily``, 25). ``say`` gets one line per piece. Returns the counts and the cost."""
    from django.db.models import Sum

    from apps.core.models import AIUsage

    say = say or (lambda line: None)
    started_at, started = timezone.now(), _clock()
    done = {'sheet': 0, 'have': 0, 'waiting': 0, 'manifest_candidates': 0, 'manifest': 0, 'manifest_missed': 0,
            'manifest_left': 0, 'downloads': 0, 'web': web_on(), 'candidates': 0, 'planned': 0, 'looked_up': 0,
            'found': 0, 'reused': 0, 'missed': 0, 'stopped': 0, 'cost_usd': Decimal('0')}
    _manifest_pass(done, started, dry_run=dry_run, say=say)
    if done['web']:
        p = plan(daily_cap() if limit is None else max(0, limit))  # after the manifest pass: its photos count
        done['candidates'], done['planned'] = p.candidates, len(p.todo)
        for pid, kwargs in p.todo:
            if dry_run:
                say(f"would search the web for p{pid}: {kwargs['title'][:70]}")
                continue
            if _clock() - started > DAILY_SECONDS:
                done['stopped'] = len(p.todo) - done['looked_up']
                break
            row = find_stock_photo(key=f'p{pid}', web=True, **kwargs)
            done['looked_up'] += 1
            if row.status in StockPhoto.PUBLIC:
                done['reused' if row.why.startswith('Reused') else 'manifest' if row.why == MANIFEST_WHY else 'found'] += 1
            else:
                done['missed'] += 1
            say(f"p{pid} {row.status}: {kwargs['title'][:60]} | {row.page_url or row.image_url or '-'} | {row.why[:160]}")
    # Each web worker's next snapshot (every 5 minutes) picks the new photos up.
    done['cost_usd'] = (AIUsage.objects.filter(source=SOURCE, created_at__gte=started_at)
                        .aggregate(t=Sum('estimated_cost_usd'))['t'] or Decimal('0'))
    return done


def summary(done: dict) -> str:
    web = (f"web search: {done['looked_up']} looked up ({done['found']} found, {done['reused']} reused, "
           f"{done['missed']} missed)" if done.get('web') else 'web search off')
    left = done['manifest_left'] + done['stopped']
    return (f"Stock photos: {done['manifest']} manifest photos saved ({done['manifest_missed']} unusable, "
            f"{done['downloads']} downloads); {web}; {done['sheet']} use a photo sheet, {done['have']} had one, "
            f"{done['waiting']} wait for their retry date"
            + (f", {left} left for tomorrow (cap)" if left else '')
            + f"; AI cost ${done['cost_usd']:.4f}.")


def morning_stock_photos() -> str:
    """The end of ``materialize_routines``: one line; never raises (the routines job must finish)."""
    try:
        if not is_on():
            return f'Stock photos: off ({SWITCH_KEY}).'
        return summary(daily())
    except Exception:  # noqa: BLE001 - the routines job must finish
        logger.exception('Stock photos: the daily run failed')
        return 'Stock photos: the daily run failed (see the log).'
