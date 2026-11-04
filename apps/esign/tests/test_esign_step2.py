"""D22 step 2: uploaded PDFs with placed boxes, deleting with a wait and a purge log, one template sent to many.
Made-up names only."""
import io
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from pypdf import PdfReader
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.esign import adapter, batches, placed, purge, services
from apps.esign.models import Batch, Envelope, Party, PurgeLog
from apps.esign.tests.helpers import (HOST, LOCMEM, OUTSIDER, TestHost, make_sent, pdf_bytes, reset_host, sign_args,
                                      user)

BOXES = [
    {'signer': 1, 'kind': 'signature', 'page': 2, 'x': 0.1, 'y': 0.8, 'w': 0.3, 'h': 0.06},
    {'signer': 1, 'kind': 'name', 'page': 2, 'x': 0.1, 'y': 0.87, 'w': 0.3, 'h': 0.03},
    {'signer': 1, 'kind': 'date', 'page': 2, 'x': 0.45, 'y': 0.87, 'w': 0.15, 'h': 0.03},
    {'signer': 2, 'kind': 'signature', 'page': 2, 'x': 0.55, 'y': 0.8, 'w': 0.3, 'h': 0.06},
    {'signer': 2, 'kind': 'initials', 'page': 1, 'x': 0.85, 'y': 0.92, 'w': 0.08, 'h': 0.04},
]


def upload(data=None, name='agreement.pdf'):
    return SimpleUploadedFile(name, data if data is not None else pdf_bytes(), content_type='application/pdf')


@override_settings(ESIGN_HOST_ADAPTER=HOST, CACHES=LOCMEM, ROOT_URLCONF='apps.esign.tests.urls')
class Step2Case(TestCase):
    def setUp(self):
        reset_host()
        self.owner = user('olive-owner', 'Olive', 'Owner')
        self.cara = user('cara-coowner', 'Cara', 'Coowner')
        self.dee = user('dee-staff', 'Dee', 'Staff')

    def tearDown(self):
        adapter.reset()

    def pdf_envelope(self, *, parties=None, data=None, boxes=BOXES):
        envelope = placed.create_pdf_envelope(
            uploaded=upload(data), title='Payroll deduction form', kind='policy', by=self.owner,
            parties=parties or [OUTSIDER, {'user_id': self.cara.pk, 'role_label': 'Owner'}],
            acknowledgments=['I have read every page.'])
        if boxes is not None:
            placed.set_boxes(envelope, boxes, by=self.owner)
        return envelope


class UploadedPdfTests(Step2Case):
    def test_an_uploaded_pdf_is_signed_in_order_and_the_boxes_are_drawn_onto_it(self):
        envelope = self.pdf_envelope()
        self.assertEqual((envelope.source, envelope.page_count, envelope.kind), (Envelope.PDF, 2, 'policy'))
        envelope, token, _ = services.send(envelope, by=self.owner)
        self.assertEqual(envelope.fingerprint, envelope.source_pdf_sha256)
        self.assertEqual(envelope.body_text, '')

        services.sign_by_link(token, **sign_args(acknowledgments=[True]))
        cara = envelope.parties.get(order=2)
        services.sign_signed_in(cara, user=self.cara, **sign_args(name='Cara Coowner', title='Owner',
                                                                  acknowledgments=[True]))
        envelope.refresh_from_db()
        self.assertEqual(envelope.status, Envelope.SIGNED)

        final = PdfReader(io.BytesIO(TestHost.files[envelope.final_pdf_key]))
        self.assertGreaterEqual(len(final.pages), 4)  # the 2 pages as sent, then the signatures and the audit trail
        self.assertIn('Test page 1 of 2', final.pages[0].extract_text())
        self.assertIn('CC', final.pages[0].extract_text())  # Cara's initials
        page_two = final.pages[1].extract_text()
        self.assertIn('Sam Sample', page_two)
        self.assertIn(timezone.localdate().strftime('%m/%d/%Y'), page_two)
        record = ' '.join(p.extract_text() for p in final.pages[2:])
        self.assertIn('an uploaded PDF of 2 pages', record)
        self.assertIn(envelope.source_pdf_sha256, record.replace('\n', ''))
        self.assertIn('I have read every page.', record)

    def test_rotated_pages_keep_the_boxes_where_they_were_placed(self):
        envelope = self.pdf_envelope(data=pdf_bytes(2, rotate=90))
        envelope, token, _ = services.send(envelope, by=self.owner)
        services.sign_by_link(token, **sign_args(acknowledgments=[True]))
        services.sign_signed_in(envelope.parties.get(order=2), user=self.cara,
                                **sign_args(name='Cara Coowner', acknowledgments=[True]))
        envelope.refresh_from_db()
        final = PdfReader(io.BytesIO(TestHost.files[envelope.final_pdf_key]))
        self.assertEqual(final.pages[1].get('/Rotate'), 90)
        self.assertIn('Sam Sample', final.pages[1].extract_text())

    def test_what_is_refused(self):
        for bad in (b'not a pdf', b''):
            with self.assertRaises(ValidationError):
                placed.read_pdf(upload(bad))
        envelope = self.pdf_envelope(boxes=None)
        for boxes in ([{**BOXES[0], 'signer': 3}], [{**BOXES[0], 'page': 3}], [{**BOXES[0], 'x': 0.9}],
                      [{**BOXES[0], 'kind': 'stamp'}], 'boxes'):
            with self.assertRaises(ValidationError):
                placed.set_boxes(envelope, boxes, by=self.owner)
        # Every signer needs a signature box of their own.
        placed.set_boxes(envelope, BOXES[:3], by=self.owner)
        with self.assertRaisesMessage(ValidationError, 'Cara Coowner'):
            services.send(envelope, by=self.owner)
        # Once sent, the boxes are frozen.
        placed.set_boxes(envelope, BOXES, by=self.owner)
        services.send(envelope, by=self.owner)
        with self.assertRaises(ValidationError):
            placed.set_boxes(envelope, BOXES[:4], by=self.owner)

    def test_a_pdf_changed_in_storage_after_sending_cannot_be_signed(self):
        envelope, token, _ = services.send(self.pdf_envelope(), by=self.owner)
        TestHost.files[envelope.source_pdf_key] = pdf_bytes(3)
        with self.assertRaisesMessage(ValidationError, 'changed after it was sent'):
            services.sign_by_link(token, **sign_args(acknowledgments=[True]))

    def test_dropping_a_signer_drops_their_boxes(self):
        envelope = self.pdf_envelope()
        services.update_draft(envelope, parties=[OUTSIDER], by=self.owner)
        self.assertEqual(sorted(set(envelope.placed.values_list('signer', flat=True))), [1])

    def test_the_pdf_reaches_only_whoever_is_signing_now(self):
        envelope, token, _ = services.send(self.pdf_envelope(), by=self.owner)
        public = APIClient()
        self.assertEqual(public.get('/esign/public/source/', {'t': token})['Content-Type'], 'application/pdf')
        state = public.get('/esign/public/document/', {'t': token}).json()
        self.assertEqual((state['source'], state['page_count'], len(state['boxes'])), ('pdf', 2, 3))
        cara_party = envelope.parties.get(order=2)
        cara = APIClient()
        cara.force_authenticate(self.cara)
        self.assertEqual(cara.get(f'/esign/mine/{cara_party.pk}/source/').status_code, 403)  # not her turn
        services.sign_by_link(token, **sign_args(acknowledgments=[True]))
        self.assertEqual(public.get('/esign/public/source/', {'t': token}).json()['state'], 'used')
        self.assertEqual(cara.get(f'/esign/mine/{cara_party.pk}/source/').status_code, 200)
        dee = APIClient()
        dee.force_authenticate(self.dee)
        self.assertEqual(dee.get(f'/esign/mine/{cara_party.pk}/source/').status_code, 403)
        self.assertEqual(dee.get(f'/esign/envelopes/{envelope.pk}/source/').status_code, 403)

    def test_the_owner_uploads_and_places_boxes_through_the_api(self):
        owner = APIClient()
        owner.force_authenticate(self.owner)
        made = owner.post('/esign/envelopes/pdf/', {
            'file': upload(), 'title': 'Payroll deduction form', 'kind': 'policy',
            'parties': '[{"user_id": %d}]' % self.dee.pk}, format='multipart')
        self.assertEqual(made.status_code, 201, made.content)
        pk = made.json()['id']
        saved = owner.put(f'/esign/envelopes/{pk}/fields/', {'fields': BOXES[:3]}, format='json')
        self.assertEqual(len(saved.json()['boxes']), 3)
        sent = owner.post(f'/esign/envelopes/{pk}/send/')
        self.assertEqual(sent.json()['status'], 'out')


class DeletingTests(Step2Case):
    def test_ask_restore_then_purge_with_a_log(self):
        envelope, token = make_sent(self.owner)
        with self.assertRaisesMessage(ValidationError, 'Void it first'):
            purge.request_delete(envelope, by=self.owner, reason='Sent by mistake')
        services.void(envelope, by=self.owner, reason='Wrong person')
        with self.assertRaises(ValidationError):
            purge.request_delete(envelope, by=self.owner, reason='')
        envelope = purge.request_delete(envelope, by=self.owner, reason='Sent by mistake')
        self.assertAlmostEqual((envelope.purge_after - envelope.delete_requested_at).days, 90)
        purge.restore(envelope, by=self.owner)
        envelope.refresh_from_db()
        self.assertIsNone(envelope.purge_after)
        self.assertEqual(purge.purge_due(), 0)

        purge.request_delete(envelope, by=self.owner, reason='Sent by mistake')
        self.assertEqual(purge.purge_due(), 0)  # the wait is not over
        self.assertEqual(purge.purge_due(now=timezone.now() + timedelta(days=91)), 1)
        self.assertFalse(Envelope.objects.filter(pk=envelope.pk).exists())
        entry = PurgeLog.objects.get()
        self.assertEqual((entry.envelope_id, entry.reason, entry.requested_by, entry.purged_by, entry.status),
                         (envelope.pk, 'Sent by mistake', 'Olive Owner', 'scheduled', 'void'))
        self.assertEqual(entry.fingerprint, envelope.body_sha256)

    def test_purging_removes_every_stored_file(self):
        envelope, token, _ = services.send(self.pdf_envelope(parties=[OUTSIDER], boxes=BOXES[:3]), by=self.owner)
        services.sign_by_link(token, **sign_args(acknowledgments=[True]))
        envelope.refresh_from_db()
        keys = {envelope.source_pdf_key, envelope.final_pdf_key}
        self.assertTrue(keys <= set(TestHost.files))
        purge.request_delete(envelope, by=self.owner, reason='Replaced by a new form')
        purge.purge(Envelope.objects.get(pk=envelope.pk), by=self.owner)
        self.assertFalse(keys & set(TestHost.files))
        self.assertEqual(PurgeLog.objects.get().purged_by, 'Olive Owner')
        with self.assertRaises(ValidationError):  # only one asked to be deleted can be purged
            other, _ = make_sent(self.owner)
            purge.purge(other)

    def test_the_daily_purge_removes_what_is_due(self):
        envelope, _ = make_sent(self.owner)
        services.void(envelope, by=self.owner, reason='Wrong person')
        purge.request_delete(envelope, by=self.owner, reason='Sent by mistake')
        Envelope.objects.filter(pk=envelope.pk).update(purge_after=timezone.now() - timedelta(minutes=1))
        self.assertEqual(purge.purge_due(), 1)  # the host's daily job calls this
        self.assertFalse(Envelope.objects.filter(pk=envelope.pk).exists())


class SendToManyTests(Step2Case):
    def handbook(self):
        return services.create_template(
            name='Handbook acknowledgment', kind='policy', title='{{handbook}} handbook acknowledgment',
            sections=[{'heading': '', 'body': 'I, {{signer_name}}, have received the {{handbook}} handbook.'}],
            fields=[{'key': 'handbook', 'label': 'Handbook', 'kind': 'text', 'required': True}], by=self.owner,
            acknowledgments=['I have read the handbook.'])

    def test_each_person_gets_their_own_and_the_tracker_says_who_has_not_signed(self):
        template = self.handbook()
        people = [self.cara.pk, self.dee.pk]
        with self.assertRaises(ValidationError):  # a required fill-in
            batches.send_to_many(version=template.latest, name='2027 handbook', user_ids=people, values={}, by=self.owner)
        batch = batches.send_to_many(version=template.latest, name='2027 handbook', user_ids=people,
                                     values={'handbook': '2027'}, by=self.owner)
        self.assertEqual(batch.envelopes.filter(status=Envelope.OUT).count(), 2)
        self.assertFalse(batch.envelopes.filter(events__kind='link_given').exists())  # nobody was shown a link
        dee_doc = batch.envelopes.get(parties__user=self.dee)
        self.assertIn('I, Dee Staff, have received the 2027 handbook.', dee_doc.body_text)

        services.sign_signed_in(dee_doc.parties.get(), user=self.dee, **sign_args(name='Dee Staff', acknowledgments=[True]))
        cover = batches.coverage(batch)
        self.assertEqual((cover['signed'], cover['total']), (1, 2))
        self.assertEqual({p['name']: p['status'] for p in cover['people']}, {'Cara Coowner': 'waiting', 'Dee Staff': 'signed'})
        self.assertEqual([m['name'] for m in cover['missing']], ['Olive Owner'])  # on the host's list, not sent one

        self.assertEqual(batches.add_people(batch, user_ids=[self.owner.pk, self.dee.pk], by=self.owner), 1)
        self.assertEqual(batches.coverage(Batch.objects.get(pk=batch.pk))['missing'], [])

    def test_a_template_with_a_second_signer_goes_one_at_a_time(self):
        template = services.create_template(
            name='Two signers', kind='agreement', title='Two', by=self.owner, fields=[],
            sections=[{'heading': '', 'body': '{{party_1_name}} and {{party_2_name}} agree.'}])
        with self.assertRaisesMessage(ValidationError, 'second signer'):
            batches.send_to_many(version=template.latest, name='X', user_ids=[self.dee.pk], values={}, by=self.owner)

    def test_through_the_api_and_staff_are_refused(self):
        template = self.handbook()
        owner, staff = APIClient(), APIClient()
        owner.force_authenticate(self.owner)
        staff.force_authenticate(self.dee)
        body = {'version': template.latest.pk, 'name': '2027 handbook', 'people': [self.dee.pk], 'values': {'handbook': '2027'}}
        self.assertEqual(staff.post('/esign/batches/', body, format='json').status_code, 403)
        made = owner.post('/esign/batches/', body, format='json')
        self.assertEqual((made.status_code, made.json()['total']), (201, 1))
        self.assertEqual(len(owner.get('/esign/everyone/').json()), 3)
        self.assertEqual(owner.get('/esign/batches/').json()[0]['name'], '2027 handbook')
        mine = staff.get('/esign/mine/').json()
        self.assertEqual((mine[0]['title'], mine[0]['my_turn']), ('2027 handbook', True))
        self.assertEqual(Party.objects.get(user=self.dee).envelope.batch.name, '2027 handbook')
