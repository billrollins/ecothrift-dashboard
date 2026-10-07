"""Hiring mail: the applicant's auto-reply, the alert to the owner, and "Not now" emails.

Sender and Reply-To come from the careers file (one of the store mailboxes; retail@ by default).
With Microsoft Graph on, mail goes through the sender's mailbox as "Eco-Thrift <sender>"; if that
fails it falls back to the store mailbox with Reply-To set, so an applicant always gets their reply.
"""
from __future__ import annotations

import logging
from email.utils import formataddr, parseaddr

from django.conf import settings
from django.core.mail import EmailMessage

from apps.hiring import compose
from apps.hiring.careers import fill, load_setting, template as email_template

logger = logging.getLogger(__name__)


def _addresses(raw: str) -> list[str]:
    return [a.strip() for a in (raw or '').replace(';', ',').split(',') if a.strip()]


def _send_via_own_mailbox(*, sender: str, to: list[str], subject: str, body: str, reply_to: list[str],
                          attachments=None) -> bool:
    from apps.mailbox.auth import graph_enabled
    from apps.mailbox.graph import GraphMailClient

    if not graph_enabled():
        return False
    name, address = parseaddr(sender)
    if not address:
        return False
    try:
        GraphMailClient(mailbox=address).send_mail(
            subject=subject, body=body, to=to, reply_to=reply_to or None,
            from_email=formataddr((name or 'Eco-Thrift', address)),
            attachments=attachments or None,
        )
        return True
    except Exception:
        logger.exception('Hiring mail from %s failed; falling back to the store mailbox', address)
        return False


PRACTICE_TAG = '[Practice] '
PRACTICE_NOTE = 'PRACTICE RUN: a test of the hiring emails, not a real application.'


def send(*, to: str | list[str], subject: str, body: str,
         attachments: list[tuple[str, bytes | str, str]] | None = None, practice: bool = False) -> bool:
    """Plain-text mail from the careers sender. Never raises; returns True when it went out.

    ``attachments``: (filename, content, mimetype), e.g. an interview's ``.ics`` calendar file.
    ``practice``: the email is about a practice applicant; the subject and the first line say so.
    """
    recipients = _addresses(to) if isinstance(to, str) else [a for a in to if a]
    if not recipients:
        return False
    if compose.capturing():  # a preview: nothing leaves
        return True
    if practice:
        subject = subject if subject.startswith(PRACTICE_TAG) else PRACTICE_TAG + subject
        body = f'{PRACTICE_NOTE}\n\n{body}'
    email = load_setting()['email']
    reply_to = _addresses(email.get('reply_to') or '')
    sender = (email.get('from') or '').strip()
    if sender and _send_via_own_mailbox(sender=sender, to=recipients, subject=subject, body=body, reply_to=reply_to,
                                        attachments=attachments):
        return True
    try:
        message = EmailMessage(
            subject=subject, body=body, from_email=settings.DEFAULT_FROM_EMAIL, to=recipients, reply_to=reply_to,
        )
        for name, content, mimetype in attachments or ():
            message.attach(name, content, mimetype)
        return bool(message.send(fail_silently=True))
    except Exception:
        logger.exception('Hiring mail failed: %s → %s', subject, recipients)
        return False


def send_template(key: str, *, to, template: dict, values: dict, application=None,
                  attachments: list[tuple[str, bytes | str, str]] | None = None, practice: bool = False,
                  made_on_send: tuple[str, ...] = ()) -> bool:
    """Fill one of the careers emails and send it.

    A reviewed email (``compose.REVIEWED``) follows the review: held back as a draft in a preview, the edited words
    when the request gave some (linked values filled now), nothing when skipped, and a line with the exact words on
    the applicant's history. ``made_on_send``: values only made when it really goes (a new offer's link); the review
    says so instead of showing one that will not be used.
    """
    review = compose.current() if key in compose.REVIEWED else None
    if review is not None and review.capture is not None:
        shown = {**values, **{name: f'({compose.FIELD_LABELS.get(name, name).lower()}, made when you send)'
                              for name in made_on_send if name in values}}
        review.capture.append(compose.draft(key, to=to, template=template, values=shown, attachments=attachments,
                                            practice=practice))
        return True
    label = compose.EMAIL_LABELS.get(key, key)
    by = review.user if review is not None else None
    if review is not None and review.skip:
        if application is not None:
            _log(application, by=by, text=f'Not emailed: {label} (done without emailing)', data={'email': key})
        return False
    used = template
    if review is not None and review.body is not None:
        used = {'subject': review.subject, 'body': review.body}
    subject, body = fill(used['subject'], values), fill(used['body'], values)
    sent = send(to=to, subject=subject, body=body, attachments=attachments, practice=practice)
    if application is not None and key in compose.REVIEWED:
        changed = compose.edited(template, used)
        _log(application, by=by,
             text=(f'Emailed: {label}' if sent else f'Email could not be sent: {label}') + (' (edited)' if changed else ''),
             data={'email': key, 'sent': sent, 'subject': subject, 'body': body, 'edited': changed,
                   'typed_over': compose.typed_over(template, used)})
    return sent


def _log(application, *, by, text: str, data: dict) -> None:
    from apps.hiring.models import ApplicationEvent

    ApplicationEvent.objects.create(application=application, kind=ApplicationEvent.KIND_EMAIL, by=by, text=text,
                                    data=data)


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
    template = email_template('received', application)
    values = values_for(application)
    return send(to=application.email, subject=fill(template['subject'], values), body=fill(template['body'], values),
                practice=application.is_practice)


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
    template = email_template('alert', application)
    return send(to=notify, subject=fill(template['subject'], values), body=fill(template['body'], values),
                practice=application.is_practice)
