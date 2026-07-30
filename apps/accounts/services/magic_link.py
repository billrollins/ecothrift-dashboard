"""Customer magic-link issue / consume + guest claim helpers."""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth.models import Group
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import CustomerProfile, MagicLinkToken, User

MAGIC_LINK_TTL = timedelta(minutes=30)
_STAFF_ROLES = frozenset({'Admin', 'Manager', 'Employee', 'Consignee'})


def _normalize_email(email: str) -> str:
    return (email or '').strip().lower()


@transaction.atomic
def issue_magic_link(*, email: str, request_ip: str | None = None) -> MagicLinkToken:
    email = _normalize_email(email)
    if not email or '@' not in email:
        raise ValidationError({'detail': 'A valid email is required.'})
    MagicLinkToken.objects.filter(email=email, used_at__isnull=True).update(
        used_at=timezone.now(),
    )
    return MagicLinkToken.objects.create(
        email=email,
        expires_at=timezone.now() + MAGIC_LINK_TTL,
        request_ip=request_ip or None,
    )


@transaction.atomic
def consume_magic_link(*, token: str) -> User:
    token = (token or '').strip()
    if not token:
        raise ValidationError({'detail': 'Token is required.'})
    locked = (
        MagicLinkToken.objects.select_for_update()
        .filter(token=token)
        .first()
    )
    if locked is None or not locked.is_usable:
        raise ValidationError({'detail': 'Invalid or expired sign-in link.'})

    existing = User.objects.filter(email__iexact=locked.email).first()
    if existing is not None and existing.role in _STAFF_ROLES:
        locked.used_at = timezone.now()
        locked.save(update_fields=['used_at'])
        raise ValidationError({'detail': 'Use the staff sign-in for this account.'})

    locked.used_at = timezone.now()
    locked.save(update_fields=['used_at'])

    user = _get_or_create_customer(locked.email)
    claim_guest_records(user)
    return user


def _get_or_create_customer(email: str) -> User:
    email = _normalize_email(email)
    group, _ = Group.objects.get_or_create(name='Customer')
    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        local = email.split('@')[0][:40] or 'Customer'
        user = User(
            email=email,
            first_name=local,
            last_name='Customer',
            is_staff=False,
            is_active=True,
        )
        user.set_unusable_password()
        user.save()
    if not user.groups.filter(name='Customer').exists():
        user.groups.add(group)
    CustomerProfile.objects.get_or_create(
        user=user,
        defaults={'customer_number': CustomerProfile.generate_customer_number()},
    )
    return user


@transaction.atomic
def claim_guest_records(user: User) -> None:
    """Attach guest conversations matching the user's email."""
    from apps.webstore.models import Conversation

    email = _normalize_email(user.email)
    Conversation.objects.filter(guest_email__iexact=email, customer__isnull=True).update(
        customer=user,
    )
