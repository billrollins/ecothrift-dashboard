"""Ad results dump (Dash #182): scrub, AI read (mocked), match, save/update, weights, the category read."""
from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.inventory.models import Category, Item, Product, ProductProfile
from apps.marketing.models import MarketingSpend, SocialPost
from apps.marketing.services import ads, numbers

TOYS = 'Toys & games'
GAMES = f'{TOYS} › Board games & puzzles'

PASTE = """View results
Performance
$99.60 spent over 4 days.
Reach
11,221
Activity
Post engagements2295Link clicks517Post reactions45
Audience
80.0% Women
20.0% Men
Location
United States: Omaha (+35 mi) Nebraska
Goal
Get more engagement
Daily budget
$25.00
Start date
Nov 13, 2026
End date
Nov 17, 2026
Created by
Pat Example
Ad account
Pat Example 12345
Ad type
Boosted Facebook post
Preview
Game Night!!! We've got loads of great Brand New games! Call 402-555-0100 or mail pat@example.com
Payment method
Visa 4111 1111 1111 1111
Amount spent
$99.60
"""

POST_TEXT = "Game Night!!! We've got loads of great Brand New games! Throw a new game into your Friday Game Night rotation!"


def _user(email, superuser=False):
    user = User.objects.create_user(email=email, first_name='T', last_name='Staff', password='test-pass-123')
    user.groups.add(Group.objects.get_or_create(name='Employee')[0])
    if superuser:
        user.is_superuser = True
        user.save(update_fields=['is_superuser'])
    return user


def _at(day, hour=10):
    return timezone.make_aware(datetime.combine(day, time(hour)))


def _answer(start, end, **extra):
    return {
        'start_date': start.isoformat(), 'end_date': end.isoformat(), 'spent': 99.6, 'daily_budget': 25,
        'goal': 'Get more engagement', 'ad_type': 'Boosted Facebook post', 'channel': 'facebook',
        'results': {'reach': 11221, 'link_clicks': 517, 'post_engagements': 2295, 'views': None},
        'audience': {'location': 'Omaha (+35 mi)', 'age_min': 18, 'age_max': 65, 'women_pct': 80, 'men_pct': 20},
        'post_text': POST_TEXT,
        'weights': [{'key': GAMES, 'pct': 90}, {'key': 'Toys & games › Figures', 'pct': 10}],
        **extra,
    }


class AdResultsTests(TestCase):
    def setUp(self):
        AppSetting.objects.update_or_create(key='online_sales.hours', defaults={'value': {'closed_weekdays': []}})
        self.today = timezone.localdate()
        self.start = self.today - timedelta(days=5)
        self.end = self.today - timedelta(days=1)
        self.owner = _user('owner@example.com', superuser=True)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def _read(self, answer=None):
        with mock.patch('apps.core.services.llm_router.llm_chat_tool_input',
                        return_value=(answer or _answer(self.start, self.end), 'muse-spark-1.3-contributor')) as ai:
            res = self.client.post('/api/marketing/ads/read/', {'text': PASTE}, format='json')
        return res, ai

    def test_scrub_cuts_who_account_and_payment(self):
        clean = ads.scrub(PASTE)
        for gone in ('Pat Example', '4111', 'pat@example.com', '402-555-0100', 'Payment method', 'Ad account'):
            self.assertNotIn(gone, clean)
        self.assertIn('Game Night!!!', clean)
        self.assertIn('11,221', clean)

    def test_read_is_owner_only_and_never_sends_payment(self):
        staff = APIClient()
        staff.force_authenticate(_user('staff@example.com'))
        self.assertEqual(staff.post('/api/marketing/ads/read/', {'text': PASTE}, format='json').status_code, 403)
        res, ai = self._read()
        self.assertEqual(res.status_code, 200, res.data)
        sent = ai.call_args.kwargs['user']
        self.assertNotIn('4111', sent)
        self.assertNotIn('Pat Example', sent)
        self.assertEqual(ai.call_args.kwargs['purpose'], 'AD_RESULTS')
        draft = res.data['draft']
        self.assertEqual(draft['spent'], '99.60')
        self.assertEqual(draft['results'], {'reach': 11221, 'link_clicks': 517, 'post_engagements': 2295})
        self.assertEqual(draft['weights'], {GAMES: 90, 'Toys & games › Figures': 10})
        self.assertEqual(draft['audience']['women_pct'], 80)
        self.assertTrue(res.data['match']['need_photos'])
        self.assertFalse(res.data['match']['need_text'])
        self.assertIsNone(res.data['match']['ad_id'])

    def test_ai_weights_are_fit_to_real_keys_and_100(self):
        tax = ads.taxonomy()
        self.assertEqual(ads._fit_weights([{'key': 'Toys & games', 'pct': 80}, {'key': 'Nope', 'pct': 10}], tax),
                         {TOYS: 100})
        self.assertEqual(ads._fit_weights([{'key': TOYS, 'pct': 2}, {'key': 'Electronics', 'pct': 1}], tax),
                         {TOYS: 67, 'Electronics': 33})
        self.assertEqual(ads._fit_weights([], tax), {'ALL': 100})
        self.assertEqual(ads._fit_weights([{'key': 'all', 'pct': 100}], tax), {'ALL': 100})

    def test_save_then_paste_again_updates_the_same_ad(self):
        res, _ = self._read()
        draft = res.data['draft']
        saved = self.client.post('/api/marketing/ads/', draft, format='json')
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data['spent'], '99.60')
        again, _ = self._read(_answer(self.start, self.end, spent=120))
        self.assertEqual(again.data['match']['ad_id'], saved.data['id'])
        self.client.post('/api/marketing/ads/', {**again.data['draft'], 'ad_id': again.data['match']['ad_id']},
                         format='json')
        self.assertEqual(MarketingSpend.objects.filter(kind='boost').count(), 1)
        self.assertEqual(MarketingSpend.objects.get().amount, Decimal('120.00'))

    def test_weights_must_be_100_or_all(self):
        res, _ = self._read()
        draft = res.data['draft']
        bad = self.client.post('/api/marketing/ads/', {**draft, 'weights': {TOYS: 80, 'Electronics': 10}}, format='json')
        self.assertEqual(bad.data['code'], 'BAD_WEIGHT')
        bad = self.client.post('/api/marketing/ads/', {**draft, 'weights': {'Rockets': 100}}, format='json')
        self.assertEqual(bad.data['code'], 'BAD_WEIGHT')
        ok = self.client.post('/api/marketing/ads/', {**draft, 'weights': {'ALL': 100}}, format='json')
        self.assertEqual(ok.data['weights'], {'ALL': 100})

    def test_matches_the_studio_post(self):
        post = SocialPost.objects.create(slot_date=self.start - timedelta(days=1), post_type=SocialPost.TYPE_SPOTLIGHT,
                                         hook='Game Night!!!', body=POST_TEXT[14:], status=SocialPost.STATUS_POSTED)
        res, _ = self._read()
        self.assertEqual(res.data['match']['post_id'], post.pk)
        self.assertFalse(res.data['match']['need_photos'])
        saved = self.client.post('/api/marketing/ads/', res.data['draft'], format='json')
        self.assertEqual(saved.data['post_id'], post.pk)

    def test_read_category_lift_cost_and_overlap(self):
        cat, _ = Category.objects.get_or_create(name=TOYS)
        game = Product.objects.create(title='UNO', category=cat)
        ProductProfile.objects.create(product=game, category=TOYS, subcategory='Board games & puzzles')
        other = Product.objects.create(title='Pan', category=Category.objects.get_or_create(name='Kitchen & dining')[0])

        def sell(product, n, on):
            for _ in range(n):
                Item.objects.create(sku=f'S{Item.objects.count():07d}', product=product, price=Decimal('5'),
                                    status='sold', sold_at=_at(on), sold_for=Decimal('5'))

        for k in range(1, 29):  # 1 game a day for the 28 days before
            sell(game, 1, self.start - timedelta(days=k))
        unsorted = Product.objects.create(title='Toy', category=cat)  # a toy with no subcategory
        sell(unsorted, 3, self.start - timedelta(days=1))
        for k in range(5):  # 3 a day during the 5 days of the ad
            sell(game, 3, self.start + timedelta(days=k))
            sell(other, 2, self.start + timedelta(days=k))
        ad = MarketingSpend.objects.create(kind='boost', day=self.start, end_day=self.end + timedelta(days=3),
                                           amount=Decimal('100.00'), category_weights={GAMES: 100})
        MarketingSpend.objects.create(kind='boost', day=self.start - timedelta(days=10), amount=Decimal('500'),
                                      end_day=self.start - timedelta(days=8), category_weights={'ALL': 100})
        read = ads.ad_read(ad, self.today)
        self.assertEqual(read['days'], 5)  # still running: through yesterday
        games = read['rows'][0]
        self.assertEqual((games['key'], games['per_day_before'], games['per_day_during']), (GAMES, 1.0, 3.0))
        self.assertEqual(games['extra_units'], 10.0)
        self.assertEqual(read['cost_per_extra_unit'], '10.00')
        self.assertEqual(games['no_sub_pct'], 7)  # 3 of 46 toys sold carry no subcategory
        toys = read['rows'][1]  # the subcategory's own category, for context
        self.assertEqual((toys['key'], toys['watched'], toys['per_day_before']), (TOYS, False, 1.1))
        store = read['rows'][2]
        self.assertEqual((store['key'], store['watched'], store['per_day_during']), ('ALL', False, 5.0))
        self.assertEqual(len(read['overlaps']), 1)

        page = self.client.get('/api/marketing/numbers/').data
        self.assertEqual(page['ads'][0]['id'], ad.pk)
        with mock.patch('apps.pos.services.sales_numbers.by_day', return_value={}):
            card = numbers.weekly_card(self.today)
        self.assertEqual(card['top_ad']['cost_per_extra_unit'], '10.00')
        self.assertEqual(card['top_ad']['watched'], 'Board games & puzzles')

    def test_no_read_before_the_ad_starts(self):
        ad = MarketingSpend.objects.create(kind='boost', day=self.today, amount=Decimal('10'), category_weights={'ALL': 100})
        self.assertIsNone(ads.ad_read(ad, self.today))
        # Started, but no sales in its days yet: no read, not a false -100%.
        ad.day = self.today - timedelta(days=2)
        self.assertIsNone(ads.ad_read(ad, self.today))
