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
            'expire_rule', 'expire_count', 'expire_unit', 'expire_from_time',
            'assignment', 'audience_type', 'audience_all',
            'assigned_shifts', 'assigned_department_ids',
            'assigned_role',
            'assigned_department', 'assigned_department_name', 'assigned_user_ids',
            'is_blocking', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'kind', 'system_key', 'assigned_department_name', 'created_at', 'updated_at',
        ]

    def validate_definition(self, value):
        kind = getattr(self.instance, 'kind', None) or Routine.KIND_CHECKLIST
        if kind != Routine.KIND_CHECKLIST:
            return value or {}
        errors = validate_definition(value or {})
        if errors:
            raise serializers.ValidationError(errors)
        return value

    def validate_assigned_shifts(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Shifts must be a list.')
        from apps.hr.shifts import SHIFT_ORDER
        cleaned = []
        for item in value:
            code = str(item).strip()
            if code not in SHIFT_ORDER:
                raise serializers.ValidationError(f'Unknown shift {code}.')
            if code not in cleaned:
                cleaned.append(code)
        return cleaned

    def validate_assigned_department_ids(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Departments must be a list.')
        ids = []
        for item in value:
            try:
                number = int(item)
            except (TypeError, ValueError):
                raise serializers.ValidationError('Department ids must be numbers.')
            if number > 0 and number not in ids:
                ids.append(number)
        return ids

    def validate(self, attrs):
        source = attrs.get(
            'subject_source',
            getattr(self.instance, 'subject_source', Routine.SUBJECT_POOL),
        )
        kind = attrs.get(
            'audience_type',
            getattr(self.instance, 'audience_type', Routine.AUDIENCE_PERSON),
        )
        everyone = attrs.get(
            'audience_all',
            getattr(self.instance, 'audience_all', False),
        )
        if source not in (Routine.SUBJECT_MY_SECTION, Routine.SUBJECT_OTHER_SECTION) and not everyone:
            if kind == Routine.AUDIENCE_SHIFT:
                shifts = attrs.get('assigned_shifts')
                if shifts is None:
                    shifts = getattr(self.instance, 'assigned_shifts', None) if self.instance else []
                if not shifts:
                    raise serializers.ValidationError('Pick a shift, or All shifts.')
            elif kind == Routine.AUDIENCE_DEPARTMENT:
                ids = attrs.get('assigned_department_ids')
                if ids is None:
                    ids = getattr(self.instance, 'assigned_department_ids', None) if self.instance else []
                dept = attrs.get(
                    'assigned_department',
                    getattr(self.instance, 'assigned_department', None) if self.instance else None,
                )
                if not ids and not dept:
                    raise serializers.ValidationError('Pick a department, or All departments.')
            else:
                users = attrs.get('assigned_users', None)
                if users is None and self.instance is not None:
                    users = self.instance.assigned_users.all()
                if not users:
                    raise serializers.ValidationError('Pick someone, or All staff.')
        trigger = attrs.get('trigger', getattr(self.instance, 'trigger', ''))
        anchor = attrs.get('anchor_date', getattr(self.instance, 'anchor_date', None))
        if trigger == Routine.TRIGGER_BIWEEKLY and not anchor:
            raise serializers.ValidationError({
                'anchor_date': 'Pick the next due date (today through today + 13).',
            })
        if self.instance and self.instance.system_key:
            locked = {
                'trigger': self.instance.trigger,
                'assignment': self.instance.assignment,
                'audience_type': self.instance.audience_type,
                'subject_source': self.instance.subject_source,
                'verifies': self.instance.verifies_id,
                'is_active': self.instance.is_active,
                'kind': self.instance.kind,
            }
            errors = {}
            for field, current in locked.items():
                if field not in attrs:
                    continue
                incoming = attrs[field]
                if field == 'verifies':
                    incoming = incoming.pk if incoming is not None else None
                if incoming != current:
                    errors[field] = 'Program routines keep this field as seeded.'
            if (
                'definition' in attrs
                and self.instance.kind != Routine.KIND_CHECKLIST
            ):
                errors['definition'] = 'This routine is not authored. Its runner is fixed.'
            if errors:
                raise serializers.ValidationError(errors)
        return attrs

    def _sync_department(self, validated_data):
        ids = validated_data.get('assigned_department_ids')
        if ids is None:
            return
        if ids:
            from apps.hr.models import Department
            validated_data['assigned_department'] = Department.objects.filter(pk=ids[0]).first()
        else:
            validated_data['assigned_department'] = None

    def create(self, validated_data):
        self._sync_department(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self._sync_department(validated_data)
        return super().update(instance, validated_data)


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
    audience_type = serializers.CharField(source='routine.audience_type', read_only=True)
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
            'is_blocking', 'is_overdue', 'trigger', 'assignment', 'audience_type', 'href',
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
    kind = serializers.CharField(source='routine.kind', read_only=True)

    class Meta:
        model = RoutineSubmission
        fields = [
            'id', 'routine', 'routine_title', 'kind', 'run', 'submitted_by',
            'submitted_by_name', 'status', 'responses', 'failed_count',
            'has_critical_fail', 'started_at', 'updated_at', 'submitted_at',
        ]
        read_only_fields = [
            'id', 'routine_title', 'submitted_by', 'submitted_by_name', 'status',
            'failed_count', 'has_critical_fail', 'started_at', 'updated_at',
            'submitted_at',
        ]
