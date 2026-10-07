"""Check-ins API (Phase 5): People → Check-ins for managers, My check-ins for the employee."""
from __future__ import annotations

from datetime import date

from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsTeamMember
from apps.core.files import stream_s3
from apps.hiring import checkins as service
from apps.hiring.models import CheckIn


def _person(user) -> dict | None:
    if not user:
        return None
    return {'id': user.pk, 'email': user.email, 'name': (user.full_name or '').strip() or user.email}


def _row(c: CheckIn, *, full: bool = False) -> dict:
    today = timezone.localdate()
    out = {
        'id': c.pk, 'day': c.day, 'due_date': c.due_date, 'status': c.status, 'status_label': c.get_status_display(),
        'user': _person(c.user), 'manager': _person(c.manager), 'onboarding': c.onboarding_id,
        'due': service.is_due(c, today), 'overdue': service.is_overdue(c, today), 'signed_at': c.signed_at,
        'has_pdf': bool(c.signed_pdf_id), 'skipped_reason': c.skipped_reason, 'started': bool(c.form),
    }
    if full:
        out.update({
            'form': service.form_of(c), 'answers': c.answers or {'questions': {}, 'areas': {}},
            'employee_comments': c.employee_comments, 'close_onboarding': c.close_onboarding,
            'can_close_onboarding': bool(c.onboarding_id) and service.is_last(c),
            'manager_name': c.manager_name, 'employee_name': c.employee_name,
        })
    return out


def _checkin(pk) -> CheckIn:
    return get_object_or_404(CheckIn.objects.select_related('user', 'manager', 'onboarding'), pk=pk)


@api_view(['GET'])
@permission_classes([IsManagerOrAdmin])
def checkin_list(request):
    """``?when=due`` (default: coming up within a week, and overdue), ``upcoming``, ``done`` or ``all``."""
    when = request.query_params.get('when') or 'due'
    qs = CheckIn.objects.select_related('user', 'manager').order_by('due_date', 'id')
    if when in ('due', 'upcoming'):
        qs = qs.filter(status=CheckIn.STATUS_SCHEDULED)
    elif when == 'done':
        qs = qs.exclude(status=CheckIn.STATUS_SCHEDULED).order_by('-due_date', '-id')
    rows = [c for c in qs[:300]]
    if when == 'due':
        rows = [c for c in rows if service.is_due(c)]
    return Response([_row(c) for c in rows])


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def checkin_schedule(request):
    """Check-ins for someone hired before onboarding existed: ``{user, start_date, manager}``."""
    from apps.accounts.models import User

    user = User.objects.filter(pk=request.data.get('user') or 0, is_active=True).first()
    if user is None:
        raise ValidationError({'user': 'Pick the employee.'})
    try:
        start = date.fromisoformat(str(request.data.get('start_date')))
    except ValueError:
        raise ValidationError({'start_date': 'Use a date like 2026-10-12.'})
    manager = User.objects.filter(pk=request.data.get('manager') or 0).first()
    made = service.schedule(user=user, start_date=start, manager=manager)
    return Response([_row(c) for c in made], status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH'])
@permission_classes([IsManagerOrAdmin])
def checkin_detail(request, pk):
    row = _checkin(pk)
    if request.method == 'PATCH':
        from apps.accounts.models import User

        manager = None
        if request.data.get('manager'):
            manager = User.objects.filter(pk=request.data.get('manager')).first()
        service.save(row, answers=request.data.get('answers'), employee_comments=request.data.get('employee_comments'),
                     close_onboarding=request.data.get('close_onboarding'), manager=manager)
        row = _checkin(pk)
    return Response(_row(row, full=True))


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
@parser_classes([JSONParser])
def checkin_sign(request, pk):
    row = _checkin(pk)
    if any(k in request.data for k in ('answers', 'employee_comments', 'close_onboarding')):
        service.save(row, answers=request.data.get('answers'), employee_comments=request.data.get('employee_comments'),
                     close_onboarding=request.data.get('close_onboarding'))
    forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
    service.sign(
        row, manager_name=request.data.get('manager_name') or '', manager_signature=request.data.get('manager_signature') or '',
        employee_name=request.data.get('employee_name') or '',
        employee_signature=request.data.get('employee_signature') or '', acknowledged=request.data.get('acknowledged'),
        by=request.user, ip=forwarded or request.META.get('REMOTE_ADDR'),
        user_agent=request.META.get('HTTP_USER_AGENT', ''),
    )
    return Response(_row(_checkin(pk), full=True))


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def checkin_skip(request, pk):
    service.skip(_checkin(pk), reason=request.data.get('reason') or '', by=request.user)
    return Response(_row(_checkin(pk), full=True))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def checkin_pdf(request, pk):
    """The signed check-in: managers, and the employee it is about."""
    row = _checkin(pk)
    viewer = request.user
    if row.user_id != viewer.pk and not (viewer.is_superuser or getattr(viewer, 'role', None) in ('Manager', 'Admin')):
        raise Http404
    if not row.signed_pdf_id:
        raise Http404
    return stream_s3(row.signed_pdf, as_attachment=request.query_params.get('download') == '1')


@api_view(['GET'])
@permission_classes([IsTeamMember])
def my_checkins(request):
    """My check-ins: the dates coming up, and the signed ones in full."""
    rows = CheckIn.objects.filter(user=request.user).exclude(status=CheckIn.STATUS_SKIPPED).select_related(
        'user', 'manager').order_by('due_date')
    return Response([_row(c, full=c.status == CheckIn.STATUS_DONE) for c in rows])
