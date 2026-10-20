"""Texting (house standard texting.md): consent records, the words, and held until live. Phase 4 (owner 2026-10-20):
sign-in texts from our own number, the stop list, and the STOP / HELP webhook. Twilio is mocked: nothing real is texted."""
import base64
import hashlib
import hmac
from unittest import mock

from django.test import Client, TestCase, override_settings

from apps.core.models import AppSetting
from apps.texting import service
from apps.texting.models import TextConsent, TextMessage


class WordsAndNumbersTests(TestCase):
    def test_numbers(self):
        self.assertEqual(service.digits('(402) 555-0101'), '4025550101')
        self.assertEqual(service.digits('+1 402 555 0101'), '4025550101')
        self.assertEqual(service.digits('555-0101'), '')
        self.assertEqual(service.masked('4025550101'), '***-***-0101')

    def test_every_text_names_the_sender_and_says_how_to_stop(self):
        self.assertEqual(service.shape('Your interview is Wed.'), 'Eco-Thrift: Your interview is Wed. Reply STOP to opt out.')
        kept = 'Eco-Thrift: Hi. Reply HELP for help, STOP to cancel.'
        self.assertEqual(service.shape(kept), kept)
        # "stop by" is not a way to stop texts
        self.assertTrue(service.shape('Eco-Thrift: Stop by the store.').endswith('Reply STOP to opt out.'))


class ConsentAndSendTests(TestCase):
    PHONE = '402-555-0101'

    def send(self, **extra):
        return service.send(phone=self.PHONE, kind='job', key='interview_booked', body='Your interview is Wed.',
                            ref='hiring.application:1', **extra)

    def test_no_consent_no_text(self):
        self.assertEqual(self.send().status, TextMessage.STATUS_NO_CONSENT)

    def test_held_until_live_and_stop_ends_every_kind(self):
        service.record_consent(self.PHONE, kind='job', opted_in=True, how='Online job application')
        held = self.send()
        self.assertEqual(held.status, TextMessage.STATUS_HELD)
        self.assertIn('texting is parked', held.reason)
        self.assertIn('Twilio key', held.reason)
        self.assertTrue(held.body.startswith('Eco-Thrift: '))
        service.record_stop(self.PHONE)
        stopped = self.send()
        self.assertEqual((stopped.status, stopped.reason), (TextMessage.STATUS_OPTED_OUT, 'Replied STOP'))
        # Opting back in (a new tick) wins over the older STOP.
        service.record_consent(self.PHONE, kind='job', opted_in=True, how='Online job application')
        self.assertEqual(self.send().status, TextMessage.STATUS_HELD)
        self.assertEqual(TextConsent.objects.filter(phone='4025550101').count(), 3)

    def test_each_kind_is_its_own_tick_and_stop_ends_them_all(self):
        """Thrift+ (T59): account texts and store news are separate ticks from job texts; STOP ends every kind."""
        service.record_consent(self.PHONE, kind='thriftplus', opted_in=True, how='In person at the register',
                               ref='thriftplus.person:1')
        self.assertTrue(service.may_text(self.PHONE, 'thriftplus'))
        self.assertFalse(service.may_text(self.PHONE, 'news'))
        self.assertFalse(service.may_text(self.PHONE, 'job'))
        service.record_consent(self.PHONE, kind='news', opted_in=True, how='In person at the register')
        service.record_stop(self.PHONE)
        self.assertFalse(service.may_text(self.PHONE, 'thriftplus'))
        self.assertFalse(service.may_text(self.PHONE, 'news'))
        self.assertEqual(TextConsent.KIND_THRIFTPLUS, 'thriftplus')

    def test_practice_and_missing_numbers_never_text(self):
        service.record_consent(self.PHONE, kind='job', opted_in=True, how='Online job application')
        self.assertEqual(self.send(practice=True).status, TextMessage.STATUS_PRACTICE)
        self.assertEqual(service.send(phone='', kind='job', key='x', body='Hi').status, TextMessage.STATUS_NO_NUMBER)

    @override_settings(DEBUG=False)
    def test_live_sends_the_opt_in_confirmation_first(self):
        service.record_consent(self.PHONE, kind='job', opted_in=True, how='Online job application')
        AppSetting.objects.create(key=service.LIVE_SETTING, value=True)
        keys = {name: 'x' for name in (*service.TWILIO_KEYS, 'TWILIO_MESSAGING_SERVICE_SID')}
        with mock.patch.object(service, 'WIRED', True), mock.patch.object(service, 'PARKED', False), \
                mock.patch.object(service, 'config', side_effect=lambda name, default='': keys.get(name, default)), \
                mock.patch.object(service, '_deliver', return_value=(True, 'SM123', '')) as deliver:
            self.assertEqual(service.waiting_on(), [])
            message = self.send(first_text='Eco-Thrift: You will get texts. Reply STOP to cancel.')
            self.send(first_text='Eco-Thrift: You will get texts. Reply STOP to cancel.')
        self.assertEqual(message.status, TextMessage.STATUS_SENT)
        self.assertEqual([c.args[1][:30] for c in deliver.call_args_list][:2],
                         ['Eco-Thrift: You will get texts', 'Eco-Thrift: Your interview is '])
        self.assertEqual(TextMessage.objects.filter(key='opt_in', status='sent').count(), 1)  # once only
        self.assertEqual(deliver.call_count, 3)

    def test_dev_never_texts(self):
        with override_settings(DEBUG=True):
            self.assertIn('production (dev never texts)', service.waiting_on())


class EmailConsentTests(TestCase):
    """T73: the shared email consent store (Thrift+ sign-up boxes); texting is parked (D20)."""

    def test_record_state_and_unsubscribe(self):
        self.assertEqual(service.normalize_email('  Dana@Example.COM '), 'dana@example.com')
        self.assertEqual(service.normalize_email('not an email'), '')
        self.assertIsNone(service.record_email_consent('nope', kind='news', opted_in=True, how='test'))
        self.assertFalse(service.may_email('dana@example.com', 'news'))  # no row, no mail
        service.record_email_consent('Dana@Example.com', kind='news', opted_in=True, how='Thrift+ sign-up',
                                     wording_version='news-email-2026-10-08', ref='thriftplus.person:1')
        self.assertTrue(service.may_email('dana@example.com', 'news'))
        self.assertFalse(service.may_email('dana@example.com', 'thriftplus'))
        service.record_email_consent('dana@example.com', kind='all', opted_in=False, how='Unsubscribe link')
        self.assertFalse(service.may_email('dana@example.com', 'news'))
        self.assertEqual(service.email_consent_state('dana@example.com', 'news').kind, 'all')

    def test_texting_is_parked(self):
        self.assertTrue(service.PARKED)
        self.assertIn('texting is parked (email first, D20)', service.waiting_on())
        self.assertFalse(service.live())


class SenderTests(TestCase):
    """The send step to Twilio (Messages API through the Messaging Service) and its gates."""

    ENV = {'TWILIO_ACCOUNT_SID': 'ACx', 'TWILIO_API_KEY': 'SKx', 'TWILIO_API_SECRET': 'secret',
           'TWILIO_MESSAGING_SERVICE_SID': 'MGx'}

    def config(self, env):
        return mock.patch.object(service, 'config', side_effect=lambda name, default='': env.get(name, default))

    def test_the_sender_needs_the_key_and_a_service_or_a_number(self):
        with self.config({}):
            self.assertFalse(service.sender_configured())
        with self.config({k: v for k, v in self.ENV.items() if k != 'TWILIO_MESSAGING_SERVICE_SID'}):
            self.assertFalse(service.sender_configured())
        with self.config({**{k: v for k, v in self.ENV.items() if k != 'TWILIO_MESSAGING_SERVICE_SID'},
                          'TWILIO_FROM_NUMBER': '+18888127905'}):
            self.assertTrue(service.sender_configured())
        with self.config(self.ENV):
            self.assertTrue(service.sender_configured())

    def test_dev_and_tests_never_reach_twilio(self):
        with self.config(self.ENV), mock.patch('requests.post') as post:
            self.assertFalse(service.sender_ready())  # a test run
            self.assertEqual(service._deliver('4028675309', 'Eco-Thrift: hi')[0], False)
            with override_settings(DEBUG=True, RUNNING_TESTS=False):
                self.assertFalse(service.sender_ready())
            post.assert_not_called()

    def test_production_posts_to_the_messaging_service(self):
        answer = mock.Mock(status_code=201)
        answer.json.return_value = {'sid': 'SM123'}
        with self.config(self.ENV), override_settings(DEBUG=False, RUNNING_TESTS=False), \
                mock.patch('requests.post', return_value=answer) as post:
            self.assertTrue(service.sender_ready())
            self.assertEqual(service._deliver('4028675309', 'Eco-Thrift: hi'), (True, 'SM123', ''))
        args, kwargs = post.call_args
        self.assertIn('/Accounts/ACx/Messages.json', args[0])
        self.assertEqual(kwargs['data'], {'To': '+14028675309', 'Body': 'Eco-Thrift: hi', 'MessagingServiceSid': 'MGx'})
        self.assertEqual(kwargs['auth'], ('SKx', 'secret'))

    def test_without_a_service_it_sends_from_the_number(self):
        env = {k: v for k, v in self.ENV.items() if k != 'TWILIO_MESSAGING_SERVICE_SID'}
        env['TWILIO_FROM_NUMBER'] = '+18888127905'
        with self.config(env), override_settings(DEBUG=False, RUNNING_TESTS=False), \
                mock.patch('requests.post', return_value=mock.Mock(status_code=201, json=lambda: {})) as post:
            service._deliver('4028675309', 'Eco-Thrift: hi')
        self.assertEqual(post.call_args.kwargs['data']['From'], '+18888127905')
        self.assertNotIn('MessagingServiceSid', post.call_args.kwargs['data'])

    def test_a_refusal_is_an_error_not_a_crash(self):
        with self.config(self.ENV), override_settings(DEBUG=False, RUNNING_TESTS=False), \
                mock.patch('requests.post', return_value=mock.Mock(status_code=400)):
            sent, _, error = service._deliver('4028675309', 'Eco-Thrift: hi')
        self.assertFalse(sent)
        self.assertIn('400', error)
        self.assertNotIn('secret', error)


class StopListTests(TestCase):
    PHONE = '4028675309'

    def test_stop_ends_every_kind_and_start_or_a_new_tick_brings_it_back(self):
        self.assertFalse(service.stopped(self.PHONE))
        service.record_stop(self.PHONE)
        self.assertTrue(service.stopped(self.PHONE))
        self.assertTrue(service.stopped('(402) 867-5309'))  # any format
        service.record_consent(self.PHONE, kind='all', opted_in=True, how='Replied START')
        self.assertFalse(service.stopped(self.PHONE))
        service.record_stop(self.PHONE)
        service.record_consent(self.PHONE, kind='thriftplus', opted_in=True, how='Staff: they asked')
        self.assertFalse(service.stopped(self.PHONE))

    def test_a_stopped_number_is_not_sent_a_sign_in_text(self):
        service.record_stop(self.PHONE)
        with mock.patch.object(service, '_deliver') as deliver:
            message = service.send_sign_in_text(phone=self.PHONE, key='sign_in_code', body='Eco-Thrift: code 123456')
        deliver.assert_not_called()
        self.assertEqual(message.status, TextMessage.STATUS_OPTED_OUT)
        self.assertNotIn('123456', message.body)

    def test_a_sign_in_text_needs_no_consent_row_only_no_stop(self):
        with mock.patch.object(service, '_deliver', return_value=(True, 'SM1', '')) as deliver:
            message = service.send_sign_in_text(phone=self.PHONE, key='sign_in_code', body='Eco-Thrift: code 123456')
        deliver.assert_called_once()
        self.assertEqual((message.status, message.provider_id), (TextMessage.STATUS_SENT, 'SM1'))
        self.assertEqual(service.send_sign_in_text(phone='', key='sign_in_code', body='x').status,
                         TextMessage.STATUS_NO_NUMBER)

    def test_a_send_that_blows_up_is_recorded_not_raised(self):
        with mock.patch.object(service, '_deliver', side_effect=RuntimeError('boom')):
            message = service.send_sign_in_text(phone=self.PHONE, key='sign_in_link', body='Eco-Thrift: link')
        self.assertEqual(message.status, TextMessage.STATUS_FAILED)


class InboundWebhookTests(TestCase):
    """Twilio posts a reply to /api/texting/inbound/: STOP, HELP (the submitted help text), START."""

    PHONE = '4028675309'
    URL = '/api/texting/inbound/'

    def post(self, body, token='', signed=False, sender='+14028675309'):
        data = {'From': sender, 'Body': body, 'To': '+18888127905'}
        extra = {}
        env = {'TWILIO_AUTH_TOKEN': token} if token else {}
        if signed:
            text = 'https://testserver' + self.URL + ''.join(f'{k}{data[k]}' for k in sorted(data))
            extra['HTTP_X_TWILIO_SIGNATURE'] = base64.b64encode(
                hmac.new(token.encode(), text.encode(), hashlib.sha1).digest()).decode()
        with mock.patch('apps.texting.views.config', side_effect=lambda name, default='': env.get(name, default)):
            return Client().post(self.URL, data, secure=True, **extra)

    def test_help_answers_the_submitted_text_and_changes_nothing(self):
        r = self.post('help')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'text/xml')
        text = r.content.decode()
        self.assertIn('<Message>Eco-Thrift: These texts are Thrift+ sign-in codes and links you asked for. Help: call '
                      '(402) 881-9861 or visit ecothrift.us/terms. Msg &amp; data rates may apply. Reply STOP to opt out.'
                      '</Message>', text)
        self.assertEqual(service.HELP_REPLY, 'Eco-Thrift: These texts are Thrift+ sign-in codes and links you asked '
                         'for. Help: call (402) 881-9861 or visit ecothrift.us/terms. Msg & data rates may apply. '
                         'Reply STOP to opt out.')
        self.assertFalse(TextConsent.objects.exists())

    def test_stop_puts_the_number_on_the_stop_list_in_any_case_and_spacing(self):
        for word in ('STOP', ' stop ', 'Stop.', 'UNSUBSCRIBE', 'cancel', 'QUIT'):
            TextConsent.objects.all().delete()
            r = self.post(word)
            self.assertEqual(r.status_code, 200)
            self.assertNotIn('<Message>', r.content.decode())  # Twilio sends the carriers' confirmation
            self.assertTrue(service.stopped(self.PHONE), word)
        self.assertEqual(TextConsent.objects.get().how, 'Replied STOP')

    def test_other_words_do_nothing(self):
        for word in ('Stop by the store', 'thanks', ''):
            r = self.post(word)
            self.assertEqual(r.status_code, 200)
        self.assertFalse(service.stopped(self.PHONE))
        self.assertFalse(TextConsent.objects.exists())

    def test_start_is_ignored_unless_twilio_signed_it(self):
        service.record_stop(self.PHONE)
        self.post('START')
        self.assertTrue(service.stopped(self.PHONE))  # no token to check with: not trusted
        self.post('START', token='tok', signed=True)
        self.assertFalse(service.stopped(self.PHONE))

    def test_with_a_token_an_unsigned_or_badly_signed_post_is_refused(self):
        self.assertEqual(self.post('STOP', token='tok').status_code, 403)
        self.assertFalse(service.stopped(self.PHONE))
        self.assertEqual(self.post('STOP', token='tok', signed=True).status_code, 200)
        self.assertTrue(service.stopped(self.PHONE))

    def test_a_get_or_a_bad_number_is_harmless(self):
        self.assertEqual(Client().get(self.URL).status_code, 405)
        self.assertEqual(self.post('STOP', sender='abc').status_code, 200)
        self.assertFalse(TextConsent.objects.exists())
