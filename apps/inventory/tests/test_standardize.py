"""Standardize: the hard rules that must never drift (no model calls)."""
import json
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase

from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES
from apps.inventory import spec_rules
from apps.inventory.services import standardize as s


class RulesTests(SimpleTestCase):
    def test_canon_and_spec_rules_cover_exactly_the_taxonomy(self):
        cats = s.canon()
        self.assertEqual(set(cats), set(TAXONOMY_V1_CATEGORY_NAMES))
        self.assertEqual(set(spec_rules.CATEGORY_RULES), set(TAXONOMY_V1_CATEGORY_NAMES))
        self.assertIn('Figures', cats['Toys & games'])
        self.assertEqual(cats['Mixed lots & uncategorized'], [])

    def test_validate_keeps_canon_and_allowed_specs_only(self):
        cats = s.canon()
        out, problems = s.validate({
            'display_title': 'Wade Logan D958635Green Modular Sectional Green', 'short_name': 'Wade Logan Sectional',
            'vector_text': 'wade logan modular sectional sofa green', 'brand': 'Wade Logan', 'model_number': 'D958635Green',
            'category': 'Furniture', 'subcategory': 'Seating',
            'key_specs': {'furniture_type': 'sectional', 'piece_count': '4pc', 'color': 'green'},
            'item_details': {'color': 'Green'}, 'confidence': 'high',
        }, cats)
        self.assertEqual(out['key_specs'], {'furniture_type': 'sectional', 'piece_count': '4pc'})
        self.assertIn('specs not in the Furniture rules (dropped): color', problems)
        self.assertEqual(out['display_title'], 'Wade Logan Modular Sectional')   # no model code, no color
        self.assertNotIn('green', out['vector_text'].split())                   # item detail out
        self.assertIn('4pc', out['vector_text'].split())                        # product spec in
        _, bad = s.validate({'category': 'Gadgets', 'subcategory': 'x'}, cats)
        self.assertTrue(any('not canon' in p for p in bad))
        _, bad_sub = s.validate({'category': 'Furniture', 'subcategory': 'Figures'}, cats)
        self.assertTrue(any('subcategory not canon' in p for p in bad_sub))

    def test_an_answer_swapped_between_products_is_caught(self):
        given = {'title': 'Finish Ultimate Dishwasher Detergent Tabs 52ct', 'brand': 'Finish'}
        doll = {'display_title': 'Monster High Corpse Bride Doll', 'vector_text': 'monster high doll', 'brand': 'Monster High'}
        tabs = {'display_title': 'Finish Ultimate Dishwasher Tabs 52ct', 'vector_text': 'finish dishwasher tabs', 'brand': 'Finish'}
        self.assertFalse(s.matches_input(doll, given))
        self.assertTrue(s.matches_input(tabs, given))


class LoadTests(TestCase):
    def test_load_writes_auto_and_pending_proposals_idempotently(self):
        from apps.inventory.models import Category, Product, ProductProposal

        cat = Category.objects.create(name='Toys', slug='toys-std')
        good = Product.objects.create(title='Lego Set', category=cat)
        shaky = Product.objects.create(title='Thing', category=cat)
        rows = [
            {'id': good.pk, 'display_title': 'Lego City Set', 'short_name': 'Lego City Set', 'vector_text': 'lego city',
             'brand': 'Lego', 'model_number': '', 'category': 'Toys & games', 'subcategory': 'Building sets',
             'key_specs': {'toy_type': 'building set'}, 'confidence': 'high', 'problems': [], 'sold': 12.5,
             'source': 'ai:test', 'rules_version': 'spec-v1+tax:x'},
            {'id': shaky.pk, 'display_title': 'Thing', 'short_name': 'Thing', 'vector_text': 'thing', 'brand': 'Generic',
             'model_number': '', 'category': 'Mixed lots & uncategorized', 'subcategory': '', 'key_specs': {},
             'confidence': 'low', 'problems': [], 'sold': 0, 'source': 'ai:test', 'rules_version': 'spec-v1+tax:x'},
        ]
        with patch.object(s, 'OUT_DIR', s.Path(self._tmp())):
            (s.OUT_DIR / 't1.jsonl').write_text('\n'.join(json.dumps(r) for r in rows), encoding='utf-8')
            first = s.load('t1')
            again = s.load('t1')
        self.assertEqual((first['auto'], first['pending']), (1, 1))
        self.assertEqual(first['proposals'], again['proposals'])
        self.assertEqual(ProductProposal.objects.filter(batch='t1').count(), first['proposals'])
        self.assertEqual(ProductProposal.objects.get(batch='t1', product=good, field='category').status, 'auto')
        self.assertEqual(ProductProposal.objects.get(batch='t1', product=good, field='category').rules_version, 'spec-v1+tax:x')

    def _tmp(self):
        import tempfile
        d = tempfile.mkdtemp()
        self.addCleanup(__import__('shutil').rmtree, d, True)
        return d


class ExampleTests(SimpleTestCase):
    def test_every_worked_example_is_valid_under_the_rules(self):
        from apps.inventory.standard_examples import EXAMPLES

        cats = s.canon()
        for e in EXAMPLES:
            _, problems = s.validate(dict(e['answer']), cats, e['input'])
            self.assertEqual(problems, [], e['input']['title'])
