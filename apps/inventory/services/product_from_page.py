"""
A new product from a pasted vendor page (Dash Update #224; Bill 2026-11-24: "if they find a product page they can copy
paste all text into AI to have AI Create the new product").

In Processing's "New product" on a manifest row: the processor pastes all the text of a product page; the AI drafts
the product (title, brand, model, category, retail, the pack fields, details) for review BEFORE anything is saved.
It starts from everything the manifest row already has: the page wins where it says something; the row fills what the
page leaves out. Built on Add item's AI pieces (`services/add_item.py`: the catalog's title rules and categories), with
its own action in Settings > AI (`PRODUCT_FROM_PAGE`, migration core 0023), so the model is chosen there and every run
is logged with its model, time and cost.
"""
from __future__ import annotations

import json
import time
from decimal import Decimal
from typing import Any

from apps.inventory.models import ProcessingRow
from apps.inventory.services import add_item

AI_PURPOSE = 'PRODUCT_FROM_PAGE'
AI_FEATURE = 'inventory.product_from_page'
PAGE_MAX = 16000           # a product page is cut here; its first part carries the facts
DEFAULT_MODEL = add_item.CLEAN_UP_DEFAULT_MODEL
DEFAULT_EFFORT = add_item.CLEAN_UP_DEFAULT_EFFORT


class PageError(ValueError):
    """Plain words for the person; the form is never changed then."""


def ai_model_for_page() -> tuple[str, str]:
    """(model, effort): Settings > AI when a model is picked for this action, else the house volume model."""
    from apps.core.ai_config import ai_effort, ai_model, settings_model

    model_id = ai_model(AI_PURPOSE)
    if model_id == settings_model(AI_PURPOSE):
        return DEFAULT_MODEL, DEFAULT_EFFORT
    return model_id, ai_effort(AI_PURPOSE)


def row_facts(row: ProcessingRow | None) -> dict[str, Any]:
    """What the manifest row already knows (the AI starts from it; the page wins where it says otherwise)."""
    if row is None:
        return {}
    mr = row.manifest_row if row.manifest_row_id else None
    retail = row.unit_retail if row.unit_retail is not None else (mr.unit_retail if mr is not None else None)
    facts = {
        'title': row.title or '',
        'brand': row.brand or '',
        'model': row.model or '',
        'category': row.category or '',
        'retail': str(retail) if retail is not None else '',
        'identifiers': {k: str(v) for k, v in (row.identifiers or {}).items() if v not in (None, '')},
        'specifications': {k: str(v) for k, v in (row.specifications or {}).items() if v not in (None, '')},
        'notes': row.notes or '',
        'search_tags': list(row.search_tags or []) if isinstance(row.search_tags, list) else row.search_tags or '',
        'manifest_title': (mr.title if mr is not None else '') or '',
    }
    return {k: v for k, v in facts.items() if v not in ('', [], {})}


def _prompt(cats: dict[str, list[str]]) -> str:
    return add_item._ai_system_prompt(cats, intro=(
        'A processor pasted all the text of a product page from a store\'s website (menus, reviews and other noise '
        'included) and the manifest row they are checking in (`manifest_row`). Draft THE product on that page. Where '
        'the page and the manifest row disagree, the page wins; where the page is silent, use the manifest row. '
        'Call the tool `product_from_page`.'
    )) + """
- retail_estimate: the page's own regular price for this exact product (not a sale price, not another size), in
  dollars; 0 when the page shows none.
- unit_count, unit_name, pack_units: the pack. "3 boxes of 100" is unit_count 100, unit_name "box", pack_units 3.
  A single box of 100 is unit_count 100, pack_units 1. One item (a chair, a lamp) is unit_count 1, pack_units 1.
  Write only what the page says; 0 or "" when it does not say.
- identifiers: only numbers written on the page or the row (upc, ean, mpn, sku, item_number, asin, tcin, wayfair_sku).
  Never invent a number.
- specifications: up to 8 short facts that matter to a buyer (size, capacity, material, what is in the box), name: value.
- tags: up to 8 short lowercase search words a shopper might type that are not already in the title."""


def _tool(cats: dict[str, list[str]]) -> dict:
    tool = add_item._clean_up_tool(cats)
    props = dict(tool['input_schema']['properties'])
    props.pop('price', None)
    props.pop('condition', None)
    props.update({
        'unit_count': {'type': 'integer'},
        'unit_name': {'type': 'string'},
        'pack_units': {'type': 'integer'},
    })
    return {'name': 'product_from_page', 'description': 'The product on the page.',
            'input_schema': {**tool['input_schema'], 'properties': props}}


def _whole(value) -> int | None:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if 0 < n <= 1_000_000 else None


def draft(text: str, row: ProcessingRow | None = None) -> dict[str, Any]:
    """The pasted page (and the row) in; a product draft out, nothing saved. Raises PageError with plain words."""
    from apps.core.services.ai_usage_log import estimate_cost_usd, log_ai_usage
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete
    from apps.inventory.services.product_packs import pack_label, singular

    text = (text or '').strip()
    if len(text) < 40:
        raise PageError('Paste all the text of the product page first (select all on the page, copy, paste here).')
    text = text[:PAGE_MAX]
    facts = row_facts(row)
    cats = add_item.taxonomy()
    model_id, effort = ai_model_for_page()
    detail = f'Processing: new product from a pasted page ({len(text)} chars'
    detail += f', row {row.row_number})' if row is not None else ')'
    started = time.monotonic()
    try:
        result = llm_complete(
            model_id=model_id, system=_prompt(cats),
            messages=[{'role': 'user', 'content': json.dumps({'page': text, 'manifest_row': facts}, ensure_ascii=False)}],
            tools=[_tool(cats)], tool_name='product_from_page', max_tokens=1500, effort=effort, timeout=60.0,
            log_source=AI_FEATURE, log_purpose=AI_PURPOSE, log_detail=detail,
        )
    except (LLMAPIError, LLMConfigError) as exc:
        log_ai_usage(AI_FEATURE, model_id, purpose=AI_PURPOSE, duration_ms=int((time.monotonic() - started) * 1000),
                     detail=detail, success=False, error=str(exc)[:500])
        raise PageError('The AI could not read this page right now. Try again, or fill the product in by hand.') from exc
    took_ms = int((time.monotonic() - started) * 1000)
    raw = result.tool_input
    if raw is None:
        from apps.inventory.services.category_taxonomy import extract_json_object

        try:
            raw = extract_json_object(result.text or '')
        except Exception:  # noqa: BLE001 - nothing usable came back
            raise PageError('The AI answer was not usable. Try again, or fill the product in by hand.')
    raw = raw if isinstance(raw, dict) else {}
    ai, confidence = add_item._ai_values(raw, cats, {})

    # The page wins; the row fills what the page leaves out. `source` says which, field by field.
    source: dict[str, str] = {}
    out: dict[str, Any] = {}
    for field in ('title', 'brand', 'model', 'category', 'subcategory', 'upc'):
        page_value = ai.get(field) or ''
        if field == 'brand' and page_value == 'Generic' and facts.get('brand'):
            page_value = ''
        row_value = facts.get(field, '') if field in ('title', 'brand', 'model', 'category') else ''
        if field == 'category' and row_value and row_value not in cats:
            row_value = ''
        out[field] = page_value or row_value
        if out[field]:
            source[field] = 'page' if page_value else 'row'
    retail = ai.get('retail_estimate')
    if retail is None and facts.get('retail'):
        retail = Decimal(facts['retail'])
        source['retail'] = 'row'
    elif retail is not None:
        source['retail'] = 'page'
    out['retail'] = None if retail is None else f'{retail:.2f}'
    out['identifiers'] = {**facts.get('identifiers', {}), **(ai.get('identifiers') or {})}
    if out.get('upc'):
        out['identifiers'].setdefault('upc', out['upc'])
    out['specifications'] = {**facts.get('specifications', {}), **(ai.get('specifications') or {})}
    out['tags'] = ai.get('tags') or []
    unit_count, pack_units = _whole(raw.get('unit_count')), _whole(raw.get('pack_units'))
    unit_name = singular(str(raw.get('unit_name') or '')[:40])
    out.update({'unit_count': unit_count, 'unit_name': unit_name, 'pack_units': pack_units or (1 if unit_count else None),
                'pack_label': pack_label(unit_count, unit_name, pack_units or 1)})
    if unit_count:
        source['pack'] = 'page'

    cost = None
    try:
        cost = estimate_cost_usd(result.model_used, result.input_tokens, result.output_tokens,
                                 result.cache_creation_tokens, result.cache_read_tokens)
    except Exception:  # noqa: BLE001 - a model without a price
        cost = None
    problems = []
    if not out['title']:
        problems.append('No title found: type one.')
    if not out['category']:
        problems.append('Pick a category.')
    return {
        'draft': out, 'source': source, 'confidence': confidence, 'problems': problems,
        'model': result.model_used, 'took_ms': took_ms, 'cost_usd': None if cost is None else f'{cost:.4f}',
    }
