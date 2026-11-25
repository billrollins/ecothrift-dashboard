"""The AI jobs: standard ones per step and a custom prompt on any selection.

Every job runs through the app's router (``llm_complete``: usage logged on the Owner page) with the model of its
Settings > AI action (``PREP_STEPS_*``). Lines go in batches, several batches at once; the action shows progress per
batch. The answer is a **preview** (old and new per field, with the reason); nothing changes until Apply, and an
applied job can be undone. Bulk jobs use the Fast tier (Spark); retail checks and the strong custom prompt use the
action's own model (Sonnet 5.5 by default), where a better answer pays.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from typing import Any, Callable

from django.conf import settings
from django.db import close_old_connections, connections
from django.db.models import F
from django.utils import timezone

from apps.prep_steps.models import PrepAction, PrepLine
from apps.prep_steps.services import changes as ch
from apps.prep_steps.services.rules import CLASSES, MIXED, class_share, house_round, pack_words

logger = logging.getLogger(__name__)
SOURCE = 'prep_steps'
MIN_UNIT_RETAIL = Decimal('3')  # a pack is only split when one unit retails this much (a tag costs labor)
WORKERS = 8
DEFAULTS = {  # purpose -> (model, effort) when Settings > AI has nothing for it
    'fast': ('muse-spark-1.3-contributor', 'low'),
    'strong': ('claude-sonnet-5-5', 'medium'),
}


def _canon() -> dict[str, list[str]]:
    from apps.inventory.services.standardize import canon

    try:
        return canon()
    except Exception:  # noqa: BLE001 - no taxonomy file (tests): the 23 names alone
        from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES

        return {c: [] for c in TAXONOMY_V1_CATEGORY_NAMES}


def _money(v) -> float | None:
    return round(float(v), 2) if v is not None else None


def line_payload(x: PrepLine, extra: tuple[str, ...] = ()) -> dict[str, Any]:
    d: dict[str, Any] = {
        'id': x.pk, 'seller_title': (x.src_title or '')[:400], 'title': x.title, 'brand': x.brand, 'model': x.model,
        'qty': x.qty, 'manifest_retail': _money(x.src_retail),
    }
    if x.src_category or x.src_subcategory:
        d['seller_category'] = ' / '.join(v for v in (x.src_category, x.src_subcategory) if v)
    for f in extra:
        if f == 'category':
            d['category'] = x.category
            d['subcategory'] = x.subcategory
        elif f == 'retail':
            d['retail'] = _money(x.retail)
        elif f == 'price':
            d['price'] = _money(x.price)
            d['price_class'] = x.price_class
        elif f == 'packs':
            d['pack'] = {'unit_count': x.unit_count, 'unit_name': x.unit_name, 'pack_units': x.pack_units,
                         'pieces': x.pieces, 'sell_as': x.sell_as}
        elif f == 'match':
            cs = x.match_candidates or []
            d['candidates'] = [{k: c.get(k) for k in ('product_id', 'title', 'brand', 'category', 'retail_avg', 'sim', 'id')}
                               for c in cs[:3]]
        elif f == 'condition':
            d['condition'] = x.src_condition
    return d


# -- the jobs --------------------------------------------------------------------------------------------------------

COMMON = """You help a thrift store (Eco-Thrift, Omaha) prepare the manifest lines of a liquidation truck. \
Answer with a JSON array only, one object per line you were given, each with its "id". No prose, no code fences. \
Every object has "why": a few plain words (under 12) saying why."""


def _job_clean() -> str:
    return COMMON + """

For each line write the product's clean name for a price tag and our catalog:
- "title": brand first only if it is part of the name, then the product, then the one or two details that change \
its price (size, count, set of N). Under 70 characters. No seller disclaimers, no model codes, no colours unless \
it is a colour product. Title Case.
- "brand": the real brand ("" if none or a seller code). Use the brand's own spelling.
- "model": the model or part number if the seller gave one, else "".
Return {"id", "title", "brand", "model", "why"}."""


def _job_match() -> str:
    return COMMON + """

Each line has up to 3 candidate products we already have. Decide for each line:
- "kind": "is" when a candidate is the SAME product (same brand and model or design; a colour of the same model is \
the same); "like" when none is the same but one is the same kind of thing (another brand, size, count or model) \
and so a fair price reference; "new" only when no candidate is even the same kind of thing.
- "product_id": the candidate that "is" the line, or for "like" the most similar candidate; 0 for "new".
- "confidence": 0 to 100, how sure you are of the kind.
A wrong match is cheaper than a duplicate product: when it probably is the same product, say "is". \
id "upc"/"ref"/"past" on a candidate means an ID pointed at it; IDs on these manifests are often wrong.
Return {"id", "product_id", "kind", "confidence", "why"}."""


def _job_category() -> str:
    cats = _canon()
    listing = '\n'.join(f'- {c}: {", ".join(subs)}' if subs else f'- {c}' for c, subs in cats.items())
    return COMMON + f"""

Give each line our store category and subcategory, exactly as written in this list (category: subcategories):
{listing}
Use "{MIXED}" only when the line is truly a mixed lot. Subcategory "" if none fits.
Return {{"id", "category", "subcategory", "why"}}."""


def _job_retail() -> str:
    return COMMON + """

Check the retail price of ONE unit of each line (what it sells for new at a big store in the US today). Manifest \
retail is often wrong: a placeholder, the price of a pack for one piece, or the price of one piece for a case.
- "retail": your retail for one manifest unit in dollars (a number). Keep the manifest retail when it is about right.
- "ok": true when the manifest retail is about right (within 25%), else false.
Return {"id", "retail", "ok", "why"}."""


def _job_price() -> str:
    classes = '\n'.join(f'- {code}: {label}' for code, (_s, label) in CLASSES.items())
    return COMMON + f"""

Give each line its price class. The store tags most things at about 55% of retail; the class moves that:
{classes}
Today is {timezone.localdate():%B %d, %Y}. Return {{"id", "price_class", "why"}}."""


def _job_packs() -> str:
    return COMMON + """

Read the pack of each line from its seller title. A product has a base unit and a pack: count per unit x units in \
the pack, written "3 boxes x 100" (units first, then count per unit; a single unit is "100 ct").
- "unit_count": the count in one unit (100 tissues a box -> 100; a chair -> 1).
- "unit_name": the unit ("box", "bottle", "chair", ...; "" for a single thing).
- "pack_units": how many units in the manifest line's one unit (48 boxes -> 48; one item -> 1).
- "sell_as": "whole" (one tag for the pack) or "units" (a tag for each unit). A thrift store splits a case of \
retail-packaged consumables it can sell one at a time (boxes of tissue, bottles of detergent) when one unit sells \
for $3 or more new; it keeps sets that belong together (chairs, dinnerware) and packs of small cheap pieces (bags, \
cups, plates, batteries, sponges) whole.
Return {"id", "unit_count", "unit_name", "pack_units", "sell_as", "why"}."""


def _job_tags() -> str:
    return COMMON + """

Give each line the words a person types into a store site or Google to find this exact product: brand, model, the \
key noun, the size. 2 to 5 short phrases.
Return {"id", "search_tags": [..], "why"}."""


def _job_custom(prompt: str, fields: list[str]) -> str:
    allowed = ', '.join(fields)
    cats = ', '.join(_canon())
    return COMMON + f"""

The owner's instruction for these lines:
\"\"\"{prompt.strip()}\"\"\"

Change only these fields: {allowed}. Leave out a field you would not change. Category must be one of: {cats}. \
Money is a number of dollars. Pack fields: unit_count, unit_name, pack_units, pieces (tags a manifest unit), \
sell_as ("whole" or "units").
Return {{"id", "changes": {{field: new value}}, "why"}}; "changes" is {{}} when the line needs nothing."""


def _to_num(v) -> Decimal | None:
    try:
        d = Decimal(str(v).replace('$', '').replace(',', ''))
        return d if d.is_finite() and d >= 0 else None
    except Exception:  # noqa: BLE001
        return None


def _post_clean(x: PrepLine, a: dict, ctx: dict) -> list[dict]:
    why = str(a.get('why') or 'AI clean-up')
    out = []
    for f in ('title', 'brand', 'model'):
        if f in a and isinstance(a[f], str):
            out.append({'line': x.pk, 'field': f, 'new': a[f].strip(), 'reason': why})
    return out


def _post_match(x: PrepLine, a: dict, ctx: dict) -> list[dict]:
    allowed = {c['product_id'] for c in (x.match_candidates or [])}
    try:
        pid = int(a.get('product_id') or 0)
    except (TypeError, ValueError):
        pid = 0
    kind = str(a.get('kind') or '').lower()
    if pid not in allowed:
        pid = 0
    if not pid:
        kind = 'new'
    elif kind not in ('is', 'like'):
        kind = 'is'
    try:
        conf = max(0, min(100, int(a.get('confidence') or 0)))
    except (TypeError, ValueError):
        conf = 50
    why = str(a.get('why') or 'AI judge')
    return [{'line': x.pk, 'field': 'match_product_id', 'new': pid or None, 'reason': why},
            {'line': x.pk, 'field': 'match_kind', 'new': kind, 'reason': why},
            {'line': x.pk, 'field': 'match_confidence', 'new': conf, 'reason': ''}]


def _post_category(x: PrepLine, a: dict, ctx: dict) -> list[dict]:
    cats = ctx['canon']
    cat = str(a.get('category') or '').strip()
    if cat not in cats:
        return []
    sub = str(a.get('subcategory') or '').strip()
    if sub and sub not in cats[cat]:
        sub = ''
    why = str(a.get('why') or 'AI category')
    return [{'line': x.pk, 'field': 'category', 'new': cat, 'reason': why},
            {'line': x.pk, 'field': 'subcategory', 'new': sub, 'reason': why if sub else ''}]


def _post_retail(x: PrepLine, a: dict, ctx: dict) -> list[dict]:
    r = _to_num(a.get('retail'))
    if r is None or r <= 0:
        return []
    if a.get('ok') is True and x.retail:
        return []
    per = (r / max(1, x.pieces or 1)).quantize(Decimal('0.01'))
    return [{'line': x.pk, 'field': 'retail', 'new': per, 'reason': str(a.get('why') or 'AI retail check')}]


def _post_price(x: PrepLine, a: dict, ctx: dict) -> list[dict]:
    code = str(a.get('price_class') or '').upper()
    if code not in CLASSES:
        return []
    why = str(a.get('why') or 'AI class')
    out = [{'line': x.pk, 'field': 'price_class', 'new': code, 'reason': why}]
    if x.retail:
        share = class_share(code, ctx['target'])
        out.append({'line': x.pk, 'field': 'price', 'new': house_round(Decimal(x.retail) * share, x.retail),
                    'reason': f'{code} {share:.0%} of ${x.retail}: {why}'})
    return out


def _post_packs(x: PrepLine, a: dict, ctx: dict) -> list[dict]:
    try:
        uc = max(1, int(a.get('unit_count') or 1))
        pu = max(1, int(a.get('pack_units') or 1))
    except (TypeError, ValueError):
        return []
    sell = 'units' if str(a.get('sell_as')) == 'units' and pu > 1 else 'whole'
    name = str(a.get('unit_name') or '')[:40]
    why = f"{pack_words(uc, name, pu) or 'single'}: {a.get('why') or 'AI pack read'}"
    if sell == 'units' and x.src_retail and Decimal(x.src_retail) / pu < MIN_UNIT_RETAIL:
        sell = 'whole'
        why = f"{pack_words(uc, name, pu)}: a unit retails under ${MIN_UNIT_RETAIL}, kept whole"
    out = [{'line': x.pk, 'field': 'unit_count', 'new': uc, 'reason': why},
           {'line': x.pk, 'field': 'unit_name', 'new': name, 'reason': why},
           {'line': x.pk, 'field': 'pack_units', 'new': pu, 'reason': why}]
    if pu > 1:
        from apps.prep_steps.services.rules import sell_changes

        tmp = PrepLine(pk=x.pk, src_retail=x.src_retail, retail=x.retail, price=x.price, pack_units=pu)
        out += sell_changes(tmp, sell, ctx['target'])
    return out


def _post_tags(x: PrepLine, a: dict, ctx: dict) -> list[dict]:
    tags = a.get('search_tags')
    if not isinstance(tags, list):
        return []
    tags = [str(t).strip()[:80] for t in tags if str(t).strip()][:6]
    return [{'line': x.pk, 'field': 'search_tags', 'new': tags, 'reason': str(a.get('why') or 'AI search words')}]


def _post_custom(x: PrepLine, a: dict, ctx: dict) -> list[dict]:
    got = a.get('changes')
    if not isinstance(got, dict):
        return []
    why = str(a.get('why') or 'Custom prompt')
    out = []
    for f, v in got.items():
        if f not in ctx['fields']:
            continue
        if f == 'category' and v not in ctx['canon']:
            continue
        try:
            ch.clean_value(f, v)
        except ch.ChangeError:
            continue
        out.append({'line': x.pk, 'field': f, 'new': v, 'reason': why})
    return out


JOBS: dict[str, dict[str, Any]] = {
    'clean_ai': {'step': 'clean', 'purpose': 'PREP_STEPS_CLEAN', 'label': 'AI: clean titles and brands', 'tier': 'fast',
                 'system': _job_clean, 'post': _post_clean, 'extra': (), 'batch': 25},
    'match_ai': {'step': 'match', 'purpose': 'PREP_STEPS_MATCH', 'label': 'AI: judge the matches', 'tier': 'fast',
                 'system': _job_match, 'post': _post_match, 'extra': ('match',), 'batch': 12},
    'category_ai': {'step': 'category', 'purpose': 'PREP_STEPS_CATEGORY', 'label': 'AI: set category', 'tier': 'fast',
                    'system': _job_category, 'post': _post_category, 'extra': ('category',), 'batch': 25},
    'retail_ai': {'step': 'retail', 'purpose': 'PREP_STEPS_RETAIL', 'label': 'AI: check retail', 'tier': 'strong',
                  'system': _job_retail, 'post': _post_retail, 'extra': ('retail', 'packs'), 'batch': 20},
    'price_ai': {'step': 'price', 'purpose': 'PREP_STEPS_PRICE', 'label': 'AI: pick price class', 'tier': 'fast',
                 'system': _job_price, 'post': _post_price, 'extra': ('category', 'retail', 'price'), 'batch': 25},
    'packs_ai': {'step': 'packs', 'purpose': 'PREP_STEPS_PACKS', 'label': 'AI: read packs', 'tier': 'fast',
                 'system': _job_packs, 'post': _post_packs, 'extra': ('packs',), 'batch': 25},
    'tags_ai': {'step': 'send', 'purpose': 'PREP_STEPS_TAGS', 'label': 'AI: search words', 'tier': 'fast',
                'system': _job_tags, 'post': _post_tags, 'extra': (), 'batch': 30},
}
CUSTOM = {'fast': 'PREP_STEPS_CUSTOM', 'strong': 'PREP_STEPS_CUSTOM_STRONG'}
CUSTOM_FIELDS = ('title', 'brand', 'model', 'qty', 'category', 'subcategory', 'retail', 'price', 'price_class',
                 'unit_count', 'unit_name', 'pack_units', 'pieces', 'sell_as', 'search_tags')


# Rough tokens a line costs (system prompt shared per batch): in, out. Measured on 461 (Spark, 11-24).
TOKENS_PER_LINE = {'clean_ai': (150, 45), 'match_ai': (330, 40), 'category_ai': (160, 30), 'retail_ai': (170, 45),
                   'price_ai': (170, 25), 'packs_ai': (150, 50), 'tags_ai': (130, 40), 'custom': (220, 50)}


def job_menu() -> dict[str, dict]:
    """Each job's model and its price per line, so the menu can say what a run will cost before it runs."""
    from apps.core.services.ai_usage_log import estimate_cost_usd

    out = {}
    items = [(n, j['purpose'], j['tier']) for n, j in JOBS.items()] + [
        ('custom_fast', CUSTOM['fast'], 'fast'), ('custom_strong', CUSTOM['strong'], 'strong')]
    for name, purpose, tier in items:
        model, effort = model_for(purpose, tier)
        tin, tout = TOKENS_PER_LINE.get(name, TOKENS_PER_LINE['custom'])
        try:
            per_line = float(estimate_cost_usd(model, tin * 100, tout * 100) or 0) / 100
        except Exception:  # noqa: BLE001 - an estimate never stops the page
            per_line = 0.0
        out[name] = {'model': model, 'effort': effort, 'per_line': per_line}
    return out


# Truck Prep A's Settings > AI rows (Buying > Prep A: Steps), made the first time the app needs them, so this local
# test build adds nothing to the core tables through a migration.
# purpose: (label, description, tier, model slug or '' = the tier's, effort or '' = the tier's)
ACTIONS = {
    'PREP_STEPS_CLEAN': ('Prep A: clean titles and brands', 'Short clean titles, brands and models. Bulk, cheap.',
                         'fast', '', ''),
    'PREP_STEPS_MATCH': ('Prep A: judge product matches', 'Same product, like it, or new, from the top candidates.',
                         'fast', '', ''),
    'PREP_STEPS_CATEGORY': ('Prep A: set category', 'Our category and subcategory from the taxonomy.', 'fast', '', ''),
    'PREP_STEPS_RETAIL': ('Prep A: check retail', 'Checks the manifest retail of one unit; a better model pays here.',
                          'best', 'claude-sonnet-5-5', 'medium'),
    'PREP_STEPS_PRICE': ('Prep A: pick price class', 'The price class of a line (commodity, Christmas, toys...).',
                         'fast', '', ''),
    'PREP_STEPS_PACKS': ('Prep A: read packs', 'Count per unit, units in the pack, sell whole or by unit.',
                         'fast', '', ''),
    'PREP_STEPS_TAGS': ('Prep A: search words', 'The words to search a store site or Google with.', 'fast', '', ''),
    'PREP_STEPS_CUSTOM': ('Prep A: custom prompt (fast)', "The owner's own instruction on a selection. Cheap.",
                          'fast', '', ''),
    'PREP_STEPS_CUSTOM_STRONG': ('Prep A: custom prompt (strong)', "The owner's own instruction, the better model.",
                                 'best', 'claude-sonnet-5-5', 'medium'),
}
_ensured = False


def ensure_actions() -> None:
    """Make the Settings > AI rows once per process (a row the owner changed is never touched)."""
    global _ensured
    if _ensured:
        return
    try:
        from apps.core.models import AiAction, AiModel

        have = set(AiAction.objects.filter(purpose__in=list(ACTIONS)).values_list('purpose', flat=True))
        for purpose, (label, description, tier, slug, effort) in ACTIONS.items():
            if purpose in have:
                continue
            model = AiModel.objects.filter(slug=slug, status='active').first() if slug else None
            AiAction.objects.get_or_create(purpose=purpose, defaults={
                'label': label, 'modality': 'text', 'tier': tier, 'model': model, 'effort': effort if model else '',
                'workspace': 'Buying', 'page': 'Prep A: Steps', 'description': description,
            })
        _ensured = True
    except Exception:  # noqa: BLE001 - the defaults below still run the job
        logger.exception('prep_steps: could not make the Settings > AI rows')


def model_for(purpose: str, tier: str) -> tuple[str, str]:
    from apps.core.ai_config import resolve

    ensure_actions()
    r = resolve(purpose)
    if r['model_from'] == 'env':  # nothing picked in Settings > AI: this app's default
        return DEFAULTS[tier]
    return r['model'], (r['effort'] if r['effort'] != 'off' else '')


def parse_answer(text: str) -> list[dict]:
    t = re.sub(r'^```(?:json)?|```$', '', (text or '').strip(), flags=re.M).strip()
    start, end = t.find('['), t.rfind(']')
    if start < 0 or end < start:
        obj_start = t.find('{')
        if obj_start >= 0:
            try:
                one = json.loads(t[obj_start:t.rfind('}') + 1])
                if isinstance(one, dict):
                    for key in ('lines', 'results', 'answers', 'items'):
                        if isinstance(one.get(key), list):
                            return [a for a in one[key] if isinstance(a, dict)]
                    return [one]
            except ValueError:
                return []
        return []
    try:
        data = json.loads(t[start:end + 1])
    except ValueError:
        return []
    return [a for a in data if isinstance(a, dict)]


def _call(model: str, effort: str, system: str, items: list[dict], purpose: str, detail: str) -> tuple[list[dict], dict]:
    from apps.core.services.ai_usage_log import estimate_cost_usd, log_ai_usage
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete

    started = time.monotonic()
    try:
        res = llm_complete(model_id=model, effort=effort or None, system=system,
                           user=json.dumps(items, ensure_ascii=False, default=str), max_tokens=8000, timeout=120,
                           log_source=SOURCE, log_purpose=purpose, log_detail=detail)
    except (LLMAPIError, LLMConfigError) as exc:
        log_ai_usage(SOURCE, model, purpose=purpose, duration_ms=int((time.monotonic() - started) * 1000),
                     detail=detail, success=False, error=str(exc)[:500])
        raise
    cost = Decimal(str(estimate_cost_usd(res.model_used, res.input_tokens, res.output_tokens,
                                         res.cache_creation_tokens, res.cache_read_tokens) or 0))
    return parse_answer(res.text), {'in': res.input_tokens, 'out': res.output_tokens, 'cost': cost,
                                    'model': res.model_used}


def run_batches(action: PrepAction, lines: list[PrepLine], system: str, extra: tuple, batch: int,
                post: Callable, ctx: dict, purpose: str) -> None:
    """Fill ``action.preview``: the lines in batches, ``WORKERS`` at a time; a batch that fails is split once."""
    started = time.monotonic()
    by_id = {x.pk: x for x in lines}
    batches = [lines[i:i + batch] for i in range(0, len(lines), batch)]
    PrepAction.objects.filter(pk=action.pk).update(batches_total=len(batches))
    totals = {'in': 0, 'out': 0, 'cost': Decimal('0'), 'calls': 0}
    lock = threading.Lock()
    errors: list[str] = []
    threaded = not getattr(settings, 'PREP_STEPS_SYNC', False)

    def one(chunk: list[PrepLine], depth: int = 0) -> list[dict]:
        items = [line_payload(x, extra) for x in chunk]
        try:
            answers, use = _call(action.model, action.effort, system, items, purpose,
                                 f'run {action.run_id} {action.name} {len(chunk)} lines')
        except Exception as exc:  # noqa: BLE001 - one batch failing never stops the others
            with lock:
                errors.append(str(exc)[:200])
            answers, use = [], None
        if use:
            with lock:
                totals['in'] += use['in']
                totals['out'] += use['out']
                totals['cost'] += use['cost']
                totals['calls'] += 1
        got = {}
        for a in answers:
            try:
                got[int(a.get('id'))] = a
            except (TypeError, ValueError):
                continue
        missing = [x for x in chunk if x.pk not in got]
        out: list[dict] = []
        for lid, a in got.items():
            x = by_id.get(lid)
            if x is not None:
                out += post(x, a, ctx)
        if missing and depth == 0 and len(missing) >= 2 and len(missing) > len(chunk) // 3:
            half = len(missing) // 2
            out += one(missing[:half], 1) + one(missing[half:], 1)
        return out

    def task(chunk):
        if threaded:
            close_old_connections()
        try:
            res = one(chunk)
        finally:
            PrepAction.objects.filter(pk=action.pk).update(batches_done=F('batches_done') + 1)
            if threaded:
                connections.close_all()
        return res

    if threaded and len(batches) > 1:
        with ThreadPoolExecutor(max_workers=min(WORKERS, len(batches))) as pool:
            results = list(pool.map(task, batches))
    else:
        results = [task(b) for b in batches]
    proposed = [c for r in results for c in r]
    preview = ch.diff(by_id, proposed)
    action.refresh_from_db()
    action.preview = preview
    action.changed_count = len({c['line'] for c in preview})
    action.input_tokens, action.output_tokens = totals['in'], totals['out']
    action.cost = totals['cost'].quantize(Decimal('0.0001'))
    action.calls = totals['calls']
    action.seconds = round(time.monotonic() - started, 2)
    action.status = PrepAction.STATUS_PREVIEW if (preview or not errors) else PrepAction.STATUS_FAILED
    action.error = '; '.join(dict.fromkeys(errors))[:1000]
    action.finished_at = timezone.now()
    action.save()


def start_job(run, name: str, line_ids: list[int], *, user=None, prompt: str = '', fields: list[str] | None = None,
              strength: str = 'fast', step: str = '') -> PrepAction:
    """Create the action and run it (in the background unless ``PREP_STEPS_SYNC``)."""
    if name == 'custom':
        if not prompt.strip():
            raise ch.ChangeError('Write what the AI should do.')
        strength = strength if strength in CUSTOM else 'fast'
        purpose = CUSTOM[strength]
        fields = [f for f in (fields or CUSTOM_FIELDS) if f in CUSTOM_FIELDS] or list(CUSTOM_FIELDS)
        job = {'step': step or 'clean', 'label': f'Custom prompt ({"strong" if strength == "strong" else "fast"})',
               'tier': strength, 'system': lambda: _job_custom(prompt, fields), 'post': _post_custom,
               'extra': ('category', 'retail', 'price', 'packs'), 'batch': 20 if strength == 'fast' else 15}
    else:
        job = JOBS.get(name)
        if job is None:
            raise ch.ChangeError('Unknown AI job.')
        purpose = job['purpose']
    lines = list(PrepLine.objects.filter(run=run, pk__in=line_ids).order_by('row_number'))
    if not lines:
        raise ch.ChangeError('Select some lines first.')
    if len(lines) > 2000:
        raise ch.ChangeError('At most 2,000 lines at a time.')
    model, effort = model_for(purpose, job['tier'])
    action = ch.start(run, job['step'], PrepAction.KIND_CUSTOM if name == 'custom' else PrepAction.KIND_AI, name,
                      label=job['label'], model=model, effort=effort, prompt=prompt, user=user,
                      line_count=len(lines))
    target = Decimal(str((run.target or {}).get('share') or '0.55'))
    ctx = {'canon': _canon(), 'target': target, 'fields': set(fields or ())}
    system = job['system']()

    def go():
        try:
            run_batches(action, lines, system, job['extra'], job['batch'], job['post'], ctx, purpose)
        except Exception as exc:  # noqa: BLE001 - shown on the action
            logger.exception('prep_steps AI job failed')
            PrepAction.objects.filter(pk=action.pk).update(status=PrepAction.STATUS_FAILED, error=str(exc)[:1000],
                                                           finished_at=timezone.now())
        finally:
            if not getattr(settings, 'PREP_STEPS_SYNC', False):
                connections.close_all()

    if getattr(settings, 'PREP_STEPS_SYNC', False):
        go()
    else:
        threading.Thread(target=go, daemon=True, name=f'prep-steps-{action.pk}').start()
    action.refresh_from_db()
    return action


def apply_preview(action: PrepAction, skip: list[int] | None = None) -> PrepAction:
    if action.status != PrepAction.STATUS_PREVIEW:
        raise ch.ChangeError('Nothing to apply: this job is not waiting for Apply.')
    skip_set = set(skip or [])
    keep = [c for i, c in enumerate(action.preview or []) if i not in skip_set]
    return ch.apply(action, keep, seconds=action.seconds)


def discard(action: PrepAction) -> PrepAction:
    if action.status not in (PrepAction.STATUS_PREVIEW, PrepAction.STATUS_FAILED):
        raise ch.ChangeError('Only a preview can be discarded.')
    action.status = PrepAction.STATUS_DISCARDED
    action.save(update_fields=['status'])
    return action
