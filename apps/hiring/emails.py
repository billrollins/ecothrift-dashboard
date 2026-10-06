"""Hiring mail: the applicant's auto-reply, the alert to the owner, and "Not now" emails.

Sender and Reply-To come from the careers file. With Microsoft Graph on and a sender of
its own (jobs@ecothrift.us), mail goes through that mailbox; if that fails it falls back
to the store mailbox with Reply-To set, so an applicant always gets their reply.
"""
from __future__ import annotations

import logging
from email.utils import parseaddr

from django.conf import settings
from django.core.mail import EmailMessage

from apps.hiring.careers import fill, load_setting

logger = logging.getLogger(__name__)


def _addresses(raw: str) -> list[str]:
    return [a.strip() for a in (raw or '').replace(';', ',').split(',') if a.strip()]


def _send_via_own_mailbox(*, sender: str, to: list[str], subject: str, body: str, reply_to: list[str]) -> bool:
    from apps.mailbox.auth import graph_enabled
    from apps.mailbox.graph import GraphMailClient

    if not graph_enabled():
        return False
    _, address = parseaddr(sender)
    if not address:
        return False
    try:
        GraphMailClient(mailbox=address).send_mail(
            subject=subject, body=body, to=to, reply_to=reply_to or None, from_email=sender,
        )
        return True
    except Exception:
        logger.exception('Hiring mail from %s failed; falling back to the store mailbox', address)
        return False


def send(*, to: str | list[str], subject: str, body: str) -> bool:
    """Plain-text mail from the careers sender. Never raises; returns True when it went out."""
    recipients = _addresses(to) if isinstance(to, str) else [a for a in to if a]
    if not recipients:
        return False
    email = load_setting()['email']
    reply_to = _addresses(email.get('reply_to') or '')
    sender = (email.get('from') or '').strip()
    if sender and _send_via_own_mailbox(sender=sender, to=recipients, subject=subject, body=body, reply_to=reply_to):
        return True
    try:
        message = EmailMessage(
            subject=subject, body=body, from_email=settings.DEFAULT_FROM_EMAIL, to=recipients, reply_to=reply_to,
        )
        return bool(message.send(fail_silently=True))
    except Exception:
        logger.exception('Hiring mail failed: %s → %s', subject, recipients)
        return False


def values_for(application, *, extra: dict | None = None) -> dict:
    email = load_setting()['email']
    roles = [job.title for job in application.jobs.all()]
    if len(roles) > 1:
        role_text = ', '.join(roles[:-1]) + ' and ' + roles[-1]
    else:
        role_text = roles[0] if roles else 'a role at Eco-Thrift'
    return {
        'first_name': application.first_name,
        'last_name': application.last_name,
        'email': application.email,
        'phone': application.phone or 'the number you gave us',
        'roles': role_text,
        'review_day': email.get('review_day') or 'a few times a week',
        'reply_days': email.get('reply_days') or 7,
        **(extra or {}),
    }


def send_received(application) -> bool:
    template = load_setting()['email']['received']
    values = values_for(application)
    return send(to=application.email, subject=fill(template['subject'], values), body=fill(template['body'], values))


def alert_recipients(application) -> list[str]:
    """The careers file's notify address(es) plus the hiring manager of each role applied for."""
    out: list[str] = []
    for address in _addresses(load_setting()['email'].get('notify') or ''):
        if address.lower() not in out:
            out.append(address.lower())
    for job in application.jobs.select_related('hiring_manager'):
        manager = job.hiring_manager
        if manager and manager.is_active and manager.email and manager.email.lower() not in out:
            out.append(manager.email.lower())
    return out


def send_alert(application, *, dash_link: str) -> bool:
    email = load_setting()['email']
    notify = alert_recipients(application)
    if not notify:
        return False
    flags = [a for a in application.answers or [] if a.get('must_be')]
    misses = [a.get('flag_label') or a.get('label') for a in flags if a.get('ok') is False]
    flag_text = ('RED: ' + ', '.join(misses)) if misses else ('all green' if flags else 'none')
    values = values_for(application, extra={'flags': flag_text, 'dash_link': dash_link})
    template = email['alert']
    return send(to=notify, subject=fill(template['subject'], values), body=fill(template['body'], values))
