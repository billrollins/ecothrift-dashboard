from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.inventory.models import Category, Item, Product
from apps.marketing.models import SocialPhoto, SocialPost
from apps.marketing.services.posts import check_post, set_photos
from apps.thriftplus.services.scanner import item_card

IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def _jpeg(name='p.jpg', size=(40, 30)):
    buf = BytesIO()
    Image.new('RGB', size, (20, 120, 40)).save(buf, format='JPEG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


def _item(sku='ITM0000001', price='20.00', retail='100.00', check=''):
    cat, _ = Category.objects.get_or_create(name='Kitchen & dining')
    product = Product.objects.create(title='Stand mixer', category=cat)
    return Item.objects.create(sku=sku, product=product, price=Decimal(price), retail=Decimal(retail),
                               retail_check=check, status='on_shelf')


@override_settings(STORAGES=IN_MEMORY)
class TagOverlayTests(TestCase):
    def setUp(self):
        AppSetting.objects.update_or_create(key='online_sales.hours', defaults={'value': {'closed_weekdays': []}})
        self.staff = User.objects.create_user(email='s@example.com', first_name='S', last_name='T', password='pw-123456')
        self.staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.client = APIClient()
        self.client.force_authenticate(self.staff)
        self.post = SocialPost.objects.create(slot_date=timezone.localdate() + timedelta(days=1),
                                              post_type=SocialPost.TYPE_NEW)

    def test_lookup_shows_retail_only_when_it_passed_the_check(self):
        _item(check='')
        unchecked = self.client.get('/api/marketing/tag/itm0000001/').data
        self.assertEqual(unchecked['status'], 'found')
        self.assertIsNone(unchecked['item']['retail'])
        Item.objects.filter(sku='ITM0000001').update(retail_check='passed')
        item = self.client.get('/api/marketing/tag/ITM0000001/').data['item']
        self.assertEqual(item['retail'], '100.00')
        self.assertEqual(item['price'], '20.00')
        self.assertIsNone(item['thriftbucks'])  # no reward today: no ThriftBucks line
        card = item_card(Item.objects.get(sku='ITM0000001'))
        self.assertEqual(item['returnable'], card['returnable'])  # the same answer the member scanner gives
        self.assertEqual(self.client.get('/api/marketing/tag/NOPE/').data, {'status': 'not_found', 'sku': 'NOPE'})

    def test_product_photos_must_show_their_tag(self):
        item = _item(check='passed')
        res = self.client.post('/api/marketing/photos/', {'files': [_jpeg(), _jpeg('b.jpg')], 'sku': item.sku},
                               format='multipart')
        tagged = res.data['photos'][0]
        self.assertTrue(tagged['tag_overlay'])
        self.assertEqual(tagged['tag_corner'], 'bl')
        self.assertEqual(tagged['tag']['retail'], '100.00')
        scene = self.client.post('/api/marketing/photos/', {'files': [_jpeg('c.jpg')]}, format='multipart')
        ids = [p['id'] for p in res.data['photos']] + [scene.data['photos'][0]['id']]
        set_photos(self.post, ids)
        self.assertTrue(next(row for row in check_post(self.post) if row['key'] == 'tags')['ok'])
        self.post.hook, self.post.call_to_action = 'New mixers', SocialPost.CTA_COME_IN
        self.post.save()
        self.assertEqual(self.client.post(f'/api/marketing/posts/{self.post.pk}/ready/').data['status'], 'ready')
        off = self.client.patch(f'/api/marketing/photos/{ids[0]}/', {'tag_overlay': False}, format='json')
        self.assertFalse(off.data['tag_overlay'])
        self.post.refresh_from_db()
        self.assertEqual(self.post.status, SocialPost.STATUS_DRAFT)
        line = next(row for row in check_post(self.post) if row['key'] == 'tags')
        self.assertEqual(line['missing'], 'Turn the tag on for 1 product photo.')
        bad = self.client.patch(f'/api/marketing/photos/{ids[0]}/', {'tag_corner': 'middle'}, format='json')
        self.assertEqual(bad.data['code'], 'BAD_CHOICE')
        detail = self.client.get(f'/api/marketing/posts/{self.post.pk}/').data
        self.assertEqual([p['tag'] is not None for p in detail['photos']], [True, True, False])
        self.assertNotIn('zones', detail)

    def test_edited_photo_replaces_the_image(self):
        res = self.client.post('/api/marketing/photos/', {'files': [_jpeg()]}, format='multipart')
        pk = res.data['photos'][0]['id']
        before = SocialPhoto.objects.get(pk=pk).image.name
        edited = self.client.post(f'/api/marketing/photos/{pk}/image/', {'file': _jpeg('e.jpg', (30, 40))},
                                  format='multipart')
        self.assertEqual(edited.status_code, 200, edited.data)
        photo = SocialPhoto.objects.get(pk=pk)
        self.assertNotEqual(photo.image.name, before)
        self.assertEqual((photo.width, photo.height), (30, 40))
        self.assertIsNotNone(edited.data['edited_at'])
        empty = self.client.post(f'/api/marketing/photos/{pk}/image/', {}, format='multipart')
        self.assertEqual(empty.data['code'], 'NO_FILES')
