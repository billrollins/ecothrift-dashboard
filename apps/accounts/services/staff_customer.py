"""
Staff logins on the website.

- **Staff are not customers** (owner 2026-10-16: "the last users are still the staff (which i have asked to be removed
  about 100 times now)"; this reverses 10-15's "every staff user is also a website customer"). A staff login never gets
  the Customer group, never shows on Dash → Users → Customers, and is never counted there. ``ensure_staff_customer`` and
  ``create_missing_customers`` are kept as names but make nothing. (``CustomerProfile`` is retired, T62: a customer is
  a login in the Customer group plus its Thrift+ person.)
- **Staff still use the storefront's own pages** (My holds, My messages) with their Dash login: ``can_use_storefront``.
- **Staff sign in to the website with their Dash password, never an emailed link.** ``is_staff_login`` is the test
  the website uses to refuse emailed sign-in links, customer password resets and customer sign-ups for these emails.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import Q

STAFF_GROUPS_RE = r'^(admin|manager|employee)$'  # the same groups as usernames.is_staff_user
# Dash logins: password only on the website, never an emailed sign-in link (a website session is a Dash token).
STAFF_LOGIN_ROLES = frozenset({'Admin', 'Manager', 'Employee', 'Consignee'})
STAFF_LOGIN_MESSAGE = 'This email is a staff login. Sign in with your Dash password.'


def staff_users():
    """Every active staff user: a superuser, or in the admin, manager or employee group."""
    User = get_user_model()
    return (User.objects.filter(is_active=True)
            .filter(Q(is_superuser=True) | Q(groups__name__iregex=STAFF_GROUPS_RE)).distinct())


def is_active_staff(user) -> bool:
    from apps.accounts.services.usernames import is_staff_user

    return bool(user is not None and getattr(user, 'pk', None) and user.is_active and is_staff_user(user))


def is_staff_login(user) -> bool:
    """A Dash login (staff, consignee or superuser, switched on or off). It never signs in by an emailed link."""
    if user is None or not getattr(user, 'pk', None):
        return False
    return bool(user.is_superuser or user.is_staff or user.role in STAFF_LOGIN_ROLES)


def is_customer(user) -> bool:
    """Has a website customer account: is in the Customer group."""
    if user is None or not getattr(user, 'pk', None):
        return False
    return user.groups.filter(name__iexact='customer').exists()


def can_use_storefront(user) -> bool:
    """The storefront's own pages (My holds, My messages): a website customer, or an active staff login."""
    return is_customer(user) or is_active_staff(user)


def staff_login_q(prefix: str = '') -> Q:
    """A queryset filter for staff logins (superuser, staff flag, or a staff or consignee group), as
    ``is_staff_login``. ``prefix`` reaches the user from another model, e.g. ``'user__'``."""
    return (Q(**{f'{prefix}is_superuser': True}) | Q(**{f'{prefix}is_staff': True})
            | Q(**{f'{prefix}groups__name__in': ('Admin', 'Manager', 'Employee', 'Consignee')}))


def has_customer_account(user) -> bool:
    """Same as ``is_customer`` (the Customer group; the customer record is retired, T62)."""
    return is_customer(user)


def ensure_staff_customer(user) -> tuple[None, bool]:
    """Retired 2026-10-16 (staff are not customers): makes nothing. Always ``(None, False)``."""
    return None, False


def missing_customers():
    """Retired 2026-10-16 (staff are not customers): no staff user is ever missing one."""
    return get_user_model().objects.none()


def create_missing_customers() -> dict:
    """Retired 2026-10-16 (staff are not customers): makes nothing; answers zero counts."""
    made = fixed = 0
    for user in missing_customers().order_by('pk'):
        _profile, was_made = ensure_staff_customer(user)
        if was_made:
            made += 1
        else:
            fixed += 1
    return {'customers_made': made, 'customers_fixed': fixed, 'customers_missing': missing_customers().count()}
