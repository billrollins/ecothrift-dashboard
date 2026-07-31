"""Email-safe HTML sanitization and plain-text conversion."""
from __future__ import annotations

import html
import re

import bleach

ALLOWED_TAGS = [
    'p', 'h1', 'h2', 'h3', 'strong', 'em', 'u', 'a', 'span',
    'ul', 'ol', 'li', 'blockquote', 'hr', 'br', 'div',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
]
ALLOWED_ATTRIBUTES = {
    'a': ['href', 'title', 'target', 'rel'],
    'th': ['colspan', 'rowspan'],
    'td': ['colspan', 'rowspan'],
}
ALLOWED_PROTOCOLS = ['http', 'https', 'mailto']
_WS_RE = re.compile(r'[ \t\f\v]+')
_BLANKLINES_RE = re.compile(r'\n{3,}')


def clean_email_html(raw: str) -> str:
    if not raw:
        return ''
    return bleach.clean(
        raw,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )


def email_html_to_text(raw: str) -> str:
    if not raw:
        return ''
    text = re.sub(r'(?i)</(p|h1|h2|h3|li|blockquote|tr|div)>', '\n', raw)
    text = re.sub(r'(?i)<br\s*/?>', '\n', text)
    text = bleach.clean(text, tags=[], attributes={}, strip=True)
    text = html.unescape(text)
    text = _WS_RE.sub(' ', text)
    return _BLANKLINES_RE.sub('\n\n', text).strip()
