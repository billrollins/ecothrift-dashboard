"""The week schedule and call-ins (owner 2026-10-21). Managers build the week and record call-ins; everyone sees their
own week. Rules and payloads: ``services/schedule.py``."""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsTeamMember

from .models import CallIn, ScheduledShift, ScheduleRequest
from .services import schedule


class ScheduledShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduledShift
        fields = ['id', 'employee', 'date', 'department', 'start_time', 'end_time', 'note']

    def validate(self, attrs):
        start = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        end = attrs.get('end_time', getattr(self.instance, 'end_time', None))
        if start and end and start == end:
            raise serializers.ValidationError({'end_time': 'The shift needs an end after its start.'})
        return attrs


class ScheduledShiftViewSet(viewsets.ModelViewSet):
    """One person's shift on one day. Manager+."""
    serializer_class = ScheduledShiftSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = ScheduledShift.objects.select_related('employee', 'department')
        start = schedule.parse_day(self.request.query_params.get('start'))
        if start:
            qs = qs.filter(date__gte=start, date__lte=start + timedelta(days=6))
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def _payload(self, row, code=status.HTTP_200_OK):
        row = ScheduledShift.objects.select_related('employee', 'department').get(pk=row.pk)
        return Response(schedule.shift_payload(row), status=code)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return self._payload(serializer.instance, status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return self._payload(serializer.instance)

    def list(self, request, *args, **kwargs):
        fixed = schedule.fixed_departments()
        return Response([schedule.shift_payload(row, fixed) for row in self.get_queryset()])


class CallInSerializer(serializers.ModelSerializer):
    class Meta:
        model = CallIn
        fields = ['id', 'employee', 'shift_date', 'scheduled_shift', 'kind', 'called_at', 'reason']

    def validate(self, attrs):
        shift = attrs.get('scheduled_shift')
        if shift is not None:
            if shift.employee_id != attrs['employee'].pk:
                raise serializers.ValidationError({'scheduled_shift': "That shift is someone else's."})
            attrs['shift_date'] = shift.date
        if attrs.get('kind', CallIn.KIND_CALLED) == CallIn.KIND_NO_SHOW:
            attrs['called_at'] = None
        return attrs


class CallInViewSet(viewsets.ModelViewSet):
    """Call-ins and no-shows. Manager+ record and remove them; ``?employee=`` and ``?days=`` filter the list."""
    serializer_class = CallInSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    pagination_class = None
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = CallIn.objects.select_related('employee', 'recorded_by', 'scheduled_shift')
        employee = self.request.query_params.get('employee')
        if employee:
            qs = qs.filter(employee_id=employee)
        days = self.request.query_params.get('days')
        if days and days.isdigit():
            qs = qs.filter(shift_date__gt=timezone.localdate() - timedelta(days=int(days)))
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        shift = data.get('scheduled_shift')
        if data.get('kind', CallIn.KIND_CALLED) == CallIn.KIND_CALLED and not data.get('called_at'):
            data['called_at'] = timezone.now()
        text = ''
        if shift is not None:
            text = f'{schedule.clock_text(shift.start_time)}-{schedule.clock_text(shift.end_time)}'
            if shift.department_id:
                text += f' {shift.department.name}'
        row = serializer.save(recorded_by=request.user, shift_text=text[:80])
        return Response(schedule.call_in_payload(row), status=status.HTTP_201_CREATED)

    def list(self, request, *args, **kwargs):
        return Response([schedule.call_in_payload(row) for row in self.get_queryset()])


class ScheduleRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduleRequest
        fields = ['kind', 'date', 'end_date', 'start_time', 'end_time', 'note']
        extra_kwargs = {'end_date': {'required': False}}

    def validate(self, attrs):
        if attrs['date'] < timezone.localdate():
            raise serializers.ValidationError({'date': 'Pick today or a later day.'})
        if attrs['kind'] == ScheduleRequest.KIND_OFF:
            attrs['end_date'] = attrs.get('end_date') or attrs['date']
            if attrs['end_date'] < attrs['date']:
                raise serializers.ValidationError({'end_date': 'The last day off comes after the first.'})
            if (attrs['end_date'] - attrs['date']).days > 60:
                raise serializers.ValidationError({'end_date': 'Ask for 60 days or fewer at a time.'})
            attrs['start_time'] = attrs['end_time'] = None
        else:
            attrs['end_date'] = attrs['date']
            start, end = attrs.get('start_time'), attrs.get('end_time')
            if not start or not end or start == end:
                raise serializers.ValidationError({'end_time': 'Say the start and end you are asking for.'})
        return attrs


class ScheduleRequestViewSet(viewsets.GenericViewSet):
    """Ask a manager for days off or new times (anyone on the team, for themselves); withdraw your own while it waits.
    Managers (``hr.schedule:write``) see everyone's and answer them at ``decide``. ``?status=pending`` filters."""
    permission_classes = [IsTeamMember]
    serializer_class = ScheduleRequestSerializer
    pagination_class = None

    def _manager(self):
        return IsManagerOrAdmin().has_permission(self.request, self)

    def get_queryset(self):
        qs = ScheduleRequest.objects.select_related('employee', 'decided_by')
        if not self._manager():
            qs = qs.filter(employee=self.request.user)
        status_ = self.request.query_params.get('status')
        return qs.filter(status=status_) if status_ else qs

    def list(self, request):
        return Response([schedule.request_payload(r) for r in self.get_queryset()])

    def create(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = serializer.save(employee=request.user)
        row = ScheduleRequest.objects.select_related('employee', 'decided_by').get(pk=row.pk)
        return Response(schedule.request_payload(row), status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        """Withdraw: only your own, only while it waits. The row stays, marked withdrawn."""
        row = self.get_queryset().filter(pk=pk, employee=request.user).first()
        if row is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if row.status != ScheduleRequest.PENDING:
            return Response({'detail': 'That request has already been answered.'}, status=status.HTTP_400_BAD_REQUEST)
        row.status = ScheduleRequest.WITHDRAWN
        row.save(update_fields=['status'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def decide(self, request, pk=None):
        """``{approve: true|false, reply}``."""
        row = ScheduleRequest.objects.select_related('employee', 'decided_by').filter(pk=pk).first()
        if row is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if not isinstance(request.data.get('approve'), bool):
            return Response({'detail': 'Say approve true or false.'}, status=status.HTTP_400_BAD_REQUEST)
        schedule.decide_request(row, request.data['approve'], str(request.data.get('reply') or ''), request.user)
        return Response(schedule.request_payload(row))


@api_view(['GET'])
@permission_classes([IsTeamMember])
def schedule_week_view(request):
    """The week: everyone, their shifts and their state right now (Dash Updates #6: every team member sees it).
    Managers also get the week's call-ins and the call-in counts (30 and 90 days) and can edit."""
    manager = IsManagerOrAdmin().has_permission(request, None)
    return Response(schedule.week(schedule.parse_day(request.query_params.get('start')) or timezone.localdate(),
                                  manager=manager, viewer_id=request.user.pk))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def schedule_copy_week_view(request):
    """``{from, to}``: copy one week onto another; days someone already has are kept."""
    source = schedule.parse_day(request.data.get('from'), 'from')
    target = schedule.parse_day(request.data.get('to'), 'to')
    if not source or not target:
        return Response({'detail': 'Say which week to copy from and to.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'made': schedule.copy_week(source, target, request.user)})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def schedule_fill_usual_view(request):
    """``{start}``: start a week from the usual weekly shifts; days already set are kept."""
    target = schedule.parse_day(request.data.get('start'))
    if not target:
        return Response({'detail': 'Say which week.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'made': schedule.fill_from_usual(target, request.user)})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def schedule_clear_week_view(request):
    """``{start}``: empty that week's schedule (Dash Updates #74). The page asks the manager to type to confirm."""
    target = schedule.parse_day(request.data.get('start'))
    if not target:
        return Response({'detail': 'Say which week.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'cleared': schedule.clear_week(target)})


@api_view(['GET'])
@permission_classes([IsTeamMember])
def my_week_view(request):
    """My shifts this week and next (``?start=`` another week)."""
    return Response(schedule.my_week(request.user, schedule.parse_day(request.query_params.get('start'))))
