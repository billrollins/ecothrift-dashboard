from rest_framework import serializers

from apps.accounts.models import User
from apps.hiring.models import Application, ApplicationEvent, Job
from apps.hiring.services import flags_of


def _person(user) -> dict | None:
    if not user:
        return None
    return {'id': user.pk, 'email': user.email, 'name': (user.full_name or '').strip() or user.email}


class JobSerializer(serializers.ModelSerializer):
    application_count = serializers.IntegerField(read_only=True, default=0)
    hiring_manager = serializers.PrimaryKeyRelatedField(queryset=User.objects.none(), allow_null=True, required=False)
    interviewers = serializers.PrimaryKeyRelatedField(queryset=User.objects.none(), many=True, required=False)
    hiring_manager_person = serializers.SerializerMethodField()
    interviewer_people = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = [
            'id', 'slug', 'title', 'tagline', 'summary', 'duties', 'success', 'looking_for', 'nice_to_have', 'physical',
            'works_with', 'schedule', 'hours', 'employment_type',
            'pay_min', 'pay_max', 'pay_text', 'questions', 'interview_questions', 'department', 'status',
            'hiring_manager', 'interviewers', 'hiring_manager_person', 'interviewer_people',
            'sort_order', 'application_count', 'updated_at',
        ]
        read_only_fields = ['id', 'application_count', 'updated_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from apps.hiring.careers import staff_users
        self.fields['hiring_manager'].queryset = staff_users()
        self.fields['interviewers'].child_relation.queryset = staff_users()

    def get_hiring_manager_person(self, obj):
        return _person(obj.hiring_manager)

    def get_interviewer_people(self, obj):
        return [_person(u) for u in obj.interviewers.all()]

    def validate_slug(self, value):
        from django.utils.text import slugify
        value = slugify(value)[:60]
        if not value:
            raise serializers.ValidationError('A slug is required.')
        return value

    @staticmethod
    def _lines(value, label):
        if value in (None, ''):
            return []
        if isinstance(value, str):
            value = value.splitlines()
        if not isinstance(value, list):
            raise serializers.ValidationError(f'{label} must be a list of lines.')
        return [str(v).strip().lstrip('-• ').strip()[:300] for v in value if str(v).strip()]

    def validate_duties(self, value):
        return self._lines(value, 'Duties')

    def validate_success(self, value):
        return self._lines(value, 'What great looks like')

    def validate_looking_for(self, value):
        return self._lines(value, 'What we are looking for')

    def validate_nice_to_have(self, value):
        return self._lines(value, 'Nice to have')

    def validate_physical(self, value):
        return self._lines(value, 'The physical side')

    def validate_questions(self, value):
        return self._questions(value, 'questions')

    def validate_interview_questions(self, value):
        return self._questions(value, 'interview_questions')

    def _questions(self, value, where):
        from apps.hiring.careers import _check_questions
        errors: list[str] = []
        cleaned = _check_questions(value, where, errors, [])
        if errors:
            raise serializers.ValidationError(errors)
        return cleaned


class PublicJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = [
            'slug', 'title', 'tagline', 'summary', 'duties', 'success', 'looking_for', 'nice_to_have', 'physical',
            'works_with', 'schedule', 'hours', 'employment_type', 'pay_min', 'pay_text', 'questions', 'updated_at',
        ]


class JobChipSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = ['id', 'slug', 'title']


class ApplicationListSerializer(serializers.ModelSerializer):
    jobs = JobChipSerializer(many=True, read_only=True)
    full_name = serializers.CharField(read_only=True)
    stage_label = serializers.CharField(source='get_stage_display', read_only=True)
    source_label = serializers.CharField(source='get_source_display', read_only=True)
    flags = serializers.SerializerMethodField()
    has_resume = serializers.SerializerMethodField()
    lead_interest = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            'id', 'first_name', 'last_name', 'full_name', 'email', 'phone', 'jobs', 'stage', 'stage_label',
            'stage_changed_at', 'rating', 'red_flags', 'flags', 'source', 'source_label', 'has_resume',
            'lead_interest', 'employee_user', 'not_now_reason', 'created_at',
        ]

    def get_flags(self, obj):
        return flags_of(obj)

    def get_has_resume(self, obj):
        return bool(obj.resume_id)

    def get_lead_interest(self, obj):
        """The answer to "Would you like to lead your area?" (Yes / Maybe / No…), or ''."""
        from apps.hiring.careers import LEAD_INTEREST_KEY
        for answer in obj.answers or []:
            if answer.get('key') == LEAD_INTEREST_KEY:
                return answer.get('answer') or ''
        return ''


class ApplicationEventSerializer(serializers.ModelSerializer):
    by_name = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)

    class Meta:
        model = ApplicationEvent
        fields = ['id', 'kind', 'kind_label', 'from_stage', 'to_stage', 'text', 'data', 'by_name', 'at']

    def get_by_name(self, obj):
        if not obj.by_id:
            return ''
        return (obj.by.full_name or '').strip() or obj.by.email


class ApplicationDetailSerializer(ApplicationListSerializer):
    events = ApplicationEventSerializer(many=True, read_only=True)
    resume_file = serializers.SerializerMethodField()
    not_now_reason_label = serializers.SerializerMethodField()
    employee = serializers.SerializerMethodField()

    class Meta(ApplicationListSerializer.Meta):
        fields = ApplicationListSerializer.Meta.fields + [
            'answers', 'events', 'resume_file', 'sms_consent', 'sms_consent_at', 'not_now_note', 'not_now_stage',
            'not_now_reason_label', 'not_now_email_status', 'not_now_email_subject', 'not_now_email_body', 'not_now_at',
            'received_email_sent', 'employee',
        ]

    def get_resume_file(self, obj):
        if not obj.resume_id:
            return None
        return {'filename': obj.resume.filename, 'size': obj.resume.size, 'content_type': obj.resume.content_type}

    def get_not_now_reason_label(self, obj):
        return dict(Application.NOT_NOW_REASONS).get(obj.not_now_reason, '')

    def get_employee(self, obj):
        user = obj.employee_user
        if not user:
            return None
        profile = getattr(user, 'employee', None)
        return {
            'user_id': user.pk,
            'email': user.email,
            'employee_number': getattr(profile, 'employee_number', ''),
            'position': getattr(profile, 'position', ''),
            'pay_rate': str(getattr(profile, 'pay_rate', '') or ''),
            'hire_date': getattr(profile, 'hire_date', None),
        }
