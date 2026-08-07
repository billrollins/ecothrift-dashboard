import logging

from django.conf import settings
from django.contrib.auth import get_user_model, authenticate
from django.core.mail import send_mail
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
from .permissions import IsAdmin, IsManagerOrAdmin

from .models import CustomerProfile

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
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user = authenticate(
        request,
        username=serializer.validated_data['email'],
        password=serializer.validated_data['password'],
    )
    if not user:
        return Response(
            {'detail': 'Invalid email or password.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    if not user.is_active:
        return Response(
            {'detail': 'Account is disabled.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    refresh = RefreshToken.for_user(user)
    user_data = UserSerializer(user).data

    response = Response({
        'access': str(refresh.access_token),
        'user': user_data,
    })
    return _set_refresh_cookie(response, str(refresh))


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
        new_access = str(refresh.access_token)
        response = Response({'access': new_access})
        # If token rotation is enabled, set the new refresh token cookie
        if hasattr(refresh, 'access_token'):
            new_refresh = str(refresh)
            response = _set_refresh_cookie(response, new_refresh)
        return response
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
    return _clear_refresh_cookie(response)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    """Return current user data with profiles."""
    user = (
        User.objects.prefetch_related('groups')
        .select_related('employee', 'consignee', 'customer')
        .get(pk=request.user.pk)
    )
    serializer = UserSerializer(user)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """Change the current user's password."""
    serializer = PasswordChangeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    if not request.user.check_password(serializer.validated_data['old_password']):
        return Response(
            {'detail': 'Current password is incorrect.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    request.user.set_password(serializer.validated_data['new_password'])
    request.user.save()
    return Response({'detail': 'Password changed successfully.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_reset_password_view(request, user_id):
    """Admin: reset a user's password to a random temporary password."""
    import secrets
    import string
    try:
        target_user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Generate a random temporary password
    alphabet = string.ascii_letters + string.digits
    temp_password = ''.join(secrets.choice(alphabet) for _ in range(12))
    target_user.set_password(temp_password)
    target_user.save()
    return Response({
        'detail': 'Password reset successfully.',
        'temporary_password': temp_password,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthForgotPasswordThrottle])
def forgot_password_view(request):
    """Request a password reset token. Token is emailed; never returned unless DEBUG."""
    import secrets
    email = request.data.get('email')
    if not email:
        return Response({'detail': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

    # Always the same public message so we do not reveal whether the email exists.
    public_detail = 'If this email is registered, a reset link will be sent.'

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response({'detail': public_detail})

    token = secrets.token_urlsafe(32)
    from django.core.cache import cache
    cache.set(f'password_reset_{token}', user.id, timeout=3600)  # 1 hour

    dash_host = getattr(settings, 'STAFF_DASHBOARD_HOST', 'dash.ecothrift.us')
    body = (
        'You requested a password reset for your Eco-Thrift account.\n\n'
        f'Open https://{dash_host}/forgot-password and paste this token:\n\n'
        f'{token}\n\n'
        'This token expires in one hour. If you did not request a reset, ignore this email.\n'
    )
    send_mail(
        subject='Eco-Thrift password reset',
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )

    payload = {'detail': public_detail}
    # Dev convenience only - never echo the token when DEBUG is off.
    if settings.DEBUG:
        payload['reset_token'] = token
    return Response(payload)


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password_view(request):
    """Reset password using a token from forgot_password."""
    token = request.data.get('token')
    new_password = request.data.get('new_password')
    if not token or not new_password:
        return Response(
            {'detail': 'Token and new_password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(new_password) < 6:
        return Response(
            {'detail': 'Password must be at least 6 characters.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from django.core.cache import cache
    user_id = cache.get(f'password_reset_{token}')
    if not user_id:
        return Response(
            {'detail': 'Invalid or expired reset token.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'detail': 'User not found.'}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save()
    cache.delete(f'password_reset_{token}')
    return Response({'detail': 'Password reset successfully.'})


# ── User CRUD ViewSet ─────────────────────────────────────────────────────────

class UserViewSet(viewsets.ModelViewSet):
    """
    User management (Admin/Manager only).
    Supports list, create, retrieve, update.
    """
    queryset = User.objects.select_related('employee', 'consignee', 'customer').all()
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

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(groups__name=role)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('true', '1'))
        return qs.distinct()

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
    """Flat serializer for customer list/detail."""
    id = serializers.IntegerField(source='user.id', read_only=True)
    email = serializers.EmailField(source='user.email')
    first_name = serializers.CharField(source='user.first_name')
    last_name = serializers.CharField(source='user.last_name')
    phone = serializers.CharField(source='user.phone', required=False, default='', allow_blank=True)
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    customer_number = serializers.CharField(read_only=True)
    customer_since = serializers.DateField(read_only=True)
    notes = serializers.CharField(required=False, default='', allow_blank=True)
    is_active = serializers.BooleanField(source='user.is_active', required=False)
    email_verified = serializers.BooleanField(read_only=True)

    def create(self, validated_data):
        from django.contrib.auth.models import Group

        user_data = validated_data.pop('user', {})
        user = User.objects.create_user(
            email=user_data['email'],
            first_name=user_data.get('first_name', ''),
            last_name=user_data.get('last_name', ''),
            phone=user_data.get('phone', ''),
            password=None,  # Optional; magic-link sign-in is the default path
            is_active=True,
            is_staff=False,
        )
        group, _ = Group.objects.get_or_create(name='Customer')
        user.groups.add(group)
        profile = CustomerProfile.objects.create(
            user=user,
            customer_number=CustomerProfile.generate_customer_number(),
            notes=validated_data.get('notes', ''),
        )
        return profile

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        user = instance.user
        for attr in ('email', 'first_name', 'last_name', 'phone', 'is_active'):
            if attr in user_data:
                setattr(user, attr, user_data[attr])
        user.save()
        if 'notes' in validated_data:
            instance.notes = validated_data['notes']
            instance.save(update_fields=['notes'])
        return instance


class CustomerViewSet(viewsets.ModelViewSet):
    """
    Customer management (Admin/Manager).
    Each customer is a User + CustomerProfile.
    URL pk is the User id (matches the flat serializer `id`).
    """
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = [
        'user__first_name', 'user__last_name', 'user__email',
        'user__phone', 'customer_number',
    ]
    ordering = ['customer_number']
    # Serializer exposes user.id; keep URL pk aligned with that.
    lookup_field = 'user_id'
    lookup_url_kwarg = 'pk'

    def get_queryset(self):
        qs = CustomerProfile.objects.select_related('user').all()
        active = self.request.query_params.get('is_active')
        if active in ('0', 'false', 'False'):
            qs = qs.filter(user__is_active=False)
        elif active in ('1', 'true', 'True'):
            qs = qs.filter(user__is_active=True)
        return qs

    def destroy(self, request, *args, **kwargs):
        """Soft-deactivate instead of hard-deleting account history."""
        profile = self.get_object()
        user = profile.user
        if not user.is_active:
            return Response(CustomerSerializer(profile).data)
        user.is_active = False
        user.save(update_fields=['is_active'])
        return Response(CustomerSerializer(profile).data)

    @action(detail=True, methods=['post'], url_path='reactivate')
    def reactivate(self, request, pk=None):
        profile = self.get_object()
        user = profile.user
        if not user.is_active:
            user.is_active = True
            user.save(update_fields=['is_active'])
        return Response(CustomerSerializer(profile).data)

    @action(detail=True, methods=['post'], url_path='send-sign-in-link')
    def send_sign_in_link(self, request, pk=None):
        """Staff CS action: email a magic-link sign-in (never returns the token)."""
        from apps.accounts.models import MagicLinkToken
        from apps.accounts.services.magic_link import issue_magic_link
        from apps.webstore.emails import send_sign_in_link

        profile = self.get_object()
        email = (profile.user.email or '').strip()
        if not email:
            return Response(
                {'detail': 'This customer has no email address.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not profile.user.is_active:
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

    @action(detail=False, methods=['get'], url_path='lookup/(?P<customer_number>[^/.]+)')
    def lookup(self, request, customer_number=None):
        """Lookup a customer by customer_number (for POS scan)."""
        try:
            profile = CustomerProfile.objects.select_related('user').get(
                customer_number=customer_number,
            )
            return Response(CustomerSerializer(profile).data)
        except CustomerProfile.DoesNotExist:
            return Response(
                {'detail': 'Customer not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )


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

    email = ((request.data or {}).get('email') or '').strip()
    # Always return the same shape (no email enumeration).
    generic = {'detail': 'If that email can receive mail, a sign-in link is on its way.'}
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

    user = (
        User.objects.prefetch_related('groups')
        .select_related('employee', 'consignee', 'customer')
        .get(pk=result.user.pk)
    )
    refresh = RefreshToken.for_user(user)
    response = Response({
        'access': str(refresh.access_token),
        'user': UserSerializer(user).data,
        'redirect_to': result.redirect_to,
        'purpose': result.purpose,
        'needs_password_prompt': result.needs_password_prompt,
        'code': result.code or '',
    })
    return _set_refresh_cookie(response, str(refresh))


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthMagicLinkIpThrottle, AuthMagicLinkEmailThrottle])
def customer_lookup_view(request):
    """Reveal whether an email has a customer account / password (staff emails look empty)."""
    from django.conf import settings as dj_settings

    from apps.accounts.services.magic_link import _STAFF_ROLES, _normalize_email

    if not bool(getattr(dj_settings, 'ONLINE_SALES_ACCOUNTS_ENABLED', True)):
        return _accounts_disabled_response()

    email = _normalize_email((request.data or {}).get('email') or '')
    empty = {'has_account': False, 'has_password': False}
    if not email or '@' not in email:
        return Response(empty)

    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        return Response(empty)
    if user.role in _STAFF_ROLES:
        # Do not leak staff account existence.
        return Response(empty)
    return Response({
        'has_account': True,
        'has_password': user.has_usable_password(),
    })


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
            password=data.get('password') or '',
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
    """Add or change a customer password.

    When the account has no usable password yet, old_password is not required.
    """
    from apps.accounts.permissions import IsCustomer

    if not IsCustomer().has_permission(request, None):
        return Response({'detail': 'Customer accounts only.'}, status=status.HTTP_403_FORBIDDEN)

    data = request.data or {}
    new_password = data.get('password') or data.get('new_password') or ''
    if len(new_password) < 6:
        return Response(
            {'detail': 'Password must be at least 6 characters.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from apps.accounts.services.magic_link import (
        clear_password_change_unlock,
        password_change_unlocked,
    )

    user = request.user
    unlocked = password_change_unlocked(user)
    if user.has_usable_password() and not unlocked:
        old = data.get('old_password') or ''
        if not old or not user.check_password(old):
            return Response(
                {'detail': 'Current password is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    user.set_password(new_password)
    user.save(update_fields=['password'])
    if unlocked:
        clear_password_change_unlock(user)
    refreshed = (
        User.objects.prefetch_related('groups')
        .select_related('employee', 'consignee', 'customer')
        .get(pk=user.pk)
    )
    return Response({
        'detail': 'Password saved.',
        'user': UserSerializer(refreshed).data,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthMagicLinkIpThrottle, AuthMagicLinkEmailThrottle])
def customer_reset_password_view(request):
    """Email a reset link. Password is unset only when the link is consumed."""
    from django.conf import settings as dj_settings

    from apps.accounts.models import MagicLinkToken
    from apps.accounts.services.magic_link import _STAFF_ROLES, _normalize_email, issue_magic_link
    from apps.webstore.emails import send_password_reset_link

    if not bool(getattr(dj_settings, 'ONLINE_SALES_ACCOUNTS_ENABLED', True)):
        return _accounts_disabled_response()

    email = _normalize_email((request.data or {}).get('email') or '')
    generic = {'detail': 'If that email can receive mail, a reset link is on its way.'}
    if not email or '@' not in email:
        return Response(generic)

    user = User.objects.filter(email__iexact=email).first()
    if user is None or user.role in _STAFF_ROLES:
        return Response(generic)

    try:
        token_row = issue_magic_link(
            email=email,
            request_ip=_client_ip(request),
            purpose=MagicLinkToken.PURPOSE_RESET_PASSWORD,
        )
        send_password_reset_link(
            email=email,
            magic_link=_public_verify_link(token_row.token),
        )
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
