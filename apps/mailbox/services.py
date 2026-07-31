"""Inbound mailbox classification, persistence, and synchronization."""
from __future__ import annotations

import re

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.webstore.models import Conversation
from apps.webstore.services.conversations import post_message

from .graph import GraphMailClient
from .models import MailMessage, MailSyncState
from .sanitize import clean_email_html, email_html_to_text

THREAD_HEADER = 'x-eco-thread'
SUBJECT_MARKER_RE = re.compile(r'\[ETO-([A-Za-z0-9_-]+)\]', re.IGNORECASE)
OPEN_CONVERSATION_STATES = ('needs_reply', 'waiting_on_customer')


def _header_value(headers: list[dict] | None, name: str) -> str:
    wanted = name.lower()
    for header in headers or []:
        if str(header.get('name') or '').lower() == wanted:
            return str(header.get('value') or '').strip()
    return ''


def _conversation_from_short(short_token: str) -> Conversation | None:
    if not short_token:
        return None
    candidates = list(
        Conversation.objects.filter(public_token__istartswith=short_token)
        .order_by('-last_message_at', '-created_at')[:2],
    )
    exact = [c for c in candidates if c.public_token.lower().startswith(short_token.lower())]
    return exact[0] if len(exact) == 1 else None


def classify_inbound(
    *,
    headers: list[dict] | None,
    subject: str,
    sender_email: str,
) -> tuple[str, Conversation | None]:
    """Apply the locked four-branch classification order."""
    thread_token = _header_value(headers, THREAD_HEADER)
    if thread_token:
        conversation = Conversation.objects.filter(public_token=thread_token).first()
        if conversation:
            return 'online_sales', conversation

    marker = SUBJECT_MARKER_RE.search(subject or '')
    if marker:
        conversation = _conversation_from_short(marker.group(1))
        if conversation:
            return 'online_sales', conversation

    sender_email = (sender_email or '').strip()
    if sender_email:
        conversation = (
            Conversation.objects.filter(
                guest_email__iexact=sender_email,
                state__in=OPEN_CONVERSATION_STATES,
            )
            .order_by('-last_message_at', '-created_at')
            .first()
        )
        if conversation:
            return 'online_sales', conversation

    return 'general', None


def _email_address(value: dict | None) -> str:
    return str(((value or {}).get('emailAddress') or {}).get('address') or '').strip()


def _message_defaults(payload: dict) -> tuple[dict, Conversation | None]:
    body = payload.get('body') or {}
    raw_body = str(body.get('content') or payload.get('bodyPreview') or '')
    if str(body.get('contentType') or '').lower() == 'html':
        html_body = clean_email_html(raw_body)
        text_body = email_html_to_text(html_body)
    else:
        html_body = ''
        text_body = raw_body.strip()
    sender_email = _email_address(payload.get('from'))
    classification, conversation = classify_inbound(
        headers=payload.get('internetMessageHeaders'),
        subject=str(payload.get('subject') or ''),
        sender_email=sender_email,
    )
    received_at = parse_datetime(str(payload.get('receivedDateTime') or '')) or timezone.now()
    defaults = {
        'graph_conversation_id': str(payload.get('conversationId') or ''),
        'from_email': sender_email,
        'to_emails': [
            address
            for address in (_email_address(item) for item in payload.get('toRecipients') or [])
            if address
        ],
        'subject': str(payload.get('subject') or '')[:998],
        'html_body': html_body,
        'text_body': text_body,
        'received_at': received_at,
        'is_read': bool(payload.get('isRead', False)),
        'classification': classification,
        'conversation': conversation,
        'attachment_names': [
            str(item.get('name'))
            for item in payload.get('attachments') or []
            if item.get('name')
        ],
    }
    return defaults, conversation


@transaction.atomic
def upsert_graph_message(payload: dict) -> tuple[MailMessage, bool]:
    graph_id = str(payload.get('id') or '').strip()
    if not graph_id:
        raise ValueError('Graph message payload is missing id.')
    defaults, conversation = _message_defaults(payload)
    mail_message, created = MailMessage.objects.update_or_create(
        graph_message_id=graph_id,
        defaults=defaults,
    )
    if created and conversation and mail_message.classification == 'online_sales':
        body = mail_message.text_body or email_html_to_text(mail_message.html_body)
        if body:
            post_message(
                conversation,
                author_kind='customer',
                body=body,
                author_user=None,
            )
    return mail_message, created


def sync_mailbox(*, client: GraphMailClient | None = None) -> dict[str, int | str]:
    client = client or GraphMailClient()
    state, _ = MailSyncState.objects.get_or_create(singleton_key='inbox')
    payloads, delta_link = client.list_inbox_messages(delta_link=state.delta_link)
    created_count = 0
    updated_count = 0
    skipped_count = 0
    for payload in payloads:
        if payload.get('@removed'):
            skipped_count += 1
            continue
        if not payload.get('internetMessageHeaders') or (
            payload.get('hasAttachments') and 'attachments' not in payload
        ):
            payload = client.get_message(str(payload.get('id') or ''))
        _, created = upsert_graph_message(payload)
        if created:
            created_count += 1
        else:
            updated_count += 1
    state.last_sync_at = timezone.now()
    if delta_link:
        state.delta_link = delta_link
    state.save(update_fields=['last_sync_at', 'delta_link'])
    return {
        'created': created_count,
        'updated': updated_count,
        'skipped': skipped_count,
        'delta_link': state.delta_link,
    }
