from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.hiring import checkin_views as chk, onboarding_views as onb, public_views, views

router = DefaultRouter()
router.register('jobs', views.JobViewSet, basename='hiring-job')
router.register('applications', views.ApplicationViewSet, basename='hiring-application')
router.register('interviews', views.InterviewViewSet, basename='hiring-interview')
router.register('interview-times', views.InterviewTimeViewSet, basename='hiring-interview-time')
router.register('offers', views.OfferViewSet, basename='hiring-offer')

urlpatterns = [
    path('public/careers/', public_views.careers_page, name='hiring-public-careers'),
    path('public/apply/', public_views.apply, name='hiring-public-apply'),
    path('public/interview/', public_views.interview, name='hiring-public-interview'),
    path('public/interview/cancel/', public_views.interview_cancel, name='hiring-public-interview-cancel'),
    path('public/offer/', public_views.offer, name='hiring-public-offer'),
    path('public/offer/sign/', public_views.offer_sign, name='hiring-public-offer-sign'),
    path('public/offer/decline/', public_views.offer_decline, name='hiring-public-offer-decline'),
    path('public/offer/pdf/', public_views.offer_pdf, name='hiring-public-offer-pdf'),
    path('careers/', views.careers_view, name='hiring-careers'),
    path('careers/check/', views.careers_check, name='hiring-careers-check'),
    path('careers/bundle/', views.careers_bundle, name='hiring-careers-bundle'),
    path('careers/public/', views.careers_public, name='hiring-careers-public'),
    path('onboarding/', onb.onboarding_list, name='hiring-onboarding'),
    path('onboarding/people/', onb.onboarding_people, name='hiring-onboarding-people'),
    path('onboarding/<int:pk>/', onb.onboarding_detail, name='hiring-onboarding-detail'),
    path('onboarding/<int:pk>/tasks/<int:task_id>/', onb.onboarding_task, name='hiring-onboarding-task'),
    path('onboarding/<int:pk>/first-day-email/', onb.onboarding_first_day, name='hiring-onboarding-first-day'),
    path('onboarding/<int:pk>/cancel/', onb.onboarding_cancel, name='hiring-onboarding-cancel'),
    path('onboarding/<int:pk>/set-password-link/', onb.onboarding_password_link, name='hiring-onboarding-password'),
    path('onboarding/<int:pk>/i9/', onb.i9_detail, name='hiring-i9'),
    path('onboarding/<int:pk>/i9/files/', onb.i9_files, name='hiring-i9-files'),
    path('onboarding/<int:pk>/i9/files/<int:file_id>/', onb.i9_file, name='hiring-i9-file'),
    path('onboarding/<int:pk>/i9/section2/', onb.i9_section2, name='hiring-i9-section2'),
    path('handbook/', onb.handbook, name='hiring-handbook'),
    path('handbook/publish/', onb.handbook_publish, name='hiring-handbook-publish'),
    path('handbook/signatures/<int:signature_id>/pdf/', onb.handbook_signature_pdf, name='hiring-handbook-pdf'),
    path('checkins/', chk.checkin_list, name='hiring-checkins'),
    path('checkins/schedule/', chk.checkin_schedule, name='hiring-checkins-schedule'),
    path('checkins/<int:pk>/', chk.checkin_detail, name='hiring-checkin'),
    path('checkins/<int:pk>/sign/', chk.checkin_sign, name='hiring-checkin-sign'),
    path('checkins/<int:pk>/skip/', chk.checkin_skip, name='hiring-checkin-skip'),
    path('checkins/<int:pk>/pdf/', chk.checkin_pdf, name='hiring-checkin-pdf'),
    path('me/checkins/', chk.my_checkins, name='hiring-my-checkins'),
    path('me/onboarding/', onb.my_onboarding, name='hiring-my-onboarding'),
    path('me/onboarding/tasks/<int:task_id>/', onb.my_task, name='hiring-my-task'),
    path('me/emergency-contact/', onb.my_emergency_contact, name='hiring-my-emergency-contact'),
    path('me/handbook/sign/', onb.my_handbook_sign, name='hiring-my-handbook-sign'),
    path('ai/', views.ai_start, name='hiring-ai-start'),
    path('ai/<uuid:job_id>/', views.ai_status, name='hiring-ai-status'),
    path('', include(router.urls)),
]
