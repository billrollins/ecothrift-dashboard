import importlib

from django.apps import apps
from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.hr.models import Department, Shift
from apps.hr.shift_set import SHIFT_SPECS, apply_shift_set
from apps.routines.shift_seed import seed_cashier_shifts

office_mig = importlib.import_module('apps.hr.migrations.0013_office_display_name')
shift_mig = importlib.import_module('apps.hr.migrations.0014_shift_display_names')
rename_office = office_mig.apply
rename_shifts = shift_mig.apply
NEW_NAMES = shift_mig.NEW_NAMES
OLD_NAMES = shift_mig.OLD_NAMES


def _manager():
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email='display-names-mgr@example.com',
        first_name='Display',
        last_name='Manager',
        password='x',
        is_staff=True,
    )
    user.groups.add(group)
    return user


class DisplayNameMigrationTests(APITestCase):
    def test_office_migration_renames_seeded_name_and_leaves_custom(self):
        office, _ = Department.objects.get_or_create(
            slug='office',
            defaults={'name': 'Office', 'icon': 'home', 'sort_order': 3},
        )
        office.name = 'Management'
        office.save(update_fields=['name'])
        rename_office(apps, None)
        office.refresh_from_db()
        self.assertEqual(office.name, 'Office')
        self.assertEqual(office.slug, 'office')

        office.name = 'Front office'
        office.save(update_fields=['name'])
        rename_office(apps, None)
        office.refresh_from_db()
        self.assertEqual(office.name, 'Front office')
        self.assertEqual(office.slug, 'office')

    def test_shift_migration_renames_seeded_names_and_leaves_custom(self):
        apply_shift_set()
        for code, old_names in OLD_NAMES.items():
            row = Shift.objects.get(punch_code=code)
            row.name = old_names[0]
            row.save(update_fields=['name'])
        rename_shifts(apps, None)
        for code, new_name in NEW_NAMES.items():
            self.assertEqual(Shift.objects.get(punch_code=code).name, new_name)

        custom = Shift.objects.get(punch_code='retail_open')
        custom.name = 'Floor Open'
        custom.save(update_fields=['name'])
        rename_shifts(apps, None)
        custom.refresh_from_db()
        self.assertEqual(custom.name, 'Floor Open')

    def test_fresh_shift_seed_uses_new_names(self):
        Shift.objects.filter(punch_code__in={spec['punch_code'] for spec in SHIFT_SPECS}).delete()
        apply_shift_set()
        by_code = {row.punch_code: row.name for row in Shift.objects.filter(punch_code__in=NEW_NAMES)}
        self.assertEqual(by_code, NEW_NAMES)

        Shift.objects.filter(punch_code__in=('retail_open', 'retail_day', 'retail_close')).delete()
        seed_cashier_shifts()
        self.assertEqual(Shift.objects.get(punch_code='retail_open').name, 'Retail Open')
        self.assertEqual(Shift.objects.get(punch_code='retail_day').name, 'Retail Mid')
        self.assertEqual(Shift.objects.get(punch_code='retail_close').name, 'Retail Close')

    def test_kiosk_preview_suggests_retail_open(self):
        apply_shift_set()
        self.client.force_authenticate(_manager())
        response = self.client.get('/api/hr/shifts/clock_tiles/', {'date': '2026-09-16'})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('Retail Open', [row['name'] for row in response.data])
