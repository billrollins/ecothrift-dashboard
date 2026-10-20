"""One customer system (standards T62, 2026-10-20): ``CustomerProfile`` is retired. A customer is a website login in the
Customer group plus its Thrift+ person. Nothing reads or writes the old record; its data was carried over by
``thriftplus.0026_carry_customer_profiles``."""
import importlib
from datetime import date

from django.apps import apps as django_apps
from django.contrib.auth.models import Group
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CustomerProfile, MagicLinkToken, User
from apps.accounts.services import magic_link
from apps.pos.serializers import CartSerializer
from apps.thriftplus.models import Account, Card, Event, Person

MIGRATION = importlib.import_module('apps.thriftplus.migrations.0026_carry_customer_profiles')


def _customer(email='ada@example.com', first='Ada', last='Shopper', **extra):
    user = User.objects.create_user(email=email, first_name=first, last_name=last, password=None, **extra)
    user.groups.add(Group.objects.get_or_create(name='Customer')[0])
    return user


@override_settings(ONLINE_SALES_ACCOUNTS_ENABLED=True, ONLINE_SALES_ENABLED=True,
                   EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class NothingWritesTheOldRecordTests(TestCase):
    def setUp(self):
        self.api = APIClient()

    def _sign_in(self, email, **kwargs):
        row = magic_link.issue_magic_link(email=email, **kwargs)
        return self.api.post('/api/auth/magic-link/consume/', {'token': row.token}, format='json')

    def test_a_link_sign_in_makes_a_login_in_the_customer_group_and_no_customer_record(self):
        r = self._sign_in('new@example.com')
        self.assertEqual(r.status_code, 200, r.content)
        user = User.objects.get(email='new@example.com')
        self.assertTrue(user.groups.filter(name='Customer').exists())
        self.assertFalse(CustomerProfile.objects.exists())
        self.assertNotIn('customer', r.json()['user'])  # /me no longer carries the old record
        # No name yet, so no member; the sign-in itself confirms the email (there are no customer passwords).
        self.assertFalse(Person.objects.exists())
        self.assertTrue(magic_link.customer_email_verified(user))

    def test_a_named_customer_gets_a_pending_member_with_the_email_confirmed(self):
        user = _customer()
        magic_link.stamp_email_verified(user)
        person = Person.objects.get(user=user)
        self.assertEqual(person.account.status, Account.STATUS_PENDING)
        self.assertIsNotNone(person.email_verified_at)
        self.assertTrue(magic_link.customer_email_verified(user))
        self.assertFalse(CustomerProfile.objects.exists())

    def test_confirmed_means_the_persons_email_is_the_logins_email(self):
        user = _customer()
        person = Person.objects.create(account=Account.objects.create(status=Account.STATUS_PENDING), first_name='Ada',
                                       last_name='Shopper', email='old@example.com', user=user,
                                       email_verified_at=timezone.now())
        self.assertFalse(magic_link.customer_email_verified(user))  # a different address was confirmed
        person.email = 'ada@example.com'
        person.save()
        self.assertTrue(magic_link.customer_email_verified(user))

    def test_a_login_with_no_member_is_confirmed_once_it_has_signed_in(self):
        user = _customer(first='', last='')
        self.assertFalse(magic_link.customer_email_verified(user))
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        self.assertTrue(magic_link.customer_email_verified(user))

    def test_staff_are_never_made_customers(self):
        staff = User.objects.create_user(email='sam@ecothrift.us', first_name='Sam', last_name='Staff', password='x-pass-123')
        staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        magic_link.stamp_email_verified(staff)
        self.assertFalse(Person.objects.exists())
        self.assertTrue(magic_link.customer_email_verified(staff))  # a Dash email is trusted

    def test_the_old_customer_row_is_not_what_makes_a_customer(self):
        user = User.objects.create_user(email='x@example.com', first_name='X', last_name='Y', password=None)
        CustomerProfile.objects.create(user=user, customer_number='CUS-777')
        from apps.accounts.services.staff_customer import is_customer

        self.assertFalse(is_customer(user))
        user.groups.add(Group.objects.get_or_create(name='Customer')[0])
        self.assertTrue(is_customer(user))

    def test_the_cart_no_longer_takes_a_customer(self):
        self.assertTrue(CartSerializer().fields['customer'].read_only)

    def test_sign_in_link_action_and_stats_work_without_the_record(self):
        mgr = User.objects.create_user(email='mgr@example.com', first_name='Mo', last_name='M', password='x-pass-123')
        mgr.groups.add(Group.objects.get_or_create(name='Manager')[0])
        user = _customer()
        self.api.force_authenticate(mgr)
        mail.outbox.clear()
        sent = self.api.post(f'/api/accounts/customers/{user.pk}/send-sign-in-link/')
        self.assertEqual(sent.status_code, 200, sent.content)
        self.assertTrue(MagicLinkToken.objects.filter(email='ada@example.com').exists())
        roll = self.api.get(f'/api/accounts/customers/{user.pk}/rollup/')
        self.assertEqual(roll.status_code, 200, roll.content)
        self.assertEqual(roll.json()['holds_total'], 0)


class CarryCustomerProfilesMigrationTests(TestCase):
    """The data migration, run against the real models. Idempotent, deletes nothing."""

    def carry(self):
        MIGRATION.carry(django_apps, None)

    def _profile(self, user, number='CUS-010', verified=True, notes='', since=date(2025, 3, 4)):
        profile = CustomerProfile.objects.create(
            user=user, customer_number=number, notes=notes, email_verified_at=timezone.now() if verified else None)
        CustomerProfile.objects.filter(pk=profile.pk).update(customer_since=since)
        return profile

    def test_a_confirmed_named_customer_becomes_a_pending_member_with_everything_carried(self):
        user = _customer('Ada@Example.com')
        self._profile(user, 'CUS-010', notes='Likes brass lamps')
        user.groups.clear()  # an old record with no group
        self.carry()
        person = Person.objects.get(user=user)
        self.assertEqual((person.first_name, person.last_name, person.email), ('Ada', 'Shopper', 'ada@example.com'))
        self.assertEqual(person.account.status, Account.STATUS_PENDING)
        self.assertIsNotNone(person.email_verified_at)
        self.assertIn('Likes brass lamps', person.account.notes)
        self.assertEqual(person.account.created_at.date(), date(2025, 3, 4))
        self.assertTrue(user.groups.filter(name='Customer').exists())
        self.assertEqual(Event.objects.get(person=person, action='joined_website').detail['customer_number'], 'CUS-010')
        self.assertFalse(Card.objects.filter(person=person).exists())  # the app makes the member code on first use

    def test_an_unconfirmed_customer_makes_no_member(self):
        user = _customer()
        self._profile(user, verified=False, notes='x')
        self.carry()
        self.assertFalse(Person.objects.exists())  # an unconfirmed pending member would be purged in 24 hours
        self.assertTrue(user.groups.filter(name='Customer').exists())

    def test_a_member_with_the_same_email_is_linked_and_given_the_notes_and_the_confirmation(self):
        user = _customer()
        self._profile(user, 'CUS-011', notes='Holds the blue vase')
        account = Account.objects.create(status=Account.STATUS_ACTIVE, notes='Regular')
        person = Person.objects.create(account=account, first_name='Ada', last_name='Shopper', email='ada@example.com')
        self.carry()
        person.refresh_from_db()
        account.refresh_from_db()
        self.assertEqual(person.user_id, user.pk)
        self.assertIsNotNone(person.email_verified_at)
        self.assertEqual(account.notes, 'Regular\nHolds the blue vase')
        self.assertEqual(Account.objects.count(), 1)  # no second membership
        self.assertEqual(Event.objects.get(person=person, action='customer_record_carried').detail['customer_number'],
                         'CUS-011')

    def test_running_it_twice_changes_nothing_and_deletes_nothing(self):
        user = _customer()
        self._profile(user, notes='Once')
        other = _customer('bo@example.com', first='Bo')
        self._profile(other, 'CUS-012', verified=False)
        account = Account.objects.create(status=Account.STATUS_ACTIVE)
        Person.objects.create(account=account, first_name='Bo', last_name='Shopper', email='bo@example.com')
        self.carry()
        snapshot = (Account.objects.count(), Person.objects.count(), Event.objects.count(),
                    sorted(Account.objects.values_list('notes', flat=True)), CustomerProfile.objects.count())
        self.carry()
        self.assertEqual(snapshot, (Account.objects.count(), Person.objects.count(), Event.objects.count(),
                                    sorted(Account.objects.values_list('notes', flat=True)),
                                    CustomerProfile.objects.count()))
        self.assertEqual(CustomerProfile.objects.count(), 2)  # nothing deleted
        self.assertEqual(Account.objects.exclude(pk=account.pk).get().notes.count('Once'), 1)

    def test_a_staff_login_is_skipped_a_nameless_login_has_no_member_and_a_different_email_is_not_confirmed(self):
        staff = User.objects.create_user(email='sam@ecothrift.us', first_name='Sam', last_name='Staff', password='x-pass-123')
        staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self._profile(staff, 'CUS-001')
        nameless = _customer('anon@example.com', first='', last='')
        self._profile(nameless, 'CUS-002')
        moved = _customer('moved@example.com')
        self._profile(moved, 'CUS-003')
        person = Person.objects.create(
            account=Account.objects.create(status=Account.STATUS_ACTIVE), first_name='Ada', last_name='Shopper',
            email='new-address@example.com', user=moved)
        self.carry()
        self.assertFalse(staff.groups.filter(name='Customer').exists())
        self.assertFalse(Person.objects.filter(user=staff).exists())
        self.assertFalse(Person.objects.filter(user=nameless).exists())
        person.refresh_from_db()
        self.assertIsNone(person.email_verified_at)  # that address was never confirmed
        self.assertEqual(CustomerProfile.objects.count(), 3)

    def test_a_staff_membership_is_never_linked_to_a_customer(self):
        staff = User.objects.create_user(email='sam@ecothrift.us', first_name='Sam', last_name='Staff', password='x-pass-123')
        staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        Person.objects.create(account=Account.objects.create(status=Account.STATUS_ACTIVE, staff_user=staff),
                              first_name='Ada', last_name='Shopper', email='ada@example.com')
        user = _customer()
        self._profile(user)
        self.carry()
        made = Person.objects.get(user=user)
        self.assertIsNone(made.account.staff_user_id)
        self.assertEqual(Person.objects.count(), 2)
