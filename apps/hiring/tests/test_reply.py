"""Dash #192: Follow up / Not now on an applicant. The AI writes the email and a text from what staff typed; the
review edits it; it goes from our mailbox and our number and is logged. AI calls are mocked."""
from unittest import mock

from django.core import mail

from apps.hiring import ai
from apps.hiring.models import Application, HiringAiJob
from apps.hiring.tests.test_hiring import Base
from apps.texting.models import TextMessage

ANSWER = {
    'subject': 'About your application',
    'body': ('Hi Dana,\n\nThanks for applying. We have one store, at 8425 West Center Road, not at 24th and '
             'Pacific. Since you said you have no reliable way to get here, we will have to pass for now.\n\n'
             'Thanks,\nBill'),
    'text': 'Eco-Thrift: Thanks for applying, Dana. We have one store, at 84th and Center. Reply STOP to opt out.',
}
CONTEXT = 'some confusion: we only have 1 location. no transportation means we need to pass'


class ReplyTests(Base):
    def setUp(self):
        super().setUp()
        from apps.texting import service as texting

        for patcher in (mock.patch.object(ai, '_spawn', side_effect=ai._work),  # run inline
                        mock.patch.object(texting, 'PARKED', False)):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.turn_on()

    def make_app(self, **extra) -> Application:
        self.assertEqual(self.apply(**extra).status_code, 201)
        mail.outbox.clear()
        return Application.objects.order_by('-id').first()

    def draft(self, app, which='follow_up', answer=None, **extra):
        payload = {'which': which, 'context': CONTEXT, **extra}
        with mock.patch('apps.core.services.llm_router.llm_chat_tool_input',
                        return_value=(answer or ANSWER, 'claude-sonnet-5-5')) as llm:
            started = self.staff.post(f'/api/hiring/applications/{app.pk}/reply-draft/', payload, format='json')
        self.assertEqual(started.status_code, 202, started.data)
        job = self.staff.get(f'/api/hiring/ai/{started.data["id"]}/').data
        self.assertEqual(job['status'], 'done', job.get('error'))
        return started.data['id'], job['result'], llm

    def test_draft_uses_the_context_and_the_application(self):
        app = self.make_app()
        job_id, result, llm = self.draft(app)
        kwargs = llm.call_args.kwargs
        self.assertIn(CONTEXT, kwargs['user'])
        self.assertIn('Name: Dana Miles', kwargs['user'])
        self.assertIn('Role applied for: Retail Associate', kwargs['user'])
        self.assertIn('8425 West Center Road', kwargs['user'])  # store facts from the careers file
        self.assertEqual((kwargs['model_override'], kwargs['effort']), ('claude-sonnet-5-5', 'medium'))
        email = result['email']
        self.assertEqual((email['key'], email['to'], email['ai'], email['values']), ('follow_up', ['dana@example.com'], True, {}))
        # The AI's own "Thanks, Bill" is dropped; the sign-off is ours, with the name of whoever pressed the button.
        self.assertNotIn('Thanks,\nBill', email['body'])
        self.assertIn('Test Manager\nEco-Thrift\n8425 West Center Road', email['body'])
        self.assertNotIn('{', email['body'])
        self.assertEqual(HiringAiJob.objects.get(pk=job_id).kind, 'reply')

    def test_context_is_required_and_not_now_needs_a_reason(self):
        app = self.make_app()
        url = f'/api/hiring/applications/{app.pk}/reply-draft/'
        self.assertEqual(self.staff.post(url, {'which': 'follow_up', 'context': ' '}, format='json').status_code, 400)
        self.assertEqual(self.staff.post(url, {'which': 'not_now', 'context': 'x'}, format='json').status_code, 400)
        self.assertEqual(self.staff.post(url, {'which': 'other', 'context': 'x'}, format='json').status_code, 400)

    def test_follow_up_sends_the_edited_email_and_logs_it(self):
        app = self.make_app()
        job_id, result, _ = self.draft(app)
        body = result['email']['body'].replace('we will have to pass', 'we have to pass')
        response = self.staff.post(f'/api/hiring/applications/{app.pk}/follow-up/', {
            'ai_job': job_id, 'email': {'subject': result['email']['subject'], 'body': body},
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['sent'])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('we have to pass', mail.outbox[0].body)
        app.refresh_from_db()
        self.assertEqual(app.stage, 'new')  # a follow-up never moves the stage
        event = app.events.get(text='Emailed: Follow-up email (edited)')
        self.assertEqual((event.data['context'], event.data['ai']), (CONTEXT, True))

    def test_text_is_offered_only_with_consent(self):
        no_tick = self.make_app()
        _, result, _ = self.draft(no_tick)
        self.assertFalse(result['text']['allowed'])
        self.assertIn('did not tick', result['text']['note'])
        ticked = self.make_app(sms_consent='true', email='lee@example.com', phone='(402) 555-0199')
        job_id, result, _ = self.draft(ticked)
        self.assertTrue(result['text']['allowed'])
        self.assertEqual(result['text']['template'], ANSWER['text'])
        response = self.staff.post(f'/api/hiring/applications/{ticked.pk}/follow-up/', {
            'ai_job': job_id, 'email': {'skip': True}, 'text': {'body': ANSWER['text']},
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(mail.outbox), 0)
        message = TextMessage.objects.get(key='follow_up')
        self.assertEqual((message.status, message.phone), (TextMessage.STATUS_HELD, '4025550199'))
        self.assertTrue(ticked.events.filter(kind='text', text__startswith='Text held: Follow-up text').exists())
        # Without a tick, a text sent anyway is refused by texting.service (recorded as no consent, never held).
        self.staff.post(f'/api/hiring/applications/{no_tick.pk}/follow-up/', {
            'ai_job': self.draft(no_tick)[0], 'email': {'skip': True}, 'text': {'body': 'Eco-Thrift: hi'},
        }, format='json')
        self.assertEqual(TextMessage.objects.get(phone='4025550101', key='follow_up').status, TextMessage.STATUS_NO_CONSENT)

    def test_a_draft_for_another_applicant_is_refused(self):
        app = self.make_app()
        other = self.make_app(email='sam@example.com', phone='(402) 555-0123')
        job_id, result, _ = self.draft(other)
        response = self.staff.post(f'/api/hiring/applications/{app.pk}/follow-up/', {
            'ai_job': job_id, 'email': {'subject': 'x', 'body': 'y'},
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_not_now_with_the_ai_draft_moves_the_stage_and_logs(self):
        app = self.make_app(sms_consent='true')
        job_id, result, llm = self.draft(app, which='not_now', reason='must_have')
        self.assertIn('Missing a must-have', llm.call_args.kwargs['system'])
        email = result['email']
        response = self.staff.post(f'/api/hiring/applications/{app.pk}/not-now/', {
            'reason': 'must_have', 'note': 'No transportation', 'send': True, 'ai_job': job_id,
            'subject': email['subject'], 'body': email['body'], 'text': {'body': result['text']['template']},
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        app.refresh_from_db()
        self.assertEqual((app.stage, app.not_now_reason, app.not_now_note, app.not_now_email_status),
                         ('not_now', 'must_have', 'No transportation', 'sent'))
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('not at 24th and Pacific', mail.outbox[0].body)
        event = app.events.get(text='Emailed: Not now email')  # unedited: the AI's words as they were
        self.assertEqual((event.data['ai'], event.data['context']), (True, CONTEXT))
        self.assertTrue(TextMessage.objects.filter(key='not_now', status=TextMessage.STATUS_HELD).exists())

    def test_not_now_with_a_stale_draft_is_refused(self):
        app = self.make_app()
        response = self.staff.post(f'/api/hiring/applications/{app.pk}/not-now/', {
            'reason': 'must_have', 'send': True, 'ai_job': '00000000-0000-0000-0000-000000000000',
            'subject': 's', 'body': 'b',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        app.refresh_from_db()
        self.assertEqual(app.stage, 'new')
