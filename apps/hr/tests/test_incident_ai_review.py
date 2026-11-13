"""AI review of an incident report (Bill, Dash Updates #133, 2026-11-13): tidy wording, questions, Keep / Revert,
answers saved into the report, the original always in the history."""
from datetime import timedelta
from unittest import mock

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.core.models import AIUsage
from apps.core.services.llm_router import LLMAPIError, LLMResult
from apps.hr import incident_ai
from apps.hr.models import IncidentNote, IncidentReport

from .test_incidents import IN_MEMORY, _person

LLM = 'apps.core.services.llm_router.llm_complete'


def _ai(fields=None, questions=None):
    return LLMResult(text='', model_used='muse-spark-1.3-contributor', tool_input={
        'fields': fields or {}, 'questions': questions or [],
    })


@override_settings(STORAGES=IN_MEMORY)
class IncidentAiReviewTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_superuser(email='owner@x.com', password='pass1234', first_name='Bill',
                                                   last_name='O')
        self.carrie = _person('carrie@x.com')
        self.dave = _person('dave@x.com')
        self.report = IncidentReport.objects.create(
            occurred_at=timezone.now() - timedelta(hours=1), kind='fall', place='stairs', reported_by=self.carrie,
            what_happened='lady went in back fell down stairs hurt wrist', injuries='wrist sore',
            witnesses='', cameras='back hall cam', follow_up='',
        )
        self.url = f'/api/hr/incidents/{self.report.pk}/ai-review/'

    def _run(self, who=None, **ai):
        self.client.force_authenticate(who or self.carrie)
        with mock.patch(LLM, return_value=_ai(**ai)) as call:
            res = self.client.post(self.url, {}, format='json')
        return res, call

    def test_review_lists_tidied_boxes_and_questions_and_changes_nothing(self):
        res, call = self._run(
            fields={
                'what_happened': 'A woman went into the back and fell down the stairs. She hurt her wrist.',
                'injuries': 'Sore wrist.',
                'cameras': 'back hall cam',  # unchanged: not listed
            },
            questions=[{'field': 'witnesses', 'question': 'Did anyone see her fall?'},
                       {'field': 'nonsense', 'question': 'What time exactly?'}],
        )
        self.assertEqual(res.status_code, 200, res.content)
        review = res.json()['ai_review']
        self.assertEqual([f['field'] for f in review['fields']], ['what_happened', 'injuries'])
        self.assertEqual(review['fields'][0]['now'], 'old')
        self.assertEqual([(q['field'], q['question']) for q in review['questions']],
                         [('witnesses', 'Did anyone see her fall?'), ('what_happened', 'What time exactly?')])
        self.report.refresh_from_db()
        self.assertEqual(self.report.what_happened, 'lady went in back fell down stairs hurt wrist')
        kwargs = call.call_args.kwargs
        self.assertEqual((kwargs['model_id'], kwargs['log_purpose']), ('muse-spark-1.3-contributor', 'INCIDENT_REVIEW'))
        self.assertIn('NEVER add a fact', kwargs['system'])

    def test_a_tidy_that_adds_a_number_or_grows_is_dropped(self):
        res, _ = self._run(fields={
            'what_happened': 'A woman fell down 12 stairs at 3:15 pm and hurt her wrist.',  # new numbers
            'injuries': 'Sore wrist. ' * 30,  # far longer than written
        })
        self.assertEqual(res.json()['ai_review']['fields'], [])

    def test_keep_puts_the_tidied_text_in_and_history_keeps_the_original(self):
        tidy = 'A woman went into the back and fell down the stairs. She hurt her wrist.'
        self._run(fields={'what_happened': tidy, 'injuries': 'Sore wrist.'})
        res = self.client.post(self.url + 'decide/', {'choice': 'keep', 'field': 'what_happened'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.report.refresh_from_db()
        self.assertEqual(self.report.what_happened, tidy)
        edit = IncidentNote.objects.filter(report=self.report, kind='edit').get()
        self.assertEqual(edit.changes['what_happened']['old'], 'lady went in back fell down stairs hurt wrist')
        fields = {f['field']: f for f in res.json()['ai_review']['fields']}
        self.assertEqual((fields['what_happened']['choice'], fields['what_happened']['now']), ('kept', 'new'))
        self.assertEqual(fields['injuries']['choice'], '')

        # Revert after Keep: the original comes back, as another edit.
        res = self.client.post(self.url + 'decide/', {'choice': 'revert', 'field': 'what_happened'}, format='json')
        self.report.refresh_from_db()
        self.assertEqual(self.report.what_happened, 'lady went in back fell down stairs hurt wrist')
        self.assertEqual(IncidentNote.objects.filter(report=self.report, kind='edit').count(), 2)

    def test_keep_all_and_revert_all(self):
        self._run(fields={'what_happened': 'A woman went into the back and fell down the stairs.',
                          'injuries': 'Sore wrist.'})
        res = self.client.post(self.url + 'decide/', {'choice': 'keep'}, format='json')
        self.assertEqual(res.json()['skipped'], 0)
        self.report.refresh_from_db()
        self.assertEqual(self.report.injuries, 'Sore wrist.')
        self.assertEqual(IncidentNote.objects.filter(report=self.report, kind='edit').count(), 1)  # one edit, both boxes
        self.client.post(self.url + 'decide/', {'choice': 'revert'}, format='json')
        self.report.refresh_from_db()
        self.assertEqual((self.report.injuries, self.report.what_happened),
                         ('wrist sore', 'lady went in back fell down stairs hurt wrist'))

    def test_revert_before_keep_changes_nothing(self):
        self._run(fields={'injuries': 'Sore wrist.'})
        self.client.post(self.url + 'decide/', {'choice': 'revert', 'field': 'injuries'}, format='json')
        self.assertFalse(IncidentNote.objects.filter(report=self.report, kind='edit').exists())

    def test_a_box_changed_after_the_review_is_not_overwritten(self):
        self._run(fields={'injuries': 'Sore wrist.'})
        IncidentReport.objects.filter(pk=self.report.pk).update(injuries='Wrist sore, ice pack given')
        res = self.client.post(self.url + 'decide/', {'choice': 'keep', 'field': 'injuries'}, format='json')
        self.assertEqual(res.status_code, 400)
        res = self.client.post(self.url + 'decide/', {'choice': 'keep'}, format='json')
        self.assertEqual(res.json()['skipped'], 1)
        self.report.refresh_from_db()
        self.assertEqual(self.report.injuries, 'Wrist sore, ice pack given')

    def test_an_answer_is_saved_into_its_box_and_keep_still_works(self):
        self._run(fields={'what_happened': 'A woman went into the back and fell down the stairs.'},
                  questions=[{'field': 'witnesses', 'question': 'Did anyone see her fall?'},
                             {'field': 'what_happened', 'question': 'About what time?'}])
        res = self.client.post(self.url + 'answer/', {'index': 0, 'answer': 'Maria at the register saw it.'},
                               format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.report.refresh_from_db()
        self.assertEqual(self.report.witnesses, 'Maria at the register saw it.')
        edit = IncidentNote.objects.filter(report=self.report, kind='edit').get()
        self.assertIn('Did anyone see her fall?', edit.body)
        self.assertEqual(res.json()['ai_review']['questions'][0]['answer'], 'Maria at the register saw it.')

        # An answer in a box the review tidied: both versions get the line, so Keep still applies.
        self.client.post(self.url + 'answer/', {'index': 1, 'answer': 'About 2:15 pm.'}, format='json')
        self.client.post(self.url + 'decide/', {'choice': 'keep', 'field': 'what_happened'}, format='json')
        self.report.refresh_from_db()
        self.assertEqual(self.report.what_happened,
                         'A woman went into the back and fell down the stairs.\nAbout 2:15 pm.')
        res = self.client.post(self.url + 'answer/', {'index': 1, 'answer': 'again'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_done_closes_the_review_and_a_new_run_replaces_an_open_one(self):
        self._run(fields={'injuries': 'Sore wrist.'})
        self._run(fields={'injuries': 'Her wrist was sore.'})
        reviews = IncidentNote.objects.filter(report=self.report, kind='ai_review').order_by('id')
        self.assertEqual([r.changes['done'] for r in reviews], [True, False])
        res = self.client.post(self.url + 'done/', {}, format='json')
        self.assertIsNone(res.json()['ai_review'])
        res = self.client.post(self.url + 'decide/', {'choice': 'keep'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_who_may_run_it(self):
        res, _ = self._run(who=self.dave)  # not his report: he cannot see it
        self.assertEqual(res.status_code, 404)
        IncidentReport.objects.filter(pk=self.report.pk).update(status='closed')
        res, _ = self._run(who=self.carrie)  # her report, but closed: a manager's now
        self.assertEqual(res.status_code, 403)
        res, _ = self._run(who=self.owner)
        self.assertEqual(res.status_code, 200)

    def test_ai_failure_changes_nothing_and_is_logged(self):
        self.client.force_authenticate(self.carrie)
        with mock.patch(LLM, side_effect=LLMAPIError('down')):
            res = self.client.post(self.url, {}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('Nothing was changed', res.json()['detail'])
        self.assertFalse(IncidentNote.objects.filter(report=self.report).exists())
        log = AIUsage.objects.get()
        self.assertEqual((log.purpose, log.success, log.user_id), ('INCIDENT_REVIEW', False, self.carrie.pk))

    def test_safety_check(self):
        self.assertTrue(incident_ai.tidy_is_safe('fell on 2 steps', 'She fell on 2 steps.'))
        self.assertFalse(incident_ai.tidy_is_safe('fell on steps', 'She fell on 2 steps.'))
        self.assertFalse(incident_ai.tidy_is_safe('', 'Something.'))
