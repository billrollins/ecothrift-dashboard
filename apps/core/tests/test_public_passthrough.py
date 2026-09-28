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
            for path in ('/scan', '/scan/', '/scan/list'):
                response = self._get(host, path)
                self.assertEqual((response.status_code, response.content), (200, b'dashboard'), f'{host}{path}')

    def test_other_paths_still_get_the_public_site(self):
        self.assertEqual(self._get('www.ecothrift.us', '/scanner').status_code, 301)  # to the apex, like any page
