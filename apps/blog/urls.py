from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BlogPostViewSet,
    BlogSeriesViewSet,
    blog_image,
    public_blog_detail,
    public_blog_list,
    public_blog_series,
    upload_blog_image,
)

router = DefaultRouter()
router.register(r'series', BlogSeriesViewSet, basename='blogseries')
router.register(r'posts', BlogPostViewSet, basename='blogpost')

urlpatterns = [
    # Public read endpoints (AllowAny). `public/...` keeps these clear of the staff router.
    path('public/posts/', public_blog_list, name='blog-public-list'),
    path('public/posts/<slug:slug>/', public_blog_detail, name='blog-public-detail'),
    path('public/series/', public_blog_series, name='blog-public-series'),
    # Image proxy (public GET) + upload (Super Admin POST).
    path('images/', upload_blog_image, name='blog-image-upload'),
    path('images/<int:image_id>/', blog_image, name='blog-image'),
    # Staff CRUD (auth + IsSuperAdmin).
    path('', include(router.urls)),
]
