"""HR questions (Bill, Dash Updates #59, 2026-11-03): anyone asks HR from the HR app; People at Manage answers."""
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.hr.models import HrQuestion


def _person(email, role='Employee'):
    user = User.objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='T',
                                    password='test-pass-123', is_staff=True)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                   pay_rate=Decimal('15'), hire_date=date(2026, 1, 1))
    return user


class HrQuestionTests(APITestCase):
    def setUp(self):
        self.manager = _person('manager@x.com', 'Manager')
        self.carrie = _person('carrie@x.com')
        self.dave = _person('dave@x.com')

    def _ask(self, who, question):
        self.client.force_authenticate(who)
        return self.client.post('/api/hr/questions/', {'question': question}, format='json')

    def test_staff_ask_and_a_manager_answers(self):
        res = self._ask(self.carrie, '  When is payday?  ')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual((res.json()['question'], res.json()['status']), ('When is payday?', 'open'))
        self.client.force_authenticate(self.manager)
        self.assertEqual([q['id'] for q in self.client.get('/api/hr/questions/', {'status': 'open'}).json()],
                         [res.json()['id']])
        answered = self.client.post(f"/api/hr/questions/{res.json()['id']}/answer/", {'answer': 'Every other Friday'},
                                    format='json')
        self.assertEqual(answered.status_code, 200, answered.content)
        self.assertEqual((answered.json()['status'], answered.json()['answered_by_name']),
                         ('answered', self.manager.full_name))
        self.client.force_authenticate(self.carrie)
        self.assertEqual(self.client.get('/api/hr/questions/').json()[0]['answer'], 'Every other Friday')

    def test_staff_see_only_their_own_and_cannot_answer(self):
        self._ask(self.carrie, 'Can I wear jeans?')
        self._ask(self.dave, 'Where is the break room key?')
        self.assertEqual([q['employee'] for q in self.client.get('/api/hr/questions/').json()], [self.dave.pk])
        row = HrQuestion.objects.get(employee=self.carrie)
        self.assertEqual(self.client.post(f'/api/hr/questions/{row.pk}/answer/', {'answer': 'Yes'},
                                          format='json').status_code, 403)

    def test_an_empty_question_or_answer_is_refused(self):
        self.assertEqual(self._ask(self.carrie, '   ').status_code, 400)
        row = HrQuestion.objects.create(employee=self.carrie, question='Uniform?')
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f'/api/hr/questions/{row.pk}/answer/', {'answer': ''},
                                          format='json').status_code, 400)
