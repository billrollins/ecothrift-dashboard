"""The Me page (critic review 2026-10-21, digest point 3): one page for every staff login.

``GET me/page/`` gathers what is mine: details and emergency contact, register PIN status, my weekly shifts. Hours and
pay, onboarding and check-ins come from their own endpoints. ``PATCH me/details/`` edits my phone and emergency
contact; ``POST me/pin/`` sets my register PIN (my password first); ``POST sign-out-everywhere/`` ends every sign-in
of mine, this one too.
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import AccountEvent, User
from .permissions import IsTeamMember
from .services import register_pin
from .views import AuthVerifyPasswordThrottle, _clear_refresh_cookie

WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']


def _profile(user):
    return getattr(user, 'employee', None)


def _schedule(user) -> list[dict]:
    """My weekly shifts: each named shift I'm on, its hours and my days (0 = Monday)."""
    from apps.hr.models import ShiftAssignment

    rows = (ShiftAssignment.objects.filter(employee=user, shift__is_active=True)
            .select_related('shift', 'shift__department').order_by('shift__time_in'))
    out = []
    for row in rows:
        days = row.weekday_list()
        if not days:
            continue
        shift = row.shift
        out.append({
            'shift': shift.name, 'department': shift.department.name if shift.department_id else '',
            'time_in': shift.time_in.strftime('%H:%M'), 'time_out': shift.time_out.strftime('%H:%M'),
            'days': sorted(days), 'day_names': [WEEKDAYS[d] for d in sorted(days)],
        })
    return out


def page_payload(user) -> dict:
    profile = _profile(user)
    return {
        'details': {
            'first_name': user.first_name, 'last_name': user.last_name, 'email': user.email,
            'username': user.username or '', 'phone': user.phone, 'role': user.role or '',
        },
        'employee': {
            'employee_number': profile.employee_number, 'position': profile.position,
            'department': profile.department.name if profile.department_id else '',
            'hire_date': profile.hire_date, 'emergency_name': profile.emergency_name,
            'emergency_phone': profile.emergency_phone,
        } if profile is not None else None,
        'pin': register_pin.status(user),
        'schedule': _schedule(user),
        # A slot for my drawers and covers (Lane A, the register's drawer life); empty until that ships.
        'drawers': None,
    }


def _me(request) -> User:
    return User.objects.select_related('employee', 'employee__department').get(pk=request.user.pk)


@api_view(['GET'])
@permission_classes([IsTeamMember])
def me_page_view(request):
    return Response(page_payload(_me(request)))


@api_view(['PATCH'])
@permission_classes([IsTeamMember])
def me_details_view(request):
    """My phone and emergency contact. Name, email and job details are a manager's to change."""
    user = _me(request)
    data = request.data
    if 'phone' in data:
        phone = str(data.get('phone') or '').strip()[:30]
        if phone and sum(ch.isdigit() for ch in phone) < 10:
            raise ValidationError({'phone': 'A phone number with area code.'})
        user.phone = phone
        user.save(update_fields=['phone', 'updated_at'])
    if 'emergency_name' in data or 'emergency_phone' in data:
        from apps.hiring.onboarding import save_emergency_contact

        save_emergency_contact(user, name=str(data.get('emergency_name') or ''),
                               phone=str(data.get('emergency_phone') or ''))
    return Response(page_payload(_me(request)))


@api_view(['POST'])
@permission_classes([IsTeamMember])
@throttle_classes([AuthVerifyPasswordThrottle])
def me_pin_view(request):
    """Set or change my register PIN. My password first, so a sign-in left open can't be used to set one."""
    user = _me(request)
    if not user.check_password(str(request.data.get('password') or '')):
        return Response({'detail': 'Your password is wrong.', 'code': 'PASSWORD_WRONG'},
                        status=status.HTTP_400_BAD_REQUEST)
    try:
        register_pin.set_pin(user, str(request.data.get('pin') or ''), actor=user)
    except register_pin.PinError as exc:
        return Response(exc.payload(), status=exc.http)
    return Response(page_payload(_me(request)))


def end_all_sessions(user) -> int:
    """Spend every refresh token of this login and refuse access tokens issued before now. Answers how many."""
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    live = OutstandingToken.objects.filter(user=user, expires_at__gt=timezone.now(), blacklistedtoken__isnull=True)
    count = 0
    for token in live:
        BlacklistedToken.objects.get_or_create(token=token)
        count += 1
    user.sessions_ended_at = timezone.now()
    user.save(update_fields=['sessions_ended_at'])
    AccountEvent.log(user, AccountEvent.KIND_SIGNED_OUT_ALL, actor=user, detail=f'{count} sign-ins ended')
    return count


@api_view(['POST'])
@permission_classes([IsTeamMember])
def sign_out_everywhere_view(request):
    """Sign out on all devices, this one too (a lost phone, a shared computer left signed in)."""
    count = end_all_sessions(request.user)
    response = Response({'detail': 'Signed out on all devices.', 'ended': count})
    return _clear_refresh_cookie(response)
