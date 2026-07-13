"""Focused backend coverage for TARS Phase 1 decision work."""

from decimal import Decimal

from apps.inventory.models import Item, ItemCheckIn, RestorationJob
from apps.inventory.services.restoration import queue_add_restoration_item
from apps.inventory.tests.test_restoration_queue import (
    FUNCTIONAL_GRADES,
    RestorationQueueTestBase,
)


def decision_work_payload(
    *,
    grade='Working',
    sale_state='tested',
    action='test',
    stop_response='clear',
    override_reason='',
    complete=True,
):
    condition = {
        'currentGrade': grade,
        'condition': 'Good',
        'completeness': 'complete',
        'testedStatus': 'tested',
        'evidence': 'Primary function and visible condition confirmed.',
    } if complete else {
        'currentGrade': None,
        'condition': '',
        'completeness': 'unknown',
        'testedStatus': 'not_tested',
        'evidence': '',
    }
    outcomes = [{
        'id': f'grade:{grade}',
        'grade': grade,
        'saleState': sale_state,
        'action': action,
        'viable': True,
        'nonviableReason': '',
        'estimatedMinutes': 60,
    }] if complete else []
    selection = {
        'outcomeId': f'grade:{grade}' if complete else None,
        'grade': grade if complete else None,
        'saleState': sale_state if complete else None,
        'action': action if complete else None,
        'reason': 'Best truthful contribution path.' if complete else '',
        'overrideReason': override_reason,
        'selectedAt': '2026-07-10T20:00:00Z' if complete else None,
    }
    return {
        'schemaVersion': 1,
        'catalogVersion': 'phase1-mvp-v1',
        'handoff': {
            'acknowledged': True,
            'acknowledgedAt': '2026-07-10T19:55:00Z',
            'contextSummary': 'Processing reported a basic test.',
            'correctionNotes': '',
        },
        'stopOut': {
            'responses': [
                {
                    'stopOutId': stop_id,
                    'response': stop_response if stop_id == 'legal_prohibited_sale' else 'clear',
                    'notes': '',
                    'respondedAt': '2026-07-10T20:00:00Z',
                }
                for stop_id in (
                    'legal_prohibited_sale',
                    'handling_stop',
                    'truthful_disclosure',
                )
            ],
            'blocked': stop_response == 'blocked',
            'blockedStopOutIds': (
                ['legal_prohibited_sale'] if stop_response == 'blocked' else []
            ),
        },
        'condition': condition,
        'tests': [{
            'id': 'catalog-test:basic_function',
            'catalogTestId': 'basic_function',
            'name': 'Basic function',
            'prompt': 'Run shortest practical check.',
            'relevant': True,
            'result': 'pass',
            'evidence': 'Powered and responded.',
            'createdAt': '2026-07-10T20:00:00Z',
            'updatedAt': '2026-07-10T20:00:00Z',
        }],
        'unknowns': [],
        'outcomes': outcomes,
        'economics': {
            'effectiveLaborRate': 999,
            'queuePressure': 'high',
            'queuePressureNote': 'Busy queue',
            'queuePressureAffectsScore': True,
            'candidates': [{'processorValue': 999999}],
            'evaluatedAt': None,
        },
        'recommendation': {},
        'selection': selection,
        'timestamps': {
            'createdAt': '2026-07-10T19:55:00Z',
            'updatedAt': '2026-07-10T20:00:00Z',
            'completedAt': None,
        },
    }


class TarsProcessingHandoffTests(RestorationQueueTestBase):
    def test_handoff_create_edit_and_read_only_job_surface(self):
        order, row, product = self._restoration_order()
        handoff = {
            'schema_version': 1,
            'tested_status': 'partially_tested',
            'condition_evidence': 'Powers on; casing is scratched.',
            'unknowns': 'Battery runtime unknown.',
            'quick_tests': [{
                'test_id': 'power_on',
                'result': 'pass',
                'notes': 'Reached home screen.',
            }],
        }
        response = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': row.id,
                'quantity': 1,
                'condition': 'good',
                'dispatch': 'restoration',
                'price': '19.99',
                'retail': '49.99',
                'product_mode': 'existing',
                'product_id': product.id,
                'restoration_scale': 'Functional',
                'restoration_grade_values': FUNCTIONAL_GRADES,
                'processing_handoff': handoff,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        check_in = ItemCheckIn.objects.get(pk=response.data['item_check_in_id'])
        saved = check_in.defaults_snapshot['processing_handoff']
        self.assertEqual(saved['tested_status'], 'partially_tested')
        self.assertEqual(saved['recorded_by_id'], self.user.pk)
        self.assertTrue(saved['recorded_at'])
        self.assertNotIn('restoration_scale', saved)

        job = RestorationJob.objects.get(item_check_in=check_in)
        detail = self.client.get(f'/api/inventory/restoration-jobs/{job.id}/')
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertEqual(detail.data['processing_handoff'], saved)

        edit = self.client.post(
            f'/api/inventory/orders/{order.id}/item-check-ins/{check_in.id}/update/',
            {
                'processing_handoff': {
                    **handoff,
                    'tested_status': 'tested',
                    'condition_evidence': 'Full basic function passed.',
                },
            },
            format='json',
        )
        self.assertEqual(edit.status_code, 200, edit.data)
        check_in.refresh_from_db()
        self.assertEqual(
            check_in.defaults_snapshot['processing_handoff']['tested_status'],
            'tested',
        )

    def test_handoff_caps_and_legacy_absence(self):
        order, row, product = self._restoration_order()
        too_many = [
            {'name': f'Test {index}', 'result': 'unknown', 'notes': ''}
            for index in range(11)
        ]
        rejected = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': row.id,
                'quantity': 1,
                'condition': 'good',
                'dispatch': 'restoration',
                'product_mode': 'existing',
                'product_id': product.id,
                'restoration_scale': 'Functional',
                'restoration_grade_values': FUNCTIONAL_GRADES,
                'processing_handoff': {
                    'tested_status': 'tested',
                    'quick_tests': too_many,
                },
            },
            format='json',
        )
        self.assertEqual(rejected.status_code, 400, rejected.data)

        legacy = self._check_in_restoration(order, row, product)
        self.assertEqual(legacy.status_code, 200, legacy.data)
        job = RestorationJob.objects.get(item_check_in_id=legacy.data['item_check_in_id'])
        detail = self.client.get(f'/api/inventory/restoration-jobs/{job.id}/')
        self.assertEqual(detail.data['processing_handoff'], None)

    def test_handoff_survives_split_and_requeue(self):
        order, row, product = self._restoration_order()
        job = self._legacy_multitem_restoration_job(order, row, product, quantity=2)
        snapshot = dict(job.item_check_in.defaults_snapshot)
        snapshot['processing_handoff'] = {
            'schema_version': 1,
            'tested_status': 'untested',
            'condition_evidence': '',
            'unknowns': 'Function unknown.',
            'quick_tests': [],
            'recorded_at': '2026-07-10T20:00:00Z',
            'recorded_by_id': self.user.pk,
        }
        job.item_check_in.defaults_snapshot = snapshot
        job.item_check_in.save(update_fields=['defaults_snapshot'])
        item = job.item_check_in.items.order_by('id').first()

        split = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/split/',
            {'groups': [{'item_ids': [item.id]}]},
            format='json',
        )
        self.assertEqual(split.status_code, 200, split.data)
        self.assertEqual(
            split.data['created_jobs'][0]['processing_handoff']['tested_status'],
            'untested',
        )

        split_job = RestorationJob.objects.get(pk=split.data['created_jobs'][0]['id'])
        split_job.stage = RestorationJob.STAGE_DONE
        split_job.work_session = {'decisionWork': {'old': 'discarded'}}
        split_job.save(update_fields=['stage', 'work_session'])
        split_item = Item.objects.get(check_in=split_job.item_check_in)
        requeued = queue_add_restoration_item(split_item.sku, self.user)
        self.assertEqual(requeued.status, 'requeued')
        self.assertEqual(requeued.job.work_session, {})
        self.assertEqual(
            requeued.job.item_check_in.defaults_snapshot['processing_handoff']['tested_status'],
            'untested',
        )


class TarsDecisionWorkApiTests(RestorationQueueTestBase):
    def _sent_job(self):
        order, row, product = self._restoration_order(
            order_number=f'PO-TARS-DW-{RestorationJob.objects.count()}',
        )
        check_in = self._check_in_restoration(order, row, product)
        self.assertEqual(check_in.status_code, 200, check_in.data)
        job = RestorationJob.objects.get(item_check_in_id=check_in.data['item_check_in_id'])
        sent = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/send/')
        self.assertEqual(sent.status_code, 200, sent.data)
        return job

    def _save_decision(self, job, decision, **session_extra):
        return self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/work-session/',
            {
                'work_session': {
                    'workState': 'bench',
                    'selectedGrade': None,
                    'parts': [],
                    'orders': [],
                    'gradePlans': {},
                    'benchRows': [],
                    **session_extra,
                    'decisionWork': decision,
                },
            },
            format='json',
        )

    def test_valid_round_trip_recomputes_economics_and_preserves_session(self):
        job = self._sent_job()
        response = self._save_decision(
            job,
            decision_work_payload(),
            legacyKey={'keep': True},
            parts=[{
                'id': 'part-1',
                'qty': 1,
                'unitPriceEstimate': 6,
                'unitPriceActual': 0,
            }],
            orders=[{
                'id': 'order-1',
                'partIds': ['part-1'],
                'shipping': 2,
                'tax': 0,
                'fees': 0,
            }],
            gradePlans={'Working': {'estimateHours': 1, 'orderIds': ['order-1']}},
        )
        self.assertEqual(response.status_code, 200, response.data)
        session = response.data['work_session']
        self.assertEqual(session['legacyKey'], {'keep': True})
        self.assertEqual(session['selectedGrade'], 'Working')
        economics = session['decisionWork']['economics']
        self.assertEqual(economics['effectiveLaborRate'], 19.8)
        self.assertFalse(economics['queuePressureAffectsScore'])
        candidate = economics['candidates'][0]
        self.assertEqual(candidate['processorValue'], 19.99)
        self.assertEqual(candidate['partsAndOrdersCost'], 8.0)
        self.assertEqual(candidate['laborCost'], 19.8)
        self.assertEqual(candidate['contribution'], -7.81)

    def test_rejects_version_catalog_unknown_catalog_test_and_caps(self):
        job = self._sent_job()
        invalid_version = decision_work_payload()
        invalid_version['schemaVersion'] = 2
        response = self._save_decision(job, invalid_version)
        self.assertEqual(response.status_code, 400, response.data)

        unknown_catalog = decision_work_payload()
        unknown_catalog['tests'][0]['catalogTestId'] = 'not-in-catalog'
        response = self._save_decision(job, unknown_catalog)
        self.assertEqual(response.status_code, 400, response.data)

        custom_tests = decision_work_payload()
        custom_tests['tests'] = [
            {
                **custom_tests['tests'][0],
                'id': f'custom-{index}',
                'catalogTestId': None,
                'name': f'Custom {index}',
            }
            for index in range(31)
        ]
        response = self._save_decision(job, custom_tests)
        self.assertEqual(response.status_code, 400, response.data)

    def test_legacy_arbitrary_session_remains_valid(self):
        job = self._sent_job()
        response = self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/work-session/',
            {'work_session': {'anything': ['legacy'], 'actions': []}},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['work_session']['anything'], ['legacy'])

    def test_draft_unknown_may_be_saved_before_description_is_typed(self):
        job = self._sent_job()
        decision = decision_work_payload()
        decision['unknowns'] = [{
            'id': 'unknown:draft',
            'description': '',
            'decisionImpact': '',
            'resolved': False,
            'resolution': '',
        }]
        response = self._save_decision(job, decision)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            response.data['work_session']['decisionWork']['unknowns'][0]['description'],
            '',
        )

    def test_override_cannot_replace_required_selection(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        missing_selection = decision_work_payload(
            complete=False,
            override_reason='Recover a legacy item.',
        )
        saved = self._save_decision(job, missing_selection)
        self.assertEqual(saved.status_code, 200, saved.data)
        rejected = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Working'},
            format='json',
        )
        self.assertEqual(rejected.status_code, 400, rejected.data)
        self.assertIn('required phase 1 decision fields', rejected.data['detail'].lower())

    def test_completion_gate_override_and_mandatory_stop_out(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')

        incomplete = decision_work_payload()
        incomplete['handoff']['acknowledged'] = False
        incomplete['condition'] = {
            'currentGrade': 'Working',
            'condition': '',
            'completeness': 'unknown',
            'testedStatus': 'not_tested',
            'evidence': '',
        }
        incomplete['tests'][0]['result'] = None
        saved = self._save_decision(job, incomplete)
        self.assertEqual(saved.status_code, 200, saved.data)
        rejected = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Working'},
            format='json',
        )
        self.assertEqual(rejected.status_code, 400, rejected.data)

        incomplete['selection']['overrideReason'] = 'Recovering a legacy in-progress job.'
        saved = self._save_decision(job, incomplete)
        self.assertEqual(saved.status_code, 200, saved.data)
        selection = saved.data['work_session']['decisionWork']['selection']
        self.assertEqual(selection['overrideRecordedById'], self.user.pk)
        completed = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Working'},
            format='json',
        )
        self.assertEqual(completed.status_code, 200, completed.data)
        self.assertTrue(
            completed.data['work_session']['decisionWork']['timestamps']['completedAt'],
        )

        blocked_job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{blocked_job.id}/check-in/')
        blocked = decision_work_payload(stop_response='blocked', override_reason='Ignore margin gate.')
        saved = self._save_decision(blocked_job, blocked)
        self.assertEqual(saved.status_code, 200, saved.data)
        candidate = saved.data['work_session']['decisionWork']['economics']['candidates'][0]
        self.assertTrue(candidate['blocked'])
        rejected = self.client.post(
            f'/api/inventory/restoration-jobs/{blocked_job.id}/done/',
            {'destination': 'online_sales', 'final_grade': 'Working'},
            format='json',
        )
        self.assertEqual(rejected.status_code, 400, rejected.data)
        self.assertIn('mandatory stop-out', rejected.data['detail'].lower())

        salvage = decision_work_payload(
            grade='Parts-only',
            sale_state='salvage',
            action='salvage',
            stop_response='blocked',
        )
        saved = self._save_decision(blocked_job, salvage)
        self.assertEqual(saved.status_code, 200, saved.data)
        completed = self.client.post(
            f'/api/inventory/restoration-jobs/{blocked_job.id}/done/',
            {'destination': 'salvage', 'final_grade': 'Parts-only'},
            format='json',
        )
        self.assertEqual(completed.status_code, 200, completed.data)
        self.assertEqual(completed.data['bench_disposition'], 'salvage')

    def test_decision_work_survives_hold_and_parts_session_updates(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        saved = self._save_decision(job, decision_work_payload())
        self.assertEqual(saved.status_code, 200, saved.data)
        hold = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/hold/',
            {'reason': 'parts_needed'},
            format='json',
        )
        self.assertEqual(hold.status_code, 200, hold.data)
        self.assertEqual(
            hold.data['work_session']['decisionWork']['selection']['grade'],
            'Working',
        )

