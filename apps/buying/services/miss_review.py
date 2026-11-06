"""The monthly miss review (Dash #78): Opus 5.5 at medium reads the blind misses and proposes rate changes.

Routing (owner 11-05): the estimate itself is table math with no AI; volume work (mapping manifest keys) is
Spark Contributor at low effort; this review is the one big-model call, about once a month.

When: at the end of the daily job, only when 28+ days have passed since the last review **and** the newest
``RecoveryFit`` shows something the last review did not see (a scored truck, a forward score, or a category
with its own rate). Otherwise it waits, and ``status()`` says why. A failed call is stored with its error and
tried again the next night.

Advice only: the proposals never change a rate. Rates are computed from trucks; editable rates are ship 1b.
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.utils import timezone

logger = logging.getLogger(__name__)

PURPOSE = 'BUYING_MISS_REVIEW'
EVERY = timedelta(days=28)
MAX_PROPOSALS = 5

SYSTEM = (
    'You review how well a thrift store estimates what B-Stock liquidation truckloads bring in. The estimate is '
    'table math: for each seller, the share of manifest retail that past trucks sold in their first 90 days '
    '("R90"), per seller category when 3+ scored trucks carry it, else the whole-truck rate. Each truck below was '
    'scored blind: predicted from a fit that never saw it. Miss = predicted minus actual, in points of retail '
    '(positive = the estimate ran high). Flags: sold dollars with no manifest row (left out, so actual runs low) '
    'and rows with $0 retail. Be plain and short. Say what the misses show and what is too thin to tell. Propose '
    'at most 5 rate changes only where the trucks support it, each naming the trucks. You are advising the owner; '
    'nothing you propose changes a rate by itself.'
)

TOOL = {
    'name': 'miss_review',
    'description': 'The review and the proposed rate changes.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'review': {'type': 'string', 'description': 'What the misses say, under 150 words, plain English.'},
            'proposals': {
                'type': 'array',
                'maxItems': MAX_PROPOSALS,
                'items': {
                    'type': 'object',
                    'properties': {
                        'seller': {'type': 'string'},
                        'category': {'type': 'string', 'description': 'A seller category, or "whole truck".'},
                        'rate_now': {'type': 'number', 'description': 'Share of retail, e.g. 0.279.'},
                        'proposed': {'type': 'number'},
                        'why': {'type': 'string'},
                        'trucks': {'type': 'array', 'items': {'type': 'integer'}, 'description': 'PO numbers.'},
                    },
                    'required': ['seller', 'category', 'rate_now', 'proposed', 'why'],
                },
            },
        },
        'required': ['review', 'proposals'],
    },
}


def seen_in(fit, forward_by_seller: dict[str, list[dict]] | None = None) -> dict[str, dict[str, list]]:
    """What a review of this fit is shown, per seller: scored trucks, own-rate categories, forward scores."""
    out: dict[str, dict[str, list]] = {}
    for slug, block in (fit.sellers or {}).items():
        if block.get('status') != 'ok':
            continue
        out[slug] = {
            'trucks': sorted(s['po'] for s in block.get('scores', [])),
            'categories': sorted((block.get('rates') or {}).get('categories', {}).keys()),
            'forward': sorted(f['po'] for f in (forward_by_seller or {}).get(slug, [])),
        }
    return out


def _new_things(now_seen: dict, last_seen: dict) -> list[str]:
    news = []
    for slug, cur in now_seen.items():
        old = last_seen.get(slug, {})
        for key, one, many in (('trucks', 'truck', 'trucks'), ('categories', 'category', 'categories'),
                               ('forward', 'forward score', 'forward scores')):
            added = set(cur.get(key, [])) - set(old.get(key, []))
            if added:
                news.append(f'{slug}: {len(added)} new {one if len(added) == 1 else many}')
    return news


def _forward(fit) -> dict[str, list[dict]]:
    from apps.buying.services.recovery_fit import forward_scores

    return {slug: forward_scores(slug, fit) for slug in (fit.sellers or {})}


def status(now=None) -> dict[str, Any]:
    """Whether a review is due, and if not, why (shown under the latest review)."""
    from apps.buying.models import MissReview
    from apps.buying.services.recovery_fit import latest_fit

    now = now or timezone.now()
    fit = latest_fit(build_if_missing=False)
    if fit is None:
        return {'due': False, 'why': 'The first review follows the first nightly fit.'}
    last = MissReview.objects.filter(error='').first()
    current = seen_in(fit, _forward(fit))
    if not current:
        return {'due': False, 'why': 'No seller has 3 scored trucks yet.'}
    if last is not None and now - last.created_at < EVERY:
        nxt = timezone.localtime(last.created_at + EVERY)
        return {'due': False, 'why': f'Next review on or after {nxt:%b} {nxt.day}.'}
    news = _new_things(current, last.seen if last else {})
    if not news:
        return {'due': False, 'why': 'Waiting for something new: no truck has passed 90 days since the last review.'}
    return {'due': True, 'why': 'Due with the next nightly run (' + '; '.join(news) + ').', 'fit': fit, 'seen': current}


def build_prompt(fit, forward_by_seller: dict[str, list[dict]]) -> str:
    """The fit, trimmed to what the review needs, as compact JSON."""
    sellers = {}
    for slug, block in (fit.sellers or {}).items():
        if block.get('status') != 'ok':
            sellers[slug] = {'status': 'not yet', 'scored_trucks': block.get('scored_trucks', 0)}
            continue
        rates = block['rates']
        sellers[slug] = {
            'summary': {k: (round(v, 2) if isinstance(v, float) else v) for k, v in block['summary'].items()},
            'whole_truck_rate': {k: round(rates['whole'][k], 4) for k in ('low', 'likely', 'high')},
            'own_rate_categories': {
                sc: {'likely': round(c['likely'], 4), 'trucks': c['trucks'], 'retail': round(c['retail'])}
                for sc, c in rates['categories'].items()
            },
            'trucks': [
                {
                    'po': s['po'], 'first_sale': s.get('first_sale'), 'retail': round(s['retail']),
                    'actual_r90': round(s['actual'] / s['retail'], 4) if s['retail'] else None,
                    'blind_predicted': round(s['predicted'] / s['retail'], 4) if s['retail'] else None,
                    'miss_points': round(s['miss'], 1),
                    'unlinked_sold': round(s.get('unlinked_sold', 0)), 'zero_retail_rows': s.get('zero_retail_rows', 0),
                }
                for s in block['scores']
            ],
            'categories_by_retail': sorted(
                (
                    {'category': sc, 'retail': round(c['retail']), 'r90': round(c['actual'] / c['retail'], 4) if c['retail'] else None,
                     'trucks': c['trucks']}
                    for sc, c in (block.get('categories') or {}).items()
                ),
                key=lambda r: -r['retail'],
            )[:20],
            'last_fit_on_same_trucks': block.get('previous'),
            'forward_scores': forward_by_seller.get(slug, []),
            'young_trucks': block.get('young_trucks', 0),
        }
    return (
        f'Fit of {fit.fitted_at:%Y-%m-%d}. Rates are shares of manifest retail.\n'
        + json.dumps(sellers, ensure_ascii=False, separators=(',', ':'))
    )


def run(*, force: bool = False):
    """Run the review if due (or ``force``). Returns the stored ``MissReview``, or None when not due."""
    from apps.buying.models import MissReview
    from apps.buying.services.recovery_fit import latest_fit
    from apps.core.ai_config import ai_effort, ai_model
    from apps.core.services.llm_router import llm_chat_tool_input

    st = status()
    if not st['due'] and not force:
        return None
    fit = st.get('fit') or latest_fit(build_if_missing=False)
    if fit is None:
        return None
    forward = _forward(fit)
    seen = st.get('seen') or seen_in(fit, forward)
    model, effort = ai_model(PURPOSE), ai_effort(PURPOSE)
    started = timezone.now()
    try:
        out, used = llm_chat_tool_input(
            purpose=PURPOSE,
            system=SYSTEM,
            user=build_prompt(fit, forward),
            tool_name=TOOL['name'],
            tools=[TOOL],
            max_tokens=2000,
            timeout=240,
            log_source='buying_miss_review',
            log_detail=f'fit {fit.pk}',
        )
    except Exception as exc:  # stored, tried again tomorrow (an errored review never blocks the next)
        logger.exception('miss review failed')
        return MissReview.objects.create(fit=fit, model=model, effort=effort, seen=seen, error=str(exc)[:2000])
    proposals = [p for p in (out.get('proposals') or []) if isinstance(p, dict)][:MAX_PROPOSALS]
    return MissReview.objects.create(
        fit=fit, model=used or model, effort=effort, seen=seen,
        text=str(out.get('review') or '').strip()[:4000], proposals=proposals, cost_usd=_cost_since(started),
    )


def _cost_since(started) -> Decimal:
    from django.db.models import Sum

    from apps.core.models import AIUsage

    total = AIUsage.objects.filter(source='buying_miss_review', created_at__gte=started).aggregate(
        c=Sum('estimated_cost_usd'))['c']
    return Decimal(total or 0).quantize(Decimal('0.0001'))


def payload() -> dict[str, Any]:
    """The latest good review and whether the next is due (for "How good is it?")."""
    from apps.buying.models import MissReview

    last = MissReview.objects.filter(error='').first()
    st = status()
    return {
        'review': (
            {
                'created_at': last.created_at.isoformat(),
                'model': last.model,
                'effort': last.effort,
                'text': last.text,
                'proposals': last.proposals,
            }
            if last
            else None
        ),
        'next': st['why'],
    }
