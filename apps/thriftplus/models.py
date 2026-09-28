"""
Thrift+ Rewards: members, the people on a membership, and their cards (thrift_plus_rewards Phase 1).

- **Account:** one membership. The monthly "cover" (the first $10 of rewards; ``deductible`` in
  code) and store credit are ledgers built in Phase 3.
- **Person:** one or two adults on an account, a primary and at most one secondary, each with a
  photo (a person checks it at every scan; there is no face matching) and a verified-18+ flag.
  Store only the name, phone, photo and that flag: never ID barcode data (Neb. Rev. Stat.
  60-4,111.01).
- **Card:** a pre-printed blank with a random 12-digit code (Luhn check digit) that is never the
  account id. Blanks are generated in a ``CardBatch`` as ``unissued``, their backs are printed from
  Dash through the print server, and scanning one at the register attaches it to a person.
- **Event:** every change, logged with who, when and a detail.

Nothing here is visible to customers, or to the register, until the ``thrift_plus_enabled``
setting is turned on at launch.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models


class Account(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_REVOKED = 'revoked'
    STATUS_CHOICES = [(STATUS_ACTIVE, 'Active'), (STATUS_REVOKED, 'Revoked')]

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    notes = models.TextField(blank=True, default='')
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.CharField(max_length=200, blank=True, default='')
    revoked_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Thrift+ account {self.pk} ({self.status})'


class Person(models.Model):
    ROLE_PRIMARY = 'primary'
    ROLE_SECONDARY = 'secondary'
    ROLE_CHOICES = [(ROLE_PRIMARY, 'Primary'), (ROLE_SECONDARY, 'Second adult')]

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='people')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_PRIMARY)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80, blank=True, default='')
    phone = models.CharField(max_length=20, blank=True, default='', db_index=True, help_text='Digits only (a lookup key).')
    photo = models.FileField(upload_to='thriftplus/photos/', blank=True, default='')
    id_checked = models.BooleanField(default=False, help_text='A cashier matched the name to a photo ID.')
    verified_18 = models.BooleanField(default=False, help_text='The ID showed 18+. Only this flag is stored, never the ID.')
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    removed_at = models.DateTimeField(null=True, blank=True, help_text='Taken off the account (second adults only).')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['account_id', 'role', 'pk']

    def __str__(self):
        return f'{self.first_name} {self.last_name}'.strip()

    @property
    def is_active(self) -> bool:
        return self.removed_at is None


class CardBatch(models.Model):
    """A run of blank cards: codes generated together, backs printed together."""

    size = models.PositiveIntegerField()
    note = models.CharField(max_length=200, blank=True, default='')
    printed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Card batch {self.pk} ({self.size})'


class Card(models.Model):
    STATUS_UNISSUED = 'unissued'
    STATUS_ACTIVE = 'active'
    STATUS_DEAD = 'dead'
    STATUS_CHOICES = [(STATUS_UNISSUED, 'Blank'), (STATUS_ACTIVE, 'Active'), (STATUS_DEAD, 'Dead')]

    code = models.CharField(max_length=12, unique=True, help_text='12 digits with a Luhn check digit. Never the account id.')
    batch = models.ForeignKey(CardBatch, on_delete=models.PROTECT, null=True, blank=True, related_name='cards')
    person = models.ForeignKey(Person, on_delete=models.SET_NULL, null=True, blank=True, related_name='cards')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_UNISSUED, db_index=True)
    issued_at = models.DateTimeField(null=True, blank=True)
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    dead_at = models.DateTimeField(null=True, blank=True)
    dead_reason = models.CharField(max_length=120, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f'Card {self.code} ({self.status})'


class Event(models.Model):
    """One logged change: signup, verification, second adult, card issued or killed, revocation."""

    account = models.ForeignKey(Account, on_delete=models.CASCADE, null=True, blank=True, related_name='events')
    person = models.ForeignKey(Person, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    card = models.ForeignKey(Card, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    action = models.CharField(max_length=40, db_index=True)
    detail = models.JSONField(default=dict, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.action} ({self.created_at:%Y-%m-%d %H:%M})'


# ── The reward engine (thrift_plus_rewards Phase 2) ─────────────────────────────


class RewardFamily(models.Model):
    """
    Products a shopper treats as the same kind of thing at a similar price (the same blender in
    two colours, two sizes of one towel set). Their floor units pace together. A product with no
    family stands alone, and units of one product are always paced together (bulk).
    """

    name = models.CharField(max_length=120, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name or f'Family {self.pk}'


class FamilyLink(models.Model):
    """
    A product's family check: asked once (vector neighbours on the floor, then the model's
    "same family?"), never again. ``family`` is null when the product stands alone.
    """

    SOURCE_ASKED = 'asked'
    SOURCE_NEIGHBOUR = 'neighbour'
    SOURCE_ALONE = 'alone'
    SOURCE_CHOICES = [
        (SOURCE_ASKED, 'Asked the model'),
        (SOURCE_NEIGHBOUR, "Named in a neighbour's answer"),
        (SOURCE_ALONE, 'No close neighbours on the floor'),
    ]

    product = models.OneToOneField('inventory.Product', on_delete=models.CASCADE, primary_key=True, related_name='reward_family_link')
    family = models.ForeignKey(RewardFamily, on_delete=models.SET_NULL, null=True, blank=True, related_name='links')
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES)
    answer = models.JSONField(default=dict, blank=True, help_text='The neighbours considered and what the model said.')
    model_used = models.CharField(max_length=80, blank=True, default='')
    checked_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.product_id} → {self.family_id or "alone"}'


class RewardRun(models.Model):
    """One nightly recompute: the day it priced, what it counted, and whether it finished."""

    day = models.DateField(db_index=True, help_text='The day the rewards apply to.')
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    counts = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f'Reward run {self.day}'


class ItemReward(models.Model):
    """
    One floor item's reward: what a member takes off the tag price. Written only by the nightly
    recompute (``services/rewards.py``), which never lowers it (a retag below the reward is the
    one exception, and is logged). A guest always pays the tag.
    """

    STATUS_WAITING = 'waiting'
    STATUS_CLIMBING = 'climbing'
    STATUS_PAUSED = 'paused'
    STATUS_CAPPED = 'capped'
    STATUS_NO_ROOM = 'no_room'
    STATUS_EXCLUDED = 'excluded'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [
        (STATUS_WAITING, 'Days 1 to 7'),
        (STATUS_CLIMBING, 'Climbing'),
        (STATUS_PAUSED, 'Held: family selling on pace'),
        (STATUS_CAPPED, 'At the floor'),
        (STATUS_NO_ROOM, 'No tag price'),
        (STATUS_EXCLUDED, 'Excluded'),
        (STATUS_CLOSED, 'Off the floor'),
    ]

    item = models.OneToOneField('inventory.Item', on_delete=models.CASCADE, primary_key=True, related_name='thrift_reward')
    family_key = models.CharField(max_length=24, db_index=True, help_text='f<family id>, or p<product id> for a product alone.')
    floor_date = models.DateField(help_text='The day the item reached the floor (day 1 before the program start setting).')
    starting_price = models.DecimalField(max_digits=10, decimal_places=2)
    floor_price = models.DecimalField(max_digits=10, decimal_places=2, help_text='A member never pays less: the floor share of the tag.')
    grow_days = models.PositiveSmallIntegerField(default=0, help_text='Days the reward has grown (price / 90 each).')
    reward = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_WAITING, db_index=True)
    reason = models.CharField(max_length=40, blank=True, default='')
    day = models.SmallIntegerField(default=0, help_text='The day number at the last recompute.')
    computed_on = models.DateField(db_index=True)
    exit_on = models.DateField(null=True, blank=True, db_index=True, help_text='The day it reached day 90: on the exit list.')
    # Signals (the scanner app and the register fill these from Phase 3 and 4).
    scans = models.PositiveIntegerField(default=0)
    adds = models.PositiveIntegerField(default=0)
    passes = models.PositiveIntegerField(default=0)
    feedback = models.JSONField(default=dict, blank=True, help_text='"Price feel off?" chip counts.')
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_status = models.CharField(max_length=20, blank=True, default='', help_text="The item's status when it left the floor.")
    reward_at_close = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-reward']

    def __str__(self):
        return f'{self.item_id}: {self.reward} ({self.status})'


class RewardEvent(models.Model):
    """A change of an item's reward state, with the reason. Growth inside one state is not repeated
    here: the reward on any day follows from ``grow_days``."""

    item_reward = models.ForeignKey(ItemReward, on_delete=models.CASCADE, related_name='events')
    run = models.ForeignKey(RewardRun, on_delete=models.SET_NULL, null=True, blank=True, related_name='events')
    on = models.DateField()
    day = models.SmallIntegerField()
    reward = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=10)
    reason = models.CharField(max_length=40)
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-on', '-pk']
        indexes = [models.Index(fields=['item_reward', 'on'])]

    def __str__(self):
        return f'{self.item_reward_id} {self.on} {self.reason}'
