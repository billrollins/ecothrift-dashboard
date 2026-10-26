"""Keys and key rings (owner, 2026-10-26): every key we have, every ring, and where each one is now.

A key has a photo (shot at 5x over white photo paper) and the metrics an AI read from it (`services/ai.py`), so a new
photo can find it again (`services/search.py`). A key sits on at most one ring, or on none. A ring has a home (a place
or a person it belongs to); where it is now is its last move in the log: checked out to someone, or back home.

Key photos show the cuts, so this app is owner and Admin only and the photos are private uploads (signed links).
"""
from django.conf import settings
from django.db import models


class KeyRing(models.Model):
    name = models.CharField(max_length=120)
    notes = models.TextField(blank=True, default='')
    home_location = models.CharField(max_length=160, blank=True, default='', help_text='Where it lives, e.g. "Office drawer".')
    home_person = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
        help_text='Whose ring it is, when it belongs to a person.',
    )
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name


class KeyRingMove(models.Model):
    """One check-out (to a person or a place) or check-in (back home). The newest says where the ring is now."""

    OUT = 'out'
    IN = 'in'
    KIND_CHOICES = [(OUT, 'Checked out'), (IN, 'Checked in')]

    ring = models.ForeignKey(KeyRing, on_delete=models.CASCADE, related_name='moves')
    kind = models.CharField(max_length=3, choices=KIND_CHOICES)
    person = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    person_name = models.CharField(max_length=120, blank=True, default='', help_text='Someone without a login.')
    location = models.CharField(max_length=160, blank=True, default='')
    note = models.CharField(max_length=255, blank=True, default='')
    moved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    moved_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ['-moved_at', '-id']


class Key(models.Model):
    name = models.CharField(max_length=120)
    notes = models.TextField(blank=True, default='')
    ring = models.ForeignKey(KeyRing, on_delete=models.SET_NULL, null=True, blank=True, related_name='keys')
    photo = models.FileField(upload_to='keys/photos/', blank=True, default='')
    thumbnail = models.FileField(upload_to='keys/photos/', blank=True, default='')

    # What the AI read from the photo (services/ai.py). Each is editable by hand; blank means not readable.
    key_type = models.CharField(max_length=20, blank=True, default='')
    keyway = models.CharField(max_length=40, blank=True, default='', help_text='Blank or keyway guess, e.g. KW1, SC1.')
    head_shape = models.CharField(max_length=40, blank=True, default='')
    brand = models.CharField(max_length=60, blank=True, default='', help_text='The brand stamped on the head.')
    stamped_code = models.CharField(max_length=60, blank=True, default='', help_text='Any code stamped on the key.')
    cut_count = models.PositiveSmallIntegerField(null=True, blank=True)
    cut_depths = models.CharField(max_length=60, blank=True, default='', help_text='Head to tip, e.g. 3-5-2-4-6.')
    metrics_model = models.CharField(max_length=80, blank=True, default='', help_text='The model that read the photo.')
    metrics_at = models.DateTimeField(null=True, blank=True)

    is_archived = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name
