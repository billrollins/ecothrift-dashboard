from django.db.models import Sum, Q, DecimalField
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsEmployee
from .models import Department, TimeEntry, TimeEntryModificationRequest, SickLeaveBalance, SickLeaveRequest
from .serializers import (
    DepartmentSerializer, TimeEntrySerializer, TimeEntrySummarySerializer,
    TimeEntryModificationRequestSerializer,
    SickLeaveBalanceSerializer, SickLeaveRequestSerializer,
)


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.select_related('location', 'manager').all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    search_fields = ['name']

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsManagerOrAdmin()]
        return super().get_permissions()


class TimeEntryViewSet(viewsets.ModelViewSet):
    serializer_class = TimeEntrySerializer
    permission_classes = [IsAuthenticated, IsEmployee]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['employee', 'date', 'status']
    ordering_fields = ['date', 'clock_in', 'created_at']
    ordering = ['-date', '-clock_in']

    def get_queryset(self):
        qs = TimeEntry.objects.select_related('employee', 'approved_by').all()
        user = self.request.user
        # Employees only see their own entries
        if user.role == 'Employee':
            qs = qs.filter(employee=user)
        # Date range filtering
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        return qs

    def perform_create(self, serializer):
        """Clock-in: auto-fill employee, date, and clock_in when not provided."""
        now = timezone.now()
        defaults = {}
        if 'employee' not in serializer.validated_data:
            defaults['employee'] = self.request.user
        if 'date' not in serializer.validated_data:
            defaults['date'] = now.date()
        if 'clock_in' not in serializer.validated_data:
            defaults['clock_in'] = now
        serializer.save(**defaults)

    @action(detail=True, methods=['post'])
    def clock_out(self, request, pk=None):
        """Clock out: set clock_out time and compute total_hours."""
        entry = self.get_object()
        if entry.clock_out:
            return Response(
                {'detail': 'Already clocked out.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entry.clock_out = timezone.now()
        entry.break_minutes = request.data.get('break_minutes', entry.break_minutes)
        entry.save()
        return Response(TimeEntrySerializer(entry).data)

    @action(detail=False, methods=['get'])
    def current(self, request):
        """Get the current user's active (clocked-in) entry."""
        entry = TimeEntry.objects.filter(
            employee=request.user, clock_out__isnull=True,
        ).first()
        if entry:
            return Response(TimeEntrySerializer(entry).data)
        return Response(None)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def bulk_approve(self, request):
        """Approve multiple time entries."""
        ids = request.data.get('ids', [])
        if not ids:
            return Response(
                {'detail': 'No entry IDs provided.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entries = TimeEntry.objects.filter(id__in=ids, status='pending')
        count = entries.count()
        for entry in entries:
            entry.status = 'approved'
            entry.approved_by = request.user
            entry.save()
            # Accrue sick leave
            if entry.total_hours:
                self._accrue_sick_leave(entry)
        return Response({'approved': count})

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def approve(self, request, pk=None):
        """Approve a single time entry."""
        entry = self.get_object()
        entry.status = 'approved'
        entry.approved_by = request.user
        entry.save()
        # Accrue sick leave
        if entry.total_hours:
            self._accrue_sick_leave(entry)
        return Response(TimeEntrySerializer(entry).data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get hours summary for a period."""
        qs = self.get_queryset()
        zero = Coalesce(Sum('total_hours'), 0, output_field=DecimalField())
        data = {
            'total_hours': qs.aggregate(total=zero)['total'],
            'total_entries': qs.count(),
            'approved_hours': qs.filter(status='approved').aggregate(total=zero)['total'],
            'pending_hours': qs.filter(status='pending').aggregate(total=zero)['total'],
        }
        return Response(TimeEntrySummarySerializer(data).data)

    def _accrue_sick_leave(self, entry):
        """Accrue sick leave when a time entry is approved."""
        year = entry.date.year
        balance, _ = SickLeaveBalance.objects.get_or_create(
            employee=entry.employee,
            year=year,
            defaults={'hours_earned': 0, 'hours_used': 0},
        )
        balance.accrue(entry.total_hours)


class TimeEntryModificationRequestViewSet(viewsets.ModelViewSet):
    """
    Employees submit modification requests; managers approve/deny.
    """
    serializer_class = TimeEntryModificationRequestSerializer
    permission_classes = [IsAuthenticated, IsEmployee]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['employee', 'status', 'time_entry']
    ordering = ['-created_at']

    def get_queryset(self):
        qs = TimeEntryModificationRequest.objects.select_related(
            'time_entry', 'employee', 'reviewed_by',
        ).all()
        if self.request.user.role == 'Employee':
            qs = qs.filter(employee=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(employee=self.request.user)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def approve(self, request, pk=None):
        """Approve a modification request and apply the changes to the time entry."""
        obj = self.get_object()
        if obj.status != 'pending':
            return Response(
                {'detail': 'Request is not pending.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Apply requested changes to the time entry
        entry = obj.time_entry
        if obj.requested_clock_in is not None:
            entry.clock_in = obj.requested_clock_in
        if obj.requested_clock_out is not None:
            entry.clock_out = obj.requested_clock_out
        if obj.requested_break_minutes is not None:
            entry.break_minutes = obj.requested_break_minutes
        entry.save()

        obj.status = 'approved'
        obj.reviewed_by = request.user
        obj.review_note = request.data.get('review_note', '')
        obj.reviewed_at = timezone.now()
        obj.save()
        return Response(TimeEntryModificationRequestSerializer(obj).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def deny(self, request, pk=None):
        """Deny a modification request."""
        obj = self.get_object()
        if obj.status != 'pending':
            return Response(
                {'detail': 'Request is not pending.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj.status = 'denied'
        obj.reviewed_by = request.user
        obj.review_note = request.data.get('review_note', '')
        obj.reviewed_at = timezone.now()
        obj.save()
        return Response(TimeEntryModificationRequestSerializer(obj).data)


class SickLeaveBalanceViewSet(viewsets.ModelViewSet):
    serializer_class = SickLeaveBalanceSerializer
    permission_classes = [IsAuthenticated, IsEmployee]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['employee', 'year']

    def get_queryset(self):
        qs = SickLeaveBalance.objects.select_related('employee').all()
        if self.request.user.role == 'Employee':
            qs = qs.filter(employee=self.request.user)
        return qs

    def get_permissions(self):
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsManagerOrAdmin()]
        return super().get_permissions()


class SickLeaveRequestViewSet(viewsets.ModelViewSet):
    serializer_class = SickLeaveRequestSerializer
    permission_classes = [IsAuthenticated, IsEmployee]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['employee', 'status']
    ordering = ['-created_at']

    def get_queryset(self):
        qs = SickLeaveRequest.objects.select_related('employee', 'reviewed_by').all()
        if self.request.user.role == 'Employee':
            qs = qs.filter(employee=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(employee=self.request.user)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def approve(self, request, pk=None):
        """Approve a sick leave request."""
        obj = self.get_object()
        if obj.status != 'pending':
            return Response(
                {'detail': 'Request is not pending.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj.status = 'approved'
        obj.reviewed_by = request.user
        obj.review_note = request.data.get('review_note', '')
        obj.reviewed_at = timezone.now()
        obj.save()

        # Deduct from balance
        balance, _ = SickLeaveBalance.objects.get_or_create(
            employee=obj.employee,
            year=obj.start_date.year,
            defaults={'hours_earned': 0, 'hours_used': 0},
        )
        balance.hours_used += obj.hours_requested
        balance.save(update_fields=['hours_used'])

        return Response(SickLeaveRequestSerializer(obj).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def deny(self, request, pk=None):
        """Deny a sick leave request."""
        obj = self.get_object()
        if obj.status != 'pending':
            return Response(
                {'detail': 'Request is not pending.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj.status = 'denied'
        obj.reviewed_by = request.user
        obj.review_note = request.data.get('review_note', '')
        obj.reviewed_at = timezone.now()
        obj.save()
        return Response(SickLeaveRequestSerializer(obj).data)
