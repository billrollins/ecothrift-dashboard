from django.conf import settings
from django.db import models
from django.utils import timezone
from decimal import Decimal

from .shifts import SHIFT_CHOICES
from .soft_delete import SoftDeleteManager


class Department(models.Model):
    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True, default='')
    location = models.ForeignKey(
        'core.WorkLocation', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='departments',
    )
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='managed_departments',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class TimeEntry(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('flagged', 'Flagged'),
    ]

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='time_entries',
    )
    date = models.DateField()
    clock_in = models.DateTimeField()
    clock_out = models.DateTimeField(null=True, blank=True)
    shift = models.CharField(max_length=20, choices=SHIFT_CHOICES, blank=True, default='')
    break_minutes = models.IntegerField(default=0)
    on_break = models.BooleanField(default=False)
    break_started_at = models.DateTimeField(null=True, blank=True)
    total_hours = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approved_entries',
    )
    notes = models.TextField(blank=True, default='')
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='deleted_time_entries',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = SoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        unique_together = ('employee', 'date', 'clock_in')
        ordering = ['-date', '-clock_in']
        verbose_name_plural = 'Time entries'

    def __str__(self):
        return f'{self.employee} - {self.date}'

    def compute_total_hours(self):
        """Compute total hours worked, subtracting breaks."""
        if self.clock_in and self.clock_out:
            delta = self.clock_out - self.clock_in
            hours = Decimal(str(delta.total_seconds())) / Decimal('3600')
            break_hours = Decimal(str(self.break_minutes)) / Decimal('60')
            # Field is 2 dp. Pay and the roster must use this rounded figure, not raw seconds.
            self.total_hours = max(hours - break_hours, Decimal('0')).quantize(Decimal('0.01'))
        return self.total_hours

    def finalize_open_break(self, as_of=None):
        """If on break, add elapsed break minutes and clear break state."""
        if not self.on_break or not self.break_started_at:
            return
        end = as_of or timezone.now()
        elapsed_mins = int((end - self.break_started_at).total_seconds() // 60)
        self.break_minutes = (self.break_minutes or 0) + max(elapsed_mins, 0)
        self.on_break = False
        self.break_started_at = None

    def save(self, *args, **kwargs):
        if self.clock_in:
            self.date = timezone.localtime(self.clock_in).date()
        if self.clock_out:
            from apps.hr.services.time_clock_utils import validate_shift_duration
            closing_open_shift = False
            if self.pk:
                prev_clock_out = (
                    TimeEntry.objects.filter(pk=self.pk)
                    .values_list('clock_out', flat=True)
                    .first()
                )
                closing_open_shift = prev_clock_out is None
            validate_shift_duration(
                self.clock_in,
                self.clock_out,
                self.break_minutes,
                skip_max_duration=closing_open_shift,
            )
            self.compute_total_hours()
        super().save(*args, **kwargs)


class SickLeaveBalance(models.Model):
    """Tracks sick leave accrual and usage per employee per calendar year."""
    ANNUAL_CAP = Decimal('56.00')

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='sick_leave_balances',
    )
    year = models.IntegerField()
    hours_earned = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    hours_used = models.DecimalField(max_digits=6, decimal_places=2, default=0)

    class Meta:
        unique_together = ('employee', 'year')
        ordering = ['-year']

    def __str__(self):
        return f'{self.employee} - {self.year}'

    @property
    def hours_available(self):
        return min(self.hours_earned, self.ANNUAL_CAP) - self.hours_used

    @property
    def is_capped(self):
        return self.hours_earned >= self.ANNUAL_CAP

    def accrue(self, hours_worked):
        """Accrue sick leave: 1 hour per 30 hours worked."""
        if self.is_capped:
            return Decimal('0')
        accrual = hours_worked / Decimal('30')
        room = self.ANNUAL_CAP - self.hours_earned
        actual = min(accrual, room)
        self.hours_earned += actual
        self.save(update_fields=['hours_earned'])
        return actual


class TimeEntryModificationRequest(models.Model):
    """Employee request to modify an approved time entry."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('denied', 'Denied'),
    ]

    time_entry = models.ForeignKey(
        TimeEntry, on_delete=models.CASCADE,
        related_name='modification_requests',
    )
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='time_entry_mod_requests',
    )
    requested_clock_in = models.DateTimeField(null=True, blank=True)
    requested_clock_out = models.DateTimeField(null=True, blank=True)
    requested_break_minutes = models.IntegerField(null=True, blank=True)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reviewed_mod_requests',
    )
    review_note = models.TextField(blank=True, default='')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='deleted_time_mod_requests',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    objects = SoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Mod request #{self.id} for {self.time_entry}'


class SickLeaveRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('denied', 'Denied'),
    ]

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='sick_leave_requests',
    )
    start_date = models.DateField()
    end_date = models.DateField()
    hours_requested = models.DecimalField(max_digits=6, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reason = models.TextField(blank=True, default='')
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reviewed_sick_requests',
    )
    review_note = models.TextField(blank=True, default='')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.employee} - {self.start_date} to {self.end_date}'
