"""Online Sales system emails — exactly three transactional messages.

Send as retail@ecothrift.us / Eco-Thrift. Best-effort: callers must use
fail_silently paths so mail never rolls back a hold or reply.
"""
from __future__ import annotations

import logging
from email.utils import formataddr
from typing import TYPE_CHECKING

from django.conf import settings
from django.core.mail import EmailMessage

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


def _send(subject: str, body: str, to: str) -> bool:
    """Return True if send reported success. Never raises to callers."""
    try:
        msg = EmailMessage(
            subject=subject,
            body=body,
            from_email=_from_email(),
            to=[to],
            reply_to=_reply_to(),
        )
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
        f'— Eco-Thrift\n{PICKUP_ADDRESS} · {PICKUP_PHONE}'
    )
    return _send('Your Eco-Thrift sign-in link', body, email)


def send_hold_confirmed(reservation: 'Reservation') -> bool:
    """Customer: hold confirmed — pickup window, address, hours, policy."""
    if reservation.expires_at:
        expires = reservation.expires_at.strftime('%a %b %d, %Y %I:%M %p')
    else:
        expires = 'store close on the next business day'

    status_url = f'{_public_base()}/hold/{reservation.status_token}'
    body = (
        f'Hi {reservation.customer_name},\n\n'
        f'Your hold is confirmed for “{reservation.listing.title}” '
        f'(qty {reservation.quantity}).\n\n'
        f'Pick up at Eco-Thrift — Canfield\n'
        f'{PICKUP_ADDRESS}\n'
        f'{PICKUP_PHONE}\n\n'
        f'Hold expires: {expires}\n'
        f'Status link: {status_url}\n\n'
        f'Pay in store at pickup. No shipping, delivery, or online payment. '
        f'Items are typically final sale.\n\n'
        f'— Eco-Thrift'
    )
    return _send(f'Hold confirmed: {reservation.listing.title}', body, reservation.email)


def send_you_have_a_reply(conversation: 'Conversation') -> bool:
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
        f'Eco-Thrift replied about “{title}”.\n\n'
        f'View the conversation: {link}\n\n'
        f'— Eco-Thrift\n{PICKUP_ADDRESS} · {PICKUP_PHONE}'
    )
    return _send(f'New reply about {title}', body, email)
