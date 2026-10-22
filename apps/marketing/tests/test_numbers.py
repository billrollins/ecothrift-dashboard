from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.inventory.models import Category, Item, Product
from apps.marketing.models import MarketingSpend, SocialPost, SocialPostNumbers
from apps.marketing.services import numbers

KITCHEN = 'Kitchen & dining'


def _user(email, superuser=False):
    user = User.objects.create_user(email=email, first_name='T', last_name='Staff', password='test-pass-123')
    user.groups.add(Group.objects.get_or_create(name='Employee')[0])
    if superuser:
        user.is_superuser = True
        user.save(update_fields=['is_superuser'])
    return user


def _at(day, hour=10):
    return timezone.make_aware(datetime.combine(day, time(hour)))


def _posted(day, post_type=SocialPost.TYPE_NEW, category='', hook='Hook'):
    return SocialPost.objects.create(slot_date=day, post_type=post_type, category=category, hook=hook,
                                     status=SocialPost.STATUS_POSTED, posted_at=_at(day),
                                     posted_url='https://www.facebook.com/ecothrift/posts/1')


def _day(count, sales):
    return {'sales_count': count, 'net_item_sales': f'{sales:.2f}'}


class NumbersTests(TestCase):
    def setUp(self):
        AppSetting.objects.update_or_create(key='online_sales.hours', defaults={'value': {'closed_weekdays': []}})
        self.today = timezone.localdate()
        self.staff = _user('staff@example.com')
        self.owner = _user('owner@example.com', superuser=True)
        self.client = APIClient()
        self.client.force_authenticate(self.staff)

    def test_numbers_come_due_at_1_and_7_days_and_save(self):
        post = _posted(self.today - timedelta(days=8))
        url = f'/api/marketing/posts/{post.pk}/numbers/'
        self.assertEqual(self.client.get(url).data['due'], [1, 7])
        res = self.client.put(url, {'mark': 1, 'reach': '1,200', 'reactions': 40, 'comments': 5, 'shares': 3,
                                    'messages': 2, 'link_clicks': 0}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['day1']['reach'], 1200)
        self.assertEqual(res.data['day1']['engagement'], 50)
        self.assertEqual(res.data['due'], [7])
        self.client.put(url, {'mark': 1, 'reach': 1300}, format='json')  # typed again: replaced, not added
        self.assertEqual(SocialPostNumbers.objects.get(post=post, mark=1).reach, 1300)
        self.assertEqual(self.client.put(url, {'mark': 3}, format='json').data['code'], 'BAD_MARK')
        self.assertEqual(self.client.put(url, {'mark': 7, 'reach': -1}, format='json').data['code'], 'BAD_NUMBER')
        self.assertEqual(self.client.put(url, {'mark': 7, 'reach': 'lots'}, format='json').data['code'], 'BAD_NUMBER')
        fresh = _posted(self.today)
        self.assertEqual(numbers.due_marks(fresh, self.today), [])
        draft = SocialPost.objects.create(slot_date=self.today + timedelta(days=1), post_type=SocialPost.TYPE_LIVE)
        bad = self.client.put(f'/api/marketing/posts/{draft.pk}/numbers/', {'mark': 1}, format='json')
        self.assertEqual(bad.data['code'], 'NOT_POSTED')
        detail = self.client.get(f'/api/marketing/posts/{post.pk}/').data
        self.assertEqual(detail['numbers_due'], [7])
        self.assertEqual(detail['numbers']['day1']['reach'], 1300)

    def test_spend_is_the_owners_and_adds_up(self):
        res = self.client.post('/api/marketing/spend/', {'kind': 'boost', 'amount': '5'}, format='json')
        self.assertEqual(res.status_code, 403)
        owner = APIClient()
        owner.force_authenticate(self.owner)
        post = _posted(self.today - timedelta(days=1))
        added = owner.post('/api/marketing/spend/', {'kind': 'boost', 'amount': '$5.00', 'post': post.pk,
                                                     'day': self.today.isoformat()}, format='json')
        self.assertEqual(added.status_code, 201, added.data)
        self.assertEqual(added.data['amount'], '5.00')
        self.assertEqual(added.data['post_id'], post.pk)
        self.assertEqual(owner.post('/api/marketing/spend/', {'kind': 'boost', 'amount': '0'}, format='json').data['code'],
                         'BAD_AMOUNT')
        self.assertEqual(owner.post('/api/marketing/spend/', {'kind': 'lunch', 'amount': '3'}, format='json').data['code'],
                         'BAD_KIND')
        page = self.client.get('/api/marketing/numbers/').data
        self.assertEqual(page['spend']['week'], '5.00')
        self.assertFalse(page['can_spend'])
        self.assertEqual(owner.delete(f"/api/marketing/spend/{added.data['id']}/").status_code, 204)
        self.assertFalse(MarketingSpend.objects.exists())

    def test_hits_rank_by_engagement_and_group_by_type(self):
        a = _posted(self.today - timedelta(days=10), SocialPost.TYPE_NEW)
        b = _posted(self.today - timedelta(days=9), SocialPost.TYPE_SPOTLIGHT, category=KITCHEN)
        _posted(self.today - timedelta(days=3), SocialPost.TYPE_NEW)  # no numbers yet
        SocialPostNumbers.objects.create(post=a, mark=1, reach=500, reactions=10)
        SocialPostNumbers.objects.create(post=a, mark=7, reach=900, reactions=30)  # the 7-day numbers win
        SocialPostNumbers.objects.create(post=b, mark=7, reach=400, reactions=60, shares=5)
        with mock.patch('apps.pos.services.sales_numbers.by_day', return_value={}):
            page = numbers.insights(self.today)
        self.assertEqual([h['id'] for h in page['hits']][:2], [b.pk, a.pk])
        self.assertEqual(page['hits'][1]['reach'], 900)
        self.assertEqual(page['hits'][2]['engagement'], None)
        new = next(g for g in page['by_type'] if g['key'] == SocialPost.TYPE_NEW)
        self.assertEqual((new['posts'], new['with_numbers'], new['avg_reach']), (2, 1, 900))
        self.assertEqual(page['by_category'][0]['key'], KITCHEN)
        self.assertEqual(len(page['due']), 2)  # the 3-day-old post owes its 1-day numbers; b owes day 1 too

    def test_post_days_against_the_same_weekday(self):
        day = self.today - timedelta(days=14)
        _posted(day)
        sales = {day: _day(120, 2400)}
        for k in range(1, 9):
            sales[day - timedelta(weeks=k)] = _day(100, 2000)
        sales[day - timedelta(weeks=3)] = _day(0, 0)  # closed that day: not in the baseline
        with mock.patch('apps.pos.services.sales_numbers.by_day', return_value=sales):
            read = numbers.insights(self.today)['read']
        self.assertEqual(read['post_days'], 1)
        self.assertEqual(read['ticket_lift'], '20.0')
        self.assertEqual(read['sales_lift'], '20.0')
        self.assertEqual(read['by_type'][0]['days'], 1)

    def test_spotlight_category_sales_against_the_weeks_before(self):
        day = self.today - timedelta(days=10)
        _posted(day, SocialPost.TYPE_SPOTLIGHT, category=KITCHEN)
        cat, _ = Category.objects.get_or_create(name=KITCHEN)
        product = Product.objects.create(title='Pan', category=cat)

        def sell(n, on):
            for _ in range(n):
                Item.objects.create(sku=f'S{Item.objects.count():07d}', product=product, price=Decimal('10'),
                                    status='sold', sold_at=_at(on), sold_for=Decimal('10'))

        sell(6, day + timedelta(days=2))
        for k in range(1, 5):
            sell(3, day - timedelta(weeks=k) + timedelta(days=1))
        with mock.patch('apps.pos.services.sales_numbers.by_day', return_value={}):
            spots = numbers.insights(self.today)['read']['spotlights']
        self.assertEqual(spots[0]['sold_after'], 6)
        self.assertEqual(spots[0]['dollars_after'], '60.00')
        self.assertEqual(spots[0]['sold_before_avg'], 3.0)
        self.assertEqual(spots[0]['change'], '100.0')

    def test_owner_card(self):
        monday = self.today - timedelta(days=self.today.weekday())
        post = _posted(monday)
        SocialPost.objects.create(slot_date=monday + timedelta(days=6), post_type=SocialPost.TYPE_SCHEDULED)
        SocialPostNumbers.objects.create(post=post, mark=1, reach=800, reactions=25, comments=5)
        MarketingSpend.objects.create(day=self.today, kind=MarketingSpend.KIND_PRINT, amount=Decimal('12.50'))
        self.assertEqual(self.client.get('/api/core/owner/social/').status_code, 403)
        owner = APIClient()
        owner.force_authenticate(self.owner)
        with mock.patch('apps.pos.services.sales_numbers.by_day', return_value={}):
            card = owner.get('/api/core/owner/social/').data
        self.assertEqual((card['planned'], card['posted']), (2, 1))
        self.assertEqual((card['reach'], card['engagement']), (800, 30))
        self.assertEqual(card['best']['id'], post.pk)
        self.assertEqual(card['spend_week'], '12.50')
        self.assertEqual(card['link'], '/studios/social/numbers')
