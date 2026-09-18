"""gate_on_miss is superuser-only; miss reasons ride along on run rows and Command Center payloads."""
from datetime import datetime
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APITestCase

from apps.accounts.models import User

from .command_center import MISS_REASON_LABELS, miss_fields, score_items_for_day
from .models import Routine, RoutineRun
from .serializers import RoutineRunSerializer, RoutineSerializer

TZ = ZoneInfo('America/Chicago')


def _staff(email, role, *, superuser=False):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email, password='x', first_name=role, last_name='X', is_staff=True, is_superuser=superuser,
    )
    user.groups.add(group)
    return user


class GateOnMissWriteTests(APITestCase):
    def setUp(self):
        self.routine = Routine.objects.create(title='Open checklist')
        self.manager = _staff('m@example.com', 'Manager')
        self.owner = _staff('o@example.com', 'Admin', superuser=True)

    def test_manager_is_refused_at_the_view_and_again_at_the_serializer(self):
        self.client.force_authenticate(self.manager)
        res = self.client.patch(
            f'/api/routines/routines/{self.routine.pk}/', {'gate_on_miss': True}, format='json',
        )
        self.assertEqual(res.status_code, 403, res.data)
        self.routine.refresh_from_db()
        self.assertFalse(self.routine.gate_on_miss)

        request = type('Req', (), {'user': self.manager})()
        ser = RoutineSerializer(
            self.routine, data={'gate_on_miss': True}, partial=True, context={'request': request},
        )
        self.assertFalse(ser.is_valid())
        self.assertIn('gate_on_miss', ser.errors)
        # Leaving it unchanged is fine for anyone.
        ser = RoutineSerializer(
            self.routine, data={'gate_on_miss': False}, partial=True, context={'request': request},
        )
        self.assertNotIn('gate_on_miss', ser.errors if not ser.is_valid() else {})

    def test_superuser_can_flip_it(self):
        self.client.force_authenticate(self.owner)
        res = self.client.patch(
            f'/api/routines/routines/{self.routine.pk}/',
            {'gate_on_miss': True, 'audience_all': True}, format='json',
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data['gate_on_miss'])
        self.routine.refresh_from_db()
        self.assertTrue(self.routine.gate_on_miss)


class MissReasonPayloadTests(TestCase):
    def setUp(self):
        self.routine = Routine.objects.create(title='Open checklist', gate_on_miss=True)
        self.who = _staff('w@example.com', 'Employee')
        self.run = RoutineRun.objects.create(
            routine=self.routine, period_key='2026-09-15',
            due_at=datetime(2026, 9, 15, 9, 0, tzinfo=TZ), assigned_to=self.who,
            status=RoutineRun.STATUS_MISSED, miss_reason='forgot', miss_reason_note='',
        )

    def test_run_serializer_and_command_center_row_carry_the_reason(self):
        data = RoutineRunSerializer(self.run).data
        self.assertEqual(data['miss_reason'], 'forgot')
        fields = miss_fields(self.run)
        self.assertEqual(fields['miss_reason'], 'forgot')
        self.assertEqual(fields['miss_reason_label'], 'Forgot')
        self.assertEqual(miss_fields(None)['miss_reason'], '')
        self.assertEqual(set(MISS_REASON_LABELS), {'forgot', 'no_time', 'called_in', 'not_my_section', 'other'})

    def test_day_summary_line_names_the_reason(self):
        day_row = {
            'date': '2026-09-15',
            'doing': {'routines': [
                {'key': 'retail.open', 'title': 'Open checklist', 'status': 'missed', 'miss_reason': 'forgot'},
                {'key': 'retail.close', 'title': 'Close checklist', 'status': 'missed'},
            ]},
            'cross': {},
        }
        items = score_items_for_day(day_row)
        self.assertTrue(any(item.endswith('· Forgot') for item in items), items)
        self.assertTrue(any('Close checklist missed' in item and 'Forgot' not in item for item in items), items)
