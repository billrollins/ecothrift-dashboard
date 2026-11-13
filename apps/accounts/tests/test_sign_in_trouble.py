"""Cannot sign in (Dash Update #121): Ray was locked out twice and Bill did not know where he went. The list says what
happened and when; the owner unlocks; managers send the reset link; a new password ends the lockout."""
from django.contrib.auth.models import Group
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import AccountEvent, MagicLinkToken, User
from apps.accounts.services import sign_in_trouble
from apps.accounts.services.staff_password import issue_staff_reset
from apps.accounts.services.usernames import assign_username

MAIL = dict(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
            DEFAULT_FROM_EMAIL='Eco-Thrift <retail@ecothrift.us>', STAFF_DASHBOARD_HOST='dash.ecothrift.us')


def _staff(first, last, role='Employee', password='Shelf-life-42', **kw):
    user = User.objects.create_user(email=f'{first.lower()}.{last.lower()}@example.com', first_name=first,
                                    last_name=last, password=password, **kw)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    assign_username(user)
    return user


@override_settings(**MAIL)
class SignInTroubleTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.owner = _staff('Bill', 'Rollins', 'Admin', is_superuser=True, is_staff=True)
        self.manager = _staff('Maria', 'Garza', 'Manager', phone='4025550111')
        self.ray = _staff('Ray', 'Phillip', phone='4025550123')

    def lock(self, ident='ray'):
        for _ in range(5):
            self.client.post('/api/auth/login/', {'login': ident, 'password': 'wrong-wrong'}, format='json')

    def login(self, ident='ray', password='Shelf-life-42'):
        return self.client.post('/api/auth/login/', {'login': ident, 'password': password}, format='json')

    def test_the_list_says_what_happened_in_plain_words(self):
        self.lock()
        self.client.force_authenticate(self.owner)
        body = self.client.get('/api/accounts/sign-in-trouble/').json()
        self.assertEqual((body['locked_today'], body['locked_now']), (1, 1))
        row = body['rows'][0]
        self.assertEqual((row['name'], row['state'], row['can_unlock'], row['can_link']),
                         ('Ray Phillip', 'locked', True, True))
        self.assertIn('Locked out at', row['headline'])
        self.assertIn('after 5 wrong passwords', row['headline'])
        self.assertIn('Still locked', row['summary'])
        stats = self.client.get('/api/accounts/users/stats/').json()
        self.assertEqual(stats['locked_out_today'], 1)

    def test_owner_unlocks_and_he_signs_in(self):
        self.lock()
        self.client.force_authenticate(self.owner)
        res = self.client.post(f'/api/accounts/sign-in-trouble/{self.ray.pk}/unlock/')
        self.assertEqual((res.status_code, res.json()['was_locked']), (200, True))
        self.assertTrue(AccountEvent.objects.filter(user=self.ray, kind='unlocked', actor=self.owner).exists())
        self.client.force_authenticate(None)
        self.assertEqual(self.login().status_code, 200)
        self.client.force_authenticate(self.owner)
        row = self.client.get('/api/accounts/sign-in-trouble/').json()['rows'][0]
        self.assertEqual(row['state'], 'was_locked')
        self.assertIn('Unlocked by Bill', row['summary'])
        self.assertIn('Signed in again', row['summary'])

    def test_a_new_password_ends_the_lockout(self):
        self.lock('ray.phillip@example.com')
        token = issue_staff_reset(user=self.ray).token
        res = self.client.post('/api/auth/reset-password/', {'token': token, 'new_password': 'Brand-new-42'},
                               format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.login('ray', 'Brand-new-42').status_code, 200)

    def test_manager_sees_and_sends_but_does_not_unlock(self):
        self.lock()
        self.client.force_authenticate(self.manager)
        row = self.client.get('/api/accounts/sign-in-trouble/').json()['rows'][0]
        self.assertEqual((row['can_unlock'], row['can_link']), (False, True))
        self.assertEqual(self.client.post(f'/api/accounts/sign-in-trouble/{self.ray.pk}/unlock/').status_code, 403)
        res = self.client.post(f'/api/accounts/sign-in-trouble/{self.ray.pk}/email-link/')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(len(mail.outbox), 1)
        self.assertTrue(AccountEvent.objects.filter(user=self.ray, kind='reset_emailed', actor=self.manager).exists())
        link = self.client.post(f'/api/accounts/sign-in-trouble/{self.ray.pk}/link/').json()
        self.assertIn('/reset-password?token=', link['link'])
        self.assertEqual(link['phone'], '4025550123')

    def test_manager_gets_no_link_for_the_owner_or_a_manager(self):
        other = _staff('Jessica', 'Haas', 'Manager')
        self.client.force_authenticate(self.manager)
        for target in (self.owner, other):
            res = self.client.post(f'/api/accounts/sign-in-trouble/{target.pk}/link/')
            self.assertEqual(res.status_code, 403)
        self.assertFalse(MagicLinkToken.objects.filter(email=self.owner.email).exists())

    def test_staff_cannot_see_it(self):
        self.client.force_authenticate(self.ray)
        self.assertEqual(self.client.get('/api/accounts/sign-in-trouble/').status_code, 403)

    def test_no_password_is_listed(self):
        nopw = _staff('Sawyer', 'Rollins', password=None)
        rows = sign_in_trouble.trouble_rows()
        row = next(r for r in rows if r['user_id'] == nopw.pk)
        self.assertEqual(row['state'], 'no_password')
        self.assertIn('has no password yet', row['headline'])
