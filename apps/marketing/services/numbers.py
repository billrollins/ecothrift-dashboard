"""Post numbers, the spend ledger and what moves the needle (Lane F Phase 5).

**Numbers.** A posted post gets its numbers typed from Facebook's insights twice: after 1 day and after 7 days
(reach, reactions, comments, shares, messages, link clicks; engagement is the last five added). A mark is due once
that many days have passed since it was posted. Pulled from Meta later, once the owner makes the Meta app (F5).

**Spend.** The ledger (owner call F3: $0 to start): boosts, print, events, other; optionally tied to a post.

**Hits.** The posts of the last `weeks` weeks ranked by engagement (the 7-day numbers when typed, else the 1-day),
and the averages by post type and by category, each with how many posts it rests on.

**Rough read** (plan: "posts against tickets and sales by weekday baseline, and category sales after a spotlight,
with sample sizes shown"). Not proof: weather, sales, trucks and the season move these too, and a few posts are a
small sample.
- *Post days:* a day a post went out (its local posted date), against the same weekday in the 8 weeks before when
  no post went out and the store sold something: tickets (completed sales) and Net item sales
  (`pos.services.sales_numbers`). The lift is day / baseline - 1, averaged by post type.
- *Spotlights:* a category spotlight's category, items sold and their dollars over the 7 days from the post, against
  the same 7 days in each of the 4 weeks before (the item's category per register ITM-15, `cadence.item_category`).
  Only spotlights a full 7 days old count.

**Weekly card** (the Owner page): this week's posts (out and planned), reach and engagement, the best post, numbers
still due, spend this week and month, and the read's one-line headline.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from apps.marketing.models import MarketingSpend, SocialPost, SocialPostNumbers
from apps.marketing.services import cadence

NUMBER_FIELDS = ('reach', 'reactions', 'comments', 'shares', 'messages', 'link_clicks')
NUMBER_MAX = 10_000_000
BASELINE_WEEKS = 8
SPOTLIGHT_WEEKS = 4
DEFAULT_WEEKS = 8
ZERO = Decimal('0')


class NumbersError(ValueError):
    def __init__(self, detail: str, code: str):
        super().__init__(detail)
        self.detail = detail
        self.code = code


def _money(value) -> str:
    return str(Decimal(value or 0).quantize(Decimal('0.01')))


def _pct(value: float | None) -> str | None:
    return None if value is None else f'{value * 100:.1f}'


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def posted_day(post: SocialPost) -> date | None:
    return timezone.localdate(post.posted_at) if post.posted_at else None


# ── Numbers ──────────────────────────────────────────────────────────────────


def due_marks(post: SocialPost, today: date, have: set[int] | None = None) -> list[int]:
    """The marks (1, 7) whose day has come and that have no numbers yet."""
    day = posted_day(post)
    if post.status != SocialPost.STATUS_POSTED or day is None:
        return []
    if have is None:
        have = set(post.numbers.values_list('mark', flat=True))
    return [mark for mark, _ in SocialPostNumbers.MARK_CHOICES if day + timedelta(days=mark) <= today and mark not in have]


def save_numbers(post: SocialPost, mark, data: dict, *, user) -> SocialPostNumbers:
    if post.status != SocialPost.STATUS_POSTED:
        raise NumbersError('Numbers go on a posted post.', 'NOT_POSTED')
    try:
        mark = int(mark)
    except (TypeError, ValueError):
        mark = 0
    if mark not in dict(SocialPostNumbers.MARK_CHOICES):
        raise NumbersError('Pick after 1 day or after 7 days.', 'BAD_MARK')
    values = {}
    for field in NUMBER_FIELDS:
        raw = data.get(field, 0)
        try:
            n = int(str(raw).replace(',', '').strip() or 0)
        except (TypeError, ValueError):
            raise NumbersError(f'{field.replace("_", " ").capitalize()} must be a whole number.', 'BAD_NUMBER') from None
        if n < 0 or n > NUMBER_MAX:
            raise NumbersError(f'{field.replace("_", " ").capitalize()} is out of range.', 'BAD_NUMBER')
        values[field] = n
    row, _ = SocialPostNumbers.objects.update_or_create(
        post=post, channel=SocialPostNumbers._meta.get_field('channel').default, mark=mark,
        defaults={**values, 'entered_by': user},
    )
    return row


def _row(n: SocialPostNumbers | None) -> dict | None:
    if n is None:
        return None
    return {
        **{f: getattr(n, f) for f in NUMBER_FIELDS},
        'engagement': n.engagement,
        'entered_by_name': n.entered_by.full_name if n.entered_by_id and n.entered_by else '',
        'entered_at': n.entered_at.isoformat() if n.entered_at else None,
    }


def numbers_payload(post: SocialPost, today: date | None = None) -> dict:
    rows = {n.mark: n for n in post.numbers.select_related('entered_by')}
    return {
        'day1': _row(rows.get(SocialPostNumbers.MARK_DAY)),
        'day7': _row(rows.get(SocialPostNumbers.MARK_WEEK)),
        'due': due_marks(post, today or timezone.localdate(), set(rows)),
    }


def _latest(rows: dict[int, SocialPostNumbers]) -> SocialPostNumbers | None:
    return rows.get(SocialPostNumbers.MARK_WEEK) or rows.get(SocialPostNumbers.MARK_DAY)


# ── Spend ────────────────────────────────────────────────────────────────────


def add_spend(data: dict, *, user) -> MarketingSpend:
    kinds = dict(MarketingSpend.KIND_CHOICES)
    kind = str(data.get('kind') or '')
    if kind not in kinds:
        raise NumbersError('Pick what the money was for.', 'BAD_KIND')
    try:
        amount = Decimal(str(data.get('amount') or '').replace('$', '').replace(',', '').strip())
    except Exception:  # noqa: BLE001 - any unreadable amount
        amount = None
    if amount is None or amount <= 0 or amount > Decimal('100000'):
        raise NumbersError('Type the amount spent.', 'BAD_AMOUNT')
    try:
        day = date.fromisoformat(str(data.get('day') or ''))
    except ValueError:
        day = timezone.localdate()
    post = None
    if data.get('post'):
        post = SocialPost.objects.filter(pk=data.get('post')).first()
        if post is None:
            raise NumbersError('That post is gone.', 'NOT_FOUND')
    return MarketingSpend.objects.create(
        day=day, kind=kind, amount=amount.quantize(Decimal('0.01')), note=str(data.get('note') or '').strip()[:255],
        post=post, channel='facebook' if kind == MarketingSpend.KIND_BOOST else '', entered_by=user,
    )


def spend_payload(row: MarketingSpend) -> dict:
    return {
        'id': row.pk,
        'day': row.day.isoformat(),
        'kind': row.kind,
        'kind_label': row.get_kind_display(),
        'amount': _money(row.amount),
        'note': row.note,
        'post_id': row.post_id,
        'post_day': row.post.slot_date.isoformat() if row.post_id and row.post else None,
        'entered_by_name': row.entered_by.full_name if row.entered_by_id and row.entered_by else '',
    }


def spend_total(start: date, end: date) -> Decimal:
    return MarketingSpend.objects.filter(day__gte=start, day__lte=end).aggregate(s=Sum('amount'))['s'] or ZERO


# ── Hits ─────────────────────────────────────────────────────────────────────


def _posted(start: date, end: date) -> list[SocialPost]:
    posts = list(
        SocialPost.objects.filter(status=SocialPost.STATUS_POSTED, slot_date__gte=start, slot_date__lte=end)
        .prefetch_related('numbers').order_by('slot_date')
    )
    return posts


def _hit(post: SocialPost) -> dict:
    rows = {n.mark: n for n in post.numbers.all()}
    latest = _latest(rows)
    return {
        'id': post.pk,
        'slot_date': post.slot_date.isoformat(),
        'post_type': post.post_type,
        'post_type_label': post.get_post_type_display(),
        'category': post.category,
        'hook': post.hook,
        'posted_url': post.posted_url,
        'rating': post.rating,
        'mark': latest.mark if latest else None,
        'reach': latest.reach if latest else None,
        'engagement': latest.engagement if latest else None,
    }


def _groups(hits: list[dict], key: str, label_of) -> list[dict]:
    out = []
    by: dict[str, list[dict]] = defaultdict(list)
    for hit in hits:
        if hit[key]:
            by[hit[key]].append(hit)
    for name, rows in by.items():
        counted = [r for r in rows if r['reach'] is not None]
        out.append({
            'key': name,
            'label': label_of(name),
            'posts': len(rows),
            'with_numbers': len(counted),
            'avg_reach': round(_mean([r['reach'] for r in counted])) if counted else None,
            'avg_engagement': round(_mean([r['engagement'] for r in counted])) if counted else None,
        })
    return sorted(out, key=lambda g: -(g['avg_engagement'] or -1))


# ── The rough read ───────────────────────────────────────────────────────────


def _category_sales(start: date, end: date) -> dict[tuple[date, str], tuple[int, Decimal]]:
    """Items sold and their dollars per (day, category) in [start, end]."""
    from apps.inventory.models import Item

    rows = (
        Item.objects.filter(status='sold', sold_at__date__gte=start, sold_at__date__lte=end)
        .annotate(cat=cadence.item_category()).values('sold_at__date', 'cat')
        .annotate(n=Count('id'), dollars=Sum('sold_for'))
    )
    return {(row['sold_at__date'], row['cat']): (row['n'], row['dollars'] or ZERO) for row in rows}


def sales_read(posts: list[SocialPost], today: date) -> dict:
    from apps.pos.services.sales_numbers import by_day

    days = sorted({d for d in (posted_day(p) for p in posts) if d and d < today})
    empty = {'post_days': 0, 'ticket_lift': None, 'sales_lift': None, 'by_type': [], 'spotlights': [],
             'baseline_weeks': BASELINE_WEEKS}
    if not days:
        return empty
    numbers = by_day(days[0] - timedelta(weeks=BASELINE_WEEKS), days[-1])
    post_days = set(days)

    def lift(day: date) -> tuple[float | None, float | None]:
        base = [numbers[d] for d in (day - timedelta(weeks=k) for k in range(1, BASELINE_WEEKS + 1))
                if d not in post_days and d in numbers and numbers[d]['sales_count'] > 0]
        today_n = numbers.get(day)
        if not base or not today_n:
            return None, None
        tickets = _mean([float(n['sales_count']) for n in base])
        sales = _mean([float(n['net_item_sales']) for n in base])
        t = float(today_n['sales_count']) / tickets - 1 if tickets else None
        s = float(today_n['net_item_sales']) / sales - 1 if sales else None
        return t, s

    per_day = {day: lift(day) for day in days}
    by_type: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for post in posts:
        day = posted_day(post)
        t, s = per_day.get(day, (None, None)) if day else (None, None)
        if t is not None and s is not None:
            by_type[post.post_type].append((t, s))
    counted = [v for v in per_day.values() if v[0] is not None and v[1] is not None]
    labels = dict(SocialPost.TYPE_CHOICES)
    out = {
        'post_days': len(counted),
        'ticket_lift': _pct(_mean([t for t, _ in counted])),
        'sales_lift': _pct(_mean([s for _, s in counted])),
        'baseline_weeks': BASELINE_WEEKS,
        'by_type': sorted([
            {'key': k, 'label': labels.get(k, k), 'days': len(v),
             'ticket_lift': _pct(_mean([t for t, _ in v])), 'sales_lift': _pct(_mean([s for _, s in v]))}
            for k, v in by_type.items()
        ], key=lambda r: -float(r['ticket_lift'] or 0)),
        'spotlights': [],
    }
    spots = [p for p in posts if p.post_type == SocialPost.TYPE_SPOTLIGHT and p.category and posted_day(p)
             and posted_day(p) + timedelta(days=6) < today]
    if spots:
        first = min(posted_day(p) for p in spots) - timedelta(weeks=SPOTLIGHT_WEEKS)
        last = max(posted_day(p) for p in spots) + timedelta(days=6)
        sold = _category_sales(first, last)

        def window(start: date, cat: str) -> tuple[int, Decimal]:
            n, dollars = 0, ZERO
            for k in range(7):
                got = sold.get((start + timedelta(days=k), cat))
                if got:
                    n += got[0]
                    dollars += got[1]
            return n, dollars

        for post in spots:
            day = posted_day(post)
            after = window(day, post.category)
            before = [window(day - timedelta(weeks=k), post.category) for k in range(1, SPOTLIGHT_WEEKS + 1)]
            base_n = _mean([float(b[0]) for b in before])
            out['spotlights'].append({
                'post_id': post.pk,
                'slot_date': post.slot_date.isoformat(),
                'category': post.category,
                'sold_after': after[0],
                'dollars_after': _money(after[1]),
                'sold_before_avg': round(base_n, 1) if base_n is not None else None,
                'change': _pct(after[0] / base_n - 1) if base_n else None,
                'weeks_before': SPOTLIGHT_WEEKS,
            })
    return out


# ── Pages ────────────────────────────────────────────────────────────────────


def insights(today: date | None = None, weeks: int = DEFAULT_WEEKS) -> dict:
    """The Studio's Numbers page."""
    today = today or timezone.localdate()
    start = today - timedelta(weeks=weeks)
    posts = _posted(start, today)
    hits = [_hit(p) for p in posts]
    labels = dict(SocialPost.TYPE_CHOICES)
    due = []
    for post in posts:
        marks = due_marks(post, today, {n.mark for n in post.numbers.all()})
        if marks:
            due.append({'id': post.pk, 'slot_date': post.slot_date.isoformat(), 'hook': post.hook,
                        'post_type_label': post.get_post_type_display(), 'due': marks})
    monday = today - timedelta(days=today.weekday())
    return {
        'today': today.isoformat(),
        'weeks': weeks,
        'due': due,
        'hits': sorted(hits, key=lambda h: -(h['engagement'] if h['engagement'] is not None else -1)),
        'by_type': _groups(hits, 'post_type', lambda k: labels.get(k, k)),
        'by_category': _groups(hits, 'category', lambda k: k),
        'read': sales_read(posts, today),
        'spend': {
            'week': _money(spend_total(monday, today)),
            'month': _money(spend_total(today.replace(day=1), today)),
            'rows': [spend_payload(r) for r in MarketingSpend.objects.select_related('post', 'entered_by')[:50]],
        },
    }


def weekly_card(today: date | None = None) -> dict:
    """The Owner page's Social card: this week, plus the read over the last 8 weeks."""
    today = today or timezone.localdate()
    monday = today - timedelta(days=today.weekday())
    week_posts = list(SocialPost.objects.filter(slot_date__gte=monday, slot_date__lte=monday + timedelta(days=6))
                      .prefetch_related('numbers'))
    posted = [p for p in week_posts if p.status == SocialPost.STATUS_POSTED]
    hits = [_hit(p) for p in posted]
    counted = [h for h in hits if h['reach'] is not None]
    best = max(counted, key=lambda h: h['engagement'], default=None)
    page = insights(today)
    read = page['read']
    top = next((r for r in read['by_type'] if r['days'] >= 2), None)
    return {
        'week_start': monday.isoformat(),
        'planned': len(week_posts),
        'posted': len(posted),
        'reach': sum(h['reach'] for h in counted),
        'engagement': sum(h['engagement'] for h in counted),
        'with_numbers': len(counted),
        'best': best,
        'numbers_due': sum(len(d['due']) for d in page['due']),
        'spend_week': page['spend']['week'],
        'spend_month': page['spend']['month'],
        'read': {
            'post_days': read['post_days'],
            'ticket_lift': read['ticket_lift'],
            'sales_lift': read['sales_lift'],
            'top_type': top,
            'weeks': DEFAULT_WEEKS,
        },
        'link': '/studios/social/numbers',
    }
