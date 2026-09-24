"""Listing condition groups and per-group revenue shrink (register AUC-05)."""
from decimal import Decimal

from django.test import SimpleTestCase, TestCase

from apps.buying.services.condition import (
    condition_group,
    get_condition_shrink,
    shrink_for,
)
from apps.core.models import AppSetting


class ConditionGroupTests(SimpleTestCase):
    def test_phrases_seen_on_b_stock(self):
        cases = {
            'Used Good': 'used_good',
            "['Used Good']": 'used_good',
            'Used Fair': 'used_fair',
            'Like New': 'like_new',
            'New': 'new',
            'Brand New': 'new',
            'Salvage': 'damaged',
            'Scratch & Dent': 'damaged',
            'Mixed': 'unspecified',
            'Unspecified': 'unspecified',
            '': 'unspecified',
            None: 'unspecified',
        }
        for text, group in cases.items():
            self.assertEqual(condition_group(text), group, text)

    def test_combined_takes_the_worst(self):
        self.assertEqual(condition_group('Salvage, Used Fair'), 'damaged')
        self.assertEqual(condition_group("['Like New', 'Used Good']"), 'used_good')

    def test_shrink_order_override_condition_global(self):
        by_cond = {'damaged': Decimal('0.4')}
        g = Decimal('0.15')
        self.assertEqual(shrink_for(Decimal('0.2'), 'Salvage', g, by_cond), (Decimal('0.2'), 'override'))
        self.assertEqual(shrink_for(None, 'Salvage', g, by_cond), (Decimal('0.4'), 'condition'))
        self.assertEqual(shrink_for(None, 'Used Good', g, by_cond), (g, 'global'))


class ConditionShrinkSettingTests(TestCase):
    def test_zero_means_use_global(self):
        AppSetting.objects.update_or_create(key='buying_shrink_damaged', defaults={'value': 0.35})
        AppSetting.objects.update_or_create(key='buying_shrink_new', defaults={'value': 0})
        got = get_condition_shrink()
        self.assertEqual(got.get('damaged'), Decimal('0.35'))
        self.assertNotIn('new', got)
