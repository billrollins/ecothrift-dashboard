from django.conf import settings
from django.db import models

# What a store-map pin on the Signage layer points at (MapLayer.ref_type / MapPin.ref_type).
SIGN_REF_TYPE = 'signage.sign'


class Sign(models.Model):
    """One store sign (#106, Bill 2026-11-12): its print PDF, where it is in the making, and how many are up.

    Where each copy hangs is a pin on the Signage layer of the store map (``floorplan.MapPin`` with
    ``ref_type='signage.sign'`` and ``ref_id`` = this sign).

    #122 (Bill 2026-11-12): a sign starts as a **draft**. Staff vote whether it is needed and rank its versions; a
    manager approves it into **production** with the winning version (its PDF becomes the sign's print file).
    """
    STAGE_DRAFT = 'draft'
    STAGE_PRODUCTION = 'production'
    STAGE_CHOICES = [
        (STAGE_DRAFT, 'Draft'),
        (STAGE_PRODUCTION, 'Production'),
    ]
    KIND_SIGN = 'sign'
    KIND_THEME = 'theme'
    KIND_CHOICES = [
        (KIND_SIGN, 'Sign'),
        (KIND_THEME, 'Theme'),
    ]
    STATUS_TO_MAKE = 'to_make'
    STATUS_PRINTED = 'printed'
    STATUS_UP = 'up'
    STATUS_CHOICES = [
        (STATUS_TO_MAKE, 'To make'),
        (STATUS_PRINTED, 'Printed'),
        (STATUS_UP, 'Up'),
    ]

    name = models.CharField(max_length=120)
    stage = models.CharField(max_length=12, choices=STAGE_CHOICES, default=STAGE_DRAFT, db_index=True)
    kind = models.CharField(
        max_length=10, choices=KIND_CHOICES, default=KIND_SIGN, help_text='A sign, or a theme (a look the signs share).',
    )
    slug = models.SlugField(
        max_length=80, unique=True, null=True, blank=True,
        help_text='The draft package name (load_sign_drafts finds the sign by it).',
    )
    dash_update = models.PositiveIntegerField(null=True, blank=True, help_text='The Dash Update it came from.')
    location = models.CharField(
        max_length=255, blank=True, default='', help_text='Where it goes, in words (the map pins are exact).',
    )
    quantity = models.PositiveSmallIntegerField(default=1, help_text='How many copies the store needs.')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_TO_MAKE)
    copies_up = models.PositiveSmallIntegerField(default=0)
    note = models.TextField(blank=True, default='')
    pdf = models.ForeignKey(
        'core.S3File', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
        help_text='The file to print, in the shared file store.',
    )
    chosen_version = models.ForeignKey(
        'SignVersion', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
        help_text='The version in production (its PNG is the preview; its PDF was copied to pdf).',
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
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


class SignVersion(models.Model):
    """One version of a sign (#122): its PDF to print and a PNG preview, both in the shared file store."""
    sign = models.ForeignKey(Sign, on_delete=models.CASCADE, related_name='versions')
    label = models.CharField(max_length=120)
    pdf = models.ForeignKey('core.S3File', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    preview = models.ForeignKey('core.S3File', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    position = models.PositiveSmallIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['position', 'id']

    def __str__(self):
        return f'{self.sign.name}: {self.label}'


class SignNeedVote(models.Model):
    """One person's yes/no on whether a draft sign is needed (#122). They can change it."""
    sign = models.ForeignKey(Sign, on_delete=models.CASCADE, related_name='need_votes')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    needed = models.BooleanField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['sign', 'user'], name='signage_one_need_vote_per_person')]


class SignVersionRank(models.Model):
    """The rank one person gave one version (#122): 1 = their best, then 2, 3... in the order they picked."""
    sign = models.ForeignKey(Sign, on_delete=models.CASCADE, related_name='ranks')
    version = models.ForeignKey(SignVersion, on_delete=models.CASCADE, related_name='ranks')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    rank = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ['rank']
        constraints = [
            models.UniqueConstraint(fields=['version', 'user'], name='signage_one_rank_per_version_person'),
            models.UniqueConstraint(fields=['sign', 'user', 'rank'], name='signage_rank_used_once'),
        ]


class SignNote(models.Model):
    """A note anyone on staff leaves on a sign (#122): "I think it needs to be more...". Not a vote; always shown."""
    sign = models.ForeignKey(Sign, on_delete=models.CASCADE, related_name='notes')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+')
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
