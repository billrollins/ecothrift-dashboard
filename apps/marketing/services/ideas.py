"""Post ideas AI (Lane F Phase 4, owner 2026-10-22: "the AI is not helping and doing the heavy lifting we need").

**Ideas.** For one day's post the AI suggests 3 to 5 different posts from the cadence and the store's data, each
with a hook, the words, a call to action, the photos to use (from the photos staff took this week) and what still
needs a photo. **Use this idea** fills the post's words and adds the idea's photos; nothing is posted by the AI.
The call runs in a thread (it takes seconds; the request returns at once and the page polls the post). Each posting
morning `materialize_routines` asks for the day's ideas so they are waiting (off switch `marketing.ai_morning_ideas`).

**Fast rewrites.** A new hook, a shorter hook, another take on the words, shorter words: one small call, answered
inside the request with 3 options to pick from. Nothing is saved until the poster picks one.

**Facts** (`gather_facts`, all read-only):
- New in: items on the floor checked in over the last `marketing.ai_new_in_days` (3) days, best tags first, at most
  3 per category; a category spotlight gets the category's best floor items instead.
- This week's photos: library photos from the last 7 days with their item (title, tag price) or note.
- Coming soon: open POs with `expected_delivery` in the next 14 days, POs being processed now, B-Stock wins of the
  last 21 days.
- Sale or event: the store sale and the line sale (`pos.services.sale_mode`), hours changes (holidays), the season.
- Push: the Thrift+ overstock list (`thriftplus.services.overstock`), biggest first.
Retail figures are never sent, so the AI cannot print one; the photo's tag overlay shows a checked retail.

**Guards.** The rulebook's never-say words (the social build's `BANNED` list, creative-method.md): a draft that holds
one is asked for again once, then kept with the words named (`flags`) for the poster. Long dashes become commas, web
addresses are dropped (Facebook counts them as links), hooks are cut to `marketing.hook_max_chars` at a word. Photo
and item ids the AI names are kept only when they are in the facts.

**Cost.** Ideas: one call (two with the retry). A rewrite: one small call. Logged in `AIUsage` as source
`marketing.post_ideas` / `marketing.rewrite`, purpose `SOCIAL_POST` (Settings > AI picks the model; blank uses the
low-cost `AI_MODEL`).
"""
from __future__ import annotations

import json
import logging
import re
import threading
from collections import Counter
from datetime import date, timedelta

from django.db import close_old_connections, connections, transaction
from django.db.models import Count
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.marketing.models import SocialPhoto, SocialPost, SocialPostPhoto
from apps.marketing.services import cadence
from apps.marketing.settings import marketing_settings

logger = logging.getLogger(__name__)

PURPOSE = 'SOCIAL_POST'
SOURCE_IDEAS = 'marketing.post_ideas'
SOURCE_REWRITE = 'marketing.rewrite'
STATE_DRAFTING = 'drafting'
STATE_DONE = 'done'
STATE_FAILED = 'failed'
# Ideas still "drafting" after this long died with their thread (the dyno restarted).
STALE_AFTER = timedelta(minutes=3)
COMING_DAYS = 14
WON_DAYS = 21
PHOTO_DAYS = 7
PHOTOS_MAX = 24
BODY_MAX = 600
SHOTS_MAX = 8
IDEAS_MAX = 5

# The rulebook's never-say words (V2, J10, V9, B6) plus the social-only ones: workspace/social/tools/build.py BANNED.
NEVER_SAY = [
    r'\bcards?\b', r'\bguests?\b', r'cash back', r'\bpoints\b', r'\bdiscount', r'\bfees?\b', r'\bdues\b',
    r'store credit', r'gift card', r'\bbank(ed)?\b', r'\bearn', r'member price', r'instantbucks', r'\bwarrant',
    r'\bcover\b', r'the longer it waits', r'free forever', r'\bthrift bucks\b', r'price drop', r'\bsav(e|ings)\b',
    r'\$\s?[\d,.]+\s*thriftbucks',
]
DASHES = re.compile(r'\s*[\u2013\u2014]\s*')
WEB_ADDRESS = re.compile(r'(https?://\S+|www\.\S+|\b[\w-]+\.(com|us|net|org)\b\S*)', re.I)

TYPE_BRIEFS = {
    SocialPost.TYPE_NEW: 'New this week: the best new stock. Lean on "new_in" and this week\'s photos.',
    SocialPost.TYPE_SPOTLIGHT: 'Category spotlight: one category and its best pieces. Lean on "spotlight_items".',
    SocialPost.TYPE_COMING: (
        'Coming soon / behind the scenes: trucks on the way, a load being unloaded, what is being processed. '
        'Lean on "coming_soon"; never promise a date or an item that is not listed.'
    ),
    SocialPost.TYPE_WEEKEND: (
        'Weekend pick + Thrift+: one standout item, and that Thrift+ members collect ThriftBucks. '
        'Say nothing else about Thrift+ terms: the approved Thrift+ line is added under every post.'
    ),
    SocialPost.TYPE_LIVE: 'Live from the floor: a quick, lively look at the floor today ("new_in", "push").',
    SocialPost.TYPE_SCHEDULED: (
        "Scheduled: goes out while the store is closed. The week's best (\"new_in\"), and when we open again."
    ),
}

SEASON_NOTES = {
    10: 'Halloween is October 31.',
    11: 'Thanksgiving and Black Friday are coming; holiday gift shopping starts.',
    12: 'Holiday gift season; Christmas is December 25.',
}

RULES = """Voice: plain, warm, short, local. Words a busy shopper reads in two seconds. No hype stacks, at most two \
emoji, no hashtags.

Rules:
- Use only the facts given. Never invent items, brands, prices, dates, events, deliveries, places or people. Read \
"not_in_the_facts" first: never write about anything it lists.
- A price may appear only as an item's tag price exactly as given ("$12"). Never a retail, compare-at or \
"% off retail" figure, and never a sale that is not listed under sales_and_events.
- Never write these words: card(s), guest(s), cash back, points, discount, fee(s), dues, store credit, gift card, \
bank, earn, member price, warranty, cover, free forever, thrift bucks (write ThriftBucks), price drop, save, savings.
- Thrift+: at most "Thrift+ members collect ThriftBucks". Never state amounts, rates or terms; the approved Thrift+ \
line, the address and the hours are added under every post by themselves, so do not repeat them.
- No web addresses or links. No long dashes.
- A hook is one line, at most {hook_max} characters: what it is and why now. Words are 2 to 4 short lines, under \
{body_max} characters."""

SYSTEM_IDEAS = """You suggest Facebook posts for Eco-Thrift, a big thrift and liquidation store in Omaha. Shoppers \
find new and like-new returned goods at low tag prices, and the floor changes every day.

You get today's post type and real store facts as JSON, including the photos staff took this week. Suggest 4 \
clearly different posts for today with the tool (never fewer than 3), best first. When the facts for today's post \
type are thin, base some ideas on what the facts do have (new stock, the floor, the season).

Be specific; a vague post ("new items coming soon") is a bad post. At least 2 ideas must name 2 or more real items \
from "new_in", "spotlight_items" or "photos_this_week" with their tag prices ("KitchenAid stand mixer, $89"), and \
pick the photos of those items. Each one:
- title: the idea in a few words, for the poster.
- hook, body, call_to_action (come_in, message_us for questions, or ask_hold for one standout item).
- photo_ids: 3 to 8 of this week's photos that fit the idea (their photo_id), best first; prefer photos not used yet.
- shots: photos still worth taking on the floor today (for an item from the facts give its sku; for a scene leave \
sku empty). Photos are real; never ask for AI-made products or money.

""" + RULES

SYSTEM_REWRITE = """You rewrite one part of a Facebook post for Eco-Thrift, a big thrift and liquidation store in \
Omaha. Give 3 clearly different options with the tool.

""" + RULES

IDEAS_TOOL = {
    'name': 'suggest_posts',
    'description': '3 to 5 different post ideas for today, best first.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'ideas': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'title': {'type': 'string', 'description': 'The idea in a few words.'},
                        'hook': {'type': 'string'},
                        'body': {'type': 'string'},
                        'call_to_action': {'type': 'string', 'enum': ['come_in', 'message_us', 'ask_hold']},
                        'photo_ids': {'type': 'array', 'items': {'type': 'integer'}},
                        'shots': {
                            'type': 'array',
                            'items': {
                                'type': 'object',
                                'properties': {'sku': {'type': 'string'}, 'shot': {'type': 'string'}},
                                'required': ['shot'],
                            },
                        },
                    },
                    'required': ['title', 'hook', 'body', 'call_to_action'],
                },
            },
        },
        'required': ['ideas'],
    },
}

REWRITE_TOOL = {
    'name': 'rewrite',
    'description': '3 different options for the part asked.',
    'input_schema': {
        'type': 'object',
        'properties': {'options': {'type': 'array', 'items': {'type': 'string'}}},
        'required': ['options'],
    },
}

REWRITES = {
    ('hook', 'new'): 'Write 3 new hooks for this post, each a different angle.',
    ('hook', 'shorter'): 'Write 3 shorter versions of the hook, keeping what it says.',
    ('body', 'new'): 'Write 3 new takes on the words (2 to 4 short lines each).',
    ('body', 'shorter'): 'Write 3 shorter versions of the words, keeping what they say.',
}


class IdeasError(Exception):
    def __init__(self, detail: str, code: str):
        super().__init__(detail)
        self.detail = detail
        self.code = code


# ── Facts ────────────────────────────────────────────────────────────────────


def _money(value) -> str:
    return f'${value:,.0f}' if value == int(value) else f'${value:,.2f}'


def _item_rows(qs, *, limit: int, per_category: int) -> list[dict]:
    """Best tags first, one per product title, at most `per_category` per category. Retail is never read."""
    rows = (
        qs.select_related('product').annotate(cat=cadence.item_category())
        .filter(price__gt=0).order_by('-price', '-checked_in_at')[:300]
    )
    out, titles, per = [], set(), Counter()
    for item in rows:
        title = ((item.product.title if item.product_id else '') or '').strip()
        key = title.lower()
        if not title or key in titles or per[item.cat] >= per_category:
            continue
        titles.add(key)
        per[item.cat] += 1
        brand = (item.product.brand or '').strip() if item.product_id else ''
        out.append({
            'sku': item.sku,
            'title': title[:120],
            'brand': '' if brand.lower() in ('', 'generic', 'unknown') else brand,
            'tag_price': _money(item.price),
            'condition': item.get_condition_display() if item.condition not in ('', 'unknown') else '',
            'category': item.cat or '',
            'location': item.location,
        })
        if len(out) >= limit:
            break
    return out


def _new_in(today: date, settings: dict) -> dict:
    from apps.inventory.models import Item

    days = settings['ai_new_in_days']
    since = today - timedelta(days=days)
    qs = Item.objects.filter(status='on_shelf', checked_in_at__date__gt=since, checked_in_at__date__lte=today)
    top = qs.annotate(cat=cadence.item_category()).values('cat').annotate(n=Count('id')).order_by('-n')[:6]
    return {
        'days': days,
        'items_checked_in': qs.count(),
        'top_categories': [{'category': row['cat'] or 'Other', 'items': row['n']} for row in top],
        'items': _item_rows(qs, limit=12, per_category=3),
    }


def _spotlight_items(category: str) -> list[dict]:
    from apps.inventory.models import Item

    if not category:
        return []
    qs = Item.objects.filter(status='on_shelf').annotate(cat_name=cadence.item_category()).filter(cat_name=category)
    return _item_rows(qs, limit=12, per_category=12)


def _week_photos(post: SocialPost) -> list[dict]:
    """The library's photos of the last 7 days (and the post's own), newest first, with their item or note."""
    since = timezone.now() - timedelta(days=PHOTO_DAYS)
    used = set(SocialPostPhoto.objects.exclude(post=post).values_list('photo_id', flat=True))
    rows = (
        SocialPhoto.objects.filter(is_archived=False, uploaded_at__gte=since)
        .select_related('item', 'item__product').order_by('-uploaded_at')[:PHOTOS_MAX]
    )
    out = []
    for photo in rows:
        item = photo.item if photo.item_id else None
        out.append({
            'photo_id': photo.pk,
            'item': (item.product.title[:120] if item and item.product_id else ''),
            'sku': item.sku if item else '',
            'tag_price': _money(item.price) if item and item.price else '',
            'category': photo.category,
            'note': photo.note[:120],
            'in_another_post': photo.pk in used,
        })
    return out


def _coming_soon(today: date) -> dict:
    from apps.buying.models import Outcome
    from apps.inventory.models import PurchaseOrder

    def load(po) -> dict:
        return {
            'what': (po.description or po.vendor_name_cache or 'A load').strip()[:160],
            'items': po.item_count or None,
            'pallets': po.pallet_count,
        }

    on_the_way = (
        PurchaseOrder.objects.filter(
            status__in=('ordered', 'paid', 'shipped'),
            expected_delivery__gte=today, expected_delivery__lte=today + timedelta(days=COMING_DAYS),
        ).order_by('expected_delivery')[:6]
    )
    processing = PurchaseOrder.objects.filter(status__in=('delivered', 'processing')).order_by('-delivered_date')[:4]
    since = timezone.now() - timedelta(days=WON_DAYS)
    won = Outcome.objects.filter(win=True, created_at__gte=since).select_related('auction').order_by('-created_at')[:5]
    return {
        'on_the_way': [{**load(po), 'expected': po.expected_delivery.isoformat()} for po in on_the_way],
        'being_processed': [load(po) for po in processing],
        'won_loads': [
            {'what': (o.auction.title or 'A B-Stock load')[:160], 'category': o.auction.category[:80],
             'units': o.auction.lot_size}
            for o in won
        ],
    }


def _sales_and_events(today: date, settings: dict) -> dict:
    from apps.pos.services.sale_mode import get_sale_mode, line_sale
    from apps.webstore.services.hours import public_hours_payload

    out: dict = {}
    try:
        mode = get_sale_mode(today=today)
        if mode['active']:
            out['store_sale'] = f"{mode['name']} sale: {mode['percent']}% off"
        line = line_sale()
        if line['on']:
            out['line_sale'] = f"{line['name']} sale: {line['percent']}% off marked items"
    except Exception:  # noqa: BLE001 - a missing sale fact must not stop the ideas
        logger.exception('Post ideas: sale facts failed')
    try:
        hours = public_hours_payload(today=today)
        out['hours_changes'] = [row['sentence'] for row in hours['overrides']]
    except Exception:  # noqa: BLE001
        logger.exception('Post ideas: hours facts failed')
    out['in_season'] = sorted(cadence.in_season(today, settings=settings))
    if SEASON_NOTES.get(today.month):
        out['season_note'] = SEASON_NOTES[today.month]
    return out


def _push() -> list[dict]:
    from apps.thriftplus.services.overstock import rows

    try:
        lots = sorted(rows(), key=lambda r: -float(r['tag_total']))[:5]
    except Exception:  # noqa: BLE001
        logger.exception('Post ideas: overstock facts failed')
        return []
    return [{'title': r['title'][:120], 'category': r['category'], 'units_on_floor': r['units']} for r in lots]


def _post_facts(post: SocialPost) -> dict:
    day = post.slot_date
    return {
        'date': day.strftime('%A, %B ') + str(day.day),
        'type': post.get_post_type_display(),
        'brief': TYPE_BRIEFS.get(post.post_type, ''),
        'category': post.category,
    }


def gather_facts(post: SocialPost, *, today: date | None = None, settings: dict | None = None) -> dict:
    settings = settings or marketing_settings()
    today = today or timezone.localdate()
    counts = cadence.floor_counts()
    facts = {
        'post': _post_facts(post),
        'photos_this_week': _week_photos(post),
        'new_in': _new_in(min(post.slot_date, today), settings),
        'coming_soon': _coming_soon(today),
        'sales_and_events': _sales_and_events(post.slot_date, settings),
        'push': _push(),
        'floor': [{'category': name, 'items': n} for name, n in sorted(counts.items(), key=lambda kv: -kv[1])[:6]],
    }
    if post.post_type == SocialPost.TYPE_SPOTLIGHT:
        facts['spotlight_items'] = _spotlight_items(post.category)
    facts['not_in_the_facts'] = not_in_the_facts(facts)
    return facts


def not_in_the_facts(facts: dict) -> list[str]:
    """What the store has nothing on today, said plainly so the AI does not fill the gap (a real run said "trucks are
    on the way" with no loads listed)."""
    out = []
    coming = facts['coming_soon']
    if not coming['on_the_way'] and not coming['won_loads']:
        out.append('No trucks or loads are on the way: never say a truck, load or delivery is coming.')
    if not coming['being_processed']:
        out.append('No load is being processed right now.')
    if not facts['new_in']['items']:
        out.append('Nothing new was checked in lately: never say new stock just arrived.')
    if not facts['photos_this_week']:
        out.append('No photos were taken this week: every idea needs shots instead of photo_ids.')
    sales = facts['sales_and_events']
    if 'store_sale' not in sales and 'line_sale' not in sales:
        out.append('No sale is on: never mention a sale or a percent off.')
    return out


# ── Cleaning the AI's words ──────────────────────────────────────────────────


def never_say(text: str) -> list[str]:
    found = []
    for pattern in NEVER_SAY:
        match = re.search(pattern, text or '', re.I)
        if match and match.group(0).lower() not in found:
            found.append(match.group(0).lower())
    return found


def clean(text) -> str:
    text = DASHES.sub(', ', str(text or ''))
    text = WEB_ADDRESS.sub('', text)
    text = re.sub(r'[ \t]+', ' ', text)
    return '\n'.join(line.strip() for line in text.strip().splitlines()).strip()


def cut(text: str, limit: int) -> str:
    text = text.strip().strip('"').strip()
    if len(text) <= limit:
        return text
    short = text[:limit + 1].rsplit(' ', 1)[0].rstrip(' ,;:.')
    return short or text[:limit]


def _shots(raw, known: dict) -> list[dict]:
    out = []
    for row in raw if isinstance(raw, list) else []:
        if not isinstance(row, dict):
            continue
        shot = clean(row.get('shot') or '')[:200]
        item = known.get(str(row.get('sku') or '').strip().lower())
        if not shot and not item:
            continue
        out.append({
            'shot': shot,
            'sku': item['sku'] if item else '',
            'title': item['title'] if item else '',
            'tag_price': item['tag_price'] if item else '',
            'location': item['location'] if item else '',
        })
        if len(out) >= SHOTS_MAX:
            break
    return out


def clean_ideas(raw, facts: dict, settings: dict) -> list[dict]:
    """The AI's ideas, checked: words cleaned, photo ids and skus only from the facts, at most 5, empty ones dropped."""
    known = {}
    for item in [*facts['new_in']['items'], *facts.get('spotlight_items', [])]:
        known.setdefault(item['sku'].lower(), item)
    photo_ids = {p['photo_id'] for p in facts['photos_this_week']}
    out = []
    for row in raw if isinstance(raw, list) else []:
        if not isinstance(row, dict):
            continue
        hook = cut(clean(row.get('hook')), settings['hook_max_chars'])
        body = clean(row.get('body'))[:BODY_MAX]
        if not hook:
            continue
        cta = row.get('call_to_action')
        ids = []
        for pk in row.get('photo_ids') or []:
            try:
                pk = int(pk)
            except (TypeError, ValueError):
                continue
            if pk in photo_ids and pk not in ids:
                ids.append(pk)
        out.append({
            'title': clean(row.get('title'))[:80] or hook[:60],
            'hook': hook,
            'body': body,
            'call_to_action': cta if cta in dict(SocialPost.CTA_CHOICES) else SocialPost.CTA_COME_IN,
            'photo_ids': ids[:8],
            'shots': _shots(row.get('shots'), known),
            'flags': never_say(f'{hook}\n{body}'),
        })
        if len(out) >= IDEAS_MAX:
            break
    return out


# ── The calls ────────────────────────────────────────────────────────────────


def _ask_ideas(facts: dict, settings: dict, *, post_id: int, note: str = '') -> tuple[dict, str]:
    from apps.core.services.llm_router import llm_chat_tool_input

    user = 'Store facts:\n' + json.dumps(facts, indent=1, default=str)
    if note:
        user += '\n\n' + note
    return llm_chat_tool_input(
        purpose=PURPOSE, system=SYSTEM_IDEAS.format(hook_max=settings['hook_max_chars'], body_max=BODY_MAX),
        user=user, tool_name=IDEAS_TOOL['name'], tools=[IDEAS_TOOL],
        temperature=0.8, max_tokens=3000, timeout=120, log_source=SOURCE_IDEAS, log_detail=f'post {post_id}',
    )


def write_ideas(post: SocialPost, *, settings: dict | None = None) -> tuple[list[dict], str]:
    """Ask for ideas, retry once when one holds a never-say word, and clean them. Returns (ideas, model)."""
    settings = settings or marketing_settings()
    facts = gather_facts(post, settings=settings)
    answer, model = _ask_ideas(facts, settings, post_id=post.pk)
    ideas = clean_ideas(answer.get('ideas'), facts, settings)
    words = sorted({w for idea in ideas for w in idea['flags']})
    if words:
        answer, model = _ask_ideas(facts, settings, post_id=post.pk, note=(
            f'Your last ideas used never-say words ({", ".join(words)}). Write them again without them.'
        ))
        ideas = clean_ideas(answer.get('ideas'), facts, settings) or ideas
    if not ideas:
        raise IdeasError('The AI sent no usable ideas. Try again.', 'EMPTY')
    return ideas, model


def _now_iso() -> str:
    return timezone.now().isoformat()


def is_drafting(post: SocialPost) -> bool:
    brief = post.ai_brief or {}
    if brief.get('state') != STATE_DRAFTING:
        return False
    started = parse_datetime(str(brief.get('started_at') or ''))
    return started is not None and timezone.now() - started < STALE_AFTER


def run_ideas(post_id: int) -> SocialPost | None:
    """Write the ideas and keep them on the post (`ai_brief`). The post's own words and photos are not touched."""
    post = SocialPost.objects.filter(pk=post_id).first()
    if post is None or post.status == SocialPost.STATUS_POSTED:
        return post
    try:
        ideas, model = write_ideas(post)
        error = ''
    except Exception as exc:  # noqa: BLE001 - the error is shown to the poster
        logger.exception('Post ideas failed for post %s', post_id)
        ideas, model = None, ''
        error = exc.detail if isinstance(exc, IdeasError) else 'The AI could not write ideas. Try again.'
        if not isinstance(exc, IdeasError):
            from apps.core.services.ai_usage_log import log_ai_usage

            log_ai_usage(SOURCE_IDEAS, '', purpose=PURPOSE, detail=f'post {post_id}', success=False, error=str(exc)[:500])
    with transaction.atomic():
        post = SocialPost.objects.select_for_update().get(pk=post_id)
        brief = {**(post.ai_brief or {}), 'finished_at': _now_iso()}
        if ideas is None:
            brief.update(state=STATE_FAILED, error=error)
        else:
            brief.update(state=STATE_DONE, error='', ideas=ideas, model=model)
        post.ai_brief = brief
        post.save(update_fields=['ai_brief', 'updated_at'])
    return post


def _start(post: SocialPost, *, by: str) -> None:
    post.ai_brief = {**(post.ai_brief or {}), 'state': STATE_DRAFTING, 'started_at': _now_iso(), 'by': by, 'error': ''}
    post.save(update_fields=['ai_brief', 'updated_at'])


def request_ideas(post: SocialPost, *, user) -> SocialPost:
    """Get ideas: mark the post drafting and write them in a thread; the page polls the post."""
    with transaction.atomic():
        post = SocialPost.objects.select_for_update().get(pk=post.pk)
        if post.status == SocialPost.STATUS_POSTED:
            raise IdeasError('This post is posted; it cannot change.', 'POSTED')
        if is_drafting(post):
            raise IdeasError('Ideas are already on their way.', 'DRAFTING')
        _start(post, by=(getattr(user, 'full_name', '') or getattr(user, 'email', '') or 'Staff'))
    _spawn(post.pk)
    return post


def _spawn(post_id: int) -> None:
    """Run in a thread so the request returns at once. (Tests replace this to run inline.)"""
    threading.Thread(target=_thread, args=(post_id,), name=f'post-ideas-{post_id}', daemon=True).start()


def _thread(post_id: int) -> None:
    close_old_connections()
    try:
        run_ideas(post_id)
    finally:
        connections.close_all()


def morning_ideas(day: date) -> str:
    """The morning job: the day's ideas, waiting when Retail opens the post. Returns one line; never raises."""
    try:
        if not marketing_settings()['ai_morning_ideas']:
            return 'Post ideas: off (marketing.ai_morning_ideas).'
        cadence.ensure_week(day, today=day)
        post = SocialPost.objects.filter(slot_date=day).first()
        if post is None:
            return f'Post ideas: no post on {day.isoformat()}.'
        if post.status != SocialPost.STATUS_DRAFT or (post.ai_brief or {}).get('ideas'):
            return f'Post ideas: the {day.isoformat()} post already has ideas or is done.'
        _start(post, by='Morning ideas')
        post = run_ideas(post.pk)
        return f"Post ideas: {day.isoformat()} {(post.ai_brief or {}).get('state')}."
    except Exception:  # noqa: BLE001 - the routines job must finish
        logger.exception('Post ideas: morning run failed for %s', day)
        return f'Post ideas: the {day.isoformat()} run failed (see the log).'


def apply_idea(post: SocialPost, index: int) -> SocialPost:
    """Use this idea: its hook, words and call to action replace the post's; its photos are added after the post's."""
    from apps.marketing.services.posts import set_photos, settle_status

    if post.status == SocialPost.STATUS_POSTED:
        raise IdeasError('This post is posted; it cannot change.', 'POSTED')
    ideas = (post.ai_brief or {}).get('ideas') or []
    if not 0 <= index < len(ideas):
        raise IdeasError('That idea is gone. Get ideas again.', 'NO_IDEA')
    idea = ideas[index]
    post.hook, post.body, post.call_to_action = idea['hook'], idea['body'], idea['call_to_action']
    post.source = SocialPost.SOURCE_AI
    post.save(update_fields=['hook', 'body', 'call_to_action', 'source', 'updated_at'])
    have = list(post.post_photos.order_by('position').values_list('photo_id', flat=True))
    live = set(SocialPhoto.objects.filter(pk__in=idea.get('photo_ids') or [], is_archived=False).values_list('pk', flat=True))
    extra = [pk for pk in idea.get('photo_ids') or [] if pk in live and pk not in have]
    if extra:
        set_photos(post, have + extra)
    settle_status(post)
    return post


def rewrite(post: SocialPost, *, part: str, mode: str, current: str = '') -> list[str]:
    """A fast rewrite: 3 options for the hook or the words. Nothing is saved; the poster picks one."""
    from apps.core.services.llm_router import llm_chat_tool_input

    ask = REWRITES.get((part, mode))
    if ask is None:
        raise IdeasError('Pick what to rewrite.', 'BAD_CHOICE')
    settings = marketing_settings()
    context = {
        'post': _post_facts(post),
        'hook': (current if part == 'hook' else post.hook) or post.hook,
        'words': (current if part == 'body' else post.body) or post.body,
    }
    try:
        answer, _model = llm_chat_tool_input(
            purpose=PURPOSE, system=SYSTEM_REWRITE.format(hook_max=settings['hook_max_chars'], body_max=BODY_MAX),
            user=f"{ask}\n\nThe post:\n{json.dumps(context, indent=1)}", tool_name=REWRITE_TOOL['name'],
            tools=[REWRITE_TOOL], temperature=0.9, max_tokens=2000, timeout=25,
            log_source=SOURCE_REWRITE, log_detail=f'post {post.pk} {part} {mode}',
        )
    except Exception as exc:  # noqa: BLE001 - shown to the poster
        logger.exception('Rewrite failed for post %s', post.pk)
        from apps.core.services.ai_usage_log import log_ai_usage

        log_ai_usage(SOURCE_REWRITE, '', purpose=PURPOSE, detail=f'post {post.pk}', success=False, error=str(exc)[:500])
        raise IdeasError('The AI did not answer. Try again.', 'AI_FAILED') from exc
    out = []
    for text in answer.get('options') or []:
        text = clean(text)
        text = cut(text, settings['hook_max_chars']) if part == 'hook' else text[:BODY_MAX]
        if text and not never_say(text) and text not in out:
            out.append(text)
    if not out:
        raise IdeasError('No good options came back. Try again.', 'EMPTY')
    return out[:3]


def ideas_payload(post: SocialPost) -> dict | None:
    """What the Studio shows of the ideas (null before the first ask)."""
    brief = post.ai_brief or {}
    state = brief.get('state')
    if not state:
        return None
    if state == STATE_DRAFTING and not is_drafting(post):
        state, error = STATE_FAILED, 'The AI run stopped (the server restarted). Try again.'
    else:
        error = brief.get('error') or ''
    return {
        'state': state,
        'error': error,
        'ideas': brief.get('ideas') or [],
        'by': brief.get('by') or '',
        'finished_at': brief.get('finished_at'),
    }
