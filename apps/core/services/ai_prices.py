"""
Settings > AI price check: Claude Opus 5.5 (high effort, with web search and web fetch) checks the input and
output price per 1M tokens of every model that is not archived.

- **What it sends:** every text model that is not archived, with our current prices as estimates, and the
  providers' official pricing pages to read. One call through the house router (``llm_complete``).
- **What comes back, per model:** verified or not, the prices it read, the page it read them on, a note.
  A price counts only when the check opened the web, the model said it verified it, and a source link came
  back. Anything else is "could not verify" and changes nothing. A price is never invented.
- **Refresh (the button):** nothing is saved. The page shows old, new and source; the user picks and saves.
- **The automatic run** (after Update finds a model with no price; ``manage.py check_ai_prices``): the same
  check. A model with no prices at all gets its verified prices at once; a price already there that differs
  waits for review, because a price somebody set is never overwritten without a look.
- **Every save is logged** in ``AppSettingHistory`` under ``ai_model_prices``: who, when, old, new, source.
- **How it runs:** as its own process (the check takes minutes; a web request has 30 seconds). The page
  starts it and polls. The last check is kept in the AppSetting ``ai_price_check``.
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
LOG_KEY = 'ai_model_prices'
CHECKER = 'claude-opus-5-5'
EFFORT = 'high'
STALE = timedelta(minutes=20)
TOOL = 'report_prices'
MAX_PRICE = Decimal('9999.9999')  # what AiModel's price fields hold

# The providers' own pricing pages. They go in the user message: web fetch only opens URLs it was given.
PAGES = {
    'anthropic': 'https://platform.claude.com/docs/en/about-claude/pricing',
    'google': 'https://ai.google.dev/gemini-api/docs/pricing',
    'xai': 'https://docs.x.ai/developers/pricing',
    'meta': 'https://dev.meta.ai/docs/pricing-rate-limits',
}

WEB_TOOLS = [
    {'type': 'web_search_20260209', 'name': 'web_search', 'max_uses': 12},
    {'type': 'web_fetch_20260209', 'name': 'web_fetch', 'max_uses': 12, 'max_content_tokens': 60000},
]

SYSTEM = """You check what AI model APIs cost, for a small business that budgets with these numbers. \
For each model in the list, find the provider's current list price for the standard pay-as-you-go API, in \
US dollars per 1 million tokens: one input price and one output price.

How to check: open the provider's own pricing page (the message lists them) and read the price there. \
Search the web when a page does not list a model or will not load. A page may show a model under its \
display name (claude-opus-5-5 is "Claude Opus 5.5").

Rules:
- Report only a price you read on a page during this check. Your memory of a price is not a source: prices \
change, and a wrong number here becomes a wrong cost report. If you cannot find the exact model on a page \
you opened, set verified to false, leave both prices null, and say in the note what you looked at.
- Prefer the provider's own page. Use another site only when the provider publishes no price, and say so in \
the note.
- Standard tier only: not batch, not cached, not a priority or fast tier. If the price depends on prompt \
length, or changes on a date, report the base price in effect today and put the rest in the note.
- source_url is the page where you read that model's price.
- Our current numbers are estimates. They may be right, wrong or missing; do not let them steer what you \
report.
- Keep each note to one or two plain sentences.

Report every model in the list, once each, by calling report_prices."""

SCHEMA = {
    'name': TOOL,
    'description': 'The prices read from the web, one row per model in the list.',
    'strict': True,
    'input_schema': {
        'type': 'object',
        'properties': {
            'prices': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'slug': {'type': 'string'},
                        'verified': {'type': 'boolean'},
                        'input_per_million': {'anyOf': [{'type': 'number'}, {'type': 'null'}]},
                        'output_per_million': {'anyOf': [{'type': 'number'}, {'type': 'null'}]},
                        'source_url': {'type': 'string'},
                        'note': {'type': 'string'},
                    },
                    'required': ['slug', 'verified', 'input_per_million', 'output_per_million', 'source_url', 'note'],
                    'additionalProperties': False,
                },
            },
        },
        'required': ['prices'],
        'additionalProperties': False,
    },
}


# ── the kept state ───────────────────────────────────────────────────────────

def _state() -> dict:
    from apps.core.models import AppSetting

    return AppSetting.objects.filter(key=STATE_KEY).values_list('value', flat=True).first() or {}


def _save(state: dict) -> None:
    from apps.core.models import AppSetting

    AppSetting.objects.update_or_create(key=STATE_KEY, defaults={
        'value': state, 'description': 'Settings > AI: the last price check (found prices, sources).'})


def state() -> dict:
    """The last check; a 'running' check past STALE is reported as stopped."""
    s = _state()
    if s.get('status') == 'running' and s.get('started_at'):
        started = datetime.fromisoformat(s['started_at'])
        if timezone.now() - started > STALE:
            s = {**s, 'status': 'failed', 'error': 'The check stopped before finishing. Try again.'}
            _save(s)
    if any('verdict' not in r for r in s.get('results') or []):  # a check kept by the old code
        s = {**s, 'results': []}
    return s


def _name(user) -> str:
    return (getattr(user, 'full_name', '') or getattr(user, 'email', '') or '') if user is not None else ''


def _models() -> list:
    from apps.core.models import AiModel

    return list(AiModel.objects.filter(modality=AiModel.MODALITY_TEXT)
                .exclude(status=AiModel.STATUS_ARCHIVED).order_by('provider', 'slug'))


def has_blank() -> bool:
    """True when a text model that is not archived still shows "set" for a price."""
    return any(m.input_price is None or m.output_price is None for m in _models())


def start(*, save_blanks: bool, user=None) -> dict:
    """Start the check as its own process; returns the state at once.

    ``save_blanks`` is the automatic run (after Update): it starts only when some price is missing.
    """
    current = state()
    if current.get('status') == 'running':
        return current
    if save_blanks and not has_blank():
        return current or {'status': 'done', 'results': []}
    s = {'status': 'running', 'started_at': timezone.now().isoformat(), 'auto': save_blanks,
         'requested_by': _name(user), 'results': [], 'error': ''}
    _save(s)
    args = [sys.executable, str(settings.BASE_DIR / 'manage.py'), 'check_ai_prices']
    if not save_blanks:
        args.append('--review')
    if user is not None:
        args += ['--by', str(user.pk)]
    try:
        subprocess.Popen(
            args, cwd=str(settings.BASE_DIR),
            start_new_session=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except OSError as exc:
        s = {**s, 'status': 'failed', 'error': f'Could not start the check: {exc}'}
        _save(s)
    return s


# ── the check ────────────────────────────────────────────────────────────────

def _text(d: Decimal | None) -> str | None:
    return None if d is None else str(d)


def _dec(value) -> Decimal | None:
    """A price as the model fields hold it, or None for anything that is not a usable price."""
    if value is None or isinstance(value, bool):
        return None
    try:
        d = Decimal(str(value)).quantize(Decimal('0.0001'))
    except (InvalidOperation, ValueError):
        return None
    return d if d.is_finite() and 0 <= d <= MAX_PRICE else None


def _question(models: list) -> str:
    lines = []
    for m in models:
        ours = (f'input ${m.input_price.normalize():f}' if m.input_price is not None else 'input not set') + ', ' + (
            f'output ${m.output_price.normalize():f}' if m.output_price is not None else 'output not set')
        name = f' ("{m.label}")' if m.label else ''
        lines.append(f'- {m.slug}{name}, provider {m.provider}. Our estimate per 1M tokens: {ours}.')
    pages = '\n'.join(f'- {provider}: {url}' for provider, url in PAGES.items()
                      if any(m.provider == provider for m in models))
    return (
        f"Today is {timezone.localdate():%B %d, %Y}. Here are the models we use and our price estimates. "
        'Check each one and report the prices you find, with any corrections.\n\n'
        + '\n'.join(lines)
        + f'\n\nThe official pricing pages:\n{pages}'
    )


def _ask(models: list) -> tuple[dict, dict]:
    """One routed call. Returns (the reported rows, what the call used: model, web searches, web fetches)."""
    from apps.core.services.llm_router import llm_complete

    result = llm_complete(
        model_id=CHECKER, effort=EFFORT, system=SYSTEM, user=_question(models),
        max_tokens=32000, timeout=600, tools=[SCHEMA], tool_name=TOOL, server_tools=WEB_TOOLS,
        log_source='ai_price_check', log_detail=f'{len(models)} models',
    )
    if not isinstance(result.tool_input, dict):
        raise ValueError('The checker did not report prices. Try again.')
    return result.tool_input, {'model': result.model_used, 'web_searches': result.web_search_requests,
                               'web_fetches': result.web_fetch_requests}


def log_change(changes: list[dict], user, how: str) -> None:
    """Keep who changed which model prices, from what, to what. ``changes``: slug, old/new input and output, source."""
    from apps.core.models import AppSettingHistory

    if not changes:
        return
    AppSettingHistory.objects.create(
        key=LOG_KEY,
        old_value={c['slug']: {'input': c['old_input'], 'output': c['old_output']} for c in changes},
        new_value={c['slug']: {'input': c['new_input'], 'output': c['new_output'],
                               'source': c.get('source', ''), 'how': how} for c in changes},
        changed_by=user,
    )


def _set_prices(m, inp: Decimal, out: Decimal, source: str) -> dict:
    change = {'slug': m.slug, 'old_input': _text(m.input_price), 'old_output': _text(m.output_price),
              'new_input': _text(inp), 'new_output': _text(out), 'source': source}
    m.input_price, m.output_price = inp, out
    m.save(update_fields=['input_price', 'output_price', 'updated_at'])
    return change


def run(*, save_blanks: bool = True, user=None) -> dict:
    """The check itself (the command runs this): ask once, sort every model into confirmed, changed or
    could not verify, and keep the report. ``save_blanks`` also saves the prices of models that had none."""
    models = _models()
    kept = _state()
    base = {
        'started_at': kept.get('started_at') if kept.get('status') == 'running' else timezone.now().isoformat(),
        'auto': save_blanks, 'requested_by': _name(user), 'effort': EFFORT, 'error': '',
    }
    if not models:
        s = {**base, 'status': 'done', 'finished_at': timezone.now().isoformat(), 'results': []}
        _save(s)
        return s
    try:
        body, used = _ask(models)
    except Exception as exc:  # noqa: BLE001 - whatever went wrong, the page must say so
        logger.exception('AI price check failed')
        s = {**base, 'status': 'failed', 'finished_at': timezone.now().isoformat(), 'results': [],
             'error': str(exc)[:400]}
        _save(s)
        return s
    reported = {str(p.get('slug')): p for p in body.get('prices') or [] if isinstance(p, dict)}
    looked = (used.get('web_searches') or 0) + (used.get('web_fetches') or 0) > 0
    results, filled = [], []
    for m in models:
        p = reported.get(m.slug)
        inp = _dec(p.get('input_per_million')) if p else None
        out = _dec(p.get('output_per_million')) if p else None
        url = str(p.get('source_url') or '').strip() if p else ''
        note = str(p.get('note') or '').strip()[:400] if p else ''
        linked = url.lower().startswith(('http://', 'https://'))
        ok = bool(p and p.get('verified') is True and inp is not None and out is not None and linked and looked)
        if not ok:
            if p is None:
                note = 'The check did not report on this model.'
            elif not looked:
                note = 'The check did not open any web page, so nothing was verified.'
            elif p.get('verified') is True and inp is not None and out is not None and not linked:
                note = 'A price came back with no source link, so it was not used.'
            elif not note:
                note = 'No price was found on a page.'
            inp = out = None
        row = {
            'id': m.pk, 'slug': m.slug, 'label': m.label, 'provider': m.provider,
            'current_input': _text(m.input_price), 'current_output': _text(m.output_price),
            'found_input': _text(inp), 'found_output': _text(out),
            'source_url': url if linked else '', 'note': note, 'saved': '',
        }
        if not ok:
            row['verdict'] = 'not_verified'
        elif m.input_price == inp and m.output_price == out:
            row['verdict'] = 'confirmed'
        else:
            row['verdict'] = 'changed'
            if save_blanks and m.input_price is None and m.output_price is None:
                filled.append(_set_prices(m, inp, out, url))
                row['saved'] = 'auto'
        results.append(row)
    log_change(filled, user, 'price check, filled a missing price')
    s = {**base, 'status': 'done', 'finished_at': timezone.now().isoformat(), 'checker': used.get('model') or CHECKER,
         'web_searches': used.get('web_searches') or 0, 'web_fetches': used.get('web_fetches') or 0,
         'results': results}
    _save(s)
    return s


def apply(ids: list, user) -> dict:
    """Save the reviewed changes: the found prices of these model ids, from the kept check (not from the
    browser). A model whose price changed since the check is skipped and marked, so nothing unseen is saved."""
    from django.db import transaction

    from apps.core.models import AiModel

    s = state()
    if s.get('status') != 'done':
        raise ValueError('There is no finished price check to save. Run Refresh prices first.')
    wanted = {int(i) for i in ids if str(i).isdigit()}
    changes = []
    with transaction.atomic():
        for row in s.get('results') or []:
            if row['id'] not in wanted or row.get('verdict') != 'changed' or row.get('saved'):
                continue
            m = AiModel.objects.select_for_update().filter(pk=row['id']).first()
            if m is None or _text(m.input_price) != row['current_input'] or _text(m.output_price) != row['current_output']:
                row['stale'] = True
                continue
            changes.append(_set_prices(m, Decimal(row['found_input']), Decimal(row['found_output']), row['source_url']))
            row['saved'] = 'review'
        log_change(changes, user, 'price check, reviewed')
        if changes:
            s['saved'] = {'by': _name(user), 'at': timezone.now().isoformat(), 'count': len(changes)}
        _save(s)
    return s
