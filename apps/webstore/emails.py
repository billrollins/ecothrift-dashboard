"""Order email helpers. Best-effort: sending never blocks or fails checkout.

Uses the console email backend by default (see settings.EMAIL_BACKEND), so locally
confirmations print to the server log. Configure SMTP/a provider to actually send.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.conf import settings
from django.core.mail import EmailMessage

if TYPE_CHECKING:
    from .models import Order

logger = logging.getLogger(__name__)


def send_order_confirmation(order: 'Order') -> None:
    try:
        lines = '\n'.join(
            f'  {line.quantity}× {line.title} — ${line.line_total}'
            for line in order.lines.all()
        )
        body = (
            f'Hi {order.customer_name},\n\n'
            f'Thanks for your order with Eco-Thrift! Your order number is '
            f'{order.order_number}.\n\n'
            f'Items:\n{lines}\n\n'
            f'Subtotal: ${order.subtotal}\n'
            f'Shipping: ${order.shipping}\n'
            f'Tax: ${order.tax}\n'
            f'Total: ${order.total}\n\n'
            f'Fulfillment: {order.get_fulfillment_display()}\n\n'
            'Online payment is coming soon — for now we’ll follow up to arrange payment '
            '(pay in store on pickup, or we’ll confirm shipping first). '
            'Just reply to this email with any questions.\n\n'
            '— Eco-Thrift — Canfield · 8425 W Center Rd, Omaha, NE 68124 · (402) 881-9861'
        )
        notify = getattr(settings, 'WEBSTORE_ORDER_NOTIFY_EMAIL', '') or ''
        EmailMessage(
            subject=f'Your Eco-Thrift order {order.order_number}',
            body=body,
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None),
            to=[order.email],
            bcc=[notify] if notify else None,
        ).send(fail_silently=True)
    except Exception:
        logger.exception('Order confirmation email failed for %s', getattr(order, 'order_number', '?'))
