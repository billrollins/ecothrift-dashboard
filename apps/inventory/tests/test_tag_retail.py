"""Retail on tags (retail_tags_and_social Phase 1): the check at check-in and what the tag may print."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import AppSetting
from apps.inventory.models import Item, ManifestRow, ProcessingRow, Product, PurchaseOrder, Vendor
from apps.inventory.services import tag_retail
from apps.inventory.services.tag_retail import RetailCheckNeeded, assess, resolve


class TagRetailBase(TestCase):
    def setUp(self):
        tag_retail.clear_cache()
        self.addCleanup(tag_retail.clear_cache)


class AssessTests(TagRetailBase):
    def test_passes_a_believable_retail(self):
        found = assess(None, Decimal('30.00'), Decimal('10.00'), manifest_retail=Decimal('30.00'))
        self.assertEqual(found['status'], 'passed')
        self.assertEqual(found['source'], 'manifest')

    def test_flags_retail_far_above_the_tag(self):
        found = assess(None, Decimal('999.00'), Decimal('9.99'), manifest_retail=Decimal('999.00'))
        self.assertEqual(found['status'], 'flagged')
        self.assertIn('6x the tag price', found['reasons'][0])

    def test_flags_retail_far_above_what_the_product_usually_carries(self):
        product = Product.objects.create(title='Toy')
        for _ in range(3):
            Item.objects.create(product=product, price=Decimal('4.00'), retail=Decimal('10.00'))
        found = assess(product.pk, Decimal('25.00'), Decimal('5.00'), manifest_retail=Decimal('25.00'))
        self.assertEqual(found['status'], 'flagged')
        self.assertEqual(found['typical'], '10.00')

    def test_too_few_items_do_not_set_a_usual_retail(self):
        product = Product.objects.create(title='Toy')
        Item.objects.create(product=product, price=Decimal('4.00'), retail=Decimal('10.00'))
        found = assess(product.pk, Decimal('25.00'), Decimal('5.00'), manifest_retail=Decimal('25.00'))
        self.assertEqual(found['status'], 'passed')

    def test_an_estimate_is_flagged(self):
        found = assess(None, Decimal('20.00'), Decimal('8.00'), manifest_retail=None)
        self.assertEqual(found['source'], 'estimate')
        self.assertEqual(found['status'], 'flagged')

    def test_typed_retail_is_not_an_estimate(self):
        found = assess(None, Decimal('20.00'), Decimal('8.00'), manifest_retail=None, typed=True)
        self.assertEqual((found['status'], found['source']), ('passed', 'typed'))

    def test_no_retail_is_missing(self):
        self.assertEqual(assess(None, None, Decimal('5.00'))['status'], 'missing')

    def test_thresholds_are_settings(self):
        AppSetting.objects.create(key='tags.retail_check_price_multiple', value=200)
        tag_retail.clear_cache()
        found = assess(None, Decimal('999.00'), Decimal('9.99'), manifest_retail=Decimal('999.00'))
        self.assertEqual(found['status'], 'passed')

    def test_resolve_needs_an_answer_for_a_flag(self):
        found = assess(None, Decimal('999.00'), Decimal('9.99'), manifest_retail=Decimal('999.00'))
        with self.assertRaises(RetailCheckNeeded) as ctx:
            resolve(found, '', retail=Decimal('999.00'), price=Decimal('9.99'))
        self.assertEqual(ctx.exception.payload['code'], 'retail_check')
        self.assertEqual(resolve(found, 'confirm', retail=None, price=None), 'confirmed')
        self.assertEqual(resolve(found, 'fix', retail=None, price=None), 'fixed')
        self.assertEqual(resolve(found, 'none', retail=None, price=None), 'no_retail')


class TagRetailPrintTests(TagRetailBase):
    def _item(self, check, retail='40.00', price='12.00'):
        return Item(price=Decimal(price), retail=Decimal(retail) if retail else None, retail_check=check)

    def test_checked_mode_prints_only_a_checked_retail(self):
        self.assertEqual(tag_retail.tag_retail(self._item('passed')), Decimal('40.00'))
        self.assertEqual(tag_retail.tag_retail(self._item('confirmed')), Decimal('40.00'))
        self.assertEqual(tag_retail.tag_retail(self._item('fixed')), Decimal('40.00'))
        for check in ('', 'no_retail', 'missing'):
            self.assertIsNone(tag_retail.tag_retail(self._item(check)))

    def test_never_prints_retail_at_or_below_the_price(self):
        self.assertIsNone(tag_retail.tag_retail(self._item('passed', retail='12.00')))

    def test_modes(self):
        self.assertEqual(tag_retail.tag_retail(self._item(''), mode='always'), Decimal('40.00'))
        self.assertIsNone(tag_retail.tag_retail(self._item('passed'), mode='never'))
        self.assertEqual(tag_retail.tag_retail_text(self._item('passed')), 'Retail $40.00')

    def test_bad_mode_setting_falls_back_to_checked(self):
        AppSetting.objects.create(key='tags.retail_on_tag', value='sometimes')
        tag_retail.clear_cache()
        self.assertEqual(tag_retail.tag_settings()['tags.retail_on_tag'], 'checked')


class CheckInRetailTests(TagRetailBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='proc@example.com', first_name='Pat', last_name='Proc', password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)
        vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.order = PurchaseOrder.objects.create(
            vendor=vendor, order_number='PO-TAG', ordered_date='2026-10-01', purchase_cost=Decimal('100.00'),
            retail_value=Decimal('1000.00'), status='processing',
        )

    def _row(self, n, retail):
        mr = ManifestRow.objects.create(
            purchase_order=self.order, row_number=n, quantity=2, title=f'Line {n}', unit_retail=Decimal(retail),
        )
        return ProcessingRow.objects.create(
            purchase_order=self.order, manifest_row=mr, row_number=n, quantity=2, title=f'Line {n}',
            unit_retail=Decimal(retail), shelf_price=Decimal('10.00'),
        )

    def _check_in(self, row, **extra):
        return self.client.post(
            f'/api/inventory/orders/{self.order.id}/processing-row-check-in/',
            {'processing_row_id': row.id, 'quantity': 1, 'condition': 'good', 'dispatch': 'on_shelf',
             'price': '10.00', 'product_mode': 'new', 'title': row.title, **extra},
            format='json',
        )

    def test_a_believable_retail_passes_and_the_tag_shows_it(self):
        r = self._check_in(self._row(1, '30.00'))
        self.assertEqual(r.status_code, 200, r.data)
        item = Item.objects.get(pk=r.data['items'][0]['id'])
        self.assertEqual((item.retail_check, item.retail_source), ('passed', 'manifest'))
        self.assertEqual(r.data['items'][0]['tag_retail'], '30.00')
        self.assertEqual(r.data['printed_items_preview'][0]['tag_retail'], '30.00')

    def test_an_inflated_retail_stops_the_check_in_until_answered(self):
        row = self._row(1, '999.00')
        r = self._check_in(row)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data['code'], 'retail_check')
        self.assertFalse(Item.objects.exists())

        r = self._check_in(row, retail_check='fix', retail='99.00')
        self.assertEqual(r.status_code, 200, r.data)
        item = Item.objects.get()
        self.assertEqual((item.retail, item.retail_check, item.retail_source), (Decimal('99.00'), 'fixed', 'typed'))
        self.assertEqual(item.check_in.defaults_snapshot['retail_check']['result'], 'fixed')

    def test_no_retail_answer_keeps_the_figure_but_not_on_the_tag(self):
        r = self._check_in(self._row(1, '999.00'), retail_check='none')
        self.assertEqual(r.status_code, 200, r.data)
        item = Item.objects.get()
        self.assertEqual((item.retail, item.retail_check), (Decimal('999.00'), 'no_retail'))
        self.assertIsNone(r.data['printed_items_preview'][0]['tag_retail'])
