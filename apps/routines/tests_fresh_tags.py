"""The daily fresh-tag check (retail_tags_and_social Phase 1): drawn from the last check-in day, misses become bad tags,
and it counts in Retail QA's Do from the day it was seeded."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import Item, Product
from apps.stocktake.models import BadTag

from . import grading
from .kinds import fresh_tag_misses, outcome, submit_blockers
from .models import Routine, RoutineRun
from .schedule import SYSTEM_FRESH_TAGS, draw_fresh_tags


def _aware(day: date, hour: int = 12):
    return timezone.make_aware(datetime(day.year, day.month, day.day, hour, 0), timezone.get_current_timezone())


class FreshTagsTests(TestCase):
    def setUp(self):
        self.routine = Routine.objects.get(system_key=SYSTEM_FRESH_TAGS)
        self.today = timezone.localdate()
        self.owner = get_user_model().objects.create_superuser(email='owner@example.com', password='pw', first_name='Bill', last_name='Owner')
        self.owner.groups.add(Group.objects.get_or_create(name='Manager')[0])
        product = Product.objects.create(title='Lamp')
        self.items = []
        for n in range(12):
            item = Item.objects.create(product=product, price=Decimal('5.00'), retail=Decimal('20.00'), status='on_shelf')
            Item.objects.filter(pk=item.pk).update(checked_in_at=_aware(self.today - timedelta(days=2)))
            self.items.append(item)

    def test_seeded_as_a_pooled_retail_routine(self):
        self.assertEqual(self.routine.kind, Routine.KIND_FRESH_TAGS)
        self.assertEqual(self.routine.assignment, 'pooled')
        self.assertIn('retail_day', self.routine.assigned_shifts)

    def test_draw_uses_the_last_day_with_check_ins_and_is_stable(self):
        drawn = draw_fresh_tags(self.today, 10)
        self.assertEqual(len(drawn['items']), 10)
        self.assertEqual(drawn['checked_in_day'], (self.today - timedelta(days=2)).isoformat())
        self.assertEqual(drawn, draw_fresh_tags(self.today, 10))

    def test_nothing_checked_in_draws_nothing(self):
        Item.objects.all().delete()
        self.assertEqual(draw_fresh_tags(self.today, 10)['items'], [])

    def _run(self, count=3):
        drawn = draw_fresh_tags(self.today, count)
        return RoutineRun.objects.create(
            routine=self.routine, period_key=self.today.isoformat(), due_at=timezone.now() + timedelta(hours=2),
            generated=drawn,
        )

    def test_blockers_outcome_and_misses(self):
        run = self._run()
        rows = run.generated['items']
        responses = {'items': [{**rows[0], 'found': 'yes', 'match': 'pass', 'retail_ok': 'fail', 'price_ok': 'high'}]}
        from .kinds import merge_incoming

        merged = merge_incoming(self.routine, run, responses)
        self.assertEqual(submit_blockers(self.routine, merged, run=run), ['Check every item. 2 left.'])
        merged['items'][1]['found'] = 'no'
        merged['items'][2].update(found='yes', match='pass', retail_ok='pass', price_ok='pass')
        self.assertEqual(submit_blockers(self.routine, merged, run=run), [])
        self.assertEqual([reason for _row, reason in fresh_tag_misses(merged)], ['retail_high', 'price_high'])
        self.assertEqual(outcome(self.routine, merged), (2, False))

    def test_submit_turns_misses_into_bad_tags(self):
        run = self._run()
        client = APIClient()
        client.force_authenticate(self.owner)
        created = client.post('/api/routines/submissions/', {'routine': self.routine.pk, 'run': run.pk}, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        items = created.data['responses']['items']
        self.assertEqual(len(items), 3)
        items[0].update(found='yes', match='fail', retail_ok='pass', price_ok='pass', note='Tag is for a chair')
        items[1].update(found='no')
        items[2].update(found='yes', match='pass', retail_ok='na', price_ok='low')
        done = client.post(f'/api/routines/submissions/{created.data["id"]}/submit/', {'responses': {'items': items}},
                           format='json')
        self.assertEqual(done.status_code, 200, done.data)
        bads = BadTag.objects.order_by('pk')
        self.assertEqual([b.reason for b in bads], ['wrong_item', 'price_low'])
        self.assertTrue(all(b.found_where == 'fresh_tags' and b.routine_run_id == run.pk for b in bads))
        self.assertEqual(bads[0].detail, 'Tag is for a chair')


class FreshTagsGradingTests(TestCase):
    def test_expected_on_open_days_from_the_seed_day(self):
        routine = Routine.objects.get(system_key=SYSTEM_FRESH_TAGS)
        seeded = timezone.localtime(routine.created_at).date()
        with patch('apps.routines.grading.is_open_day', return_value=True):
            self.assertTrue(grading.fresh_tags_expected(seeded))
            self.assertFalse(grading.fresh_tags_expected(seeded - timedelta(days=1)))
            keys, _sections = grading.expected_parts_live(seeded)
            self.assertIn(SYSTEM_FRESH_TAGS, keys)
            # A frozen total from before the check existed splits as it always did.
            self.assertEqual(grading.split_frozen_expected(seeded - timedelta(days=1), 5), (3, 2))
            self.assertEqual(grading.split_frozen_expected(seeded, 5), (4, 1))
        with patch('apps.routines.grading.is_open_day', return_value=False):
            self.assertFalse(grading.fresh_tags_expected(seeded))
