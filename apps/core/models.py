from django.conf import settings
from django.db import models


class WorkLocation(models.Model):
    """Physical work location."""
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True, default='')
    phone = models.CharField(max_length=30, blank=True, default='')
    timezone = models.CharField(max_length=50, default='America/Chicago')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class AppSetting(models.Model):
    """Key-value store for app-wide configuration."""
    key = models.CharField(max_length=100, unique=True)
    value = models.JSONField()
    description = models.CharField(max_length=255, blank=True, default='')
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']

    def __str__(self):
        return self.key


class AppSettingHistory(models.Model):
    """Who changed an AppSetting, from what, to what."""

    key = models.CharField(max_length=100, db_index=True)
    old_value = models.JSONField(null=True)
    new_value = models.JSONField(null=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-changed_at']
        indexes = [
            models.Index(fields=['key', 'changed_at']),
        ]

    def __str__(self):
        return f'{self.key} @ {self.changed_at}'


class S3File(models.Model):
    """Tracks files uploaded to S3."""
    key = models.CharField(max_length=500, unique=True)
    filename = models.CharField(max_length=255)
    size = models.IntegerField(default=0)
    content_type = models.CharField(max_length=100, blank=True, default='')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return self.filename

    @property
    def url(self):
        """Generate a download URL for this file."""
        from django.core.files.storage import default_storage
        try:
            return default_storage.url(self.key)
        except Exception:
            return None


class PrintServerRelease(models.Model):
    """Tracks print server versions uploaded to S3."""
    version = models.CharField(max_length=20, unique=True)
    s3_file = models.ForeignKey(S3File, on_delete=models.CASCADE)
    release_notes = models.TextField(blank=True, default='')
    is_current = models.BooleanField(default=False)
    released_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    released_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-released_at']

    def __str__(self):
        return f'PrintServer v{self.version}'


class EnhancementRequest(models.Model):
    """Staff ask for a Restoration or Processing change. Superuser triages it."""

    AREA_RESTORATION = 'restoration'
    AREA_PROCESSING = 'processing'
    AREA_CHOICES = [
        (AREA_RESTORATION, 'Restoration'),
        (AREA_PROCESSING, 'Processing'),
    ]

    STATUS_OPEN = 'open'
    STATUS_PLANNED = 'planned'
    STATUS_DONE = 'done'
    STATUS_DECLINED = 'declined'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_PLANNED, 'Planned'),
        (STATUS_DONE, 'Done'),
        (STATUS_DECLINED, 'Declined'),
    ]

    PRIORITY_UNSET = 'unset'
    PRIORITY_LOW = 'low'
    PRIORITY_MEDIUM = 'medium'
    PRIORITY_HIGH = 'high'
    PRIORITY_CHOICES = [
        (PRIORITY_UNSET, 'Unset'),
        (PRIORITY_LOW, 'Low'),
        (PRIORITY_MEDIUM, 'Medium'),
        (PRIORITY_HIGH, 'High'),
    ]

    area = models.CharField(max_length=20, choices=AREA_CHOICES)
    body = models.TextField()
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='enhancement_requests',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default=PRIORITY_UNSET)
    target_date = models.DateField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='enhancement_requests_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['area', 'status']),
            models.Index(fields=['priority', 'target_date']),
        ]

    def __str__(self):
        return f'{self.get_area_display()} · {self.body[:48]}'


class EnhancementRequestNote(models.Model):
    """One comment on an enhancement request. Flat list, not a thread."""

    request = models.ForeignKey(
        EnhancementRequest,
        on_delete=models.CASCADE,
        related_name='notes',
    )
    body = models.TextField()
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='enhancement_request_notes',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self):
        return self.body[:48]


class AiModel(models.Model):
    """One model id the Settings > AI dropdowns can offer."""

    PROVIDER_ANTHROPIC = 'anthropic'
    PROVIDER_XAI = 'xai'
    PROVIDER_GOOGLE = 'google'
    PROVIDER_CHOICES = [
        (PROVIDER_ANTHROPIC, 'Anthropic'),
        (PROVIDER_XAI, 'xAI'),
        (PROVIDER_GOOGLE, 'Google'),
    ]
    MODALITY_TEXT = 'text'
    MODALITY_IMAGE = 'image'
    MODALITY_CHOICES = [
        (MODALITY_TEXT, 'Text'),
        (MODALITY_IMAGE, 'Image'),
    ]
    STATUS_ACTIVE = 'active'
    STATUS_ARCHIVED = 'archived'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_ARCHIVED, 'Archived'),
    ]
    SOURCE_MANUAL = 'manual'
    SOURCE_DISCOVERED = 'discovered'
    SOURCE_CHOICES = [
        (SOURCE_MANUAL, 'Added by hand'),
        (SOURCE_DISCOVERED, 'Found by check'),
    ]

    slug = models.CharField(max_length=100, unique=True)
    label = models.CharField(max_length=200, blank=True, default='')
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    modality = models.CharField(max_length=10, choices=MODALITY_CHOICES, default=MODALITY_TEXT)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    source = models.CharField(max_length=12, choices=SOURCE_CHOICES, default=SOURCE_MANUAL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['provider', 'slug']

    def __str__(self):
        return self.slug


class AiAction(models.Model):
    """Model + effort for one AI purpose. A blank model means use the .env value."""

    EFFORT_OFF = 'off'
    EFFORT_LOW = 'low'
    EFFORT_MEDIUM = 'medium'
    EFFORT_HIGH = 'high'
    EFFORT_MAX = 'max'
    EFFORT_CHOICES = [
        (EFFORT_OFF, 'Off'),
        (EFFORT_LOW, 'Low'),
        (EFFORT_MEDIUM, 'Medium'),
        (EFFORT_HIGH, 'High'),
        (EFFORT_MAX, 'Max'),
    ]

    purpose = models.CharField(max_length=64, unique=True)
    label = models.CharField(max_length=120)
    modality = models.CharField(
        max_length=10, choices=AiModel.MODALITY_CHOICES, default=AiModel.MODALITY_TEXT,
    )
    model = models.ForeignKey(
        AiModel, on_delete=models.SET_NULL, null=True, blank=True, related_name='actions',
    )
    effort = models.CharField(max_length=10, choices=EFFORT_CHOICES, default=EFFORT_OFF)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['purpose']

    def __str__(self):
        return self.purpose
