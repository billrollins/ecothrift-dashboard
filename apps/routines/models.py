"""Periodic and on-demand fill-in routines."""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q


class Section(models.Model):
    """A named area of a department that one person keeps.

    Free-form on purpose: the floor is re-cut often, so a section is a name and
    an owner, not a fixed identifier tied to fixtures or inventory.
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
        (ASSIGN_POOLED, 'Pooled — anyone on the list can complete it'),
        (ASSIGN_PER_PERSON, 'Per person — each assignee owes their own'),
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

    # How the phone renders a run. Only `checklist` is authored in the editor;
    # the rest carry purpose-built runners and locked definitions.
    KIND_CHECKLIST = 'checklist'
    KIND_SECTION_TALLY = 'section_tally'
    KIND_SECTION_AUDIT = 'section_audit'
    KIND_OWNER_SPOT = 'owner_spot'
    KIND_CHOICES = [
        (KIND_CHECKLIST, 'Checklist'),
        (KIND_SECTION_TALLY, 'Section tally'),
        (KIND_SECTION_AUDIT, 'Section cross-check'),
        (KIND_OWNER_SPOT, 'Owner spot check'),
    ]

    SUBJECT_POOL = 'pool'
    SUBJECT_MY_SECTION = 'my_section'
    SUBJECT_OTHER_SECTION = 'other_section'
    SUBJECT_CHOICES = [
        (SUBJECT_POOL, 'From the subject pool below'),
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
        help_text='Hard nag: the app-bar alert. Blank means the nag waits for clock-out.',
    )
    late_after = models.CharField(max_length=20, choices=LATE_CHOICES, default=LATE_END_OF_DAY)
    grace_days = models.PositiveSmallIntegerField(default=0)
    assignment = models.CharField(max_length=20, choices=ASSIGN_CHOICES, default=ASSIGN_POOLED)
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
    subject_pool = models.JSONField(default=list, blank=True)
    is_blocking = models.BooleanField(default=False)
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

    class Meta:
        ordering = ['due_at', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['routine', 'period_key', 'assigned_to'],
                condition=Q(assigned_to__isnull=False),
                name='routines_run_period_user',
            ),
            models.UniqueConstraint(
                fields=['routine', 'period_key'],
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
