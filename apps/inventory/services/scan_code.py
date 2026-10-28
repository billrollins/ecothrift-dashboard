"""The one place a scanned tag code turns into a SKU (2026-10-28).

The Thrift+ Perks price tag's QR is a link, ``HTTPS://ECOTHRIFT.US/I/<SKU>`` (all capitals, so the QR stays small),
so a phone camera opens the item. Every lookup that takes a scanned code strips it back to the SKU here; older tags
(a plain SKU) come through as they are. Mirrors ``frontend/src/utils/scanCode.ts``.
"""
from __future__ import annotations

import re

# Our tag link in any case, with or without "https://" (a keyboard scanner may type "https;//") or "www.".
TAG_LINK_RE = re.compile(r'^(?:[a-z]+[:;]//)?(?:www\.)?ecothrift\.us/i/([A-Za-z0-9-]{3,20})/?(?:[?#].*)?$', re.I)

TAG_LINK_BASE = 'HTTPS://ECOTHRIFT.US/I/'


def tag_link(sku: str) -> str:
    """What the Thrift+ Perks tag's QR holds for a SKU."""
    return f'{TAG_LINK_BASE}{(sku or "").strip().upper()}'


def sku_from_scan(raw) -> str:
    """The SKU in a scanned tag link (upper case); anything else comes back trimmed and otherwise as it was."""
    text = str(raw or '').strip()
    match = TAG_LINK_RE.match(text)
    return match.group(1).upper() if match else text
