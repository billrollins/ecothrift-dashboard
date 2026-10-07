"""Staff purchases API: the owner's switches, payroll-deduction checks at the register, and the list for QuickBooks."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsTeamMember
from apps.pos.services import staff_purchases as service


def _is_owner(user) -> bool:
    return bool(user.is_superuser or getattr(user, 'role', None) == 'Admin')


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated, IsTeamMember])
def staff_purchase_settings(request):
    """Read by every register; changed by the owner (Admin) only."""
    if request.method == 'PUT':
        if not _is_owner(request.user):
            return Response({'detail': 'Only the owner (Admin) changes this.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            return Response(service.save_settings(request.data or {}, user=request.user))
        except service.StaffPurchaseError as exc:
            return Response({'detail': str(exc), 'code': exc.code}, status=status.HTTP_400_BAD_REQUEST)
    return Response(service.settings_value())


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTeamMember])
def payroll_people(request):
    """Who can be picked for payroll deduction at the register: active staff (the check runs per person)."""
    from apps.accounts.models import User

    users = User.objects.filter(is_active=True, groups__name__in=service.STAFF_ROLES).distinct().order_by(
        'first_name', 'last_name')
    return Response([{'id': u.pk, 'name': (u.full_name or '').strip() or u.email} for u in users])


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTeamMember])
def payroll_eligibility(request):
    """``?employee=<id>&amount=12.34``: can they pay this by payroll deduction, and how much is left?"""
    from apps.accounts.models import User

    user = User.objects.filter(pk=request.query_params.get('employee') or 0).first()
    try:
        amount = Decimal(str(request.query_params.get('amount'))) if request.query_params.get('amount') else None
    except Exception:
        amount = None
    return Response(service.eligibility(user, cashier=request.user, amount=amount))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def payroll_deductions(request):
    """``?day=YYYY-MM-DD``: that pay period's payroll-deduction purchases per person, for QuickBooks."""
    day = request.query_params.get('day')
    try:
        for_day = date.fromisoformat(day) if day else None
    except ValueError:
        return Response({'detail': 'Use a date like 2026-10-07.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response(service.deductions(for_day))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def payroll_mark_entered(request):
    """``{employee, period_start}``: this person's total for that pay period is in QuickBooks Payroll."""
    try:
        service.mark_entered(employee_id=int(request.data.get('employee')),
                             period_start=date.fromisoformat(str(request.data.get('period_start'))), by=request.user)
    except (TypeError, ValueError):
        return Response({'detail': 'employee and period_start are needed.'}, status=status.HTTP_400_BAD_REQUEST)
    except service.StaffPurchaseError as exc:
        return Response({'detail': str(exc), 'code': exc.code}, status=status.HTTP_400_BAD_REQUEST)
    return Response(service.deductions(date.fromisoformat(str(request.data.get('period_start')))))
