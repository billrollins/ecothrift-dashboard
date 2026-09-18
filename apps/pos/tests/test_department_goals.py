import importlib.util
from pathlib import Path

from django.apps import apps
from rest_framework.test import APITestCase

from apps.pos.models import DashboardDepartmentGoal
from apps.pos.serializers import DashboardDepartmentGoalSerializer

_migration = Path(__file__).resolve().parents[1] / 'migrations' / '0030_retail_goal_letter.py'
_spec = importlib.util.spec_from_file_location('pos_0030_retail_goal_letter', _migration)
_module = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_module)
convert_retail_goal = _module.convert_retail_goal


class RetailGoalMigrationTests(APITestCase):
    def test_numeric_value_becomes_b_and_drops_audits(self):
        DashboardDepartmentGoal.objects.filter(department='retail').delete()
        DashboardDepartmentGoal.objects.create(
            department='retail',
            value='10',
            schedule={'weekdays': [1, 2, 3], 'audits_per_day': 10},
        )
        convert_retail_goal(apps, None)
        row = DashboardDepartmentGoal.objects.get(department='retail')
        self.assertEqual(row.value, 'B')
        self.assertEqual(row.schedule.get('weekdays'), [1, 2, 3])
        self.assertNotIn('audits_per_day', row.schedule)

    def test_letter_value_is_left_and_audits_stripped(self):
        DashboardDepartmentGoal.objects.filter(department='retail').delete()
        DashboardDepartmentGoal.objects.create(
            department='retail',
            value='C',
            schedule={'weekdays': [2, 3, 4], 'audits_per_day': 4},
        )
        convert_retail_goal(apps, None)
        row = DashboardDepartmentGoal.objects.get(department='retail')
        self.assertEqual(row.value, 'C')
        self.assertEqual(row.schedule.get('weekdays'), [2, 3, 4])
        self.assertNotIn('audits_per_day', row.schedule)

    def test_missing_row_created_and_rerun_is_noop(self):
        DashboardDepartmentGoal.objects.filter(department='retail').delete()
        convert_retail_goal(apps, None)
        convert_retail_goal(apps, None)
        rows = list(DashboardDepartmentGoal.objects.filter(department='retail'))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].value, 'B')
        self.assertEqual(rows[0].schedule.get('weekdays'), [1, 2, 3, 4, 5])
        self.assertNotIn('audits_per_day', rows[0].schedule)

    def test_serializer_rejects_numeric_retail_value(self):
        existing = DashboardDepartmentGoal.objects.filter(department='retail').first()
        serializer = DashboardDepartmentGoalSerializer(
            instance=existing,
            data={
                'department': 'retail',
                'value': '10',
                'description': '',
                'schedule': {'weekdays': [1, 2, 3]},
            },
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('value', serializer.errors)

    def test_serializer_accepts_abc_retail_value(self):
        existing = DashboardDepartmentGoal.objects.filter(department='retail').first()
        serializer = DashboardDepartmentGoalSerializer(
            instance=existing,
            data={
                'department': 'retail',
                'value': 'c',
                'description': '',
            },
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['value'], 'C')

    def test_serializer_rejects_plus_minus_retail_value(self):
        existing = DashboardDepartmentGoal.objects.filter(department='retail').first()
        serializer = DashboardDepartmentGoalSerializer(
            instance=existing,
            data={
                'department': 'retail',
                'value': 'b+',
                'description': '',
            },
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('value', serializer.errors)

    def test_plus_minus_row_is_fixed_to_band(self):
        DashboardDepartmentGoal.objects.filter(department='retail').delete()
        DashboardDepartmentGoal.objects.create(
            department='retail',
            value='B+',
            schedule={'weekdays': [1, 2, 3, 4, 5]},
        )
        spec = importlib.util.spec_from_file_location(
            'pos_0031_retail_goal_abc',
            Path(__file__).resolve().parents[1] / 'migrations' / '0031_retail_goal_abc.py',
        )
        assert spec.loader is not None
        module_abc = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module_abc)
        module_abc.fix_retail_goal_band(apps, None)
        row = DashboardDepartmentGoal.objects.get(department='retail')
        self.assertEqual(row.value, 'B')
