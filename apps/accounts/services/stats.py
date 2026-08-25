"""Roll-ups behind the Admin > Users stats strip.

Each function is a handful of aggregate queries, not a per-row walk. The strip
paints on every page load, so nothing here may scale with the directory size.
"""
from __future__ import annotations

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.utils import timezone

from apps.accounts.models import CustomerProfile, EmployeeProfile

User = get_user_model()

STAFF_ROLE_NAMES = ('Admin', 'Manager', 'Employee')
# Django marks a password unusable with a leading '!'; blank means never set.
NO_PASSWORD = Q(password='') | Q(password__startswith='!')


def _month_start(today: date) -> date:
    return today.replace(day=1)


def _previous_month_bounds(today: date) -> tuple[date, date]:
    """First day of last month, and the first day of this month."""
    this_month = _month_start(today)
    last_month_end = this_month - timedelta(days=1)
    return _month_start(last_month_end), this_month


def customer_stats() -> dict:
    from apps.webstore.models import Conversation, Reservation

    today = timezone.localdate()
    month_start = _month_start(today)
    prev_start, prev_end = _previous_month_bounds(today)

    counts = CustomerProfile.objects.aggregate(
        total=Count('pk'),
        active=Count('pk', filter=Q(user__is_active=True)),
        verified=Count('pk', filter=Q(user__is_active=True, email_verified_at__isnull=False)),
        new_this_month=Count('pk', filter=Q(customer_since__gte=month_start)),
        new_last_month=Count(
            'pk', filter=Q(customer_since__gte=prev_start, customer_since__lt=prev_end),
        ),
    )
    active = counts['active'] or 0

    holds_this_month = Reservation.objects.filter(created_at__date__gte=month_start).count()
    needs_reply = Conversation.objects.filter(state='needs_reply', archived_at__isnull=True).count()

    return {
        'total': counts['total'] or 0,
        'active': active,
        'inactive': (counts['total'] or 0) - active,
        'verified': counts['verified'] or 0,
        # Share of people who can actually be reached, not of everyone on file.
        'verified_pct': round(100 * (counts['verified'] or 0) / active) if active else 0,
        'new_this_month': counts['new_this_month'] or 0,
        'new_last_month': counts['new_last_month'] or 0,
        'holds_this_month': holds_this_month,
        'needs_reply': needs_reply,
    }


def customer_rollup(profile: CustomerProfile) -> dict:
    """Per-person totals for the customer detail drawer."""
    from django.db.models import DecimalField, F, Sum
    from django.db.models.functions import Coalesce
    from apps.webstore.models import Conversation, Reservation

    email = (profile.user.email or '').strip()
    if not email:
        return {
            'holds_total': 0, 'holds_active': 0, 'holds_completed': 0,
            'lifetime_spend': '0.00', 'conversations': 0, 'needs_reply': 0,
            'last_activity': None, 'first_hold_at': None,
        }

    holds = Reservation.objects.filter(email__iexact=email)
    totals = holds.aggregate(
        total=Count('pk'),
        active=Count('pk', filter=Q(status__in=Reservation.ACTIVE_STATUSES)),
        completed=Count('pk', filter=Q(status='completed')),
        spend=Coalesce(
            Sum(
                F('unit_price_snapshot') * F('quantity'),
                filter=Q(status='completed'),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            0,
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
    )

    threads = Conversation.objects.filter(Q(customer=profile.user) | Q(guest_email__iexact=email))
    thread_totals = threads.aggregate(
        total=Count('pk', distinct=True),
        waiting=Count('pk', distinct=True, filter=Q(state='needs_reply', archived_at__isnull=True)),
    )

    last_hold = holds.order_by('-created_at').values_list('created_at', flat=True).first()
    last_message = threads.order_by('-last_message_at').values_list('last_message_at', flat=True).first()
    first_hold = holds.order_by('created_at').values_list('created_at', flat=True).first()
    stamps = [s for s in (last_hold, last_message, profile.user.last_login) if s]

    return {
        'holds_total': totals['total'] or 0,
        'holds_active': totals['active'] or 0,
        'holds_completed': totals['completed'] or 0,
        'lifetime_spend': str(totals['spend'] or 0),
        'conversations': thread_totals['total'] or 0,
        'needs_reply': thread_totals['waiting'] or 0,
        'last_activity': max(stamps) if stamps else None,
        'first_hold_at': first_hold,
    }


def employee_stats() -> dict:
    from apps.hr.models import TimeEntry

    today = timezone.localdate()
    ninety_days_ago = today - timedelta(days=90)

    staff = User.objects.filter(groups__name__in=STAFF_ROLE_NAMES).distinct()
    active_staff = staff.filter(is_active=True)

    by_role = {
        row['groups__name']: row['n']
        for row in User.objects.filter(
            is_active=True, groups__name__in=STAFF_ROLE_NAMES,
        ).values('groups__name').annotate(n=Count('pk', distinct=True))
    }

    # Someone clocked in is one open entry; count people, not rows.
    on_the_clock = (
        TimeEntry.objects
        .filter(clock_out__isnull=True, deleted_at__isnull=True)
        .values('employee_id')
        .distinct()
        .count()
    )

    new_hires = EmployeeProfile.objects.filter(
        hire_date__gte=ninety_days_ago, user__is_active=True,
    ).count()

    return {
        'active': active_staff.count(),
        'inactive': staff.filter(is_active=False).count(),
        'admins': by_role.get('Admin', 0),
        'managers': by_role.get('Manager', 0),
        'employees': by_role.get('Employee', 0),
        'on_the_clock': on_the_clock,
        'new_hires_90d': new_hires,
        # Active staff who cannot sign in at all - a reset link fixes it.
        'no_password': active_staff.filter(NO_PASSWORD).count(),
    }
