from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    RetailGradesView,
    RoutineRunViewSet,
    RoutineSubmissionViewSet,
    RoutineViewSet,
    SectionViewSet,
    WorkCyclePromptView,
)

router = DefaultRouter()
router.register(r'routines', RoutineViewSet, basename='routine')
router.register(r'runs', RoutineRunViewSet, basename='routinerun')
router.register(r'submissions', RoutineSubmissionViewSet, basename='routinesubmission')
router.register(r'sections', SectionViewSet, basename='routinesection')

urlpatterns = [
    path('grades/', RetailGradesView.as_view(), name='routine-grades'),
    path('work-cycle/prompt/', WorkCyclePromptView.as_view(), name='work-cycle-prompt'),
    path('', include(router.urls)),
]
