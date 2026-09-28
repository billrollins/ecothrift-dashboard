"""
Settings > AI "Estimate API costs": a model reads each provider's official pricing page and reports
the exact input and output price per 1M tokens for every active model slug.

- **Who checks:** Claude, with Anthropic's web search tool, in one call.
- **What it changes:** a blank price is filled in. A price already set that differs is only
  reported; the owner applies it with a click, because a price set by hand wins.
- **Where the result lives:** the last check, with its sources, is kept in the AppSetting
  ``ai_price_check`` for the page to show.
- **How it runs:** as its own process (``python manage.py check_ai_prices``). The web page only
  starts it and polls.
"""
from __future__ import annotations

import logging
import subprocess
import sys
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

STATE_KEY = 'ai_price_check'
CHECKER = 'claude-opus-5-5'
STALE = timedelta(minutes=8)
TOOL = 'report_prices'

SYSTEM = """You check AI model API prices for a small business. For each model slug you are given, find its \
exact list price on the provider's own official pricing documentation (Anthropic, Google AI / Gemini API, \
xAI, Meta), using web search. Report the standard price in US dollars per 1 million tokens for input and \
for output, for this exact slug. If a model has tiers (for example by prompt length), report the base tier \
and say so in the note. Never guess: if the official page doesn't list this exact slug, report nulls and \
say what you found. Always give the URL you read the price from. When done, call report_prices once."""

SCHEMA = {
    'name': TOOL,
    'description': 'The exact prices found, one row per slug given.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'prices': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'slug': {'type': 'string'},
                        'input_per_million': {'type': ['number', 'null']},
                        'output_per_million': {'type': ['number', 'null']},
                        'source_url': {'type': 'string'},
                        'note': {'type': 'string'},
                    },
                    'required': ['slug', 'input_per_million', 'output_per_million', 'source_url', 'note'],
                },
            },
        },
        'required': ['prices'],
    },
}


def _state() -> dict:
    from apps.core.models import AppSetting

    return AppSetting.objects.filter(key=STATE_KEY).values_list('value', flat=True).first() or {}


def _save(state: dict) -> None:
    from apps.core.models import AppSetting

    AppSetting.objects.update_or_create(key=STATE_KEY, defaults={
        'value': state, 'description': 'Settings > AI: the last "Estimate API costs" check (prices, sources).'})


def state() -> dict:
    """The last check; a 'running' check past STALE is reported as stopped."""
    s = _state()
    if s.get('status') == 'running' and s.get('started_at'):
        started = datetime.fromisoformat(s["started_at"])
        if timezone.now() - started > STALE:
            s = {**s, 'status': 'failed', 'error': 'The check stopped before finishing. Try again.'}
            _save(s)
    return s


def start() -> dict:
    """Start the check as its own process; returns the state at once."""
    current = state()
    if current.get('status') == 'running':
        return current
    s = {'status': 'running', 'started_at': timezone.now().isoformat(), 'results': [], 'error': ''}
    _save(s)
    try:
        subprocess.Popen(
            [sys.executable, str(settings.BASE_DIR / 'manage.py'), 'check_ai_prices'], cwd=str(settings.BASE_DIR),
            start_new_session=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except OSError as exc:
        s = {**s, 'status': 'failed', 'error': f'Could not start the check: {exc}'}
        _save(s)
    return s


def _ask(rows: list[dict]) -> tuple[dict, str]:
    """One Claude call with web search; returns (tool input, model used)."""
    import anthropic

    client = anthropic.Anthropic(api_key=getattr(settings, 'ANTHROPIC_API_KEY', '') or None)
    lines = '\n'.join(f"- {r['slug']} (provider: {r['provider']})" for r in rows)
    response = client.messages.create(
        model=CHECKER, max_tokens=4000, system=SYSTEM, timeout=300,
        messages=[{'role': 'user', 'content': f'Check these model slugs:\n{lines}'}],
        tools=[{'type': 'web_search_20250305', 'name': 'web_search', 'max_uses': 12}, SCHEMA],
    )
    for block in response.content:
        if getattr(block, 'type', '') == 'tool_use' and getattr(block, 'name', '') == TOOL:
            return dict(block.input), getattr(response, 'model', CHECKER)
    raise ValueError('The checker did not report prices.')


def _dec(value) -> Decimal | None:
    try:
        return None if value is None else Decimal(str(value)).quantize(Decimal('0.0001'))
    except (InvalidOperation, ValueError):
        return None


def run() -> dict:
    """The check itself (the command runs this): ask, fill blanks, keep the report."""
    from apps.core.models import AiModel

    models = list(AiModel.objects.filter(status=AiModel.STATUS_ACTIVE, modality=AiModel.MODALITY_TEXT))
    started = _state().get('started_at') or timezone.now().isoformat()
    try:
        body, used = _ask([{'slug': m.slug, 'provider': m.provider} for m in models])
    except Exception as exc:
        logger.exception('AI price check failed')
        s = {'status': 'failed', 'started_at': started, 'finished_at': timezone.now().isoformat(), 'results': [],
             'error': str(exc)[:400]}
        _save(s)
        return s
    found = {str(p.get('slug')): p for p in body.get('prices') or []}
    results = []
    for m in models:
        p = found.get(m.slug, {})
        inp, out = _dec(p.get('input_per_million')), _dec(p.get('output_per_million'))
        filled = False
        if inp is not None and out is not None and m.input_price is None and m.output_price is None:
            m.input_price, m.output_price = inp, out
            m.save(update_fields=['input_price', 'output_price', 'updated_at'])
            filled = True
        differs = (not filled and inp is not None and out is not None
                   and (m.input_price != inp or m.output_price != out))
        results.append({
            'id': m.pk, 'slug': m.slug, 'found_input': str(inp) if inp is not None else None,
            'found_output': str(out) if out is not None else None,
            'current_input': str(m.input_price) if m.input_price is not None else None,
            'current_output': str(m.output_price) if m.output_price is not None else None,
            'filled': filled, 'differs': differs, 'source_url': str(p.get('source_url') or ''),
            'note': str(p.get('note') or '')[:300],
        })
    s = {'status': 'done', 'started_at': started, 'finished_at': timezone.now().isoformat(), 'checker': used,
         'results': results, 'error': ''}
    _save(s)
    return s
