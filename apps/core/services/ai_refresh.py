"""Settings > AI "Refresh" (Dash #195): every model, price and score in one parallel pass, in seconds.

One button, three sources, all asked at the same time:

1. **Each provider's own list-models API** (Anthropic, OpenAI, xAI, Google, Meta): the exact current slugs. A slug
   we have never seen is added (active). An active model the provider no longer lists is reported as gone.
2. **Artificial Analysis** (``ARTIFICIAL_ANALYSIS_API_KEY``; free key): list price per 1M input and output tokens,
   the Intelligence Index, AA's cost per task of that index (one test question, thinking included: price per
   performance; what AA spent running it, not our cost),
   and output speed. Without the key the page says "no AA data" and the rest still works.
3. **A triage of three models** through our own keys (one cheap model from each of three providers): "what does
   each of these models cost per 1M tokens?" A price counts when two of the three agree.

Merging, per active text model: the new price is AA's, else the triage's agreed price. A model with no price gets it
(source ``aa`` or ``triage``). A saved price that matches is marked checked. A saved price that differs is never
overwritten: the new one waits on the row as a flag, with the reason, for the owner to take or dismiss. When AA and
the triage disagree with each other, that is flagged too. Every save is logged in ``AppSettingHistory``
(``ai_model_prices``): who, when, old, new, how.

The calls run in threads with short timeouts so the whole Refresh stays well inside Heroku's 30-second limit. The
last Refresh's summary is kept in the AppSetting ``ai_refresh``.
"""
from __future__ import annotations

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, wait
from decimal import Decimal, InvalidOperation

from django.utils import timezone

logger = logging.getLogger(__name__)

STATE_KEY = 'ai_refresh'
LOG_KEY = 'ai_model_prices'
AA_URL = 'https://artificialanalysis.ai/api/v2/language/models/free'
AA_IMAGE_URL = 'https://artificialanalysis.ai/api/v2/media/text-to-image/models/free'
AA_TIMEOUT = 8.0
AA_MAX_PAGES = 10
TRIAGE_TIMEOUT = 8.0       # each triage model; the Refresh waits at most this long for them
TRIAGE_PROVIDERS = ('openai', 'xai', 'google', 'anthropic', 'meta')  # first three with a key and a priced model
TRIAGE_TOOL = 'report_prices'
AGREE = Decimal('0.02')    # two prices within 2% agree
MAX_PRICE = Decimal('9999.9999')

# Words in an AA or provider slug that name a variant (thinking on or off), not a different model.
# A price-plan word names the same model sold on another plan (Meta's Spark "contributor" plan is far below list):
# AA's Perf applies, AA's list price does not, and AA's cost per task is scaled to our price.
PRICE_PLAN_WORDS = {'contributor'}
VARIANT_WORDS = {'thinking', 'reasoning', 'non', 'nonreasoning', 'adaptive', 'preview', 'latest', 'max', 'xhigh',
                 'high', 'medium', 'low', 'minimal', 'experimental', 'exp'} | PRICE_PLAN_WORDS
DATE = re.compile(r'^\d{4}$|^\d{6,8}$')
# Per-image list prices OpenAI and Google publish only on their pricing pages (their model APIs carry none), read
# 2026-11-20: OpenAI's image guide cost calculator / table at medium quality, 1024x1024 (image_router asks for medium);
# Google's pricing page at 1K. Refresh fills a blank image price from here (source "list"); a typed price wins.
# https://developers.openai.com/api/docs/guides/image-generation  https://aistudio.google.com/docs/pricing
IMAGE_PAGE_PRICES = {
    'gpt-image-2.6-sunburst': Decimal('0.0435'), 'gpt-image-2.6-flare': Decimal('0.0435'),
    'gpt-image-2.5-sunburst': Decimal('0.0132'), 'gpt-image-2.5-flare': Decimal('0.0132'),
    'gpt-image-2': Decimal('0.053'), 'gpt-image-1.5': Decimal('0.034'), 'gpt-image-1-mini': Decimal('0.011'),
    'gemini-3-pro-image': Decimal('0.134'), 'gemini-3.1-flash-image': Decimal('0.067'),
    'gemini-3.1-flash-lite-image': Decimal('0.0336'), 'gemini-nano-banana-2.1': Decimal('0.0336'),
    'gemini-2.5-flash-image': Decimal('0.039'),
}
# Maker names AA puts in some slugs (openai-gpt_image-1-5, gemini_nano-banana-pro) and providers do not, or the reverse.
BRAND_WORDS = {'openai', 'google', 'gemini', 'xai', 'meta', 'anthropic'}


def on_price_plan(slug: str) -> bool:
    return bool(PRICE_PLAN_WORDS & set(tokens(slug)[1]))


def list_price(m, aa: dict | None) -> tuple | None:
    """AA's list price for this model, or None when AA has none or the model is on another price plan."""
    if aa is None or aa['input'] is None or aa['output'] is None or on_price_plan(m.slug):
        return None
    return aa['input'], aa['output']


def task_cost(m, aa: dict) -> Decimal | None:
    """AA's cost per task; on a price plan, scaled by our blended price (3 input : 1 output) over AA's."""
    cost = aa['task_cost']
    if cost is None or not on_price_plan(m.slug):
        return cost
    if None in (m.input_price, m.output_price, aa['input'], aa['output']):
        return None
    theirs = 3 * aa['input'] + aa['output']
    if not theirs:
        return None
    return (cost * (3 * m.input_price + m.output_price) / theirs).quantize(Decimal('0.0001'))


# ── small helpers ────────────────────────────────────────────────────────────

def _dec(value) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        d = Decimal(str(value)).quantize(Decimal('0.0001'))
    except (InvalidOperation, ValueError):
        return None
    return d if d.is_finite() and 0 <= d <= MAX_PRICE else None


def _date(value):
    """A YYYY-MM-DD string as a date, or None."""
    from datetime import date

    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


def _text(d: Decimal | None) -> str | None:
    return None if d is None else str(d)


def _money(d: Decimal | None) -> str:
    return '?' if d is None else f'${d.normalize():f}'


def _close(a: Decimal | None, b: Decimal | None) -> bool:
    if a is None or b is None:
        return False
    if a == b:
        return True
    top = max(abs(a), abs(b))
    return top > 0 and abs(a - b) / top <= AGREE


def _pair_close(a: tuple, b: tuple) -> bool:
    return _close(a[0], b[0]) and _close(a[1], b[1])


def _name(user) -> str:
    return (getattr(user, 'full_name', '') or getattr(user, 'email', '') or '') if user is not None else ''


def tokens(slug: str) -> tuple[tuple, tuple]:
    """(model words, variant words) of a slug, order-free: claude-opus-5-5 == claude-5-5-opus; dates dropped."""
    words = [w for w in re.split(r'[^a-z0-9]+', str(slug or '').lower()) if w and not DATE.match(w)]
    core = tuple(sorted(w for w in words if w not in VARIANT_WORDS and w not in BRAND_WORDS))
    variant = tuple(sorted(w for w in words if w in VARIANT_WORDS))
    return core, variant


# ── 1. provider lists ────────────────────────────────────────────────────────

def _provider_lists() -> dict:
    """{provider: (rows, error)} where rows = [(slug, label, modality)]. Runs in a thread: no database."""
    from apps.core.services.ai_catalog import PROVIDER_LISTERS

    out = {}
    with ThreadPoolExecutor(max_workers=len(PROVIDER_LISTERS)) as pool:
        futures = {}
        for provider, key_fn, lister in PROVIDER_LISTERS:
            key = key_fn()
            if not key:
                out[provider] = (None, 'No API key')
                continue
            futures[provider] = pool.submit(lister, key)
        for provider, fut in futures.items():
            try:
                out[provider] = (fut.result(), '')
            except Exception as exc:  # noqa: BLE001 - one provider failing must not stop the others
                logger.warning('AI model list failed for %s: %s', provider, exc)
                out[provider] = (None, str(exc)[:200])
    return out


# ── 2. Artificial Analysis ───────────────────────────────────────────────────

def fetch_aa(api_key: str) -> list[dict]:
    """Every free-tier AA language model, flattened to the fields we keep. Runs in a thread: no database."""
    import requests

    rows = []
    for page in range(1, AA_MAX_PAGES + 1):
        resp = requests.get(AA_URL, headers={'x-api-key': api_key}, params={'page': page}, timeout=AA_TIMEOUT)
        if resp.status_code >= 400:
            raise RuntimeError(f'HTTP {resp.status_code}: {(resp.text or "")[:200]}')
        body = resp.json()
        for m in body.get('data') or []:
            evals = m.get('evaluations') or {}
            pricing = m.get('pricing') or {}
            perf3 = m.get('performance_v3') or {}
            perf = m.get('performance') or {}
            cost = m.get('artificial_analysis_intelligence_index_cost') or {}
            rows.append({
                'slug': str(m.get('slug') or ''),
                'name': str(m.get('name') or ''),
                'creator': str((m.get('model_creator') or {}).get('name') or ''),
                'intelligence': _dec(evals.get('artificial_analysis_intelligence_index')),
                'task_cost': _dec((cost.get('cost_per_task') or {}).get('total_cost')),
                'speed': _dec(perf3.get('mean_output_tokens_per_second') or perf.get('median_output_tokens_per_second')),
                'released': _date(m.get('release_date')),
                'input': _dec(pricing.get('price_1m_input_tokens')),
                'output': _dec(pricing.get('price_1m_output_tokens')),
            })
        if not (body.get('pagination') or {}).get('has_more'):
            break
    return [r for r in rows if r['slug']]


def fetch_aa_images(api_key: str) -> list[dict]:
    """AA's text-to-image arena (free tier): slug, name and ELO, which the page shows as an image model's Perf."""
    import requests

    resp = requests.get(AA_IMAGE_URL, headers={'x-api-key': api_key}, timeout=AA_TIMEOUT)
    if resp.status_code >= 400:
        raise RuntimeError(f'HTTP {resp.status_code}: {(resp.text or "")[:200]}')
    return [{'slug': str(m.get('slug') or ''), 'name': str(m.get('name') or ''), 'intelligence': _dec(m.get('elo')),
             'task_cost': None, 'speed': None, 'input': None, 'output': None}
            for m in resp.json().get('data') or [] if m.get('slug')]


def match_aa(slug: str, aa_rows: list[dict], saved: str = '', label: str = '') -> dict | None:
    """The AA row for one of our slugs. A saved AA slug that still exists wins; else the same model words (maker names
    ignored), else our display name against AA's name (Google calls gemini-3.1-flash-image "Nano Banana 2"); among
    variants the one with our variant words, else the highest score (thinking on)."""
    by_slug = {r['slug']: r for r in aa_rows}
    if saved and saved in by_slug:
        return by_slug[saved]
    core, variant = tokens(slug)
    hits = [r for r in aa_rows if tokens(r['slug'])[0] == core]
    if not hits and label:
        named = tokens(label)[0]
        hits = [r for r in aa_rows if named and tokens(re.sub(r'\(.*?\)', '', r['name']))[0] == named]
    if not hits:
        return None
    same = [r for r in hits if tokens(r['slug'])[1] == variant]
    pool = same if same and variant else hits
    return max(pool, key=lambda r: (r['intelligence'] is not None, r['intelligence'] or 0))


# ── 3. the three-model triage ────────────────────────────────────────────────

TRIAGE_SYSTEM = (
    'You know AI model API prices. For the model ids in the list, give the standard pay-as-you-go API list price in '
    'US dollars per 1 million input tokens and per 1 million output tokens (not batch, not cached). List only the '
    'models whose price you know for that exact id; leave the others out. Never guess from a similar model. Answer '
    'by calling report_prices.'
)
TRIAGE_SCHEMA = {
    'name': TRIAGE_TOOL,
    'description': 'One row per model id whose price you know: input and output USD per 1M tokens.',
    'input_schema': {
        'type': 'object',
        'properties': {'prices': {'type': 'array', 'items': {
            'type': 'object',
            'properties': {
                'slug': {'type': 'string'},
                'input_per_million': {'type': 'number'},
                'output_per_million': {'type': 'number'},
            },
            'required': ['slug', 'input_per_million', 'output_per_million'],
        }}},
        'required': ['prices'],
    },
}


def triage_models(models: list) -> list[str]:
    """The three triage models: from each provider in order, its cheapest priced active text model with a key."""
    from apps.core.services.llm_router import is_provider_configured

    picks = []
    for provider in TRIAGE_PROVIDERS:
        mine = sorted((m for m in models if m.provider == provider and m.output_price is not None),
                      key=lambda m: (m.output_price, m.slug))
        if mine and is_provider_configured(mine[0].slug):
            picks.append(mine[0].slug)
        if len(picks) == 3:
            break
    return picks


def ask_triage(model_id: str, slugs: list[str]) -> dict[str, tuple]:
    """One triage call: {slug: (input, output)} for the prices this model says it knows. Runs in a thread."""
    from django.db import connection

    from apps.core.services.llm_router import llm_complete

    try:
        result = llm_complete(
            model_id=model_id, system=TRIAGE_SYSTEM, user='Model ids:\n' + '\n'.join(f'- {s}' for s in slugs),
            tools=[TRIAGE_SCHEMA], tool_name=TRIAGE_TOOL, max_tokens=4000, timeout=TRIAGE_TIMEOUT, max_retries=0,
            effort='off', log_source='ai_refresh_triage', log_detail=f'{len(slugs)} models',
        )
        out = {}
        for p in (result.tool_input or {}).get('prices') or []:
            if isinstance(p, dict):
                pair = (_dec(p.get('input_per_million')), _dec(p.get('output_per_million')))
                if pair[0] is not None and pair[1] is not None:
                    out[str(p.get('slug') or '')] = pair
        return out
    finally:
        connection.close()  # the usage log opened this thread's own connection


def agreed(answers: list[dict]) -> dict[str, tuple]:
    """{slug: (input, output)} where at least two triage answers agree (within 2%)."""
    out = {}
    slugs = {s for a in answers for s in a}
    for slug in slugs:
        pairs = [a[slug] for a in answers if slug in a]
        for i, pair in enumerate(pairs):
            if sum(1 for j, other in enumerate(pairs) if j != i and _pair_close(pair, other)) >= 1:
                out[slug] = pair
                break
    return out


# ── merge and save ───────────────────────────────────────────────────────────

def log_change(changes: list[dict], user, how: str) -> None:
    """Keep who changed which model prices, from what, to what."""
    from apps.core.models import AppSettingHistory

    if not changes:
        return
    AppSettingHistory.objects.create(
        key=LOG_KEY,
        old_value={c['slug']: {'input': c['old_input'], 'output': c['old_output']} for c in changes},
        new_value={c['slug']: {'input': c['new_input'], 'output': c['new_output'], 'how': how} for c in changes},
        changed_by=user,
    )


def _change(m, inp: Decimal | None, out: Decimal | None) -> dict:
    return {'slug': m.slug, 'old_input': _text(m.input_price), 'old_output': _text(m.output_price),
            'new_input': _text(inp), 'new_output': _text(out)}


OFFER = {'aa': 'AA', 'triage': '2 of 3 models'}


def _flag(m, note: str, offered: tuple, source: str) -> None:
    m.price_flag = f'{note} Offered: {OFFER[source]}.'[:400]
    m.flag_input, m.flag_output = offered


def flag_source(m) -> str:
    """Where the price waiting on a flag came from: aa | triage."""
    return 'triage' if m.price_flag.endswith(f'Offered: {OFFER["triage"]}.') else 'aa'


def merge_prices(m, aa: tuple | None, triage: tuple | None, now) -> tuple[str, dict | None]:
    """Decide one model's prices. Returns (what happened, a change to log or None); the row is changed, not saved.

    what happened: filled | confirmed | flagged | none. A saved price is never overwritten here.
    """
    saved = (m.input_price, m.output_price)
    has_saved = saved[0] is not None and saved[1] is not None
    found, source = (aa, 'aa') if aa else (triage, 'triage') if triage else (None, '')
    if found is None:
        return 'none', None
    split = bool(aa and triage and not _pair_close(aa, triage))
    say = f'2 of 3 models say {_money(triage[0])} / {_money(triage[1])}.' if triage else ''
    m.price_flag, m.flag_input, m.flag_output = '', None, None
    if not has_saved:
        change = _change(m, *found)
        m.input_price, m.output_price = found
        m.price_source, m.price_checked_at = source, now
        if split:
            _flag(m, f'Filled from AA. {say}', triage, 'triage')
        return 'filled', change
    if _pair_close(saved, found):
        m.price_checked_at = now
        if source == 'aa':
            m.price_source = 'aa'
        if split:
            _flag(m, f'AA matches the saved price. {say}', triage, 'triage')
            return 'flagged', None
        return 'confirmed', None
    who = 'AA says' if source == 'aa' else '2 of 3 models say'
    note = f'Saved {_money(saved[0])} / {_money(saved[1])}; {who} {_money(found[0])} / {_money(found[1])}.'
    if split:
        note += ' ' + say
    _flag(m, note, found, source)
    return 'flagged', None


def _triage_needed(models: list, aa_f) -> bool:
    """True when AA did not answer, or leaves a model with no price at all, or differs from a saved price."""
    if aa_f is None or not aa_f.done() or aa_f.exception() is not None:
        return True
    rows = aa_f.result()
    for m in models:
        price = list_price(m, match_aa(m.slug, rows, m.aa_slug))
        if price is None:
            if m.input_price is None or m.output_price is None:
                return True  # AA cannot price it and we have no price: the triage may
            continue  # a saved price AA does not cover stays as it is
        if not _pair_close((m.input_price, m.output_price), price):
            return True
    return False


def _retype(m, modality: str) -> str:
    """The provider says this model makes images (or text), not what we had: fix its type, and take it off any tier
    or action of the other type. Returns the slug."""
    from apps.core.models import AiAction, AiTier

    AiTier.objects.filter(model=m).exclude(modality=modality).update(model=None)
    AiAction.objects.filter(model=m).exclude(modality=modality).update(model=None)
    m.modality = modality
    if modality == 'image':
        m.input_price = m.output_price = None  # token prices mean nothing for a picture model
    m.save(update_fields=['modality', 'input_price', 'output_price', 'updated_at'])
    return m.slug


def refresh(user=None) -> dict:
    """The Refresh button: lists, AA and triage in parallel, merged into the catalog. Returns the summary."""
    from apps.core.models import AiModel, AppSetting
    from apps.core.services.llm_api_keys import resolve_artificial_analysis_key

    started = time.monotonic()
    now = timezone.now()
    aa_key = resolve_artificial_analysis_key()
    before = list(AiModel.objects.filter(status=AiModel.STATUS_ACTIVE, modality=AiModel.MODALITY_TEXT))
    triage_ids = triage_models(before)
    slugs = sorted(m.slug for m in before)

    pool = ThreadPoolExecutor(max_workers=2 + len(triage_ids))
    lists_f = pool.submit(_provider_lists)
    aa_f = pool.submit(fetch_aa, aa_key) if aa_key else None
    aa_img_f = pool.submit(fetch_aa_images, aa_key) if aa_key else None
    triage_f = {mid: pool.submit(ask_triage, mid, slugs) for mid in triage_ids} if slugs else {}
    wait([lists_f] + [f for f in (aa_f, aa_img_f) if f], timeout=TRIAGE_TIMEOUT + 4)
    # The triage is waited for only when AA leaves a price missing or different from ours: then the Refresh takes
    # up to TRIAGE_TIMEOUT; when AA confirms every price it is done as soon as the lists and AA are.
    if triage_f and _triage_needed(before, aa_f):
        wait(list(triage_f.values()), timeout=max(1.0, TRIAGE_TIMEOUT + 4 - (time.monotonic() - started)))
    pool.shutdown(wait=False, cancel_futures=True)

    # 1. new slugs and gone ones
    providers, retyped, list_prices, list_dates = [], [], {}, {}
    lists = lists_f.result() if lists_f.done() else {}
    listed: dict[str, set] = {}
    for provider, (rows, error) in sorted(lists.items()):
        added = []
        if rows is not None:
            listed[provider] = {r[0] for r in rows}
            for slug, label, modality, *more in rows:
                row, created = AiModel.objects.get_or_create(slug=slug, defaults={
                    'label': label, 'provider': provider, 'modality': modality,
                    'status': AiModel.STATUS_ACTIVE, 'source': AiModel.SOURCE_DISCOVERED,
                })
                if created:
                    added.append(slug)
                elif row.modality != modality:
                    retyped.append(_retype(row, modality))
                if more and more[0].get('image_price') is not None:
                    list_prices[slug] = more[0]['image_price']
                if more and more[0].get('released'):
                    list_dates[slug] = more[0]['released']
        providers.append({'provider': provider, 'ok': rows is not None, 'found': len(rows or []),
                          'added': added, 'error': error})
    from apps.core.services.ai_catalog import SNAPSHOT

    def still_listed(m) -> bool:
        snap = SNAPSHOT.match(m.slug)  # a dated snapshot left out of the list because its alias is in it
        return m.slug in listed[m.provider] or bool(snap and snap.group('base') in listed[m.provider])

    gone = sorted(m.slug for m in AiModel.objects.filter(status=AiModel.STATUS_ACTIVE)
                  if m.provider in listed and not still_listed(m))

    # 2. AA
    aa_rows, aa_error = [], ''
    if not aa_key:
        aa_error = 'No AA data: ARTIFICIAL_ANALYSIS_API_KEY is not set.'
    elif not aa_f.done():
        aa_error = 'Artificial Analysis did not answer in time.'
    else:
        try:
            aa_rows = aa_f.result()
        except Exception as exc:  # noqa: BLE001
            aa_error = f'Artificial Analysis failed: {str(exc)[:200]}'

    # 3. triage
    triage, answers = [], []
    for mid, fut in triage_f.items():
        if not fut.done():
            triage.append({'model': mid, 'ok': False, 'priced': 0, 'error': 'Not waited for: AA covered every price.'
                           if not _triage_needed(before, aa_f) else 'No answer in time.'})
            continue
        try:
            answer = fut.result()
        except Exception as exc:  # noqa: BLE001
            triage.append({'model': mid, 'ok': False, 'priced': 0, 'error': str(exc)[:200]})
            continue
        answers.append(answer)
        triage.append({'model': mid, 'ok': True, 'priced': len(answer), 'error': ''})
    consensus = agreed(answers)

    # merge, one active text model at a time
    counts = {'filled': 0, 'confirmed': 0, 'flagged': 0, 'none': 0}
    changes, matched = [], 0
    for m in AiModel.objects.filter(status=AiModel.STATUS_ACTIVE, modality=AiModel.MODALITY_TEXT):
        aa = match_aa(m.slug, aa_rows, m.aa_slug, m.label) if aa_rows else None
        if aa is not None:
            matched += 1
            m.aa_slug, m.aa_name = aa['slug'], aa['name'][:200]
            m.aa_intelligence, m.aa_speed = aa['intelligence'], aa['speed']
            if not m.label:  # OpenAI and xAI list no display name: AA's, without its "(high)" part
                m.label = re.sub(r'\s*\(.*?\)', '', aa['name']).strip()[:200]
            m.aa_checked_at = now
        # When it came out: AA's release date, else the date in the provider's own model list.
        m.release_date = (aa or {}).get('released') or list_dates.get(m.slug) or m.release_date
        what, change = merge_prices(m, list_price(m, aa), consensus.get(m.slug), now)
        if aa is not None:
            m.aa_task_cost = task_cost(m, aa)  # after the merge: a price plan scales by the price saved now
        counts[what] += 1
        if change:
            changes.append(change)
        m.save()
    # image models: AA's arena ELO as Perf, and the provider's own per-image price (xAI lists one)
    aa_images = []
    if aa_img_f is not None and aa_img_f.done() and aa_img_f.exception() is None:
        aa_images = aa_img_f.result()
    for m in AiModel.objects.filter(status=AiModel.STATUS_ACTIVE, modality=AiModel.MODALITY_IMAGE):
        aa = match_aa(m.slug, aa_images, m.aa_slug, m.label) if aa_images else None
        if aa is not None:
            matched += 1
            m.aa_slug, m.aa_name, m.aa_intelligence, m.aa_checked_at = aa['slug'], aa['name'][:200], aa['intelligence'], now
            if not m.label:
                m.label = re.sub(r'\s*\(.*?\)', '', aa['name']).strip()[:200]
        m.release_date = list_dates.get(m.slug) or m.release_date
        found = list_prices.get(m.slug)
        page = IMAGE_PAGE_PRICES.get(m.slug)
        if found is None and page is not None and m.image_price is None:
            found = page  # a provider page price only fills a blank; it never flags a price someone set
        if found is not None:
            found = _dec(found)
            if m.image_price is None:
                changes.append({'slug': m.slug, 'old_input': None, 'old_output': None, 'new_input': _text(found),
                                'new_output': None})
                m.image_price, m.price_source, m.price_checked_at = found, 'list', now
                counts['filled'] += 1
            elif _close(m.image_price, found):
                m.price_checked_at, m.price_flag, m.flag_input = now, '', None
                counts['confirmed'] += 1
            else:
                m.price_flag = (f'Saved {_money(m.image_price)} per image; the provider lists {_money(found)}. '
                                'Offered: provider list.')
                m.flag_input, m.flag_output = found, None
                counts['flagged'] += 1
        m.save()
    log_change(changes, user, 'Refresh, filled a missing price')

    summary = {
        'finished_at': now.isoformat(), 'seconds': round(time.monotonic() - started, 1), 'by': _name(user),
        'providers': providers, 'gone': gone, 'retyped': retyped,
        'aa': {'ok': bool(aa_rows), 'models': len(aa_rows), 'matched': matched, 'error': aa_error},
        'triage': triage, 'prices': counts,
    }
    AppSetting.objects.update_or_create(key=STATE_KEY, defaults={
        'value': summary, 'description': 'Settings > AI: the last Refresh (lists, Artificial Analysis, triage).'})
    return summary


def last() -> dict:
    from apps.core.models import AppSetting

    return AppSetting.objects.filter(key=STATE_KEY).values_list('value', flat=True).first() or {}


def accept_flag(m, user) -> None:
    """Save the flagged prices on one model (the owner took them)."""
    if m.modality == 'image' and m.flag_input is not None:
        change = {'slug': m.slug, 'old_input': _text(m.image_price), 'old_output': None,
                  'new_input': _text(m.flag_input), 'new_output': None}
        m.image_price, m.price_source, m.price_checked_at = m.flag_input, 'list', timezone.now()
        m.price_flag, m.flag_input, m.flag_output = '', None, None
        m.save()
        log_change([change], user, 'Refresh, reviewed (per image)')
        return
    if m.flag_input is None or m.flag_output is None:
        raise ValueError('This model has no new price waiting.')
    change = _change(m, m.flag_input, m.flag_output)
    m.input_price, m.output_price = m.flag_input, m.flag_output
    m.price_source = flag_source(m)
    m.price_checked_at = timezone.now()
    m.price_flag, m.flag_input, m.flag_output = '', None, None
    m.save()
    log_change([change], user, 'Refresh, reviewed')


def dismiss_flag(m) -> None:
    m.price_flag, m.flag_input, m.flag_output = '', None, None
    m.save(update_fields=['price_flag', 'flag_input', 'flag_output', 'updated_at'])
