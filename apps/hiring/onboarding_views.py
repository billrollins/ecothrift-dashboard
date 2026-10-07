"""Onboarding API (Phase 4): People → Onboarding for managers, the I-9 for Admins, My onboarding for the new hire."""
from __future__ import annotations

from datetime import date, time

from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsTeamMember
from apps.core.files import stream_s3
from apps.hiring import onboarding as service
from apps.hiring.models import Application, HandbookSignature, I9File, Onboarding, OnboardingTask


def _is_admin(user) -> bool:
    return bool(user.is_superuser or getattr(user, 'role', None) == 'Admin')


def _require_admin(request) -> None:
    if not _is_admin(request.user):
        raise PermissionDenied('The I-9 is for Admins only.')


def _person(user) -> dict | None:
    if not user:
        return None
    return {'id': user.pk, 'email': user.email, 'name': (user.full_name or '').strip() or user.email}


def _task(task: OnboardingTask, today: date) -> dict:
    return {
        'id': task.pk, 'key': task.key, 'label': task.label, 'help': task.help,
        'owner': task.owner, 'owner_label': service.OWNER_LABELS.get(task.owner, task.owner),
        'due': task.due, 'due_label': service.DUE_LABELS.get(task.due, task.due), 'due_date': task.due_date,
        'kind': task.kind, 'auto': task.auto, 'status': task.status, 'done_at': task.done_at,
        'done_by': (task.done_by.full_name or task.done_by.email) if task.done_by_id else ('Dash' if task.done_at else ''),
        'note': task.note, 'data': task.data, 'overdue': service.overdue(task, today),
    }


def _row(o: Onboarding, *, full: bool = False, viewer=None) -> dict:
    today = timezone.localdate()
    tasks = list(o.tasks.select_related('done_by'))
    user = o.user
    out = {
        'id': o.pk,
        'user': {
            'id': user.pk, 'name': (user.full_name or '').strip() or user.email, 'email': user.email,
            'username': getattr(user, 'username', '') or '', 'has_password': user.has_usable_password(),
            'last_login': user.last_login,
        },
        'application': o.application_id, 'position': o.position, 'start_date': o.start_date,
        'start_time': o.start_time, 'manager': _person(o.manager), 'status': o.status,
        'status_label': o.get_status_display(), 'first_day_email_sent_at': o.first_day_email_sent_at,
        'created_at': o.created_at, 'completed_at': o.completed_at,
        'done': sum(t.status != OnboardingTask.STATUS_OPEN for t in tasks), 'total': len(tasks),
        'overdue': sum(service.overdue(t, today) for t in tasks),
        'next_due': min((t.due_date for t in tasks if t.status == OnboardingTask.STATUS_OPEN), default=None),
    }
    if full:
        out['tasks'] = [_task(t, today) for t in tasks]
        record = getattr(o, 'i9', None)
        out['i9'] = {
            'done': bool(record and record.section2_done_at), 'section2_done_at': record.section2_done_at if record else None,
            'keep_until': record.keep_until if record else None, 'can_open': bool(viewer and _is_admin(viewer)),
        }
        signed = HandbookSignature.objects.filter(user=user).select_related('handbook').first()
        out['handbook'] = None if signed is None else {
            'signature': signed.pk, 'version': signed.handbook.version, 'signed_at': signed.signed_at,
            'has_pdf': bool(signed.signed_pdf_id),
        }
    return out


def _date(value, field: str) -> date | None:
    if value in (None, ''):
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValidationError({field: 'Use a date like 2026-10-19.'})


def _time(value) -> time | None:
    if value in (None, ''):
        return None
    try:
        return time.fromisoformat(str(value)[:5])
    except ValueError:
        raise ValidationError({'start_time': 'Use a time like 09:00.'})


def _user(value, field='manager'):
    from apps.accounts.models import User

    if value in (None, ''):
        return None
    try:
        return User.objects.get(pk=int(value), is_active=True)
    except (User.DoesNotExist, TypeError, ValueError):
        raise ValidationError({field: 'Pick someone from the list.'})


def start_from_request(data, *, by) -> tuple[Onboarding, bool]:
    """Start onboarding for an applicant who is now an employee, or for any employee (``user``)."""
    application = None
    job = None
    terms = {}
    if data.get('application'):
        application = get_object_or_404(Application, pk=data.get('application'))
        if not application.employee_user_id:
            raise ValidationError({'detail': 'Create the employee in Dash first.'})
        user = application.employee_user
        job = application.jobs.order_by('sort_order', 'title').first()
        offer = application.offers.filter(status='signed').order_by('-signed_at').first()
        if offer:
            job = offer.job or job
            terms = {'start_date': offer.start_date, 'start_time': offer.start_time, 'manager': offer.supervisor,
                     'position': offer.position}
        if 'manager' not in terms and job and job.hiring_manager_id:
            terms['manager'] = job.hiring_manager
    else:
        user = _user(data.get('user'), 'user')
        if user is None:
            raise ValidationError({'user': 'Pick the employee.'})
    profile = service._profile(user)
    start_date = _date(data.get('start_date'), 'start_date') or terms.get('start_date') or (
        profile.hire_date if profile else None) or timezone.localdate()
    manager = _user(data.get('manager')) if data.get('manager') not in (None, '') else terms.get('manager')
    return service.start(
        user=user, by=by, start_date=start_date,
        start_time=_time(data.get('start_time')) or terms.get('start_time'),
        manager=manager, position=(data.get('position') or terms.get('position') or ''), job=job,
        application=application, send_email=data.get('send_email') in (True, 'true', '1', 1),
    )


# ── Managers ────────────────────────────────────────────────────────────────


@api_view(['GET', 'POST'])
@permission_classes([IsManagerOrAdmin])
def onboarding_list(request):
    if request.method == 'POST':
        onboarding, sent = start_from_request(request.data, by=request.user)
        return Response({'onboarding': _row(onboarding, full=True, viewer=request.user), 'sent': sent},
                        status=status.HTTP_201_CREATED)
    which = request.query_params.get('status') or 'active'
    qs = Onboarding.objects.select_related('user', 'manager').order_by('-start_date', '-id')
    if which != 'all':
        qs = qs.filter(status=which)
    rows = []
    for o in qs[:200]:
        if o.status == Onboarding.STATUS_ACTIVE:
            service.refresh(o)
        rows.append(_row(o))
    return Response(rows)


@api_view(['GET'])
@permission_classes([IsManagerOrAdmin])
def onboarding_people(request):
    """Staff with no onboarding in progress (Start onboarding for someone hired outside Applicants)."""
    from apps.hiring.careers import staff_index

    busy = set(Onboarding.objects.filter(status=Onboarding.STATUS_ACTIVE).values_list('user_id', flat=True))
    return Response([p for p in staff_index() if p['id'] not in busy])


def _onboarding(pk) -> Onboarding:
    return get_object_or_404(Onboarding.objects.select_related('user', 'manager'), pk=pk)


@api_view(['GET'])
@permission_classes([IsManagerOrAdmin])
def onboarding_detail(request, pk):
    o = service.refresh(_onboarding(pk))
    return Response(_row(o, full=True, viewer=request.user))


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def onboarding_task(request, pk, task_id):
    o = _onboarding(pk)
    task = get_object_or_404(OnboardingTask, pk=task_id, onboarding=o)
    service.set_task(task, by=request.user, status=request.data.get('status') or '', data=request.data.get('data'),
                     note=request.data.get('note'))
    return Response(_row(_onboarding(pk), full=True, viewer=request.user))


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def onboarding_first_day(request, pk):
    o = _onboarding(pk)
    sent = service.send_first_day(o, by=request.user)
    return Response({'sent': sent, 'onboarding': _row(_onboarding(pk), full=True, viewer=request.user)})


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def onboarding_cancel(request, pk):
    service.cancel(_onboarding(pk), by=request.user)
    return Response(_row(_onboarding(pk), full=True, viewer=request.user))


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def onboarding_password_link(request, pk):
    return Response(service.password_link(_onboarding(pk), request=request))


# ── I-9 (Admin only) ────────────────────────────────────────────────────────


def _i9_dict(record) -> dict:
    return {
        'id': record.pk, 'hire_date': record.hire_date, 'documents_seen': record.documents_seen,
        'section2_done_at': record.section2_done_at,
        'section2_by': (record.section2_by.full_name or record.section2_by.email) if record.section2_by_id else '',
        'keep_until': record.keep_until,
        'files': [
            {'id': f.pk, 'kind': f.kind, 'kind_label': f.get_kind_display(), 'label': f.label,
             'filename': f.file.filename, 'content_type': f.file.content_type, 'size': f.file.size,
             'uploaded_at': f.uploaded_at}
            for f in record.files.select_related('file')
        ],
    }


@api_view(['GET'])
@permission_classes([IsManagerOrAdmin])
def i9_detail(request, pk):
    _require_admin(request)
    return Response(_i9_dict(_onboarding(pk).i9))


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
@parser_classes([MultiPartParser, FormParser])
def i9_files(request, pk):
    _require_admin(request)
    record = _onboarding(pk).i9
    service.i9_upload(record, request.FILES.get('file'), kind=request.data.get('kind') or I9File.KIND_FORM,
                      label=request.data.get('label') or '', by=request.user)
    return Response(_i9_dict(record), status=status.HTTP_201_CREATED)


@api_view(['GET', 'DELETE'])
@permission_classes([IsManagerOrAdmin])
def i9_file(request, pk, file_id):
    _require_admin(request)
    item = get_object_or_404(I9File.objects.select_related('file', 'record'), pk=file_id, record__onboarding_id=pk)
    if request.method == 'DELETE':
        record = item.record
        service.i9_delete_file(item)
        return Response(_i9_dict(record))
    return stream_s3(item.file, as_attachment=request.query_params.get('download') == '1')


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def i9_section2(request, pk):
    _require_admin(request)
    record = _onboarding(pk).i9
    service.i9_section2(record, documents_seen=request.data.get('documents_seen') or '', by=request.user)
    return Response(_i9_dict(record))


# ── Handbook ────────────────────────────────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsManagerOrAdmin])
def handbook(request):
    return Response(service.handbook_state())


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def handbook_publish(request):
    if not _is_admin(request.user):
        raise PermissionDenied('Only an Admin publishes the handbook.')
    row = service.publish_handbook(by=request.user)
    return Response({'version': row.version, **service.handbook_state()}, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def handbook_signature_pdf(request, signature_id):
    row = get_object_or_404(HandbookSignature, pk=signature_id)
    viewer = request.user
    if row.user_id != viewer.pk and not (viewer.is_superuser or getattr(viewer, 'role', None) in ('Manager', 'Admin')):
        raise Http404
    if not row.signed_pdf_id:
        raise Http404
    return stream_s3(row.signed_pdf, as_attachment=request.query_params.get('download') == '1')


# ── The new hire ────────────────────────────────────────────────────────────


def _mine_payload(user) -> dict:
    from apps.hiring.careers import load_setting

    o = service.mine(user)
    profile = service._profile(user)
    latest = service.latest_handbook()
    signed = HandbookSignature.objects.filter(user=user, handbook=latest).first() if latest else None
    return {
        'onboarding': _row(o, full=True) if o else None,
        'emergency_contact': {'name': profile.emergency_name if profile else '',
                              'phone': profile.emergency_phone if profile else ''},
        'handbook': None if latest is None else {
            'version': latest.version, 'title': latest.title, 'text': latest.text,
            'acknowledgment': latest.acknowledgment, 'consent': service.HANDBOOK_CONSENT,
            'signed': None if signed is None else {'id': signed.pk, 'signed_at': signed.signed_at,
                                                   'signer_name': signed.signer_name},
        },
        'place': load_setting()['interviews']['place'],
    }


@api_view(['GET'])
@permission_classes([IsTeamMember])
def my_onboarding(request):
    return Response(_mine_payload(request.user))


@api_view(['POST'])
@permission_classes([IsTeamMember])
def my_task(request, task_id):
    task = get_object_or_404(OnboardingTask, pk=task_id, onboarding__user=request.user)
    service.set_task(task, by=request.user, status=request.data.get('status') or '', as_new_hire=True)
    return Response(_mine_payload(request.user))


@api_view(['POST'])
@permission_classes([IsTeamMember])
def my_emergency_contact(request):
    service.save_emergency_contact(request.user, name=request.data.get('name') or '',
                                   phone=request.data.get('phone') or '')
    return Response(_mine_payload(request.user))


@api_view(['POST'])
@permission_classes([IsTeamMember])
@parser_classes([JSONParser])
def my_handbook_sign(request):
    forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
    service.sign_handbook(
        user=request.user, name=request.data.get('name') or '', signature=request.data.get('signature') or '',
        acknowledged=request.data.get('acknowledged'), consent=request.data.get('consent'),
        ip=forwarded or request.META.get('REMOTE_ADDR'), user_agent=request.META.get('HTTP_USER_AGENT', ''),
    )
    return Response(_mine_payload(request.user), status=status.HTTP_201_CREATED)
