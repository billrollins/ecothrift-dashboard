"""Listing photo slots: upload, derivation, reframe, proxy, backfill."""
from __future__ import annotations

import io
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.models import WebListing, WebListingImage
from apps.webstore.services.listing_photos import SLOT_SPECS
from apps.webstore.tests.helpers import make_verified_hold


STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.memory.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def _jpeg_bytes(width: int, height: int, color=(40, 90, 140), left_color=None) -> bytes:
    img = Image.new('RGB', (width, height), color)
    if left_color is not None:
        img.paste(Image.new('RGB', (width // 2, height), left_color), (0, 0))
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=90)
    return buf.getvalue()


def _exif_oriented_portrait() -> bytes:
    img = Image.new('RGB', (600, 800), (220, 80, 20))
    exif = img.getexif()
    exif[0x0112] = 6
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=90, exif=exif)
    return buf.getvalue()


def _manager(email='listing-photo-mgr@example.com'):
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email=email,
        first_name='Photo',
        last_name='Manager',
        password='test-pass-123',
    )
    user.groups.add(group)
    return user


def _listing(**kwargs):
    defaults = dict(
        title='Photo Lamp',
        slug=kwargs.pop('slug', 'photo-lamp'),
        price=Decimal('25.00'),
        on_hand=1,
        reserved=0,
        status='draft',
        return_policy='final_sale',
    )
    defaults.update(kwargs)
    listing = WebListing.objects.create(**defaults)
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


def _open_stored(key: str) -> Image.Image:
    with default_storage.open(key, 'rb') as fh:
        im = Image.open(fh)
        im.load()
        return im


def _variant(image: WebListingImage, slot: str):
    return image.variants.get(slot=slot)


@override_settings(STORAGES=STORAGES)
class ListingImageSlotTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mgr = _manager()
        self.client.force_authenticate(self.mgr)
        self.listing = _listing()

    def _upload(self, raw: bytes, name='lamp.jpg', crops=None, alt=''):
        data = {
            'file': SimpleUploadedFile(name, raw, content_type='image/jpeg'),
            'alt': alt,
        }
        if crops is not None:
            data['crops'] = crops
        return self.client.post(
            f'/api/webstore/listings/{self.listing.id}/images/',
            data,
            format='multipart',
        )

    def test_upload_creates_all_slots(self):
        r = self._upload(_jpeg_bytes(3000, 2000))
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body['width'], 2048)
        self.assertEqual(body['height'], 1365)
        self.assertTrue(body['urls']['full'].endswith(f"/images/{body['id']}/"))
        self.assertTrue(body['urls']['main'].endswith('/main/'))
        self.assertTrue(body['urls']['grid'].endswith('/grid/'))
        self.assertTrue(body['urls']['thumb'].endswith('/thumb/'))
        image = WebListingImage.objects.prefetch_related('variants__s3_file').get(pk=body['id'])
        for slot, spec in SLOT_SPECS.items():
            variant = _variant(image, slot)
            stored = _open_stored(variant.s3_file.key)
            self.assertEqual(stored.size, (spec['width'], spec['height']))
        main = body['crops']['main']
        grid = body['crops']['grid']
        self.assertEqual((main['x'], main['y'], main['w'], main['h']), (grid['x'], grid['y'], grid['w'], grid['h']))
        self.assertTrue(grid['derived'])
        thumb = body['crops']['thumb']
        self.assertTrue(thumb['derived'])
        self.assertEqual(thumb['w'], thumb['h'])
        self.assertGreaterEqual(thumb['x'], main['x'])
        self.assertLessEqual(thumb['x'] + thumb['w'], main['x'] + main['w'])

    def test_explicit_grid_and_thumb_survive_main_reframe(self):
        created = self._upload(
            _jpeg_bytes(1600, 1200),
            crops='{"main":{"x":0,"y":0,"w":1600,"h":1200},"grid":{"x":0,"y":0,"w":800,"h":600},"thumb":{"x":0,"y":0,"w":400,"h":400}}',
        )
        self.assertEqual(created.status_code, 201, created.content)
        image_id = created.json()['id']
        r = self.client.patch(
            f'/api/webstore/listings/{self.listing.id}/images/{image_id}/',
            {'crops': {'main': {'x': 200, 'y': 0, 'w': 1200, 'h': 900}}},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        crops = r.json()['crops']
        self.assertEqual(crops['main']['x'], 200)
        self.assertFalse(crops['main']['derived'])
        self.assertEqual((crops['grid']['x'], crops['grid']['w']), (0, 800))
        self.assertFalse(crops['grid']['derived'])
        self.assertEqual((crops['thumb']['x'], crops['thumb']['w']), (0, 400))
        self.assertFalse(crops['thumb']['derived'])

    def test_derived_grid_follows_main_reframe(self):
        created = self._upload(_jpeg_bytes(1600, 1200))
        image_id = created.json()['id']
        r = self.client.patch(
            f'/api/webstore/listings/{self.listing.id}/images/{image_id}/',
            {'crops': {'main': {'x': 200, 'y': 0, 'w': 1200, 'h': 900}}},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        crops = r.json()['crops']
        self.assertEqual(
            (crops['grid']['x'], crops['grid']['y'], crops['grid']['w'], crops['grid']['h']),
            (crops['main']['x'], crops['main']['y'], crops['main']['w'], crops['main']['h']),
        )
        self.assertTrue(crops['grid']['derived'])

    def test_exif_orientation_honored(self):
        r = self._upload(_exif_oriented_portrait(), name='phone.jpg')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()['width'], r.json()['height']), (800, 600))

    def test_invalid_image_400(self):
        r = self._upload(b'not-an-image', name='nope.txt')
        self.assertEqual(r.status_code, 400)

    def test_delete_removes_full_and_variants(self):
        created = self._upload(_jpeg_bytes(800, 600))
        image = WebListingImage.objects.prefetch_related('variants__s3_file').get(
            pk=created.json()['id'],
        )
        keys = [image.s3_file.key] + [v.s3_file.key for v in image.variants.all()]
        s3_ids = [image.s3_file_id] + [v.s3_file_id for v in image.variants.all()]
        r = self.client.delete(
            f'/api/webstore/listings/{self.listing.id}/images/{image.id}/',
        )
        self.assertEqual(r.status_code, 204)
        self.assertFalse(WebListingImage.objects.filter(pk=image.id).exists())
        self.assertFalse(S3File.objects.filter(pk__in=s3_ids).exists())
        for key in keys:
            self.assertFalse(default_storage.exists(key))

    def test_proxy_slots_and_fallback(self):
        created = self._upload(_jpeg_bytes(800, 600))
        image_id = created.json()['id']
        for path in (
            f'/api/webstore/images/{image_id}/',
            f'/api/webstore/images/{image_id}/main/',
            f'/api/webstore/images/{image_id}/grid/',
            f'/api/webstore/images/{image_id}/thumb/',
            f'/api/webstore/images/{image_id}/display/',
        ):
            r = self.client.get(path)
            self.assertIn(r.status_code, (200, 302), path)
        image = WebListingImage.objects.get(pk=image_id)
        image.variants.filter(slot='thumb').delete()
        r = self.client.get(f'/api/webstore/images/{image_id}/thumb/')
        self.assertIn(r.status_code, (200, 302))

    def test_public_urls_use_slots(self):
        self.listing.status = 'published'
        self.listing.save(update_fields=['status'])
        created = self._upload(_jpeg_bytes(800, 600))
        image_id = created.json()['id']
        hold = make_verified_hold(
            listing=self.listing,
            quantity=1,
            customer_name='Buyer',
            email='buyer@example.com',
        )
        self.client.force_authenticate(None)
        with override_settings(ONLINE_SALES_ENABLED=True):
            catalog = self.client.get('/api/webstore/catalog/')
            detail = self.client.get(f'/api/webstore/catalog/{self.listing.slug}/')
            hold_r = self.client.get(f'/api/webstore/holds/{hold.status_token}/')
        self.assertEqual(catalog.status_code, 200, catalog.content)
        self.assertEqual(detail.status_code, 200, detail.content)
        self.assertEqual(hold_r.status_code, 200, hold_r.content)
        self.assertTrue(catalog.json()['results'][0]['image']['url'].endswith(f'/images/{image_id}/grid/'))
        public_im = detail.json()['images'][0]
        self.assertTrue(public_im['url'].endswith('/main/'))
        self.assertTrue(public_im['urls']['full'].endswith(f'/images/{image_id}/'))
        self.assertTrue(hold_r.json()['listing_image']['url'].endswith('/thumb/'))

    def test_backfill_regenerate(self):
        raw = _jpeg_bytes(1600, 1200)
        key = default_storage.save(
            f'webstore/listings/{self.listing.id}/legacy.jpg',
            ContentFile(raw, name='legacy.jpg'),
        )
        s3 = S3File.objects.create(
            key=key,
            filename='legacy.jpg',
            size=len(raw),
            content_type='image/jpeg',
            uploaded_by=self.mgr,
        )
        image = WebListingImage.objects.create(
            listing=self.listing,
            s3_file=s3,
            position=0,
            width=1600,
            height=1200,
        )
        call_command('backfill_listing_image_variants', listing=self.listing.id)
        image.refresh_from_db()
        self.assertEqual(image.variants.count(), 3)
        main = _variant(image, 'main')
        self.assertEqual((main.width, main.height), (1600, 1200))
        call_command('backfill_listing_image_variants', listing=self.listing.id)
        self.assertEqual(image.variants.count(), 3)
        main.width = 1200
        main.height = 900
        main.save(update_fields=['width', 'height'])
        call_command('backfill_listing_image_variants', listing=self.listing.id, regenerate=True)
        main.refresh_from_db()
        self.assertEqual((main.width, main.height), (1600, 1200))
        stored = _open_stored(main.s3_file.key)
        self.assertEqual(stored.size, (1600, 1200))
