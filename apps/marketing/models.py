"""Social Studio (Lane F Phase 2): the photo library and the week's posts.

Photos are a shared library, apart from posts (owner, 2026-10-21): staff stock real photos on the floor, and the
poster builds a post from them later, even from home. A post uses library photos through `SocialPostPhoto`, in
order; each goes out as its own image. A photo of an item (its tag scanned) carries the item's tag overlay (owner
2026-10-22, F6: photo overlays, not templates; `services/tags.py`). A photo is "used" while any post holds it, so
the library can show the unused ones.

One post per day (`slot_date`): the week's cadence makes the rows (`services/cadence.py`), and the poster fills
them in. Posting is copy and paste for now (owner call F5): Studio copies the text and saves the images, and the
poster pastes the Facebook link back to mark it Posted.
"""
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class SocialPhoto(models.Model):
    """One real photo in the library (the "Photo dump")."""

    image = models.FileField(upload_to='marketing/photos/')
    thumbnail = models.FileField(upload_to='marketing/photos/', blank=True, default='')
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    category = models.CharField(max_length=100, blank=True, default='', help_text='Taxonomy v1 category, optional.')
    item = models.ForeignKey(
        'inventory.Item', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
        help_text='The item in the photo, when its tag was scanned.',
    )
    note = models.CharField(max_length=255, blank=True, default='')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True, db_index=True)
    taken_at = models.DateTimeField(null=True, blank=True, help_text="The phone's time for the file, when sent.")
    is_archived = models.BooleanField(default=False)

    CORNER_CHOICES = [('bl', 'Bottom left'), ('br', 'Bottom right'), ('tl', 'Top left'), ('tr', 'Top right')]
    tag_overlay = models.BooleanField(
        default=True, help_text="Draw the item's tag (price, returns, ThriftBucks) on the photo. Only with an item.",
    )
    tag_corner = models.CharField(max_length=2, choices=CORNER_CHOICES, default='bl')
    edited_at = models.DateTimeField(null=True, blank=True, help_text='When the photo was last cropped or adjusted.')

    class Meta:
        ordering = ['-uploaded_at', '-id']

    def __str__(self):
        return f'photo {self.pk}'


class SocialPost(models.Model):
    TYPE_NEW = 'new_this_week'
    TYPE_SPOTLIGHT = 'category_spotlight'
    TYPE_COMING = 'coming_soon'
    TYPE_WEEKEND = 'weekend_pick'
    TYPE_LIVE = 'live_from_floor'
    TYPE_SCHEDULED = 'scheduled'
    TYPE_CHOICES = [
        (TYPE_NEW, 'New this week'),
        (TYPE_SPOTLIGHT, 'Category spotlight'),
        (TYPE_COMING, 'Coming soon / behind the scenes'),
        (TYPE_WEEKEND, 'Weekend pick + Thrift+'),
        (TYPE_LIVE, 'Live from the floor'),
        (TYPE_SCHEDULED, 'Scheduled (closed days)'),
    ]

    STATUS_DRAFT = 'draft'
    STATUS_READY = 'ready'
    STATUS_POSTED = 'posted'
    STATUS_CHOICES = [(STATUS_DRAFT, 'Draft'), (STATUS_READY, 'Ready'), (STATUS_POSTED, 'Posted')]

    # Retired 2026-10-22 (F6: each photo is its own image). The column stays so old posts keep their value.
    LAYOUT_HERO = 'hero'
    LAYOUT_HERO3 = 'hero3'
    LAYOUT_GRID4 = 'grid4'
    LAYOUT_CHOICES = [(LAYOUT_HERO, 'Single hero'), (LAYOUT_HERO3, 'Hero + 3'), (LAYOUT_GRID4, '2 x 2 grid')]
    LAYOUT_ZONES = {LAYOUT_HERO: 1, LAYOUT_HERO3: 4, LAYOUT_GRID4: 4}

    # Facebook feed sizes now; 9:16 (stories) joins in Phase 5.
    SIZE_SQUARE = '1:1'
    SIZE_PORTRAIT = '4:5'
    SIZE_CHOICES = [(SIZE_SQUARE, 'Square 1:1'), (SIZE_PORTRAIT, 'Portrait 4:5')]

    CTA_COME_IN = 'come_in'
    CTA_MESSAGE = 'message_us'
    CTA_HOLD = 'ask_hold'
    CTA_CHOICES = [(CTA_COME_IN, 'Come in'), (CTA_MESSAGE, 'Message us'), (CTA_HOLD, 'Ask for a hold')]

    # The post ideas AI (services/ideas.py) keeps its ideas in `ai_brief`; using one sets source=ai.
    SOURCE_MANUAL = 'manual'
    SOURCE_AI = 'ai'
    SOURCE_CHOICES = [(SOURCE_MANUAL, 'Manual'), (SOURCE_AI, 'AI draft')]

    slot_date = models.DateField(unique=True)
    post_type = models.CharField(max_length=24, choices=TYPE_CHOICES)
    category = models.CharField(max_length=100, blank=True, default='')
    hook = models.CharField(max_length=200, blank=True, default='')
    body = models.TextField(blank=True, default='')
    call_to_action = models.CharField(max_length=16, choices=CTA_CHOICES, blank=True, default='')
    layout = models.CharField(max_length=10, choices=LAYOUT_CHOICES, default=LAYOUT_HERO3)
    size = models.CharField(max_length=8, choices=SIZE_CHOICES, default=SIZE_PORTRAIT)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default=SOURCE_MANUAL)
    ai_brief = models.JSONField(null=True, blank=True)
    photos = models.ManyToManyField(SocialPhoto, through='SocialPostPhoto', related_name='posts', blank=True)
    posted_url = models.URLField(max_length=500, blank=True, default='')
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    rating = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="The owner's 1-5 quality mark.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['slot_date']

    def __str__(self):
        return f'{self.slot_date} {self.post_type}'


class SocialPostPhoto(models.Model):
    """A library photo in a post, in order: positions below the zone count fill the frame."""

    post = models.ForeignKey(SocialPost, on_delete=models.CASCADE, related_name='post_photos')
    photo = models.ForeignKey(SocialPhoto, on_delete=models.PROTECT, related_name='post_photos')
    position = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ['position']
        constraints = [
            models.UniqueConstraint(fields=['post', 'position'], name='marketing_post_photo_position'),
            models.UniqueConstraint(fields=['post', 'photo'], name='marketing_post_photo_once'),
        ]

    def __str__(self):
        return f'post {self.post_id} #{self.position}: photo {self.photo_id}'


CHANNEL_FACEBOOK = 'facebook'
CHANNEL_CHOICES = [(CHANNEL_FACEBOOK, 'Facebook')]  # Phase 6 adds Instagram, Google Business Profile, Nextdoor, TikTok.


class SocialPostNumbers(models.Model):
    """How a posted post did, typed from the channel's insights at 1 day and 7 days (Phase 5; pulled from Meta once
    the owner makes the Meta app, owner call F5)."""

    MARK_DAY = 1
    MARK_WEEK = 7
    MARK_CHOICES = [(MARK_DAY, 'After 1 day'), (MARK_WEEK, 'After 7 days')]

    post = models.ForeignKey(SocialPost, on_delete=models.CASCADE, related_name='numbers')
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, default=CHANNEL_FACEBOOK)
    mark = models.PositiveSmallIntegerField(choices=MARK_CHOICES)
    reach = models.PositiveIntegerField(default=0)
    reactions = models.PositiveIntegerField(default=0)
    comments = models.PositiveIntegerField(default=0)
    shares = models.PositiveIntegerField(default=0)
    messages = models.PositiveIntegerField(default=0)
    link_clicks = models.PositiveIntegerField(default=0)
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    entered_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['post', 'channel', 'mark']
        constraints = [
            models.UniqueConstraint(fields=['post', 'channel', 'mark'], name='marketing_post_numbers_once'),
        ]

    @property
    def engagement(self) -> int:
        return self.reactions + self.comments + self.shares + self.messages + self.link_clicks

    def __str__(self):
        return f'post {self.post_id} {self.channel} day {self.mark}'


class MarketingSpend(models.Model):
    """The marketing spend ledger (owner call F3: $0 to start; the ledger is here so a small boost test can be
    judged later). Boosts, print, events; optionally tied to the post it paid for."""

    KIND_BOOST = 'boost'
    KIND_PRINT = 'print'
    KIND_EVENT = 'event'
    KIND_OTHER = 'other'
    KIND_CHOICES = [(KIND_BOOST, 'Boost (paid post)'), (KIND_PRINT, 'Print'), (KIND_EVENT, 'Event'), (KIND_OTHER, 'Other')]

    day = models.DateField(db_index=True)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    note = models.CharField(max_length=255, blank=True, default='')
    post = models.ForeignKey(SocialPost, on_delete=models.SET_NULL, null=True, blank=True, related_name='spend')
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, blank=True, default='')
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-day', '-id']

    def __str__(self):
        return f'{self.day} {self.kind} {self.amount}'
