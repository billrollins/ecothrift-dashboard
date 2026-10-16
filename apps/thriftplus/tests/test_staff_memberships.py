"""Staff Thrift+ memberships (owner 2026-10-15): every active staff member has their own (made with the staff login, or
by the owner's "Create missing staff memberships"), their Dash email signs in to it, and a customer membership they
made before merges into it. The mail send is mocked: nothing real is ever sent."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.inventory.models import Item, Product
from apps.thriftplus.models import (
    Account,
    AppCart,
    AppCartLine,
    Card,
    Event,
    LedgerEntry,
    MemberEmailToken,
    MemberLogin,
    MemberSession,
    Person,
    ScanSignal,
)
from apps.thriftplus.services import ledger, member_auth, members, staff_members
from apps.thriftplus.services.overview import overview
from apps.thriftplus.tests.test_email_sign_in import MailMixin

API = '/api/thriftplus/staff-memberships/'
PUBLIC = '/api/thriftplus/public/'


def _user(email, group='Employee', first='Sam', last='Staff', **extra):
    user = User.objects.create_user(email, first, last, password='correct-horse-9', **extra)
    if group:
        user.groups.add(Group.objects.get_or_create(name=group)[0])
    return user


class EnsureTests(TestCase):
    def test_a_staff_member_gets_a_membership_with_their_dash_email_confirmed_and_a_member_code(self):
        sam = _user('Sam.Staff@EcoThrift.us')
        account = staff_members.ensure_staff_membership(sam)
        self.assertEqual((account.staff_user, account.status, account.is_practice), (sam, Account.STATUS_ACTIVE, False))
        person = account.people.get()
        self.assertEqual((person.role, person.first_name, person.last_name, person.email),
                         ('primary', 'Sam', 'Staff', 'sam.staff@ecothrift.us'))
        self.assertIsNotNone(person.email_verified_at)  # a Dash email is trusted
        self.assertTrue(Card.objects.filter(person=person, status=Card.STATUS_ACTIVE).exists())  # their member QR
        self.assertTrue(Event.objects.filter(account=account, action='staff_membership').exists())

    def test_it_is_idempotent(self):
        sam = _user('sam@ecothrift.us')
        first = staff_members.ensure_staff_membership(sam)
        again = staff_members.ensure_staff_membership(sam)
        self.assertEqual(first.pk, again.pk)
        self.assertEqual((Account.objects.count(), Person.objects.count(), Card.objects.count()), (1, 1, 1))

    def test_a_membership_with_the_same_email_is_linked_not_doubled(self):
        bo = _user('bo@ecothrift.us', first='Bo', last='Lee')
        customer = members.create_account(first_name='Bo', last_name='Lee', phone='4025550102', email='BO@ecothrift.us')
        account = staff_members.ensure_staff_membership(bo)
        self.assertEqual(account.pk, customer.pk)
        self.assertEqual(Account.objects.get(pk=customer.pk).staff_user, bo)
        self.assertIsNotNone(account.people.get().email_verified_at)
        self.assertTrue(Event.objects.filter(account=account, action='staff_linked').exists())
        self.assertEqual(Account.objects.count(), 1)

    def test_a_pending_online_join_with_the_staff_email_is_linked_and_made_active(self):
        cy = _user('cy@ecothrift.us', first='Cy', last='Ray')
        pending = Account.objects.create(status=Account.STATUS_PENDING)
        Person.objects.create(account=pending, first_name='Cy', email='cy@ecothrift.us')
        account = staff_members.ensure_staff_membership(cy)
        self.assertEqual((account.pk, account.status), (pending.pk, Account.STATUS_ACTIVE))

    def test_the_staff_email_is_kept_in_step(self):
        sam = _user('sam@ecothrift.us')
        account = staff_members.ensure_staff_membership(sam)
        Person.objects.filter(account=account).update(email='old@example.com', email_verified_at=None)
        sam.email = 'Samuel@EcoThrift.us'
        sam.save()
        staff_members.ensure_staff_membership(sam)
        person = account.people.get()
        self.assertEqual(person.email, 'samuel@ecothrift.us')
        self.assertIsNotNone(person.email_verified_at)
        self.assertEqual(Event.objects.get(action='staff_email').detail, {'to': 's***@ecothrift.us', 'was': 'o***@example.com'})

    def test_never_for_customers_or_former_staff(self):
        shopper = _user('shopper@example.com', group='Customer')
        nobody = _user('nobody@example.com', group=None)
        gone = _user('gone@ecothrift.us')
        gone.is_active = False
        gone.save()
        for user in (shopper, nobody, gone):
            self.assertIsNone(staff_members.ensure_staff_membership(user))
        self.assertFalse(Account.objects.exists())

    def test_a_superuser_is_staff(self):
        owner = User.objects.create_superuser('owner@ecothrift.us', 'Bill', 'Rollins', password='correct-horse-9')
        self.assertEqual(staff_members.ensure_staff_membership(owner).staff_user, owner)


class SignalTests(TestCase):
    """The membership is made after the commit (TestCase never commits, so these run the on-commit callbacks)."""

    def test_a_new_staff_user_gets_a_membership(self):
        with self.captureOnCommitCallbacks(execute=True):
            sam = _user('sam@ecothrift.us')
        account = Account.objects.get(staff_user=sam)
        self.assertEqual(account.people.get().email, 'sam@ecothrift.us')

    def test_a_staff_group_added_later_makes_one(self):
        with self.captureOnCommitCallbacks(execute=True):
            dee = _user('dee@ecothrift.us', group=None)
        self.assertFalse(Account.objects.exists())
        with self.captureOnCommitCallbacks(execute=True):
            dee.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.assertTrue(Account.objects.filter(staff_user=dee).exists())
        with self.captureOnCommitCallbacks(execute=True):
            eve = _user('eve@ecothrift.us', group=None)
            Group.objects.get_or_create(name='Employee')[0].user_set.add(eve)  # the other side of the relation
        self.assertTrue(Account.objects.filter(staff_user=eve).exists())

    def test_not_for_customers(self):
        with self.captureOnCommitCallbacks(execute=True):
            _user('shopper@example.com', group='Customer')
            _user('nobody@example.com', group=None)
        self.assertFalse(Account.objects.exists())

    def test_a_new_dash_email_follows_to_the_membership(self):
        with self.captureOnCommitCallbacks(execute=True):
            sam = _user('sam@ecothrift.us')
        with self.captureOnCommitCallbacks(execute=True):
            sam.email = 'sam.s@ecothrift.us'
            sam.save()
        self.assertEqual(Account.objects.get(staff_user=sam).people.get().email, 'sam.s@ecothrift.us')

    def test_a_failure_never_fails_the_user_save(self):
        with patch.object(staff_members, 'ensure_staff_membership', side_effect=RuntimeError('boom')):
            with self.assertLogs('apps.thriftplus.signals', level='ERROR'):
                with self.captureOnCommitCallbacks(execute=True):
                    sam = _user('sam@ecothrift.us')
        self.assertTrue(User.objects.filter(pk=sam.pk).exists())
        self.assertFalse(Account.objects.exists())


@override_settings(ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us')
class StaffEmailSignInTests(MailMixin, TestCase):
    def setUp(self):
        self.start_mail()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.api = APIClient()
        self.sam = _user('sam@ecothrift.us')

    def test_email_me_a_link_with_a_staff_email_makes_their_membership_and_signs_them_in(self):
        r = self.api.post(PUBLIC + 'session/email/', {'email': 'Sam@EcoThrift.us'}, format='json')
        self.assertEqual((r.status_code, r.json()), (200, {'status': 'sent'}))
        account = Account.objects.get(staff_user=self.sam)
        self.assertEqual(account.status, Account.STATUS_ACTIVE)
        self.assertEqual((self.mail()['subject'], self.mail()['to']), ('Your Thrift+ sign-in link', 'sam@ecothrift.us'))
        self.assertEqual(MemberEmailToken.objects.get().person.account, account)
        signed_in = self.api.post(PUBLIC + 'session/link/', {'token': self.token()}, format='json')
        self.assertEqual(signed_in.status_code, 200, signed_in.content)
        self.assertEqual(signed_in.json()['member']['first_name'], 'Sam')
        self.assertFalse(Account.objects.filter(status=Account.STATUS_PENDING).exists())

    def test_joining_with_a_staff_email_sends_the_sign_in_link_and_makes_no_pending_join(self):
        r = self.api.post(PUBLIC + 'join/', {'name': 'Samuel Someone', 'email': 'sam@ecothrift.us'}, format='json')
        self.assertEqual((r.status_code, r.json()), (200, {'status': 'sent'}))
        self.assertFalse(Account.objects.filter(status=Account.STATUS_PENDING).exists())
        self.assertEqual(Account.objects.count(), 1)
        self.assertEqual(self.mail()['subject'], 'Your Thrift+ sign-in link')
        self.assertEqual(Account.objects.get().people.get().first_name, 'Sam')  # the staff login's name, not the typed one

    def test_a_staff_email_signs_in_to_the_staff_membership_over_a_customer_one_with_that_email(self):
        account = staff_members.ensure_staff_membership(self.sam)
        other = members.create_account(first_name='Sam', phone='4025550177', email='sam@ecothrift.us')
        self.api.post(PUBLIC + 'session/email/', {'email': 'sam@ecothrift.us'}, format='json')
        self.assertEqual(MemberEmailToken.objects.get().person.account_id, account.pk)
        self.assertNotEqual(account.pk, other.pk)


class StaffMembershipsApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_superuser('owner@ecothrift.us', 'Olive', 'Owner', password='correct-horse-9')
        self.manager = _user('boss@ecothrift.us', 'Manager', first='Mia', last='Boss')
        self.clerk = _user('clerk@ecothrift.us', 'Employee', first='Cal', last='Clerk')
        self.bill = _user('bill_rollins@ecothrift.us', 'Admin', first='Bill', last='Rollins', phone='(402) 555-0199')
        self.shopper = _user('shopper@example.com', 'Customer', first='Sue', last='Shopper')
        # Bill's customer membership from before he was staff: another email, a phone, an ID check, money and a login.
        self.source = members.create_account(first_name='Bill', last_name='Rollins', phone='4025550199',
                                             email='bill_rollins.rf@outlook.com', id_checked=True, verified_18=True,
                                             user=self.clerk)
        self.src_person = self.source.people.get()
        self.code = Card.objects.get(person=self.src_person).code
        ledger.record(self.source, LedgerEntry.KIND_BANK, Decimal('5.00'), 'sale')
        ledger.record(self.source, LedgerEntry.KIND_CREDIT, Decimal('2.50'), 'return')
        MemberLogin.objects.create(person=self.src_person, email='bill_rollins.rf@outlook.com', password='x')
        self.token, _ = member_auth.start_session(self.src_person, MemberSession.KIND_EMAIL)
        MemberEmailToken.objects.create(person=self.src_person, purpose='sign_in', email='bill_rollins.rf@outlook.com',
                                        token_hash='t' * 64, code_hash='c' * 64,
                                        expires_at=timezone.now() + timedelta(minutes=15))
        lamp = Item.objects.create(sku='ITMSTAFF1', product=Product.objects.create(title='Brass lamp'),
                                   price=Decimal('20.00'), status='on_shelf')
        AppCartLine.objects.create(cart=AppCart.objects.create(account=self.source), item=lamp)
        ScanSignal.objects.create(kind='scan', item=lamp, account=self.source)
        self.api = APIClient()

    def _as(self, user):
        self.api.force_authenticate(user)
        return self.api

    def test_managers_see_one_row_per_staff_member_with_memberships_that_may_be_theirs(self):
        self.assertEqual(self._as(self.clerk).get(API).status_code, 403)
        body = self._as(self.manager).get(API).json()
        self.assertEqual(body['missing'], 4)
        self.assertFalse(body['can_merge'])
        rows = {r['email']: r for r in body['staff']}
        self.assertEqual(set(rows), {'owner@ecothrift.us', 'boss@ecothrift.us', 'clerk@ecothrift.us',
                                     'bill_rollins@ecothrift.us'})  # never a customer
        bill = rows['bill_rollins@ecothrift.us']
        self.assertIsNone(bill['membership'])
        self.assertEqual(len(bill['suggestions']), 1)
        hint = bill['suggestions'][0]
        self.assertEqual((hint['account_id'], hint['name'], hint['email'], hint['bucks'], hint['credit']),
                         (self.source.pk, 'Bill Rollins', 'b***@outlook.com', '5.00', '2.50'))
        self.assertEqual(hint['why'], ['same phone', 'same name', 'same email name'])
        self.assertEqual(rows['clerk@ecothrift.us']['suggestions'], [])

    def test_the_owner_creates_the_missing_staff_memberships(self):
        self.assertEqual(self._as(self.manager).post(API + 'create-missing/').status_code, 403)
        body = self._as(self.owner).post(API + 'create-missing/').json()
        self.assertEqual((body['made'], body['linked'], body['missing']), (4, 0, 0))
        self.assertTrue(all(r['membership'] for r in body['staff']))
        self.assertFalse(Account.objects.filter(staff_user=self.shopper).exists())
        again = self._as(self.owner).post(API + 'create-missing/').json()
        self.assertEqual((again['made'], again['linked']), (0, 0))
        self.assertEqual(Account.objects.filter(staff_user__isnull=False).count(), 4)

    def test_merge_preview_says_what_will_move(self):
        self.assertEqual(self._as(self.manager).get(API + 'merge-preview/', {'staff_user': self.bill.pk,
                                                                             'source_account': self.source.pk}).status_code, 403)
        p = self._as(self.owner).get(API + 'merge-preview/', {'staff_user': self.bill.pk, 'source_account': self.source.pk}).json()
        self.assertEqual((p['bucks'], p['credit'], p['codes'], p['second_adult'], p['login']), ('5.00', '2.50', 1, None, True))
        self.assertEqual(p['takes'], ['phone', 'ID check', '18+'])
        self.assertEqual(p['moves']['ledger rows'], 2)
        self.assertFalse(Account.objects.filter(staff_user=self.bill).exists())  # nothing changes

    def test_merge_moves_the_customer_membership_into_the_staff_one(self):
        self.assertEqual(self._as(self.manager).post(API + 'merge/', {'staff_user': self.bill.pk,
                                                                      'source_account': self.source.pk}).status_code, 403)
        r = self._as(self.owner).post(API + 'merge/', {'staff_user': self.bill.pk, 'source_account': self.source.pk},
                                      format='json')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        staff = Account.objects.get(staff_user=self.bill)
        self.assertEqual(body['staff_account'], staff.pk)
        # The money moved.
        self.assertEqual((ledger.bucks_total(staff), ledger.credit_balance(staff)), (Decimal('5.00'), Decimal('2.50')))
        self.assertEqual(body['now'], {'bucks': '5.00', 'credit': '2.50'})
        self.assertFalse(LedgerEntry.objects.filter(account=self.source).exists())
        self.assertEqual(body['moved']['ledger rows'], 2)
        # The staff login overwrites: the staff name and email stay, the customer login is gone, its phones signed out.
        target = staff_members.primary_person(staff)
        self.assertEqual((target.first_name, target.email), ('Bill', 'bill_rollins@ecothrift.us'))
        self.assertFalse(MemberLogin.objects.filter(person=self.src_person).exists())
        self.assertIsNone(member_auth.session_for(self.token))
        self.assertFalse(MemberEmailToken.objects.filter(person=self.src_person).exists())
        self.assertEqual((body['login_removed'], body['signed_out'], body['email_links_removed']), (True, 1, 1))
        # The staff person took the phone, the ID check and 18+.
        self.assertEqual((target.phone, target.id_checked, target.verified_18), ('4025550199', True, True))
        self.assertIsNotNone(target.phone_verified_at)
        self.assertEqual(Person.objects.get(pk=self.src_person.pk).phone, '')
        # The member code moved, so the QR in their app still finds them at the register.
        card = members.card_by_code(self.code)
        self.assertEqual((card.person_id, card.status), (target.pk, Card.STATUS_ACTIVE))
        self.assertEqual(body['moved']['member codes'], 1)
        self.assertEqual([p.pk for p in members.people_by_phone('4025550199')], [target.pk])
        # The app cart and scans moved.
        self.assertEqual(AppCartLine.objects.get().cart.account_id, staff.pk)
        self.assertEqual(ScanSignal.objects.get().account_id, staff.pk)
        # The source ends revoked, logged on both, and is not counted as a revoked membership.
        source = Account.objects.get(pk=self.source.pk)
        self.assertEqual((source.status, source.revoked_reason, source.revoked_by),
                         (Account.STATUS_REVOKED, f'Merged into staff membership {staff.pk}', self.owner))
        self.assertTrue(Event.objects.filter(account=staff, action='staff_merged_in').exists())
        self.assertTrue(Event.objects.filter(account=source, action='staff_merged_into').exists())
        self.assertTrue(Event.objects.filter(account=staff, action='signup').exists())  # the history moved too
        self.assertEqual(overview()['members']['revoked'], 0)
        # Done once: merging it again is refused.
        again = self._as(self.owner).post(API + 'merge/', {'staff_user': self.bill.pk, 'source_account': self.source.pk})
        self.assertEqual(again.status_code, 400)

    def test_a_second_adult_moves_over(self):
        dee = members.add_second_adult(self.source, both_present=True, primary_approves=True, first_name='Dee',
                                       phone='4025550111')
        body = staff_members.merge(self.bill, self.source, actor=self.owner)
        staff = Account.objects.get(staff_user=self.bill)
        self.assertEqual(body['second_adult'], 'Dee Member')  # one name gets "Member" (owner 2026-10-16)
        self.assertEqual(Person.objects.get(pk=dee.pk).account_id, staff.pk)
        self.assertTrue(Card.objects.filter(person=dee, status=Card.STATUS_ACTIVE).exists())

    def test_a_second_adult_is_refused_when_the_staff_membership_has_one(self):
        staff = staff_members.ensure_staff_membership(self.bill)
        members.add_second_adult(staff, both_present=True, primary_approves=True, first_name='Ann')
        members.add_second_adult(self.source, both_present=True, primary_approves=True, first_name='Dee')
        r = self._as(self.owner).post(API + 'merge/', {'staff_user': self.bill.pk, 'source_account': self.source.pk})
        self.assertEqual(r.status_code, 400)
        self.assertIn('Both memberships have a second adult', r.json()['detail'])
        self.assertEqual(Account.objects.get(pk=self.source.pk).status, Account.STATUS_ACTIVE)  # nothing changed
        self.assertEqual(LedgerEntry.objects.filter(account=self.source).count(), 2)

    def test_refused_merges(self):
        api = self._as(self.owner)
        practice = members.make_practice_member()
        r = api.post(API + 'merge/', {'staff_user': self.bill.pk, 'source_account': practice.pk})
        self.assertEqual((r.status_code, r.json()['detail']), (400, 'A practice member and a real membership never merge.'))
        own = staff_members.ensure_staff_membership(self.bill)
        r = api.post(API + 'merge/', {'staff_user': self.bill.pk, 'source_account': own.pk})
        self.assertEqual((r.status_code, r.json()['detail']), (400, "That is the staff member's own membership."))
        clerks = staff_members.ensure_staff_membership(self.clerk)
        r = api.post(API + 'merge/', {'staff_user': self.bill.pk, 'source_account': clerks.pk})
        self.assertEqual(r.status_code, 400)
        revoked = members.create_account(first_name='Old', phone='4025550123')
        members.revoke(revoked, reason='tag switching')
        r = api.post(API + 'merge/', {'staff_user': self.bill.pk, 'source_account': revoked.pk})
        self.assertEqual((r.status_code, r.json()['detail']), (400, f'Membership {revoked.pk} is revoked: it does not merge.'))
        r = api.post(API + 'merge/', {'staff_user': self.shopper.pk, 'source_account': self.source.pk})
        self.assertEqual((r.status_code, r.json()['detail']), (400, 'Pick an active staff member.'))
        self.assertEqual(Account.objects.get(pk=self.source.pk).status, Account.STATUS_ACTIVE)
