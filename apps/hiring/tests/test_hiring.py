"""Hiring Phase 1: careers file, public apply, the tracker, Not now and Create employee."""
import json
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.hiring import careers
from apps.hiring.models import Application, ApplicationEvent, Job

IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}

GOOD_ANSWERS = {
    'hours_per_week': '32',
    'days': ['Monday', 'Saturday'],
    'start_date': 'Right away',
    'transportation': 'yes',
    'lifting': 'yes',
    'age_18': 'yes',
    'work_authorized': 'yes',
    'pay_wanted': '$16',
    'why_us': 'I like fixing things.',
    'proactive': 'I cleaned the break room without being asked.',
    'retail-associate.experience': 'Two years at a grocery register.',
}


def _user(email, role):
    user = User.objects.create_user(email=email, first_name='Test', last_name=role, password='test-pass-123')
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    return user


@override_settings(STORAGES=IN_MEMORY)
class Base(TestCase):
    def setUp(self):
        cache.clear()
        self.retail = Job.objects.get(slug='retail-associate')
        self.manager = _user('boss@example.com', 'Manager')
        self.staff = APIClient()
        self.staff.force_authenticate(self.manager)
        self.public = APIClient()

    def turn_on(self):
        careers.set_public(True, user=self.manager)

    def apply(self, *, answers=None, roles=('retail-associate',), resume=None, **extra):
        data = {
            'first_name': 'Dana', 'last_name': 'Miles', 'email': 'dana@example.com', 'phone': '(402) 555-0101',
            'roles': list(roles), 'answers': json.dumps(answers if answers is not None else GOOD_ANSWERS),
            **extra,
        }
        if resume is not None:
            data['resume'] = resume
        return self.public.post('/api/hiring/public/apply/', data, format='multipart')


class SeedAndCareersFileTests(Base):
    def test_three_roles_are_seeded_open_and_the_page_starts_hidden(self):
        self.assertEqual(set(Job.objects.values_list('slug', flat=True)),
                         {'retail-associate', 'processing-associate', 'restoration-associate'})
        self.assertTrue(all(j.status == 'open' and j.pay_min == Decimal('15.00') for j in Job.objects.all()))
        self.assertFalse(careers.is_public())

    def test_roles_have_the_full_page_sections(self):
        for job in Job.objects.all():
            self.assertGreaterEqual(len(job.duties), 6, job.slug)
            self.assertEqual(len(job.success), 3, job.slug)
            self.assertGreaterEqual(len(job.looking_for), 4, job.slug)
            self.assertTrue(job.nice_to_have and job.physical, job.slug)
            self.assertTrue(any('with or without accommodation' in p for p in job.physical), job.slug)
            self.assertEqual(job.works_with, 'Bill, the owner, and a small team')
        self.assertIn('first thing customers see', Job.objects.get(slug='retail-associate').summary)
        keys = [q['key'] for q in careers.load_setting()['form']['questions']]
        self.assertEqual(keys[-3:], ['lead_interest', 'led_before', 'heard_about'])
        self.assertIn('lead', careers.load_setting()['page']['growth'])

    def test_migration_adds_lead_questions_to_a_saved_form_once(self):
        from importlib import import_module

        from django.apps import apps as django_apps
        from apps.core.models import AppSetting

        migration = import_module('apps.hiring.migrations.0004_role_page_text')
        old = [q for q in careers.DEFAULT_QUESTIONS if q['key'] not in ('lead_interest', 'led_before')]
        AppSetting.objects.create(key=careers.SETTING_KEY, value={'public': False, 'form': {'questions': old}})
        migration.add_lead_questions(django_apps, None)
        migration.add_lead_questions(django_apps, None)
        keys = [q['key'] for q in AppSetting.objects.get(key=careers.SETTING_KEY).value['form']['questions']]
        self.assertEqual(keys.count('lead_interest'), 1)
        self.assertEqual(keys[-3:], ['lead_interest', 'led_before', 'heard_about'])

    def test_export_then_check_round_trips_with_no_changes(self):
        doc = careers.export_doc()
        result = careers.check_doc(json.loads(json.dumps(doc)))
        self.assertTrue(result['ok'], result['errors'])
        self.assertEqual(careers.summarize_changes(careers.export_doc(), result['doc']), [])

    def test_check_rejects_bad_questions_and_warns_on_never_ask(self):
        doc = careers.export_doc()
        doc['form']['questions'].append({'key': 'married', 'label': 'Are you married?', 'type': 'yes_no'})
        doc['form']['questions'].append({'label': 'Pick one', 'type': 'choice'})
        result = careers.check_doc(doc)
        self.assertFalse(result['ok'])
        self.assertTrue(any('needs options' in e for e in result['errors']))
        self.assertTrue(any('never ask' in w for w in result['warnings']))

    def test_save_upserts_jobs_by_slug_and_leaves_missing_ones(self):
        doc = careers.export_doc()
        doc['jobs'] = [{**doc['jobs'][0], 'tagline': 'New line'}, {'title': 'Cashier Lead', 'status': 'draft'}]
        response = self.staff.post('/api/hiring/careers/check/', {'doc': doc}, format='json')
        self.assertTrue(response.data['ok'], response.data)
        self.assertTrue(any('Cashier Lead' in c for c in response.data['changes']))
        self.assertTrue(any('left as it is' in c for c in response.data['changes']))
        response = self.staff.put('/api/hiring/careers/', {'doc': doc}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Job.objects.get(slug='retail-associate').tagline, 'New line')
        self.assertTrue(Job.objects.filter(slug='cashier-lead', status='draft').exists())
        self.assertTrue(Job.objects.filter(slug='restoration-associate').exists())

    def test_a_partial_file_keeps_what_it_leaves_out(self):
        doc = careers.export_doc()
        doc['page']['headline'] = 'We are hiring'
        doc['email']['review_day'] = 'every Monday'
        careers.apply_doc(careers.check_doc(doc)['doc'], user=self.manager)
        result = careers.check_doc({'format': careers.FORMAT, 'email': {'reply_days': 5}})
        self.assertTrue(result['ok'], result['errors'])
        self.assertEqual(result['doc']['page']['headline'], 'We are hiring')
        self.assertEqual(result['doc']['email']['review_day'], 'every Monday')
        changes = careers.summarize_changes(careers.export_doc(), result['doc'])
        self.assertEqual(changes, ['Email: reply_days → 5'])

    def test_email_addresses_are_store_mailboxes_only(self):
        self.assertEqual(careers.load_setting()['email']['from'], 'retail@ecothrift.us')
        bad = careers.check_doc({'email': {'from': 'someone@gmail.com', 'notify': 'retail@ecothrift.us, x@y.com'}})
        self.assertFalse(bad['ok'])
        self.assertEqual(len(bad['errors']), 2)
        good = careers.check_doc({'email': {'from': 'Eco-Thrift <Warehouse@ecothrift.us>', 'reply_to': '',
                                            'notify': 'retail@ecothrift.us; bill_rollins@ecothrift.us'}})
        self.assertTrue(good['ok'], good['errors'])
        self.assertEqual(good['doc']['email']['from'], 'warehouse@ecothrift.us')
        self.assertEqual(good['doc']['email']['notify'], 'retail@ecothrift.us, bill_rollins@ecothrift.us')
        blank = careers.check_doc({'email': {'from': ''}})
        self.assertEqual(blank['doc']['email']['from'], 'retail@ecothrift.us')

    def test_careers_api_is_manager_only(self):
        employee = APIClient()
        employee.force_authenticate(_user('emp@example.com', 'Employee'))
        self.assertEqual(employee.get('/api/hiring/careers/').status_code, 403)
        self.assertIn(self.public.get('/api/hiring/applications/').status_code, (401, 403))


class PublicPageTests(Base):
    def test_hidden_until_on_unless_preview_key(self):
        self.assertEqual(self.public.get('/api/hiring/public/careers/').data, {'public': False, 'jobs': []})
        key = careers.preview_key()
        preview = self.public.get(f'/api/hiring/public/careers/?preview={key}').data
        self.assertTrue(preview['public'])
        self.assertTrue(preview['preview'])
        self.turn_on()
        page = self.public.get('/api/hiring/public/careers/').data
        self.assertFalse(page['preview'])
        self.assertEqual([j['slug'] for j in page['jobs']],
                         ['retail-associate', 'processing-associate', 'restoration-associate'])
        self.assertNotIn('pay_max', page['jobs'][0])
        for key in ('success', 'looking_for', 'nice_to_have', 'physical', 'works_with'):
            self.assertTrue(page['jobs'][0][key], key)
        self.assertTrue(page['page']['growth'])

    def test_sitemap_lists_careers_only_when_public(self):
        self.assertNotIn('/careers', self.public.get('/sitemap.xml').content.decode())
        self.turn_on()
        body = self.public.get('/sitemap.xml').content.decode()
        self.assertIn('/careers/retail-associate', body)

    def test_apply_is_refused_while_hidden(self):
        self.assertEqual(self.apply().status_code, 404)
        self.assertFalse(Application.objects.exists())


class ApplyTests(Base):
    def setUp(self):
        super().setUp()
        self.turn_on()

    def test_apply_with_resume_sends_auto_reply_and_alert(self):
        pdf = SimpleUploadedFile('resume.pdf', b'%PDF-1.4 resume', content_type='application/pdf')
        response = self.apply(resume=pdf, sms_consent='true')
        self.assertEqual(response.status_code, 201, response.data)
        app = Application.objects.get()
        self.assertEqual(app.stage, 'new')
        self.assertEqual(app.red_flags, 0)
        self.assertEqual(app.resume.content_type, 'application/pdf')
        self.assertTrue(app.resume.key.startswith('hiring/resumes/'))
        self.assertTrue(app.sms_consent)
        self.assertEqual(app.sms_consent_version, careers.SMS_CONSENT_VERSION)
        self.assertEqual(list(app.jobs.values_list('slug', flat=True)), ['retail-associate'])
        role_answer = next(a for a in app.answers if a['key'] == 'retail-associate.experience')
        self.assertEqual(role_answer['job'], 'retail-associate')
        self.assertEqual(len(mail.outbox), 2)
        reply, alert = mail.outbox
        self.assertEqual(reply.to, ['dana@example.com'])
        self.assertIn('We got your application, Dana', reply.subject)
        self.assertIn('Retail Associate', reply.body)
        self.assertEqual(reply.reply_to, ['bill_rollins@ecothrift.us'])
        self.assertIn('/people/applicants?id=', alert.body)
        self.assertTrue(app.received_email_sent)

    def test_apply_without_resume_and_no_text_consent(self):
        self.assertEqual(self.apply().status_code, 201)
        app = Application.objects.get()
        self.assertIsNone(app.resume)
        self.assertFalse(app.sms_consent)
        self.assertEqual(app.sms_consent_text, '')

    def test_red_flags_count_misses(self):
        self.apply(answers={**GOOD_ANSWERS, 'lifting': 'no', 'age_18': 'no'})
        app = Application.objects.get()
        self.assertEqual(app.red_flags, 2)
        alert = mail.outbox[1]
        self.assertIn('RED', alert.body)

    def test_required_answers_and_fields(self):
        response = self.apply(answers={'days': ['Sunday']}, phone='12', roles=())
        self.assertEqual(response.status_code, 400)
        errors = response.data['errors']
        for key in ('phone', 'roles', 'answers.why_us', 'answers.transportation'):
            self.assertIn(key, errors)
        self.assertFalse(Application.objects.exists())

    def test_role_question_required_only_for_ticked_role(self):
        answers = {k: v for k, v in GOOD_ANSWERS.items() if not k.startswith('retail')}
        response = self.apply(answers=answers, roles=('retail-associate', 'processing-associate'))
        self.assertEqual(response.status_code, 400)
        self.assertIn('answers.retail-associate.experience', response.data['errors'])
        self.assertIn('answers.processing-associate.careful_fast', response.data['errors'])

    def test_bad_file_refused(self):
        fake = SimpleUploadedFile('resume.pdf', b'MZ not a pdf', content_type='application/pdf')
        response = self.apply(resume=fake)
        self.assertEqual(response.status_code, 400)
        self.assertIn('resume', response.data['errors'])

    def test_honeypot_and_too_fast_look_fine_but_save_nothing(self):
        import time
        self.assertEqual(self.apply(website='http://spam').status_code, 201)
        self.assertEqual(self.apply(started_at=str(int(time.time() * 1000))).status_code, 201)
        self.assertFalse(Application.objects.exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_closed_role_cannot_be_applied_for(self):
        Job.objects.filter(slug='retail-associate').update(status='closed')
        response = self.apply()
        self.assertEqual(response.status_code, 400)
        self.assertIn('roles', response.data['errors'])


class TrackerTests(Base):
    def setUp(self):
        super().setUp()
        self.turn_on()
        self.apply(answers={**GOOD_ANSWERS, 'transportation': 'no'})
        self.app = Application.objects.get()
        mail.outbox.clear()

    def test_wants_to_lead_shows_on_the_list(self):
        self.apply(answers={**GOOD_ANSWERS, 'lead_interest': 'Yes', 'led_before': 'I trained two new cashiers.'},
                   email='lead@example.com')
        rows = {r['email']: r for r in self.staff.get('/api/hiring/applications/').data['results']}
        self.assertEqual(rows['lead@example.com']['lead_interest'], 'Yes')
        self.assertEqual(rows['dana@example.com']['lead_interest'], '')

    def test_list_counts_and_flag_filter(self):
        rows = self.staff.get('/api/hiring/applications/?stage=new').data['results']
        self.assertEqual(rows[0]['full_name'], 'Dana Miles')
        self.assertEqual([f['ok'] for f in rows[0]['flags']], [False, True, True, True])
        counts = self.staff.get('/api/hiring/applications/counts/').data['counts']
        self.assertEqual((counts['new'], counts['open'], counts['all']), (1, 1, 1))
        self.assertEqual(len(self.staff.get('/api/hiring/applications/?flag=green').data['results']), 0)
        self.assertEqual(len(self.staff.get('/api/hiring/applications/?q=402555').data['results']), 1)

    def test_list_carries_the_next_interview_and_the_offer_status(self):
        from datetime import timedelta

        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        from django.utils import timezone

        from apps.hiring.models import Interview

        row = self.staff.get('/api/hiring/applications/').data['results'][0]
        self.assertEqual((row['next_interview'], row['offer_status']), (None, ''))
        soon = timezone.now() + timedelta(days=2)
        Interview.objects.create(application=self.app, start=soon, end=soon + timedelta(minutes=30))
        Interview.objects.create(application=self.app, start=soon - timedelta(days=5), end=soon,
                                 status=Interview.STATUS_DONE)
        for i in range(3):  # more rows must not mean more queries
            self.apply(email=f'more{i}@example.com', phone=f'402555020{i}')
        with CaptureQueriesContext(connection) as queries:
            rows = {r['id']: r for r in self.staff.get('/api/hiring/applications/?stage=open').data['results']}
        self.assertLess(len(queries), 15)
        self.assertEqual(rows[self.app.pk]['next_interview'], soon)

    def test_stage_note_rating_are_logged(self):
        url = f'/api/hiring/applications/{self.app.pk}/'
        self.assertEqual(self.staff.post(url + 'stage/', {'stage': 'contacted'}, format='json').status_code, 200)
        self.staff.post(url + 'note/', {'text': 'Called, left a message'}, format='json')
        self.staff.post(url + 'rating/', {'rating': 4}, format='json')
        detail = self.staff.get(url).data
        self.assertEqual((detail['stage'], detail['rating']), ('contacted', 4))
        kinds = [e['kind'] for e in detail['events']]
        for kind in ('created', 'stage', 'note', 'rating', 'email'):
            self.assertIn(kind, kinds)
        stage_event = next(e for e in detail['events'] if e['kind'] == 'stage')
        self.assertEqual((stage_event['from_stage'], stage_event['to_stage']), ('new', 'contacted'))
        self.assertEqual(self.staff.post(url + 'stage/', {'stage': 'not_now'}, format='json').status_code, 400)

    def test_not_now_needs_a_reason_and_sends_only_on_send(self):
        url = f'/api/hiring/applications/{self.app.pk}/not-now/'
        self.assertEqual(self.staff.post(url, {'reason': ''}, format='json').status_code, 400)
        self.assertEqual(self.staff.post(url, {'reason': 'other'}, format='json').status_code, 400)
        response = self.staff.post(url, {'reason': 'hours', 'send': False}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)
        self.app.refresh_from_db()
        self.assertEqual((self.app.stage, self.app.not_now_stage, self.app.not_now_email_status),
                         ('not_now', 'new', 'not_sent'))

    def test_not_now_draft_then_send(self):
        draft = self.staff.get(f'/api/hiring/applications/{self.app.pk}/not-now-draft/?reason=position_closed').data
        # The draft is the template; the review screen shows each {value} as a chip.
        self.assertIn('{roles}', draft['body'])
        self.assertEqual(draft['values']['roles'], 'Retail Associate')
        self.assertEqual(draft['fields']['roles'], 'Roles applied for')
        response = self.staff.post(f'/api/hiring/applications/{self.app.pk}/not-now/', {
            'reason': 'position_closed', 'send': True, 'subject': draft['subject'], 'body': draft['body'] + '\nThanks!',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Retail Associate position has been filled', mail.outbox[0].body)
        self.assertTrue(mail.outbox[0].body.endswith('Thanks!'))
        self.app.refresh_from_db()
        self.assertEqual(self.app.not_now_email_status, 'sent')
        self.assertTrue(self.app.events.filter(text='Emailed: Not now email (edited)').exists())
        # Re-opening clears the reason; the timeline keeps it.
        self.staff.post(f'/api/hiring/applications/{self.app.pk}/stage/', {'stage': 'reviewed'}, format='json')
        self.app.refresh_from_db()
        self.assertEqual((self.app.stage, self.app.not_now_reason), ('reviewed', ''))
        self.assertTrue(self.app.events.filter(text__startswith='Not now: Position filled').exists())

    def test_create_employee_makes_dash_user_and_profile(self):
        response = self.staff.post(f'/api/hiring/applications/{self.app.pk}/create-employee/', {
            'pay_rate': '16.50', 'start_date': '2026-10-12', 'employment_type': 'part_time',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(email='dana@example.com')
        self.assertTrue(user.is_staff)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(list(user.groups.values_list('name', flat=True)), ['Employee'])
        self.assertEqual(user.employee.pay_rate, Decimal('16.50'))
        self.assertEqual(str(user.employee.hire_date), '2026-10-12')
        self.assertEqual(user.employee.position, 'Retail Associate')
        self.app.refresh_from_db()
        self.assertEqual((self.app.stage, self.app.employee_user_id), ('hired', user.pk))
        self.assertTrue(self.app.events.filter(kind=ApplicationEvent.KIND_EMPLOYEE).exists())
        again = self.staff.post(f'/api/hiring/applications/{self.app.pk}/create-employee/', {'pay_rate': '16'},
                                format='json')
        self.assertEqual(again.status_code, 400)

    def test_add_applicant_by_hand_with_photo_resume(self):
        photo = SimpleUploadedFile('scan.jpg', b'\xff\xd8\xff\xe0 jpeg', content_type='image/jpeg')
        response = self.staff.post('/api/hiring/applications/', {
            'first_name': 'Walk', 'last_name': 'In', 'phone': '4025550199', 'jobs': str(self.retail.pk),
            'source': 'walk_in', 'note': 'Brought a paper resume', 'resume': photo,
        }, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        app = Application.objects.get(first_name='Walk')
        self.assertEqual((app.source, app.created_by_id), ('walk_in', self.manager.pk))
        self.assertEqual(app.resume.content_type, 'image/jpeg')
        resume = self.staff.get(f'/api/hiring/applications/{app.pk}/resume/')
        self.assertEqual(resume.status_code, 200)
        self.assertIn('no-store', resume['Cache-Control'])


class BundleAndPeopleTests(Base):
    """The JSON bundle for AI (instructions + indexes + file), hiring manager, interviewers, model choice."""

    def setUp(self):
        super().setUp()
        from apps.hr.models import Department
        self.dept = Department.objects.create(name='Retail floor', slug='retail-floor')
        self.lead = _user('lead@example.com', 'Employee')
        self.lead.is_staff = True
        self.lead.save(update_fields=['is_staff'])

    def test_bundle_carries_instructions_indexes_and_the_file(self):
        data = self.staff.get('/api/hiring/careers/bundle/').data
        self.assertEqual(data['format'], careers.BUNDLE_FORMAT)
        self.assertIn('Indexes', data['instructions'])
        emails = {s['email'] for s in data['indexes']['staff']}
        self.assertTrue({'boss@example.com', 'lead@example.com'} <= emails)
        self.assertIn({'id': self.dept.pk, 'slug': 'retail-floor', 'name': 'Retail floor'}, data['indexes']['departments'])
        self.assertIn('yes_no', data['indexes']['question_types'])
        self.assertEqual(len(data['careers']['jobs']), 3)
        self.assertEqual(data['careers']['jobs'][0]['interviewers'], [])

    def test_a_returned_bundle_sets_people_and_department(self):
        data = self.staff.get('/api/hiring/careers/bundle/').data
        retail = next(j for j in data['careers']['jobs'] if j['slug'] == 'retail-associate')
        retail.update({'hiring_manager': 'BOSS@example.com', 'interviewers': ['lead@example.com', 'boss@example.com'],
                       'department': 'Retail floor'})
        check = self.staff.post('/api/hiring/careers/check/', {'doc': data}, format='json').data
        self.assertTrue(check['ok'], check['errors'])
        self.assertIn('Job "Retail Associate": hiring manager → boss@example.com', check['changes'])
        self.assertEqual(self.staff.put('/api/hiring/careers/', {'doc': data}, format='json').status_code, 200)
        job = Job.objects.get(slug='retail-associate')
        self.assertEqual((job.hiring_manager, job.department), (self.manager, self.dept))
        self.assertEqual(set(job.interviewers.all()), {self.manager, self.lead})
        again = self.staff.post('/api/hiring/careers/check/', {'doc': data}, format='json').data
        self.assertEqual(again['changes'], [])

    def test_unknown_people_and_departments_are_refused(self):
        doc = careers.export_doc()
        doc['jobs'][0].update({'hiring_manager': 'nobody@example.com', 'interviewers': ['ghost@example.com'],
                               'department': 'warehouse'})
        result = careers.check_doc(doc)
        self.assertFalse(result['ok'])
        self.assertEqual(len(result['errors']), 3)

    def test_a_job_that_leaves_keys_out_keeps_them(self):
        Job.objects.filter(slug='retail-associate').update(hiring_manager=self.manager)
        result = careers.check_doc({'jobs': [{'slug': 'retail-associate', 'tagline': 'New line'}]})
        self.assertTrue(result['ok'], result['errors'])
        job = result['doc']['jobs'][0]
        self.assertEqual((job['hiring_manager'], job['title']), ('boss@example.com', 'Retail Associate'))
        self.assertTrue(job['success'])

    def test_alert_goes_to_the_roles_hiring_manager_too(self):
        Job.objects.filter(slug='retail-associate').update(hiring_manager=self.lead)
        self.turn_on()
        self.apply()
        alert = mail.outbox[1]
        self.assertEqual(set(alert.to), {'bill_rollins@ecothrift.us', 'lead@example.com'})

    def test_role_editor_sets_people(self):
        job = Job.objects.get(slug='processing-associate')
        response = self.staff.patch(f'/api/hiring/jobs/{job.pk}/', {
            'hiring_manager': self.lead.pk, 'interviewers': [self.lead.pk, self.manager.pk],
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['hiring_manager_person']['email'], 'lead@example.com')
        self.assertEqual(len(response.data['interviewer_people']), 2)

    def test_create_employee_takes_the_roles_department(self):
        Job.objects.filter(slug='retail-associate').update(department=self.dept)
        self.turn_on()
        self.apply()
        app = Application.objects.get()
        self.staff.post(f'/api/hiring/applications/{app.pk}/create-employee/', {'pay_rate': '15'}, format='json')
        self.assertEqual(User.objects.get(email='dana@example.com').employee.department, self.dept)

    def test_careers_get_lists_models_and_ai_choices(self):
        from apps.core.models import AiModel
        AiModel.objects.create(slug='test-model-1', label='Test model', provider='anthropic')
        info = self.staff.get('/api/hiring/careers/').data
        self.assertIn('test-model-1', [m['slug'] for m in info['ai']['models']])
        self.assertIn('high', info['ai']['efforts'])


class AiJobTests(Base):
    """AI edits run in the background (Heroku's 30-second limit); Dash polls. Nothing saves."""

    def setUp(self):
        super().setUp()
        from unittest import mock

        from apps.hiring import ai
        patcher = mock.patch.object(ai, '_spawn', side_effect=ai._work)  # run inline in tests
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_ai(self, payload, answer):
        from unittest import mock
        with mock.patch('apps.core.services.llm_router.llm_chat_text', return_value=(answer, 'test-model')) as llm:
            started = self.staff.post('/api/hiring/ai/', payload, format='json')
        self.assertEqual(started.status_code, 202, started.data)
        status_ = self.staff.get(f'/api/hiring/ai/{started.data["id"]}/').data
        return status_, llm

    def test_role_edit_returns_fields_and_what_changed(self):
        job = Job.objects.get(slug='retail-associate')
        fields = {'title': job.title, 'tagline': job.tagline, 'summary': job.summary, 'duties': job.duties,
                  'success': job.success, 'looking_for': job.looking_for, 'nice_to_have': job.nice_to_have,
                  'physical': job.physical, 'questions': ['What is your register experience?'],
                  'interview_questions': ['Tell me about a hard customer.']}
        answer = json.dumps({**fields, 'tagline': 'Make the store shine.', 'duties': job.duties[:6]})
        result, llm = self.run_ai({'kind': 'job', 'action': 'shorter', 'fields': fields, 'effort': 'low'}, answer)
        self.assertEqual(result['status'], 'done', result)
        self.assertEqual(result['result']['changed'], ['tagline', 'duties'])
        self.assertEqual(result['result']['fields']['tagline'], 'Make the store shine.')
        self.assertIn('shorter', llm.call_args.kwargs['user'].lower())
        self.assertEqual(llm.call_args.kwargs['effort'], 'low')
        self.assertEqual(Job.objects.get(slug='retail-associate').tagline, job.tagline)  # nothing saved

    def test_email_edit_warns_about_unknown_placeholders(self):
        answer = json.dumps({'subject': 'Hi {first_name}', 'body': 'Thanks {first_name}, see you {date}.'})
        result, _ = self.run_ai({'kind': 'email', 'key': 'received', 'action': 'warmer',
                                 'subject': 'We got it, {first_name}', 'body': 'Thanks for applying for {roles}.'},
                                answer)
        self.assertEqual(result['status'], 'done', result)
        warnings = ' '.join(result['result']['warnings'])
        self.assertIn('{date}', warnings)
        self.assertIn('{roles}', warnings)

    def test_bad_answers_fail_and_bad_requests_are_refused(self):
        result, _ = self.run_ai({'kind': 'email', 'key': 'received', 'subject': 's', 'body': 'b'}, 'no json here')
        self.assertEqual(result['status'], 'failed')
        self.assertIn('not usable', result['error'])
        for payload in ({'kind': 'nope'}, {'kind': 'email', 'key': 'nope'}, {'kind': 'job', 'action': 'custom'},
                        {'kind': 'careers'}, {'kind': 'job', 'model': 'not-a-model'}):
            self.assertEqual(self.staff.post('/api/hiring/ai/', payload, format='json').status_code, 400, payload)

    def test_whole_file_edit_still_works(self):
        result, _ = self.run_ai({'kind': 'careers', 'request': 'No changes'}, json.dumps(careers.export_doc()))
        self.assertEqual((result['status'], result['result']['changes']), ('done', []))

    def test_a_dead_run_is_marked_failed(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.hiring.models import HiringAiJob
        job = HiringAiJob.objects.create(kind='email', params={})
        HiringAiJob.objects.filter(pk=job.pk).update(created_at=timezone.now() - timedelta(minutes=10))
        data = self.staff.get(f'/api/hiring/ai/{job.pk}/').data
        self.assertEqual(data['status'], 'failed')


class RoleEmailTests(Base):
    """Emails are universal, and a role can carry its own version of any of them."""

    def test_a_roles_own_auto_reply_is_used_for_that_role_only(self):
        retail = Job.objects.get(slug='retail-associate')
        retail.emails = {'received': {'subject': 'Retail got you, {first_name}', 'body': 'See you on the floor.'}}
        retail.save()
        self.turn_on()
        self.apply()
        self.assertEqual(mail.outbox[0].subject, 'Retail got you, Dana')
        mail.outbox.clear()
        self.apply(roles=('processing-associate',), email='p@example.com',
                   answers={**{k: v for k, v in GOOD_ANSWERS.items() if not k.startswith('retail')},
                            'processing-associate.careful_fast': 'Checklists.'})
        self.assertEqual(mail.outbox[0].subject, 'We got your application, Dana')

    def test_role_emails_round_trip_and_are_checked(self):
        doc = careers.export_doc()
        doc['jobs'][0]['emails'] = {'not_now.default': {'subject': 'S', 'body': 'B'}, 'interview_booked': {}}
        good = careers.check_doc(doc)
        self.assertTrue(good['ok'], good['errors'])
        self.assertEqual(good['doc']['jobs'][0]['emails'], {'not_now.default': {'subject': 'S', 'body': 'B'}})
        doc['jobs'][0]['emails'] = {'made_up': {'subject': 'S', 'body': 'B'}}
        self.assertFalse(careers.check_doc(doc)['ok'])
        job = Job.objects.get(slug='retail-associate')
        response = self.staff.patch(f'/api/hiring/jobs/{job.pk}/', {'emails': {'alert': {'subject': 'x'}}}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_not_now_uses_the_roles_version(self):
        retail = Job.objects.get(slug='retail-associate')
        retail.emails = {'not_now.default': {'subject': 'Retail: thanks', 'body': 'Hi {first_name}.'}}
        retail.save()
        self.turn_on()
        self.apply()
        app = Application.objects.get()
        draft = self.staff.get(f'/api/hiring/applications/{app.pk}/not-now-draft/?reason=hours').data
        self.assertEqual((draft['subject'], draft['body']), ('Retail: thanks', 'Hi {first_name}.'))
        self.assertEqual((draft['values'], draft['source']), ({'first_name': 'Dana'}, "Retail Associate's own version"))

class InterviewTests(Base):
    """Phase 2: the interview link, open times, book / change / cancel, emails with .ics, staff actions, reminders."""

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

    def link_token(self):
        response = self.staff.post(f'/api/hiring/applications/{self.app.pk}/invite/', {'send': True}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.app.refresh_from_db()
        return self.app.booking_token

    def test_invite_emails_the_link_and_moves_to_contacted(self):
        token = self.link_token()
        self.assertEqual(self.app.stage, 'contacted')
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(f'/careers/interview?t={token}', mail.outbox[0].body)
        self.assertIn('Pick your interview time', mail.outbox[0].subject)
        copy = self.staff.post(f'/api/hiring/applications/{self.app.pk}/invite/', {'send': False}, format='json').data
        self.assertEqual(copy['link'].split('t=')[1], token)  # same live link, no second email
        self.assertEqual(len(mail.outbox), 1)
        self.assertTrue(copy['application']['booking_link'].endswith(token))

    def test_review_preview_sends_nothing_and_saves_nothing(self):
        url = f'/api/hiring/applications/{self.app.pk}/invite/'
        draft = self.staff.post(url, {'send': True, 'preview': True}, format='json').data['email']
        self.assertEqual((draft['key'], draft['to'], draft['skip_allowed']), ('interview_invite', ['dana@example.com'], False))
        self.assertIn('{link}', draft['body'])
        self.assertIn('/careers/interview?t=', draft['values']['link'])
        self.assertEqual(draft['fields']['link'], 'Their private link')
        self.assertEqual(draft['source'], 'The version for all roles')
        self.app.refresh_from_db()
        self.assertEqual((self.app.stage, self.app.invited_at, len(mail.outbox)), ('new', None, 0))
        # The private link is made before the review, so the link shown is the one that goes out.
        self.assertTrue(draft['values']['link'].endswith(self.app.booking_token))
        self.assertFalse(self.app.events.filter(kind='email', data__email='interview_invite').exists())

    def test_review_sends_the_edited_words_fills_linked_values_and_logs_it(self):
        url = f'/api/hiring/applications/{self.app.pk}/invite/'
        draft = self.staff.post(url, {'send': True, 'preview': True}, format='json').data['email']
        body = draft['body'].replace('{first_name}', 'Dana Banana') + '\nSee you soon {'
        response = self.staff.post(url, {'send': True, 'email': {'subject': draft['subject'], 'body': body}},
                                   format='json')
        self.assertEqual(response.status_code, 200, response.data)
        sent = mail.outbox[0]
        self.assertIn('Hi Dana Banana,', sent.body)
        self.app.refresh_from_db()
        self.assertIn(f'/careers/interview?t={self.app.booking_token}', sent.body)  # linked: filled when sent
        self.assertTrue(sent.body.endswith('See you soon {'))  # a stray brace is just a brace
        event = self.app.events.get(kind='email', data__email='interview_invite')
        self.assertEqual(event.text, 'Emailed: Interview link (edited)')
        self.assertEqual((event.data['typed_over'], event.data['body']), (['first_name'], sent.body))
        self.assertEqual(self.app.stage, 'contacted')

    def test_untouched_review_is_not_marked_edited_and_skip_is_refused_for_the_link(self):
        url = f'/api/hiring/applications/{self.app.pk}/invite/'
        refused = self.staff.post(url, {'send': True, 'email': {'skip': True}}, format='json')
        self.assertEqual(refused.status_code, 400)
        draft = self.staff.post(url, {'send': True, 'preview': True}, format='json').data['email']
        self.staff.post(url, {'send': True, 'email': {'subject': draft['subject'], 'body': draft['body']}}, format='json')
        self.assertEqual(self.app.events.get(kind='email', data__email='interview_invite').text, 'Emailed: Interview link')

    def test_staff_booking_reviewed_then_done_without_emailing(self):
        token = self.link_token()
        mail.outbox.clear()
        start = self.public.get(f'/api/hiring/public/interview/?t={token}').data['times'][0]['start']
        payload = {'application': self.app.pk, 'start': start}
        draft = self.staff.post('/api/hiring/interviews/', {**payload, 'preview': True}, format='json').data['email']
        self.assertEqual((draft['key'], draft['attachments'], draft['skip_allowed']),
                         ('interview_booked', ['interview.ics'], True))
        self.assertEqual(draft['fields']['when'], 'Interview time')
        self.assertFalse(self.Interview.objects.exists())
        self.assertEqual(len(mail.outbox), 0)
        response = self.staff.post('/api/hiring/interviews/', {**payload, 'email': {'skip': True}}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(mail.outbox), 1)  # the staff notice still goes
        self.assertNotIn('dana@example.com', mail.outbox[0].to)
        self.assertTrue(self.app.events.filter(text='Not emailed: Interview booked (done without emailing)').exists())

    def test_no_email_on_file_still_shows_the_words_to_copy(self):
        Application.objects.filter(pk=self.app.pk).update(email='')
        from apps.hiring import interviews

        start = interviews.open_times()[0][0].isoformat()
        payload = {'application': self.app.pk, 'start': start}
        draft = self.staff.post('/api/hiring/interviews/', {**payload, 'preview': True}, format='json').data['email']
        self.assertEqual((draft['key'], draft['to']), ('interview_booked', []))
        response = self.staff.post('/api/hiring/interviews/', {**payload, 'email': {'skip': True}}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotIn('', [address for m in mail.outbox for address in m.to])

    def test_public_page_lists_open_times_and_refuses_bad_links(self):
        token = self.link_token()
        data = self.public.get(f'/api/hiring/public/interview/?t={token}').data
        self.assertEqual((data['first_name'], data['roles'], data['interview']), ('Dana', ['Retail Associate'], None))
        self.assertTrue(data['times'])
        first = data['times'][0]
        self.assertTrue({'start', 'end', 'day', 'label', 'date'} <= set(first))
        self.assertEqual(self.public.get('/api/hiring/public/interview/?t=nope-not-a-real-token-at-all').status_code, 404)

    def test_book_change_and_cancel_from_the_link(self):
        token = self.link_token()
        mail.outbox.clear()
        times = self.public.get(f'/api/hiring/public/interview/?t={token}').data['times']
        booked = self.public.post('/api/hiring/public/interview/', {'t': token, 'start': times[0]['start']}, format='json')
        self.assertEqual(booked.status_code, 200, booked.data)
        self.assertEqual(booked.data['interview']['interviewer'], 'Test')  # Carrie's first name in the test user
        interview = self.Interview.objects.get()
        self.assertEqual((interview.interviewer, interview.status), (self.carrie, 'scheduled'))
        self.app.refresh_from_db()
        self.assertEqual(self.app.stage, 'interview_scheduled')
        to_applicant, notice = mail.outbox
        self.assertEqual(to_applicant.to, ['dana@example.com'])
        self.assertEqual(to_applicant.attachments[0][0], 'interview.ics')
        self.assertIn('BEGIN:VEVENT', to_applicant.attachments[0][1].decode() if isinstance(to_applicant.attachments[0][1], bytes) else to_applicant.attachments[0][1])
        self.assertEqual(set(notice.to), {'carrie@example.com', 'boss@example.com'})
        self.assertNotIn(times[0]['start'], [t['start'] for t in booked.data['times']])

        mail.outbox.clear()
        moved = self.public.post('/api/hiring/public/interview/', {'t': token, 'start': times[1]['start']}, format='json')
        self.assertEqual(moved.status_code, 200, moved.data)
        interview.refresh_from_db()
        self.assertEqual((interview.ics_sequence, self.Interview.objects.count()), (1, 1))
        self.assertIn('moved', mail.outbox[0].subject)

        mail.outbox.clear()
        cancelled = self.public.post('/api/hiring/public/interview/cancel/', {'t': token}, format='json')
        self.assertIsNone(cancelled.data['interview'])
        interview.refresh_from_db()
        self.app.refresh_from_db()
        self.assertEqual((interview.status, self.app.stage), ('cancelled', 'contacted'))
        self.assertIn('cancelled', mail.outbox[0].subject)

    def test_a_taken_time_is_refused(self):
        token = self.link_token()
        times = self.public.get(f'/api/hiring/public/interview/?t={token}').data['times']
        self.staff.post('/api/hiring/interview-times/', {'kind': 'block', 'start': times[0]['start'],
                                                         'end': times[0]['end']}, format='json')
        response = self.public.post('/api/hiring/public/interview/', {'t': token, 'start': times[0]['start']},
                                    format='json')
        self.assertEqual(response.status_code, 400)

    def test_hours_notice_blocks_and_extra_openings(self):
        from datetime import datetime, time as dtime, timedelta

        from django.utils import timezone

        from apps.hiring import interviews
        from apps.hiring.models import InterviewTime
        now = timezone.now()
        times = interviews.open_times(now=now)
        self.assertTrue(all(start >= now + timedelta(hours=12) for start, _ in times))
        self.assertTrue(all(timezone.localtime(start).weekday() < 5 for start, _ in times))
        self.assertTrue(all(dtime(9) <= timezone.localtime(start).time() < dtime(17) for start, _ in times))
        # An extra Saturday morning opens; a block removes its slots.
        day = timezone.localdate(now) + timedelta(days=(5 - timezone.localdate(now).weekday()) % 7 or 7)
        tz = timezone.get_current_timezone()
        sat = timezone.make_aware(datetime.combine(day, dtime(10)), tz)
        InterviewTime.objects.create(kind='open', start=sat, end=sat + timedelta(hours=1))
        self.assertIn(sat, [s for s, _ in interviews.open_times(now=now)])
        InterviewTime.objects.create(kind='block', start=sat, end=sat + timedelta(minutes=30))
        opened = [s for s, _ in interviews.open_times(now=now)]
        self.assertNotIn(sat, opened)
        self.assertIn(sat + timedelta(minutes=30), opened)

    def test_staff_book_then_score_and_no_show(self):
        times = self.staff.get('/api/hiring/interviews/open-times/').data['times']
        made = self.staff.post('/api/hiring/interviews/', {'application': self.app.pk, 'start': times[0]['start']},
                               format='json')
        self.assertEqual(made.status_code, 201, made.data)
        self.assertEqual(made.data['booked_by'], 'staff')
        self.assertEqual(len(made.data['interview_questions']), 6)
        self.app.refresh_from_db()
        self.assertTrue(self.app.booking_token)  # their emails carry a change / cancel link
        pk = made.data['id']
        bad = self.staff.post(f'/api/hiring/interviews/{pk}/scorecard/', {'answers': [{'key': 'cash', 'rating': 9}]},
                              format='json')
        self.assertEqual(bad.status_code, 400)
        done = self.staff.post(f'/api/hiring/interviews/{pk}/scorecard/', {
            'answers': [{'key': 'cash', 'rating': 4, 'note': 'Balanced drawers at Target'}],
            'overall': 'hire', 'lead_potential': 'maybe', 'notes': 'Strong', 'done': True,
        }, format='json')
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual((done.data['status'], done.data['scorecard']['overall']), ('done', 'hire'))
        self.assertEqual(done.data['scorecard']['answers'][0]['label'],
                         'Have you handled cash or a register? How do you make sure your drawer balances?')
        self.app.refresh_from_db()
        self.assertEqual(self.app.stage, 'interviewed')

    def test_interviewer_change_and_no_show(self):
        times = self.staff.get('/api/hiring/interviews/open-times/').data['times']
        pk = self.staff.post('/api/hiring/interviews/', {'application': self.app.pk, 'start': times[0]['start']},
                             format='json').data['id']
        changed = self.staff.post(f'/api/hiring/interviews/{pk}/interviewer/', {'interviewer': self.manager.pk},
                                  format='json')
        self.assertEqual(changed.data['interviewer_person']['email'], 'boss@example.com')
        no_show = self.staff.post(f'/api/hiring/interviews/{pk}/no-show/', {}, format='json')
        self.assertEqual(no_show.data['status'], 'no_show')

    def test_reminder_goes_once_the_day_before(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.hiring.interviews import send_due_reminders
        self.link_token()
        mail.outbox.clear()
        start = timezone.now() + timedelta(hours=20)
        self.Interview.objects.create(application=self.app, start=start, end=start + timedelta(minutes=30),
                                      interviewer=self.carrie)
        self.assertEqual(send_due_reminders(), 1)
        self.assertEqual(send_due_reminders(), 0)
        self.assertIn('Reminder', mail.outbox[0].subject)

    def test_interview_settings_and_defaults_in_the_careers_file(self):
        bad = careers.check_doc({'interviews': {'start': '9am', 'weekdays': ['Funday']}})
        self.assertFalse(bad['ok'])
        good = careers.check_doc({'interviews': {'start': '10:00', 'length_minutes': 45},
                                  'defaults': {'hiring_manager': 'boss@example.com',
                                               'interviewers': ['carrie@example.com']},
                                  'jobs': [{'title': 'Cashier Lead', 'status': 'draft'}]})
        self.assertTrue(good['ok'], good['errors'])
        new_job = next(j for j in good['doc']['jobs'] if j['slug'] == 'cashier-lead')
        self.assertEqual((new_job['hiring_manager'], new_job['interviewers']), ('boss@example.com', ['carrie@example.com']))
        careers.apply_doc(good['doc'], user=self.manager)
        self.assertEqual(careers.load_setting()['interviews']['length_minutes'], 45)
        made = self.staff.post('/api/hiring/jobs/', {'title': 'Driver', 'slug': 'driver'}, format='json')
        self.assertEqual(made.status_code, 201, made.data)
        job = Job.objects.get(slug='driver')
        self.assertEqual((job.hiring_manager, list(job.interviewers.all())), (self.manager, [self.carrie]))

    def test_graph_backend_passes_attachments(self):
        from django.core.mail import EmailMessage

        from apps.mailbox.backends import GraphEmailBackend
        message = EmailMessage('s', 'b', 'a@example.com', ['b@example.com'])
        message.attach('interview.ics', b'BEGIN:VCALENDAR', 'text/calendar')
        [(name, content, mimetype)] = GraphEmailBackend._attachments(message)
        content = content.decode() if isinstance(content, bytes) else content
        self.assertEqual((name, content, mimetype), ('interview.ics', 'BEGIN:VCALENDAR', 'text/calendar'))


def _signature_data_url() -> str:
    import base64

    import pymupdf
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 240, 80), 0)
    pix.clear_with(255)
    for x in range(20, 220):
        pix.set_pixel(x, 40 + (x % 17) - 8, (20, 20, 20))
    return 'data:image/png;base64,' + base64.b64encode(pix.tobytes('png')).decode()


class OfferTests(Base):
    """Phase 3: make an offer, the link, sign with a finger, the PDF, decline, expire, withdraw."""

    def setUp(self):
        super().setUp()
        Job.objects.filter(slug='retail-associate').update(hiring_manager=self.manager)
        self.turn_on()
        self.apply()
        self.app = Application.objects.get()
        mail.outbox.clear()

    def terms(self, **extra):
        from datetime import timedelta

        from django.utils import timezone
        return {'pay_rate': '16.50', 'start_date': (timezone.localdate() + timedelta(days=6)).isoformat(),
                'start_time': '09:00', 'employment_type': 'part_time', 'schedule': 'Saturdays and two weekdays',
                'note': 'Wear closed-toe shoes.', 'send': True, **extra}

    def make(self, **extra):
        response = self.staff.post(f'/api/hiring/applications/{self.app.pk}/offer/', self.terms(**extra), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def token(self, made):
        return made['link'].split('t=')[1]

    def test_offer_email_review_makes_nothing_until_sent(self):
        from apps.hiring.models import Offer

        url = f'/api/hiring/applications/{self.app.pk}/offer/'
        response = self.staff.post(url, {**self.terms(), 'preview': True}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        draft = response.data['email']
        self.assertEqual((draft['key'], draft['values']['role']), ('offer_sent', 'Retail Associate'))
        self.assertEqual(draft['values']['link'], '(their private link, made when you send)')
        self.assertFalse(Offer.objects.exists())
        self.assertEqual(len(mail.outbox), 0)
        made = self.make(email={'subject': draft['subject'], 'body': draft['body'] + '\nCall me with questions.'})
        self.assertIn(f'/careers/offer?t={self.token(made)}', mail.outbox[0].body)
        self.assertTrue(mail.outbox[0].body.endswith('Call me with questions.'))

    def test_preview_then_make_emails_the_link_and_moves_to_offer(self):
        preview = self.staff.post(f'/api/hiring/applications/{self.app.pk}/offer-preview/', self.terms(), format='json').data
        self.assertIn('Retail Associate', preview['letter'])
        self.assertIn('$16.50 an hour', preview['letter'])
        self.assertIn('at will', preview['letter'])
        self.assertIn('Wear closed-toe shoes.', preview['letter'])
        self.assertEqual(len(preview['acknowledgments']), 4)
        made = self.make()
        self.assertEqual(made['offer']['status'], 'sent')
        self.assertEqual(made['offer']['supervisor_person']['email'], 'boss@example.com')  # the hiring manager
        self.app.refresh_from_db()
        self.assertEqual(self.app.stage, 'offer')
        self.assertIn(f'/careers/offer?t={self.token(made)}', mail.outbox[0].body)

    def test_open_sign_and_get_the_pdf(self):
        import pymupdf

        token = self.token(self.make())
        mail.outbox.clear()
        seen = self.public.get(f'/api/hiring/public/offer/?t={token}').data
        self.assertEqual((seen['status'], seen['position']), ('viewed', 'Retail Associate'))
        bad = self.public.post('/api/hiring/public/offer/sign/', {'t': token, 'name': 'Dana Miles', 'signature': 'x',
                                                                  'acks': [True] * 4, 'consent': True}, format='json')
        self.assertEqual(bad.status_code, 400)
        missing = self.public.post('/api/hiring/public/offer/sign/', {
            't': token, 'name': 'Dana Miles', 'signature': _signature_data_url(), 'acks': [True, True, False, True],
            'consent': True}, format='json')
        self.assertIn('acks', missing.data)
        signed = self.public.post('/api/hiring/public/offer/sign/', {
            't': token, 'name': 'Dana  Q  Miles', 'signature': _signature_data_url(), 'acks': [True] * 4,
            'consent': True}, format='json', HTTP_USER_AGENT='Phone Safari')
        self.assertEqual(signed.status_code, 200, signed.data)
        self.assertEqual((signed.data['status'], signed.data['signer_name']), ('signed', 'Dana Q Miles'))
        from apps.hiring.models import Offer
        offer = Offer.objects.get()
        self.assertEqual(len(offer.letter_sha256), 64)
        self.app.refresh_from_db()
        self.assertEqual(self.app.stage, 'hired')
        welcome, notice = mail.outbox
        self.assertIn('Welcome to Eco-Thrift', welcome.subject)
        self.assertEqual(welcome.attachments[0][2], 'application/pdf')
        self.assertIn('boss@example.com', notice.to)
        pdf = self.public.get(f'/api/hiring/public/offer/pdf/?t={token}')
        raw = b''.join(pdf.streaming_content)
        doc = pymupdf.open(stream=raw, filetype='pdf')
        text = ''.join(page.get_text() for page in doc)
        self.assertEqual(doc.page_count, 2)
        self.assertLess(len(raw), 300_000)  # fonts subset; a full embed was 1.25 MB
        self.assertIn('Signing audit trail', text)
        self.assertIn('Phone Safari', text)
        self.assertIn(offer.letter_sha256, text)
        self.assertTrue(doc[1].get_images())  # the drawn signature
        again = self.public.post('/api/hiring/public/offer/sign/', {'t': token, 'name': 'Dana Miles',
                                 'signature': _signature_data_url(), 'acks': [True] * 4, 'consent': True}, format='json')
        self.assertEqual(again.status_code, 400)
        staff_pdf = self.staff.get(f'/api/hiring/offers/{offer.pk}/pdf/')
        self.assertEqual(staff_pdf.status_code, 200)

    def test_decline_notifies_staff_and_stays_at_offer(self):
        token = self.token(self.make())
        mail.outbox.clear()
        data = self.public.post('/api/hiring/public/offer/decline/', {'t': token, 'reason': 'Took another job'},
                                format='json').data
        self.assertEqual(data['status'], 'declined')
        self.app.refresh_from_db()
        self.assertEqual(self.app.stage, 'offer')
        self.assertIn('declined', mail.outbox[0].subject)
        self.assertIn('Took another job', mail.outbox[0].body)

    def test_expired_withdrawn_and_frozen_text(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.hiring.models import Offer
        made = self.make()
        offer = Offer.objects.get()
        doc = careers.export_doc()
        doc['email']['offer_letter'] = {'subject': 'New', 'body': 'A different letter for {first_name}.'}
        careers.apply_doc(careers.check_doc(doc)['doc'], user=self.manager)
        seen = self.public.get(f'/api/hiring/public/offer/?t={self.token(made)}').data
        self.assertIn('Retail Associate', seen['letter'])  # what was sent never changes
        Offer.objects.filter(pk=offer.pk).update(respond_by=timezone.localdate() - timedelta(days=1))
        self.assertEqual(self.public.get(f'/api/hiring/public/offer/?t={self.token(made)}').data['status'], 'expired')
        second = self.make()
        third = self.make()
        statuses = dict(Offer.objects.values_list('pk', 'status'))
        self.assertEqual(statuses[second['offer']['id']], 'withdrawn')
        self.assertEqual(statuses[third['offer']['id']], 'sent')
        self.assertEqual(self.public.get(f'/api/hiring/public/offer/?t={self.token(second)}').status_code, 404)
        withdrawn = self.staff.post(f'/api/hiring/offers/{third["offer"]["id"]}/withdraw/', {}, format='json')
        self.assertEqual(withdrawn.data['status'], 'withdrawn')

    def test_bad_terms_are_refused(self):
        response = self.staff.post(f'/api/hiring/applications/{self.app.pk}/offer/',
                                   {'pay_rate': 'lots', 'start_date': '2020-01-01'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertTrue({'pay_rate', 'start_date'} <= set(response.data))


class PracticeTests(Base):
    """Practice runs: placeholders for blanks, [Practice] on every email, free interview times, no employee, clean-up."""

    def setUp(self):
        super().setUp()
        Job.objects.filter(slug='retail-associate').update(hiring_manager=self.manager)
        self.key = careers.preview_key()

    def practice(self, **data):
        response = self.staff.post('/api/hiring/applications/practice/', {'job': self.retail.pk, **data}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return Application.objects.get(pk=response.data['id'])

    def test_dash_practice_run_fills_the_blanks_and_tags_the_emails(self):
        app = self.practice(email='carrie@example.com')
        self.assertTrue(app.is_practice)
        self.assertEqual((app.first_name, app.last_name, app.phone), ('Practice', 'Applicant', '402-555-0100'))
        self.assertEqual(app.red_flags, 0)
        flags = [a for a in app.answers if a.get('must_be')]
        self.assertTrue(flags and all(a['ok'] for a in flags))
        self.assertTrue(all(a['answer'] not in (None, '', []) for a in app.answers if a['key'] == 'why_us'))
        to_applicant = next(m for m in mail.outbox if m.to == ['carrie@example.com'])
        alert = next(m for m in mail.outbox if 'boss@example.com' in m.to)
        for message in (to_applicant, alert):
            self.assertTrue(message.subject.startswith('[Practice] '), message.subject)
            self.assertTrue(message.body.startswith('PRACTICE RUN'))
        self.practice()
        listed = self.staff.get('/api/hiring/applications/counts/').data
        self.assertEqual(listed['practice'], 2)
        self.assertEqual((listed['counts']['new'], listed['counts']['open'], listed['counts']['all']), (2, 2, 2))

    def test_practice_link_skips_every_required_field_even_while_hidden(self):
        seen = self.public.get(f'/api/hiring/public/careers/?practice={self.key}').data
        self.assertTrue(seen['public'] and seen['practice'])
        import time
        response = self.public.post('/api/hiring/public/apply/', {
            'first_name': 'Carrie', 'practice': self.key, 'answers': '{}', 'started_at': str(int(time.time() * 1000)),
        }, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        app = Application.objects.get()
        self.assertTrue(app.is_practice)
        self.assertEqual((app.first_name, app.last_name, app.email), ('Carrie', 'Applicant', ''))
        self.assertEqual(app.jobs.count(), 1)
        self.assertEqual(app.red_flags, 0)
        stale = self.public.post('/api/hiring/public/apply/', {'first_name': 'X', 'practice': 'old-key'},
                                 format='multipart')
        self.assertEqual(stale.status_code, 400)

    def test_practice_interviews_never_block_a_real_time(self):
        from apps.hiring import interviews
        app = self.practice()
        start = interviews.open_times()[0][0]
        interviews.book(app, start.isoformat(), by=self.manager)
        self.assertIn(start, [s for s, _ in interviews.open_times()])

    def test_no_employee_a_stamped_pdf_and_one_button_clears_it_all(self):
        from datetime import timedelta

        import pymupdf
        from django.utils import timezone
        app = self.practice(email='carrie@example.com')
        refused = self.staff.post(f'/api/hiring/applications/{app.pk}/create-employee/', {'pay_rate': '15'},
                                  format='json')
        self.assertEqual(refused.status_code, 400)
        made = self.staff.post(f'/api/hiring/applications/{app.pk}/offer/', {
            'pay_rate': '15.00', 'start_date': (timezone.localdate() + timedelta(days=5)).isoformat(), 'send': False,
        }, format='json').data
        token = made['link'].split('t=')[1]
        self.assertTrue(self.public.get(f'/api/hiring/public/offer/?t={token}').data['practice'])
        signed = self.public.post('/api/hiring/public/offer/sign/', {
            't': token, 'name': 'Carrie Practice', 'signature': _signature_data_url(), 'acks': [True] * 4,
            'consent': True}, format='json')
        self.assertEqual(signed.status_code, 200, signed.data)
        raw = b''.join(self.public.get(f'/api/hiring/public/offer/pdf/?t={token}').streaming_content)
        text = ''.join(page.get_text() for page in pymupdf.open(stream=raw, filetype='pdf'))
        self.assertIn('PRACTICE RUN', text)
        self.turn_on()
        self.apply()  # a real applicant stays
        cleared = self.staff.post('/api/hiring/applications/practice-clear/', {}, format='json').data
        self.assertEqual(cleared['deleted'], 1)
        self.assertEqual(list(Application.objects.values_list('first_name', flat=True)), ['Dana'])


class OnboardingTests(Base):
    """Phase 4: Start onboarding, the first-day email, the checklist, auto items, the I-9 (Admin) and the handbook."""

    def setUp(self):
        super().setUp()
        self.owner = _user('owner@example.com', 'Admin')
        self.admin = APIClient()
        self.admin.force_authenticate(self.owner)
        self.turn_on()
        self.apply()
        self.app = Application.objects.get()
        mail.outbox.clear()

    def hire(self, **extra):
        response = self.staff.post(f'/api/hiring/applications/{self.app.pk}/create-employee/', {
            'pay_rate': '15.00', 'start_date': '2026-10-16', 'start_time': '10:00', 'position': 'Retail Associate',
            'start_onboarding': True, 'send_first_day': True, **extra}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.new_hire = User.objects.get(email='dana@example.com')
        self.me = APIClient()
        self.me.force_authenticate(self.new_hire)
        self.app.refresh_from_db()
        return response.data

    def detail(self, client=None):
        oid = self.app.onboarding.pk
        return (client or self.staff).get(f'/api/hiring/onboarding/{oid}/').data

    def task(self, key, data=None):
        return next(t for t in (data or self.detail())['tasks'] if t['key'] == key)

    def test_first_day_email_review_creates_nobody_until_sent(self):
        from apps.hiring.models import Onboarding

        response = self.staff.post(f'/api/hiring/applications/{self.app.pk}/create-employee/', {
            'pay_rate': '15.00', 'start_date': '2026-10-16', 'start_time': '10:00', 'position': 'Retail Associate',
            'start_onboarding': True, 'send_first_day': True, 'preview': True}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        draft = response.data['email']
        self.assertEqual((draft['key'], draft['values']['start_time']), ('first_day', '10:00 AM'))
        self.assertFalse(User.objects.filter(email='dana@example.com').exists())
        self.assertFalse(Onboarding.objects.exists())
        self.assertEqual(len(mail.outbox), 0)
        self.hire(email={'skip': True})
        self.assertEqual(len(mail.outbox), 0)
        self.assertTrue(self.app.events.filter(text__startswith='First-day email not sent').exists())

    def test_create_employee_starts_onboarding_and_sends_the_first_day_email(self):
        from datetime import date

        made = self.hire()
        self.assertTrue(made['first_day_sent'])
        self.assertTrue(made['username'])
        self.assertFalse(self.new_hire.has_usable_password())
        self.assertEqual(len(mail.outbox), 1)  # the first-day email only; no password email (D16)
        first = mail.outbox[0]
        self.assertIn('first day', first.subject.lower())
        self.assertIn('List A', first.body)
        self.assertIn('Friday, October 16 at 10:00 AM', first.body)
        data = self.detail()
        self.assertEqual(data['status'], 'active')
        self.assertEqual(data['total'], len(careers.DEFAULT_ONBOARDING['items']))
        self.assertEqual(str(self.task('i9_section2', data)['due_date']), str(date(2026, 10, 21)))
        self.assertEqual(str(self.task('quickbooks_added', data)['due_date']), str(date(2026, 10, 15)))
        summary = self.staff.get(f'/api/hiring/applications/{self.app.pk}/').data['onboarding']
        self.assertEqual((summary['done'], summary['total']), (0, data['total']))

    def test_ticks_counts_and_the_items_dash_sees_itself(self):
        self.hire()
        oid = self.app.onboarding.pk
        qb = self.task('quickbooks_added')
        self.assertEqual(self.staff.post(f'/api/hiring/onboarding/{oid}/tasks/{qb["id"]}/', {'status': 'done'},
                                         format='json').status_code, 200)
        shirts = self.task('shirts')
        bad = self.staff.post(f'/api/hiring/onboarding/{oid}/tasks/{shirts["id"]}/', {'status': 'done'}, format='json')
        self.assertEqual(bad.status_code, 400)
        good = self.staff.post(f'/api/hiring/onboarding/{oid}/tasks/{shirts["id"]}/',
                               {'status': 'done', 'data': {'count': 2, 'size': 'L'}}, format='json').data
        self.assertEqual(self.task('shirts', good)['data'], {'count': 2, 'size': 'L'})
        # The new hire: their own tick items only, and the emergency contact.
        mine = self.me.get('/api/hiring/me/onboarding/').data
        self.assertEqual(mine['onboarding']['id'], oid)
        trained = self.task('trained', mine['onboarding'])
        self.assertEqual(self.me.post(f'/api/hiring/me/onboarding/tasks/{trained["id"]}/', {'status': 'done'},
                                      format='json').status_code, 403)
        setup = self.task('quickbooks_setup', mine['onboarding'])
        self.assertEqual(self.me.post(f'/api/hiring/me/onboarding/tasks/{setup["id"]}/', {'status': 'done'},
                                      format='json').status_code, 200)
        ice = self.me.post('/api/hiring/me/emergency-contact/', {'name': 'Pat Miles', 'phone': '402-555-0123'},
                           format='json').data
        self.assertEqual(self.task('emergency_contact', ice['onboarding'])['status'], 'done')
        # Clock-in, badge, sign-in and schedule come from the rest of Dash.
        from django.utils import timezone

        from apps.hr.models import Department, Shift, ShiftAssignment, TimeEntry
        TimeEntry.objects.create(employee=self.new_hire, date=timezone.localdate(), clock_in=timezone.now())
        profile = self.new_hire.employee
        profile.badge_issued_at = timezone.now()
        profile.save(update_fields=['badge_issued_at'])
        self.new_hire.set_password('a-long-pass-123')
        self.new_hire.last_login = timezone.now()
        self.new_hire.save()
        dept = Department.objects.first() or Department.objects.create(name='Retail Test', slug='retail-test')
        shift = Shift.objects.create(name='Open test', department=dept, time_in='09:00', time_out='15:00',
                                     weekdays=[5])
        ShiftAssignment.objects.create(employee=self.new_hire, shift=shift, weekdays=[5])
        data = self.detail()
        for key in ('first_clock_in', 'kiosk_badge', 'dash_login', 'schedule'):
            self.assertEqual((key, self.task(key, data)['status'], self.task(key, data)['done_by']), (key, 'done', 'Dash'))

    def test_the_i9_is_admin_only_and_section_2_needs_the_form(self):
        self.hire()
        oid = self.app.onboarding.pk
        self.assertEqual(self.staff.get(f'/api/hiring/onboarding/{oid}/i9/').status_code, 403)
        self.assertFalse(self.detail()['i9']['can_open'])
        early = self.admin.post(f'/api/hiring/onboarding/{oid}/i9/section2/', {'documents_seen': 'List A passport'},
                                format='json')
        self.assertEqual(early.status_code, 400)
        scan = SimpleUploadedFile('i9.pdf', b'%PDF-1.4 i9 form', content_type='application/pdf')
        up = self.admin.post(f'/api/hiring/onboarding/{oid}/i9/files/', {'file': scan, 'kind': 'form'},
                             format='multipart')
        self.assertEqual(up.status_code, 201, up.data)
        self.assertEqual(len(up.data['files']), 1)
        word = SimpleUploadedFile('i9.docx', b'PK\x03\x04 word file', content_type='application/msword')
        self.assertEqual(self.admin.post(f'/api/hiring/onboarding/{oid}/i9/files/', {'file': word},
                                         format='multipart').status_code, 400)
        done = self.admin.post(f'/api/hiring/onboarding/{oid}/i9/section2/', {'documents_seen': 'List A passport'},
                               format='json')
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(str(done.data['keep_until']), '2029-10-16')
        self.assertEqual(self.task('i9_section2')['status'], 'done')
        locked = self.admin.delete(f'/api/hiring/onboarding/{oid}/i9/files/{up.data["files"][0]["id"]}/')
        self.assertEqual(locked.status_code, 400)

    def test_the_handbook_waits_for_its_confirm_marks_then_is_signed_once(self):
        import pymupdf

        self.hire()
        marked = {'title': 'Staff handbook', 'text': '## Pay\n[confirm: which day?]', 'acknowledgment': 'I read it.'}
        careers.apply_doc(careers.check_doc({'format': careers.FORMAT, 'handbook': marked})['doc'], user=self.owner)
        blocked = self.admin.post('/api/hiring/handbook/publish/', {}, format='json')
        self.assertEqual(blocked.status_code, 400)
        self.assertIn('confirm', str(blocked.data['detail']))
        draft = {'title': 'Staff handbook', 'text': '## Welcome\nHello.\n\n## Safety\n- Lift with help.',
                 'acknowledgment': 'I read it.'}
        checked = careers.check_doc({'format': careers.FORMAT, 'handbook': draft})
        self.assertTrue(checked['ok'], checked['errors'])
        careers.apply_doc(checked['doc'], user=self.owner)
        self.assertEqual(self.staff.post('/api/hiring/handbook/publish/', {}, format='json').status_code, 403)
        published = self.admin.post('/api/hiring/handbook/publish/', {}, format='json')
        self.assertEqual(published.status_code, 201, published.data)
        self.assertEqual(published.data['version'], 1)
        self.assertEqual(self.admin.post('/api/hiring/handbook/publish/', {}, format='json').status_code, 400)
        mine = self.me.get('/api/hiring/me/onboarding/').data
        self.assertEqual(mine['handbook']['version'], 1)
        missing = self.me.post('/api/hiring/me/handbook/sign/', {
            'name': 'Dana Miles', 'signature': _signature_data_url(), 'acknowledged': True}, format='json')
        self.assertIn('consent', missing.data)
        body = {'name': 'Dana Miles', 'signature': _signature_data_url(), 'acknowledged': True, 'consent': True}
        signed = self.me.post('/api/hiring/me/handbook/sign/', body, format='json')
        self.assertEqual(signed.status_code, 201, signed.data)
        self.assertEqual(self.task('handbook', signed.data['onboarding'])['status'], 'done')
        self.assertEqual(self.me.post('/api/hiring/me/handbook/sign/', body, format='json').status_code, 400)
        sig = self.detail()['handbook']['signature']
        raw = b''.join(self.staff.get(f'/api/hiring/handbook/signatures/{sig}/pdf/').streaming_content)
        text = ''.join(page.get_text() for page in pymupdf.open(stream=raw, filetype='pdf'))
        self.assertIn('Lift with help.', text)
        self.assertIn('Signing audit trail', text)

    def test_done_when_nothing_is_left_and_a_set_password_code_for_day_one(self):
        self.hire()
        oid = self.app.onboarding.pk
        link = self.staff.post(f'/api/hiring/onboarding/{oid}/set-password-link/', {}, format='json')
        self.assertEqual(link.status_code, 200, link.data)
        self.assertIn('set=1', link.data['link'])
        for task in self.detail()['tasks']:
            self.staff.post(f'/api/hiring/onboarding/{oid}/tasks/{task["id"]}/', {'status': 'skipped'}, format='json')
        self.assertEqual(self.detail()['status'], 'done')
        self.assertEqual(self.staff.get('/api/hiring/onboarding/?status=done').data[0]['id'], oid)

    def test_three_business_days_skip_the_weekend(self):
        from datetime import date

        from apps.hiring.onboarding import add_business_days, due_date_for
        self.assertEqual(add_business_days(date(2026, 10, 16), 3), date(2026, 10, 21))  # Fri → Wed
        self.assertEqual(due_date_for('day20', date(2026, 10, 16)), date(2026, 11, 5))


class CheckInTests(OnboardingTests):
    """Phase 5: 30/60/90-day check-ins, made with onboarding, filled in a meeting, signed by both, read by the hire."""

    def test_onboarding_makes_three_check_ins_with_the_manager(self):
        from apps.hiring.models import CheckIn

        Job.objects.filter(slug='retail-associate').update(hiring_manager=self.manager)
        self.hire()
        rows = list(CheckIn.objects.filter(user=self.new_hire).order_by('day'))
        self.assertEqual([(c.day, str(c.due_date)) for c in rows],
                         [(30, '2026-11-15'), (60, '2026-12-15'), (90, '2027-01-14')])
        self.assertTrue(all(c.manager_id == self.manager.pk for c in rows))  # the role's hiring manager
        mine = self.me.get('/api/hiring/me/checkins/').data
        self.assertEqual([c['day'] for c in mine], [30, 60, 90])
        self.assertNotIn('answers', mine[0])  # nothing to read until it is signed

    def fill_and_sign(self, row_id, **extra):
        filled = self.staff.patch(f'/api/hiring/checkins/{row_id}/', {
            'answers': {'questions': {'going_well': 'Great with customers.', 'goals': 'Learn pricing.'},
                        'areas': {'Learning the role': {'rating': 'On track', 'note': 'Picking it up fast.'}}},
            'employee_comments': 'Happy here.'}, format='json')
        self.assertEqual(filled.status_code, 200, filled.data)
        return self.staff.post(f'/api/hiring/checkins/{row_id}/sign/', {
            'manager_name': 'Test Manager', 'manager_signature': _signature_data_url(),
            'employee_name': 'Dana Miles', 'employee_signature': _signature_data_url(), 'acknowledged': True, **extra,
        }, format='json')

    def test_fill_sign_lock_and_the_employee_reads_it(self):
        import pymupdf

        from apps.hiring.models import CheckIn
        self.hire()
        first = CheckIn.objects.get(user=self.new_hire, day=30)
        bad = self.staff.patch(f'/api/hiring/checkins/{first.pk}/', {
            'answers': {'areas': {'Learning the role': {'rating': 'Superb'}}}}, format='json')
        self.assertEqual(bad.status_code, 400)
        empty = self.staff.post(f'/api/hiring/checkins/{first.pk}/sign/', {
            'manager_name': 'Test Manager', 'manager_signature': _signature_data_url(), 'employee_name': 'Dana Miles',
            'employee_signature': _signature_data_url(), 'acknowledged': True}, format='json')
        self.assertIn('answers', empty.data)
        signed = self.fill_and_sign(first.pk)
        self.assertEqual(signed.status_code, 200, signed.data)
        self.assertEqual(signed.data['status'], 'done')
        self.assertFalse(signed.data['close_onboarding'])  # not the last one
        again = self.staff.patch(f'/api/hiring/checkins/{first.pk}/', {'employee_comments': 'changed'}, format='json')
        self.assertEqual(again.status_code, 400)
        mine = self.me.get('/api/hiring/me/checkins/').data
        self.assertEqual(mine[0]['answers']['questions']['going_well'], 'Great with customers.')
        raw = b''.join(self.me.get(f'/api/hiring/checkins/{first.pk}/pdf/').streaming_content)
        text = ''.join(p.get_text() for p in pymupdf.open(stream=raw, filetype='pdf'))
        for needed in ('Great with customers.', 'On track', 'Happy here.', 'Signing audit trail', 'Dana Miles'):
            self.assertIn(needed, text)
        other = _user('other@example.com', 'Employee')
        stranger = APIClient()
        stranger.force_authenticate(other)
        self.assertEqual(stranger.get(f'/api/hiring/checkins/{first.pk}/pdf/').status_code, 404)

    def test_the_last_check_in_can_close_onboarding(self):
        from apps.hiring.models import CheckIn
        self.hire()
        last = CheckIn.objects.get(user=self.new_hire, day=90)
        signed = self.fill_and_sign(last.pk, close_onboarding=True)
        self.assertEqual(signed.status_code, 200, signed.data)
        self.assertTrue(signed.data['close_onboarding'])
        data = self.detail()
        self.assertEqual(data['status'], 'done')
        self.assertTrue(all(t['status'] != 'open' for t in data['tasks']))

    def test_due_list_skip_and_the_brief_line(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.core.services.context_snapshot import build_snapshot
        from apps.hiring.models import CheckIn
        self.hire()
        first = CheckIn.objects.get(user=self.new_hire, day=30)
        first.due_date = timezone.localdate() - timedelta(days=1)
        first.save()
        due = self.staff.get('/api/hiring/checkins/').data
        self.assertEqual([(c['id'], c['overdue']) for c in due], [(first.pk, True)])
        hiring = build_snapshot()['hiring']
        self.assertEqual(hiring['checkins_due'][0]['day'], 30)
        self.assertTrue(hiring['checkins_due'][0]['overdue'])
        self.assertEqual(self.staff.post(f'/api/hiring/checkins/{first.pk}/skip/', {}, format='json').status_code, 400)
        skipped = self.staff.post(f'/api/hiring/checkins/{first.pk}/skip/', {'reason': 'Left the job'}, format='json')
        self.assertEqual(skipped.data['status'], 'skipped')
        self.assertEqual(self.staff.get('/api/hiring/checkins/').data, [])


class SeedDemoTests(Base):
    """The dev seed builds every hiring stage and clears itself, and refuses to run without DEBUG."""

    def test_seed_builds_clears_and_stays_off_production(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError

        from apps.hiring.models import CheckIn, Onboarding

        _user('owner@example.com', 'Admin').__class__.objects.filter(email='owner@example.com').update(is_superuser=True)
        with self.assertRaises(CommandError):
            call_command('seed_hiring_demo')
        with override_settings(DEBUG=True):
            call_command('seed_hiring_demo')
            seeded = Application.objects.filter(email__endswith='@seed.example.test')
            self.assertEqual(seeded.count(), 11)
            self.assertEqual(set(seeded.values_list('stage', flat=True)),
                             {'new', 'reviewed', 'contacted', 'interview_scheduled', 'interviewed', 'offer', 'not_now',
                              'hired'})
            self.assertEqual(Onboarding.objects.filter(user__email__endswith='@seed.example.test').count(), 3)
            self.assertEqual(CheckIn.objects.filter(status='done').count(), 2)
            self.assertEqual(len(mail.outbox), 0)
            call_command('seed_hiring_demo', clear=True)
            self.assertFalse(Application.objects.filter(email__endswith='@seed.example.test').exists())
