"""The desktop site (Dash Update #211): which index a public request gets once a desktop build exists.

AppSetting storefront.desktop_site ("off" default | "on"): with it on, a computer (never a phone) gets desktop.html on
every page the phone site owns and on /scan; off, nothing changes for anyone. The eco_site cookie wins when set. A phone
never gets the desktop build, and a computer never gets the phone build from this switch.
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings

import apps.core.middleware as mw
from apps.core.middleware import PublicSiteMiddleware, desktop_site_on

from .test_phone_site import ANDROID, CLASSIC_HTML, DESKTOP, IPAD, IPHONE, NOT_OWNED, OWNED, PHONE_HTML

DESKTOP_HTML = '<!doctype html><html data-day="normal"><head><!--ECO_BOOT--></head><body><div id="root"></div>DESKTOP</body></html>'
MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'


def _built_files(prefix: str):
    """The three built pages in a temp folder, and the settings that point the public hosts at them."""
    tmp = Path(tempfile.mkdtemp(prefix=prefix))
    (tmp / 'index.html').write_text(CLASSIC_HTML, encoding='utf-8')
    (tmp / 'phone.html').write_text(PHONE_HTML, encoding='utf-8')
    (tmp / 'desktop.html').write_text(DESKTOP_HTML, encoding='utf-8')
    hosts = override_settings(
        PUBLIC_SITE_HOSTS=['ecothrift.us', 'www.ecothrift.us'], PUBLIC_SITE_CANONICAL_HOST='ecothrift.us',
        ALLOWED_HOSTS=['ecothrift.us', 'www.ecothrift.us', 'testserver'],
        PUBLIC_SITE_INDEX=str(tmp / 'index.html'), PUBLIC_SITE_PHONE_INDEX=str(tmp / 'phone.html'),
        PUBLIC_SITE_DESKTOP_INDEX=str(tmp / 'desktop.html'),
    )
    return tmp, hosts


class _Files(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tmp, cls.hosts = _built_files('desktop_site_')
        cls.hosts.enable()

    @classmethod
    def tearDownClass(cls):
        cls.hosts.disable()
        shutil.rmtree(cls.tmp, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        mw._home_shell_cache = ('', float('inf'))
        mw._phone_setting_cache = None
        mw._phone_scan_cache = None
        mw._desktop_setting_cache = None
        mw._boot_cache = None

    def tearDown(self):
        mw._home_shell_cache = None
        mw._phone_setting_cache = None
        mw._phone_scan_cache = None
        mw._desktop_setting_cache = None
        mw._boot_cache = None

    def get(self, path, ua=DESKTOP, cookie=None, **extra):
        middleware = PublicSiteMiddleware(lambda request: HttpResponse('django'))
        request = RequestFactory().get(path, HTTP_HOST='ecothrift.us', HTTP_USER_AGENT=ua, **extra)
        if cookie:
            request.COOKIES['eco_site'] = {'phone': mw.preview_token()}.get(cookie, cookie)
        return middleware(request)

    def site(self, response) -> str:
        body = response.content.decode()
        for name in ('DESKTOP', 'PHONE', 'CLASSIC'):
            if name in body:
                return name.lower()
        return body[:40]


class DesktopSwitchOffTests(_Files):
    def test_off_changes_nothing_for_anyone(self):
        with patch.object(mw, 'desktop_site_on', return_value=False), patch.object(mw, 'phone_site_on', return_value=False):
            for ua in (DESKTOP, MAC, IPAD, IPHONE, ANDROID, ''):
                for path in OWNED + NOT_OWNED:
                    self.assertEqual(self.site(self.get(path, ua=ua)), 'classic', f'{ua[:20]} {path}')
                self.assertEqual(self.get('/scan', ua=ua).content, b'django', ua[:20])  # today's pass-through

    def test_off_with_the_phone_site_on_phones_still_get_the_phone_site(self):
        with patch.object(mw, 'desktop_site_on', return_value=False), patch.object(mw, 'phone_site_on', return_value=True):
            self.assertEqual(self.site(self.get('/', ua=IPHONE)), 'phone')
            self.assertEqual(self.site(self.get('/', ua=DESKTOP)), 'classic')

    def test_the_switch_is_off_without_its_setting(self):
        self.assertFalse(desktop_site_on())  # no database here: a failed read is off
        self.assertEqual(self.site(self.get('/', ua=DESKTOP)), 'classic')

    def test_no_desktop_build_means_the_current_site(self):
        with override_settings(PUBLIC_SITE_DESKTOP_INDEX=None), patch.object(mw, 'desktop_site_on', return_value=True):
            self.assertEqual(self.site(self.get('/', ua=DESKTOP)), 'classic')


class DesktopSwitchOnTests(_Files):
    def setUp(self):
        super().setUp()
        self.on = patch.object(mw, 'desktop_site_on', return_value=True)
        self.phone_on = patch.object(mw, 'phone_site_on', return_value=True)
        self.on.start()
        self.phone_on.start()

    def tearDown(self):
        self.on.stop()
        self.phone_on.stop()
        super().tearDown()

    def test_computers_get_the_desktop_site_on_every_owned_page(self):
        for ua in (DESKTOP, MAC, IPAD):
            for path in OWNED:
                response = self.get(path, ua=ua)
                self.assertEqual((response.status_code, self.site(response)), (200, 'desktop'), f'{ua[:20]} {path}')
                self.assertEqual(response['Cache-Control'], 'no-cache')
                self.assertIn('User-Agent', response['Vary'])

    def test_a_phone_never_gets_the_desktop_site(self):
        for ua in (IPHONE, ANDROID):
            for path in OWNED:
                self.assertEqual(self.site(self.get(path, ua=ua)), 'phone', f'{ua[:20]} {path}')

    def test_a_phone_with_the_phone_site_off_gets_the_current_site_not_the_desktop_one(self):
        with patch.object(mw, 'phone_site_on', return_value=False):
            self.assertEqual(self.site(self.get('/', ua=IPHONE)), 'classic')

    def test_a_mobile_hint_counts_as_a_phone(self):
        response = self.get('/', ua=ANDROID, HTTP_SEC_CH_UA_MOBILE='?1')
        self.assertEqual(self.site(response), 'phone')

    def test_the_online_store_pages_stay_on_the_current_site(self):
        for path in NOT_OWNED:
            self.assertEqual(self.site(self.get(path)), 'classic', path)

    def test_scan_on_a_computer_is_the_desktop_page(self):
        for path in ('/scan', '/scan/'):
            self.assertEqual(self.site(self.get(path)), 'desktop', path)
        self.assertEqual(self.site(self.get('/scan?tag=ITM0227851')), 'desktop')

    def test_scan_on_a_phone_is_unchanged(self):
        with patch.object(mw, 'phone_scan_on', return_value=False):
            self.assertEqual(self.get('/scan', ua=IPHONE).content, b'django')

    def test_the_rest_of_the_member_app_and_the_api_pass_through(self):
        for path in ('/join', '/qr', '/card', '/scan/list', '/api/storefront/home.json', '/static/site/x.js', '/robots.txt', '/i/abc'):
            self.assertEqual(self.get(path).content, b'django', path)

    def test_the_classic_cookie_keeps_the_current_site(self):
        self.assertEqual(self.site(self.get('/', cookie='classic')), 'classic')
        self.assertEqual(self.get('/scan', cookie='classic').content, b'django')

    def test_the_owner_phone_preview_cookie_keeps_the_phone_site(self):
        self.assertEqual(self.site(self.get('/', cookie='phone')), 'phone')

    def test_the_boot_stamp_goes_in_and_no_scan_flag(self):
        with patch.object(mw, 'boot_script', return_value='<script id="eco-boot" type="application/json">{"v":"1"}</script>'):
            body = self.get('/').content.decode()
        self.assertIn('{"v":"1"}', body)
        self.assertNotIn('<!--ECO_BOOT-->', body)
        self.assertNotIn('"scan":true', body)

    def test_old_shopify_addresses_still_redirect_first(self):
        response = self.get('/products/a-lamp')
        self.assertEqual(response.status_code, 301)


class DesktopTestingPickTests(TestCase):
    """The owner's Testing page (#221): Desktop New and Desktop Black Friday on his linked computer only."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tmp, cls.hosts = _built_files('desktop_pick_')
        cls.hosts.enable()

    @classmethod
    def tearDownClass(cls):
        cls.hosts.disable()
        shutil.rmtree(cls.tmp, ignore_errors=True)
        super().tearDownClass()

    def _reset(self):
        from apps.core.services import site_testing

        site_testing._cache = None
        mw._home_shell_cache = ('', float('inf'))
        mw._phone_setting_cache = mw._phone_scan_cache = mw._desktop_setting_cache = mw._black_friday_cache = mw._boot_cache = None

    def setUp(self):
        self._reset()

    def tearDown(self):
        self._reset()

    def get(self, path, ua=DESKTOP, linked=False):
        from apps.core.services import site_testing

        request = RequestFactory().get(path, HTTP_HOST='ecothrift.us', HTTP_USER_AGENT=ua)
        if linked:
            request.COOKIES[site_testing.COOKIE] = site_testing.device_value()
        return PublicSiteMiddleware(lambda r: HttpResponse('<html><body>django</body></html>'))(request)

    site = _Files.site

    def test_new_shows_the_desktop_site_on_his_computer_while_the_switch_is_off(self):
        from apps.core.services import site_testing

        site_testing.save('', 'new')
        with patch.object(mw, 'desktop_site_on', return_value=False):
            mine = self.get('/', linked=True)
            self.assertEqual(self.site(mine), 'desktop')
            self.assertIn('TEST &middot; New', mine.content.decode())
            self.assertIn('data-day="normal"', mine.content.decode())
            self.assertEqual(self.site(self.get('/scan', linked=True)), 'desktop')
            self.assertEqual(self.site(self.get('/')), 'classic')  # a customer's computer
            self.assertEqual(self.site(self.get('/', ua=IPHONE, linked=True)), 'classic')  # his phone follows Mobile

    def test_new_plus_black_friday_shows_the_desktop_site_in_the_sale_for_his_request_only(self):
        from apps.core.services import site_testing

        site_testing.save('', 'newbf')
        with patch.object(mw, 'desktop_site_on', return_value=False):
            mine = self.get('/store', linked=True).content.decode()
            self.assertIn('DESKTOP', mine)
            self.assertIn('data-day="bf"', mine)
            customer = self.get('/store').content.decode()
            self.assertIn('CLASSIC', customer)
            self.assertNotIn('data-day="bf"', customer)

    def test_with_the_switch_on_customers_get_it_and_black_friday_stamps_the_day(self):
        with patch.object(mw, 'desktop_site_on', return_value=True), patch.object(mw, 'black_friday_on', return_value=True):
            body = self.get('/').content.decode()
        self.assertIn('DESKTOP', body)
        self.assertIn('data-day="bf"', body)


class DesktopSwitchSettingTests(TestCase):
    def setUp(self):
        mw._desktop_setting_cache = None

    def tearDown(self):
        mw._desktop_setting_cache = None

    def test_on_and_off_from_the_app_setting(self):
        from apps.core.models import AppSetting

        self.assertFalse(desktop_site_on())
        mw._desktop_setting_cache = None
        AppSetting.objects.create(key='storefront.desktop_site', value='on')
        self.assertTrue(desktop_site_on())
        AppSetting.objects.filter(key='storefront.desktop_site').update(value='off')
        self.assertTrue(desktop_site_on())  # read at most every 30 seconds
        mw._desktop_setting_cache = None
        self.assertFalse(desktop_site_on())
