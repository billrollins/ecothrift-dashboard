from rest_framework import serializers

from apps.accounts.models import User
from apps.hiring.models import Application, ApplicationEvent, Interview, InterviewTime, Job, Offer
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
            'hiring_manager', 'interviewers', 'hiring_manager_person', 'interviewer_people', 'emails',
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

    def validate_emails(self, value):
        from apps.hiring.careers import _check_role_emails
        errors: list[str] = []
        cleaned = _check_role_emails(value, 'This role', errors)
        if errors:
            raise serializers.ValidationError(errors)
        return cleaned

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
    next_interview = serializers.SerializerMethodField()
    offer_status = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            'id', 'first_name', 'last_name', 'full_name', 'email', 'phone', 'jobs', 'stage', 'stage_label',
            'stage_changed_at', 'rating', 'red_flags', 'flags', 'source', 'source_label', 'has_resume',
            'lead_interest', 'employee_user', 'not_now_reason', 'is_practice', 'created_at', 'next_interview',
            'offer_status',
        ]

    def get_flags(self, obj):
        return flags_of(obj)

    def get_next_interview(self, obj):
        """When the next scheduled interview starts (the list prefetches them), or None."""
        rows = getattr(obj, 'scheduled_interviews', None)
        if rows is None:
            rows = list(obj.interviews.filter(status='scheduled').order_by('start')[:1])
        return rows[0].start if rows else None

    def get_offer_status(self, obj):
        """The newest offer's status (sent, viewed, signed, declined…), or ''."""
        rows = getattr(obj, 'newest_offers', None)
        if rows is None:
            rows = list(obj.offers.order_by('-created_at', '-id')[:1])
        return rows[0].status if rows else ''

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
    interviews = serializers.SerializerMethodField()
    offers = serializers.SerializerMethodField()
    booking_link = serializers.SerializerMethodField()
    onboarding = serializers.SerializerMethodField()

    class Meta(ApplicationListSerializer.Meta):
        fields = ApplicationListSerializer.Meta.fields + [
            'answers', 'events', 'resume_file', 'sms_consent', 'sms_consent_at', 'not_now_note', 'not_now_stage',
            'not_now_reason_label', 'not_now_email_status', 'not_now_email_subject', 'not_now_email_body', 'not_now_at',
            'received_email_sent', 'employee', 'interviews', 'offers', 'booking_link', 'invited_at', 'onboarding',
        ]

    def get_interviews(self, obj):
        rows = obj.interviews.select_related('job', 'interviewer', 'scored_by').order_by('-start')
        return InterviewSerializer(rows, many=True).data

    def get_onboarding(self, obj):
        """Progress of this applicant's onboarding (after Create employee), or None."""
        from apps.hiring.models import Onboarding, OnboardingTask
        from apps.hiring.onboarding import overdue, refresh

        row = Onboarding.objects.filter(application=obj).first()
        if row is None:
            return None
        refresh(row)
        tasks = list(row.tasks.all())
        return {'id': row.pk, 'status': row.status, 'start_date': row.start_date,
                'done': sum(t.status != OnboardingTask.STATUS_OPEN for t in tasks), 'total': len(tasks),
                'overdue': sum(overdue(t) for t in tasks), 'first_day_email_sent_at': row.first_day_email_sent_at}

    def get_offers(self, obj):
        from apps.hiring.offers import refresh
        rows = list(obj.offers.select_related('supervisor').order_by('-created_at'))
        for offer in rows:
            refresh(offer)
        return OfferSerializer(rows, many=True).data

    def get_booking_link(self, obj):
        """The applicant's live interview link (to copy and text), or '' when there is none."""
        from django.utils import timezone

        from apps.hiring.interviews import public_link
        if obj.booking_token and obj.booking_token_expires and obj.booking_token_expires > timezone.now():
            return public_link(obj.booking_token)
        return ''

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


class InterviewSerializer(serializers.ModelSerializer):
    applicant_name = serializers.CharField(source='application.full_name', read_only=True)
    applicant_phone = serializers.CharField(source='application.phone', read_only=True)
    applicant_email = serializers.CharField(source='application.email', read_only=True)
    practice = serializers.BooleanField(source='application.is_practice', read_only=True)
    roles = serializers.SerializerMethodField()
    job_title = serializers.CharField(source='job.title', read_only=True, default='')
    interview_questions = serializers.SerializerMethodField()
    interviewer_person = serializers.SerializerMethodField()
    scored_by_name = serializers.SerializerMethodField()
    when = serializers.SerializerMethodField()
    status_label = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Interview
        fields = [
            'id', 'application', 'applicant_name', 'applicant_phone', 'applicant_email', 'practice', 'roles', 'job',
            'job_title',
            'start', 'end', 'when', 'interviewer', 'interviewer_person', 'place', 'status', 'status_label',
            'booked_by', 'scorecard', 'scored_by_name', 'scored_at', 'interview_questions', 'reminder_sent_at',
        ]
        read_only_fields = fields

    def get_roles(self, obj):
        return [j.title for j in obj.application.jobs.all()]

    def get_interview_questions(self, obj):
        return list(obj.job.interview_questions or []) if obj.job_id else []

    def get_interviewer_person(self, obj):
        return _person(obj.interviewer)

    def get_scored_by_name(self, obj):
        return _person(obj.scored_by)['name'] if obj.scored_by_id else ''

    def get_when(self, obj):
        from apps.hiring.interviews import when_text
        return when_text(obj.start)


class InterviewTimeSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewTime
        fields = ['id', 'kind', 'start', 'end', 'note', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        if attrs['end'] <= attrs['start']:
            raise serializers.ValidationError({'end': 'The end must be after the start.'})
        return attrs


class OfferSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    supervisor_person = serializers.SerializerMethodField()
    link = serializers.SerializerMethodField()
    has_pdf = serializers.SerializerMethodField()

    class Meta:
        model = Offer
        fields = [
            'id', 'application', 'job', 'status', 'status_label', 'position', 'pay_rate', 'employment_type',
            'start_date', 'start_time', 'schedule', 'supervisor', 'supervisor_person', 'respond_by', 'note',
            'letter_subject', 'letter_text', 'acknowledgments', 'sent_at', 'viewed_at', 'signed_at', 'declined_at',
            'decline_reason', 'withdrawn_at', 'signer_name', 'link', 'has_pdf', 'created_at',
        ]
        read_only_fields = fields

    def get_supervisor_person(self, obj):
        return _person(obj.supervisor)

    def get_link(self, obj):
        from apps.hiring.offers import public_link
        return public_link(obj.token) if obj.status in Offer.OPEN else ''

    def get_has_pdf(self, obj):
        return bool(obj.signed_pdf_id)
