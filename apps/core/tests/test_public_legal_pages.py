"""The public Privacy Policy and Terms pages (house standard: texting, D17).

The phone carriers read these pages before they approve Eco-Thrift's text sender, and they look for
exact sentences. These tests read the public site's source, so a reworded sentence, a removed
route or a dropped footer link fails here instead of at the carrier.
"""

from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase, TestCase

PUBLIC_SRC = Path(settings.BASE_DIR) / 'frontend-public' / 'src'


def _read(rel: str) -> str:
    return (PUBLIC_SRC / rel).read_text(encoding='utf-8')


class PublicLegalPagesSourceTests(SimpleTestCase):
    def test_required_wording_is_word_for_word(self):
        legal = _read('data/legal.ts')
        self.assertIn(
            "'We do not share mobile numbers or text-message consent with third parties or affiliates "
            "for marketing or promotional purposes.'",
            legal,
        )
        self.assertIn("'Message and data rates may apply.'", legal)

    def test_pages_show_the_required_sentences_and_the_program_facts(self):
        privacy, terms = _read('pages/PrivacyPage.tsx'), _read('pages/TermsPage.tsx')
        self.assertIn('{PRIVACY_NO_SHARING}', privacy)
        self.assertIn('replying STOP', privacy)
        self.assertIn('{TERMS_RATES}', terms)
        for needed in ('STOP', 'HELP', 'START', 'Consent is not a condition of purchase', 'message frequency varies',
                       'Carriers are not liable', 'to="/privacy"'):
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
