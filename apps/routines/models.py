"""Periodic and on-demand fill-in routines."""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q


class Section(models.Model):
    """A named area of a department that one person keeps.

    Free-form on purpose: the floor is re-cut often, so a section is a name and
    an owner, not a fixed identifier tied to a floorplan object or inventory.
    """

    department = models.ForeignKey(
        'hr.Department', on_delete=models.CASCADE, related_name='sections',
    )
    name = models.CharField(max_length=80)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='owned_sections',
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']
        constraints = [
            models.UniqueConstraint(fields=['department', 'name'], name='routines_section_name'),
        ]

    def __str__(self):
        return self.name


class Routine(models.Model):
    TRIGGER_DAILY = 'daily'
    TRIGGER_WEEKLY = 'weekly'
    TRIGGER_BIWEEKLY = 'biweekly'
    TRIGGER_MONTHLY = 'monthly'
    TRIGGER_QUARTERLY = 'quarterly'
    TRIGGER_ANNUAL = 'annual'
    TRIGGER_ON_DEMAND = 'on_demand'
    TRIGGER_CHOICES = [
        (TRIGGER_DAILY, 'Daily'),
        (TRIGGER_WEEKLY, 'Weekly'),
        (TRIGGER_BIWEEKLY, 'Bi-weekly'),
        (TRIGGER_MONTHLY, 'Monthly'),
        (TRIGGER_QUARTERLY, 'Quarterly'),
        (TRIGGER_ANNUAL, 'Annual'),
        (TRIGGER_ON_DEMAND, 'On demand'),
    ]

    ASSIGN_POOLED = 'pooled'
    ASSIGN_PER_PERSON = 'per_person'
    ASSIGN_CHOICES = [
        (ASSIGN_POOLED, 'One shared: anyone matching can complete it'),
        (ASSIGN_PER_PERSON, 'Each: every match owes their own'),
    ]

    AUDIENCE_PERSON = 'person'
    AUDIENCE_SHIFT = 'shift'
    AUDIENCE_DEPARTMENT = 'department'
    AUDIENCE_CHOICES = [
        (AUDIENCE_PERSON, 'Person'),
        (AUDIENCE_SHIFT, 'Shift'),
        (AUDIENCE_DEPARTMENT, 'Department'),
    ]

    # When the run stops being merely open and starts counting against the day.
    LATE_DUE = 'due_time'
    LATE_END_OF_DAY = 'end_of_day'
    LATE_GRACE = 'grace_days'
    LATE_CHOICES = [
        (LATE_DUE, 'As soon as the hard nag starts'),
        (LATE_END_OF_DAY, 'End of the day it was due'),
        (LATE_GRACE, 'After the grace days below'),
    ]

    # When an open run is marked missed and can no longer be filled.
    # Counts as late is only the grade; this clock closes the run.
    EXPIRE_NEVER = 'never'
    EXPIRE_END_OF_DAY = 'end_of_day'
    EXPIRE_END_OF_WEEK = 'end_of_week'
    EXPIRE_AFTER = 'after'
    EXPIRE_CHOICES = [
        (EXPIRE_NEVER, 'Never (can still fill it late)'),
        (EXPIRE_END_OF_DAY, 'End of that day'),
        (EXPIRE_END_OF_WEEK, 'End of that week'),
        (EXPIRE_AFTER, 'After a duration'),
    ]
    EXPIRE_UNIT_HOURS = 'hours'
    EXPIRE_UNIT_DAYS = 'days'
    EXPIRE_UNIT_WEEKS = 'weeks'
    EXPIRE_UNIT_MONTHS = 'months'
    EXPIRE_UNIT_CHOICES = [
        (EXPIRE_UNIT_HOURS, 'Hours'),
        (EXPIRE_UNIT_DAYS, 'Days'),
        (EXPIRE_UNIT_WEEKS, 'Weeks'),
        (EXPIRE_UNIT_MONTHS, 'Months'),
    ]

    # How the phone renders a run. Only `checklist` is authored in the editor;
    # the rest carry purpose-built runners and locked definitions.
    KIND_CHECKLIST = 'checklist'
    KIND_SECTION_TALLY = 'section_tally'
    KIND_SECTION_AUDIT = 'section_audit'
    KIND_OWNER_SPOT = 'owner_spot'
    KIND_WORK_CYCLE = 'work_cycle'
    # Superuser: hand over the B-Stock login and pull the manifest shortlist.
    KIND_BSTOCK_PULL = 'bstock_pull'
    KIND_CHOICES = [
        (KIND_CHECKLIST, 'Checklist'),
        (KIND_SECTION_TALLY, 'Section tally'),
        (KIND_SECTION_AUDIT, 'Section cross-check'),
        (KIND_OWNER_SPOT, 'Spot walk'),
        (KIND_WORK_CYCLE, 'Register activity'),
        (KIND_BSTOCK_PULL, 'B-Stock manifest pull'),
    ]

    SUBJECT_POOL = 'pool'
    SUBJECT_MY_SECTION = 'my_section'
    SUBJECT_OTHER_SECTION = 'other_section'
    SUBJECT_CHOICES = [
        (SUBJECT_POOL, 'No section (plain checklist)'),
        (SUBJECT_MY_SECTION, 'The sections this person owns'),
        (SUBJECT_OTHER_SECTION, "Somebody else's section, rotating"),
    ]

    title = models.CharField(max_length=200)
    intro = models.CharField(max_length=255, blank=True, default='')
    icon = models.CharField(max_length=40, blank=True, default='')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_CHECKLIST)
    system_key = models.CharField(
        max_length=40,
        null=True,
        blank=True,
        unique=True,
        help_text='Set on seeded program routines so code can find them. Blank for authored ones.',
    )
    verifies = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_by',
        help_text='Runner opens with a check that the last run of this routine was done to standard.',
    )
    subject_source = models.CharField(max_length=20, choices=SUBJECT_CHOICES, default=SUBJECT_POOL)
    definition = models.JSONField(default=dict)
    trigger = models.CharField(max_length=20, choices=TRIGGER_CHOICES, default=TRIGGER_DAILY)
    weekdays = models.JSONField(default=list, blank=True)
    anchor_date = models.DateField(
        null=True,
        blank=True,
        help_text='First due date for a bi-weekly cycle. Later dues land every 14 days.',
    )
    remind_time = models.TimeField(
        null=True,
        blank=True,
        help_text='Soft nag: badges only. Blank starts at the top of the day.',
    )
    due_time = models.TimeField(
        null=True,
        blank=True,
        help_text='When the run becomes overdue (amber). Blank means the nag waits for clock-out.',
    )
    hard_time = models.TimeField(
        null=True,
        blank=True,
        help_text='Hard deadline: red stripe, red chip, and an automatic nudge.',
    )
    late_after = models.CharField(max_length=20, choices=LATE_CHOICES, default=LATE_END_OF_DAY)
    grace_days = models.PositiveSmallIntegerField(default=0)
    expire_rule = models.CharField(max_length=20, choices=EXPIRE_CHOICES, default=EXPIRE_NEVER)
    expire_count = models.PositiveSmallIntegerField(default=1)
    expire_unit = models.CharField(
        max_length=10, choices=EXPIRE_UNIT_CHOICES, default=EXPIRE_UNIT_HOURS,
    )
    expire_from_time = models.TimeField(
        null=True,
        blank=True,
        help_text='When expire_unit is hours, the clock that duration starts from. Blank is midnight.',
    )
    assignment = models.CharField(max_length=20, choices=ASSIGN_CHOICES, default=ASSIGN_POOLED)
    audience_type = models.CharField(
        max_length=20, choices=AUDIENCE_CHOICES, default=AUDIENCE_PERSON,
    )
    audience_all = models.BooleanField(default=False)
    assigned_shifts = models.JSONField(default=list, blank=True)
    shift = models.ForeignKey(
        'hr.Shift',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='routines',
    )
    shift_locked = models.BooleanField(default=False)
    assigned_department_ids = models.JSONField(default=list, blank=True)
    assigned_role = models.CharField(max_length=40, blank=True, default='')
    assigned_department = models.ForeignKey(
        'hr.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='routines',
    )
    assigned_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='routines_assigned',
    )
    is_blocking = models.BooleanField(default=False)
    gate_on_miss = models.BooleanField(
        default=False,
        help_text='Kiosk asks why when a run of this routine was missed, before the next clock-in. Superuser only.',
    )
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='routines_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return self.title


class RoutineRun(models.Model):
    STATUS_OPEN = 'open'
    STATUS_DONE = 'done'
    STATUS_MISSED = 'missed'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_DONE, 'Done'),
        (STATUS_MISSED, 'Missed'),
    ]

    MISS_FORGOT = 'forgot'
    MISS_NO_TIME = 'no_time'
    MISS_CALLED_IN = 'called_in'
    MISS_NOT_MY_SECTION = 'not_my_section'
    MISS_OTHER = 'other'
    MISS_REASON_CHOICES = [
        (MISS_FORGOT, 'Forgot'),
        (MISS_NO_TIME, 'Ran out of time'),
        (MISS_CALLED_IN, 'Called in'),
        (MISS_NOT_MY_SECTION, 'Not my section that day'),
        (MISS_OTHER, 'Other'),
    ]

    routine = models.ForeignKey(Routine, on_delete=models.CASCADE, related_name='runs')
    period_key = models.CharField(max_length=32)
    due_at = models.DateTimeField()
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='routine_runs',
    )
    subject = models.CharField(max_length=80, blank=True, default='')
    section = models.ForeignKey(
        Section,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='runs',
    )
    generated = models.JSONField(
        default=dict,
        blank=True,
        help_text='Drawn at materialize time so the day\'s sample cannot be rerolled.',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    submission = models.ForeignKey(
        'RoutineSubmission',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='closed_runs',
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='routine_runs_completed',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    unassign_key = models.CharField(
        max_length=32,
        blank=True,
        default='',
        help_text='Keeps more than one unassigned per-person run unique for a day.',
    )
    section_scoped = models.BooleanField(
        default=False,
        help_text='True when this run is the one walk of its section for the day (cross-check or a today-only cover).',
    )
    # Why a missed run was missed, answered at the kiosk before the next clock-in.
    miss_reason = models.CharField(
        max_length=20, choices=MISS_REASON_CHOICES, blank=True, default='',
    )
    miss_reason_note = models.CharField(max_length=200, blank=True, default='')
    miss_reason_at = models.DateTimeField(null=True, blank=True)
    miss_reason_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='routine_miss_reasons',
    )

    class Meta:
        ordering = ['due_at', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['routine', 'period_key', 'assigned_to'],
                condition=Q(assigned_to__isnull=False, section_scoped=False),
                name='routines_run_period_user',
            ),
            models.UniqueConstraint(
                fields=['routine', 'period_key', 'section'],
                condition=Q(section_scoped=True, section__isnull=False),
                name='routines_run_period_section',
            ),
            models.UniqueConstraint(
                fields=['routine', 'period_key', 'unassign_key'],
                condition=Q(assigned_to__isnull=True),
                name='routines_run_period_pooled',
            ),
        ]
        indexes = [
            models.Index(fields=['assigned_to', 'status', 'due_at']),
            models.Index(fields=['status', 'due_at']),
        ]

    def __str__(self):
        who = self.assigned_to_id or 'pooled'
        return f'{self.routine.title} {self.period_key} → {who}'


class RoutineSubmission(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_SUBMITTED = 'submitted'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_SUBMITTED, 'Submitted'),
    ]

    routine = models.ForeignKey(Routine, on_delete=models.PROTECT, related_name='submissions')
    run = models.ForeignKey(
        RoutineRun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='submissions',
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='routine_submissions',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    responses = models.JSONField(default=dict)
    failed_count = models.PositiveIntegerField(default=0)
    has_critical_fail = models.BooleanField(default=False)
    started_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f'{self.routine.title} #{self.pk}'


class WorkCyclePrompt(models.Model):
    """A cashier was idle on the register and the work-cycle prompt came up.

    Dismissing it is allowed. The log is how long they sat and whether they
    started a walk or just sent the prompt away.
    """

    OUTCOME_SHELF = 'shelf'
    OUTCOME_NON_SHELF = 'non_shelf'
    OUTCOME_DISMISSED = 'dismissed'
    OUTCOME_CHOICES = [
        (OUTCOME_SHELF, 'Started a shelf check'),
        (OUTCOME_NON_SHELF, 'Started a non-shelf check'),
        (OUTCOME_DISMISSED, 'Dismissed'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='work_cycle_prompts',
    )
    register = models.ForeignKey(
        'pos.Register',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='work_cycle_prompts',
    )
    shown_at = models.DateTimeField()
    answered_at = models.DateTimeField()
    idle_seconds = models.PositiveIntegerField(default=0)
    outcome = models.CharField(max_length=20, choices=OUTCOME_CHOICES)
    submission = models.ForeignKey(
        RoutineSubmission,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='work_cycle_prompts',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-shown_at']

    def __str__(self):
        who = self.user_id or 'unknown'
        return f'{self.outcome} by {who} at {self.shown_at}'


class SectionObservation(models.Model):
    """One section walk folded into a row the baseline and flags can query."""

    KIND_TALLY = 'tally'
    KIND_AUDIT = 'audit'
    KIND_SPOT = 'spot'
    KIND_WALK = 'walk'
    KIND_CHOICES = [
        (KIND_TALLY, 'Section tally'),
        (KIND_AUDIT, 'Cross-check'),
        (KIND_SPOT, 'Owner spot'),
        (KIND_WALK, 'Work-cycle walk'),
    ]

    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='observations')
    observed_at = models.DateTimeField()
    kind = models.CharField(max_length=12, choices=KIND_CHOICES)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='section_observations',
    )
    run = models.ForeignKey(
        RoutineRun, on_delete=models.SET_NULL, null=True, blank=True, related_name='observations',
    )
    submission = models.ForeignKey(
        RoutineSubmission, on_delete=models.SET_NULL, null=True, blank=True, related_name='observations',
    )
    items_inspected = models.PositiveIntegerField(default=0)
    count_facing = models.PositiveIntegerField(default=0)
    count_reshelf = models.PositiveIntegerField(default=0)
    count_reprep = models.PositiveIntegerField(default=0)
    count_security = models.PositiveIntegerField(default=0)
    total = models.PositiveIntegerField(default=0)
    safety = models.BooleanField(default=False)
    hours_since_tally = models.FloatField(null=True, blank=True)
    tally_run = models.ForeignKey(
        RoutineRun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='spot_observations',
    )
    in_baseline = models.BooleanField(default=True)
    excluded_reason = models.CharField(max_length=80, blank=True, default='')

    class Meta:
        ordering = ['-observed_at']
        indexes = [
            models.Index(fields=['section', 'kind', 'observed_at']),
            models.Index(fields=['actor', 'kind', 'observed_at']),
            models.Index(fields=['in_baseline', 'kind']),
        ]

    def __str__(self):
        return f'{self.kind} {self.section_id} @ {self.observed_at}'


class CheckerFlag(models.Model):
    KIND_LOW_FINDINGS = 'low_findings'
    KIND_OWNER_FOLLOWUP = 'owner_followup'
    KIND_SPEED = 'speed'
    KIND_BATCH = 'batch'
    KIND_PAIRING = 'pairing'
    KIND_RUBBER_STAMP = 'rubber_stamp'
    KIND_CHOICES = [
        (KIND_LOW_FINDINGS, 'Low trailing findings'),
        (KIND_OWNER_FOLLOWUP, 'Owner follow-up'),
        (KIND_SPEED, 'Too fast'),
        (KIND_BATCH, 'Batch submit'),
        (KIND_PAIRING, 'Pairing'),
        (KIND_RUBBER_STAMP, 'Rubber-stamp verify'),
    ]

    STATUS_OPEN = 'open'
    STATUS_ACKNOWLEDGED = 'acknowledged'
    STATUS_CLEARED = 'cleared'
    STATUS_ESCALATED = 'escalated'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_ACKNOWLEDGED, 'Acknowledged'),
        (STATUS_CLEARED, 'Cleared'),
        (STATUS_ESCALATED, 'Escalated'),
    ]
    ACTIVE_STATUSES = (STATUS_OPEN, STATUS_ACKNOWLEDGED, STATUS_ESCALATED)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='checker_flags',
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    raised_at = models.DateTimeField()
    window_start = models.DateField()
    window_end = models.DateField()
    evidence = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_OPEN)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='checker_flags_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-raised_at']
        indexes = [
            models.Index(fields=['user', 'status', 'kind']),
        ]

    def __str__(self):
        return f'{self.kind} {self.user_id} {self.status}'


class SectionAssignmentEvent(models.Model):
    KIND_OWNER = 'owner'
    KIND_CROSS_CHECKER = 'cross_checker'
    KIND_CLOSED_FOR_DAY = 'closed_for_day'
    KIND_REOPENED = 'reopened'
    KIND_CROSS_UNBLOCK = 'cross_unblock'
    KIND_CHOICES = [
        (KIND_OWNER, 'Section owner'),
        (KIND_CROSS_CHECKER, 'Cross-checker'),
        (KIND_CLOSED_FOR_DAY, 'Closed for the day'),
        (KIND_REOPENED, 'Reopened'),
        (KIND_CROSS_UNBLOCK, 'Cross-check unblocked'),
    ]

    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='assignment_events')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='section_assignment_events',
    )
    for_date = models.DateField()
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='section_assignments_made',
    )
    at = models.DateTimeField(auto_now_add=True)
    previous_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )

    class Meta:
        ordering = ['-at']
        indexes = [
            models.Index(fields=['section', 'for_date', 'kind']),
        ]

    def __str__(self):
        return f'{self.kind} {self.section_id} {self.for_date}'


class SectionBaselineSnapshot(models.Model):
    """The baseline a past week was scored under, so an old letter can be explained."""

    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='baseline_snapshots')
    week_monday = models.DateField()
    n = models.PositiveIntegerField(default=0)
    mean = models.FloatField(default=0)
    var = models.FloatField(default=0)
    warm = models.BooleanField(default=True)
    store_mean = models.FloatField(default=0)
    store_var = models.FloatField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['section', 'week_monday'], name='routines_baseline_section_week',
            ),
        ]
        ordering = ['-week_monday']

    def __str__(self):
        return f'{self.section_id} {self.week_monday}'


class WeekScoreSnapshot(models.Model):
    """Frozen week score plus the settings that produced it."""

    week_monday = models.DateField(unique=True)
    score = models.FloatField(null=True, blank=True)
    letter = models.CharField(max_length=2, blank=True, default='')
    doing = models.FloatField(null=True, blank=True)
    cross = models.FloatField(null=True, blank=True)
    owner = models.FloatField(null=True, blank=True)
    settings = models.JSONField(default=dict, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    finalized_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-week_monday']

    def __str__(self):
        return f'{self.week_monday} {self.letter}'


class QaCallIn(models.Model):
    """QA-only absence flag. A later punch shows In; assignments stay cleared."""

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='qa_call_ins',
    )
    date = models.DateField()
    shift = models.ForeignKey(
        'hr.Shift',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='qa_call_ins',
    )
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='qa_call_ins_marked',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    cleared = models.JSONField(
        default=list,
        blank=True,
        help_text='Runs this action unassigned, so a 10s undo can put them back.',
    )

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['employee', 'date'], name='routines_qa_callin_person_day'),
        ]

    def __str__(self):
        return f'{self.employee_id} {self.date}'


class QaDayOverride(models.Model):
    """One-day extra person on a shift. Does not write the shift template."""

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='qa_day_overrides',
    )
    date = models.DateField()
    shift = models.ForeignKey(
        'hr.Shift',
        on_delete=models.CASCADE,
        related_name='qa_day_overrides',
    )
    time_in = models.TimeField(null=True, blank=True)
    time_out = models.TimeField(null=True, blank=True)
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='qa_day_overrides_marked',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['employee', 'date', 'shift'],
                name='routines_qa_override_person_day_shift',
            ),
        ]

    def __str__(self):
        return f'{self.employee_id} {self.date} {self.shift_id}'


class QaDayExclusion(models.Model):
    """Drop a person from today's expected list without touching ShiftAssignment."""

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='qa_day_exclusions',
    )
    date = models.DateField()
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='qa_day_exclusions_marked',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['employee', 'date'], name='routines_qa_exclusion_person_day'),
        ]

    def __str__(self):
        return f'{self.employee_id} {self.date}'


class QaNudge(models.Model):
    """Copy-only nudge log so the issues bar can say who was nudged, and when."""

    run = models.ForeignKey(RoutineRun, on_delete=models.CASCADE, related_name='nudges')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='qa_nudges',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    message = models.TextField(blank=True, default='')
    source = models.CharField(max_length=16, default='manual')
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='qa_nudges_received',
    )
    acked_at = models.DateTimeField(null=True, blank=True)
    acked_by_device = models.CharField(max_length=80, blank=True, default='')
    ack_kind = models.CharField(max_length=16, blank=True, default='')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.run_id} {self.created_at}'


class QaDayExpected(models.Model):
    """Frozen Do denominator for a day. Call-ins must not shrink it later."""

    date = models.DateField(unique=True)
    expected = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f'{self.date} expected {self.expected}'
