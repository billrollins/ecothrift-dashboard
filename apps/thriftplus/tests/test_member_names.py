"""Names (owner 2026-10-16): one name rule for every way in, First and Last both required to join, never "Customer",
and the cleanup request that fixes old names and deletes old logins whose email was never verified. Mail is mocked."""
from __future__ import annotations

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import MagicLinkToken, User
from apps.accounts.services.names import clean_name, split_full_name
from apps.core.models import AppSetting
from apps.thriftplus.models import Account, LedgerEntry, Person
from apps.thriftplus.services import member_names, members
from apps.thriftplus.tests.test_email_sign_in import BASE, IP, MailMixin


class NameRuleTests(SimpleTestCase):
    def test_the_rule(self):
        cases = {
            ('gabriela vallejo', 'Customer'): ('Gabriela', 'Vallejo'),
            ('Nikki', 'Customer'): ('Nikki', 'Member'),
            ('JANE DOUGH MCCALLAN', 'Customer'): ('Jane', 'Dough McCallan'),
            ('AJ', 'Customer'): ('AJ', 'Member'),
            ('DeShawn', 'van der Berg'): ('DeShawn', 'van der Berg'),
            ('  pat  ', " o'brien-smith "): ('Pat', "O'Brien-Smith"),
            ('Carrie', 'Rollins'): ('Carrie', 'Rollins'),
            ('', ''): ('', ''),
        }
        for given, want in cases.items():
            self.assertEqual(clean_name(*given), want, given)
        self.assertEqual(split_full_name('Pat de la Cruz'), ('Pat', 'de la Cruz'))
        self.assertEqual(split_full_name('Cher'), ('Cher', 'Member'))


@override_settings(ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us', ONLINE_SALES_ACCOUNTS_ENABLED=True,
                   ONLINE_SALES_ENABLED=True)
class JoinNameTests(MailMixin, TestCase):
    def setUp(self):
        self.start_mail()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        Group.objects.get_or_create(name='Customer')
        self.api = APIClient()

    def test_join_needs_a_first_and_a_last_name_and_cleans_them(self):
        r = self.api.post(BASE + 'join/', {'first_name': 'robin', 'last_name': '', 'email': 'r@example.com'},
                          format='json', REMOTE_ADDR=IP)
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NAME_NEEDED'))
        r = self.api.post(BASE + 'join/', {'first_name': 'robin', 'last_name': 'Customer', 'email': 'r@example.com'},
                          format='json', REMOTE_ADDR=IP)
        self.assertEqual(r.status_code, 400)
        r = self.api.post(BASE + 'join/', {'first_name': ' robin ', 'last_name': 'LEE', 'email': 'r@example.com'},
                          format='json', REMOTE_ADDR=IP)
        self.assertEqual(r.status_code, 200, r.content)
        person = Person.objects.get(email='r@example.com')
        self.assertEqual((person.first_name, person.last_name), ('Robin', 'Lee'))

    def test_an_older_app_sends_one_name_box_and_one_word_is_not_enough(self):
        r = self.api.post(BASE + 'join/', {'name': 'Cher', 'email': 'c@example.com'}, format='json', REMOTE_ADDR=IP)
        self.assertEqual(r.status_code, 400)
        r = self.api.post(BASE + 'join/', {'name': 'Ana Diaz', 'email': 'a@example.com'}, format='json', REMOTE_ADDR=IP)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Person.objects.get(email='a@example.com').last_name, 'Diaz')

    def test_a_website_login_is_never_named_customer(self):
        row = MagicLinkToken.objects.create(email='new@example.com', purpose=MagicLinkToken.PURPOSE_SIGN_IN,
                                            expires_at='2099-01-01T00:00Z')
        self.api.post('/api/auth/magic-link/consume/', {'token': row.token}, format='json')
        user = User.objects.get(email='new@example.com')
        self.assertNotEqual(user.last_name, 'Customer')
        self.assertNotEqual(user.first_name, 'new')  # never the email's first part as a name
        # No name: no membership (a member needs a verified email AND a name); they join at ecothrift.us/join.
        self.assertFalse(Person.objects.filter(email='new@example.com').exists())


class CleanupTests(TestCase):
    def _old_login(self, email, first, last='Customer', *, verified=True, member=True, status=Account.STATUS_PENDING):
        Group.objects.get_or_create(name='Customer')
        user = User.objects.create_user(email=email, first_name=first, last_name=last)
        user.groups.add(Group.objects.get(name='Customer'))
        if member:
            account = Account.objects.create(status=status)
            Person.objects.create(account=account, role=Person.ROLE_PRIMARY, first_name=first, last_name=last,
                                  email=email, user=user, email_verified_at=timezone.now() if verified else None)
        return user

    def test_plan_then_apply(self):
        self._old_login('gv@example.com', 'gabriela vallejo')
        self._old_login('nikki@example.com', 'Nikki')
        self._old_login('gone@example.com', 'Tiffany', verified=False)
        carrie = self._old_login('carrie@example.com', 'Carrie', verified=False, status=Account.STATUS_ACTIVE)
        Person.objects.filter(user=carrie).update(last_name='Rollins')

        p = member_names.plan()
        self.assertEqual((p['delete_logins'], p['delete_memberships']), (1, 1))
        self.assertEqual(p['delete_list'], ['Tiffany Customer'])
        self.assertIn('member: gabriela vallejo Customer -> Gabriela Vallejo', p['rename_list'])
        self.assertIn('login: Carrie Customer -> Carrie Rollins', p['rename_list'])
        self.assertTrue(User.objects.filter(email='gone@example.com').exists())  # the plan changes nothing

        member_names.apply()
        self.assertFalse(User.objects.filter(email='gone@example.com').exists())
        self.assertFalse(Person.objects.filter(email='gone@example.com').exists())
        gv = Person.objects.get(email='gv@example.com')
        self.assertEqual((gv.first_name, gv.last_name, gv.user.first_name, gv.user.last_name),
                         ('Gabriela', 'Vallejo', 'Gabriela', 'Vallejo'))
        self.assertEqual(Person.objects.get(email='nikki@example.com').last_name, 'Member')
        carrie.refresh_from_db()
        self.assertEqual((carrie.first_name, carrie.last_name), ('Carrie', 'Rollins'))  # active: kept, login renamed
        self.assertFalse(Person.objects.filter(last_name='Customer').exists())
        self.assertFalse(User.objects.filter(last_name='Customer').exists())
        again = member_names.plan()  # safe to run again: nothing left
        self.assertEqual((again['delete_logins'], again['rename']), (0, 0))

    def test_a_member_with_thriftbucks_history_is_never_deleted(self):
        user = self._old_login('kept@example.com', 'Kim', verified=False)
        account = Person.objects.get(user=user).account
        LedgerEntry.objects.create(account=account, kind=LedgerEntry.KIND_BANK, amount='1.00', reason='adjust')
        self.assertEqual(member_names.plan()['delete_logins'], 0)
