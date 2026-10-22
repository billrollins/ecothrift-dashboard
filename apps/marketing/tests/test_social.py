from datetime import date, timedelta
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
from apps.marketing.services import cadence
from apps.marketing.services.posts import check_post, missing_lines, post_text, set_photos
from apps.routines.kinds import merge_incoming, outcome, submit_blockers
from apps.routines.models import Routine, RoutineRun
from apps.routines.schedule import materialize_routines

IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}

MONDAY = date(2026, 11, 2)  # a week in the future of every test run's "today" until November
TOYS = 'Toys & games'
KITCHEN = 'Kitchen & dining'
APPAREL = 'Apparel & accessories'


def _hours(closed=(0, 6)):
    AppSetting.objects.update_or_create(
        key='online_sales.hours',
        defaults={'value': {'timezone': 'America/Chicago', 'open': '09:00', 'close': '18:00', 'closed_weekdays': list(closed)}},
    )


def _user(email, role='Employee', superuser=False):
    user = User.objects.create_user(email=email, first_name='T', last_name=role, password='test-pass-123')
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    if superuser:
        user.is_superuser = True
        user.save(update_fields=['is_superuser'])
    return user


def _stock(category, n):
    cat, _ = Category.objects.get_or_create(name=category)
    product = Product.objects.create(title=f'{category} thing', category=cat)
    for i in range(n):
        Item.objects.create(sku=f'S{category[:3].upper()}{Item.objects.count():06d}', product=product, price='5.00',
                            status='on_shelf')


def _jpeg(name='p.jpg'):
    buf = BytesIO()
    Image.new('RGB', (40, 30), (20, 120, 40)).save(buf, format='JPEG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


class CadenceTests(TestCase):
    def setUp(self):
        _hours()

    def test_slots_are_tue_to_sat_plus_a_scheduled_sunday(self):
        slots = cadence.week_slots(MONDAY)
        self.assertEqual([(d.weekday(), kind) for d, kind in slots], [
            (1, SocialPost.TYPE_NEW), (2, SocialPost.TYPE_SPOTLIGHT), (3, SocialPost.TYPE_COMING),
            (4, SocialPost.TYPE_WEEKEND), (5, SocialPost.TYPE_LIVE), (6, SocialPost.TYPE_SCHEDULED),
        ])

    def test_open_seven_days_has_no_scheduled_slot_and_a_holiday_drops_its_day(self):
        _hours(closed=())
        self.assertNotIn(SocialPost.TYPE_SCHEDULED, [kind for _d, kind in cadence.week_slots(MONDAY)])
        from apps.webstore.models import StoreHoursOverride

        _hours()
        thursday = MONDAY + timedelta(days=3)
        StoreHoursOverride.objects.create(label='Holiday', date_start=thursday, date_end=thursday, closed=True)
        days = [d for d, _kind in cadence.week_slots(MONDAY)]
        self.assertNotIn(thursday, days)
        self.assertFalse(cadence.is_post_day(thursday))

    def test_rotation_by_stock_skips_recent_unless_in_season(self):
        _stock(KITCHEN, 5)
        _stock(TOYS, 3)
        _stock(APPAREL, 2)
        AppSetting.objects.create(key='marketing.in_season', value=[])
        # Kitchen had a post 10 days before: skipped. Toys had one too, but November puts toys in season.
        SocialPost.objects.create(slot_date=MONDAY - timedelta(days=10), post_type=SocialPost.TYPE_SPOTLIGHT, category=KITCHEN)
        SocialPost.objects.create(slot_date=MONDAY - timedelta(days=9), post_type=SocialPost.TYPE_SPOTLIGHT, category=TOYS)
        picks = cadence.pick_categories(MONDAY, 3, taken=set())
        self.assertEqual(picks[:2], [TOYS, APPAREL])  # toys 3 x 2 (season) beats apparel 2; kitchen held back
        self.assertNotIn(KITCHEN, picks[:2])
        # Past the repeat window kitchen leads again.
        AppSetting.objects.create(key='marketing.repeat_days', value=7)
        self.assertEqual(cadence.pick_categories(MONDAY, 1, taken=set()), [TOYS])
        self.assertEqual(cadence.pick_categories(MONDAY, 2, taken={TOYS}), [KITCHEN, APPAREL])

    def test_ensure_week_makes_rows_once_with_distinct_categories(self):
        _stock(KITCHEN, 5)
        posts = cadence.ensure_week(MONDAY, today=MONDAY)
        self.assertEqual(len(posts), 6)
        cats = [p.category for p in posts if p.post_type != SocialPost.TYPE_SCHEDULED]
        self.assertEqual(len(set(cats)), 5)
        self.assertEqual(cats[0], KITCHEN)
        self.assertEqual([p.category for p in posts if p.post_type == SocialPost.TYPE_SCHEDULED], [''])
        again = cadence.ensure_week(MONDAY + timedelta(days=3), today=MONDAY)
        self.assertEqual([p.pk for p in again], [p.pk for p in posts])

    def test_past_week_is_not_filled(self):
        self.assertEqual(cadence.ensure_week(MONDAY, today=MONDAY + timedelta(days=14)), [])

    def test_swap(self):
        tue, wed = cadence.ensure_week(MONDAY, today=MONDAY)[:2]
        a = (tue.post_type, tue.category)
        b = (wed.post_type, wed.category)
        cadence.swap_slots(tue, wed)
        tue.refresh_from_db()
        wed.refresh_from_db()
        self.assertEqual((tue.post_type, tue.category), b)
        self.assertEqual((wed.post_type, wed.category), a)


@override_settings(STORAGES=IN_MEMORY)
class PostFlowTests(TestCase):
    def setUp(self):
        _hours()
        self.staff = _user('poster@example.com')
        self.owner = _user('owner@example.com', 'Admin', superuser=True)
        self.client = APIClient()
        self.client.force_authenticate(self.staff)
        self.post = SocialPost.objects.create(slot_date=MONDAY + timedelta(days=1), post_type=SocialPost.TYPE_NEW,
                                              category=KITCHEN)

    def _upload(self, n, **extra):
        res = self.client.post('/api/marketing/photos/', {'files': [_jpeg(f'p{i}.jpg') for i in range(n)], **extra},
                               format='multipart')
        self.assertEqual(res.status_code, 201, res.data)
        return [row['id'] for row in res.data['photos']]

    def test_check_names_every_missing_piece(self):
        missing = missing_lines(self.post)
        self.assertEqual(len(missing), 4)  # photos, hook, call to action, frame; address/hours/Thrift+ come built in
        self.assertTrue(missing[0].startswith('Add 3 more real photos'))
        self.post.hook = 'x' * 81
        self.assertIn('Shorten the hook to 80 characters (now 81).', missing_lines(self.post))
        AppSetting.objects.create(key='marketing.thrift_plus_line', value='')
        keys = [row['key'] for row in check_post(self.post) if not row['ok']]
        self.assertIn('thrift_plus', keys)

    def test_library_upload_unused_filter_and_sku_link(self):
        _stock(KITCHEN, 1)
        sku = Item.objects.first().sku
        ids = self._upload(2, category=KITCHEN, sku=sku)
        photo = SocialPhoto.objects.get(pk=ids[0])
        self.assertTrue(photo.thumbnail.name)
        self.assertEqual(photo.item.sku, sku)
        set_photos(self.post, ids[:1])
        unused = self.client.get('/api/marketing/photos/?unused=1').data['photos']
        self.assertEqual([row['id'] for row in unused], ids[1:])
        listed = {row['id']: row for row in self.client.get('/api/marketing/photos/').data['photos']}
        self.assertEqual(listed[ids[0]]['used_in'][0]['post_id'], self.post.pk)
        bad = self.client.post('/api/marketing/photos/', {'files': [_jpeg()], 'sku': 'NOPE'}, format='multipart')
        self.assertEqual(bad.status_code, 400)
        image = self.client.get(f'/api/marketing/photos/{ids[0]}/image/')
        self.assertEqual(image.status_code, 200)

    def test_ready_then_posted_closes_the_routine_run(self):
        url = f'/api/marketing/posts/{self.post.pk}/'
        blocked = self.client.post(url + 'ready/')
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(len(blocked.data['missing']), 4)
        ids = self._upload(4)
        self.client.put(url + 'photos/', {'photo_ids': ids}, format='json')
        res = self.client.patch(url, {'hook': 'New in: a whole wall of kitchen gear', 'call_to_action': 'come_in'},
                                format='json')
        self.assertTrue(res.data['passes'], res.data['checks'])
        self.assertIn('Come in and see it on the floor.', res.data['text'])
        self.assertIn('8425 West Center Road', res.data['text'])
        self.assertEqual(self.client.post(url + 'ready/').data['status'], 'ready')
        # Editing it until it fails sends it back to Draft.
        self.assertEqual(self.client.patch(url, {'hook': ''}, format='json').data['status'], 'draft')
        self.client.patch(url, {'hook': 'Back in stock'}, format='json')
        routine = Routine.objects.get(kind=Routine.KIND_SOCIAL_POST)
        run = RoutineRun.objects.create(routine=routine, period_key=self.post.slot_date.isoformat(),
                                        due_at=timezone.now())
        self.assertEqual(self.client.post(url + 'posted/', {'url': 'https://example.com/x'}).status_code, 400)
        done = self.client.post(url + 'posted/', {'url': 'https://www.facebook.com/ecothrift/posts/123'})
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data['status'], 'posted')
        run.refresh_from_db()
        self.assertEqual(run.status, RoutineRun.STATUS_DONE)
        self.assertEqual(run.completed_by, self.staff)
        self.assertEqual(self.client.patch(url, {'hook': 'late edit'}, format='json').status_code, 400)

    def test_rating_is_the_owners(self):
        url = f'/api/marketing/posts/{self.post.pk}/rating/'
        self.assertEqual(self.client.post(url, {'rating': 4}).status_code, 403)
        owner = APIClient()
        owner.force_authenticate(self.owner)
        self.assertEqual(owner.post(url, {'rating': 6}).status_code, 400)
        self.assertEqual(owner.post(url, {'rating': 4}).data['rating'], 4)
        self.assertIsNone(owner.post(url, {'rating': ''}).data['rating'])

    def test_week_endpoint_and_swap(self):
        res = self.client.get(f'/api/marketing/week/?start={(MONDAY + timedelta(days=7)).isoformat()}')
        self.assertEqual(res.status_code, 200)
        posts = [day['post'] for day in res.data['days'] if day['post']]
        self.assertEqual(len(posts), 6)
        self.assertFalse(res.data['days'][0]['open'])
        swap = self.client.post(f'/api/marketing/posts/{posts[0]["id"]}/swap/', {'with': posts[1]['id']})
        self.assertEqual(swap.data['post_type'], posts[1]['post_type'])

    def test_caption_spacing(self):
        self.post.hook = 'Hook'
        self.post.call_to_action = SocialPost.CTA_HOLD
        text = post_text(self.post)
        self.assertTrue(text.startswith('Hook\n⠀\nWant it?'))


class TodaysPostRoutineTests(TestCase):
    def setUp(self):
        _hours()
        self.routine = Routine.objects.get(kind=Routine.KIND_SOCIAL_POST)

    def test_seed(self):
        self.assertFalse(self.routine.system_key)
        self.assertEqual(self.routine.due_time.strftime('%H:%M'), '11:30')
        self.assertEqual(self.routine.assignment, Routine.ASSIGN_POOLED)

    def test_runs_only_on_posting_days(self):
        materialize_routines(MONDAY)
        materialize_routines(MONDAY + timedelta(days=1))
        keys = set(RoutineRun.objects.filter(routine=self.routine).values_list('period_key', flat=True))
        self.assertEqual(keys, {(MONDAY + timedelta(days=1)).isoformat()})

    def test_submit_waits_for_the_post(self):
        day = MONDAY + timedelta(days=1)
        run = RoutineRun.objects.create(routine=self.routine, period_key=day.isoformat(), due_at=timezone.now())
        responses = merge_incoming(self.routine, run, {'post_id': True, 'post_status': 'nope'})
        self.assertEqual(responses, {'post_id': None, 'post_status': None})
        self.assertEqual(submit_blockers(self.routine, responses, run=run), [])  # no post planned that day
        post = SocialPost.objects.create(slot_date=day, post_type=SocialPost.TYPE_NEW)
        self.assertEqual(len(submit_blockers(self.routine, responses, run=run)), 1)
        post.status = SocialPost.STATUS_POSTED
        post.save()
        self.assertEqual(submit_blockers(self.routine, responses, run=run), [])
        self.assertEqual(outcome(self.routine, responses), (0, False))
