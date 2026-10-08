"""Phase 6: applicant texts. Consent from the application's tick, held until texting is live, and on the review."""
from datetime import datetime, time, timedelta

from django.utils import timezone

from apps.hiring import careers, texts
from apps.hiring.models import Application, Job
from apps.hiring.tests.test_hiring import Base, _user
from apps.texting.models import TextConsent, TextMessage


class TextTests(Base):
    def setUp(self):
        super().setUp()
        self.carrie = _user('carrie@example.com', 'Manager')
        Job.objects.filter(slug='retail-associate').update(hiring_manager=self.manager)
        Job.objects.get(slug='retail-associate').interviewers.set([self.carrie])
        self.turn_on()

    def apply_with_tick(self, **extra):
        self.assertEqual(self.apply(sms_consent='true', **extra).status_code, 201)
        return Application.objects.order_by('-id').first()

    def open_time(self):
        from apps.hiring import interviews

        return interviews.open_times()[0][0].isoformat()

    def test_the_tick_records_consent_and_holds_the_confirmation(self):
        app = self.apply_with_tick()
        consent = TextConsent.objects.get(ref=f'hiring.application:{app.pk}')
        self.assertEqual((consent.phone, consent.kind, consent.opted_in, consent.wording_version),
                         ('4025550101', 'job', True, careers.SMS_CONSENT_VERSION))
        message = TextMessage.objects.get(key='opt_in')
        self.assertEqual((message.status, message.body), (TextMessage.STATUS_HELD, careers.OPT_IN_TEXT))
        self.assertTrue(app.events.filter(kind='text', text__startswith='Text held: Texts confirmation').exists())
        detail = self.staff.get(f'/api/hiring/applications/{app.pk}/').data
        self.assertEqual(detail['texting']['state'], 'agreed')
        self.assertTrue(detail['texting']['waiting_on'])

    def test_no_tick_no_texts(self):
        self.assertEqual(self.apply().status_code, 201)
        app = Application.objects.get()
        self.staff.post('/api/hiring/interviews/', {'application': app.pk, 'start': self.open_time()}, format='json')
        self.assertFalse(TextMessage.objects.exclude(status=TextMessage.STATUS_NO_CONSENT).exists())
        self.assertFalse(app.events.filter(kind='text').exists())

    def test_staff_booking_shows_the_text_and_holds_the_edited_words(self):
        app = self.apply_with_tick()
        payload = {'application': app.pk, 'start': self.open_time()}
        preview = self.staff.post('/api/hiring/interviews/', {**payload, 'preview': True}, format='json').data
        text = preview['text']
        self.assertEqual((text['key'], text['allowed'], text['live']), ('interview_booked', True, False))
        self.assertIn('{when}', text['template'])
        self.assertIn('held', text['note'])
        self.assertEqual(text['fields']['when'], 'Interview time')
        self.assertFalse(TextMessage.objects.filter(key='interview_booked').exists())  # a preview makes nothing
        body = text['template'].replace('{role}', 'Retail')
        response = self.staff.post('/api/hiring/interviews/', {**payload, 'text': {'body': body}}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        message = TextMessage.objects.get(key='interview_booked')
        self.assertEqual((message.status, message.edited), (TextMessage.STATUS_HELD, True))
        self.assertIn('Your interview for Retail is ', message.body)
        self.assertIn('/careers/interview?t=', message.body)  # linked value filled when it goes
        self.assertTrue(app.events.filter(text='Text held: Interview booked (texting not live yet) (edited)').exists())

    def test_no_text_this_time(self):
        app = self.apply_with_tick()
        payload = {'application': app.pk, 'start': self.open_time(), 'text': {'skip': True}}
        self.assertEqual(self.staff.post('/api/hiring/interviews/', payload, format='json').status_code, 201)
        self.assertFalse(TextMessage.objects.filter(key='interview_booked').exists())
        self.assertTrue(app.events.filter(text='Not texted: Interview booked (staff chose no text)').exists())

    def test_they_asked_not_to_be_texted(self):
        app = self.apply_with_tick()
        response = self.staff.post(f'/api/hiring/applications/{app.pk}/texts-stop/', {}, format='json')
        self.assertEqual(response.data['texting']['state'], 'stopped')
        self.staff.post('/api/hiring/interviews/', {'application': app.pk, 'start': self.open_time()}, format='json')
        self.assertEqual(TextMessage.objects.get(key='interview_booked').status, TextMessage.STATUS_OPTED_OUT)
        self.assertTrue(app.events.filter(text__startswith='Not texted: Interview booked (they asked').exists())

    def test_reminder_and_first_day_texts_go_once(self):
        from apps.hiring import interviews
        from apps.hiring.models import Interview, Onboarding

        app = self.apply_with_tick()
        soon = timezone.now() + timedelta(hours=20)
        Interview.objects.create(application=app, job=self.retail, start=soon, end=soon + timedelta(minutes=30))
        interviews.send_due_reminders()
        interviews.send_due_reminders()
        self.assertEqual(TextMessage.objects.filter(key='interview_reminder').count(), 1)

        tomorrow = timezone.localdate() + timedelta(days=1)
        onboarding = Onboarding.objects.create(user=self.carrie, application=app, start_date=tomorrow,
                                               start_time=time(9, 0), manager=self.manager)
        now = timezone.make_aware(datetime.combine(tomorrow - timedelta(days=1), time(12, 0)))
        self.assertEqual(texts.send_due_first_day(now=now), 1)
        self.assertEqual(texts.send_due_first_day(now=now), 0)
        message = TextMessage.objects.get(key='first_day')
        self.assertIn('9:00 AM', message.body)
        onboarding.refresh_from_db()
        self.assertIsNotNone(onboarding.first_day_text_at)

    def test_an_older_tick_gets_interview_texts_only_until_the_offer_page_tick(self):
        """T71: the 2026-10-06 wording does not cover the first day; the new tick on the offer page does."""
        from apps.hiring.models import Onboarding
        from apps.hiring.tests.test_hiring import _signature_data_url
        from apps.texting import service as texting

        self.assertEqual(self.apply().status_code, 201)
        app = Application.objects.get()
        texting.record_consent(app.phone, kind='job', opted_in=True, how='Online job application',
                               wording_version=careers.SMS_CONSENT_V1, ref=texts.ref(app))
        self.assertFalse(texts.consent_summary(app.phone)['first_day'])
        tomorrow = timezone.localdate() + timedelta(days=1)
        onboarding = Onboarding.objects.create(user=self.carrie, application=app, start_date=tomorrow,
                                               start_time=time(9, 0), manager=self.manager)
        noon = timezone.make_aware(datetime.combine(tomorrow - timedelta(days=1), time(12, 0)))
        texts.send_due_first_day(now=noon)
        first = TextMessage.objects.get(key='first_day')
        self.assertEqual(first.status, TextMessage.STATUS_NO_CONSENT)
        self.assertIn(careers.SMS_CONSENT_V1, first.reason)
        self.assertFalse(app.events.filter(text__contains='First-day reminder').exists())  # nothing to say

        made = self.staff.post(f'/api/hiring/applications/{app.pk}/offer/', {
            'pay_rate': '15.00', 'start_date': (timezone.localdate() + timedelta(days=6)).isoformat(),
            'employment_type': 'part_time', 'send': False}, format='json').data
        token = made['link'].split('t=')[1]
        page = self.public.get(f'/api/hiring/public/offer/?t={token}').data
        self.assertEqual(page['texts'], {'wording': careers.SMS_CONSENT_TEXT, 'phone_last4': '0101'})
        signed = self.public.post('/api/hiring/public/offer/sign/', {
            't': token, 'name': 'Dana Miles', 'signature': _signature_data_url(), 'acks': [True] * 4, 'consent': True,
            'texts_consent': True}, format='json')
        self.assertEqual(signed.status_code, 200, signed.data)
        self.assertIsNone(signed.data['texts'])  # covered now: the tick is not offered again
        self.assertTrue(texts.consent_summary(app.phone)['first_day'])
        self.assertTrue(app.events.filter(text='Agreed to texts about their first day (offer page)').exists())
        # a test onboarding with no checklist counts as done once refreshed: open it again for the second run
        Onboarding.objects.filter(pk=onboarding.pk).update(first_day_text_at=None, status=Onboarding.STATUS_ACTIVE)
        texts.send_due_first_day(now=noon)
        self.assertEqual(TextMessage.objects.filter(key='first_day').latest('id').status, TextMessage.STATUS_HELD)

    def test_only_opened_days_are_bookable_and_positions_narrow_them(self):
        """Interview times exist only where a manager opened them; an opening can be for some positions only."""
        from apps.hiring import interviews
        from apps.hiring.models import InterviewTime

        InterviewTime.objects.all().delete()
        self.assertEqual(self.apply().status_code, 201)
        app = Application.objects.get()
        self.assertEqual(interviews.open_times(application=app), [])  # nothing opened, nothing to book
        day = timezone.localdate() + timedelta(days=3)
        processing = Job.objects.get(slug='processing-associate')
        made = self.staff.post('/api/hiring/interview-days/', {
            'dates': [day.isoformat()], 'blocks': ['10:00', '10:30', '14:00'], 'jobs': [processing.pk]},
            format='json').data
        self.assertEqual(made['days'][day.isoformat()]['blocks'], ['10:00', '10:30', '14:00'])
        self.assertEqual(InterviewTime.objects.count(), 2)  # 10:00-11:00 and 14:00-14:30
        self.assertEqual(interviews.open_times(application=app), [])  # Dana applied for retail only
        self.staff.post('/api/hiring/interview-days/', {'dates': [day.isoformat()], 'blocks': ['10:00', '10:30'],
                                                        'jobs': []}, format='json')
        times = interviews.open_times(application=app)
        self.assertEqual([timezone.localtime(s).strftime('%H:%M') for s, _ in times], ['10:00', '10:30'])
        closed = self.staff.post('/api/hiring/interview-days/', {'dates': [day.isoformat()], 'blocks': []},
                                 format='json').data
        self.assertNotIn(day.isoformat(), closed['days'])
        past = self.staff.post('/api/hiring/interview-days/', {
            'dates': [(timezone.localdate() - timedelta(days=2)).isoformat()], 'blocks': ['10:00']}, format='json')
        self.assertEqual(past.status_code, 400)

    def test_texts_log_and_careers_checks(self):
        self.apply_with_tick()
        data = self.staff.get('/api/hiring/texts/').data
        self.assertEqual(data['counts'], {'held': 1})
        self.assertEqual(data['texts'][0]['applicant']['name'], 'Dana Miles')
        bad = careers.check_doc({'texts': {'interview_booked': 'Your interview is {when}.'}})
        self.assertFalse(bad['ok'])
        self.assertIn('Eco-Thrift:', bad['errors'][0])
        no_stop = careers.check_doc({'texts': {'interview_booked': 'Eco-Thrift: Your interview is {when}.'}})
        self.assertIn('STOP', no_stop['errors'][0])
        good = careers.check_doc({'texts': {'place': '8425 W Center', 'interview_booked': 'Eco-Thrift: See you {when}. Reply STOP to opt out.'}})
        self.assertTrue(good['ok'], good['errors'])
        self.assertEqual(careers.summarize_changes(careers.export_doc(), good['doc']),
                         ['Texts: place changes', 'Texts: interview booked changes'])
