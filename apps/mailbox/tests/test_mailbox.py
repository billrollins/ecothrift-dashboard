from unittest.mock import Mock, patch

from django.contrib.auth.models import Group
from django.core import mail
from django.core.mail import EmailMessage
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.webstore.models import Conversation, Message

from apps.mailbox.backends import GraphEmailBackend
from apps.mailbox.models import MailMessage
from apps.mailbox.services import classify_inbound, sync_mailbox


def _conversation(token: str, email: str) -> Conversation:
    return Conversation.objects.create(
        public_token=token,
        guest_name='Customer',
        guest_email=email,
        state='needs_reply',
    )


def _payload(message_id='graph-1', *, sender='outside@example.com'):
    return {
        'id': message_id,
        'conversationId': 'graph-thread',
        'subject': 'A general question',
        'from': {'emailAddress': {'address': sender}},
        'toRecipients': [{'emailAddress': {'address': 'retail@ecothrift.us'}}],
        'receivedDateTime': '2026-07-31T12:00:00Z',
        'isRead': False,
        'body': {'contentType': 'html', 'content': '<p>Hello</p>'},
        'internetMessageHeaders': [{'name': 'X-Test', 'value': '1'}],
        'attachments': [],
    }


class ClassificationTests(TestCase):
    def setUp(self):
        self.header_conversation = _conversation('header-token-123', 'header@example.com')
        self.subject_conversation = _conversation('subject-token-456', 'subject@example.com')
        self.sender_conversation = _conversation('sender-token-789', 'sender@example.com')

    def test_header_match_wins(self):
        classification, conversation = classify_inbound(
            headers=[{'name': 'X-Eco-Thread', 'value': self.header_conversation.public_token}],
            subject='No marker',
            sender_email='nobody@example.com',
        )
        self.assertEqual(classification, 'online_sales')
        self.assertEqual(conversation, self.header_conversation)

    def test_subject_marker_match(self):
        classification, conversation = classify_inbound(
            headers=[],
            subject='Re: [ETO-subject] availability',
            sender_email='nobody@example.com',
        )
        self.assertEqual(classification, 'online_sales')
        self.assertEqual(conversation, self.subject_conversation)

    def test_open_conversation_sender_match(self):
        classification, conversation = classify_inbound(
            headers=[],
            subject='Question',
            sender_email='SENDER@example.com',
        )
        self.assertEqual(classification, 'online_sales')
        self.assertEqual(conversation, self.sender_conversation)

    def test_unmatched_mail_is_general(self):
        classification, conversation = classify_inbound(
            headers=[],
            subject='Store hours',
            sender_email='walkin@example.com',
        )
        self.assertEqual(classification, 'general')
        self.assertIsNone(conversation)


class SyncTests(TestCase):
    def test_sync_is_idempotent_by_graph_message_id(self):
        client = Mock()
        client.list_inbox_messages.return_value = ([_payload()], 'https://graph/delta/next')

        first = sync_mailbox(client=client)
        second = sync_mailbox(client=client)

        self.assertEqual(first['created'], 1)
        self.assertEqual(second['updated'], 1)
        self.assertEqual(MailMessage.objects.filter(graph_message_id='graph-1').count(), 1)

    def test_online_sales_sync_creates_one_customer_message(self):
        conversation = _conversation('inbound-thread', 'customer@example.com')
        payload = _payload(sender='customer@example.com')
        client = Mock()
        client.list_inbox_messages.return_value = ([payload], 'https://graph/delta/one')
        sync_mailbox(client=client)
        client.list_inbox_messages.return_value = ([payload], 'https://graph/delta/two')
        sync_mailbox(client=client)
        self.assertEqual(
            Message.objects.filter(conversation=conversation, author_kind='customer').count(),
            1,
        )


@override_settings(MS_GRAPH_ENABLED=True)
class MailboxApiTests(TestCase):
    def setUp(self):
        admin_group, _ = Group.objects.get_or_create(name='Admin')
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.admin = User.objects.create_user(
            email='admin@example.com', first_name='Alex', last_name='Admin', password='x',
        )
        self.admin.groups.add(admin_group)
        self.manager = User.objects.create_user(
            email='manager@example.com', first_name='Morgan', last_name='Manager', password='x',
        )
        self.manager.groups.add(manager_group)
        self.message = MailMessage.objects.create(
            graph_message_id='api-message',
            from_email='customer@example.com',
            subject='General',
            text_body='Question',
            classification='general',
        )

    def test_general_inbox_is_admin_only(self):
        client = APIClient()
        client.force_authenticate(self.manager)
        self.assertEqual(client.get('/api/mailbox/messages/?classification=general').status_code, 403)
        client.force_authenticate(self.admin)
        self.assertEqual(client.get('/api/mailbox/messages/?classification=general').status_code, 200)

    def test_reply_appends_sanitized_signature(self):
        AppSetting.objects.update_or_create(
            key='mailbox.email_signature',
            defaults={'value': '<p>Regards, {{staff_name}}</p><script>alert(1)</script>'},
        )
        graph = Mock()
        client = APIClient()
        client.force_authenticate(self.admin)
        with patch('apps.mailbox.views.GraphMailClient', return_value=graph):
            response = client.post(
                f'/api/mailbox/messages/{self.message.id}/reply/',
                {'html_body': '<p>Hello</p><img src="https://tracker.invalid/x">'},
                format='json',
            )
        self.assertEqual(response.status_code, 200)
        sent_html = graph.reply.call_args.kwargs['html_body']
        self.assertIn('Alex Admin', sent_html)
        self.assertNotIn('<script', sent_html)
        self.assertNotIn('<img', sent_html)


@override_settings(
    MS_GRAPH_ENABLED=False,
    MS_GRAPH_FALLBACK_EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
)
class DisabledBackendTests(TestCase):
    def test_disabled_graph_backend_delegates_to_locmem(self):
        mail.outbox = []
        backend = GraphEmailBackend(fail_silently=False)
        sent = backend.send_messages([
            EmailMessage('Test', 'Local body', 'Eco-Thrift <retail@ecothrift.us>', ['to@example.com']),
        ])
        self.assertEqual(sent, 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, 'Test')
