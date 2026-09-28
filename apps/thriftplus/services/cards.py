"""
Thrift+ card codes: 12 digits, the last a Luhn check digit, random, and never the account id.

- **QR payload:** ``TP`` + the 12 digits (``TP123456789012``). The same scanner reads price tags
  and cards, and the prefix tells them apart.
- **Printed form:** in groups of four (``1234 5678 9012``), for typing by hand when a card won't scan.
- **Parsing:** ``parse`` accepts any of these (spaces and dashes are fine) and returns the bare
  code, or None when the check digit fails.
"""
from __future__ import annotations

import re
import secrets

from django.db import IntegrityError, transaction

from apps.thriftplus.models import Card, CardBatch

QR_PREFIX = 'TP'
CODE_DIGITS = 12
MAX_BATCH = 500


def luhn_digit(body: str) -> str:
    """The check digit that makes ``body + digit`` pass Luhn."""
    total = 0
    for i, ch in enumerate(reversed(body)):
        d = int(ch)
        if i % 2 == 0:  # the digit next to the check digit is doubled
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return str((10 - total % 10) % 10)


def is_valid(code: str) -> bool:
    return bool(re.fullmatch(r'\d{12}', code or '')) and luhn_digit(code[:-1]) == code[-1]


def new_code() -> str:
    # First digit 1-9, so a code never loses a leading zero in a spreadsheet.
    body = str(secrets.randbelow(9) + 1) + ''.join(str(secrets.randbelow(10)) for _ in range(CODE_DIGITS - 2))
    return body + luhn_digit(body)


def parse(raw: str | None) -> str | None:
    """The bare code from a scan or typed entry (``TP…``, spaces, dashes), if it is valid."""
    text = (raw or '').strip().upper()
    if text.startswith(QR_PREFIX):
        text = text[len(QR_PREFIX):]
    digits = re.sub(r'[\s\-]', '', text)
    return digits if is_valid(digits) else None


def qr_payload(code: str) -> str:
    return f'{QR_PREFIX}{code}'


def display(code: str) -> str:
    return ' '.join(code[i:i + 4] for i in range(0, len(code), 4))


def generate_batch(size: int, *, user=None, note: str = '') -> CardBatch:
    """``size`` new blank cards (``unissued``) with unique codes, as one batch."""
    if not 1 <= size <= MAX_BATCH:
        raise ValueError(f'A batch is 1 to {MAX_BATCH} cards.')
    with transaction.atomic():
        batch = CardBatch.objects.create(size=size, note=note[:200], created_by=user)
        made = 0
        while made < size:
            try:
                with transaction.atomic():
                    Card.objects.create(code=new_code(), batch=batch)
                made += 1
            except IntegrityError:
                continue  # a rare duplicate code: draw again
    return batch
