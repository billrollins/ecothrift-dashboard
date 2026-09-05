"""Live announcements + public token resolution."""
from __future__ import annotations

from datetime import date

from django.db.models import Q
from django.utils import timezone

from apps.webstore.models import Announcement
from apps.webstore.services.hours import (
    format_hours_label,
    get_hours_config,
    holiday_sentence,
    public_hours_payload,
)


STORE_NAME = 'Eco-Thrift - Canfield'


def live_announcements(now=None):
    now = now or timezone.now()
    qs = (
        Announcement.objects.filter(is_active=True, is_template=False)
        .filter(Q(starts_at__isnull=True) | Q(starts_at__lte=now))
        .filter(Q(ends_at__isnull=True) | Q(ends_at__gte=now))
        .prefetch_related('images')
        .select_related('linked_hours_override')
        .order_by('-priority', '-updated_at')
    )
    return [row for row in qs if row.is_live(now)]


def token_context(announcement=None, today: date | None = None) -> dict:
    hours = public_hours_payload(today=today)
    holiday = ''
    override = getattr(announcement, 'linked_hours_override', None) if announcement else None
    if override is not None and override.is_active:
        holiday = holiday_sentence(override)
    elif hours.get('overrides'):
        holiday = hours['overrides'][0].get('sentence') or ''
    sale_end = ''
    try:
        from apps.pos.services.sale_mode import get_sale_mode

        mode = get_sale_mode(today=today)
        end = mode.get('end')
        if end:
            sale_end = end.strftime('%a, %b ') + str(end.day)
    except Exception:
        sale_end = ''
    return {
        'holiday_hours': holiday,
        'regular_hours': hours.get('regular_label') or format_hours_label(get_hours_config()),
        'sale_end': sale_end,
        'store_name': STORE_NAME,
    }


def resolve_tokens(text: str, ctx: dict | None = None) -> str:
    if not text:
        return ''
    ctx = ctx or token_context()
    out = text
    for key, value in ctx.items():
        out = out.replace('{{' + key + '}}', str(value or ''))
    return out


def public_announcement_payload(announcement, ctx: dict | None = None) -> dict:
    ctx = ctx or token_context(announcement)
    images = [
        {
            'id': img.id,
            'alt': img.alt or '',
            'url': img.url,
            'sort_order': img.sort_order,
        }
        for img in announcement.images.all()
    ]
    return {
        'id': announcement.id,
        'title': resolve_tokens(announcement.title, ctx),
        'slug': announcement.slug,
        'kind': announcement.kind,
        'style': announcement.style,
        'body_html': resolve_tokens(announcement.body_html, ctx),
        'cta_label': announcement.cta_label or '',
        'cta_url': announcement.cta_url or '',
        'placements': list(announcement.placements or []),
        'priority': announcement.priority,
        'dismissible': bool(announcement.dismissible),
        'updated_at': announcement.updated_at.isoformat() if announcement.updated_at else None,
        'images': images,
    }
