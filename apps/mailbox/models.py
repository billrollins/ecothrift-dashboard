from django.db import models


class MailMessage(models.Model):
    CLASSIFICATION_CHOICES = [
        ('online_sales', 'Online Sales'),
        ('general', 'General'),
        ('unknown', 'Unknown'),
    ]

    graph_message_id = models.CharField(max_length=512, unique=True)
    graph_conversation_id = models.CharField(max_length=512, blank=True, default='', db_index=True)
    from_email = models.EmailField(blank=True, default='', db_index=True)
    to_emails = models.JSONField(default=list, blank=True)
    subject = models.CharField(max_length=998, blank=True, default='')
    html_body = models.TextField(blank=True, default='')
    text_body = models.TextField(blank=True, default='')
    received_at = models.DateTimeField(null=True, blank=True, db_index=True)
    is_read = models.BooleanField(default=False)
    classification = models.CharField(
        max_length=20,
        choices=CLASSIFICATION_CHOICES,
        default='unknown',
        db_index=True,
    )
    conversation = models.ForeignKey(
        'webstore.Conversation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mail_messages',
    )
    attachment_names = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-received_at', '-id']

    def __str__(self):
        return self.subject or self.graph_message_id


class MailSyncState(models.Model):
    singleton_key = models.CharField(max_length=20, unique=True, default='inbox')
    last_sync_at = models.DateTimeField(null=True, blank=True)
    delta_link = models.TextField(blank=True, default='')

    def __str__(self):
        return self.singleton_key


class EmailTemplate(models.Model):
    key = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=160)
    subject = models.CharField(max_length=998)
    html_body = models.TextField()
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'key']

    def __str__(self):
        return self.name
