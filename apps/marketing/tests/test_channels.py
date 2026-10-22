from datetime import datetime, time, timedelta
from io import BytesIO
from unittest import mock

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.marketing.models import SocialPost, SocialPostChannel, SocialPostNumbers
from apps.marketing.services import channels, numbers
from apps.marketing.services.photos import save_photo
from apps.marketing.services.posts import set_photos

IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def _jpeg(name='p.jpg'):
    buf = BytesIO()
    Image.new('RGB', (40, 30), (20, 120, 40)).save(buf, format='JPEG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


@override_settings(STORAGES=IN_MEMORY)
class ChannelTests(TestCase):
    def setUp(self):
        AppSetting.objects.update_or_create(key='online_sales.hours', defaults={'value': {'closed_weekdays': []}})
        self.today = timezone.localdate()
        self.user = User.objects.create_user(email='s@example.com', first_name='S', last_name='T', password='pw-123456')
        self.user.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.post = SocialPost.objects.create(slot_date=self.today, post_type=SocialPost.TYPE_NEW, hook='New toys in',
                                              body='Ride-ons and puzzles.', call_to_action=SocialPost.CTA_COME_IN)
        set_photos(self.post, [save_photo(_jpeg(f'{n}.jpg'), user=self.user).pk for n in range(3)])
        self.url = f'/api/marketing/posts/{self.post.pk}/'

    def test_channels_on_and_their_words(self):
        self.assertEqual(channels.enabled_channels(), ['facebook', 'instagram', 'google'])
        AppSetting.objects.create(key='marketing.channels', value=['tiktok', 'bogus'])
        self.assertEqual(channels.enabled_channels(), ['facebook', 'tiktok'])  # Facebook always; unknown ignored
        insta = channels.channel_text(self.post, 'instagram')
        self.assertTrue(insta.startswith('New toys in'))
        self.assertIn('#OmahaThrift', insta)
        self.assertIn('Thrift+', insta)  # the Thrift+ line goes on every channel
        nextdoor = channels.channel_text(self.post, 'nextdoor')
        self.assertNotIn('#', nextdoor)
        self.assertNotIn('⠀', nextdoor)
        self.post.body = 'word ' * 600
        self.assertLessEqual(len(channels.channel_text(self.post, 'google')), 1500)

    def test_detail_lists_each_channel_with_its_sizes(self):
        AppSetting.objects.create(key='marketing.channels', value=['instagram', 'google', 'tiktok'])
        data = self.client.get(self.url).data
        by_key = {c['key']: c for c in data['channels']}
        self.assertEqual(list(by_key), ['facebook', 'instagram', 'google', 'tiktok'])
        self.assertEqual(by_key['instagram']['sizes'], ['4:5', '9:16'])
        self.assertEqual(by_key['google']['sizes'], ['4:3'])
        self.assertEqual(by_key['tiktok']['sizes'], ['9:16'])
        self.assertIn('#thrifttok', by_key['tiktok']['text'])

    def test_posting_on_more_channels_and_their_numbers(self):
        insta = self.url + 'channels/instagram/posted/'
        self.assertEqual(self.client.post(insta, {'url': 'https://www.instagram.com/p/abc/'}).status_code, 200)
        self.assertEqual(SocialPostChannel.objects.get(post=self.post).channel, 'instagram')
        bad = self.client.post(self.url + 'channels/google/posted/', {'url': 'https://www.facebook.com/x'})
        self.assertEqual(bad.data['code'], 'BAD_URL')
        self.assertEqual(self.client.post(self.url + 'channels/myspace/posted/', {'url': 'x'}).data['code'], 'BAD_CHANNEL')
        fb = self.client.post(self.url + 'channels/facebook/posted/', {'url': 'https://www.facebook.com/ecothrift/posts/9'})
        self.assertEqual(fb.data['status'], 'posted')  # Facebook is the post's own Posted
        data = self.client.get(self.url).data
        posted = {c['key']: c['posted_url'] for c in data['channels']}
        self.assertEqual(posted['instagram'], 'https://www.instagram.com/p/abc/')
        self.assertTrue(posted['facebook'].startswith('https://www.facebook.com/'))
        # Numbers per channel: only where it went out, due per channel.
        self.post.refresh_from_db()
        later = self.today + timedelta(days=8)
        self.assertEqual([(d['channel'], d['mark']) for d in numbers.due_marks(self.post, later)],
                         [('facebook', 1), ('facebook', 7), ('instagram', 1), ('instagram', 7)])
        nums = self.url + 'numbers/'
        self.assertEqual(self.client.put(nums, {'channel': 'google', 'mark': 1}, format='json').data['code'], 'NOT_POSTED')
        res = self.client.put(nums, {'channel': 'instagram', 'mark': 1, 'reach': 300, 'reactions': 20}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.client.put(nums, {'mark': 7, 'reach': 900, 'reactions': 40}, format='json')  # Facebook by default
        self.assertEqual(SocialPostNumbers.objects.get(post=self.post, channel='instagram').reach, 300)
        SocialPost.objects.filter(pk=self.post.pk).update(
            posted_at=timezone.make_aware(datetime.combine(self.today - timedelta(days=1), time(11))))
        with mock.patch('apps.pos.services.sales_numbers.by_day', return_value={}):
            page = numbers.insights(self.today)
        hit = page['hits'][0]
        self.assertEqual((hit['reach'], hit['engagement'], hit['mark']), (1200, 60, 1))  # channels added up
        self.assertEqual([c['key'] for c in page['by_channel']], ['facebook', 'instagram'])

    def test_more_channels_wait_for_the_check(self):
        self.post.hook = ''
        self.post.save()
        res = self.client.post(self.url + 'channels/instagram/posted/', {'url': 'https://www.instagram.com/p/abc/'})
        self.assertEqual(res.data['code'], 'NOT_READY')
