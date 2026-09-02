"""Shared HTML sanitization for TipTap bodies (blog)."""
from __future__ import annotations

import html
import re

import bleach

ALLOWED_TAGS = [
    'p', 'h2', 'h3', 'strong', 'em', 'u', 'a', 'span', 'mark',
    'ul', 'ol', 'li', 'blockquote', 'hr', 'br',
    'figure', 'figcaption', 'img',
    'code', 'pre',
    'section', 'div',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
]


def _table_cell_attrs(_tag: str, name: str, value: str) -> bool:
    """Allow only numeric colspan/rowspan on cells; drop Tiptap's resize style/colwidth."""
    return name in ('colspan', 'rowspan') and value.isdigit()


ALLOWED_ATTRIBUTES = {
    'a': ['href', 'title', 'target', 'rel', 'class'],
    'img': ['src', 'alt', 'class'],
    'span': ['class'],
    'mark': ['class'],
    'p': ['class'],
    'blockquote': ['class'],
    'section': ['class'],
    'div': ['class'],
    'code': ['class'],
    'pre': ['class'],
    'figure': ['class'],
    'th': _table_cell_attrs,
    'td': _table_cell_attrs,
}

ALLOWED_PROTOCOLS = ['http', 'https', 'mailto']

_ALLOWED_BT_CLASSES = frozenset({
    'bt-size-small', 'bt-size-large', 'bt-size-feature',
    'bt-color-ink', 'bt-color-muted', 'bt-color-clay', 'bt-color-green', 'bt-color-rust',
    'bt-highlight-soft', 'bt-highlight-clay', 'bt-highlight-wash',
    'bt-dropcap', 'bt-pullquote',
    'bt-columns', 'bt-columns-2', 'bt-column',
    'bt-callout', 'bt-callout-info', 'bt-callout-tip', 'bt-callout-warning',
    'bt-linkcard', 'bt-linkcard-media', 'bt-linkcard-media--empty',
    'bt-linkcard-body', 'bt-linkcard-title', 'bt-linkcard-desc', 'bt-linkcard-host',
    'bt-code', 'bt-codeblock',
    'bt-img-small', 'bt-img-medium', 'bt-img-full',
    'bt-img-left', 'bt-img-center', 'bt-img-right',
})

_WS_RE = re.compile(r'[ \t\f\v]+')
_BLANKLINES_RE = re.compile(r'\n{3,}')
_CLASS_ATTR_RE = re.compile(r'\sclass="([^"]*)"', re.IGNORECASE)


def _filter_class_attr(_tag: str, _name: str, value: str) -> str | None:
    if not value:
        return None
    kept = [t for t in value.split() if t.strip().startswith('bt-') and t.strip() in _ALLOWED_BT_CLASSES]
    return ' '.join(kept) if kept else None


def _strip_unapproved_classes(html_out: str) -> str:
    def _repl(match: re.Match[str]) -> str:
        filtered = _filter_class_attr('', 'class', match.group(1))
        return f' class="{filtered}"' if filtered else ''
    return _CLASS_ATTR_RE.sub(_repl, html_out)


def clean_html(raw: str) -> str:
    if not raw:
        return ''
    cleaned = bleach.clean(
        raw,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )
    return _strip_unapproved_classes(cleaned)


# Blog-era name - same function.
clean_blog_html = clean_html


def html_to_text(raw: str) -> str:
    if not raw:
        return ''
    text = re.sub(r'(?i)</(p|h2|h3|li|blockquote|figcaption|pre)>', '\n', raw)
    text = re.sub(r'(?i)<br\s*/?>', '\n', text)
    text = bleach.clean(text, tags=[], attributes={}, strip=True)
    text = html.unescape(text)
    text = _WS_RE.sub(' ', text)
    text = _BLANKLINES_RE.sub('\n\n', text)
    return text.strip()


def word_count(text: str) -> int:
    return len(text.split()) if text else 0


def reading_minutes(text: str) -> int:
    words = word_count(text)
    return max(1, round(words / 225)) if words else 0
