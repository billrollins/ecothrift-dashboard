"""The week's post slots and the category rotation (plan: Cadence, owner call F2).

**Slots.** One post on each posting day (`marketing.post_weekdays`, Tuesday to Saturday) that the store is open
(`is_open_day`, so holidays count), with the post type fixed by the weekday:

    Tue new this week | Wed category spotlight | Thu coming soon | Fri weekend pick + Thrift+ | Sat live from the floor

A posting day outside Tue-Sat (if the owner adds one) is a category spotlight. When the week has closed days, one
more slot, **scheduled**, sits on the Sunday (or the first closed day when Sunday is open): made ahead and set to
go out while the store is shut ("the week's best, open Tuesday"). It has no category.

**Rotation.** Every other slot gets a category. The weight is the category's items on the floor now
(`Item.status = on_shelf`; the product standard category when it is a real one, else the product's category),
times `marketing.season_weight` when the category is in season. Categories go in weight order; a category that had
a post in the last `marketing.repeat_days` days is skipped unless it is in season; no category twice in one week.
When the fresh ones run out the skipped ones come back, still by weight.

Slots become `SocialPost` rows the first time a week is opened (this week or later; a past week is history), so a
swap sticks. Rows already made are never re-picked.
"""
from __future__ import annotations

from datetime import date, timedelta

from django.db import IntegrityError, transaction
from django.db.models import Case, CharField, Count, F, When

from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES
from apps.marketing.models import SocialPost
from apps.marketing.settings import marketing_settings
from apps.webstore.services.hours import get_hours_config, is_open_day

REAL_CATEGORIES = tuple(name for name in TAXONOMY_V1_CATEGORY_NAMES if name != MIXED_LOTS_UNCATEGORIZED)

TYPE_BY_WEEKDAY = {
    1: SocialPost.TYPE_NEW,
    2: SocialPost.TYPE_SPOTLIGHT,
    3: SocialPost.TYPE_COMING,
    4: SocialPost.TYPE_WEEKEND,
    5: SocialPost.TYPE_LIVE,
}

# The built-in season calendar, used while `marketing.in_season` is empty (plan, Phase 3 "Season").
SEASON_BY_MONTH = {
    10: ('Party, seasonal & novelty',),
    11: ('Toys & games', 'Party, seasonal & novelty'),
    12: ('Toys & games', 'Party, seasonal & novelty'),
}


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def week_days(monday: date) -> list[date]:
    return [monday + timedelta(days=n) for n in range(7)]


def is_post_day(day: date, *, cfg: dict | None = None, settings: dict | None = None) -> bool:
    """A regular posting day: a posting weekday the store is open (the Today's post routine runs on these)."""
    settings = settings or marketing_settings()
    return bool(settings['post_weekdays'][day.weekday()]) and is_open_day(day, cfg=cfg)


def week_slots(monday: date, *, settings: dict | None = None) -> list[tuple[date, str]]:
    """(day, post type) for the week starting `monday`, in date order."""
    settings = settings or marketing_settings()
    cfg = get_hours_config()
    days = week_days(monday)
    slots = [
        (day, TYPE_BY_WEEKDAY.get(day.weekday(), SocialPost.TYPE_SPOTLIGHT))
        for day in days if is_post_day(day, cfg=cfg, settings=settings)
    ]
    closed = [day for day in days if not is_open_day(day, cfg=cfg)]
    if closed:
        sunday = days[6]
        slots.append((sunday if sunday in closed else closed[0], SocialPost.TYPE_SCHEDULED))
    return sorted(slots)


def in_season(day: date, *, settings: dict | None = None) -> set[str]:
    settings = settings or marketing_settings()
    if settings['in_season']:
        return set(settings['in_season'])
    return set(SEASON_BY_MONTH.get(day.month, ()))


def floor_counts() -> dict[str, int]:
    """Items on the floor per real category (register ITM-15: the profile category wins when it is a real one)."""
    from apps.inventory.models import Item

    name = Case(
        When(product__profile__category__in=REAL_CATEGORIES, then=F('product__profile__category')),
        default=F('product__category__name'),
        output_field=CharField(),
    )
    rows = (
        Item.objects.filter(status='on_shelf')
        .annotate(cat=name).values('cat').annotate(n=Count('id'))
    )
    return {row['cat']: row['n'] for row in rows if row['cat'] in REAL_CATEGORIES}


def rank_categories(day: date, *, settings: dict | None = None, counts: dict[str, int] | None = None) -> list[str]:
    """Every real category, best first: floor stock times the season weight, then taxonomy order."""
    settings = settings or marketing_settings()
    counts = floor_counts() if counts is None else counts
    season = in_season(day, settings=settings)

    def weight(name: str) -> float:
        return counts.get(name, 0) * (settings['season_weight'] if name in season else 1)

    order = {name: index for index, name in enumerate(REAL_CATEGORIES)}
    return sorted(REAL_CATEGORIES, key=lambda name: (-weight(name), order[name]))


def pick_categories(first_day: date, n: int, *, taken: set[str], settings: dict | None = None,
                    counts: dict[str, int] | None = None) -> list[str]:
    """`n` categories for the week starting near `first_day`, none of them in `taken` (already this week)."""
    if n <= 0:
        return []
    settings = settings or marketing_settings()
    season = in_season(first_day, settings=settings)
    since = first_day - timedelta(days=settings['repeat_days'])
    recent = set(
        SocialPost.objects.filter(slot_date__gte=since, slot_date__lt=first_day)
        .exclude(category='').values_list('category', flat=True)
    )
    ranked = [name for name in rank_categories(first_day, settings=settings, counts=counts) if name not in taken]
    fresh = [name for name in ranked if name not in recent or name in season]
    stale = [name for name in ranked if name in recent and name not in season]
    return (fresh + stale)[:n]


def ensure_week(monday: date, *, today: date) -> list[SocialPost]:
    """The week's posts, making the missing slot rows when the week is not over yet."""
    monday = week_start(monday)
    days = week_days(monday)
    existing = {post.slot_date: post for post in SocialPost.objects.filter(slot_date__range=(days[0], days[-1]))}
    if days[-1] >= today:
        settings = marketing_settings()
        missing = [(day, kind) for day, kind in week_slots(monday, settings=settings) if day not in existing]
        if missing:
            needs = [day for day, kind in missing if kind != SocialPost.TYPE_SCHEDULED]
            taken = {post.category for post in existing.values() if post.category}
            picks = iter(pick_categories(monday, len(needs), taken=taken, settings=settings))
            for day, kind in missing:
                category = '' if kind == SocialPost.TYPE_SCHEDULED else next(picks, '')
                try:
                    with transaction.atomic():
                        existing[day] = SocialPost.objects.create(slot_date=day, post_type=kind, category=category)
                except IntegrityError:
                    # Another request made it first.
                    existing[day] = SocialPost.objects.get(slot_date=day)
    return [existing[day] for day in sorted(existing)]


def swap_slots(a: SocialPost, b: SocialPost) -> None:
    """Trade two days' post type and category (the dates, photos and words stay)."""
    a.post_type, b.post_type = b.post_type, a.post_type
    a.category, b.category = b.category, a.category
    with transaction.atomic():
        a.save(update_fields=['post_type', 'category', 'updated_at'])
        b.save(update_fields=['post_type', 'category', 'updated_at'])
