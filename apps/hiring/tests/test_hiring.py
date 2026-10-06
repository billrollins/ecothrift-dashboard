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
        self.assertIn('Retail Associate position has been filled', draft['body'])
        response = self.staff.post(f'/api/hiring/applications/{self.app.pk}/not-now/', {
            'reason': 'position_closed', 'send': True, 'subject': draft['subject'], 'body': draft['body'] + '\nThanks!',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertTrue(mail.outbox[0].body.endswith('Thanks!'))
        self.app.refresh_from_db()
        self.assertEqual(self.app.not_now_email_status, 'sent')
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

    def test_careers_get_lists_models_and_ai_draft_uses_the_choice(self):
        from unittest import mock

        from apps.core.models import AiModel
        AiModel.objects.create(slug='test-model-1', label='Test model', provider='anthropic')
        info = self.staff.get('/api/hiring/careers/').data
        self.assertIn('test-model-1', [m['slug'] for m in info['ai']['models']])
        self.assertIn('high', info['ai']['efforts'])
        doc = json.dumps(careers.export_doc())
        with mock.patch('apps.core.services.llm_router.llm_chat_text', return_value=(doc, 'test-model-1')) as llm:
            response = self.staff.post('/api/hiring/careers/ai-draft/',
                                       {'request': 'No changes', 'model': 'test-model-1', 'effort': 'high'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((llm.call_args.kwargs['model_override'], llm.call_args.kwargs['effort']), ('test-model-1', 'high'))
        self.assertIn('Indexes:', llm.call_args.kwargs['user'])
        self.assertEqual(response.data['changes'], [])
        bad = self.staff.post('/api/hiring/careers/ai-draft/', {'request': 'x', 'model': 'not-a-model'}, format='json')
        self.assertEqual(bad.status_code, 400)
