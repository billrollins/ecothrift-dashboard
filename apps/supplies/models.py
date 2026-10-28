"""Supplies (owner design, 2026-10-26): supply lists, the weekly count, and the week's order.

A list belongs to a department (or is just a named list). Each item says where it comes from (vendor, link, the
vendor's id such as an Amazon ASIN), how it comes (pack size, price per pack, the unit staff count in), and the
min and max to keep on hand. Every week staff count each list by the deadline (Settings → Store → Supplies,
Monday 15:00 store time by default). After the deadline the hourly job builds the week's order by rule
(`services/rules.py`): at or under min, order up to max in whole packs. The owner orders from it.

Order lines copy the item's facts when the order is built, so a later edit to the list never changes an order.
"""
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class SupplyList(models.Model):
    """One supply list: a department's, or a named list."""

    name = models.CharField(max_length=120)
    department = models.ForeignKey(
        'hr.Department', on_delete=models.SET_NULL, null=True, blank=True, related_name='supply_lists',
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class SupplyItem(models.Model):
    """One thing on a list. Staff count it in `unit`s; it is bought in packs of `pack_size` at `price` a pack."""

    supply_list = models.ForeignKey(SupplyList, on_delete=models.CASCADE, related_name='items')
    name = models.CharField(max_length=200)
    description = models.CharField(max_length=500, blank=True, default='')
    vendor = models.CharField(max_length=120, blank=True, default='')
    vendor_url = models.URLField(max_length=500, blank=True, default='', help_text="The vendor's home page.")
    url = models.URLField(max_length=1000, blank=True, default='', help_text="The item's page at the vendor.")
    vendor_item_id = models.CharField(
        max_length=60, blank=True, default='', help_text="The vendor's id for the item, e.g. an Amazon ASIN.",
    )
    pack_size = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    unit = models.CharField(max_length=40, blank=True, default='each')
    min_qty = models.PositiveIntegerField(default=0)
    max_qty = models.PositiveIntegerField(default=0)
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text='Price of one pack.')
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class SupplyCount(models.Model):
    """One list's count for one week. `week_start` is the Monday of the week the count is due."""

    supply_list = models.ForeignKey(SupplyList, on_delete=models.CASCADE, related_name='counts')
    week_start = models.DateField(db_index=True)
    counted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    submitted_at = models.DateTimeField()

    class Meta:
        ordering = ['-week_start']
        constraints = [
            models.UniqueConstraint(fields=['supply_list', 'week_start'], name='supplies_one_count_per_list_week'),
        ]

    def __str__(self):
        return f'{self.supply_list} {self.week_start}'


class SupplyCountLine(models.Model):
    count = models.ForeignKey(SupplyCount, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(SupplyItem, on_delete=models.CASCADE, related_name='count_lines')
    on_hand = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['count', 'item'], name='supplies_one_line_per_item'),
        ]


class SupplyOrder(models.Model):
    """The week's order, built once after the count deadline."""

    week_start = models.DateField(unique=True)
    built_at = models.DateTimeField()
    missed_lists = models.JSONField(default=list, blank=True, help_text='Names of lists with no count by the deadline.')

    class Meta:
        ordering = ['-week_start']

    def __str__(self):
        return f'Supply order {self.week_start}'


class SupplyOrderLine(models.Model):
    """One thing to buy. The item's facts are copied in when the order is built."""

    LINK_UNCHECKED = ''
    LINK_OK = 'ok'
    LINK_BROKEN = 'broken'

    order = models.ForeignKey(SupplyOrder, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(SupplyItem, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    list_name = models.CharField(max_length=120)
    name = models.CharField(max_length=200)
    vendor = models.CharField(max_length=120, blank=True, default='')
    vendor_url = models.URLField(max_length=500, blank=True, default='')
    url = models.URLField(max_length=1000, blank=True, default='')
    vendor_item_id = models.CharField(max_length=60, blank=True, default='')
    unit = models.CharField(max_length=40, blank=True, default='')
    pack_size = models.PositiveIntegerField(default=1)
    min_qty = models.PositiveIntegerField(default=0)
    max_qty = models.PositiveIntegerField(default=0)
    on_hand = models.PositiveIntegerField(default=0)
    packs = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reason = models.CharField(max_length=255, blank=True, default='')
    link_status = models.CharField(max_length=10, blank=True, default=LINK_UNCHECKED)
    ordered_at = models.DateTimeField(null=True, blank=True)
    ordered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    # Packs in so far (owner, 2026-10-28: partial quantities allowed). Each change is a SupplyReceipt.
    received_qty = models.PositiveIntegerField(default=0)
    received_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )

    class Meta:
        ordering = ['vendor', 'list_name', 'name']

    @property
    def line_total(self):
        return None if self.price is None else self.price * self.packs


class SupplyReceipt(models.Model):
    """One change to a line's packs in: who, when, by how much (a correction is a negative change)."""

    line = models.ForeignKey(SupplyOrderLine, on_delete=models.CASCADE, related_name='receipts')
    change = models.IntegerField()
    received_qty = models.PositiveIntegerField(help_text='Packs in after this change.')
    by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-at']


class SupplyRequest(models.Model):
    """A "We need ___" from anyone on the team (owner, 2026-10-28). A manager or the owner approves it onto a list
    (it becomes an item) or declines it with a reason; the requester sees the answer."""

    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_DECLINED = 'declined'
    STATUS_CHOICES = [(STATUS_PENDING, 'Waiting'), (STATUS_APPROVED, 'Approved'), (STATUS_DECLINED, 'Declined')]

    name = models.CharField(max_length=200)
    url = models.URLField(max_length=1000, blank=True, default='')
    photo = models.FileField(upload_to='supplies/requests/', blank=True, default='')
    note = models.CharField(max_length=500, blank=True, default='')
    supply_list = models.ForeignKey(SupplyList, on_delete=models.SET_NULL, null=True, blank=True, related_name='requests')
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decline_reason = models.CharField(max_length=500, blank=True, default='')
    item = models.ForeignKey(SupplyItem, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name
