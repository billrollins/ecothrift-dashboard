"""Dash #184: heads-up flags on an application, and the interview invite that calls them out."""
from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal

from django.core import mail
from django.test import SimpleTestCase

from apps.hiring import callouts, careers
from apps.hiring.models import Application, Job
from apps.hiring.tests.test_hiring import GOOD_ANSWERS, Base


class ParseTests(SimpleTestCase):
    def test_the_six_real_pay_answers(self):
        # 2026-11-19: six new applications; four-plus asked more than the $15 start.
        cases = {'$15.50': '15.50', '$17.50': '17.50', '17.50': '17.50', '$20': '20', '$22': '22', '15.50': '15.50'}
        for raw, low in cases.items():
            self.assertEqual(callouts.parse_pay(raw), (Decimal(low), Decimal(low)), raw)

    def test_pay_ranges_and_words(self):
        self.assertEqual(callouts.parse_pay('$15-$22 (based on other retail positions)'), (Decimal(15), Decimal(22)))
        self.assertEqual(callouts.parse_pay('18-19-20'), (Decimal(18), Decimal(20)))
        self.assertEqual(callouts.parse_pay('$20, flexible'), (Decimal(20), Decimal(20)))
        for raw in ('Open', 'negotiable', '40k', '$40,000 a year', '', None):
            self.assertIsNone(callouts.parse_pay(raw), raw)

    def test_start_dates_only_when_clear(self):
        applied = date(2026, 11, 19)
        for raw in ('ASAP', 'Immediately', 'Monday', 'Right away', '8/14', 'whenever', 'November 2'):
            self.assertIsNone(callouts.parse_start(raw, applied), raw)
        self.assertEqual(callouts.parse_start('January 15', applied), (date(2027, 1, 15), 'Jan 15'))
        self.assertEqual(callouts.parse_start('12/1/26', applied), (date(2026, 12, 1), 'Dec 1'))
        self.assertEqual(callouts.parse_start('November 30th, 2026', applied)[0], date(2026, 11, 30))
        self.assertEqual(callouts.parse_start('in 6 weeks', applied), (date(2026, 12, 31), 'in 6 weeks'))
        self.assertEqual(callouts.parse_start('2 weeks notice', applied)[0], date(2026, 12, 3))

    def test_job_days_and_hours(self):
        job = Job(schedule='Typically Monday through Friday', hours='Up to 40 hours a week', employment_type='full_or_part')
        self.assertEqual(callouts.job_days(job), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
        self.assertEqual(callouts.job_hours(job), (None, 40))
        self.assertIsNone(callouts.job_days(Job(schedule='Flexible schedule, friendly team')))
        self.assertEqual(callouts.job_days(Job(schedule='Sat and Sun')), ['Saturday', 'Sunday'])
        self.assertEqual(callouts.job_hours(Job(hours='', employment_type='full_time')), (30, None))
        self.assertEqual(callouts.job_hours(Job(hours='25-35 hours', employment_type='part_time')), (25, 35))

    def test_insert_goes_before_the_link_paragraph(self):
        body = 'Top\n\nHi {first_name},\n\nThanks.\n\nPick your interview time: {link}\n\nBye'
        out = callouts.insert(body, 'A few things', ['About pay.', '  ', 'Mine.'])
        self.assertEqual(out, 'Top\n\nHi {first_name},\n\nThanks.\n\nA few things\n\nAbout pay.\n\nMine.\n\n'
                              'Pick your interview time: {link}\n\nBye')
        self.assertEqual(callouts.insert(body, 'A few things', []), body)
        self.assertEqual(callouts.insert('Hi,\n\nBye', 'H', ['X']), 'Hi,\n\nH\n\nX\n\nBye')


class FlagTests(Base):
    def setUp(self):
        super().setUp()
        Job.objects.filter(pk=self.retail.pk).update(pay_min=Decimal('15'), hours='Up to 40 hours a week',
                                                     employment_type='full_or_part', schedule='Flexible schedule')
        self.retail.refresh_from_db()

    def app(self, jobs=None, **answers):
        miss = answers.pop('_miss', False)
        given = {**GOOD_ANSWERS, 'pay_wanted': '$15', **answers}
        rows = [{'key': k, 'label': k, 'type': 'text', 'answer': v} for k, v in given.items()]
        rows.append({'key': 'lifting', 'label': 'Can you lift 50 lbs?', 'type': 'yes_no', 'answer': 'no',
                     'must_be': 'yes', 'flag_label': 'Lift 50 lbs', 'ok': False} if miss else
                    {'key': 'age_18', 'label': 'Are you 18 or older?', 'type': 'yes_no', 'answer': 'yes',
                     'must_be': 'yes', 'flag_label': '18+', 'ok': True})
        application = Application.objects.create(first_name='Dana', email='dana@example.com', answers=rows)
        application.jobs.set(jobs or [self.retail])
        Application.objects.filter(pk=application.pk).update(created_at=datetime(2026, 11, 19, 15, tzinfo=dt_timezone.utc))
        application.refresh_from_db()
        return application

    def labels(self, application):
        return [c['label'] for c in callouts.chips(application)]

    def test_pay_above_the_start(self):
        self.assertEqual(self.labels(self.app(pay_wanted='$22')), ['Asks $22 (starts at $15)'])
        self.assertEqual(self.labels(self.app(pay_wanted='18-19-20')), ['Asks $18–$20 (starts at $15)'])
        self.assertEqual(self.labels(self.app(pay_wanted='$15')), [])
        self.assertEqual(self.labels(self.app(pay_wanted='Open')), [])
        Job.objects.filter(pk=self.retail.pk).update(pay_min=None)
        self.assertEqual(self.labels(self.app(pay_wanted='$22')), [])  # no start pay on the role: nothing to compare

    def test_hours_days_start_and_must_haves(self):
        self.assertEqual(self.labels(self.app(hours_per_week=45)), ['Wants 45 hrs (up to 40)'])
        Job.objects.filter(pk=self.retail.pk).update(hours='', employment_type='full_time',
                                                     schedule='Typically Monday through Friday')
        found = callouts.chips(self.app(hours_per_week=20, days=['Monday', 'Tuesday', 'Saturday'],
                                        start_date='January 15', _miss=True, pay_wanted='$15'))
        self.assertEqual([(c['kind'], c['label'], c['short']) for c in found], [
            ('hours', 'Wants 20 hrs (30+)', '20h'),
            ('days', 'Days: 2 of Mon–Fri', 'Days'),
            ('start', 'Starts Jan 15', 'Late start'),
            ('must_have', 'Lift 50 lbs: no', 'Lift 50 lbs'),
        ])
        self.assertEqual(self.labels(self.app(hours_per_week=32, days=['Monday', 'Wednesday', 'Friday'],
                                              pay_wanted='$15')), [])

    def test_a_flag_shows_only_when_no_role_fits(self):
        Job.objects.filter(pk=self.retail.pk).update(schedule='Monday through Friday')
        other = Job.objects.exclude(pk=self.retail.pk).first()
        Job.objects.filter(pk=other.pk).update(schedule='Flexible', pay_min=Decimal('18'), hours='Up to 40 hours')
        application = self.app(jobs=[self.retail, other], days=['Saturday'], pay_wanted='$18')
        self.assertEqual(self.labels(application), [])

    def test_the_list_and_the_card_carry_them(self):
        self.app(pay_wanted='$22')
        rows = self.staff.get('/api/hiring/applications/').data
        rows = rows['results'] if isinstance(rows, dict) else rows
        self.assertEqual(rows[0]['callouts'][0]['label'], 'Asks $22 (starts at $15)')
        card = self.staff.get(f'/api/hiring/applications/{rows[0]["id"]}/').data
        self.assertEqual(card['callouts'][0]['short'], '$22')


class InviteTests(Base):
    def setUp(self):
        super().setUp()
        Job.objects.filter(pk=self.retail.pk).update(pay_min=Decimal('15'), hours='Up to 40 hours a week',
                                                     employment_type='full_or_part', schedule='Flexible schedule')
        self.turn_on()

    def invite(self, pay='$22', **data):
        self.apply(answers={**GOOD_ANSWERS, 'pay_wanted': pay})
        self.app = Application.objects.get()
        mail.outbox.clear()
        url = f'/api/hiring/applications/{self.app.pk}/invite/'
        draft = self.staff.post(url, {'send': True, 'preview': True}, format='json').data['email']
        if data.get('review'):
            data = {'email': data['review'](draft)}
        response = self.staff.post(url, {'send': True, **data}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return draft, mail.outbox[0].body

    def test_flagged_invite_calls_out_pay_before_the_link(self):
        draft, body = self.invite()
        self.assertEqual(draft['notes']['heading'], 'A few things to look at before you book')
        self.assertEqual([i['label'] for i in draft['notes']['items']], ['Asks $22 (starts at $15)'])
        pay = draft['notes']['items'][0]['text']
        self.assertTrue(pay.startswith('About pay: everyone starts at $15 an hour for the first 90 days.'))
        self.assertIn('Entry $15, Senior $18, or Lead $20', pay)
        self.assertNotIn('A few things', draft['body'])  # the words to edit stay the template; the section is apart
        self.assertLess(body.index('A few things to look at before you book'), body.index(pay))
        self.assertLess(body.index(pay), body.index('Pick your interview time:'))

    def test_review_unticks_edits_and_adds_lines(self):
        def review(draft):
            return {'subject': draft['subject'], 'body': draft['body'],
                    'notes': {'heading': 'Before you book', 'items': ['Pay: talk to us.', 'Bring your ID.', '  ']}}

        draft, body = self.invite(review=review)
        self.assertNotIn('About pay', body)
        self.assertIn('Before you book\n\nPay: talk to us.\n\nBring your ID.\n\nPick your interview time:', body)
        event = self.app.events.get(kind='email', data__email='interview_invite')
        self.assertEqual(event.text, 'Emailed: Interview link')  # the call-outs are not an edit of the words
        self.assertIn('Bring your ID.', event.data['body'])

    def test_all_unticked_reads_as_today(self):
        _, body = self.invite(review=lambda d: {'subject': d['subject'], 'body': d['body'],
                                                'notes': {'heading': 'Before you book', 'items': []}})
        self.assertNotIn('Before you book', body)

    def test_no_flags_reads_as_today_but_a_line_can_be_added(self):
        draft, body = self.invite(pay='$15')
        self.assertEqual(draft['notes']['items'], [])
        self.assertNotIn('A few things', body)
        mail.outbox.clear()
        Application.objects.all().delete()
        _, body = self.invite(pay='$15', review=lambda d: {'subject': d['subject'], 'body': d['body'],
                                                           'notes': {'heading': 'One thing', 'items': ['Wear boots.']}})
        self.assertIn('One thing\n\nWear boots.\n\nPick your interview time:', body)

    def test_the_paragraphs_come_from_settings(self):
        doc = {'format': careers.FORMAT, 'email': {'flag_notes': {'pay': 'We start at {start_pay}; you asked {asked}.',
                                                                 'heading': '', 'nope': 'x'}}}
        response = self.staff.put('/api/hiring/careers/', {'doc': doc}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        saved = self.staff.get('/api/hiring/careers/').data['doc']['email']['flag_notes']
        self.assertEqual(saved['pay'], 'We start at {start_pay}; you asked {asked}.')
        self.assertEqual(saved['heading'], careers.DEFAULT_FLAG_NOTES['heading'])  # blank keeps the default
        self.assertEqual(saved['hours'], careers.DEFAULT_FLAG_NOTES['hours'])
        self.assertNotIn('nope', saved)
        draft, body = self.invite()
        self.assertEqual(draft['notes']['items'][0]['text'], 'We start at $15; you asked $22.')
        self.assertIn('We start at $15; you asked $22.', body)
