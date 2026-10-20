"""Merge a customer login into a staff login (owner 2026-10-15: "bill_rollins.rf@outlook ... should merge into the
staff account (the staff login should overwrite the customer one.)"). Superuser only; the staff login survives."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import AccountEvent, CustomerProfile, EmployeeProfile, MagicLinkToken, User
from apps.accounts.services import login_merge
from apps.accounts.services.login_merge import MergeError, merge_customer_login
from apps.accounts.services.magic_link import issue_magic_link
from apps.thriftplus.models import Account, LedgerEntry, MemberLogin
from apps.thriftplus.services import ledger, members, staff_members
from apps.webstore.models import Conversation, Message, Reservation, WebListing

API = '/api/accounts/login-merge/'
PASSWORD = 'correct-horse-9'


def _user(email, group='Employee', first='Sam', last='Staff', **extra):
    user = User.objects.create_user(email, first, last, password=PASSWORD, **extra)
    if group:
        user.groups.add(Group.objects.get_or_create(name=group)[0])
    return user


def _customer(email, first='Bill', last='Rollins', **extra):
    return _user(email, 'Customer', first=first, last=last, **extra)


def _listing():
    return WebListing.objects.create(title='Brass lamp', slug='brass-lamp', price=Decimal('18.00'), on_hand=2,
                                     reserved=0, status='published', return_policy='final_sale')


class LoginMergeTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_superuser('owner@ecothrift.us', 'Olive', 'Owner', password=PASSWORD)
        self.bill = _user('bill_rollins@ecothrift.us', 'Admin', first='Bill', last='Rollins', phone='(402) 555-0199')
        self.outlook = _customer('bill_rollins.rf@outlook.com', phone='402-555-0199')
        self.listing = _listing()
        self.thread = Conversation.objects.create(listing=self.listing, customer=self.outlook, guest_name='Bill',
                                                  guest_email='bill_rollins.rf@outlook.com')
        self.message = Message.objects.create(conversation=self.thread, author_kind='customer',
                                              author_user=self.outlook, body='Is the lamp still here?')
        self.hold = Reservation.objects.create(listing=self.listing, customer_name='Bill R',
                                               email='Bill_Rollins.rf@outlook.com', quantity=1, pickup_code='K7Q2M')

    # ── Suggestions and search ──

    def test_suggestions_find_the_outlook_login_by_email_name_phone_and_name(self):
        _customer('someone@example.com', first='Ann', last='Other', phone='4025550111')
        found = login_merge.suggestions(self.bill)
        self.assertEqual([r['user_id'] for r in found], [self.outlook.pk])
        self.assertEqual(found[0]['why'], ['same email name', 'same phone', 'same name'])
        self.assertNotIn('customer_number', found[0])  # the old customer number is gone (T62)
        # Never a staff login, the staff member themself, or a switched-off login.
        _user('bill_rollins.2@ecothrift.us', 'Employee', first='Bill', last='Rollins')
        gone = _customer('bill_rollins.old@gmail.com')
        gone.is_active = False
        gone.save()
        self.assertEqual([r['user_id'] for r in login_merge.suggestions(self.bill)], [self.outlook.pk])

    def test_search_by_email_name_or_phone(self):
        self.assertEqual([r['user_id'] for r in login_merge.search(self.bill, 'outlook')], [self.outlook.pk])
        self.assertEqual([r['user_id'] for r in login_merge.search(self.bill, 'Bill Rollins')], [self.outlook.pk])
        self.assertEqual([r['user_id'] for r in login_merge.search(self.bill, '5550199')], [self.outlook.pk])
        self.assertEqual(login_merge.search(self.bill, 'owner'), [])  # a superuser never shows

    # ── Preview ──

    def test_preview_says_what_will_move_and_changes_nothing(self):
        p = login_merge.preview(self.outlook, self.bill)
        self.assertEqual(p['source']['email'], 'bill_rollins.rf@outlook.com')
        self.assertNotIn('profile', p)  # the customer record is retired (T62)
        self.assertEqual(p['moves']['conversations'], 1)
        self.assertEqual(p['moves']['messages'], 1)
        self.assertEqual(p['moves']['holds'], 1)
        self.assertEqual(p['source_after'], f'merged-{self.outlook.pk}.bill_rollins.rf@outlook.com')
        self.assertIsNone(p['thriftplus'])
        self.assertTrue(User.objects.get(pk=self.outlook.pk).is_active)
        self.assertEqual(Conversation.objects.get(pk=self.thread.pk).customer_id, self.outlook.pk)

    # ── Merge ──

    def test_the_merge_ends_the_customer_login_and_moves_its_rows(self):
        outstanding = RefreshToken.for_user(self.outlook)
        link = issue_magic_link(email='bill_rollins.rf@outlook.com')
        guest = Conversation.objects.create(listing=self.listing, guest_name='Bill', guest_email='BILL_ROLLINS.rf@outlook.com')
        result = merge_customer_login(self.outlook, self.bill, actor=self.owner)
        # An unclaimed guest thread with the outlook email is claimed by the staff login.
        guest.refresh_from_db()
        self.assertEqual((guest.customer_id, guest.guest_email), (self.bill.pk, 'bill_rollins@ecothrift.us'))
        self.assertEqual(result['moved']['website threads by email'], 1)
        # Owner 2026-10-16: staff are not customers, so the staff login never joins the Customer group.
        self.assertNotIn('profile', result)
        self.assertFalse(self.bill.groups.filter(name='Customer').exists())
        self.assertEqual(User.objects.get(pk=self.bill.pk).role, 'Admin')
        # The conversation and its message moved to the staff login.
        self.assertEqual(Conversation.objects.get(pk=self.thread.pk).customer_id, self.bill.pk)
        self.assertEqual(Message.objects.get(pk=self.message.pk).author_user_id, self.bill.pk)
        self.assertEqual(Conversation.objects.get(pk=self.thread.pk).guest_email, 'bill_rollins@ecothrift.us')
        # The hold now belongs to the staff email, so it shows on their account.
        self.assertEqual(Reservation.objects.get(pk=self.hold.pk).email, 'bill_rollins@ecothrift.us')
        self.assertEqual(result['moved']['holds'], 1)
        self.assertEqual(result['moved']['conversations'], 1)
        # The customer login ends switched off, no password, its email free again; its links and tokens are dead.
        source = User.objects.get(pk=self.outlook.pk)
        self.assertEqual((source.is_active, source.has_usable_password(), source.email),
                         (False, False, f'merged-{self.outlook.pk}.bill_rollins.rf@outlook.com'))
        self.assertFalse(User.objects.filter(email__iexact='bill_rollins.rf@outlook.com').exists())
        self.assertIsNotNone(MagicLinkToken.objects.get(pk=link.pk).used_at)
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=outstanding['jti']).exists())
        # Logged on both; the staff login itself is untouched.
        self.assertTrue(AccountEvent.objects.filter(user=self.bill, kind=AccountEvent.KIND_MERGED_IN).exists())
        self.assertTrue(AccountEvent.objects.filter(user=source, kind=AccountEvent.KIND_MERGED_INTO).exists())
        bill = User.objects.get(pk=self.bill.pk)
        self.assertEqual((bill.email, bill.first_name, bill.is_active), ('bill_rollins@ecothrift.us', 'Bill', True))
        self.assertTrue(bill.check_password(PASSWORD))

    def test_the_website_shows_the_moved_hold_and_thread_to_the_staff_login(self):
        merge_customer_login(self.outlook, self.bill, actor=self.owner)
        api = APIClient()
        api.force_authenticate(User.objects.get(pk=self.bill.pk))
        holds = api.get('/api/webstore/my/holds/')
        self.assertEqual(holds.status_code, 200)
        self.assertEqual(len(holds.json()), 1)
        threads = api.get('/api/webstore/my/conversations/')
        self.assertEqual(threads.status_code, 200)

    def test_the_retired_customer_records_are_left_alone(self):
        """T62: nothing reads or writes CustomerProfile, so a merge neither moves nor deletes its rows."""
        CustomerProfile.objects.create(user=self.bill, customer_number='CUS-010', notes='Staff')
        CustomerProfile.objects.create(user=self.outlook, customer_number='CUS-002', notes='Likes lamps')
        result = merge_customer_login(self.outlook, self.bill, actor=self.owner)
        self.assertNotIn('customer_number', result)
        self.assertEqual(CustomerProfile.objects.get(user=self.bill).notes, 'Staff')
        self.assertEqual(CustomerProfile.objects.get(user=self.outlook).customer_number, 'CUS-002')

    def test_a_thriftplus_membership_with_the_outlook_email_merges_into_the_staff_one(self):
        source = members.create_account(first_name='Bill', last_name='Rollins', phone='4025550199',
                                        email='bill_rollins.rf@outlook.com')
        ledger.record(source, LedgerEntry.KIND_BANK, Decimal('5.00'), 'sale')
        MemberLogin.objects.create(person=source.people.get(), email='bill_rollins.rf@outlook.com', password='x')
        preview = login_merge.preview(self.outlook, self.bill)
        self.assertEqual((preview['thriftplus']['account'], preview['thriftplus']['bucks']), (source.pk, '5.00'))
        result = merge_customer_login(self.outlook, self.bill, actor=self.owner)
        staff = Account.objects.get(staff_user=self.bill)
        self.assertTrue(result['thriftplus']['merged'])
        self.assertEqual(result['thriftplus']['staff_account'], staff.pk)
        self.assertEqual(ledger.bucks_total(staff), Decimal('5.00'))
        self.assertEqual(Account.objects.get(pk=source.pk).status, Account.STATUS_REVOKED)
        self.assertFalse(MemberLogin.objects.filter(email='bill_rollins.rf@outlook.com').exists())
        self.assertEqual(staff_members.primary_person(staff).email, 'bill_rollins@ecothrift.us')

    def test_a_thriftplus_refusal_is_reported_and_the_login_still_merges(self):
        source = members.create_account(first_name='Bill', last_name='Rollins', phone='4025550199',
                                        email='bill_rollins.rf@outlook.com')
        staff = staff_members.ensure_staff_membership(self.bill)
        members.add_second_adult(staff, both_present=True, primary_approves=True, first_name='Ann')
        members.add_second_adult(source, both_present=True, primary_approves=True, first_name='Dee')
        result = merge_customer_login(self.outlook, self.bill, actor=self.owner)
        self.assertFalse(result['thriftplus']['merged'])
        self.assertIn('second adult', result['thriftplus']['note'])
        self.assertEqual(Account.objects.get(pk=source.pk).status, Account.STATUS_ACTIVE)  # left for later
        self.assertFalse(User.objects.get(pk=self.outlook.pk).is_active)  # the login merge still ran

    def test_a_second_adult_with_the_email_is_never_pulled_in(self):
        family = members.create_account(first_name='Jo', last_name='Spouse', phone='4025550100')
        members.add_second_adult(family, both_present=True, primary_approves=True, first_name='Bill',
                                 email='bill_rollins.rf@outlook.com')
        result = merge_customer_login(self.outlook, self.bill, actor=self.owner)
        self.assertFalse(result['thriftplus']['merged'])
        self.assertIn('second adult', result['thriftplus']['note'])
        self.assertEqual(Account.objects.get(pk=family.pk).status, Account.STATUS_ACTIVE)

    def test_refusals_change_nothing(self):
        clerk = _user('clerk@ecothrift.us', 'Employee')
        consignee = _user('con@example.com', 'Consignee')
        shopper = _customer('shopper@example.com', first='Sue', last='Shopper')
        cases = [
            (self.bill, self.bill, 'That is the staff login itself.'),
            (clerk, self.bill, 'clerk@ecothrift.us is a staff login. Only a customer login merges into a staff login.'),
            (consignee, self.bill, 'con@example.com is a staff login. Only a customer login merges into a staff login.'),
            (self.owner, self.bill, 'owner@ecothrift.us is a staff login. Only a customer login merges into a staff login.'),
            (self.outlook, shopper, 'shopper@example.com is not an active staff login.'),
        ]
        for source, staff, message in cases:
            with self.assertRaisesMessage(MergeError, message):
                merge_customer_login(source, staff, actor=self.owner)
        EmployeeProfile.objects.create(user=shopper, employee_number='EMP-900', hire_date=date(2024, 1, 1))
        with self.assertRaisesMessage(MergeError, 'has an employee or consignee record'):
            merge_customer_login(shopper, self.bill, actor=self.owner)
        merge_customer_login(self.outlook, self.bill, actor=self.owner)
        with self.assertRaisesMessage(MergeError, 'is switched off already'):
            merge_customer_login(User.objects.get(pk=self.outlook.pk), self.bill, actor=self.owner)


class LoginMergeApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_superuser('owner@ecothrift.us', 'Olive', 'Owner', password=PASSWORD)
        self.admin = _user('admin@ecothrift.us', 'Admin', first='Ada', last='Admin')
        self.manager = _user('boss@ecothrift.us', 'Manager', first='Mia', last='Boss')
        self.bill = _user('bill_rollins@ecothrift.us', 'Admin', first='Bill', last='Rollins')
        self.outlook = _customer('bill_rollins.rf@outlook.com')
        self.api = APIClient()

    def _as(self, user):
        self.api.force_authenticate(user)
        return self.api

    def test_only_the_owner_may_look_or_merge(self):
        for user in (self.admin, self.manager, self.outlook):
            api = self._as(user)
            self.assertEqual(api.get(API + 'candidates/', {'staff_user': self.bill.pk}).status_code, 403)
            self.assertEqual(api.get(API + 'preview/', {'staff_user': self.bill.pk,
                                                        'source_user': self.outlook.pk}).status_code, 403)
            self.assertEqual(api.post(API + 'merge/', {'staff_user': self.bill.pk, 'source_user': self.outlook.pk},
                                      format='json').status_code, 403)
        self.assertTrue(User.objects.get(pk=self.outlook.pk).is_active)
        self.api.force_authenticate(None)
        self.assertIn(self.api.get(API + 'candidates/', {'staff_user': self.bill.pk}).status_code, (401, 403))

    def test_candidates_preview_and_merge(self):
        api = self._as(self.owner)
        c = api.get(API + 'candidates/', {'staff_user': self.bill.pk, 'q': 'outlook'}).json()
        self.assertEqual([r['user_id'] for r in c['suggestions']], [self.outlook.pk])
        self.assertEqual([r['user_id'] for r in c['results']], [self.outlook.pk])
        p = api.get(API + 'preview/', {'staff_user': self.bill.pk, 'source_user': self.outlook.pk})
        self.assertEqual(p.status_code, 200, p.content)
        r = api.post(API + 'merge/', {'staff_user': self.bill.pk, 'source_user': self.outlook.pk}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['source_email_was'], 'bill_rollins.rf@outlook.com')
        again = api.post(API + 'merge/', {'staff_user': self.bill.pk, 'source_user': self.outlook.pk}, format='json')
        self.assertEqual(again.status_code, 400)

    def test_refused_with_a_reason(self):
        api = self._as(self.owner)
        r = api.get(API + 'preview/', {'staff_user': self.bill.pk, 'source_user': self.manager.pk})
        self.assertEqual(r.status_code, 400)
        self.assertIn('is a staff login', r.json()['detail'])
        r = api.post(API + 'merge/', {'staff_user': self.outlook.pk, 'source_user': self.bill.pk}, format='json')
        self.assertEqual((r.status_code, r.json()['detail']), (400, 'Pick an active staff login.'))


class StaffTabListTests(TestCase):
    """Dash → Thrift+ → Staff: each staff row shows the website customer account and the Thrift+ membership, and
    "Create missing" makes both."""

    def setUp(self):
        self.owner = User.objects.create_superuser('owner@ecothrift.us', 'Olive', 'Owner', password=PASSWORD)
        self.manager = _user('boss@ecothrift.us', 'Manager', first='Mia', last='Boss')
        self.bill = _user('bill_rollins@ecothrift.us', 'Admin', first='Bill', last='Rollins')
        self.outlook = _customer('bill_rollins.rf@outlook.com')
        self.api = APIClient()

    def test_rows_and_create_missing_make_memberships_only(self):
        self.api.force_authenticate(self.manager)
        body = self.api.get('/api/thriftplus/staff-memberships/').json()
        rows = {r['email']: r for r in body['staff']}
        self.assertEqual((body['website_missing'], body['missing'], body['missing_any']), (0, 3, 3))  # staff aren't customers
        self.assertEqual([s['user_id'] for s in rows['bill_rollins@ecothrift.us']['login_suggestions']],
                         [self.outlook.pk])
        self.assertEqual(self.api.post('/api/thriftplus/staff-memberships/create-missing/').status_code, 403)
        self.api.force_authenticate(self.owner)
        done = self.api.post('/api/thriftplus/staff-memberships/create-missing/').json()
        self.assertEqual((done['customers_made'], done['made'], done['missing_any']), (0, 3, 0))
        self.assertTrue(all(r['membership'] for r in done['staff']))
        self.assertFalse(CustomerProfile.objects.exists())  # nothing writes the retired customer record
        self.assertFalse(Account.objects.filter(staff_user=self.outlook).exists())
        self.assertTrue(User.objects.get(pk=self.outlook.pk).is_active)  # the customer is left alone
