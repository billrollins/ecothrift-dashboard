"""The Thrift+ Perks price tag (owner 2026-10-28): the design setting, each tag's strip, and the QR link's address."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.middleware import PublicSiteMiddleware
from apps.core.models import AppSetting, AppSettingHistory
from apps.inventory.models import Item, Product

SIZE = '/api/core/printing/label-size/'
DESIGN = '/api/core/printing/price-tag-design/'
MARKS = '/api/core/printing/tag-marks/'


def _client(email, role):
    user = get_user_model().objects.create_user(email, 'Test', 'User', password='x')
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    client = APIClient()
    client.force_authenticate(user)
    return client


class PriceTagDesignTests(TestCase):
    def test_classic_until_a_manager_picks_thrift_plus_perks(self):
        emp = _client('emp@example.com', 'Employee')
        self.assertEqual(emp.get(SIZE).data['price_tag_design'], 'classic')
        self.assertEqual(emp.put(DESIGN, {'design': 'perks'}, format='json').status_code, 403)
        mgr = _client('mgr@example.com', 'Manager')
        self.assertEqual(mgr.put(DESIGN, {'design': 'perks'}, format='json').data, {'price_tag_design': 'perks'})
        self.assertEqual(emp.get(SIZE).data['price_tag_design'], 'perks')
        mgr.put(DESIGN, {'design': 'classic'}, format='json')
        change = AppSettingHistory.objects.get(key='printing.price_tag_design')
        self.assertEqual((change.old_value, change.new_value), ('perks', 'classic'))

    def test_a_typo_is_refused_and_a_bad_row_reads_classic(self):
        mgr = _client('mgr@example.com', 'Manager')
        self.assertEqual(mgr.put(DESIGN, {'design': 'fancy'}, format='json').status_code, 400)
        AppSetting.objects.create(key='printing.price_tag_design', value='fancy')
        self.assertEqual(mgr.get(SIZE).data['price_tag_design'], 'classic')

    def test_saving_the_size_keeps_the_design(self):
        mgr = _client('mgr@example.com', 'Manager')
        mgr.put(DESIGN, {'design': 'perks'}, format='json')
        r = mgr.put(SIZE, {'w_in': 2.25, 'h_in': 1.25, 'dpi': 203}, format='json')
        self.assertEqual(r.data['price_tag_design'], 'perks')


class TagMarksTests(TestCase):
    """Rulebook A1: every new tag says 3-DAY RETURNS WITH THRIFT+ or AS IS · NO RETURNS, by the scanner's rule."""

    def _item(self, sku, price='40.00', **kw):
        return Item.objects.create(sku=sku, product=Product.objects.create(title='Stand mixer'), price=Decimal(price),
                                   status='on_shelf', **kw)

    def test_each_item_gets_its_strip(self):
        self._item('ITM0000001')
        self._item('ITM0000002', condition='salvage')
        self._item('ITM0000003', notes='Sold as is, motor hums')
        self._item('ITM0000004', price='8.00')
        r = _client('emp@example.com', 'Employee').post(MARKS, {'items': [
            {'sku': 'ITM0000001', 'price': '40.00'}, {'sku': 'itm0000002'}, {'sku': 'ITM0000003', 'price': '40'},
            {'sku': 'ITM0000004', 'price': '8.00'}, {'sku': 'ITM9999999', 'price': '20'},
        ]}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        marks = r.data['marks']
        self.assertEqual({k: v['as_is'] for k, v in marks.items()}, {
            'ITM0000001': False, 'ITM0000002': True, 'ITM0000003': True, 'ITM0000004': True, 'ITM9999999': True,
        })
        self.assertIn('AS IS', marks['ITM0000002']['why'])

    def test_the_printed_price_decides_not_the_old_one(self):
        self._item('ITM0000005', price='40.00')
        r = _client('emp@example.com', 'Employee').post(MARKS, {'items': [{'sku': 'ITM0000005', 'price': '9.00'}]},
                                                        format='json')
        self.assertIs(r.data['marks']['ITM0000005']['as_is'], True)

    def test_a_tag_link_is_read_as_its_sku_and_a_bad_body_is_refused(self):
        self._item('ITM0000006')
        emp = _client('emp@example.com', 'Employee')
        r = emp.post(MARKS, {'items': [{'sku': 'HTTPS://ECOTHRIFT.US/I/ITM0000006', 'price': '40'}]}, format='json')
        self.assertIs(r.data['marks']['ITM0000006']['as_is'], False)
        self.assertEqual(emp.post(MARKS, {'items': 'ITM0000006'}, format='json').status_code, 400)
        self.assertIn(APIClient().post(MARKS, {'items': []}, format='json').status_code, (401, 403))


class TagLinkAddressTests(TestCase):
    """ECOTHRIFT.US/I/<SKU> opens the item in the Thrift+ app; 7-character codes stay interview links."""

    def test_a_tag_link_opens_the_item_in_the_scanner(self):
        for path in ('/I/ITM0226342', '/i/itm0226342', '/I/ITM0226342/'):
            r = self.client.get(path)
            self.assertEqual((r.status_code, r['Location']), (302, '/scan?tag=ITM0226342'), path)

    def test_a_seven_character_code_is_still_the_interview_short_link(self):
        r = self.client.get('/i/k3X9pQr')
        self.assertEqual(r.status_code, 302)
        self.assertNotIn('/scan', r['Location'])


@override_settings(
    PUBLIC_SITE_HOSTS=['ecothrift.us', 'www.ecothrift.us'], PUBLIC_SITE_CANONICAL_HOST='ecothrift.us',
    ALLOWED_HOSTS=['ecothrift.us', 'www.ecothrift.us'],
)
class TagLinkOnThePublicHostTests(SimpleTestCase):
    def test_the_capitals_link_reaches_django_on_both_public_hosts(self):
        middleware = PublicSiteMiddleware(lambda request: HttpResponse('dashboard'))
        for host in ('ecothrift.us', 'www.ecothrift.us'):
            for path in ('/I/ITM0226342', '/i/ITM0226342'):
                r = middleware(RequestFactory().get(path, HTTP_HOST=host))
                self.assertEqual((r.status_code, r.content), (200, b'dashboard'), f'{host}{path}')
