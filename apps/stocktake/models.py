"""Shelf inventory counts: scan every item on the floor, compare to what the system says is on the shelf.

A count freezes the list of items expected on the shelf when it starts (``expected_item_ids``), so
sales and new stock during the count do not look like shrink. Scans arrive from the phone in batches,
each with a client-made id, so a retried batch never double counts.
"""
from django.conf import settings
from django.db import models


class InventoryCount(models.Model):
    STATUS_OPEN = 'open'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [(STATUS_OPEN, 'Open'), (STATUS_CLOSED, 'Closed')]

    name = models.CharField(max_length=120)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_OPEN, db_index=True)
    note = models.TextField(blank=True, default='')
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    started_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    # Item ids that were status='on_shelf' the moment the count started.
    expected_item_ids = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return self.name


class CountScan(models.Model):
    RESULT_OK = 'ok'            # on the shelf per the system, now counted
    RESULT_ALREADY = 'already'  # this item was already scanned in this count
    RESULT_ODD = 'odd'          # the item exists but the system says it is not on the shelf (sold, scrapped, ...)
    RESULT_UNKNOWN = 'unknown'  # no item has this code
    RESULT_CHOICES = [
        (RESULT_OK, 'OK'),
        (RESULT_ALREADY, 'Already scanned'),
        (RESULT_ODD, 'Not on shelf per system'),
        (RESULT_UNKNOWN, 'Unknown code'),
    ]

    count = models.ForeignKey(InventoryCount, on_delete=models.CASCADE, related_name='scans')
    client_id = models.CharField(max_length=64)
    seq = models.IntegerField(default=0)
    code = models.CharField(max_length=64)
    scanned_at = models.DateTimeField()
    result = models.CharField(max_length=10, choices=RESULT_CHOICES, db_index=True)
    item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    item_status = models.CharField(max_length=20, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['seq', 'id']
        constraints = [
            models.UniqueConstraint(fields=['count', 'client_id'], name='stocktake_scan_client_once'),
        ]
        indexes = [models.Index(fields=['count', 'code'], name='stocktake_scan_count_code')]
