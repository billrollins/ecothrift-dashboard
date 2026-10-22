"""More channels (Lane F Phase 6, owner call F4): the same post goes out on each channel in the shape it likes.

Channels on: `marketing.channels` (Facebook always; default Facebook, Instagram, Google Business Profile, the owner's
first two). Each channel has its own words, photo sizes and posted link:

| Channel | Words | Photos |
|---------|-------|--------|
| Facebook | hook, words, call to action, where and when, the Thrift+ line | the post's size (4:5 or 1:1) |
| Instagram | the same, then a few local hashtags | the post's size; 9:16 for a Story |
| Google Business Profile | the same, cut to 1500 characters (Google's limit) | 4:3 (Google crops posts near it) |
| Nextdoor | the same, plain (neighbors, no hashtags) | the post's size |
| TikTok | the same, then hashtags; under 2200 characters | 9:16 (a photo post; video is made in the TikTok app) |

The Thrift+ line goes on every channel: it carries the terms any ThriftBucks words need (rulebook V10). Posting is
copy and paste (F5); posting through the Meta API (Facebook and Instagram) waits for the owner's Meta app.

Facebook stays the post's own link and status (marking it Posted closes the day's Today's post routine); every other
channel is a `SocialPostChannel` row. A channel can be marked posted once the post passes the Always-include check.
"""
from __future__ import annotations

from urllib.parse import urlparse

from django.utils import timezone

from apps.core.models import AppSetting
from apps.marketing.models import (
    CHANNEL_CHOICES,
    CHANNEL_FACEBOOK,
    CHANNEL_GOOGLE,
    CHANNEL_INSTAGRAM,
    CHANNEL_NEXTDOOR,
    CHANNEL_TIKTOK,
    SocialPost,
    SocialPostChannel,
)
from apps.marketing.services.posts import CTA_LINES, SPACER, PostError, brand_payload, mark_posted, missing_lines

SETTING_KEY = 'marketing.channels'
DEFAULT_CHANNELS = [CHANNEL_FACEBOOK, CHANNEL_INSTAGRAM, CHANNEL_GOOGLE]
LABELS = dict(CHANNEL_CHOICES)
POST_SIZE = 'post'  # the post's own size (4:5 or 1:1)

CHANNELS = {
    CHANNEL_FACEBOOK: {
        'sizes': [POST_SIZE], 'max_chars': 63206, 'hashtags': '', 'spacer': True,
        'hosts': ('facebook.com', 'fb.com', 'fb.me', 'fb.watch'),
        'how': 'New post: add the photos, paste the text.',
    },
    CHANNEL_INSTAGRAM: {
        'sizes': [POST_SIZE, '9:16'], 'max_chars': 2200, 'spacer': True,
        'hashtags': '#Omaha #OmahaThrift #ThriftFinds #ThriftStore #EcoThrift',
        'hosts': ('instagram.com', 'instagr.am'),
        'how': 'New post: add the photos as one swipe set (best first), paste the text. For a Story, use the 9:16 photos.',
    },
    CHANNEL_GOOGLE: {
        'sizes': ['4:3'], 'max_chars': 1500, 'hashtags': '', 'spacer': False,
        'hosts': ('google.com', 'g.page', 'goo.gl', 'business.site'),
        'how': 'Google Business Profile: Add update, add one photo, paste the text, button: Call or Get directions.',
    },
    CHANNEL_NEXTDOOR: {
        'sizes': [POST_SIZE], 'max_chars': 8000, 'hashtags': '', 'spacer': False,
        'hosts': ('nextdoor.com',),
        'how': 'Business page: new post, add the photos, paste the text.',
    },
    CHANNEL_TIKTOK: {
        'sizes': ['9:16'], 'max_chars': 2200, 'spacer': False,
        'hashtags': '#thrifttok #thriftfinds #omaha #liquidation #ecothrift',
        'hosts': ('tiktok.com',),
        'how': 'New post: Photo, add the 9:16 photos, add a sound, paste the text.',
    },
}


def enabled_channels() -> list[str]:
    """The channels the store posts on (Facebook always), in the standard order."""
    value = AppSetting.objects.filter(key=SETTING_KEY).values_list('value', flat=True).first()
    wanted = set(value) if isinstance(value, list) else set(DEFAULT_CHANNELS)
    wanted.add(CHANNEL_FACEBOOK)
    return [key for key, _ in CHANNEL_CHOICES if key in wanted]


def channel_text(post: SocialPost, channel: str, *, brand: dict | None = None) -> str:
    """The caption for one channel: the same blocks, the channel's spacing and hashtags, cut to its limit."""
    spec = CHANNELS[channel]
    brand = brand or brand_payload()
    blocks = [(post.hook or '').strip(), (post.body or '').strip(), CTA_LINES.get(post.call_to_action, '')]
    where = '\n'.join(part for part in (f'\U0001F4CD {brand["address"]}' if brand['address'] else '', brand['hours']) if part)
    blocks += [where, brand['thrift_plus_line'], spec['hashtags']]
    # Facebook and Instagram drop empty lines; a blank Braille character keeps the spacing (creative-method.md).
    joiner = f'\n{SPACER}\n' if spec['spacer'] else '\n\n'
    text = joiner.join(block for block in blocks if block)
    limit = spec['max_chars']
    if len(text) > limit:
        text = text[:limit - 1].rsplit(' ', 1)[0].rstrip() + '…'
    return text


def clean_url(channel: str, raw) -> str:
    url = str(raw or '').strip()
    parsed = urlparse(url)
    host = (parsed.hostname or '').lower()
    hosts = CHANNELS[channel]['hosts']
    if parsed.scheme not in ('http', 'https') or not any(host == h or host.endswith('.' + h) for h in hosts):
        raise PostError(f'Paste the link to the post on {LABELS[channel]}.', 'BAD_URL')
    return url[:500]


def mark_channel_posted(post: SocialPost, channel: str, *, url, user) -> None:
    """Facebook: the post's own Posted (closes the routine). Any other channel: its link, once the post passes."""
    if channel not in CHANNELS:
        raise PostError('Pick a channel.', 'BAD_CHANNEL')
    if channel == CHANNEL_FACEBOOK:
        mark_posted(post, url=url, user=user)
        return
    missing = missing_lines(post)
    if missing:
        raise PostError('Not ready yet: ' + ' '.join(missing), 'NOT_READY', missing)
    SocialPostChannel.objects.update_or_create(
        post=post, channel=channel,
        defaults={'posted_url': clean_url(channel, url), 'posted_at': timezone.now(), 'posted_by': user},
    )


def posted_on(post: SocialPost) -> dict[str, dict]:
    """Every channel the post went out on: link, when, who (Facebook from the post itself)."""
    out = {}
    if post.status == SocialPost.STATUS_POSTED and post.posted_at:
        out[CHANNEL_FACEBOOK] = {
            'posted_url': post.posted_url, 'posted_at': post.posted_at,
            'posted_by_name': post.posted_by.full_name if post.posted_by_id and post.posted_by else '',
        }
    for row in post.channel_posts.select_related('posted_by'):
        out[row.channel] = {
            'posted_url': row.posted_url, 'posted_at': row.posted_at,
            'posted_by_name': row.posted_by.full_name if row.posted_by_id and row.posted_by else '',
        }
    return out


def channels_payload(post: SocialPost, *, brand: dict | None = None) -> list[dict]:
    """Post it's channels: those on, plus any the post already went out on."""
    brand = brand or brand_payload()
    done = posted_on(post)
    keys = [key for key, _ in CHANNEL_CHOICES if key in set(enabled_channels()) | set(done)]
    out = []
    for key in keys:
        spec = CHANNELS[key]
        text = channel_text(post, key, brand=brand)
        posted = done.get(key)
        out.append({
            'key': key,
            'label': LABELS[key],
            'sizes': [post.size if s == POST_SIZE else s for s in spec['sizes']],
            'text': text,
            'max_chars': spec['max_chars'],
            'how': spec['how'],
            'posted_url': posted['posted_url'] if posted else '',
            'posted_at': posted['posted_at'].isoformat() if posted else None,
            'posted_by_name': posted['posted_by_name'] if posted else '',
        })
    return out
