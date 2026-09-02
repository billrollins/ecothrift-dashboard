"""Provider-agnostic payment layer for web-store orders.

The storefront does NOT use Stripe (owner decision, 2026-05-30). A real processor
- most likely **Helcim** - will be wired later. Until then `ManualProvider` lets the
full order flow run end-to-end (cart → checkout → order placed → confirmation) with
no online charge: the order is recorded as awaiting payment and staff arrange it
(pay-in-store on pickup, or an invoice).

To switch processors, implement `start()` on a provider, register it in `PROVIDERS`,
and set `WEBSTORE_PAYMENT_PROVIDER` (env/config). Nothing else in the flow changes.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from django.conf import settings

if TYPE_CHECKING:
    from .models import Order


class PaymentProvider:
    """Base interface. `start()` is called once an order has been created."""

    name = 'base'

    def start(self, order: 'Order') -> dict:
        raise NotImplementedError


class ManualProvider(PaymentProvider):
    """No online charge. Records the order as awaiting manual payment."""

    name = 'manual'

    def start(self, order: 'Order') -> dict:
        order.payment_provider = self.name
        order.payment_status = 'pending'
        order.save(update_fields=['payment_provider', 'payment_status', 'updated_at'])
        if order.fulfillment == 'pickup':
            message = (
                'Order received! Pay in store when you pick up - '
                'we’ll email you when it’s ready.'
            )
        else:
            message = (
                'Order received! We’ll email you to confirm shipping and arrange payment.'
            )
        return {
            'provider': self.name,
            'requires_action': False,
            'redirect_url': None,
            'message': message,
        }


class HelcimProvider(PaymentProvider):
    """Placeholder for the planned Helcim integration (HelcimPay.js / Helcim API).

    Wire this up once an account + API token exist, then set
    WEBSTORE_PAYMENT_PROVIDER=helcim. Until then it intentionally fails loudly so it
    is never silently selected in production without credentials.
    """

    name = 'helcim'

    def start(self, order: 'Order') -> dict:
        raise NotImplementedError(
            'Helcim payments are not configured yet. '
            'Set WEBSTORE_PAYMENT_PROVIDER=manual or provide Helcim credentials.'
        )


PROVIDERS: dict[str, type[PaymentProvider]] = {
    'manual': ManualProvider,
    'helcim': HelcimProvider,
}


def get_payment_provider() -> PaymentProvider:
    key = (getattr(settings, 'WEBSTORE_PAYMENT_PROVIDER', 'manual') or 'manual').strip().lower()
    provider_cls = PROVIDERS.get(key, ManualProvider)
    return provider_cls()
