"""Staff usernames (T61, Bill 2026-10-06): the first name in lower case, the last initial on a clash.

``bill``, ``carrie``; a second Carrie R. becomes ``carrier``, then ``carrierollins``, then ``carrie2``... Letters and
digits only (accents dropped). Customers get none: they sign in on the storefront.
"""
from __future__ import annotations

import re
import unicodedata

STAFF_GROUPS = ('admin', 'manager', 'employee')


def _plain(text: str) -> str:
    text = unicodedata.normalize('NFKD', text or '').encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]', '', text.lower())


def make_username(first: str, last: str, email: str, taken: set[str]) -> str:
    """The first free name: first, first + last initial, first + last, then first + a number."""
    first_p = _plain(first) or _plain((email or '').split('@')[0]) or 'user'
    last_p = _plain(last)
    for name in (first_p, first_p + last_p[:1], first_p + last_p):
        if name and name not in taken and len(name) <= 40:
            return name
    n = 2
    while f'{first_p}{n}' in taken:
        n += 1
    return f'{first_p}{n}'


def is_staff_user(user) -> bool:
    return bool(user.is_superuser or user.groups.filter(name__iregex=r'^(admin|manager|employee)$').exists())


def assign_username(user) -> str | None:
    """Give a staff user a username when they have none. Returns it (or None for a customer)."""
    from django.contrib.auth import get_user_model

    if user.username or not is_staff_user(user):
        return user.username
    taken = set(get_user_model().objects.exclude(username__isnull=True).values_list('username', flat=True))
    user.username = make_username(user.first_name, user.last_name, user.email, taken)
    user.save(update_fields=['username'])
    return user.username
