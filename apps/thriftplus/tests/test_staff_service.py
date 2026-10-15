"""Thrift+ Phase 4, the staff side: a membership's money (balances, ledger, adjustments) and the owner's overview."""
from __future__ import annotations

from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.thriftplus.models import LedgerEntry
from apps.thriftplus.services import members


def _user(email, group):
    user = User.objects.create_user(email, 'Test', 'User', password='x-pass-123')
    user.groups.add(Group.objects.get_or_create(name=group)[0])
    return user


class MemberMoneyTests(APITestCase):
    def setUp(self):
        self.clerk = _user('clerk@example.com', 'Employee')
        self.manager = _user('manager@example.com', 'Manager')
        self.account = members.create_account(first_name='Ana', phone='4025550101')
        self.url = f'/api/thriftplus/accounts/{self.account.pk}/'

    def test_staff_see_the_money_and_only_managers_adjust_it(self):
        self.client.force_authenticate(self.clerk)
        money = self.client.get(self.url + 'money/').json()
        self.assertEqual((money['credit'], money['banked'], money['available'], money['lots']), ('0.00', '0.00', '0.00', []))
        self.assertNotIn('cover', money)
        self.assertEqual(self.client.post(self.url + 'adjust/', {'kind': 'credit', 'amount': '5', 'note': 'x'}).status_code, 403)
        self.client.force_authenticate(self.manager)
        no_note = self.client.post(self.url + 'adjust/', {'kind': 'credit', 'amount': '5.00', 'note': ''}, format='json')
        self.assertEqual(no_note.status_code, 400)
        done = self.client.post(self.url + 'adjust/', {'kind': 'credit', 'amount': '5.00', 'note': 'Goodwill for a late pickup'}, format='json').json()
        self.assertEqual(done['credit'], '5.00')
        self.assertEqual((done['entries'][0]['reason'], done['entries'][0]['actor']), ('adjust', 'Test User'))
        below = self.client.post(self.url + 'adjust/', {'kind': 'credit', 'amount': '-6.00', 'note': 'oops'}, format='json')
        self.assertEqual(below.status_code, 400)
        self.assertEqual(LedgerEntry.objects.filter(account=self.account).count(), 1)
        bucks = self.client.post(self.url + 'adjust/', {'kind': 'bank', 'amount': '3.00', 'note': 'Goodwill'}, format='json').json()
        self.assertEqual((bucks['banked'], bucks['available'], len(bucks['lots'])), ('3.00', '3.00', 1))  # usable at once
        wrong = self.client.post(self.url + 'adjust/', {'kind': 'cover', 'amount': '3.00', 'note': 'x'}, format='json')
        self.assertEqual(wrong.json()['detail'], 'Adjust Thrift+ credit or ThriftBucks.')

    def test_the_overview_counts_members_and_money_owed(self):
        LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_BANK, amount='4.00', reason='sale')
        LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_CREDIT, amount='2.50', reason='return')
        self.client.force_authenticate(self.clerk)
        self.assertEqual(self.client.get('/api/thriftplus/rewards/overview/').status_code, 403)
        self.client.force_authenticate(self.manager)
        o = self.client.get('/api/thriftplus/rewards/overview/').json()
        self.assertEqual((o['members']['active'], o['owed']['banked'], o['rewards']['collected']), (1, '4.00', '4.00'))
        self.assertEqual((o['owed']['credit'], o['owed']['total'], o['rewards']['expired']), ('2.50', '6.50', '0.00'))
        self.assertNotIn('to_cover', o['rewards'])
        self.assertEqual(sum(d['n'] for d in o['members']['signups']), 1)
        self.assertIsNone(o['scanner']['add_rate'])
