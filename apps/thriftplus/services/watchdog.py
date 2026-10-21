"""
Thrift+ watchdogs (critic review THR-01 and THR-02, owner 2026-10-21), shown on the Owner page's Needs you.

* **The nightly ThriftBucks run** (``recompute_rewards``, Heroku Scheduler, early morning): an alert when no run has
  finished cleanly in the last ``RUN_LATE_HOURS`` hours, or the newest run failed. ThriftBucks go stale and expire late
  without it.
* **Member sales with no ledger write**: a finished sale with a member on it always logs ``register_sale`` in the same
  savepoint as its ledger rows (``register._member_sale``). When that write fails the sale still completes (the
  discount stays) and the failure is only in the server log, so a member sale in the last ``SALE_DAYS`` days with no
  ``register_sale`` Event is one whose ThriftBucks were never recorded.

Both are quiet while Thrift+ is off.
"""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

RUN_LATE_HOURS = 26
SALE_DAYS = 7


def nightly_run(now=None) -> dict | None:
    """None when all is well (or Thrift+ is off); else ``{'text', 'last_ok'}``."""
    from apps.thriftplus.models import RewardRun
    from apps.thriftplus.services.members import is_enabled

    if not is_enabled():
        return None
    now = now or timezone.now()
    newest = RewardRun.objects.order_by('-started_at').first()
    last_ok = RewardRun.objects.filter(finished_at__isnull=False, error='').order_by('-started_at').first()
    when = timezone.localtime(last_ok.finished_at).strftime('%a %b %d, %I:%M %p') if last_ok else None
    if newest is not None and newest.error:
        return {'text': f'The last run failed: {newest.error[:200]}', 'last_ok': when}
    if last_ok is None or last_ok.started_at < now - timedelta(hours=RUN_LATE_HOURS):
        return {'text': f'Last finished run: {when}' if when else 'No run has finished yet.', 'last_ok': when}
    return None


def sales_missing_ledger(now=None) -> list[dict]:
    """Member sales in the last ``SALE_DAYS`` days whose ThriftBucks were never written (no ``register_sale``)."""
    from apps.pos.models import Cart
    from apps.thriftplus.models import Event
    from apps.thriftplus.services.members import is_enabled

    if not is_enabled():
        return []
    since = (now or timezone.now()) - timedelta(days=SALE_DAYS)
    carts = list(
        Cart.objects.filter(status='completed', completed_at__gte=since, thrift_member__isnull=False,
                            thrift_member__rering=False)
        .select_related('receipt').order_by('-completed_at')
    )
    if not carts:
        return []
    logged = {
        str(d.get('cart')) for d in Event.objects.filter(action='register_sale', created_at__gte=since - timedelta(hours=1))
        .values_list('detail', flat=True) if isinstance(d, dict)
    }
    out = []
    for cart in carts:
        if str(cart.pk) in logged:
            continue
        receipt = getattr(cart, 'receipt', None)
        out.append({'cart_id': cart.pk, 'ticket': receipt.receipt_number if receipt is not None else f'#{cart.pk}',
                    'completed_at': cart.completed_at.isoformat()})
    return out
