"""Texting records (house standard `C:\\Coding\\.ai\\standards\\texting.md`, D17).

- ``TextConsent``: every change to someone's consent to be texted, newest wins. Who (the number), which kind, when,
  how it was captured, and the wording version. Turning it off is recorded the same way, and the history is kept.
  No consent row, no text.
- ``TextMessage``: every text Dash sends, or would have sent. Until texting is live (master's ``notify`` package,
  the Eco-Thrift Twilio key, the approved 10DLC campaign) each one is recorded as **held**: nothing leaves.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class TextConsent(models.Model):
    KIND_JOB = 'job'
    KIND_THRIFTPLUS = 'thriftplus'
    KIND_NEWS = 'news'
    KIND_ALL = 'all'
    KIND_CHOICES = [
        (KIND_JOB, 'Job application texts'),
        (KIND_THRIFTPLUS, 'Thrift+ account texts'),  # T59 (the register and My account ticks)
        (KIND_NEWS, 'Store news texts'),  # T59: a separate tick, marketing texts
        (KIND_ALL, 'Every text (STOP)'),
    ]

    phone = models.CharField(max_length=15, db_index=True, help_text='Digits only, 10 for a US number.')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    opted_in = models.BooleanField()
    at = models.DateTimeField(default=timezone.now, db_index=True)
    how = models.CharField(max_length=160, help_text='"Online job application", "Replied STOP", "Staff: Bill (they asked)".')
    wording_version = models.CharField(max_length=40, blank=True, default='')
    wording = models.TextField(blank=True, default='')
    ref = models.CharField(max_length=80, blank=True, default='', help_text='What it came from, e.g. hiring.application:12.')
    by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-at', '-id']
        indexes = [models.Index(fields=['phone', 'kind', '-at'])]

    def __str__(self) -> str:
        return f'{self.phone} {self.kind} {"in" if self.opted_in else "out"} {self.at:%Y-%m-%d}'


class EmailConsent(models.Model):
    """Every change to someone's consent to be emailed (T73: email first), newest wins; history kept.
    Only for mail that needs a yes (Thrift+ account mail, store news). Mail about a job someone applied for does not."""

    KIND_JOB = 'job'
    KIND_THRIFTPLUS = 'thriftplus'
    KIND_NEWS = 'news'
    KIND_ALL = 'all'
    KIND_CHOICES = [
        (KIND_JOB, 'Job application emails'),
        (KIND_THRIFTPLUS, 'Thrift+ account emails'),
        (KIND_NEWS, 'Store news emails'),
        (KIND_ALL, 'Every email (unsubscribe)'),
    ]

    email = models.CharField(max_length=254, db_index=True, help_text='Lower-case.')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    opted_in = models.BooleanField()
    at = models.DateTimeField(default=timezone.now, db_index=True)
    how = models.CharField(max_length=160, help_text='"Thrift+ sign-up (staff: name)", "Unsubscribe link".')
    wording_version = models.CharField(max_length=40, blank=True, default='')
    wording = models.TextField(blank=True, default='')
    ref = models.CharField(max_length=80, blank=True, default='', help_text='What it came from, e.g. thriftplus.person:12.')
    by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-at', '-id']
        indexes = [models.Index(fields=['email', 'kind', '-at'])]

    def __str__(self) -> str:
        return f'{self.email} {self.kind} {"in" if self.opted_in else "out"} {self.at:%Y-%m-%d}'


class TextMessage(models.Model):
    STATUS_HELD = 'held'
    STATUS_SENT = 'sent'
    STATUS_FAILED = 'failed'
    STATUS_NO_CONSENT = 'no_consent'
    STATUS_OPTED_OUT = 'opted_out'
    STATUS_NO_NUMBER = 'no_number'
    STATUS_PRACTICE = 'practice'
    STATUS_CHOICES = [
        (STATUS_HELD, 'Held (texting not live)'),
        (STATUS_SENT, 'Sent'),
        (STATUS_FAILED, 'Could not send'),
        (STATUS_NO_CONSENT, 'Not sent: no consent'),
        (STATUS_OPTED_OUT, 'Not sent: they said stop'),
        (STATUS_NO_NUMBER, 'Not sent: no mobile number'),
        (STATUS_PRACTICE, 'Not sent: practice run'),
    ]

    phone = models.CharField(max_length=15, blank=True, default='', db_index=True)
    kind = models.CharField(max_length=20, choices=TextConsent.KIND_CHOICES)
    key = models.CharField(max_length=40, help_text='Which text: opt_in, interview_booked, first_day…')
    body = models.TextField()
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, db_index=True)
    reason = models.CharField(max_length=200, blank=True, default='')
    ref = models.CharField(max_length=80, blank=True, default='', db_index=True)
    edited = models.BooleanField(default=False, help_text='Staff changed the words on the review screen.')
    by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    provider_id = models.CharField(max_length=64, blank=True, default='')

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self) -> str:
        return f'{self.key} → {self.phone} ({self.status})'
