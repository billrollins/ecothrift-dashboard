"""Defaults for purchase orders (inventory) driven by AppSetting."""

from __future__ import annotations

from decimal import Decimal

from apps.core.models import AppSetting

# Must match model default on PurchaseOrder.est_shrink when no AppSetting exists.
DEFAULT_PO_EST_SHRINK = Decimal('0.1500')
SETTING_KEY_PO_DEFAULT_EST_SHRINK = 'po_default_est_shrink'


def get_default_po_est_shrink() -> Decimal:
    """Return default ``est_shrink`` for new POs (0 <= x < 1). Falls back to 0.15."""
    try:
        s = AppSetting.objects.get(key=SETTING_KEY_PO_DEFAULT_EST_SHRINK)
        raw = s.value
        if raw is None:
            return DEFAULT_PO_EST_SHRINK
        d = Decimal(str(raw))
        if d < 0 or d >= Decimal('1'):
            return DEFAULT_PO_EST_SHRINK
        return d.quantize(Decimal('0.0001'))
    except AppSetting.DoesNotExist:
        return DEFAULT_PO_EST_SHRINK
