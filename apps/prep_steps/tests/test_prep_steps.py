"""Truck Prep A (Steps): the rules, the step line, AI preview / apply / undo, and the API."""
from decimal import Decimal as D
from unittest import mock

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.inventory.models import ManifestRow, PreprocessingRow, PurchaseOrder, Vendor
from apps.prep_steps.models import PrepAction, PrepLine, PrepRun
from apps.prep_steps.services import ai, changes as ch, load as L, rules as R, steps as S
from apps.prep_steps.services.flags import line_flags


class RuleTests(SimpleTestCase):
    def test_pack_words_follow_the_one_standard(self):
        self.assertEqual(R.pack_words(100, 'box', 3), '3 boxes × 100')
        self.assertEqual(R.pack_words(100, '', 1), '100 ct')
        self.assertEqual(R.pack_words(1, 'chair', 2), '2 chairs')
        self.assertEqual(R.pack_words(None, '', None), '')

    def test_packs_are_read_from_seller_titles(self):
        p = R.parse_pack('Kleenex Professional Facial Tissue (125 Tissues/Box, 48 Boxes, 6,000 Sheets/Case)')
        self.assertEqual((p['unit_count'], p['unit_name'], p['pack_units']), (125, 'box', 48))
        p = R.parse_pack('Dining Chairs, Moss Green, Set of 2')
        self.assertEqual((p['unit_count'], p['pack_units']), (1, 2))
        p = R.parse_pack('Christmas Replacement Bulbs 25 Pack')
        self.assertEqual((p['pack_units'], p['unit_name']), (25, ''))
        p = R.parse_pack('Tide Pods 42 ct')
        self.assertEqual((p['unit_count'], p['pack_units']), (42, 1))
        self.assertIsNone(R.parse_pack('Espresso Machine with Grinder 20 Bar'))

    def test_titles_lose_disclaimers_codes_and_spec_tails(self):
        t = R.clean_title('Kleenex Professional Facial Tissue, Bulk (21606), 2-Ply, White (125 Tissues/Box, 48 Boxes)')
        self.assertEqual(t, 'Kleenex Professional Facial Tissue')
        t = R.clean_title('Convene 63 " W Curved Wicker with Cushions (Please be advised that sets may be missing pieces)')
        self.assertNotIn('advised', t)
        self.assertEqual(R.clean_title('BATH TOWEL, 6-PACK'), 'Bath Towel 6-PACK')

    def test_mojibake_and_wayfair_photos(self):
        self.assertEqual(L.fix_text('Latitude RunÂ®'), 'Latitude Run®')
        self.assertEqual(L.fix_text('Lark Manorâ„¢'), 'Lark Manor™')
        url = 'https://secure.img1-fg.wfcdn.com/im/12345678/resize-w800%5Ecompr-r85/1234/131862008/default_name.jpg'
        self.assertEqual(L.real_image(url),
                         'https://assets.wfcdn.com/im/1/resize-h800-w800%5Ecompr-r85/1318/131862008/x.jpg')
        self.assertTrue(L.upc_rounded('197768000000'))
        self.assertEqual(L.clean_upc('195877867891,'), '195877867891')

    def test_every_rule_names_a_real_category_and_subcategory(self):
        from apps.inventory.services.standardize import canon

        cats = canon()
        for cat, rules in R.SUB_RULES.items():
            self.assertIn(cat, cats)
            for _pattern, sub in rules:
                self.assertIn(sub, cats[cat], f'{cat} / {sub}')
        for _pattern, cat, sub in R.KEYWORD_CATS:
            self.assertIn(cat, cats)
            self.assertTrue(not sub or sub in cats[cat], f'{cat} / {sub}')
        for cat, sub in R.SELLER_WORDS.values():
            self.assertTrue(not sub or sub in cats[cat], f'{cat} / {sub}')

    def test_columns_are_found_by_header(self):
        cols = L.find_columns(['UPC', 'Item #', 'Item Description', 'Seller Category', 'Qty', 'Unit Retail', 'Ext. Retail'])
        self.assertEqual(cols['title'], 'Item Description')
        self.assertEqual(cols['retail'], 'Unit Retail')
        self.assertEqual(cols['subcategory'], 'Seller Category')

    def test_parse_answer_takes_fenced_or_wrapped_json(self):
        self.assertEqual(ai.parse_answer('```json\n[{"id": 1}]\n```'), [{'id': 1}])
        self.assertEqual(ai.parse_answer('{"lines": [{"id": 2}]}'), [{'id': 2}])
        self.assertEqual(ai.parse_answer('no json here'), [])


def _user(email, group):
    u = User.objects.create_user(email=email, first_name=group, last_name='X', password='x-pass-123')
    u.groups.add(Group.objects.get_or_create(name=group)[0])
    return u


RAW = [
    {'Item Description': 'Kleenex Professional Facial Tissue, Bulk (21606) (125 Tissues/Box, 48 Boxes)', 'Qty': '2',
     'Unit Retail': '89.60', 'Ext. Retail': '179.20', 'Category': 'HOUSEHOLD_ESSENTIALS',
     'Seller Category': 'Household Cleaning Products & Supplies', 'UPC': '36000216066', 'Item #': '567608843'},
    {'Item Description': 'Spruce & Spring Dining Chairs, Moss Green, Set of 2 (please be advised that sets may be '
                         'missing pieces)', 'Qty': '1', 'Unit Retail': '149.99', 'Ext. Retail': '149.99',
     'Category': 'MIXED_FURNITURE', 'Seller Category': 'Furniture', 'UPC': '840697341594', 'Item #': '685544854'},
    {'Item Description': 'RC Generic_Furniture', 'Qty': '3', 'Unit Retail': '50.00', 'Ext. Retail': '150.00',
     'Category': 'MIXED_FURNITURE', 'Seller Category': 'Furniture', 'UPC': '', 'Item #': ''},
]


@mock.patch('apps.prep_steps.services.match.embed', lambda texts: [[0.0] * 384 for _ in texts])
class StepLineTests(TestCase):
    def setUp(self):
        vendor = Vendor.objects.create(name='Walmart', code='WPA1')
        self.po = PurchaseOrder.objects.create(vendor=vendor, order_number='PA-1', ordered_date=timezone.localdate(),
                                               total_cost=D('100'), manifest_headers=list(RAW[0]))
        for i, raw in enumerate(RAW, start=1):
            PreprocessingRow.objects.create(purchase_order=self.po, row_number=i, raw_row=raw)
        self.manager = _user('boss-pa@example.com', 'Manager')

    def test_a_truck_whose_manifest_was_never_read_is_read_on_load(self):
        from apps.core.models import S3File

        vendor = Vendor.objects.create(name='Wayfair', code='WPA2')
        f = S3File.objects.create(key='manifests/pa-2.csv', filename='pa-2.csv', size=1, content_type='text/csv')
        po = PurchaseOrder.objects.create(vendor=vendor, order_number='PA-2', ordered_date=timezone.localdate(),
                                          total_cost=D('100'), manifest=f)

        def read_file(order):
            for i, raw in enumerate(RAW, start=1):
                PreprocessingRow.objects.create(purchase_order=order, row_number=i, raw_row=raw)

        with mock.patch('apps.inventory.views.ensure_preprocessing_raw_rows', side_effect=read_file) as read:
            run = L.load(po, user=self.manager)
        read.assert_called_once()
        self.assertEqual(run.lines.count(), len(RAW))
        with mock.patch('apps.inventory.views.ensure_preprocessing_raw_rows') as again:
            L.load(po, user=self.manager)
        again.assert_not_called()

    def test_every_step_runs_its_standard_fixes_and_nothing_in_inventory_changes(self):
        before = list(PreprocessingRow.objects.filter(purchase_order=self.po).values())
        run = L.load(self.po)
        self.assertEqual(run.lines.count(), 3)
        for _ in range(7):
            S.next_step(run)
            run.refresh_from_db()
        self.assertEqual(run.step, 'send')
        x1, x2, x3 = run.lines.order_by('row_number')
        self.assertEqual(x1.title, 'Kleenex Professional Facial Tissue')
        self.assertEqual((x1.unit_count, x1.unit_name, x1.pack_units), (125, 'box', 48))
        self.assertEqual(x1.category, 'Household & cleaning')
        self.assertEqual(x1.retail, D('89.60'))
        self.assertEqual(x1.price_class, 'S1')  # a commodity: Pricing Standards' share
        self.assertEqual(x2.category, 'Furniture')
        self.assertEqual(x2.price_class, 'FURN')
        self.assertEqual(x2.price, D('82.00'))  # 55% of 149.99, house rounding
        self.assertIn('Furniture', x2.reasons['price'])
        self.assertEqual(x3.match_kind, 'new')  # no real title
        self.assertEqual(list(PreprocessingRow.objects.filter(purchase_order=self.po).values()), before)
        self.assertFalse(ManifestRow.objects.filter(purchase_order=self.po).exists())
        out = S.send_dry_run(run)
        self.assertEqual(out['written'], 0)
        row = out['lines'][1]
        self.assertEqual(set(row) >= {'search_tags', 'product_match', 'product_draft', 'price', 'retail', 'pieces',
                                      'price_reason', 'retail_reason', 'pieces_reason'}, True)
        self.assertEqual(row['product_draft']['title'], f'{x2.title}, 2 units' if '2' not in x2.title else x2.title)
        self.assertEqual(out['lines'][0]['product_draft']['title'], f'{x1.title}, 48 boxes × 125')

    def test_an_edit_can_be_undone_and_a_later_edit_is_kept(self):
        run = L.load(self.po)
        S.enter(run, 'clean')
        line = run.lines.get(row_number=2)
        a1 = S.edit(run, 'clean', [{'line': line.pk, 'field': 'brand', 'new': 'Spruce & Spring'}])
        a2 = S.edit(run, 'clean', [{'line': line.pk, 'field': 'title', 'new': 'Dining Chairs Set of 2'}])
        line.refresh_from_db()
        self.assertEqual(line.sources['brand'], 'staff')
        ch.undo(a1)
        line.refresh_from_db()
        self.assertEqual(line.title, 'Dining Chairs Set of 2')
        self.assertNotEqual(line.brand, 'Spruce & Spring')
        a1.refresh_from_db()
        self.assertEqual(a1.status, PrepAction.STATUS_UNDONE)
        with self.assertRaises(ch.ChangeError):
            ch.undo(a1)
        self.assertEqual(a2.status, PrepAction.STATUS_APPLIED)

    def test_rules_never_overwrite_a_person(self):
        run = L.load(self.po)
        line = run.lines.get(row_number=1)
        S.edit(run, 'clean', [{'line': line.pk, 'field': 'title', 'new': 'My title'}])
        S.run_rule(run, 'clean_titles')
        line.refresh_from_db()
        self.assertEqual(line.title, 'My title')
        S.run_rule(run, 'clean_titles', [line.pk], force=True)
        line.refresh_from_db()
        self.assertEqual(line.title, 'Kleenex Professional Facial Tissue')

    def test_price_target_outliers_and_scaling(self):
        run = L.load(self.po)
        for step in ('match', 'category', 'retail', 'price'):
            S.enter(run, step)
        line = run.lines.get(row_number=2)
        S.edit(run, 'price', [{'line': line.pk, 'field': 'price', 'new': '20'}])
        line.refresh_from_db()
        share, band = S.target_of(run)
        self.assertIn('below_band', line_flags(line, share, band, {})['price'])
        S.accept(run, 'price', [line.pk])
        summary = S.summary(run)
        self.assertEqual(next(s for s in summary['steps'] if s['key'] == 'price')['open'], 0)
        run.target = {'share': 0.4, 'band': 0.15}
        run.save()
        S.scale_to_target(run)
        lines = list(run.lines.all())
        tag = R.truck_totals(lines)['tag']
        goal = R.manifest_retail(lines) * D('0.4')
        self.assertLess(abs(tag - goal) / goal, D('0.05'))

    def test_selling_a_pack_by_unit_splits_retail_and_price(self):
        run = L.load(self.po)
        for step in ('match', 'category', 'retail', 'price', 'packs'):
            S.enter(run, step)
        line = run.lines.get(row_number=1)
        S.run_rule(run, 'sell_units', [line.pk])
        line.refresh_from_db()
        self.assertEqual((line.sell_as, line.pieces), ('units', 48))
        self.assertEqual(line.retail, D('1.87'))
        self.assertTrue(line.price and line.price < line.retail)


@override_settings(PREP_STEPS_SYNC=True)
@mock.patch('apps.prep_steps.services.match.embed', lambda texts: [[0.0] * 384 for _ in texts])
class AiJobTests(TestCase):
    def setUp(self):
        vendor = Vendor.objects.create(name='Walmart', code='WPA2')
        self.po = PurchaseOrder.objects.create(vendor=vendor, order_number='PA-2', ordered_date=timezone.localdate())
        for i, raw in enumerate(RAW, start=1):
            PreprocessingRow.objects.create(purchase_order=self.po, row_number=i, raw_row=raw)
        self.run = L.load(self.po)

    def _fake(self, answers):
        def call(model, effort, system, items, purpose, detail):
            got = [a for a in answers if a['id'] in {i['id'] for i in items}]
            return got, {'in': 100, 'out': 50, 'cost': D('0.0012'), 'model': model}
        return mock.patch('apps.prep_steps.services.ai._call', side_effect=call)

    def test_preview_then_apply_then_undo(self):
        line = self.run.lines.get(row_number=3)
        with self._fake([{'id': line.pk, 'title': 'Upholstered Chair', 'brand': 'Generic Co', 'model': '', 'why': 'x'}]):
            action = ai.start_job(self.run, 'clean_ai', [line.pk])
        self.assertEqual(action.status, PrepAction.STATUS_PREVIEW)
        self.assertEqual(action.cost, D('0.0012'))
        self.assertEqual({c['field'] for c in action.preview}, {'title', 'brand'})
        line.refresh_from_db()
        self.assertEqual(line.title, 'RC Generic_Furniture')  # nothing changes before Apply
        ai.apply_preview(action, skip=[i for i, c in enumerate(action.preview) if c['field'] == 'brand'])
        line.refresh_from_db()
        self.assertEqual(line.title, 'Upholstered Chair')
        self.assertTrue(line.sources['title'].startswith('ai:'))
        self.assertEqual(line.brand, '')
        ch.undo(action)
        line.refresh_from_db()
        self.assertEqual(line.title, 'RC Generic_Furniture')

    def test_custom_prompt_changes_only_the_allowed_fields(self):
        line = self.run.lines.get(row_number=1)
        answer = [{'id': line.pk, 'changes': {'title': 'Kleenex Tissue 48 Boxes', 'price': 99, 'category': 'Nope'},
                   'why': 'owner asked'}]
        with self._fake(answer):
            action = ai.start_job(self.run, 'custom', [line.pk], prompt='put the box count in the title',
                                  fields=['title', 'category'])
        self.assertEqual([c['field'] for c in action.preview], ['title'])
        self.assertEqual(action.kind, PrepAction.KIND_CUSTOM)

    def test_a_job_needs_lines_and_a_prompt(self):
        with self.assertRaises(ch.ChangeError):
            ai.start_job(self.run, 'clean_ai', [])
        with self.assertRaises(ch.ChangeError):
            ai.start_job(self.run, 'custom', [self.run.lines.first().pk], prompt=' ')


@override_settings(PREP_STEPS_SYNC=True)
@mock.patch('apps.prep_steps.services.match.embed', lambda texts: [[0.0] * 384 for _ in texts])
class ApiTests(TestCase):
    def setUp(self):
        vendor = Vendor.objects.create(name='Wayfair', code='WPA3')
        self.po = PurchaseOrder.objects.create(vendor=vendor, order_number='PA-3', ordered_date=timezone.localdate())
        for i, raw in enumerate(RAW, start=1):
            PreprocessingRow.objects.create(purchase_order=self.po, row_number=i, raw_row=raw)
        self.c = APIClient()
        self.c.force_authenticate(_user('clerk-pa@example.com', 'Employee'))

    def test_the_main_screen_flow(self):
        base = f'/api/prep-steps/orders/{self.po.pk}'
        self.assertIsNone(self.c.get(f'{base}/').json()['run'])
        s = self.c.post(f'{base}/start/').json()
        self.assertEqual(len(s['lines']), 3)
        self.assertEqual(s['run']['step'], 'load')
        s = self.c.post(f'{base}/step/', {'to': 'next'}, format='json').json()
        self.assertEqual(s['run']['step'], 'clean')
        clean = next(x for x in s['run']['steps'] if x['key'] == 'clean')
        self.assertEqual(clean['state'], 'open')
        self.assertTrue(any(a['name'] == 'clean_titles' and a['model'] == '' for a in s['run']['actions']))
        ids = [x['id'] for x in s['lines']]
        r = self.c.post(f'{base}/edit/', {'step': 'clean', 'changes': [{'line': ids[0], 'field': 'qty', 'new': 5}]},
                        format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['lines'][0]['qty'], 5)
        r = self.c.post(f'{base}/accept/', {'step': 'clean', 'ids': ids}, format='json')
        self.assertTrue(all('clean' in x['accepted'] for x in r.json()['lines']))
        r = self.c.post(f'{base}/rule/', {'name': 'nope', 'ids': ids}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.c.post(f'{base}/step/', {'to': 'back'}, format='json').json()['run']['step'], 'load')
        r = self.c.patch(f'{base}/target/', {'share': 0.6}, format='json')
        self.assertEqual(r.json()['run']['target']['share'], 0.6)
        self.assertEqual(self.c.patch(f'{base}/target/', {'share': 2}, format='json').status_code, 400)
        self.assertEqual(self.c.get(f'{base}/send/').json()['written'], 0)
        self.assertEqual(len(self.c.get('/api/prep-steps/orders/').json()['orders']) >= 1, True)

    def test_ai_preview_apply_undo_over_the_api(self):
        base = f'/api/prep-steps/orders/{self.po.pk}'
        lines = self.c.post(f'{base}/start/').json()['lines']
        lid = lines[2]['id']
        fake = ([{'id': lid, 'category': 'Furniture', 'subcategory': 'Seating', 'why': 'a chair'}],
                {'in': 10, 'out': 5, 'cost': D('0.0001'), 'model': 'm'})
        with mock.patch('apps.prep_steps.services.ai._call', return_value=fake):
            r = self.c.post(f'{base}/ai/', {'name': 'category_ai', 'ids': [lid]}, format='json')
        action = r.json()['action']
        self.assertEqual(action['status'], 'preview')
        self.assertEqual(len(action['preview']), 2)
        r = self.c.post(f"/api/prep-steps/actions/{action['id']}/apply/", {'skip': []}, format='json')
        self.assertEqual(r.json()['lines'][0]['category'], 'Furniture')
        r = self.c.post(f"/api/prep-steps/actions/{action['id']}/undo/")
        self.assertEqual(r.json()['lines'][0]['category'], '')

    def test_staff_only(self):
        anon = APIClient()
        self.assertIn(anon.get('/api/prep-steps/orders/').status_code, (401, 403))
