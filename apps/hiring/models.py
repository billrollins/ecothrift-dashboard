"""Hiring: jobs on ecothrift.us/careers, applications, and every change to them.

The careers page text, the shared form questions and the emails live in the
careers file (AppSetting ``hiring.careers``, see ``careers.py``). Jobs are rows
here so applications can point at them.
"""
from __future__ import annotations

import uuid

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
    # The role page: About the role, What you'll do, What great looks like, What we're looking for,
    # Nice to have, The physical side (the essential physical demands, stated plainly), Who you'll work with.
    summary = models.TextField(blank=True, default='')
    duties = models.JSONField(default=list, blank=True)
    success = models.JSONField(default=list, blank=True)
    looking_for = models.JSONField(default=list, blank=True)
    nice_to_have = models.JSONField(default=list, blank=True)
    physical = models.JSONField(default=list, blank=True)
    works_with = models.CharField(max_length=200, blank=True, default='')
    schedule = models.CharField(max_length=200, blank=True, default='')
    hours = models.CharField(max_length=120, blank=True, default='')
    employment_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_EITHER)
    pay_min = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    pay_max = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    pay_text = models.CharField(max_length=200, blank=True, default='')
    # Role questions shown on the form when this role is ticked (same shape as the careers file's form questions).
    questions = models.JSONField(default=list, blank=True)
    interview_questions = models.JSONField(default=list, blank=True)
    # Per-role versions of any email ({template key: {subject, body}}); missing keys use the universal one.
    emails = models.JSONField(default=dict, blank=True)
    department = models.ForeignKey(
        'hr.Department', on_delete=models.SET_NULL, null=True, blank=True, related_name='jobs',
    )
    # Who owns hiring for this role (gets the new-application alert) and who sits in its interviews.
    hiring_manager = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='hiring_jobs_managed',
    )
    interviewers = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='hiring_jobs_interviewing')
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

    # The private interview link (/careers/interview?t=…). Opening it from the email proves the address.
    # Kept plain (not hashed) so staff can copy it again; it only books this applicant's interview.
    booking_token = models.CharField(max_length=64, blank=True, default='', db_index=True)
    booking_token_expires = models.DateTimeField(null=True, blank=True)
    invited_at = models.DateTimeField(null=True, blank=True)

    # A practice run (staff trying the flow). Blank answers got placeholders; its emails say [Practice];
    # its interviews never block a real applicant's time; it can't become an employee.
    is_practice = models.BooleanField(default=False, db_index=True)

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


class Interview(models.Model):
    """One interview for one application. One at a time across the store (a small team)."""

    STATUS_SCHEDULED = 'scheduled'
    STATUS_DONE = 'done'
    STATUS_NO_SHOW = 'no_show'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_SCHEDULED, 'Scheduled'),
        (STATUS_DONE, 'Done'),
        (STATUS_NO_SHOW, 'No-show'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    BY_APPLICANT = 'applicant'
    BY_STAFF = 'staff'

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='interviews')
    job = models.ForeignKey(Job, on_delete=models.SET_NULL, null=True, blank=True, related_name='interviews')
    start = models.DateTimeField(db_index=True)
    end = models.DateTimeField()
    interviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='hiring_interviews',
    )
    place = models.CharField(max_length=200, blank=True, default='')
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_SCHEDULED, db_index=True)
    booked_by = models.CharField(max_length=10, default=BY_APPLICANT)
    # {answers: [{key, label, rating 1-5, note}], overall: hire|maybe|no, lead_potential: yes|maybe|no, notes}
    scorecard = models.JSONField(default=dict, blank=True)
    scored_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    scored_at = models.DateTimeField(null=True, blank=True)
    reminder_sent_at = models.DateTimeField(null=True, blank=True)
    ics_sequence = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['start']

    def __str__(self):
        return f'{self.application} @ {self.start}'


class InterviewTime(models.Model):
    """An extra opening outside the weekly hours, or a blocked stretch inside them."""

    KIND_OPEN = 'open'
    KIND_BLOCK = 'block'
    KIND_CHOICES = [(KIND_OPEN, 'Extra opening'), (KIND_BLOCK, 'Blocked')]

    kind = models.CharField(max_length=5, choices=KIND_CHOICES)
    start = models.DateTimeField(db_index=True)
    end = models.DateTimeField()
    note = models.CharField(max_length=200, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['start']

    def __str__(self):
        return f'{self.kind} {self.start}–{self.end}'


class Offer(models.Model):
    """A job offer, sent as a private link and signed on a phone. The letter is frozen when sent."""

    STATUS_SENT = 'sent'
    STATUS_VIEWED = 'viewed'
    STATUS_SIGNED = 'signed'
    STATUS_DECLINED = 'declined'
    STATUS_EXPIRED = 'expired'
    STATUS_WITHDRAWN = 'withdrawn'
    STATUS_CHOICES = [
        (STATUS_SENT, 'Sent'),
        (STATUS_VIEWED, 'Viewed'),
        (STATUS_SIGNED, 'Signed'),
        (STATUS_DECLINED, 'Declined'),
        (STATUS_EXPIRED, 'Expired'),
        (STATUS_WITHDRAWN, 'Withdrawn'),
    ]
    OPEN = (STATUS_SENT, STATUS_VIEWED)

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='offers')
    job = models.ForeignKey(Job, on_delete=models.SET_NULL, null=True, blank=True, related_name='offers')
    token = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_SENT, db_index=True)
    # The terms.
    position = models.CharField(max_length=120)
    pay_rate = models.DecimalField(max_digits=8, decimal_places=2)
    employment_type = models.CharField(max_length=20, default='part_time')
    start_date = models.DateField()
    start_time = models.TimeField(null=True, blank=True)
    schedule = models.CharField(max_length=300, blank=True, default='')
    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    respond_by = models.DateField()
    note = models.TextField(blank=True, default='')
    # Frozen at send: exactly what the applicant reads and signs.
    letter_subject = models.CharField(max_length=200, blank=True, default='')
    letter_text = models.TextField()
    acknowledgments = models.JSONField(default=list, blank=True)
    consent_text = models.TextField(blank=True, default='')
    # Timeline.
    sent_at = models.DateTimeField(null=True, blank=True)
    viewed_at = models.DateTimeField(null=True, blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    declined_at = models.DateTimeField(null=True, blank=True)
    decline_reason = models.TextField(blank=True, default='')
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    # The signature and its proof.
    signer_name = models.CharField(max_length=160, blank=True, default='')
    signature = models.ForeignKey('core.S3File', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    signed_pdf = models.ForeignKey('core.S3File', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    signer_ip = models.GenericIPAddressField(null=True, blank=True)
    signer_user_agent = models.CharField(max_length=300, blank=True, default='')
    letter_sha256 = models.CharField(max_length=64, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Offer {self.pk}: {self.application} ({self.status})'


class HiringAiJob(models.Model):
    """One AI edit run in the background (a request can't outlast Heroku's 30-second limit). Dash polls it."""

    KIND_CAREERS = 'careers'
    KIND_JOB = 'job'
    KIND_EMAIL = 'email'
    KIND_CHOICES = [(KIND_CAREERS, 'Whole careers file'), (KIND_JOB, 'One role'), (KIND_EMAIL, 'One email')]

    STATUS_RUNNING = 'running'
    STATUS_DONE = 'done'
    STATUS_FAILED = 'failed'
    STATUS_CHOICES = [(STATUS_RUNNING, 'Running'), (STATUS_DONE, 'Done'), (STATUS_FAILED, 'Failed')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_RUNNING)
    params = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True, default='')
    model = models.CharField(max_length=120, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']


class ApplicationEvent(models.Model):
    """Every change to an application: who, when, what."""

    KIND_CREATED = 'created'
    KIND_STAGE = 'stage'
    KIND_NOTE = 'note'
    KIND_RATING = 'rating'
    KIND_EMAIL = 'email'
    KIND_EMPLOYEE = 'employee'
    KIND_EDIT = 'edit'
    KIND_INTERVIEW = 'interview'
    KIND_OFFER = 'offer'
    KIND_TEXT = 'text'
    KIND_CHOICES = [
        (KIND_OFFER, 'Offer'),
        (KIND_INTERVIEW, 'Interview'),
        (KIND_CREATED, 'Applied'),
        (KIND_STAGE, 'Stage'),
        (KIND_NOTE, 'Note'),
        (KIND_RATING, 'Rating'),
        (KIND_EMAIL, 'Email'),
        (KIND_TEXT, 'Text'),
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


# ── Onboarding (Phase 4) ────────────────────────────────────────────────────


class Onboarding(models.Model):
    """A new hire's first weeks: the first-day email and a checklist copied from the careers file at the start."""

    STATUS_ACTIVE = 'active'
    STATUS_DONE = 'done'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [(STATUS_ACTIVE, 'In progress'), (STATUS_DONE, 'Done'), (STATUS_CANCELLED, 'Cancelled')]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='onboardings')
    application = models.OneToOneField(
        Application, on_delete=models.SET_NULL, null=True, blank=True, related_name='onboarding',
    )
    job = models.ForeignKey(Job, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    position = models.CharField(max_length=120, blank=True, default='')
    start_date = models.DateField()
    start_time = models.TimeField(null=True, blank=True)
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='onboardings_managed',
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    first_day_email_sent_at = models.DateTimeField(null=True, blank=True)
    # The day-before reminder text (Phase 6): set once it has been sent or held, so it goes only once.
    first_day_text_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-start_date', '-id']

    def __str__(self):
        return f'Onboarding {self.user_id} from {self.start_date}'


class OnboardingTask(models.Model):
    """One checklist item, with its due date worked out from the start date when onboarding began."""

    STATUS_OPEN = 'open'
    STATUS_DONE = 'done'
    STATUS_SKIPPED = 'skipped'
    STATUS_CHOICES = [(STATUS_OPEN, 'To do'), (STATUS_DONE, 'Done'), (STATUS_SKIPPED, 'Not needed')]

    onboarding = models.ForeignKey(Onboarding, on_delete=models.CASCADE, related_name='tasks')
    key = models.CharField(max_length=40)
    label = models.CharField(max_length=200)
    help = models.CharField(max_length=400, blank=True, default='')
    owner = models.CharField(max_length=10)  # new_hire, manager, owner
    due = models.CharField(max_length=12)  # before_day1, day1, i9, week1, day20
    due_date = models.DateField()
    kind = models.CharField(max_length=10)  # tick, count, i9, handbook, auto
    auto = models.CharField(max_length=20, blank=True, default='')
    sort = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=8, choices=STATUS_CHOICES, default=STATUS_OPEN)
    done_at = models.DateTimeField(null=True, blank=True)
    done_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    note = models.CharField(max_length=500, blank=True, default='')
    data = models.JSONField(default=dict, blank=True)  # count: {"count": 2, "size": "L"}

    class Meta:
        ordering = ['sort', 'id']
        unique_together = [('onboarding', 'key')]


class I9Record(models.Model):
    """A new hire's Form I-9: Admin only, kept apart from the employee record (decision 12).

    Kept for 3 years from the start, or 1 year after the person leaves, whichever is later.
    """

    onboarding = models.OneToOneField(Onboarding, on_delete=models.CASCADE, related_name='i9')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='i9_records')
    hire_date = models.DateField()
    documents_seen = models.CharField(max_length=300, blank=True, default='')  # e.g. "List B driver's license + List C"
    section2_done_at = models.DateTimeField(null=True, blank=True)
    section2_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    left_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def keep_until(self):
        def plus_years(day, years):
            try:
                return day.replace(year=day.year + years)
            except ValueError:  # Feb 29
                return day.replace(year=day.year + years, day=28)

        three_years = plus_years(self.hire_date, 3)
        return max(three_years, plus_years(self.left_on, 1)) if self.left_on else three_years


class I9File(models.Model):
    """A scan: the I-9 form itself, or a copy of a document seen for it (copies are kept for everyone)."""

    KIND_FORM = 'form'
    KIND_DOCUMENT = 'document'
    KIND_CHOICES = [(KIND_FORM, 'Form I-9'), (KIND_DOCUMENT, 'Document copy')]

    record = models.ForeignKey(I9Record, on_delete=models.CASCADE, related_name='files')
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default=KIND_FORM)
    label = models.CharField(max_length=120, blank=True, default='')
    file = models.ForeignKey('core.S3File', on_delete=models.PROTECT, related_name='+')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at', 'id']


class Handbook(models.Model):
    """A published version of the staff handbook (the draft lives in the careers file)."""

    version = models.PositiveIntegerField(unique=True)
    title = models.CharField(max_length=160)
    text = models.TextField()
    acknowledgment = models.TextField()
    sha256 = models.CharField(max_length=64)
    published_at = models.DateTimeField(auto_now_add=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )

    class Meta:
        ordering = ['-version']

    def __str__(self):
        return f'Handbook v{self.version}'


class HandbookSignature(models.Model):
    """One person's signature on one handbook version: typed name, drawn signature, and a signed PDF."""

    handbook = models.ForeignKey(Handbook, on_delete=models.PROTECT, related_name='signatures')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='handbook_signatures')
    signer_name = models.CharField(max_length=160)
    consent_text = models.TextField()
    signature = models.ForeignKey('core.S3File', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    signed_pdf = models.ForeignKey('core.S3File', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    signer_ip = models.GenericIPAddressField(null=True, blank=True)
    signer_user_agent = models.CharField(max_length=300, blank=True, default='')
    signed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-signed_at']
        unique_together = [('handbook', 'user')]


# ── Check-ins (Phase 5) ─────────────────────────────────────────────────────


class CheckIn(models.Model):
    """A 30, 60 or 90-day check-in: filled in a meeting, signed by the manager and the employee with a finger."""

    STATUS_SCHEDULED = 'scheduled'
    STATUS_DONE = 'done'
    STATUS_SKIPPED = 'skipped'
    STATUS_CHOICES = [(STATUS_SCHEDULED, 'Coming up'), (STATUS_DONE, 'Done'), (STATUS_SKIPPED, 'Skipped')]

    onboarding = models.ForeignKey(Onboarding, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='checkins')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='checkins')
    manager = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='checkins_held')
    day = models.PositiveSmallIntegerField()
    due_date = models.DateField(db_index=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_SCHEDULED, db_index=True)
    # The form as it was when this check-in was first saved (careers file ``checkin``), and the answers:
    # {"questions": {key: text}, "areas": {area: {"rating": str, "note": str}}}.
    form = models.JSONField(default=dict, blank=True)
    answers = models.JSONField(default=dict, blank=True)
    employee_comments = models.TextField(blank=True, default='')
    close_onboarding = models.BooleanField(default=False)
    skipped_reason = models.CharField(max_length=300, blank=True, default='')

    manager_name = models.CharField(max_length=160, blank=True, default='')
    manager_signature = models.ForeignKey('core.S3File', on_delete=models.SET_NULL, null=True, blank=True,
                                          related_name='+')
    employee_name = models.CharField(max_length=160, blank=True, default='')
    employee_signature = models.ForeignKey('core.S3File', on_delete=models.SET_NULL, null=True, blank=True,
                                           related_name='+')
    signed_pdf = models.ForeignKey('core.S3File', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    signed_at = models.DateTimeField(null=True, blank=True)
    signed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                  related_name='+')
    signer_ip = models.GenericIPAddressField(null=True, blank=True)
    signer_user_agent = models.CharField(max_length=300, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['due_date', 'id']

    def __str__(self):
        return f'{self.day}-day check-in for {self.user_id}'
