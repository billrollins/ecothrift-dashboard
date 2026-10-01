"""Shelf inventory counts.

- **Section:** a label for a part of the floor (a stand-in until real location codes exist).
- **InventoryCount:** one per calendar day (``day``). Every run that day adds up to one inventory.
  It freezes the items the system says are on the shelf when the day's first run starts
  (``expected_item_ids``), so sales and new stock during the count don't look like shrink.
  Rows with ``day`` null are the first version's trial counts.
- **Run:** one person in one section, start to stop, with a note. A run marked **bad** stays on
  record but is left out of the totals and out of the "already scanned" check.
- **CountScan:** one scan. Removed scans are kept (``removed_at``) and can be put back.
- **Issue:** something wrong with an item, what the scanner answered, and the cart it went into.
  The PR Fix-it screen works through these.
- **Cart:** a label ("Bill PR Cart 2") for the physical cart problem items ride in.
"""
from django.conf import settings
from django.db import models


class Section(models.Model):
    name = models.CharField(max_length=60, unique=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class InventoryCount(models.Model):
    STATUS_OPEN = 'open'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [(STATUS_OPEN, 'Open'), (STATUS_CLOSED, 'Closed')]

    name = models.CharField(max_length=120)
    day = models.DateField(null=True, blank=True, unique=True, help_text='The store day this count is for (one per day).')
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


class Run(models.Model):
    STATUS_OPEN = 'open'
    STATUS_STOPPED = 'stopped'
    STATUS_BAD = 'bad'
    STATUS_CHOICES = [(STATUS_OPEN, 'Scanning'), (STATUS_STOPPED, 'Stopped'), (STATUS_BAD, 'Bad run')]

    count = models.ForeignKey(InventoryCount, on_delete=models.CASCADE, related_name='runs')
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name='runs')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_OPEN, db_index=True)
    section_complete = models.BooleanField(default=False, help_text='The person said this section is fully scanned.')
    note = models.TextField(blank=True, default='')
    started_at = models.DateTimeField(auto_now_add=True)
    stopped_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']
        indexes = [models.Index(fields=['count', 'section'], name='stocktake_run_count_section')]


class CountScan(models.Model):
    RESULT_OK = 'ok'                  # on the shelf per the system, now counted
    RESULT_ALREADY = 'already'        # this item was already scanned today (in a run that is not bad)
    RESULT_ODD = 'odd'                # the item exists but the system says it is not on the shelf (sold, ...)
    RESULT_UNKNOWN = 'unknown'        # the code looks like a SKU but no item has it
    RESULT_BAD_FORMAT = 'bad_format'  # the code is not a SKU at all
    RESULT_CHOICES = [
        (RESULT_OK, 'OK'),
        (RESULT_ALREADY, 'Already scanned'),
        (RESULT_ODD, 'Not on shelf per system'),
        (RESULT_UNKNOWN, 'Tag not recognized'),
        (RESULT_BAD_FORMAT, 'Not one of our tags'),
    ]

    count = models.ForeignKey(InventoryCount, on_delete=models.CASCADE, related_name='scans')
    run = models.ForeignKey(Run, on_delete=models.CASCADE, null=True, blank=True, related_name='scans')
    client_id = models.CharField(max_length=64)
    seq = models.IntegerField(default=0)
    code = models.CharField(max_length=64)
    scanned_at = models.DateTimeField()
    result = models.CharField(max_length=10, choices=RESULT_CHOICES, db_index=True)
    item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    item_status = models.CharField(max_length=20, blank=True, default='')
    removed_at = models.DateTimeField(null=True, blank=True)
    removed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['seq', 'id']
        constraints = [
            models.UniqueConstraint(fields=['count', 'client_id'], name='stocktake_scan_client_once'),
        ]
        indexes = [
            models.Index(fields=['count', 'code'], name='stocktake_scan_count_code'),
            models.Index(fields=['count', 'item'], name='stocktake_scan_count_item'),
        ]


class Cart(models.Model):
    KIND_PR = 'pr'
    KIND_RELOCATE = 'relocate'
    KIND_CHOICES = [(KIND_PR, 'PR (processing)'), (KIND_RELOCATE, 'Relocate')]

    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    label = models.CharField(max_length=60)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.label


class Issue(models.Model):
    KIND_NOT_SKU = 'not_sku'
    KIND_NOT_RECOGNIZED = 'not_recognized'
    KIND_ALREADY_SOLD = 'already_sold'
    KIND_NOT_ON_SHELF = 'not_on_shelf'
    KIND_ALREADY_SCANNED = 'already_scanned'
    KIND_WRONG_TITLE = 'wrong_title'
    KIND_WRONG_TAG = 'wrong_tag'
    KIND_PRICE_HIGH = 'price_high'
    KIND_PRICE_LOW = 'price_low'
    KIND_NO_TAG = 'no_tag'
    KIND_WRONG_SECTION = 'wrong_section'
    KIND_CHOICES = [
        (KIND_NOT_SKU, 'Not one of our tags'),
        (KIND_NOT_RECOGNIZED, 'Tag not recognized'),
        (KIND_ALREADY_SOLD, 'Already sold'),
        (KIND_NOT_ON_SHELF, 'Not on shelf per system'),
        (KIND_ALREADY_SCANNED, 'Already scanned'),
        (KIND_WRONG_TITLE, 'Wrong title'),
        (KIND_WRONG_TAG, 'Bad tag'),
        (KIND_PRICE_HIGH, 'Price too high'),
        (KIND_PRICE_LOW, 'Price too low'),
        (KIND_NO_TAG, 'No tag'),
        (KIND_WRONG_SECTION, 'Wrong section'),
    ]
    # What the scanner did about it on the floor.
    ACTION_PENDING = 'pending'      # no answer yet: the run can't be marked complete
    ACTION_CLEARED = 'cleared'      # a mistake: rescanned fine, or a double scan
    ACTION_PR_CART = 'pr_cart'      # the item went into a PR cart for processing to fix
    ACTION_LEFT = 'left'            # left on the shelf; only tallied
    ACTION_RELOCATE = 'relocate'    # went into a relocate cart, to move to ``target_section``
    ACTION_CHOICES = [
        (ACTION_PENDING, 'Needs an answer'),
        (ACTION_CLEARED, 'Cleared'),
        (ACTION_PR_CART, 'In a PR cart'),
        (ACTION_LEFT, 'Left on the shelf'),
        (ACTION_RELOCATE, 'In a relocate cart'),
    ]

    count = models.ForeignKey(InventoryCount, on_delete=models.CASCADE, related_name='issues')
    run = models.ForeignKey(Run, on_delete=models.CASCADE, related_name='issues')
    scan = models.ForeignKey(CountScan, on_delete=models.SET_NULL, null=True, blank=True, related_name='issues')
    item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    code = models.CharField(max_length=64, blank=True, default='')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, db_index=True)
    action = models.CharField(max_length=10, choices=ACTION_CHOICES, default=ACTION_PENDING, db_index=True)
    cart = models.ForeignKey(Cart, on_delete=models.SET_NULL, null=True, blank=True, related_name='issues')
    target_section = models.ForeignKey(Section, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    detail = models.CharField(max_length=300, blank=True, default='', help_text='What the scanner typed, e.g. the right title.')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    # PR Fix-it: what processing did about it.
    fixed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    fixed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    fix = models.CharField(max_length=20, blank=True, default='')
    fix_note = models.CharField(max_length=300, blank=True, default='')
    new_item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        ordering = ['-created_at']
