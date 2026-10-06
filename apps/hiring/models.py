"""Hiring: jobs on ecothrift.us/careers, applications, and every change to them.

The careers page text, the shared form questions and the emails live in the
careers file (AppSetting ``hiring.careers``, see ``careers.py``). Jobs are rows
here so applications can point at them.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models


class Job(models.Model):
    """One role on the careers page (Retail Associate, Processing Associate, ...)."""

    STATUS_DRAFT = 'draft'
    STATUS_OPEN = 'open'
    STATUS_PAUSED = 'paused'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_OPEN, 'Open'),
        (STATUS_PAUSED, 'Paused'),
        (STATUS_CLOSED, 'Closed'),
    ]

    TYPE_FULL = 'full_time'
    TYPE_PART = 'part_time'
    TYPE_EITHER = 'full_or_part'
    TYPE_CHOICES = [
        (TYPE_FULL, 'Full time'),
        (TYPE_PART, 'Part time'),
        (TYPE_EITHER, 'Full or part time'),
    ]

    slug = models.SlugField(max_length=60, unique=True)
    title = models.CharField(max_length=120)
    tagline = models.CharField(max_length=200, blank=True, default='')
    summary = models.TextField(blank=True, default='')
    duties = models.JSONField(default=list, blank=True)
    schedule = models.CharField(max_length=200, blank=True, default='')
    hours = models.CharField(max_length=120, blank=True, default='')
    employment_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_EITHER)
    pay_min = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    pay_max = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    pay_text = models.CharField(max_length=200, blank=True, default='')
    # Role questions shown on the form when this role is ticked (same shape as the careers file's form questions).
    questions = models.JSONField(default=list, blank=True)
    interview_questions = models.JSONField(default=list, blank=True)
    department = models.ForeignKey(
        'hr.Department', on_delete=models.SET_NULL, null=True, blank=True, related_name='jobs',
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )

    class Meta:
        ordering = ['sort_order', 'title']

    def __str__(self):
        return self.title


class Application(models.Model):
    """One person applying for one or more roles. Answers are a snapshot of the questions they saw."""

    STAGE_NEW = 'new'
    STAGE_REVIEWED = 'reviewed'
    STAGE_CONTACTED = 'contacted'
    STAGE_INTERVIEW_SCHEDULED = 'interview_scheduled'
    STAGE_INTERVIEWED = 'interviewed'
    STAGE_OFFER = 'offer'
    STAGE_HIRED = 'hired'
    STAGE_NOT_NOW = 'not_now'
    STAGE_CHOICES = [
        (STAGE_NEW, 'New'),
        (STAGE_REVIEWED, 'Reviewed'),
        (STAGE_CONTACTED, 'Contacted'),
        (STAGE_INTERVIEW_SCHEDULED, 'Interview scheduled'),
        (STAGE_INTERVIEWED, 'Interviewed'),
        (STAGE_OFFER, 'Offer'),
        (STAGE_HIRED, 'Hired'),
        (STAGE_NOT_NOW, 'Not now'),
    ]

    SOURCE_WEB = 'web'
    SOURCE_WALK_IN = 'walk_in'
    SOURCE_EMAIL = 'email'
    SOURCE_REFERRAL = 'referral'
    SOURCE_OTHER = 'other'
    SOURCE_CHOICES = [
        (SOURCE_WEB, 'Careers page'),
        (SOURCE_WALK_IN, 'Walk-in / paper'),
        (SOURCE_EMAIL, 'Emailed resume'),
        (SOURCE_REFERRAL, 'Referral'),
        (SOURCE_OTHER, 'Other'),
    ]

    NOT_NOW_REASONS = [
        ('hours', 'Not available for the hours we need'),
        ('must_have', 'Missing a must-have'),
        ('no_show', 'No-show for the interview'),
        ('no_response', "Didn't respond"),
        ('withdrew', 'Withdrew'),
        ('offer_declined', 'Offer declined'),
        ('other_candidate', 'Chose someone else'),
        ('position_closed', 'Position filled or closed'),
        ('other', 'Other'),
    ]

    EMAIL_PENDING = ''
    EMAIL_SENT = 'sent'
    EMAIL_NOT_SENT = 'not_sent'
    EMAIL_FAILED = 'failed'

    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80, blank=True, default='')
    email = models.EmailField(blank=True, default='', db_index=True)
    phone = models.CharField(max_length=30, blank=True, default='')
    phone_digits = models.CharField(max_length=20, blank=True, default='', db_index=True)
    jobs = models.ManyToManyField(Job, related_name='applications', blank=True)
    answers = models.JSONField(default=list, blank=True)
    resume = models.ForeignKey(
        'core.S3File', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_WEB)
    stage = models.CharField(max_length=24, choices=STAGE_CHOICES, default=STAGE_NEW, db_index=True)
    stage_changed_at = models.DateTimeField(null=True, blank=True)
    rating = models.PositiveSmallIntegerField(null=True, blank=True)
    # Flags from yes/no questions with a required answer: red = a miss, green = all met.
    red_flags = models.PositiveSmallIntegerField(default=0)

    # Text consent (house rule D17): never pre-ticked, recorded with the exact wording.
    sms_consent = models.BooleanField(default=False)
    sms_consent_at = models.DateTimeField(null=True, blank=True)
    sms_consent_version = models.CharField(max_length=40, blank=True, default='')
    sms_consent_text = models.TextField(blank=True, default='')

    not_now_reason = models.CharField(max_length=20, blank=True, default='')
    not_now_note = models.TextField(blank=True, default='')
    not_now_stage = models.CharField(max_length=24, blank=True, default='')
    not_now_email_status = models.CharField(max_length=10, blank=True, default='')
    not_now_email_subject = models.CharField(max_length=200, blank=True, default='')
    not_now_email_body = models.TextField(blank=True, default='')
    not_now_at = models.DateTimeField(null=True, blank=True)

    employee_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='hiring_applications',
    )

    received_email_sent = models.BooleanField(default=False)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.full_name} ({self.get_stage_display()})'

    @property
    def full_name(self) -> str:
        return f'{self.first_name} {self.last_name}'.strip()


class ApplicationEvent(models.Model):
    """Every change to an application: who, when, what."""

    KIND_CREATED = 'created'
    KIND_STAGE = 'stage'
    KIND_NOTE = 'note'
    KIND_RATING = 'rating'
    KIND_EMAIL = 'email'
    KIND_EMPLOYEE = 'employee'
    KIND_EDIT = 'edit'
    KIND_CHOICES = [
        (KIND_CREATED, 'Applied'),
        (KIND_STAGE, 'Stage'),
        (KIND_NOTE, 'Note'),
        (KIND_RATING, 'Rating'),
        (KIND_EMAIL, 'Email'),
        (KIND_EMPLOYEE, 'Employee'),
        (KIND_EDIT, 'Edit'),
    ]

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='events')
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    from_stage = models.CharField(max_length=24, blank=True, default='')
    to_stage = models.CharField(max_length=24, blank=True, default='')
    text = models.TextField(blank=True, default='')
    data = models.JSONField(default=dict, blank=True)
    by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-at', '-id']

    def __str__(self):
        return f'{self.application_id} {self.kind} @ {self.at}'
