"""
The public Thrift+ API for the scanner app and portal (thrift_plus_rewards Phase 4), under
``/api/thriftplus/public/``.

- **Auth:** every view here uses only ``MemberSessionAuthentication`` (the ``tp_session`` cookie),
  never the staff JWT. A member session can't reach a staff endpoint, and a staff token means
  nothing here.
- **Guests** (non-members, in customer words since 10-15) use the tag lookup and the signals only. Their cart stays on
  the phone.
- **Joining and signing in** (owner 2026-10-15, J8 and J11): ``join/`` with a name and email, ``session/email/``
  ("Email me a link"), then ``session/link/`` or ``session/code/``. The send answers never say whether an email is a
  member's.
- **Shapes** match ``frontend/src/api/thriftPlusMock.ts``.
"""
from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from apps.thriftplus.models import Account, MemberLogin, MemberSession
from apps.thriftplus.services import ledger, member_auth, members, scanner
from apps.thriftplus.services.member_auth import AuthError, IsMember, MemberSessionAuthentication

AUTH = [MemberSessionAuthentication]


class _Throttle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        ident = request.user.pk if isinstance(request.user, member_auth.Member) else self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class LoginThrottle(_Throttle):
    scope = 'thriftplus_login'


class ResetThrottle(_Throttle):
    scope = 'thriftplus_reset'


class ScanThrottle(_Throttle):
    scope = 'thriftplus_scan'


def _error(exc: Exception, code: int = status.HTTP_400_BAD_REQUEST) -> Response:
    return Response({'detail': str(exc), 'code': getattr(exc, 'code', 'ERROR')}, status=code)


def _session_payload(request) -> dict:
    user = request.user
    if not isinstance(user, member_auth.Member):
        return {'status': 'signed_out', 'price_first': members.price_first()}
    person = user.person
    login = MemberLogin.objects.filter(person=person).first()
    card = person.cards.filter(status='active').order_by('-issued_at').first()
    balances = ledger.balances(user.account)
    return {
        'status': 'member',
        'price_first': members.price_first(),
        'member': {
            'first_name': person.first_name, 'email': login.email if login else person.email,
            'username': login.username if login else None,
            # Owner 2026-10-15 (J2, J8): joined online and not finished at a register yet: "not ready", collects nothing.
            'ready': user.account.status == Account.STATUS_ACTIVE, 'email_verified': person.email_verified_at is not None,
            'card_last4': card.code[-4:] if card else None, 'verified_18': person.verified_18,
            'banked_rewards': balances['banked'], 'bucks_available': balances['available'],
            'bucks_use_by': balances['bucks_use_by'], 'credit_balance': balances['credit'],
            'session_kind': user.session.kind, 'has_login': login is not None,
            # Thrift+ is still off: this is a staff or practice member testing it (the scanner shows a test bar).
            'test_mode': not members.is_enabled(),
        },
    }


def _signed_in(request, person, kind: str) -> Response:
    token, session = member_auth.start_session(person, kind, user_agent=request.META.get('HTTP_USER_AGENT', ''))
    request.user = member_auth.Member(session=session)
    return member_auth.set_cookie(Response(_session_payload(request)), token, session)


def _client_ip(request) -> str:
    # Heroku's router adds the visitor's address last; anything before it came from the visitor.
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (forwarded.split(',')[-1].strip() if forwarded else request.META.get('REMOTE_ADDR', '')) or ''


def _public_base() -> str:
    """Where emailed links point: the public site, as for the password reset."""
    return getattr(settings, 'ONLINE_SALES_PUBLIC_BASE_URL', '') or 'https://ecothrift.us'


def _limited(exc: member_auth.LimitError) -> Response:
    body = {'detail': str(exc), 'code': exc.code}
    if exc.retry_after:
        body['retry_after'] = exc.retry_after
    return Response(body, status=status.HTTP_429_TOO_MANY_REQUESTS)


# ── Session ────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes(AUTH)
@permission_classes([AllowAny])
def session(request):
    response = Response(_session_payload(request))
    # A member's sign-in lasts a year from their last visit (owner 2026-10-14): renew it, and its cookie.
    current = member_auth.session_for(request.COOKIES.get(member_auth.COOKIE))
    if current is not None and member_auth.renew(current):
        member_auth.set_cookie(response, request.COOKIES[member_auth.COOKIE], current)
    return response


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def sign_in_password(request):
    try:
        person = member_auth.sign_in_password(request.data.get('login', ''), request.data.get('password', ''))
    except AuthError as exc:
        return _error(exc, status.HTTP_401_UNAUTHORIZED)
    refused = _closed_to(request, person)
    return refused or _signed_in(request, person, MemberSession.KIND_PASSWORD)


def _closed_to(request, person) -> Response | None:
    """While Thrift+ is off, only staff and practice members may sign in (staff test mode, 2026-10-10)."""
    if members.open_to(request) or members.is_tester(person.account):
        return None
    return Response({'detail': 'Thrift+ opens soon. Ask at the register.', 'code': 'THRIFT_PLUS_OFF'},
                    status=status.HTTP_403_FORBIDDEN)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def sign_in_card(request):
    try:
        person = member_auth.sign_in_card(request.data.get('card_code', ''), request.data.get('phone_last4', ''))
    except AuthError as exc:
        return _error(exc, status.HTTP_401_UNAUTHORIZED)
    refused = _closed_to(request, person)
    return refused or _signed_in(request, person, MemberSession.KIND_CARD)


# ── Joining and signing in by email (owner 2026-10-15, J8 and J11) ─────────────

SENT = {'status': 'sent'}


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def join(request):
    """Join online: ``{name, email}``. Always ``{status: 'sent'}`` for a valid request (a new email gets a pending
    membership and the join email; a member's email gets a sign-in email). 400 NAME_NEEDED or EMAIL_BAD; 429 over the
    limits."""
    try:
        member_auth.join(str(request.data.get('name') or ''), str(request.data.get('email') or ''),
                         base_url=_public_base(), ip=_client_ip(request))
    except member_auth.LimitError as exc:
        return _limited(exc)
    except AuthError as exc:
        return _error(exc)
    return Response(SENT)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def session_email(request):
    """"Email me a link": ``{email}``. Always ``{status: 'sent'}`` (never says whether the email is a member's)."""
    try:
        member_auth.request_link(str(request.data.get('email') or ''), base_url=_public_base(), ip=_client_ip(request))
    except member_auth.LimitError as exc:
        return _limited(exc)
    except AuthError as exc:
        return _error(exc)
    return Response(SENT)


def _email_signed_in(request, row, how: str) -> Response:
    refused = _closed_to(request, row.person)  # before the link or code is used up
    if refused:
        return refused
    try:
        person = member_auth.redeem(row, how=how)
    except AuthError as exc:
        return _error(exc)
    response = _signed_in(request, person, MemberSession.KIND_EMAIL)
    response.data['purpose'] = row.purpose
    return response


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def session_link(request):
    """The emailed link (``/scan?signin=<token>``): ``{token}``. Signs in (a year) and confirms the email, with
    ``purpose`` 'join' or 'sign_in'. 400 LINK_USED, LINK_EXPIRED or LINK_BAD."""
    try:
        row = member_auth.check_link(str(request.data.get('token') or ''))
    except AuthError as exc:
        return _error(exc)
    return _email_signed_in(request, row, 'link')


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def session_code(request):
    """The emailed 6-digit code: ``{email, code}``, the same as the link. 400 CODE_BAD or CODE_EXPIRED; 429 over the
    tries from one address."""
    try:
        row = member_auth.check_code(str(request.data.get('email') or ''), str(request.data.get('code') or ''),
                                     ip=_client_ip(request))
    except member_auth.LimitError as exc:
        return _limited(exc)
    except AuthError as exc:
        return _error(exc)
    return _email_signed_in(request, row, 'code')


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([AllowAny])
def sign_out(request):
    if isinstance(request.user, member_auth.Member):
        MemberSession.objects.filter(pk=request.user.session.pk).update(revoked_at=member_auth.timezone.now())
    return member_auth.clear_cookie(Response({'status': 'signed_out'}))


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([ResetThrottle])
def password_reset(request):
    base = getattr(settings, 'ONLINE_SALES_PUBLIC_BASE_URL', '') or 'https://ecothrift.us'
    return Response({'sent_to': member_auth.request_reset(request.data.get('email', ''), base_url=base)})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([ResetThrottle])
def password_reset_confirm(request):
    try:
        person = member_auth.confirm_reset(request.data.get('token', ''), request.data.get('password', ''))
    except AuthError as exc:
        return _error(exc)
    return _signed_in(request, person, MemberSession.KIND_PASSWORD)


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
@throttle_classes([LoginThrottle])
def set_up_login(request):
    try:
        member_auth.set_up_login(request.user.person, email=request.data.get('email', ''),
                                 username=request.data.get('username'), password=request.data.get('password', ''))
    except AuthError as exc:
        return _error(exc)
    return Response(_session_payload(request))


# ── Tags and signals ───────────────────────────────────────────────────────────

def _member_account(request):
    return request.user.account if isinstance(request.user, member_auth.Member) else None


@api_view(['GET'])
@authentication_classes(AUTH)
@permission_classes([AllowAny])
@throttle_classes([ScanThrottle])
def tag(request, sku: str):
    """``TagLookup`` for one tag; logs a scan."""
    item = scanner.find_item(sku)
    if item is None:
        return Response({'status': 'not_found', 'sku': sku})
    scanner.signal('scan', item, _member_account(request))
    return Response({'status': 'found', 'item': scanner.item_card(item)})


@api_view(['GET'])
@authentication_classes(AUTH)
@permission_classes([AllowAny])
def test_tags(request):
    """Staff testing without a camera (owner 2026-10-10): a few tags to pick. Staff, practice members and phones
    with the preview code only."""
    account = _member_account(request)
    if not (members.is_tester(account) or members._has_preview_code(request)):
        return Response({'detail': 'Staff only.', 'code': 'NOT_STAFF'}, status=status.HTTP_403_FORBIDDEN)
    return Response({'tags': scanner.test_tags()})


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([AllowAny])
@throttle_classes([ScanThrottle])
def pass_item(request):
    item = scanner.find_item(request.data.get('sku', ''))
    if item is not None:
        scanner.signal('pass', item, _member_account(request))
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([AllowAny])
@throttle_classes([ScanThrottle])
def guest_added(request):
    """A guest added a tag to the cart on their phone: counted for scans-to-adds, with no account."""
    item = scanner.find_item(request.data.get('sku', ''))
    if item is not None and not isinstance(request.user, member_auth.Member):
        scanner.signal('add', item, None)
    return Response(status=status.HTTP_204_NO_CONTENT)


FEEL_REASONS = {'too_high', 'retail_wrong', 'wrong_info', 'too_low', 'other'}


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([AllowAny])
@throttle_classes([ScanThrottle])
def price_feel(request):
    item = scanner.find_item(request.data.get('sku', ''))
    reason = request.data.get('reason')
    if item is not None and reason in FEEL_REASONS:
        scanner.signal('feel', item, _member_account(request), reason=reason,
                       would_pay=str(request.data.get('would_pay') or '') or None)
    return Response(status=status.HTTP_204_NO_CONTENT)


# ── The member's cart and history ──────────────────────────────────────────────

def _item_or_404(sku: str):
    item = scanner.find_item(sku)
    if item is None:
        return None, Response({'detail': 'No item with that tag.', 'code': 'NOT_FOUND'}, status=status.HTTP_404_NOT_FOUND)
    return item, None


@api_view(['GET'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def cart(request):
    return Response(scanner.cart_payload(request.user.account))


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
@throttle_classes([ScanThrottle])
def cart_add(request):
    item, missing = _item_or_404(request.data.get('sku', ''))
    if missing:
        return missing
    if item.status != 'on_shelf':
        return Response({'detail': 'That item is no longer on the floor.', 'code': 'NOT_AVAILABLE'}, status=status.HTTP_400_BAD_REQUEST)
    return Response(scanner.add(request.user.account, item))


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def cart_qty(request):
    item, missing = _item_or_404(request.data.get('sku', ''))
    if missing:
        return missing
    try:
        qty = int(request.data.get('qty', 0))
    except (TypeError, ValueError):
        return Response({'detail': 'qty must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response(scanner.set_qty(request.user.account, item, qty))


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def cart_clear(request):
    return Response(scanner.clear(request.user.account))


@api_view(['GET'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def history(request):
    return Response(scanner.history(request.user.account))


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def history_clear(request):
    return Response(scanner.clear_history(request.user.account))


# ── The portal: self-service for people, cards and money ───────────────────────

def _me_payload(request) -> dict:
    """The membership as its member sees it: people, cards (last 4 only), balances, recent money."""
    account = request.user.account
    people = []
    for p in account.people.filter(removed_at__isnull=True).order_by('role', 'pk'):
        people.append({
            'id': p.pk, 'first_name': p.first_name, 'role': p.role, 'verified_18': p.verified_18, 'is_you': p.pk == request.user.person.pk,
            'cards': [{'id': c.pk, 'last4': c.code[-4:], 'status': c.status} for c in p.cards.exclude(status='unissued')],
        })
    entries = account.ledger.order_by('-created_at', '-pk')[:20]
    from apps.thriftplus.services import emails as member_email

    you = request.user.person
    return {
        **ledger.balances(account), 'people': people,
        # The member's ThriftBucks in the order they are used (Thrift+ credit is 'credit'; it never expires).
        'rewards': ledger.reward_lots(account),
        'money': [{'kind': e.kind, 'amount': str(e.amount), 'reason': e.reason, 'created_at': e.created_at} for e in entries],
        'can_change': request.user.session.kind in member_auth.CHANGE_KINDS,
        # Your own email (T74): account email follows the address; store news can be turned off.
        'emails': {**member_email.choices(you), 'has_email': bool(you.email), 'note': member_email.NOTE},
    }


@api_view(['GET'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def me(request):
    """The membership as its member sees it: people, cards (last 4 only), balances, recent money."""
    return Response(_me_payload(request))


@api_view(['GET'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def my_card(request):
    """The code behind the app's My card (owner 2026-10-14: the physical card is optional, J2): the signed-in person's
    active card, or for a person with none, a card that lives in the app (no batch, never printed). The QR holds
    exactly what the register's card scan reads (``TP`` + 12 digits), so the register needs no change."""
    from django.db import transaction
    from django.utils import timezone

    from apps.thriftplus.models import Card
    from apps.thriftplus.services import cards

    person = request.user.person
    card = Card.objects.filter(person=person, status=Card.STATUS_ACTIVE).order_by('-issued_at', '-pk').first()
    if card is None:
        with transaction.atomic():
            code = cards.new_code()
            while Card.objects.filter(code=code).exists():
                code = cards.new_code()
            card = Card.objects.create(code=code, person=person, status=Card.STATUS_ACTIVE, issued_at=timezone.now())
            members.log('app_card', account=request.user.account, person=person, card=card)
    return Response({
        'code': card.code, 'display': cards.display(card.code), 'qr': cards.qr_payload(card.code),
        'first_name': person.first_name,
        # J2 (owner 2026-10-15): joined online and not finished at a register yet is "not ready"; the app says
        # "Finish joining at any register. Show them this code."
        'ready': request.user.account.status == Account.STATUS_ACTIVE,
    })


def _password_session(request) -> Response | None:
    """Changes need a password or an emailed link (owner 2026-10-15: members have no password), not the old card."""
    if request.user.session.kind not in member_auth.CHANGE_KINDS:
        return Response({'detail': 'Sign in with an emailed link to change your membership.', 'code': 'NEEDS_PASSWORD'},
                        status=status.HTTP_403_FORBIDDEN)
    return None


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def emails(request):
    """Turn your store news emails off or back on ({news}). Turning off works from any sign-in; turning back on
    needs the email-and-password sign-in."""
    from apps.thriftplus.services import emails as member_email
    from apps.thriftplus.services.members import MemberError

    opted_in = str(request.data.get('news')).lower() in ('1', 'true', 'yes', 'on')
    if opted_in:
        refused = _password_session(request)
        if refused:
            return refused
    try:
        member_email.set_news(request.user.person, opted_in, how='Thrift+ My account (the member)')
    except MemberError as exc:
        return _error(exc)
    return Response(_me_payload(request))


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def card_lost(request):
    """Stop a lost card at once (the member's own, or, for the primary, the second adult's)."""
    refused = _password_session(request)
    if refused:
        return refused
    from apps.thriftplus.models import Card

    card = Card.objects.select_related('person').filter(pk=request.data.get('card'), person__account=request.user.account).first()
    you = request.user.person
    if card is None or (card.person_id != you.pk and you.role != 'primary'):
        return Response({'detail': 'That is not your card.'}, status=status.HTTP_404_NOT_FOUND)
    from apps.thriftplus.services import members

    members.kill_card(card, reason='reported lost by the member')
    return Response(_me_payload(request))


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def remove_person(request):
    """The primary takes the second adult off, or the second adult leaves. Nothing else."""
    refused = _password_session(request)
    if refused:
        return refused
    from apps.thriftplus.models import Person
    from apps.thriftplus.services import members
    from apps.thriftplus.services.members import MemberError

    you = request.user.person
    target = Person.objects.filter(pk=request.data.get('person'), account=request.user.account, removed_at__isnull=True).first()
    if target is None:
        return Response({'detail': 'No such person on your membership.'}, status=status.HTTP_404_NOT_FOUND)
    removed_by = 'self' if target.pk == you.pk else ('primary' if you.role == 'primary' else '')
    try:
        members.remove_second_adult(target, removed_by=removed_by)
    except MemberError as exc:
        return _error(exc)
    if target.pk == you.pk:
        return member_auth.clear_cookie(Response({'status': 'signed_out'}))
    return Response(_me_payload(request))
