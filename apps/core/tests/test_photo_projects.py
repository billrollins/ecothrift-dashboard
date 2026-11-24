"""Photo projects (owner 2026-11-24): who sees what, photo save and delete, soft delete + purge; the photo editor's
versions (Dash #209): Edit uploads, AI runs through the image router, Main, delete, stale runs, Run again."""
import base64
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

from apps.core.models import AIUsage, PhotoProject, ProjectPhoto, ProjectPhotoVersion, S3File
from apps.core.services import photo_projects as svc

P = '/api/core/photo-projects/'
PH = '/api/core/project-photos/'
PV = '/api/core/photo-versions/'
IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def jpeg_bytes(w=64, h=48, color=(200, 30, 30)):
    buf = io.BytesIO()
    Image.new('RGB', (w, h), color).save(buf, 'JPEG')
    return buf.getvalue()


def png_bytes(w=40, h=40, alpha=0):
    buf = io.BytesIO()
    img = Image.new('RGBA', (w, h), (10, 200, 10, 255))
    img.putpixel((0, 0), (0, 0, 0, alpha))
    img.save(buf, 'PNG')
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
        self.assertEqual((ph['versions'], ph['main']), ([], None))
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

    def test_deleted_project_hides_now_and_purges_after_30_days(self):
        pid = self.make()['id']
        ph = self.add_photo(pid)
        self.upload(ph['id'], jpeg_bytes())
        self.assertEqual(self.c['ann'].delete(f'{P}{pid}/').status_code, 204)
        self.assertEqual(self.c['ann'].get(P).data, [])
        self.assertEqual(svc.purge_deleted(), 0)
        PhotoProject.objects.filter(pk=pid).update(deleted_at=timezone.now() - timedelta(days=31))
        self.assertEqual(svc.purge_deleted(), 1)
        self.assertFalse(PhotoProject.objects.exists())
        self.assertFalse(ProjectPhotoVersion.objects.exists())
        self.assertEqual(S3File.objects.count(), 0)

    # -- Versions (Dash #209) ---------------------------------------------------------------------------------

    def upload(self, photo_id, data, name='edit.jpg', made_from=None, caption='Crop 1:1', client='ann'):
        body = {'file': SimpleUploadedFile(name, data), 'caption': caption}
        if made_from is not None:
            body['made_from'] = made_from
        return self.c[client].post(f'{PH}{photo_id}/versions/', body, format='multipart')

    def run_ai(self, photo_id, answer=None, error=None, **body):
        from apps.core.services.image_router import ImageError

        out = {'b64': base64.b64encode(answer or jpeg_bytes(48, 64)).decode(), 'content_type': 'image/jpeg'}
        side = ImageError(error) if error else None
        with mock.patch.object(svc, '_spawn', side_effect=svc._work), \
                mock.patch('apps.core.services.image_router.edit_image', return_value=out, side_effect=side) as call:
            res = self.c['ann'].post(f'{PH}{photo_id}/ai/', body, format='json')
        return res, call

    def test_edit_upload_keeps_see_through_as_png_and_jpeg_as_jpeg(self):
        ph = self.add_photo(self.make()['id'])
        res = self.upload(ph['id'], png_bytes(alpha=0), name='edit.png', caption='See-through')
        self.assertEqual(res.status_code, 201, res.data)
        clear = ProjectPhotoVersion.objects.get(pk=res.data['id'])
        self.assertEqual((clear.kind, clear.see_through, clear.caption, clear.file.content_type),
                         ('edit', True, 'See-through', 'image/png'))
        self.assertEqual(clear.thumbnail.content_type, 'image/png')
        res = self.upload(ph['id'], png_bytes(alpha=255), name='solid.png', made_from=clear.pk, caption='')
        solid = ProjectPhotoVersion.objects.get(pk=res.data['id'])
        self.assertEqual((solid.see_through, solid.file.content_type, solid.made_from_id, solid.caption),
                         (False, 'image/jpeg', clear.pk, 'Edit'))
        self.assertEqual(self.c['ann'].get(f'{PV}{clear.pk}/file/').status_code, 200)
        self.assertEqual(self.c['ann'].get(f'{PV}{solid.pk}/thumb/').status_code, 200)
        # Bob does not see the project, so not its versions either.
        self.assertEqual(self.c['bob'].get(f'{PV}{clear.pk}/file/').status_code, 404)
        self.assertEqual(self.upload(ph['id'], b'not a picture').status_code, 400)

    def test_main_is_newest_until_starred_and_raw_can_be_starred(self):
        ph = self.add_photo(self.make()['id'])
        first = self.upload(ph['id'], jpeg_bytes()).data['id']
        second = self.upload(ph['id'], jpeg_bytes()).data['id']
        self.assertEqual(self.c['ann'].get(f'{PH}{ph["id"]}/').data['main'], second)
        res = self.c['ann'].post(f'{PH}{ph["id"]}/main/', {'version': first}, format='json')
        self.assertEqual((res.status_code, res.data['main']), (200, first))
        self.upload(ph['id'], jpeg_bytes())  # a newer version does not take Main from a starred one
        self.assertEqual(self.c['ann'].get(f'{PH}{ph["id"]}/').data['main'], first)
        self.assertIsNone(self.c['ann'].post(f'{PH}{ph["id"]}/main/', {'version': None}, format='json').data['main'])
        self.assertEqual(self.c['ann'].post(f'{PH}{ph["id"]}/main/', {'version': 999}, format='json').status_code, 400)
        # A photo whose starred Main points back at it still deletes cleanly, every file with it.
        self.c['ann'].post(f'{PH}{ph["id"]}/main/', {'version': second}, format='json')
        self.assertEqual(self.c['ann'].delete(f'{PH}{ph["id"]}/').status_code, 204)
        self.assertFalse(ProjectPhotoVersion.objects.exists())
        self.assertEqual(S3File.objects.count(), 0)

    def test_delete_version_removes_its_files_and_main_falls_back(self):
        ph = self.add_photo(self.make()['id'])
        first = self.upload(ph['id'], jpeg_bytes()).data['id']
        second = self.upload(ph['id'], jpeg_bytes(), made_from=first).data['id']
        self.c['ann'].post(f'{PH}{ph["id"]}/main/', {'version': second}, format='json')
        self.assertEqual(S3File.objects.count(), 6)
        self.assertEqual(self.c['ann'].delete(f'{PV}{second}/').status_code, 204)
        self.assertEqual(S3File.objects.count(), 4)
        self.assertEqual(self.c['ann'].get(f'{PH}{ph["id"]}/').data['main'], first)
        self.assertEqual(self.c['ann'].delete(f'{PV}{first}/').status_code, 204)
        data = self.c['ann'].get(f'{PH}{ph["id"]}/').data
        self.assertEqual((data['versions'], data['main']), ([], None))

    def test_ai_run_goes_through_the_router_and_keeps_the_source_shape(self):
        ph = self.add_photo(self.make()['id'])  # Raw is 64 x 48 (4:3)
        res, call = self.run_ai(ph['id'], answer=jpeg_bytes(60, 60, (255, 255, 255)), action='remove_background',
                                color='#000000')
        self.assertEqual(res.status_code, 201, res.data)
        version = ProjectPhotoVersion.objects.get(pk=res.data['id'])
        self.assertEqual((version.status, version.kind, version.caption), ('done', 'ai', 'Black background'))
        self.assertEqual((version.width, version.height), (80, 60))  # a square answer fit inside 4:3, padded
        model, prompt, image = call.call_args.args
        self.assertEqual(model, 'grok-imagine-image-2.0')
        self.assertIn('#000000', prompt)
        self.assertIn(svc.KEEP_AS_IS, prompt)
        self.assertEqual(Image.open(io.BytesIO(image)).format, 'JPEG')
        self.assertEqual(call.call_args.kwargs['log_purpose'], 'PHOTO_REMOVE_BACKGROUND')
        self.assertEqual(call.call_args.kwargs['log_user'], self.ann)
        # The next run starts from the version on screen.
        res, call = self.run_ai(ph['id'], action='free', words='  make it   brighter ', made_from=version.pk)
        free = ProjectPhotoVersion.objects.get(pk=res.data['id'])
        self.assertEqual((free.made_from_id, free.caption, free.status), (version.pk, 'make it brighter', 'done'))
        self.assertTrue(call.call_args.args[1].startswith('make it brighter Keep the item'))
        self.assertEqual(call.call_args.kwargs['log_purpose'], 'PHOTO_FREE_EDIT')

    def test_ai_requests_are_checked(self):
        ph = self.add_photo(self.make()['id'])
        self.assertEqual(self.run_ai(ph['id'], action='free', words='  ')[0].status_code, 400)
        self.assertEqual(self.run_ai(ph['id'], action='remove_background', color='red')[0].status_code, 400)
        self.assertEqual(self.run_ai(ph['id'], action='paint')[0].status_code, 400)
        other = self.add_photo(self.make()['id'])
        theirs = self.upload(other['id'], jpeg_bytes()).data['id']
        self.assertEqual(self.run_ai(ph['id'], action='optimize', made_from=theirs)[0].status_code, 400)
        self.assertFalse(ProjectPhotoVersion.objects.filter(kind='ai').exists())

    def test_failed_run_says_so_and_runs_again_in_its_slot(self):
        ph = self.add_photo(self.make()['id'])
        res, _ = self.run_ai(ph['id'], error='Image API error (400): bad', action='studio')
        version = ProjectPhotoVersion.objects.get(pk=res.data['id'])
        self.assertEqual((version.status, version.error), ('failed', 'Image API error (400): bad'))
        slot = version.made_at
        out = {'b64': base64.b64encode(jpeg_bytes()).decode(), 'content_type': 'image/jpeg'}
        with mock.patch.object(svc, '_spawn', side_effect=svc._work), \
                mock.patch('apps.core.services.image_router.edit_image', return_value=out):
            res = self.c['ann'].post(f'{PV}{version.pk}/again/', format='json')
        self.assertEqual(res.status_code, 200, res.data)
        version.refresh_from_db()
        self.assertEqual((version.status, version.error, version.made_at), ('done', '', slot))
        self.assertEqual(self.c['ann'].post(f'{PV}{version.pk}/again/', format='json').status_code, 400)

    def test_a_run_working_after_five_minutes_shows_failed(self):
        ph = self.add_photo(self.make()['id'])
        with mock.patch.object(svc, '_spawn'):
            vid = self.c['ann'].post(f'{PH}{ph["id"]}/ai/', {'action': 'optimize'}, format='json').data['id']
        self.assertEqual(self.c['ann'].get(f'{PH}{ph["id"]}/').data['versions'][0]['status'], 'working')
        ProjectPhotoVersion.objects.filter(pk=vid).update(started_at=timezone.now() - timedelta(minutes=6))
        row = self.c['ann'].get(f'{P}{ph["project"]}/photos/').data[0]['versions'][0]
        self.assertEqual((row['status'], row['error']), ('failed', svc.STALE_ERROR))

    def test_a_run_deleted_while_working_leaves_no_files(self):
        ph = self.add_photo(self.make()['id'])
        with mock.patch.object(svc, '_spawn'):
            vid = self.c['ann'].post(f'{PH}{ph["id"]}/ai/', {'action': 'holiday'}, format='json').data['id']
        version = ProjectPhotoVersion.objects.get(pk=vid)
        self.assertEqual(self.c['ann'].delete(f'{PV}{vid}/').status_code, 204)
        out = {'b64': base64.b64encode(jpeg_bytes()).decode(), 'content_type': 'image/jpeg'}
        with mock.patch.object(svc.ProjectPhotoVersion.objects, 'select_related') as rows, \
                mock.patch('apps.core.services.image_router.edit_image', return_value=out):
            rows.return_value.filter.return_value.first.return_value = version  # the thread read it before the X
            svc._work(vid)
        self.assertEqual(S3File.objects.count(), 2)  # Raw and its thumbnail only

    def test_fit_shape_pads_and_never_trims(self):
        grok = Image.new('RGB', (912, 1136), 'white')
        self.assertEqual(svc.fit_shape(grok, 4 / 5).size, (912, 1140))
        self.assertEqual(svc.fit_shape(Image.new('RGB', (1024, 1024)), 1.0).size, (1024, 1024))
        wide = svc.fit_shape(Image.new('RGB', (100, 50), (0, 0, 0)), 1.0)
        self.assertEqual((wide.size, wide.getpixel((50, 2))), ((100, 100), (0, 0, 0)))


@override_settings(XAI_API_KEY='x-k', OPENAI_API_KEY='o-k', GOOGLE_API_KEY='g-k', GEMINI_API_KEY='')
class ImageEditRouterTests(TestCase):
    """The router's edit call (Dash #209): one request shape per provider, logged like a generated picture."""

    def _post(self, payload):
        resp = mock.MagicMock(status_code=200)
        resp.json.return_value = payload
        return mock.patch('requests.post', return_value=resp)

    def test_each_provider_gets_the_picture_its_own_way(self):
        from apps.core.models import AiModel
        from apps.core.services.image_router import ImageError, edit_image

        user = get_user_model().objects.create_user(email='e@example.com', first_name='E', last_name='E', password='pw')
        with self._post({'data': [{'b64_json': 'eGE='}]}) as post:
            out = edit_image('grok-imagine-image-2.0', 'tidy it', b'\xff\xd8jpeg', log_purpose='PHOTO_OPTIMIZE',
                             log_source='photo_projects', log_user=user)
        url, body = post.call_args.args[0], post.call_args.kwargs['json']
        self.assertTrue(url.endswith('/images/edits'))
        self.assertEqual((body['model'], body['image']['type']), ('grok-imagine-image-2.0', 'image_url'))
        self.assertTrue(body['image']['url'].startswith('data:image/jpeg;base64,'))
        self.assertEqual(out['b64'], 'eGE=')
        usage = AIUsage.objects.get()
        self.assertEqual((usage.purpose, usage.user_id, str(usage.estimated_cost_usd)), ('PHOTO_OPTIMIZE', user.pk, '0.070000'))

        AiModel.objects.create(slug='gpt-image-9', provider='openai', modality='image')
        with self._post({'data': [{'b64_json': 'b3A='}]}) as post:
            edit_image('gpt-image-9', 'tidy it', b'jpeg')
        self.assertIn('image', post.call_args.kwargs['files'])
        self.assertEqual(post.call_args.kwargs['data']['model'], 'gpt-image-9')

        AiModel.objects.create(slug='gemini-9-flash-image', provider='google', modality='image')
        answer = {'candidates': [{'content': {'parts': [{'inlineData': {'mimeType': 'image/png', 'data': 'Z28='}}]}}]}
        with self._post(answer) as post:
            edit_image('gemini-9-flash-image', 'tidy it', b'jpeg')
        parts = post.call_args.kwargs['json']['contents'][0]['parts']
        self.assertEqual((parts[0]['inlineData']['mimeType'], parts[1]['text']), ('image/jpeg', 'tidy it'))

        AiModel.objects.create(slug='imagen-9', provider='google', modality='image')
        with self.assertRaises(ImageError):
            edit_image('imagen-9', 'tidy it', b'jpeg')
