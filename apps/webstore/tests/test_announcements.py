from datetime import timedelta

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.models import Announcement, AnnouncementImage
from apps.webstore.services.announcements import (
    live_announcements,
    resolve_tokens,
    token_context,
)


def _manager(email='ann-mgr@example.com'):
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email=email, first_name='Ann', last_name='Mgr', password='test-pass-123',
    )
    user.groups.add(group)
    return user


def _employee(email='ann-emp@example.com'):
    group, _ = Group.objects.get_or_create(name='Employee')
    user = User.objects.create_user(
        email=email, first_name='Ann', last_name='Emp', password='test-pass-123',
    )
    user.groups.add(group)
    return user


def _ann(**kwargs):
    defaults = dict(
        title='Labor Day Sale',
        kind='promotion',
        style='sale',
        body_html='<p>Sale through {{sale_end}} at {{store_name}}.</p>',
        body_text='Sale through {{sale_end}} at {{store_name}}.',
        placements=['banner', 'home_hero'],
        priority=5,
        is_active=True,
        is_template=False,
    )
    defaults.update(kwargs)
    row = Announcement(**defaults)
    if 'body_html' in defaults:
        row.apply_body(body_html=defaults['body_html'], body_json=defaults.get('body_json') or {})
    row.save()
    return row


class LiveFilterTests(TestCase):
    def test_active_open_ended_is_live(self):
        row = _ann()
        self.assertTrue(row.is_live())
        self.assertEqual(live_announcements(), [row])

    def test_inactive_not_live(self):
        _ann(is_active=False)
        self.assertEqual(live_announcements(), [])

    def test_template_never_live(self):
        _ann(is_template=True, is_active=True)
        self.assertEqual(live_announcements(), [])

    def test_future_window_not_live(self):
        _ann(starts_at=timezone.now() + timedelta(days=2))
        self.assertEqual(live_announcements(), [])

    def test_expired_window_not_live(self):
        _ann(ends_at=timezone.now() - timedelta(hours=1))
        self.assertEqual(live_announcements(), [])


class TokenTests(TestCase):
    def test_resolve_store_name(self):
        ctx = token_context()
        self.assertIn('Eco-Thrift', ctx['store_name'])
        text = resolve_tokens('Visit {{store_name}}', ctx)
        self.assertEqual(text, 'Visit Eco-Thrift - Canfield')

    def test_regular_hours_token(self):
        text = resolve_tokens('Hours: {{regular_hours}}')
        self.assertIn('Tuesday', text)


class AnnouncementApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mgr = _manager()
        self.emp = _employee()

    def test_employee_forbidden(self):
        self.client.force_authenticate(self.emp)
        r = self.client.get('/api/webstore/announcements/')
        self.assertEqual(r.status_code, 403)

    def test_toggle(self):
        self.client.force_authenticate(self.mgr)
        row = _ann(is_active=False)
        r = self.client.post(f'/api/webstore/announcements/{row.id}/toggle/')
        self.assertEqual(r.status_code, 200)
        row.refresh_from_db()
        self.assertTrue(row.is_active)

    def test_duplicate_copies_images_and_resets(self):
        self.client.force_authenticate(self.mgr)
        row = _ann(is_active=True, is_template=True, starts_at=timezone.now())
        s3 = S3File.objects.create(key='test/ann.jpg', filename='a.jpg', size=4, content_type='image/jpeg')
        AnnouncementImage.objects.create(announcement=row, s3_file=s3, alt='sale', sort_order=0)
        r = self.client.post(f'/api/webstore/announcements/{row.id}/duplicate/')
        self.assertEqual(r.status_code, 201, r.content)
        data = r.json()
        self.assertTrue(data['title'].startswith('Copy of'))
        self.assertFalse(data['is_active'])
        self.assertFalse(data['is_template'])
        self.assertIsNone(data['starts_at'])
        self.assertEqual(len(data['images']), 1)
        self.assertEqual(data['images'][0]['alt'], 'sale')
        self.assertNotEqual(data['id'], row.id)

    def test_public_only_live(self):
        live = _ann(title='Live sale')
        _ann(title='Off sale', is_active=False)
        _ann(title='Template', is_template=True, is_active=True)
        r = self.client.get('/api/webstore/public/announcements/')
        self.assertEqual(r.status_code, 200)
        titles = [row['title'] for row in r.json()]
        self.assertEqual(titles, [live.title])
        self.assertEqual(r['Cache-Control'], 'public, max-age=60')

    def test_image_upload_and_proxy(self):
        self.client.force_authenticate(self.mgr)
        row = _ann()
        upload = SimpleUploadedFile('photo.jpg', b'\xff\xd8\xff', content_type='image/jpeg')
        r = self.client.post(
            f'/api/webstore/announcements/{row.id}/images/',
            {'file': upload, 'alt': 'banner'},
            format='multipart',
        )
        self.assertEqual(r.status_code, 201, r.content)
        image_id = r.json()['id']
        self.client.force_authenticate(None)
        proxy = self.client.get(f'/api/webstore/public/announcement-images/{image_id}/')
        self.assertIn(proxy.status_code, (200, 302))

    def test_create_sanitizes_html(self):
        self.client.force_authenticate(self.mgr)
        r = self.client.post(
            '/api/webstore/announcements/',
            {
                'title': 'Safe',
                'kind': 'notice',
                'style': 'info',
                'body_html': '<p>Hi</p><script>alert(1)</script>',
                'placements': ['banner'],
                'is_active': True,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertNotIn('script', r.json()['body_html'])
