"""Incident reports (Samantha + Bill, Dash Updates #131, 2026-11-13): staff file, managers follow up, nothing deleted."""
import json
from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, StaffThread, User
from apps.core.models import WorkLocation
from apps.floorplan.models import FloorPlan, MapLayer, MapPin
from apps.hr.models import IncidentNote, IncidentReport

IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def _person(email, role='Employee'):
    user = User.objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='T',
                                    password='test-pass-123', is_staff=True)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                   pay_rate=Decimal('15'), hire_date=date(2026, 1, 1))
    return user


def _png(name='scene.png'):
    buf = BytesIO()
    Image.new('RGB', (4, 4), (200, 30, 30)).save(buf, format='PNG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')


def _report(**extra):
    return {
        'occurred_at': (timezone.now() - timedelta(minutes=20)).isoformat(),
        'kind': 'fall', 'place': 'stairs', 'place_detail': 'Stairs behind the break room',
        'people': [{'role': 'customer', 'name': 'Pat', 'contact': '555-0100'}],
        'what_happened': 'Asked for the restroom, walked into the back and fell down the stairs.',
        'injuries': 'Sore wrist', 'first_aid': True, 'called_911': False,
        'witnesses': 'Carrie', 'cameras': 'Back hallway camera', 'follow_up': 'Lock the stair door',
        **extra,
    }


@override_settings(STORAGES=IN_MEMORY)
class IncidentReportTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_superuser(email='owner@x.com', password='pass1234', first_name='Bill',
                                                   last_name='O')
        self.manager = _person('manager@x.com', 'Manager')
        self.carrie = _person('carrie@x.com')
        self.dave = _person('dave@x.com')

    def _file(self, who, **extra):
        self.client.force_authenticate(who)
        return self.client.post('/api/hr/incidents/', _report(**extra), format='json')

    def test_staff_file_and_the_owner_gets_a_message(self):
        with self.captureOnCommitCallbacks(execute=True):
            res = self._file(self.carrie)
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual((body['kind_label'], body['place_label'], body['status']),
                         ('Fall or slip', 'Stairs or back hallway', 'open'))
        self.assertEqual(body['reported_by_name'], self.carrie.full_name)
        self.assertEqual(body['people'], [{'role': 'customer', 'name': 'Pat', 'contact': '555-0100'}])
        thread = StaffThread.objects.get()
        self.assertIn('Incident report: Fall or slip', thread.subject)
        self.assertEqual(set(thread.members.values_list('user__email', flat=True)), {'owner@x.com', 'carrie@x.com'})

    def test_owner_filing_gets_no_message_to_self(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self._file(self.owner).status_code, 201)
        self.assertFalse(StaffThread.objects.exists())

    def test_staff_see_their_own_managers_see_all(self):
        self._file(self.carrie)
        self._file(self.dave, kind='animal')
        self.client.force_authenticate(self.dave)
        listed = self.client.get('/api/hr/incidents/').json()
        self.assertFalse(listed['can_manage'])
        self.assertEqual([r['kind'] for r in listed['reports']], ['animal'])
        carries = IncidentReport.objects.get(reported_by=self.carrie)
        self.assertEqual(self.client.get(f'/api/hr/incidents/{carries.pk}/').status_code, 404)
        self.client.force_authenticate(self.manager)
        listed = self.client.get('/api/hr/incidents/').json()
        self.assertTrue(listed['can_manage'])
        self.assertEqual(len(listed['reports']), 2)

    def test_what_happened_is_required_and_no_future_time(self):
        self.assertEqual(self._file(self.carrie, what_happened='  ').status_code, 400)
        later = (timezone.now() + timedelta(hours=2)).isoformat()
        self.assertEqual(self._file(self.carrie, occurred_at=later).status_code, 400)

    def test_an_edit_keeps_the_old_text(self):
        rid = self._file(self.carrie).json()['id']
        res = self.client.patch(f'/api/hr/incidents/{rid}/', {'injuries': 'Sprained wrist, went to urgent care'},
                                format='json')
        self.assertEqual(res.status_code, 200, res.content)
        edit = IncidentNote.objects.get(report_id=rid, kind='edit')
        self.assertEqual(edit.changes,
                         {'injuries': {'old': 'Sore wrist', 'new': 'Sprained wrist, went to urgent care'}})
        # Nothing changed: no new history line.
        self.client.patch(f'/api/hr/incidents/{rid}/', {'injuries': 'Sprained wrist, went to urgent care'},
                          format='json')
        self.assertEqual(IncidentNote.objects.filter(report_id=rid, kind='edit').count(), 1)

    def test_managers_note_close_and_reopen_staff_cannot_close(self):
        rid = self._file(self.carrie).json()['id']
        self.assertEqual(self.client.post(f'/api/hr/incidents/{rid}/close/').status_code, 403)
        self.assertEqual(self.client.post(f'/api/hr/incidents/{rid}/notes/', {'body': 'Pat called back, fine.'},
                                          format='json').status_code, 201)
        self.client.force_authenticate(self.manager)
        self.client.post(f'/api/hr/incidents/{rid}/notes/', {'body': 'Door now locked.'}, format='json')
        closed = self.client.post(f'/api/hr/incidents/{rid}/close/', {'note': 'Done'}, format='json').json()
        self.assertEqual((closed['status'], closed['closed_by_name']), ('closed', self.manager.full_name))
        self.assertEqual([n['kind'] for n in closed['notes']], ['note', 'note', 'closed'])
        # The reporter cannot edit a closed report; a manager can reopen it.
        self.client.force_authenticate(self.carrie)
        self.assertEqual(
            self.client.patch(f'/api/hr/incidents/{rid}/', {'witnesses': 'x'}, format='json').status_code, 403)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f'/api/hr/incidents/{rid}/reopen/').json()['status'], 'open')

    def test_nothing_is_deleted(self):
        rid = self._file(self.carrie).json()['id']
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.delete(f'/api/hr/incidents/{rid}/').status_code, 405)
        self.assertTrue(IncidentReport.objects.filter(pk=rid).exists())

    def test_photos_on_filing_and_later(self):
        self.client.force_authenticate(self.carrie)
        data = {**_report(), 'people': json.dumps(_report()['people']), 'photos': [_png(), _png('b.png')]}
        res = self.client.post('/api/hr/incidents/', data, format='multipart')
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual((len(body['photos']), body['people'][0]['name'], body['first_aid']), (2, 'Pat', True))
        photo = self.client.get(f"/api/hr/incidents/{body['id']}/photos/{body['photos'][0]}/")
        self.assertEqual(photo.status_code, 200)
        more = self.client.post(f"/api/hr/incidents/{body['id']}/photos/", {'photos': [_png('c.png')]},
                                format='multipart')
        self.assertEqual(more.status_code, 201, more.content)
        self.assertEqual((len(more.json()['photos']), more.json()['notes'][-1]['kind']), (3, 'photo'))

    def test_a_spot_on_the_store_map(self):
        store = WorkLocation.objects.create(name='Main Store')
        plan = FloorPlan.objects.create(name='Plan', location=store, is_current=True)
        layer = MapLayer.objects.get(slug='incidents')
        res = self._file(self.carrie, map={'plan': plan.pk, 'x': 100, 'y': 50})
        self.assertEqual(res.status_code, 201, res.content)
        pin = MapPin.objects.get(layer=layer)
        self.assertEqual((pin.ref_type, pin.ref_id, pin.x), ('hr.incident', res.json()['id'], 100))
        self.assertTrue(pin.name.startswith('Fall or slip'))
        self.assertNotIn('Pat', pin.name)
        # Moving the spot keeps the old one in the history; the map shows one pin.
        self.client.patch(f"/api/hr/incidents/{res.json()['id']}/", {'map': {'plan': plan.pk, 'x': 120, 'y': 50}},
                          format='json')
        edit = IncidentNote.objects.get(kind='edit')
        self.assertEqual((edit.changes['map']['old']['x'], edit.changes['map']['new']['x']), (100, 120))
        self.assertEqual(MapPin.objects.filter(layer=layer).count(), 1)
        # A plan that is not Current, or a spot off the map, is refused.
        old = FloorPlan.objects.create(name='Old', location=WorkLocation.objects.create(name='Annex'))
        self.assertEqual(self._file(self.carrie, map={'plan': old.pk, 'x': 1, 'y': 1}).status_code, 400)
        self.assertEqual(self._file(self.carrie, map={'plan': plan.pk, 'x': 99999, 'y': 1}).status_code, 400)

    def test_a_new_current_plan_carries_the_spot(self):
        """#130 copies pins onto a newly Current plan: the report shows the copy, and moving it leaves the past one."""
        store = WorkLocation.objects.create(name='Main Store')
        old = FloorPlan.objects.create(name='Old', location=store, is_current=True)
        rid = self._file(self.carrie, map={'plan': old.pk, 'x': 10, 'y': 10}).json()['id']
        old.is_current = False
        old.save(update_fields=['is_current'])
        new = FloorPlan.objects.create(name='New', location=store, is_current=True)
        first = MapPin.objects.get(plan=old)
        MapPin.objects.create(plan=new, layer=first.layer, x=11, y=12, name=first.name, ref_type=first.ref_type,
                              ref_id=first.ref_id)
        self.assertEqual(self.client.get(f'/api/hr/incidents/{rid}/').json()['map_pin']['plan'], new.pk)
        self.client.patch(f'/api/hr/incidents/{rid}/', {'map': {'plan': new.pk, 'x': 30, 'y': 30}}, format='json')
        self.assertEqual(sorted(MapPin.objects.values_list('plan_id', 'x')), sorted([(old.pk, 10), (new.pk, 30)]))
        edit = IncidentNote.objects.get(kind='edit')
        self.assertEqual((edit.changes['map']['old']['x'], edit.changes['map']['new']['x']), (11, 30))

    def test_customers_cannot_reach_it(self):
        customer = User.objects.create_user(email='c@x.com', password='pass1234', first_name='C', last_name='U')
        self.client.force_authenticate(customer)
        self.assertEqual(self.client.get('/api/hr/incidents/').status_code, 403)
