"""Blog models for the Eco-Thrift public site, authored from the staff Blog Studio.

Separate from the curated store catalog (`apps.webstore`): this is editorial content
(series + posts) shown on `ecothrift.us/blog`. Visibility for every public reader
(list, detail, Home, sitemap) flows through one place — ``BlogPost.objects.live()`` —
so scheduling logic can never drift between readers.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify

from .sanitize import clean_blog_html, html_to_text, reading_minutes, word_count


class BlogSeries(models.Model):
    """A named collection of posts (e.g. "Early days")."""

    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField(blank=True, default='')
    position = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['position', 'name']
        verbose_name_plural = 'blog series'

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:120] or 'series'
            slug = base
            suffix = 1
            while BlogSeries.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f'{base}-{suffix}'
                suffix += 1
            self.slug = slug
        super().save(*args, **kwargs)


class BlogImage(models.Model):
    """A blog image (hero or inline), backed by a `core.S3File`.

    Posts reference these by id; the public proxy (`/api/blog/images/<id>/`) only serves
    files that have a row here, so the global S3 file table is never exposed publicly.
    """

    s3_file = models.ForeignKey(
        'core.S3File', on_delete=models.CASCADE, related_name='blog_images',
    )
    alt = models.CharField(max_length=200, blank=True, default='')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'blog-image:{self.pk}'

    @property
    def url(self) -> str:
        return f'/api/blog/images/{self.pk}/'


class BlogPostQuerySet(models.QuerySet):
    def live(self, now=None):
        """Posts visible to the public: published, or scheduled with a past time."""
        now = now or timezone.now()
        return self.filter(
            Q(status=BlogPost.STATUS_PUBLISHED)
            | Q(status=BlogPost.STATUS_SCHEDULED, scheduled_for__lte=now)
        )


class BlogPost(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_SCHEDULED = 'scheduled'
    STATUS_PUBLISHED = 'published'
    STATUS_ARCHIVED = 'archived'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_SCHEDULED, 'Scheduled'),
        (STATUS_PUBLISHED, 'Published'),
        (STATUS_ARCHIVED, 'Archived'),
    ]

    # Identity
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    series = models.ForeignKey(
        BlogSeries, on_delete=models.SET_NULL, null=True, blank=True, related_name='posts',
    )
    author_name = models.CharField(max_length=120, default='Bill Rollins')
    author_role = models.CharField(max_length=160, blank=True, default='Founder & CEO, Eco-Thrift')

    # Editorial body
    excerpt = models.TextField(blank=True, default='')
    body_json = models.JSONField(default=dict, blank=True)  # TipTap document (source of truth)
    body_html = models.TextField(blank=True, default='')    # sanitized, for public render
    body_text = models.TextField(blank=True, default='')    # plain-text projection (search/meta)
    tags = models.CharField(max_length=300, blank=True, default='')  # comma-separated (v1)

    # Hero / social
    hero_image = models.ForeignKey(
        BlogImage, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    hero_alt = models.CharField(max_length=200, blank=True, default='')

    # Status + timing
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    scheduled_for = models.DateTimeField(null=True, blank=True)

    # SEO
    meta_title = models.CharField(max_length=200, blank=True, default='')
    meta_description = models.CharField(max_length=320, blank=True, default='')

    # Audit
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='blog_posts_created',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='blog_posts_updated',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = BlogPostQuerySet.as_manager()

    class Meta:
        ordering = ['-published_at', '-created_at']
        indexes = [
            models.Index(fields=['status', 'scheduled_for']),
            models.Index(fields=['status', 'published_at']),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:200] or 'post'
            slug = base
            suffix = 1
            while BlogPost.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f'{base}-{suffix}'
                suffix += 1
            self.slug = slug
        if self.status == self.STATUS_PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)

    def apply_body(self, *, body_html=None, body_json=None):
        """Sanitize + store the body from either HTML or TipTap JSON.

        Always recomputes ``body_html`` (sanitized) and ``body_text`` so stored content is
        safe regardless of entry point (API or seed command).
        """
        if body_json is not None:
            self.body_json = body_json
        if body_html is not None:
            self.body_html = clean_blog_html(body_html)
            self.body_text = html_to_text(self.body_html)

    @property
    def is_live(self) -> bool:
        if self.status == self.STATUS_PUBLISHED:
            return True
        if self.status == self.STATUS_SCHEDULED and self.scheduled_for:
            return self.scheduled_for <= timezone.now()
        return False

    @property
    def live_date(self):
        """Effective public date (published time, else scheduled time)."""
        return self.published_at or self.scheduled_for

    @property
    def tags_list(self) -> list[str]:
        return [t.strip() for t in (self.tags or '').split(',') if t.strip()]

    @property
    def word_count(self) -> int:
        return word_count(self.body_text)

    @property
    def reading_minutes(self) -> int:
        return reading_minutes(self.body_text)


class BlogPostRevision(models.Model):
    """A lightweight snapshot of a post, written on each staff save.

    Enables "restore previous version" and the revision counter in the studio footer.
    """

    post = models.ForeignKey(BlogPost, on_delete=models.CASCADE, related_name='revisions')
    number = models.PositiveIntegerField(default=1)
    title = models.CharField(max_length=200)
    excerpt = models.TextField(blank=True, default='')
    body_json = models.JSONField(default=dict, blank=True)
    body_html = models.TextField(blank=True, default='')
    status = models.CharField(max_length=12, default=BlogPost.STATUS_DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-number', '-created_at']
        unique_together = [('post', 'number')]

    def __str__(self):
        return f'{self.post_id}:rev{self.number}'
