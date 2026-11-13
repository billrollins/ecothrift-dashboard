"""Design Lab page checklist (Dash Update #134): the owner ticks each page's design steps."""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import AppSetting, AppSettingHistory

URL = '/api/core/design-lab/checks/'


def _client(email, superuser=False, role='Manager'):
    make = get_user_model().objects.create_superuser if superuser else get_user_model().objects.create_user
    user = make(email, 'Bill', 'Owner', password='x')
    if not superuser:
        user.groups.add(Group.objects.get_or_create(name=role)[0])
    client = APIClient()
    client.force_authenticate(user)
    return client


class DesignLabChecksTests(TestCase):
    def test_empty_at_first(self):
        r = _client('owner@example.com', superuser=True).get(URL)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['checks'], {})

    def test_ticking_a_step_ticks_the_ones_before_it_and_keeps_history(self):
        owner = _client('owner@example.com', superuser=True)
        r = owner.put(URL, {'page': 'receiving', 'step': 'design', 'on': True}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        entry = r.data['checks']['receiving']
        self.assertEqual((entry['template'], entry['design'], entry['done']), (True, True, False))
        self.assertEqual(entry['by'], 'Bill')
        self.assertEqual(AppSetting.objects.get(key='design_lab.page_checks').value['receiving']['design'], True)
        self.assertEqual(AppSettingHistory.objects.filter(key='design_lab.page_checks').count(), 1)

    def test_unticking_a_step_unticks_the_ones_after_it(self):
        owner = _client('owner@example.com', superuser=True)
        owner.put(URL, {'page': 'receiving', 'step': 'done', 'on': True}, format='json')
        r = owner.put(URL, {'page': 'receiving', 'step': 'design', 'on': False}, format='json')
        entry = r.data['checks']['receiving']
        self.assertEqual((entry['template'], entry['design'], entry['done']), (True, False, False))
        other = owner.put(URL, {'page': 'vendors', 'step': 'template', 'on': True}, format='json').data['checks']
        self.assertEqual(set(other), {'receiving', 'vendors'})

    def test_bad_input_is_refused(self):
        owner = _client('owner@example.com', superuser=True)
        for body in ({'page': 'receiving', 'step': 'approved', 'on': True},
                     {'page': '../x', 'step': 'design', 'on': True},
                     {'page': 'receiving', 'step': 'design', 'on': 'yes'}):
            self.assertEqual(owner.put(URL, body, format='json').status_code, 400)

    def test_only_the_owner(self):
        mgr = _client('mgr@example.com')
        self.assertEqual(mgr.get(URL).status_code, 403)
        self.assertEqual(mgr.put(URL, {'page': 'receiving', 'step': 'design', 'on': True}, format='json').status_code, 403)
