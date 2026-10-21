"""The week schedule and call-ins (owner 2026-10-21). Managers build the week and record call-ins; everyone sees their
own week. Rules and payloads: ``services/schedule.py``."""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsTeamMember

from .models import CallIn, ScheduledShift
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


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def schedule_week_view(request):
    """The week a manager builds: everyone, their shifts, the week's call-ins, and call-in counts (30 and 90 days)."""
    return Response(schedule.week(schedule.parse_day(request.query_params.get('start')) or timezone.localdate()))


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


@api_view(['GET'])
@permission_classes([IsTeamMember])
def my_week_view(request):
    """My shifts this week and next (``?start=`` another week)."""
    return Response(schedule.my_week(request.user, schedule.parse_day(request.query_params.get('start'))))
