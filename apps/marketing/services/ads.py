"""Ad results dump (Dash #182): the owner pastes a whole ad results page (Facebook "View results", select all), the AI
reads it, and the boost is saved with its dates, budget, spend, goal, audience, results and the categories to watch.

**The ad is a boost row** in the spend ledger (`MarketingSpend`, kind boost): `day` is its start, `amount` what it
spent. A paste for a boost already saved (same start day, same post text) updates that row, never a second one. The
ad links to its Social Studio post when one matches its text; otherwise the owner drops in the post photos (and the
post text when the paste lacks it).

**Privacy.** The raw paste is never stored. Before the AI sees it, the lines about who made the ad, the ad account
and payment are cut, and anything shaped like a card number, email or phone number is masked. The audience is kept
as totals only (place, ages, women/men split).

**Categories to watch.** `{"Category": pct}` or `{"Category › Subcategory": pct}` (taxonomy names), summing to 100,
or `{"ALL": 100}` for the whole store. The AI guesses them from the post text; the owner edits them.

**The read** (rough, not proof; weather, trucks and the season move sales too). Units sold per open day (a day the
store sold anything) during the ad (start through the end, or yesterday while it runs) against the 28 days before it,
for each watched category and for the whole store. Items sold are `inventory.Item` rows with status sold, by `sold_at` (local day); the category is the
register's ITM-15 rule (`cadence.item_category`), the subcategory the product profile's. Extra units = (rate during
- rate before) x days; cost per extra unit = spend / extra units in the watched categories, only when there are
extra units. Another boost running in the ad's days or its 28 days before is flagged, not corrected for.
"""
from __future__ import annotations

import difflib
import re
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q
from django.utils import timezone

from apps.marketing.models import CHANNEL_FACEBOOK, MarketingSpend, SocialPost
from apps.marketing.services import cadence

PURPOSE = 'AD_RESULTS'
ALL = 'ALL'
SEP = ' › '
BASELINE_DAYS = 28
PASTE_MAX = 20_000
POST_MATCH_RATIO = 0.6
RESULT_FIELDS = (
    'reach', 'views', 'post_engagements', 'link_clicks', 'reactions', 'comments', 'shares', 'saves', 'messages',
    'page_likes',
)
NUMBER_MAX = 100_000_000
ZERO = Decimal('0')


class AdError(ValueError):
    def __init__(self, detail: str, code: str):
        super().__init__(detail)
        self.detail = detail
        self.code = code


# ── Scrub ────────────────────────────────────────────────────────────────────

# A label line whose value (the same line, or the next) is never sent or kept.
_DROP_LABELS = ('created by', 'ad account', 'payment method', 'billing', 'card', 'account id')
_CARD = re.compile(r'\b(?:\d[ -]?){12,19}\b')
_EMAIL = re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')
_PHONE = re.compile(r'(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b')


def scrub(text: str) -> str:
    """The paste without who made the ad, the ad account or payment, and with card numbers, emails and phones masked."""
    out: list[str] = []
    skip_next = False
    for line in str(text or '').replace('\r\n', '\n').split('\n'):
        low = line.strip().lower()
        if skip_next:
            skip_next = False
            continue
        label = next((lab for lab in _DROP_LABELS if low == lab or low.startswith(lab + ':')), None)
        if label:
            # "Label: value" on one line, or the label alone with its value on the next line.
            skip_next = low == label
            continue
        line = _CARD.sub('[removed]', line)
        line = _EMAIL.sub('[removed]', line)
        line = _PHONE.sub('[removed]', line)
        out.append(line)
    return '\n'.join(out).strip()[:PASTE_MAX]


# ── Categories ───────────────────────────────────────────────────────────────


def taxonomy() -> dict[str, list[str]]:
    from apps.inventory.services import standardize as std

    canon = std.canon()
    return {name: list(canon.get(name) or []) for name in cadence.REAL_CATEGORIES}


def clean_weights(raw, tax: dict[str, list[str]] | None = None) -> dict[str, int]:
    """`{key: pct}` with real keys and whole percents summing to 100, or `{"ALL": 100}`. Raises AdError."""
    tax = tax if tax is not None else taxonomy()
    if isinstance(raw, list):
        raw = {str(r.get('key') or ''): r.get('pct') for r in raw if isinstance(r, dict)}
    if not isinstance(raw, dict) or not raw:
        return {ALL: 100}
    out: dict[str, int] = {}
    for key, pct in raw.items():
        key = str(key or '').strip()
        try:
            pct = int(round(float(pct)))
        except (TypeError, ValueError):
            raise AdError(f'{key or "A category"} needs a whole percent.', 'BAD_WEIGHT') from None
        if pct <= 0:
            continue
        if key.upper() == ALL:
            return {ALL: 100}
        cat, _, sub = key.partition(SEP.strip())
        cat, sub = cat.strip(), sub.strip()
        if cat not in tax or (sub and sub not in tax[cat]):
            raise AdError(f'{key} is not a category.', 'BAD_WEIGHT')
        key = f'{cat}{SEP}{sub}' if sub else cat
        out[key] = out.get(key, 0) + pct
    if not out:
        return {ALL: 100}
    if sum(out.values()) != 100:
        raise AdError(f'The categories add up to {sum(out.values())}%. Make them 100%, or watch ALL.', 'BAD_WEIGHT')
    return out


def _fit_weights(raw, tax: dict[str, list[str]]) -> dict[str, int]:
    """The AI's guess, kept to real keys and scaled to 100 (largest remainder); ALL when nothing is left."""
    try:
        return clean_weights(raw, tax)
    except AdError:
        pass
    rows: list[tuple[str, float]] = []
    for r in raw if isinstance(raw, list) else []:
        if not isinstance(r, dict):
            continue
        try:
            key, pct = clean_weights({str(r.get('key') or ''): 100}, tax), float(r.get('pct') or 0)
        except (AdError, TypeError, ValueError):
            continue
        name = next(iter(key))
        if name != ALL and pct > 0:
            rows.append((name, pct))
    total = sum(p for _, p in rows)
    if not rows or not total:
        return {ALL: 100}
    shares = [(k, p * 100 / total) for k, p in rows]
    out = {k: int(s) for k, s in shares}
    left = 100 - sum(out.values())
    for k, s in sorted(shares, key=lambda ks: -(ks[1] - int(ks[1])))[:left]:
        out[k] += 1
    return {k: v for k, v in out.items() if v > 0}


# ── The AI read ──────────────────────────────────────────────────────────────

TOOL_NAME = 'ad_results'


def _tool() -> list[dict]:
    num = {'type': ['number', 'null']}
    return [{
        'name': TOOL_NAME,
        'description': 'The ad read from a pasted ad results page.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'start_date': {'type': ['string', 'null'], 'description': 'YYYY-MM-DD'},
                'end_date': {'type': ['string', 'null'], 'description': 'YYYY-MM-DD'},
                'spent': {**num, 'description': 'Total amount spent, dollars.'},
                'daily_budget': num,
                'goal': {'type': 'string', 'description': 'The goal as the page words it, e.g. "Get more engagement".'},
                'ad_type': {'type': 'string', 'description': 'e.g. "Boosted Facebook post".'},
                'channel': {'type': 'string', 'enum': ['facebook', 'instagram', 'google', 'nextdoor', 'tiktok']},
                'results': {
                    'type': 'object',
                    'properties': {k: num for k in RESULT_FIELDS},
                    'description': 'post_engagements, views (impressions), link_clicks, reactions, comments, shares, '
                                   'saves, messages (conversations started), page_likes, reach.',
                },
                'audience': {
                    'type': 'object',
                    'properties': {
                        'location': {'type': 'string'}, 'age_min': num, 'age_max': num,
                        'women_pct': num, 'men_pct': num,
                    },
                },
                'post_text': {'type': 'string', 'description': "The post's own text (the Preview), word for word; '' if absent."},
                'weights': {
                    'type': 'array',
                    'description': 'The categories this ad sells, from the list, with percents summing to 100. One row '
                                   'with key "ALL" when the ad is about the whole store.',
                    'items': {
                        'type': 'object',
                        'properties': {'key': {'type': 'string'}, 'pct': {'type': 'number'}},
                        'required': ['key', 'pct'],
                    },
                },
            },
            'required': ['start_date', 'end_date', 'spent', 'post_text', 'weights'],
        },
    }]


def _system(tax: dict[str, list[str]], today: date) -> str:
    lines = '\n'.join(f'- {cat}: {", ".join(subs)}' for cat, subs in tax.items())
    return f"""You read one pasted ad results page for Eco-Thrift, a thrift store in Omaha. Today is {today.isoformat()}.
Call the tool `{TOOL_NAME}` once with what the page says. Rules:
- Copy numbers exactly as shown (2,295 -> 2295; $99.60 -> 99.6). Unknown -> null. Never guess a number.
- Dates as YYYY-MM-DD; a date with no year is the most recent one not after today.
- Ages "18 - 65+" -> age_min 18, age_max 65.
- post_text is the post itself, word for word, from the preview; '' when the page has none.
- weights: what the post advertises, as categories to watch. Use a key "Category" or "Category › Subcategory" from
  the list below, exact names. Percents sum to 100. When the post is about the store in general (hours, a sale on
  everything), one row {{"key": "ALL", "pct": 100}}.
- Never copy a person's name, an account, an email, a phone or payment details.

Categories and subcategories:
{lines}"""


def _num(value) -> float | None:
    if value is None or value == '':
        return None
    try:
        n = float(str(value).replace('$', '').replace(',', '').strip())
    except (TypeError, ValueError):
        return None
    return n if 0 <= n <= NUMBER_MAX else None


def _day(value) -> date | None:
    try:
        return date.fromisoformat(str(value or '')[:10])
    except ValueError:
        return None


def _money(value) -> str | None:
    n = _num(value)
    return None if n is None else str(Decimal(str(n)).quantize(Decimal('0.01')))


def _audience(aud: dict) -> dict:
    """Totals only: place, ages, women/men split."""
    out: dict = {}
    location = scrub(str(aud.get('location') or '').strip())[:160]
    if location:
        out['location'] = location
    for key in ('age_min', 'age_max'):
        n = _num(aud.get(key))
        if n is not None:
            out[key] = int(n)
    for key in ('women_pct', 'men_pct'):
        n = _num(aud.get(key))
        if n is not None and n <= 100:
            out[key] = round(n, 1)
    return out


def normalize(answer: dict, tax: dict[str, list[str]]) -> dict:
    """The AI's tool input as a draft the dialog shows: clean types, real category keys, nothing personal."""
    results = answer.get('results') if isinstance(answer.get('results'), dict) else {}
    aud = answer.get('audience') if isinstance(answer.get('audience'), dict) else {}
    start, end = _day(answer.get('start_date')), _day(answer.get('end_date'))
    if start and end and end < start:
        start, end = end, start
    channel = str(answer.get('channel') or CHANNEL_FACEBOOK)
    return {
        'start': start.isoformat() if start else None,
        'end': end.isoformat() if end else None,
        'spent': _money(answer.get('spent')),
        'daily_budget': _money(answer.get('daily_budget')),
        'goal': str(answer.get('goal') or '').strip()[:120],
        'ad_type': str(answer.get('ad_type') or '').strip()[:120],
        'channel': channel if channel in {'facebook', 'instagram', 'google', 'nextdoor', 'tiktok'} else CHANNEL_FACEBOOK,
        'results': {k: int(n) for k in RESULT_FIELDS if (n := _num(results.get(k))) is not None},
        'audience': _audience(aud),
        'post_text': scrub(str(answer.get('post_text') or '').strip())[:5000],
        'weights': _fit_weights(answer.get('weights'), tax),
    }


def read_paste(text: str, *, today: date | None = None) -> tuple[dict, str]:
    """Scrub the paste, ask the AI, return (draft, model). Raises AdError."""
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_chat_tool_input

    clean = scrub(text)
    if len(clean) < 20:
        raise AdError('Paste the whole ad results page first.', 'EMPTY')
    tax = taxonomy()
    today = today or timezone.localdate()
    try:
        answer, model = llm_chat_tool_input(
            purpose=PURPOSE, system=_system(tax, today), user=clean, tool_name=TOOL_NAME, tools=_tool(),
            max_tokens=2000, log_source='marketing.ad_results', log_detail='Ad results dump',
        )
    except (LLMAPIError, LLMConfigError, ValueError) as exc:
        raise AdError(f'The AI could not read it right now ({exc}). Try again.', 'AI_FAILED') from None
    return normalize(answer, tax), model


# ── Matching ─────────────────────────────────────────────────────────────────


def _similar(a: str, b: str) -> float:
    a, b = ' '.join(a.lower().split()), ' '.join(b.lower().split())
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a[:600], b[:600]).ratio()


def find_post(post_text: str, start: date | None) -> SocialPost | None:
    """The Studio post whose hook + body best matches the ad's text, posted within 30 days before the ad."""
    if not post_text.strip():
        return None
    qs = SocialPost.objects.all()
    if start:
        qs = qs.filter(slot_date__gte=start - timedelta(days=30), slot_date__lte=start + timedelta(days=1))
    best, best_ratio = None, POST_MATCH_RATIO
    for post in qs:
        ratio = _similar(post_text, f'{post.hook}\n{post.body}')
        if ratio >= best_ratio:
            best, best_ratio = post, ratio
    return best


def find_ad(start: date | None, post_text: str) -> MarketingSpend | None:
    """A boost already saved for this ad: same start day, and the same post (or no text on either)."""
    if not start:
        return None
    for row in MarketingSpend.objects.filter(kind=MarketingSpend.KIND_BOOST, day=start).order_by('-id'):
        if not row.post_text and not post_text:
            return row
        if _similar(row.post_text, post_text) >= POST_MATCH_RATIO:
            return row
    return None


def match(draft: dict) -> dict:
    start = _day(draft.get('start'))
    text = str(draft.get('post_text') or '')
    ad = find_ad(start, text)
    post = (ad.post if ad and ad.post_id else None) or find_post(text, start)
    have_photos = bool(ad and ad.photos.exists())
    return {
        'ad_id': ad.pk if ad else None,
        'post_id': post.pk if post else None,
        'post_label': _post_label(post),
        'need_photos': post is None and not have_photos,
        'need_text': not text.strip(),
    }


def _post_label(post: SocialPost | None) -> str:
    if post is None:
        return ''
    return f'{post.slot_date.strftime("%b")} {post.slot_date.day} · {post.hook or post.get_post_type_display()}'


# ── Save ─────────────────────────────────────────────────────────────────────


def save_ad(data: dict, *, user, photos=None) -> MarketingSpend:
    """Create or update the boost from the dialog's (edited) draft. Raises AdError."""
    start, end = _day(data.get('start')), _day(data.get('end'))
    if not start:
        raise AdError('The ad needs its start date.', 'BAD_DATE')
    if end and end < start:
        raise AdError('The end date is before the start.', 'BAD_DATE')
    try:
        spent = Decimal(str(data.get('spent') or '').replace('$', '').replace(',', '').strip())
    except InvalidOperation:
        spent = None
    if spent is None or spent < 0 or spent > Decimal('100000'):
        raise AdError('Type what the ad spent.', 'BAD_AMOUNT')
    budget = _money(data.get('daily_budget'))
    weights = clean_weights(data.get('weights'))
    post_text = scrub(str(data.get('post_text') or '').strip())[:5000]
    results = data.get('results') if isinstance(data.get('results'), dict) else {}
    results = {k: int(n) for k in RESULT_FIELDS if (n := _num(results.get(k))) is not None}
    audience = _audience(data.get('audience') if isinstance(data.get('audience'), dict) else {})

    ad = None
    if data.get('ad_id'):
        ad = MarketingSpend.objects.filter(pk=data.get('ad_id'), kind=MarketingSpend.KIND_BOOST).first()
        if ad is None:
            raise AdError('That ad is gone.', 'NOT_FOUND')
    ad = ad or find_ad(start, post_text) or MarketingSpend(kind=MarketingSpend.KIND_BOOST, entered_by=user)
    post = None
    if data.get('post_id'):
        post = SocialPost.objects.filter(pk=data.get('post_id')).first()
    post = post or find_post(post_text, start)
    goal = str(data.get('goal') or '').strip()[:120]
    ad_type = str(data.get('ad_type') or '').strip()
    ad.day, ad.end_day, ad.amount = start, end, spent.quantize(Decimal('0.01'))
    ad.daily_budget = Decimal(budget) if budget else None
    ad.goal, ad.results, ad.audience, ad.category_weights = goal, results, audience, weights
    ad.post_text, ad.post = post_text, post
    ad.channel = str(data.get('channel') or CHANNEL_FACEBOOK)
    ad.note = (ad_type or 'Boost')[:255] if not ad.note else ad.note
    ad.save()
    if photos:
        from apps.marketing.services.photos import save_photo

        cat = next((k.split(SEP)[0] for k in weights if k != ALL), '')
        for upload in photos:
            ad.photos.add(save_photo(upload, user=user, category=cat, note=f'Ad {start.isoformat()}'))
    return ad


# ── The read ─────────────────────────────────────────────────────────────────


def _sold(start: date, end: date) -> dict[date, dict[tuple[str, str], int]]:
    """Items sold per local day per (category, subcategory) in [start, end]."""
    from apps.inventory.models import Item

    rows = (
        Item.objects.filter(status='sold', sold_at__date__gte=start, sold_at__date__lte=end)
        .annotate(cat=cadence.item_category()).values('sold_at__date', 'cat', 'product__profile__subcategory')
        .annotate(n=Count('id'))
    )
    out: dict[date, dict[tuple[str, str], int]] = defaultdict(lambda: defaultdict(int))
    for row in rows:
        out[row['sold_at__date']][(row['cat'] or '', row['product__profile__subcategory'] or '')] += row['n']
    return out


def _units(sold, days: list[date], key: str) -> int:
    """Units sold on those days for a key: ALL, "Category", "Category › Sub", or "Category › " (no subcategory)."""
    cat, sep, sub = key.partition(SEP)
    n = 0
    for day in days:
        for (c, s), count in sold.get(day, {}).items():
            if key == ALL or (c == cat and (not sep or s == sub)):
                n += count
    return n


def _overlaps(ad: MarketingSpend, start: date, end: date) -> list[dict]:
    others = MarketingSpend.objects.filter(kind=MarketingSpend.KIND_BOOST).exclude(pk=ad.pk).filter(
        Q(day__lte=end) & (Q(end_day__gte=start) | Q(end_day__isnull=True, day__gte=start)),
    )
    return [{'id': o.pk, 'start': o.day.isoformat(), 'end': (o.end_day or o.day).isoformat()} for o in others]


def ad_read(ad: MarketingSpend, today: date | None = None, sold=None) -> dict | None:
    """Units/day during the ad against the 28 days before, per watched category and the whole store."""
    today = today or timezone.localdate()
    last = min(ad.end_day or ad.day, today - timedelta(days=1))
    if last < ad.day:
        return None
    during = [ad.day + timedelta(days=k) for k in range((last - ad.day).days + 1)]
    before = [ad.day - timedelta(days=k) for k in range(1, BASELINE_DAYS + 1)]
    sold = sold if sold is not None else _sold(before[-1], last)
    # Rates per open day (a day the store sold anything): a closed Sunday would drag a 4-day ad down. No sales in the
    # ad's days yet (closed, or the register not in): no read rather than a false -100%.
    during = [d for d in during if sold.get(d)]
    if not during:
        return None
    before = [d for d in before if sold.get(d)] or before
    weights = ad.category_weights or {ALL: 100}
    # Context rows, not watched: a watched subcategory's own category, and the whole store.
    parents = [k.split(SEP)[0] for k in weights if SEP in k]
    context = [k for k in dict.fromkeys(parents + [ALL]) if k not in weights]
    rows = []
    for key in list(weights) + context:
        u_during, u_before = _units(sold, during, key), _units(sold, before, key)
        r_during, r_before = u_during / len(during), u_before / len(before)
        row = {
            'key': key,
            'pct': weights.get(key),
            'watched': key in weights,
            'per_day_during': round(r_during, 1),
            'per_day_before': round(r_before, 1),
            'change': f'{(r_during / r_before - 1) * 100:.1f}' if r_before else None,
            'extra_units': round((r_during - r_before) * len(during), 1),
            'sold': u_during + u_before,
            'no_sub_pct': None,
        }
        if SEP in key:
            # Data quality: most sales may carry no subcategory, so a subcategory read rests on few items.
            parent = key.split(SEP)[0]
            total = _units(sold, during + before, parent)
            blank = _units(sold, during + before, f'{parent}{SEP}')
            row['no_sub_pct'] = round(blank * 100 / total) if total else None
        rows.append(row)
    watched = [r for r in rows if r['watched']]
    extra = sum(r['extra_units'] for r in watched)
    return {
        'days': len(during),
        'through': last.isoformat(),
        'baseline_days': BASELINE_DAYS,
        'rows': rows,
        'extra_units': round(extra, 1),
        'cost_per_extra_unit': str((ad.amount / Decimal(str(extra))).quantize(Decimal('0.01'))) if extra > 0 else None,
        'overlaps': _overlaps(ad, ad.day - timedelta(days=BASELINE_DAYS), last),
    }


def ad_payload(ad: MarketingSpend, today: date | None = None, sold=None) -> dict:
    post = ad.post if ad.post_id else None
    return {
        'id': ad.pk,
        'start': ad.day.isoformat(),
        'end': ad.end_day.isoformat() if ad.end_day else None,
        'spent': str(ad.amount),
        'daily_budget': str(ad.daily_budget) if ad.daily_budget is not None else None,
        'goal': ad.goal,
        'ad_type': ad.note,
        'channel': ad.channel,
        'results': ad.results or {},
        'audience': ad.audience or {},
        'weights': ad.category_weights or {ALL: 100},
        'post_text': ad.post_text,
        'post_id': ad.post_id,
        'post_label': _post_label(post),
        'photo_ids': list(ad.photos.values_list('id', flat=True)),
        'read': ad_read(ad, today, sold),
    }


def ads_list(today: date | None = None, limit: int = 30) -> list[dict]:
    """Boosts read from a paste (they carry weights), newest first, with their read."""
    today = today or timezone.localdate()
    ads = list(
        MarketingSpend.objects.filter(kind=MarketingSpend.KIND_BOOST).exclude(category_weights={})
        .select_related('post').order_by('-day', '-id')[:limit]
    )
    if not ads:
        return []
    first = min(a.day for a in ads) - timedelta(days=BASELINE_DAYS)
    last = max((a.end_day or a.day) for a in ads)
    sold = _sold(first, min(last, today))
    return [ad_payload(a, today, sold) for a in ads]


def top_ad(ads: list[dict]) -> dict | None:
    """The ad with the lowest cost per extra unit (only ads that sold extra units)."""
    scored = [a for a in ads if a['read'] and a['read']['cost_per_extra_unit'] is not None]
    return min(scored, key=lambda a: Decimal(a['read']['cost_per_extra_unit']), default=None)
