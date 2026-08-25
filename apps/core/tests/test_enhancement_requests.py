"""Staff file enhancement requests. Superuser triages. Owner-only notes."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient


class EnhancementRequestApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        staff_group, _ = Group.objects.get_or_create(name='Manager')
        admin_group, _ = Group.objects.get_or_create(name='Admin')

        self.staff = User.objects.create_user(
            email='mike@example.com',
            first_name='Mike',
            last_name='Tars',
            password='pw',
        )
        self.staff.groups.add(staff_group)
        self.client = APIClient()
        self.client.force_authenticate(user=self.staff)

        self.other = User.objects.create_user(
            email='ashley@example.com',
            first_name='Ashley',
            last_name='Proc',
            password='pw',
        )
        self.other.groups.add(staff_group)
        self.other_client = APIClient()
        self.other_client.force_authenticate(user=self.other)

        self.superuser = User.objects.create_superuser(
            email='owner@example.com',
            first_name='Owner',
            last_name='User',
            password='pw',
        )
        self.superuser.groups.add(admin_group)
        self.owner = APIClient()
        self.owner.force_authenticate(user=self.superuser)

    def _create(self, client=None, **kwargs):
        payload = {
            'area': 'restoration',
            'body': 'Need a parts bin on the bench.',
        }
        payload.update(kwargs)
        who = client or self.client
        return who.post('/api/core/enhancement-requests/', payload, format='json')

    def test_staff_creates_and_sees_every_request(self):
        mine = self._create()
        self.assertEqual(mine.status_code, 201, mine.data)
        self.assertEqual(mine.data['status'], 'open')
        self.assertEqual(mine.data['priority'], 'unset')
        self.assertTrue(mine.data['can_edit'])
        self.assertTrue(mine.data['can_note'])
        self.assertEqual(mine.data['submitted_by'], self.staff.id)

        theirs = self._create(self.other_client, area='processing', body='Need a scan beep.')
        self.assertEqual(theirs.status_code, 201, theirs.data)

        listed = self.client.get('/api/core/enhancement-requests/')
        self.assertEqual(listed.status_code, 200, listed.data)
        self.assertEqual(len(listed.data), 2)
        theirs_row = next(row for row in listed.data if row['id'] == theirs.data['id'])
        self.assertFalse(theirs_row['can_edit'])
        self.assertFalse(theirs_row['can_note'])

    def test_staff_cannot_note_on_someone_elses_request(self):
        created = self._create()
        blocked = self.other_client.post(
            f'/api/core/enhancement-requests/{created.data["id"]}/notes/',
            {'body': 'I want this too.'},
            format='json',
        )
        self.assertEqual(blocked.status_code, 403, blocked.data)

        own = self.client.post(
            f'/api/core/enhancement-requests/{created.data["id"]}/notes/',
            {'body': 'Bin by the hinge shelf.'},
            format='json',
        )
        self.assertEqual(own.status_code, 201, own.data)
        self.assertEqual(len(own.data['notes']), 1)
        self.assertEqual(own.data['notes'][0]['body'], 'Bin by the hinge shelf.')

    def test_staff_cannot_triage(self):
        created = self._create()
        blocked = self.client.post(
            f'/api/core/enhancement-requests/{created.data["id"]}/triage/',
            {'priority': 'high', 'target_date': '2026-09-01'},
            format='json',
        )
        self.assertEqual(blocked.status_code, 403, blocked.data)

    def test_superuser_triage_sets_priority_and_target_date(self):
        created = self._create()
        triaged = self.owner.post(
            f'/api/core/enhancement-requests/{created.data["id"]}/triage/',
            {'priority': 'high', 'status': 'planned', 'target_date': '2026-09-01'},
            format='json',
        )
        self.assertEqual(triaged.status_code, 200, triaged.data)
        self.assertEqual(triaged.data['priority'], 'high')
        self.assertEqual(triaged.data['status'], 'planned')
        self.assertEqual(triaged.data['target_date'], '2026-09-01')
        self.assertEqual(triaged.data['reviewed_by'], self.superuser.id)

        noted = self.owner.post(
            f'/api/core/enhancement-requests/{created.data["id"]}/notes/',
            {'body': 'Will do this after labels.'},
            format='json',
        )
        self.assertEqual(noted.status_code, 201, noted.data)
        self.assertEqual(len(noted.data['notes']), 1)

    def test_owner_edits_own_body(self):
        created = self._create()
        patched = self.client.patch(
            f'/api/core/enhancement-requests/{created.data["id"]}/',
            {'body': 'Need two parts bins on the bench.', 'area': 'restoration'},
            format='json',
        )
        self.assertEqual(patched.status_code, 200, patched.data)
        self.assertEqual(patched.data['body'], 'Need two parts bins on the bench.')

        blocked = self.other_client.patch(
            f'/api/core/enhancement-requests/{created.data["id"]}/',
            {'body': 'Changed my mind.', 'area': 'processing'},
            format='json',
        )
        self.assertEqual(blocked.status_code, 403, blocked.data)

    def test_empty_body_refused(self):
        blank = self._create(body='   ')
        self.assertEqual(blank.status_code, 400, blank.data)
