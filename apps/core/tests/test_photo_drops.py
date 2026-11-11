"""Photo drawer (#82): mine only, delete, mark used, the 30-day clean-up."""
import io
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.core.models import PhotoDrop, S3File
from apps.core.services import photo_drops

BASE = '/api/core/photo-drops/'
IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def photo(width=64, height=48, fmt='JPEG', name='phone.jpg'):
    buf = io.BytesIO()
    Image.new('RGB', (width, height), (20, 120, 60)).save(buf, fmt)
    return SimpleUploadedFile(name, buf.getvalue(), content_type=f'image/{fmt.lower()}')


def body(response) -> bytes:
    return b''.join(response.streaming_content)


@override_settings(STORAGES=IN_MEMORY)
class PhotoDropTests(TestCase):
    def setUp(self):
        cache.delete(photo_drops.PURGE_CACHE_KEY)
        User = get_user_model()
        employee = Group.objects.get_or_create(name='Employee')[0]
        self.ann = User.objects.create_user(email='ann@example.com', first_name='Ann', last_name='Bench', password='pw')
        self.ann.groups.add(employee)
        self.bob = User.objects.create_user(email='bob@example.com', first_name='Bob', last_name='Dock', password='pw')
        self.bob.groups.add(employee)
        self.c_ann, self.c_bob = APIClient(), APIClient()
        self.c_ann.force_authenticate(self.ann)
        self.c_bob.force_authenticate(self.bob)

    def drop(self, client=None, **kw):
        res = (client or self.c_ann).post(BASE, {'photo': photo(**kw)}, format='multipart')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def age(self, drop_id, days):
        PhotoDrop.objects.filter(pk=drop_id).update(created_at=timezone.now() - timedelta(days=days))

    # -- saving ---------------------------------------------------------------
    def test_a_drop_is_saved_as_a_jpeg_with_a_thumbnail(self):
        data = self.drop(width=4000, height=3000, fmt='PNG', name='big.png')
        row = PhotoDrop.objects.get(pk=data['id'])
        self.assertEqual(row.owner, self.ann)
        self.assertEqual((row.width, row.height), (2048, 1536))
        self.assertTrue(row.file.key.startswith(f'photo-drops/{self.ann.pk}/'))
        self.assertEqual(row.file.content_type, 'image/jpeg')
        with default_storage.open(row.file.key, 'rb') as handle:
            self.assertEqual(Image.open(handle).format, 'JPEG')
        with default_storage.open(row.thumbnail.key, 'rb') as handle:
            self.assertLessEqual(max(Image.open(handle).size), photo_drops.THUMB_EDGE)
        self.assertIsNone(data['used_at'])

    def test_a_file_that_is_not_a_photo_is_refused(self):
        bad = SimpleUploadedFile('notes.jpg', b'not a photo at all', content_type='image/jpeg')
        res = self.c_ann.post(BASE, {'photo': bad}, format='multipart')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(PhotoDrop.objects.count(), 0)

    def test_signed_out_and_customers_have_no_drawer(self):
        self.assertEqual(APIClient().get(BASE).status_code, 401)
        customer = get_user_model().objects.create_user(email='cust@example.com', first_name='Cus', last_name='Tomer', password='pw')
        customer.groups.add(Group.objects.get_or_create(name='Customer')[0])
        client = APIClient()
        client.force_authenticate(customer)
        self.assertEqual(client.get(BASE).status_code, 403)
        self.assertEqual(client.post(BASE, {'photo': photo()}, format='multipart').status_code, 403)

    # -- mine only ------------------------------------------------------------
    def test_i_see_only_my_own_drops(self):
        mine = self.drop()
        theirs = self.drop(self.c_bob)
        self.assertEqual([row['id'] for row in self.c_ann.get(BASE).data], [mine['id']])
        self.assertEqual([row['id'] for row in self.c_bob.get(BASE).data], [theirs['id']])

    def test_someone_elses_drop_is_not_found_every_way(self):
        theirs = self.drop(self.c_bob)['id']
        self.assertEqual(self.c_ann.get(f'{BASE}{theirs}/file/').status_code, 404)
        self.assertEqual(self.c_ann.get(f'{BASE}{theirs}/thumb/').status_code, 404)
        self.assertEqual(self.c_ann.post(f'{BASE}{theirs}/used/', {'where': 'Processing'}).status_code, 404)
        self.assertEqual(self.c_ann.delete(f'{BASE}{theirs}/').status_code, 404)
        row = PhotoDrop.objects.get(pk=theirs)
        self.assertIsNone(row.used_at)

    def test_the_owner_of_a_drop_can_open_the_photo_and_its_thumbnail(self):
        mine = self.drop(width=1200, height=900)['id']
        full = self.c_ann.get(f'{BASE}{mine}/file/')
        self.assertEqual(full.status_code, 200)
        self.assertEqual(full['Content-Type'], 'image/jpeg')
        self.assertEqual(Image.open(io.BytesIO(body(full))).size, (1200, 900))
        thumb = self.c_ann.get(f'{BASE}{mine}/thumb/')
        self.assertEqual(thumb.status_code, 200)
        self.assertEqual(max(Image.open(io.BytesIO(body(thumb))).size), photo_drops.THUMB_EDGE)

    # -- delete ---------------------------------------------------------------
    def test_delete_removes_the_drop_its_rows_and_its_files(self):
        mine = self.drop()['id']
        row = PhotoDrop.objects.get(pk=mine)
        keys = [row.file.key, row.thumbnail.key]
        self.assertTrue(all(default_storage.exists(key) for key in keys))
        self.assertEqual(self.c_ann.delete(f'{BASE}{mine}/').status_code, 204)
        self.assertFalse(PhotoDrop.objects.filter(pk=mine).exists())
        self.assertFalse(S3File.objects.filter(key__in=keys).exists())
        self.assertFalse(any(default_storage.exists(key) for key in keys))
        self.assertEqual(self.c_ann.get(BASE).data, [])

    # -- mark used ------------------------------------------------------------
    def test_a_used_drop_is_marked_and_stays_in_the_drawer(self):
        mine = self.drop()['id']
        res = self.c_ann.post(f'{BASE}{mine}/used/', {'where': 'Processing'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIsNotNone(res.data['used_at'])
        self.assertEqual(res.data['used_where'], 'Processing')
        listed = self.c_ann.get(BASE).data
        self.assertEqual([row['id'] for row in listed], [mine])
        self.assertIsNotNone(listed[0]['used_at'])
        # Still there to use again, and the photo still opens.
        self.assertEqual(self.c_ann.get(f'{BASE}{mine}/file/').status_code, 200)

    def test_used_needs_no_place(self):
        mine = self.drop()['id']
        res = self.c_ann.post(f'{BASE}{mine}/used/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['used_where'], '')

    # -- a turned or cropped copy ---------------------------------------------
    def test_an_edited_copy_takes_the_old_ones_place_time_and_used_mark(self):
        first = self.drop()['id']
        mine = self.drop(width=800, height=600)['id']
        self.age(mine, 2)
        self.c_ann.post(f'{BASE}{mine}/used/', {'where': 'Receiving'}, format='json')
        before = PhotoDrop.objects.get(pk=mine)
        old_keys = [before.file.key, before.thumbnail.key]
        res = self.c_ann.post(BASE, {'photo': photo(width=600, height=800), 'replaces': mine}, format='multipart')
        self.assertEqual(res.status_code, 201, res.data)
        new = PhotoDrop.objects.get(pk=res.data['id'])
        self.assertEqual((new.width, new.height), (600, 800))
        self.assertEqual(new.created_at, before.created_at)
        self.assertEqual(new.used_at, before.used_at)
        self.assertEqual(new.used_where, 'Receiving')
        self.assertFalse(PhotoDrop.objects.filter(pk=mine).exists())
        self.assertFalse(any(default_storage.exists(key) for key in old_keys))
        # Still older than the photo taken after it: it keeps its place in the drawer.
        self.assertEqual([row['id'] for row in self.c_ann.get(BASE).data], [first, new.pk])

    def test_an_edited_copy_cannot_replace_someone_elses_photo(self):
        theirs = self.drop(self.c_bob)['id']
        res = self.c_ann.post(BASE, {'photo': photo(), 'replaces': theirs}, format='multipart')
        self.assertEqual(res.status_code, 400)
        self.assertTrue(PhotoDrop.objects.filter(pk=theirs).exists())
        self.assertEqual(PhotoDrop.objects.filter(owner=self.ann).count(), 0)

    # -- the 30-day clean-up ----------------------------------------------------
    def test_clean_up_removes_drops_older_than_30_days_used_or_not(self):
        old, old_used, fresh = self.drop()['id'], self.drop()['id'], self.drop()['id']
        self.c_ann.post(f'{BASE}{old_used}/used/', {}, format='json')
        self.age(old, 31)
        self.age(old_used, 45)
        self.age(fresh, 29)
        gone = PhotoDrop.objects.get(pk=old)
        old_keys = [gone.file.key, gone.thumbnail.key]
        self.assertEqual(photo_drops.purge_old(), 2)
        self.assertEqual(list(PhotoDrop.objects.values_list('id', flat=True)), [fresh])
        self.assertFalse(any(default_storage.exists(key) for key in old_keys))
        self.assertFalse(S3File.objects.filter(key__in=old_keys).exists())

    def test_opening_a_drawer_runs_the_clean_up_for_everyone_once_an_hour(self):
        anns_old, bobs_old = self.drop()['id'], self.drop(self.c_bob)['id']
        self.age(anns_old, 40)
        self.age(bobs_old, 40)
        self.assertEqual(self.c_ann.get(BASE).data, [])
        self.assertEqual(PhotoDrop.objects.count(), 0)
        # Inside the same hour the list does not sweep again.
        later = self.drop()['id']
        self.age(later, 40)
        self.assertEqual([row['id'] for row in self.c_ann.get(BASE).data], [later])

    def test_the_command_runs_the_clean_up(self):
        old = self.drop()['id']
        self.age(old, 31)
        out = io.StringIO()
        call_command('purge_photo_drops', stdout=out)
        self.assertIn('Removed 1 photo drops', out.getvalue())
        self.assertFalse(PhotoDrop.objects.filter(pk=old).exists())
