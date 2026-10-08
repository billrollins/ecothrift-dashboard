"""The public Privacy Policy and Terms pages (email-first: house decision D20, 2026-10-08).

Eco-Thrift sends no text messages, so neither page may carry a text-messaging program; both say so, and both say
how to stop our emails. These tests read the public site's source, so a dropped sentence, a removed route or a
dropped footer link fails here.
"""

from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase, TestCase

PUBLIC_SRC = Path(settings.BASE_DIR) / 'frontend-public' / 'src'


def _read(rel: str) -> str:
    return (PUBLIC_SRC / rel).read_text(encoding='utf-8')


class PublicLegalPagesSourceTests(SimpleTestCase):
    def test_the_wording_says_no_texts_and_no_sharing(self):
        legal = _read('data/legal.ts')
        self.assertIn("'Eco-Thrift does not currently send text messages.'", legal)
        self.assertIn("'We do not sell or share your email address or phone number with anyone for their marketing.'", legal)

    def test_pages_carry_no_text_program_and_say_how_to_stop_emails(self):
        privacy, terms = _read('pages/PrivacyPage.tsx'), _read('pages/TermsPage.tsx')
        for page in (privacy, terms):
            self.assertIn('{NO_TEXTS}', page)
            self.assertIn('unsubscribe link', page)
            for gone in ('Reply STOP', 'replying STOP', 'Message and data rates', 'Carriers are not liable'):
                self.assertNotIn(gone, page, gone)
        self.assertIn('{PRIVACY_NO_SHARING}', privacy)
        for needed in ('Giving an email is optional', 'never a condition of purchase', 'honor it', 'to="/privacy"'):
            self.assertIn(needed, terms, needed)

    def test_routes_exist_and_the_footer_links_to_both(self):
        app, layout = _read('App.tsx'), _read('components/Layout.tsx')
        self.assertIn('path="privacy"', app)
        self.assertIn('path="terms"', app)
        self.assertIn('to="/privacy"', layout)
        self.assertIn('to="/terms"', layout)


class PublicLegalPagesSitemapTests(TestCase):
    def test_sitemap_lists_both_pages(self):
        body = self.client.get('/sitemap.xml').content.decode()
        self.assertIn('/privacy</loc>', body)
        self.assertIn('/terms</loc>', body)
