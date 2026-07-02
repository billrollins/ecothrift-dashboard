from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import WorkLocation
from apps.floorplan.models import (
    FloorPlan,
    FloorPlanAsset,
    FloorPlanElementKind,
    default_plan_document,
)
from apps.floorplan.services import purge_orphan_assets


def make_asset(name, days_old=2):
    asset = FloorPlanAsset.objects.create(
        name=name,
        data='data:image/png;base64,AAAA',
        content_type='image/png',
    )
    if days_old:
        FloorPlanAsset.objects.filter(pk=asset.pk).update(
            created_at=timezone.now() - timedelta(days=days_old),
        )
    return asset


class OrphanAssetPurgeTests(TestCase):
    def setUp(self):
        self.location = WorkLocation.objects.create(name='Main Store')

    def plan_with_image(self, asset_id):
        doc = default_plan_document()
        doc['elements'] = [{
            'id': 'el_1', 'kind': 'gondola', 'x': 0, 'y': 0, 'w': 48, 'h': 144,
            'rotation': 0, 'label': '', 'active': True, 'image': asset_id,
        }]
        return FloorPlan.objects.create(name='Plan', location=self.location, data=doc)

    def test_purges_old_unreferenced_asset(self):
        asset = make_asset('old orphan', days_old=2)
        self.assertEqual(purge_orphan_assets(), 1)
        self.assertFalse(FloorPlanAsset.objects.filter(pk=asset.pk).exists())

    def test_keeps_asset_referenced_by_plan_element(self):
        asset = make_asset('in a plan', days_old=2)
        self.plan_with_image(asset.pk)
        self.assertEqual(purge_orphan_assets(), 0)
        self.assertTrue(FloorPlanAsset.objects.filter(pk=asset.pk).exists())

    def test_keeps_asset_referenced_by_kind_default(self):
        asset = make_asset('kind default', days_old=2)
        kind = FloorPlanElementKind.objects.get(kind='gondola')
        kind.default_image = asset
        kind.save(update_fields=['default_image'])
        self.assertEqual(purge_orphan_assets(), 0)

    def test_grace_window_protects_fresh_uploads(self):
        asset = make_asset('fresh upload', days_old=0)
        self.assertEqual(purge_orphan_assets(), 0)
        self.assertTrue(FloorPlanAsset.objects.filter(pk=asset.pk).exists())

    def test_soft_deleted_asset_purges_regardless_of_age(self):
        asset = make_asset('deleted now', days_old=0)
        asset.is_active = False
        asset.save(update_fields=['is_active'])
        self.assertEqual(purge_orphan_assets(), 1)

    def test_reference_in_inactive_plan_does_not_protect(self):
        asset = make_asset('was in deleted plan', days_old=2)
        plan = self.plan_with_image(asset.pk)
        plan.is_active = False
        plan.save(update_fields=['is_active'])
        self.assertEqual(purge_orphan_assets(), 1)


class PurgeOnSaveApiTests(TestCase):
    """Saving a plan sweeps images the save just orphaned."""

    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(
            email='manager@test.com', first_name='Test', last_name='Manager',
            password='pass1234',
        )
        group, _ = Group.objects.get_or_create(name='Manager')
        user.groups.add(group)
        self.client.force_authenticate(user=user)
        self.location = WorkLocation.objects.create(name='Main Store')

    def test_plan_save_purges_dropped_image(self):
        asset = make_asset('about to be dropped', days_old=2)
        doc = default_plan_document()
        doc['elements'] = [{
            'id': 'el_1', 'kind': 'gondola', 'x': 0, 'y': 0, 'w': 48, 'h': 144,
            'rotation': 0, 'label': '', 'active': True, 'image': asset.pk,
        }]
        plan = FloorPlan.objects.create(name='Plan', location=self.location, data=doc)

        cleared = default_plan_document()
        cleared['elements'] = [{
            'id': 'el_1', 'kind': 'gondola', 'x': 0, 'y': 0, 'w': 48, 'h': 144,
            'rotation': 0, 'label': '', 'active': True,
        }]
        resp = self.client.patch(
            f'/api/floorplan/plans/{plan.id}/',
            {'data': cleared, 'revision': plan.revision},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(FloorPlanAsset.objects.filter(pk=asset.pk).exists())
