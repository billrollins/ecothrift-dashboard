"""Loading sign drafts (#122): step 1's package checks and manifest (apps.signage.packages, used by
scripts/s3/upload_sign_drafts.py) and step 2, manage.py load_sign_drafts --manifest-key (the file store is faked)."""
import io
import json
import pathlib
import tempfile
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.core.models import S3File
from apps.floorplan.tests.test_floorplan_api import make_user
from apps.signage import packages
from apps.signage.models import Sign, SignVersion, SignVersionRank

PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'
PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 16


def write_package(root, slug, labels=('A: green frame', 'B: black band'), **extra):
    folder = root / slug
    folder.mkdir()
    versions = []
    for i, label in enumerate(labels):
        letter = chr(65 + i)
        (folder / f'{letter}.png').write_bytes(PNG + slug.encode())
        (folder / f'{letter}-flat.pdf').write_bytes(PDF + slug.encode())
        versions.append({'label': label, 'png': f'{letter}.png', 'pdf': f'{letter}-flat.pdf'})
    draft = {'slug': slug, 'kind': 'sign', 'dash_update': 115, 'name': slug.title(), 'location': 'Front door',
             'quantity': 2, 'notes': 'For testing', 'versions': versions, **extra}
    (folder / 'draft.json').write_text(json.dumps(draft), encoding='utf-8')
    return folder


class DraftPackageTests(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_good_package_makes_a_manifest_with_stable_keys(self):
        write_package(self.root, 'on-camera')
        write_package(self.root, 'theme-warning', kind='theme', labels=('A: red', 'B: amber', 'C: black'))
        drafts, problems, warnings = packages.check(packages.find_packages([self.root]))
        self.assertEqual((problems, warnings), ([], []))
        manifest, uploads = packages.build_manifest(drafts, location='ecothrift/dev', made_at='t')
        self.assertEqual(manifest['format'], packages.FORMAT)
        self.assertEqual([d['slug'] for d in manifest['drafts']], ['on-camera', 'theme-warning'])
        self.assertEqual(manifest['drafts'][1]['kind'], 'theme')
        self.assertEqual(len(uploads), 10)
        pdf = manifest['drafts'][0]['versions'][0]['pdf']
        self.assertTrue(pdf['key'].startswith('signage/drafts/on-camera/') and pdf['key'].endswith('-A-flat.pdf'))
        again, _ = packages.build_manifest(drafts, location='ecothrift/dev', made_at='t')
        self.assertEqual(again, manifest)
        # One package folder works as well as a folder of packages.
        self.assertEqual(packages.find_packages([self.root / 'on-camera']), [self.root / 'on-camera'])

    def test_problems_and_notes(self):
        bad = write_package(self.root, 'bad-one', labels=('A: my pick', 'B: plain'))
        (bad / 'B-flat.pdf').write_bytes(b'not a pdf')
        write_package(self.root, 'Bad_Slug')
        _, problems, warnings = packages.check(packages.find_packages([self.root]))
        self.assertTrue(any('B-flat.pdf: not a PDF' in p for p in problems), problems)
        self.assertTrue(any("slug 'Bad_Slug'" in p for p in problems), problems)
        self.assertTrue(any('leans' in w for w in warnings), warnings)


class LoadSignDraftsTests(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        write_package(self.root, 'on-camera')
        write_package(self.root, 'theme-warning', kind='theme', labels=('A: red',))
        self.manifest = self.make_manifest()
        self.manager = make_user('manager', 'Manager')

    def tearDown(self):
        self.tmp.cleanup()

    def make_manifest(self):
        drafts, problems, _ = packages.check(packages.find_packages([self.root]))
        assert not problems, problems
        return packages.build_manifest(drafts, location='', made_at='t')[0]

    def run_it(self, *args, manifest=None, exists=True):
        storage = mock.MagicMock()
        storage.open.return_value = io.BytesIO(json.dumps(manifest or self.manifest).encode())
        storage.exists.return_value = exists
        out = io.StringIO()
        with mock.patch('apps.signage.management.commands.load_sign_drafts.default_storage', storage), \
                self.settings(USE_S3=True, AWS_LOCATION=''):
            call_command('load_sign_drafts', '--manifest-key', 'signage/drafts/manifests/t.json', *args, stdout=out)
        return out.getvalue()

    def test_dry_run_keeps_nothing(self):
        out = self.run_it()
        self.assertIn('Dry run', out)
        self.assertIn('2 new draft(s)', out)
        self.assertFalse(Sign.objects.exists())
        self.assertFalse(S3File.objects.exists())

    def test_apply_loads_and_a_second_run_changes_nothing(self):
        self.run_it('--apply', '--user', 'manager@test.com')
        cam = Sign.objects.get(slug='on-camera')
        self.assertEqual((cam.stage, cam.kind, cam.dash_update, cam.location, cam.quantity, cam.note),
                         ('draft', 'sign', 115, 'Front door', 2, 'For testing'))
        self.assertEqual([v.label for v in cam.versions.all()], ['A: green frame', 'B: black band'])
        a = cam.versions.first()
        self.assertEqual((a.pdf.filename, a.preview.filename, a.pdf.uploaded_by), ('A-flat.pdf', 'A.png', self.manager))
        self.assertEqual(Sign.objects.get(slug='theme-warning').kind, 'theme')
        out = self.run_it('--apply')
        self.assertIn('0 new draft(s), 0 updated, 2 unchanged', out)
        self.assertEqual(SignVersion.objects.count(), 3)

    def test_a_rerun_updates_by_slug_and_keeps_votes(self):
        self.run_it('--apply')
        cam = Sign.objects.get(slug='on-camera')
        a = cam.versions.get(label='A: green frame')
        SignVersionRank.objects.create(sign=cam, version=a, user=self.manager, rank=1)
        # The sub redraws A, renames the sign and adds C.
        folder = self.root / 'on-camera'
        (folder / 'A-flat.pdf').write_bytes(PDF + b'redrawn')
        (folder / 'C.png').write_bytes(PNG)
        (folder / 'C-flat.pdf').write_bytes(PDF)
        draft = json.loads((folder / 'draft.json').read_text(encoding='utf-8'))
        draft['name'] = 'You are on camera'
        draft['versions'].append({'label': 'C: red band', 'png': 'C.png', 'pdf': 'C-flat.pdf'})
        (folder / 'draft.json').write_text(json.dumps(draft), encoding='utf-8')
        out = self.run_it('--apply', manifest=self.make_manifest())
        self.assertIn('1 updated', out)
        self.assertIn('1 version(s) added, 1 with new files', out)
        cam.refresh_from_db()
        self.assertEqual(cam.name, 'You are on camera')
        self.assertEqual(cam.versions.count(), 3)
        self.assertEqual(a.ranks.count(), 1)
        self.assertEqual(Sign.objects.filter(slug='on-camera').count(), 1)

    def test_production_signs_are_never_touched(self):
        Sign.objects.create(name='Live', slug='on-camera', stage='production')
        out = self.run_it('--apply')
        self.assertIn('SKIP  on-camera: in production', out)
        self.assertFalse(SignVersion.objects.filter(sign__slug='on-camera').exists())

    def test_missing_files_or_another_store_folder_stop_everything(self):
        with self.assertRaises(CommandError):
            self.run_it('--apply', exists=False)
        other = {**self.manifest, 'location': 'ecothrift/dev'}
        with self.assertRaisesMessage(CommandError, 'uploaded under'):
            self.run_it('--apply', manifest=other)
        self.assertFalse(Sign.objects.exists())
