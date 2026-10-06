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
        self.assertEqual((draft['subject'], draft['body']), ('Retail: thanks', 'Hi Dana.'))

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
