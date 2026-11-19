"""Stock photos for the phone site (Dash Update #185).

Owner, 2026-11-19: "Pick the best items we have ensure they have nice stock photos. need a small disclaimer once you do
click into the product details: Photo of stock item, may not match". And: "NEVER EVER EVER use photos you got from us for
other purposes. like the add item photos. you CAN use the photo sheets photos."

A ``StockPhoto`` is the maker's or a large retailer's own picture of a product, pulled from the web by
``services/stock_photos.py``. One row per looked-up piece: ``p<product id>`` (the floor now) or ``m<manifest row id>``
(a truck, later). A row with no picture remembers the miss so the piece is not searched again before ``next_try_on``.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models


class StockPhoto(models.Model):
    STATUS_FOUND = 'found'          # the machine check passed
    STATUS_APPROVED = 'approved'    # a person confirmed it matches (the processing approve, later)
    STATUS_REJECTED = 'rejected'    # a person took it off (Django admin > Reject): not searched again for 90 days
    STATUS_NONE = 'none'            # looked up, nothing good enough: tried again on next_try_on
    STATUS_CHOICES = [
        (STATUS_FOUND, 'Found'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_NONE, 'None found'),
    ]
    PUBLIC = (STATUS_FOUND, STATUS_APPROVED)  # the statuses a public page may show

    key = models.CharField(max_length=24, unique=True, help_text='p<product id> or m<manifest row id>')
    product = models.ForeignKey('inventory.Product', on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='stock_photos')
    manifest_row = models.ForeignKey('inventory.ManifestRow', on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='stock_photos')
    # The same product found once is reused: "gtin:<14 digits>" when there is a valid UPC/EAN, else
    # "bm:<brand>|<model>" (lower case, letters and digits only), else blank (never reused).
    match_key = models.CharField(max_length=200, blank=True, default='', db_index=True)
    title = models.CharField(max_length=300, blank=True, default='', help_text='What was looked up.')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_NONE, db_index=True)
    # A JPEG, long side about 640 px, on the default storage.
    image = models.FileField(upload_to='storefront/stock/', blank=True, default='')
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    page_url = models.URLField(max_length=1000, blank=True, default='', help_text='The product page it came from.')
    image_url = models.URLField(max_length=1000, blank=True, default='', help_text='The picture it was copied from.')
    confidence = models.FloatField(null=True, blank=True)
    why = models.TextField(blank=True, default='', help_text="The finder's and the check's short reasons.")
    tries = models.PositiveSmallIntegerField(default=0)
    next_try_on = models.DateField(null=True, blank=True)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0, help_text='AI spend on this row, all tries.')
    found_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='+')
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-id']

    def __str__(self):
        return f'{self.key} {self.status}: {self.title[:60]}'

    @property
    def is_public(self) -> bool:
        return self.status in self.PUBLIC and bool(self.image)
