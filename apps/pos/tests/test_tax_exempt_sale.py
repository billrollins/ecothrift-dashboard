"""A tax-exempt sale to a non-profit (Bill, 2026-10-21): the organization's name and its certificate number (or a
photo of the certificate), every line untaxed, logged with who, and listed on the sales tax report."""
from datetime import datetime, time
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.inventory.models import Item
from apps.pos.models import Cart, RegisterEvent

from .test_cart_card_surcharge import _CartCardSurchargeFixtures

D = Decimal


@override_settings(STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
                             'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}})
class TaxExemptSaleTests(_CartCardSurchargeFixtures, TestCase):
    def setUp(self):
        super().setUp()
        AppSetting.objects.update_or_create(key='tax_rate', defaults={'value': '0.07', 'description': 'test tax'})
        self.lamp = Item.objects.create(sku='POSTE001', product=self.item.product, price=D('20.00'), status='on_shelf')

    def _exempt(self, cid, data, fmt='json'):
        return self.client.post(f'/api/pos/carts/{cid}/tax-exempt/', data, format=fmt)

    def test_a_non_profit_sale_has_no_tax_and_says_who_marked_it(self):
        cid, cart = self._open_cart_with_item(self.lamp.sku)
        self.assertEqual(cart['tax_amount'], '1.40')
        r = self._exempt(cid, {'org': '  Open Door   Mission ', 'number': '05-123456'})
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body['tax_amount'], body['total']), ('0.00', '20.00'))
        self.assertEqual((body['tax_exempt_org'], body['tax_exempt_number'], body['tax_exempt_by']),
                         ('Open Door Mission', '05-123456', self.user.id))
        e = RegisterEvent.objects.get(kind='tax_exempt')
        self.assertEqual((e.user, e.note), (self.user, 'Open Door Mission #05-123456'))
        # A line added after stays untaxed.
        more = self.client.post(f'/api/pos/carts/{cid}/add-manual-line/', {'description': 'Mug', 'unit_price': '2.00'},
                                format='json').json()
        self.assertEqual(more['tax_amount'], '0.00')

    def test_it_needs_the_name_and_a_number_or_a_photo(self):
        cid, _ = self._open_cart_with_item(self.lamp.sku)
        self.assertEqual(self._exempt(cid, {'number': '1'}).json()['code'], 'ORG_REQUIRED')
        self.assertEqual(self._exempt(cid, {'org': 'Open Door'}).json()['code'], 'CERTIFICATE_REQUIRED')
        self.assertIsNone(Cart.objects.get(pk=cid).tax_exempt_at)
        photo = SimpleUploadedFile('cert.jpg', b'\xff\xd8\xff fake jpeg', content_type='image/jpeg')
        r = self._exempt(cid, {'org': 'Open Door', 'photo': photo}, fmt='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['tax_exempt_photo_url'])
        self.assertEqual(r.json()['tax_amount'], '0.00')

    def test_it_comes_off_again_and_a_paid_sale_cannot_change(self):
        cid, _ = self._open_cart_with_item(self.lamp.sku)
        self._exempt(cid, {'org': 'Open Door', 'number': '9'})
        off = self._exempt(cid, {'off': True}).json()
        self.assertEqual((off['tax_amount'], off['tax_exempt_org']), ('1.40', ''))
        self.assertTrue(RegisterEvent.objects.filter(kind='tax_exempt_off').exists())
        self._exempt(cid, {'org': 'Open Door', 'number': '9'})
        self.assertEqual(self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '20.00'}).status_code, 200)
        self.assertEqual(self._exempt(cid, {'off': True}).json()['code'], 'SALE_FINISHED')

    def test_the_tax_report_lists_it_with_the_org_and_number(self):
        cid, _ = self._open_cart_with_item(self.lamp.sku)
        self._exempt(cid, {'org': 'Open Door', 'number': '05-123456'})
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '20.00'})
        when = timezone.make_aware(datetime.combine(datetime(2026, 10, 21).date(), time(12)))
        Cart.objects.filter(pk=cid).update(completed_at=when)
        owner = User.objects.create_superuser(email='te-owner@example.com', first_name='O', last_name='W',
                                              password='x-pass-123')
        self.client.force_authenticate(owner)
        d = self.client.get('/api/pos/reports/sales-tax/', {'start': '2026-10-01', 'end': '2026-10-31'}).data
        self.assertEqual((d['gross_sales'], d['exempt_sales'], d['taxable_sales'], d['tax_collected']),
                         ('20.00', '20.00', '0.00', '0.00'))
        row = d['exempt_organizations'][0]
        self.assertEqual((row['org'], row['number'], row['amount'], row['day']),
                         ('Open Door', '05-123456', '20.00', '2026-10-21'))
        self.assertTrue(row['receipt'].startswith('R-'))
