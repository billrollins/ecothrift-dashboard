"""Prep Truck's Send hands the truck to Processing for real (Dash Update #233).

Send writes what old Preprocessing's finalize writes, through the same code. Covered here: the rows it produces are
the rows old finalize produces; each line carries Prep Truck's values; open lines never block; send again; refuse
after a check-in; undo; a line sold by the unit; and no other order is ever touched.
"""
from decimal import Decimal as D
from unittest import mock

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.inventory.models import (
    Item, ItemCheckIn, ManifestRow, PreprocessingRow, ProcessingRow, Product, PurchaseOrder, Vendor,
)
from apps.inventory.services.intake_undo import apply_undo
from apps.inventory.services.processing_finalize import finalize_preprocessing_to_bookmarks
from apps.inventory.services.processing_workspace import effective_product_links
from apps.prep_steps.models import PrepAction, PrepLine
from apps.prep_steps.services import load as L, send as SEND, steps as S

RAW = [
    {'Item Description': 'Kleenex Professional Facial Tissue, Bulk (21606) (125 Tissues/Box, 48 Boxes)', 'Qty': '2',
     'Unit Retail': '89.60', 'Ext. Retail': '179.20', 'Category': 'HOUSEHOLD_ESSENTIALS',
     'Seller Category': 'Household Cleaning Products & Supplies', 'UPC': '36000216066', 'Item #': '567608843',
     'Pallet ID': 'PLT-7', 'Lot ID': 'LOT-1', 'Condition': 'USED_GOOD'},
    {'Item Description': 'Spruce & Spring Dining Chairs, Moss Green, Set of 2 (please be advised that sets may be '
                         'missing pieces)', 'Qty': '1', 'Unit Retail': '149.99', 'Ext. Retail': '149.99',
     'Category': 'MIXED_FURNITURE', 'Seller Category': 'Furniture', 'UPC': '840697341594', 'Item #': '685544854',
     'Pallet ID': 'PLT-7', 'Lot ID': 'LOT-1', 'Condition': 'USED_FAIR'},
    {'Item Description': 'RC Generic_Furniture', 'Qty': '3', 'Unit Retail': '50.00', 'Ext. Retail': '150.00',
     'Category': 'MIXED_FURNITURE', 'Seller Category': 'Furniture', 'UPC': '197768000000', 'Item #': '',
     'Pallet ID': 'PLT-8', 'Lot ID': 'LOT-1', 'Condition': ''},
]
NO_RETAIL = {'Item Description': 'Mystery Lamp', 'Qty': '1', 'Unit Retail': '', 'Ext. Retail': '', 'Category': '',
             'Seller Category': '', 'UPC': '', 'Item #': '', 'Pallet ID': '', 'Lot ID': '', 'Condition': ''}

BOOKMARK = ('row_number', 'quantity', 'unit_retail', 'proposed_price', 'final_price', 'shelf_price', 'pricing_stage',
            'pricing_notes', 'title', 'brand', 'model', 'category', 'condition', 'notes', 'identifiers', 'taxonomy',
            'specifications', 'tracking', 'search_tags', 'matched_product_id', 'manifest_row_id',
            'preprocessing_row_id', 'search_string')


def _user(email, group):
    u = User.objects.create_user(email=email, first_name=group, last_name='X', password='x-pass-123')
    u.groups.add(Group.objects.get_or_create(name=group)[0])
    return u


def _rows(po):
    return list(ProcessingRow.objects.filter(purchase_order=po).order_by('row_number').values(*BOOKMARK))


class SendPartsTests(SimpleTestCase):
    def test_the_manifest_columns_land_in_the_standard_buckets(self):
        b = SEND._raw_buckets(RAW[0])
        self.assertEqual(b['tracking'], {'lot_id': 'LOT-1', 'pallet_id': 'PLT-7'})
        self.assertEqual(b['identifiers']['upc'], '36000216066')
        self.assertEqual(b['taxonomy']['category'], 'HOUSEHOLD_ESSENTIALS')
        self.assertEqual(b['taxonomy']['seller_category'], 'Household Cleaning Products & Supplies')

    def test_a_rounded_upc_is_left_out_and_conditions_use_our_words(self):
        line = PrepLine(upc='197768000000', item_number='A1')
        self.assertEqual(SEND._identifiers(line, {'upc': '197768000000'}), {'item_number': 'A1'})
        self.assertEqual(SEND._identifiers(PrepLine(upc=''), {'upc': '840697341594,'}), {'upc': '840697341594'})
        self.assertEqual((SEND._condition('USED_GOOD'), SEND._condition('USED_FAIR'), SEND._condition('whatever')),
                         ('good', 'fair', ''))

    def test_a_link_in_the_notes_column_is_not_a_note(self):
        self.assertEqual(SEND._raw_notes({'Notes/Comments': 'https://www.wayfair.com/x.html'}), '')
        self.assertEqual(SEND._raw_notes({'Notes': 'Box is crushed'}), 'Box is crushed')


@mock.patch('apps.prep_steps.services.match.embed', lambda texts: [[0.0] * 384 for _ in texts])
class SendTests(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Walmart', code='WSND')
        self.po = self._order('SEND-1', RAW)
        self.manager = _user('boss-send@example.com', 'Manager')

    def _order(self, number, raws):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor, order_number=number, ordered_date=timezone.localdate(), total_cost=D('100'),
            purchase_cost=D('100'), retail_value=D('500'), manifest_headers=list(raws[0]),
        )
        for i, raw in enumerate(raws, start=1):
            PreprocessingRow.objects.create(purchase_order=po, row_number=i, raw_row=raw)
        return po

    def _prepped(self, po=None):
        run = L.load(po or self.po)
        for _ in range(7):
            S.next_step(run)
            run.refresh_from_db()
        return run

    def _check_in(self, row, product):
        c = APIClient()
        c.force_authenticate(self.manager)
        body = {'processing_row_id': row.pk, 'quantity': 1, 'condition': 'good', 'dispatch': 'on_shelf',
                'product_mode': 'existing', 'product_id': product.pk, 'retail_check': 'ok'}
        r = c.post(f'/api/inventory/orders/{self.po.pk}/processing-row-check-in/', body, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    # -- the rows ---------------------------------------------------------------------------------------------------

    def test_send_makes_the_truck_a_normal_finalized_truck_with_prep_trucks_values(self):
        run = self._prepped()
        x1, x2, x3 = run.lines.order_by('row_number')
        out = SEND.send(run, user=self.manager)
        self.assertEqual((out['written'], out['again']), (3, False))

        self.po.refresh_from_db()
        self.assertIsNotNone(self.po.finalized_at)
        self.assertEqual(self.po.preprocess_status, 'finalized')
        self.assertIsNone(self.po.standardized_at)  # the mark that Send, not old standardize, made the spine

        b1, b2, b3 = ProcessingRow.objects.filter(purchase_order=self.po).order_by('row_number')
        self.assertTrue(all(b.manifest_row_id and b.preprocessing_row_id for b in (b1, b2, b3)))
        self.assertEqual(b1.title, 'Kleenex Professional Facial Tissue, 48 boxes × 125')  # the pack standard
        self.assertEqual((b1.brand, b1.category, b1.quantity), (x1.brand, 'Household & cleaning', 2))
        self.assertEqual((b1.unit_retail, b1.shelf_price, b1.final_price), (D('89.60'), x1.price, x1.price))
        self.assertEqual((b1.pricing_stage, b1.pricing_notes), ('final', x1.reasons['price']))
        self.assertEqual(b1.condition, 'good')
        self.assertEqual(b1.identifiers['upc'], '36000216066')
        self.assertEqual(b1.identifiers['item_number'], '567608843')
        self.assertEqual(b1.tracking, {'lot_id': 'LOT-1', 'pallet_id': 'PLT-7'})
        self.assertEqual(b1.search_tags, x1.search_tags)
        self.assertEqual(b1.taxonomy['path'], ' > '.join(v for v in (x1.category, x1.subcategory) if v))
        self.assertEqual(b1.taxonomy['category'], 'HOUSEHOLD_ESSENTIALS')  # the seller's own words stay beside ours
        self.assertEqual((b2.category, b2.shelf_price, b2.condition), ('Furniture', D('82.00'), 'fair'))
        self.assertNotIn('upc', b3.identifiers)  # rounded by the spreadsheet
        self.assertIsNone(b3.matched_product_id)

        # The spine says what the manifest said; the staging row's final layer says what Prep Truck decided.
        m1 = ManifestRow.objects.get(purchase_order=self.po, row_number=1)
        self.assertEqual(m1.title, x1.src_title[:300])
        self.assertEqual((m1.quantity, m1.unit_retail, m1.category), (2, D('89.60'), 'Household & cleaning'))
        self.assertEqual(m1.tracking['pallet_id'], 'PLT-7')
        s1 = PreprocessingRow.objects.get(purchase_order=self.po, row_number=1)
        self.assertEqual((s1.manifest_row_id, s1.final_title, s1.final_price), (m1.pk, b1.title, x1.price))

        self.assertEqual(SEND.state(run)['sent'], True)
        self.assertEqual(S.summary(run)['send']['rows'], 3)
        action = run.actions.get(name='send')
        self.assertEqual((action.label, action.status, action.changed_count), ('Sent to Processing', 'applied', 3))

    def test_the_rows_are_the_rows_old_finalize_writes(self):
        run = self._prepped()
        SEND.send(run, user=self.manager)
        sent = _rows(self.po)
        self.assertEqual(len(sent), 3)
        apply_undo(self.po, 'finalize')  # old Preprocessing's own undo finalize, then its own finalize
        self.assertFalse(ProcessingRow.objects.filter(purchase_order=self.po).exists())
        self.po.refresh_from_db()
        self.assertEqual(finalize_preprocessing_to_bookmarks(self.po), 3)
        self.assertEqual(_rows(self.po), sent)

    def test_an_is_product_is_attached_and_a_like_product_is_left_for_the_likely_list(self):
        tissue = Product.objects.create(title='Kleenex Professional Facial Tissue', brand='Kleenex')
        chair = Product.objects.create(title='Dining Chair Moss Green', brand='Spruce & Spring')
        run = self._prepped()
        x1, x2, _x3 = run.lines.order_by('row_number')
        S.edit(run, 'match', [{'line': x1.pk, 'field': 'match_product_id', 'new': tissue.pk},
                              {'line': x1.pk, 'field': 'match_kind', 'new': 'is'},
                              {'line': x1.pk, 'field': 'match_confidence', 'new': 100}])
        PrepLine.objects.filter(pk=x2.pk).update(
            match_kind='like', match_product_id=chair.pk, match_confidence=83,
            match_candidates=[{'product_id': 999001, 'sim': 0.6, 'number': 'PRD-1', 'title': 'Other', 'brand': ''},
                              {'product_id': chair.pk, 'sim': 0.83, 'number': 'PRD-2', 'title': chair.title,
                               'brand': chair.brand}],
        )
        shown = SEND.preview(run)['lines']
        self.assertEqual((shown[0]['product_match']['kind'], shown[1]['product_match']['kind']), ('is', 'like'))
        self.assertEqual(shown[1]['product_match']['number'], 'PRD-2')  # a like product's number, from its candidate
        out = SEND.send(run, user=self.manager)
        self.assertEqual(out['products'], 1)
        b1, b2, _b3 = ProcessingRow.objects.filter(purchase_order=self.po).order_by('row_number')
        self.assertEqual(b1.matched_product_id, tissue.pk)
        self.assertIn(str(tissue.pk), effective_product_links(b1))  # attached the way Processing reads it
        self.assertIsNone(b2.matched_product_id)
        self.assertEqual(effective_product_links(b2), {})
        s1, s2 = PreprocessingRow.objects.filter(purchase_order=self.po, row_number__in=(1, 2)).order_by('row_number')
        self.assertEqual((s1.final_matched_product_id, s1.match_source), (tissue.pk, 'staff'))
        self.assertEqual([c['product_id'] for c in s2.match_candidates], [chair.pk, 999001])  # the pick first
        self.assertEqual(s2.match_candidates[0]['score'], 83)

        # A check-in on the attached product starts from the row's price, retail and product.
        data = self._check_in(b1, tissue)
        item = Item.objects.get(pk=data['items'][0]['id'])
        self.assertEqual((item.product_id, item.price, item.retail), (tissue.pk, b1.shelf_price, D('89.60')))

    # -- open lines ---------------------------------------------------------------------------------------------------

    def test_open_lines_never_block_and_the_truck_rule_prices_them(self):
        po = self._order('SEND-OPEN', RAW + [NO_RETAIL])
        run = L.load(po)  # no step has run: no match, no category, no retail, no price on any line
        before = SEND.preview(run)
        self.assertEqual(before['written'], 0)
        self.assertEqual(before['open'], {'lines': 4, 'no_product': 4, 'no_price': 3, 'no_retail': 1})
        self.assertEqual(before['state']['sent'], False)

        out = SEND.send(run, user=self.manager)
        self.assertEqual((out['written'], out['priced_by_rule'], out['products']), (4, 3, 0))
        b1, b2, b3, b4 = ProcessingRow.objects.filter(purchase_order=po).order_by('row_number')
        for b in (b1, b2, b3):
            self.assertTrue(b.shelf_price and b.shelf_price > 0)
            self.assertEqual(b.pricing_stage, 'final')
            self.assertIsNone(b.matched_product_id)  # a new product at Processing
        self.assertEqual(b1.unit_retail, D('89.60'))
        self.assertEqual((b4.shelf_price, b4.pricing_stage, b4.pricing_notes), (D('0.00'), 'unpriced', SEND.NO_PRICE_NOTE))
        self.assertIsNone(b4.unit_retail)
        self.assertEqual(b4.title, 'Mystery Lamp')
        # The prices are real rule passes: in the ledger of their steps.
        self.assertTrue(run.actions.filter(step='price', name='price_rule', status='applied').exists())
        self.assertTrue(run.actions.filter(step='retail', name='retail_manifest', status='applied').exists())

    # -- send again, refuse, undo -------------------------------------------------------------------------------------

    def test_send_again_replaces_the_rows_while_nothing_is_checked_in(self):
        run = self._prepped()
        SEND.send(run, user=self.manager)
        spine = set(ManifestRow.objects.filter(purchase_order=self.po).values_list('pk', flat=True))
        line = run.lines.get(row_number=2)
        S.edit(run, 'price', [{'line': line.pk, 'field': 'price', 'new': '64.00'},
                              {'line': line.pk, 'field': 'title', 'new': 'Moss Green Dining Chairs'}])
        out = SEND.send(run, user=self.manager)
        self.assertEqual((out['written'], out['again']), (3, True))
        self.assertEqual(ProcessingRow.objects.filter(purchase_order=self.po).count(), 3)
        b2 = ProcessingRow.objects.get(purchase_order=self.po, row_number=2)
        self.assertEqual((b2.shelf_price, b2.title), (D('64.00'), 'Moss Green Dining Chairs, 2 units'))
        # The manifest lines are the same rows, not new ones.
        self.assertEqual(set(ManifestRow.objects.filter(purchase_order=self.po).values_list('pk', flat=True)), spine)
        self.assertEqual(list(run.actions.filter(name='send').order_by('id').values_list('label', flat=True)),
                         ['Sent to Processing', 'Sent to Processing again'])

    def test_send_and_undo_refuse_once_anything_is_checked_in(self):
        product = Product.objects.create(title='Kleenex Professional Facial Tissue', brand='Kleenex')
        run = self._prepped()
        SEND.send(run, user=self.manager)
        row = ProcessingRow.objects.get(purchase_order=self.po, row_number=1)
        self._check_in(row, product)
        before = _rows(self.po)
        with self.assertRaises(SEND.SendRefused) as refused:
            SEND.send(run, user=self.manager)
        self.assertIn('1 check-in', str(refused.exception))
        with self.assertRaises(SEND.SendRefused):
            SEND.undo(run, user=self.manager)
        self.assertEqual(_rows(self.po), before)
        self.assertEqual(ItemCheckIn.objects.filter(purchase_order=self.po).count(), 1)
        state = SEND.state(run)
        self.assertTrue(state['sent'])
        self.assertIn('check-in', state['blocked'])

    def test_undo_send_puts_the_truck_back_to_an_uploaded_manifest_and_keeps_the_prep(self):
        run = self._prepped()
        lines = list(run.lines.order_by('row_number').values('title', 'price', 'retail', 'category', 'match_kind'))
        raw = list(PreprocessingRow.objects.filter(purchase_order=self.po).order_by('row_number').values_list('raw_row', flat=True))
        with self.assertRaises(SEND.SendRefused):
            SEND.undo(run, user=self.manager)  # not sent yet: nothing to undo
        SEND.send(run, user=self.manager)
        out = SEND.undo(run, user=self.manager)
        self.assertEqual(out['removed'], 3)

        self.po.refresh_from_db()
        self.assertIsNone(self.po.finalized_at)
        self.assertEqual(self.po.preprocess_status, 'not_started')
        self.assertFalse(ProcessingRow.objects.filter(purchase_order=self.po).exists())
        self.assertFalse(ManifestRow.objects.filter(purchase_order=self.po).exists())
        staging = list(PreprocessingRow.objects.filter(purchase_order=self.po).order_by('row_number'))
        self.assertEqual([s.raw_row for s in staging], raw)
        self.assertTrue(all(s.final_title is None and s.final_price is None and s.manifest_row_id is None for s in staging))
        self.assertEqual(list(run.lines.order_by('row_number').values('title', 'price', 'retail', 'category', 'match_kind')), lines)
        run.refresh_from_db()
        self.assertEqual(run.steps['send']['state'], 'open')
        self.assertNotIn('sent_at', run.steps['send'])
        self.assertEqual(SEND.state(run)['sent'], False)
        self.assertEqual(run.actions.get(name='send').status, PrepAction.STATUS_UNDONE)

        self.assertEqual(SEND.send(run, user=self.manager)['written'], 3)  # and it can go again

    def test_a_truck_old_preprocessing_standardized_keeps_its_spine(self):
        run = self._prepped()
        stamp = timezone.now()
        mr = ManifestRow.objects.create(purchase_order=self.po, row_number=1, quantity=2, title='Old standard title',
                                        unit_retail=D('89.60'), tracking={'pallet_id': 'OLD-1'})
        PurchaseOrder.objects.filter(pk=self.po.pk).update(standardized_at=stamp, preprocess_status='standardized')
        SEND.send(run, user=self.manager)
        mr.refresh_from_db()
        self.assertEqual((mr.title, mr.tracking['pallet_id']), ('Old standard title', 'OLD-1'))  # not rewritten
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.po).count(), 3)  # the missing ones are made
        SEND.undo(run, user=self.manager)
        self.po.refresh_from_db()
        self.assertEqual(self.po.standardized_at, stamp)
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.po).count(), 3)  # old standardize's spine stays
        self.assertFalse(ProcessingRow.objects.filter(purchase_order=self.po).exists())

    def test_undo_on_a_truck_old_preprocessing_finalized_only_takes_it_out_of_processing(self):
        # An old truck: standardized before the stamp existed (no ``standardized_at``), finalized by old Preprocessing,
        # never sent from here. Its manifest rows and its final decisions are old Preprocessing's, not Send's.
        run = self._prepped()
        for sr in PreprocessingRow.objects.filter(purchase_order=self.po):
            mr = ManifestRow.objects.create(purchase_order=self.po, row_number=sr.row_number, quantity=1,
                                            title=f'Old line {sr.row_number}', unit_retail=D('10.00'))
            PreprocessingRow.objects.filter(pk=sr.pk).update(manifest_row=mr, final_title=f'Decided {sr.row_number}',
                                                             final_price=D('4.00'), pricing_stage='final')
        self.assertEqual(finalize_preprocessing_to_bookmarks(self.po), 3)
        self.assertTrue(SEND.state(run)['sent'])

        SEND.undo(run, user=self.manager)
        self.po.refresh_from_db()
        self.assertIsNone(self.po.finalized_at)
        self.assertEqual(self.po.preprocess_status, 'cleaned')  # where old "undo finalize" leaves a truck
        self.assertFalse(ProcessingRow.objects.filter(purchase_order=self.po).exists())
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.po).count(), 3)
        self.assertEqual(sorted(PreprocessingRow.objects.filter(purchase_order=self.po).values_list('final_title', flat=True)),
                         ['Decided 1', 'Decided 2', 'Decided 3'])

    def test_a_truck_sent_by_the_first_version_can_be_sent_again_and_undone(self):
        # v2.342.0 sent a truck once: Prep Truck's words on the manifest rows too, its own mark on the run, no ledger
        # line, and (as here) no "standardized" stamp on the order.
        run = self._prepped()
        SEND.send(run, user=self.manager)
        run.actions.filter(name='send').delete()
        for mr in ManifestRow.objects.filter(purchase_order=self.po):
            bookmark = ProcessingRow.objects.get(purchase_order=self.po, row_number=mr.row_number)
            ManifestRow.objects.filter(pk=mr.pk).update(title=bookmark.title, final_price=bookmark.final_price)
        stamp = timezone.now().isoformat()
        run.steps = {**run.steps, 'send': {'state': 'done', 'done_at': stamp, 'sent_at': stamp, 'sent_by': 1, 'rows': 3}}
        run.save()

        state = SEND.state(run)
        self.assertEqual((state['sent'], state['sent_at'], state['rows'], state['blocked']), (True, stamp, 3, ''))
        self.assertEqual(SEND.send(run, user=self.manager)['again'], True)
        m1 = ManifestRow.objects.get(purchase_order=self.po, row_number=1)
        self.assertEqual(m1.title, run.lines.get(row_number=1).src_title[:300])  # the seller's words again
        self.assertIsNone(m1.final_price)
        SEND.undo(run, user=self.manager)
        self.assertFalse(ProcessingRow.objects.filter(purchase_order=self.po).exists())
        self.assertFalse(ManifestRow.objects.filter(purchase_order=self.po).exists())

    def test_a_manifest_that_changed_after_load_is_refused(self):
        run = self._prepped()
        PreprocessingRow.objects.create(purchase_order=self.po, row_number=4, raw_row=NO_RETAIL)
        with self.assertRaises(SEND.SendRefused) as refused:
            SEND.send(run, user=self.manager)
        self.assertIn('Load the manifest again', str(refused.exception))
        self.assertFalse(ProcessingRow.objects.filter(purchase_order=self.po).exists())
        self.po.refresh_from_db()
        self.assertIsNone(self.po.finalized_at)

    # -- packs --------------------------------------------------------------------------------------------------------

    def test_a_line_sold_by_the_unit_goes_through_break_apart(self):
        run = self._prepped()
        line = run.lines.get(row_number=1)
        S.run_rule(run, 'sell_units', [line.pk])
        line.refresh_from_db()
        self.assertEqual((line.pieces, line.retail), (48, D('1.87')))
        out = SEND.send(run, user=self.manager)
        self.assertEqual(out['by_unit'], 1)
        b1 = ProcessingRow.objects.get(purchase_order=self.po, row_number=1)
        self.assertEqual((b1.quantity, b1.unit_retail, b1.shelf_price), (96, D('1.87'), line.price))  # 2 packs x 48 tags
        self.assertEqual(b1.title, 'Kleenex Professional Facial Tissue, 125 ct')  # one tag is one box of 125
        self.assertEqual((b1.transforms[0]['op'], b1.transforms[0]['units'], b1.transforms[0]['factor']),
                         ('break_apart', 2, 48))
        self.assertEqual(b1.original_snapshot['quantity'], 2)  # Restart row gives the two packs back
        m1 = ManifestRow.objects.get(purchase_order=self.po, row_number=1)
        self.assertEqual((m1.quantity, m1.unit_retail), (2, D('89.60')))  # the manifest line is never split

    # -- other orders -------------------------------------------------------------------------------------------------

    def test_no_other_order_is_touched(self):
        other = self._order('SEND-OTHER', RAW)
        SEND.send(self._prepped(other), user=self.manager)
        rows, spine = _rows(other), list(ManifestRow.objects.filter(purchase_order=other).values())
        staging = list(PreprocessingRow.objects.filter(purchase_order=other).values())
        other.refresh_from_db()
        finalized = other.finalized_at

        run = self._prepped()
        SEND.send(run, user=self.manager)
        SEND.send(run, user=self.manager)
        SEND.undo(run, user=self.manager)

        other.refresh_from_db()
        self.assertEqual(other.finalized_at, finalized)
        self.assertEqual(_rows(other), rows)
        self.assertEqual(list(ManifestRow.objects.filter(purchase_order=other).values()), spine)
        self.assertEqual(list(PreprocessingRow.objects.filter(purchase_order=other).values()), staging)


@mock.patch('apps.prep_steps.services.match.embed', lambda texts: [[0.0] * 384 for _ in texts])
class SendApiTests(TestCase):
    def setUp(self):
        vendor = Vendor.objects.create(name='Wayfair', code='WSNA')
        self.po = PurchaseOrder.objects.create(vendor=vendor, order_number='SEND-API', ordered_date=timezone.localdate(),
                                               total_cost=D('100'), purchase_cost=D('100'), retail_value=D('500'),
                                               manifest_headers=list(RAW[0]))
        for i, raw in enumerate(RAW, start=1):
            PreprocessingRow.objects.create(purchase_order=self.po, row_number=i, raw_row=raw)
        self.c = APIClient()
        self.c.force_authenticate(_user('clerk-send@example.com', 'Manager'))
        self.base = f'/api/prep-steps/orders/{self.po.pk}'

    def test_preview_send_send_again_and_undo_over_the_api(self):
        self.c.post(f'{self.base}/start/')
        for _ in range(7):
            self.c.post(f'{self.base}/step/', {'to': 'next'}, format='json')
        p = self.c.get(f'{self.base}/send/').json()
        self.assertEqual((p['written'], p['would_write'], p['state']['sent']), (0, 3, False))
        self.assertEqual(set(p['open']), {'lines', 'no_product', 'no_price', 'no_retail'})
        self.assertEqual((p['sent_at'], p['why_not']), (None, ''))  # what the screen shipped in v2.342.0 reads
        self.assertEqual(p['lines'][0]['title'], 'Kleenex Professional Facial Tissue, 48 boxes × 125')
        self.assertEqual(self.c.post(f'{self.base}/send/undo/').status_code, 409)  # nothing sent yet

        r = self.c.post(f'{self.base}/send/')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body['send']['written'], 3)
        self.assertEqual(body['run']['send']['sent'], True)
        self.assertEqual(body['run']['send']['processing_url'], f'/inventory/processing/{self.po.pk}')
        self.assertEqual(len(body['lines']), 3)
        self.assertEqual(next(s for s in body['run']['steps'] if s['key'] == 'send')['state'], 'done')

        self.assertIsNotNone(self.c.get(f'{self.base}/send/').json()['sent_at'])
        again = self.c.post(f'{self.base}/send/').json()
        self.assertEqual(again['send']['again'], True)

        # The ledger's own Undo does not undo a send: that is Undo send, with its confirm.
        action = next(a for a in again['run']['actions'] if a['name'] == 'send')
        self.assertEqual(self.c.post(f'/api/prep-steps/actions/{action["id"]}/undo/').status_code, 400)
        self.assertTrue(ProcessingRow.objects.filter(purchase_order=self.po).exists())

        u = self.c.post(f'{self.base}/send/undo/')
        self.assertEqual(u.status_code, 200, u.content)
        self.assertEqual((u.json()['undo_send']['removed'], u.json()['run']['send']['sent']), (3, False))
        self.assertFalse(ProcessingRow.objects.filter(purchase_order=self.po).exists())

    def test_a_refusal_says_why_with_409(self):
        self.c.post(f'{self.base}/start/')
        self.c.post(f'{self.base}/send/')
        row = ProcessingRow.objects.get(purchase_order=self.po, row_number=2)
        product = Product.objects.create(title='Dining Chairs', brand='Spruce & Spring')
        body = {'processing_row_id': row.pk, 'quantity': 1, 'condition': 'good', 'dispatch': 'on_shelf',
                'product_mode': 'existing', 'product_id': product.pk, 'retail_check': 'ok'}
        r = self.c.post(f'/api/inventory/orders/{self.po.pk}/processing-row-check-in/', body, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        for url in (f'{self.base}/send/', f'{self.base}/send/undo/'):
            refused = self.c.post(url)
            self.assertEqual(refused.status_code, 409)
            self.assertIn('check-in', refused.json()['detail'])
        self.assertIn('check-in', self.c.get(f'{self.base}/').json()['run']['send']['blocked'])
