"""One customer account (owner 2026-10-16): a Thrift+ person and their ecothrift.us login are one account. An emailed
sign-in on either side signs in to both, signing out of either ends both, a website-only customer gets a pending
membership, and the one-account request links what exists and removes every customer password. Mail is mocked."""
from __future__ import annotations

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CustomerProfile, MagicLinkToken, User
from apps.core.models import AppSetting
from apps.thriftplus.models import Account, MemberLogin, MemberSession, Person
from apps.thriftplus.services import member_auth, member_list, members, one_account
from apps.thriftplus.tests.test_email_sign_in import BASE, IP, MailMixin


@override_settings(ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us', ONLINE_SALES_ACCOUNTS_ENABLED=True,
                   ONLINE_SALES_ENABLED=True)
class OneAccountTests(MailMixin, TestCase):
    def setUp(self):
        self.start_mail()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        Group.objects.get_or_create(name='Customer')
        self.api = APIClient()

    def _website_customer(self, email='shop@example.com', password=None):
        user = User.objects.create_user(email=email, first_name='Shop', last_name='Per', password=password)
        user.groups.add(Group.objects.get(name='Customer'))
        return user

    def test_an_app_sign_in_also_signs_in_to_the_website_with_the_same_account(self):
        self.api.post(BASE + 'join/', {'name': 'Ana Diaz', 'email': 'ana@example.com'}, format='json', REMOTE_ADDR=IP)
        r = self.api.post(BASE + 'session/code/', {'email': 'ana@example.com', 'code': self.code()}, format='json',
                          REMOTE_ADDR=IP)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn(member_auth.COOKIE, r.cookies)
        self.assertIn('refresh_token', r.cookies)  # ecothrift.us is signed in too
        person = Person.objects.get(email='ana@example.com')
        self.assertEqual(person.user.email, 'ana@example.com')
        self.assertFalse(person.user.has_usable_password())
        me = self.api.post('/api/auth/refresh/')
        self.assertEqual(me.status_code, 200, me.content)

    def test_a_website_sign_in_also_signs_in_to_the_app_and_makes_a_pending_membership(self):
        user = self._website_customer()
        row = MagicLinkToken.objects.create(email='shop@example.com', purpose=MagicLinkToken.PURPOSE_SIGN_IN,
                                            expires_at='2099-01-01T00:00Z')
        r = self.api.post('/api/auth/magic-link/consume/', {'token': row.token}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn(member_auth.COOKIE, r.cookies)
        person = Person.objects.get(user=user)
        self.assertEqual((person.account.status, person.email), (Account.STATUS_PENDING, 'shop@example.com'))
        self.assertEqual(self.api.get(BASE + 'session/').json()['status'], 'member')

    def test_a_website_sign_in_joins_the_member_with_the_same_email(self):
        account = members.create_account(first_name='Bo', last_name='Lee', phone='4025550102', email='bo@example.com')
        user = self._website_customer('Bo@Example.com')
        self.assertEqual(one_account.person_for_user(user).account, account)
        self.assertEqual(Account.objects.count(), 1)

    def test_signing_out_of_either_side_ends_both(self):
        user = self._website_customer()
        row = MagicLinkToken.objects.create(email='shop@example.com', purpose=MagicLinkToken.PURPOSE_SIGN_IN,
                                            expires_at='2099-01-01T00:00Z')
        self.api.post('/api/auth/magic-link/consume/', {'token': row.token}, format='json')
        self.api.post('/api/auth/logout/')
        self.assertIsNotNone(MemberSession.objects.get(person__user=user).revoked_at)
        self.assertEqual(self.api.get(BASE + 'session/').json()['status'], 'signed_out')

    def test_a_deactivated_member_cannot_sign_in_on_the_website_either(self):
        user = self._website_customer()
        person = one_account.person_for_user(user)
        members.deactivate(person.account)
        row = MagicLinkToken.objects.create(email='shop@example.com', purpose=MagicLinkToken.PURPOSE_SIGN_IN,
                                            expires_at='2099-01-01T00:00Z')
        r = self.api.post('/api/auth/magic-link/consume/', {'token': row.token}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (403, 'ACCOUNT_OFF'))

    def test_a_staff_login_never_gets_a_website_session_from_the_app(self):
        staff = User.objects.create_user(email='sam@ecothrift.us', first_name='Sam', last_name='Staff', password='staff-pass-9')
        staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.api.post(BASE + 'session/email/', {'email': 'sam@ecothrift.us'}, format='json', REMOTE_ADDR=IP)
        r = self.api.post(BASE + 'session/code/', {'email': 'sam@ecothrift.us', 'code': self.code()}, format='json',
                          REMOTE_ADDR=IP)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertNotIn('refresh_token', r.cookies)
        self.assertTrue(User.objects.get(pk=staff.pk).check_password('staff-pass-9'))

    def test_the_legacy_cleanup_makes_old_customers_members_and_removes_passwords_and_staff_group_links(self):
        shopper = self._website_customer('shop@example.com', password='old-secret-1')
        account = members.create_account(first_name='Ana', phone='4025550101', email='ana@example.com')
        MemberLogin.objects.create(person=account.people.get(), email='ana@example.com', password=make_password('x-pass-1'))
        boss = User.objects.create_user(email='boss@ecothrift.us', first_name='Bo', last_name='Ss', password='staff-pass-9')
        boss.groups.add(Group.objects.get_or_create(name='Manager')[0], Group.objects.get(name='Customer'))
        CustomerProfile.objects.create(user=boss, customer_number='CUS-038')  # retired record: left alone (T62)
        system = User.objects.create_user(email='bot@system.local', first_name='System', last_name='Bot', password=None)
        plan = one_account.plan()
        self.assertEqual((plan['make_memberships'], plan['customer_passwords'], plan['app_passwords'], plan['staff_in_group']),
                         (1, 1, 1, 1))
        counts = one_account.apply()
        self.assertEqual((counts['made'], counts['passwords_removed'], counts['app_passwords_removed'],
                          counts['staff_out_of_group']), (1, 1, 1, 1))
        shopper.refresh_from_db()
        self.assertFalse(shopper.has_usable_password())
        person = Person.objects.get(user=shopper)
        self.assertEqual(member_list.stage(person.account, person), 'needs_finalize')  # never purged
        self.assertFalse(MemberLogin.objects.exists())
        boss.refresh_from_db()
        self.assertTrue(boss.check_password('staff-pass-9'))  # staff keep their password
        self.assertTrue(CustomerProfile.objects.filter(user=boss).exists())  # never deleted: a later release drops the table
        self.assertFalse(boss.groups.filter(name='Customer').exists())
        self.assertEqual(one_account.apply()['passwords_removed'], 0)  # safe to run again
        self.assertFalse(Person.objects.filter(user=system).exists())  # a system login is never a customer


@override_settings(ONLINE_SALES_ACCOUNTS_ENABLED=True, ONLINE_SALES_ENABLED=True)
class MembersTabTests(TestCase):
    """Dash -> Users -> Members (owner 2026-10-16): three stages (Unconfirmed hidden, Needs Finalize, Member) and Off,
    newest first, rich facts, the drawer's actions, and Delete for the superuser."""

    API = '/api/thriftplus/member-directory/'

    def setUp(self):
        from decimal import Decimal

        from apps.thriftplus.models import LedgerEntry

        Group.objects.get_or_create(name='Customer')
        self.boss = User.objects.create_superuser('boss@example.com', 'Bo', 'Boss', password='x-pass-123')
        self.api = APIClient()
        self.api.force_authenticate(self.boss)
        self.member = members.create_account(first_name='Ana', last_name='Per', phone='4025550101', email='ana@example.com')
        LedgerEntry.objects.create(account=self.member, kind=LedgerEntry.KIND_BANK, amount=Decimal('1250.00'), reason='sale')
        self.waiting = Account.objects.create(status=Account.STATUS_PENDING)
        Person.objects.create(account=self.waiting, first_name='Pat', last_name='New', email='pat@example.com',
                              email_verified_at=timezone.now())
        self.unconfirmed = Account.objects.create(status=Account.STATUS_PENDING)
        Person.objects.create(account=self.unconfirmed, first_name='Una', last_name='Clicked', email='una@example.com')
        self.old = User.objects.create_user(email='old@example.com', first_name='Old', last_name='Hold', password=None)
        self.old.groups.add(Group.objects.get(name='Customer'))

    def test_a_row_carries_the_main_members_qr_and_whether_a_person_can_be_added(self):
        from apps.thriftplus.models import Card

        code = Card.objects.filter(person__account=self.member, status=Card.STATUS_ACTIVE).values_list('code', flat=True).first()
        ana = next(r for r in self.api.get(self.API).json()['results'] if r['name'] == 'Ana Per')
        self.assertEqual((ana['qr'], ana['code_display'].replace(' ', ''), ana['can_add_person']), (f'TP{code}', code, True))
        # Add a person (owner 2026-10-16): a name, the ID and a photo; phone and email stay the main member's.
        self.boss.groups.add(Group.objects.get_or_create(name='Admin')[0])  # the owner is staff too
        r = self.api.post(f'/api/thriftplus/accounts/{self.member.pk}/second-adult/',
                          {'first_name': 'Sam', 'last_name': 'Per', 'id_checked': 'true', 'verified_18': 'true',
                           'both_present': 'true', 'primary_approves': 'true'}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        sam = Person.objects.get(account=self.member, first_name='Sam')
        self.assertEqual((sam.role, sam.phone, sam.email, sam.id_checked), (Person.ROLE_SECONDARY, '', '', True))
        ana = next(r for r in self.api.get(self.API).json()['results'] if r['name'] == 'Ana Per')
        self.assertEqual((ana['second'], ana['can_add_person']), ('Sam Per', False))
        pat = next(r for r in self.api.get(self.API).json()['results'] if r['name'] == 'Pat New')
        self.assertFalse(pat['can_add_person'])  # pending: finish first

    def test_the_list_shows_stages_newest_first_and_hides_unconfirmed_sign_ups(self):
        rows = self.api.get(self.API).json()['results']
        self.assertEqual([(r['name'], r['stage']) for r in rows],
                         [('Old Hold', 'needs_finalize'), ('Pat New', 'needs_finalize'), ('Ana Per', 'member')])
        ana = rows[2]
        self.assertEqual((ana['bucks'], ana['bucks_lifetime'], ana['returns']), ('1250.00', '1250.00', 0))
        # Member # is the 12-digit member code (owner 2026-10-16), not the membership's database id.
        self.assertRegex(ana['number'], r'^\d{4} \d{4} \d{4}$')
        self.assertEqual(ana['number'], ana['code_display'])
        # The avatar circles (owner 2026-10-16): the people, main member first, each with a photo or none.
        self.assertEqual([p['role'] for p in ana['people']], ['primary'])
        self.assertIsNone(ana['photo_url'])
        self.assertTrue(rows[0]['legacy'])

    def test_deactivate_is_off_and_reactivate_puts_it_back(self):
        key = f'a{self.member.pk}'
        self.assertEqual(self.api.post(f'{self.API}{key}/deactivate/').json()['stage'], 'off')
        self.assertEqual(self.api.post(f'{self.API}{key}/reactivate/').json()['stage'], 'member')

    def test_the_profile_edits_from_the_drawer(self):
        r = self.api.patch(f'{self.API}a{self.member.pk}/', {'phone': '(402) 555-0199', 'notes': 'Prefers text'}, format='json')
        self.assertEqual((r.status_code, r.json()['phone'], r.json()['notes']), (200, '4025550199', 'Prefers text'))

    def test_delete_needs_the_superuser_and_the_full_name(self):
        manager = User.objects.create_user(email='m@example.com', first_name='M', last_name='Gr', password='x-pass-123')
        manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        other = APIClient()
        other.force_authenticate(manager)
        key = f'a{self.member.pk}'
        self.assertEqual(other.get(f'{self.API}{key}/delete-preview/').status_code, 403)
        self.assertEqual(self.api.get(f'{self.API}{key}/delete-preview/').json()['name'], 'Ana Per')
        self.assertEqual(self.api.post(f'{self.API}{key}/delete/', {'name': 'Ana'}, format='json').status_code, 400)
        self.assertEqual(self.api.post(f'{self.API}{key}/delete/', {'name': 'ana per'}, format='json').status_code, 200)
        self.assertFalse(Account.objects.filter(pk=self.member.pk).exists())
        r = self.api.post(f'{self.API}c{self.old.pk}/delete/', {'name': 'Old Hold'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(User.objects.filter(pk=self.old.pk).exists())

    def test_unconfirmed_sign_ups_go_after_24_hours_and_nothing_else_does(self):
        from datetime import timedelta

        Account.objects.filter(pk__in=[self.unconfirmed.pk, self.waiting.pk]).update(
            created_at=timezone.now() - timedelta(hours=25))
        same_email = User.objects.create_user(email='una@example.com', first_name='Una', last_name='C', password=None)
        self.assertEqual(member_list.purge_unconfirmed(dry_run=True), 1)
        self.assertEqual(member_list.purge_unconfirmed(), 1)
        self.assertFalse(Account.objects.filter(pk=self.unconfirmed.pk).exists())
        self.assertTrue(Account.objects.filter(pk=self.waiting.pk).exists())  # email confirmed: stays
        self.assertTrue(User.objects.filter(pk=same_email.pk).exists())  # a website login with that email stays

    def test_finalizing_at_a_register_confirms_the_email(self):
        from apps.thriftplus.services import register

        person = self.unconfirmed.people.get()
        register.finish_join(person.pk, phone='4025550177', id_checked=True, verified_18=True, user=self.boss,
                             require_signature=False)
        person.refresh_from_db()
        self.assertIsNotNone(person.email_verified_at)
        self.assertEqual(member_list.stage(person.account, person), 'member')
