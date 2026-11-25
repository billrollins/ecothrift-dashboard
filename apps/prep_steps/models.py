"""Truck Prep A (Steps): one run per truck, one line per manifest line, every change recorded.

The tables are this app's own. A line keeps the manifest's values it was loaded from (``src_*``) beside the values
the steps set, so every step can show before and after. Every change is a ``PrepChange`` row under one
``PrepAction`` (a rule pass, an AI job, a custom prompt, a hand edit), so any action can be undone.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models

STEPS = ('load', 'clean', 'match', 'category', 'retail', 'price', 'packs', 'send')


class PrepRun(models.Model):
    """The prep of one truck."""

    purchase_order = models.OneToOneField(
        'inventory.PurchaseOrder', on_delete=models.CASCADE, related_name='prep_steps_run', db_constraint=False,
    )
    step = models.CharField(max_length=12, default='load')
    # {step: {"state": "open"|"done", "done_at": iso}}
    steps = models.JSONField(default=dict, blank=True)
    # The truck target: {"share": 0.55, "band": 0.15}; total = share x retail of the truck.
    target = models.JSONField(default=dict, blank=True)
    # What Load found: {"columns": {field: header}, "headers": [...], "source": "preprocessing"|"manifest"}
    load_info = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'prep A run {self.pk} (PO {self.purchase_order_id})'


class PrepLine(models.Model):
    run = models.ForeignKey(PrepRun, on_delete=models.CASCADE, related_name='lines')
    row_number = models.PositiveIntegerField()
    preprocessing_row_id = models.BigIntegerField(null=True, blank=True)
    manifest_row_id = models.BigIntegerField(null=True, blank=True)
    raw = models.JSONField(default=dict, blank=True)

    # What the manifest says (Load). Never changed after Load.
    src_title = models.TextField(blank=True, default='')
    src_brand = models.CharField(max_length=200, blank=True, default='')
    src_model = models.CharField(max_length=200, blank=True, default='')
    src_qty = models.IntegerField(default=1)
    src_retail = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    src_ext_retail = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    src_category = models.CharField(max_length=200, blank=True, default='')
    src_subcategory = models.CharField(max_length=200, blank=True, default='')
    src_condition = models.CharField(max_length=40, blank=True, default='')
    upc = models.CharField(max_length=40, blank=True, default='')
    item_number = models.CharField(max_length=100, blank=True, default='')
    image_url = models.TextField(blank=True, default='')
    page_url = models.TextField(blank=True, default='')

    # What the steps set.
    title = models.CharField(max_length=300, blank=True, default='')
    brand = models.CharField(max_length=200, blank=True, default='')
    model = models.CharField(max_length=200, blank=True, default='')
    qty = models.IntegerField(default=1)

    match_product_id = models.BigIntegerField(null=True, blank=True)
    match_kind = models.CharField(max_length=8, blank=True, default='')  # is | like | new | ''
    match_confidence = models.PositiveSmallIntegerField(null=True, blank=True)
    match_candidates = models.JSONField(default=list, blank=True)
    product_draft = models.JSONField(default=dict, blank=True)

    category = models.CharField(max_length=100, blank=True, default='')
    subcategory = models.CharField(max_length=100, blank=True, default='')

    retail = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)  # retail of one piece
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)  # tag of one piece
    price_class = models.CharField(max_length=8, blank=True, default='')

    # Pack standard (processing-night-1124.md): unit_count per unit, pack_units units in the pack.
    unit_count = models.PositiveIntegerField(null=True, blank=True)
    unit_name = models.CharField(max_length=40, blank=True, default='')
    pack_units = models.PositiveIntegerField(null=True, blank=True)
    pieces = models.PositiveIntegerField(default=1)  # tags per manifest unit (sell as)
    sell_as = models.CharField(max_length=12, blank=True, default='')  # whole | units | ''

    search_tags = models.JSONField(default=list, blank=True)
    # {field: "a few words"} and {field: "rule:<name>" | "ai:<model>" | "staff" | "manifest"}
    reasons = models.JSONField(default=dict, blank=True)
    sources = models.JSONField(default=dict, blank=True)
    # Steps where a person accepted the line as it is.
    accepted = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['run', 'row_number']
        constraints = [
            models.UniqueConstraint(fields=['run', 'row_number'], name='prep_steps_line_run_row_uniq'),
        ]

    def __str__(self):
        return f'prep A line {self.row_number} (run {self.run_id})'


class PrepAction(models.Model):
    """One thing that ran on a step: a rule pass, an AI job, a custom prompt, a hand edit."""

    KIND_RULE = 'rule'
    KIND_AI = 'ai'
    KIND_CUSTOM = 'custom'
    KIND_EDIT = 'edit'

    STATUS_RUNNING = 'running'
    STATUS_PREVIEW = 'preview'
    STATUS_APPLIED = 'applied'
    STATUS_UNDONE = 'undone'
    STATUS_FAILED = 'failed'
    STATUS_DISCARDED = 'discarded'

    run = models.ForeignKey(PrepRun, on_delete=models.CASCADE, related_name='actions')
    step = models.CharField(max_length=12)
    kind = models.CharField(max_length=8)
    name = models.CharField(max_length=40)
    label = models.CharField(max_length=120, blank=True, default='')
    model = models.CharField(max_length=80, blank=True, default='')  # '' = code, no AI
    effort = models.CharField(max_length=10, blank=True, default='')
    prompt = models.TextField(blank=True, default='')
    status = models.CharField(max_length=10, default=STATUS_RUNNING)
    line_count = models.PositiveIntegerField(default=0)
    changed_count = models.PositiveIntegerField(default=0)
    seconds = models.FloatField(default=0)
    cost = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    calls = models.PositiveIntegerField(default=0)
    batches_done = models.PositiveIntegerField(default=0)
    batches_total = models.PositiveIntegerField(default=0)
    # For an AI preview: [{"line": id, "field": f, "old": v, "new": v, "reason": s}] until Apply.
    preview = models.JSONField(default=list, blank=True)
    error = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['run', 'step'], name='prep_steps_action_run_step')]

    def __str__(self):
        return f'{self.step}:{self.name} ({self.status})'


class PrepChange(models.Model):
    """One field of one line changed by one action (old and new kept, so the action can be undone)."""

    action = models.ForeignKey(PrepAction, on_delete=models.CASCADE, related_name='changes')
    line = models.ForeignKey(PrepLine, on_delete=models.CASCADE, related_name='changes')
    field = models.CharField(max_length=40)
    old = models.JSONField(null=True, blank=True)
    new = models.JSONField(null=True, blank=True)
    reason = models.CharField(max_length=300, blank=True, default='')

    class Meta:
        indexes = [models.Index(fields=['action'], name='prep_steps_change_action')]
