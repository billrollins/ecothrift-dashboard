"""Paste a product page (or a link) and the AI fills the item; the person checks it before saving.

The server never opens the vendor's page (no scraping; Amazon's terms forbid it). The AI reads only what the person
gives it: the text they copy from the page in their own browser (Amazon, Uline, anywhere) and, if they have it, the
link. One forced tool call is the structured reply; every field is checked here before it goes back, and a price or
link the page text does not show is dropped. Settings → AI picks the model (purpose SUPPLY_FILL; Spark contributor by
default). Nothing is saved here.
"""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse

from .orders import ASIN_IN_URL, asin_from_url, is_amazon

PURPOSE = 'SUPPLY_FILL'
MAX_PAGE_CHARS = 12000
MIN_PAGE_CHARS = 40
TOOL = 'fill_supply_item'
SCHEMA = {
    'name': TOOL,
    'description': 'The supply item described by the page text (and link, if given).',
    'input_schema': {
        'type': 'object',
        'properties': {
            'is_product': {'type': 'boolean', 'description': 'False when the text is not one product for sale (a search page, a cart, an error, random text).'},
            'name': {'type': 'string', 'description': 'Short plain name staff know it by, e.g. "Receipt paper rolls 3 1/8 in".'},
            'description': {'type': 'string', 'description': 'One short line: size, colour, brand. Empty if unknown.'},
            'vendor': {'type': 'string', 'description': 'The seller whose page this is, e.g. Amazon, Uline, Walmart.'},
            'item_number': {'type': 'string', 'description': "The seller's item number / SKU / model number / ASIN exactly as the text shows it. Empty if none."},
            'url': {'type': 'string', 'description': 'The product link, only if it appears in the text. Else empty.'},
            'price': {'type': 'number', 'description': 'Price of one listing (one pack) in dollars, only if the text shows it. Else 0.'},
            'pack_size': {'type': 'integer', 'description': 'How many units come in one listing (a 50-roll case is 50). 1 if unknown.'},
            'unit': {'type': 'string', 'description': 'What staff count, singular: roll, box, bag, each.'},
        },
        'required': ['is_product', 'name', 'vendor', 'price', 'pack_size', 'unit'],
    },
}
SYSTEM = """You fill in one supply item for a thrift store's supply list from a product page someone copied.
Use only the text and link you are given. Never guess: a price the text does not show is 0; an item number or link it does not show is empty.
Price is for one listing as sold. Pack size is how many countable units one listing holds (a case of 12 rolls is 12).
If the text is not a single product for sale, set is_product to false.
Answer with the tool."""

URL_IN_TEXT = re.compile(r'https?://[^\s<>"\']+', re.I)
MONEY = re.compile(r'\d[\d,]*(?:\.\d{1,2})?')
JUNK = "That doesn't look like a product page. On the item's page: select all (Ctrl+A), copy, and paste it here."


class FillError(Exception):
    pass


def _text(value, limit: int) -> str:
    return str(value or '').strip()[:limit] if isinstance(value, (str, int, float)) else ''


def _prices_in(text: str) -> set[Decimal]:
    out = set()
    for raw in MONEY.findall(text):
        try:
            out.add(Decimal(raw.replace(',', '')).quantize(Decimal('0.01')))
        except InvalidOperation:
            continue
    return out


def _clean_url(url: str) -> str:
    url = url.rstrip('.,);]')
    parsed = urlparse(url)
    return url if parsed.scheme in ('http', 'https') and parsed.hostname else ''


def fill(url: str = '', page_text: str = '', *, user=None) -> dict:
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_chat_tool_input

    url = _clean_url(str(url or '').strip())
    page_text = str(page_text or '').strip()[:MAX_PAGE_CHARS]
    if not url and not page_text:
        raise FillError('Paste the product page first.')
    if not url and (len(page_text) < MIN_PAGE_CHARS or not re.search(r'[A-Za-z]{3}', page_text)):
        raise FillError(JUNK)
    links = [u for u in (_clean_url(m) for m in URL_IN_TEXT.findall(page_text)) if u]
    asin = asin_from_url(url) or next((asin_from_url(u) for u in links if ASIN_IN_URL.search(u)), '')
    prompt = f'Link: {url or "(none)"}\n'
    if asin:
        prompt += f'Amazon ASIN: {asin}\n'
    prompt += f'\nPage text the person copied:\n{page_text or "(none)"}'
    try:
        answer, model = llm_chat_tool_input(
            purpose=PURPOSE, system=SYSTEM, user=prompt, tool_name=TOOL, tools=[SCHEMA], max_tokens=4000,
            timeout=60, log_source='supplies.ai_fill', log_detail=asin or url[:80] or page_text[:80],
        )
    except (LLMConfigError, LLMAPIError, ValueError) as exc:
        raise FillError(f'The AI could not fill it: {exc}') from exc
    if not isinstance(answer, dict) or answer.get('is_product') is False or not _text(answer.get('name'), 200):
        raise FillError(JUNK)

    # Price: only one the person can see in what they pasted.
    price = None
    try:
        raw = answer.get('price')
        if raw not in (None, '') and not isinstance(raw, bool):
            price = Decimal(str(raw)).quantize(Decimal('0.01'))
    except InvalidOperation:
        price = None
    if price is not None and (price <= 0 or price not in _prices_in(page_text)):
        price = None
    try:
        pack = min(100000, max(1, int(answer.get('pack_size') or 1)))
    except (TypeError, ValueError):
        pack = 1

    # Link: the one typed, else one the AI read from the text (it must really be there).
    ai_url = _clean_url(_text(answer.get('url'), 500))
    if not url and ai_url and ai_url in page_text:
        url = ai_url
    if not url and links:
        url = links[0]
    amazon = is_amazon(_text(answer.get('vendor'), 120), url) or bool(asin)
    item_number = _text(answer.get('item_number'), 60)
    if item_number and item_number not in page_text and item_number not in url:
        item_number = ''
    vendor = _text(answer.get('vendor'), 120) or ('Amazon' if amazon else '')
    host = (urlparse(url).hostname or '') if url else ''
    out = {
        'name': _text(answer.get('name'), 200),
        'description': _text(answer.get('description'), 500),
        'vendor': vendor,
        'vendor_url': 'https://www.amazon.com' if amazon else (f'https://{host}' if host else ''),
        # A clean Amazon link without the tracking tail.
        'url': f'https://www.amazon.com/dp/{asin}' if asin else url,
        'vendor_item_id': asin or item_number,
        'price': str(price) if price is not None else None,
        'unit_cost': str((price / pack).quantize(Decimal('0.01'))) if price is not None else None,
        'pack_size': pack,
        'unit': (_text(answer.get('unit'), 40) or 'each').lower(),
        'model': model,
        'price_found': price is not None,
    }
    # The form marks these as "from AI" until the person edits them.
    out['ai_fields'] = [k for k in ('name', 'description', 'vendor', 'vendor_url', 'url', 'vendor_item_id', 'price',
                                    'pack_size', 'unit') if out[k] not in ('', None)]
    return out
