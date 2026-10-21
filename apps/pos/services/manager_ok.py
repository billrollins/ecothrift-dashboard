"""A manager's OK at the register (critic review 2026-10-21, REG-05/06/08/11/12).

Price edits, discounts over the cap and voids need a manager's register PIN plus a reason. The PIN is the person's own
(``apps.accounts.services.register_pin``, set on the Me page); five wrong tries lock PIN entry on that register only.

The register first sends the change as usual. When it needs an OK the server answers 403 ``MANAGER_OK_NEEDED`` (with
what for), the register asks for the PIN and a reason, and sends the same change again with ``manager_pin`` and
``override_reason``. Every OK is a ``RegisterApproval`` row: who asked, whose PIN, when, why, what changed.

The discount cap is the owner's AppSetting ``pos.discount_cap_percent`` (default 20): a discount bigger than that
share of the sale (or of the line), counting every discount already on the sale, needs the OK.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from apps.accounts.services.register_pin import PinError, check_pin, device_key
from apps.core.models import AppSetting
from apps.pos.models import RegisterApproval

SETTING_KEY_DISCOUNT_CAP = 'pos.discount_cap_percent'
DEFAULT_DISCOUNT_CAP = Decimal('20')
REASON_MIN = 3
REASON_MAX = 300

_WHAT = {
    RegisterApproval.KIND_PRICE_EDIT: 'A price change needs a manager PIN and a reason.',
    RegisterApproval.KIND_DISCOUNT: 'A discount over {cap}% needs a manager PIN and a reason.',
    RegisterApproval.KIND_VOID: 'A void needs a manager PIN and a reason.',
}


class ManagerOkError(Exception):
    def __init__(self, code: str, message: str, http: int = 403, **extra):
        super().__init__(message)
        self.code = code
        self.http = http
        self.extra = extra

    def payload(self) -> dict:
        return {**self.extra, 'detail': str(self), 'code': self.code}


def discount_cap_percent() -> Decimal:
    """The owner's cap on discounts without a manager's OK, in percent (0-100)."""
    try:
        raw = AppSetting.objects.get(key=SETTING_KEY_DISCOUNT_CAP).value
        if isinstance(raw, dict):
            raw = raw.get('percent')
        cap = Decimal(str(raw))
    except (AppSetting.DoesNotExist, InvalidOperation, TypeError, ValueError):
        return DEFAULT_DISCOUNT_CAP
    if cap.is_nan() or cap < 0 or cap > 100:
        return DEFAULT_DISCOUNT_CAP
    return cap


def _clean_reason(raw) -> str:
    reason = ' '.join(str(raw or '').split()) if isinstance(raw, (str, int, float)) else ''
    if len(reason) < REASON_MIN:
        raise ManagerOkError('REASON_REQUIRED', 'Type a reason (a few words).', http=400)
    return reason[:REASON_MAX]


def approve(request, *, cart, kind: str, reason=None, detail: dict | None = None, cap=None) -> RegisterApproval:
    """The manager's OK for this change, recorded; or ``ManagerOkError``.

    ``reason`` falls back to ``override_reason`` in the body (a discount brings its own). No PIN in the body is
    ``MANAGER_OK_NEEDED`` (the register asks for one); a wrong or locked PIN passes the PIN check's own answer on."""
    data = request.data if hasattr(request.data, 'get') else {}
    pin = data.get('manager_pin')
    pin = pin.strip() if isinstance(pin, str) else ''
    if not pin:
        raise ManagerOkError('MANAGER_OK_NEEDED', _WHAT[kind].format(cap=cap if cap is not None else ''),
                             approval=kind)
    reason = _clean_reason(reason if reason not in (None, '') else data.get('override_reason'))
    register = getattr(getattr(cart, 'drawer', None), 'register', None)
    try:
        manager = check_pin(pin, device=device_key(request, register), min_role='Manager')
    except PinError as exc:
        raise ManagerOkError(exc.code, str(exc), http=exc.http, approval=kind, **exc.extra) from exc
    return RegisterApproval.objects.create(
        kind=kind,
        cart=cart,
        register_code=getattr(register, 'code', '') or '',
        is_training=bool(getattr(register, 'is_training', False)),
        requested_by=request.user,
        approved_by=manager,
        reason=reason,
        detail=detail or {},
    )


def stamp(approval: RegisterApproval) -> dict:
    """What a line's meta keeps about its OK."""
    return {
        'approval_id': approval.pk,
        'approved_by': approval.approved_by.full_name,
        'approved_by_id': approval.approved_by_id,
        'reason': approval.reason,
    }
