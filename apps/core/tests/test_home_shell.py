"""Homepage PUBLIC_SHELL stamp — featured grid with image floor."""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase, override_settings

from apps.core.middleware import PublicSiteMiddleware, _format_money


class FormatMoneyTests(SimpleTestCase):
    def test_whole_dollars_drop_cents(self):
        self.assertEqual(_format_money(Decimal('12.00')), '$12')

    def test_cents_kept(self):
        self.assertEqual(_format_money(Decimal('12.50')), '$12.50')


@override_settings(ONLINE_SALES_ENABLED=True)
class HomeShellTests(TestCase):
    def setUp(self):
        import apps.core.middleware as mw

        mw._home_shell_cache = None
        self.mw = PublicSiteMiddleware(lambda request: None)

    def tearDown(self):
        import apps.core.middleware as mw

        mw._home_shell_cache = None

    def _make_listing(self, *, title: str, with_image: bool = True, on_hand: int = 1,
                      reserved: int = 0, featured: bool = False):
        from apps.core.models import S3File
        from apps.webstore.models import WebListing, WebListingImage

        listing = WebListing.objects.create(
            title=title,
            status='published',
            price=Decimal('19.99'),
            on_hand=on_hand,
            reserved=reserved,
            featured=featured,
            return_policy='final_sale',
        )
        if with_image:
            s3 = S3File.objects.create(
                key=f'test/{listing.id}.jpg',
                filename='t.jpg',
                size=10,
                content_type='image/jpeg',
            )
            WebListingImage.objects.create(
                listing=listing, s3_file=s3, alt=title, position=0,
            )
        return listing

    def test_intro_always_paints(self):
        html = self.mw._build_home_shell_html()
        self.assertIn('Quality goods, fair prices, every week.', html)
        self.assertIn('Canfield store', html)

    def test_no_listings_hides_featured(self):
        html = self.mw._build_home_shell_html()
        self.assertIn('Quality goods', html)
        self.assertNotIn('id="featured"', html)

    def test_one_with_image_shows_featured(self):
        self._make_listing(title='Find 0')
        html = self.mw._build_home_shell_html()
        self.assertIn('id="featured"', html)
        self.assertIn('Find 0', html)
        self.assertIn('$19.99', html)
        self.assertIn('/api/webstore/images/', html)
        self.assertIn('Full store', html)
        self.assertNotIn('See the full online store', html)

    def test_shell_stamps_first_item_only(self):
        for i in range(12):
            self._make_listing(title=f'Many {i}')
        html = self.mw._build_home_shell_html()
        # First paint shows one large card; the SPA carousel pages the rest.
        self.assertEqual(html.count('/api/webstore/images/'), 1)
        self.assertIn('Many 11', html)  # featured/newest first

    def test_featured_sits_beside_intro(self):
        self._make_listing(title='Side 0')
        html = self.mw._build_home_shell_html()
        intro = html.index('Quality goods')
        featured = html.index('id="featured"')
        self.assertLess(intro, featured)
        self.assertIn(
            'grid-template-columns:minmax(220px,0.85fr) minmax(380px,1.85fr)',
            html,
        )

    def test_listings_without_images_excluded(self):
        self._make_listing(title='Photo 0', with_image=True)
        for i in range(3):
            self._make_listing(title=f'No photo {i}', with_image=False)
        html = self.mw._build_home_shell_html()
        self.assertIn('Photo 0', html)
        self.assertNotIn('No photo', html)

    def test_fully_reserved_listings_excluded(self):
        self._make_listing(title='Open 0')
        self._make_listing(title='All reserved', on_hand=1, reserved=1)
        html = self.mw._build_home_shell_html()
        self.assertIn('Open 0', html)
        self.assertNotIn('All reserved', html)

    def test_featured_listings_come_first(self):
        self._make_listing(title='Plain 0')
        self._make_listing(title='Star item', featured=True)
        html = self.mw._build_home_shell_html()
        # Shell stamps only the lead card — featured flag wins the sort.
        self.assertIn('Star item', html)
        self.assertNotIn('Plain 0', html)

    def test_online_note_present_when_enabled(self):
        html = self.mw._build_home_shell_html()
        self.assertIn('listed online', html)
        self.assertNotIn('Online listings are on the way', html)

    @override_settings(ONLINE_SALES_ENABLED=False)
    def test_disabled_online_sales_hides_featured_and_online_note(self):
        for i in range(6):
            self._make_listing(title=f'Item {i}')
        html = self.mw._build_home_shell_html()
        self.assertIn('Quality goods', html)
        self.assertNotIn('id="featured"', html)
        self.assertIn('Online listings are on the way', html)
        self.assertNotIn('reserve one here', html)

    def test_cache_avoids_second_build(self):
        for i in range(4):
            self._make_listing(title=f'Cached {i}')
        first = self.mw._home_shell_html()
        with patch.object(self.mw, '_build_home_shell_html', side_effect=AssertionError('rebuild')):
            second = self.mw._home_shell_html()
        self.assertEqual(first, second)
