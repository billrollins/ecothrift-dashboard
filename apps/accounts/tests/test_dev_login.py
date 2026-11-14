"""Dev sign-in (#144): the "As Bill" button on a local sign-in page. Live only with DEBUG, DEV_LOGIN_ENABLED and a request
from this PC to localhost / 127.0.0.1; every other case is a plain 404 that signs no one in."""
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import User

URL = '/api/auth/dev-login/'
LOCAL = {'HTTP_HOST': 'localhost:5188', 'REMOTE_ADDR': '127.0.0.1'}
ON = {'DEBUG': True, 'DEV_LOGIN_ENABLED': True, 'ALLOWED_HOSTS': ['*']}


class DevLoginTests(APITestCase):
    def setUp(self):
        self.bill = User.objects.create_user(email='bill@x.com', first_name='Bill', last_name='Kay', password='pw-12345-xx',
                                             is_staff=True, is_superuser=True)

    def _post(self, **extra):
        with override_settings(DEV_LOGIN_USER=str(self.bill.pk), **ON):
            return self.client.post(URL, {}, format='json', **{**LOCAL, **extra})

    def _refused(self, res):
        self.assertEqual(res.status_code, 404, res.content)
        self.assertNotIn(b'access', res.content)
        self.assertNotIn('refresh_token', res.cookies)

    def test_signs_in_on_this_pc_like_the_sign_in_page(self):
        res = self._post(HTTP_ORIGIN='http://localhost:5188', HTTP_REFERER='http://localhost:5188/login',
                         HTTP_X_FORWARDED_FOR='127.0.0.1', HTTP_X_FORWARDED_HOST='localhost:5188')
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertTrue(body['access'])
        self.assertEqual(body['user']['id'], self.bill.pk)
        self.assertIn('access', body['user'])  # the page list, as login_view returns it
        cookie = res.cookies['refresh_token']
        self.assertTrue(cookie.value)
        self.assertEqual(cookie['path'], '/api/auth/')
        self.assertTrue(cookie['httponly'])
        me = self.client.get('/api/auth/me/', HTTP_AUTHORIZATION=f"Bearer {body['access']}")
        self.assertEqual(me.status_code, 200)
        self.bill.refresh_from_db()
        self.assertIsNotNone(self.bill.last_login)

    def test_127_0_0_1_on_any_port(self):
        self.assertEqual(self._post(HTTP_HOST='127.0.0.1:5199').status_code, 200)

    def test_user_1_by_default(self):
        User.objects.filter(pk=1).delete()
        owner = User.objects.create_user(id=1, email='owner@x.com', first_name='Owner', last_name='Kay', password='pw-12345-xx',
                                         is_staff=True, is_superuser=True)
        with override_settings(DEV_LOGIN_USER='', **ON):
            res = self.client.post(URL, {}, format='json', **LOCAL)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['user']['id'], owner.pk)

    def test_the_named_user_must_be_an_active_superuser(self):
        clerk = User.objects.create_user(email='clerk@x.com', first_name='Clerk', last_name='Kay', password='pw-12345-xx', is_staff=True)
        with override_settings(DEV_LOGIN_USER=clerk.email, **ON):
            self._refused(self.client.post(URL, {}, format='json', **LOCAL))

    # ── Never anywhere else ─────────────────────────────────────────────────

    def test_404_when_debug_is_off(self):
        with override_settings(DEV_LOGIN_USER=str(self.bill.pk), DEBUG=False, DEV_LOGIN_ENABLED=True,
                               ALLOWED_HOSTS=['*']):
            self._refused(self.client.post(URL, {}, format='json', **LOCAL))

    def test_404_when_not_enabled(self):
        with override_settings(DEV_LOGIN_USER=str(self.bill.pk), DEBUG=True, DEV_LOGIN_ENABLED=False,
                               ALLOWED_HOSTS=['*']):
            self._refused(self.client.post(URL, {}, format='json', **LOCAL))

    def test_404_by_default_under_tests(self):
        # Settings as the test run has them: DEV_LOGIN_ENABLED is off whenever tests run.
        self._refused(self.client.post(URL, {}, format='json', **LOCAL))

    def test_404_for_a_non_local_host(self):
        self._refused(self._post(HTTP_HOST='dash.ecothrift.us'))
        self._refused(self._post(HTTP_HOST='bills-pc.local:5173'))

    def test_404_from_another_address(self):
        self._refused(self._post(REMOTE_ADDR='192.168.1.50'))

    def test_404_through_the_vite_proxy_from_a_phone(self):
        # Vite's proxy rewrites Host to 127.0.0.1 (changeOrigin); the forwarded headers still tell the truth.
        self._refused(self._post(HTTP_HOST='127.0.0.1:8018', HTTP_X_FORWARDED_FOR='127.0.0.1, 192.168.1.50'))
        self._refused(self._post(HTTP_HOST='127.0.0.1:8018', HTTP_X_FORWARDED_HOST='bills-pc.local:5173'))
        self._refused(self._post(HTTP_HOST='127.0.0.1:8018', HTTP_ORIGIN='https://bills-pc.tail1.ts.net'))
        self._refused(self._post(HTTP_HOST='127.0.0.1:8018', HTTP_REFERER='https://dash.ecothrift.us/login'))

    def test_404_for_any_other_method_even_on_this_pc(self):
        with override_settings(DEV_LOGIN_USER=str(self.bill.pk), **ON):
            for method in ('get', 'put', 'options', 'delete'):
                self._refused(getattr(self.client, method)(URL, **LOCAL))

    def test_production_settings_force_it_off(self):
        import ast
        from pathlib import Path

        from django.conf import settings

        tree = ast.parse((Path(settings.BASE_DIR) / 'ecothrift' / 'settings_production.py').read_text(encoding='utf-8'))
        forced = [node for node in tree.body if isinstance(node, ast.Assign)
                  and any(getattr(t, 'id', '') == 'DEV_LOGIN_ENABLED' for t in node.targets)]
        self.assertEqual(len(forced), 1)
        self.assertIs(forced[0].value.value, False)
