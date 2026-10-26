"""Paste an Amazon (or any vendor) link and the AI fills the item; the person checks it before saving.

The server never opens the vendor's page (no scraping; Amazon's terms forbid it). The AI reads only what the person
gives it: the link (its words and the ASIN) and, for the price, the page text they copy and paste from their own
browser. Settings → AI picks the model (purpose SUPPLY_FILL). Nothing is saved here.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from .orders import asin_from_url, is_amazon

PURPOSE = 'SUPPLY_FILL'
MAX_PAGE_CHARS = 12000
TOOL = 'fill_supply_item'
SCHEMA = {
    'name': TOOL,
    'description': 'The supply item described by the link and page text.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'name': {'type': 'string', 'description': 'Short plain name staff know it by, e.g. "Receipt paper rolls 3 1/8 in".'},
            'description': {'type': 'string', 'description': 'One short line: size, colour, brand. Empty if unknown.'},
            'vendor': {'type': 'string', 'description': 'The seller, e.g. Amazon, Uline, Walmart.'},
            'price': {'type': ['number', 'null'], 'description': 'Price of one listing (one pack) in dollars, only if the page text shows it. Else null.'},
            'pack_size': {'type': 'integer', 'description': 'How many units come in one listing (a 50-roll case is 50). 1 if unknown.'},
            'unit': {'type': 'string', 'description': 'What staff count, singular: roll, box, bag, each.'},
        },
        'required': ['name', 'vendor', 'price', 'pack_size', 'unit'],
    },
}
SYSTEM = """You fill in one supply item for a thrift store's supply list.
Use only the link and the page text you are given. Never guess a price: if the page text does not show one, price is null.
Pack size is how many countable units one listing holds (a case of 12 rolls is 12; a single item is 1).
Answer with the tool."""


class FillError(Exception):
    pass


def fill(url: str, page_text: str = '', *, user=None) -> dict:
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_chat_tool_input

    url = str(url or '').strip()
    page_text = str(page_text or '').strip()[:MAX_PAGE_CHARS]
    if not url and not page_text:
        raise FillError('Paste a link first.')
    asin = asin_from_url(url)
    amazon = is_amazon('', url)
    prompt = f'Link: {url or "(none)"}\n'
    if asin:
        prompt += f'Amazon ASIN: {asin}\n'
    prompt += f'\nPage text the person copied:\n{page_text or "(none)"}'
    try:
        answer, model = llm_chat_tool_input(
            purpose=PURPOSE, system=SYSTEM, user=prompt, tool_name=TOOL, tools=[SCHEMA], max_tokens=800,
            timeout=25, log_source='supplies.ai_fill', log_detail=asin or url[:80],
        )
    except (LLMConfigError, LLMAPIError, ValueError) as exc:
        raise FillError(f'The AI could not fill it: {exc}') from exc
    price = answer.get('price')
    try:
        price = None if price in (None, '') else str(Decimal(str(price)).quantize(Decimal('0.01')))
    except InvalidOperation:
        price = None
    try:
        pack = max(1, int(answer.get('pack_size') or 1))
    except (TypeError, ValueError):
        pack = 1
    vendor = str(answer.get('vendor') or '').strip() or ('Amazon' if amazon else '')
    return {
        'name': str(answer.get('name') or '').strip()[:200],
        'description': str(answer.get('description') or '').strip()[:500],
        'vendor': vendor[:120],
        'vendor_url': 'https://www.amazon.com' if amazon else '',
        # A clean link without the tracking tail.
        'url': f'https://www.amazon.com/dp/{asin}' if asin else url,
        'vendor_item_id': asin,
        'price': price,
        'pack_size': pack,
        'unit': (str(answer.get('unit') or '').strip() or 'each')[:40],
        'model': model,
        'price_found': price is not None,
    }
