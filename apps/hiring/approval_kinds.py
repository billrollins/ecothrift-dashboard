"""
Hiring work that goes through Superuser → Requests (staged in production, approved there).

- ``hiring.catch_up_hires`` (owner 2026-10-20): signing an offer now starts the new hire by itself (``hire.py``), but
  hires whose offer was signed before that are stuck: Hired, no Dash login, no onboarding. For every real
  (non-practice) applicant with a signed offer, stage Hired and no employee, this does what signing now does: makes the
  Dash login from the offer's terms and starts onboarding (the checklist, the check-ins and the first-day email).
  Optional ``overtime``: ``[{"employee": <user id or email>, "hours": 5}]`` sets weekly overtime allowances (hours
  past 40 they are cleared for). Safe to run again: anyone already started is skipped. It cannot be undone.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from apps.core.models import ApprovalRequest
from apps.core.services.approval_requests import Kind, Progress, register
from apps.hiring.offers import EMPLOYMENT_LABEL


def _targets():
    """Real applicants whose signed offer never became a login + onboarding, oldest first."""
    from apps.hiring.models import Application, Offer, Onboarding

    rows = []
    done = set(Onboarding.objects.exclude(application__isnull=True).values_list('application_id', flat=True))
    for application in (Application.objects.filter(is_practice=False, stage=Application.STAGE_HIRED,
                                                   employee_user__isnull=True)
                        .prefetch_related('jobs').order_by('pk')):
        if application.pk in done:
            continue
        offer = application.offers.filter(status=Offer.STATUS_SIGNED).order_by('-signed_at', '-pk').first()
        if offer is not None:
            rows.append((application, offer))
    return rows


def _problem(application, offer) -> str:
    """Why this one would not go through (the same checks create employee makes), or ''."""
    from apps.accounts.models import User

    if not application.email:
        return 'no email address'
    if User.objects.filter(email__iexact=application.email).exists():
        return f'a Dash account already uses {application.email}'
    return ''


def _overtime(raw) -> tuple[list[dict], list[str]]:
    """Validate the optional overtime list. Returns ([{'user_id', 'name', 'hours'}], problems)."""
    from apps.accounts.models import EmployeeProfile, User

    rows, problems = [], []
    for item in raw or []:
        if not isinstance(item, dict):
            problems.append(f'overtime item {item!r}: use {{"employee": id or email, "hours": 5}}')
            continue
        who = item.get('employee', item.get('user', item.get('user_id', item.get('employee_id'))))
        try:
            hours = Decimal(str(item.get('hours')))
            if hours < 0 or hours > 40:
                raise InvalidOperation
        except (InvalidOperation, ValueError, TypeError):
            problems.append(f'overtime for {who}: hours must be 0 to 40')
            continue
        user = None
        if isinstance(who, str) and '@' in who:
            user = User.objects.filter(email__iexact=who.strip()).first()
        else:
            try:
                user = User.objects.filter(pk=int(who)).first()
            except (TypeError, ValueError):
                user = None
        if user is None or not EmployeeProfile.objects.filter(user=user).exists():
            problems.append(f'overtime for {who}: no employee found')
            continue
        rows.append({'user_id': user.pk, 'name': user.full_name or user.email, 'hours': str(hours)})
    return rows, problems


def _preview(params: dict) -> dict:
    targets = _targets()
    changes, sample, blocked, past = [], [], 0, 0
    from django.utils import timezone

    today = timezone.localdate()
    for application, offer in targets:
        problem = _problem(application, offer)
        if problem:
            blocked += 1
        if offer.start_date < today:
            past += 1
        job = offer.job or application.jobs.order_by('sort_order', 'title').first()
        bits = [f'{offer.position}', f'${offer.pay_rate:.2f} an hour',
                EMPLOYMENT_LABEL.get(offer.employment_type, offer.employment_type).lower(),
                f'starts {offer.start_date:%b} {offer.start_date.day}'
                + (' (already passed)' if offer.start_date < today else '')]
        if offer.supervisor_id:
            bits.append(f'manager {offer.supervisor.full_name or offer.supervisor.email}')
        if job is not None and job.department_id:
            bits.append(f'department {job.department.name}')
        row = {
            'who': application.full_name, 'email': application.email or '(none)', 'terms': '; '.join(bits),
            'will': ('BLOCKED: ' + problem) if problem else
                    'Makes the Dash login, starts onboarding (checklist and the 30/60/90-day check-ins) and emails '
                    'the first-day email',
        }
        sample.append(row)
        changes.append(f'{application.full_name} ({application.email or "no email"}): '
                       + (f'will be skipped, {problem}.' if problem else
                          f'{"; ".join(bits)}. Gets a Dash login, onboarding and the first-day email.'))
    overtime, problems = _overtime(params.get('overtime'))
    for item in overtime:
        changes.append(f'Overtime: {item["name"]} may work {item["hours"]} hours past 40 a week '
                       f'(flagged red above {Decimal(item["hours"]) + 40:g}).')
    changes.extend(f'Overtime problem: {p}.' for p in problems)
    if not targets:
        changes.insert(0, 'Nobody is waiting: no real applicant is Hired with a signed offer and no login.')
    counts = {'Hires to start': len(targets) - blocked, 'First-day emails to send': len(targets) - blocked}
    if blocked:
        counts['Blocked (will be skipped)'] = blocked
    if past:
        counts['Start date already passed'] = past
    if overtime:
        counts['Overtime allowances to set'] = len(overtime)
    return {'counts': counts, 'changes': changes, 'sample': sample, 'params': {'overtime': overtime}}


def _apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.accounts.models import EmployeeProfile
    from apps.hiring import hire

    targets = _targets()
    total = len(targets) + (progress.state.get('done') or 0)
    done = progress.state.get('done') or 0
    started, blocked = list(progress.state.get('started') or []), list(progress.state.get('blocked') or [])
    for application, offer in targets:
        result = hire.hire_from_offer(application, offer, by=request.decided_by, send_email=True)
        done += 1
        if result['status'] == hire.STARTED:
            started.append(application.full_name)
            progress.update(done=done, total=total, started=started,
                            log=f'{application.full_name}: login made, onboarding started'
                                f'{", first-day email sent" if result["email_sent"] else ", first-day email NOT sent"}.')
        else:
            blocked.append(f'{application.full_name}: {result["why"]}')
            progress.update(done=done, total=total, blocked=blocked,
                            log=f'{application.full_name}: {result["status"]} - {result["why"]}')
    changed = []
    for item in (request.params or {}).get('overtime') or []:
        profile = EmployeeProfile.objects.filter(user_id=item['user_id']).first()
        if profile is None:
            continue
        hours = Decimal(item['hours'])
        if profile.overtime_allowance_hours != hours:
            profile.overtime_allowance_hours = hours
            profile.save(update_fields=['overtime_allowance_hours'])
        changed.append(f'{item["name"]}: {item["hours"]}')
        progress.log(f'Overtime allowance for {item["name"]}: {item["hours"]} hours past 40.')
    if not targets and not changed:
        progress.log('Nothing to do.')
    return {'started': started, 'blocked': blocked, 'overtime': changed}


register(Kind(kind='hiring.catch_up_hires', label='Start hires whose offer was already signed', preview=_preview,
              apply=_apply))
