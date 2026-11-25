"""Settings > AI actions (Dash #195): every AI job in Dash as Workspace > Page > Function, on a tier, with what it
costs per run from our own usage logs, and an AI review that proposes a tier per action.

**Cost per run** = the average tokens of one run over the last 30 days (``AIUsage``: input, output with thinking
included, cache) priced at the model the action runs on now. **Runs a month** = successful runs in the last 30 days.
Usage rows written before an action had a purpose are matched by their source (``SOURCE_PURPOSE``), and
``llm_complete`` now writes that purpose itself.

**The tier review** sends the list (what each action does, runs a month, tokens per run, cost per run on each tier)
and the tier map (model, price, Artificial Analysis scores) to the model of ``AI_TIER_REVIEW``. It proposes Fast,
Standard or Best for each action with a one-line reason; a proposal that differs from today's tier waits on the
action for the owner to take or dismiss. Nothing changes by itself. It runs in a thread (it takes longer than a web
request may); its state is the AppSetting ``ai_tier_review``.
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

logger = logging.getLogger(__name__)

# The sidebar's workspace order (frontend/src/navigation/slotCNavLayout.ts SLOT_C_NAV_GROUPS).
WORKSPACE_ORDER = ('Buying', 'Processing', 'Restoration', 'Retail', 'Online Sales', 'Deliveries', 'Studios',
                   'Facilities', 'Admin', 'HR')

# Usage rows whose caller logged no purpose: the action each source belongs to.
SOURCE_PURPOSE = {
    'ai_chat_proxy': 'AI_CHAT',
    'ai_key_mapping': 'KEY_MAPPING',
    'ai_template_creation': 'MANIFEST_TEMPLATE',
    'ai_title_category_estimate': 'TITLE_CATEGORY_ESTIMATE',
    'categorize_manifests': 'CATEGORY_AI',
    'hiring.reply': 'HIRING_REPLY',
    'ai_cleanup_batch': 'INVENTORY_CLEANUP',
    'ai_cleanup_rows': 'INVENTORY_CLEANUP',
    'inventory_llm_classify': 'INVENTORY_CLASSIFY',
    'ai_formula_job': 'PREPROCESSING_SUGGEST',
    'intake_standard': 'PRODUCT_STANDARDIZE',
    'ai_suggest_finalization': 'SUGGEST_FINALIZATION',
    'suggest_product': 'SUGGEST_PRODUCT',
    'inventory.product_from_page': 'PRODUCT_FROM_PAGE',
    'suggest_item': 'SUGGEST_ITEM',
    'label_ai_structure': 'LABEL_STRUCTURE',
    'qa_triage': 'QA_TRIAGE',
    'supplies.ai_fill': 'SUPPLY_FILL',
    'marketing.ad_results': 'AD_RESULTS',
    'ai_tier_review': 'AI_TIER_REVIEW',
}
DAYS = 30
REVIEW_KEY = 'ai_tier_review'
REVIEW_TOOL = 'propose_tiers'
REVIEW_STALE = timedelta(minutes=10)
TEXT_TIERS = ('fast', 'standard', 'best')


def purpose_for(source: str, purpose: str) -> str:
    """The action a usage row belongs to: its source's when the source is mapped, else its purpose."""
    return SOURCE_PURPOSE.get(source or '') or (purpose or '').upper()


def _usage(days: int = DAYS) -> dict[str, dict]:
    """{purpose: {runs, input, output, cache_write, cache_read (averages per run), spent}} over the last ``days``."""
    from apps.core.models import AIUsage

    since = timezone.now() - timedelta(days=days)
    rows = (AIUsage.objects.filter(created_at__gte=since, success=True)
            .values('source', 'purpose')
            .annotate(runs=Count('id'), inp=Sum('input_tokens'), out=Sum('output_tokens'),
                      cw=Sum('cache_creation_tokens'), cr=Sum('cache_read_tokens'), spent=Sum('estimated_cost_usd')))
    acc: dict[str, dict] = {}
    for r in rows:
        key = purpose_for(r['source'], r['purpose'])
        if not key:
            continue
        a = acc.setdefault(key, {'runs': 0, 'inp': 0, 'out': 0, 'cw': 0, 'cr': 0, 'spent': Decimal('0')})
        a['runs'] += r['runs']
        a['inp'] += r['inp'] or 0
        a['out'] += r['out'] or 0
        a['cw'] += r['cw'] or 0
        a['cr'] += r['cr'] or 0
        a['spent'] += r['spent'] or Decimal('0')
    out = {}
    for key, a in acc.items():
        n = a['runs'] or 1
        out[key] = {'runs': a['runs'], 'input': a['inp'] // n, 'output': a['out'] // n,
                    'cache_write': a['cw'] // n, 'cache_read': a['cr'] // n, 'spent': a['spent']}
    return out


def _cost(model: str, use: dict | None) -> Decimal | None:
    """One run's cost on ``model`` at today's saved price, or None when the price or the usage is unknown."""
    from apps.core.services.ai_usage_log import estimate_cost_usd, model_prices

    if not use or not model or model_prices(model) is None:
        return None
    return estimate_cost_usd(model, use['input'], use['output'], use['cache_write'], use['cache_read'])


def _sort_key(row) -> tuple:
    ws = row.workspace if row.workspace in WORKSPACE_ORDER else ''
    return (WORKSPACE_ORDER.index(ws) if ws else len(WORKSPACE_ORDER), row.page.lower(), row.label.lower())


def rows() -> list[dict]:
    """Every action, in sidebar workspace order, then page, then function, with what it runs and costs."""
    from apps.core.ai_config import resolve
    from apps.core.models import AiAction, AiTier

    usage = _usage()
    tiers = {t.key: t for t in AiTier.objects.select_related('model')}
    out = []
    for a in sorted(AiAction.objects.select_related('model', 'updated_by'), key=_sort_key):
        r = resolve(a.purpose)
        use = usage.get(a.purpose)
        cost = _cost(r['model'], use)
        tier_costs = {}
        if a.modality == 'text':
            for key in TEXT_TIERS:
                tier = tiers.get(key)
                slug = tier.model.slug if tier and tier.model and tier.model.status == 'active' else ''
                tier_costs[key] = None if _cost(slug, use) is None else str(_cost(slug, use))
        out.append({
            'purpose': a.purpose, 'label': a.label, 'workspace': a.workspace, 'page': a.page,
            'description': a.description, 'modality': a.modality, 'tier': a.tier,
            'model': a.model_id, 'model_slug': a.model.slug if a.model else None, 'effort': a.effort,
            'run_model': r['model'], 'run_effort': r['effort'], 'model_from': r['model_from'],
            'effort_from': r['effort_from'],
            'runs_30d': use['runs'] if use else 0,
            'tokens_in': use['input'] if use else None, 'tokens_out': use['output'] if use else None,
            'cost_per_run': None if cost is None else str(cost),
            'cost_month': None if cost is None or not use else str((cost * use['runs']).quantize(Decimal('0.01'))),
            'spent_30d': str(use['spent'].quantize(Decimal('0.01'))) if use else None,
            'tier_costs': tier_costs,
            'suggested_tier': a.suggested_tier, 'suggested_reason': a.suggested_reason,
            'updated_by_name': a.updated_by.full_name if a.updated_by else None, 'updated_at': a.updated_at,
        })
    return out


# ── the AI tier review ───────────────────────────────────────────────────────

REVIEW_SYSTEM = (
    'You set which model tier each AI job in a thrift store\'s back-office app uses. The tiers: Fast (cheapest, '
    'quick), Standard (middle), Best (strongest, priciest). You get the tier map (model, price per 1M tokens, '
    'Artificial Analysis Intelligence Index and its cost per test task, which includes thinking tokens) and '
    'every text job: what it does, runs in the last 30 days, tokens per run, and its cost per run on each tier.\n\n'
    'Choose by performance for the money per run, not by token price: put a job on a stronger tier only when its '
    'mistakes cost more than the extra spend (money decisions, rare but important work, writing that customers or '
    'staff read, reading photos), and keep high-volume, short, well-defined jobs on Fast. A job that must answer '
    'fast or within a time limit should not go to a slow tier. Give each job one tier and a reason of at most 20 '
    'plain words. Answer by calling propose_tiers with every job once.'
)
REVIEW_SCHEMA = {
    'name': REVIEW_TOOL,
    'description': 'One row per job: the tier you propose and why.',
    'input_schema': {
        'type': 'object',
        'properties': {'tiers': {'type': 'array', 'items': {
            'type': 'object',
            'properties': {
                'purpose': {'type': 'string'},
                'tier': {'type': 'string', 'enum': list(TEXT_TIERS)},
                'reason': {'type': 'string'},
            },
            'required': ['purpose', 'tier', 'reason'],
        }}},
        'required': ['tiers'],
    },
}


def _review_question() -> tuple[str, list[str]]:
    from apps.core.models import AiTier

    tier_lines = []
    for t in AiTier.objects.select_related('model').filter(key__in=TEXT_TIERS):
        m = t.model
        if m is None or m.status != 'active':
            tier_lines.append(f'- {t.label}: no model set (falls back to the house default).')
            continue
        price = (f'${m.input_price.normalize():f} in / ${m.output_price.normalize():f} out per 1M'
                 if m.input_price is not None and m.output_price is not None else 'price unknown')
        aa = (f'AA Intelligence {m.aa_intelligence}, AA cost per task ${m.aa_task_cost}'
              if m.aa_intelligence is not None else 'no AA scores')
        tier_lines.append(f'- {t.label}: {m.slug}, effort {t.effort}, {price}, {aa}.')
    jobs, purposes = [], []
    for r in rows():
        if r['modality'] != 'text' or r['purpose'] == 'AI_TIER_REVIEW':
            continue
        purposes.append(r['purpose'])
        jobs.append({
            'purpose': r['purpose'], 'where': f"{r['workspace']} > {r['page']} > {r['label']}",
            'does': r['description'], 'tier_now': r['tier'], 'runs_30d': r['runs_30d'],
            'tokens_per_run': None if r['tokens_in'] is None else {'in': r['tokens_in'], 'out': r['tokens_out']},
            'cost_per_run_by_tier': r['tier_costs'],
        })
    text = ('The tier map:\n' + '\n'.join(tier_lines) + '\n\nThe jobs (JSON):\n'
            + json.dumps(jobs, indent=1, default=str))
    return text, purposes


def review_state() -> dict:
    from apps.core.models import AppSetting

    s = AppSetting.objects.filter(key=REVIEW_KEY).values_list('value', flat=True).first() or {}
    if s.get('status') == 'running' and s.get('started_at'):
        from datetime import datetime

        if timezone.now() - datetime.fromisoformat(s['started_at']) > REVIEW_STALE:
            s = {**s, 'status': 'failed', 'error': 'The review stopped before finishing. Try again.'}
            _save_state(s)
    return s


def _save_state(s: dict) -> None:
    from apps.core.models import AppSetting

    AppSetting.objects.update_or_create(key=REVIEW_KEY, defaults={
        'value': s, 'description': 'Settings > AI: the last AI tier review.'})


def run_review(by: str = '') -> dict:
    """The review itself: one routed call, proposals saved on the actions. Returns the final state."""
    from apps.core.ai_config import ai_effort, ai_model
    from apps.core.models import AiAction
    from apps.core.services.llm_router import llm_complete

    started = review_state().get('started_at') or timezone.now().isoformat()
    model = ai_model('AI_TIER_REVIEW')
    try:
        question, purposes = _review_question()
        result = llm_complete(
            model_id=model, effort=ai_effort('AI_TIER_REVIEW'), system=REVIEW_SYSTEM, user=question,
            tools=[REVIEW_SCHEMA], tool_name=REVIEW_TOOL, max_tokens=8000, timeout=240,
            log_source='ai_tier_review', log_purpose='AI_TIER_REVIEW', log_detail=f'{len(purposes)} actions',
        )
        answers = {str(p.get('purpose') or '').upper(): p for p in (result.tool_input or {}).get('tiers') or []
                   if isinstance(p, dict) and p.get('tier') in TEXT_TIERS}
        if not answers:
            raise ValueError('The review did not propose any tiers. Try again.')
        changed = 0
        for a in AiAction.objects.filter(purpose__in=purposes):
            p = answers.get(a.purpose)
            if p is None or p['tier'] == a.tier:
                a.suggested_tier, a.suggested_reason = '', ''
            else:
                a.suggested_tier, a.suggested_reason = p['tier'], str(p.get('reason') or '')[:400]
                changed += 1
            a.save(update_fields=['suggested_tier', 'suggested_reason', 'updated_at'])
        s = {'status': 'done', 'started_at': started, 'finished_at': timezone.now().isoformat(), 'by': by,
             'model': result.model_used or model, 'proposed': changed, 'reviewed': len(answers), 'error': ''}
    except Exception as exc:  # noqa: BLE001 - whatever went wrong, the page must say so
        logger.exception('AI tier review failed')
        s = {'status': 'failed', 'started_at': started, 'finished_at': timezone.now().isoformat(), 'by': by,
             'model': model, 'error': str(exc)[:400]}
    _save_state(s)
    return s


def start_review(user=None) -> dict:
    """Start the review in a thread; returns the state at once."""
    current = review_state()
    if current.get('status') == 'running':
        return current
    by = (getattr(user, 'full_name', '') or getattr(user, 'email', '')) if user is not None else ''
    s = {'status': 'running', 'started_at': timezone.now().isoformat(), 'by': by, 'error': ''}
    _save_state(s)

    def _main():
        from django.db import connection

        try:
            run_review(by)
        finally:
            connection.close()

    threading.Thread(target=_main, name='ai-tier-review', daemon=True).start()
    return s
