from __future__ import annotations

import base64
import re
from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsStaff, IsSuperAdmin
from apps.core.files import save_upload, stream_s3
from apps.core.models import S3File

from .definition import merge_responses, score_responses, validate_definition
from .grading import missing_owners, parse_week, week_grade
from .kinds import (
    initial_responses,
    merge_incoming,
    outcome,
    owned_sections,
    submit_blockers,
    verify_context,
)
from .models import Routine, RoutineRun, RoutineSubmission, Section
from .settings import retail_qa_settings
from .taxonomy import taxonomy
from .schedule import (
    STAFF_GROUPS,
    cover_run,
    done_this_week_queryset,
    materialize_routines,
    mine_queryset,
    overdue_queryset,
    resolve_assignees,
    user_can_see_run,
)
from .serializers import (
    RoutineRunSerializer,
    RoutineSerializer,
    RoutineSubmissionSerializer,
    SectionSerializer,
)
from .stats import routine_stats

_DATA_URL = re.compile(r'^data:(image/[\w+.-]+);base64,(.+)$', re.DOTALL)


def _sync_open_drafts(routine: Routine):
    drafts = RoutineSubmission.objects.filter(
        routine=routine,
        status=RoutineSubmission.STATUS_DRAFT,
    )
    for draft in drafts:
        merged = merge_responses(routine.definition, draft.responses)
        if merged != draft.responses:
            draft.responses = merged
            draft.save(update_fields=['responses', 'updated_at'])


class RoutineViewSet(viewsets.ModelViewSet):
    queryset = Routine.objects.select_related('assigned_department', 'created_by').prefetch_related('assigned_users')
    serializer_class = RoutineSerializer

    # Superuser verbs that must reach a retired routine: restoring it, changing
    # it, or deleting it for good.
    ADMIN_ACTIONS = ('update', 'partial_update', 'restore', 'hard_delete', 'admin')

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'assignees'):
            return [IsAuthenticated(), IsStaff()]
        return [IsAuthenticated(), IsSuperAdmin()]

    def get_queryset(self):
        # Staff surfaces never list retired routines.
        qs = super().get_queryset()
        if self.action in self.ADMIN_ACTIONS and self.request.user.is_superuser:
            return qs
        return qs.filter(is_active=True)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
        materialize_routines()

    def perform_update(self, serializer):
        routine = serializer.save()
        _sync_open_drafts(routine)
        materialize_routines()

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])

    @action(detail=False, methods=['get'], url_path='admin')
    def admin(self, request):
        """Every routine, retired ones included, with its run history. Superuser only."""
        routines = list(self.get_queryset().order_by('title'))
        stats = routine_stats(routines)
        data = RoutineSerializer(routines, many=True).data
        for routine, row in zip(routines, data):
            row['stats'] = stats[routine.pk]
            row['created_by_name'] = routine.created_by.full_name if routine.created_by_id else None
        return Response(data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        routine = self.get_object()
        if not routine.is_active:
            routine.is_active = True
            routine.save(update_fields=['is_active', 'updated_at'])
            materialize_routines()
        return Response(RoutineSerializer(routine).data)

    @action(detail=True, methods=['delete'], url_path='hard-delete')
    def hard_delete(self, request, pk=None):
        """Gone for good, history included. Only a retired routine can go."""
        routine = self.get_object()
        if routine.is_active:
            return Response({'detail': 'Retire this routine before deleting it for good.'}, status=400)
        if routine.system_key:
            # The grade looks these up by key. Retiring one stops it; deleting
            # it would leave the scoring code reaching for something gone.
            return Response(
                {'detail': 'Program routines cannot be deleted. Retiring one is enough to stop it.'},
                status=400,
            )
        RoutineSubmission.objects.filter(routine=routine).delete()
        routine.delete()
        return Response(status=204)

    @action(detail=False, methods=['get'])
    def assignees(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        rows = (
            User.objects.filter(is_active=True, groups__name__in=STAFF_GROUPS)
            .distinct()
            .select_related('employee__department')
            .prefetch_related('groups')
            .order_by('last_name', 'first_name')
        )

        def role_of(user) -> str:
            names = {g.name for g in user.groups.all()}
            for role in ('Admin', 'Manager', 'Employee'):
                if role in names:
                    return role
            return ''

        out = []
        for u in rows:
            employee = getattr(u, 'employee', None)
            dept = employee.department if employee is not None and employee.department_id else None
            out.append({
                'id': u.pk,
                'full_name': u.full_name,
                'email': u.email,
                'role': role_of(u),
                'department_id': dept.pk if dept else None,
                'department_name': dept.name if dept else None,
            })
        return Response(out)


class SectionViewSet(viewsets.ModelViewSet):
    """Areas of the floor and who keeps them. Staff read, superusers redraw."""

    serializer_class = SectionSerializer
    pagination_class = None
    queryset = Section.objects.select_related('department', 'owner')

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), IsStaff()]
        return [IsAuthenticated(), IsSuperAdmin()]

    def get_queryset(self):
        qs = super().get_queryset()
        department = self.request.query_params.get('department')
        if department:
            qs = qs.filter(department_id=department)
        if self.request.query_params.get('include_retired') != '1':
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        section = serializer.save()
        materialize_routines()
        return section

    def perform_update(self, serializer):
        # An owner change redraws whose tally is whose, so today's runs follow.
        serializer.save()
        materialize_routines()

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        materialize_routines()

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """Persist a drag: `{"ids": [...]}` in the order they should appear."""
        ids = request.data.get('ids') or []
        rows = {row.pk: row for row in Section.objects.filter(pk__in=ids)}
        changed = []
        for position, section_id in enumerate(ids):
            row = rows.get(section_id)
            if row and row.sort_order != position:
                row.sort_order = position
                changed.append(row)
        Section.objects.bulk_update(changed, ['sort_order'])
        return Response(SectionSerializer(self.get_queryset(), many=True).data)


class RoutineRunViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RoutineRunSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    pagination_class = None

    def get_queryset(self):
        return (
            RoutineRun.objects.select_related(
                'routine', 'routine__assigned_department', 'assigned_to',
                'completed_by', 'submission',
            )
            .filter(routine__is_active=True)
        )

    def retrieve(self, request, *args, **kwargs):
        run = self.get_object()
        if not request.user.is_superuser and not user_can_see_run(run, request.user):
            return Response({'detail': 'Not assigned to you.'}, status=403)
        data = RoutineRunSerializer(run).data
        data['definition'] = run.routine.definition
        # Sent with the run: staff cannot read AppSetting, and the phone has to
        # enforce the same taxonomy and the same floor the server will.
        data['taxonomy'] = taxonomy() if run.routine.kind != Routine.KIND_CHECKLIST else None
        data['audit_min_items'] = int(retail_qa_settings()['audit_min_items'])
        data['verify'] = verify_context(run)
        data['sections'] = [
            {'id': section.pk, 'name': section.name}
            for section in owned_sections(run)
        ]
        draft = RoutineSubmission.objects.filter(
            run=run,
            submitted_by=request.user,
            status=RoutineSubmission.STATUS_DRAFT,
        ).first()
        if draft:
            merged = merge_incoming(run.routine, run, draft.responses)
            if merged != draft.responses:
                draft.responses = merged
                draft.save(update_fields=['responses', 'updated_at'])
        data['draft'] = RoutineSubmissionSerializer(draft).data if draft else None
        # A finished run carries what was submitted, so it can be reviewed read-only.
        data['submission'] = (
            RoutineSubmissionSerializer(run.submission).data if run.submission_id else None
        )
        return Response(data)

    @staticmethod
    def _attach_progress(rows, serialized, user):
        """How far this user's draft has got, per open run: {'answered': n, 'total': m}."""
        by_run = {
            draft.run_id: draft
            for draft in RoutineSubmission.objects.filter(
                run__in=[row.pk for row in rows],
                submitted_by=user,
                status=RoutineSubmission.STATUS_DRAFT,
            )
        }
        for row, data in zip(rows, serialized):
            draft = by_run.get(row.pk)
            if not draft or row.routine.kind != Routine.KIND_CHECKLIST:
                # Section work has no fixed number of steps, so "3 of 9" would
                # be a made-up denominator. It shows started or not.
                data['progress'] = None
                continue
            merged = merge_responses(row.routine.definition, draft.responses)
            total = sum(len(section.get('checks', [])) for section in merged.get('sections', []))
            _failed, _critical, unanswered = score_responses(merged)
            data['progress'] = {'answered': max(total - len(unanswered), 0), 'total': total}
        return serialized

    @action(detail=False, methods=['get'])
    def mine(self, request):
        materialize_routines()
        open_rows = list(mine_queryset(request.user))
        done_rows = list(done_this_week_queryset(request.user))
        on_demand = []
        for routine in Routine.objects.filter(
            is_active=True, trigger=Routine.TRIGGER_ON_DEMAND,
        ).order_by('title'):
            if (
                request.user.is_superuser
                or resolve_assignees(routine).filter(pk=request.user.pk).exists()
            ):
                on_demand.append(routine)
        return Response({
            'open': self._attach_progress(
                open_rows, RoutineRunSerializer(open_rows, many=True).data, request.user,
            ),
            'done': RoutineRunSerializer(done_rows, many=True).data,
            'on_demand': RoutineSerializer(on_demand, many=True).data,
        })

    @action(detail=True, methods=['post'])
    def cover(self, request, pk=None):
        """Take an absent person's run. The aisle still needs walking."""
        run = get_object_or_404(RoutineRun, pk=pk, routine__is_active=True)
        if run.status != RoutineRun.STATUS_OPEN:
            return Response({'detail': 'That run is already closed.'}, status=400)
        if run.assigned_to_id is None:
            return Response({'detail': 'A pooled run is already open to anyone.'}, status=400)
        if run.assigned_to_id == request.user.pk:
            return Response({'detail': 'That one is already yours.'}, status=400)
        same_department = (
            run.routine.assigned_department_id
            and getattr(getattr(request.user, 'employee', None), 'department_id', None)
            == run.routine.assigned_department_id
        )
        if not request.user.is_superuser and not same_department:
            return Response({'detail': 'Only their department can cover this.'}, status=403)
        cover_run(run, request.user)
        return Response(RoutineRunSerializer(run).data)

    @action(detail=False, methods=['get'], url_path='overdue-report')
    def overdue_report(self, request):
        rows = list(overdue_queryset())
        by_person: dict[int | str, dict] = {}
        by_dept: dict[str, dict] = {}
        for row in rows:
            data = RoutineRunSerializer(row).data
            if row.assigned_to_id:
                person = by_person.setdefault(row.assigned_to_id, {
                    'user_id': row.assigned_to_id,
                    'name': data['assigned_to_name'],
                    'department_name': data['department_name'],
                    'count': 0,
                    'items': [],
                })
                person['count'] += 1
                person['items'].append(data)
            else:
                person = by_person.setdefault('team', {
                    'user_id': None,
                    'name': 'Team (pooled)',
                    'department_name': data['department_name'],
                    'count': 0,
                    'items': [],
                })
                person['count'] += 1
                person['items'].append(data)
            dept_name = data['department_name'] or 'Unassigned'
            dept = by_dept.setdefault(dept_name, {
                'department_name': dept_name,
                'count': 0,
                'people': set(),
            })
            dept['count'] += 1
            if row.assigned_to_id:
                dept['people'].add(row.assigned_to_id)
        people = []
        for row in by_person.values():
            people.append(row)
        departments = [
            {
                'department_name': d['department_name'],
                'count': d['count'],
                'people': len(d['people']),
            }
            for d in by_dept.values()
        ]
        return Response({
            'count': len(rows),
            'by_person': people,
            'by_department': departments,
        })


class RoutineSubmissionViewSet(viewsets.ModelViewSet):
    serializer_class = RoutineSubmissionSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = RoutineSubmission.objects.select_related('routine', 'run', 'submitted_by')
        if not self.request.user.is_superuser:
            qs = qs.filter(submitted_by=self.request.user)
        return qs

    def create(self, request, *args, **kwargs):
        routine_id = request.data.get('routine')
        run_id = request.data.get('run')
        routine = get_object_or_404(Routine, pk=routine_id, is_active=True)
        run = None
        if run_id:
            run = get_object_or_404(RoutineRun, pk=run_id, routine=routine)
            if not user_can_see_run(run, request.user):
                return Response({'detail': 'Not assigned to you.'}, status=403)
            if run.status != RoutineRun.STATUS_OPEN:
                return Response({'detail': 'This run is already closed.'}, status=400)
            existing = RoutineSubmission.objects.filter(
                run=run, submitted_by=request.user, status=RoutineSubmission.STATUS_DRAFT,
            ).first()
            if existing:
                merged = merge_incoming(routine, run, existing.responses)
                if merged != existing.responses:
                    existing.responses = merged
                    existing.save(update_fields=['responses', 'updated_at'])
                return Response(RoutineSubmissionSerializer(existing).data)
        if routine.kind == Routine.KIND_CHECKLIST:
            errors = validate_definition(routine.definition or {})
            if errors:
                return Response({'detail': errors}, status=400)
        submission = RoutineSubmission.objects.create(
            routine=routine,
            run=run,
            submitted_by=request.user,
            responses=initial_responses(routine, run),
        )
        return Response(RoutineSubmissionSerializer(submission).data, status=201)

    def partial_update(self, request, *args, **kwargs):
        submission = self.get_object()
        if submission.status != RoutineSubmission.STATUS_DRAFT:
            return Response({'detail': 'Submitted checklists cannot be edited.'}, status=400)
        if submission.submitted_by_id != request.user.pk:
            return Response({'detail': 'Not your draft.'}, status=403)
        incoming = request.data.get('responses', submission.responses)
        submission.responses = merge_incoming(
            submission.routine, submission.run, incoming,
        )
        submission.save(update_fields=['responses', 'updated_at'])
        return Response(RoutineSubmissionSerializer(submission).data)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        submission = self.get_object()
        if submission.status != RoutineSubmission.STATUS_DRAFT:
            return Response({'detail': 'Already submitted.'}, status=400)
        if submission.submitted_by_id != request.user.pk:
            return Response({'detail': 'Not your draft.'}, status=403)
        routine = submission.routine
        incoming = request.data.get('responses', submission.responses)
        responses = merge_incoming(routine, submission.run, incoming)
        responses = _extract_photos(responses, user=request.user, submission_id=submission.pk)
        blockers = submit_blockers(
            routine, responses, min_items=int(retail_qa_settings()['audit_min_items']),
        )
        if blockers:
            return Response({'detail': blockers}, status=400)
        failed, critical = outcome(routine, responses)
        now = timezone.now()
        submission.responses = responses
        submission.failed_count = failed
        submission.has_critical_fail = critical
        submission.status = RoutineSubmission.STATUS_SUBMITTED
        submission.submitted_at = now
        submission.save()
        if submission.run_id:
            run = submission.run
            if run.status == RoutineRun.STATUS_OPEN:
                run.status = RoutineRun.STATUS_DONE
                run.submission = submission
                run.completed_at = now
                run.completed_by = request.user
                run.save(update_fields=[
                    'status', 'submission', 'completed_at', 'completed_by',
                ])
        return Response(RoutineSubmissionSerializer(submission).data)

    @action(detail=True, methods=['get'], url_path='photos/(?P<file_id>[0-9]+)')
    def photo(self, request, pk=None, file_id=None):
        submission = self.get_object()
        s3 = get_object_or_404(S3File, pk=file_id)
        prefix = f'routines/submissions/{submission.pk}/'
        if not s3.key.startswith(prefix):
            return Response({'detail': 'Not found.'}, status=404)
        return stream_s3(s3)


def _store_photo(holder: dict, *, user, submission_id: int) -> None:
    """Swap an inline data URL on `holder` for a stored file and its stream URL."""
    photo = holder.get('photo')
    if not isinstance(photo, str) or not photo.startswith('data:'):
        return
    match = _DATA_URL.match(photo)
    if not match:
        return
    content_type, raw_b64 = match.group(1), match.group(2)
    try:
        raw = base64.b64decode(raw_b64)
    except (ValueError, TypeError):
        return
    ext = '.jpg' if 'jpeg' in content_type or 'jpg' in content_type else '.png'
    uploaded = ContentFile(raw, name=f'check{ext}')
    uploaded.content_type = content_type
    s3 = save_upload(uploaded, user=user, key_prefix=f'routines/submissions/{submission_id}')
    holder['photo'] = f'/api/routines/submissions/{submission_id}/photos/{s3.pk}/'
    holder['photo_file_id'] = s3.pk


def _extract_photos(responses, *, user, submission_id: int) -> dict:
    """Every photo in any response shape, stored and replaced by its URL."""
    if not isinstance(responses, dict):
        return responses
    holders: list[dict] = []
    for section in responses.get('sections') or []:
        if not isinstance(section, dict):
            continue
        holders.extend(check for check in section.get('checks') or [] if isinstance(check, dict))
        if 'counts' in section:
            holders.append(section)
    if isinstance(responses.get('audit'), dict):
        holders.append(responses['audit'])
    if 'items_inspected' in responses:
        holders.append(responses)
    for holder in holders:
        _store_photo(holder, user=user, submission_id=submission_id)
    return responses


class RetailGradesView(APIView):
    """`GET /api/routines/grades/?week=YYYY-Www` — the week, scored and itemised.

    Staff can read their own grade. A number people are held to should not be
    something only the people holding it can see.
    """

    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        materialize_routines()
        monday = parse_week(request.query_params.get('week'))
        payload = week_grade(monday)
        payload['missing_owners'] = missing_owners()
        payload['taxonomy'] = taxonomy()
        return Response(payload)
