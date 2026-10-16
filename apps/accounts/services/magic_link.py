"""Customer magic-link issue / consume + guest claim helpers."""
from __future__ import annotations

from datetime import timedelta
from typing import NamedTuple

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import CustomerProfile, MagicLinkToken, User
from apps.accounts.services.staff_customer import STAFF_LOGIN_MESSAGE, STAFF_LOGIN_ROLES, is_staff_login

MAGIC_LINK_TTL = timedelta(minutes=30)
_STAFF_ROLES = STAFF_LOGIN_ROLES  # kept for older imports; use is_staff_login (it also counts superusers)
# After magic-link consume, set-password may skip old_password for this long.
_PASSWORD_UNLOCK_TTL_SECONDS = 60 * 60


def _password_unlock_key(user_id: int) -> str:
    return f'accounts:pwd_unlock:{user_id}'


def unlock_password_change(user: User) -> None:
    """Allow one password set/update without old_password after email validation."""
    cache.set(_password_unlock_key(user.pk), 1, timeout=_PASSWORD_UNLOCK_TTL_SECONDS)


def password_change_unlocked(user: User) -> bool:
    return bool(cache.get(_password_unlock_key(user.pk)))


def clear_password_change_unlock(user: User) -> None:
    cache.delete(_password_unlock_key(user.pk))


class ConsumeResult(NamedTuple):
    user: User | None
    redirect_to: str
    purpose: str
    needs_password_prompt: bool
    code: str = ''
    issue_session: bool = True


def _normalize_email(email: str) -> str:
    return (email or '').strip().lower()


def _hold_redirect(status_token: str, *, relinked: bool = False) -> str:
    path = f'/hold/{status_token}'
    return f'{path}?relinked=1' if relinked else path


def _resolve_hold_redirect(hold_token: str, *, email: str = '', relinked: bool = False) -> str | None:
    from apps.webstore.models import Reservation

    qs = Reservation.objects.filter(status_token=(hold_token or '').strip())
    if email:
        qs = qs.filter(email__iexact=email.strip())
    hold = qs.first()
    if hold is None:
        return None
    return _hold_redirect(hold.status_token, relinked=relinked)


def _refresh_hold_verification_link(*, hold_token: str, email: str, request_ip: str | None = None) -> str | None:
    """Issue + email a fresh hold confirmation (code + link). Returns redirect path or None."""
    from apps.webstore.emails import send_hold_verification
    from apps.webstore.models import Reservation
    from apps.webstore.services.hold_confirmations import (
        ConfirmationCooldown,
        issue_confirmation,
    )

    hold = Reservation.objects.select_related('listing').filter(
        status_token=(hold_token or '').strip(),
        email__iexact=_normalize_email(email),
        status='pending_verification',
    ).first()
    if hold is None:
        # Hold may already be verified/expired - still send them to the status page.
        return _resolve_hold_redirect(hold_token, email=email, relinked=True)

    from django.conf import settings as dj_settings
    base = (getattr(dj_settings, 'ONLINE_SALES_PUBLIC_BASE_URL', '') or '').rstrip('/')
    try:
        _row, plain_code, plain_token = issue_confirmation(hold)
        confirm_link = f'{base}/api/webstore/holds/confirm/?t={plain_token}'
        send_hold_verification(hold, confirm_link=confirm_link, code=plain_code)
    except ConfirmationCooldown:
        # A fresh code was just sent - still land them on the status page.
        pass
    except Exception:
        pass
    return _hold_redirect(hold.status_token, relinked=True)


def customer_email_verified(user: User | None) -> bool:
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    from apps.accounts.services.staff_customer import is_active_staff

    if is_active_staff(user):
        return True  # a Dash email is trusted; staff have no customer record (2026-10-16)
    profile = getattr(user, 'customer', None)
    return bool(profile and profile.email_verified_at)


def stamp_email_verified(user: User) -> None:
    from apps.accounts.services.staff_customer import is_staff_login

    if is_staff_login(user):
        return  # staff are never customers (owner 2026-10-16)
    profile, _ = CustomerProfile.objects.get_or_create(
        user=user,
        defaults={'customer_number': CustomerProfile.generate_customer_number()},
    )
    if profile.email_verified_at is None:
        profile.email_verified_at = timezone.now()
        profile.save(update_fields=['email_verified_at'])


@transaction.atomic
def issue_magic_link(
    *,
    email: str,
    request_ip: str | None = None,
    purpose: str = MagicLinkToken.PURPOSE_SIGN_IN,
    hold_token: str = '',
    thread_token: str = '',
) -> MagicLinkToken:
    email = _normalize_email(email)
    if not email or '@' not in email:
        raise ValidationError({'detail': 'A valid email is required.'})
    if purpose not in dict(MagicLinkToken.PURPOSE_CHOICES):
        raise ValidationError({'detail': 'Invalid magic-link purpose.'})

    hold_token = (hold_token or '').strip()
    thread_token = (thread_token or '').strip()

    # Invalidate only same-purpose unused tokens so a hold confirm cannot kill a sign-in link.
    qs = MagicLinkToken.objects.filter(email=email, purpose=purpose, used_at__isnull=True)
    if purpose == MagicLinkToken.PURPOSE_VERIFY_HOLD and hold_token:
        qs = qs.filter(hold_token=hold_token)
    elif purpose == MagicLinkToken.PURPOSE_VERIFY_THREAD and thread_token:
        qs = qs.filter(thread_token=thread_token)
    qs.update(used_at=timezone.now())

    return MagicLinkToken.objects.create(
        email=email,
        purpose=purpose,
        hold_token=hold_token,
        thread_token=thread_token,
        expires_at=timezone.now() + MAGIC_LINK_TTL,
        request_ip=request_ip or None,
    )


@transaction.atomic
def consume_magic_link(*, token: str, request_ip: str | None = None) -> ConsumeResult:
    token = (token or '').strip()
    if not token:
        raise ValidationError({'detail': 'Token is required.'})
    locked = (
        MagicLinkToken.objects.select_for_update()
        .filter(token=token)
        .first()
    )
    if locked is None:
        raise ValidationError({'detail': 'Invalid or expired sign-in link.'})

    # Hold-verify failure paths resolve forward - never a dead error page.
    if locked.purpose == MagicLinkToken.PURPOSE_VERIFY_HOLD and locked.hold_token:
        if locked.used_at is not None:
            redirect = _resolve_hold_redirect(locked.hold_token, email=locked.email)
            if redirect:
                return ConsumeResult(
                    user=None,
                    redirect_to=redirect,
                    purpose=locked.purpose,
                    needs_password_prompt=False,
                    code='ALREADY_VERIFIED',
                    issue_session=False,
                )
            raise ValidationError({'detail': 'Invalid or expired sign-in link.'})
        if locked.expires_at <= timezone.now():
            # Mark spent so the same dead token cannot loop-refresh forever.
            locked.used_at = timezone.now()
            locked.save(update_fields=['used_at'])
            redirect = _refresh_hold_verification_link(
                hold_token=locked.hold_token,
                email=locked.email,
                request_ip=request_ip,
            )
            if redirect:
                return ConsumeResult(
                    user=None,
                    redirect_to=redirect,
                    purpose=locked.purpose,
                    needs_password_prompt=False,
                    code='LINK_REFRESHED',
                    issue_session=False,
                )
            raise ValidationError({'detail': 'Invalid or expired sign-in link.'})

    if not locked.is_usable:
        raise ValidationError({'detail': 'Invalid or expired sign-in link.'})

    existing = User.objects.filter(email__iexact=locked.email).first()
    if is_staff_login(existing):
        # A website session is a Dash token: a staff login signs in with its Dash password, never an emailed link.
        locked.used_at = timezone.now()
        locked.save(update_fields=['used_at'])
        raise ValidationError({'detail': STAFF_LOGIN_MESSAGE})

    locked.used_at = timezone.now()
    locked.save(update_fields=['used_at'])

    full_name = ''  # the name the customer typed (a hold or a message), split by the one name rule
    if locked.purpose == MagicLinkToken.PURPOSE_VERIFY_HOLD and locked.hold_token:
        from apps.webstore.models import Reservation
        hold = Reservation.objects.filter(
            status_token=locked.hold_token, email__iexact=locked.email,
        ).first()
        if hold is not None:
            full_name = hold.customer_name or ''
    elif locked.purpose == MagicLinkToken.PURPOSE_VERIFY_THREAD and locked.thread_token:
        from apps.webstore.models import Conversation
        thread = Conversation.objects.filter(
            public_token=locked.thread_token, guest_email__iexact=locked.email,
        ).first()
        if thread is not None:
            full_name = thread.guest_name or ''

    user = _get_or_create_customer(locked.email, first_name=full_name)
    stamp_email_verified(user)

    if locked.purpose == MagicLinkToken.PURPOSE_RESET_PASSWORD:
        user.set_unusable_password()
        user.save(update_fields=['password'])

    # Owner 2026-10-16: no customer passwords (one account, an emailed link or code). Nothing asks for one.
    needs_password_prompt = False

    claim_guest_records(user)
    redirect_to = '/account'

    if locked.purpose == MagicLinkToken.PURPOSE_VERIFY_HOLD and locked.hold_token:
        from apps.webstore.services.reservations import verify_hold_by_token
        reservation = verify_hold_by_token(locked.hold_token, email=locked.email)
        if reservation is not None:
            redirect_to = f'/hold/{reservation.status_token}'
    elif locked.purpose == MagicLinkToken.PURPOSE_VERIFY_THREAD and locked.thread_token:
        from apps.webstore.services.conversations import verify_inquiry_by_token
        conversation = verify_inquiry_by_token(locked.thread_token, email=locked.email)
        if conversation is not None:
            if conversation.reservation_id and conversation.reservation:
                redirect_to = f'/hold/{conversation.reservation.status_token}'
            else:
                redirect_to = f'/account?thread={conversation.public_token}'
    elif locked.purpose == MagicLinkToken.PURPOSE_RESET_PASSWORD:
        redirect_to = '/account?set_password=1'

    return ConsumeResult(
        user=user,
        redirect_to=redirect_to,
        purpose=locked.purpose,
        needs_password_prompt=needs_password_prompt,
        code='',
        issue_session=True,
    )


def _get_or_create_customer(
    email: str,
    *,
    first_name: str = '',
    last_name: str = '',
) -> User:
    from apps.accounts.services.staff_customer import is_staff_login

    from apps.accounts.services.names import OLD_DEFAULTS, clean_name

    email = _normalize_email(email)
    group, _ = Group.objects.get_or_create(name='Customer')
    user = User.objects.filter(email__iexact=email).first()
    if user is not None and is_staff_login(user):
        return user  # staff are never customers (owner 2026-10-16): no profile, no Customer group
    # Owner 2026-10-16: one name rule; never "Customer" and never the email's first part as a name. A full name in
    # ``first_name`` is split; one word gets "Member" as the last name; no name at all stays blank.
    first, last = clean_name(first_name, last_name)
    if user is None:
        user = User(
            email=email,
            first_name=first[:150],
            last_name=last[:150],
            is_staff=False,
            is_active=True,
        )
        user.set_unusable_password()
        user.save()
    elif first and (not user.first_name or user.first_name == email.split('@')[0][:40]
                    or (user.last_name or '').strip().lower() in OLD_DEFAULTS):
        user.first_name, user.last_name = first[:150], last[:150]
        user.save(update_fields=['first_name', 'last_name', 'updated_at'])
    if not user.groups.filter(name='Customer').exists():
        user.groups.add(group)
    CustomerProfile.objects.get_or_create(
        user=user,
        defaults={'customer_number': CustomerProfile.generate_customer_number()},
    )
    return user


def register_customer(
    *,
    email: str,
    first_name: str,
    last_name: str = '',
    password: str = '',
    request_ip: str | None = None,
) -> tuple[User, MagicLinkToken]:
    """Create (or reuse) a customer and issue a verify_email link."""
    email = _normalize_email(email)
    if not email or '@' not in email:
        raise ValidationError({'detail': 'A valid email is required.'})
    first_name = (first_name or '').strip()
    if not first_name:
        raise ValidationError({'detail': 'First name is required.'})

    existing = User.objects.filter(email__iexact=email).first()
    if is_staff_login(existing):
        raise ValidationError({'detail': STAFF_LOGIN_MESSAGE, 'code': 'STAFF_LOGIN'})
    if existing is not None and existing.has_usable_password():
        raise ValidationError({'detail': 'An account with this email already exists. Sign in instead.'})

    user = _get_or_create_customer(email, first_name=first_name, last_name=last_name)
    if password:
        if len(password) < 6:
            raise ValidationError({'detail': 'Password must be at least 6 characters.'})
        user.set_password(password)
        user.save(update_fields=['password'])

    token_row = issue_magic_link(
        email=email,
        request_ip=request_ip,
        purpose=MagicLinkToken.PURPOSE_VERIFY_EMAIL,
    )
    return user, token_row


@transaction.atomic
def claim_guest_records(user: User) -> None:
    """Attach guest conversations and note matching reservations for this email."""
    from apps.webstore.models import Conversation

    email = _normalize_email(user.email)
    Conversation.objects.filter(guest_email__iexact=email, customer__isnull=True).update(
        customer=user,
    )
