"""Home > Profile (Dash Update #139): my work details and next review in the Me payload, my photo, and the staff window's
photo and next review date (the owner's view of the same person)."""
import io
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase

from apps.accounts.models import AccountEvent, EmployeeProfile, User
from apps.hiring.models import CheckIn
from apps.hr.models import Department

IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def _user(email, role='Employee', **profile):
    user = User.objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='T',
                                    password='pw-12345-xx', is_staff=True)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                   hire_date=timezone.localdate(), **profile)
    return user


def _picture(width=800, height=600, fmt='JPEG', name='me.jpg'):
    buf = io.BytesIO()
    Image.new('RGB', (width, height), (40, 120, 60)).save(buf, format=fmt)
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


class ProfilePayloadTests(APITestCase):
    def setUp(self):
        self.dept = Department.objects.create(name='Profile Test Dept')
        self.me = _user('rosa@x.com', department=self.dept, position='Processor', employment_type='part_time',
                        level='senior', pay_rate=Decimal('15.50'), overtime_allowance_hours=Decimal('5'))
        self.client.force_authenticate(self.me)

    def test_work_details_are_in_the_payload(self):
        body = self.client.get('/api/auth/me/page/').json()
        e = body['employee']
        self.assertEqual((e['department'], e['position'], e['employment_type'], e['level']),
                         ('Profile Test Dept', 'Processor', 'part_time', 'senior'))
        self.assertEqual((e['pay_rate'], e['on_payroll'], e['overtime_allowance_hours']), ('15.50', True, '5.00'))
        self.assertIsNone(body['details']['photo_url'])
        self.assertIsNone(body['next_review'])

    def test_next_review_is_the_date_a_manager_set(self):
        day = timezone.localdate() + timedelta(days=20)
        EmployeeProfile.objects.filter(user=self.me).update(next_review_date=day)
        review = self.client.get('/api/auth/me/page/').json()['next_review']
        self.assertEqual(review, {'kind': 'review', 'date': day.isoformat(), 'label': 'Performance review',
                                  'with': '', 'days': 20})

    def test_a_sooner_check_in_shows_first_and_done_ones_do_not(self):
        boss = _user('boss@x.com', role='Admin')
        today = timezone.localdate()
        EmployeeProfile.objects.filter(user=self.me).update(next_review_date=today + timedelta(days=40))
        CheckIn.objects.create(user=self.me, manager=boss, day=30, due_date=today - timedelta(days=5),
                               status=CheckIn.STATUS_DONE)
        CheckIn.objects.create(user=self.me, manager=boss, day=60, due_date=today + timedelta(days=9))
        review = self.client.get('/api/auth/me/page/').json()['next_review']
        self.assertEqual((review['kind'], review['label'], review['with'], review['days']),
                         ('checkin', '60-day check-in', 'Boss T', 9))

    def test_a_later_check_in_does_not_hide_a_sooner_review(self):
        today = timezone.localdate()
        EmployeeProfile.objects.filter(user=self.me).update(next_review_date=today + timedelta(days=3))
        CheckIn.objects.create(user=self.me, day=90, due_date=today + timedelta(days=30))
        self.assertEqual(self.client.get('/api/auth/me/page/').json()['next_review']['kind'], 'review')

    def test_work_details_stay_read_only_for_the_person(self):
        # The only thing I change is my phone and emergency contact; pay or level sent here is ignored.
        res = self.client.patch('/api/auth/me/details/', {'phone': '402-555-0101', 'pay_rate': '99',
                                                         'level': 'manager'}, format='json')
        self.assertEqual(res.status_code, 200)
        profile = EmployeeProfile.objects.get(user=self.me)
        self.assertEqual((profile.pay_rate, profile.level), (Decimal('15.50'), 'senior'))
        # And staff cannot reach the staff window's endpoints.
        self.assertEqual(self.client.patch(f'/api/accounts/users/{self.me.pk}/employee_profile/',
                                           {'pay_rate': '99'}, format='json').status_code, 403)


@override_settings(STORAGES=IN_MEMORY)
class MyPhotoTests(APITestCase):
    def setUp(self):
        self.me = _user('carrie@x.com')
        self.client.force_authenticate(self.me)

    def test_a_photo_is_kept_as_a_square_and_can_be_removed(self):
        res = self.client.post('/api/auth/me/photo/', {'photo': _picture(1200, 600)}, format='multipart')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['details']['photo_url'])
        self.me.refresh_from_db()
        with self.me.photo.open('rb') as fh:
            self.assertEqual(Image.open(fh).size, (480, 480))
        self.assertTrue(self.me.photo.name.startswith('staff/photos/'))
        self.assertEqual(AccountEvent.objects.filter(user=self.me, kind=AccountEvent.KIND_PHOTO).count(), 1)
        # The serializer the staff window and the top bar read has it too.
        self.assertTrue(self.client.get('/api/auth/me/').json()['photo_url'])

        res = self.client.delete('/api/auth/me/photo/')
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.json()['details']['photo_url'])
        self.me.refresh_from_db()
        self.assertFalse(self.me.photo)
        self.assertEqual(AccountEvent.objects.filter(user=self.me, kind=AccountEvent.KIND_PHOTO).count(), 2)

    def test_png_and_a_small_picture_work(self):
        res = self.client.post('/api/auth/me/photo/', {'photo': _picture(200, 300, 'PNG', 'me.png')},
                               format='multipart')
        self.assertEqual(res.status_code, 200, res.content)
        self.me.refresh_from_db()
        with self.me.photo.open('rb') as fh:
            self.assertEqual(Image.open(fh).size, (480, 480))

    def test_not_a_photo_or_no_file_is_refused(self):
        bad = SimpleUploadedFile('notes.jpg', b'not a picture', content_type='image/jpeg')
        res = self.client.post('/api/auth/me/photo/', {'photo': bad}, format='multipart')
        self.assertEqual((res.status_code, res.json()['code']), (400, 'NOT_A_PHOTO'))
        res = self.client.post('/api/auth/me/photo/', {}, format='multipart')
        self.assertEqual((res.status_code, res.json()['code']), (400, 'NO_PHOTO'))
        self.me.refresh_from_db()
        self.assertFalse(self.me.photo)

    def test_removing_with_no_photo_changes_nothing(self):
        self.assertEqual(self.client.delete('/api/auth/me/photo/').status_code, 200)
        self.assertFalse(AccountEvent.objects.filter(user=self.me, kind=AccountEvent.KIND_PHOTO).exists())


@override_settings(STORAGES=IN_MEMORY)
class StaffWindowPhotoAndReviewTests(APITestCase):
    def setUp(self):
        self.owner = _user('boss@x.com', role='Admin')
        self.staff = _user('dana@x.com')

    def test_the_owner_sets_their_photo_and_next_review(self):
        self.client.force_authenticate(self.owner)
        res = self.client.post(f'/api/accounts/users/{self.staff.pk}/photo/', {'photo': _picture()},
                               format='multipart')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['photo_url'])
        event = AccountEvent.objects.get(user=self.staff, kind=AccountEvent.KIND_PHOTO)
        self.assertEqual(event.actor, self.owner)

        day = (timezone.localdate() + timedelta(days=30)).isoformat()
        res = self.client.patch(f'/api/accounts/users/{self.staff.pk}/employee_profile/',
                                {'next_review_date': day}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.client.get(f'/api/accounts/users/{self.staff.pk}/').json()['employee']['next_review_date'],
                         day)

        # What the owner set is what the person sees on their Profile.
        self.client.force_authenticate(self.staff)
        body = self.client.get('/api/auth/me/page/').json()
        self.assertTrue(body['details']['photo_url'])
        self.assertEqual(body['next_review']['date'], day)

        self.client.force_authenticate(self.owner)
        res = self.client.delete(f'/api/accounts/users/{self.staff.pk}/photo/')
        self.assertEqual((res.status_code, res.json()['photo_url']), (200, None))

    def test_staff_cannot_set_someone_elses_photo(self):
        self.client.force_authenticate(self.staff)
        res = self.client.post(f'/api/accounts/users/{self.owner.pk}/photo/', {'photo': _picture()},
                               format='multipart')
        self.assertEqual(res.status_code, 403)
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.photo)
