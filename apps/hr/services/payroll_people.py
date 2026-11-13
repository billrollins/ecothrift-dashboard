"""Who is on payroll (Bill 2026-11-12, Dash Update #121).

Family who work unpaid (no Rollins is on payroll, Bill included) have ``EmployeeProfile.on_payroll`` off. They stay on
the schedule, the time clock and every staff list, but every pay number leaves them out:

- the payroll sheet (``TimeEntryViewSet.payroll``),
- the QuickBooks pay numbers and their CSV (``pay_periods.period_numbers``),
- the Time & payroll roster's pay (``roster.build_time_roster``: the shift stays, its pay is 0 and marked),
- the Owner page labor cost (``owner_page.labor_cost``),
- payroll deduction at the register (``staff_purchases``: there is no paycheck to take it from).

A login with no employee record counts as on payroll, as before.
"""
from __future__ import annotations

from django.db.models import Q

# On a TimeEntry query: the worker's profile says off payroll.
OFF_PAYROLL_ENTRY = Q(employee__employee__on_payroll=False)


def on_payroll_entries(qs):
    """TimeEntry queryset without the people who are off payroll."""
    return qs.exclude(OFF_PAYROLL_ENTRY)


def is_on_payroll(user) -> bool:
    profile = getattr(user, 'employee', None) if user is not None and hasattr(user, 'employee') else None
    return profile is None or bool(profile.on_payroll)
