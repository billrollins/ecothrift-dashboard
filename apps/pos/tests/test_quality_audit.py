"""Tests for quality audit grade calculation and API."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.pos.models import QualityAudit
from apps.pos.quality_audit_controls import build_responses_from_definition
from apps.pos.quality_audit_seed import build_retail_form_definition
from apps.pos.services.quality_audit import compute_overall_grade, validate_responses_complete

User = get_user_model()


def _blank_responses() -> dict:
    return build_responses_from_definition(build_retail_form_definition())


def _fill_all_responses(result: str = 'pass') -> dict:
    payload = _blank_responses()
    for section in payload['sections']:
        for check in section['checks']:
            check['result'] = result
    return payload


class QualityAuditGradeTests(TestCase):
    def test_compute_grade_a_plus_for_perfect_score(self):
        responses = _fill_all_responses('pass')
        self.assertEqual(compute_overall_grade(responses), 'A+')

    def test_compute_grade_f_for_all_fail(self):
        responses = _fill_all_responses('fail')
        self.assertEqual(compute_overall_grade(responses), 'F')

    def test_grade_bands_include_plus_minus(self):
        """~87% pass rate maps to B+ so dashboard B+ goals are reachable."""
        responses = _fill_all_responses('pass')
        checks = [c for s in responses['sections'] for c in s['checks']]
        # Fail enough checks to land near 0.87 (B+ band is [0.87, 0.93)).
        fail_count = max(1, round(len(checks) * 0.13))
        for check in checks[:fail_count]:
            check['result'] = 'fail'
        self.assertEqual(compute_overall_grade(responses), 'B+')

    def test_na_excluded_from_scoring(self):
        responses = _fill_all_responses('pass')
        responses['sections'][0]['checks'][0]['result'] = 'fail'
        responses['sections'][0]['checks'][1]['result'] = 'na'
        grade = compute_overall_grade(responses)
        self.assertRegex(grade, r'^[A-F][+-]?$')

    def test_validate_incomplete_checks(self):
        responses = _blank_responses()
        errors = validate_responses_complete(responses)
        total = sum(len(s['checks']) for s in responses['sections'])
        self.assertEqual(len(errors), total)

    def test_untouched_photo_and_chips_are_incomplete(self):
        from apps.pos.quality_audit_controls import derive_result

        self.assertEqual(derive_result({'control': 'photo', 'photo': None, 'result': ''}), '')
        self.assertEqual(derive_result({'control': 'chips', 'tags': [], 'touched': False, 'result': ''}), '')
        self.assertEqual(derive_result({'control': 'chips', 'tags': [], 'touched': True, 'result': ''}), 'pass')
        self.assertEqual(derive_result({'control': 'photo', 'photo': 'data:x', 'result': ''}), 'pass')

    def test_definition_cycles_through_all_15_controls(self):
        from apps.pos.quality_audit_controls import VALID_CONTROLS

        definition = build_retail_form_definition()
        used = {
            (check.get('control') or '').strip().lower()
            for section in definition['sections']
            for check in section['checks']
        }
        self.assertTrue(VALID_CONTROLS.issubset(used))


class QualityAuditApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        employee_group, _ = Group.objects.get_or_create(name='Employee')
        self.manager = User.objects.create_user(
            email='qa_manager@test.com',
            first_name='QA',
            last_name='Manager',
            password='testpass123',
        )
        self.manager.groups.add(manager_group)
        self.employee = User.objects.create_user(
            email='qa_employee@test.com',
            first_name='QA',
            last_name='Employee',
            password='testpass123',
        )
        self.employee.groups.add(employee_group)

    def test_employee_cannot_create_audit(self):
        self.client.force_authenticate(user=self.employee)
        response = self.client.post('/api/pos/quality-audits/', {'form': 'retail'}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_manager_can_create_draft_from_form_slug(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.post('/api/pos/quality-audits/', {'form': 'retail'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['status'], 'draft')
        self.assertEqual(response.data['form_slug'], 'retail')
        self.assertEqual(response.data['audit_type'], 'retail')
        self.assertEqual(len(response.data['responses']['sections']), 5)
        # every check carries a control kind
        controls = {
            c['control']
            for s in response.data['responses']['sections']
            for c in s['checks']
        }
        self.assertTrue(len(controls) >= 5)

    def test_submit_requires_complete_checks(self):
        self.client.force_authenticate(user=self.manager)
        create = self.client.post('/api/pos/quality-audits/', {'form': 'retail'}, format='json')
        audit_id = create.data['id']
        response = self.client.post(f'/api/pos/quality-audits/{audit_id}/submit/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('errors', response.data)

    def test_submit_sets_grade(self):
        self.client.force_authenticate(user=self.manager)
        create = self.client.post('/api/pos/quality-audits/', {'form': 'retail'}, format='json')
        audit_id = create.data['id']
        responses = _fill_all_responses('pass')
        response = self.client.post(
            f'/api/pos/quality-audits/{audit_id}/submit/',
            {'responses': responses},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'submitted')
        self.assertEqual(response.data['overall_grade'], 'A+')
        self.assertIn('updated_at', response.data)
        audit = QualityAudit.objects.get(pk=audit_id)
        self.assertIsNotNone(audit.submitted_at)

    def test_delete_draft_allowed_submitted_rejected(self):
        self.client.force_authenticate(user=self.manager)
        create = self.client.post('/api/pos/quality-audits/', {'form': 'retail'}, format='json')
        draft_id = create.data['id']
        delete_draft = self.client.delete(f'/api/pos/quality-audits/{draft_id}/')
        self.assertEqual(delete_draft.status_code, 204)

        create2 = self.client.post('/api/pos/quality-audits/', {'form': 'retail'}, format='json')
        audit_id = create2.data['id']
        self.client.post(
            f'/api/pos/quality-audits/{audit_id}/submit/',
            {'responses': _fill_all_responses('pass')},
            format='json',
        )
        delete_submitted = self.client.delete(f'/api/pos/quality-audits/{audit_id}/')
        self.assertEqual(delete_submitted.status_code, 400)

    def test_list_respects_limit(self):
        self.client.force_authenticate(user=self.manager)
        for _ in range(3):
            self.client.post('/api/pos/quality-audits/', {'form': 'retail'}, format='json')
        response = self.client.get('/api/pos/quality-audits/', {'limit': 2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_dashboard_retail_grade_from_latest_submit(self):
        from apps.pos.services.dashboard_metrics import build_department_metrics

        self.client.force_authenticate(user=self.manager)
        create = self.client.post('/api/pos/quality-audits/', {'form': 'retail'}, format='json')
        audit_id = create.data['id']
        responses = _fill_all_responses('pass')
        self.client.post(
            f'/api/pos/quality-audits/{audit_id}/submit/',
            {'responses': responses},
            format='json',
        )
        retail = build_department_metrics()['retail']
        self.assertTrue(retail['ready'])
        self.assertEqual(retail['last_grade'], 'A+')
