"""One ``AIUsage`` row per AI call: what for, who asked, which model, tokens, cost (standards T37).

Before 2026-10-21 this appended to ``workspace/logs/ai_usage.jsonl``, which a Heroku restart wiped. Now every
call is a row, and the Owner page adds them up (Today / This week / This month, by feature and by who).

**Who.** ``user`` when the caller passes one. Otherwise the Dash login of the request this call runs in: the JWT
check (``IdleStampJWTAuthentication``) calls :func:`set_request_user`, and ``AIUsageActorMiddleware`` clears it
at the start and end of every request. With no user, the call is a job: ``context['job']`` names it (the
``manage.py`` command, or ``'background'`` for a thread a page started).
"""

from __future__ import annotations

import contextvars
import logging
import sys
from decimal import Decimal
from typing import Any

from django.conf import settings

log = logging.getLogger(__name__)

_MILLION = Decimal('1000000')

# The Dash login of the request this code runs in (None outside a request, and in threads it starts).
_request_user: contextvars.ContextVar = contextvars.ContextVar('ai_usage_request_user', default=None)


def set_request_user(user) -> None:
    """Remember the signed-in user of this request, so AI calls made while serving it are charged to them."""
    _request_user.set(user if getattr(user, 'is_authenticated', False) else None)


def clear_request_user() -> None:
    _request_user.set(None)


def current_job() -> str:
    """The job an AI call with no user belongs to: the ``manage.py`` command, else ``background``."""
    argv = [a for a in sys.argv if a]
    if len(argv) >= 2 and argv[0].endswith('manage.py') and argv[1] not in ('runserver', 'test', 'shell'):
        return argv[1]
    return 'background'


def model_prices(model: str) -> tuple[Decimal, Decimal] | None:
    """(input, output) USD per 1M tokens from Settings > AI, or None when either is unknown."""
    from apps.core.models import AiModel

    row = AiModel.objects.filter(slug=(model or '').strip()).values_list('input_price', 'output_price').first()
    if row and row[0] is not None and row[1] is not None:
        return row[0], row[1]
    return None


def _pricing_for_model(model: str) -> dict[str, Decimal]:
    prices = model_prices(model)
    if prices is not None:  # the prices kept in Settings > AI win over the old settings table
        return {'input': prices[0], 'output': prices[1], 'cache_write': prices[0] * Decimal('1.25'),
                'cache_read': prices[0] * Decimal('0.1')}
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
    purpose: str = '',
    user=None,
    duration_ms: int = 0,
    context: dict | None = None,
    cost_usd: Decimal | None = None,
    detail: str = '',
    success: bool = True,
    error: str | None = None,
) -> None:
    """Record one AI call. Never raises: a logging problem must not break the AI call.

    Pass either ``usage`` (Anthropic response.usage) or explicit token counts; ``usage`` wins. ``cost_usd`` is for
    calls not priced by tokens (an image); otherwise the cost comes from the model's prices.
    """
    if usage is not None:
        input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens = _extract_usage_counts(
            usage
        )
    mid = (model or '').strip()
    try:
        from django.db import transaction
        from django.utils import timezone

        from apps.core.models import AIUsage

        who = user if user is not None else _request_user.get()
        ctx = dict(context) if context else {}
        if auction_id is not None:
            ctx['auction_id'] = auction_id
        if marketplace:
            ctx['marketplace'] = marketplace
        if who is None and 'job' not in ctx:
            ctx['job'] = current_job()
        cost = Decimal(str(cost_usd)) if cost_usd is not None else estimate_cost_usd(
            mid, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
        )
        # Its own savepoint, so a failed insert cannot poison the caller's transaction.
        with transaction.atomic():
            AIUsage.objects.create(
                created_at=timezone.now(),
                source=(source or '')[:64],
                purpose=(purpose or '')[:64],
                model=mid[:160],
                user_id=getattr(who, 'pk', who) or None,
                input_tokens=max(0, int(input_tokens)),
                output_tokens=max(0, int(output_tokens)),
                cache_creation_tokens=max(0, int(cache_creation_tokens)),
                cache_read_tokens=max(0, int(cache_read_tokens)),
                estimated_cost_usd=cost.quantize(Decimal('0.000001')),
                duration_ms=max(0, int(duration_ms)),
                context=ctx,
                detail=detail[:2000] if detail else '',
                success=bool(success),
                error=str(error)[:2000] if error else '',
            )
    except Exception:  # noqa: BLE001
        log.warning('could not record AI usage for %s / %s', source or purpose, mid, exc_info=True)


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
