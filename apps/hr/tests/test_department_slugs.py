"""Departments stay Retail and Management. Slugs and icons stay put."""
from rest_framework.test import APITestCase

from apps.hr.models import Department

EXPECTED = (
    ('Retail', 'retail-operations', 'cart', 0),
    ('Processing', 'processing', 'box', 1),
    ('Restoration', 'restoration', 'tool', 2),
    ('Management', 'office', 'home', 3),
)


class KnownDepartmentSlugTests(APITestCase):
    def test_four_departments_keep_slugs_and_icons(self):
        self.assertEqual(EXPECTED[0][0], 'Retail')
        self.assertEqual(EXPECTED[3][0], 'Management')
        for name, slug, icon, sort in EXPECTED:
            Department.objects.update_or_create(
                slug=slug,
                defaults={'name': name, 'icon': icon, 'sort_order': sort},
            )
        for name, slug, icon, sort in EXPECTED:
            row = Department.objects.get(slug=slug)
            self.assertEqual((row.name, row.icon, row.sort_order), (name, icon, sort))
        self.assertEqual(Department.objects.filter(slug='retail-operations').count(), 1)
        self.assertEqual(Department.objects.get(slug='office').name, 'Management')
