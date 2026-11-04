"""The shared e-sign app (D22), against a made-up host. Made-up names only."""
import io
import pathlib
import re
from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from pypdf import PdfReader
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.test import APIClient

from apps.esign import adapter, services
from apps.esign.models import Envelope, Party, SigningLink
from apps.esign.tests.helpers import (ACKS, HOST, LOCMEM, OUTSIDER, VALUES, TestHost, make_sent, make_template,
                                      png_data_url, reset_host, sign_args, user)


@override_settings(ESIGN_HOST_ADAPTER=HOST, CACHES=LOCMEM, ROOT_URLCONF='apps.esign.tests.urls')
class EsignCase(TestCase):
    def setUp(self):
        reset_host()
        self.owner = user('olive-owner', 'Olive', 'Owner')
        self.cara = user('cara-coowner', 'Cara', 'Coowner')
        self.stranger = user('stan-stranger', 'Stan', 'Stranger')

    def tearDown(self):
        adapter.reset()

    def three(self):
        """An outsider by link, then two signed-in people: the order a host may need."""
        return [OUTSIDER, {'user_id': self.cara.pk, 'role_label': 'Owner'},
                {'user_id': self.owner.pk, 'role_label': 'Owner'}]


class TemplateTests(EsignCase):
    def test_every_save_is_a_new_version_and_sending_freezes_it(self):
        template = make_template(self.owner)
        first = template.latest
        services.save_version(template, title='Test Agreement', sections=[{'heading': 'A', 'body': 'New words'}],
                              fields=[], by=self.owner)
        self.assertEqual([v.number for v in template.versions.order_by('number')], [1, 2])
        first.refresh_from_db()
        self.assertEqual(first.acknowledgments, ACKS)
        services.send(services.create_envelope(version=first, parties=[OUTSIDER], values=VALUES, by=self.owner), by=self.owner)
        first.refresh_from_db()
        self.assertTrue(first.frozen)

    def test_party_blanks_are_built_in_and_a_kind_must_be_known(self):
        self.assertEqual([f['key'] for f in make_template().latest.fields], ['role_name', 'start_date'])
        with self.assertRaises(ValidationError):
            services.create_template(name='X', kind='nonsense', title='X', sections=[{'heading': 'A', 'body': 'b'}], fields=[], by=None)


class PartyTests(EsignCase):
    def test_who_can_be_a_party(self):
        cleaned = services.clean_parties([{'user_id': self.cara.pk}, OUTSIDER])
        self.assertEqual((cleaned[0]['name'], cleaned[0]['email']), ('Cara Coowner', ''))
        for bad in ([], [{'name': 'No Email'}], [{'user_id': self.cara.pk}, {'user_id': self.cara.pk}],
                    [{'name': 'Bad', 'email': 'not-an-email'}], [{'user_id': 99999}]):
            with self.assertRaises(ValidationError):
                services.clean_parties(bad)


class SigningInOrderTests(EsignCase):
    def test_three_parties_sign_in_order_and_everyone_gets_the_same_pdf(self):
        envelope, token = make_sent(self.owner, parties=self.three())
        envelope.refresh_from_db()
        self.assertEqual(envelope.status, Envelope.OUT)
        self.assertIn('Sam Sample is Test Director for Acme Test Co from November 15, 2026.', envelope.body_text)
        self.assertEqual(envelope.body_sha256, services.sha256_text(envelope.body_text))
        self.assertEqual(envelope.acknowledgments, ACKS)
        sam, cara, olive = envelope.parties.order_by('order')
        self.assertEqual([p.status for p in (sam, cara, olive)], ['ready', 'waiting', 'waiting'])
        self.assertIn(token, TestHost.mails[-1]['body'])  # the link went to the outsider

        # Not Cara's turn yet.
        with self.assertRaises(ValidationError):
            services.sign_signed_in(cara, user=self.cara, **sign_args(name='Cara Coowner', ip='198.51.100.2'))

        services.sign_by_link(token, **sign_args())
        cara.refresh_from_db()
        self.assertEqual(cara.status, Party.READY)
        # A signed-in party signs in the app; someone else cannot sign for her.
        with self.assertRaises(PermissionDenied):
            services.sign_signed_in(cara, user=self.stranger, **sign_args(name='Stan Stranger'))
        services.sign_signed_in(cara, user=self.cara, **sign_args(name='Cara Coowner', title='Owner'))
        olive = Party.objects.get(pk=olive.pk)
        with self.captureOnCommitCallbacks(execute=True) as mailed:  # the signed copy goes once the signature is saved
            services.sign_signed_in(olive, user=self.owner, **sign_args(name='Olive Owner', title='Owner'))
            self.assertFalse([m for m in TestHost.mails if 'signed copy' in m['subject']])
        self.assertEqual(len(mailed), 1)

        envelope.refresh_from_db()
        self.assertEqual(envelope.status, Envelope.SIGNED)
        data = TestHost.files[envelope.final_pdf_key]
        self.assertTrue(data.startswith(b'%PDF'))
        text = '\n'.join(page.extract_text() for page in PdfReader(io.BytesIO(data)).pages)
        for words in ('Signatures', 'Signing audit trail', envelope.body_sha256, 'Sam Sample', 'Cara Coowner',
                      'Olive Owner', 'I have read the duties list.', 'signed in to the dashboard'):
            self.assertIn(words, text)
        finals = [m for m in TestHost.mails if m['subject'].startswith('Acme Test Co: signed copy')]
        self.assertEqual({tuple(m['to']) for m in finals}, {('sam@example.test',), ('owner@example.test',)})
        self.assertEqual({m['attachments'][0][1] for m in finals}, {data})  # the same bytes to everyone
        kinds = list(envelope.events.values_list('kind', flat=True))
        self.assertEqual(kinds.count('signed'), 3)
        self.assertEqual(kinds[-2:], ['completed', 'emailed_final'])


class SigningRulesTests(EsignCase):
    def test_consent_every_statement_and_a_real_signature_are_needed(self):
        envelope, token = make_sent(self.owner)
        for bad in ({'consent': False}, {'acknowledgments': [True, False]}, {'acknowledgments': None},
                    {'signature': 'data:image/png;base64,AAAA'}, {'name': 'S'}):
            with self.assertRaises(ValidationError):
                services.sign_by_link(token, **sign_args(**bad))
        self.assertEqual(Envelope.objects.get(pk=envelope.pk).status, Envelope.OUT)

    def test_a_document_without_statements_needs_none(self):
        envelope, token = make_sent(self.owner, acknowledgments=[])
        services.sign_by_link(token, **sign_args(acknowledgments=None))
        self.assertEqual(Envelope.objects.get(pk=envelope.pk).status, Envelope.SIGNED)

    def test_changed_text_is_refused(self):
        envelope, token = make_sent(self.owner)
        Envelope.objects.filter(pk=envelope.pk).update(body_text=envelope.body_text + 'Extra words.')
        with self.assertRaises(ValidationError):
            services.sign_by_link(token, **sign_args())


class LinkTests(EsignCase):
    def test_a_link_works_once(self):
        _, token = make_sent(self.owner)
        services.sign_by_link(token, **sign_args())
        self.assertEqual(services.lookup(token)[1], services.LINK_USED)
        with self.assertRaises(services.LinkError):
            services.sign_by_link(token, **sign_args())

    def test_expired_replaced_voided_and_made_up_links(self):
        envelope, token = make_sent(self.owner)
        SigningLink.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(services.lookup(token)[1], services.LINK_EXPIRED)
        _, fresh, _ = services.resend(envelope, by=self.owner)
        self.assertEqual(services.lookup(token)[1], services.LINK_EXPIRED)
        self.assertEqual(services.lookup(fresh)[1], services.LINK_OK)
        services.void(envelope, by=self.owner, reason='Wrong start date')
        self.assertEqual(services.lookup(fresh)[1], services.LINK_VOID)
        self.assertEqual(services.lookup('x' * 30)[1], services.LINK_NONE)
        with self.assertRaises(ValidationError):
            services.void(envelope, by=self.owner, reason='again')

    def test_voiding_needs_a_reason(self):
        envelope, _ = make_sent(self.owner)
        with self.assertRaises(ValidationError):
            services.void(envelope, by=self.owner, reason=' ')


class ApiTests(EsignCase):
    def client_for(self, who):
        c = APIClient()
        c.force_authenticate(who)
        return c

    def test_the_sender_gets_the_link_only_when_it_was_not_emailed(self):
        """D22 § 2 rule 3: the link goes only to the signer's email; the sender is handed it only when that failed."""
        template = make_template(self.owner)
        owner = self.client_for(self.owner)

        def send(parties):
            made = owner.post('/esign/envelopes/', {'version': template.latest.pk, 'parties': parties,
                                                                   'values': VALUES}, format='json')
            return made.json()['id'], owner.post(f'/esign/envelopes/{made.json()["id"]}/send/').json()

        pk, out = send([OUTSIDER])  # emailed: no link, nothing handed over, and Send again the same
        self.assertNotIn('link', out)
        again = owner.post(f'/esign/envelopes/{pk}/send/').json()
        self.assertNotIn('link', again)
        self.assertTrue(again['emailed'])
        self.assertFalse(Envelope.objects.get(pk=pk).events.filter(kind='link_given').exists())

        pk, out = send([{'user_id': self.cara.pk}])  # no address: the sender hands the link over, and the audit says so
        self.assertTrue(out['link'].startswith('https://dash.example.test/sign?t='))
        given = Envelope.objects.get(pk=pk).events.get(kind='link_given')
        self.assertEqual(given.actor, 'Olive Owner')
        self.assertIn("was given Cara Coowner's link to hand over (no email address)", given.detail)

        with mock.patch.object(TestHost, 'send_mail', return_value=False):  # the mail failed: the same, Send again too
            pk, out = send([OUTSIDER])
            again = owner.post(f'/esign/envelopes/{pk}/send/').json()
        self.assertIn('link', out)
        self.assertNotEqual(again['link'], out['link'])  # a fresh link; the first one stops working
        details = list(Envelope.objects.get(pk=pk).events.filter(kind='link_given').values_list('detail', flat=True))
        self.assertEqual(len(details), 2)
        self.assertTrue(all('(the email could not be sent)' in d for d in details))

    def test_only_the_owner_manages_documents(self):
        template = make_template(self.owner)
        body = {'version': template.latest.pk, 'parties': self.three(), 'values': VALUES}
        self.assertEqual(self.client_for(self.cara).post('/esign/envelopes/', body, format='json').status_code, 403)
        made = self.client_for(self.owner).post('/esign/envelopes/', body, format='json')
        self.assertEqual(made.status_code, 201, made.content)
        sent = self.client_for(self.owner).post(f'/esign/envelopes/{made.json()["id"]}/send/')
        self.assertEqual(sent.status_code, 200, sent.content)
        self.assertNotIn('link', sent.json())  # emailed to Sam, so the sender never holds Sam's link
        self.assertEqual(sent.json()['waiting_on'], 'Sam Sample')
        self.assertEqual(APIClient().get('/esign/envelopes/').status_code, 401)

    def test_the_public_link_and_my_documents(self):
        envelope, token = make_sent(self.owner, parties=self.three())
        public = APIClient().get('/esign/public/document/', {'t': token}).json()
        self.assertEqual((public['ok'], public['acknowledgments'], public['others_after']), (True, ACKS, 2))
        signed = APIClient().post('/esign/public/sign/', {'t': token, **sign_args(ip=None, user_agent=None)}, format='json')
        self.assertEqual((signed.status_code, signed.json()['complete']), (200, False))
        self.assertEqual(APIClient().get('/esign/public/document/', {'t': token}).json()['state'], 'used')

        cara_party = envelope.parties.get(user=self.cara)
        mine = self.client_for(self.cara).get('/esign/mine/').json()
        self.assertEqual([(m['title'], m['my_turn']) for m in mine], [('Test Agreement', True)])
        self.assertEqual(self.client_for(self.stranger).get(f'/esign/mine/{cara_party.pk}/').status_code, 403)
        olive_party = envelope.parties.get(user=self.owner)
        waiting = self.client_for(self.owner).get(f'/esign/mine/{olive_party.pk}/').json()
        self.assertEqual(waiting['state'], 'waiting')
        done = self.client_for(self.cara).post(f'/esign/mine/{cara_party.pk}/sign/',
                                               sign_args(name='Cara Coowner', ip=None, user_agent=None), format='json')
        self.assertEqual(done.status_code, 200, done.content)
        self.client_for(self.owner).post(f'/esign/mine/{olive_party.pk}/sign/',
                                         sign_args(name='Olive Owner', ip=None, user_agent=None), format='json')
        pdf_url = f'/esign/envelopes/{envelope.pk}/pdf/'
        self.assertEqual(self.client_for(self.cara).get(pdf_url).status_code, 200)
        self.assertEqual(self.client_for(self.stranger).get(pdf_url).status_code, 403)


class SelfContainedTests(TestCase):
    def test_the_app_imports_nothing_from_the_host(self):
        root = pathlib.Path(services.__file__).parent
        found = []
        for path in root.rglob('*.py'):
            for line in path.read_text(encoding='utf-8').splitlines():
                m = re.match(r'\s*(?:from|import)\s+(apps\.[a-z_]+)', line)
                if m and m.group(1) != 'apps.esign':
                    found.append(f'{path.name}: {line.strip()}')
        self.assertEqual(found, [])

    def test_no_agpl_pdf_library(self):
        root = pathlib.Path(services.__file__).parent
        self.assertFalse(any('pymupdf' in p.read_text(encoding='utf-8') or 'import fitz' in p.read_text(encoding='utf-8')
                             for p in root.rglob('*.py') if p.name != 'test_esign.py'))
