"""Owner page (2026-10-21): Scorecard, Needs you, AI spend; and every AI call recorded in AIUsage with who asked."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import EmployeeProfile, User
from apps.core.models import AIUsage, AiModel, ApprovalRequest
from apps.core.services import owner_page
from apps.core.services.llm_router import LLMResult, llm_complete


def _at(day: date, hour: int = 10) -> datetime:
    return timezone.make_aware(datetime.combine(day, time(hour, 0)))


class AIUsageRecordingTests(TestCase):
    def setUp(self):
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='Bill', last_name='R',
                                                  password='x-pass-123')
        AiModel.objects.create(slug='claude-test-x', provider='anthropic', input_price=Decimal('4'),
                               output_price=Decimal('20'))

    @override_settings(ANTHROPIC_API_KEY='test-key')
    def test_a_call_made_for_a_signed_in_login_is_charged_to_them(self):
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(self.boss)}')
        row = AiModel.objects.get(slug='claude-test-x')
        stub = lambda **kw: LLMResult(text='Hi.', model_used='claude-test-x', input_tokens=1000, output_tokens=500)
        with patch.dict('apps.core.services.llm_router._PROVIDER_CALLS', {'anthropic': stub}):
            r = api.post(f'/api/core/ai/models/{row.pk}/test/', {'message': 'Hello'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        usage = AIUsage.objects.get()
        self.assertEqual((usage.source, usage.user_id, usage.estimated_cost_usd), ('settings_ai_test', self.boss.pk,
                                                                                    Decimal('0.014000')))
        self.assertNotIn('job', usage.context)
        # The next request starts with no one: a job call afterwards is not charged to Bill.
        with patch.dict('apps.core.services.llm_router._PROVIDER_CALLS', {'anthropic': stub}):
            llm_complete(model_id='claude-test-x', user='x', log_purpose='QA_TRIAGE')
        job = AIUsage.objects.order_by('-id').first()
        self.assertIsNone(job.user_id)
        self.assertEqual((job.source, job.purpose, job.context['job']), ('qa_triage', 'QA_TRIAGE', 'background'))

    @override_settings(ANTHROPIC_API_KEY='test-key')
    def test_every_router_call_is_recorded_even_without_a_source_and_logging_never_breaks_a_call(self):
        stub = lambda **kw: LLMResult(text='ok', model_used='claude-test-x', input_tokens=10, output_tokens=10)
        with patch.dict('apps.core.services.llm_router._PROVIDER_CALLS', {'anthropic': stub}):
            llm_complete(model_id='claude-test-x', user='x')
            with patch('apps.core.models.AIUsage.objects.create', side_effect=RuntimeError('db down')):
                self.assertEqual(llm_complete(model_id='claude-test-x', user='x').text, 'ok')
        self.assertEqual(list(AIUsage.objects.values_list('source', flat=True)), ['llm'])

    def test_an_image_is_priced_per_picture(self):
        from apps.core.services.ai_usage_log import log_ai_usage

        log_ai_usage('label_ai_image', 'grok-imagine', purpose='LABEL_IMAGE', cost_usd=Decimal('0.07'), user=self.boss)
        self.assertEqual(AIUsage.objects.get().estimated_cost_usd, Decimal('0.070000'))


class AISpendTests(TestCase):
    def setUp(self):
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='Bill', last_name='R',
                                                  password='x-pass-123')
        self.now = _at(date(2026, 10, 21), 12)  # a Wednesday

        def row(day, cost, source, user=None, job=None):
            AIUsage.objects.create(created_at=_at(day), source=source, model='m', user=user,
                                   estimated_cost_usd=Decimal(cost), context={'job': job} if job else {})

        row(date(2026, 10, 21), '0.50', 'suggest_item', user=self.boss)
        row(date(2026, 10, 19), '0.25', 'qa_triage', job='run_qa')
        row(date(2026, 10, 2), '1.00', 'suggest_product', user=self.boss)
        row(date(2026, 9, 30), '9.00', 'suggest_product', user=self.boss)

    def test_today_week_and_month_with_feature_and_who(self):
        today = owner_page.ai_spend('today', self.now)
        self.assertEqual((today['total'], today['calls']), ('0.5000', 1))
        week = owner_page.ai_spend('week', self.now)
        self.assertEqual(week['total'], '0.7500')
        self.assertEqual([(w['who'], w['cost']) for w in week['by_who']],
                         [('Bill R', '0.5000'), ('Job: run_qa', '0.2500')])
        month = owner_page.ai_spend('month', self.now)
        self.assertEqual(month['total'], '1.7500')
        self.assertEqual([(f['feature'], f['cost']) for f in month['by_feature']], [
            ('Processing: product suggestions', '1.0000'),
            ('Processing: item suggestions', '0.5000'),
            ('Nightly data checks (QA)', '0.2500'),
        ])
        self.assertEqual(owner_page.ai_spend('nonsense', self.now)['range'], 'today')


class OwnerPageTests(TestCase):
    def setUp(self):
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='Bill', last_name='R',
                                                  password='x-pass-123')
        from django.contrib.auth.models import Group

        self.manager = User.objects.create_user(email='mgr@example.com', first_name='M', last_name='G',
                                                password='x-pass-123')
        self.manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.api = APIClient()

    def test_owner_only(self):
        self.api.force_authenticate(self.manager)
        for path in ('scorecard', 'needs-you', 'ai-spend'):
            self.assertEqual(self.api.get(f'/api/core/owner/{path}/').status_code, 403, path)
        self.api.force_authenticate(self.boss)
        card = self.api.get('/api/core/owner/scorecard/').json()
        self.assertEqual([p['key'] for p in card['periods']], ['this_week', 'last_week', 'this_month', 'last_month'])
        self.assertEqual(card['targets'], {'buying_pct_of_processing': [40, 50], 'processing_pct_of_sales': 120})
        self.assertEqual(len(card['thrift_plus_owed']['trend']), owner_page.OWED_TREND_WEEKS + 1)
        self.assertEqual(self.api.get('/api/core/owner/ai-spend/?range=month').json()['range'], 'month')
        items = {i['key']: i for i in self.api.get('/api/core/owner/needs-you/').json()['items']}
        self.assertEqual(items['site_errors']['count'], 0)

    def test_periods_run_monday_to_sunday_and_month_to_date(self):
        got = {p['key']: (p['start'], p['end']) for p in owner_page.periods(date(2026, 10, 21))}
        self.assertEqual(got['this_week'], (date(2026, 10, 19), date(2026, 10, 21)))
        self.assertEqual(got['last_week'], (date(2026, 10, 12), date(2026, 10, 18)))
        self.assertEqual(got['this_month'], (date(2026, 10, 1), date(2026, 10, 21)))
        self.assertEqual(got['last_month'], (date(2026, 9, 1), date(2026, 9, 30)))

    def test_buying_and_labor(self):
        from apps.hr.models import TimeEntry
        from apps.inventory.models import PurchaseOrder, Vendor

        day = date(2026, 10, 20)
        PurchaseOrder.objects.create(vendor=Vendor.objects.create(name='V', code='V1'), order_number='PO-OWN-1',
                                     status='ordered', ordered_date=day, total_cost=Decimal('400.00'))
        EmployeeProfile.objects.create(user=self.manager, employee_number='E-OWN-1', pay_rate=Decimal('15.00'),
                                       hire_date=day)
        TimeEntry.objects.create(employee=self.manager, clock_in=_at(day, 9), clock_out=_at(day, 17))
        numbers = owner_page.period_numbers(day, day)
        self.assertEqual((numbers['buying'], numbers['labor_hours'], numbers['labor']), ('400.00', '8.00', '120.00'))
        # Nothing processed or sold that day: no percent rather than a divide-by-zero.
        self.assertIsNone(numbers['buying_pct_of_processing'])
        self.assertIsNone(numbers['labor_pct_of_sales'])
        self.assertIsNone(numbers['shrink'])

    def test_targets_follow_the_owner_setting(self):
        from apps.core.models import AppSetting

        AppSetting.objects.create(key=owner_page.TARGETS_KEY, value={'buying_pct_of_processing': [55, 45]})
        self.assertEqual(owner_page.targets()['buying_pct_of_processing'], [45, 55])
        self.assertEqual(owner_page.targets()['processing_pct_of_sales'], 120)

    def test_needs_you_counts_what_waits(self):
        ApprovalRequest.objects.create(kind='x', title='Merge 4 vendors')
        items = {i['key']: i for i in owner_page.needs_you()['items']}
        self.assertEqual((items['requests']['count'], items['requests']['detail']), (1, 'Merge 4 vendors'))
        self.assertEqual(items['requests']['link'], '/admin/requests')
        for key in ('time_changes', 'over_hours', 'late_returns', 'offers_to_send', 'checkins_due', 'site_errors'):
            self.assertEqual(items[key]['count'], 0, key)

    def test_site_errors_count_until_seen(self):
        from apps.core.models import AppError
        from apps.core.services.app_errors import mark_seen

        AppError.objects.create(source='server', message='boom', path='/api/pos/carts/')
        row = next(i for i in owner_page.needs_you()['items'] if i['key'] == 'site_errors')
        self.assertEqual((row['count'], row['detail'], row['tone']), (1, '1 in the last 24 hours', 'error'))
        mark_seen()
        self.assertEqual(next(i for i in owner_page.needs_you()['items'] if i['key'] == 'site_errors')['count'], 0)
