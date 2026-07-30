from django.conf import settings
from django.contrib.auth import get_user_model, authenticate
from django.core.mail import send_mail
from rest_framework import serializers, viewsets, status
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

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
    # Dev convenience only — never echo the token when DEBUG is off.
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
    phone = serializers.CharField(source='user.phone', required=False, default='')
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    customer_number = serializers.CharField(read_only=True)
    customer_since = serializers.DateField(read_only=True)
    notes = serializers.CharField(required=False, default='')

    def create(self, validated_data):
        user_data = validated_data.pop('user', {})
        user = User.objects.create_user(
            email=user_data['email'],
            first_name=user_data.get('first_name', ''),
            last_name=user_data.get('last_name', ''),
            phone=user_data.get('phone', ''),
            password=None,  # No login needed
            is_active=True,
            is_staff=False,
        )
        profile = CustomerProfile.objects.create(
            user=user,
            customer_number=CustomerProfile.generate_customer_number(),
            notes=validated_data.get('notes', ''),
        )
        return profile

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        user = instance.user
        for attr in ('email', 'first_name', 'last_name', 'phone'):
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
    """
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = [
        'user__first_name', 'user__last_name', 'user__email',
        'user__phone', 'customer_number',
    ]
    ordering = ['customer_number']

    def get_queryset(self):
        return CustomerProfile.objects.select_related('user').all()

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


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthMagicLinkIpThrottle, AuthMagicLinkEmailThrottle])
def magic_link_request_view(request):
    """Request a customer magic-link email. Never echoes the token."""
    from django.conf import settings as dj_settings

    from apps.accounts.services.magic_link import issue_magic_link
    from apps.webstore.emails import send_sign_in_link

    if not bool(getattr(dj_settings, 'ONLINE_SALES_ACCOUNTS_ENABLED', True)):
        return Response(
            {'detail': 'Customer accounts are not available.', 'code': 'ACCOUNTS_DISABLED'},
            status=status.HTTP_410_GONE,
        )

    email = ((request.data or {}).get('email') or '').strip()
    # Always return the same shape (no email enumeration).
    generic = {'detail': 'If that email can receive mail, a sign-in link is on its way.'}
    try:
        ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR')
        token_row = issue_magic_link(email=email, request_ip=ip or None)
    except Exception:
        return Response(generic)

    base = getattr(dj_settings, 'ONLINE_SALES_PUBLIC_BASE_URL', 'https://ecothrift.us').rstrip('/')
    link = f'{base}/account/sign-in?token={token_row.token}'
    try:
        send_sign_in_link(email=token_row.email, magic_link=link)
    except Exception:
        pass

    payload = dict(generic)
    if getattr(dj_settings, 'DEBUG', False):
        # Dev only — never in production responses.
        payload['debug_token'] = token_row.token
    return Response(payload)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthMagicLinkIpThrottle])
def magic_link_consume_view(request):
    """Consume a magic-link token; issue JWT + refresh cookie. Token never returned."""
    from django.conf import settings as dj_settings

    from apps.accounts.services.magic_link import consume_magic_link
    from rest_framework.exceptions import ValidationError as DRFValidationError

    if not bool(getattr(dj_settings, 'ONLINE_SALES_ACCOUNTS_ENABLED', True)):
        return Response(
            {'detail': 'Customer accounts are not available.', 'code': 'ACCOUNTS_DISABLED'},
            status=status.HTTP_410_GONE,
        )

    raw = (request.data or {}).get('token') or ''
    try:
        user = consume_magic_link(token=raw)
    except DRFValidationError as exc:
        return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

    refresh = RefreshToken.for_user(user)
    response = Response({
        'access': str(refresh.access_token),
        'user': UserSerializer(user).data,
    })
    return _set_refresh_cookie(response, str(refresh))
