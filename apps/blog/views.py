"""Blog API.

  * `BlogSeriesViewSet` / `BlogPostViewSet` - Super Admin CRUD for the Blog Studio.
  * Public read endpoints (`AllowAny`): live post list, detail-by-slug, active series.
  * `blog_image` - public image proxy (keeps S3 private); `upload_blog_image` - Super Admin upload.

Public visibility flows through `BlogPost.objects.live()` everywhere.
"""
from __future__ import annotations

import os
import uuid

from django.core.files.storage import default_storage
from django.db.models import Count, Max, Q
from django.db.models.functions import Coalesce
from django.http import FileResponse, Http404, HttpResponseRedirect
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.decorators import permission_classes as perm_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsSuperAdmin
from apps.core.models import S3File

from .models import BlogImage, BlogPost, BlogPostRevision, BlogSeries
from .serializers import (
    BlogImageSerializer,
    BlogPostDetailPublicSerializer,
    BlogPostListPublicSerializer,
    BlogPostStaffSerializer,
    BlogSeriesPublicSerializer,
    BlogSeriesSerializer,
)

_STAFF_PERMS = [IsAuthenticated, IsSuperAdmin]


def _parse_dt(value):
    """Parse an ISO datetime string into an aware datetime (or None)."""
    if not value:
        return None
    dt = parse_datetime(value)
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


# ── Staff: series ─────────────────────────────────────────────────────────────

class BlogSeriesViewSet(viewsets.ModelViewSet):
    """Super Admin CRUD for blog series."""

    queryset = BlogSeries.objects.all()
    serializer_class = BlogSeriesSerializer
    permission_classes = _STAFF_PERMS
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'description']
    ordering_fields = ['position', 'name', 'created_at']


# ── Staff: posts ──────────────────────────────────────────────────────────────

class BlogPostViewSet(viewsets.ModelViewSet):
    """Super Admin CRUD for blog posts (drafts + scheduled + published + archived)."""

    queryset = (
        BlogPost.objects.select_related('series', 'hero_image')
        .prefetch_related('revisions')
        .all()
    )
    serializer_class = BlogPostStaffSerializer
    permission_classes = _STAFF_PERMS
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'series']
    search_fields = ['title', 'excerpt', 'body_text', 'tags']
    ordering_fields = ['created_at', 'updated_at', 'published_at', 'scheduled_for', 'title', 'status']
    ordering = ['-updated_at']

    def _snapshot(self, post: BlogPost, user):
        number = (post.revisions.aggregate(m=Max('number'))['m'] or 0) + 1
        BlogPostRevision.objects.create(
            post=post,
            number=number,
            title=post.title,
            excerpt=post.excerpt,
            body_json=post.body_json,
            body_html=post.body_html,
            status=post.status,
            created_by=user,
        )

    def perform_create(self, serializer):
        post = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        self._snapshot(post, self.request.user)

    def perform_update(self, serializer):
        instance = serializer.instance
        # Slug lock: once a post has been published it owns a public URL - never let a
        # later edit silently change it.
        if instance.published_at and 'slug' in serializer.validated_data:
            serializer.validated_data.pop('slug', None)
        post = serializer.save(updated_by=self.request.user)
        self._snapshot(post, self.request.user)

    def _respond(self, post: BlogPost):
        return Response(self.get_serializer(post).data)

    @action(detail=True, methods=['post'], url_path='publish-now')
    def publish_now(self, request, pk=None):
        post = self.get_object()
        post.status = BlogPost.STATUS_PUBLISHED
        post.scheduled_for = None
        if post.published_at is None:
            post.published_at = timezone.now()
        post.save()
        self._snapshot(post, request.user)
        return self._respond(post)

    @action(detail=True, methods=['post'])
    def schedule(self, request, pk=None):
        post = self.get_object()
        dt = _parse_dt(request.data.get('scheduled_for'))
        if dt is None:
            return Response({'detail': 'A valid scheduled_for datetime is required.'}, status=400)
        post.status = BlogPost.STATUS_SCHEDULED
        post.scheduled_for = dt
        post.published_at = None
        post.save()
        self._snapshot(post, request.user)
        return self._respond(post)

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        post = self.get_object()
        post.status = BlogPost.STATUS_ARCHIVED
        post.save()
        self._snapshot(post, request.user)
        return self._respond(post)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        src = self.get_object()
        copy = BlogPost(
            title=f'Copy of {src.title}'[:200],
            series=src.series,
            author_name=src.author_name,
            author_role=src.author_role,
            excerpt=src.excerpt,
            tags=src.tags,
            hero_image=src.hero_image,
            hero_alt=src.hero_alt,
            meta_title=src.meta_title,
            meta_description=src.meta_description,
            status=BlogPost.STATUS_DRAFT,
            created_by=request.user,
            updated_by=request.user,
        )
        copy.apply_body(body_html=src.body_html, body_json=src.body_json)
        copy.save()
        self._snapshot(copy, request.user)
        return Response(self.get_serializer(copy).data, status=201)

    @action(detail=True, methods=['post'], url_path='restore-revision')
    def restore_revision(self, request, pk=None):
        post = self.get_object()
        try:
            rev = post.revisions.get(pk=request.data.get('revision'))
        except (BlogPostRevision.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'Revision not found.'}, status=404)
        post.title = rev.title
        post.excerpt = rev.excerpt
        post.apply_body(body_html=rev.body_html, body_json=rev.body_json)
        post.updated_by = request.user
        post.save()
        self._snapshot(post, request.user)
        return self._respond(post)


# ── Images ────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@perm_classes(_STAFF_PERMS)
def upload_blog_image(request):
    """Super Admin: upload a hero or inline image; returns the proxied URL."""
    file = request.FILES.get('file')
    if not file:
        return Response({'detail': 'No file provided.'}, status=400)
    ext = os.path.splitext(file.name or '')[1].lower() or '.jpg'
    key = f'blog/images/{uuid.uuid4().hex}{ext}'
    saved_path = default_storage.save(key, file)
    s3_file = S3File.objects.create(
        key=saved_path,
        filename=file.name or saved_path.split('/')[-1],
        size=getattr(file, 'size', 0) or 0,
        content_type=getattr(file, 'content_type', '') or '',
        uploaded_by=request.user,
    )
    image = BlogImage.objects.create(
        s3_file=s3_file,
        alt=request.data.get('alt', ''),
        uploaded_by=request.user,
    )
    return Response(BlogImageSerializer(image).data, status=201)


def blog_image(request, image_id):
    """Public image proxy. Keeps the S3 bucket private: 302 → presigned URL on S3, or
    streams the bytes from storage in local dev. Mirrors `apps.webstore.views.listing_image`.
    """
    try:
        image = BlogImage.objects.select_related('s3_file').get(pk=image_id)
    except BlogImage.DoesNotExist:
        raise Http404('Image not found.')

    key = image.s3_file.key
    try:
        url = default_storage.url(key)
    except Exception:
        url = None

    if url and str(url).lower().startswith(('http://', 'https://')):
        response = HttpResponseRedirect(url)
        response['Cache-Control'] = 'public, max-age=300'
        return response

    try:
        handle = default_storage.open(key, 'rb')
    except (OSError, FileNotFoundError):
        raise Http404('Image file missing.')
    response = FileResponse(
        handle, content_type=image.s3_file.content_type or 'application/octet-stream',
    )
    response['Cache-Control'] = 'public, max-age=300'
    return response


# ── Public read endpoints ─────────────────────────────────────────────────────

@api_view(['GET'])
@perm_classes([AllowAny])
def public_blog_list(request):
    """All live posts, newest first (by effective publish/scheduled date)."""
    qs = (
        BlogPost.objects.live()
        .select_related('series', 'hero_image')
        .annotate(_eff=Coalesce('published_at', 'scheduled_for'))
        .order_by('-_eff', '-created_at')
    )
    series = request.query_params.get('series')
    if series:
        qs = qs.filter(series__slug=series)
    return Response(BlogPostListPublicSerializer(list(qs), many=True).data)


@api_view(['GET'])
@perm_classes([AllowAny])
def public_blog_detail(request, slug):
    """One live post by slug (404 for drafts / future scheduled / archived)."""
    try:
        post = (
            BlogPost.objects.live()
            .select_related('series', 'hero_image')
            .get(slug=slug)
        )
    except BlogPost.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    return Response(BlogPostDetailPublicSerializer(post).data)


@api_view(['GET'])
@perm_classes([AllowAny])
def public_blog_series(request):
    """Active series with live-post counts (for grouping / filters)."""
    now = timezone.now()
    live_filter = Q(posts__status=BlogPost.STATUS_PUBLISHED) | Q(
        posts__status=BlogPost.STATUS_SCHEDULED, posts__scheduled_for__lte=now,
    )
    series = (
        BlogSeries.objects.filter(is_active=True)
        .annotate(post_count=Count('posts', filter=live_filter, distinct=True))
        .order_by('position', 'name')
    )
    return Response(BlogSeriesPublicSerializer(series, many=True).data)
