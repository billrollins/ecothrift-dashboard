"""PDF documents with placed fields and per-person signing."""
from __future__ import annotations

from django.conf import settings
from django.db import models


class Document(models.Model):
    MODE_SIGN = 'sign'
    MODE_ACKNOWLEDGE = 'acknowledge'
    MODE_READ = 'read'
    MODE_CHOICES = [
        (MODE_SIGN, 'Sign'),
        (MODE_ACKNOWLEDGE, 'Acknowledge'),
        (MODE_READ, 'Read'),
    ]

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    file = models.ForeignKey(
        'core.S3File',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='documents',
    )
    page_count = models.PositiveIntegerField(default=0)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default=MODE_SIGN)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='documents_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return self.title


class DocumentField(models.Model):
    KIND_SIGNATURE = 'signature'
    KIND_INITIALS = 'initials'
    KIND_DATE = 'date'
    KIND_TEXT = 'text'
    KIND_CHECKBOX = 'checkbox'
    KIND_CHOICES = [
        (KIND_SIGNATURE, 'Signature'),
        (KIND_INITIALS, 'Initials'),
        (KIND_DATE, 'Date'),
        (KIND_TEXT, 'Text'),
        (KIND_CHECKBOX, 'Checkbox'),
    ]

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='fields')
    page = models.PositiveSmallIntegerField(default=0)
    x_pct = models.FloatField()
    y_pct = models.FloatField()
    w_pct = models.FloatField()
    h_pct = models.FloatField()
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    label = models.CharField(max_length=80, blank=True, default='')
    required = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f'{self.document.title} {self.kind} p{self.page}'


class DocumentAssignment(models.Model):
    AUDIENCE_PERSON = 'person'
    AUDIENCE_EVERYONE = 'everyone'
    AUDIENCE_ROLE = 'role'
    AUDIENCE_DEPARTMENT = 'department'
    AUDIENCE_CHOICES = [
        (AUDIENCE_PERSON, 'Person'),
        (AUDIENCE_EVERYONE, 'Everyone'),
        (AUDIENCE_ROLE, 'Role'),
        (AUDIENCE_DEPARTMENT, 'Department'),
    ]

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='assignments')
    audience = models.CharField(max_length=20, choices=AUDIENCE_CHOICES)
    assigned_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='document_assignments_named',
    )
    assigned_role = models.CharField(max_length=40, blank=True, default='')
    assigned_department = models.ForeignKey(
        'hr.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='document_assignments',
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='document_assignments_sent',
    )
    due_at = models.DateTimeField(null=True, blank=True)
    message = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.document.title} → {self.audience}'


class DocumentRecipient(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_VIEWED = 'viewed'
    STATUS_COMPLETED = 'completed'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_VIEWED, 'Viewed'),
        (STATUS_COMPLETED, 'Completed'),
    ]

    assignment = models.ForeignKey(
        DocumentAssignment, on_delete=models.CASCADE, related_name='recipients',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='document_recipients',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    opened_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    signed_file = models.ForeignKey(
        'core.S3File',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='signed_documents',
    )
    audit = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-id']
        constraints = [
            models.UniqueConstraint(
                fields=['assignment', 'user'],
                name='documents_recipient_assignment_user',
            ),
        ]

    def __str__(self):
        return f'{self.assignment.document.title} → {self.user_id}'


class DocumentFieldValue(models.Model):
    recipient = models.ForeignKey(
        DocumentRecipient, on_delete=models.CASCADE, related_name='field_values',
    )
    field = models.ForeignKey(DocumentField, on_delete=models.CASCADE, related_name='values')
    value_text = models.TextField(blank=True, default='')
    value_file = models.ForeignKey(
        'core.S3File',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='document_field_values',
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['recipient', 'field'],
                name='documents_fieldvalue_recipient_field',
            ),
        ]
