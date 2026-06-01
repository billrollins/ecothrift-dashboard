from django.contrib import admin

from .models import BlogImage, BlogPost, BlogPostRevision, BlogSeries


@admin.register(BlogSeries)
class BlogSeriesAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'position', 'is_active')
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ('name',)


@admin.register(BlogPost)
class BlogPostAdmin(admin.ModelAdmin):
    list_display = ('title', 'series', 'status', 'published_at', 'scheduled_for', 'updated_at')
    list_filter = ('status', 'series')
    search_fields = ('title', 'slug', 'excerpt', 'body_text')
    raw_id_fields = ('hero_image', 'series', 'created_by', 'updated_by')
    readonly_fields = ('body_text', 'created_at', 'updated_at')


@admin.register(BlogPostRevision)
class BlogPostRevisionAdmin(admin.ModelAdmin):
    list_display = ('post', 'number', 'status', 'created_at', 'created_by')
    raw_id_fields = ('post', 'created_by')


@admin.register(BlogImage)
class BlogImageAdmin(admin.ModelAdmin):
    list_display = ('id', 'alt', 'created_at', 'uploaded_by')
    raw_id_fields = ('s3_file', 'uploaded_by')
