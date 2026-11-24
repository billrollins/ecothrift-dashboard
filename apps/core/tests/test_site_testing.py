"""The owner's Testing page (owner 2026-11-24): what HIS linked devices see on the website, for 24 hours.

"Mobile: Legacy, NEW, Black Friday (as a choose one) Desktop: NEW, Black Friday (as a choose one) ... THEN make all
selections unselect and go to prod after 24 hours ... not accidently get stuck on a version no one sees."
"""
from __future__ import annotations

import shutil
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.test import RequestFactory, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

import apps.core.middleware as mw
from apps.core.middleware import PublicSiteMiddleware
from apps.core.models import AppSetting
from apps.core.services import site_testing
from apps.core.tests.test_phone_site import CLASSIC_HTML, DESKTOP, IPHONE, PHONE_HTML
from apps.pos.services import black_friday


class _Site(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tmp = Path(tempfile.mkdtemp(prefix='site_testing_'))
        (cls.tmp / 'index.html').write_text(CLASSIC_HTML, encoding='utf-8')
        (cls.tmp / 'phone.html').write_text(PHONE_HTML, encoding='utf-8')
        cls.hosts = override_settings(
            PUBLIC_SITE_HOSTS=['ecothrift.us'], PUBLIC_SITE_CANONICAL_HOST='ecothrift.us', ALLOWED_HOSTS=['ecothrift.us', 'testserver'],
            PUBLIC_SITE_INDEX=str(cls.tmp / 'index.html'), PUBLIC_SITE_PHONE_INDEX=str(cls.tmp / 'phone.html'),
        )
        cls.hosts.enable()

    @classmethod
    def tearDownClass(cls):
        cls.hosts.disable()
        shutil.rmtree(cls.tmp, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self._reset()

    def tearDown(self):
        self._reset()

    def _reset(self):
        site_testing._cache = None
        mw._home_shell_cache = ('', float('inf'))
        mw._phone_setting_cache = mw._phone_scan_cache = mw._black_friday_cache = mw._boot_cache = None

    def get(self, path, ua=DESKTOP, linked=False, **cookies):
        seen = {}

        def inner(request):
            seen['forced'] = black_friday.forced()  # what an API view on the public host would see
            return HttpResponse('<html><body>django</body></html>')

        request = RequestFactory().get(path, HTTP_HOST='ecothrift.us', HTTP_USER_AGENT=ua)
        if linked:
            request.COOKIES[site_testing.COOKIE] = site_testing.device_value()
        request.COOKIES.update(cookies)
        response = PublicSiteMiddleware(inner)(request)
        response.forced_inside = seen.get('forced')
        return response

    @staticmethod
    def site(response) -> str:
        body = response.content.decode()
        return 'phone' if 'PHONE' in body else 'classic' if 'CLASSIC' in body else 'django'


class PicksTests(_Site):
    def test_a_pick_runs_24_hours_then_reads_as_live_by_itself(self):
        self.assertEqual(site_testing.state(), {'mobile': '', 'desktop': '', 'until': None})
        on = site_testing.save('bf', '')
        self.assertEqual((on['mobile'], on['desktop']), ('bf', ''))
        now = timezone.now()
        self.assertEqual(site_testing.state(now + timedelta(hours=23, minutes=59), fresh=True)['mobile'], 'bf')
        self.assertEqual(site_testing.state(now + timedelta(hours=24, minutes=1), fresh=True),
                         {'mobile': '', 'desktop': '', 'until': None})

    def test_only_versions_that_exist_can_be_picked_and_end_now_ends_it(self):
        self.assertEqual([o['key'] for o in site_testing.options()['mobile']], ['legacy', 'new', 'bf'])
        self.assertEqual([o['key'] for o in site_testing.options()['desktop']], ['bf'])  # no New desktop yet
        on = site_testing.save('made-up', 'new')
        self.assertEqual((on['mobile'], on['desktop'], on['until']), ('', '', None))
        site_testing.save('legacy', 'bf')
        self.assertEqual(site_testing.end(), {'mobile': '', 'desktop': '', 'until': None})
        # A stored pick that is no longer an option reads as Live.
        AppSetting.objects.filter(key=site_testing.KEY).update(
            value={'mobile': 'gone', 'desktop': 'bf', 'until': (timezone.now() + timedelta(hours=1)).isoformat()})
        self.assertEqual(site_testing.state(fresh=True)['mobile'], '')


class DeviceTests(_Site):
    def test_only_a_linked_device_follows_the_picks_and_nobody_else_reads_them(self):
        site_testing.save('legacy', 'bf')
        with patch.object(mw, 'phone_site_on', return_value=True):
            self.assertEqual(self.site(self.get('/', ua=IPHONE)), 'phone')  # a customer's phone: the live site
            self.assertEqual(self.site(self.get('/', ua=IPHONE, linked=True)), 'classic')  # his phone: Legacy
            with patch.object(site_testing, 'state', side_effect=AssertionError('read')):
                self.get('/', ua=IPHONE)
                self.get('/', ua=DESKTOP)
            made_up = self.get('/', ua=IPHONE, **{site_testing.COOKIE: 'device'})
            self.assertEqual(self.site(made_up), 'phone')

    def test_new_on_a_phone_is_the_phone_site_and_its_scanner_whatever_the_switches_say(self):
        site_testing.save('new', '')
        with patch.object(mw, 'phone_site_on', return_value=False), patch.object(mw, 'phone_scan_on', return_value=False):
            self.assertEqual(self.site(self.get('/', ua=IPHONE, linked=True)), 'phone')
            self.assertEqual(self.site(self.get('/scan', ua=IPHONE, linked=True)), 'phone')
            self.assertEqual(self.site(self.get('/scan', ua=IPHONE)), 'django')  # a customer: today's scanner
            self.assertEqual(self.site(self.get('/', ua=DESKTOP, linked=True)), 'classic')  # the Mobile pick is for phones

    def test_legacy_on_a_phone_is_the_old_site_and_the_old_scanner(self):
        site_testing.save('legacy', '')
        with patch.object(mw, 'phone_site_on', return_value=True), patch.object(mw, 'phone_scan_on', return_value=True):
            self.assertEqual(self.site(self.get('/', ua=IPHONE, linked=True)), 'classic')
            self.assertEqual(self.site(self.get('/scan', ua=IPHONE, linked=True)), 'django')

    def test_black_friday_shows_for_his_request_only_and_is_gone_after_it(self):
        site_testing.save('', 'bf')
        home = self.get('/', ua=DESKTOP, linked=True)
        body = home.content.decode()
        self.assertEqual(self.site(home), 'classic')  # a desktop page, never the phone site
        self.assertIn('<html data-day="bf">', body)
        self.assertIn('All prices reduced.', body)
        self.assertFalse(black_friday.forced())  # cleared when the request ends
        self.assertFalse(black_friday.shown())
        self.assertFalse(mw.black_friday_on())  # and never kept in the per-worker cache
        customer = self.get('/', ua=DESKTOP).content.decode()
        self.assertNotIn('data-day', customer)
        self.assertNotIn('All prices reduced.', customer)
        # The scanner's API on the public host sees Black Friday for his device only.
        self.assertTrue(self.get('/api/thriftplus/public/session/', ua=DESKTOP, linked=True).forced_inside)
        self.assertFalse(self.get('/api/thriftplus/public/session/', ua=DESKTOP).forced_inside)
        self.assertFalse(self.get('/api/thriftplus/public/session/', ua=IPHONE, linked=True).forced_inside)  # Mobile is Live

    def test_the_badge_says_what_he_is_looking_at_and_customers_never_get_one(self):
        site_testing.save('bf', 'bf')
        mine = self.get('/', ua=DESKTOP, linked=True)
        self.assertIn('id="eco-test-badge"', mine.content.decode())
        self.assertIn('TEST &middot; Black Friday &middot; ends', mine.content.decode())
        self.assertEqual(mine['Cache-Control'], 'no-store')
        self.assertIn('eco-test-badge', self.get('/scan', ua=DESKTOP, linked=True).content.decode())  # the old scanner's page too
        self.assertNotIn('eco-test-badge', self.get('/', ua=DESKTOP).content.decode())
        site_testing.end()
        self.assertNotIn('eco-test-badge', self.get('/', ua=DESKTOP, linked=True).content.decode())  # Live: no badge

    def test_the_link_links_this_browser_and_drops_the_old_preview_cookie(self):
        linked = self.get(f'/?test={site_testing.link_token()}&x=1')
        self.assertEqual((linked.status_code, linked['Location']), (302, '/?x=1'))
        self.assertTrue(linked.cookies[site_testing.COOKIE].value)
        self.assertEqual(linked.cookies[mw.SITE_COOKIE].value, '')  # the 30-day preview no longer decides anything
        request = RequestFactory().get('/', HTTP_HOST='ecothrift.us')
        request.COOKIES[site_testing.COOKIE] = linked.cookies[site_testing.COOKIE].value
        self.assertTrue(site_testing.is_linked(request))
        bad = self.get('/?test=made-up')
        self.assertEqual(bad.status_code, 302)
        self.assertNotIn(site_testing.COOKIE, bad.cookies)
        off = self.get('/?test=off', linked=True)
        self.assertEqual(off.cookies[site_testing.COOKIE].value, '')


class ApiTests(TestCase):
    def setUp(self):
        site_testing._cache = None
        User = get_user_model()
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='Bill', last_name='R', password='x')
        self.staff = User.objects.create_user(email='staff@example.com', first_name='S', last_name='T', password='x')
        self.api = APIClient()

    def tearDown(self):
        site_testing._cache = None

    def test_the_owner_picks_and_ends_and_staff_cannot(self):
        self.api.force_authenticate(self.staff)
        self.assertEqual(self.api.get('/api/core/owner/testing/').status_code, 403)
        self.api.force_authenticate(self.boss)
        first = self.api.get('/api/core/owner/testing/').json()
        self.assertEqual(first['state'], {'mobile': '', 'desktop': '', 'until': None})
        self.assertEqual(first['hours'], 24)
        self.assertIn('/?test=', first['link'])
        self.assertTrue(site_testing.link_ok(first['link'].split('test=')[1]))
        on = self.api.post('/api/core/owner/testing/', {'mobile': 'bf'}, format='json').json()['state']
        self.assertEqual((on['mobile'], on['desktop']), ('bf', ''))
        both = self.api.post('/api/core/owner/testing/', {'desktop': 'bf'}, format='json').json()['state']
        self.assertEqual((both['mobile'], both['desktop']), ('bf', 'bf'))  # one pick per row; the other row stays
        back = self.api.post('/api/core/owner/testing/', {'mobile': ''}, format='json').json()['state']
        self.assertEqual((back['mobile'], back['desktop']), ('', 'bf'))
        ended = self.api.post('/api/core/owner/testing/', {'end': True}, format='json').json()['state']
        self.assertEqual(ended, {'mobile': '', 'desktop': '', 'until': None})
