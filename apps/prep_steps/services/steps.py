"""The guided line: Load, Clean, Match products, Category, Retail, Price, Packs, Send.

Entering a step the first time runs its standard fixes (code). Next marks the step done and moves on; Back moves
back. Every rule can be run again on a selection only. The summary carries, per step, its state, how many lines
are still open and what ran (code or which AI, lines changed, time, cost).
"""
from __future__ import annotations

import time
from decimal import Decimal
from typing import Any, Callable

from django.db.models import Count, Sum
from django.utils import timezone

from apps.prep_steps.models import STEPS, PrepAction, PrepLine, PrepRun
from apps.prep_steps.services import changes as ch
from apps.prep_steps.services import match as M
from apps.prep_steps.services import rules as R
from apps.prep_steps.services.flags import FLAG_TEXT, line_flags, open_steps

STEP_LABELS = {'load': 'Load', 'clean': 'Clean', 'match': 'Match products', 'category': 'Category',
               'retail': 'Retail', 'price': 'Price', 'packs': 'Packs', 'send': 'Send'}


def target_of(run: PrepRun) -> tuple[Decimal, Decimal]:
    t = run.target or {}
    return Decimal(str(t.get('share') or '0.55')), Decimal(str(t.get('band') or '0.15'))


def _match_rule(run: PrepRun) -> Callable:
    def fn(lines, force=False):
        return M.match_lines(lines, run.purchase_order, force=force)[0]
    return fn


def rule_table(run: PrepRun) -> dict[str, dict[str, Any]]:
    """name -> {step, label, fn(lines, force) -> changes, auto}: the standard fixes as buttons."""
    share, _band = target_of(run)
    return {
        'clean_titles': {'step': 'clean', 'label': 'Clean titles', 'fn': R.rule_clean_titles, 'auto': True},
        'brands': {'step': 'clean', 'label': 'Brand from title', 'fn': R.rule_brands, 'auto': True},
        'match_products': {'step': 'match', 'label': 'Match products', 'fn': _match_rule(run), 'auto': True},
        'drop_weak': {'step': 'match', 'label': 'Weak likes to new', 'fn': lambda ls, force=False: M.drop_weak(ls)},
        'take_top': {'step': 'match', 'label': 'Take top candidate',
                     'fn': lambda ls, force=False: M.take_candidate(ls, 0, 'is')},
        'mark_new': {'step': 'match', 'label': 'Mark new product', 'fn': lambda ls, force=False: M.mark_new(ls)},
        'category_rule': {'step': 'category', 'label': 'Category by rule', 'fn': R.rule_category, 'auto': True},
        'category_product': {'step': 'category', 'label': 'Use product category', 'fn': R.rule_category_from_product},
        'retail_manifest': {'step': 'retail', 'label': 'Retail from manifest', 'fn': R.rule_retail_manifest,
                            'auto': True},
        'retail_history': {'step': 'retail', 'label': 'Use our past retail', 'fn': R.rule_retail_history},
        'price_rule': {'step': 'price', 'label': 'Price by truck rule',
                       'fn': lambda ls, force=False: R.rule_price(ls, share, force=force), 'auto': True},
        'price_sold': {'step': 'price', 'label': 'Price from sold history', 'fn': R.rule_price_from_sold},
        'packs_rule': {'step': 'packs', 'label': 'Read packs', 'fn': R.rule_packs, 'auto': True},
        'sell_whole': {'step': 'packs', 'label': 'Sell whole',
                       'fn': lambda ls, force=False: [c for x in ls for c in R.sell_changes(x, 'whole', share)]},
        'sell_units': {'step': 'packs', 'label': 'Sell by unit',
                       'fn': lambda ls, force=False: [c for x in ls if (x.pack_units or 1) > 1
                                                      for c in R.sell_changes(x, 'units', share)]},
        'search_tags': {'step': 'send', 'label': 'Search words', 'fn': R.rule_search_tags, 'auto': True},
    }


def run_rule(run: PrepRun, name: str, line_ids: list[int] | None = None, *, user=None, force: bool = False,
             extra: dict | None = None) -> PrepAction:
    """A standard fix on the selection (or every line). Applied at once; undo puts it back."""
    extra = extra or {}
    if name == 'scale_to_target':
        return scale_to_target(run, user=user)
    if name == 'price_share':
        share = Decimal(str(extra.get('share')))
        if not (Decimal('0.05') <= share <= Decimal('1')):
            raise ch.ChangeError('Share must be 5% to 100%.')
        lines = _lines(run, line_ids)
        return ch.run_rule(run, 'price', name, f'Price at {share:.0%} of retail', lines,
                           lambda ls: R.rule_price_share(ls, share), user=user)
    if name == 'revert':
        step = str(extra.get('step') or run.step)
        lines = _lines(run, line_ids)
        return ch.run_rule(run, step, 'revert', 'Back to the manifest', lines,
                           lambda ls: R.rule_revert(ls, step), user=user)
    table = rule_table(run)
    rule = table.get(name)
    if rule is None:
        raise ch.ChangeError('Unknown fix.')
    lines = _lines(run, line_ids)
    return ch.run_rule(run, rule['step'], name, rule['label'], lines, lambda ls: rule['fn'](ls, force=force), user=user)


def scale_to_target(run: PrepRun, *, user=None) -> PrepAction:
    share, _ = target_of(run)
    lines = list(run.lines.all())
    total = target_base(lines) * share
    return ch.run_rule(run, 'price', 'scale_to_target', f'Scale to the target ({share:.0%})', lines,
                       lambda ls: R.rule_scale_to_target(ls, total), user=user)


def target_base(lines: list[PrepLine]) -> Decimal:
    """The retail the target is a share of: the checked retail of every tag (the manifest's when none is set)."""
    return R.truck_totals(lines)['retail'] or R.manifest_retail(lines)


def _lines(run: PrepRun, line_ids: list[int] | None) -> list[PrepLine]:
    qs = PrepLine.objects.filter(run=run).order_by('row_number')
    if line_ids is not None:
        qs = qs.filter(pk__in=line_ids)
    return list(qs)


def enter(run: PrepRun, step: str, *, user=None) -> list[PrepAction]:
    """Go to a step; the first time, its standard fixes run on every line."""
    if step not in STEPS:
        raise ch.ChangeError('Unknown step.')
    ran: list[PrepAction] = []
    state = dict(run.steps or {})
    first = step not in state
    if first:
        for name, rule in rule_table(run).items():
            if rule['step'] == step and rule.get('auto'):
                ran.append(run_rule(run, name, None, user=user))
        state[step] = {'state': 'open', 'entered_at': timezone.now().isoformat()}
    run.step = step
    run.steps = state
    run.save(update_fields=['step', 'steps', 'updated_at'])
    return ran


def next_step(run: PrepRun, *, user=None) -> list[PrepAction]:
    i = STEPS.index(run.step)
    state = dict(run.steps or {})
    state[run.step] = {**state.get(run.step, {}), 'state': 'done', 'done_at': timezone.now().isoformat()}
    run.steps = state
    run.save(update_fields=['steps', 'updated_at'])
    if i + 1 < len(STEPS):
        return enter(run, STEPS[i + 1], user=user)
    return []


def back_step(run: PrepRun) -> None:
    i = STEPS.index(run.step)
    if i > 0:
        run.step = STEPS[i - 1]
        run.save(update_fields=['step', 'updated_at'])


def accept(run: PrepRun, step: str, line_ids: list[int], value: bool = True) -> int:
    lines = list(PrepLine.objects.filter(run=run, pk__in=line_ids))
    for x in lines:
        acc = [s for s in (x.accepted or []) if s != step]
        if value:
            acc.append(step)
        x.accepted = acc
    PrepLine.objects.bulk_update(lines, ['accepted'], batch_size=500)
    return len(lines)


def edit(run: PrepRun, step: str, changes: list[dict], *, user=None) -> PrepAction:
    """Hand edits (a cell, or one value on the selection): an action of their own, so they can be undone."""
    if not changes:
        raise ch.ChangeError('Nothing to change.')
    if len(changes) > 20000:
        raise ch.ChangeError('Too many changes at once.')
    for c in changes:
        ch.clean_value(c.get('field'), c.get('new'))
    started = time.monotonic()
    fields = sorted({c['field'] for c in changes})
    lines = len({c['line'] for c in changes})
    action = ch.start(run, step, PrepAction.KIND_EDIT, 'edit', label=f'Set {", ".join(fields)} by hand',
                      user=user, line_count=lines)
    reason = 'Set by hand'
    return ch.apply(action, [{**c, 'reason': c.get('reason') or reason} for c in changes],
                    seconds=time.monotonic() - started)


# -- what the page reads -------------------------------------------------------------------------------------------

LINE_FIELDS = ('id', 'row_number', 'src_title', 'src_brand', 'src_model', 'src_qty', 'src_retail', 'src_ext_retail',
               'src_category', 'src_subcategory', 'src_condition', 'upc', 'item_number', 'image_url', 'page_url',
               'title', 'brand', 'model', 'qty', 'match_product_id', 'match_kind', 'match_confidence',
               'match_candidates', 'category', 'subcategory', 'retail', 'price', 'price_class', 'unit_count',
               'unit_name', 'pack_units', 'pieces', 'sell_as', 'search_tags', 'reasons', 'sources', 'accepted')


def _f(v):
    return float(v) if isinstance(v, Decimal) else v


def stats_for(lines: list[PrepLine]) -> dict[int, dict]:
    return R.product_stats({x.match_product_id for x in lines if x.match_product_id and x.match_kind == 'is'})


def serialize(lines: list[PrepLine], run: PrepRun, *, raw: bool = False, stats: dict | None = None) -> list[dict]:
    share, band = target_of(run)
    stats = stats if stats is not None else stats_for(lines)
    out = []
    for x in lines:
        d = {f: _f(getattr(x, f)) for f in LINE_FIELDS}
        fl = line_flags(x, share, band, stats)
        d['flags'] = fl
        d['open'] = open_steps(fl, x.accepted)
        d['pack'] = R.pack_words(x.unit_count, x.unit_name, x.pack_units)
        s = stats.get(x.match_product_id) if x.match_product_id else None
        if s:
            d['product'] = s
        elif x.match_product_id:
            c = next((c for c in (x.match_candidates or []) if c.get('product_id') == x.match_product_id), None)
            if c:
                d['product'] = {'number': c.get('number'), 'title': c.get('title'), 'brand': c.get('brand'),
                                'retail_avg': c.get('retail_avg'), 'sold': c.get('sold'), 'avg_sold': c.get('avg_sold')}
        if raw:
            d['raw'] = x.raw
        out.append(d)
    return out


def _action_row(a: PrepAction) -> dict:
    return {
        'id': a.id, 'step': a.step, 'kind': a.kind, 'name': a.name, 'label': a.label, 'model': a.model,
        'effort': a.effort, 'status': a.status, 'line_count': a.line_count, 'changed_count': a.changed_count,
        'seconds': a.seconds, 'cost': float(a.cost), 'calls': a.calls, 'input_tokens': a.input_tokens,
        'output_tokens': a.output_tokens, 'batches_done': a.batches_done, 'batches_total': a.batches_total,
        'prompt': a.prompt[:500], 'error': a.error, 'created_at': a.created_at.isoformat(),
        'preview_count': len(a.preview or []),
    }


def summary(run: PrepRun, lines: list[PrepLine] | None = None, stats: dict | None = None) -> dict:
    lines = lines if lines is not None else list(run.lines.all())
    share, band = target_of(run)
    stats = stats if stats is not None else stats_for(lines)
    open_counts = {s: 0 for s in STEPS}
    flag_counts: dict[str, dict[str, int]] = {s: {} for s in STEPS}
    for x in lines:
        fl = line_flags(x, share, band, stats)
        for s in open_steps(fl, x.accepted):
            open_counts[s] += 1
            for f in fl[s]:
                flag_counts[s][f] = flag_counts[s].get(f, 0) + 1
    actions = list(run.actions.exclude(status=PrepAction.STATUS_DISCARDED).order_by('-created_at', '-id')[:300])
    spend = run.actions.filter(status__in=[PrepAction.STATUS_APPLIED, PrepAction.STATUS_PREVIEW,
                                           PrepAction.STATUS_UNDONE, PrepAction.STATUS_FAILED])
    by_step = {r['step']: r for r in spend.values('step').annotate(cost=Sum('cost'), seconds=Sum('seconds'),
                                                                   n=Count('id'))}
    totals = R.truck_totals(lines)
    mretail = R.manifest_retail(lines)
    order = run.purchase_order
    steps = []
    for s in STEPS:
        st = (run.steps or {}).get(s, {})
        steps.append({
            'key': s, 'label': STEP_LABELS[s], 'state': st.get('state') or ('' if s != run.step else 'open'),
            'open': open_counts[s], 'flags': flag_counts[s],
            'cost': float(by_step.get(s, {}).get('cost') or 0), 'seconds': float(by_step.get(s, {}).get('seconds') or 0),
        })
    return {
        'id': run.id, 'order_id': order.pk, 'order_number': order.order_number,
        'vendor': getattr(order.vendor, 'name', ''), 'description': order.description,
        'step': run.step, 'steps': steps, 'target': {'share': float(share), 'band': float(band),
                                                     'total': float((totals['retail'] or mretail) * share)},
        'totals': {
            'lines': len(lines), 'units': sum(x.qty or 1 for x in lines),
            'pieces': sum((x.qty or 1) * max(1, x.pieces or 1) for x in lines),
            'manifest_retail': float(mretail), 'retail': float(totals['retail']), 'tag': float(totals['tag']),
            'cost': float(order.total_cost or 0),
            'ai_cost': float(sum((a.cost for a in actions), Decimal('0'))),
            'seconds': float(sum(a.seconds for a in actions)),
        },
        'actions': [_action_row(a) for a in actions],
        'load_info': run.load_info, 'flag_text': FLAG_TEXT, 'categories': _categories(), 'ai_jobs': _jobs(),
    }


def _jobs() -> dict[str, dict]:
    from apps.prep_steps.services.ai import job_menu

    return job_menu()


def _categories() -> dict[str, list[str]]:
    from apps.prep_steps.services.ai import _canon

    return _canon()


# -- Send: what each line hands over (services/send.py writes it for real) ---------------------------------------------

def handoff(x: PrepLine, stats: dict[int, dict]) -> dict:
    """What Truck Prep would hand to Processing for one manifest line (processing-night-1124.md contract)."""
    r = x.reasons or {}
    match = None
    if x.match_product_id and x.match_kind in ('is', 'like'):
        s = stats.get(x.match_product_id) or {}
        match = {'product_id': x.match_product_id, 'number': s.get('number', ''), 'kind': x.match_kind,
                 'confidence': x.match_confidence, 'reason': r.get('match_kind') or r.get('match_product_id', '')}
    draft = None
    if x.match_kind != 'is':
        pack = R.pack_words(x.unit_count, x.unit_name, x.pack_units)
        title = x.title
        if pack and pack.lower() not in title.lower():
            title = f'{title}, {pack}'  # the pack standard is written in the title (processing-night-1124.md)
        draft = {'title': title[:300], 'brand': x.brand or 'Generic', 'model': x.model, 'category': x.category,
                 'subcategory': x.subcategory, 'retail': _f(x.retail), 'unit_count': x.unit_count,
                 'unit_name': x.unit_name, 'pack_units': x.pack_units,
                 'pack': R.pack_words(x.unit_count, x.unit_name, x.pack_units), 'photo_url': x.image_url,
                 'page_url': x.page_url}
    return {
        'row_number': x.row_number, 'manifest_row_id': x.manifest_row_id, 'preprocessing_row_id': x.preprocessing_row_id,
        'search_tags': x.search_tags or R.search_tags(x),
        'product_match': match, 'product_draft': draft,
        'price': _f(x.price), 'price_reason': r.get('price', ''),
        'retail': _f(x.retail), 'retail_reason': r.get('retail', ''),
        'pieces': (x.qty or 1) * max(1, x.pieces or 1),
        'pieces_reason': (r.get('pieces') or (f'{x.qty} on the manifest' if (x.pieces or 1) == 1
                                              else f'{x.qty} x {x.pieces} tags')),
        'sell_as': x.sell_as or 'whole', 'category': x.category, 'subcategory': x.subcategory,
    }


def send_dry_run(run: PrepRun) -> dict:
    lines = list(run.lines.all())
    stats = stats_for(lines)
    rows = [handoff(x, stats) for x in lines]
    return {
        'lines': rows, 'would_write': len(rows),
        'matched': sum(1 for r in rows if r['product_match'] and r['product_match']['kind'] == 'is'),
        'like': sum(1 for r in rows if r['product_match'] and r['product_match']['kind'] == 'like'),
        'drafts': sum(1 for r in rows if r['product_draft']),
        'priced': sum(1 for r in rows if r['price']),
        # Lines with no price and no retail: they go over at $0 and are priced at check-in.
        'no_price': sum(1 for x in lines if x.price is None and not (x.retail or x.src_retail)),
        'written': 0,
        **_send_status(run),
    }


def _send_status(run: PrepRun) -> dict:
    from apps.prep_steps.services import send as SEND

    return SEND.status(run)
