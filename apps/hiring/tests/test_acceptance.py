"""The initiative's standing promises (hiring_onboarding § Acceptance), each pinned by a test."""
import json
from datetime import timedelta
from unittest import mock

from django.core import mail
from django.utils import timezone

from apps.hiring import careers, services
from apps.hiring.models import Application, ApplicationEvent
from apps.hiring.tests.test_hiring import GOOD_ANSWERS, Base


class NoSecretNumbersTests(Base):
    """No SSN, bank or routing numbers are stored."""

    def test_typed_numbers_shaped_like_secrets_are_masked(self):
        self.assertEqual(services.scrub('SSN 123-45-6789, 123 45 6789, routing 123456789, acct 123456789012'),
                         'SSN [number removed], [number removed], routing [number removed], acct [number removed]')
        # a phone, a ZIP+4, a date and a pay rate are left alone
        kept = 'Call 402-555-0101 or 4025550101, ZIP 68124-1234, start 2026-10-19, $16.50'
        self.assertEqual(services.scrub(kept), kept)

    def test_answers_and_notes_never_keep_them(self):
        self.turn_on()
        answers = {**GOOD_ANSWERS, 'why_us': 'My SSN is 123-45-6789 if you need it.'}
        self.assertEqual(self.apply(answers=answers).status_code, 201)
        app = Application.objects.get()
        why = next(a for a in app.answers if a['key'] == 'why_us')
        self.assertEqual(why['answer'], 'My SSN is [number removed] if you need it.')
        self.staff.post(f'/api/hiring/applications/{app.pk}/note/', {'text': 'Routing 123456789 for payroll'},
                        format='json')
        self.assertTrue(app.events.filter(kind='note', text='Routing [number removed] for payroll').exists())
        self.assertFalse(app.events.filter(text__contains='123456789').exists())

    def test_the_careers_file_refuses_questions_that_ask_for_them(self):
        for label in ('What is your Social Security number?', 'Bank account for direct deposit',
                      "Driver's license number"):
            doc = careers.export_doc()
            doc['form']['questions'] = doc['form']['questions'] + [{'label': label, 'type': 'text'}]
            result = careers.check_doc(doc)
            self.assertFalse(result['ok'], label)
            self.assertIn('never stores', ' '.join(result['errors']))


class PeopleDecideTests(Base):
    """No applicant is moved or rejected by AI; no Not now email sends without a person pressing Send."""

    def setUp(self):
        super().setUp()
        self.turn_on()
        self.apply()
        self.app = Application.objects.get()
        mail.outbox.clear()

    def test_an_ai_edit_saves_nothing_and_moves_no_one(self):
        from apps.hiring import ai

        doc = careers.export_doc()
        doc['page']['headline'] = 'AI wrote this'
        before_events = self.app.events.count()
        with mock.patch.object(ai, '_spawn', side_effect=ai._work), \
                mock.patch('apps.core.services.llm_router.llm_chat_text', return_value=(json.dumps(doc), 'test')):
            started = self.staff.post('/api/hiring/ai/', {'kind': 'careers', 'request': 'Punch up the headline'},
                                      format='json')
        result = self.staff.get(f'/api/hiring/ai/{started.data["id"]}/').data
        self.assertEqual(result['status'], 'done', result)
        self.assertIn('Page: headline changes', result['result']['changes'])  # a draft to review
        self.assertNotEqual(careers.load_setting()['page']['headline'], 'AI wrote this')  # nothing saved
        self.app.refresh_from_db()
        self.assertEqual((self.app.stage, self.app.events.count()), ('new', before_events))

    def test_not_now_email_needs_a_person_to_press_send(self):
        from apps.hiring import offers

        made = self.staff.post(f'/api/hiring/applications/{self.app.pk}/offer/', {
            'pay_rate': '15.00', 'start_date': (timezone.localdate() + timedelta(days=6)).isoformat(),
            'employment_type': 'part_time', 'respond_by': (timezone.localdate() + timedelta(days=1)).isoformat(),
            'send': False}, format='json')
        self.assertEqual(made.status_code, 201, made.data)
        offer = self.app.offers.get()
        type(offer).objects.filter(pk=offer.pk).update(respond_by=timezone.localdate() - timedelta(days=1))
        offers.refresh(offer)  # it expires on its own…
        self.app.refresh_from_db()
        self.assertEqual((self.app.stage, len(mail.outbox)), ('offer', 0))  # …but nobody is moved or emailed
        self.staff.post(f'/api/hiring/applications/{self.app.pk}/not-now/', {
            'reason': 'other', 'note': 'Took another job', 'send': False}, format='json')
        self.app.refresh_from_db()
        self.assertEqual((self.app.stage, self.app.not_now_email_status, len(mail.outbox)), ('not_now', 'not_sent', 0))
        self.assertTrue(self.app.events.filter(kind=ApplicationEvent.KIND_EMAIL,
                                               text="Not now: no email (Don't send)").exists())
