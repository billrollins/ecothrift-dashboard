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
    # The store map (#105, Bill 2026-11-12): one plan per location is the Current one. Its layers of pins
    # (MapPin) show on Facilities -> Store map. A superuser sets it; the pins move along when another plan
    # of the same location is made Current.
    is_current = models.BooleanField(default=False)
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
        constraints = [
            models.UniqueConstraint(
                fields=['location'],
                condition=models.Q(is_current=True),
                name='floorplan_one_current_per_location',
            ),
        ]

    def __str__(self):
        return f'{self.name} ({self.location_id})'


class FloorPlanElementKind(models.Model):
    """A reusable element type available in the editor palette.

    Seeded from the original hardcoded frontend palette (migration 0003);
    Super Admin can add or edit kinds. Plan documents reference kinds by the
    stable `kind` slug via `element.kind`; unknown slugs still render as a
    generic rectangle on the client, so deactivating a kind never breaks a
    saved plan.
    """
    SHAPE_RECT = 'rect'
    SHAPE_CIRCLE = 'circle'
    SHAPE_CHOICES = [
        (SHAPE_RECT, 'Rectangle'),
        (SHAPE_CIRCLE, 'Circle / ellipse'),
    ]

    kind = models.SlugField(
        max_length=64,
        unique=True,
        help_text='Stable slug persisted in plan documents; immutable after create.',
    )
    label = models.CharField(max_length=128)
    category = models.CharField(max_length=64, default='Misc')
    default_w = models.FloatField(help_text='Default width in inches.')
    default_h = models.FloatField(help_text='Default depth in inches.')
    fill_color = models.CharField(
        max_length=7,
        default='#9e9e9e',
        help_text='Hex fill, used when the element has no image.',
    )
    default_image = models.ForeignKey(
        'FloorPlanAsset',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='element_kinds',
        help_text='Optional image preset applied to newly placed elements.',
    )
    shape = models.CharField(max_length=10, choices=SHAPE_CHOICES, default=SHAPE_RECT)
    corner_radius = models.FloatField(
        default=0,
        help_text='Corner radius in inches; only meaningful when shape=rect.',
    )
    resizable = models.BooleanField(default=True)
    is_wall = models.BooleanField(
        default=False,
        help_text=(
            'Wall behavior: the raw height is the wall THICKNESS (survives '
            'rotation), resize drags change length only, and group scaling '
            'never fattens it.'
        ),
    )
    is_system = models.BooleanField(
        default=False,
        help_text='Seeded built-in; editable but not deletable, slug locked.',
    )
    sort_order = models.PositiveIntegerField(default=0)
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
        ordering = ['category', 'sort_order', 'id']

    def __str__(self):
        return f'{self.label} ({self.kind})'


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


class MapLayer(models.Model):
    """A layer of pins on the store map (#105): Signage first; later security cameras, fire extinguishers,
    FF&E, keys and security spots, shelves. Staff turn layers on and off on Facilities -> Store map.

    ``ref_type`` names what a pin on this layer points at (``signage.sign``); blank = a plain pin with a
    name and a note. New layers are added by a seed migration or in the Django admin.
    """
    slug = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=200, blank=True, default='')
    color = models.CharField(max_length=7, default='#2563eb', help_text='Hex colour of the pins.')
    ref_type = models.CharField(
        max_length=40, blank=True, default='',
        help_text='What a pin on this layer points at, e.g. signage.sign. Blank = plain pins.',
    )
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['sort_order', 'id']

    def __str__(self):
        return self.name


class MapPin(models.Model):
    """One pin on a plan's layer (#105). Its own row, so editing the plan drawing never moves or drops it.

    ``x``/``y`` are plan inches (same frame as the plan document). ``ref_type`` + ``ref_id`` point at the
    thing the pin stands for (a sign today; a camera, an extinguisher or a shelf later).

    ``status`` (#129, Bill 2026-11-13): each spot says whether its copy is still to hang or is up. It replaced the
    sign's own To make / Printed / Up and its "copies up" count.
    """
    STATUS_WANTED = 'wanted'
    STATUS_UP = 'up'
    STATUS_CHOICES = [
        (STATUS_WANTED, 'To hang'),
        (STATUS_UP, 'Up'),
    ]

    plan = models.ForeignKey(FloorPlan, on_delete=models.CASCADE, related_name='pins')
    layer = models.ForeignKey(MapLayer, on_delete=models.PROTECT, related_name='pins')
    x = models.FloatField()
    y = models.FloatField()
    name = models.CharField(max_length=120)
    note = models.TextField(blank=True, default='')
    ref_type = models.CharField(max_length=40, blank=True, default='')
    ref_id = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_WANTED)
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
        ordering = ['layer__sort_order', 'name', 'id']
        indexes = [models.Index(fields=['ref_type', 'ref_id'], name='floorplan_pin_ref_idx')]

    def __str__(self):
        return f'{self.name} ({self.layer_id})'
