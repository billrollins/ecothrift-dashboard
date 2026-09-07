"""Anonymous print-server version check used by /manage."""
from django.test import TestCase
from rest_framework.test import APIClient


class PrintServerVersionPublicTests(TestCase):
    def test_anonymous_gets_200_when_no_release(self):
        r = APIClient().get('/api/core/system/print-server-version-public/')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data.get('available'))
