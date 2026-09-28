"""data_platform Phase 3: standing QA checks, their history, the AI triage, and the SHR-03 fix request."""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.core.models import ApprovalRequest, WorkLocation
from apps.core.services import approval_requests as ar
from apps.inventory.models import Item, Product
from apps.pos.models import Cart, CartLine, Drawer, Register
from apps.qa import checks
from apps.qa.models import QAFinding
from apps.qa.services import runner

D = Decimal


def _sold_but_on_shelf(sku: str) -> Item:
    """An item on the floor that is on a completed sale (SHR-03)."""
    clerk = User.objects.filter(email='qa-clerk@example.com').first() or User.objects.create_user(
        'qa-clerk@example.com', 'Q', 'A', password='x-pass-123')
    reg, _ = Register.objects.get_or_create(code='QA-R1', defaults={'location': WorkLocation.objects.create(name='QA'), 'name': 'QA'})
    drawer, _ = Drawer.objects.get_or_create(register=reg, date=timezone.localdate(), defaults={
        'current_cashier': clerk, 'opened_by': clerk, 'opened_at': timezone.now(), 'status': 'open'})
    item = Item.objects.create(sku=sku, product=Product.objects.create(title=f'Lamp {sku}'), price=D('20.00'), status='on_shelf')
    cart = Cart.objects.create(drawer=drawer, cashier=clerk, status='completed', completed_at=timezone.now())
    CartLine.objects.create(cart=cart, item=item, description='Lamp', quantity=1, unit_price=D('18.00'))
    return item


class QaRunTests(TestCase):
    def setUp(self):
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123')
        self.free = Item.objects.create(sku='ITMQA0001', product=Product.objects.create(title='Free lamp'), price=D('0'), status='on_shelf')
        self.ghost = _sold_but_on_shelf('ITMQA0002')

    def test_a_run_counts_every_check_and_the_next_run_shows_the_change(self):
        first = runner.run(triage=False, stage_fixes=False)
        self.assertEqual(first.counts['ITM-07'], 1)
        self.assertEqual(first.counts['SHR-03'], 1)
        self.assertEqual(first.counts['TP-01'], 0)  # Thrift+ is dark: the check waits for the switch
        self.assertEqual(QAFinding.objects.get(run=first, check_id='ITM-07').sample[0]['sku'], 'ITMQA0001')
        Item.objects.create(sku='ITMQA0003', product=Product.objects.create(title='Free mug'), price=D('0'), status='on_shelf')
        second = runner.run(triage=False, stage_fixes=False)
        finding = QAFinding.objects.get(run=second, check_id='ITM-07')
        self.assertEqual((finding.count, finding.previous, finding.delta), (2, 1, 1))

    def test_a_broken_check_is_recorded_and_the_rest_still_run(self):
        broken = checks.Check('ZZ-01', 'Broken', 'test', 'low', 'n/a', lambda: 1 / 0)
        with_broken = [broken] + checks.CHECKS  # built once: the runner reads its own import of the list
        with patch.object(runner, 'CHECKS', with_broken):
            run = runner.run(triage=False, stage_fixes=False)
        self.assertIn('division by zero', QAFinding.objects.get(run=run, check_id='ZZ-01').error)
        self.assertEqual(run.counts['ITM-07'], 1)

    def test_the_triage_is_written_and_a_failed_triage_does_not_stop_the_run(self):
        answer = ({'headline': 'One item on the floor at $0.', 'notes': [{'check_id': 'ITM-07', 'verdict': 'new', 'note': 'Reprice it.'}]}, 'm')
        with patch.object(runner, '_ask', return_value=answer):
            run = runner.run(stage_fixes=False)
        self.assertEqual((run.triage['headline'], run.triage_model), ('One item on the floor at $0.', 'm'))
        with patch.object(runner, '_ask', side_effect=RuntimeError('no key')):
            run = runner.run(stage_fixes=False)
        self.assertIn('no key', run.triage['error'])
        self.assertIsNotNone(run.finished_at)

    def test_shr03_stages_one_fix_request_that_marks_the_item_sold_and_undoes(self):
        runner.run(triage=False)
        runner.run(triage=False)  # a second run does not stage a second request while one waits
        req = ApprovalRequest.objects.get(kind='qa.sold_from_cart')
        self.assertEqual(req.status, ApprovalRequest.STATUS_PENDING)
        self.assertEqual(req.preview['counts']['Items on the floor and on a completed sale'], 1)
        ar.approve(req, self.boss, start=False)
        done = ar.run(req.pk)
        self.assertEqual(done.status, ApprovalRequest.STATUS_APPLIED)
        self.ghost.refresh_from_db()
        self.assertEqual((self.ghost.status, self.ghost.sold_for), ('sold', D('18.00')))
        ar.undo(done, self.boss)
        self.ghost.refresh_from_db()
        self.assertEqual((self.ghost.status, self.ghost.sold_at), ('on_shelf', None))


class QaApiTests(APITestCase):
    def test_superuser_only_and_the_latest_run(self):
        staff = User.objects.create_user('staff@example.com', 'S', 'T', password='x-pass-123')
        staff.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get('/api/qa/latest/').status_code, 403)
        boss = User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123')
        self.client.force_authenticate(boss)
        self.assertEqual(self.client.get('/api/qa/latest/').json(), {'run': None, 'running': False})
        runner.run(triage=False, stage_fixes=False)
        data = self.client.get('/api/qa/latest/').json()
        self.assertEqual(len(data['run']['findings']), len(checks.CHECKS))
        self.assertEqual(len(self.client.get('/api/qa/history/ITM-07/').json()), 1)
        with patch.object(runner.threading, 'Thread') as thread:
            self.assertEqual(self.client.post('/api/qa/run/').status_code, 202)
        thread.return_value.start.assert_called_once()
