"""Suspend (owner 2026-10-20): the cashier sets the sale aside, rings someone else, and brings it back later.

A suspended cart (``status='suspended'``) belongs to the register's drawer, not to the cashier. Its items stay as they
are on the shelf (no sale is written), but they are *held*: no other sale, on this register or any other, can take them
(``held_elsewhere``). Resuming turns it back into the open sale and works the totals and Thrift+ data out again.
Deleting it, or closing the drawer, voids it; nothing was sold, so no item changes.
"""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.pos.models import Cart, CartLine

SUSPENDED = 'suspended'

HELD_CODE = 'ITEM_SET_ASIDE'


class SuspendError(Exception):
    def __init__(self, message: str, code: str = 'SUSPEND_ERROR'):
        super().__init__(message)
        self.code = code


def _training(cart: Cart) -> bool:
    return bool(getattr(getattr(cart.drawer, 'register', None), 'is_training', False))


def held_elsewhere(item, exclude_cart_id=None) -> Cart | None:
    """The real suspended sale that is holding this item, if any. Practice (training) sales never hold real items."""
    qs = CartLine.objects.filter(item=item, cart__status=SUSPENDED, cart__drawer__register__is_training=False)
    if exclude_cart_id is not None:
        qs = qs.exclude(cart_id=exclude_cart_id)
    line = qs.select_related('cart__drawer__register').first()
    return line.cart if line else None


def held_message(cart: Cart) -> str:
    register = getattr(getattr(cart.drawer, 'register', None), 'name', '') or 'a register'
    return f'This item is on a sale that was set aside at {register}. Bring that sale back, or delete it, first.'


def suspended_in_drawer(drawer_id: int, cashier_id: int | None = None):
    qs = (Cart.objects.filter(drawer_id=drawer_id, status=SUSPENDED)
          .select_related('thrift_member__person').prefetch_related('lines').order_by('suspended_at', 'pk'))
    if cashier_id is not None:
        qs = qs.filter(cashier_id=cashier_id)
    return qs


def tab_payload(cart: Cart) -> dict:
    """One bookmark tab: who (member first name, else none), how many items, the total, and when it was set aside."""
    first = ''
    try:
        first = cart.thrift_member.person.first_name or ''
    except Exception:  # no member on the sale (or Thrift+ is dark here)
        first = ''
    items = sum(int(line.quantity or 0) for line in cart.lines.all() if line.line_kind in ('item', 'manual'))
    return {
        'id': cart.pk,
        'member_first_name': first.strip(),
        'item_count': items,
        'total': str(cart.total),
        'suspended_at': cart.suspended_at.isoformat() if cart.suspended_at else None,
        'cashier_name': getattr(cart.cashier, 'full_name', '') or '',
    }


def _has_lines(cart: Cart) -> bool:
    return CartLine.objects.filter(cart_id=cart.pk).exists()


def suspend(cart_id: int) -> Cart:
    """Set an open sale aside. Needs at least one line: an empty sale has nothing to hold."""
    with transaction.atomic():
        cart = Cart.objects.select_for_update().select_related('drawer__register').get(pk=cart_id)
        if cart.status != 'open':
            raise SuspendError('Only a sale that is open can be set aside.', 'NOT_OPEN')
        if not _has_lines(cart):
            raise SuspendError('This sale is empty. Scan an item first.', 'EMPTY_SALE')
        if cart.drawer.status != 'open':
            raise SuspendError('This drawer is closed.', 'DRAWER_CLOSED')
        cart.status = SUSPENDED
        cart.suspended_at = timezone.now()
        cart.save(update_fields=['status', 'suspended_at'])
    return cart


def resume(cart_id: int, current_cart_id: int | None = None) -> Cart:
    """Bring a suspended sale back as the open one. If the cashier's current sale has items it is set aside in its
    place (one step, so a failure leaves both as they were); an empty current sale is voided (nothing on it)."""
    with transaction.atomic():
        cart = Cart.objects.select_for_update().select_related('drawer__register').get(pk=cart_id)
        if cart.status != SUSPENDED:
            raise SuspendError('This sale is not set aside.', 'NOT_SUSPENDED')
        if cart.drawer.status != 'open':
            raise SuspendError('This drawer is closed.', 'DRAWER_CLOSED')
        if not _training(cart):
            for line in CartLine.objects.filter(cart_id=cart.pk, item__isnull=False).select_related('item'):
                if line.item.status == 'sold':
                    raise SuspendError(
                        f'{line.item.sku} was sold while this sale was set aside. Delete this sale.', 'ITEM_SOLD')
        if current_cart_id and int(current_cart_id) != cart.pk:
            current = (Cart.objects.select_for_update().filter(
                pk=current_cart_id, drawer_id=cart.drawer_id, status='open').first())
            if current is not None:
                if _has_lines(current):
                    current.status = SUSPENDED
                    current.suspended_at = timezone.now()
                    current.save(update_fields=['status', 'suspended_at'])
                else:
                    current.status = 'voided'
                    current.save(update_fields=['status'])
        cart.status = 'open'
        cart.suspended_at = None
        cart.save(update_fields=['status', 'suspended_at'])
    # Totals, member prices and Thrift+ credit worked out again against today's rules and balances.
    cart.recalculate()
    return cart


def void_suspended(cart: Cart, user=None) -> None:
    """Void one suspended sale (the caller holds the transaction). Nothing was sold, so no item or drawer changes."""
    from apps.pos.views import _cancel_delivery_jobs_for_cart
    from apps.thriftplus.services.register import after_void

    cart.status = 'voided'
    cart.suspended_at = None
    cart.save(update_fields=['status', 'suspended_at'])
    _cancel_delivery_jobs_for_cart(cart)
    after_void(cart, user=user)


def delete_suspended(cart_id: int, user=None) -> Cart:
    with transaction.atomic():
        cart = Cart.objects.select_for_update().get(pk=cart_id)
        if cart.status != SUSPENDED:
            raise SuspendError('This sale is not set aside.', 'NOT_SUSPENDED')
        void_suspended(cart, user)
    return cart


def void_all_for_drawer(drawer_id: int, user=None) -> int:
    """Drawer close: every sale still set aside is voided. Returns how many."""
    n = 0
    for cart in Cart.objects.select_for_update().filter(drawer_id=drawer_id, status=SUSPENDED):
        void_suspended(cart, user)
        n += 1
    return n
