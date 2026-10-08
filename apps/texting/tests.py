"""Texting (house standard texting.md): consent records, the words, and held until live."""
from unittest import mock

from django.test import TestCase, override_settings

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
        self.assertIn('send step to Twilio', held.reason)
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
        keys = {name: 'x' for name in service.TWILIO_KEYS}
        with mock.patch.object(service, 'WIRED', True), \
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
