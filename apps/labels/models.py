"""Custom Label Studio models.

A ``CustomLabel`` is a persistent, printable label owned by staff:

  * ``kind="pdf"``      - a saved PDF on S3, printed as-is × N copies.
  * ``kind="template"`` - a structured definition (size, optional S3 background image,
    text elements bound to variables) rendered monochrome at print time.

Definitions live in Postgres (``definition`` JSON, validated by
``apps.labels.definition.validate_definition``); media lives on S3 via ``core.S3File``
(webstore/blog upload pattern). This catalog is parallel to - and does not replace -
the product price/QR label pipeline in ``printserver/services/label_printer.py``.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.text import slugify


class CustomLabel(models.Model):
    KIND_PDF = 'pdf'
    KIND_TEMPLATE = 'template'
    KIND_CHOICES = [
        (KIND_PDF, 'PDF'),
        (KIND_TEMPLATE, 'Template'),
    ]

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)

    # Physical size in inches. Required for templates (drives aspect + render size);
    # informational for PDFs in Phase 1.
    width_in = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    height_in = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    # Template definition (variables + text elements). Empty dict for PDFs.
    definition = models.JSONField(default=dict, blank=True)

    background = models.ForeignKey(
        'core.S3File', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='label_backgrounds',
    )
    pdf_file = models.ForeignKey(
        'core.S3File', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='label_pdfs',
    )

    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='custom_labels_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [models.Index(fields=['is_active', 'kind'])]

    def __str__(self):
        return f'{self.name} ({self.kind})'

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:120] or 'label'
            slug = base
            suffix = 1
            while CustomLabel.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f'{base}-{suffix}'
                suffix += 1
            self.slug = slug
        super().save(*args, **kwargs)
