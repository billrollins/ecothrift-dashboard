"""Dash Fixes: visibility, owner-only actions, the Enhancements copy, the bell counts."""
import importlib
from datetime import timedelta

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core import dash_fix_json
from apps.core.models import DashFix, DashFixNote, EnhancementRequest, EnhancementRequestNote

BASE = '/api/core/dash-fixes/'


def png_bytes():
    from io import BytesIO
    from PIL import Image
    buf = BytesIO()
    Image.new('RGB', (4, 4), 'white').save(buf, 'PNG')
    return buf.getvalue()


class DashFixBase(TestCase):
    def setUp(self):
        User = get_user_model()
        employee = Group.objects.get_or_create(name='Employee')[0]
        admin = Group.objects.get_or_create(name='Admin')[0]
        self.ann = User.objects.create_user(email='ann@example.com', first_name='Ann', last_name='Bench', password='pw')
        self.ann.groups.add(employee)
        self.bob = User.objects.create_user(email='bob@example.com', first_name='Bob', last_name='Dock', password='pw')
        self.bob.groups.add(employee)
        self.owner = User.objects.create_superuser(email='owner@example.com', first_name='Owner', last_name='Boss', password='pw')
        self.owner.groups.add(admin)
        self.c_ann, self.c_bob, self.c_owner = APIClient(), APIClient(), APIClient()
        self.c_ann.force_authenticate(self.ann)
        self.c_bob.force_authenticate(self.bob)
        self.c_owner.force_authenticate(self.owner)

    def make(self, user=None, status='new', **kw):
        now = timezone.now()
        fix = DashFix.objects.create(
            title=kw.pop('title', 'Made up fix'), submitted_by=user or self.ann, status=status,
            status_changed_at=now, submitter_seen_at=now, **kw,
        )
        return fix

    def ids(self, client):
        res = client.get(BASE)
        self.assertEqual(res.status_code, 200, res.data)
        return {row['id'] for row in res.data}


@override_settings(DEFAULT_FILE_STORAGE='django.core.files.storage.InMemoryStorage')
class VisibilityTests(DashFixBase):
    def test_staff_see_public_statuses_and_own_items_only(self):
        mine_new = self.make(self.ann, 'new')
        other_new = self.make(self.bob, 'new')
        other_acc = self.make(self.bob, 'accepted', rank=1)
        other_done = self.make(self.bob, 'done')
        other_declined = self.make(self.bob, 'declined')
        ids = self.ids(self.c_ann)
        self.assertEqual(ids, {mine_new.id, other_acc.id, other_done.id, other_declined.id})
        self.assertNotIn(other_new.id, ids)

    def test_private_is_superuser_only_even_for_the_submitter(self):
        hidden = self.make(self.ann, 'accepted', rank=1, private=True)
        self.assertNotIn(hidden.id, self.ids(self.c_ann))
        self.assertNotIn(hidden.id, self.ids(self.c_bob))
        self.assertIn(hidden.id, self.ids(self.c_owner))
        self.assertEqual(self.c_ann.get(f'{BASE}{hidden.id}/').status_code, 404)
        self.assertEqual(self.c_ann.get(f'{BASE}{hidden.id}/notes/').status_code, 404)
        self.assertEqual(self.c_ann.post(f'{BASE}{hidden.id}/notes/', {'body': 'hi'}, format='json').status_code, 404)

    def test_owner_sees_everything(self):
        a = self.make(self.ann, 'new')
        b = self.make(self.bob, 'new', private=True)
        self.assertEqual(self.ids(self.c_owner), {a.id, b.id})

    def test_others_new_item_detail_and_photo_hidden(self):
        fix = self.make(self.bob, 'new')
        self.assertEqual(self.c_ann.get(f'{BASE}{fix.id}/').status_code, 404)
        self.assertEqual(self.c_ann.get(f'{BASE}{fix.id}/photo/').status_code, 404)
        self.assertEqual(self.c_ann.post(f'{BASE}{fix.id}/notes/', {'body': 'x'}, format='json').status_code, 404)

    def test_anonymous_refused(self):
        self.assertIn(APIClient().get(BASE).status_code, (401, 403))

    def test_create_records_page_and_hides_new_from_others(self):
        res = self.c_ann.post(BASE, {'title': 'Scanner lags', 'details': 'Slow', 'kind': 'problem', 'page_path': '/inventory/processing'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['status'], 'new')
        self.assertEqual(res.data['page_path'], '/inventory/processing')
        self.assertTrue(res.data['is_mine'])
        self.assertNotIn(res.data['id'], self.ids(self.c_bob))
        self.assertIn(res.data['id'], self.ids(self.c_owner))

    def test_explanation_required_and_title_made_from_it(self):
        self.assertEqual(self.c_ann.post(BASE, {'title': '  '}, format='json').status_code, 400)
        res = self.c_ann.post(BASE, {'details': 'Scanner lags on the bench\nIt waits two seconds.'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['title'], 'Scanner lags on the bench')

    def test_only_owner_can_report_private(self):
        staff = self.c_ann.post(BASE, {'title': 'Quiet', 'private': True}, format='json')
        self.assertFalse(staff.data['private'])
        boss = self.c_owner.post(BASE, {'title': 'Quiet', 'private': True}, format='json')
        self.assertTrue(boss.data['private'])

    def test_photo_upload_limit_and_stream(self):
        def shot(n):
            return SimpleUploadedFile(f'shot{n}.png', png_bytes(), content_type='image/png')
        res = self.c_ann.post(BASE, {'details': 'See photos', 'photos': [shot(1), shot(2), shot(3)]}, format='multipart')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(len(res.data['photos']), 3)
        fix_id, photo_id = res.data['id'], res.data['photos'][0]
        self.assertEqual(self.c_ann.get(f'{BASE}{fix_id}/photos/{photo_id}/').status_code, 200)
        # Another staff member cannot see the photo of a still-new item.
        self.assertEqual(self.c_bob.get(f'{BASE}{fix_id}/photos/{photo_id}/').status_code, 404)
        four = self.c_ann.post(BASE, {'details': 'Too many', 'photos': [shot(i) for i in range(4)]}, format='multipart')
        self.assertEqual(four.status_code, 400)

    def test_notes_thread(self):
        fix = self.make(self.ann, 'accepted', rank=1)
        res = self.c_bob.post(f'{BASE}{fix.id}/notes/', {'body': 'Same here'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['notes'][0]['author_name'], 'Bob Dock')
        self.assertEqual(self.c_ann.post(f'{BASE}{fix.id}/notes/', {'body': ' '}, format='json').status_code, 400)
        self.assertEqual(len(self.c_ann.get(f'{BASE}{fix.id}/notes/').data), 1)


class OwnerActionTests(DashFixBase):
    def test_staff_cannot_use_owner_actions(self):
        fix = self.make(self.ann, 'new')
        other = self.make(self.bob, 'accepted', rank=1)
        for client in (self.c_ann, self.c_bob):
            self.assertEqual(client.post(f'{BASE}{fix.id}/accept/').status_code, 403)
            self.assertEqual(client.post(f'{BASE}{other.id}/decline/', {'reason': 'no'}, format='json').status_code, 403)
            self.assertEqual(client.post(f'{BASE}{other.id}/working/').status_code, 403)
            self.assertEqual(client.post(f'{BASE}{other.id}/done/', {'version': 'v1'}, format='json').status_code, 403)
            self.assertEqual(client.post(f'{BASE}{other.id}/private/', {'private': True}, format='json').status_code, 403)
            self.assertEqual(client.post(f'{BASE}reorder/', {'ids': [other.id]}, format='json').status_code, 403)
        fix.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(fix.status, 'new')
        self.assertEqual(other.status, 'accepted')
        self.assertFalse(other.private)

    def test_accept_goes_to_end_of_line(self):
        a = self.make(self.ann, 'accepted', rank=1)
        b = self.make(self.ann, 'accepted', rank=2)
        c = self.make(self.bob, 'new')
        res = self.c_owner.post(f'{BASE}{c.id}/accept/')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['status'], 'accepted')
        self.assertEqual(res.data['rank'], 3)
        c.refresh_from_db()
        self.assertIsNotNone(c.accepted_at)
        self.assertGreater(c.status_changed_at, c.submitter_seen_at)
        a.refresh_from_db(); b.refresh_from_db()
        self.assertEqual((a.rank, b.rank), (1, 2))

    def test_decline_needs_reason(self):
        fix = self.make(self.ann, 'new')
        self.assertEqual(self.c_owner.post(f'{BASE}{fix.id}/decline/', {'reason': ' '}, format='json').status_code, 400)
        res = self.c_owner.post(f'{BASE}{fix.id}/decline/', {'reason': 'Not worth it'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], 'declined')
        self.assertEqual(res.data['decline_reason'], 'Not worth it')

    def test_working_done_and_line_repacks(self):
        a = self.make(self.ann, 'accepted', rank=1)
        b = self.make(self.ann, 'accepted', rank=2)
        c = self.make(self.ann, 'accepted', rank=3)
        self.assertEqual(self.c_owner.post(f'{BASE}{b.id}/working/').data['status'], 'working')
        res = self.c_owner.post(f'{BASE}{a.id}/done/', {'version': 'v2.240.0'}, format='json')
        self.assertEqual(res.data['status'], 'done')
        self.assertEqual(res.data['done_version'], 'v2.240.0')
        self.assertIsNotNone(res.data['done_at'])
        b.refresh_from_db(); c.refresh_from_db()
        self.assertEqual((b.rank, c.rank), (1, 2))

    def test_reorder(self):
        a = self.make(self.ann, 'accepted', rank=1)
        b = self.make(self.ann, 'accepted', rank=2)
        c = self.make(self.ann, 'accepted', rank=3)
        res = self.c_owner.post(f'{BASE}reorder/', {'ids': [c.id, a.id]}, format='json')
        self.assertEqual(res.status_code, 200)
        ranks = {r.pk: r.rank for r in DashFix.objects.all()}
        self.assertEqual(ranks, {c.id: 1, a.id: 2, b.id: 3})

    def test_private_toggle_hides_from_staff(self):
        fix = self.make(self.ann, 'accepted', rank=1)
        self.assertIn(fix.id, self.ids(self.c_bob))
        self.assertTrue(self.c_owner.post(f'{BASE}{fix.id}/private/', {'private': True}, format='json').data['private'])
        self.assertNotIn(fix.id, self.ids(self.c_bob))
        self.assertNotIn(fix.id, self.ids(self.c_ann))


class BellCountTests(DashFixBase):
    def count(self, client):
        res = client.get(f'{BASE}counts/')
        self.assertEqual(res.status_code, 200)
        return res.data['count']

    def test_owner_count_is_new_items(self):
        self.make(self.ann, 'new')
        self.make(self.bob, 'new', private=True)
        self.make(self.bob, 'accepted', rank=1)
        self.assertEqual(self.count(self.c_owner), 2)

    def test_staff_count_is_own_items_changed_since_seen(self):
        mine = self.make(self.ann, 'new')
        self.make(self.bob, 'new')
        self.assertEqual(self.count(self.c_ann), 0)
        self.c_owner.post(f'{BASE}{mine.id}/accept/')
        self.assertEqual(self.count(self.c_ann), 1)
        self.assertEqual(self.count(self.c_bob), 0)
        self.assertEqual(self.c_ann.post(f'{BASE}seen/').data['count'], 0)
        self.assertEqual(self.count(self.c_ann), 0)
        self.c_owner.post(f'{BASE}{mine.id}/done/', {'version': 'v1'}, format='json')
        self.assertEqual(self.count(self.c_ann), 1)

    def test_creating_an_item_does_not_count_for_the_reporter(self):
        self.c_ann.post(BASE, {'title': 'Mine'}, format='json')
        self.assertEqual(self.count(self.c_ann), 0)
        self.assertEqual(self.count(self.c_owner), 1)

    def test_private_changes_do_not_count_for_staff(self):
        fix = self.make(self.ann, 'accepted', rank=1, private=True)
        DashFix.objects.filter(pk=fix.pk).update(status_changed_at=timezone.now() + timedelta(minutes=1))
        self.assertEqual(self.count(self.c_ann), 0)


class EnhancementCopyTests(TestCase):
    def test_copies_requests_and_notes(self):
        User = get_user_model()
        user = User.objects.create_user(email='z@example.com', first_name='Z', last_name='Z', password='pw')
        first = EnhancementRequest.objects.create(area='restoration', body='Add a parts bin\nMore words', submitted_by=user, status='planned')
        second = EnhancementRequest.objects.create(area='processing', body='Faster scan', submitted_by=user, status='open')
        done = EnhancementRequest.objects.create(area='processing', body='Old win', submitted_by=user, status='done')
        no = EnhancementRequest.objects.create(area='restoration', body='Bad idea', submitted_by=user, status='declined')
        EnhancementRequestNote.objects.create(request=first, body='Noted', author=user)

        migration = importlib.import_module('apps.core.migrations.0015_copy_enhancements_to_dash_fixes')
        migration.copy_enhancements(django_apps, None)

        rows = {f.title: f for f in DashFix.objects.all()}
        self.assertEqual(len(rows), 4)
        a = rows['[Restoration] Add a parts bin']
        self.assertEqual((a.status, a.rank, a.kind), ('accepted', 1, 'change'))
        self.assertEqual(a.details, 'Add a parts bin\nMore words')
        self.assertEqual(a.submitted_by, user)
        self.assertEqual(a.created_at, first.created_at)
        self.assertEqual(rows['[Processing] Faster scan'].rank, 2)
        self.assertEqual(rows['[Processing] Old win'].status, 'done')
        self.assertEqual(rows['[Processing] Old win'].rank, 0)
        self.assertEqual(rows['[Restoration] Bad idea'].status, 'declined')
        self.assertEqual(DashFixNote.objects.get().body, 'Noted')
        self.assertEqual(DashFixNote.objects.get().fix, a)
        # Nobody gets a bell for the copy.
        self.assertTrue(all(f.submitter_seen_at is not None for f in rows.values()))
        self.assertEqual(EnhancementRequest.objects.count(), 4)
        _ = (second, done, no)


class DashFixJsonTests(DashFixBase):
    def doc(self):
        res = self.c_owner.get(f'{BASE}export/')
        self.assertEqual(res.status_code, 200)
        return res.data

    def post(self, path, doc, **extra):
        return self.c_owner.post(f'{BASE}{path}/', {'doc': doc, **extra}, format='json')

    def test_staff_cannot_export_or_import(self):
        self.assertEqual(self.c_ann.get(f'{BASE}export/').status_code, 403)
        for path in ('import-check', 'import'):
            self.assertEqual(self.c_ann.post(f'{BASE}{path}/', {'doc': {}}, format='json').status_code, 403)

    def test_export_has_everything_including_private_and_pending(self):
        a = self.make(self.ann, 'accepted', rank=1, private=True, coder_notes='secret')
        self.make(self.bob, 'new', title='Waiting one')
        doc = self.doc()
        self.assertEqual(doc['format'], dash_fix_json.FORMAT)
        task = next(t for t in doc['tasks'] if t['id'] == a.id)
        self.assertTrue(task['private'])
        self.assertEqual(task['coder_notes'], 'secret')
        self.assertEqual([p['title'] for p in doc['pending_requests']], ['Waiting one'])

    def test_staff_never_see_coder_notes_or_parent(self):
        fix = self.make(self.ann, 'accepted', rank=1, coder_notes='for the coder')
        row = self.c_bob.get(f'{BASE}{fix.id}/').data
        self.assertNotIn('coder_notes', row)
        self.assertNotIn('parent', row)
        self.assertEqual(self.c_owner.get(f'{BASE}{fix.id}/').data['coder_notes'], 'for the coder')

    def test_import_creates_reorders_and_links(self):
        a = self.make(self.ann, 'accepted', rank=1, title='A')
        b = self.make(self.ann, 'accepted', rank=2, title='B')
        req = self.make(self.bob, 'new', title='Req')
        doc = self.doc()
        for t in doc['tasks']:
            if t['id'] == a.id:
                t['rank'] = 5
                t['size'] = 'L'
        doc['tasks'].append({'ref': 'n1', 'title': 'Brand new', 'depends_on': [b.id], 'parent_request_id': req.id, 'coder_notes': 'hi', 'project': 'Nav', 'step': 2})
        doc['tasks'].append({'title': 'After new', 'depends_on': ['n1'], 'rank': 0})
        doc['pending_requests'][0].update({'decision': 'accept', 'rank': 3})
        check = self.post('import-check', doc)
        self.assertTrue(check.data['ok'], check.data)
        self.assertTrue(check.data['changes'])
        self.assertEqual(DashFix.objects.count(), 3)  # check writes nothing
        res = self.post('import', doc)
        self.assertEqual(res.status_code, 200, res.data)
        by_title = {f.title: f for f in DashFix.objects.all()}
        self.assertEqual(by_title['Req'].status, 'accepted')
        self.assertEqual(by_title['A'].size, 'L')
        new = by_title['Brand new']
        self.assertEqual(new.submitted_by, self.owner)
        self.assertEqual((new.project, new.step), ('Nav', 2))
        self.assertEqual(new.parent_id, req.id)
        self.assertEqual(list(new.depends_on.all()), [b])
        self.assertEqual(list(by_title['After new'].depends_on.all()), [new])
        ranks = sorted(f.rank for f in DashFix.objects.filter(status='accepted'))
        self.assertEqual(ranks, [1, 2, 3, 4, 5])
        self.assertEqual(by_title['After new'].rank, 1)  # explicit rank 0 sorts first
        self.assertEqual((by_title['A'].rank, new.rank), (4, 5))  # unranked new tasks go last
        # Req was accepted, so its submitter hears about it.
        self.assertGreater(by_title['Req'].status_changed_at, by_title['Req'].submitter_seen_at)

    def test_decline_pending_needs_reason(self):
        req = self.make(self.bob, 'new')
        doc = self.doc()
        doc['pending_requests'][0]['decision'] = 'decline'
        self.assertFalse(self.post('import-check', doc).data['ok'])
        doc['pending_requests'][0]['decline_reason'] = 'Later'
        self.assertEqual(self.post('import', doc).status_code, 200)
        req.refresh_from_db()
        self.assertEqual((req.status, req.decline_reason), ('declined', 'Later'))

    def test_dependency_loop_refused(self):
        a = self.make(self.ann, 'accepted', rank=1)
        b = self.make(self.ann, 'accepted', rank=2)
        doc = self.doc()
        for t in doc['tasks']:
            t['depends_on'] = [b.id] if t['id'] == a.id else [a.id]
        res = self.post('import', doc)
        self.assertEqual(res.status_code, 400)
        self.assertTrue(any('loop' in e for e in res.data['errors']))
        self.assertEqual(a.depends_on.count(), 0)

    def test_working_blocked_by_open_dependency_unless_allowed(self):
        a = self.make(self.ann, 'accepted', rank=1, title='First')
        b = self.make(self.ann, 'accepted', rank=2, title='Second')
        b.depends_on.add(a)
        doc = self.doc()
        for t in doc['tasks']:
            if t['id'] == b.id:
                t['status'] = 'working'
        res = self.post('import', doc)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(len(res.data['blocked']), 1)
        b.refresh_from_db()
        self.assertEqual(b.status, 'accepted')
        res = self.post('import', doc, allow_blocked=True)
        self.assertEqual(res.status_code, 200, res.data)
        b.refresh_from_db()
        self.assertEqual(b.status, 'working')
        self.assertTrue(any('Allowed anyway' in w for w in res.data['warnings']))

    def test_done_when_dependency_done_is_fine_and_leaves_line(self):
        a = self.make(self.ann, 'done', title='Base')
        b = self.make(self.ann, 'accepted', rank=1, title='Next')
        b.depends_on.add(a)
        doc = self.doc()
        for t in doc['tasks']:
            if t['id'] == b.id:
                t.update({'status': 'done', 'done_version': 'v2.250.0'})
        self.assertEqual(self.post('import', doc).status_code, 200)
        b.refresh_from_db()
        self.assertEqual((b.status, b.rank, b.done_version), ('done', 0, 'v2.250.0'))
        self.assertIsNotNone(b.done_at)

    def test_bad_files_refused(self):
        self.assertFalse(self.post('import-check', {'tasks': []}).data['ok'])
        doc = self.doc()
        doc['tasks'].append({'id': 99999, 'title': 'x'})
        self.assertFalse(self.post('import-check', doc).data['ok'])
        doc = self.doc()
        doc['tasks'].append({'title': 'x', 'size': 'XL'})
        self.assertFalse(self.post('import-check', doc).data['ok'])


class StatusAndQuestionTests(DashFixBase):
    def test_almost_hold_and_question_through_json(self):
        a = self.make(self.ann, 'accepted', rank=1, title='A')
        b = self.make(self.ann, 'accepted', rank=2, title='B')
        doc = self.c_owner.get(f'{BASE}export/').data
        for t in doc['tasks']:
            if t['id'] == a.id:
                t.update({'status': 'almost', 'waiting_on': 'your review', 'question_for_owner': 'Blue or green?'})
            if t['id'] == b.id:
                t['status'] = 'hold'
        res = self.c_owner.post(f'{BASE}import/', {'doc': doc}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        a.refresh_from_db(); b.refresh_from_db()
        self.assertEqual((a.status, a.rank, a.waiting_on), ('almost', 1, 'your review'))
        self.assertEqual((b.status, b.rank), ('hold', 0))
        # Staff see the status and what it waits on, never the question.
        row = self.c_bob.get(f'{BASE}{a.id}/').data
        self.assertEqual(row['waiting_on'], 'your review')
        self.assertNotIn('question_for_owner', row)

    def test_unanswered_question_counts_for_owner_until_answered(self):
        a = self.make(self.ann, 'working', rank=1, question_for_owner='Which?')
        self.assertEqual(self.c_owner.get(f'{BASE}counts/').data['count'], 1)
        self.assertEqual(self.c_ann.post(f'{BASE}{a.id}/answer/', {'answer': 'x'}, format='json').status_code, 403)
        res = self.c_owner.post(f'{BASE}{a.id}/answer/', {'answer': 'Blue'}, format='json')
        self.assertEqual(res.data['owner_answer'], 'Blue')
        self.assertIsNotNone(res.data['answered_at'])
        self.assertEqual(self.c_owner.get(f'{BASE}counts/').data['count'], 0)
