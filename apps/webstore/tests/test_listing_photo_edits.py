"""Listing photos keep their original and the editor's edits; the photo is rebuilt from the two (Bill, 2026-10-28)."""
from __future__ import annotations

import json

from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.models import S3File
from apps.webstore.models import WebListingImage
from apps.webstore.services.listing_photos import parse_edits_payload, ListingPhotoError
from apps.webstore.tests.test_listing_images import (
    STORAGES, _jpeg_bytes, _listing, _manager, _open_stored, _variant,
)


@override_settings(STORAGES=STORAGES)
class ListingPhotoEditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(_manager())
        self.listing = _listing()
        self.base = f'/api/webstore/listings/{self.listing.id}/images/'

    def _upload(self, raw, edits=None, crops=None):
        data = {'file': SimpleUploadedFile('phone.jpg', raw, content_type='image/jpeg')}
        if edits is not None:
            data['edits'] = json.dumps(edits)
        if crops is not None:
            data['crops'] = json.dumps(crops)
        res = self.client.post(self.base, data, format='multipart')
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def _image(self, pk):
        return WebListingImage.objects.select_related('s3_file', 'original').prefetch_related('variants__s3_file').get(pk=pk)

    def test_upload_keeps_the_original_and_applies_the_edits(self):
        # 1200x800, left half red: turn 90 clockwise, then keep the top half.
        body = self._upload(_jpeg_bytes(1200, 800, left_color=(220, 20, 20)),
                            edits={'rotate': 90, 'crop': {'x': 0, 'y': 0, 'w': 100, 'h': 50}, 'brightness': 100,
                                   'contrast': 100})
        self.assertTrue(body['has_original'])
        self.assertEqual(body['edits']['rotate'], 90)
        image = self._image(body['id'])
        self.assertEqual(_open_stored(image.original.key).size, (1200, 800))
        full = _open_stored(image.s3_file.key)
        self.assertEqual(full.size, (800, 600))    # turned to 800x1200, top half kept
        # Turned clockwise, the red left half is now on top: the kept part is all red.
        r, g, b = full.getpixel((400, 300))
        self.assertGreater(r, 180)
        self.assertLess(g, 80)

    def test_frames_from_the_editor_are_percents_of_the_edited_photo(self):
        body = self._upload(_jpeg_bytes(1600, 1200), edits={'rotate': 0},
                            crops={'main': {'x': 25, 'y': 25, 'w': 50, 'h': 50}})
        main = body['crops']['main']
        self.assertFalse(main['derived'])
        self.assertEqual((main['x'], main['y'], main['w'], main['h']), (400, 300, 800, 600))

    def test_brightness_matches_the_editor(self):
        body = self._upload(_jpeg_bytes(400, 300, color=(100, 100, 100)), edits={'brightness': 150})
        full = _open_stored(self._image(body['id']).s3_file.key)
        self.assertAlmostEqual(full.getpixel((200, 150))[0], 150, delta=4)

    def test_edit_rebuilds_from_the_original_and_can_be_undone(self):
        body = self._upload(_jpeg_bytes(1200, 800), edits={'rotate': 90})
        image = self._image(body['id'])
        old_full_key = image.s3_file.key
        res = self.client.patch(f"{self.base}{body['id']}/", {'edits': {'rotate': 0}}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual((res.json()['width'], res.json()['height']), (1200, 800))
        image = self._image(body['id'])
        self.assertEqual(_open_stored(image.original.key).size, (1200, 800))    # untouched
        self.assertFalse(default_storage.exists(old_full_key))
        self.assertEqual(_open_stored(_variant(image, 'main').s3_file.key).size, (1600, 1200))

    def test_a_new_shape_resets_hand_frames_and_the_same_shape_keeps_them(self):
        body = self._upload(_jpeg_bytes(1600, 1200), edits={},
                            crops={'main': {'x': 25, 'y': 25, 'w': 50, 'h': 50}})
        url = f"{self.base}{body['id']}/"
        same = self.client.patch(url, {'edits': {'brightness': 120}}, format='json').json()
        self.assertFalse(same['crops']['main']['derived'])
        self.assertEqual(same['crops']['main']['w'], 800)
        turned = self.client.patch(url, {'edits': {'brightness': 120, 'rotate': 90}}, format='json').json()
        self.assertTrue(turned['crops']['main']['derived'])

    def test_the_editor_sends_every_hand_frame_so_a_reset_sticks(self):
        body = self._upload(_jpeg_bytes(1600, 1200), edits={},
                            crops={'main': {'x': 25, 'y': 25, 'w': 50, 'h': 50}})
        res = self.client.patch(f"{self.base}{body['id']}/", {'edits': {}, 'crops': {}}, format='json').json()
        self.assertTrue(res['crops']['main']['derived'])
        res = self.client.patch(f"{self.base}{body['id']}/",
                                {'edits': {}, 'crops': {'thumb': {'x': 0, 'y': 0, 'w': 50, 'h': 50}}},
                                format='json').json()
        self.assertFalse(res['crops']['thumb']['derived'])
        self.assertEqual(res['crops']['thumb']['w'], 800)

    def test_an_old_photo_gets_its_full_jpeg_as_original_on_first_edit(self):
        res = self.client.post(self.base, {'file': SimpleUploadedFile('old.jpg', _jpeg_bytes(800, 600),
                                                                      content_type='image/jpeg')}, format='multipart')
        pk = res.json()['id']
        WebListingImage.objects.filter(pk=pk).update(original=None)    # as photos saved before originals were kept
        S3File.objects.filter(key__contains='/originals/').delete()
        res = self.client.patch(f'{self.base}{pk}/', {'edits': {'rotate': 90}}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['has_original'])
        self.assertEqual(_open_stored(self._image(pk).original.key).size, (800, 600))

    def test_original_endpoint_is_staff_only(self):
        body = self._upload(_jpeg_bytes(640, 480), edits={'rotate': 180})
        res = self.client.get(f"{self.base}{body['id']}/original/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'image/jpeg')
        self.assertIn(APIClient().get(f"{self.base}{body['id']}/original/").status_code, (401, 403))

    def test_delete_removes_the_original_too(self):
        body = self._upload(_jpeg_bytes(640, 480), edits={})
        key = self._image(body['id']).original.key
        self.assertEqual(self.client.delete(f"{self.base}{body['id']}/").status_code, 204)
        self.assertFalse(default_storage.exists(key))

    def test_edits_are_checked(self):
        self.assertEqual(parse_edits_payload({'rotate': 450, 'brightness': 400}),
                         {'rotate': 90, 'brightness': 150, 'contrast': 100, 'crop': None})
        self.assertIsNone(parse_edits_payload({'crop': {'x': 0, 'y': 0, 'w': 100, 'h': 100}})['crop'])
        with self.assertRaises(ListingPhotoError):
            parse_edits_payload({'rotate': 45})
        res = self.client.patch(f"{self.base}0/", {'edits': {'rotate': 45}}, format='json')
        self.assertEqual(res.status_code, 404)
