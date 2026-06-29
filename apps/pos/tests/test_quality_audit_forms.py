"""Tests for QualityAuditForm CRUD + guards."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.pos.models import QualityAudit, QualityAuditForm

User = get_user_model()


def _definition() -> dict:
    return {
        'template_version': 1,
        'sections': [
            {
                'id': 'sec_a',
                'title': 'Section A',
                'intro': '',
                'icon': 'factCheck',
                'checks': [
                    {'id': 'c1', 'label': 'Clean?', 'control': 'yesno', 'hint': ''},
                    {'id': 'c2', 'label': 'Tag issues', 'control': 'chips', 'hint': '', 'options': ['Dusty', 'Torn']},
                ],
            }
        ],
    }


class QualityAuditFormApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.manager = User.objects.create_user(
            email='form_manager@test.com',
            first_name='Form',
            last_name='Manager',
            password='testpass123',
        )
        self.manager.groups.add(manager_group)
        self.superuser = User.objects.create_superuser(
            email='form_admin@test.com',
            first_name='Form',
            last_name='Admin',
            password='testpass123',
        )

    def test_manager_can_list_but_not_create(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.get('/api/pos/quality-audit-forms/')
        self.assertEqual(response.status_code, 200)
        create = self.client.post(
            '/api/pos/quality-audit-forms/',
            {'slug': 'processing', 'title': 'Processing QA', 'definition': _definition()},
            format='json',
        )
        self.assertEqual(create.status_code, 403)

    def test_superuser_can_create_form(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.post(
            '/api/pos/quality-audit-forms/',
            {'slug': 'processing', 'title': 'Processing QA', 'definition': _definition()},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data['is_system'])
        self.assertFalse(response.data['feeds_dashboard'])

    def test_cannot_set_feeds_dashboard_on_second_form(self):
        self.client.force_authenticate(user=self.superuser)
        # retail form already has feeds_dashboard=True from the seed migration
        response = self.client.post(
            '/api/pos/quality-audit-forms/',
            {'slug': 'processing', 'title': 'Processing QA', 'definition': _definition(), 'feeds_dashboard': True},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('feeds_dashboard', response.data)

    def test_cannot_delete_system_form(self):
        self.client.force_authenticate(user=self.superuser)
        retail = QualityAuditForm.objects.get(slug='retail')
        response = self.client.delete(f'/api/pos/quality-audit-forms/{retail.pk}/')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(QualityAuditForm.objects.filter(pk=retail.pk).exists())

    def test_cannot_delete_form_with_audits(self):
        from apps.pos.quality_audit_controls import build_responses_from_definition

        self.client.force_authenticate(user=self.superuser)
        form = QualityAuditForm.objects.create(
            slug='delete-me', title='Delete Me', definition=_definition(),
            created_by=self.superuser, updated_by=self.superuser,
        )
        QualityAudit.objects.create(form=form, audit_type=form.slug, responses=build_responses_from_definition(form.definition))
        response = self.client.delete(f'/api/pos/quality-audit-forms/{form.pk}/')
        self.assertEqual(response.status_code, 400)

    def test_can_delete_empty_non_system_form(self):
        self.client.force_authenticate(user=self.superuser)
        form = QualityAuditForm.objects.create(
            slug='delete-me-2', title='Delete Me 2', definition=_definition(),
            created_by=self.superuser, updated_by=self.superuser,
        )
        response = self.client.delete(f'/api/pos/quality-audit-forms/{form.pk}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(QualityAuditForm.objects.filter(pk=form.pk).exists())

    def test_system_form_slug_and_dashboard_locked_on_edit(self):
        self.client.force_authenticate(user=self.superuser)
        retail = QualityAuditForm.objects.get(slug='retail')
        response = self.client.patch(
            f'/api/pos/quality-audit-forms/{retail.pk}/',
            {'slug': 'retail-renamed'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_system_form_can_edit_title_and_definition(self):
        self.client.force_authenticate(user=self.superuser)
        retail = QualityAuditForm.objects.get(slug='retail')
        response = self.client.patch(
            f'/api/pos/quality-audit-forms/{retail.pk}/',
            {'title': 'Retail floor ops v2'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        retail.refresh_from_db()
        self.assertEqual(retail.title, 'Retail floor ops v2')

    def test_definition_validation_rejects_unknown_control(self):
        self.client.force_authenticate(user=self.superuser)
        bad = _definition()
        bad['sections'][0]['checks'][0]['control'] = 'magic'
        response = self.client.post(
            '/api/pos/quality-audit-forms/',
            {'slug': 'bad', 'title': 'Bad', 'definition': bad},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('definition', response.data)

    def test_definition_validation_requires_options_for_chips(self):
        self.client.force_authenticate(user=self.superuser)
        bad = _definition()
        bad['sections'][0]['checks'][1]['options'] = []
        response = self.client.post(
            '/api/pos/quality-audit-forms/',
            {'slug': 'bad2', 'title': 'Bad', 'definition': bad},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('definition', response.data)
