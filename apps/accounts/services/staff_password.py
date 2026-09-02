"""Staff password reset: issue and consume a single-use emailed link.

Deliberately separate from ``magic_link.consume_magic_link``. That path creates
customer accounts, stamps email verification, and claims guest records - none of
which may happen to an Admin, Manager, or Employee. The two flows share only the
``MagicLinkToken`` table.
"""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import MagicLinkToken

User = get_user_model()

STAFF_RESET_TTL = timedelta(hours=1)
STAFF_ROLES = frozenset({'Admin', 'Manager', 'Employee'})
MIN_PASSWORD_LENGTH = 6


def _normalize_email(email: str) -> str:
    return (email or '').strip().lower()


def staff_reset_link(token: str) -> str:
    """Absolute URL of the staff dashboard reset page."""
    host = (getattr(settings, 'STAFF_DASHBOARD_HOST', '') or 'dash.ecothrift.us').strip()
    scheme = 'http' if host.startswith(('localhost', '127.0.0.1')) else 'https'
    return f'{scheme}://{host}/reset-password?token={token}'


def is_staff_account(user) -> bool:
    return bool(user is not None and user.role in STAFF_ROLES)


@transaction.atomic
def issue_staff_reset(*, user, request_ip: str | None = None) -> MagicLinkToken:
    """Spend any outstanding staff reset tokens for this email, then mint one."""
    email = _normalize_email(user.email)
    if not email:
        raise ValidationError({'detail': 'This account has no email address.'})

    MagicLinkToken.objects.filter(
        email=email,
        purpose=MagicLinkToken.PURPOSE_STAFF_RESET_PASSWORD,
        used_at__isnull=True,
    ).update(used_at=timezone.now())

    return MagicLinkToken.objects.create(
        email=email,
        purpose=MagicLinkToken.PURPOSE_STAFF_RESET_PASSWORD,
        expires_at=timezone.now() + STAFF_RESET_TTL,
        request_ip=request_ip or None,
    )


@transaction.atomic
def consume_staff_reset(*, token: str, new_password: str):
    """Set a new password from a reset token. Returns the user."""
    token = (token or '').strip()
    if not token:
        raise ValidationError({'detail': 'Reset token is required.'})
    if len(new_password or '') < MIN_PASSWORD_LENGTH:
        raise ValidationError(
            {'detail': f'Password must be at least {MIN_PASSWORD_LENGTH} characters.'},
        )

    row = (
        MagicLinkToken.objects.select_for_update()
        .filter(token=token, purpose=MagicLinkToken.PURPOSE_STAFF_RESET_PASSWORD)
        .first()
    )
    if row is None or not row.is_usable:
        raise ValidationError({'detail': 'This reset link is invalid or has expired.'})

    user = User.objects.filter(email__iexact=row.email).first()
    if user is None or not is_staff_account(user):
        # Spend it either way so a stale token cannot be probed.
        row.used_at = timezone.now()
        row.save(update_fields=['used_at'])
        raise ValidationError({'detail': 'This reset link is invalid or has expired.'})

    row.used_at = timezone.now()
    row.save(update_fields=['used_at'])

    user.set_password(new_password)
    user.save(update_fields=['password', 'updated_at'])
    return user
