"""Listing CRUD polish: publish bypass, delete with holds, mark sold, config URL."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.inventory.models import Item, Product
from apps.webstore.models import WebListing, WebListingImage
from apps.webstore.tests.helpers import make_verified_hold


def _manager(email='listing-crud-mgr@example.com'):
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email=email,
        first_name='Listing',
        last_name='Manager',
        password='test-pass-123',
    )
    user.groups.add(group)
    return user


def _listing_with_photo(**kwargs):
    defaults = dict(
        title='CRUD Lamp',
        slug=kwargs.pop('slug', 'crud-lamp'),
        price=Decimal('40.00'),
        on_hand=1,
        reserved=0,
        status='draft',
        return_policy='final_sale',
    )
    defaults.update(kwargs)
    listing = WebListing.objects.create(**defaults)
    s3 = S3File.objects.create(
        key=f'test/crud-{listing.id}.jpg',
        filename='t.jpg',
        size=10,
        content_type='image/jpeg',
    )
    WebListingImage.objects.create(listing=listing, s3_file=s3, position=0, alt='lamp')
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


class PublishBypassTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mgr = _manager()
        self.client.force_authenticate(self.mgr)
        self.listing = _listing_with_photo()

    def test_patch_status_published_rejected(self):
        r = self.client.patch(
            f'/api/webstore/listings/{self.listing.id}/',
            {'status': 'published'},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn('publish', str(r.json()).lower())
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, 'draft')

    def test_create_status_published_rejected(self):
        r = self.client.post(
            '/api/webstore/listings/',
            {
                'title': 'Bypass attempt',
                'price': '12.00',
                'on_hand': 1,
                'status': 'published',
                'return_policy': 'final_sale',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertFalse(WebListing.objects.filter(title='Bypass attempt').exists())

    def test_publish_action_still_works(self):
        r = self.client.post(f'/api/webstore/listings/{self.listing.id}/publish/')
        self.assertEqual(r.status_code, 200, r.content)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, 'published')


class DeleteWithActiveHoldTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mgr = _manager('delete-hold-mgr@example.com')
        self.client.force_authenticate(self.mgr)
        self.listing = _listing_with_photo(slug='delete-hold-lamp', status='published')

    def test_delete_blocked_when_active_hold(self):
        make_verified_hold(
            listing=self.listing,
            quantity=1,
            customer_name='Hold Buyer',
            email='holdbuyer@example.com',
        )
        r = self.client.delete(f'/api/webstore/listings/{self.listing.id}/')
        self.assertEqual(r.status_code, 409)
        self.assertIn('active holds', r.json().get('detail', '').lower())
        self.assertTrue(WebListing.objects.filter(pk=self.listing.id).exists())

    def test_delete_ok_without_active_hold(self):
        r = self.client.delete(f'/api/webstore/listings/{self.listing.id}/')
        self.assertEqual(r.status_code, 204)
        self.assertFalse(WebListing.objects.filter(pk=self.listing.id).exists())


class MarkSoldAndImageAltTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mgr = _manager('mark-sold-mgr@example.com')
        self.client.force_authenticate(self.mgr)
        self.listing = _listing_with_photo(slug='sold-lamp', status='published')

    def test_mark_sold_action(self):
        r = self.client.post(f'/api/webstore/listings/{self.listing.id}/mark-sold/')
        self.assertEqual(r.status_code, 200, r.content)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, 'sold')

    def test_patch_status_sold_rejected(self):
        r = self.client.patch(
            f'/api/webstore/listings/{self.listing.id}/',
            {'status': 'sold'},
            format='json',
        )
        self.assertEqual(r.status_code, 400)

    def test_patch_image_alt(self):
        image = self.listing.images.first()
        r = self.client.patch(
            f'/api/webstore/listings/{self.listing.id}/images/{image.id}/',
            {'alt': 'Updated alt'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        image.refresh_from_db()
        self.assertEqual(image.alt, 'Updated alt')


class WorkQueueExistingListingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mgr = _manager('wq-mgr@example.com')
        self.client.force_authenticate(self.mgr)
        product = Product.objects.create(title='Queue Item')
        self.item = Item.objects.create(
            sku='WQ-1',
            product=product,
            price=Decimal('15.00'),
            status='on_shelf',
            location='online_sales',
        )

    def test_existing_listing_id_present(self):
        listing = _listing_with_photo(
            slug='wq-draft',
            status='draft',
            item=self.item,
            sku='WQ-1',
        )
        r = self.client.get('/api/webstore/work-queue/')
        self.assertEqual(r.status_code, 200)
        items = r.json().get('items') or []
        match = next((it for it in items if it['id'] == self.item.id), None)
        self.assertIsNotNone(match)
        self.assertEqual(match['existing_listing_id'], listing.id)

    def test_existing_listing_id_null_when_none(self):
        r = self.client.get('/api/webstore/work-queue/')
        self.assertEqual(r.status_code, 200)
        items = r.json().get('items') or []
        match = next((it for it in items if it['id'] == self.item.id), None)
        self.assertIsNotNone(match)
        self.assertIsNone(match['existing_listing_id'])


@override_settings(ONLINE_SALES_PUBLIC_BASE_URL='https://preview.example/')
class ConfigPublicBaseUrlTests(TestCase):
    def test_config_exposes_public_base_url(self):
        r = APIClient().get('/api/webstore/config/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json().get('public_base_url'), 'https://preview.example')


class WorkQueueRemoveItemTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mgr = _manager('wq-remove-mgr@example.com')
        self.client.force_authenticate(self.mgr)
        product = Product.objects.create(title='Remove Me')
        self.item = Item.objects.create(
            sku='RM-1',
            product=product,
            price=Decimal('12.00'),
            status='on_shelf',
            location='online_sales',
        )

    def test_remove_moves_to_on_shelf(self):
        r = self.client.post(f'/api/webstore/work-queue/{self.item.id}/remove/')
        self.assertEqual(r.status_code, 200, r.content)
        self.item.refresh_from_db()
        self.assertEqual(self.item.location, 'on_shelf')
        self.assertEqual(r.json()['location'], 'on_shelf')

    def test_remove_rejects_when_not_on_queue(self):
        self.item.location = 'on_shelf'
        self.item.save(update_fields=['location'])
        r = self.client.post(f'/api/webstore/work-queue/{self.item.id}/remove/')
        self.assertEqual(r.status_code, 400)


class ListingFacebookFilterTests(TestCase):
    def setUp(self):
        from django.utils import timezone

        self.client = APIClient()
        self.mgr = _manager('fb-filter-mgr@example.com')
        self.client.force_authenticate(self.mgr)
        self.posted = _listing_with_photo(
            slug='fb-posted',
            title='Posted lamp',
            status='published',
            fb_posted_at=timezone.now(),
            fb_posted_url='https://facebook.com/posts/1',
        )
        self.not_posted = _listing_with_photo(
            slug='fb-not-posted',
            title='Quiet lamp',
            status='published',
        )

    def test_fb_posted_1_only_posted(self):
        r = self.client.get('/api/webstore/listings/', {'fb_posted': '1'})
        self.assertEqual(r.status_code, 200)
        ids = {row['id'] for row in r.json()['results']}
        self.assertIn(self.posted.id, ids)
        self.assertNotIn(self.not_posted.id, ids)
        row = next(x for x in r.json()['results'] if x['id'] == self.posted.id)
        self.assertIsNotNone(row['fb_posted_at'])
        self.assertEqual(row['fb_posted_url'], 'https://facebook.com/posts/1')

    def test_fb_posted_0_only_not_posted(self):
        r = self.client.get('/api/webstore/listings/', {'fb_posted': '0'})
        self.assertEqual(r.status_code, 200)
        ids = {row['id'] for row in r.json()['results']}
        self.assertIn(self.not_posted.id, ids)
        self.assertNotIn(self.posted.id, ids)
