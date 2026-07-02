from django.conf import settings
from django.db import models

CURRENT_SCHEMA_VERSION = 1


def default_plan_document():
    """Default empty plan document (schema v1). Coordinates are in inches."""
    return {
        'schema_version': CURRENT_SCHEMA_VERSION,
        'settings': {
            'planWidth': 1200,   # 100 ft
            'planHeight': 720,   # 60 ft
            'grid': {'visible': True, 'minor': 6, 'major': 12},
            'snap': 1,
        },
        'elements': [],
        'zones': [],
        'paths': [],
        'labels': [],
        'infoBlocks': [],
    }


class FloorPlan(models.Model):
    """A store/room layout plan.

    The canvas content lives in `data` as a versioned JSON document
    (see apps/floorplan/README.md for the schema). `revision` implements
    optimistic locking: clients send the revision they loaded and the API
    rejects saves against a stale revision with HTTP 409.
    """
    name = models.CharField(max_length=200)
    location = models.ForeignKey(
        'core.WorkLocation',
        on_delete=models.CASCADE,
        related_name='floorplans',
    )
    data = models.JSONField(default=default_plan_document)
    schema_version = models.PositiveIntegerField(default=CURRENT_SCHEMA_VERSION)
    revision = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.name} ({self.location_id})'


class FloorPlanAsset(models.Model):
    """An uploaded image (SVG/PNG/JPG) usable by floorplan elements.

    Files are stored inline as sanitized data URIs in `data` (size-capped at
    upload) so no media-file serving is required and SVG-to-PNG export works
    without cross-origin fetches. Plan documents reference assets by id via
    `element.image`.
    """
    name = models.CharField(max_length=200)
    location = models.ForeignKey(
        'core.WorkLocation',
        on_delete=models.CASCADE,
        related_name='floorplan_assets',
        null=True,
        blank=True,
        help_text='Blank = shared across all locations.',
    )
    data = models.TextField(help_text='Sanitized image as a data URI.')
    content_type = models.CharField(max_length=50)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.content_type})'
