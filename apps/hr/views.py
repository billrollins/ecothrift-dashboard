from django.db.models import Sum, Q, DecimalField
from django.db.models.functions import Coalesce
from django.utils import timezone
from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsEmployee, IsSuperAdmin
from .models import Department, TimeEntry, TimeEntryModificationRequest, SickLeaveBalance, SickLeaveRequest
from .serializers import (
    DepartmentSerializer, TimeEntrySerializer, TimeEntrySummarySerializer,
    TimeEntryModificationRequestSerializer,
    WeeklyHoursStatusSerializer, PayrollEmployeeRowSerializer,
    PayrollPeriodSerializer, TimeEntryRosterSerializer,
    SickLeaveBalanceSerializer, SickLeaveRequestSerializer,
)
from .services.time_clock_utils import weekly_status_for_employee
from .services.payroll_periods import list_payroll_periods
from .services.roster import build_time_roster


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
        is_manager = user.role in ('Manager', 'Admin') or user.is_superuser
        # List/summary = "my shifts" unless a manager passes ?employee=
        if user.role == 'Employee':
            qs = qs.filter(employee=user)
        elif self.action in ('list', 'summary'):
            employee_id = self.request.query_params.get('employee')
            if employee_id and is_manager:
                qs = qs.filter(employee_id=employee_id)
            else:
                qs = qs.filter(employee=user)
        # Date range filtering
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        return qs

    def get_permissions(self):
        # Manual edit/delete of time rows is a manager/admin action; clock in/out
        # for the current user goes through create + custom actions.
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsManagerOrAdmin()]
        return super().get_permissions()

    def perform_create(self, serializer):
        """Clock-in (self) or manager-added row (any employee)."""
        user = self.request.user
        target = serializer.validated_data.get('employee') or user
        is_manager = user.role in ('Manager', 'Admin') or user.is_superuser

        # Only managers may log time for someone other than themselves.
        if target != user and not is_manager:
            raise ValidationError({'employee': 'You can only clock in for yourself.'})

        # An open shift (no clock_out) collides with an existing open shift.
        creating_open = serializer.validated_data.get('clock_out') is None
        if creating_open and TimeEntry.objects.filter(
            employee=target, clock_out__isnull=True,
        ).exists():
            raise ValidationError({'detail': 'Already clocked in.'})

        now = timezone.now()
        defaults = {}
        if 'employee' not in serializer.validated_data:
            defaults['employee'] = user
        if 'date' not in serializer.validated_data:
            defaults['date'] = (
                serializer.validated_data.get('clock_in') or now
            ).date() if serializer.validated_data.get('clock_in') else now.date()
        if 'clock_in' not in serializer.validated_data:
            defaults['clock_in'] = now
        serializer.save(**defaults)

    def perform_destroy(self, instance):
        """Soft-delete; hard purge after retention window via management command."""
        instance.deleted_at = timezone.now()
        instance.deleted_by = self.request.user
        instance.save(update_fields=['deleted_at', 'deleted_by', 'updated_at'])

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def bulk_delete(self, request):
        """Soft-delete multiple time entries."""
        ids = request.data.get('ids', [])
        if not ids:
            return Response({'detail': 'No entry IDs provided.'}, status=status.HTTP_400_BAD_REQUEST)
        qs = TimeEntry.objects.filter(id__in=ids)
        count = qs.count()
        now = timezone.now()
        qs.update(deleted_at=now, deleted_by=request.user)
        return Response({'deleted': count})

    @action(detail=True, methods=['post'])
    def clock_out(self, request, pk=None):
        """Clock out: set clock_out time and compute total_hours."""
        entry = self.get_object()
        if entry.clock_out:
            return Response(
                {'detail': 'Already clocked out.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if entry.on_break:
            entry.finalize_open_break()
        entry.clock_out = timezone.now()
        if 'break_minutes' in request.data:
            entry.break_minutes = request.data.get('break_minutes', entry.break_minutes)
        entry.save()
        return Response(TimeEntrySerializer(entry).data)

    @action(detail=True, methods=['post'])
    def start_break(self, request, pk=None):
        """Start an unpaid break on the active shift."""
        entry = self.get_object()
        if entry.clock_out:
            return Response({'detail': 'Shift already ended.'}, status=status.HTTP_400_BAD_REQUEST)
        if entry.on_break:
            return Response({'detail': 'Already on break.'}, status=status.HTTP_400_BAD_REQUEST)
        entry.on_break = True
        entry.break_started_at = timezone.now()
        entry.save(update_fields=['on_break', 'break_started_at', 'updated_at'])
        return Response(TimeEntrySerializer(entry).data)

    @action(detail=True, methods=['post'])
    def end_break(self, request, pk=None):
        """End break and accumulate break minutes."""
        entry = self.get_object()
        if not entry.on_break:
            return Response({'detail': 'Not currently on break.'}, status=status.HTTP_400_BAD_REQUEST)
        entry.finalize_open_break()
        entry.save(update_fields=['break_minutes', 'on_break', 'break_started_at', 'updated_at'])
        return Response(TimeEntrySerializer(entry).data)

    @action(detail=False, methods=['get'])
    def weekly_status(self, request):
        """Current user's weekly hours vs 40h limit."""
        employee_id = request.query_params.get('employee')
        user = request.user
        if employee_id and user.role in ('Manager', 'Admin'):
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                target = User.objects.get(pk=int(employee_id))
            except (User.DoesNotExist, ValueError, TypeError):
                return Response({'detail': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            target = user
        data = weekly_status_for_employee(target)
        return Response(WeeklyHoursStatusSerializer(data).data)

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

    @action(
        detail=False,
        methods=['get'],
        permission_classes=[IsAuthenticated, IsSuperAdmin],
    )
    def payroll(self, request):
        """Superadmin payroll rollup by employee for a date range."""
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response(
                {'detail': 'date_from and date_to are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = TimeEntry.objects.filter(
            clock_out__isnull=False,
            date__gte=date_from,
            date__lte=date_to,
        ).select_related('employee', 'employee__employee')
        rows = {}
        for entry in qs:
            key = entry.employee_id
            if key not in rows:
                profile = getattr(entry.employee, 'employee', None)
                rate = getattr(profile, 'pay_rate', None)
                rows[key] = {
                    'employee_id': key,
                    'employee_name': entry.employee.full_name,
                    'pay_rate': Decimal(rate) if rate is not None else Decimal('0'),
                    'total_hours': Decimal('0'),
                    'approved_hours': Decimal('0'),
                    'pending_hours': Decimal('0'),
                    'entry_count': 0,
                }
            entry.compute_total_hours()
            hrs = entry.total_hours or Decimal('0')
            rows[key]['total_hours'] += hrs
            rows[key]['entry_count'] += 1
            if entry.status == 'approved':
                rows[key]['approved_hours'] += hrs
            else:
                rows[key]['pending_hours'] += hrs
        for row in rows.values():
            row['total_pay'] = (row['total_hours'] * row['pay_rate']).quantize(Decimal('0.01'))
        result = sorted(rows.values(), key=lambda r: r['employee_name'].lower())
        return Response(PayrollEmployeeRowSerializer(result, many=True).data)

    @action(
        detail=False,
        methods=['get'],
        permission_classes=[IsAuthenticated, IsSuperAdmin],
    )
    def payroll_periods(self, request):
        """Biweekly payroll periods (anchor Jun 8, 2026)."""
        count = int(request.query_params.get('count', 16))
        periods = list_payroll_periods(count=count)
        return Response(PayrollPeriodSerializer(periods, many=True).data)

    @action(
        detail=False,
        methods=['get'],
        permission_classes=[IsAuthenticated, IsSuperAdmin],
    )
    def roster(self, request):
        """All shifts in a date range with weekly and payroll running totals."""
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response(
                {'detail': 'date_from and date_to are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rows = build_time_roster(date_from, date_to)
        return Response(TimeEntryRosterSerializer(rows, many=True).data)

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
    Employees submit modification requests; Super Admin edits and approves.
    """
    serializer_class = TimeEntryModificationRequestSerializer
    permission_classes = [IsAuthenticated, IsEmployee]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['employee', 'status', 'time_entry']
    ordering = ['-created_at']
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = TimeEntryModificationRequest.objects.select_related(
            'time_entry', 'employee', 'reviewed_by',
        ).all()
        if not self.request.user.is_superuser:
            qs = qs.filter(employee=self.request.user)
        return qs

    def get_permissions(self):
        if self.action in (
            'partial_update', 'update', 'approve', 'reject',
            'destroy', 'bulk_delete', 'bulk_approve', 'bulk_reject',
        ):
            return [IsAuthenticated(), IsSuperAdmin()]
        return super().get_permissions()

    def perform_create(self, serializer):
        user = self.request.user
        time_entry = serializer.validated_data.get('time_entry')
        if time_entry and time_entry.employee_id != user.id and not user.is_superuser:
            raise ValidationError({'time_entry': 'You can only request changes for your own shifts.'})
        serializer.save(employee=user)

    def perform_update(self, serializer):
        obj = self.get_object()
        if obj.status != 'pending':
            raise ValidationError({'detail': 'Only pending requests can be edited.'})
        if 'time_entry' in serializer.validated_data:
            raise ValidationError({'time_entry': 'Cannot reassign the linked shift.'})
        serializer.save()

    def perform_destroy(self, instance):
        """Soft-delete modification request."""
        instance.deleted_at = timezone.now()
        instance.deleted_by = self.request.user
        instance.save(update_fields=['deleted_at', 'deleted_by'])

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, IsSuperAdmin])
    def bulk_delete(self, request):
        """Soft-delete multiple modification requests."""
        ids = request.data.get('ids', [])
        if not ids:
            return Response({'detail': 'No request IDs provided.'}, status=status.HTTP_400_BAD_REQUEST)
        qs = TimeEntryModificationRequest.objects.filter(id__in=ids)
        count = qs.count()
        now = timezone.now()
        qs.update(deleted_at=now, deleted_by=request.user)
        return Response({'deleted': count})

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, IsSuperAdmin])
    def bulk_approve(self, request):
        """Approve multiple pending modification requests."""
        ids = request.data.get('ids', [])
        if not ids:
            return Response({'detail': 'No request IDs provided.'}, status=status.HTTP_400_BAD_REQUEST)
        approved = 0
        review_note = request.data.get('review_note', '')
        for obj in TimeEntryModificationRequest.objects.filter(id__in=ids, status='pending'):
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
            obj.review_note = review_note
            obj.reviewed_at = timezone.now()
            obj.save()
            approved += 1
        return Response({'approved': approved})

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, IsSuperAdmin])
    def bulk_reject(self, request):
        """Reject multiple pending modification requests without changing time entries."""
        ids = request.data.get('ids', [])
        if not ids:
            return Response({'detail': 'No request IDs provided.'}, status=status.HTTP_400_BAD_REQUEST)
        review_note = request.data.get('review_note', '')
        now = timezone.now()
        rejected = TimeEntryModificationRequest.objects.filter(
            id__in=ids,
            status='pending',
        ).update(
            status='denied',
            reviewed_by=request.user,
            review_note=review_note,
            reviewed_at=now,
        )
        return Response({'rejected': rejected})

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsSuperAdmin])
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

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsSuperAdmin])
    def reject(self, request, pk=None):
        """Reject a modification request without applying it to the time entry."""
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
