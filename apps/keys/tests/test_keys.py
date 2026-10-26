from io import BytesIO
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AiAction, AIUsage
from apps.core.services.llm_router import LLMAPIError, LLMResult
from apps.keys.models import Key, KeyRing, KeyRingMove
from apps.keys.services import ai, search

IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
LLM = 'apps.core.services.llm_router._PROVIDER_CALLS'

HOUSE = {'is_key': True, 'key_type': 'house', 'keyway': 'kw1', 'head_shape': 'Kwikset kidney', 'brand': 'Kwikset',
         'stamped_code': '', 'cut_count': 5, 'cut_depths': [3, 5, 2, 4, 6]}


def _user(email, role='Employee', superuser=False):
    user = User.objects.create_user(email=email, first_name='T', last_name=role, password='test-pass-123')
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    if superuser:
        user.is_superuser = True
        user.save(update_fields=['is_superuser'])
    return user


def _jpeg(name='k.jpg', color=(180, 160, 60)):
    buf = BytesIO()
    Image.new('RGB', (120, 50), color).save(buf, format='JPEG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


def _result(tool_input):
    return LLMResult(text='', tool_input=tool_input, model_used='test-model', input_tokens=10, output_tokens=5)


def _providers(*answers):
    """Every provider answers with these tool inputs, in order."""
    calls = iter(answers)
    fake = mock.MagicMock(side_effect=lambda **kw: _result(next(calls)))
    return mock.patch.dict(LLM, {p: fake for p in ('anthropic', 'xai', 'google', 'meta')}), fake


class MetricsAndScoreTests(SimpleTestCase):
    def test_clean_metrics_trims_and_bounds(self):
        m = ai.clean_metrics({'key_type': 'House', 'keyway': ' kw 1 ', 'cut_depths': [3, 12, -1], 'cut_count': None,
                              'brand': 'Kwikset'})
        self.assertEqual(m['key_type'], 'house')
        self.assertEqual(m['keyway'], 'KW 1')
        self.assertEqual(m['cut_depths'], '3-9-0')
        self.assertEqual(m['cut_count'], 3)
        self.assertTrue(m['is_key'])
        self.assertEqual(ai.clean_metrics({'key_type': 'spaceship', 'is_key': False})['key_type'], '')

    def test_parse_answer(self):
        self.assertEqual(ai.parse_answer({'answer': '3'}, 9), 3)
        self.assertEqual(ai.parse_answer({'answer': '#2.'}, 9), 2)
        self.assertIsNone(ai.parse_answer({'answer': 'NO'}, 9))
        self.assertIsNone(ai.parse_answer({'answer': '7'}, 4))

    def test_score_prefers_the_same_key(self):
        q = ai.clean_metrics(HOUSE)
        same = SimpleNamespace(stamped_code='', key_type='house', keyway='KW1', brand='Kwikset',
                               head_shape='Kwikset kidney', cut_count=5, cut_depths='3-5-2-4-6')
        other_cuts = SimpleNamespace(**{**same.__dict__, 'cut_depths': '6-1-6-1-6'})
        padlock = SimpleNamespace(stamped_code='', key_type='padlock', keyway='M1', brand='Master', head_shape='',
                                  cut_count=4, cut_depths='')
        blank = SimpleNamespace(stamped_code='', key_type='', keyway='', brand='', head_shape='', cut_count=None,
                                cut_depths='')
        self.assertGreater(search.score(q, same), search.score(q, other_cuts))
        self.assertGreater(search.score(q, other_cuts), search.score(q, blank))
        self.assertLess(search.score(q, padlock), 0)
        self.assertEqual(search.score(q, blank), 0)

    def test_stamped_code_wins(self):
        q = {'stamped_code': 'DND 1234', 'key_type': 'padlock'}
        coded = SimpleNamespace(stamped_code='dnd-1234', key_type='house', keyway='', brand='', head_shape='',
                                cut_count=None, cut_depths='')
        self.assertGreater(search.score(q, coded), 5)

    def test_grid_is_a_jpeg(self):
        data = search.build_grid([])
        self.assertEqual(Image.open(BytesIO(data)).size, (1200, 1200))


@override_settings(STORAGES=IN_MEMORY)
@mock.patch('apps.core.services.llm_router.resolve_api_key', new=lambda provider: 'test-key')
class KeysApiTests(TestCase):
    def setUp(self):
        self.owner = _user('owner@x.com', 'Admin', superuser=True)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_owner_or_admin_only(self):
        staff = APIClient()
        staff.force_authenticate(_user('m@x.com', 'Manager'))
        self.assertEqual(staff.get('/api/keys/keys/').status_code, 403)
        admin = APIClient()
        admin.force_authenticate(_user('a@x.com', 'Admin'))
        self.assertEqual(admin.get('/api/keys/keys/').status_code, 200)

    def test_seeded_ai_purpose(self):
        self.assertTrue(AiAction.objects.filter(purpose='KEYS').exists())

    def test_add_key_reads_metrics_and_logs_usage(self):
        patch, fake = _providers(HOUSE)
        with patch:
            res = self.client.post('/api/keys/keys/', {'name': 'Front door', 'photo': _jpeg()}, format='multipart')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['keyway'], 'KW1')
        self.assertEqual(res.data['cut_depths'], '3-5-2-4-6')
        self.assertEqual(res.data['ai_error'], '')
        self.assertTrue(res.data['thumbnail_url'])
        self.assertEqual(fake.call_count, 1)
        self.assertTrue(AIUsage.objects.filter(source='keys', purpose='KEYS').exists())

    def test_key_still_saves_when_ai_fails(self):
        fake = mock.MagicMock(side_effect=LLMAPIError('down'))
        with mock.patch.dict(LLM, {p: fake for p in ('anthropic', 'xai', 'google', 'meta')}):
            res = self.client.post('/api/keys/keys/', {'name': 'Shed', 'photo': _jpeg()}, format='multipart')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data['ai_error'])
        self.assertEqual(Key.objects.get().keyway, '')

    def test_edit_metric_and_search(self):
        ring = KeyRing.objects.create(name='Back office')
        key = Key.objects.create(name='Safe key', ring=ring)
        res = self.client.patch(f'/api/keys/keys/{key.pk}/', {'keyway': 'sc1', 'cut_count': '6'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['keyway'], 'SC1')
        self.assertEqual(self.client.patch(f'/api/keys/keys/{key.pk}/', {'cut_count': '40'}, format='json').status_code, 400)
        self.assertEqual(len(self.client.get('/api/keys/keys/', {'q': 'office'}).data['keys']), 1)
        self.assertEqual(len(self.client.get('/api/keys/keys/', {'ring': 'none'}).data['keys']), 0)

    def test_ring_check_out_and_in(self):
        home = _user('bill@x.com', 'Admin')
        res = self.client.post('/api/keys/rings/', {'name': 'Van', 'home_location': 'Hook by door', 'home_person': home.pk},
                               format='json')
        ring_id = res.data['id']
        self.assertEqual(res.data['where']['status'], 'home')
        self.assertEqual(self.client.post(f'/api/keys/rings/{ring_id}/move/', {'kind': 'out'}, format='json').status_code, 400)
        res = self.client.post(f'/api/keys/rings/{ring_id}/move/', {'kind': 'out', 'person_name': 'Locksmith'},
                               format='json')
        self.assertEqual(res.data['where']['status'], 'out')
        self.assertEqual(res.data['where']['person'], 'Locksmith')
        res = self.client.post(f'/api/keys/rings/{ring_id}/move/', {'kind': 'in'}, format='json')
        self.assertEqual(res.data['where']['status'], 'home')
        self.assertEqual(res.data['where']['location'], 'Hook by door')
        self.assertEqual(KeyRingMove.objects.filter(ring_id=ring_id).count(), 2)
        detail = self.client.get(f'/api/keys/rings/{ring_id}/').data
        self.assertEqual([m['kind'] for m in detail['moves']], ['in', 'out'])

    def test_where_lists_rings_and_loose_keys(self):
        ring = KeyRing.objects.create(name='Front')
        Key.objects.create(name='On ring', ring=ring)
        Key.objects.create(name='Loose')
        data = self.client.get('/api/keys/where/').data
        self.assertEqual([k['name'] for k in data['rings'][0]['keys']], ['On ring'])
        self.assertEqual([k['name'] for k in data['loose_keys']], ['Loose'])
        self.client.delete(f'/api/keys/rings/{ring.pk}/')
        data = self.client.get('/api/keys/where/').data
        self.assertEqual(data['rings'], [])
        self.assertEqual(len(data['loose_keys']), 2)

    def test_find_ranks_grids_and_asks(self):
        patch, fake = _providers(HOUSE, {**HOUSE, 'cut_depths': [6, 1, 6, 1, 6]}, {**HOUSE, 'key_type': 'padlock'})
        with patch:
            for name in ('Front door', 'Back door', 'Padlock'):
                self.client.post('/api/keys/keys/', {'name': name, 'photo': _jpeg()}, format='multipart')
        patch, fake = _providers(HOUSE, {'answer': '1', 'reason': 'Same cuts.'})
        with patch:
            res = self.client.post('/api/keys/find/', {'photo': _jpeg()}, format='multipart')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual([c['key']['name'] for c in res.data['candidates']], ['Front door', 'Back door', 'Padlock'])
        self.assertEqual(res.data['answer'], 1)
        self.assertTrue(res.data['grid'].startswith('data:image/jpeg;base64,'))
        self.assertEqual(fake.call_count, 2)
        sent = fake.call_args.kwargs['messages'][0]['content']
        self.assertEqual(sum(1 for block in sent if block.get('type') == 'image'), 2)

    def test_find_with_no_logged_keys_makes_one_call(self):
        patch, fake = _providers(HOUSE)
        with patch:
            res = self.client.post('/api/keys/find/', {'photo': _jpeg()}, format='multipart')
        self.assertEqual(res.data['candidates'], [])
        self.assertIsNone(res.data['answer'])
        self.assertEqual(fake.call_count, 1)
