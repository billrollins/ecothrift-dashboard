"""Photo sheets (Dash Update #95): a letter-size sheet of photos with the full title, taped to a closed box.

Bill, 2026-11-11: items sit on the floor in brown boxes and customers have no idea what is inside. A processor prints
one sheet (photos, the full title across the top, a few plain facts) and tapes it to the box. Decisions D21 to D26 in
``.ai/extended/processing-enhancements-decisions.md``.

A sheet is saved with its item, or its product, or neither (typed by hand for a thing not sold in the store). Opening
the sheet of an item starts from that item's own sheet; else from the newest sheet of the same product (its photos,
layout and facts; the next one of the same product starts with its photos); else from what Dash knows about the item.
Photos are ``core.S3File`` rows under ``photo-sheets/``; only those are served by the photo view.
"""
from __future__ import annotations

import ipaddress
import json
import re
import socket
import uuid
from typing import Any
from urllib.parse import urlparse

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.models import S3File
from apps.core.services.photo_drops import MAX_EDGE, PhotoDropError, _fit, _jpeg, _read_photo, _store
from apps.inventory.models import Item, PhotoSheet, Product

KEY_PREFIX = 'photo-sheets'
FACT_KEYS = ('size', 'in_box', 'condition', 'good_to_know')
FACT_MAX = 160
TITLE_MAX = 300
NAME_MAX = 80
# A title longer than this gets a short plain name in the big size when Dash has one (round 1: "a wall of keywords").
LONG_TITLE = 60
LAYOUTS = ('one', 'two', 'big2', 'big3', 'grid4')
ORIENTATIONS = ('portrait', 'landscape')
FITS = ('fit', 'fill')
TURNS = (0, 90, 180, 270)
# The most photos any template holds.
MAX_PHOTOS = 4
JPEG_QUALITY = 88
AI_PURPOSE = 'SUGGEST_PRODUCT'
CAPTIONS = ('product', 'item')
# White border trim: near-white is at or above this grey level; the margin left is this share of the picture.
WHITE_LEVEL = 232
TRIM_PAD = 0.06
LINK_TIMEOUT = (5, 15)
LINK_REDIRECTS = 3
LINK_MAX_BYTES = 20 * 1024 * 1024

# The item's condition in the words a customer reads (blank when nobody knows).
CONDITION_WORDS = {
    'new': 'New',
    'like_new': 'Like new',
    'very_good': 'Very good',
    'good': 'Good',
    'fair': 'Fair, shows wear',
    'salvage': 'For parts or repair',
}


class PhotoSheetError(ValueError):
    """Something in the sheet cannot be saved as sent; the words are for the person."""


# ── Photos ────────────────────────────────────────────────────────────────────

def trim_white(img):
    """Cut the plain white border a web product picture comes with, leaving a small margin, so the item fills its space
    on the sheet (Bill, 11-11: most pictures are copied from the web, on white). A picture with no white border is kept.
    Returns the picture and whether it stands on plain white (the sheet may then widen its space freely: white on white)."""
    from PIL import ImageOps

    gray = ImageOps.grayscale(img)
    # Everything darker than near-white is the picture.
    mask = gray.point(lambda v: 255 if v < WHITE_LEVEL else 0)
    box = mask.getbbox()
    if not box:
        return img, False
    left, top, right, bottom = box
    w, h = img.size
    sides = sum([left > w * 0.03, top > h * 0.03, right < w * 0.97, bottom < h * 0.97])
    if not sides:
        return img, False
    pad = int(max(right - left, bottom - top) * TRIM_PAD)
    # White on at least three sides: a product picture on a white page.
    return img.crop((max(0, left - pad), max(0, top - pad), min(w, right + pad), min(h, bottom + pad))), sides >= 3


def save_photo(raw: bytes, *, user) -> dict[str, Any]:
    """Save one photo for a sheet: upright, white border trimmed, at most 2048 px on its long side. Returns its id,
    shape and whether it stands on plain white."""
    try:
        trimmed, plain = trim_white(_read_photo(raw))
        img = _fit(trimmed, MAX_EDGE)
    except PhotoDropError as exc:
        raise PhotoSheetError(str(exc)) from exc
    stamp = timezone.localtime().strftime('%Y%m%d-%H%M%S')
    s3 = _store(f'{KEY_PREFIX}/{uuid.uuid4().hex}.jpg', _jpeg(img, JPEG_QUALITY), user=user,
                filename=f'photo-sheet-{stamp}.jpg')
    return {'file': s3.pk, 'width': img.width, 'height': img.height, 'plain': plain}


def _public_host(host: str) -> bool:
    """True when every address the name resolves to is on the public internet (never the server's own network)."""
    try:
        infos = socket.getaddrinfo(host, None)
    except (OSError, UnicodeError):
        return False
    for info in infos:
        address = ipaddress.ip_address(info[4][0].split('%')[0])
        if (address.is_private or address.is_loopback or address.is_link_local or address.is_reserved
                or address.is_multicast or address.is_unspecified):
            return False
    return bool(infos)


def fetch_photo(url: str, *, user) -> dict[str, Any]:
    """A picture link pasted or dragged into a sheet: fetch it (public web addresses only, small, an image) and save it
    like any other photo. The browser cannot fetch most of these itself (the other site does not allow it)."""
    import requests

    url = (url or '').strip()
    for _ in range(LINK_REDIRECTS + 1):
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            raise PhotoSheetError('That is not a picture link. Copy the picture itself, or its address.')
        if not _public_host(parsed.hostname):
            raise PhotoSheetError('That link cannot be opened from Dash.')
        try:
            resp = requests.get(url, stream=True, timeout=LINK_TIMEOUT, allow_redirects=False,
                                headers={'User-Agent': 'Mozilla/5.0 (photo sheet)', 'Accept': 'image/*'})
        except requests.RequestException as exc:
            raise PhotoSheetError('That picture did not open. Copy the picture itself and paste it.') from exc
        if resp.is_redirect and resp.headers.get('location'):
            url = requests.compat.urljoin(url, resp.headers['location'])
            resp.close()
            continue
        break
    else:
        raise PhotoSheetError('That link goes round in circles. Copy the picture itself and paste it.')
    with resp:
        if resp.status_code != 200:
            raise PhotoSheetError('That picture did not open. Copy the picture itself and paste it.')
        data = b''
        for chunk in resp.iter_content(64 * 1024):
            data += chunk
            if len(data) > LINK_MAX_BYTES:
                raise PhotoSheetError('That picture is too large (over 20 MB).')
    return save_photo(data, user=user)


def sheet_photo(file_id: int) -> S3File | None:
    """A photo saved for a sheet, or None (any other stored file is never served from here)."""
    return S3File.objects.filter(pk=file_id, key__startswith=f'{KEY_PREFIX}/').first()


# ── What Dash knows ───────────────────────────────────────────────────────────

def _brand(value: str) -> str:
    value = (value or '').strip()
    return '' if value.lower() in ('', 'generic', 'unknown', 'n/a', 'none') else value


def _spec(spec: Any, *keys: str) -> str:
    if not isinstance(spec, dict):
        return ''
    for key in keys:
        value = spec.get(key)
        if isinstance(value, (str, int, float)) and str(value).strip():
            return str(value).strip()
    return ''


def _title(product: Product | None) -> str:
    """The full title: the product's own, word for word (the sheet never cuts it)."""
    if product is None:
        return ''
    return (product.title or '').strip()[:TITLE_MAX]


def _name(product: Product | None, title: str) -> str:
    """A short plain name for a long title, from the product's standard, or ''."""
    if product is None or len(title) <= LONG_TITLE:
        return ''
    profile = getattr(product, 'profile', None)
    if profile is None:
        return ''
    for value in (profile.short_name, profile.display_title):
        value = (value or '').strip()
        if value and len(value) <= NAME_MAX and value.lower() != title.lower():
            return value
    return ''


def known_facts(item: Item | None, product: Product | None) -> dict[str, str]:
    """The facts Dash can fill without anyone typing: the item's condition and a size when one is on file."""
    item_spec = item.specifications if item is not None else {}
    product_spec = product.specifications if product is not None else {}
    size = _spec(item_spec, 'dimensions', 'size') or _spec(product_spec, 'dimensions', 'size')
    return {
        'size': size[:FACT_MAX],
        'in_box': '',
        'condition': CONDITION_WORDS.get(item.condition, '') if item is not None else '',
        'good_to_know': '',
    }


def item_info(item: Item | None) -> dict[str, Any] | None:
    if item is None:
        return None
    return {
        'id': item.pk,
        'sku': item.sku,
        'price': str(item.price) if item.price and item.price > 0 else None,
        'status': item.status,
        'condition': item.condition,
    }


def product_info(product: Product | None) -> dict[str, Any] | None:
    if product is None:
        return None
    return {'id': product.pk, 'product_number': product.product_number or '', 'title': product.title}


def serialize(sheet: PhotoSheet) -> dict[str, Any]:
    return {
        'id': sheet.pk,
        'item': item_info(sheet.item),
        'product': product_info(sheet.product),
        'title': sheet.title,
        'name': sheet.name,
        'brand': sheet.brand,
        'facts': {key: str((sheet.facts or {}).get(key) or '') for key in FACT_KEYS},
        'layout': sheet.layout,
        'orientation': sheet.orientation,
        'photos': list(sheet.photos or []),
        'show_price': sheet.show_price,
        'show_item_number': sheet.show_item_number,
        'caption': sheet.caption if sheet.caption in CAPTIONS else 'product',
        'not_assembled': sheet.not_assembled,
        'print_count': sheet.print_count,
        'printed_at': sheet.printed_at.isoformat() if sheet.printed_at else None,
        'updated_at': sheet.updated_at.isoformat() if sheet.updated_at else None,
        'updated_by': (sheet.updated_by.first_name or sheet.updated_by.full_name) if sheet.updated_by else '',
    }


def _sheets():
    return PhotoSheet.objects.select_related('item', 'product', 'updated_by')


def start(*, item_id: int | None = None, product_id: int | None = None, code: str = '') -> dict[str, Any]:
    """Where a sheet opens from a row, an item, a product, or an item number typed on the Photo sheets page.

    ``sheet``: the saved sheet of this item (or, from a product, of that product with no item), ready for Print again.
    ``draft``: what a new sheet starts with when there is none: the newest sheet of the same product (photos, layout,
    facts) with this item's own condition, else what Dash knows.
    """
    items = Item.objects.select_related('product', 'product__profile')
    code = (code or '').strip()
    if code and not item_id and not product_id:
        item = items.filter(sku__iexact=code).first()
        if item is None:
            found = Product.objects.filter(product_number__iexact=code).values_list('pk', flat=True).first()
            if found is None:
                raise PhotoSheetError(f'No item or product {code} in Dash.')
            product_id = found
        else:
            item_id = item.pk
    item = items.filter(pk=item_id).first() if item_id else None
    if item_id and item is None:
        raise PhotoSheetError('That item is not in Dash.')
    product = item.product if item is not None else None
    if product is None and product_id:
        product = Product.objects.select_related('profile').filter(pk=product_id).first()
        if product is None:
            raise PhotoSheetError('That product is not in Dash.')

    own = None
    if item is not None:
        own = _sheets().filter(item=item).first()
    elif product is not None:
        own = _sheets().filter(product=product, item__isnull=True).first()
    known = known_facts(item, product)
    title = _title(product)
    draft: dict[str, Any] = {
        'title': title,
        'name': _name(product, title),
        'brand': _brand(product.brand) if product is not None else '',
        'facts': known,
        'layout': '',
        'orientation': '',
        'photos': [],
        'show_price': False,
        'show_item_number': False,
        'caption': 'product',
        'not_assembled': False,
        'from_sheet': None,
    }
    last = _sheets().filter(product=product).first() if product is not None and own is None else None
    if last is not None:
        facts = {key: str((last.facts or {}).get(key) or '') for key in FACT_KEYS}
        # This item's own condition wins: the last one may have been in another shape.
        if known['condition']:
            facts['condition'] = known['condition']
        draft.update({
            'title': last.title, 'name': last.name, 'brand': last.brand, 'facts': facts, 'layout': last.layout,
            'orientation': last.orientation, 'photos': list(last.photos or []),
            'caption': last.caption if last.caption in CAPTIONS else 'product', 'not_assembled': last.not_assembled,
            'from_sheet': {'id': last.pk, 'sku': last.item.sku if last.item else ''},
        })
    return {
        'sheet': serialize(own) if own is not None else None,
        'draft': draft,
        'item': item_info(item),
        'product': product_info(product),
    }


# ── Saving ────────────────────────────────────────────────────────────────────

def _clean_photos(raw: Any) -> list[dict[str, Any]]:
    if raw in (None, ''):
        return []
    if not isinstance(raw, list):
        raise PhotoSheetError('Photos must be a list.')
    if len(raw) > MAX_PHOTOS:
        raise PhotoSheetError(f'A sheet holds {MAX_PHOTOS} photos at most.')
    ids = []
    for row in raw:
        try:
            ids.append(int(row.get('file')))
        except (AttributeError, TypeError, ValueError):
            raise PhotoSheetError('A photo is missing.') from None
    found = set(S3File.objects.filter(pk__in=ids, key__startswith=f'{KEY_PREFIX}/').values_list('pk', flat=True))
    out = []
    for row, file_id in zip(raw, ids):
        if file_id not in found:
            raise PhotoSheetError('A photo is missing. Add it again.')
        try:
            turn = int(row.get('turn') or 0) % 360
            width, height = int(row.get('width') or 0), int(row.get('height') or 0)
        except (TypeError, ValueError):
            turn, width, height = 0, 0, 0
        out.append({
            'file': file_id,
            'width': max(0, width),
            'height': max(0, height),
            'fit': row.get('fit') if row.get('fit') in FITS else 'fit',
            'turn': turn if turn in TURNS else 0,
            'plain': bool(row.get('plain')),
        })
    return out


def _clean(data: dict[str, Any], sheet: PhotoSheet) -> None:
    if 'title' in data:
        sheet.title = ' '.join(str(data.get('title') or '').split())[:TITLE_MAX]
    if 'name' in data:
        sheet.name = ' '.join(str(data.get('name') or '').split())[:NAME_MAX]
    if 'brand' in data:
        sheet.brand = ' '.join(str(data.get('brand') or '').split())[:200]
    if 'facts' in data:
        raw = data.get('facts') or {}
        if not isinstance(raw, dict):
            raise PhotoSheetError('Facts must be a set of short lines.')
        sheet.facts = {key: ' '.join(str(raw.get(key) or '').split())[:FACT_MAX] for key in FACT_KEYS}
    if 'layout' in data:
        if data.get('layout') not in LAYOUTS:
            raise PhotoSheetError('Pick one of the layouts.')
        sheet.layout = data['layout']
    if 'orientation' in data:
        if data.get('orientation') not in ORIENTATIONS:
            raise PhotoSheetError('Pick upright or sideways.')
        sheet.orientation = data['orientation']
    if 'photos' in data:
        sheet.photos = _clean_photos(data.get('photos'))
    for key in ('show_price', 'show_item_number', 'not_assembled'):
        if key in data:
            setattr(sheet, key, bool(data.get(key)))
    if 'caption' in data:
        if data.get('caption') not in CAPTIONS:
            raise PhotoSheetError('Pick what the pictures are.')
        sheet.caption = data['caption']
    if not sheet.title:
        raise PhotoSheetError('Type the title.')
    # The tag's numbers belong to one tagged item (D25): a sheet without one never shows them.
    if sheet.item_id is None:
        sheet.show_price = False
        sheet.show_item_number = False


def create(data: dict[str, Any], *, user) -> PhotoSheet:
    item = product = None
    if data.get('item'):
        item = Item.objects.select_related('product').filter(pk=data.get('item')).first()
        if item is None:
            raise PhotoSheetError('That item is not in Dash.')
        product = item.product
    elif data.get('product'):
        product = Product.objects.filter(pk=data.get('product')).first()
        if product is None:
            raise PhotoSheetError('That product is not in Dash.')
    sheet = PhotoSheet(item=item, product=product, created_by=user, updated_by=user)
    _clean(data, sheet)
    sheet.save()
    return sheet


def update(sheet: PhotoSheet, data: dict[str, Any], *, user) -> PhotoSheet:
    _clean(data, sheet)
    sheet.updated_by = user
    sheet.save()
    return sheet


def mark_printed(sheet: PhotoSheet, *, user) -> PhotoSheet:
    with transaction.atomic():
        locked = PhotoSheet.objects.select_for_update().get(pk=sheet.pk)
        locked.print_count += 1
        locked.printed_at = timezone.now()
        locked.save(update_fields=['print_count', 'printed_at'])
    sheet.refresh_from_db()
    return sheet


def recent(query: str = '', limit: int = 40) -> list[dict[str, Any]]:
    """Sheets for the Photo sheets page, newest first; ``query`` finds a title, a brand, an item number."""
    rows = _sheets()
    query = (query or '').strip()
    if query:
        rows = rows.filter(
            Q(title__icontains=query) | Q(brand__icontains=query) | Q(item__sku__iexact=query)
            | Q(product__product_number__iexact=query)
        )
    return [serialize(sheet) for sheet in rows[:limit]]


# ── Clean up with AI (D23) ────────────────────────────────────────────────────

AI_TOOL = 'photo_sheet_facts'
AI_SCHEMA = {
    'name': AI_TOOL,
    'description': 'A clear title and up to four short facts for a sheet taped to a closed box in a thrift store.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'title': {'type': 'string', 'description': 'The full product title, tidied: brand first when known, what it is, the key model or size words. No marketing words, no ALL CAPS.'},
            'name': {'type': 'string', 'description': 'What a shopper would call it, two to five plain words (e.g. "L-shaped sleeper sofa", "Stand mixer"). It prints big on the sheet.'},
            'size': {'type': 'string', 'description': 'How big it is, from the facts given (e.g. "60 x 30 x 29 in" or "Queen"). Empty if not known.'},
            'in_box': {'type': 'string', 'description': 'What comes in the box, short (e.g. "Base, 48 oz jar, lid"). Empty if not known.'},
            'condition': {'type': 'string', 'description': 'The condition in two to five plain words, only from the condition given.'},
            'good_to_know': {'type': 'string', 'description': 'One short useful line for a shopper (needs assembly, battery included, works with ...). Empty if nothing sure.'},
        },
        'required': ['title', 'name', 'size', 'in_box', 'condition', 'good_to_know'],
    },
}
AI_SYSTEM = """You write the words for a sheet taped to a closed box in a thrift store, so a shopper knows what is inside.
Use only the facts you are given. Never guess a size, a part or a feature: leave it empty instead.
Short plain words. No marketing, no exclamation marks, no em dashes. Each fact under 70 characters.
Answer with the tool."""


def ai_draft(data: dict[str, Any]) -> dict[str, Any]:
    """The AI's tidy title and four facts, from what Dash knows and what the person typed. Nothing is saved."""
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_chat_tool_input

    item = Item.objects.select_related('product', 'product__profile').filter(pk=data.get('item')).first() if data.get('item') else None
    product = item.product if item is not None else None
    if product is None and data.get('product'):
        product = Product.objects.select_related('profile').filter(pk=data.get('product')).first()
    typed = data.get('facts') if isinstance(data.get('facts'), dict) else {}
    title = ' '.join(str(data.get('title') or '').split())[:TITLE_MAX]
    if not title and product is None:
        raise PhotoSheetError('Type the title first.')
    known: dict[str, Any] = {'title_typed': title, 'brand_typed': str(data.get('brand') or '')[:200]}
    known['facts_typed'] = {key: str(typed.get(key) or '')[:FACT_MAX] for key in FACT_KEYS if typed.get(key)}
    if product is not None:
        profile = getattr(product, 'profile', None)
        known['product'] = {
            'title': product.title, 'brand': _brand(product.brand), 'model': product.model,
            'specifications': {k: v for k, v in (product.specifications or {}).items() if not str(k).startswith('legacy_')},
        }
        if profile is not None:
            known['product'].update({
                'display_title': profile.display_title, 'key_specs': profile.key_specs,
                'description': (profile.description or '')[:1500],
            })
    if item is not None:
        known['item'] = {
            'condition': CONDITION_WORDS.get(item.condition, 'not known'),
            'specifications': {k: v for k, v in (item.specifications or {}).items() if k not in ('origin',)},
        }
    try:
        answer, model = llm_chat_tool_input(
            purpose=AI_PURPOSE, system=AI_SYSTEM, user=json.dumps(known, default=str)[:12000], tool_name=AI_TOOL,
            tools=[AI_SCHEMA], max_tokens=1200, timeout=60, log_source='inventory.photo_sheet_ai',
            log_detail=(title or (product.title if product else ''))[:80],
        )
    except (LLMConfigError, LLMAPIError, ValueError) as exc:
        raise PhotoSheetError('The AI could not help this time. Type the facts, or try again.') from exc
    if not isinstance(answer, dict):
        raise PhotoSheetError('The AI answer was not usable. Type the facts, or try again.')

    def words(key: str, limit: int) -> str:
        value = answer.get(key)
        text = str(value) if isinstance(value, (str, int, float)) else ''
        # House rule: no em dashes on a screen or a sheet.
        text = re.sub(r'\s*[\u2014\u2013]\s*', ', ', text)
        return ' '.join(text.split())[:limit]

    return {
        'title': words('title', TITLE_MAX) or title,
        'name': words('name', NAME_MAX),
        'facts': {key: words(key, FACT_MAX) for key in FACT_KEYS},
        'model': model,
    }
