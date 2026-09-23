"""Retail QA surfaces: RM dashboard, staff mine, settings preview."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsSuperAdmin
from apps.hr.models import Shift, ShiftAssignment, TimeEntry
from apps.webstore.services.hours import is_open_day

from .flags import evaluate_checker_flags, review_flag
from .grading import (
    closed_section_ids,
    day_grade,
    missing_owners,
    parse_week,
    preview_week,
    score_cross_check,
    score_spot,
    section_owner_people,
    this_monday,
    week_grade,
)
from .day_summary import (
    DaySummaryError,
    day_summary_for_date,
    parse_week_strict,
    week_summary_for_staff,
)
from .command_center import (
    ack_nudge,
    apply_call_in,
    apply_exclusion,
    apply_left_early,
    apply_override,
    assign_run,
    cover_section_today,
    clear_call_in,
    create_nudge,
    pending_nudges_for,
    pooled_open_runs_for,
    serialize_nudge,
    today_payload,
    week_payload,
)
from .models import (
    CheckerFlag,
    QaCallIn,
    QaNudge,
    Routine,
    RoutineRun,
    Section,
    SectionAssignmentEvent,
    SectionObservation,
)
from .schedule import (
    OWN_AISLE_MESSAGE,
    SYSTEM_CLOSE,
    SYSTEM_CROSS_CHECK,
    SYSTEM_DAY,
    SYSTEM_OPEN,
    SYSTEM_OWNER_SPOT,
    SYSTEM_TALLY,
    drop_unowned_open_tally,
    materialize_routines,
    week_days,
)
from .serializers import RoutineRunSerializer
from .settings import retail_qa_settings, validate_retail_qa_bundle, validate_retail_qa_value

User = get_user_model()
PERFORMED = (SYSTEM_OPEN, SYSTEM_DAY, SYSTEM_CLOSE)


def _parse_date(raw: str | None, fallback: date | None = None) -> date:
    fallback = fallback or timezone.localdate()
    if not raw:
        return fallback
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return fallback


def _store_name() -> str:
    row = None
    try:
        from apps.core.models import AppSetting
        row = AppSetting.objects.filter(key='store_name').first()
    except Exception:
        row = None
    if row and row.value:
        return str(row.value)
    return 'Eco-Thrift'


class QaWeekView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def get(self, request):
        materialize_routines()
        monday = parse_week(request.query_params.get('week'))
        week = week_payload(monday)
        today = timezone.localdate()
        board = today_payload(today)
        return Response({
            **week,
            'store': _store_name(),
            'today': today.isoformat(),
            'open_today': is_open_day(today),
            'alerts': board['alerts'],
        })


def _alerts(day: date) -> dict:
    unassigned_cross = RoutineRun.objects.filter(
        routine__system_key=SYSTEM_CROSS_CHECK,
        period_key=day.isoformat(),
        assigned_to__isnull=True,
        status=RoutineRun.STATUS_OPEN,
    ).count()
    no_owner = Section.objects.filter(is_active=True, owner__isnull=True).count()
    flags = CheckerFlag.objects.filter(status__in=CheckerFlag.ACTIVE_STATUSES).count()
    safety = SectionObservation.objects.filter(
        observed_at__date=day, safety=True,
    ).count()
    return {
        'unassigned_cross_checks': unassigned_cross,
        'sections_without_owner': no_owner,
        'checker_flags': flags,
        'safety_flags': safety,
        'total': unassigned_cross + no_owner + flags + safety,
    }


class QaTodayView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def get(self, request):
        materialize_routines()
        day = _parse_date(request.query_params.get('date'))
        monday = this_monday(day)
        week = week_grade(monday)
        day_row = next((row for row in week['days'] if row['date'] == day.isoformat()), None)
        if day_row is None:
            day_row = day_grade(day)
        board = today_payload(day)
        return Response({
            **board,
            'store': _store_name(),
            'checklists': _checklists_today(day, day_row),
            'sections': _section_board(day, day_row),
        })


class QaDaySummaryView(APIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        raw_date = request.query_params.get('date')
        raw_week = request.query_params.get('week')
        has_date = raw_date not in (None, '')
        has_week = raw_week not in (None, '')
        if has_date == has_week:
            return Response(
                {'detail': 'exactly one of date or week is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        today = timezone.localdate()
        try:
            if has_date:
                try:
                    day = date.fromisoformat(raw_date)
                except ValueError:
                    return Response(
                        {'detail': 'invalid date'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return Response(day_summary_for_date(day, today=today))
            monday = parse_week_strict(raw_week)
            return Response(week_summary_for_staff(monday, today=today))
        except DaySummaryError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


def _staff_today(day: date) -> list[dict]:
    punches = {
        row.employee_id: row
        for row in TimeEntry.objects.filter(date=day).select_related('employee')
    }
    scheduled = []
    seen = set()
    for assignment in ShiftAssignment.objects.filter(
        shift__is_active=True,
    ).select_related('employee', 'shift', 'shift__department', 'employee__employee'):
        if not assignment.runs_on(day):
            continue
        user = assignment.employee
        if user.pk in seen:
            continue
        seen.add(user.pk)
        punch = punches.get(user.pk)
        emp = getattr(user, 'employee', None)
        scheduled.append({
            'id': user.pk,
            'name': user.full_name,
            'role': getattr(user, 'role', '') or '',
            'department': assignment.shift.department.name,
            'shift_name': assignment.shift.name,
            'time_in': assignment.shift.time_in.strftime('%H:%M'),
            'time_out': assignment.shift.time_out.strftime('%H:%M'),
            'clocked_in': bool(punch),
            'arrival': punch.clock_in if punch else None,
            'expected_not_in': punch is None,
            'on_roster': True,
        })
    for employee_id, punch in punches.items():
        if employee_id in seen:
            continue
        user = punch.employee
        scheduled.append({
            'id': user.pk,
            'name': user.full_name,
            'role': getattr(user, 'role', '') or '',
            'department': '',
            'shift_name': punch.shift or '',
            'time_in': '',
            'time_out': '',
            'clocked_in': True,
            'arrival': punch.clock_in,
            'expected_not_in': False,
            'on_roster': False,
        })
    if not scheduled:
        assigned_ids = set(
            RoutineRun.objects.filter(
                period_key=day.isoformat(),
                assigned_to__isnull=False,
            ).values_list('assigned_to_id', flat=True)
        )
        for user in User.objects.filter(pk__in=assigned_ids, is_active=True):
            punch = punches.get(user.pk)
            scheduled.append({
                'id': user.pk,
                'name': user.full_name,
                'role': getattr(user, 'role', '') or '',
                'department': '',
                'shift_name': '',
                'time_in': '',
                'time_out': '',
                'clocked_in': bool(punch),
                'arrival': punch.clock_in if punch else None,
                'expected_not_in': punch is None,
                'on_roster': False,
            })
    scheduled.sort(key=lambda row: (not row['expected_not_in'], row['name'] or ''))
    return scheduled


def _checklists_today(day: date, day_row: dict) -> list[dict]:
    out = []
    for key in PERFORMED:
        run = RoutineRun.objects.filter(
            routine__system_key=key, period_key=day.isoformat(),
        ).select_related('assigned_to', 'completed_by', 'submission', 'routine').first()
        verify = None
        if day_row:
            match = next((row for row in day_row.get('cross', {}).get('verify') or [] if row['key'] == key), None)
            verify = match
        doing = None
        if day_row:
            doing = next((row for row in day_row.get('doing', {}).get('routines') or [] if row['key'] == key), None)
        out.append({
            'key': key,
            'title': run.routine.title if run else key,
            'run_id': run.pk if run else None,
            'assigned_to': {
                'id': run.assigned_to_id,
                'name': run.assigned_to.full_name,
            } if run and run.assigned_to_id else None,
            'own_part': (doing or {}).get('status') or ('not_assigned' if run is None else 'not_started'),
            'verify': verify,
            'completed_at': run.completed_at if run else None,
        })
    return out


def _section_board(day: date, day_row: dict) -> list[dict]:
    closed = closed_section_ids(day)
    spots = {row.get('section_id'): row for row in (day_row.get('owner') or {}).get('spots') or []}
    audits = {row.get('section_id'): row for row in (day_row.get('cross') or {}).get('audits') or []}
    tallies = {
        run.assigned_to_id: run
        for run in RoutineRun.objects.filter(
            routine__system_key=SYSTEM_TALLY, period_key=day.isoformat(),
        ).select_related('assigned_to', 'submission')
    }
    cross_runs = {
        run.section_id: run
        for run in RoutineRun.objects.filter(
            routine__system_key=SYSTEM_CROSS_CHECK, period_key=day.isoformat(),
        ).select_related('assigned_to')
    }
    out = []
    for section in Section.objects.filter(is_active=True).select_related('owner').order_by('sort_order', 'name'):
        tally_run = tallies.get(section.owner_id)
        tally_time = None
        tally_count = None
        if tally_run and tally_run.submission_id:
            for row in (tally_run.submission.responses or {}).get('sections') or []:
                if row.get('section_id') == section.pk:
                    tally_time = tally_run.completed_at
                    tally_count = sum((row.get('counts') or {}).values())
                    break
        cross = cross_runs.get(section.pk)
        spot = spots.get(section.pk)
        audit = audits.get(section.pk)
        out.append({
            'id': section.pk,
            'name': section.name,
            'owner': {'id': section.owner_id, 'name': section.owner.full_name} if section.owner_id else None,
            'tallied_at': tally_time,
            'tally_count': tally_count,
            'tally_run_id': tally_run.pk if tally_run else None,
            'cross_check': {
                'run_id': cross.pk if cross else None,
                'assigned_to': {
                    'id': cross.assigned_to_id,
                    'name': cross.assigned_to.full_name,
                } if cross and cross.assigned_to_id else None,
                'status': None if cross is None else (
                    'done' if cross.status == RoutineRun.STATUS_DONE else 'assigned'
                ),
                'score': None if audit is None else audit.get('score'),
            },
            'owner_spot': {
                'done': bool(spot),
                'score': None if spot is None else spot.get('spot_score'),
                'run_id': None if spot is None else spot.get('run_id'),
            },
            'safety': bool((audit or spot or {}).get('safety')),
            'closed': section.pk in closed,
        })
    return out


class QaAssignView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def post(self, request):
        day = _parse_date(request.data.get('date'))
        kind = str(request.data.get('kind') or '')
        user_id = request.data.get('user')
        user = User.objects.filter(pk=user_id).first() if user_id else None

        if kind == 'run':
            run = get_object_or_404(RoutineRun, pk=request.data.get('run'))
            try:
                run = assign_run(run=run, user=user, marked_by=request.user)
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=400)
            return Response({
                'ok': True,
                'run_id': run.pk,
                'assigned_to': user.pk if user else None,
            })

        section = get_object_or_404(Section, pk=request.data.get('section'))

        if kind == 'owner':
            previous = section.owner
            section.owner = user
            section.save(update_fields=['owner', 'updated_at'])
            SectionAssignmentEvent.objects.create(
                section=section,
                kind=SectionAssignmentEvent.KIND_OWNER,
                user=user,
                for_date=day,
                assigned_by=request.user,
                previous_user=previous,
            )
            materialize_routines(day)
            drop_unowned_open_tally(previous, day)
            return Response({'ok': True, 'owner_id': section.owner_id})

        if kind == 'cover_section':
            try:
                cover = cover_section_today(
                    section=section, helper=user, day=day, marked_by=request.user,
                )
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=400)
            return Response({'ok': True, 'run_id': cover.pk, 'assigned_to': user.pk if user else None})

        if kind == 'cross_checker':
            if user and section.owner_id == user.pk:
                return Response({'detail': OWN_AISLE_MESSAGE}, status=400)
            run = RoutineRun.objects.filter(
                routine__system_key=SYSTEM_CROSS_CHECK,
                period_key=day.isoformat(),
                section=section,
            ).first()
            if run is None:
                return Response({'detail': 'No cross-check is scheduled for that section today.'}, status=400)
            if run.status != RoutineRun.STATUS_OPEN:
                return Response({'detail': 'That cross-check is already finished.'}, status=400)
            previous = run.assigned_to
            generated = dict(run.generated or {})
            generated['checker_pinned'] = True
            run.assigned_to = user
            run.generated = generated
            run.section_scoped = True
            run.unassign_key = '' if user else f'u{run.pk}'
            run.save(update_fields=['assigned_to', 'generated', 'section_scoped', 'unassign_key'])
            SectionAssignmentEvent.objects.create(
                section=section,
                kind=SectionAssignmentEvent.KIND_CROSS_CHECKER,
                user=user,
                for_date=day,
                assigned_by=request.user,
                previous_user=previous,
            )
            return Response({'ok': True, 'run_id': run.pk, 'assigned_to': user.pk if user else None})

        if kind == 'unblock_cross':
            run = RoutineRun.objects.filter(
                routine__system_key=SYSTEM_CROSS_CHECK,
                period_key=day.isoformat(),
                section=section,
            ).first()
            if run is None:
                return Response({'detail': 'No cross-check is scheduled for that section today.'}, status=400)
            generated = dict(run.generated or {})
            generated['owner_check_waived'] = True
            run.generated = generated
            run.save(update_fields=['generated'])
            QaNudge.objects.filter(
                run=run, source='early_check', acked_at__isnull=True,
            ).update(acked_at=timezone.now(), ack_kind='resolved')
            SectionAssignmentEvent.objects.create(
                section=section,
                kind=SectionAssignmentEvent.KIND_CROSS_UNBLOCK,
                user=run.assigned_to,
                for_date=day,
                assigned_by=request.user,
            )
            return Response({'ok': True, 'run_id': run.pk})

        if kind == 'close':
            closed = section.pk in closed_section_ids(day)
            want_closed = bool(request.data.get('closed', True))
            event_kind = (
                SectionAssignmentEvent.KIND_CLOSED_FOR_DAY if want_closed
                else SectionAssignmentEvent.KIND_REOPENED
            )
            if closed == want_closed:
                return Response({'ok': True, 'closed': closed})
            SectionAssignmentEvent.objects.create(
                section=section,
                kind=event_kind,
                user=None,
                for_date=day,
                assigned_by=request.user,
            )
            return Response({'ok': True, 'closed': want_closed})

        return Response({
            'detail': 'kind must be owner, cover_section, cross_checker, unblock_cross, close, or run.',
        }, status=400)


class QaCallInView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def post(self, request):
        day = _parse_date(request.data.get('date'))
        user = get_object_or_404(User, pk=request.data.get('user'))
        try:
            row = apply_call_in(employee=user, day=day, marked_by=request.user)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response({'ok': True, 'call_in': {
            'id': row.pk,
            'employee': {'id': row.employee_id, 'name': row.employee.full_name},
            'date': row.date.isoformat(),
            'created_at': row.created_at,
            'cleared': row.cleared,
        }})


class QaCallInUndoView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def delete(self, request, pk):
        row = get_object_or_404(QaCallIn, pk=pk)
        clear_call_in(row)
        return Response({'ok': True})


def _parse_clock(raw):
    if not raw:
        return None
    try:
        parts = str(raw).split(':')
        return datetime.strptime(f'{int(parts[0]):02d}:{int(parts[1]):02d}', '%H:%M').time()
    except (TypeError, ValueError, IndexError):
        return None


class QaLeftEarlyView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def post(self, request):
        day = _parse_date(request.data.get('date'))
        user = get_object_or_404(User, pk=request.data.get('user'))
        apply_left_early(employee=user, day=day)
        return Response({'ok': True})


class QaExcludeView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def post(self, request):
        day = _parse_date(request.data.get('date'))
        user = get_object_or_404(User, pk=request.data.get('user'))
        row = apply_exclusion(employee=user, day=day, marked_by=request.user)
        return Response({'ok': True, 'id': row.pk})


class QaOverrideView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def post(self, request):
        day = _parse_date(request.data.get('date'))
        user = get_object_or_404(User, pk=request.data.get('user'))
        shift = get_object_or_404(Shift, pk=request.data.get('shift'))
        row = apply_override(
            employee=user,
            day=day,
            shift=shift,
            time_in=_parse_clock(request.data.get('time_in')),
            time_out=_parse_clock(request.data.get('time_out')),
            marked_by=request.user,
        )
        return Response({'ok': True, 'id': row.pk})


class QaNudgeView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def post(self, request):
        run = get_object_or_404(RoutineRun, pk=request.data.get('run'))
        message = str(request.data.get('message') or '').strip()
        row = create_nudge(
            run=run,
            created_by=request.user,
            source='manual',
            message=message,
        )
        return Response({'ok': True, 'nudge': serialize_nudge(row)})


class QaPendingNudgesView(APIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        rows = pending_nudges_for(request.user)
        return Response({'nudges': [serialize_nudge(row) for row in rows]})


class QaAckNudgeView(APIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def post(self, request, pk):
        row = get_object_or_404(QaNudge, pk=pk)
        if row.employee_id and row.employee_id != request.user.pk:
            return Response({'detail': 'That nudge is not for you.'}, status=403)
        try:
            ack_nudge(
                row,
                kind=str(request.data.get('kind') or ''),
                device=str(request.data.get('device') or 'Browser'),
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response({'ok': True, 'nudge': serialize_nudge(row)})


class QaSpotsView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def get(self, request):
        monday = parse_week(request.query_params.get('week'))
        week = week_grade(monday)
        rows = []
        for day in week['days']:
            for spot in day['owner']['spots']:
                rows.append({**spot, 'date': day['date']})
        section = request.query_params.get('section')
        person = request.query_params.get('person')
        if section:
            rows = [row for row in rows if str(row.get('section_id')) == str(section)]
        if person:
            rows = [
                row for row in rows
                if str((row.get('attributed_to') or {}).get('id')) == str(person)
                or str((row.get('completed_by') or {}).get('id')) == str(person)
            ]
        rows.sort(key=lambda row: row.get('completed_at') or '', reverse=True)
        return Response({'week': week['week'], 'spots': rows})


class QaCrossChecksView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def get(self, request):
        monday = parse_week(request.query_params.get('week'))
        week = week_grade(monday)
        return Response({
            'week': week['week'],
            'cross_checks': week.get('cross_checks') or [],
            'flags': _flag_rows(),
        })


def _flag_rows():
    rows = CheckerFlag.objects.select_related('user', 'reviewed_by').order_by('-raised_at')[:100]
    return [
        {
            'id': row.pk,
            'user': {'id': row.user_id, 'name': row.user.full_name},
            'kind': row.kind,
            'status': row.status,
            'raised_at': row.raised_at,
            'window_start': row.window_start,
            'window_end': row.window_end,
            'evidence': row.evidence,
            'note': row.note,
            'reviewed_by': row.reviewed_by.full_name if row.reviewed_by_id else None,
            'reviewed_at': row.reviewed_at,
        }
        for row in rows
    ]


class QaFlagsView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def get(self, request):
        return Response({'flags': _flag_rows()})


class QaFlagReviewView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def post(self, request, pk):
        flag = get_object_or_404(CheckerFlag, pk=pk)
        try:
            review_flag(
                flag,
                status=str(request.data.get('status') or ''),
                note=str(request.data.get('note') or ''),
                reviewer=request.user,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response(_flag_rows())


class QaRoutinesView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def get(self, request):
        materialize_routines()
        day = request.query_params.get('date')
        week = request.query_params.get('week')
        if day:
            keys = [_parse_date(day).isoformat()]
        else:
            monday = parse_week(week)
            keys = [item.isoformat() for item in week_days(monday)]
        runs = list(
            RoutineRun.objects.filter(period_key__in=keys, routine__is_active=True)
            .select_related('routine', 'assigned_to', 'completed_by', 'section', 'submission')
            .order_by('period_key', 'id')
        )
        kind = request.query_params.get('type')
        person = request.query_params.get('person')
        status = request.query_params.get('status')
        data = RoutineRunSerializer(runs, many=True).data
        if kind:
            data = [row for row in data if row.get('kind') == kind or row.get('system_key') == kind]
        if person:
            data = [
                row for row in data
                if str(row.get('assigned_to')) == str(person) or str(row.get('completed_by')) == str(person)
            ]
        if status:
            data = [row for row in data if row.get('status') == status]
        return Response({'routines': data})


class QaPeopleView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def get(self, request):
        monday = parse_week(request.query_params.get('week'))
        week = week_grade(monday)
        return Response({
            'week': week['week'],
            'people': section_owner_people(week.get('people') or []),
        })


class QaPersonView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def get(self, request, pk):
        weeks = int(request.query_params.get('weeks') or 8)
        monday = this_monday()
        history = []
        for offset in range(weeks):
            week_monday = monday - timedelta(days=7 * offset)
            week = week_grade(week_monday)
            person = next((row for row in week.get('people') or [] if row['id'] == int(pk)), None)
            history.append({
                'week': week['week'],
                'monday': week['monday'],
                'letter': week['letter'],
                'person': person,
            })
        return Response({'user_id': int(pk), 'history': history})


class QaTrendsView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def get(self, request):
        weeks = int(request.query_params.get('weeks') or 8)
        monday = this_monday()
        week_rows = []
        section_acc: dict[int, dict] = {}
        for offset in range(weeks):
            week_monday = monday - timedelta(days=7 * offset)
            week = week_grade(week_monday)
            week_rows.append({
                'week': week['week'],
                'monday': week['monday'],
                'letter': week['letter'],
                'thirds': week['thirds'],
            })
            for audit in week.get('cross_checks') or []:
                bucket = section_acc.setdefault(audit.get('section_id'), {
                    'section_id': audit.get('section_id'),
                    'section_name': audit.get('section_name'),
                    'cross': [],
                    'spots': [],
                })
                bucket['cross'].append(audit.get('score'))
            for day in week.get('days') or []:
                for spot in day.get('owner', {}).get('spots') or []:
                    bucket = section_acc.setdefault(spot.get('section_id'), {
                        'section_id': spot.get('section_id'),
                        'section_name': spot.get('section_name'),
                        'cross': [],
                        'spots': [],
                    })
                    bucket['spots'].append(spot.get('spot_score'))
        sections = []
        for bucket in section_acc.values():
            cross = [n for n in bucket['cross'] if n is not None]
            spots = [n for n in bucket['spots'] if n is not None]
            sections.append({
                'section_id': bucket['section_id'],
                'section_name': bucket['section_name'],
                'cross_average': None if not cross else round(sum(cross) / len(cross), 1),
                'spot_average': None if not spots else round(sum(spots) / len(spots), 1),
            })
        return Response({'weeks': week_rows, 'sections': sections})


class QaMineView(APIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def get(self, request):
        materialize_routines()
        pending_nudges_for(request.user)
        monday = parse_week(request.query_params.get('week'))
        week = week_grade(monday)
        user = request.user
        today = timezone.localdate()
        my_runs = list(
            RoutineRun.objects.filter(
                period_key__in=[day.isoformat() for day in week_days(monday)],
            ).filter(
                models_q_assigned(user),
            ).select_related('routine', 'section', 'submission')
        )
        today_runs = [run for run in my_runs if run.period_key == today.isoformat()]
        today_runs.extend(pooled_open_runs_for(user, today, skip_ids={run.pk for run in today_runs}))
        owned = list(Section.objects.filter(owner=user, is_active=True))
        my_spots = []
        my_cross = []
        for day in week['days']:
            for spot in day['owner']['spots']:
                attributed = (spot.get('attributed_to') or {}).get('id')
                if attributed == user.pk or any(section.pk == spot.get('section_id') for section in owned):
                    my_spots.append({
                        'section': spot.get('section_name'),
                        'day': day['date'],
                        'score': spot.get('spot_score'),
                        'reason': _plain_spot_reason(spot),
                    })
            for audit in day['cross']['audits']:
                owner_id = (audit.get('section_owner') or {}).get('id')
                checker_id = (audit.get('checker') or {}).get('id')
                if owner_id == user.pk:
                    my_cross.append({
                        'section': audit.get('section_name'),
                        'day': day['date'],
                        'score': audit.get('score'),
                        'reason': _plain_cross_reason(audit),
                    })
                if checker_id == user.pk:
                    pass
        my_verifies = []
        for day in week['days']:
            for row in day['cross']['verify']:
                run = RoutineRun.objects.filter(pk=row.get('run_id'), completed_by=user).first()
                if run:
                    my_verifies.append({
                        'title': row.get('title'),
                        'day': day['date'],
                        'score': row.get('score'),
                        'fails': row.get('fails'),
                    })
        my_checks = [
            {
                'section': audit.get('section_name'),
                'day': audit.get('date'),
                'score': audit.get('score'),
            }
            for audit in week.get('cross_checks') or []
            if (audit.get('checker') or {}).get('id') == user.pk
        ]
        under_review = CheckerFlag.objects.filter(
            user=user, status__in=CheckerFlag.ACTIVE_STATUSES,
        ).exists()
        done = late = missed = 0
        items = []
        for run in my_runs:
            status = run.status
            if status == RoutineRun.STATUS_DONE:
                from .schedule import was_late
                if was_late(run):
                    late += 1
                else:
                    done += 1
            elif status == RoutineRun.STATUS_MISSED:
                missed += 1
            items.append({
                'id': run.pk,
                'title': run.routine.title,
                'status': status,
                'date': run.period_key,
                'href': f'/routines/run/{run.pk}',
            })
        trend = []
        for offset in range(8):
            week_monday = monday - timedelta(days=7 * offset)
            past = week_grade(week_monday)
            person = next((row for row in past.get('people') or [] if row['id'] == user.pk), None)
            assigned = (person or {}).get('assigned') or 0
            finished = ((person or {}).get('done') or 0)
            trend.append({
                'week': past['week'],
                'completion': None if not assigned else round(100.0 * finished / assigned, 1),
                'spot_average': None if person is None else person.get('spot_average'),
            })
        return Response({
            'store': {
                'thirds': week['thirds'],
                'letter': week['letter'],
                'projected': week.get('projected'),
            },
            'today': [
                {
                    'id': run.pk,
                    'title': run.routine.title,
                    'kind': run.routine.kind,
                    'status': run.status,
                    'due_at': run.due_at,
                    'href': f'/routines/run/{run.pk}',
                }
                for run in today_runs
            ],
            'week': {'done': done, 'late': late, 'missed': missed, 'items': items},
            'my_sections': {'spots': my_spots, 'cross_checks': my_cross},
            'verifies': my_verifies,
            'my_cross_checks': my_checks,
            'under_review': under_review,
            'trend': trend,
        })


def models_q_assigned(user):
    from django.db.models import Q
    return Q(assigned_to=user) | Q(completed_by=user)


def _plain_spot_reason(spot: dict) -> str:
    if spot.get('safety'):
        return 'failed: safety flag'
    found = spot.get('found')
    expected = spot.get('expected_new')
    if found is None:
        return ''
    if expected is None:
        return f'{found} found'
    return f'{found} found, about {expected:.0f} expected'


def _plain_cross_reason(audit: dict) -> str:
    tail = audit.get('tail')
    if tail is None:
        return 'in normal range' if audit.get('warm') else ''
    if tail >= 0.025:
        return 'in normal range'
    if audit.get('found', 0) > (audit.get('section_mean') or 0):
        return 'higher than normal'
    return 'lower than normal'


class QaPreviewView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request):
        edited = {}
        for key, value in (request.data or {}).items():
            name = key[10:] if str(key).startswith('retail_qa.') else str(key)
            try:
                edited[name] = validate_retail_qa_value(name, value)
            except ValueError as exc:
                return Response({'detail': f'{name}: {exc}'}, status=400)
        cfg = {**retail_qa_settings(), **edited}
        errors = validate_retail_qa_bundle(cfg)
        if errors:
            return Response({'detail': errors}, status=400)
        monday = this_monday()
        before = week_grade(monday)
        after = preview_week(monday, edited)
        return Response({
            'before': {
                'thirds': before['thirds'],
                'score': before['score'],
                'letter': before['letter'],
            },
            'after': after,
        })


class QaHistoryView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        from apps.core.models import AppSettingHistory
        rows = AppSettingHistory.objects.filter(
            key__startswith='retail_qa.',
        ).select_related('changed_by')[:80]
        return Response({
            'history': [
                {
                    'key': row.key,
                    'old_value': row.old_value,
                    'new_value': row.new_value,
                    'changed_by': row.changed_by.full_name if row.changed_by_id else None,
                    'changed_at': row.changed_at,
                }
                for row in rows
            ],
        })
