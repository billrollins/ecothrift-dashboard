import logging

from django.conf import settings
from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth.models import update_last_login
from rest_framework import serializers, viewsets, status
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

logger = logging.getLogger(__name__)

from .serializers import (
    UserSerializer, UserCreateSerializer, UserUpdateSerializer,
    LoginSerializer, EmployeeProfileSerializer, ConsigneeProfileSerializer,
    PasswordChangeSerializer,
)
from .capabilities import capabilities_for_user, catalog_as_dicts
from .permissions import IsAdmin, IsManagerOrAdmin, IsSuperAdmin

from .models import AccountEvent
from .services import idle

User = get_user_model()


# ── Auth Views ────────────────────────────────────────────────────────────────

REFRESH_COOKIE_NAME = 'refresh_token'
REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


class _FixedScopeThrottle(SimpleRateThrottle):
    """SimpleRateThrottle with a class-level scope (ScopedRateThrottle needs view.throttle_scope)."""

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class AuthLoginThrottle(_FixedScopeThrottle):
    scope = 'auth_login'


class AuthForgotPasswordThrottle(_FixedScopeThrottle):
    scope = 'auth_forgot_password'


class AuthMagicLinkIpThrottle(_FixedScopeThrottle):
    scope = 'auth_magic_link_ip'


class AuthMagicLinkEmailThrottle(_FixedScopeThrottle):
    scope = 'auth_magic_link_email'

    def get_cache_key(self, request, view):
        email = ((request.data or {}).get('email') or '').strip().lower()
        if not email:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': email}


def _set_refresh_cookie(response: Response, refresh_token: str) -> Response:
    """Set the refresh token as an httpOnly cookie."""
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        secure=not settings.DEBUG,
        samesite='Lax',
        path='/api/auth/',     # Only sent to auth endpoints
    )
    return response


def _clear_refresh_cookie(response: Response) -> Response:
    """Remove the refresh token cookie."""
    response.delete_cookie(
        REFRESH_COOKIE_NAME,
        path='/api/auth/',
        samesite='Lax',
    )
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthLoginThrottle])
def login_view(request):
    """Authenticate user and return JWT access token + user data.

    The refresh token is set as an httpOnly cookie.
    """
    from .services import lockout

    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    ident = serializer.validated_data['login'].lower()
    address = _client_ip(request)
    if lockout.is_locked(ident, address):
        return Response(
            {'detail': 'Too many wrong tries. Wait 15 minutes, or ask a manager for a Set password link.',
             'code': 'LOCKED'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    # A username or an email (D16). The email is what Django authenticates with.
    email = ident
    if '@' not in ident:
        email = User.objects.filter(username=ident).values_list('email', flat=True).first() or ident
    from apps.accounts.services.staff_customer import is_staff_login

    known = User.objects.filter(email__iexact=email).first()
    if known is not None and not is_staff_login(known):
        # Owner 2026-10-16: the only passwords are staff's. A customer signs in with an emailed link or code.
        return Response(
            {'detail': 'Customers sign in with an emailed link. No password needed.', 'code': 'EMAIL_LINK'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    user = authenticate(
        request,
        username=email,
        password=serializer.validated_data['password'],
    )
    if not user:
        if lockout.record_failure(ident, address):
            known = User.objects.filter(email__iexact=email).first()
            if known is not None:
                AccountEvent.log(known, AccountEvent.KIND_LOCKED, detail=f'from {address or "unknown address"}')
        return Response(
            {'detail': 'Wrong username or password.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    lockout.clear(ident)
    if not user.is_active:
        return Response(
            {'detail': 'Account is disabled.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # This view mints its own JWT rather than calling django.contrib.auth.login,
    # so the user_logged_in signal never fires and nothing else stamps this.
    update_last_login(None, user)
    idle.stamp(user, force=True)

    refresh = RefreshToken.for_user(user)
    user_data = UserSerializer(user).data

    response = Response({
        'access': str(refresh.access_token),
        'user': user_data,
    })
    return _set_refresh_cookie(response, str(refresh))


# A sign-in stays alive while it is used (owner 2026-10-20: "ensure they do not need to sign in each time"): once the
# refresh token is a day old, a refresh hands out a fresh one, so someone who comes back within the week stays signed in.
# The old one is not blacklisted: two tabs (or two store phones) refreshing at once must not sign each other out.
REFRESH_RENEW_AFTER_SECONDS = 24 * 60 * 60


def _renewed_refresh(refresh: RefreshToken) -> str:
    from django.utils import timezone
    from rest_framework_simplejwt.settings import api_settings

    issued = refresh.payload.get('iat')
    if issued is None or timezone.now().timestamp() - float(issued) < REFRESH_RENEW_AFTER_SECONDS:
        return str(refresh)
    user = User.objects.filter(pk=refresh.payload.get(api_settings.USER_ID_CLAIM), is_active=True).first()
    return str(RefreshToken.for_user(user)) if user is not None else str(refresh)


@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_view(request):
    """Refresh access token using refresh token from httpOnly cookie."""
    refresh_token = request.COOKIES.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        return Response(
            {'detail': 'Refresh token is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        refresh = RefreshToken(refresh_token)
        user = User.objects.filter(pk=refresh.get('user_id')).first()
        device_kind = request.META.get(idle.DEVICE_HEADER)
        from .authentication import issued_before_sign_out

        if user is not None and issued_before_sign_out(user, refresh):
            raise ValueError('signed out on all devices')
        if user is not None and idle.is_idle(user, device_kind):
            # D16: no activity for too long. The cookie is spent so this session cannot be revived.
            try:
                refresh.blacklist()
            except Exception:
                pass
            response = Response(
                {'detail': idle.message(idle.idle_hours(device_kind)), 'code': 'IDLE'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            return _clear_refresh_cookie(response)
        if user is not None:
            idle.stamp(user, force=True)
        new_access = str(refresh.access_token)
        response = Response({'access': new_access})
        return _set_refresh_cookie(response, _renewed_refresh(refresh))
    except Exception:
        response = Response(
            {'detail': 'Invalid or expired refresh token.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        return _clear_refresh_cookie(response)


@api_view(['POST'])
@permission_classes([AllowAny])
def logout_view(request):
    """Blacklist the refresh token and clear the cookie."""
    refresh_token = request.COOKIES.get(REFRESH_COOKIE_NAME)
    if refresh_token:
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            pass
    response = Response({'detail': 'Logged out successfully.'})
    # One account (owner 2026-10-16): signing out of ecothrift.us signs out of the Thrift+ app too.
    from apps.thriftplus.services.one_account import end_member_session

    end_member_session(request, response)
    return _clear_refresh_cookie(response)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def capabilities_view(request):
    """Capability ids the calling user holds today (role + is_superuser)."""
    return Response({'capabilities': capabilities_for_user(request.user)})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdmin])
def capability_catalog_view(request):
    """Full catalog for the Settings → Permissions matrix."""
    return Response({'results': catalog_as_dicts()})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def pay_levels_view(request):
    """The pay levels and their hourly ranges (the ``hr.pay_levels`` setting), for the pay warnings on screen."""
    from .services import pay_levels

    return Response({'levels': pay_levels.payload()})


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def me_view(request):
    """Return current user data with profiles. PATCH accepts language."""
    user = (
        User.objects.prefetch_related('groups')
        .select_related('employee', 'consignee')
        .get(pk=request.user.pk)
    )
    if request.method == 'PATCH':
        language = str(request.data.get('language') or '').strip()
        if language not in ('en', 'es'):
            return Response({'detail': 'Language must be en or es.'}, status=status.HTTP_400_BAD_REQUEST)
        user.language = language
        user.save(update_fields=['language', 'updated_at'])
        user = (
            User.objects.prefetch_related('groups')
            .select_related('employee', 'consignee')
            .get(pk=request.user.pk)
        )
    serializer = UserSerializer(user)
    return Response(serializer.data)


class AuthVerifyPasswordThrottle(_FixedScopeThrottle):
    scope = 'auth_verify_password'


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AuthVerifyPasswordThrottle])
def verify_password_view(request):
    """Confirm the signed-in user's own password (kiosk Exit). Never anyone else's."""
    password = str(request.data.get('password') or '')
    if not password or not request.user.check_password(password):
        return Response({'ok': False, 'detail': 'Wrong password.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'ok': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """Change the current user's password."""
    from .services.staff_password import check_password_rules

    serializer = PasswordChangeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    if not request.user.check_password(serializer.validated_data['old_password']):
        return Response(
            {'detail': 'Current password is incorrect.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        check_password_rules(serializer.validated_data['new_password'], request.user)
    except ValidationError as exc:
        return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

    request.user.set_password(serializer.validated_data['new_password'])
    request.user.save()
    AccountEvent.log(request.user, AccountEvent.KIND_PASSWORD_CHANGED, actor=request.user)
    return Response({'detail': 'Password changed successfully.'})


def _send_staff_reset(user, *, request, requested_by_admin: bool):
    """Issue and email a staff reset link. Returns a DRF Response."""
    from apps.accounts.services.staff_password import issue_staff_reset, staff_reset_link
    from apps.webstore.emails import send_staff_password_reset

    if not (user.email or '').strip():
        return Response(
            {'detail': 'This account has no email address to send to.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not user.is_active:
        return Response(
            {'detail': 'Reactivate this account before sending a reset link.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        token_row = issue_staff_reset(user=user, request_ip=_client_ip(request))
        send_staff_password_reset(
            email=user.email,
            reset_link=staff_reset_link(token_row.token),
            requested_by_admin=requested_by_admin,
        )
    except ValidationError as exc:
        return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        logger.exception('Staff password reset email failed for user %s', user.pk)
        return Response(
            {'detail': 'Could not send the reset email. Try again in a moment.'},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response({'detail': f'Reset link sent to {user.email}.'})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthForgotPasswordThrottle])
def forgot_password_view(request):
    """Email a staff member a single-use reset link. The token is never returned."""
    from apps.accounts.services.staff_password import (
        is_staff_account, issue_staff_reset, staff_reset_link,
    )
    from apps.webstore.emails import send_staff_password_reset

    email = (request.data.get('email') or '').strip()
    if not email:
        return Response({'detail': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

    # Always the same public message so we do not reveal whether the email exists.
    public_detail = 'If that email belongs to a staff account, a reset link is on its way.'

    user = User.objects.filter(email__iexact=email).first()
    # Customers reset through the storefront magic link, not the staff dashboard.
    if user is None or not is_staff_account(user) or not user.is_active:
        return Response({'detail': public_detail})

    try:
        token_row = issue_staff_reset(user=user, request_ip=_client_ip(request))
        send_staff_password_reset(
            email=user.email,
            reset_link=staff_reset_link(token_row.token),
        )
    except ValidationError:
        return Response({'detail': public_detail})
    except Exception:
        logger.exception('Staff password reset email failed for user %s', user.pk)
        return Response(
            {'detail': 'We could not send the reset email. Try again in a moment.'},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response({'detail': public_detail})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthForgotPasswordThrottle])
def reset_password_view(request):
    """Set a new password from an emailed staff reset link."""
    from apps.accounts.services.staff_password import consume_staff_reset

    try:
        user = consume_staff_reset(
            token=request.data.get('token') or '',
            new_password=request.data.get('new_password') or '',
        )
        AccountEvent.log(user, AccountEvent.KIND_PASSWORD_SET, actor=user)
    except ValidationError as exc:
        detail = exc.detail
        if isinstance(detail, dict):
            detail = detail.get('detail', 'Could not reset the password.')
        return Response({'detail': detail}, status=status.HTTP_400_BAD_REQUEST)

    return Response({'detail': 'Password updated. You can sign in now.'})


# ── User CRUD ViewSet ─────────────────────────────────────────────────────────

class UserViewSet(viewsets.ModelViewSet):
    """
    User management (Admin/Manager only).
    Supports list, create, retrieve, update.
    """
    queryset = User.objects.select_related('employee', 'consignee').all()
    permission_classes = [IsAuthenticated, IsAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['email', 'first_name', 'last_name']
    ordering_fields = ['last_name', 'first_name', 'email', 'date_joined']
    ordering = ['last_name', 'first_name']

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        if self.action in ('update', 'partial_update'):
            return UserUpdateSerializer
        return UserSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.action in ('list', 'retrieve'):
            # One query for everyone's hours this week: the red "over their hours" flag on the People screens.
            from apps.hr.services.time_clock_utils import week_hours_by_user

            context['week_hours'] = week_hours_by_user()
        return context

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(groups__name=role)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('true', '1'))
        return qs.distinct()

    def perform_create(self, serializer):
        user = serializer.save()
        AccountEvent.log(user, AccountEvent.KIND_CREATED, actor=self.request.user,
                         detail=f'{user.role or ""} {user.username or user.email}'.strip())

    def perform_update(self, serializer):
        before = serializer.instance
        old = {'role': before.role, 'is_active': before.is_active, 'username': before.username}
        user = serializer.save()
        actor = self.request.user
        if user.role != old['role']:
            AccountEvent.log(user, AccountEvent.KIND_ROLE, actor=actor, detail=f'{old["role"]} → {user.role}')
        if user.is_active != old['is_active']:
            AccountEvent.log(user, AccountEvent.KIND_ON if user.is_active else AccountEvent.KIND_OFF, actor=actor)
        if user.username != old['username']:
            AccountEvent.log(user, AccountEvent.KIND_USERNAME, actor=actor, detail=f'{old["username"]} → {user.username}')

    def destroy(self, request, *args, **kwargs):
        """People are switched off, never deleted (D16): history stays. The owner can't be switched off."""
        user = self.get_object()
        if user.is_superuser:
            return Response({'detail': 'The owner cannot be switched off.'}, status=status.HTTP_400_BAD_REQUEST)
        if user.is_active:
            user.is_active = False
            user.save(update_fields=['is_active', 'updated_at'])
            AccountEvent.log(user, AccountEvent.KIND_OFF, actor=request.user)
        return Response(UserSerializer(user).data)

    @action(detail=True, methods=['post'], url_path='set-password-link')
    def set_password_link(self, request, pk=None):
        """A one-time link (48 hours) for this person to pick their own password: shown once, here, with a QR to
        scan on their phone. Nothing is emailed and nobody types their password for them (D16, Bill 2026-10-06)."""
        from apps.accounts.services.staff_password import SET_PASSWORD_TTL, issue_staff_reset, is_staff_account, staff_reset_link

        user = self.get_object()
        if not is_staff_account(user):
            return Response({'detail': 'Only staff sign in here. A shopper uses the storefront.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not user.is_active:
            return Response({'detail': 'Switch this person on first.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            row = issue_staff_reset(user=user, request_ip=_client_ip(request), ttl=SET_PASSWORD_TTL)
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        AccountEvent.log(user, AccountEvent.KIND_LINK, actor=request.user)
        from apps.accounts.services.usernames import assign_username

        return Response({
            'link': staff_reset_link(row.token) + '&set=1',
            'expires_at': row.expires_at,
            'username': assign_username(user),
        })

    @action(detail=True, methods=['get'], url_path='events')
    def events(self, request, pk=None):
        """This person's account record (newest first). Never a password."""
        user = self.get_object()
        return Response([
            {'kind': e.kind, 'label': e.get_kind_display(), 'detail': e.detail, 'at': e.at,
             'by': e.actor.full_name if e.actor_id else ''}
            for e in user.account_events.select_related('actor')[:100]
        ])

    @action(detail=True, methods=['post'], url_path='clear-register-pin')
    def clear_register_pin(self, request, pk=None):
        """A forgotten register PIN: clear it so the person sets a new one on their Me page. Never shows the PIN."""
        from .services import register_pin

        return Response(register_pin.clear_pin(self.get_object(), actor=request.user))

    @action(detail=True, methods=['patch'])
    def employee_profile(self, request, pk=None):
        """Update the employee profile for a user."""
        user = self.get_object()
        if not hasattr(user, 'employee'):
            return Response(
                {'detail': 'User does not have an employee profile.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = EmployeeProfileSerializer(
            user.employee, data=request.data, partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        """Counts behind the Employees tab strip."""
        from apps.accounts.services.stats import employee_stats

        return Response(employee_stats())

    @action(detail=True, methods=['post'], url_path='send-password-reset')
    def send_password_reset(self, request, pk=None):
        """Email this staff member a single-use reset link. No password is ever shown."""
        from apps.accounts.services.staff_password import is_staff_account

        user = self.get_object()
        if not is_staff_account(user):
            return Response(
                {'detail': 'Only staff accounts reset through the dashboard. '
                           'Use the customer record for a shopper.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return _send_staff_reset(user, request=request, requested_by_admin=True)

    # ── Kiosk card (badge) ───────────────────────────────────────────────────

    def _badge_profile(self, user):
        profile = getattr(user, 'employee', None)
        if profile is None:
            return None, Response(
                {'detail': 'User does not have an employee profile.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return profile, None

    def _mint_badge(self, profile):
        """Rotate the card. Returns the plain token, shown once and never stored."""
        from django.utils import timezone as dj_tz
        from apps.hr.kiosk_service import hash_token, mint_token

        for _ in range(5):
            token = mint_token()
            digest = hash_token(token)
            if not type(profile).objects.filter(badge_token_hash=digest).exclude(pk=profile.pk).exists():
                break
        profile.badge_token_hash = digest
        profile.badge_issued_at = dj_tz.now()
        profile.badge_revoked_at = None
        profile.save(update_fields=['badge_token_hash', 'badge_issued_at', 'badge_revoked_at'])
        return token

    @action(detail=True, methods=['post'], url_path='badge')
    def badge_issue(self, request, pk=None):
        """Mint a kiosk card. Refuses when one is already active (use reprint)."""
        profile, failure = self._badge_profile(self.get_object())
        if failure is not None:
            return failure
        if profile.badge_status == 'active':
            return Response(
                {'detail': 'A card is already active. Reprint to rotate it.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        token = self._mint_badge(profile)
        return Response({'token': token, 'badge_status': profile.badge_status})

    @action(detail=True, methods=['post'], url_path='badge/reprint')
    def badge_reprint(self, request, pk=None):
        """Rotate the card. The previous token stops working immediately."""
        profile, failure = self._badge_profile(self.get_object())
        if failure is not None:
            return failure
        token = self._mint_badge(profile)
        return Response({'token': token, 'badge_status': profile.badge_status})

    @action(detail=True, methods=['post'], url_path='badge/revoke')
    def badge_revoke(self, request, pk=None):
        from django.utils import timezone as dj_tz

        profile, failure = self._badge_profile(self.get_object())
        if failure is not None:
            return failure
        if not profile.badge_token_hash:
            return Response({'detail': 'No card to revoke.'}, status=status.HTTP_400_BAD_REQUEST)
        profile.badge_revoked_at = dj_tz.now()
        profile.save(update_fields=['badge_revoked_at'])
        return Response({'ok': True, 'badge_status': profile.badge_status})

    @action(detail=True, methods=['patch'])
    def consignee_profile(self, request, pk=None):
        """Update the consignee profile for a user."""
        user = self.get_object()
        if not hasattr(user, 'consignee'):
            return Response(
                {'detail': 'User does not have a consignee profile.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = ConsigneeProfileSerializer(
            user.consignee, data=request.data, partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ── Customer CRUD ViewSet ─────────────────────────────────────────────────────

class CustomerSerializer(serializers.Serializer):
    """Flat serializer for customer list/detail. The instance is the customer's website login (a ``User``); the rest of
    what the old customer record held comes from their Thrift+ person (T62, ``one_account.customer_facts``)."""
    id = serializers.IntegerField(source='pk', read_only=True)
    email = serializers.EmailField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    phone = serializers.CharField(required=False, default='', allow_blank=True)
    full_name = serializers.CharField(read_only=True)
    # The member code ("7166 7172 0440"), blank until they have one. The old CUS-nnn number is gone.
    customer_number = serializers.SerializerMethodField()
    customer_since = serializers.SerializerMethodField()
    notes = serializers.CharField(required=False, default='', allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    email_verified = serializers.SerializerMethodField()
    # Annotated on the list queryset; absent on a freshly created login.
    holds_count = serializers.IntegerField(read_only=True, default=0)
    last_hold_at = serializers.DateTimeField(read_only=True, required=False, allow_null=True)

    def _facts(self, user) -> dict:
        from apps.thriftplus.services.one_account import customer_facts

        cache = self.context.setdefault('_facts', {})
        if user.pk not in cache:
            cache[user.pk] = customer_facts(user)
        return cache[user.pk]

    def get_customer_number(self, user):
        return self._facts(user)['number']

    def get_customer_since(self, user):
        return self._facts(user)['since']

    def get_email_verified(self, user):
        return self._facts(user)['email_verified']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['notes'] = self._facts(instance)['notes']
        return data

    def create(self, validated_data):
        from django.contrib.auth.models import Group
        from django.utils import timezone

        from apps.thriftplus.services import one_account

        notes = validated_data.get('notes', '')
        if notes.strip() and not (validated_data.get('first_name') or '').strip():
            raise ValidationError({'notes': 'Add a first name before saving a note (the note lives on their member).'})
        user = User.objects.create_user(
            email=validated_data['email'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            phone=validated_data.get('phone', ''),
            password=None,  # Optional; magic-link sign-in is the default path
            is_active=True,
            is_staff=False,
        )
        group, _ = Group.objects.get_or_create(name='Customer')
        user.groups.add(group)
        # One customer system (T62): a named customer is a Thrift+ person (pending: "finish at a register").
        # An address typed in Dash is trusted, as for a staff-made member.
        person = one_account.person_for_user(user)
        if person is not None and person.email_verified_at is None:
            person.email_verified_at = timezone.now()
            person.save(update_fields=['email_verified_at', 'updated_at'])
        if notes.strip():
            one_account.save_customer_notes(user, notes)
        return user

    def update(self, instance, validated_data):
        from apps.accounts.services.staff_customer import is_staff_login
        from apps.thriftplus.services import one_account

        user = instance
        if is_staff_login(user):
            # Staff are website customers too (owner 2026-10-15), but a staff login's email, name, phone and on/off
            # are changed in People (Admin only), never from a customer record a manager can edit.
            changed = [a for a in ('email', 'first_name', 'last_name', 'phone', 'is_active')
                       if a in validated_data and validated_data[a] != getattr(user, a)]
            if changed:
                raise ValidationError({'detail': 'This is a staff login. Change its email, name, phone or on/off in '
                                                 'People, not here.'})
            validated_data = {k: v for k, v in validated_data.items() if k == 'notes'}
        for attr in ('email', 'first_name', 'last_name', 'phone', 'is_active'):
            if attr in validated_data:
                setattr(user, attr, validated_data[attr])
        user.save()
        if 'notes' in validated_data:
            try:
                one_account.save_customer_notes(user, validated_data['notes'])
            except ValueError as exc:
                raise ValidationError({'notes': str(exc)})
        return user


class CustomerViewSet(viewsets.ModelViewSet):
    """
    Customer management (Admin/Manager).
    Each customer is a website login (a non-staff ``User`` in the Customer group) with its Thrift+ person; the old
    ``CustomerProfile`` is retired (T62). The URL pk is the User id.
    """
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['first_name', 'last_name', 'email', 'phone']
    ordering = ['-date_joined']

    def get_queryset(self):
        from django.db.models import Count, IntegerField, OuterRef, Subquery, Value
        from django.db.models.functions import Coalesce
        from apps.thriftplus.services.one_account import _customer_users
        from apps.webstore.models import Reservation

        # Owner 2026-10-16: staff are not customers; a staff login never shows here.
        qs = _customer_users()
        active = self.request.query_params.get('is_active')
        if active in ('0', 'false', 'False'):
            qs = qs.filter(is_active=False)
        elif active in ('1', 'true', 'True'):
            qs = qs.filter(is_active=True)

        # Holds carry an email, not a customer FK, so the rows join by address.
        holds = Reservation.objects.filter(email__iexact=OuterRef('email'))
        # Group on a constant: grouping on email would split rows that differ
        # only in case, and iexact has already folded those together.
        counted = holds.order_by().annotate(g=Value(1)).values('g').annotate(n=Count('pk'))
        return qs.annotate(
            holds_count=Coalesce(
                Subquery(counted.values('n')[:1], output_field=IntegerField()),
                Value(0),
            ),
            last_hold_at=Subquery(holds.order_by('-created_at').values('created_at')[:1]),
        )

    @staticmethod
    def _staff_login_refusal(user, detail: str):
        """A staff login (a website customer too since 2026-10-15) is never switched off, reset or sent an emailed
        sign-in from a customer record: Dash's People page handles staff. None when ``user`` is a customer's."""
        from apps.accounts.services.staff_customer import is_staff_login

        if is_staff_login(user):
            return Response({'detail': f'This is a staff login. {detail}', 'code': 'STAFF_LOGIN'},
                            status=status.HTTP_400_BAD_REQUEST)
        return None

    def destroy(self, request, *args, **kwargs):
        """Soft-deactivate instead of hard-deleting account history."""
        user = self.get_object()
        refusal = self._staff_login_refusal(user, 'Switch it off in People, not here.')
        if refusal is not None:
            return refusal
        if not user.is_active:
            return Response(CustomerSerializer(user).data)
        user.is_active = False
        user.save(update_fields=['is_active'])
        return Response(CustomerSerializer(user).data)

    @action(detail=True, methods=['post'], url_path='reactivate')
    def reactivate(self, request, pk=None):
        user = self.get_object()
        refusal = self._staff_login_refusal(user, 'Switch it on in People, not here.')
        if refusal is not None:
            return refusal
        if not user.is_active:
            user.is_active = True
            user.save(update_fields=['is_active'])
        return Response(CustomerSerializer(user).data)

    @action(detail=True, methods=['post'], url_path='send-sign-in-link')
    def send_sign_in_link(self, request, pk=None):
        """Staff CS action: email a magic-link sign-in (never returns the token)."""
        from apps.accounts.models import MagicLinkToken
        from apps.accounts.services.magic_link import issue_magic_link
        from apps.webstore.emails import send_sign_in_link

        user = self.get_object()
        refusal = self._staff_login_refusal(
            user, 'Staff sign in with their Dash password (People can send a Set password link).')
        if refusal is not None:
            return refusal
        email = (user.email or '').strip()
        if not email:
            return Response(
                {'detail': 'This customer has no email address.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.is_active:
            return Response(
                {'detail': 'Reactivate the customer before sending a sign-in link.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token_row = issue_magic_link(
                email=email,
                request_ip=_client_ip(request),
                purpose=MagicLinkToken.PURPOSE_SIGN_IN,
            )
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        send_sign_in_link(email=email, magic_link=_public_verify_link(token_row.token))
        return Response({'detail': 'Sign-in link sent.'})

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        """Counts behind the Customers tab strip."""
        from apps.accounts.services.stats import customer_stats

        return Response(customer_stats())

    @action(detail=True, methods=['get'], url_path='rollup')
    def rollup(self, request, pk=None):
        """Everything this person has done with us, for the detail drawer."""
        from apps.accounts.services.stats import customer_rollup

        user = self.get_object()
        return Response(customer_rollup(user))

    @action(detail=True, methods=['post'], url_path='send-password-reset-link')
    def send_password_reset_link_action(self, request, pk=None):
        """Staff CS action: email the customer a sign-in link (owner 2026-10-16: customers have no password; the old
        URL is kept for the Dash button)."""
        from apps.accounts.models import MagicLinkToken
        from apps.accounts.services.magic_link import issue_magic_link
        from apps.webstore.emails import send_sign_in_link

        user = self.get_object()
        refusal = self._staff_login_refusal(user, 'Reset its password in People, not here.')
        if refusal is not None:
            return refusal
        email = (user.email or '').strip()
        if not email:
            return Response(
                {'detail': 'This customer has no email address.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.is_active:
            return Response(
                {'detail': 'Reactivate the customer before sending a sign-in link.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token_row = issue_magic_link(
                email=email,
                request_ip=_client_ip(request),
                purpose=MagicLinkToken.PURPOSE_SIGN_IN,
            )
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        send_sign_in_link(email=token_row.email, magic_link=_public_verify_link(token_row.token))
        return Response({'detail': 'Sign-in link sent.'})


def _accounts_disabled_response():
    return Response(
        {'detail': 'Customer accounts are not available.', 'code': 'ACCOUNTS_DISABLED'},
        status=status.HTTP_410_GONE,
    )


def _client_ip(request) -> str | None:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
    return forwarded or request.META.get('REMOTE_ADDR') or None


def _public_verify_link(token: str) -> str:
    from django.conf import settings as dj_settings
    base = getattr(dj_settings, 'ONLINE_SALES_PUBLIC_BASE_URL', 'https://ecothrift.us').rstrip('/')
    return f'{base}/verify?token={token}'


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthMagicLinkIpThrottle, AuthMagicLinkEmailThrottle])
def magic_link_request_view(request):
    """Request a customer magic-link email. Never echoes the token."""
    from django.conf import settings as dj_settings

    from apps.accounts.models import MagicLinkToken
    from apps.accounts.services.magic_link import issue_magic_link
    from apps.webstore.emails import send_sign_in_link

    if not bool(getattr(dj_settings, 'ONLINE_SALES_ACCOUNTS_ENABLED', True)):
        return _accounts_disabled_response()

    from apps.accounts.services.staff_customer import is_staff_login

    email = ((request.data or {}).get('email') or '').strip()
    # Always return the same shape (no email enumeration).
    generic = {'detail': 'If that email can receive mail, a sign-in link is on its way.'}
    if email and is_staff_login(User.objects.filter(email__iexact=email).first()):
        # A staff login signs in with its Dash password: an emailed link would be refused, so none is sent.
        return Response(generic)
    try:
        token_row = issue_magic_link(
            email=email,
            request_ip=_client_ip(request),
            purpose=MagicLinkToken.PURPOSE_SIGN_IN,
        )
    except ValidationError:
        return Response(generic)
    except Exception:
        logger.exception('magic_link_request unexpected failure for %s', email)
        return Response(generic)

    try:
        send_sign_in_link(email=token_row.email, magic_link=_public_verify_link(token_row.token))
    except Exception:
        pass

    return Response(generic)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthMagicLinkIpThrottle])
def magic_link_consume_view(request):
    """Consume a magic-link token; issue JWT + refresh cookie. Token never returned."""
    from django.conf import settings as dj_settings

    from apps.accounts.models import MagicLinkToken
    from apps.accounts.services.magic_link import consume_magic_link
    from rest_framework.exceptions import ValidationError as DRFValidationError

    raw = (request.data or {}).get('token') or ''
    # Peek purpose so verify_hold / verify_thread work when accounts are killed.
    peek = MagicLinkToken.objects.filter(token=(raw or '').strip()).first()
    accounts_on = bool(getattr(dj_settings, 'ONLINE_SALES_ACCOUNTS_ENABLED', True))
    if not accounts_on and (peek is None or peek.purpose not in MagicLinkToken.VERIFY_PURPOSES):
        return _accounts_disabled_response()

    try:
        result = consume_magic_link(
            token=raw,
            request_ip=request.META.get('REMOTE_ADDR'),
        )
    except DRFValidationError as exc:
        return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

    # Hold-verify soft outcomes: forward to the hold page without issuing a JWT.
    if not result.issue_session or result.user is None:
        return Response({
            'redirect_to': result.redirect_to,
            'purpose': result.purpose,
            'needs_password_prompt': False,
            'code': result.code or 'ALREADY_VERIFIED',
        })

    from apps.thriftplus.services import one_account

    user = (
        User.objects.prefetch_related('groups')
        .select_related('employee', 'consignee')
        .get(pk=result.user.pk)
    )
    if one_account.switched_off(user):
        return Response({'detail': one_account.OFF_TEXT, 'code': 'ACCOUNT_OFF'}, status=status.HTTP_403_FORBIDDEN)
    update_last_login(None, user)
    refresh = RefreshToken.for_user(user)
    response = Response({
        'access': str(refresh.access_token),
        'user': UserSerializer(user).data,
        'redirect_to': result.redirect_to,
        'purpose': result.purpose,
        'needs_password_prompt': False,
        'code': result.code or '',
    })
    # One account (owner 2026-10-16): the same sign-in opens the Thrift+ app (a pending membership is made when the
    # customer had none: no customer account that is not Thrift+).
    one_account.add_member_session(request, response, user)
    return _set_refresh_cookie(response, str(refresh))


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthMagicLinkIpThrottle, AuthMagicLinkEmailThrottle])
def customer_lookup_view(request):
    """Reveal whether an email has a customer account / password.

    An active staff login answers ``has_account`` and ``has_password`` (owner 2026-10-15: staff are website customers
    too), so the sign-in page asks for the Dash password; ``password_only`` tells it not to offer an emailed link,
    which is refused for staff. A switched-off staff login still looks empty.
    """
    from django.conf import settings as dj_settings

    from apps.accounts.services.magic_link import _normalize_email
    from apps.accounts.services.staff_customer import is_staff_login

    if not bool(getattr(dj_settings, 'ONLINE_SALES_ACCOUNTS_ENABLED', True)):
        return _accounts_disabled_response()

    email = _normalize_email((request.data or {}).get('email') or '')
    empty = {'has_account': False, 'has_password': False}
    if not email or '@' not in email:
        return Response(empty)

    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        return Response(empty)
    if is_staff_login(user):
        if not user.is_active:
            return Response(empty)
        return Response({'has_account': True, 'has_password': True, 'password_only': True})
    return Response({'has_account': True, 'has_password': False})  # customers have no password (2026-10-16)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthMagicLinkIpThrottle, AuthMagicLinkEmailThrottle])
def customer_register_view(request):
    """Create a customer account (password optional) and email a verify link."""
    from django.conf import settings as dj_settings

    from apps.accounts.services.magic_link import register_customer
    from apps.webstore.emails import send_email_verification
    from rest_framework.exceptions import ValidationError as DRFValidationError

    if not bool(getattr(dj_settings, 'ONLINE_SALES_ACCOUNTS_ENABLED', True)):
        return _accounts_disabled_response()

    data = request.data or {}
    try:
        user, token_row = register_customer(
            email=data.get('email') or '',
            first_name=data.get('first_name') or '',
            request_ip=_client_ip(request),
        )
    except DRFValidationError as exc:
        return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

    try:
        send_email_verification(
            email=token_row.email,
            magic_link=_public_verify_link(token_row.token),
        )
    except Exception:
        pass

    return Response(
        {
            'detail': 'Check your email to confirm your account.',
            'email': user.email,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def customer_set_password_view(request):
    """Gone (owner 2026-10-16): customers have no password; they sign in with an emailed link or code. A staff
    password is changed in Dash."""
    return Response({'detail': 'Customers have no password. Sign in with an emailed link.', 'code': 'PASSWORDS_GONE'},
                    status=status.HTTP_410_GONE)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthMagicLinkIpThrottle, AuthMagicLinkEmailThrottle])
def customer_reset_password_view(request):
    """Email a reset link. Password is unset only when the link is consumed."""
    from django.conf import settings as dj_settings

    from apps.accounts.models import MagicLinkToken
    from apps.accounts.services.magic_link import _normalize_email, issue_magic_link
    from apps.accounts.services.staff_customer import is_staff_login
    from apps.webstore.emails import send_sign_in_link

    if not bool(getattr(dj_settings, 'ONLINE_SALES_ACCOUNTS_ENABLED', True)):
        return _accounts_disabled_response()

    email = _normalize_email((request.data or {}).get('email') or '')
    generic = {'detail': 'If that email can receive mail, a link is on its way.'}
    if not email or '@' not in email:
        return Response(generic)

    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        return Response(generic)
    if is_staff_login(user):
        # Never the customer reset (it would clear a Dash password). An active staff member gets the Dash reset link,
        # the same one Dash's "Forgot password" sends; the answer is the same either way.
        from apps.accounts.services.staff_password import is_staff_account

        if user.is_active and is_staff_account(user):
            _send_staff_reset(user, request=request, requested_by_admin=False)
        return Response(generic)

    # A customer has no password (owner 2026-10-16): "Forgot password" from an old page sends a sign-in link.
    try:
        token_row = issue_magic_link(
            email=email,
            request_ip=_client_ip(request),
            purpose=MagicLinkToken.PURPOSE_SIGN_IN,
        )
        send_sign_in_link(email=token_row.email, magic_link=_public_verify_link(token_row.token))
    except Exception:
        logger.exception('customer_reset_password failed for %s', email)
        return Response(generic)

    return Response(generic)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AuthMagicLinkIpThrottle])
def customer_resend_verification_view(request):
    """Resend verify_email for the signed-in customer."""
    from django.conf import settings as dj_settings

    from apps.accounts.models import MagicLinkToken
    from apps.accounts.permissions import IsCustomer
    from apps.accounts.services.magic_link import customer_email_verified, issue_magic_link
    from apps.webstore.emails import send_email_verification

    if not IsCustomer().has_permission(request, None):
        return Response({'detail': 'Customer accounts only.'}, status=status.HTTP_403_FORBIDDEN)
    if not bool(getattr(dj_settings, 'ONLINE_SALES_ACCOUNTS_ENABLED', True)):
        return _accounts_disabled_response()
    from apps.accounts.services.staff_customer import ensure_staff_customer, is_staff_login

    if is_staff_login(request.user):
        # An emailed link is refused for a staff login, so none is sent. An active staff member's Dash email is
        # trusted: the ensure stamps it confirmed.
        ensure_staff_customer(request.user)
        verified = customer_email_verified(request.user)
        return Response({
            'detail': 'Email is already verified.' if verified else 'This is a staff login: no confirmation link.',
            'email_verified': verified,
        })
    if customer_email_verified(request.user):
        return Response({'detail': 'Email is already verified.', 'email_verified': True})

    token_row = issue_magic_link(
        email=request.user.email,
        request_ip=_client_ip(request),
        purpose=MagicLinkToken.PURPOSE_VERIFY_EMAIL,
    )
    try:
        send_email_verification(
            email=token_row.email,
            magic_link=_public_verify_link(token_row.token),
        )
    except Exception:
        pass

    return Response({'detail': 'Confirmation link sent.', 'email_verified': False})


# ── Merge a customer login into a staff login (owner 2026-10-15) ──────────────

class LoginMergeViewSet(viewsets.ViewSet):
    """
    Merge a customer login into a staff login (``services/login_merge.py``). The owner (superuser) only; Dash → Thrift+
    → Staff, "Merge a customer login…":
    - GET ``login-merge/candidates/?staff_user=&q=``: customer logins that may be theirs (the same email name, phone or
      first and last name) and, with ``q``, a search by email, name or phone;
    - GET ``login-merge/preview/?staff_user=&source_user=``: what would move, or why it is refused (nothing changes);
    - POST ``login-merge/merge/ {staff_user, source_user}``: merge; the staff login survives.
    """

    permission_classes = [IsAuthenticated, IsSuperAdmin]

    @staticmethod
    def _user(raw):
        raw = str(raw or '').strip()
        return User.objects.filter(pk=raw).first() if raw.isdigit() else None

    def _staff(self, raw):
        from .services.staff_customer import is_active_staff

        user = self._user(raw)
        return user if is_active_staff(user) else None

    @action(detail=False, methods=['get'])
    def candidates(self, request):
        from .services import login_merge

        staff = self._staff(request.query_params.get('staff_user'))
        if staff is None:
            return Response({'detail': 'Pick an active staff login.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'suggestions': login_merge.suggestions(staff),
            'results': login_merge.search(staff, request.query_params.get('q') or ''),
        })

    @action(detail=False, methods=['get'])
    def preview(self, request):
        from .services import login_merge

        staff = self._staff(request.query_params.get('staff_user'))
        if staff is None:
            return Response({'detail': 'Pick an active staff login.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(login_merge.preview(self._user(request.query_params.get('source_user')), staff))
        except login_merge.MergeError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def merge(self, request):
        from .services import login_merge

        staff = self._staff(request.data.get('staff_user'))
        if staff is None:
            return Response({'detail': 'Pick an active staff login.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = login_merge.merge_customer_login(self._user(request.data.get('source_user')), staff,
                                                      actor=request.user)
        except login_merge.MergeError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)
