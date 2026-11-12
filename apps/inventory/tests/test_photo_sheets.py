"""Photo sheets (Dash Update #95): a letter-size sheet of photos and the full title, for items in a box."""
import io
import json
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.inventory.models import Item, PhotoSheet, Product
from apps.inventory.services import photo_sheets

# In-memory storage, so a test photo never lands in the real bucket.
_TEST_STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
BASE = '/api/inventory/photo-sheets/'


def jpeg(width=40, height=30) -> bytes:
    buf = io.BytesIO()
    Image.new('RGB', (width, height), (200, 120, 40)).save(buf, format='JPEG')
    return buf.getvalue()


@override_settings(STORAGES=_TEST_STORAGES)
class Base(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='proc95@example.com', first_name='Sam', last_name='P', password='test-pass-123')
        self.user.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.blender = Product.objects.create(
            title='Vitamix 5200 Blender, 64 oz', brand='Vitamix', specifications={'dimensions': '8 x 7 x 20 in'},
        )
        self.item = Item.objects.create(sku='ITM0095001', product=self.blender, price=Decimal('129.99'),
                                        status='on_shelf', condition='like_new')
        self.twin = Item.objects.create(sku='ITM0095002', product=self.blender, price=Decimal('119.99'),
                                        status='processing', condition='good')

    def photo(self, width=40, height=30) -> dict:
        out = self.client.post(f'{BASE}photos/', {'photo': SimpleUploadedFile('p.jpg', jpeg(width, height), 'image/jpeg')},
                               format='multipart')
        self.assertEqual(out.status_code, 201, out.content)
        return out.json()

    def sheet_body(self, **extra) -> dict:
        body = {
            'item': self.item.pk, 'title': 'Vitamix 5200 Blender, 64 oz', 'brand': 'Vitamix',
            'facts': {'size': '8 x 7 x 20 in', 'in_box': 'Base, jar, lid', 'condition': 'Like new', 'good_to_know': ''},
            'layout': 'big3', 'orientation': 'portrait',
            'photos': [{**self.photo(), 'fit': 'fit', 'turn': 0}, {**self.photo(30, 40), 'fit': 'fill', 'turn': 90}],
        }
        body.update(extra)
        return body


class SaveTests(Base):
    def test_save_with_its_item_and_open_it_again(self):
        out = self.client.post(BASE, self.sheet_body(), format='json')
        self.assertEqual(out.status_code, 201, out.content)
        sheet = PhotoSheet.objects.get()
        self.assertEqual((sheet.item, sheet.product, sheet.layout), (self.item, self.blender, 'big3'))
        self.assertEqual([p['fit'] for p in sheet.photos], ['fit', 'fill'])
        self.assertEqual(sheet.photos[1]['turn'], 90)
        self.assertEqual((sheet.photos[0]['width'], sheet.photos[0]['height']), (40, 30))
        # Opening the item again finds its sheet, ready for Print again.
        start = self.client.get(f'{BASE}start/', {'item': self.item.pk}).json()
        self.assertEqual(start['sheet']['id'], sheet.pk)
        self.assertEqual(start['sheet']['item'], {'id': self.item.pk, 'sku': 'ITM0095001', 'price': '129.99',
                                                  'status': 'on_shelf', 'condition': 'like_new'})

    def test_changes_save_and_facts_are_trimmed(self):
        sheet_id = self.client.post(BASE, self.sheet_body(), format='json').json()['id']
        out = self.client.patch(f'{BASE}{sheet_id}/', {
            'layout': 'grid4', 'orientation': 'landscape', 'facts': {'size': '  8 x 7   x 20 in ', 'nonsense': 'x'},
        }, format='json')
        self.assertEqual(out.status_code, 200, out.content)
        self.assertEqual(out.json()['facts'], {'size': '8 x 7 x 20 in', 'in_box': '', 'condition': '', 'good_to_know': ''})
        self.assertEqual((out.json()['layout'], out.json()['orientation']), ('grid4', 'landscape'))

    def test_a_title_is_needed_and_the_layout_must_be_known(self):
        self.assertEqual(self.client.post(BASE, self.sheet_body(title='  '), format='json').status_code, 400)
        self.assertEqual(self.client.post(BASE, self.sheet_body(layout='nine'), format='json').status_code, 400)

    def test_only_sheet_photos_can_be_used_or_served(self):
        other = S3File.objects.create(key='receiving/x.jpg', filename='x.jpg')
        out = self.client.post(BASE, self.sheet_body(photos=[{'file': other.pk}]), format='json')
        self.assertEqual(out.status_code, 400)
        self.assertEqual(self.client.get(f'{BASE}photos/{other.pk}/').status_code, 404)
        mine = self.photo()
        self.assertEqual(self.client.get(f'{BASE}photos/{mine["file"]}/').status_code, 200)

    def test_five_photos_are_too_many(self):
        photos = [self.photo() for _ in range(5)]
        self.assertEqual(self.client.post(BASE, self.sheet_body(photos=photos), format='json').status_code, 400)

    def test_a_photo_is_turned_upright_and_kept_small(self):
        out = self.photo(4000, 1000)
        self.assertEqual((out['width'], out['height']), (2048, 512))
        bad = self.client.post(f'{BASE}photos/', {'photo': SimpleUploadedFile('p.jpg', b'not a photo', 'image/jpeg')},
                               format='multipart')
        self.assertEqual(bad.status_code, 400)


class WebPictureTests(Base):
    """Bill, 11-11: most pictures are copied from the web and pasted, on white or in a staged room."""

    def test_a_white_border_is_trimmed_so_the_item_fills_its_space(self):
        img = Image.new('RGB', (1000, 1000), (255, 255, 255))
        img.paste((40, 40, 40), (400, 300, 600, 700))   # the item, small in the middle of a white square
        buf = io.BytesIO()
        img.save(buf, format='JPEG')
        out = photo_sheets.save_photo(buf.getvalue(), user=self.user)
        self.assertLess(out['width'], 400)
        self.assertLess(out['height'], 600)
        # A picture with no white border (a staged room) is kept whole.
        self.assertEqual((self.photo(400, 300)['width'], self.photo(400, 300)['height']), (400, 300))

    def _response(self, body=b'', status=200, location=''):
        resp = mock.MagicMock()
        resp.status_code = status
        resp.is_redirect = bool(location)
        resp.headers = {'location': location} if location else {}
        resp.iter_content.return_value = [body]
        resp.__enter__.return_value = resp
        return resp

    def test_a_pasted_picture_link_is_fetched_and_saved(self):
        with mock.patch.object(photo_sheets, '_public_host', return_value=True), \
                mock.patch('requests.get', return_value=self._response(jpeg(300, 200))) as get:
            out = self.client.post(f'{BASE}photos/link/', {'url': 'https://example.com/sofa.jpg'}, format='json')
        self.assertEqual(out.status_code, 201, out.content)
        self.assertEqual((out.json()['width'], out.json()['height']), (300, 200))
        self.assertFalse(get.call_args.kwargs['allow_redirects'])

    def test_a_link_to_the_server_s_own_network_is_refused(self):
        with mock.patch('requests.get') as get:
            for url in ('http://127.0.0.1/a.jpg', 'http://localhost/a.jpg', 'file:///etc/passwd', 'ftp://example.com/a.jpg', 'not a link'):
                self.assertEqual(self.client.post(f'{BASE}photos/link/', {'url': url}, format='json').status_code, 400, url)
        get.assert_not_called()

    def test_a_redirect_to_a_private_address_is_refused(self):
        with mock.patch.object(photo_sheets, '_public_host', side_effect=[True, False]), \
                mock.patch('requests.get', return_value=self._response(location='http://10.0.0.5/a.jpg')):
            out = self.client.post(f'{BASE}photos/link/', {'url': 'https://example.com/a.jpg'}, format='json')
        self.assertEqual(out.status_code, 400)

    def test_a_link_that_is_not_a_picture_says_so(self):
        with mock.patch.object(photo_sheets, '_public_host', return_value=True), \
                mock.patch('requests.get', return_value=self._response(b'<html>not a picture</html>')):
            out = self.client.post(f'{BASE}photos/link/', {'url': 'https://example.com/page'}, format='json')
        self.assertEqual(out.status_code, 400)

    def test_caption_and_not_assembled_are_saved(self):
        out = self.client.post(BASE, self.sheet_body(caption='item', not_assembled=True), format='json').json()
        self.assertEqual((out['caption'], out['not_assembled']), ('item', True))
        self.assertEqual(self.client.post(BASE, self.sheet_body(caption='maybe'), format='json').status_code, 400)
        draft = self.client.get(f'{BASE}start/', {'item': self.twin.pk}).json()['draft']
        self.assertEqual((draft['caption'], draft['not_assembled']), ('item', True))


class ReprintTests(Base):
    def test_print_again_counts_each_print(self):
        sheet_id = self.client.post(BASE, self.sheet_body(), format='json').json()['id']
        self.client.post(f'{BASE}{sheet_id}/printed/')
        out = self.client.post(f'{BASE}{sheet_id}/printed/').json()
        self.assertEqual(out['print_count'], 2)
        self.assertIsNotNone(out['printed_at'])

    def test_the_next_one_of_the_same_product_starts_with_its_photos(self):
        first = self.client.post(BASE, self.sheet_body(), format='json').json()
        start = self.client.get(f'{BASE}start/', {'item': self.twin.pk}).json()
        self.assertIsNone(start['sheet'])
        draft = start['draft']
        self.assertEqual(draft['photos'], first['photos'])
        self.assertEqual((draft['layout'], draft['title'], draft['facts']['in_box']), ('big3', first['title'], 'Base, jar, lid'))
        # The twin's own condition, not the first one's.
        self.assertEqual(draft['facts']['condition'], 'Good')
        self.assertEqual(draft['from_sheet'], {'id': first['id'], 'sku': 'ITM0095001'})
        # Saved for the twin, it is the twin's own sheet; the first one stays as it was.
        twin = self.client.post(BASE, {**self.sheet_body(item=self.twin.pk), 'photos': draft['photos']}, format='json').json()
        self.assertNotEqual(twin['id'], first['id'])
        self.assertEqual(self.client.get(f'{BASE}start/', {'item': self.item.pk}).json()['sheet']['id'], first['id'])

    def test_a_long_title_starts_with_a_short_plain_name(self):
        from apps.inventory.models import ProductProfile

        sofa = Product.objects.create(title='4-in-1 Convertible L Shaped Sleeper Sofa with Pull Out Bed and Storage Chaise, Linen')
        ProductProfile.objects.create(product=sofa, short_name='L-shaped sleeper sofa')
        item = Item.objects.create(sku='ITM0095004', product=sofa, price=Decimal('56.54'))
        draft = self.client.get(f'{BASE}start/', {'item': item.pk}).json()['draft']
        # The full title stays word for word; the short name is what prints big.
        self.assertEqual((draft['title'], draft['name']), (sofa.title, 'L-shaped sleeper sofa'))
        # A short title needs no name.
        self.assertEqual(self.client.get(f'{BASE}start/', {'item': self.item.pk}).json()['draft']['name'], '')
        out = self.client.post(BASE, {**self.sheet_body(item=item.pk), 'name': '  L-shaped   sleeper sofa '}, format='json').json()
        self.assertEqual(out['name'], 'L-shaped sleeper sofa')

    def test_a_typed_item_number_opens_its_sheet(self):
        out = self.client.get(f'{BASE}start/', {'code': 'itm0095002'}).json()
        self.assertEqual(out['item']['sku'], 'ITM0095002')
        self.assertEqual(self.client.get(f'{BASE}start/', {'code': 'ITM9999999'}).status_code, 400)

    def test_a_new_item_starts_from_what_dash_knows(self):
        draft = self.client.get(f'{BASE}start/', {'item': self.item.pk}).json()['draft']
        self.assertEqual((draft['title'], draft['brand']), ('Vitamix 5200 Blender, 64 oz', 'Vitamix'))
        self.assertEqual(draft['facts'], {'size': '8 x 7 x 20 in', 'in_box': '', 'condition': 'Like new', 'good_to_know': ''})
        generic = Product.objects.create(title='Desk lamp')
        lamp = Item.objects.create(sku='ITM0095003', product=generic, price=Decimal('8.00'))
        self.assertEqual(self.client.get(f'{BASE}start/', {'item': lamp.pk}).json()['draft']['brand'], '')


class NoItemTests(Base):
    def test_a_sheet_with_no_item_at_all(self):
        body = self.sheet_body(item=None, title='Office chairs, set of four', brand='', show_price=True,
                               show_item_number=True)
        out = self.client.post(BASE, body, format='json')
        self.assertEqual(out.status_code, 201, out.content)
        sheet = out.json()
        self.assertEqual((sheet['item'], sheet['product']), (None, None))
        # The tag's numbers belong to one tagged item: without one they never print.
        self.assertEqual((sheet['show_price'], sheet['show_item_number']), (False, False))
        self.assertEqual(self.client.get(BASE, {'q': 'office chairs'}).json()['results'][0]['id'], sheet['id'])

    def test_a_product_sheet_without_an_item(self):
        out = self.client.post(BASE, self.sheet_body(item=None, product=self.blender.pk), format='json').json()
        self.assertEqual(out['product']['id'], self.blender.pk)
        start = self.client.get(f'{BASE}start/', {'product': self.blender.pk}).json()
        self.assertEqual(start['sheet']['id'], out['id'])

    def test_ticks_stay_when_the_sheet_has_its_item(self):
        out = self.client.post(BASE, self.sheet_body(show_price=True, show_item_number=True), format='json').json()
        self.assertEqual((out['show_price'], out['show_item_number']), (True, True))


class CropAndContrastTests(Base):
    """#108: a picture moves and zooms inside its frame; one contrast setting for the sheet; labels; typed words."""

    def test_the_crop_of_each_picture_is_saved_and_kept_sane(self):
        body = self.sheet_body()
        body['photos'][0].update({'zoom': 1.75, 'x': -0.2, 'y': 0.125})
        body['photos'][1].update({'zoom': 99, 'x': 'left', 'y': -50})
        out = self.client.post(BASE, body, format='json').json()
        first, second = out['photos']
        self.assertEqual((first['zoom'], first['x'], first['y']), (1.75, -0.2, 0.125))
        # Nonsense is held to the limits; a word is no shift at all.
        self.assertEqual((second['zoom'], second['x'], second['y']), (photo_sheets.ZOOM_MAX, 0.0, -photo_sheets.SHIFT_MAX))
        # A picture saved before #108 reads as not cropped.
        sheet = PhotoSheet.objects.get(pk=out['id'])
        sheet.photos = [{k: v for k, v in sheet.photos[0].items() if k not in ('zoom', 'x', 'y')}]
        sheet.save()
        again = self.client.patch(f'{BASE}{out["id"]}/', {'photos': sheet.photos}, format='json').json()
        self.assertEqual((again['photos'][0]['zoom'], again['photos'][0]['x']), (1.0, 0.0))

    def test_contrast_is_one_of_the_steps_and_a_new_sheet_starts_at_the_last_one(self):
        out = self.client.post(BASE, self.sheet_body(contrast=2), format='json').json()
        self.assertEqual(out['contrast'], 2)
        self.assertEqual(self.client.post(BASE, self.sheet_body(contrast=7), format='json').status_code, 400)
        # The office printer is the same for every sheet.
        other = Item.objects.create(sku='ITM0095009', product=Product.objects.create(title='Desk lamp'), price=Decimal('9'))
        self.assertEqual(self.client.get(f'{BASE}start/', {'item': other.pk}).json()['draft']['contrast'], 2)

    def test_labels_keep_only_the_changed_ones_and_typed_keeps_known_boxes(self):
        body = self.sheet_body(labels={'size': 'Size, assembled', 'in_box': 'In the box', 'bogus': 'x', 'good_to_know': ''},
                               typed=['title', 'size', 'label.size', 'hacker'])
        out = self.client.post(BASE, body, format='json').json()
        self.assertEqual(out['labels'], {'size': 'Size, assembled'})
        self.assertEqual(out['typed'], ['title', 'size', 'label.size'])
        # A sheet saved before #108 has no list: every word there counts as typed.
        PhotoSheet.objects.filter(pk=out['id']).update(typed=None)
        self.assertIsNone(self.client.get(f'{BASE}{out["id"]}/').json()['typed'])
        # The next one of the same product starts with the labels, but none of its words count as this person's typing.
        draft = self.client.get(f'{BASE}start/', {'item': self.twin.pk}).json()['draft']
        self.assertEqual((draft['labels'], draft['typed']), ({'size': 'Size, assembled'}, []))


def _answer(**extra):
    answer = {
        'title': 'Vitamix 5200 Blender \u2014 64 oz', 'name': 'Blender', 'brand': 'Vitamix', 'condition': 'Like new, tested',
        'size': '8 x 7 x 20 in', 'in_box': 'Base, 64 oz jar, lid, tamper', 'good_to_know': 'Variable speed',
        'labels': {'size': 'Size', 'in_box': 'In the box', 'condition': 'Condition', 'good_to_know': 'Works with'},
        'caption': 'product', 'not_assembled': False,
    }
    answer.update(extra)
    return SimpleNamespace(tool_input=answer, model_used='spark', text='')


class AiTests(Base):
    def ask(self, body, answer=None, fail=False):
        from apps.core.services.llm_router import LLMAPIError

        patch = (mock.patch('apps.core.services.llm_router.llm_complete', side_effect=LLMAPIError('down')) if fail
                 else mock.patch('apps.core.services.llm_router.llm_complete', return_value=answer or _answer()))
        with patch as llm:
            out = self.client.post(f'{BASE}ai/', body, format='json')
        return out, llm

    def sent(self, llm) -> dict:
        return json.loads(llm.call_args.kwargs['messages'][0]['content'][0]['text'])

    def test_the_ai_answers_every_word_and_saves_nothing(self):
        out, llm = self.ask({'item': self.item.pk, 'title': 'vitamix blender', 'typed': []})
        self.assertEqual(out.status_code, 200, out.content)
        data = out.json()
        # No em dash ever reaches the sheet.
        self.assertEqual(data['title'], 'Vitamix 5200 Blender, 64 oz')
        self.assertEqual(data['facts']['in_box'], 'Base, 64 oz jar, lid, tamper')
        self.assertEqual(data['labels']['good_to_know'], 'Works with')
        self.assertEqual(data['brand'], 'Vitamix')
        self.assertEqual(llm.call_args.kwargs['log_purpose'], 'SUGGEST_PRODUCT')
        self.assertFalse(PhotoSheet.objects.exists())

    def test_it_reads_the_manifest_row_the_item_its_events_and_the_pictures(self):
        from apps.inventory.models import FloorIssue, ItemHistory, ManifestRow, PurchaseOrder, Vendor

        po = PurchaseOrder.objects.create(vendor=Vendor.objects.create(name='V108', code='V108'), order_number='PO-108',
                                          ordered_date='2026-11-01', status='paid')
        row = ManifestRow.objects.create(purchase_order=po, row_number=4, title='VITAMIX 5200 BLNDR 64OZ BLK',
                                         condition='Open box', unit_retail=Decimal('449.95'), notes='No tamper')
        self.item.manifest_row = row
        self.item.save(update_fields=['manifest_row'])
        ItemHistory.objects.create(item=self.item, event_type='condition_change', old_value='good', new_value='like_new',
                                   note='Tested, runs on every speed')
        FloorIssue.objects.create(item=self.item, reason='missing_parts', note='Lid missing')
        photo = self.photo()
        out, llm = self.ask({'item': self.item.pk, 'title': 'Vitamix 5200', 'facts': {'size': 'Big'},
                             'typed': ['size'], 'photos': [photo]})
        self.assertEqual(out.status_code, 200, out.content)
        sent = self.sent(llm)
        self.assertEqual(sent['manifest_row']['title'], 'VITAMIX 5200 BLNDR 64OZ BLK')
        self.assertEqual(sent['manifest_row']['notes'], 'No tamper')
        self.assertEqual(sent['item']['condition'], 'Like new')
        self.assertEqual(sent['item_events']['history'][0]['note'], 'Tested, runs on every speed')
        self.assertEqual(sent['item_events']['floor_issues'][0]['note'], 'Lid missing')
        self.assertEqual(sent['product']['title'], self.blender.title)
        # The words a person typed are named, so the AI keeps them; an empty typed box is not.
        self.assertEqual(sent['typed_by_person'], ['size'])
        self.assertEqual(sent['pictures'], 1)
        blocks = llm.call_args.kwargs['messages'][0]['content']
        self.assertEqual([b['type'] for b in blocks], ['text', 'image'])
        self.assertEqual(out.json()['read'], ['the product', 'the manifest row', 'the item', '2 item events', '1 picture'])

    def test_a_product_sheet_reads_the_newest_row_matched_to_it(self):
        from apps.inventory.models import ManifestRow, PurchaseOrder, Vendor

        po = PurchaseOrder.objects.create(vendor=Vendor.objects.create(name='V108b', code='V108B'), order_number='PO-108b',
                                          ordered_date='2026-11-01', status='paid')
        ManifestRow.objects.create(purchase_order=po, row_number=1, title='OLD ROW', matched_product=self.blender)
        ManifestRow.objects.create(purchase_order=po, row_number=2, title='NEW ROW', matched_product=self.blender)
        _, llm = self.ask({'product': self.blender.pk, 'title': ''})
        self.assertEqual(self.sent(llm)['manifest_row']['title'], 'NEW ROW')

    def test_a_sheet_from_before_108_counts_every_word_as_typed(self):
        _, llm = self.ask({'item': self.item.pk, 'title': 'Vitamix 5200', 'brand': 'Vitamix', 'typed': None})
        self.assertEqual(self.sent(llm)['typed_by_person'][:3], ['title', 'brand', 'label.size'])

    def test_a_failed_ai_says_so_plainly(self):
        out, _ = self.ask({'title': 'Chair'}, fail=True)
        self.assertEqual(out.status_code, 400)
        self.assertIn('Type the words', out.json()['detail'])

    def test_no_title_and_no_product_asks_for_one(self):
        out, llm = self.ask({'title': ''})
        self.assertEqual(out.status_code, 400)
        llm.assert_not_called()
