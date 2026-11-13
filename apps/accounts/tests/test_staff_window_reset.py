"""Staff window Password reset (#136): one 48-hour link, emailed, texted from our number, or both. Twilio is mocked."""
from unittest import mock

from django.contrib.auth.models import Group
from django.core import mail
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import MagicLinkToken, User
from apps.texting import service

MAIL = dict(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
            DEFAULT_FROM_EMAIL='Eco-Thrift <retail@ecothrift.us>', STAFF_DASHBOARD_HOST='dash.ecothrift.us')


def _staff(email, role='Employee', **kw):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='Tester',
                                    password='original-pass-123', **kw)
    user.groups.add(group)
    return user


@override_settings(**MAIL)
class StaffWindowResetTests(APITestCase):
    def setUp(self):
        self.owner = _staff('boss@example.com', role='Admin')
        self.crew = _staff('crew@example.com', phone='5175551234')
        self.client.force_authenticate(self.owner)
        self.url = f'/api/accounts/users/{self.crew.pk}/password-reset/'

    def test_both_send_one_link_two_ways(self):
        deliver = mock.Mock(return_value=(True, 'SMx', ''))
        with mock.patch.multiple(service, staff_waiting_on=mock.Mock(return_value=[]), _deliver=deliver):
            resp = self.client.post(self.url, {'email': True, 'text': True}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data['email']['sent'])
        self.assertTrue(resp.data['text']['sent'])
        self.assertNotIn('link', resp.data)
        live = MagicLinkToken.objects.filter(email='crew@example.com', used_at__isnull=True)
        self.assertEqual(live.count(), 1)  # one link, still good both ways
        token = live.get().token
        self.assertIn(token, mail.outbox[0].body)
        self.assertIn('48 hours', mail.outbox[0].body)
        self.assertIn(token, str(deliver.call_args))

    def test_email_only(self):
        resp = self.client.post(self.url, {'email': True}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIsNone(resp.data['text'])
        self.assertEqual(len(mail.outbox), 1)

    def test_text_held_when_texts_are_off(self):
        resp = self.client.post(self.url, {'text': True}, format='json')
        self.assertEqual(resp.status_code, 502, resp.data)
        self.assertFalse(resp.data['text']['sent'])
        self.assertTrue(resp.data['text']['reason'])

    def test_nothing_picked_or_no_phone_is_refused(self):
        self.assertEqual(self.client.post(self.url, {}, format='json').status_code, 400)
        self.crew.phone = ''
        self.crew.save()
        self.assertEqual(self.client.post(self.url, {'text': True}, format='json').status_code, 400)

    def test_a_manager_cannot_reset_from_here(self):
        self.client.force_authenticate(_staff('lead@example.com', role='Manager'))
        self.assertEqual(self.client.post(self.url, {'email': True}, format='json').status_code, 403)


class StaffWindowLockTests(APITestCase):
    def test_one_record_says_locked_out_a_list_does_not(self):
        from apps.accounts.services import lockout

        owner = _staff('boss@example.com', role='Admin')
        crew = _staff('crew@example.com')
        self.client.force_authenticate(owner)
        self.assertIs(self.client.get(f'/api/accounts/users/{crew.pk}/').data['locked_out'], False)
        with mock.patch.object(lockout, 'is_locked', return_value=True):
            self.assertIs(self.client.get(f'/api/accounts/users/{crew.pk}/').data['locked_out'], True)
            rows = self.client.get('/api/accounts/users/?staff=1').data
        rows = rows.get('results', rows) if isinstance(rows, dict) else rows
        self.assertTrue(all(r['locked_out'] is None for r in rows))
