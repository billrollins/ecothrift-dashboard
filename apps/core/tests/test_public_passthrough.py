"""The public host passes the Thrift+ scanner (/scan) through to the dashboard app."""
from __future__ import annotations

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings

from apps.core.middleware import PublicSiteMiddleware


@override_settings(
    PUBLIC_SITE_HOSTS=['ecothrift.us', 'www.ecothrift.us'], PUBLIC_SITE_CANONICAL_HOST='ecothrift.us',
    ALLOWED_HOSTS=['ecothrift.us', 'www.ecothrift.us'],
)
class ScannerPassthroughTests(SimpleTestCase):
    def _get(self, host, path):
        middleware = PublicSiteMiddleware(lambda request: HttpResponse('dashboard'))
        return middleware(RequestFactory().get(path, HTTP_HOST=host))

    def test_scan_reaches_the_dashboard_on_both_public_hosts(self):
        for host in ('www.ecothrift.us', 'ecothrift.us'):
            for path in ('/scan', '/scan/', '/scan/list', '/qr', '/qr/', '/card', '/join', '/join/'):  # /qr: the Member QR (owner 2026-10-14); /join (10-15)
                response = self._get(host, path)
                self.assertEqual((response.status_code, response.content), (200, b'dashboard'), f'{host}{path}')

    def test_other_paths_still_get_the_public_site(self):
        self.assertEqual(self._get('www.ecothrift.us', '/scanner').status_code, 301)  # to the apex, like any page

    def test_the_sms_opt_in_screenshot_reaches_django(self):
        response = self._get('ecothrift.us', '/sms-opt-in.png')
        self.assertEqual((response.status_code, response.content), (200, b'dashboard'))

    def test_the_interview_short_link_reaches_django_on_both_public_hosts(self):
        for host in ('www.ecothrift.us', 'ecothrift.us'):
            response = self._get(host, '/i/k3X9pQr')
            self.assertEqual((response.status_code, response.content), (200, b'dashboard'), host)


@override_settings(
    PUBLIC_SITE_HOSTS=['ecothrift.us', 'www.ecothrift.us'], PUBLIC_SITE_CANONICAL_HOST='ecothrift.us',
    STAFF_DASHBOARD_HOST='dash.ecothrift.us', ALLOWED_HOSTS=['ecothrift.us', 'www.ecothrift.us', 'dash.ecothrift.us', 'localhost'],
)
class MemberAppOffDashTests(SimpleTestCase):
    """Owner 2026-10-16: Thrift+ Member installs from ecothrift.us only; dash.ecothrift.us/staff is Thrift+ Staff."""

    def _get(self, host, path):
        middleware = PublicSiteMiddleware(lambda request: HttpResponse('dashboard'))
        return middleware(RequestFactory().get(path, HTTP_HOST=host))

    def test_member_pages_on_the_dash_host_go_to_ecothrift_us_with_the_query(self):
        response = self._get('dash.ecothrift.us', '/scan?x=1')
        self.assertEqual((response.status_code, response['Location']), (302, 'https://ecothrift.us/scan?x=1'))
        for path in ('/scan', '/scan/list', '/qr', '/card', '/join/'):
            response = self._get('dash.ecothrift.us', path)
            self.assertEqual((response.status_code, response['Location']), (302, f'https://ecothrift.us{path}'), path)

    def test_the_public_host_still_serves_the_member_pages(self):
        response = self._get('ecothrift.us', '/scan')
        self.assertEqual((response.status_code, response.content), (200, b'dashboard'))

    def test_the_staff_app_and_dash_pages_are_served_on_the_dash_host(self):
        for path in ('/staff/', '/staff/finalize', '/staff/scan', '/dashboard', '/scanner', '/api/thriftplus/public/session/'):
            response = self._get('dash.ecothrift.us', path)
            self.assertEqual((response.status_code, response.content), (200, b'dashboard'), path)

    def test_local_dev_keeps_the_scanner(self):
        response = self._get('localhost', '/scan')
        self.assertEqual((response.status_code, response.content), (200, b'dashboard'))


class AccountPagesTests(SimpleTestCase):
    """Owner 2026-10-15: the site's own account pages load directly; only Shopify's old account addresses move."""

    def test_the_sites_account_pages_are_not_rewritten(self):
        from apps.core.middleware import rewrite_legacy_path

        for path in ('/account', '/account/', '/account/sign-in', '/account/history', '/account/messages'):
            self.assertIsNone(rewrite_legacy_path(path), path)

    def test_shopify_account_addresses_move(self):
        from apps.core.middleware import rewrite_legacy_path

        self.assertEqual(rewrite_legacy_path('/account/login'), '/account/sign-in')
        self.assertEqual(rewrite_legacy_path('/account/register'), '/account/sign-in')
        self.assertEqual(rewrite_legacy_path('/account/orders/abc123'), '/account')
        self.assertEqual(rewrite_legacy_path('/account/addresses'), '/account')


class SmsOptInRedirectTests(SimpleTestCase):
    def test_the_address_given_to_twilio_redirects_to_the_image(self):
        response = self.client.get('/sms-opt-in.png')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], '/static/site/sms-opt-in.png')
