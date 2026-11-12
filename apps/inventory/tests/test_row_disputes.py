"""Dash Updates #100 and #101: dispute a manifest row from the Processing queue with no product, item or check-in;
photos for every reason but "did not come", carried to the B-Stock dispute page."""
import io
import zipfile
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.core.models import S3File
from apps.inventory.models import BStockDispute, Item, ManifestRowDispute, ManifestRowDisputePhoto, Product
from apps.inventory.services.bstock_disputes import affected_lines, create_dispute
from apps.inventory.services.truck_finalize import truck_lines
from apps.inventory.services.truck_plan import truck_summary
from apps.inventory.tests.test_truck_finalize import TruckFinalizeBase

_STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
_NEEDS_PHOTOS = {'broken', 'wrong_item', 'missing_parts', 'other'}


def _jpeg(name='cracked.jpg'):
    buf = io.BytesIO()
    Image.new('RGB', (64, 48), (200, 40, 40)).save(buf, format='JPEG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


@override_settings(STORAGES=_STORAGES)
class RowDisputeTests(TruckFinalizeBase):
    """Line 1 = 10 x $50 (row 1), line 2 = 5 x $100 (row 2)."""

    def _url(self, tail=''):
        return f'/api/inventory/orders/{self.order.id}/row-disputes/{tail}'

    def _dispute(self, idx=0, photos=None, **body):
        """Every reason that needs a photo gets one unless ``photos`` says otherwise (0 = none)."""
        _, pr = self.rows[idx]
        if photos is None:
            photos = 1 if body.get('reason') in _NEEDS_PHOTOS else 0
        data = {'processing_row_id': pr.id, **body}
        if not photos:
            return self.client.post(self._url(), data, format='json')
        files = [_jpeg(f'photo{n}.jpg') for n in range(photos)]
        return self.client.post(self._url(), {**data, 'photos': files}, format='multipart')

    def _line(self, idx=0):
        mr, _ = self.rows[idx]
        return next(line for line in truck_lines(self.order) if line['manifest_row_id'] == mr.id)

    def test_did_not_come_needs_no_product_item_or_check_in(self):
        products, items = Product.objects.count(), Item.objects.count()
        r = self._dispute(reason='did_not_come', units=3, note='never on the pallet')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((Product.objects.count(), Item.objects.count()), (products, items))
        self.assertEqual((r.data['row']['remaining'], r.data['row']['disputed']), (7, 3))
        _, pr = self.rows[0]
        pr.refresh_from_db()
        self.assertEqual((pr.qty_dispositioned, pr.queue_status), (3, 'disputed'))
        d = ManifestRowDispute.objects.get()
        self.assertEqual((d.units, d.reason, d.note, d.created_by_id), (3, 'did_not_come', 'never on the pallet', self.user.pk))

    def test_did_not_come_feeds_the_header_and_the_b_stock_list(self):
        self._dispute(reason='did_not_come', units=3)
        self.assertEqual(self._line()['marked_missing'], Decimal('3'))
        parts = truck_summary(self.order)['disputes']['parts']
        self.assertEqual(parts['not_received']['units'], 3)                # the header's Disputed figure
        lines = affected_lines(self.order)
        mine = [ln for ln in lines if ln['row_number'] == 1 and ln['issue'] == 'Not received']
        self.assertEqual(len(mine), 1)
        self.assertGreaterEqual(mine[0]['units'], 3)          # unprocessed units count as missing too, as before

    def test_broken_and_partial_count_once_never_also_as_missing(self):
        self._dispute(reason='broken', units=2)
        self._dispute(reason='missing_parts', units=2, pct_lost=25)
        self._check_in(0, 6)                                  # the other 6 units are checked in
        u = self._line()['units']
        self.assertEqual((u['missing'], u['broken'], u['disputed']), (Decimal('0'), Decimal('2'), Decimal('0.5')))
        issues = {ln['issue'] for ln in affected_lines(self.order) if ln['row_number'] == 1}
        self.assertEqual(issues, {'Damaged', 'Damaged (partial)'})

    def test_left_to_process_drops_by_exactly_the_disputed_units(self):
        before = truck_summary(self.order)['on_track']['units_left']
        self._dispute(reason='did_not_come', units=3)
        self.assertEqual(truck_summary(self.order)['on_track']['units_left'], before - 3)   # the row's other 7 still count

    def test_wrong_item_counts_as_damaged(self):
        self._dispute(idx=1, reason='wrong_item', units=5)
        u = self._line(1)['units']
        self.assertEqual((u['broken'], u['missing']), (Decimal('5'), Decimal('0')))

    def test_the_disputed_units_leave_the_row_and_a_check_in_finishes_it(self):
        self._dispute(reason='did_not_come', units=8)
        _, pr = self.rows[0]
        # The check-in window starts at what is left (qtyRemaining); extras stay allowed, as before.
        self._check_in(0, 2)
        pr.refresh_from_db()
        self.assertEqual((pr.qty_dispositioned, pr.quantity), (10, 10))
        u = self._line()['units']
        self.assertEqual((u['received'], u['missing'], u['over']), (Decimal('2'), Decimal('8'), Decimal('0')))
        # One more found after all: the header's "not received so far" never counts more than is really missing.
        self._check_in(0, 1)
        self.assertEqual(self._line()['marked_missing'], Decimal('7'))

    def test_undo_restores_the_units_to_process(self):
        r = self._dispute(reason='did_not_come', units=4)
        undo = self.client.post(self._url(f'{r.data["dispute"]["id"]}/undo/'), {}, format='json')
        self.assertEqual(undo.status_code, 200, undo.data)
        self.assertEqual((undo.data['row']['remaining'], undo.data['row']['disputed']), (10, 0))
        self.assertIsNotNone(undo.data['disputes'][0]['undone_at'])     # kept, marked undone
        _, pr = self.rows[0]
        pr.refresh_from_db()
        self.assertEqual((pr.qty_dispositioned, pr.queue_status), (0, 'pending'))
        self.assertEqual(self._line()['marked_missing'], Decimal('0'))
        again = self.client.post(self._url(f'{r.data["dispute"]["id"]}/undo/'), {}, format='json')
        self.assertEqual(again.status_code, 400)

    def test_plain_refusals(self):
        self.assertIn('Pick what is wrong', self._dispute(reason='lost', units=1).data['detail'])
        self.assertIn('how many', self._dispute(reason='broken', units=0).data['detail'])
        self.assertIn('10 units left', self._dispute(reason='broken', units=11).data['detail'])
        self.assertIn('between 1% and 100%', self._dispute(reason='other', units=1, pct_lost=0).data['detail'])
        self._dispute(reason='did_not_come', units=10)
        self.assertIn('nothing left', self._dispute(reason='broken', units=1).data['detail'])
        self.assertFalse(BStockDispute.objects.exists())                 # nothing is filed with B-Stock by itself

    def test_the_window_shows_the_row_and_its_disputes(self):
        self._dispute(reason='other', units=1, pct_lost=40, note='scuffed')
        _, pr = self.rows[0]
        r = self.client.get(self._url(), {'processing_row': pr.id})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['row']['remaining'], 9)
        self.assertEqual(r.data['disputes'][0]['reason_label'], 'Other problem')
        self.assertEqual(r.data['disputes'][0]['pct_lost'], 40)
        self.assertIn('did_not_come', [x['value'] for x in r.data['reasons']])

    def test_row_detail_counts_row_disputes(self):
        self._dispute(reason='did_not_come', units=3)
        _, pr = self.rows[0]
        r = self.client.get(f'/api/inventory/orders/{self.order.id}/processing-row-detail/', {'processing_row_id': pr.id})
        self.assertEqual(r.status_code, 200, r.data)
        row = r.data['row']
        self.assertEqual((row['qtyRemaining'], row['rowDisputedUnits'], row['status']), (7, 3, 'disputed'))

    # --- photos (Dash Update #101) -------------------------------------------------------------------------------

    def test_every_reason_but_did_not_come_needs_a_photo(self):
        for reason in sorted(_NEEDS_PHOTOS):
            r = self._dispute(reason=reason, units=1, pct_lost=30, photos=0)
            self.assertEqual(r.status_code, 400, reason)
            self.assertIn('Add a photo of the problem', r.data['detail'])
        self.assertFalse(ManifestRowDispute.objects.exists())
        _, pr = self.rows[0]
        pr.refresh_from_db()
        self.assertEqual(pr.qty_dispositioned, 0)
        self.assertEqual(self._dispute(reason='did_not_come', units=1).status_code, 201)     # no photo needed

    def test_photos_are_kept_with_the_dispute(self):
        r = self._dispute(reason='broken', units=2, photos=2, note='crushed corner')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(len(r.data['dispute']['photos']), 2)
        self.assertEqual(len(r.data['disputes'][0]['photos']), 2)
        photos = list(ManifestRowDisputePhoto.objects.select_related('s3_file', 'thumbnail_file'))
        self.assertEqual([p.position for p in photos], [0, 1])
        for p in photos:
            self.assertTrue(p.s3_file.key.startswith(f'disputes/orders/{self.order.id}/rows/'))
            self.assertTrue(default_storage.exists(p.s3_file.key))
            self.assertTrue(default_storage.exists(p.thumbnail_file.key))
        # The window shows them later too.
        _, pr = self.rows[0]
        got = self.client.get(self._url(), {'processing_row': pr.id}).data
        self.assertEqual(len(got['disputes'][0]['photos']), 2)
        self.assertEqual(got['photos_max'], 6)
        self.assertEqual({x['value']: x['photos'] for x in got['reasons']}['did_not_come'], False)

    def test_did_not_come_keeps_no_photos(self):
        r = self._dispute(reason='did_not_come', units=1, photos=1)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['dispute']['photos'], S3File.objects.count()), ([], 0))

    def test_a_bad_photo_stops_the_dispute_and_leaves_nothing(self):
        _, pr = self.rows[0]
        bad = SimpleUploadedFile('note.jpg', b'not a picture', content_type='image/jpeg')
        r = self.client.post(self._url(), {'processing_row_id': pr.id, 'reason': 'broken', 'units': 1, 'photos': [bad]},
                             format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('could not be read as a picture', r.data['detail'])
        self.assertEqual((ManifestRowDispute.objects.count(), S3File.objects.count()), (0, 0))

    def test_too_many_photos(self):
        r = self._dispute(reason='broken', units=1, photos=7)
        self.assertEqual(r.status_code, 400)
        self.assertIn('Up to 6 photos', r.data['detail'])

    def test_a_refused_dispute_leaves_no_photo_files(self):
        r = self._dispute(reason='broken', units=11, photos=1)          # only 10 left: refused after the photos are read
        self.assertEqual(r.status_code, 400)
        self.assertEqual((ManifestRowDisputePhoto.objects.count(), S3File.objects.count()), (0, 0))

    def test_photos_go_to_the_b_stock_list_beside_their_line(self):
        self._dispute(reason='broken', units=2, photos=2)
        self._dispute(reason='missing_parts', units=1, pct_lost=40, photos=1)
        self._dispute(reason='did_not_come', units=3)
        by_issue = {ln['issue']: ln for ln in affected_lines(self.order) if ln['row_number'] == 1}
        self.assertEqual(len(by_issue['Damaged']['photo_ids']), 2)
        self.assertEqual(len(by_issue['Damaged (partial)']['photo_ids']), 1)
        self.assertEqual(by_issue['Not received']['photo_ids'], [])

        dispute = create_dispute(self.user, self.order)
        anon = APIClient()
        page = anon.get(f'/dispute/{dispute.token}/')
        self.assertEqual(page.status_code, 200)
        html = page.content.decode()
        self.assertIn('Photos of the damage, by line', html)
        self.assertIn('Line 1 · Damaged (partial)', html)
        self.assertIn('2 photos below', html)
        first = by_issue['Damaged']['photo_ids'][0]
        self.assertIn(f'/dispute/{dispute.token}/line-photo/{first}/', html)
        self.assertEqual(anon.get(f'/dispute/{dispute.token}/line-photo/{first}/').status_code, 302)
        zf = zipfile.ZipFile(io.BytesIO(b''.join(anon.get(f'/dispute/{dispute.token}/dispute.zip').streaming_content)))
        shots = [n for n in zf.namelist() if n.startswith('photos/')]
        self.assertEqual(len(shots), 3)
        self.assertTrue(any('Line 1 - Damaged - photo 1' in n for n in shots), shots)

    def test_undone_and_other_trucks_photos_stay_off_the_list(self):
        r = self._dispute(reason='broken', units=1)
        photo_id = r.data['dispute']['photos'][0]['id']
        dispute = create_dispute(self.user, self.order)
        self.client.post(self._url(f'{r.data["dispute"]["id"]}/undo/'), {}, format='json')
        self.assertFalse(any(ln.get('photo_ids') for ln in affected_lines(self.order)))
        self.assertEqual(APIClient().get(f'/dispute/{dispute.token}/line-photo/{photo_id}/').status_code, 404)

    def test_only_staff(self):
        outsider = APIClient()
        outsider.force_authenticate(user=get_user_model().objects.create_user(email='x@example.com', first_name='X', last_name='Y', password='pw'))
        _, pr = self.rows[0]
        self.assertEqual(outsider.post(self._url(), {'processing_row_id': pr.id, 'reason': 'broken', 'units': 1},
                                       format='json').status_code, 403)
