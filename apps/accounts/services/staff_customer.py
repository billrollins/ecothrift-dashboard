"""
Staff logins are website customers too (owner 2026-10-15: "how come it still asks me to create an account when I type
in my staff email?").

- **Every active staff user is also a website customer:** in the Customer group, with a ``CustomerProfile`` (their Dash
  email counts as confirmed). Their ``role`` stays their staff role: Customer is the lowest role, so nothing staff-side
  changes. ``ensure_staff_customer`` does it. It runs:
  - when a staff user is saved or put in a staff group (``apps/accounts/signals.py``, after the commit);
  - for every staff user without one, when the owner clicks "Create missing" on Dash → Thrift+ → Staff.
  Customers and other non-staff users are left alone.
- **Staff sign in to the website with their Dash password, never an emailed link.** ``is_staff_login`` is the test
  the website uses to refuse emailed sign-in links, customer password resets and customer sign-ups for these emails.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import CustomerProfile

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
    """Has a website customer account: a CustomerProfile, or the Customer group."""
    if user is None or not getattr(user, 'pk', None):
        return False
    return (CustomerProfile.objects.filter(user_id=user.pk).exists()
            or user.groups.filter(name__iexact='customer').exists())


def has_customer_account(user) -> bool:
    """Both halves: the Customer group and a CustomerProfile."""
    return (CustomerProfile.objects.filter(user_id=user.pk).exists()
            and user.groups.filter(name__iexact='customer').exists())


def _new_profile(user) -> CustomerProfile:
    """A new profile; the customer number is the next free one (retried if another was made at the same moment)."""
    for _ in range(5):
        try:
            with transaction.atomic():
                return CustomerProfile.objects.create(
                    user=user, customer_number=CustomerProfile.generate_customer_number(),
                    email_verified_at=timezone.now(),  # a Dash email is trusted
                )
        except IntegrityError:
            existing = CustomerProfile.objects.filter(user=user).first()
            if existing is not None:
                return existing
    raise IntegrityError('Could not pick a free customer number.')


def ensure_staff_customer(user) -> tuple[CustomerProfile | None, bool]:
    """(profile, made). The staff user's website customer account: the profile (made, or its email stamped confirmed)
    and the Customer group. ``(None, False)`` for anyone not active staff, who is left alone."""
    if not is_active_staff(user):
        return None, False
    User = get_user_model()
    with transaction.atomic():
        User.objects.select_for_update().filter(pk=user.pk).first()  # one ensure at a time per user
        made = False
        profile = CustomerProfile.objects.filter(user=user).first()
        if profile is None:
            profile, made = _new_profile(user), True
        elif profile.email_verified_at is None:
            profile.email_verified_at = timezone.now()
            profile.save(update_fields=['email_verified_at'])
        if not user.groups.filter(name__iexact='customer').exists():
            group = Group.objects.filter(name__iexact='customer').order_by('pk').first()
            if group is None:
                group = Group.objects.create(name='Customer')
            user.groups.add(group)
    return profile, made


def missing_customers():
    """Active staff users without a website customer account (no profile, or not in the Customer group)."""
    return staff_users().filter(Q(customer__isnull=True) | ~Q(groups__name__iexact='customer')).distinct()


def create_missing_customers() -> dict:
    """A website customer account for every active staff user without one. Answers the counts."""
    made = fixed = 0
    for user in missing_customers().order_by('pk'):
        _profile, was_made = ensure_staff_customer(user)
        if was_made:
            made += 1
        else:
            fixed += 1
    return {'customers_made': made, 'customers_fixed': fixed, 'customers_missing': missing_customers().count()}
