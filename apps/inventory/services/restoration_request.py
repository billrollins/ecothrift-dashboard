"""
Processing's request to Restoration (owner, 2026-10-28; replaces the v2.217.0 estimate of hours, parts and value after).

Every path that sends an item to Restoration sends `restoration: {needs, done_price, as_is, broken_scrap}`:
- what it needs, which is also the state it is in now: test (untested), clean (dirty), assemble (flat-packed),
  repair (broken), check_parts (parts not checked); one or more,
- ONE typed price: what it sells for when the work is done (per unit),
- an as-is price for each other ending. Dash fills them in from settings (a % of the done price; flat-packed is
  done / 1.10) and Processing may change any of them. Can't repair: sell as is, or scrap / parts at $0.

The API refuses without a need and the done price (a ValueError, so a 400 with the message). The request is kept on
the check-in (`defaults_snapshot.restoration_request`) and on the job (`requested_needs`, `done_price`,
`as_is_prices`, `value_at_stake`); the queue note says it in a line. Restoration fills in its side later
(`found_needs`, hours, parts, outcome). Old jobs keep their old estimates (`defaults_snapshot.restoration_estimate`).

Queue order: expected gain per minute = value at stake x success odds / typical minutes (`priority_for_job`).
Assembly holdout: a share of Assemble requests (setting, default 10%) is picked at random to sell flat-packed.
"""
from __future__ import annotations

import logging
import random
import time
from decimal import ROUND_HALF_UP, Decimal
from statistics import median
from typing import Any

from django.utils import timezone

from apps.core.models import AppSetting

logger = logging.getLogger(__name__)

NEEDS = ('test', 'clean', 'assemble', 'repair', 'check_parts')
NEED_LABELS = {'test': 'Test', 'clean': 'Clean', 'assemble': 'Assemble', 'repair': 'Repair', 'check_parts': 'Check parts'}
# The state each need says it is in now, and the as-is ending it sells as without the work.
ENDING_FOR_NEED = {
    'test': 'untested',
    'clean': 'dirty',
    'assemble': 'flat_packed',
    'repair': 'broken',
    'check_parts': 'parts_unchecked',
}
SNAPSHOT_KEY = 'restoration_request'
LEGACY_SNAPSHOT_KEY = 'restoration_estimate'
LEGACY_WORK_TO_NEED = {'test': 'test', 'assemble': 'assemble', 'repair': 'repair'}

DEFAULTS: dict[str, Any] = {
    # As-is price, % of the done price (owner-editable; starting points, 2026-10-28).
    'restoration.as_is_untested_pct': 50,
    'restoration.as_is_dirty_pct': 70,
    'restoration.as_is_broken_pct': 30,
    'restoration.as_is_parts_unchecked_pct': 60,
    # Flat-packed as is = done / (1 + this %).
    'restoration.flat_pack_markup_pct': 10,
    # Share of Assemble requests held out to sell flat-packed; 0 turns it off.
    'restoration.assembly_holdout_pct': 10,
    # Queue order: past jobs needed before their numbers replace the defaults.
    'restoration.priority_min_jobs': 5,
    'restoration.default_success_pct': {'test': 85, 'clean': 95, 'assemble': 90, 'repair': 60, 'check_parts': 85},
    'restoration.default_minutes': {'test': 15, 'clean': 20, 'assemble': 30, 'repair': 60, 'check_parts': 15},
}
PCT_KEY_FOR_ENDING = {
    'untested': 'restoration.as_is_untested_pct',
    'dirty': 'restoration.as_is_dirty_pct',
    'broken': 'restoration.as_is_broken_pct',
    'parts_unchecked': 'restoration.as_is_parts_unchecked_pct',
}

CENT = Decimal('0.01')
_cache: dict[str, Any] = {'settings_at': 0.0, 'settings': None, 'stats_at': 0.0, 'stats': None}
_SETTINGS_SECONDS = 30
_STATS_SECONDS = 300


class RestorationRequestError(ValueError):
    pass


# --- settings -------------------------------------------------------------------------------------------------------

def _number(raw: Any, fallback: float, *, allow_zero: bool = True) -> float:
    try:
        num = float(raw)
    except (TypeError, ValueError):
        return fallback
    if num < 0 or (num == 0 and not allow_zero):
        return fallback
    return num


def request_settings() -> dict[str, Any]:
    now = time.monotonic()
    if _cache['settings'] is not None and now - _cache['settings_at'] < _SETTINGS_SECONDS:
        return _cache['settings']
    stored = dict(AppSetting.objects.filter(key__in=list(DEFAULTS)).values_list('key', 'value'))
    out: dict[str, Any] = {}
    for key, fallback in DEFAULTS.items():
        raw = stored.get(key, fallback)
        if isinstance(fallback, dict):
            raw = raw if isinstance(raw, dict) else {}
            out[key] = {need: _number(raw.get(need), fallback[need], allow_zero=False) for need in NEEDS}
        else:
            out[key] = _number(raw, fallback)
    _cache.update(settings_at=now, settings=out)
    return out


def clear_cache() -> None:
    _cache.update(settings_at=0.0, settings=None, stats_at=0.0, stats=None)


def public_settings() -> dict[str, Any]:
    """What the check-in dialogs need to fill in the as-is prices."""
    s = request_settings()
    return {
        'needs': [{'value': n, 'label': NEED_LABELS[n], 'ending': ENDING_FOR_NEED[n]} for n in NEEDS],
        'as_is_pct': {ending: s[key] for ending, key in PCT_KEY_FOR_ENDING.items()},
        'flat_pack_markup_pct': s['restoration.flat_pack_markup_pct'],
        'assembly_holdout_pct': s['restoration.assembly_holdout_pct'],
    }


def default_as_is(ending: str, done: Decimal) -> Decimal:
    s = request_settings()
    if ending == 'flat_packed':
        markup = Decimal(str(s['restoration.flat_pack_markup_pct']))
        return (done / (1 + markup / 100)).quantize(CENT, rounding=ROUND_HALF_UP)
    pct = Decimal(str(s[PCT_KEY_FOR_ENDING[ending]]))
    return (done * pct / 100).quantize(CENT, rounding=ROUND_HALF_UP)


# --- the request ----------------------------------------------------------------------------------------------------

def _amount(value, label: str) -> Decimal | None:
    from apps.inventory.processing_ops import parse_decimal

    if value in (None, ''):
        return None
    amount = parse_decimal(value)
    if amount is None or amount < 0:
        raise RestorationRequestError(f'Restoration: the {label} must be a dollar amount.')
    return amount.quantize(CENT)


def restoration_request(raw: Any) -> dict[str, Any]:
    """The checked request, or RestorationRequestError saying what is missing. Its own output passes again."""
    raw = raw if isinstance(raw, dict) else {}
    picked = {str(x).strip().lower().replace(' ', '_') for x in (raw.get('needs') or [])}
    needs = [n for n in NEEDS if n in picked]
    if not needs:
        raise RestorationRequestError(
            'Restoration: pick what it needs (test, clean, assemble, repair or check parts).')
    done = _amount(raw.get('done_price'), 'done price')
    if not done:
        raise RestorationRequestError('Restoration: give the done price (what it sells for when the work is done).')
    typed = raw.get('as_is') if isinstance(raw.get('as_is'), dict) else {}
    scrap = bool(raw.get('broken_scrap'))
    as_is: dict[str, str] = {}
    for need in needs:
        ending = ENDING_FOR_NEED[need]
        if ending == 'broken' and scrap:
            price = Decimal('0.00')
        else:
            price = _amount(typed.get(ending), 'as-is price')
            if price is None:
                price = default_as_is(ending, done)
        if price > done:
            raise RestorationRequestError("Restoration: an as-is price can't be more than the done price.")
        as_is[ending] = str(price)
    return {'needs': needs, 'done_price': str(done), 'as_is': as_is, 'broken_scrap': scrap and 'repair' in needs}


def value_at_stake(request: dict[str, Any]) -> Decimal:
    """Done minus as-is for the asked work. The item is in every state it needs fixing from, so the lowest as-is."""
    lowest = min(Decimal(v) for v in request['as_is'].values())
    return Decimal(request['done_price']) - lowest


def saved_request(snapshot: Any) -> dict[str, Any] | None:
    """The request already on a check-in, when it is still a whole one."""
    saved = snapshot.get(SNAPSHOT_KEY) if isinstance(snapshot, dict) else None
    try:
        return restoration_request(saved) if saved else None
    except RestorationRequestError:
        return None


def has_legacy_estimate(snapshot: Any) -> bool:
    """An old (v2.217.0) estimate on the check-in. Those jobs keep it; an edit does not ask again."""
    return isinstance(snapshot, dict) and bool((snapshot.get(LEGACY_SNAPSHOT_KEY) or {}).get('work'))


def _money(value: Any) -> str:
    return f'${Decimal(value):,.2f}'


def request_line(request: dict[str, Any], *, holdout: bool = False) -> str:
    asked = ', '.join(NEED_LABELS[n].lower() for n in request['needs'])
    lowest = min(Decimal(v) for v in request['as_is'].values())
    line = (f"Asked: {asked} · done {_money(request['done_price'])} · as is {_money(lowest)}"
            f" · at stake {_money(value_at_stake(request))}")
    if holdout:
        line += ' · HOLDOUT: sell flat-packed, as is'
    return line


def stamped(request: dict[str, Any], user) -> dict[str, Any]:
    """For the check-in's snapshot: the request with who and when."""
    return {**request, 'recorded_at': timezone.now().isoformat(), 'recorded_by_id': getattr(user, 'pk', None)}


def _pick_holdout(needs: list[str]) -> bool:
    if 'assemble' not in needs:
        return False
    pct = request_settings()['restoration.assembly_holdout_pct']
    return pct > 0 and random.random() * 100 < pct


def apply_to_job(job, request: dict[str, Any], user, *, new_job: bool) -> None:
    """Store the request on the job; its queue note says it. A new Assemble job may be picked as a holdout."""
    from apps.inventory.services.item_notes import _job_items, append_item_note, record_surface_note_for_job

    if job is None:
        return
    job.requested_needs = list(request['needs'])
    job.done_price = Decimal(request['done_price'])
    job.as_is_prices = dict(request['as_is'])
    job.value_at_stake = value_at_stake(request)
    if new_job:
        job.holdout = _pick_holdout(job.requested_needs)
    elif 'assemble' not in job.requested_needs:
        job.holdout = False
    job.queue_note = request_line(request, holdout=job.holdout)
    job.save(update_fields=['requested_needs', 'done_price', 'as_is_prices', 'value_at_stake', 'holdout',
                            'queue_note', 'updated_at'])
    record_surface_note_for_job(job, 'queue', job.queue_note, author=user, source_key='queue')
    items = list(_job_items(job))
    from apps.inventory.models import Item

    Item.objects.filter(pk__in=[it.pk for it in items]).update(restoration_holdout=job.holdout)
    if new_job and job.holdout:
        pct = request_settings()['restoration.assembly_holdout_pct']
        body = (f'Assembly holdout: picked at random ({pct:g}% of Assemble requests) to sell flat-packed, as is. '
                'Do not assemble.')
        for item in items:
            append_item_note(item, 'queue', body, author=user, job_id=job.pk, source_key='holdout')
        logger.info('restoration holdout: job %s (%s units) picked to sell flat-packed', job.pk, len(items))


# --- the restoration tag ---

TAG_STAGES = ('queued', 'sent')


def tag_facts(job) -> dict[str, Any]:
    """What the restoration tag says besides the SKU and title (owner, 2026-10-28): the work in big words, HOLDOUT,
    the date it was sent and who sent it. No prices."""
    who = job.created_by
    sent = timezone.localtime(job.created_at) if job.created_at else timezone.localtime()
    return {
        'needs': [NEED_LABELS[n] for n in _job_needs(job)],
        'holdout': bool(job.holdout),
        'sent_on': sent.date().isoformat(),
        'sent_by': ((who.first_name or '').strip() or (who.email or '').split('@')[0]) if who else '',
    }


def restoration_tags_for_items(items) -> dict[int, dict[str, Any]]:
    """Item id -> tag facts, for items in Restoration whose job is still waiting there (a fresh check-in prints the
    restoration tag instead of the price tag)."""
    from apps.inventory.models import RestorationJob

    check_in_ids = {it.check_in_id for it in items if it.check_in_id and it.location == 'restoration'}
    if not check_in_ids:
        return {}
    jobs = {j.item_check_in_id: j for j in RestorationJob.objects.filter(
        item_check_in_id__in=check_in_ids, stage__in=TAG_STAGES).select_related('created_by', 'item_check_in')}
    out: dict[int, dict[str, Any]] = {}
    for it in items:
        job = jobs.get(it.check_in_id) if it.location == 'restoration' else None
        if job is not None:
            out[it.id] = tag_facts(job)
    return out


# --- queue order ----------------------------------------------------------------------------------------------------

def _job_needs(job) -> list[str]:
    if job.requested_needs:
        return [n for n in NEEDS if n in job.requested_needs]
    snapshot = job.item_check_in.defaults_snapshot if job.item_check_in_id else {}
    legacy = (snapshot or {}).get(LEGACY_SNAPSHOT_KEY) or {}
    return [LEGACY_WORK_TO_NEED[w] for w in legacy.get('work') or [] if w in LEGACY_WORK_TO_NEED]


def _history_stats() -> dict[tuple[str, int | None], dict[str, Any]]:
    """Per (need, category) and (need, None = all): finished-job count, success count, minutes of successful jobs."""
    now = time.monotonic()
    if _cache['stats'] is not None and now - _cache['stats_at'] < _STATS_SECONDS:
        return _cache['stats']
    from apps.inventory.models import RestorationJob

    rows = (RestorationJob.objects
            .filter(stage__in=[RestorationJob.STAGE_DONE, RestorationJob.STAGE_RETURNED])
            .select_related('item_check_in', 'product')
            .only('id', 'stage', 'bench_disposition', 'return_disposition_type', 'work_seconds', 'active_seconds',
                  'requested_needs', 'item_check_in__defaults_snapshot', 'product__category_id'))
    stats: dict[tuple[str, int | None], dict[str, Any]] = {}
    for job in rows.iterator(chunk_size=500):
        needs = _job_needs(job)
        if not needs:
            continue
        if job.stage == RestorationJob.STAGE_RETURNED:
            if job.return_disposition_type != RestorationJob.RETURN_DISPOSITION_UNTOUCHED:
                continue
            success = False
        else:
            success = job.bench_disposition != RestorationJob.BENCH_DISPOSITION_SALVAGE
        seconds = job.work_seconds or job.active_seconds or 0
        share = seconds / 60 / len(needs) if success and seconds else None
        category = job.product.category_id if job.product_id else None
        for need in needs:
            for key in ((need, category), (need, None)):
                entry = stats.setdefault(key, {'jobs': 0, 'wins': 0, 'minutes': []})
                entry['jobs'] += 1
                entry['wins'] += int(success)
                if share:
                    entry['minutes'].append(share)
    _cache.update(stats_at=now, stats=stats)
    return stats


def _odds_and_minutes(need: str, category: int | None) -> tuple[float, float, str]:
    s = request_settings()
    floor = s['restoration.priority_min_jobs']
    stats = _history_stats()
    odds = minutes = None
    source = 'default'
    for key in ((need, category), (need, None)):
        entry = stats.get(key)
        if not entry:
            continue
        if odds is None and entry['jobs'] >= floor:
            odds = entry['wins'] / entry['jobs']
            source = 'history'
        if minutes is None and len(entry['minutes']) >= floor:
            minutes = median(entry['minutes'])
    if odds is None:
        odds = s['restoration.default_success_pct'][need] / 100
    if minutes is None:
        minutes = s['restoration.default_minutes'][need]
    return odds, max(minutes, 1.0), source


def priority_for_job(job) -> dict[str, Any] | None:
    """Expected gain per minute: (done - as is) x success odds / typical minutes. None when the job says no need."""
    needs = _job_needs(job)
    if not needs:
        return None
    if job.value_at_stake is not None:
        stake = float(job.value_at_stake)
    else:
        values = [float(v) for v in (job.grade_values or {}).values() if isinstance(v, (int, float))]
        if len(values) < 2:
            return None
        stake = max(values) - min(values)
    category = job.product.category_id if job.product_id else None
    odds, minutes, from_history = 1.0, 0.0, False
    for need in needs:
        o, m, source = _odds_and_minutes(need, category)
        odds *= o
        minutes += m
        from_history = from_history or source == 'history'
    return {
        'per_minute': round(stake * odds / minutes, 4),
        'odds': round(odds, 3),
        'minutes': round(minutes, 1),
        'stake': round(stake, 2),
        'from_history': from_history,
    }
