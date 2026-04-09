"""Append-only JSONL log for Anthropic API usage (Phase 4.1B)."""

from __future__ import annotations

import json
import threading
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from django.conf import settings

_lock = threading.Lock()

_MILLION = Decimal('1000000')


def _pricing_for_model(model: str) -> dict[str, Decimal]:
    table = getattr(settings, 'AI_PRICING', {}) or {}
    key = (model or '').strip()
    if key in table:
        return table[key]
    # Fallback: Sonnet-class rates
    return table.get(
        'claude-sonnet-4-6',
        {
            'input': Decimal('3.00'),
            'output': Decimal('15.00'),
            'cache_write': Decimal('3.75'),
            'cache_read': Decimal('0.30'),
        },
    )


def estimate_cost_usd(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_creation_tokens: int = 0,
    cache_read_tokens: int = 0,
) -> Decimal:
    """USD cost from token counts using settings.AI_PRICING ($/1M tokens)."""
    p = _pricing_for_model(model)
    inp = Decimal(int(input_tokens))
    out = Decimal(int(output_tokens))
    cc = Decimal(int(cache_creation_tokens))
    cr = Decimal(int(cache_read_tokens))
    cost = (
        inp * p['input']
        + out * p['output']
        + cc * p['cache_write']
        + cr * p['cache_read']
    ) / _MILLION
    return cost.quantize(Decimal('0.000001'))


def _extract_usage_counts(usage: Any) -> tuple[int, int, int, int]:
    if usage is None:
        return 0, 0, 0, 0
    inp = int(getattr(usage, 'input_tokens', 0) or 0)
    out = int(getattr(usage, 'output_tokens', 0) or 0)
    cc = int(getattr(usage, 'cache_creation_input_tokens', 0) or 0)
    cr = int(getattr(usage, 'cache_read_input_tokens', 0) or 0)
    return inp, out, cc, cr


def log_ai_usage(
    source: str,
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    *,
    cache_creation_tokens: int = 0,
    cache_read_tokens: int = 0,
    usage: Any = None,
    auction_id: int | None = None,
    marketplace: str | None = None,
    detail: str = '',
    success: bool = True,
    error: str | None = None,
) -> None:
    """
    Append one JSON line. Thread-safe.

    Pass either ``usage`` (Anthropic response.usage) or explicit token counts.
    If ``usage`` is set, it overrides the numeric token arguments.
    """
    if usage is not None:
        input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens = _extract_usage_counts(
            usage
        )

    mid = (model or '').strip()
    estimated = estimate_cost_usd(
        mid,
        input_tokens,
        output_tokens,
        cache_creation_tokens,
        cache_read_tokens,
    )
    try:
        from django.utils import timezone as dj_tz

        ts = dj_tz.localtime(dj_tz.now()).isoformat()
    except Exception:
        ts = datetime.now().astimezone().isoformat()

    record = {
        'timestamp': ts,
        'source': source,
        'model': mid,
        'input_tokens': int(input_tokens),
        'output_tokens': int(output_tokens),
        'cache_creation_tokens': int(cache_creation_tokens),
        'cache_read_tokens': int(cache_read_tokens),
        'estimated_cost_usd': float(estimated),
        'auction_id': auction_id,
        'marketplace': marketplace,
        'detail': detail[:2000] if detail else '',
        'success': success,
        'error': error,
    }
    line = json.dumps(record, ensure_ascii=False) + '\n'
    with _lock:
        _ensure_parent(_log_path())
        with open(_log_path(), 'a', encoding='utf-8') as f:
            f.write(line)


def _log_path() -> Path:
    base = getattr(settings, 'BASE_DIR', None)
    if base is None:
        base = Path.cwd()
    else:
        base = Path(base)
    return base / 'workspace' / 'logs' / 'ai_usage.jsonl'


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def log_ai_usage_from_response(
    source: str,
    response: Any,
    *,
    model: str,
    auction_id: int | None = None,
    marketplace: str | None = None,
    detail: str = '',
) -> None:
    """Read usage from Anthropic message response and log."""
    usage = getattr(response, 'usage', None)
    mid = getattr(response, 'model', None) or model
    log_ai_usage(
        source,
        mid,
        usage=usage,
        auction_id=auction_id,
        marketplace=marketplace,
        detail=detail,
        success=True,
        error=None,
    )
