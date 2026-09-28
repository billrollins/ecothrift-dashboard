"""data_platform Phase 2: the Context snapshot and the AI supervisor's daily brief."""
from __future__ import annotations

from datetime import date
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.core.models import ContextSnapshot, DailyBrief
from apps.core.services import daily_brief
from apps.core.services.context_snapshot import build_snapshot

BODY = {'headline': 'Sales were flat; 2 lots to bid on today.', 'needs_you': ['Approve 1 request.'], 'numbers': ['$1,200 in sales.'], 'watch': []}
DAY = date(2026, 9, 27)


class SnapshotTests(TestCase):
    def test_every_section_builds_on_an_empty_database(self):
        data = build_snapshot(DAY)
        self.assertEqual(data['for_day'], '2026-09-27')
        self.assertEqual(data['errors'], {})
        for section in ('sales', 'labor', 'routines', 'inventory', 'buying', 'requests', 'thrift_plus'):
            self.assertIn(section, data)
        self.assertEqual(data['sales']['revenue'], '0.00')
        self.assertFalse(data['thrift_plus']['switch_on'])

    def test_a_broken_section_is_recorded_not_fatal(self):
        with patch('apps.core.services.context_snapshot._inventory', side_effect=RuntimeError('db down')):
            data = build_snapshot(DAY)
        self.assertEqual(data['errors'], {'inventory': 'db down'})
        self.assertIn('sales', data)


class BriefTests(TestCase):
    def test_the_brief_is_written_from_the_snapshot(self):
        with patch('apps.core.services.daily_brief._ask', return_value=(BODY, 'claude-opus-5-5')) as ask:
            brief = daily_brief.write(DAY)
        self.assertEqual((brief.status, brief.model_used), (DailyBrief.STATUS_READY, 'claude-opus-5-5'))
        self.assertEqual(brief.body['headline'], BODY['headline'])
        self.assertEqual(ask.call_args.args[0]['for_day'], '2026-09-27')
        self.assertEqual(ContextSnapshot.objects.get(day=DAY).pk, brief.snapshot_id)

    def test_a_failed_call_keeps_the_snapshot_and_says_why(self):
        with patch('apps.core.services.daily_brief._ask', side_effect=RuntimeError('no API key')):
            brief = daily_brief.write(DAY)
        self.assertEqual(brief.status, DailyBrief.STATUS_FAILED)
        self.assertIn('no API key', brief.error)
        self.assertIsNotNone(brief.snapshot_id)


class BriefApiTests(APITestCase):
    def setUp(self):
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123')

    def test_superuser_only(self):
        staff = User.objects.create_user('staff@example.com', 'S', 'T', password='x-pass-123')
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get('/api/core/brief/').status_code, 403)

    def test_opening_the_page_starts_the_missing_brief_and_shows_a_written_one(self):
        self.client.force_authenticate(self.boss)
        with patch('apps.core.services.daily_brief.subprocess.Popen') as spawn:
            data = self.client.get('/api/core/brief/').data
        self.assertTrue(data['writing'])
        cmd = spawn.call_args.args[0]
        self.assertEqual(cmd[2:4], ['build_daily_brief', '--day'])
        self.assertTrue(spawn.call_args.kwargs['start_new_session'])  # outlives a recycled web worker
        with patch('apps.core.services.daily_brief._ask', return_value=(BODY, 'm')):
            daily_brief.write(DAY)
        data = self.client.get('/api/core/brief/', {'day': '2026-09-27'}).data
        self.assertEqual((data['brief']['status'], data['brief']['body']['headline']), ('ready', BODY['headline']))
        self.assertIn('sales', data['snapshot'])
        self.assertEqual(self.client.get('/api/core/brief/', {'day': 'soon'}).status_code, 400)

    def test_a_brief_whose_writer_died_says_so_instead_of_writing_forever(self):
        from datetime import timedelta
        from django.utils import timezone
        self.client.force_authenticate(self.boss)
        DailyBrief.objects.create(day=DAY, status=DailyBrief.STATUS_WRITING, started_at=timezone.now() - timedelta(minutes=5))
        data = self.client.get('/api/core/brief/', {'day': '2026-09-27'}).data
        self.assertEqual((data['writing'], data['brief']['status']), (False, 'failed'))
        self.assertIn('Press Rewrite', data['brief']['error'])
