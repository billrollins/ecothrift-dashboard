from rest_framework import serializers
from .models import Department, TimeEntry, SickLeaveBalance, SickLeaveRequest


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
            'break_minutes', 'total_hours', 'status', 'approved_by',
            'approved_by_name', 'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'total_hours', 'created_at', 'updated_at']
        extra_kwargs = {
            # Allow clock-in with empty body; view auto-fills these
            'employee': {'required': False},
            'date': {'required': False},
            'clock_in': {'required': False},
        }


class TimeEntrySummarySerializer(serializers.Serializer):
    total_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    total_entries = serializers.IntegerField()
    approved_hours = serializers.DecimalField(max_digits=8, decimal_places=2)
    pending_hours = serializers.DecimalField(max_digits=8, decimal_places=2)


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
