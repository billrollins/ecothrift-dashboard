from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.hiring import public_views, views

router = DefaultRouter()
router.register('jobs', views.JobViewSet, basename='hiring-job')
router.register('applications', views.ApplicationViewSet, basename='hiring-application')

urlpatterns = [
    path('public/careers/', public_views.careers_page, name='hiring-public-careers'),
    path('public/apply/', public_views.apply, name='hiring-public-apply'),
    path('careers/', views.careers_view, name='hiring-careers'),
    path('careers/check/', views.careers_check, name='hiring-careers-check'),
    path('careers/bundle/', views.careers_bundle, name='hiring-careers-bundle'),
    path('careers/public/', views.careers_public, name='hiring-careers-public'),
    path('careers/ai-draft/', views.careers_ai_draft, name='hiring-careers-ai-draft'),
    path('', include(router.urls)),
]
