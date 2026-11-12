from django.conf import settings
from django.db import models

# What a store-map pin on the Signage layer points at (MapLayer.ref_type / MapPin.ref_type).
SIGN_REF_TYPE = 'signage.sign'


class Sign(models.Model):
    """One store sign (#106, Bill 2026-11-12): its print PDF, where it is in the making, and how many are up.

    Where each copy hangs is a pin on the Signage layer of the store map (``floorplan.MapPin`` with
    ``ref_type='signage.sign'`` and ``ref_id`` = this sign).
    """
    STATUS_TO_MAKE = 'to_make'
    STATUS_PRINTED = 'printed'
    STATUS_UP = 'up'
    STATUS_CHOICES = [
        (STATUS_TO_MAKE, 'To make'),
        (STATUS_PRINTED, 'Printed'),
        (STATUS_UP, 'Up'),
    ]

    name = models.CharField(max_length=120)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_TO_MAKE)
    copies_up = models.PositiveSmallIntegerField(default=0)
    note = models.TextField(blank=True, default='')
    pdf = models.ForeignKey(
        'core.S3File', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
        help_text='The file to print, in the shared file store.',
    )
    # Removing a sign hides it (and drops its pins); the row stays for the record.
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name
