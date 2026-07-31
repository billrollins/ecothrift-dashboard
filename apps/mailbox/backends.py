"""Django email backend that sends through Microsoft Graph when enabled."""
from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import get_connection
from django.core.mail.backends.base import BaseEmailBackend

from .auth import graph_enabled
from .graph import GraphMailClient

logger = logging.getLogger(__name__)


class GraphEmailBackend(BaseEmailBackend):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.client = None

    def _fallback(self):
        backend = getattr(
            settings,
            'MS_GRAPH_FALLBACK_EMAIL_BACKEND',
            'django.core.mail.backends.console.EmailBackend',
        )
        if backend == 'apps.mailbox.backends.GraphEmailBackend':
            backend = 'django.core.mail.backends.console.EmailBackend'
        return get_connection(backend=backend, fail_silently=self.fail_silently)

    @staticmethod
    def _body(email_message) -> tuple[str, bool]:
        if getattr(email_message, 'content_subtype', 'plain') == 'html':
            return email_message.body, True
        for alternative in getattr(email_message, 'alternatives', ()):
            content = getattr(alternative, 'content', alternative[0])
            mimetype = getattr(alternative, 'mimetype', alternative[1])
            if mimetype == 'text/html':
                return content, True
        return email_message.body, False

    def send_messages(self, email_messages):
        messages = list(email_messages or [])
        if not messages:
            return 0
        if not graph_enabled():
            return self._fallback().send_messages(messages)

        client = self.client or GraphMailClient()
        sent = 0
        for message in messages:
            if not message.recipients():
                continue
            try:
                body, html = self._body(message)
                client.send_mail(
                    subject=message.subject,
                    body=body,
                    html=html,
                    to=list(message.to or []),
                    cc=list(message.cc or []),
                    bcc=list(message.bcc or []),
                    reply_to=list(message.reply_to or []),
                    headers=dict(message.extra_headers or {}),
                    from_email=message.from_email,
                )
                sent += 1
            except Exception:
                if not self.fail_silently:
                    raise
                logger.exception('Microsoft Graph email failed: %s', message.subject)
        return sent
