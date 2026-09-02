from django.contrib.auth import get_user_model
from rest_framework import serializers

from .definition import validate_definition
from .models import Routine, RoutineRun, RoutineSubmission, Section
from .schedule import is_overdue, run_moments, was_late

User = get_user_model()


class RoutineSerializer(serializers.ModelSerializer):
    assigned_department_name = serializers.CharField(
        source='assigned_department.name', read_only=True, default=None,
    )
    assigned_user_ids = serializers.PrimaryKeyRelatedField(
        source='assigned_users', many=True, queryset=User.objects.all(),
        required=False,
    )

    class Meta:
        model = Routine
        fields = [
            'id', 'title', 'intro', 'icon', 'kind', 'system_key', 'verifies',
            'subject_source', 'definition', 'trigger', 'weekdays',
            'anchor_date', 'remind_time', 'due_time', 'late_after', 'grace_days',
            'assignment', 'assigned_role',
            'assigned_department', 'assigned_department_name', 'assigned_user_ids',
            'subject_pool', 'is_blocking', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'kind', 'system_key', 'assigned_department_name', 'created_at', 'updated_at',
        ]

    def validate_definition(self, value):
        errors = validate_definition(value or {})
        if errors:
            raise serializers.ValidationError(errors)
        return value

    def validate_subject_pool(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Sections must be a list.')
        cleaned = [str(item).strip() for item in value]
        if any(not item for item in cleaned):
            raise serializers.ValidationError('Section names cannot be blank.')
        if len(set(cleaned)) != len(cleaned):
            raise serializers.ValidationError('Section names must be unique.')
        return cleaned

    def validate(self, attrs):
        role = attrs.get('assigned_role', getattr(self.instance, 'assigned_role', ''))
        dept = attrs.get('assigned_department', getattr(self.instance, 'assigned_department', None))
        users = attrs.get('assigned_users', None)
        if users is None and self.instance is not None:
            users = self.instance.assigned_users.all()
        has_users = bool(users)
        if not role and not dept and not has_users:
            raise serializers.ValidationError(
                'Assign a person, a department, or a role.',
            )
        trigger = attrs.get('trigger', getattr(self.instance, 'trigger', ''))
        anchor = attrs.get('anchor_date', getattr(self.instance, 'anchor_date', None))
        if trigger == Routine.TRIGGER_BIWEEKLY and not anchor:
            raise serializers.ValidationError({
                'anchor_date': 'Pick the next due date (today through today + 13).',
            })
        return attrs


class SectionSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    owner_name = serializers.CharField(source='owner.full_name', read_only=True, default=None)

    class Meta:
        model = Section
        fields = [
            'id', 'department', 'department_name', 'name', 'owner', 'owner_name',
            'is_active', 'sort_order', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'department_name', 'owner_name', 'created_at', 'updated_at']

    def validate_name(self, value):
        cleaned = (value or '').strip()
        if not cleaned:
            raise serializers.ValidationError('Name a section before saving it.')
        return cleaned


class RoutineRunSerializer(serializers.ModelSerializer):
    title = serializers.CharField(source='routine.title', read_only=True)
    intro = serializers.CharField(source='routine.intro', read_only=True)
    is_blocking = serializers.BooleanField(source='routine.is_blocking', read_only=True)
    trigger = serializers.CharField(source='routine.trigger', read_only=True)
    assignment = serializers.CharField(source='routine.assignment', read_only=True)
    kind = serializers.CharField(source='routine.kind', read_only=True)
    system_key = serializers.CharField(source='routine.system_key', read_only=True, default=None)
    section_name = serializers.CharField(source='section.name', read_only=True, default=None)
    remind_at = serializers.SerializerMethodField()
    nag_at = serializers.SerializerMethodField()
    late_at = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    assigned_to_name = serializers.CharField(
        source='assigned_to.full_name', read_only=True, default=None,
    )
    department_name = serializers.SerializerMethodField()
    href = serializers.SerializerMethodField()
    completed_by_name = serializers.CharField(
        source='completed_by.full_name', read_only=True, default=None,
    )
    completed_late = serializers.SerializerMethodField()
    failed_count = serializers.IntegerField(
        source='submission.failed_count', read_only=True, default=0,
    )
    has_critical_fail = serializers.BooleanField(
        source='submission.has_critical_fail', read_only=True, default=False,
    )

    class Meta:
        model = RoutineRun
        fields = [
            'id', 'routine', 'title', 'intro', 'period_key', 'subject', 'due_at',
            'remind_at', 'nag_at', 'late_at',
            'assigned_to', 'assigned_to_name', 'department_name', 'status',
            'is_blocking', 'is_overdue', 'trigger', 'assignment', 'href',
            'kind', 'system_key', 'section', 'section_name', 'generated',
            'completed_at', 'completed_by', 'completed_by_name', 'completed_late',
            'failed_count', 'has_critical_fail',
        ]
        read_only_fields = fields

    def get_remind_at(self, obj):
        return run_moments(obj)['remind_at']

    def get_nag_at(self, obj):
        return run_moments(obj)['nag_at']

    def get_late_at(self, obj):
        return run_moments(obj)['late_at']

    def get_is_overdue(self, obj):
        return is_overdue(obj)

    def get_completed_late(self, obj):
        return was_late(obj)

    def get_href(self, obj):
        return f'/routines/run/{obj.pk}'

    def get_department_name(self, obj):
        duty_dept = getattr(obj.routine.assigned_department, 'name', None)
        if duty_dept:
            return duty_dept
        employee = getattr(obj.assigned_to, 'employee', None) if obj.assigned_to_id else None
        dept = getattr(employee, 'department', None)
        return getattr(dept, 'name', None)


class RoutineSubmissionSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.CharField(
        source='submitted_by.full_name', read_only=True, default=None,
    )
    routine_title = serializers.CharField(source='routine.title', read_only=True)

    class Meta:
        model = RoutineSubmission
        fields = [
            'id', 'routine', 'routine_title', 'run', 'submitted_by',
            'submitted_by_name', 'status', 'responses', 'failed_count',
            'has_critical_fail', 'started_at', 'updated_at', 'submitted_at',
        ]
        read_only_fields = [
            'id', 'routine_title', 'submitted_by', 'submitted_by_name', 'status',
            'failed_count', 'has_critical_fail', 'started_at', 'updated_at',
            'submitted_at',
        ]
