"""POS cart discount amounts - dollar, percent, and the Google Review offer."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

TWOPLACE = Decimal('0.01')

REASON_STORE_CREDIT = 'In-store credit (return)'
REASON_GOOGLE_REVIEW = 'Google Review'
GOOGLE_REVIEW_PERCENT = Decimal('5')
GOOGLE_REVIEW_MAX = Decimal('5.00')


class DiscountError(Exception):
    def __init__(self, detail: str, code: str, http_status: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.code = code
        self.http_status = http_status


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(TWOPLACE, rounding=ROUND_HALF_UP)


def parse_positive_money(raw) -> Decimal:
    try:
        amount = _quantize(Decimal(str(raw)))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise DiscountError('Invalid amount.', 'INVALID_AMOUNT') from exc
    if amount <= 0:
        raise DiscountError('amount must be greater than zero.', 'INVALID_AMOUNT')
    return amount


def parse_percent(raw) -> Decimal:
    try:
        percent = Decimal(str(raw))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise DiscountError('Invalid percent.', 'INVALID_PERCENT') from exc
    if percent <= 0 or percent > 100:
        raise DiscountError('percent must be greater than 0 and at most 100.', 'INVALID_PERCENT')
    return percent


def google_review_cap(amount: Decimal, base: Decimal) -> Decimal:
    """5% of the chosen base, never more than $5 - the printed receipt offer."""
    if base <= 0:
        return Decimal('0.00')
    offer = min(_quantize(base * GOOGLE_REVIEW_PERCENT / 100), GOOGLE_REVIEW_MAX)
    return min(amount, offer)


def resolve_discount_amount(
    *,
    mode: str,
    raw_amount,
    raw_percent,
    base: Decimal,
    reason: str,
) -> tuple[Decimal, Decimal | None]:
    """Return (dollar amount, percent used or None)."""
    mode = (mode or 'amount').strip().lower()
    if mode not in ('amount', 'percent'):
        raise DiscountError('mode must be amount or percent.', 'INVALID_MODE')

    percent: Decimal | None = None
    if mode == 'percent':
        source = raw_percent if raw_percent not in (None, '') else raw_amount
        percent = parse_percent(source)
        if base <= 0:
            raise DiscountError(
                'Add items before applying a percent discount.',
                'INVALID_AMOUNT',
            )
        amount = _quantize(base * percent / 100)
        if amount <= 0:
            raise DiscountError('amount must be greater than zero.', 'INVALID_AMOUNT')
    else:
        amount = parse_positive_money(raw_amount)
        if base > 0:
            percent = (amount / base * 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    if reason == REASON_GOOGLE_REVIEW:
        capped = google_review_cap(amount, base)
        if capped <= 0:
            raise DiscountError(
                'Add items before applying a Google Review discount.',
                'INVALID_AMOUNT',
            )
        if capped != amount:
            amount = capped
            percent = GOOGLE_REVIEW_PERCENT if base <= 0 else (
                (amount / base * 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            )
        elif percent is None:
            percent = GOOGLE_REVIEW_PERCENT

    return amount, percent


def normalize_review_username(raw) -> str:
    name = ' '.join(str(raw or '').split())
    if not name:
        raise DiscountError('Enter the Google review username.', 'REVIEW_USERNAME_REQUIRED')
    if len(name) > 80:
        raise DiscountError('Google username is too long.', 'REVIEW_USERNAME_TOO_LONG')
    return name


def review_username_key(name: str) -> str:
    return name.casefold()


def parse_review_stars(raw) -> int:
    try:
        stars = int(raw)
    except (TypeError, ValueError) as exc:
        raise DiscountError('Enter the star rating from the review (1-5).', 'REVIEW_STARS_REQUIRED') from exc
    if stars < 1 or stars > 5:
        raise DiscountError('Star rating must be 1 to 5.', 'REVIEW_STARS_INVALID')
    return stars


def assert_google_review_available(cart, username, stars) -> tuple[str, int, str]:
    """Require username + stars; reject a username already used on an open or completed sale."""
    from apps.pos.models import CartLine

    name = normalize_review_username(username)
    star_n = parse_review_stars(stars)
    key = review_username_key(name)

    already_on_cart = cart.lines.filter(
        line_kind=CartLine.LINE_KIND_DISCOUNT,
        meta__reason=REASON_GOOGLE_REVIEW,
    ).exists()
    if already_on_cart:
        raise DiscountError(
            'This ticket already has a Google Review discount.',
            'REVIEW_ALREADY_ON_CART',
        )

    prior = (
        CartLine.objects.filter(
            line_kind=CartLine.LINE_KIND_DISCOUNT,
            cart__status__in=('open', 'completed'),
            meta__reason=REASON_GOOGLE_REVIEW,
            meta__google_review_username_key=key,
        )
        .select_related('cart')
        .first()
    )
    if prior is not None:
        from apps.pos.models import Receipt

        rec = (
            Receipt.objects.filter(cart_id=prior.cart_id)
            .values_list('receipt_number', flat=True)
            .first()
        )
        label = rec or f'cart #{prior.cart_id}'
        raise DiscountError(
            f'That Google username already redeemed this offer ({label}).',
            'REVIEW_USERNAME_USED',
        )
    return name, star_n, key


def list_google_review_usernames(query: str = '') -> list[dict]:
    """Newest-first unique usernames from open/completed Google Review discounts."""
    from apps.pos.models import CartLine

    needle = ' '.join(str(query or '').split()).casefold()
    rows = (
        CartLine.objects.filter(
            line_kind=CartLine.LINE_KIND_DISCOUNT,
            cart__status__in=('open', 'completed'),
            meta__reason=REASON_GOOGLE_REVIEW,
        )
        .order_by('-created_at')
        .values('meta')[:500]
    )
    seen: set[str] = set()
    out: list[dict] = []
    for row in rows:
        meta = row['meta'] or {}
        name = str(meta.get('google_review_username') or '').strip()
        stored_key = meta.get('google_review_username_key')
        key = str(stored_key or (review_username_key(name) if name else ''))
        if not name or not key or key in seen:
            continue
        if needle and needle not in key and needle not in name.casefold():
            continue
        seen.add(key)
        stars = meta.get('google_review_stars')
        try:
            stars = int(stars) if stars is not None else None
        except (TypeError, ValueError):
            stars = None
        out.append({'username': name, 'username_key': key, 'stars': stars})
        if len(out) >= 50:
            break
    return out
