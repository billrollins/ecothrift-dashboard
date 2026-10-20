"""Delete a Thrift+ customer for good (owner 2026-10-16, testing only), Deactivate and Reactivate (the normal way), and
the staff wipe ("wipe, keep auto-make")."""
from __future__ import annotations

from decimal import Decimal as D

from django.contrib.auth.models import Group

from apps.accounts.models import User
from apps.pos.models import Cart, Drawer
from apps.texting.models import EmailConsent
from apps.thriftplus.models import (
    Account,
    Card,
    CartMember,
    Event,
    LedgerEntry,
    MemberLogin,
    MemberSession,
    Person,
    ScanSignal,
)
from apps.thriftplus.services import delete_member, members, staff_members
from apps.thriftplus.services.members import MemberError
from apps.thriftplus.tests.test_register import RegisterBase

API = '/api/thriftplus/accounts/'


class DeleteTests(RegisterBase):
    def setUp(self):
        super().setUp()
        self.boss = User.objects.create_superuser('boss@example.com', 'Bo', 'Boss', password='x-pass-123')
        Person.objects.filter(account=self.account).update(last_name='Tester', email='ana@example.com')
        self.cart = self._cart()
        self._attach(self.cart['id'])
        self.assertEqual(self._complete(self.cart['id']).status_code, 200)
        ScanSignal.objects.create(kind='scan', item=self.vase, account=self.account)
        person = self.account.people.get()
        MemberLogin.objects.create(person=person, email='ana@example.com', password='!')
        EmailConsent.objects.create(email='ana@example.com', kind='thriftplus', opted_in=True, how='test',
                                    ref=f'thriftplus.person:{person.pk}')
        self.site = User.objects.create_user('Ana@Example.com', 'Ana', 'Tester', password=None)
        self.site.groups.add(Group.objects.get_or_create(name='Customer')[0])

    def test_the_preview_finds_everything_and_changes_nothing(self):
        self.api.force_authenticate(self.boss)
        r = self.api.get(f'{API}{self.account.pk}/delete-preview/')
        self.assertEqual(r.status_code, 200, r.content)
        p = r.json()
        self.assertEqual((p['name'], p['sales'], p['paid_sales'], p['sales_total']), ('Ana Tester', 1, 1, '85.60'))
        self.assertEqual((p['bucks'], p['scans'], p['passwords'], p['consents']), ('35.00', 1, 1, 1))
        self.assertEqual([u['email'] for u in p['website_logins']], ['Ana@example.com'])
        self.assertTrue(Account.objects.filter(pk=self.account.pk).exists())

    def test_only_a_superuser_may_delete(self):
        self.api.force_authenticate(self.manager)
        self.assertEqual(self.api.get(f'{API}{self.account.pk}/delete-preview/').status_code, 403)
        self.assertEqual(self.api.post(f'{API}{self.account.pk}/delete/', {'name': 'Ana Tester'}).status_code, 403)

    def test_the_name_must_be_typed(self):
        self.api.force_authenticate(self.boss)
        r = self.api.post(f'{API}{self.account.pk}/delete/', {'name': 'Ana'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Ana Tester', r.json()['detail'])
        self.assertTrue(Account.objects.filter(pk=self.account.pk).exists())

    def test_delete_leaves_no_trace_and_undoes_the_sale(self):
        drawer_cash = Drawer.objects.get(pk=self.drawer.pk).cash_sales_total
        self.assertGreater(drawer_cash, 0)
        self.api.force_authenticate(self.boss)
        r = self.api.post(f'{API}{self.account.pk}/delete/', {'name': '  ana   TESTER '}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['items_back'], 1)
        account_id = self.account.pk
        self.assertFalse(Account.objects.filter(pk=account_id).exists())
        self.assertFalse(Person.objects.filter(account_id=account_id).exists())
        self.assertFalse(Cart.objects.filter(pk=self.cart['id']).exists())
        self.assertFalse(CartMember.objects.filter(account_id=account_id).exists())
        self.assertFalse(LedgerEntry.objects.filter(account_id=account_id).exists())
        self.assertFalse(ScanSignal.objects.filter(account_id=account_id).exists())
        self.assertFalse(Event.objects.filter(account_id=account_id).exists())
        self.assertFalse(MemberLogin.objects.exists())
        self.assertFalse(EmailConsent.objects.exists())
        self.assertFalse(Card.objects.filter(code=self.codes[0]).exists())
        self.assertFalse(User.objects.filter(pk=self.site.pk).exists())  # the website login with the same email
        self.lamp.refresh_from_db()
        self.assertEqual((self.lamp.status, self.lamp.sold_at), ('on_shelf', None))
        self.assertEqual(Drawer.objects.get(pk=self.drawer.pk).cash_sales_total, drawer_cash - D('85.60'))
        self.assertTrue(User.objects.filter(pk=self.clerk.pk).exists())  # the cashier stays

    def test_a_staff_login_is_never_deleted(self):
        self.site.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.site.is_staff = True
        self.site.save()
        delete_member.delete(self.account, typed_name='Ana Tester', actor=self.boss)
        self.assertTrue(User.objects.filter(pk=self.site.pk).exists())


class DeactivateTests(RegisterBase):
    def test_deactivate_turns_it_off_and_reactivate_puts_it_back(self):
        person = self.account.people.get()
        MemberSession.objects.create(token_hash='h' * 64, person=person, kind='email', expires_at='2099-01-01T00:00Z')
        self.api.force_authenticate(self.manager)
        r = self.api.post(f'{API}{self.account.pk}/deactivate/', {'reason': 'Moved away'}, format='json')
        self.assertEqual((r.status_code, r.json()['status']), (200, 'inactive'))
        self.assertIsNotNone(MemberSession.objects.get().revoked_at)  # signed out everywhere
        person.refresh_from_db()
        with self.assertRaises(MemberError):
            members.issue_card(person, self.codes[2])
        r = self.api.post(f'{API}{self.account.pk}/reactivate/')
        self.assertEqual((r.status_code, r.json()['status']), (200, 'active'))

    def test_a_pending_join_comes_back_pending(self):
        self.account.status = Account.STATUS_PENDING
        self.account.save()
        members.deactivate(self.account)
        self.assertEqual(members.reactivate(self.account).status, Account.STATUS_PENDING)

    def test_a_clerk_cannot_deactivate(self):
        self.assertEqual(self.api.post(f'{API}{self.account.pk}/deactivate/').status_code, 403)


class StaffWipeTests(RegisterBase):
    def test_wipe_deletes_staff_memberships_and_makes_fresh_ones(self):
        boss = User.objects.create_superuser('boss@example.com', 'Bo', 'Boss', password='x-pass-123')
        old = staff_members.ensure_staff_membership(self.clerk)
        LedgerEntry.objects.create(account=old, kind=LedgerEntry.KIND_BANK, amount=D('5.00'), reason='adjust')
        test_signup = members.create_account(first_name='Pat', phone='4025550199', email='clerk@example.com')
        self.api.force_authenticate(boss)
        preview = self.api.get('/api/thriftplus/staff-memberships/start-fresh/').json()
        self.assertGreaterEqual(preview['memberships'], 2)
        self.assertEqual(self.api.post('/api/thriftplus/staff-memberships/start-fresh/', {'typed': 'nope'},
                                       format='json').status_code, 400)
        r = self.api.post('/api/thriftplus/staff-memberships/start-fresh/', {'typed': 'start fresh'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(Account.objects.filter(pk__in=[old.pk, test_signup.pk]).exists())
        fresh = Account.objects.get(staff_user=self.clerk)
        self.assertFalse(LedgerEntry.objects.filter(account=fresh).exists())
        self.assertTrue(User.objects.filter(pk=self.clerk.pk, is_active=True).exists())
        self.assertTrue(Account.objects.filter(pk=self.account.pk).exists())  # a real customer is untouched
