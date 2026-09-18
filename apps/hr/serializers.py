from rest_framework import serializers
from .models import (
    Department, TimeEntry, TimeEntryModificationRequest, SickLeaveBalance,
    SickLeaveRequest, Shift, ShiftAssignment,
)
from .shifts import shift_department, shift_label


class DepartmentSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source='manager.full_name', read_only=True, default=None)
    location_name = serializers.CharField(source='location.name', read_only=True, default=None)
    home_count = serializers.SerializerMethodField()
    shift_count = serializers.SerializerMethodField()
    section_count = serializers.SerializerMethodField()
    dependencies = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = [
            'id', 'name', 'slug', 'icon', 'sort_order', 'description',
            'location', 'location_name', 'manager', 'manager_name', 'is_active',
            'home_count', 'shift_count', 'section_count', 'dependencies',
        ]
        extra_kwargs = {
            'slug': {'required': False, 'allow_blank': True},
        }

    def get_home_count(self, obj):
        return int(getattr(obj, 'home_count', 0) or 0)

    def get_shift_count(self, obj):
        return int(getattr(obj, 'shift_count', 0) or 0)

    def get_section_count(self, obj):
        return int(getattr(obj, 'section_count', 0) or 0)

    def get_dependencies(self, obj):
        from apps.hr.services.departments import department_dependencies
        cached = self.context.get('dependency_cache')
        if cached is not None and obj.pk in cached:
            return cached[obj.pk]
        return department_dependencies(obj)


class TimeEntrySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.full_name', read_only=True, default=None)
    shift_label = serializers.SerializerMethodField()
    shift_department = serializers.SerializerMethodField()

    class Meta:
        model = TimeEntry
        fields = [
            'id', 'employee', 'employee_name', 'date', 'clock_in', 'clock_out',
            'shift', 'shift_label', 'shift_department',
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
        # Skip UniqueTogetherValidator - it requires employee/date/clock_in before
        # perform_create can auto-fill them. DB unique_together still applies on save.
        validators = []

    def _language(self):
        request = self.context.get('request')
        if request is not None:
            return getattr(request.user, 'language', 'en') or 'en'
        return 'en'

    def get_shift_label(self, obj):
        return shift_label(obj.shift, self._language()) if obj.shift else ''

    def get_shift_department(self, obj):
        return shift_department(obj.shift, self._language()) if obj.shift else ''


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
    hours_this_week = serializers.DecimalField(max_digits=8, decimal_places=2)
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


class MyPayPeriodSerializer(PayrollPeriodSerializer):
    shift_count = serializers.IntegerField()
    total_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    approved_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    pending_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    total_pay = serializers.DecimalField(max_digits=10, decimal_places=2)


class TimeEntryRosterSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    employee_id = serializers.IntegerField()
    employee_name = serializers.CharField()
    date = serializers.DateField()
    clock_in = serializers.DateTimeField(allow_null=True)
    clock_out = serializers.DateTimeField(allow_null=True)
    shift = serializers.CharField(allow_blank=True)
    shift_label = serializers.CharField()
    break_minutes = serializers.IntegerField()
    break_label = serializers.CharField()
    on_break = serializers.BooleanField()
    total_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    pay_rate = serializers.DecimalField(max_digits=8, decimal_places=2)
    pay = serializers.DecimalField(max_digits=10, decimal_places=2)
    week_start = serializers.DateField()
    week_end = serializers.DateField()
    weekly_cumulative_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
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


class ShiftSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    department_slug = serializers.CharField(source='department.slug', read_only=True)
    department_sort = serializers.IntegerField(source='department.sort_order', read_only=True)
    assigned_count = serializers.IntegerField(source='assignments.count', read_only=True)
    locked = serializers.SerializerMethodField()
    locked_title = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = [
            'id', 'name', 'department', 'department_name', 'department_slug',
            'department_sort', 'time_in', 'time_out', 'weekdays', 'punch_code',
            'is_active', 'assigned_count', 'locked', 'locked_title',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'department_name', 'department_slug', 'department_sort',
            'assigned_count', 'locked', 'locked_title', 'created_at', 'updated_at',
        ]

    def get_locked(self, obj) -> bool:
        return bool(self._locked_routine(obj))

    def get_locked_title(self, obj) -> str:
        routine = self._locked_routine(obj)
        return getattr(routine, 'title', '') or ''

    def _locked_routine(self, obj):
        cache = self.context.setdefault('_locked_routines', {})
        if obj.pk not in cache:
            from apps.routines.models import Routine
            cache[obj.pk] = (
                Routine.objects.filter(shift_id=obj.pk, shift_locked=True, is_active=True)
                .only('id', 'title')
                .first()
            )
        return cache[obj.pk]

    def validate_weekdays(self, value):
        return _clean_weekdays(value)


class ShiftAssignmentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    shift_name = serializers.CharField(source='shift.name', read_only=True)
    department_name = serializers.CharField(source='shift.department.name', read_only=True)
    time_in = serializers.TimeField(source='shift.time_in', read_only=True)
    time_out = serializers.TimeField(source='shift.time_out', read_only=True)

    class Meta:
        model = ShiftAssignment
        fields = [
            'id', 'employee', 'employee_name', 'shift', 'shift_name',
            'department_name', 'time_in', 'time_out', 'weekdays', 'created_at',
        ]
        read_only_fields = [
            'id', 'employee_name', 'shift_name', 'department_name',
            'time_in', 'time_out', 'created_at',
        ]

    def validate_weekdays(self, value):
        return _clean_weekdays(value)


def _clean_weekdays(value):
    if not isinstance(value, list):
        raise serializers.ValidationError('Weekdays must be a list of 0-6.')
    days = []
    for item in value:
        try:
            day = int(item)
        except (TypeError, ValueError):
            raise serializers.ValidationError('Weekdays must be numbers 0-6.')
        if day < 0 or day > 6:
            raise serializers.ValidationError('Weekdays must be 0 (Monday) through 6 (Sunday).')
        if day not in days:
            days.append(day)
    return days
