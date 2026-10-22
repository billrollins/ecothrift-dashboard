"""Filters for the B-Stock dispute page (bstock_dispute.html)."""

from decimal import Decimal, InvalidOperation

from django import template

register = template.Library()


@register.filter
def money(value) -> str:
    """'49417.00' -> '$49,417.00'; empty or unknown -> '-'."""
    if value in (None, ''):
        return '-'
    try:
        return f'${Decimal(str(value)):,.2f}'
    except (InvalidOperation, ValueError):
        return '-'
