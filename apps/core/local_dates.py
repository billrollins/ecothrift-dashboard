"""The store's calendar day (America/Chicago, settings.TIME_ZONE).

``timezone.now().date()`` is the UTC day: from about 7 PM (6 PM in winter) it is already tomorrow (REG-09, NUM-02).
Use ``timezone.localdate()`` for today and ``local_day(dt)`` for the day of a moment.
"""
from __future__ import annotations

from datetime import date, datetime

from django.utils import timezone


def local_day(value: datetime) -> date:
    """The store's day of ``value``. A naive datetime is taken as already local."""
    if timezone.is_aware(value):
        return timezone.localtime(value).date()
    return value.date()
