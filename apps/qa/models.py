"""
Data QA (data_platform Phase 3): standing checks over live data, run nightly like tests over code.

- ``QARun``: one run of every check, with the AI triage of what changed.
- ``QAFinding``: one check's result in a run. It holds:
  - the count, and the change since the last run;
  - sample rows;
  - the ids a fix request can act on.

The checks themselves live in ``apps/qa/checks.py``, each named by its data-quality register ID
(``.ai/extended/data-quality.md``).
"""
from __future__ import annotations

from django.db import models


class QARun(models.Model):
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    counts = models.JSONField(default=dict, blank=True, help_text='{check_id: count}')
    triage = models.JSONField(default=dict, blank=True, help_text='The AI triage: {headline, notes: [...]}')
    triage_model = models.CharField(max_length=80, blank=True, default='')
    error = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f'QA run {self.pk} ({self.started_at:%Y-%m-%d})'


class QAFinding(models.Model):
    SEVERITY_CHOICES = [('high', 'High'), ('medium', 'Medium'), ('low', 'Low')]

    run = models.ForeignKey(QARun, on_delete=models.CASCADE, related_name='findings')
    check_id = models.CharField(max_length=20, db_index=True)
    title = models.CharField(max_length=200)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES)
    count = models.IntegerField()
    previous = models.IntegerField(null=True, blank=True, help_text='The count in the last run that had this check.')
    sample = models.JSONField(default=list, blank=True)
    ids = models.JSONField(default=list, blank=True, help_text='Up to 1,000 row ids, for a fix request.')
    error = models.CharField(max_length=300, blank=True, default='')

    class Meta:
        ordering = ['check_id']
        indexes = [models.Index(fields=['check_id', 'run'])]

    @property
    def delta(self) -> int | None:
        return None if self.previous is None else self.count - self.previous

    def __str__(self):
        return f'{self.check_id}: {self.count}'
