"""Signing an offer starts the new hire (owner 2026-10-20).

Create employee (a Dash login) and Start onboarding (the first-day email, the checklist, the check-ins) used to be
two buttons someone had to remember. Now a signed offer runs both, with the offer's terms: position, pay, type, level,
start date and time, and the supervisor as manager (the role's department puts them on the right schedule).

It never gets in the way of signing. When it cannot (no email, a Dash account already uses the email, any other
error) the offer stays signed, the applicant stays Hired, an event on their history says what blocked it, and the two
manual buttons work as before. Practice applicants never get a login or an email.

``hire_from_offer`` is also what the ``hiring.catch_up_hires`` request runs for people whose offer was signed before
this existed.
"""
from __future__ import annotations

import logging

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.hiring.models import Application, ApplicationEvent, Offer, Onboarding

logger = logging.getLogger(__name__)

STARTED, BLOCKED, SKIPPED = 'started', 'blocked', 'skipped'


def _why(exc: Exception) -> str:
    """A short plain sentence for what went wrong."""
    detail = getattr(exc, 'detail', None)
    if detail is None:
        return str(exc)[:300] or exc.__class__.__name__
    pieces: list[str] = []

    def walk(value):
        if isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item)
        else:
            pieces.append(str(value))

    walk(detail)
    return ' '.join(pieces)[:300]


def _blocked(application: Application, what: str, why: str, *, by=None) -> None:
    ApplicationEvent.objects.create(
        application=application, kind=ApplicationEvent.KIND_EMPLOYEE, by=by,
        text=f'{what}: {why.rstrip(".")}. Use Create employee and Start onboarding when ready.',
        data={'auto_start': BLOCKED, 'why': why},
    )


def signed_offer(application: Application) -> Offer | None:
    return application.offers.filter(status=Offer.STATUS_SIGNED).order_by('-signed_at', '-pk').first()


def hire_from_offer(application: Application, offer: Offer | None = None, *, by=None,
                    send_email: bool = True) -> dict:
    """Create the employee and start onboarding from the applicant's signed offer.

    Returns ``{'status': 'started' | 'blocked' | 'skipped', 'why': str, 'user_id': int | None, 'onboarding': int |
    None, 'email_sent': bool}``. Each half runs in its own savepoint, so a failure leaves the other half intact and
    never raises. 'skipped' means nothing to do (a practice run, no signed offer, or already started)."""
    from apps.hiring import onboarding as onboarding_service, services

    out = {'status': SKIPPED, 'why': '', 'user_id': application.employee_user_id, 'onboarding': None,
           'email_sent': False}
    if application.is_practice:
        out['why'] = 'Practice run.'
        return out
    offer = offer or signed_offer(application)
    if offer is None or offer.status != Offer.STATUS_SIGNED:
        out['why'] = 'No signed offer.'
        return out
    if Onboarding.objects.filter(application=application).exists():
        out['why'] = 'Onboarding already started.'
        return out

    if not application.employee_user_id:
        job = offer.job or application.jobs.order_by('sort_order', 'title').first()
        try:
            with transaction.atomic():
                made = services.create_employee(
                    application, by=by, request=None, pay_rate=offer.pay_rate, start_date=offer.start_date,
                    position=offer.position, department=job.department_id if job and job.department_id else None,
                    employment_type=offer.employment_type, level=offer.level,
                )
        except Exception as exc:  # a login that cannot be made must never undo the signature
            if not isinstance(exc, ValidationError):
                logger.exception('auto create-employee failed for application %s', application.pk)
            out.update(status=BLOCKED, why=_why(exc))
            _blocked(application, 'The new hire was not started automatically', out['why'], by=by)
            return out
        out['user_id'] = made['user_id']
        application.refresh_from_db()

    job = offer.job or application.jobs.order_by('sort_order', 'title').first()
    manager = offer.supervisor or (job.hiring_manager if job and job.hiring_manager_id else None)
    try:
        with transaction.atomic():
            started, sent = onboarding_service.start(
                user=application.employee_user, by=by, start_date=offer.start_date, start_time=offer.start_time,
                manager=manager, position=offer.position, job=job, application=application, send_email=send_email,
            )
    except Exception as exc:
        if not isinstance(exc, ValidationError):
            logger.exception('auto start-onboarding failed for application %s', application.pk)
        out.update(status=BLOCKED, why=_why(exc))
        _blocked(application, 'The Dash login was made, but onboarding did not start', out['why'], by=by)
        return out
    out.update(status=STARTED, onboarding=started.pk, email_sent=bool(sent))
    return out
