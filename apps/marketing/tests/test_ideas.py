from datetime import timedelta
from decimal import Decimal
from io import BytesIO, StringIO
from unittest import mock

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.buying.models import Auction, Marketplace, Outcome
from apps.core.models import AiAction, AIUsage, AppSetting
from apps.inventory.models import Category, Item, Product, PurchaseOrder, Vendor
from apps.marketing.models import SocialPost
from apps.marketing.services import ideas
from apps.marketing.services.photos import save_photo
from apps.marketing.services.posts import set_photos
from apps.marketing.settings import marketing_settings

IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
TOYS = 'Toys & games'
KITCHEN = 'Kitchen & dining'


def _hours():
    AppSetting.objects.update_or_create(
        key='online_sales.hours',
        defaults={'value': {'timezone': 'America/Chicago', 'open': '09:00', 'close': '18:00', 'closed_weekdays': []}},
    )


def _user(email='poster@example.com'):
    user = User.objects.create_user(email=email, first_name='T', last_name='Staff', password='test-pass-123')
    user.groups.add(Group.objects.get_or_create(name='Employee')[0])
    return user


def _item(sku, category, title, price, *, days_ago=1, status='on_shelf', retail=None):
    cat, _ = Category.objects.get_or_create(name=category)
    product = Product.objects.create(title=title, category=cat, brand='Generic')
    item = Item.objects.create(sku=sku, product=product, price=Decimal(price), status=status,
                               retail=Decimal(retail) if retail else None, location='A1')
    Item.objects.filter(pk=item.pk).update(checked_in_at=timezone.now() - timedelta(days=days_ago))
    return item


def _jpeg(name='p.jpg'):
    buf = BytesIO()
    Image.new('RGB', (40, 30), (20, 120, 40)).save(buf, format='JPEG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


def _idea(**extra):
    return {'title': 'Fresh toys', 'hook': 'New toys just hit the floor', 'body': 'Ride-ons and puzzles.',
            'call_to_action': 'come_in', 'photo_ids': [], 'shots': [], **extra}


@override_settings(STORAGES=IN_MEMORY)
class FactsTests(TestCase):
    def setUp(self):
        _hours()
        self.today = timezone.localdate()
        self.post = SocialPost.objects.create(slot_date=self.today, post_type=SocialPost.TYPE_NEW, category=TOYS)

    def test_new_in_is_best_tags_first_three_per_category_and_never_sends_retail(self):
        for n in range(5):
            _item(f'TOY00000{n}', TOYS, f'Toy {n}', 10 + n, retail='999')
        _item('KIT000001', KITCHEN, 'Mixer', 40)
        _item('OLD000001', KITCHEN, 'Old pan', 90, days_ago=10)
        _item('SOLD00001', KITCHEN, 'Sold kettle', 80, status='sold')
        facts = ideas.gather_facts(self.post)
        self.assertEqual([r['sku'] for r in facts['new_in']['items']], ['KIT000001', 'TOY000004', 'TOY000003', 'TOY000002'])
        self.assertEqual(facts['new_in']['items_checked_in'], 6)
        self.assertEqual(facts['new_in']['items'][0]['tag_price'], '$40')
        self.assertNotIn('999', str(facts))
        self.assertNotIn('retail', str(facts).lower())

    def test_this_weeks_photos_carry_their_item_and_whether_another_post_has_them(self):
        user = _user()
        item = _item('TOY000001', TOYS, 'Kids ride-on car', 60)
        tagged = save_photo(_jpeg(), user=user, item=item)
        scene = save_photo(_jpeg('b.jpg'), user=user, note='Truck unload')
        other = SocialPost.objects.create(slot_date=self.today + timedelta(days=1), post_type=SocialPost.TYPE_LIVE)
        set_photos(other, [scene.pk])
        rows = {r['photo_id']: r for r in ideas.gather_facts(self.post)['photos_this_week']}
        self.assertEqual(rows[tagged.pk]['item'], 'Kids ride-on car')
        self.assertEqual(rows[tagged.pk]['tag_price'], '$60')
        self.assertFalse(rows[tagged.pk]['in_another_post'])
        self.assertEqual(rows[scene.pk]['note'], 'Truck unload')
        self.assertTrue(rows[scene.pk]['in_another_post'])

    def test_spotlight_and_coming_soon(self):
        _item('TOY000001', TOYS, 'Ride-on', 60, days_ago=40)
        _item('KIT000001', KITCHEN, 'Mixer', 40)
        self.post.post_type = SocialPost.TYPE_SPOTLIGHT
        vendor = Vendor.objects.create(name='Target', code='TGT')
        PurchaseOrder.objects.create(vendor=vendor, order_number='PO-1', ordered_date=self.today, status='shipped',
                                     expected_delivery=self.today + timedelta(days=3), description='Toys truckload',
                                     pallet_count=12)
        PurchaseOrder.objects.create(vendor=vendor, order_number='PO-2', ordered_date=self.today, status='shipped',
                                     expected_delivery=self.today + timedelta(days=30), description='Far away')
        mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target'})[0]
        Outcome.objects.create(auction=Auction.objects.create(marketplace=mp, external_id='a1', title='Kitchen returns'), win=True)
        facts = ideas.gather_facts(self.post)
        self.assertEqual([r['sku'] for r in facts['spotlight_items']], ['TOY000001'])
        self.assertEqual([r['what'] for r in facts['coming_soon']['on_the_way']], ['Toys truckload'])
        self.assertEqual([r['what'] for r in facts['coming_soon']['won_loads']], ['Kitchen returns'])


@override_settings(STORAGES=IN_MEMORY)
class IdeasTests(TestCase):
    def setUp(self):
        _hours()
        self.today = timezone.localdate()
        self.user = _user()
        self.post = SocialPost.objects.create(slot_date=self.today, post_type=SocialPost.TYPE_NEW, category=TOYS)
        self.item = _item('TOY000001', TOYS, 'Kids ride-on car', 60)
        self.photo = save_photo(_jpeg(), user=self.user, item=self.item)

    def test_ideas_are_cleaned_and_only_name_real_photos_and_items(self):
        facts = ideas.gather_facts(self.post)
        raw = [
            _idea(hook='"Brand new ride-ons \u2014 and so much more on the floor this week, come see them all today"',
                  body='Big week \u2013 see ecothrift.us/join.', call_to_action='shout',
                  photo_ids=[self.photo.pk, 99999, 'x', self.photo.pk],
                  shots=[{'sku': 'toy000001', 'shot': 'Ride-on'}, {'sku': 'NOPE', 'shot': 'Shelf'}]),
            _idea(hook=''),
            *[_idea(title=f'Idea {n}') for n in range(6)],
        ]
        out = ideas.clean_ideas(raw, facts, marketing_settings())
        self.assertEqual(len(out), 5)
        first = out[0]
        self.assertLessEqual(len(first['hook']), 80)
        self.assertTrue(first['hook'].startswith('Brand new ride-ons, and'))
        self.assertEqual(first['body'], 'Big week, see')
        self.assertEqual(first['call_to_action'], 'come_in')
        self.assertEqual(first['photo_ids'], [self.photo.pk])
        self.assertEqual(first['shots'][0], {'shot': 'Ride-on', 'sku': 'TOY000001', 'title': 'Kids ride-on car',
                                             'tag_price': '$60', 'location': 'A1'})
        self.assertEqual(first['shots'][1]['sku'], '')

    def test_never_say_words_get_one_retry_then_are_named(self):
        bad = {'ideas': [_idea(body='Save big and earn rewards.')]}
        good = {'ideas': [_idea()]}
        with mock.patch.object(ideas, '_ask_ideas', side_effect=[(bad, 'm'), (good, 'm')]) as ask:
            out, _ = ideas.write_ideas(self.post)
        self.assertEqual(ask.call_count, 2)
        self.assertIn('never-say words (earn, save)', ask.call_args.kwargs['note'])
        self.assertEqual(out[0]['flags'], [])
        with mock.patch.object(ideas, '_ask_ideas', side_effect=[(bad, 'm'), (bad, 'm')]):
            self.assertEqual(ideas.write_ideas(self.post)[0][0]['flags'], ['earn', 'save'])

    def test_the_call_uses_the_social_post_purpose_and_sends_the_weeks_photos(self):
        with mock.patch('apps.core.services.llm_router.llm_chat_tool_input', return_value=({'ideas': [_idea()]}, 'm1')) as call:
            ideas.write_ideas(self.post)
        kwargs = call.call_args.kwargs
        self.assertEqual(kwargs['purpose'], 'SOCIAL_POST')
        self.assertEqual(kwargs['log_source'], 'marketing.post_ideas')
        self.assertIn(f'"photo_id": {self.photo.pk}', kwargs['user'])
        self.assertIn('Suggest 4', kwargs['system'])
        self.assertIn('not_in_the_facts', kwargs['user'])

    def test_a_failure_is_shown_and_logged(self):
        ideas._start(self.post, by='T')
        with mock.patch.object(ideas, '_ask_ideas', side_effect=RuntimeError('provider down')):
            ideas.run_ideas(self.post.pk)
        self.post.refresh_from_db()
        shown = ideas.ideas_payload(self.post)
        self.assertEqual(shown['state'], 'failed')
        self.assertIn('Try again', shown['error'])
        self.assertFalse(AIUsage.objects.get(source='marketing.post_ideas').success)

    def test_morning_ideas_run_once_and_have_an_off_switch(self):
        with mock.patch.object(ideas, '_ask_ideas', return_value=({'ideas': [_idea()]}, 'm1')):
            self.assertIn('done', ideas.morning_ideas(self.today))
        self.post.refresh_from_db()
        self.assertEqual(self.post.hook, '')  # ideas wait; the post's words are untouched
        self.assertEqual(self.post.ai_brief['by'], 'Morning ideas')
        with mock.patch.object(ideas, '_ask_ideas') as ask:
            self.assertIn('already has ideas', ideas.morning_ideas(self.today))
            AppSetting.objects.create(key='marketing.ai_morning_ideas', value=False)
            self.assertIn('off', ideas.morning_ideas(self.today))
        ask.assert_not_called()

    def test_materialize_routines_asks_for_the_days_ideas(self):
        out = StringIO()
        with mock.patch.object(ideas, '_ask_ideas', return_value=({'ideas': [_idea()]}, 'm1')):
            call_command('materialize_routines', stdout=out)
        self.assertIn('Post ideas:', out.getvalue())

    def test_the_ai_action_is_seeded(self):
        self.assertTrue(AiAction.objects.filter(purpose='SOCIAL_POST', effort='low').exists())


@override_settings(STORAGES=IN_MEMORY)
class IdeasApiTests(TestCase):
    def setUp(self):
        _hours()
        self.today = timezone.localdate()
        self.user = _user()
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.post = SocialPost.objects.create(slot_date=self.today, post_type=SocialPost.TYPE_NEW, hook='Old')
        self.url = f'/api/marketing/posts/{self.post.pk}/'
        self.photos = [save_photo(_jpeg(f'{n}.jpg'), user=self.user) for n in range(3)]

    def test_get_ideas_then_use_one(self):
        with mock.patch.object(ideas, '_spawn') as spawn:
            res = self.client.post(self.url + 'ideas/')
        self.assertEqual(res.status_code, 202)
        self.assertEqual(res.data['ideas']['state'], 'drafting')
        self.assertEqual(self.client.post(self.url + 'ideas/').data['code'], 'DRAFTING')
        set_photos(self.post, [self.photos[0].pk])
        answer = {'ideas': [_idea(photo_ids=[self.photos[0].pk, self.photos[1].pk]), _idea(title='Second')]}
        with mock.patch.object(ideas, '_ask_ideas', return_value=(answer, 'm1')):
            ideas.run_ideas(spawn.call_args.args[0])
        data = self.client.get(self.url).data
        self.assertEqual(data['ideas']['state'], 'done')
        self.assertEqual(len(data['ideas']['ideas']), 2)
        self.assertEqual(data['hook'], 'Old')  # nothing changes until an idea is used
        self.assertEqual(set(data['idea_photos']), {str(self.photos[0].pk), str(self.photos[1].pk)})
        used = self.client.post(self.url + 'ideas/0/use/')
        self.assertEqual(used.status_code, 200, used.data)
        self.assertEqual(used.data['hook'], 'New toys just hit the floor')
        self.assertEqual(used.data['call_to_action'], 'come_in')
        self.assertEqual(used.data['source'], 'ai')
        self.assertEqual(used.data['photo_ids'], [self.photos[0].pk, self.photos[1].pk])
        self.assertEqual(self.client.post(self.url + 'ideas/9/use/').data['code'], 'NO_IDEA')

    def test_rewrite_gives_three_clean_options(self):
        answer = {'options': ['New \u2014 shiny toys', 'Save big on toys', 'Toys galore', 'Toys galore', 'Fresh toys']}
        with mock.patch('apps.core.services.llm_router.llm_chat_tool_input', return_value=(answer, 'm1')) as call:
            res = self.client.post(self.url + 'rewrite/', {'part': 'hook', 'mode': 'new', 'current': 'Toys'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['options'], ['New, shiny toys', 'Toys galore', 'Fresh toys'])
        self.assertEqual(call.call_args.kwargs['log_source'], 'marketing.rewrite')
        self.assertLessEqual(call.call_args.kwargs['timeout'], 25)
        self.assertEqual(self.client.post(self.url + 'rewrite/', {'part': 'x', 'mode': 'new'}, format='json').data['code'],
                         'BAD_CHOICE')
        with mock.patch('apps.core.services.llm_router.llm_chat_tool_input', side_effect=RuntimeError('slow')):
            res = self.client.post(self.url + 'rewrite/', {'part': 'body', 'mode': 'shorter'}, format='json')
        self.assertEqual(res.data['code'], 'AI_FAILED')

    def test_a_stale_run_reads_as_failed_and_a_posted_post_takes_no_ideas(self):
        SocialPost.objects.filter(pk=self.post.pk).update(ai_brief={
            'state': 'drafting', 'started_at': (timezone.now() - timedelta(minutes=10)).isoformat(),
        })
        self.post.refresh_from_db()
        self.assertEqual(ideas.ideas_payload(self.post)['state'], 'failed')
        SocialPost.objects.filter(pk=self.post.pk).update(status=SocialPost.STATUS_POSTED)
        with mock.patch.object(ideas, '_spawn') as spawn:
            self.assertEqual(self.client.post(self.url + 'ideas/').data['code'], 'POSTED')
        spawn.assert_not_called()
