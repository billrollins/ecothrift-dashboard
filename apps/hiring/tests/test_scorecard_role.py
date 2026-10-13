"""Owner 2026-10-13: an applicant who applied for more than one role is scored on the role the interviewer picks."""
from datetime import timedelta

from django.utils import timezone

from apps.hiring.models import Application, ApplicationEvent, Interview, Job
from apps.hiring.tests.test_hiring import Base


class ScorecardRoleTests(Base):
    def setUp(self):
        super().setUp()
        self.turn_on()
        self.apply()
        self.app = Application.objects.get()
        self.restore = Job.objects.get(slug='restoration-associate')
        self.app.jobs.add(self.restore)  # applied for both (the restoration role's own questions aside)
        self.retail.interview_questions = [{'key': 'q_service', 'label': 'Tell me about great service.'},
                                           {'key': 'q_shift', 'label': 'Which shifts can you work?'}]
        self.retail.save(update_fields=['interview_questions'])
        self.restore.interview_questions = [{'key': 'q_fix', 'label': 'What have you repaired?'},
                                            {'key': 'q_shift', 'label': 'Which shifts can you work?'}]
        self.restore.save(update_fields=['interview_questions'])
        start = timezone.now() + timedelta(days=1)
        self.interview = Interview.objects.create(application=self.app, job=self.retail, start=start, end=start + timedelta(minutes=30))

    def test_the_interviewer_picks_another_role_and_shared_answers_stay(self):
        url = f'/api/hiring/interviews/{self.interview.pk}/'
        got = self.staff.get(url).data
        self.assertEqual([s['title'] for s in got['scorecards']], ['Retail Associate', 'Restoration Associate'])
        self.staff.post(url + 'scorecard/', {'answers': [{'key': 'q_service', 'rating': 4}, {'key': 'q_shift', 'rating': 5, 'note': 'Weekends'}],
                                             'overall': 'maybe', 'autosave': True}, format='json')
        r = self.staff.post(url + 'scorecard-role/', {'job': self.restore.pk}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['job_title'], 'Restoration Associate')
        self.assertEqual([q['key'] for q in r.data['interview_questions']], ['q_fix', 'q_shift'])
        self.assertEqual(r.data['scorecard']['answers'], [{'key': 'q_shift', 'label': 'Which shifts can you work?', 'rating': 5, 'note': 'Weekends'}])
        self.assertEqual(r.data['scorecard']['overall'], 'maybe')
        self.assertTrue(ApplicationEvent.objects.filter(application=self.app, text='Scorecard: Restoration Associate (was Retail Associate)').exists())

    def test_only_a_role_they_applied_for(self):
        processing = Job.objects.get(slug='processing-associate')
        r = self.staff.post(f'/api/hiring/interviews/{self.interview.pk}/scorecard-role/', {'job': processing.pk}, format='json')
        self.assertEqual(r.status_code, 400)
        self.interview.refresh_from_db()
        self.assertEqual(self.interview.job, self.retail)
