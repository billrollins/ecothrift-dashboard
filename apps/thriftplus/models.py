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
    # A staff member's own membership: no monthly cover while the owner's "Thrift+ free for staff" is on (2026-10-07).
    staff_user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='thrift_plus_account',
    )
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
    email = models.CharField(max_length=254, blank=True, default='', db_index=True,
                             help_text='Lower-cased. Where receipts and the updates they asked for go (email-first, T73).')
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


# ── The register (thrift_plus_rewards Phase 3) ──────────────────────────────────


class CartMember(models.Model):
    """The member on a register sale: who showed the card, and the trip's bank-or-instant choice."""

    CHOICE_INSTANT = 'instant'
    CHOICE_BANK = 'bank'
    CHOICE_CHOICES = [(CHOICE_INSTANT, 'Instant rebate'), (CHOICE_BANK, 'Bank my rewards')]

    cart = models.OneToOneField('pos.Cart', on_delete=models.CASCADE, primary_key=True, related_name='thrift_member')
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='carts')
    person = models.ForeignKey(Person, on_delete=models.PROTECT, related_name='+')
    card = models.ForeignKey(Card, on_delete=models.PROTECT, related_name='+')
    reward_choice = models.CharField(max_length=10, choices=CHOICE_CHOICES, default=CHOICE_INSTANT)
    credit_used = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text='Store credit spent on this sale.')
    bank_used = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text='Banked rewards spent on this sale.')
    rering = models.BooleanField(default=False, help_text='Attached after the sale was completed (re-ring as a member).')
    attached_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    attached_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'cart {self.cart_id}: account {self.account_id}'


class LedgerEntry(models.Model):
    """
    Money on a membership, as rows that are never edited: the monthly cover, banked rewards and
    store credit. A balance is a sum. A sale writes one row per line and kind, so a return or a
    void reverses exactly that line.
    """

    KIND_COVER = 'cover'
    KIND_BANK = 'bank'
    KIND_CREDIT = 'credit'
    KIND_CHOICES = [(KIND_COVER, 'Monthly cover'), (KIND_BANK, 'Banked rewards'), (KIND_CREDIT, 'Store credit')]

    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='ledger')
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2, help_text='Signed: + adds to the balance or cover, - takes away.')
    month = models.CharField(max_length=7, blank=True, default='', help_text='YYYY-MM, for the cover.')
    reason = models.CharField(max_length=20, help_text='sale, void, return, rering, spend, adjust.')
    cart = models.ForeignKey('pos.Cart', on_delete=models.SET_NULL, null=True, blank=True, related_name='thrift_ledger')
    cart_line_id = models.BigIntegerField(null=True, blank=True)
    item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    reverses = models.OneToOneField('self', on_delete=models.PROTECT, null=True, blank=True, related_name='reversed_by')
    note = models.CharField(max_length=200, blank=True, default='')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at', '-pk']
        indexes = [models.Index(fields=['account', 'kind', 'month'])]

    def __str__(self):
        return f'{self.account_id} {self.kind} {self.amount} ({self.reason})'


class RestrictedProduct(models.Model):
    """A product that sells only to a verified 18+ card while Thrift+ is live at the register."""

    product = models.OneToOneField('inventory.Product', on_delete=models.CASCADE, primary_key=True, related_name='thrift_restriction')
    reason = models.CharField(max_length=120, blank=True, default='')
    marked_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    marked_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'18+ product {self.product_id}'


class SalePhoto(models.Model):
    """The serial number and condition of a $100+ item, photographed when a member buys it."""

    cart_line = models.ForeignKey('pos.CartLine', on_delete=models.CASCADE, related_name='thrift_photos')
    photo = models.FileField(upload_to='thriftplus/sale_photos/')
    taken_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    taken_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'photo for line {self.cart_line_id}'


class ReturnRecord(models.Model):
    """A member return: a primary-function failure, within the window, refunded as store credit."""

    STATUS_OPEN = 'open'
    STATUS_DONE = 'done'
    STATUS_CHOICES = [(STATUS_OPEN, 'Waiting for staff'), (STATUS_DONE, 'Handled')]

    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='returns')
    person = models.ForeignKey(Person, on_delete=models.PROTECT, related_name='+')
    cart_line = models.OneToOneField('pos.CartLine', on_delete=models.PROTECT, related_name='thrift_return')
    item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    paid = models.DecimalField(max_digits=10, decimal_places=2, help_text='The store credit given: 95% of what was paid for the line, before tax.')
    note = models.TextField(blank=True, default='', help_text="What doesn't work.")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_OPEN, help_text='Staff decide what happens to the item.')
    returned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'return of line {self.cart_line_id} ({self.paid})'


# ── The customer side: sign-in, the scanner app's cart and signals (Phase 4) ─────


class MemberLogin(models.Model):
    """A person's own sign-in for the scanner app and portal: email (and an optional username) and a
    password (Django's hasher). It is not a Django user and can't reach anything staff-side."""

    person = models.OneToOneField(Person, on_delete=models.CASCADE, related_name='login')
    email = models.CharField(max_length=254, unique=True, help_text='Lower-cased.')
    username = models.CharField(max_length=30, unique=True, null=True, blank=True, help_text='Lower-cased; optional.')
    password = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.email


class MemberSession(models.Model):
    """A signed-in phone. Only a keyed hash of the token is kept; the phone holds the token in an
    httpOnly cookie scoped to the public Thrift+ API."""

    KIND_PASSWORD = 'password'
    KIND_CARD = 'card'
    KIND_CHOICES = [(KIND_PASSWORD, 'Email or username and password'), (KIND_CARD, 'Card and phone digits')]

    token_hash = models.CharField(max_length=64, unique=True)
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name='sessions')
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    last_seen_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    user_agent = models.CharField(max_length=200, blank=True, default='')

    def __str__(self):
        return f'session {self.pk} for person {self.person_id}'


class MemberResetToken(models.Model):
    """A password reset link, one use, short-lived. Only a keyed hash of the token is kept."""

    login = models.ForeignKey(MemberLogin, on_delete=models.CASCADE, related_name='resets')
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class AppCart(models.Model):
    """A member's cart in the scanner app: an estimate (the register is the source of truth). One per
    account; the trip's bank-or-instant answer rides along to the register."""

    account = models.OneToOneField(Account, on_delete=models.CASCADE, related_name='app_cart')
    reward_choice = models.CharField(max_length=10, blank=True, default='', help_text="'bank', 'instant', or '' until asked.")
    choice_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class AppCartLine(models.Model):
    cart = models.ForeignKey(AppCart, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey('inventory.Item', on_delete=models.CASCADE, related_name='+')
    qty = models.PositiveSmallIntegerField(default=1)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['added_at', 'pk']
        constraints = [models.UniqueConstraint(fields=['cart', 'item'], name='thriftplus_appcartline_cart_item_uniq')]


class ScanSignal(models.Model):
    """What shoppers did with a tag in the scanner app: scan, add, pass, a price feel, or the trip's
    choice. Kept per event; ``ItemReward`` holds the running counts the reward engine reads."""

    KIND_CHOICES = [('scan', 'Scan'), ('add', 'Add'), ('pass', 'Pass'), ('feel', 'Price feel'), ('choice', 'Bank or instant')]

    kind = models.CharField(max_length=10, choices=KIND_CHOICES, db_index=True)
    item = models.ForeignKey('inventory.Item', on_delete=models.CASCADE, null=True, blank=True, related_name='+')
    account = models.ForeignKey(Account, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
