"""The order rule (owner, 2026-10-26; no AI judgement): at or under min, order up to max in whole packs; else 0.

Each line carries the reason in plain words so the owner sees why.
"""
from __future__ import annotations

import math


def _units(n: int, unit: str) -> str:
    unit = (unit or '').strip()
    return f'{n} {unit}'.strip()


def order_packs(on_hand: int, min_qty: int, max_qty: int, pack_size: int, unit: str = '') -> tuple[int, str]:
    """(packs to order, why)."""
    pack_size = max(1, int(pack_size or 1))
    on_hand, min_qty, max_qty = int(on_hand), int(min_qty), int(max_qty)
    if on_hand > min_qty:
        return 0, f'On hand {on_hand} is above min {min_qty}: no order.'
    need = max_qty - on_hand
    if need <= 0:
        return 0, f'On hand {on_hand} is at or under min {min_qty}, but max {max_qty} is already met: no order.'
    packs = math.ceil(need / pack_size)
    if pack_size == 1:
        how = f'{packs}'
    else:
        how = f'{packs} pack{"s" if packs != 1 else ""} of {pack_size} ({packs * pack_size} in all)'
    return packs, (
        f'On hand {on_hand} is at or under min {min_qty}: up to max {max_qty} needs '
        f'{_units(need, unit)}, so order {how}.'
    )
