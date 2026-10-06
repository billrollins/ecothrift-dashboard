"""T61 (Bill, 2026-10-06; house standard D16): usernames, sign in with username or email, lockout, 8+ passwords,
a Set password link shown with a QR (no email), switch off instead of delete, and the account-event log."""
from django.contrib.auth.models import Group
from django.core.cache import cache
from rest_framework.test import APITestCase

from apps.accounts.models import AccountEvent, User
from apps.accounts.services.usernames import assign_username, make_username


def _staff(first, last, role='Employee', password='Shelf-life-42', **kw):
    user = User.objects.create_user(
        email=f'{first.lower()}.{last.lower()}@example.com', first_name=first, last_name=last, password=password, **kw,
    )
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    assign_username(user)
    return user


class UsernameRuleTests(APITestCase):
    def test_first_name_then_last_initial_then_full_then_a_number(self):
        self.assertEqual(make_username('Carrie', 'Rollins', 'c@x.com', set()), 'carrie')
        self.assertEqual(make_username('Carrie', 'Rollins', 'c@x.com', {'carrie'}), 'carrier')
        self.assertEqual(make_username('Carrie', 'Rollins', 'c@x.com', {'carrie', 'carrier'}), 'carrierollins')
        self.assertEqual(make_username('Carrie', 'Rollins', 'c@x.com', {'carrie', 'carrier', 'carrierollins'}), 'carrie2')
        self.assertEqual(make_username('José', "O'Neil", 'j@x.com', set()), 'jose')
        self.assertEqual(make_username('', '', 'pat.smith@x.com', set()), 'patsmith')

    def test_staff_get_one_and_customers_do_not(self):
        bill = _staff('Bill', 'Rollins', 'Admin')
        other_bill = _staff('Bill', 'Smith')
        shopper = User.objects.create_user(email='shop@example.com', first_name='Ada', last_name='Shopper', password=None)
        shopper.groups.add(Group.objects.get_or_create(name='Customer')[0])
        self.assertEqual((bill.username, other_bill.username, assign_username(shopper)), ('bill', 'bills', None))


class SignInTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.carrie = _staff('Carrie', 'Rollins', 'Manager')

    def login(self, ident, password='Shelf-life-42'):
        return self.client.post('/api/auth/login/', {'login': ident, 'password': password}, format='json')

    def test_username_or_email_and_case_does_not_matter(self):
        for ident in ('carrie', 'Carrie', 'carrie.rollins@example.com'):
            self.assertEqual(self.login(ident).status_code, 200, ident)
        # Older clients still send "email".
        res = self.client.post('/api/auth/login/', {'email': 'carrie', 'password': 'Shelf-life-42'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['user']['username'], 'carrie')

    def test_five_wrong_tries_lock_the_name_for_15_minutes(self):
        for _ in range(5):
            res = self.login('carrie', 'nope-nope-nope')
            self.assertEqual((res.status_code, res.data['detail']), (401, 'Wrong username or password.'))
        res = self.login('carrie')                        # the right password, but locked
        self.assertEqual((res.status_code, res.data['code']), (429, 'LOCKED'))
        self.assertTrue(AccountEvent.objects.filter(user=self.carrie, kind='locked_out').exists())
        cache.clear()                                     # 15 minutes later
        self.assertEqual(self.login('carrie').status_code, 200)

    def test_an_unknown_name_locks_the_same(self):
        for _ in range(5):
            self.login('nobody', 'x' * 10)
        self.assertEqual(self.login('nobody', 'x' * 10).status_code, 429)
        self.assertEqual(self.login('carrie').status_code, 200)

    def test_switched_off_cannot_sign_in(self):
        User.objects.filter(pk=self.carrie.pk).update(is_active=False)
        self.assertEqual(self.login('carrie').status_code, 401)


class AdminTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.boss = _staff('Bill', 'Rollins', 'Admin', is_superuser=True, is_staff=True)
        self.client.force_authenticate(self.boss)

    def test_create_without_a_password_then_a_set_password_link(self):
        _staff('Maria', 'Kilduff')
        res = self.client.post('/api/accounts/users/', {
            'email': 'maria.lopez@example.com', 'first_name': 'Maria', 'last_name': 'Lopez', 'role': 'Employee',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        new = User.objects.get(email='maria.lopez@example.com')
        self.assertEqual((new.username, new.has_usable_password()), ('marial', False))
        self.assertTrue(AccountEvent.objects.filter(user=new, kind='created', actor=self.boss).exists())

        link = self.client.post(f'/api/accounts/users/{new.pk}/set-password-link/').data
        self.assertEqual(link['username'], 'marial')
        token = link['link'].split('token=')[1].split('&')[0]
        self.client.force_authenticate(None)
        weak = self.client.post('/api/auth/reset-password/', {'token': token, 'new_password': '12345678'}, format='json')
        self.assertEqual(weak.status_code, 400)          # all digits
        short = self.client.post('/api/auth/reset-password/', {'token': token, 'new_password': 'Shelf7'}, format='json')
        self.assertEqual(short.status_code, 400)          # under 8
        ok = self.client.post('/api/auth/reset-password/', {'token': token, 'new_password': 'Thrift-floor-9'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
        login = self.client.post('/api/auth/login/', {'login': 'marial', 'password': 'Thrift-floor-9'}, format='json')
        self.assertEqual(login.status_code, 200)
        kinds = set(AccountEvent.objects.filter(user=new).values_list('kind', flat=True))
        self.assertEqual(kinds, {'created', 'password_link', 'password_set'})

    def test_a_typed_password_follows_the_rules(self):
        res = self.client.post('/api/accounts/users/', {
            'email': 'pat@example.com', 'first_name': 'Pat', 'last_name': 'Lee', 'role': 'Employee', 'password': 'short',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_delete_switches_off_and_the_owner_cannot_be(self):
        maria = _staff('Maria', 'Kilduff')
        res = self.client.delete(f'/api/accounts/users/{maria.pk}/')
        self.assertEqual(res.status_code, 200)
        maria.refresh_from_db()
        self.assertFalse(maria.is_active)
        self.assertTrue(AccountEvent.objects.filter(user=maria, kind='switched_off').exists())
        self.assertEqual(self.client.delete(f'/api/accounts/users/{self.boss.pk}/').status_code, 400)
        self.assertEqual(self.client.post(f'/api/accounts/users/{maria.pk}/set-password-link/').status_code, 400)

    def test_username_edit_is_checked_and_logged(self):
        maria = _staff('Maria', 'Kilduff')
        res = self.client.patch(f'/api/accounts/users/{maria.pk}/', {'username': 'Bill'}, format='json')
        self.assertEqual(res.status_code, 400)            # taken
        res = self.client.patch(f'/api/accounts/users/{maria.pk}/', {'username': 'Mia'}, format='json')
        self.assertEqual((res.status_code, res.data['username']), (200, 'mia'))
        events = self.client.get(f'/api/accounts/users/{maria.pk}/events/').data
        self.assertEqual((events[0]['kind'], events[0]['detail']), ('username_changed', 'maria → mia'))

    def test_only_admins_issue_links(self):
        maria = _staff('Maria', 'Kilduff')
        self.client.force_authenticate(maria)
        self.assertEqual(self.client.post(f'/api/accounts/users/{self.boss.pk}/set-password-link/').status_code, 403)


class ChangePasswordTests(APITestCase):
    def test_eight_or_more_and_logged(self):
        maria = _staff('Maria', 'Kilduff')
        self.client.force_authenticate(maria)
        bad = self.client.post('/api/auth/change-password/', {'old_password': 'Shelf-life-42', 'new_password': 'abc123'}, format='json')
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post('/api/auth/change-password/', {'old_password': 'Shelf-life-42', 'new_password': 'Back-room-77'}, format='json')
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(AccountEvent.objects.filter(user=maria, kind='password_changed').exists())
