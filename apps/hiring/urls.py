from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.hiring import public_views, views

router = DefaultRouter()
router.register('jobs', views.JobViewSet, basename='hiring-job')
router.register('applications', views.ApplicationViewSet, basename='hiring-application')
router.register('interviews', views.InterviewViewSet, basename='hiring-interview')
router.register('interview-times', views.InterviewTimeViewSet, basename='hiring-interview-time')

urlpatterns = [
    path('public/careers/', public_views.careers_page, name='hiring-public-careers'),
    path('public/apply/', public_views.apply, name='hiring-public-apply'),
    path('public/interview/', public_views.interview, name='hiring-public-interview'),
    path('public/interview/cancel/', public_views.interview_cancel, name='hiring-public-interview-cancel'),
    path('careers/', views.careers_view, name='hiring-careers'),
    path('careers/check/', views.careers_check, name='hiring-careers-check'),
    path('careers/bundle/', views.careers_bundle, name='hiring-careers-bundle'),
    path('careers/public/', views.careers_public, name='hiring-careers-public'),
    path('ai/', views.ai_start, name='hiring-ai-start'),
    path('ai/<uuid:job_id>/', views.ai_status, name='hiring-ai-status'),
    path('', include(router.urls)),
]
