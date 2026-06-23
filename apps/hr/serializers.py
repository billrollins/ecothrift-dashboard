from rest_framework import serializers
from .models import Department, TimeEntry, TimeEntryModificationRequest, SickLeaveBalance, SickLeaveRequest


class DepartmentSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source='manager.full_name', read_only=True, default=None)
    location_name = serializers.CharField(source='location.name', read_only=True, default=None)

    class Meta:
        model = Department
        fields = [
            'id', 'name', 'description', 'location', 'location_name',
            'manager', 'manager_name', 'is_active',
        ]


class TimeEntrySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.full_name', read_only=True, default=None)

    class Meta:
        model = TimeEntry
        fields = [
            'id', 'employee', 'employee_name', 'date', 'clock_in', 'clock_out',
            'break_minutes', 'on_break', 'break_started_at',
            'total_hours', 'status', 'approved_by',
            'approved_by_name', 'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'total_hours', 'on_break', 'break_started_at', 'created_at', 'updated_at']
        extra_kwargs = {
            # Allow clock-in with empty body; view auto-fills these in perform_create
            'employee': {'required': False},
            'date': {'required': False},
            'clock_in': {'required': False},
        }
        # Skip UniqueTogetherValidator — it requires employee/date/clock_in before
        # perform_create can auto-fill them. DB unique_together still applies on save.
        validators = []


class TimeEntrySummarySerializer(serializers.Serializer):
    total_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    total_entries = serializers.IntegerField()
    approved_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    pending_hours = serializers.DecimalField(max_digits=8, decimal_places=2)


class WeeklyHoursStatusSerializer(serializers.Serializer):
    week_start = serializers.DateField()
    week_end = serializers.DateField()
    hours_worked = serializers.DecimalField(max_digits=8, decimal_places=2)
    hours_limit = serializers.DecimalField(max_digits=8, decimal_places=2)
    hours_remaining = serializers.DecimalField(max_digits=8, decimal_places=2)
    is_at_limit = serializers.BooleanField()
    is_over_limit = serializers.BooleanField()
    overtime_hours = serializers.DecimalField(max_digits=8, decimal_places=2)


class PayrollEmployeeRowSerializer(serializers.Serializer):
    employee_id = serializers.IntegerField()
    employee_name = serializers.CharField()
    pay_rate = serializers.DecimalField(max_digits=8, decimal_places=2)
    total_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    total_pay = serializers.DecimalField(max_digits=10, decimal_places=2)
    approved_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    pending_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    entry_count = serializers.IntegerField()


class PayrollPeriodSerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()
    label = serializers.CharField()
    is_current = serializers.BooleanField()


class TimeEntryRosterSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    employee_id = serializers.IntegerField()
    employee_name = serializers.CharField()
    date = serializers.DateField()
    clock_in = serializers.DateTimeField(allow_null=True)
    clock_out = serializers.DateTimeField(allow_null=True)
    break_minutes = serializers.IntegerField()
    break_label = serializers.CharField()
    on_break = serializers.BooleanField()
    total_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    pay_rate = serializers.DecimalField(max_digits=8, decimal_places=2)
    pay = serializers.DecimalField(max_digits=10, decimal_places=2)
    week_start = serializers.DateField()
    week_end = serializers.DateField()
    weekly_cumulative_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    payroll_cumulative_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    is_open = serializers.BooleanField()


class TimeEntryModificationRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name', read_only=True, default=None)
    entry_date = serializers.DateField(source='time_entry.date', read_only=True)
    entry_clock_in = serializers.DateTimeField(source='time_entry.clock_in', read_only=True)
    entry_clock_out = serializers.DateTimeField(source='time_entry.clock_out', read_only=True)

    class Meta:
        model = TimeEntryModificationRequest
        fields = [
            'id', 'time_entry', 'employee', 'employee_name',
            'entry_date', 'entry_clock_in', 'entry_clock_out',
            'requested_clock_in', 'requested_clock_out', 'requested_break_minutes',
            'reason', 'status', 'reviewed_by', 'reviewed_by_name',
            'review_note', 'reviewed_at', 'created_at',
        ]
        read_only_fields = [
            'id', 'employee', 'status', 'reviewed_by',
            'reviewed_by_name', 'review_note', 'reviewed_at', 'created_at',
            'employee_name', 'entry_date', 'entry_clock_in', 'entry_clock_out',
        ]


class SickLeaveBalanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    hours_available = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)
    is_capped = serializers.BooleanField(read_only=True)

    class Meta:
        model = SickLeaveBalance
        fields = [
            'id', 'employee', 'employee_name', 'year',
            'hours_earned', 'hours_used', 'hours_available', 'is_capped',
        ]
        read_only_fields = ['id']


class SickLeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name', read_only=True, default=None)

    class Meta:
        model = SickLeaveRequest
        fields = [
            'id', 'employee', 'employee_name', 'start_date', 'end_date',
            'hours_requested', 'status', 'reason', 'reviewed_by',
            'reviewed_by_name', 'review_note', 'reviewed_at', 'created_at',
        ]
        read_only_fields = ['id', 'reviewed_at', 'created_at']
