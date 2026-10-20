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
    def test_the_wording_says_which_texts_and_no_sharing(self):
        # Owner 2026-10-20 (J18): only the sign-in code or link the customer asks for, from our own toll-free number;
        # the carriers' no-sharing line (Twilio's toll-free review compares the live pages with the submission).
        legal = _read('data/legal.ts')
        self.assertIn("'Eco-Thrift sends a text message only when you ask for one: a Thrift+ sign-in code or sign-in link", legal)
        self.assertIn('We send no marketing texts and no other texts.', legal)
        self.assertIn("'We do not share mobile numbers or text-message consent with third parties or affiliates for marketing or promotional purposes.'", legal)
        self.assertIn("'We do not sell or share your email address or phone number with anyone for their marketing.'", legal)

    def test_pages_carry_the_text_wording_and_say_how_to_stop_emails(self):
        privacy, terms = _read('pages/PrivacyPage.tsx'), _read('pages/TermsPage.tsx')
        for page in (privacy, terms):
            self.assertIn('{NO_TEXTS}', page)
            self.assertIn('unsubscribe link', page)
        self.assertIn('{SMS_NO_SHARING}', privacy)
        self.assertIn('{PRIVACY_NO_SHARING}', privacy)
        self.assertIn('reply STOP', privacy.replace('Reply STOP', 'reply STOP'))
        for needed in ('Giving an email is optional', 'never a condition of purchase', 'honor it', 'to="/privacy"',
                       'own toll-free number', 'reply STOP to any text', 'Message and data rates may apply',
                       'Texts are optional'):
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
