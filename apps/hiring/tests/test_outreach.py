"""Reaching applicants (owner 2026-10-12): Initial and Reminder by email and by text; texts sent by hand."""
from datetime import timedelta

from django.core import mail
from django.utils import timezone

from apps.hiring import outreach
from apps.hiring.models import Application, Job
from apps.hiring.tests.test_hiring import Base, _user


class _Applied(Base):
    """One applicant, Thrift+ hiring on, mail cleared."""

    def setUp(self):
        super().setUp()
        from apps.hiring.models import Interview

        self.Interview = Interview
        self.carrie = _user('carrie@example.com', 'Manager')
        Job.objects.filter(slug='retail-associate').update(hiring_manager=self.manager)
        Job.objects.get(slug='retail-associate').interviewers.set([self.carrie])
        self.turn_on()
        self.apply()
        self.app = Application.objects.get()
        mail.outbox.clear()

    def row(self):
        rows = self.staff.get('/api/hiring/applications/').data
        rows = rows['results'] if isinstance(rows, dict) else rows
        return next(r for r in rows if r['id'] == self.app.pk)


class OutreachTests(_Applied):
    def test_a_new_applicant_has_the_email_and_the_text_due(self):
        steps = self.row()['outreach']
        self.assertTrue(steps['email_initial']['due'])
        self.assertTrue(steps['text_initial']['due'])
        self.assertFalse(steps['text_reminder']['due'])
        self.assertEqual(self.row()['returning'], {'worked_here': False, 'interviewed_before': False})

    def test_the_interview_email_counts_and_the_reminder_goes_by_itself_a_day_later(self):
        self.staff.post(f'/api/hiring/applications/{self.app.pk}/invite/', {'send': True}, format='json')
        self.app.refresh_from_db()
        self.assertIsNotNone(self.app.invite_emailed_at)
        steps = self.row()['outreach']
        self.assertFalse(steps['email_initial']['due'])
        self.assertIsNotNone(steps['email_reminder']['auto_at'])
        mail.outbox.clear()
        self.assertEqual(outreach.send_due_email_reminders(), 0)  # not a day yet
        later = timezone.now() + timedelta(days=1, minutes=1)
        self.assertEqual(outreach.send_due_email_reminders(now=later), 1)
        self.assertIn("Don't miss out", mail.outbox[0].subject)
        self.app.refresh_from_db()
        self.assertIsNotNone(self.app.reminder_emailed_at)
        self.assertEqual(outreach.send_due_email_reminders(now=later), 0)  # once

    def test_no_reminder_once_they_book(self):
        token = self.staff.post(f'/api/hiring/applications/{self.app.pk}/invite/', {'send': True}, format='json').data['link'].split('t=')[1]
        start = self.public.get(f'/api/hiring/public/interview/?t={token}').data['times'][0]['start']
        self.public.post(f'/api/hiring/public/interview/?t={token}', {'start': start}, format='json')
        mail.outbox.clear()
        self.assertEqual(outreach.send_due_email_reminders(now=timezone.now() + timedelta(days=2)), 0)
        steps = self.row()['outreach']
        self.assertFalse(steps['text_initial']['due'])  # booked: nothing is due

    def test_the_text_is_copied_then_marked_sent_and_the_reminder_is_due_a_day_later(self):
        draft = self.staff.post(f'/api/hiring/applications/{self.app.pk}/text-draft/', {'which': 'initial'}, format='json')
        self.assertEqual(draft.status_code, 200, draft.data)
        self.assertEqual(draft.data['phone'], self.app.phone)
        self.assertIn('/i/', draft.data['body'])
        self.assertLessEqual(len(draft.data['body']), outreach.SMS_LIMIT)
        sent = self.staff.post(f'/api/hiring/applications/{self.app.pk}/text-sent/',
                               {'which': 'initial', 'body': draft.data['body']}, format='json')
        self.assertEqual(sent.status_code, 200, sent.data)
        self.app.refresh_from_db()
        self.assertIsNotNone(self.app.invite_texted_at)
        self.assertEqual(self.app.stage, 'contacted')
        event = self.app.events.get(kind='text')
        self.assertEqual(event.data['status'], 'sent_by_hand')
        self.assertEqual(event.data['body'], draft.data['body'])
        self.assertFalse(self.row()['outreach']['text_reminder']['due'])
        Application.objects.filter(pk=self.app.pk).update(invite_texted_at=timezone.now() - timedelta(days=1, minutes=1))
        self.assertTrue(self.row()['outreach']['text_reminder']['due'])

    def test_no_text_to_a_number_that_asked_to_stop(self):
        from apps.texting import service as texting

        texting.record_stop(self.app.phone)
        self.assertFalse(self.row()['outreach']['text_initial']['due'])
        refused = self.staff.post(f'/api/hiring/applications/{self.app.pk}/text-draft/', {'which': 'initial'}, format='json')
        self.assertEqual(refused.status_code, 400)

    def test_returning_applicants_show_worked_here_and_interviewed_before(self):
        from apps.accounts.models import EmployeeProfile, User

        earlier = Application.objects.create(first_name='Pat', email=self.app.email, phone=self.app.phone,
                                             phone_digits=self.app.phone_digits)
        Application.objects.filter(pk=earlier.pk).update(created_at=self.app.created_at - timedelta(days=90))
        start = timezone.now() - timedelta(days=80)
        self.Interview.objects.create(application=earlier, start=start, end=start + timedelta(minutes=20), status='done')
        user = User.objects.create_user(email=self.app.email.upper(), first_name='Pat', last_name='X', password='x-pass-123')
        EmployeeProfile.objects.create(user=user, hire_date=timezone.localdate() - timedelta(days=400))
        self.assertEqual(self.row()['returning'], {'worked_here': True, 'interviewed_before': True})

    def test_scorecard_autosaves_write_no_history_line_close_writes_one(self):
        token = self.staff.post(f'/api/hiring/applications/{self.app.pk}/invite/', {'send': True}, format='json').data['link'].split('t=')[1]
        start = self.public.get(f'/api/hiring/public/interview/?t={token}').data['times'][0]['start']
        self.public.post(f'/api/hiring/public/interview/?t={token}', {'start': start}, format='json')
        interview = self.Interview.objects.get(application=self.app)
        url = f'/api/hiring/interviews/{interview.pk}/scorecard/'
        before = self.app.events.count()
        for note in ('Good', 'Good with people'):
            self.assertEqual(self.staff.post(url, {'notes': note, 'autosave': True}, format='json').status_code, 200)
        self.assertEqual(self.app.events.count(), before)  # typing writes no history
        interview.refresh_from_db()
        self.assertEqual(interview.scorecard['notes'], 'Good with people')
        self.staff.post(url, {'notes': 'Good with people'}, format='json')  # Close
        self.assertEqual(self.app.events.filter(text='Scorecard saved').count(), 1)
        self.staff.post(url, {'notes': 'Good with people', 'overall': 'hire', 'done': True}, format='json')  # Mark done
        interview.refresh_from_db()
        self.assertEqual(interview.status, 'done')


class QuestionsAiTests(Base):
    """Interview questions (owner 2026-10-12): the AI reviews the whole list; each item comes back keep / edit / new."""

    def setUp(self):
        super().setUp()
        from unittest import mock

        from apps.hiring import ai
        patcher = mock.patch.object(ai, '_spawn', side_effect=ai._work)  # run inline in tests
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_review_marks_each_question_and_lists_the_dropped_ones(self):
        from unittest import mock

        questions = [{'key': 'hard_customer', 'label': 'Tell me about a hard customer.'},
                     {'key': 'why_us', 'label': 'Why us?'},
                     {'key': 'lift', 'label': 'Can you lift 50 pounds?'}]
        answer = {'questions': [
            {'key': 'hard_customer', 'label': 'Tell me about a hard customer.'},
            {'key': 'why_us', 'label': 'What makes Eco-Thrift a place you want to work?', 'why': 'Too short'},
            {'key': '', 'label': 'How would you sort a cart of mixed donations?', 'why': 'Real work'},
        ], 'removed': [{'key': 'lift', 'why': 'Yes or no'}], 'summary': 'Tightened.'}
        with mock.patch('apps.core.services.llm_router.llm_chat_tool_input', return_value=(answer, 'test-model')) as llm:
            started = self.staff.post('/api/hiring/ai/', {'kind': 'questions', 'action': 'review', 'questions': questions,
                                                          'role': {'title': 'Retail Associate'}}, format='json')
        self.assertEqual(started.status_code, 202, started.data)
        result = self.staff.get(f'/api/hiring/ai/{started.data["id"]}/').data
        self.assertEqual(result['status'], 'done', result)
        self.assertEqual([q['change'] for q in result['result']['questions']], ['keep', 'edit', 'new'])
        self.assertEqual(result['result']['questions'][1]['was'], 'Why us?')
        self.assertEqual(result['result']['removed'], [{'key': 'lift', 'label': 'Can you lift 50 pounds?', 'why': 'Yes or no'}])
        self.assertEqual(llm.call_args.kwargs['tool_name'], 'propose_interview_questions')
        self.assertIn('hard_customer: Tell me about a hard customer.', llm.call_args.kwargs['user'])


class ReminderRuleTests(_Applied):
    """Owner 2026-10-12: "Don't miss out" goes 24 hours after they apply, never later; in-flight ones by hand."""

    def test_it_goes_24_hours_after_applying_and_never_late(self):
        self.staff.post(f'/api/hiring/applications/{self.app.pk}/invite/', {'send': True}, format='json')
        self.app.refresh_from_db()
        self.assertEqual(self.row()['outreach']['email_reminder']['auto_at'], self.app.created_at + timedelta(hours=24))
        mail.outbox.clear()
        self.assertEqual(outreach.send_due_email_reminders(now=self.app.created_at + timedelta(hours=49)), 0)  # too late
        self.assertEqual(outreach.send_due_email_reminders(now=self.app.created_at + timedelta(hours=23)), 0)  # too soon
        self.assertEqual(outreach.send_due_email_reminders(now=self.app.created_at + timedelta(hours=25)), 1)

    def test_applications_from_before_it_went_live_get_theirs_by_hand(self):
        Application.objects.filter(pk=self.app.pk).update(created_at=outreach.AUTO_REMINDER_FROM - timedelta(hours=2))
        self.staff.post(f'/api/hiring/applications/{self.app.pk}/invite/', {'send': True}, format='json')
        self.app.refresh_from_db()
        self.assertIsNone(self.row()['outreach']['email_reminder']['auto_at'])
        mail.outbox.clear()
        self.assertEqual(outreach.send_due_email_reminders(now=outreach.AUTO_REMINDER_FROM + timedelta(hours=23)), 0)


class ShortLinkTests(_Applied):
    """Owner 2026-10-12: an applicant couldn't open the link in a long text. One message, a short link."""

    def setUp(self):
        super().setUp()
        from django.core.cache import cache

        cache.clear()

    def draft(self, which='initial'):
        return self.staff.post(f'/api/hiring/applications/{self.app.pk}/text-draft/', {'which': which}, format='json').data

    def test_the_short_link_leads_to_the_booking_page(self):
        body = self.draft()['body']
        self.app.refresh_from_db()
        code = self.app.booking_code
        self.assertEqual(len(code), 7)
        self.assertIn(f'/i/{code} (or reply with a good time)', body)
        self.assertTrue(body.startswith(f"Hi {self.app.first_name}, it's Eco-Thrift! Book your Retail Associate interview:"))
        response = self.client.get(f'/i/{code}')
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response['Location'].endswith(f'/careers/interview?t={self.app.booking_token}'))
        self.assertEqual(self.draft('reminder')['body'].count(code), 1)  # the same code every time
        self.app.refresh_from_db()
        self.assertEqual(self.app.booking_code, code)

    def test_both_texts_fit_one_message_even_with_long_names(self):
        link = 'https://ecothrift.us/i/abcdefg'
        for which in ('initial', 'reminder'):
            normal = outreach.hand_text(which, first_name='Angie', role='Retail Associate', link=link)
            self.assertLessEqual(len(normal), outreach.SMS_LIMIT)
            self.assertIn('Retail Associate', normal)
            long = outreach.hand_text(which, first_name='Maximiliana-Josefina', role='Donation Processing and Pricing Lead Associate', link=link)
            self.assertLessEqual(len(long), outreach.SMS_LIMIT)
            self.assertNotIn('Donation', long)  # the role drops out instead of going over
            self.assertEqual(outreach.hand_text(which, first_name='Angie', role='', link=link).count('interview'), 1)

    def test_a_wrong_or_closed_code_lands_on_the_expired_note_and_guessing_stops(self):
        self.draft()
        self.app.refresh_from_db()
        Application.objects.filter(pk=self.app.pk).update(stage=Application.STAGE_NOT_NOW)
        closed = self.client.get(f'/i/{self.app.booking_code}')
        self.assertTrue(closed['Location'].endswith('/careers/interview?t=expired'))
        from apps.hiring.public_views import SHORT_MISSES_PER_HOUR

        for _ in range(SHORT_MISSES_PER_HOUR):
            self.client.get('/i/zzzzzzz')
        self.assertEqual(self.client.get('/i/zzzzzzz').status_code, 429)
