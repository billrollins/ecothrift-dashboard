"""
The public Thrift+ API for the scanner app and portal (thrift_plus_rewards Phase 4), under
``/api/thriftplus/public/``.

- **Auth:** every view here uses only ``MemberSessionAuthentication`` (the ``tp_session`` cookie),
  never the staff JWT. A member session can't reach a staff endpoint, and a staff token means
  nothing here.
- **Guests** use the tag lookup and the signals only. Their cart stays on the phone.
- **Shapes** match ``frontend/src/api/thriftPlusMock.ts``.
"""
from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from apps.thriftplus.models import MemberLogin, MemberSession
from apps.thriftplus.services import ledger, member_auth, scanner
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
        return {'status': 'signed_out'}
    person = user.person
    login = MemberLogin.objects.filter(person=person).first()
    card = person.cards.filter(status='active').order_by('-issued_at').first()
    balances = ledger.balances(user.account)
    return {
        'status': 'member',
        'member': {
            'first_name': person.first_name, 'email': login.email if login else '', 'username': login.username if login else None,
            'card_last4': card.code[-4:] if card else None, 'verified_18': person.verified_18,
            'cover': balances['cover'], 'banked_rewards': balances['banked'], 'credit_balance': balances['credit'],
            'session_kind': user.session.kind, 'has_login': login is not None,
        },
    }


def _signed_in(request, person, kind: str) -> Response:
    token, session = member_auth.start_session(person, kind, user_agent=request.META.get('HTTP_USER_AGENT', ''))
    request.user = member_auth.Member(session=session)
    return member_auth.set_cookie(Response(_session_payload(request)), token, session)


# ── Session ────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes(AUTH)
@permission_classes([AllowAny])
def session(request):
    return Response(_session_payload(request))


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def sign_in_password(request):
    try:
        person = member_auth.sign_in_password(request.data.get('login', ''), request.data.get('password', ''))
    except AuthError as exc:
        return _error(exc, status.HTTP_401_UNAUTHORIZED)
    return _signed_in(request, person, MemberSession.KIND_PASSWORD)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def sign_in_card(request):
    try:
        person = member_auth.sign_in_card(request.data.get('card_code', ''), request.data.get('phone_last4', ''))
    except AuthError as exc:
        return _error(exc, status.HTTP_401_UNAUTHORIZED)
    return _signed_in(request, person, MemberSession.KIND_CARD)


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


@api_view(['POST'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def cart_choice(request):
    try:
        return Response(scanner.set_choice(request.user.account, str(request.data.get('choice') or '')))
    except ValueError as exc:
        return _error(exc)


@api_view(['GET'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def history(request):
    return Response(scanner.history(request.user.account))


# ── The portal: self-service for people, cards and money ───────────────────────

def _me_payload(request) -> dict:
    """The membership as its member sees it: people, cards (last 4 only), the cover, balances, recent money."""
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
        'money': [{'kind': e.kind, 'amount': str(e.amount), 'reason': e.reason, 'created_at': e.created_at} for e in entries],
        'can_change': request.user.session.kind == MemberSession.KIND_PASSWORD,
        # Your own email (T74): account email follows the address; store news can be turned off.
        'emails': {**member_email.choices(you), 'has_email': bool(you.email), 'note': member_email.NOTE},
    }


@api_view(['GET'])
@authentication_classes(AUTH)
@permission_classes([IsMember])
def me(request):
    """The membership as its member sees it: people, cards (last 4 only), the cover, balances, recent money."""
    return Response(_me_payload(request))


def _password_session(request) -> Response | None:
    if request.user.session.kind != MemberSession.KIND_PASSWORD:
        return Response({'detail': 'Sign in with your email and password to change your membership.', 'code': 'NEEDS_PASSWORD'},
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
