"""Rendering helpers for the fixed mailbox template context."""
from __future__ import annotations

from django.template import Context, Template

from apps.core.models import AppSetting

from .models import EmailTemplate
from .sanitize import clean_email_html

TEMPLATE_CONTEXT_KEYS = (
    'customer_name',
    'listing_title',
    'pickup_by',
    'store_address',
    'hold_link',
    'staff_name',
)

DEFAULT_SIGNATURE = (
    '<p>— {{staff_name}}<br>'
    'Eco-Thrift<br>'
    '8425 W Center Rd, Omaha, NE 68124</p>'
)


def fixed_context(values: dict | None = None) -> dict[str, str]:
    values = values or {}
    return {key: str(values.get(key) or '') for key in TEMPLATE_CONTEXT_KEYS}


def render_email_template(key: str, values: dict | None = None) -> tuple[str, str]:
    template = EmailTemplate.objects.get(key=key, active=True)
    context = Context(fixed_context(values), autoescape=True)
    subject = Template(template.subject).render(context).strip()
    html_body = clean_email_html(Template(template.html_body).render(context))
    return subject, html_body


def append_signature(html_body: str, *, staff_name: str) -> str:
    try:
        raw = AppSetting.objects.get(key='mailbox.email_signature').value
    except AppSetting.DoesNotExist:
        raw = DEFAULT_SIGNATURE
    if isinstance(raw, dict):
        raw = raw.get('html') or raw.get('value') or DEFAULT_SIGNATURE
    signature = Template(str(raw or DEFAULT_SIGNATURE)).render(
        Context({'staff_name': staff_name or 'Eco-Thrift'}, autoescape=True),
    )
    return clean_email_html(f'{html_body or ""}{signature}')
