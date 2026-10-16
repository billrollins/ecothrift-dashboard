"""One name rule for every member and login (owner 2026-10-16).

"Customer should be removed from all. If only 1 name is provided it can say Member for last name. Otherwise it can
split as best it can the full name into a first/last."

- Spaces are trimmed and runs of spaces collapse to one.
- A last name of "Customer" (the old website default) counts as no last name.
- No last name: a first name with several words is split, the first word is the first name and the rest the last
  name ("gabriela vallejo" -> Gabriela / Vallejo); a single word gets ``PLACEHOLDER_LAST`` ("Nikki" -> Nikki Member).
- A name typed all lower case or ALL CAPS is capitalized word by word, keeping Mc, O' and hyphens ("JANE DOUGH
  MCCALLAN" -> Jane / Dough McCallan). A name typed in mixed case is kept as typed ("DeShawn", "van der Berg").
"""
from __future__ import annotations

import re

PLACEHOLDER_LAST = 'Member'
OLD_DEFAULTS = frozenset({'customer'})
MAX_LEN = 80


def _squash(text: str | None) -> str:
    return re.sub(r'\s+', ' ', (text or '').strip())


def _cap_word(word: str) -> str:
    """One word, capitalized: hyphen and apostrophe parts each capitalized; Mc keeps its capital ("McCallan")."""
    parts = re.split(r"([-'’])", word.lower())
    out = []
    for part in parts:
        if part in ('-', "'", '’') or not part:
            out.append(part)
            continue
        cap = part[:1].upper() + part[1:]
        if len(cap) > 2 and cap.startswith('Mc'):
            cap = 'Mc' + cap[2:3].upper() + cap[3:]
        out.append(cap)
    return ''.join(out)


def nice_case(text: str) -> str:
    """Capitalize a name typed all lower case or ALL CAPS; leave mixed case as typed."""
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return text
    if text == text.lower():
        return ' '.join(_cap_word(w) for w in text.split(' '))
    if text == text.upper():  # initials stay ("AJ", "CJ"); longer words are capitalized
        return ' '.join(w if len(w) <= 2 else _cap_word(w) for w in text.split(' '))
    return text


def clean_name(first: str | None, last: str | None = '', *, placeholder: str = PLACEHOLDER_LAST) -> tuple[str, str]:
    """(first, last) by the one rule. An empty first name stays empty (the caller decides whether that is allowed)."""
    first, last = _squash(first), _squash(last)
    if last.lower() in OLD_DEFAULTS:
        last = ''
    if not last and ' ' in first:
        first, last = first.split(' ', 1)
    if first and not last:
        last = placeholder
    return nice_case(first)[:MAX_LEN], nice_case(last)[:MAX_LEN]


def split_full_name(name: str | None, *, placeholder: str = PLACEHOLDER_LAST) -> tuple[str, str]:
    """A single "full name" box ("Pat de la Cruz") as (first, last) by the same rule."""
    return clean_name(name, '', placeholder=placeholder)
