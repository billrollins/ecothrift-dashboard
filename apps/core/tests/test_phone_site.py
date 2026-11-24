"""The phone site (owner 2026-11-19): which index a public request gets, the preview cookie, the boot stamp, caching.

PLAN.md (workspace/app-mockups/real-build): the phone entry answers when the visitor is on a phone AND the switch
(AppSetting storefront.phone_site) is on AND the path is one the phone site owns; the cookie eco_site forces either
site; ?site= sets it. With the switch off and no cookie, nothing about the current site changes.
"""
from __future__ import annotations

import re
import shutil
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.conf import settings
from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings

import apps.core.middleware as mw
from apps.core.middleware import (
    PublicSiteMiddleware, boot_script, is_phone, phone_owns, phone_scan_on, phone_site_on,
)

IPHONE = ('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) '
          'Version/18.1 Mobile/15E148 Safari/604.1')
ANDROID = ('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile '
           'Safari/537.36')
DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'

CLASSIC_HTML = '<!doctype html><html><head></head><body><div id="root"><!--PUBLIC_SHELL--></div>CLASSIC</body></html>'
PHONE_HTML = '<!doctype html><html><head><!--ECO_BOOT--></head><body><div id="root"></div>PHONE</body></html>'

OWNED = ('/', '/store', '/store/', '/store/item/p123', '/store/item/m45', '/categories', '/thriftplus', '/about',
         '/questions', '/careers', '/menu', '/visit', '/visit/', '/blog', '/blog/a-post', '/terms', '/privacy',
         '/account', '/account/sign-in', '/account/history', '/verify', '/careers/apply', '/careers/interview',
         '/careers/cashier', '/thriftplus/warranty',
         # Any other page too: a mistyped address gets the phone site's not-found page (Dash Update #185).
         '/no-such-page', '/store/other/1', '/a/b/c/')
# The online store is switched off; its pages stay on the current site.
NOT_OWNED = ('/hold/abc', '/checkout', '/checkout/', '/shop', '/shop/', '/shop/a-lamp', '/hold-link-expired')


class _Files(SimpleTestCase):
    """Two built index files in a temp folder, and the public hosts on."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tmp = Path(tempfile.mkdtemp(prefix='phone_site_'))
        (cls.tmp / 'index.html').write_text(CLASSIC_HTML, encoding='utf-8')
        (cls.tmp / 'phone.html').write_text(PHONE_HTML, encoding='utf-8')
        cls.hosts = override_settings(
            PUBLIC_SITE_HOSTS=['ecothrift.us', 'www.ecothrift.us'], PUBLIC_SITE_CANONICAL_HOST='ecothrift.us',
            ALLOWED_HOSTS=['ecothrift.us', 'www.ecothrift.us'],
            PUBLIC_SITE_INDEX=str(cls.tmp / 'index.html'), PUBLIC_SITE_PHONE_INDEX=str(cls.tmp / 'phone.html'),
        )
        cls.hosts.enable()

    @classmethod
    def tearDownClass(cls):
        cls.hosts.disable()
        shutil.rmtree(cls.tmp, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        mw._home_shell_cache = ('', float('inf'))  # the classic home shell stamps nothing (no DB here)
        mw._phone_setting_cache = None
        mw._phone_scan_cache = None
        mw._black_friday_cache = None
        mw._boot_cache = None

    def tearDown(self):
        mw._home_shell_cache = None
        mw._phone_setting_cache = None
        mw._phone_scan_cache = None
        mw._black_friday_cache = None
        mw._boot_cache = None

    def get(self, path, ua=DESKTOP, cookie=None, host='ecothrift.us', **extra):
        middleware = PublicSiteMiddleware(lambda request: HttpResponse('django'))
        request = RequestFactory().get(path, HTTP_HOST=host, HTTP_USER_AGENT=ua, **extra)
        if cookie:
            # 'phone' in a test means a real signed preview key; a bare 'phone' cookie is tested as 'made-up'.
            request.COOKIES['eco_site'] = {'phone': mw.preview_token(), 'made-up': 'phone'}.get(cookie, cookie)
        return middleware(request)

    def site(self, response) -> str:
        body = response.content.decode()
        return 'phone' if 'PHONE' in body else 'classic' if 'CLASSIC' in body else body[:40]


class SwitchOffTests(_Files):
    """Off (the default) and no cookie: today's behaviour for phones and desktops."""

    def test_every_page_is_the_current_site_for_phones_and_desktops(self):
        with patch.object(mw, 'phone_site_on', return_value=False):
            for ua in (IPHONE, ANDROID, DESKTOP, IPAD, ''):
                for path in OWNED + NOT_OWNED:
                    response = self.get(path, ua=ua)
                    self.assertEqual((response.status_code, self.site(response)), (200, 'classic'), f'{ua[:20]} {path}')
                    self.assertFalse(response.has_header('Cache-Control'), path)  # today's page sends none

    def test_a_desktop_never_reads_the_switch(self):
        with patch.object(mw, 'phone_site_on', side_effect=AssertionError('read')):
            self.assertEqual(self.site(self.get('/', ua=DESKTOP)), 'classic')

    def test_the_switch_is_off_without_its_setting(self):
        # SimpleTestCase: the database is not there, so this is also "a failed read is off".
        self.assertFalse(phone_site_on())
        self.assertEqual(self.site(self.get('/', ua=IPHONE)), 'classic')

    def test_passthroughs_are_untouched(self):
        # /scan with the cookie is the phone scanner now (ScanSwitchTests); the rest of the member app is not.
        for path in ('/join', '/qr', '/card', '/scan/list', '/api/storefront/home.json', '/static/site/x.js', '/robots.txt', '/i/abc'):
            self.assertEqual(self.get(path, ua=IPHONE, cookie='phone').content, b'django', path)


class BlackFridayTests(_Files):
    """Black Friday (#220). Owner 2026-11-24: "NEVER NEVER NEVER have the desktop app have Mobile elements or be Mobile
    view": a desktop keeps the desktop site, whose home is stamped with the day; it is never sent to the phone site."""

    def test_a_desktop_never_gets_the_phone_site_for_black_friday(self):
        with patch.object(mw, 'black_friday_on', return_value=True), patch.object(mw, 'phone_site_on', return_value=True):
            for path in OWNED:
                self.assertEqual(self.site(self.get(path, ua=DESKTOP)), 'classic', path)
            self.assertEqual(self.site(self.get('/', ua=IPHONE)), 'phone')
        with patch.object(mw, 'black_friday_on', return_value=True), patch.object(mw, 'phone_site_on', return_value=False):
            self.assertEqual(self.site(self.get('/', ua=IPHONE)), 'classic')  # the phone switch alone decides for phones

    def test_the_desktop_home_is_stamped_with_the_day_and_paints_the_sale_first(self):
        with patch.object(mw, 'black_friday_on', return_value=True):
            home = self.get('/', ua=DESKTOP).content.decode()
            self.assertIn('<html data-day="bf">', home)
            self.assertIn('All prices reduced.', home)
            self.assertIn('Get directions', home)
            self.assertIn('Fri 6 AM to 6 PM', home)
            visit = self.get('/visit', ua=DESKTOP).content.decode()
            self.assertIn('<html data-day="bf">', visit)  # every desktop page knows the day; only Home paints the sale
            self.assertNotIn('All prices reduced.', visit)
        with patch.object(mw, 'black_friday_on', return_value=False):
            home = self.get('/', ua=DESKTOP).content.decode()
            self.assertNotIn('data-day', home)
            self.assertNotIn('All prices reduced.', home)

    def test_no_window_is_off(self):
        self.assertFalse(mw.black_friday_on())  # no database here: a failed read is off


class SwitchOnTests(_Files):
    def setUp(self):
        super().setUp()
        self.on = patch.object(mw, 'phone_site_on', return_value=True)
        self.on.start()

    def tearDown(self):
        self.on.stop()
        super().tearDown()

    def test_a_phone_gets_the_phone_site_on_owned_paths_only(self):
        for ua in (IPHONE, ANDROID):
            for path in OWNED:
                self.assertEqual(self.site(self.get(path, ua=ua)), 'phone', path)
            for path in NOT_OWNED:
                self.assertEqual(self.site(self.get(path, ua=ua)), 'classic', path)

    def test_old_shopify_addresses_still_redirect_first(self):
        # The legacy 301s run before the phone site decides, for phones as for desktops.
        for ua in (IPHONE, DESKTOP):
            for old, new in (('/products/a-lamp', '/shop/a-lamp'), ('/pages/visit-us', '/visit'), ('/cart', '/shop'),
                             ('/blogs/news/what-we-are-working-on-now', '/blog/turns-two')):
                response = self.get(old, ua=ua)
                self.assertEqual((response.status_code, response['Location']), (301, f'http://ecothrift.us{new}'), old)

    def test_a_mistyped_address_on_a_phone_gets_the_phone_site(self):
        self.assertEqual(self.site(self.get('/no-such-page', ua=IPHONE)), 'phone')
        self.assertEqual(self.site(self.get('/no-such-page', ua=DESKTOP)), 'classic')
        self.assertEqual(self.site(self.get('/no-such-page', ua=IPHONE, cookie='classic')), 'classic')

    def test_desktops_and_tablets_keep_the_current_site(self):
        for ua in (DESKTOP, IPAD, ''):
            for path in OWNED:
                self.assertEqual(self.site(self.get(path, ua=ua)), 'classic', f'{ua[:20]} {path}')

    def test_the_mobile_client_hint_wins_when_sent(self):
        self.assertEqual(self.site(self.get('/', ua=ANDROID, HTTP_SEC_CH_UA_MOBILE='?0')), 'classic')
        self.assertEqual(self.site(self.get('/', ua=ANDROID, HTTP_SEC_CH_UA_MOBILE='?1')), 'phone')

    def test_the_phone_page_is_revalidated_and_varies(self):
        response = self.get('/store', ua=IPHONE)
        self.assertEqual(response['Cache-Control'], 'no-cache')
        self.assertIn('User-Agent', response['Vary'])
        self.assertIn('Cookie', response['Vary'])

    def test_the_classic_cookie_keeps_a_phone_on_the_current_site(self):
        self.assertEqual(self.site(self.get('/', ua=IPHONE, cookie='classic')), 'classic')

    def test_no_phone_build_means_the_current_site(self):
        with override_settings(PUBLIC_SITE_PHONE_INDEX=None):
            self.assertEqual(self.site(self.get('/', ua=IPHONE)), 'classic')


class CookieTests(_Files):
    def test_the_phone_cookie_previews_the_phone_site_with_the_switch_off(self):
        with patch.object(mw, 'phone_site_on', side_effect=AssertionError('the cookie decides')):
            for ua in (DESKTOP, IPHONE):
                self.assertEqual(self.site(self.get('/', ua=ua, cookie='phone')), 'phone')
                self.assertEqual(self.site(self.get('/thriftplus', ua=ua, cookie='phone')), 'phone')
                self.assertEqual(self.site(self.get('/blog', ua=ua, cookie='phone')), 'phone')
                self.assertEqual(self.site(self.get('/shop', ua=ua, cookie='phone')), 'classic')
                self.assertEqual(self.site(self.get('/', ua=ua, cookie='classic')), 'classic')

    def test_an_unknown_cookie_value_is_ignored(self):
        with patch.object(mw, 'phone_site_on', return_value=False):
            self.assertEqual(self.site(self.get('/', ua=IPHONE, cookie='bogus')), 'classic')

    def test_site_query_sets_the_cookie_and_redirects_without_it(self):
        key = mw.preview_token()
        for choice, extra, value in (('phone', f'&k={key}', key), ('classic', '', 'classic')):
            response = self.get(f'/store?q=chair&site={choice}{extra}&cat=kitchen')
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response['Location'], '/store?q=chair&cat=kitchen')  # the key never stays in the address
            morsel = response.cookies['eco_site']
            self.assertEqual(morsel.value, value)
            self.assertEqual(int(morsel['max-age']), 30 * 24 * 3600)
            self.assertEqual(morsel['samesite'], 'Lax')
            self.assertTrue(morsel['httponly'])
        self.assertEqual(self.get(f'/blog?site=phone&k={key}')['Location'], '/blog')  # any public page

    def test_the_preview_is_the_owners_alone(self):
        """Owner 2026-11-19: "i want access and no normal visitors to see it". No key, a made-up key, an old key and a
        hand-typed cookie all leave the visitor on the current site."""
        with patch.object(mw, 'phone_site_on', return_value=False), patch.object(mw, 'phone_scan_on', return_value=False):
            for address in ('/?site=phone', '/?site=phone&k=phone', '/?site=phone&k=phone:abc:def'):
                response = self.get(address)
                self.assertEqual((response.status_code, response['Location']), (302, '/'), address)
                self.assertNotIn('eco_site', response.cookies, address)
            for ua in (DESKTOP, IPHONE):
                self.assertEqual(self.site(self.get('/', ua=ua, cookie='made-up')), 'classic')
                self.assertEqual(self.site(self.get('/', ua=ua, cookie='phone:abc:def')), 'classic')
            with patch('django.core.signing.time.time', return_value=__import__('time').time() - 8 * 24 * 3600):
                old_key = mw.preview_token()
            self.assertNotIn('eco_site', self.get(f'/?site=phone&k={old_key}').cookies)  # a link older than a week
            with patch('django.core.signing.time.time', return_value=__import__('time').time() - 40 * 24 * 3600):
                stale = mw.preview_token()
            self.assertEqual(self.site(self.get('/', ua=IPHONE, cookie=stale)), 'classic')  # a cookie past its time
            self.assertEqual(self.site(self.get('/', ua=DESKTOP, cookie='phone')), 'phone')  # a real key works

    def test_other_site_values_do_nothing(self):
        with patch.object(mw, 'phone_site_on', return_value=False):
            response = self.get('/?site=other')
        self.assertEqual((response.status_code, self.site(response)), (200, 'classic'))

    def test_www_goes_to_the_apex_first_with_the_query(self):
        response = self.get('/?site=phone', host='www.ecothrift.us')
        self.assertEqual((response.status_code, response['Location']), (301, 'http://ecothrift.us/?site=phone'))


def _holder(raw: bytes, etag='"v1"', snapshot=True):
    built = SimpleNamespace(home=SimpleNamespace(raw=raw, etag=etag))
    return SimpleNamespace(peek=lambda: built if snapshot else None, get=lambda: built)


class BootStampTests(_Files):
    def stamped(self, holder):
        with patch('apps.storefront.services.holder.holder', holder):
            return self.get('/', ua=DESKTOP, cookie='phone').content.decode()

    def test_the_home_feed_is_stamped_as_json(self):
        # The phone cookie previews the scanner too, so the stamp says so first ("scan": true, ScanSwitchTests).
        body = self.stamped(_holder(b'{"v":"abc","day":"normal","finds":[]}'))
        m = re.search(r'<script id="eco-boot" type="application/json">(.*?)</script>', body)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), '{"scan":true,"v":"abc","day":"normal","finds":[]}')
        self.assertNotIn('<!--ECO_BOOT-->', body)

    def test_the_stamp_cannot_close_its_script_tag(self):
        evil = b'{"finds":[{"name":"</script><script>alert(1)</script><!--"}]}'
        body = self.stamped(_holder(evil))
        self.assertEqual(body.count('</script>'), 1)
        self.assertNotIn('<script>alert', body)
        import json

        inner = re.search(r'type="application/json">(.*?)</script>', body).group(1)
        self.assertEqual(json.loads(inner)['finds'][0]['name'], '</script><script>alert(1)</script><!--')

    def test_no_snapshot_yet_stamps_nothing_and_builds_nothing(self):
        holder = _holder(b'{}', snapshot=False)
        holder.get = lambda: (_ for _ in ()).throw(AssertionError('must not build in the page'))
        body = self.stamped(holder)
        self.assertNotIn('eco-boot', body)
        self.assertIn('PHONE', body)

    def test_a_missing_storefront_app_stamps_nothing(self):
        with patch.dict(sys.modules, {'apps.storefront.services.holder': None}):
            self.assertEqual(boot_script(), '')
            body = self.get('/', ua=DESKTOP, cookie='phone').content.decode()
        self.assertNotIn('eco-boot', body)
        self.assertIn('PHONE', body)

    def test_a_broken_holder_never_fails_the_page(self):
        holder = SimpleNamespace(peek=lambda: 1, get=lambda: (_ for _ in ()).throw(RuntimeError('boom')))
        body = self.stamped(holder)
        self.assertIn('PHONE', body)
        self.assertNotIn('eco-boot', body)


class ScanSwitchTests(_Files):
    """The second switch, storefront.phone_scan (PLAN-SCANNER.md section 5): /scan is the phone scanner only for a phone
    that gets the phone site AND with this switch on; the cookie previews it (or refuses it) regardless of both."""

    def switches(self, site: bool, scan: bool):
        return (patch.object(mw, 'phone_site_on', return_value=site), patch.object(mw, 'phone_scan_on', return_value=scan))

    def answer(self, response) -> str:
        """'django' for today's pass-through (the staff build's scanner), else 'phone' or 'classic'."""
        return 'django' if response.content == b'django' else self.site(response)

    def test_both_off_is_today_for_phones_and_desktops(self):
        site, scan = self.switches(False, False)
        with site, scan:
            for ua in (IPHONE, ANDROID, DESKTOP, IPAD, ''):
                for path in ('/scan', '/scan/', '/scan?view=qr', '/scan?tag=ITM0000001'):
                    response = self.get(path, ua=ua)
                    self.assertEqual((response.status_code, response.content), (200, b'django'), f'{ua[:20]} {path}')

    def test_the_phone_site_alone_keeps_todays_scanner(self):
        site, scan = self.switches(True, False)
        with site, scan:
            self.assertEqual(self.answer(self.get('/scan', ua=IPHONE)), 'django')
            self.assertEqual(self.answer(self.get('/thriftplus', ua=IPHONE)), 'phone')
            self.assertNotIn('"scan":true', self.stamped_for('/thriftplus', IPHONE))

    def test_the_scan_switch_needs_the_phone_site(self):
        site, scan = self.switches(False, True)
        with site, scan:
            self.assertEqual(self.answer(self.get('/scan', ua=IPHONE)), 'django')

    def test_both_on_a_phone_gets_the_phone_scanner_and_nothing_else_moves(self):
        site, scan = self.switches(True, True)
        with site, scan:
            for ua in (IPHONE, ANDROID):
                for path in ('/scan', '/scan/', '/scan?view=join', '/scan?signin=tok', '/scan?tag=ITM0000001'):
                    response = self.get(path, ua=ua)
                    self.assertEqual((response.status_code, self.answer(response)), (200, 'phone'), path)
                    self.assertEqual(response['Cache-Control'], 'no-cache')
                    self.assertIn('Cookie', response['Vary'])
                # The rest of the member app is unchanged: the redirects, the tag links, anything under /scan/.
                for path in ('/qr', '/card', '/join', '/join/', '/scan/list', '/scan/manifest.webmanifest', '/i/k3X9pQr', '/I/ITM0000001'):
                    self.assertEqual(self.answer(self.get(path, ua=ua)), 'django', path)
            for ua in (DESKTOP, IPAD, ''):
                self.assertEqual(self.answer(self.get('/scan', ua=ua)), 'django', ua[:20])

    def test_a_desktop_never_reads_the_switches_on_scan(self):
        with patch.object(mw, 'phone_site_on', side_effect=AssertionError('read')), \
                patch.object(mw, 'phone_scan_on', side_effect=AssertionError('read')):
            self.assertEqual(self.answer(self.get('/scan', ua=DESKTOP)), 'django')

    def test_the_cookie_previews_or_refuses_the_phone_scanner_regardless_of_both(self):
        with patch.object(mw, 'phone_site_on', side_effect=AssertionError('the cookie decides')), \
                patch.object(mw, 'phone_scan_on', side_effect=AssertionError('the cookie decides')):
            for ua in (IPHONE, DESKTOP):
                self.assertEqual(self.answer(self.get('/scan?view=qr', ua=ua, cookie='phone')), 'phone')
                self.assertEqual(self.answer(self.get('/scan', ua=ua, cookie='classic')), 'django')
        site, scan = self.switches(True, True)
        with site, scan:
            self.assertEqual(self.answer(self.get('/scan', ua=IPHONE, cookie='classic')), 'django')

    def test_site_query_works_on_scan(self):
        key = mw.preview_token()
        for choice, extra, value in (('phone', f'&k={key}', key), ('classic', '', 'classic')):
            response = self.get(f'/scan?site={choice}{extra}&view=qr', ua=IPHONE)
            self.assertEqual((response.status_code, response['Location']), (302, '/scan?view=qr'))
            self.assertEqual(response.cookies['eco_site'].value, value)
        self.assertNotIn('eco_site', self.get('/scan?site=phone&view=qr', ua=IPHONE).cookies)  # no key, no preview
        self.assertEqual(self.get('/scan/?site=classic')['Location'], '/scan/')

    def test_no_phone_build_keeps_todays_scanner_even_with_the_cookie(self):
        with override_settings(PUBLIC_SITE_PHONE_INDEX=None):
            self.assertEqual(self.answer(self.get('/scan', ua=IPHONE, cookie='phone')), 'django')

    def test_the_dash_host_still_sends_scan_to_ecothrift_us(self):
        site, scan = self.switches(True, True)
        with site, scan, override_settings(STAFF_DASHBOARD_HOST='dash.ecothrift.us', ALLOWED_HOSTS=['ecothrift.us', 'dash.ecothrift.us']):
            response = self.get('/scan?view=qr', ua=IPHONE, cookie='phone', host='dash.ecothrift.us')
        self.assertEqual((response.status_code, response['Location']), (302, 'https://ecothrift.us/scan?view=qr'))

    def stamped_for(self, path, ua, cookie=None, raw=b'{"v":"abc","finds":[]}'):
        with patch('apps.storefront.services.holder.holder', _holder(raw)):
            return self.get(path, ua=ua, cookie=cookie).content.decode()

    def test_the_stamp_tells_the_page_when_scan_is_a_route(self):
        import json

        site, scan = self.switches(True, True)
        with site, scan:
            for path in ('/', '/scan'):
                body = self.stamped_for(path, IPHONE)
                inner = re.search(r'type="application/json">(.*?)</script>', body).group(1)
                self.assertEqual(json.loads(inner), {'scan': True, 'v': 'abc', 'finds': []}, path)
            mw._boot_cache = None  # another snapshot (the test's holder keeps one etag)
            empty = self.stamped_for('/', IPHONE, raw=b'{}')
            self.assertIn('<script id="eco-boot" type="application/json">{"scan":true}</script>', empty)
        mw._boot_cache = None
        site, scan = self.switches(True, False)
        with site, scan:
            body = self.stamped_for('/', IPHONE)
            self.assertIn('<script id="eco-boot" type="application/json">{"v":"abc","finds":[]}</script>', body)


class ScanPageHeadersTests(TestCase):
    """Through the whole middleware stack: the phone /scan page keeps COOP same-origin-allow-popups (the Google popup)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tmp = Path(tempfile.mkdtemp(prefix='phone_scan_'))
        (cls.tmp / 'index.html').write_text(CLASSIC_HTML, encoding='utf-8')
        (cls.tmp / 'phone.html').write_text(PHONE_HTML, encoding='utf-8')

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)
        super().tearDownClass()

    def test_the_phone_scanner_allows_the_google_sign_in_popup(self):
        with override_settings(PUBLIC_SITE_HOSTS=['ecothrift.us'], PUBLIC_SITE_CANONICAL_HOST='ecothrift.us',
                               ALLOWED_HOSTS=['ecothrift.us'], PUBLIC_SITE_INDEX=str(self.tmp / 'index.html'),
                               PUBLIC_SITE_PHONE_INDEX=str(self.tmp / 'phone.html')):
            self.client.cookies['eco_site'] = mw.preview_token()
            r = self.client.get('/scan', HTTP_HOST='ecothrift.us', HTTP_USER_AGENT=IPHONE)
        self.assertIn(b'PHONE', r.content)
        self.assertEqual(r.headers.get('Cross-Origin-Opener-Policy'), 'same-origin-allow-popups')


class PhoneDetectTests(SimpleTestCase):
    def test_phones_tablets_and_computers(self):
        rf = RequestFactory()
        self.assertTrue(is_phone(rf.get('/', HTTP_USER_AGENT=IPHONE)))
        self.assertTrue(is_phone(rf.get('/', HTTP_USER_AGENT=ANDROID)))
        self.assertFalse(is_phone(rf.get('/', HTTP_USER_AGENT=DESKTOP)))
        self.assertFalse(is_phone(rf.get('/', HTTP_USER_AGENT=IPAD)))
        self.assertFalse(is_phone(rf.get('/')))

    def test_owned_paths_match_the_plan(self):
        for path in OWNED:
            self.assertTrue(phone_owns(path), path)
        for path in NOT_OWNED:
            self.assertFalse(phone_owns(path), path)


class SettingTests(TestCase):
    def setUp(self):
        mw._phone_setting_cache = None
        mw._phone_scan_cache = None

    def tearDown(self):
        mw._phone_setting_cache = None
        mw._phone_scan_cache = None

    def test_the_scan_switch_is_its_own_setting_with_the_same_30_second_cache(self):
        from apps.core.models import AppSetting

        self.assertFalse(phone_scan_on())
        mw._phone_scan_cache = None
        AppSetting.objects.create(key='storefront.phone_site', value='on')
        self.assertFalse(phone_scan_on())  # the site's switch is not the scanner's
        mw._phone_scan_cache = None
        AppSetting.objects.create(key='storefront.phone_scan', value='on')
        self.assertTrue(phone_scan_on())
        AppSetting.objects.filter(key='storefront.phone_scan').update(value='off')
        with self.assertNumQueries(0):
            self.assertTrue(phone_scan_on())  # kept 30 seconds
        mw._phone_scan_cache = (True, 0.0)  # expired
        self.assertFalse(phone_scan_on())

    def test_on_off_and_the_30_second_cache(self):
        from apps.core.models import AppSetting

        self.assertFalse(phone_site_on())
        mw._phone_setting_cache = None
        AppSetting.objects.create(key='storefront.phone_site', value='on')
        self.assertTrue(phone_site_on())
        AppSetting.objects.filter(key='storefront.phone_site').update(value='off')
        with self.assertNumQueries(0):
            self.assertTrue(phone_site_on())  # kept 30 seconds
        mw._phone_setting_cache = (True, 0.0)  # expired
        self.assertFalse(phone_site_on())


class ImmutableStaticTests(SimpleTestCase):
    """WhiteNoise caches hashed files forever: Vite's (both public builds) and Django's manifest copies."""

    def test(self):
        from whitenoise.base import WhiteNoise

        wn = WhiteNoise(None, immutable_file_test=settings.WHITENOISE_IMMUTABLE_FILE_TEST)
        yes = ('/static/site/assets/index-i37Vw-z_.js', '/static/site/assets/phone-Bx9_k2Qa.css',
               '/static/site/assets/archivo-latin-wdth-normal-DYoQd8Zs.woff2', '/static/site/assets/HoldStatusPage-BxGmLAwC.js',
               '/static/site/assets/index-i37Vw-z_.3f9a2b1c4d5e.js', '/static/admin/css/base.1a2b3c4d5e6f.css')
        no = ('/static/site/index.html', '/static/site/phone.html', '/static/site/favicon.png',
              '/static/site/phone/img/hero-sofa.jpg', '/static/site/phone/eco-thrift-logo-white.svg',
              '/static/admin/css/base.css', '/assets/index-i37Vw-z_.js', '/static/site/assets/short-abc.js')
        for url in yes:
            self.assertTrue(wn.immutable_file_test('', url), url)
        for url in no:
            self.assertFalse(wn.immutable_file_test('', url), url)
