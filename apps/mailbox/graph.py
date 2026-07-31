"""Small Microsoft Graph mail client used by Django and mailbox sync."""
from __future__ import annotations

from email.utils import parseaddr
from typing import Any
from urllib.parse import quote

import requests
from django.conf import settings

from .auth import get_access_token, graph_enabled, graph_settings


class GraphMailError(RuntimeError):
    """Raised for unsuccessful Microsoft Graph requests."""


class GraphMailClient:
    base_url = 'https://graph.microsoft.com/v1.0'

    def __init__(self, *, session=None, mailbox: str | None = None):
        self.session = session or requests.Session()
        self.mailbox = mailbox or str(getattr(settings, 'MS_GRAPH_MAILBOX', '') or '').strip()

    def _mailbox_path(self) -> str:
        mailbox = self.mailbox or graph_settings()['mailbox']
        return f'/users/{quote(mailbox, safe="@")}'

    def _request(self, method: str, path_or_url: str, **kwargs):
        if not graph_enabled():
            raise GraphMailError('Microsoft Graph mail is disabled (MS_GRAPH_ENABLED=false).')
        url = path_or_url if path_or_url.startswith('http') else f'{self.base_url}{path_or_url}'
        headers = dict(kwargs.pop('headers', {}))
        headers['Authorization'] = f'Bearer {get_access_token()}'
        headers.setdefault('Accept', 'application/json')
        response = self.session.request(method, url, headers=headers, timeout=30, **kwargs)
        if response.status_code >= 400:
            try:
                detail = response.json().get('error', {}).get('message')
            except (ValueError, AttributeError):
                detail = response.text
            raise GraphMailError(
                f'Microsoft Graph {method.upper()} {response.status_code}: {detail or "request failed"}',
            )
        if response.status_code == 204 or not response.content:
            return {}
        return response.json()

    @staticmethod
    def _recipients(addresses: list[str] | tuple[str, ...] | None) -> list[dict[str, Any]]:
        result = []
        for raw in addresses or []:
            name, address = parseaddr(raw)
            if not address:
                continue
            email_address: dict[str, str] = {'address': address}
            if name:
                email_address['name'] = name
            result.append({'emailAddress': email_address})
        return result

    def send_mail(
        self,
        *,
        subject: str,
        body: str,
        to: list[str],
        html: bool = False,
        cc: list[str] | None = None,
        bcc: list[str] | None = None,
        reply_to: list[str] | None = None,
        headers: dict[str, str] | None = None,
        from_email: str = '',
        save_to_sent_items: bool = True,
    ) -> None:
        from_name, from_address = parseaddr(from_email)
        from_address = from_address or self.mailbox or graph_settings()['mailbox']
        from_name = from_name or str(
            getattr(settings, 'ONLINE_SALES_EMAIL_DISPLAY_NAME', 'Eco-Thrift') or 'Eco-Thrift',
        )
        message: dict[str, Any] = {
            'subject': subject,
            'body': {'contentType': 'HTML' if html else 'Text', 'content': body},
            'toRecipients': self._recipients(to),
            'from': {'emailAddress': {'name': from_name, 'address': from_address}},
        }
        if cc:
            message['ccRecipients'] = self._recipients(cc)
        if bcc:
            message['bccRecipients'] = self._recipients(bcc)
        if reply_to:
            message['replyTo'] = self._recipients(reply_to)
        safe_headers = [
            {'name': name, 'value': str(value)}
            for name, value in (headers or {}).items()
            if name.lower().startswith('x-')
        ]
        if safe_headers:
            message['internetMessageHeaders'] = safe_headers
        self._request(
            'post',
            f'{self._mailbox_path()}/sendMail',
            json={'message': message, 'saveToSentItems': save_to_sent_items},
        )

    def list_inbox_messages(
        self,
        *,
        delta_link: str = '',
        top: int = 50,
    ) -> tuple[list[dict[str, Any]], str]:
        url = delta_link or f'{self._mailbox_path()}/mailFolders/inbox/messages/delta'
        params = None if delta_link else {
            '$top': max(1, min(int(top), 100)),
            '$select': (
                'id,conversationId,subject,from,toRecipients,receivedDateTime,'
                'isRead,body,bodyPreview,hasAttachments,internetMessageHeaders'
            ),
        }
        messages: list[dict[str, Any]] = []
        final_delta = delta_link
        while url:
            payload = self._request('get', url, params=params)
            params = None
            messages.extend(payload.get('value') or [])
            final_delta = payload.get('@odata.deltaLink') or final_delta
            url = payload.get('@odata.nextLink') or ''
        return messages, final_delta

    def get_message(self, message_id: str) -> dict[str, Any]:
        params = {
            '$select': (
                'id,conversationId,subject,from,toRecipients,receivedDateTime,'
                'isRead,body,bodyPreview,hasAttachments,internetMessageHeaders'
            ),
            '$expand': 'attachments($select=name)',
        }
        return self._request(
            'get',
            f'{self._mailbox_path()}/messages/{quote(message_id, safe="")}',
            params=params,
        )

    def reply(self, message_id: str, *, html_body: str) -> None:
        self._request(
            'post',
            f'{self._mailbox_path()}/messages/{quote(message_id, safe="")}/reply',
            json={'message': {'body': {'contentType': 'HTML', 'content': html_body}}},
        )

    def mark_read(self, message_id: str) -> None:
        self._request(
            'patch',
            f'{self._mailbox_path()}/messages/{quote(message_id, safe="")}',
            json={'isRead': True},
        )

    def check_mailbox(self) -> dict[str, Any]:
        return self._request(
            'get',
            f'{self._mailbox_path()}',
            params={'$select': 'id,displayName,mail,userPrincipalName'},
        )
