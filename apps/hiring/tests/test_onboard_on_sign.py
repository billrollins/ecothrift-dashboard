"""Owner 2026-10-20: signing an offer starts everything; the catch-up request; the new checklist; levels at 90 days."""
from datetime import timedelta
from decimal import Decimal

from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import EmployeeProfile, User
from apps.core.models import AppSetting, ApprovalRequest
from apps.core.services import approval_requests as requests_service
from apps.hiring import careers, offers
from apps.hiring.models import (
    Application, ApplicationEvent, CheckIn, Job, Offer, Onboarding, OnboardingTask,
)
from apps.hiring.tests import test_hiring as th


class SignBase(th.Base):
    def setUp(self):
        super().setUp()
        Job.objects.filter(slug='retail-associate').update(hiring_manager=self.manager)
        self.turn_on()
        self.apply()
        self.app = Application.objects.get()
        mail.outbox.clear()

    def terms(self, **extra):
        return {'pay_rate': '16.50', 'start_date': (timezone.localdate() + timedelta(days=6)).isoformat(),
                'start_time': '09:00', 'employment_type': 'part_time', 'send': True, **extra}

    def make(self, app=None, **extra):
        app = app or self.app
        response = self.staff.post(f'/api/hiring/applications/{app.pk}/offer/', self.terms(**extra), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def sign(self, made):
        token = made['link'].split('t=')[1]
        mail.outbox.clear()  # the offer link email was sent when the offer was made
        response = self.public.post('/api/hiring/public/offer/sign/', {
            't': token, 'name': 'Dana Miles', 'signature': th._signature_data_url(), 'acks': [True] * 4,
            'consent': True}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return response


@override_settings(STORAGES=th.IN_MEMORY)
class SigningStartsEverythingTests(SignBase):
    def test_signed_offer_makes_the_login_the_onboarding_and_one_first_day_email(self):
        self.sign(self.make(level='senior'))
        self.app.refresh_from_db()
        self.assertEqual(self.app.stage, 'hired')
        user = User.objects.get(email='dana@example.com')
        self.assertEqual(self.app.employee_user_id, user.pk)
        profile = user.employee
        self.assertEqual((profile.pay_rate, profile.employment_type, profile.level),
                         (Decimal('16.50'), 'part_time', 'senior'))
        self.assertEqual(profile.position, 'Retail Associate')
        self.assertEqual(profile.hire_date, timezone.localdate() + timedelta(days=6))
        self.assertEqual(profile.department_id, Job.objects.get(slug='retail-associate').department_id)
        self.assertFalse(user.has_usable_password())  # a Set password code on day one, never an emailed password
        onboarding = Onboarding.objects.get()
        self.assertEqual((onboarding.application_id, onboarding.manager_id, str(onboarding.start_time)),
                         (self.app.pk, self.manager.pk, '09:00:00'))
        self.assertEqual(onboarding.start_date, profile.hire_date)
        self.assertEqual(onboarding.tasks.count(), len(careers.DEFAULT_ONBOARDING['items']))
        self.assertEqual(CheckIn.objects.filter(onboarding=onboarding).count(), 3)
        self.assertEqual(onboarding.tasks.get(key='first_day_email').status, 'done')
        first_day = [m for m in mail.outbox if 'first day' in m.subject.lower()]
        self.assertEqual(len(first_day), 1)
        self.assertEqual(first_day[0].to, ['dana@example.com'])
        self.assertEqual(len(mail.outbox), 3)  # welcome, the staff notice, the first-day email
        self.assertTrue(self.app.events.filter(kind='employee', text__startswith='Onboarding started').exists())

    def test_without_a_level_it_is_the_level_the_pay_falls_in(self):
        self.sign(self.make(pay_rate='18.50'))
        self.assertEqual(User.objects.get(email='dana@example.com').employee.level, 'senior')

    def test_a_signature_never_fails_because_the_start_could_not_happen(self):
        User.objects.create_user(email='dana@example.com', first_name='Other', last_name='Dana', password='x')
        made = self.make()
        response = self.sign(made)
        self.assertEqual(response.data['status'], 'signed')
        self.app.refresh_from_db()
        self.assertEqual(self.app.stage, 'hired')
        self.assertIsNone(self.app.employee_user_id)
        self.assertFalse(Onboarding.objects.exists())
        blocked = self.app.events.get(data__auto_start='blocked')
        self.assertIn('already uses dana@example.com', blocked.text)
        self.assertIn('Use Create employee and Start onboarding', blocked.text)
        self.assertFalse([m for m in mail.outbox if 'first day' in m.subject.lower()])

    def test_no_email_blocks_the_start_but_the_offer_signs(self):
        Application.objects.filter(pk=self.app.pk).update(email='')
        self.app.refresh_from_db()
        offer, link, _ = offers.make(self.app, self.terms(), by=self.manager, send=False)
        self.sign({'link': link})
        self.app.refresh_from_db()
        self.assertEqual((self.app.stage, self.app.employee_user_id), ('hired', None))
        self.assertIn('Add an email address first', self.app.events.get(data__auto_start='blocked').text)
        offer.refresh_from_db()
        self.assertEqual(offer.status, 'signed')

    def test_onboarding_that_cannot_start_leaves_the_login_and_says_so(self):
        from unittest import mock

        from rest_framework.exceptions import ValidationError

        with mock.patch('apps.hiring.onboarding.start', side_effect=ValidationError({'detail': 'No room.'})):
            self.sign(self.make())
        self.app.refresh_from_db()
        self.assertIsNotNone(self.app.employee_user_id)  # the manual Start onboarding button still works
        self.assertFalse(Onboarding.objects.exists())
        self.assertIn('login was made, but onboarding did not start: No room',
                      self.app.events.get(data__auto_start='blocked').text)
        response = self.staff.post('/api/hiring/onboarding/', {'application': self.app.pk, 'send_email': False},
                                   format='json')
        self.assertEqual(response.status_code, 201, response.data)

    def test_a_practice_applicant_gets_no_login_and_no_email(self):
        from apps.hiring import services

        practice = services.create_practice(job=Job.objects.get(slug='retail-associate'), first_name='Pat',
                                            email='pat@example.com', by=self.manager)
        made = self.make(app=practice, send=False)
        mail.outbox.clear()
        self.sign(made)
        practice.refresh_from_db()
        self.assertEqual(practice.stage, 'hired')
        self.assertIsNone(practice.employee_user_id)
        self.assertFalse(User.objects.filter(email='pat@example.com').exists())
        self.assertFalse(Onboarding.objects.exists())
        self.assertFalse(practice.events.filter(data__auto_start='blocked').exists())
        self.assertFalse([m for m in mail.outbox if 'first day' in m.subject.lower()])


@override_settings(STORAGES=th.IN_MEMORY)
class CatchUpHiresTests(SignBase):
    def stale_hire(self):
        """A hire whose offer was signed before signing started anything."""
        offer, _, _ = offers.make(self.app, self.terms(), by=self.manager, send=False)
        offers.sign(offer, name='Dana Miles', signature=th._signature_data_url(), acks=[True] * 4, consent=True,
                    ip='127.0.0.1', user_agent='test', auto_start=False)
        self.app.refresh_from_db()
        self.assertEqual((self.app.stage, self.app.employee_user_id), ('hired', None))
        mail.outbox.clear()
        return offer

    def run_request(self, **params):
        owner = th._user('owner2@example.com', 'Admin')
        request = requests_service.stage('hiring.catch_up_hires', title='Catch up', params=params)
        requests_service.approve(request, owner, start=False)
        requests_service.run(request.pk)
        request.refresh_from_db()
        return request

    def test_preview_lists_who_and_what_without_changing_anything(self):
        self.stale_hire()
        ashley = th._user('ashley@example.com', 'Employee')
        EmployeeProfile.objects.create(user=ashley, employee_number='EMP-900', hire_date=timezone.localdate())
        request = requests_service.stage('hiring.catch_up_hires', title='Catch up', params={
            'overtime': [{'employee': 'ashley@example.com', 'hours': 5}, {'employee': 'nobody@example.com', 'hours': 5}]})
        preview = request.preview
        self.assertEqual(preview['counts']['Hires to start'], 1)
        self.assertEqual(preview['counts']['First-day emails to send'], 1)
        self.assertEqual(preview['counts']['Overtime allowances to set'], 1)
        text = '\n'.join(preview['changes'])
        self.assertIn('Dana Miles (dana@example.com)', text)
        self.assertIn('Retail Associate; $16.50 an hour; part time', text)
        self.assertIn('first-day email', text)
        self.assertIn('may work 5 hours past 40', text)
        self.assertIn('Overtime problem: overtime for nobody@example.com: no employee found', text)
        self.assertEqual(preview['sample'][0]['who'], 'Dana Miles')
        self.assertFalse(Onboarding.objects.exists())
        self.assertFalse(User.objects.filter(email='dana@example.com').exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_apply_starts_the_hire_sets_overtime_and_a_second_run_does_nothing(self):
        self.stale_hire()
        ashley = th._user('ashley@example.com', 'Employee')
        EmployeeProfile.objects.create(user=ashley, employee_number='EMP-900', hire_date=timezone.localdate())
        request = self.run_request(overtime=[{'employee': ashley.pk, 'hours': 5}])
        self.assertEqual(request.status, ApprovalRequest.STATUS_APPLIED, request.error)
        self.assertEqual(request.result['started'], ['Dana Miles'])
        self.assertEqual(request.result['blocked'], [])
        self.app.refresh_from_db()
        self.assertIsNotNone(self.app.employee_user_id)
        self.assertEqual(Onboarding.objects.count(), 1)
        self.assertEqual(len([m for m in mail.outbox if 'first day' in m.subject.lower()]), 1)
        ashley.employee.refresh_from_db()
        self.assertEqual(ashley.employee.overtime_allowance_hours, Decimal('5'))
        again = requests_service.stage('hiring.catch_up_hires', title='Again')
        self.assertEqual(again.preview['counts']['Hires to start'], 0)
        self.assertIn('Nobody is waiting', again.preview['changes'][0])

    def test_practice_applicants_and_blocked_ones_are_not_touched(self):
        from apps.hiring import services

        practice = services.create_practice(job=Job.objects.get(slug='retail-associate'), first_name='Pat',
                                            email='pat@example.com', by=self.manager)
        offer, _, _ = offers.make(practice, self.terms(), by=self.manager, send=False)
        offers.sign(offer, name='Pat Practice', signature=th._signature_data_url(), acks=[True] * 4, consent=True,
                    ip=None, user_agent='', auto_start=False)
        self.stale_hire()
        User.objects.create_user(email='dana@example.com', first_name='Other', last_name='Dana', password='x')
        request = requests_service.stage('hiring.catch_up_hires', title='Catch up')
        self.assertEqual(request.preview['counts']['Blocked (will be skipped)'], 1)
        self.assertEqual(request.preview['counts']['Hires to start'], 0)
        self.assertIn('BLOCKED: a Dash account already uses dana@example.com', request.preview['sample'][0]['will'])
        self.assertEqual(len(request.preview['sample']), 1)  # no row for the practice applicant
        applied = self.run_request()
        self.assertEqual(applied.status, ApprovalRequest.STATUS_APPLIED)
        self.assertEqual(len(applied.result['blocked']), 1)
        self.assertFalse(Onboarding.objects.exists())
        practice.refresh_from_db()
        self.assertIsNone(practice.employee_user_id)


@override_settings(STORAGES=th.IN_MEMORY)
class ChecklistTests(SignBase):
    ORDER = ['handbook', 'i9_section1', 'i9_section2', 'schedule', 'shirts', 'first_day_email', 'quickbooks_added',
             'quickbooks_setup', 'whatsapp', 'dash_login', 'first_payroll', 'checkin_30', 'checkin_60', 'checkin_90']

    def test_the_default_checklist_is_the_owners_list_in_order_then_the_rest(self):
        keys = [i['key'] for i in careers.DEFAULT_ONBOARDING['items']]
        self.assertEqual(keys[:len(self.ORDER)], self.ORDER)
        self.assertEqual(keys[len(self.ORDER):], ['emergency_contact', 'time_clock', 'kiosk_badge', 'first_clock_in',
                                                  'team_intro', 'trained', 'new_hire_report'])
        by_key = {i['key']: i for i in careers.DEFAULT_ONBOARDING['items']}
        self.assertEqual(by_key['shirts']['label'], 'Got 2 T-shirts')
        self.assertEqual((by_key['first_payroll']['owner'], by_key['first_payroll']['due']), ('owner', 'week3'))
        self.assertEqual(by_key['whatsapp']['owner'], 'manager')
        for key, day in (('checkin_30', 'day30'), ('checkin_60', 'day60'), ('checkin_90', 'day90')):
            self.assertEqual((by_key[key]['owner'], by_key[key]['due'], by_key[key]['auto']), ('owner', day, key))
        self.assertTrue(careers.check_doc(careers.export_doc())['ok'])  # the file round-trips with the new autos

    def test_tasks_start_in_that_order_with_the_new_due_dates(self):
        self.sign(self.make())
        onboarding = Onboarding.objects.get()
        tasks = list(onboarding.tasks.order_by('sort'))
        self.assertEqual([t.key for t in tasks][:len(self.ORDER)], self.ORDER)
        start = onboarding.start_date
        due = {t.key: t.due_date for t in tasks}
        self.assertEqual(due['first_payroll'], start + timedelta(days=21))
        self.assertEqual((due['checkin_30'], due['checkin_60'], due['checkin_90']),
                         (start + timedelta(days=30), start + timedelta(days=60), start + timedelta(days=90)))

    def test_checkin_items_tick_when_signed_or_skipped_and_the_30_day_one_by_hand(self):
        from apps.hiring import checkins, onboarding as service

        self.sign(self.make())
        onboarding = Onboarding.objects.get()
        by_key = lambda key: OnboardingTask.objects.get(onboarding=onboarding, key=key)  # noqa: E731
        self.assertEqual([by_key(k).status for k in ('checkin_30', 'checkin_60', 'checkin_90')], ['open'] * 3)
        # The 60-day one is skipped with a reason; the 30-day one is signed.
        checkins.skip(CheckIn.objects.get(onboarding=onboarding, day=60), reason='They were away', by=self.manager)
        self.assertEqual(by_key('checkin_60').status, 'done')
        thirty = CheckIn.objects.get(onboarding=onboarding, day=30)
        checkins.save(thirty, answers={'questions': {'going_well': 'Great.'}, 'areas': {}})
        checkins.sign(thirty, manager_name='Test Manager', manager_signature=th._signature_data_url(),
                      employee_name='Dana Miles', employee_signature=th._signature_data_url(), acknowledged=True,
                      by=self.manager, ip=None, user_agent='')
        self.assertEqual(by_key('checkin_30').status, 'done')
        self.assertEqual(by_key('checkin_90').status, 'open')
        # "At least the meeting is set" is a tick for the owner; Dash's other autos still refuse one.
        service.set_task(by_key('checkin_90'), by=self.manager, status='done')
        self.assertEqual(by_key('checkin_90').status, 'done')
        service.refresh(onboarding)
        self.assertEqual(by_key('checkin_90').status, 'done')  # a hand tick is not undone by Dash
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            service.set_task(by_key('dash_login'), by=self.manager, status='done')

    def test_first_day_email_item_waits_for_the_email_or_a_tick(self):
        from apps.hiring import onboarding as service

        Application.objects.filter(pk=self.app.pk).update(email='dana@example.com')
        self.sign(self.make())
        onboarding = Onboarding.objects.get()
        Onboarding.objects.filter(pk=onboarding.pk).update(first_day_email_sent_at=None)
        task = onboarding.tasks.get(key='first_day_email')
        OnboardingTask.objects.filter(pk=task.pk).update(status='open', done_at=None, done_by=None)
        onboarding.refresh_from_db()
        service.refresh(onboarding)
        task.refresh_from_db()
        self.assertEqual(task.status, 'open')  # no email went out
        service.set_task(task, by=self.manager, status='done')
        self.assertEqual(OnboardingTask.objects.get(pk=task.pk).status, 'done')

    def test_the_saved_checklist_migrates_by_the_pattern(self):
        import importlib

        from django.apps import apps as django_apps

        migration = importlib.import_module('apps.hiring.migrations.0019_offer_level_checklist')

        def saved(items):
            value = {'public': True, 'onboarding': {'items': items}}
            AppSetting.objects.update_or_create(key='hiring.careers', defaults={'value': value})

        def items_now():
            return [i['key'] for i in AppSetting.objects.get(key='hiring.careers').value['onboarding']['items']]

        AppSetting.objects.filter(key='hiring.careers').delete()
        migration.update_checklist(django_apps, None)  # nothing saved: nothing to do
        self.assertFalse(AppSetting.objects.filter(key='hiring.careers').exists())
        # Never edited (the old default as the file stored it): the owner's new list replaces it.
        saved([dict(i) for i in migration.OLD_ITEMS])
        migration.update_checklist(django_apps, None)
        self.assertEqual(items_now(), [i['key'] for i in careers.DEFAULT_ONBOARDING['items']])
        # Edited: his items stay as they are and the new ones he lacks are added at the end.
        edited = [dict(i) for i in migration.OLD_ITEMS if i['key'] != 'time_clock'] + [
            {'key': 'tour', 'label': 'Store tour', 'owner': 'manager', 'due': 'day1', 'kind': 'tick'}]
        edited[0]['label'] = 'Added in QuickBooks (my words)'
        saved(edited)
        migration.update_checklist(django_apps, None)
        now = AppSetting.objects.get(key='hiring.careers').value['onboarding']['items']
        self.assertEqual([i['key'] for i in now][:len(edited)], [i['key'] for i in edited])
        self.assertEqual(now[0]['label'], 'Added in QuickBooks (my words)')
        self.assertEqual([i['key'] for i in now][len(edited):],
                         ['first_day_email', 'whatsapp', 'first_payroll', 'checkin_30', 'checkin_60', 'checkin_90'])
        migration.update_checklist(django_apps, None)  # run twice: nothing more is added
        self.assertEqual(len(AppSetting.objects.get(key='hiring.careers').value['onboarding']['items']), len(now))
        self.assertTrue(careers.load_setting()['onboarding']['items'])  # and the app still reads it


@override_settings(STORAGES=th.IN_MEMORY)
class LevelAtNinetyDaysTests(SignBase):
    def sign_90(self, **answers):
        self.sign(self.make())
        self.user = User.objects.get(email='dana@example.com')
        row = CheckIn.objects.get(user=self.user, day=90)
        filled = self.staff.patch(f'/api/hiring/checkins/{row.pk}/', {'answers': {
            'questions': {'going_well': 'Great.'}, 'areas': {},
            'pay': {'decision': 'no_change', 'note': 'Price faster first.'}, **answers}}, format='json')
        self.assertEqual(filled.status_code, 200, filled.data)
        return row, self.staff.post(f'/api/hiring/checkins/{row.pk}/sign/', {
            'manager_name': 'Test Manager', 'manager_signature': th._signature_data_url(),
            'employee_name': 'Dana Miles', 'employee_signature': th._signature_data_url(), 'acknowledged': True},
            format='json')

    def test_the_90_day_form_asks_for_the_level_and_signing_sets_it(self):
        row, signed = self.sign_90(level='senior')
        self.assertEqual(signed.status_code, 200, signed.data)
        self.assertTrue(row.__class__.objects.get(pk=row.pk).form['level_review'])
        self.user.employee.refresh_from_db()
        self.assertEqual(self.user.employee.level, 'senior')
        self.assertTrue(ApplicationEvent.objects.filter(
            application=self.app, text__contains='Level after the 90-day check-in: Senior (was Entry)').exists())
        self.assertEqual(self.app.onboarding.tasks.get(key='checkin_90').status, 'done')

    def test_the_30_day_form_has_no_level_and_a_bad_level_is_refused(self):
        self.sign(self.make())
        user = User.objects.get(email='dana@example.com')
        thirty = self.staff.get(f'/api/hiring/checkins/{CheckIn.objects.get(user=user, day=30).pk}/').data
        self.assertFalse(thirty['form']['level_review'])
        ninety = CheckIn.objects.get(user=user, day=90)
        bad = self.staff.patch(f'/api/hiring/checkins/{ninety.pk}/', {'answers': {
            'questions': {'going_well': 'x'}, 'areas': {}, 'level': 'boss'}}, format='json')
        self.assertEqual(bad.status_code, 400)

    def test_leaving_the_level_blank_keeps_it(self):
        _, signed = self.sign_90()
        self.assertEqual(signed.status_code, 200, signed.data)
        self.user.employee.refresh_from_db()
        self.assertEqual(self.user.employee.level, 'entry')
