"""View as (owner 2026-10-21, C5): the owner sees Dash as an employee. Read only, logged, two hours at most."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.http import HttpResponse
from django.test import RequestFactory
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.capabilities import capabilities_for_user
from apps.accounts.middleware import ViewAsMiddleware
from apps.accounts.models import AccountEvent, EmployeeProfile, User, ViewAsSession
from apps.accounts.services import view_as

PASSWORD = 'pw-12345-xx'


def _user(email, role='Employee', *, superuser=False, position=''):
    first = email.split('@')[0].title()
    user = User.objects.create_user(email=email, first_name=first, last_name='Kay', password=PASSWORD,
                                    is_staff=role != 'Customer', is_superuser=superuser)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    if role in ('Employee', 'Manager', 'Admin'):
        EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                       hire_date=timezone.localdate(), pay_rate=Decimal('15'), position=position)
    return user


class ViewAsTests(APITestCase):
    def setUp(self):
        self.bill = _user('bill@x.com', 'Admin', superuser=True)
        self.maria = _user('maria@x.com', position='Processing Associate')

    def _sign_in(self, user):
        res = self.client.post('/api/auth/login/', {'email': user.email, 'password': PASSWORD}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()['access']

    def _start(self, target=None):
        own = self._sign_in(self.bill)
        res = self.client.post('/api/auth/view-as/start/', {'user_id': (target or self.maria).pk}, format='json',
                               HTTP_AUTHORIZATION=f'Bearer {own}')
        return res

    def _viewing(self):
        res = self._start()
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()['access']

    def _as(self, token):
        return {'HTTP_AUTHORIZATION': f'Bearer {token}'}

    # ── Who may ────────────────────────────────────────────────────────────

    def test_a_non_superuser_is_refused(self):
        boss = _user('boss@x.com', 'Admin')
        own = self._sign_in(boss)
        res = self.client.post('/api/auth/view-as/start/', {'user_id': self.maria.pk}, format='json', **self._as(own))
        self.assertEqual(res.status_code, 403)
        self.assertFalse(ViewAsSession.objects.exists())

    def test_never_as_another_superuser_myself_or_a_customer(self):
        for target in (_user('owner2@x.com', 'Admin', superuser=True), self.bill, _user('c@x.com', 'Customer')):
            res = self._start(target)
            self.assertEqual(res.status_code, 400, (target.email, res.content))
        self.assertFalse(ViewAsSession.objects.exists())

    # ── Dash runs as the employee ──────────────────────────────────────────

    def test_me_and_capabilities_switch_to_the_employee(self):
        token = self._viewing()
        me = self.client.get('/api/auth/me/', **self._as(token)).json()
        self.assertEqual(me['id'], self.maria.pk)
        self.assertFalse(me['is_superuser'])
        self.assertEqual(me['view_as']['target'], {'id': self.maria.pk, 'name': 'Maria K', 'full_name': 'Maria Kay',
                                                   'job': 'Processing Associate'})
        self.assertEqual(me['view_as']['real_user']['name'], 'Bill K')
        caps = self.client.get('/api/auth/capabilities/', **self._as(token)).json()['capabilities']
        self.assertEqual(caps, capabilities_for_user(self.maria))
        self.assertNotEqual(caps, capabilities_for_user(self.bill))
        # An owner-only route is refused, as it is for Maria.
        self.assertEqual(self.client.get('/api/accounts/capability-catalog/', **self._as(token)).status_code, 403)

    def test_without_view_as_me_has_no_banner(self):
        own = self._sign_in(self.bill)
        self.assertIsNone(self.client.get('/api/auth/me/', **self._as(own)).json()['view_as'])

    def test_a_refresh_keeps_viewing_until_back(self):
        self._viewing()
        fresh = self.client.post('/api/auth/refresh/').json()['access']
        self.assertEqual(AccessToken(fresh)[view_as.CLAIM], ViewAsSession.objects.get().pk)
        self.assertEqual(self.client.get('/api/auth/me/', **self._as(fresh)).json()['id'], self.maria.pk)
        self.client.post('/api/auth/view-as/stop/', **self._as(fresh))
        plain = self.client.post('/api/auth/refresh/').json()['access']
        self.assertNotIn(view_as.CLAIM, AccessToken(plain).payload)
        self.assertEqual(self.client.get('/api/auth/me/', **self._as(plain)).json()['id'], self.bill.pk)

    # ── Read only ──────────────────────────────────────────────────────────

    def test_every_write_is_refused_with_a_clear_403(self):
        token = self._viewing()
        for method, path in (('post', '/api/accounts/messages/'), ('patch', '/api/auth/me/'),
                             ('put', f'/api/accounts/users/{self.maria.pk}/'),
                             ('delete', f'/api/accounts/users/{self.maria.pk}/'),
                             ('post', '/api/auth/sign-out-everywhere/'), ('post', '/api/auth/view-as/start/')):
            res = getattr(self.client, method)(path, {'language': 'es'}, format='json', **self._as(token))
            self.assertEqual(res.status_code, 403, (method, path))
            self.assertEqual(res.json(), {'detail': 'Viewing as Maria K: read only', 'code': 'VIEW_AS_READ_ONLY'})
        self.maria.refresh_from_db()
        self.assertEqual(self.maria.language, 'en')
        self.assertTrue(self.maria.is_active)

    def test_a_read_that_writes_is_rolled_back(self):
        token = self._viewing()

        def page(request):
            AccountEvent.log(self.maria, AccountEvent.KIND_ROLE, detail='written on open')
            return HttpResponse('ok')

        request = RequestFactory().get('/api/anything/', HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(ViewAsMiddleware(page)(request).status_code, 200)
        self.assertFalse(AccountEvent.objects.filter(detail='written on open').exists())

    def test_a_search_sent_as_post_runs_and_is_rolled_back(self):
        token = self._viewing()

        def search(request):
            AccountEvent.log(self.maria, AccountEvent.KIND_ROLE, detail='written by a search')
            return HttpResponse('ok')

        path = view_as.READ_POSTS[0]
        request = RequestFactory().post(path, HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(ViewAsMiddleware(search)(request).status_code, 200)
        self.assertFalse(AccountEvent.objects.filter(detail='written by a search').exists())

    def test_requests_without_view_as_are_untouched(self):
        own = self._sign_in(self.bill)

        def page(request):
            AccountEvent.log(self.maria, AccountEvent.KIND_ROLE, detail='kept')
            return HttpResponse('ok')

        ViewAsMiddleware(page)(RequestFactory().post('/api/anything/', HTTP_AUTHORIZATION=f'Bearer {own}'))
        self.assertTrue(AccountEvent.objects.filter(detail='kept').exists())

    # ── Audit, Back, sign-out, two hours ──────────────────────────────────

    def test_start_and_back_are_logged_with_the_owner_as_actor(self):
        token = self._viewing()
        start = AccountEvent.objects.get(user=self.maria, kind=AccountEvent.KIND_VIEW_AS_START)
        self.assertEqual(start.actor, self.bill)
        res = self.client.post('/api/auth/view-as/stop/', **self._as(token))
        self.assertEqual(res.json()['ended'], True)
        stop = AccountEvent.objects.get(user=self.maria, kind=AccountEvent.KIND_VIEW_AS_STOP)
        self.assertEqual(stop.actor, self.bill)
        self.assertIn('Back', stop.detail)
        self.assertEqual(ViewAsSession.objects.get().ended_why, view_as.ENDED_BACK)
        # The old token no longer views as anyone.
        res = self.client.get('/api/auth/me/', **self._as(token))
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()['code'], 'VIEW_AS_ENDED')

    def test_sign_out_ends_it(self):
        token = self._viewing()
        self.assertEqual(self.client.post('/api/auth/logout/', **self._as(token)).status_code, 200)
        session = ViewAsSession.objects.get()
        self.assertEqual(session.ended_why, view_as.ENDED_SIGN_OUT)
        self.assertTrue(AccountEvent.objects.filter(user=self.maria, kind=AccountEvent.KIND_VIEW_AS_STOP).exists())

    def test_it_ends_after_two_hours(self):
        token = self._viewing()
        session = ViewAsSession.objects.get()
        self.assertAlmostEqual((session.expires_at - session.started_at).total_seconds(), 7200, delta=5)
        ViewAsSession.objects.filter(pk=session.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        res = self.client.get('/api/auth/me/', **self._as(token))
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()['code'], 'VIEW_AS_ENDED')
        self.assertEqual(ViewAsSession.objects.get().ended_why, view_as.ENDED_EXPIRED)
        stop = AccountEvent.objects.get(user=self.maria, kind=AccountEvent.KIND_VIEW_AS_STOP)
        self.assertIn('2-hour', stop.detail)
        plain = self.client.post('/api/auth/refresh/').json()['access']
        self.assertNotIn(view_as.CLAIM, AccessToken(plain).payload)
        # Back after it ended still answers, as the owner.
        self.assertEqual(self.client.post('/api/auth/view-as/stop/', **self._as(token)).json()['ended'], False)

    def test_the_token_never_outlives_the_view(self):
        token = self._viewing()
        self.assertLessEqual(AccessToken(token)['exp'], int(ViewAsSession.objects.get().expires_at.timestamp()))

    def test_losing_superuser_ends_it(self):
        token = self._viewing()
        User.objects.filter(pk=self.bill.pk).update(is_superuser=False)
        self.assertEqual(self.client.get('/api/auth/me/', **self._as(token)).status_code, 401)

    def test_a_second_start_replaces_the_first(self):
        self._viewing()
        other = _user('jo@x.com')
        self.assertEqual(self._start(other).status_code, 200)
        self.assertEqual(ViewAsSession.objects.filter(ended_at__isnull=True).count(), 1)
        self.assertEqual(ViewAsSession.objects.get(target=self.maria).ended_why, view_as.ENDED_REPLACED)

    def test_the_owner_is_still_the_one_stamped_active(self):
        token = self._viewing()
        User.objects.filter(pk=self.maria.pk).update(last_active_at=None)
        self.client.get('/api/auth/me/', **self._as(token))
        self.assertIsNone(User.objects.get(pk=self.maria.pk).last_active_at)
