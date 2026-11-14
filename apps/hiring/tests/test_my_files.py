"""Home > HR > Files (Dash Update #138): what a staff member signed for HR, and only their own."""
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.hiring import careers
from apps.hiring.models import CheckIn
from apps.hiring.tests import test_hiring as th
from apps.hiring.tests.test_onboard_on_sign import SignBase


@override_settings(STORAGES=th.IN_MEMORY)
class MyFilesTests(SignBase):
    def setUp(self):
        super().setUp()
        self.owner = th._user('owner@example.com', 'Admin')
        self.admin = APIClient()
        self.admin.force_authenticate(self.owner)

    def hired(self):
        """Dana signs her offer (which makes her login and onboarding) and signs in."""
        self.sign(self.make())
        self.dana = User.objects.get(email='dana@example.com')
        self.me = APIClient()
        self.me.force_authenticate(self.dana)

    def publish_handbook(self, text):
        draft = {'title': 'Staff handbook', 'text': text, 'acknowledgment': 'I read it.'}
        careers.apply_doc(careers.check_doc({'format': careers.FORMAT, 'handbook': draft})['doc'], user=self.owner)
        self.assertEqual(self.admin.post('/api/hiring/handbook/publish/', {}, format='json').status_code, 201)

    def sign_handbook(self):
        body = {'name': 'Dana Miles', 'signature': th._signature_data_url(), 'acknowledged': True, 'consent': True}
        self.assertEqual(self.me.post('/api/hiring/me/handbook/sign/', body, format='json').status_code, 201)

    def sign_checkin(self, day):
        row = CheckIn.objects.get(user=self.dana, day=day)
        self.staff.patch(f'/api/hiring/checkins/{row.pk}/', {
            'answers': {'questions': {'going_well': 'Great with customers.', 'goals': 'Learn pricing.'},
                        'areas': {'Learning the role': {'rating': 'On track', 'note': 'Fast.'}}}}, format='json')
        signed = self.staff.post(f'/api/hiring/checkins/{row.pk}/sign/', {
            'manager_name': 'Test Manager', 'manager_signature': th._signature_data_url(),
            'employee_name': 'Dana Miles', 'employee_signature': th._signature_data_url(), 'acknowledged': True,
        }, format='json')
        self.assertEqual(signed.status_code, 200, signed.data)

    def test_offer_every_handbook_version_and_check_ins_newest_first(self):
        self.hired()
        empty = self.me.get('/api/hiring/me/files/').data
        self.assertIsNone(empty['handbook'])
        self.assertEqual([f['kind'] for f in empty['files']], ['offer'])

        self.publish_handbook('## Welcome\nHello.')
        self.assertIsNone(self.me.get('/api/hiring/me/files/').data['handbook']['signed'])
        self.sign_handbook()
        self.publish_handbook('## Welcome\nHello again.')
        self.sign_checkin(30)

        data = self.me.get('/api/hiring/me/files/').data
        self.assertEqual(data['handbook']['version'], 2)
        self.assertIsNone(data['handbook']['signed'])  # version 2 is new: still to sign
        self.assertEqual([f['kind'] for f in data['files']], ['checkin', 'handbook', 'offer'])
        self.assertEqual(data['files'][1]['title'], 'Staff handbook (version 1)')
        self.assertEqual(data['files'][2]['title'], 'Offer letter: Retail Associate')
        for row in data['files']:  # every PDF opens for her
            response = self.me.get(f"/api{row['pdf']}")
            self.assertEqual(response.status_code, 200, row)
            self.assertTrue(b''.join(response.streaming_content).startswith(b'%PDF'))

    def test_someone_else_sees_none_of_it(self):
        self.hired()
        offer_pdf = self.me.get('/api/hiring/me/files/').data['files'][0]['pdf']
        other = APIClient()
        other.force_authenticate(th._user('other@example.com', 'Employee'))
        self.assertEqual(other.get('/api/hiring/me/files/').data['files'], [])
        self.assertEqual(other.get(f'/api{offer_pdf}').status_code, 404)
        self.assertEqual(self.public.get('/api/hiring/me/files/').status_code, 401)
