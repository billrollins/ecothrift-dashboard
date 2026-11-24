"""Photo projects (owner 2026-11-24): who sees what, photo save and delete, Grok edit, soft delete + purge."""
import io
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.core.models import PhotoProject, ProjectPhoto, S3File
from apps.core.services import photo_projects as svc

P = '/api/core/photo-projects/'
PH = '/api/core/project-photos/'
IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def jpeg_bytes(w=64, h=48):
    buf = io.BytesIO()
    Image.new('RGB', (w, h), (200, 30, 30)).save(buf, 'JPEG')
    return buf.getvalue()


def photo():
    return SimpleUploadedFile('phone.jpg', jpeg_bytes(), content_type='image/jpeg')


@override_settings(STORAGES=IN_MEMORY)
class PhotoProjectTests(TestCase):
    def setUp(self):
        cache.delete(svc.PURGE_CACHE_KEY)
        User = get_user_model()
        employee = Group.objects.get_or_create(name='Employee')[0]
        admin = Group.objects.get_or_create(name='Admin')[0]
        self.ann = User.objects.create_user(email='ann@example.com', first_name='Ann', last_name='A', password='pw')
        self.bob = User.objects.create_user(email='bob@example.com', first_name='Bob', last_name='B', password='pw')
        self.own = User.objects.create_user(email='own@example.com', first_name='Own', last_name='O', password='pw')
        self.ann.groups.add(employee)
        self.bob.groups.add(employee)
        self.own.groups.add(admin)
        self.c = {}
        for name in ('ann', 'bob', 'own'):
            client = APIClient()
            client.force_authenticate(getattr(self, name))
            self.c[name] = client

    def make(self, **body):
        res = self.c['ann'].post(P, {'name': 'Bikes', 'description': '', **body}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def add_photo(self, pid, client='ann', code='', note=''):
        res = self.c[client].post(f'{P}{pid}/photos/', {'photo': photo(), 'code': code, 'note': note}, format='multipart')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_creator_and_owner_see_it_others_only_when_shared(self):
        pid = self.make()['id']
        self.assertEqual([p['id'] for p in self.c['own'].get(P).data], [pid])
        self.assertEqual(self.c['bob'].get(P).data, [])
        self.assertEqual(self.c['bob'].get(f'{P}{pid}/').status_code, 404)
        self.c['ann'].patch(f'{P}{pid}/', {'shared_with': [self.bob.pk]}, format='json')
        self.assertEqual([p['id'] for p in self.c['bob'].get(P).data], [pid])
        # Bob sees it but cannot rename or delete it.
        self.assertEqual(self.c['bob'].patch(f'{P}{pid}/', {'name': 'X'}, format='json').status_code, 403)
        self.assertEqual(self.c['bob'].delete(f'{P}{pid}/').status_code, 403)

    def test_photo_save_count_note_and_hard_delete(self):
        pid = self.make()['id']
        ph = self.add_photo(pid, code='NOPE123', note='scratch on left')
        self.assertEqual(ph['scanned_code'], 'NOPE123')
        self.assertEqual(ph['note'], 'scratch on left')
        self.assertEqual(self.c['ann'].get(f'{P}{pid}/').data['photo_count'], 1)
        self.assertEqual(self.c['ann'].get(f'{PH}{ph["id"]}/thumb/').status_code, 200)
        self.assertEqual(S3File.objects.count(), 2)
        self.assertEqual(self.c['ann'].delete(f'{PH}{ph["id"]}/').status_code, 204)
        self.assertFalse(ProjectPhoto.objects.exists())
        self.assertEqual(S3File.objects.count(), 0)

    def test_scanned_tag_links_the_item_and_lookup_finds_it(self):
        from apps.inventory.models import Item, Product
        product = Product.objects.create(title='Boxwood topiary')
        item = Item.objects.create(sku='ITM0000777', price=5, product=product)
        res = self.c['ann'].get(f'{P}lookup/', {'code': 'ITM0000777'})
        self.assertEqual((res.status_code, res.data['found'], res.data['title']), (200, True, 'Boxwood topiary'))
        pid = self.make()['id']
        ph = self.add_photo(pid, code='ITM0000777')
        self.assertEqual(ph['item_sku'], 'ITM0000777')
        self.assertEqual(self.c['ann'].get(f'{P}{pid}/photos/').data[0]['item_sku'], 'ITM0000777')
        self.assertEqual(ProjectPhoto.objects.get(pk=ph['id']).item_id, item.pk)

    def test_grok_edit_keeps_original_and_stores_the_copy(self):
        pid = self.make()['id']
        ph = self.add_photo(pid)
        with mock.patch.object(svc, '_spawn', side_effect=svc._work), \
                mock.patch.object(svc, '_grok', return_value=jpeg_bytes(30, 60)):
            res = self.c['ann'].post(f'{PH}{ph["id"]}/edit/', {'kind': 'square'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        row = ProjectPhoto.objects.get(pk=ph['id'])
        self.assertEqual(row.edit_status, 'done')
        self.assertIsNotNone(row.edited_id)
        self.assertIsNotNone(row.file_id)
        self.assertEqual(self.c['ann'].get(f'{PH}{ph["id"]}/edited/').status_code, 200)

    def test_failed_edit_says_so(self):
        pid = self.make()['id']
        ph = self.add_photo(pid)
        with mock.patch.object(svc, '_spawn', side_effect=svc._work), \
                mock.patch.object(svc, '_grok', side_effect=svc.PhotoError('Grok answered 500.')):
            self.c['ann'].post(f'{PH}{ph["id"]}/edit/', {'kind': 'remove_background'}, format='json')
        row = ProjectPhoto.objects.get(pk=ph['id'])
        self.assertEqual((row.edit_status, row.edit_error), ('failed', 'Grok answered 500.'))

    def test_deleted_project_hides_now_and_purges_after_30_days(self):
        pid = self.make()['id']
        self.add_photo(pid)
        self.assertEqual(self.c['ann'].delete(f'{P}{pid}/').status_code, 204)
        self.assertEqual(self.c['ann'].get(P).data, [])
        self.assertEqual(svc.purge_deleted(), 0)
        PhotoProject.objects.filter(pk=pid).update(deleted_at=timezone.now() - timedelta(days=31))
        self.assertEqual(svc.purge_deleted(), 1)
        self.assertFalse(PhotoProject.objects.exists())
        self.assertEqual(S3File.objects.count(), 0)
