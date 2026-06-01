"""Serializers for the blog.

Two audiences:
  * Staff (Blog Studio CRUD) — `BlogPostStaffSerializer` / `BlogSeriesSerializer` (Super Admin).
  * Public site — `BlogPost{List,Detail}PublicSerializer` / `BlogSeriesPublicSerializer`.

Image URLs always point at the host-agnostic proxy (`/api/blog/images/<id>/`) so S3 can
stay private. Body HTML submitted by staff is sanitized on write (see `models.apply_body`).
"""
from __future__ import annotations

from rest_framework import serializers

from .models import BlogImage, BlogPost, BlogSeries


def _hero_payload(post: BlogPost):
    hero = post.hero_image
    if not hero:
        return None
    return {'id': hero.id, 'url': hero.url, 'alt': post.hero_alt or hero.alt or post.title}


# ── Images ────────────────────────────────────────────────────────────────────

class BlogImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = BlogImage
        fields = ['id', 'alt', 'url', 'created_at']
        read_only_fields = ['id', 'url', 'created_at']

    def get_url(self, obj) -> str:
        return obj.url


# ── Series ──────────────────────────────────────────────────────────────────

class BlogSeriesSerializer(serializers.ModelSerializer):
    """Staff read/write serializer for a series."""

    post_count = serializers.IntegerField(source='posts.count', read_only=True)

    class Meta:
        model = BlogSeries
        fields = [
            'id', 'name', 'slug', 'description', 'position', 'is_active',
            'post_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'slug', 'post_count', 'created_at', 'updated_at']


class BlogSeriesPublicSerializer(serializers.ModelSerializer):
    post_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = BlogSeries
        fields = ['name', 'slug', 'description', 'post_count']


# ── Posts (staff) ─────────────────────────────────────────────────────────────

class BlogPostStaffSerializer(serializers.ModelSerializer):
    """Full read/write serializer for the Blog Studio (Super Admin)."""

    series_name = serializers.CharField(source='series.name', read_only=True, default=None)
    series_slug = serializers.CharField(source='series.slug', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    hero = serializers.SerializerMethodField()
    hero_image = serializers.PrimaryKeyRelatedField(
        queryset=BlogImage.objects.all(), allow_null=True, required=False,
    )
    is_live = serializers.BooleanField(read_only=True)
    word_count = serializers.IntegerField(read_only=True)
    reading_minutes = serializers.IntegerField(read_only=True)
    revision_count = serializers.IntegerField(source='revisions.count', read_only=True)

    class Meta:
        model = BlogPost
        fields = [
            'id', 'title', 'slug', 'series', 'series_name', 'series_slug',
            'author_name', 'author_role', 'excerpt',
            'body_json', 'body_html', 'body_text', 'tags',
            'hero_image', 'hero', 'hero_alt',
            'status', 'status_display', 'published_at', 'scheduled_for',
            'meta_title', 'meta_description',
            'is_live', 'word_count', 'reading_minutes', 'revision_count',
            'created_by', 'updated_by', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'series_name', 'series_slug', 'status_display', 'hero',
            'body_text', 'is_live', 'word_count', 'reading_minutes', 'revision_count',
            'published_at', 'created_by', 'updated_by', 'created_at', 'updated_at',
        ]

    def get_hero(self, obj):
        return _hero_payload(obj)

    def create(self, validated_data):
        body_html = validated_data.pop('body_html', '')
        body_json = validated_data.pop('body_json', None)
        post = BlogPost(**validated_data)
        post.apply_body(body_html=body_html, body_json=body_json if body_json is not None else {})
        post.save()
        return post

    def update(self, instance, validated_data):
        body_html = validated_data.pop('body_html', None)
        body_json = validated_data.pop('body_json', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if body_html is not None or body_json is not None:
            instance.apply_body(body_html=body_html, body_json=body_json)
        instance.save()
        return instance


# ── Posts (public) ────────────────────────────────────────────────────────────

class BlogPostListPublicSerializer(serializers.ModelSerializer):
    series = serializers.CharField(source='series.name', read_only=True, default='')
    series_slug = serializers.CharField(source='series.slug', read_only=True, default='')
    date = serializers.SerializerMethodField()
    date_iso = serializers.SerializerMethodField()
    hero = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()

    class Meta:
        model = BlogPost
        fields = [
            'slug', 'title', 'series', 'series_slug', 'excerpt',
            'date', 'date_iso', 'hero', 'tags', 'author_name', 'reading_minutes',
        ]

    def get_date(self, obj) -> str:
        dt = obj.live_date
        if not dt:
            return ''
        return f'{dt.strftime("%B")} {dt.day}, {dt.year}'

    def get_date_iso(self, obj) -> str:
        dt = obj.live_date
        return dt.date().isoformat() if dt else ''

    def get_hero(self, obj):
        return _hero_payload(obj)

    def get_tags(self, obj) -> list[str]:
        return obj.tags_list


class BlogPostDetailPublicSerializer(BlogPostListPublicSerializer):
    class Meta(BlogPostListPublicSerializer.Meta):
        fields = BlogPostListPublicSerializer.Meta.fields + [
            'body_html', 'author_role', 'meta_title', 'meta_description',
        ]
