"""Eco-Thrift transactional email.

Send as retail@ecothrift.us / Eco-Thrift. Sign-in, verification, hold lifecycle,
and reply notices are best-effort: they must never roll back a hold or a reply,
so they swallow failures and return False.

Staff password reset is the exception. If that mail does not leave, the person
is locked out and nothing else will tell them, so it raises.
"""
from __future__ import annotations

import logging
from email.utils import formataddr
from typing import TYPE_CHECKING

from django.conf import settings
from django.core.mail import EmailMultiAlternatives as EmailMessage

if TYPE_CHECKING:
    from apps.webstore.models import Conversation, Reservation

logger = logging.getLogger(__name__)

PICKUP_ADDRESS = '8425 W Center Rd, Omaha, NE 68124'
PICKUP_PHONE = '(402) 881-9861'


def _from_email() -> str:
    display = getattr(settings, 'ONLINE_SALES_EMAIL_DISPLAY_NAME', 'Eco-Thrift')
    addr = getattr(settings, 'ONLINE_SALES_EMAIL_FROM', 'retail@ecothrift.us')
    return formataddr((display, addr))


def _reply_to() -> list[str]:
    addr = getattr(settings, 'ONLINE_SALES_EMAIL_REPLY_TO', None) or getattr(
        settings, 'ONLINE_SALES_EMAIL_FROM', 'retail@ecothrift.us',
    )
    return [addr]


def _public_base() -> str:
    return (getattr(settings, 'ONLINE_SALES_PUBLIC_BASE_URL', None) or 'https://ecothrift.us').rstrip('/')


def _thread_headers(conversation: 'Conversation') -> tuple[str, dict[str, str]]:
    short = conversation.public_token[:8]
    return f'[ETO-{short}]', {'X-Eco-Thread': conversation.public_token}


def _send(
    subject: str,
    body: str,
    to: str,
    *,
    html_body: str = '',
    headers: dict[str, str] | None = None,
) -> bool:
    """Return True if send reported success. Never raises to callers."""
    try:
        msg = EmailMessage(
            subject=subject,
            body=body,
            from_email=_from_email(),
            to=[to],
            reply_to=_reply_to(),
            headers=headers,
        )
        if html_body:
            msg.attach_alternative(html_body, 'text/html')
        sent = msg.send(fail_silently=True)
        return bool(sent)
    except Exception:
        logger.exception('Online Sales email failed: %s → %s', subject, to)
        return False


def send_sign_in_link(*, email: str, magic_link: str) -> bool:
    """Magic-link sign-in for customer accounts (E1)."""
    body = (
        f'Sign in to Eco-Thrift Online Sales:\n\n'
        f'{magic_link}\n\n'
        f'This link is single-use and expires soon. If you did not request it, ignore this email.\n\n'
        f'- Eco-Thrift\n{PICKUP_ADDRESS} · {PICKUP_PHONE}'
    )
    return _send('Your Eco-Thrift sign-in link', body, email)


def send_email_verification(*, email: str, magic_link: str) -> bool:
    """Confirm ownership of an email for a customer account."""
    body = (
        f'Confirm your Eco-Thrift email:\n\n'
        f'{magic_link}\n\n'
        f'This link is single-use and expires soon. If you did not create an account, ignore this email.\n\n'
        f'- Eco-Thrift\n{PICKUP_ADDRESS} · {PICKUP_PHONE}'
    )
    return _send('Confirm your Eco-Thrift email', body, email)


def send_password_reset_link(*, email: str, magic_link: str) -> bool:
    """Customer password reset - clicking unsets the password so they can set a new one."""
    body = (
        f'Reset your Eco-Thrift password:\n\n'
        f'{magic_link}\n\n'
        f'After you open the link you can add a new password. '
        f'This link is single-use and expires soon. If you did not request it, ignore this email.\n\n'
        f'- Eco-Thrift\n{PICKUP_ADDRESS} · {PICKUP_PHONE}'
    )
    return _send('Reset your Eco-Thrift password', body, email)


def send_staff_password_reset(*, email: str, reset_link: str, requested_by_admin: bool = False) -> None:
    """Staff password reset. Raises if the send fails - a silent drop locks someone out."""
    opening = (
        'An administrator started a password reset for your Eco-Thrift staff account.'
        if requested_by_admin
        else 'You requested a password reset for your Eco-Thrift staff account.'
    )
    body = (
        f'{opening}\n\n'
        f'Set a new password:\n\n'
        f'{reset_link}\n\n'
        f'This link is single-use and expires in one hour. '
        f'If you did not expect it, ignore this email and your password stays as it is.\n\n'
        f'- Eco-Thrift\n{PICKUP_ADDRESS} · {PICKUP_PHONE}'
    )
    msg = EmailMessage(
        subject='Reset your Eco-Thrift staff password',
        body=body,
        from_email=_from_email(),
        to=[email],
        reply_to=_reply_to(),
    )
    sent = msg.send(fail_silently=False)
    if not sent:
        raise RuntimeError('Password reset email was not accepted for delivery.')


def send_hold_verification(
    reservation: 'Reservation',
    *,
    confirm_link: str = '',
    code: str = '',
    magic_link: str = '',
) -> bool:
    """Upgrade email: code + link to keep the hold 3 open days. No logistics yet.

    ``magic_link`` is accepted as a deprecated alias for ``confirm_link`` so
    in-flight call sites and older tests keep working during the cutover.
    """
    from apps.webstore.services.hours import confirmed_expiry
    from apps.webstore.services.hold_status import _fmt_day_abbrev

    link = (confirm_link or magic_link or '').strip()
    title = reservation.listing.title if reservation.listing_id else 'your item'
    status_url = f'{_public_base()}/hold/{reservation.status_token}'
    until = _fmt_day_abbrev(confirmed_expiry())
    try:
        conversation = reservation.conversation
    except Exception:
        conversation = None
    marker = ''
    headers = None
    if conversation:
        marker, headers = _thread_headers(conversation)

    code_line = f'Your confirmation code: {code}\n\n' if code else ''
    link_line = f'Or open this link to confirm:\n{link}\n\n' if link else ''
    body = (
        f'Hi {reservation.customer_name},\n\n'
        f'Your item is held - “{title}”.\n\n'
        f'{code_line}'
        f'{link_line}'
        f'Confirm to keep it until {until}.\n\n'
        f'Status page: {status_url}\n\n'
        f'If you did not request this, ignore the email and the hold will end.\n\n'
        f'- Eco-Thrift'
    )
    return _send(
        f'{marker} Keep your hold until {until}: {title}'.strip(),
        body,
        reservation.email,
        headers=headers,
    )


def send_inquiry_verification(conversation: 'Conversation', *, magic_link: str) -> bool:
    """Guest must confirm email before an ask-about-item reaches staff."""
    email = (conversation.guest_email or '').strip()
    if not email:
        return False
    title = conversation.listing.title if conversation.listing_id else 'your question'
    marker, headers = _thread_headers(conversation)
    body = (
        f'Hi {conversation.guest_name or "there"},\n\n'
        f'Confirm your email so we can answer your question about “{title}”:\n\n'
        f'{magic_link}\n\n'
        f'This link is single-use and expires soon. If you did not send a message, ignore this email.\n\n'
        f'- Eco-Thrift\n{PICKUP_ADDRESS} · {PICKUP_PHONE}'
    )
    return _send(
        f'{marker} Confirm your message: {title}'.strip(),
        body,
        email,
        headers=headers,
    )


def send_hold_confirmed(reservation: 'Reservation') -> bool:
    """Customer: email verified - come in any time with your code (logistics OK now)."""
    from apps.webstore.services.hold_status import _fmt_day_short, format_hold_deadline

    deadline = format_hold_deadline(reservation.expires_at)
    until = _fmt_day_short(reservation.expires_at) if reservation.expires_at else 'your hold window'
    code = (getattr(reservation, 'pickup_code', None) or '').strip()
    title = reservation.listing.title if reservation.listing_id else 'your item'
    status_url = f'{_public_base()}/hold/{reservation.status_token}'
    try:
        conversation = reservation.conversation
    except Exception:
        conversation = None
    marker = ''
    headers = None
    if conversation:
        marker, headers = _thread_headers(conversation)

    code_line = f'\nShow this code at the counter: {code}\n' if code else '\n'
    subject = f'Held for you until {until}: {title}'
    body = (
        f'Hi {reservation.customer_name},\n\n'
        f'“{title}” is held for you until {until}.\n'
        f'{deadline["lead"]}'
        + (f' ({deadline["secondary"]})' if deadline.get('secondary') else '')
        + f'.\n'
        f'{code_line}'
        f'Come in any time before then.\n'
        f'Pick up at {PICKUP_ADDRESS}\n{PICKUP_PHONE}\n'
        f'Pay in store - cash or card.\n'
        f'Status: {status_url}\n\n'
        f'- Eco-Thrift'
    )
    return _send(
        f'{marker} {subject}'.strip(),
        body,
        reservation.email,
        headers=headers,
    )


def send_hold_ready(reservation: 'Reservation') -> bool:
    """Customer: bonus - already bagged. Not a newly opened door."""
    from apps.webstore.services.hold_status import _fmt_day_short, format_hold_deadline

    deadline = format_hold_deadline(reservation.expires_at)
    until = _fmt_day_short(reservation.expires_at) if reservation.expires_at else 'your hold window'
    code = (getattr(reservation, 'pickup_code', None) or '').strip()
    status_url = f'{_public_base()}/hold/{reservation.status_token}'
    try:
        conversation = reservation.conversation
    except Exception:
        conversation = None
    marker = ''
    headers = None
    if conversation:
        marker, headers = _thread_headers(conversation)

    title = reservation.listing.title if reservation.listing_id else 'your item'
    subject = f"It's bagged and waiting: {title}"
    code_line = f'\nShow this code at the counter: {code}\n' if code else '\n'
    body = (
        f'Hi {reservation.customer_name},\n\n'
        f'“{title}” is already bagged and waiting for you.\n'
        f'{deadline["lead"]}'
        + (f' ({deadline["secondary"]})' if deadline.get('secondary') else '')
        + f'. Pick up by {until}.\n'
        f'{code_line}'
        f'{PICKUP_ADDRESS}\n{PICKUP_PHONE}\n'
        f'Pay in store - cash or card.\n'
        f'Status: {status_url}\n\n'
        f'- Eco-Thrift'
    )
    return _send(
        f'{marker} {subject}'.strip(),
        body,
        reservation.email,
        headers=headers,
    )


def send_hold_reopened(reservation: 'Reservation') -> bool:
    """Customer: a released hold is active again and back to Approved."""
    if reservation.expires_at:
        expires = reservation.expires_at.strftime('%a %b %d, %Y %I:%M %p')
    else:
        expires = 'store close on the next business day'

    title = reservation.listing.title if reservation.listing_id else 'your item'
    status_url = f'{_public_base()}/hold/{reservation.status_token}'
    try:
        conversation = reservation.conversation
    except Exception:
        conversation = None
    marker = ''
    headers = None
    if conversation:
        marker, headers = _thread_headers(conversation)

    code = (getattr(reservation, 'pickup_code', None) or '').strip()
    code_line = f'\nShow this code at the counter: {code}\n' if code else '\n'
    body = (
        f'Hi {reservation.customer_name},\n\n'
        f'Good news - your hold for “{title}” (qty {reservation.quantity}) '
        f'is active again.\n'
        f'{code_line}'
        f'Come in any time before it expires and show your code.\n\n'
        f'Pick up at {PICKUP_ADDRESS}\n{PICKUP_PHONE}\n'
        f'Hold expires: {expires}\n'
        f'Status link: {status_url}\n\n'
        f'Pay in store at pickup. No shipping, delivery, or online payment.\n\n- Eco-Thrift'
    )
    return _send(
        f'{marker} Hold reopened: {title}'.strip(),
        body,
        reservation.email,
        headers=headers,
    )


def send_hold_released(reservation: 'Reservation') -> bool:
    """Customer: hold declined, cancelled, or expired - include reason when present."""
    status = reservation.status
    if status not in ('declined', 'cancelled', 'expired'):
        return False
    title = reservation.listing.title if reservation.listing_id else 'your item'
    reason = (reservation.release_reason or '').strip()
    status_url = f'{_public_base()}/hold/{reservation.status_token}'
    try:
        conversation = reservation.conversation
    except Exception:
        conversation = None
    marker = ''
    headers = None
    if conversation:
        marker, headers = _thread_headers(conversation)

    if status == 'declined':
        subject = f'Hold declined: {title}'
        lead = f'Your hold request for “{title}” was declined.'
    elif status == 'cancelled':
        subject = f'Hold cancelled: {title}'
        lead = f'Your hold for “{title}” was cancelled.'
    else:
        subject = f'Hold expired: {title}'
        lead = (
            f'Your hold for “{title}” expired and the item went back on sale.'
        )
    reason_line = f'\nReason: {reason}\n' if reason else '\n'
    body = (
        f'Hi {reservation.customer_name},\n\n'
        f'{lead}'
        f'{reason_line}'
        f'Status link: {status_url}\n\n'
        f'- Eco-Thrift\n{PICKUP_ADDRESS} · {PICKUP_PHONE}'
    )
    return _send(
        f'{marker} {subject}'.strip(),
        body,
        reservation.email,
        headers=headers,
    )


def send_you_have_a_reply(
    conversation: 'Conversation',
    *,
    reply_body: str = '',
    subject_override: str = '',
) -> bool:
    """Customer: staff replied on their thread."""
    email = (conversation.guest_email or '').strip()
    if not email:
        return False
    title = conversation.listing.title if conversation.listing_id else 'your request'
    if conversation.reservation_id:
        try:
            link = f'{_public_base()}/hold/{conversation.reservation.status_token}'
        except Exception:
            link = f'{_public_base()}/shop'
    else:
        link = f'{_public_base()}/shop'
    body = (
        f'Hi {conversation.guest_name or "there"},\n\n'
        + (
            f'{reply_body.strip()}\n\n'
            if reply_body.strip()
            else f'Eco-Thrift replied about “{title}”.\n\n'
        )
        + f'View the conversation: {link}\n\n'
        f'- Eco-Thrift\n{PICKUP_ADDRESS} · {PICKUP_PHONE}'
    )
    marker, headers = _thread_headers(conversation)
    return _send(
        f'{marker} {subject_override.strip() or f"New reply about {title}"}',
        body,
        email,
        headers=headers,
    )
