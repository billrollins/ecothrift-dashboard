from django.contrib.auth import get_user_model, authenticate
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .serializers import (
    UserSerializer, UserCreateSerializer, UserUpdateSerializer,
    LoginSerializer, EmployeeProfileSerializer, ConsigneeProfileSerializer,
    PasswordChangeSerializer,
)
from .permissions import IsAdmin, IsManagerOrAdmin

User = get_user_model()


# ── Auth Views ────────────────────────────────────────────────────────────────

REFRESH_COOKIE_NAME = 'refresh_token'
REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


def _set_refresh_cookie(response: Response, refresh_token: str) -> Response:
    """Set the refresh token as an httpOnly cookie."""
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        secure=False,          # Set True in production via HTTPS
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
    serializer = UserSerializer(request.user)
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
