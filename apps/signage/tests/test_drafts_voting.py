"""Signage drafts (#122): staff vote needed yes/no and rank versions; results stay hidden until you vote; a manager
approves a draft into production with the winning version."""
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import S3File
from apps.floorplan.tests.test_floorplan_api import make_user
from apps.signage.models import Sign, SignNote, SignVersion, SignVersionRank

PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'
PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 16


def fake_storage():
    """Patch both save paths so nothing reaches S3; keys come back as given."""
    storage = mock.MagicMock()
    storage.save.side_effect = lambda key, content: key
    return storage


class DraftVotingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = make_user('manager', 'Manager')
        self.ann = make_user('ann', 'Employee')
        self.bob = make_user('bob', 'Employee')
        self.draft = Sign.objects.create(name='You are on camera', location='Entrance', quantity=8)
        self.a = SignVersion.objects.create(sign=self.draft, label='A', position=1)
        self.b = SignVersion.objects.create(sign=self.draft, label='B', position=2)
        self.c = SignVersion.objects.create(sign=self.draft, label='C', position=3)

    def url(self, tail=''):
        return f'/api/signage/signs/{self.draft.id}/{tail}'

    def as_(self, user):
        self.client.force_authenticate(user=user)

    def test_new_signs_are_drafts_and_old_ones_production(self):
        self.as_(self.manager)
        resp = self.client.post('/api/signage/signs/', {'name': 'Restrooms', 'quantity': 2}, format='json')
        self.assertEqual((resp.data['stage'], resp.data['quantity']), ('draft', 2))
        resp = self.client.post('/api/signage/signs/', {'name': 'Hours', 'stage': 'production'}, format='json')
        self.assertEqual(resp.data['stage'], 'production')
        names = [r['name'] for r in self.client.get('/api/signage/signs/?stage=draft').data]
        self.assertEqual(names, ['Restrooms', 'You are on camera'])

    def test_results_hidden_until_you_vote(self):
        self.as_(self.ann)
        self.client.post(self.url('vote/'), {'needed': True}, format='json')
        resp = self.client.post(self.url('rank/'), {'version': self.b.id}, format='json')
        self.assertTrue(resp.data['votes']['has_voted'])
        self.assertEqual(resp.data['votes']['results']['needed_pct'], 100)
        self.assertEqual(resp.data['votes']['results']['top_version_label'], 'B')

        self.as_(self.bob)
        row = self.client.get(self.url()).data
        self.assertFalse(row['votes']['has_voted'])
        self.assertIsNone(row['votes']['results'])
        self.assertTrue(all(v['avg_rank'] is None for v in row['versions']))
        # A yes/no alone is not enough: the best has to be picked too.
        row = self.client.post(self.url('vote/'), {'needed': False}, format='json').data
        self.assertFalse(row['votes']['has_voted'])
        row = self.client.post(self.url('rank/'), {'version': self.a.id}, format='json').data
        self.assertTrue(row['votes']['has_voted'])
        self.assertEqual(row['votes']['results']['needed_pct'], 50)
        self.assertEqual(row['votes']['results']['voters'], 2)

    def test_ranking_picks_in_order_and_fills_the_last(self):
        self.as_(self.ann)
        self.client.post(self.url('rank/'), {'version': self.c.id}, format='json')
        row = self.client.post(self.url('rank/'), {'version': self.a.id}, format='json').data
        mine = {v['label']: v['my_rank'] for v in row['versions']}
        self.assertEqual(mine, {'C': 1, 'A': 2, 'B': 3})
        # Picking an already ranked one changes nothing.
        self.client.post(self.url('rank/'), {'version': self.a.id}, format='json')
        self.assertEqual(SignVersionRank.objects.filter(user=self.ann).count(), 3)
        row = self.client.post(self.url('rank/'), {'clear': True}, format='json').data
        self.assertTrue(all(v['my_rank'] is None for v in row['versions']))

    def test_average_rank_orders_the_versions(self):
        for user, order in ((self.ann, [self.b, self.a]), (self.bob, [self.a, self.b])):
            self.as_(user)
            self.client.post(self.url('vote/'), {'needed': True}, format='json')
            for v in order:
                self.client.post(self.url('rank/'), {'version': v.id}, format='json')
        self.as_(self.manager)
        self.client.post(self.url('vote/'), {'needed': True}, format='json')
        row = self.client.post(self.url('rank/'), {'version': self.b.id}, format='json').data
        avg = {v['label']: v['avg_rank'] for v in row['versions']}
        self.assertEqual(avg, {'A': 1.5, 'B': 1.33, 'C': 3.0})
        self.assertEqual(row['votes']['results']['top_version_label'], 'B')

    def test_voting_is_for_drafts_and_staff_cannot_approve(self):
        self.as_(self.ann)
        self.assertEqual(self.client.post(self.url('vote/'), {'needed': 'maybe'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.url('approve/'), {'version': self.a.id}, format='json').status_code, 403)
        Sign.objects.filter(pk=self.draft.pk).update(stage='production')
        self.assertEqual(self.client.post(self.url('vote/'), {'needed': True}, format='json').status_code, 400)

    def test_notes_anyone_writes_writer_or_manager_removes(self):
        self.as_(self.ann)
        resp = self.client.post(self.url('notes/'), {'text': 'I think it needs to be bigger'}, format='json')
        self.assertEqual(resp.status_code, 201)
        note = SignNote.objects.get()
        self.assertEqual(resp.data['notes'][0]['text'], 'I think it needs to be bigger')
        self.as_(self.bob)
        self.assertEqual(self.client.delete(self.url(f'notes/{note.id}/')).status_code, 403)
        self.as_(self.manager)
        self.assertEqual(self.client.delete(self.url(f'notes/{note.id}/')).status_code, 200)
        self.assertFalse(SignNote.objects.exists())

    def test_approve_moves_the_draft_to_production_with_the_winner(self):
        pdf = S3File.objects.create(key='signage/b.pdf', filename='b.pdf')
        SignVersion.objects.filter(pk=self.b.pk).update(pdf=pdf)
        self.as_(self.manager)
        row = self.client.post(self.url('approve/'), {'version': self.b.id}, format='json').data
        self.assertEqual((row['stage'], row['status'], row['chosen_version'], row['pdf_name']),
                         ('production', 'to_make', self.b.id, 'b.pdf'))
        self.assertEqual(row['preview_version'], self.b.id)
        self.assertIsNone(row['votes'])
        # The version in use cannot be deleted; another can.
        self.assertEqual(self.client.delete(self.url(f'versions/{self.b.id}/')).status_code, 400)
        self.assertEqual(self.client.delete(self.url(f'versions/{self.c.id}/')).status_code, 200)

    def test_add_a_version_draws_the_preview_when_no_png(self):
        self.as_(self.manager)
        with mock.patch('apps.core.files.default_storage', fake_storage()), \
                mock.patch('apps.signage.files.default_storage', fake_storage()), \
                mock.patch('apps.signage.files.render_preview', return_value=PNG):
            resp = self.client.post(self.url('versions/'), {
                'pdf': SimpleUploadedFile('D-letter.pdf', PDF, content_type='application/pdf'),
            }, format='multipart')
        self.assertEqual(resp.status_code, 201, resp.data)
        d = SignVersion.objects.get(label='D-letter')
        self.assertEqual((d.position, d.pdf.filename, d.preview.filename), (4, 'D-letter.pdf', 'D-letter.png'))
        bad = self.client.post(self.url('versions/'), {
            'pdf': SimpleUploadedFile('x.pdf', PDF, content_type='application/pdf'),
            'png': SimpleUploadedFile('x.png', b'GIF89a', content_type='image/png'),
        }, format='multipart')
        self.assertEqual(bad.status_code, 400)

    def test_staff_open_version_files(self):
        png = S3File.objects.create(key='signage/a.png', filename='a.png', content_type='image/png')
        SignVersion.objects.filter(pk=self.a.pk).update(preview=png)
        self.as_(self.ann)
        self.assertEqual(self.client.get(self.url(f'versions/{self.a.id}/pdf/')).status_code, 404)
        with mock.patch('apps.signage.views.stream_s3') as stream:
            from django.http import HttpResponse
            stream.return_value = HttpResponse(PNG, content_type='image/png')
            self.assertEqual(self.client.get(self.url(f'versions/{self.a.id}/preview/')).status_code, 200)

