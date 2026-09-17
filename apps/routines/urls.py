from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .qa_views import (
    QaAssignView,
    QaCallInUndoView,
    QaCallInView,
    QaExcludeView,
    QaLeftEarlyView,
    QaOverrideView,
    QaCrossChecksView,
    QaFlagReviewView,
    QaFlagsView,
    QaHistoryView,
    QaMineView,
    QaAckNudgeView,
    QaNudgeView,
    QaPendingNudgesView,
    QaPeopleView,
    QaPersonView,
    QaPreviewView,
    QaRoutinesView,
    QaSpotsView,
    QaTodayView,
    QaTrendsView,
    QaWeekView,
)
from .views import (
    RoutineRunViewSet,
    RoutineSubmissionViewSet,
    RoutineViewSet,
    SectionViewSet,
    TodayView,
    WorkCyclePromptView,
)

router = DefaultRouter()
router.register(r'routines', RoutineViewSet, basename='routine')
router.register(r'runs', RoutineRunViewSet, basename='routinerun')
router.register(r'submissions', RoutineSubmissionViewSet, basename='routinesubmission')
router.register(r'sections', SectionViewSet, basename='routinesection')

urlpatterns = [
    path('today/', TodayView.as_view(), name='routine-today'),
    path('work-cycle/prompt/', WorkCyclePromptView.as_view(), name='work-cycle-prompt'),
    path('qa/week/', QaWeekView.as_view(), name='qa-week'),
    path('qa/today/', QaTodayView.as_view(), name='qa-today'),
    path('qa/board/assign/', QaAssignView.as_view(), name='qa-assign'),
    path('qa/call-in/', QaCallInView.as_view(), name='qa-call-in'),
    path('qa/call-in/<int:pk>/', QaCallInUndoView.as_view(), name='qa-call-in-undo'),
    path('qa/nudge/', QaNudgeView.as_view(), name='qa-nudge'),
    path('qa/nudges/pending/', QaPendingNudgesView.as_view(), name='qa-nudges-pending'),
    path('qa/nudges/<int:pk>/ack/', QaAckNudgeView.as_view(), name='qa-nudge-ack'),
    path('qa/left-early/', QaLeftEarlyView.as_view(), name='qa-left-early'),
    path('qa/exclude/', QaExcludeView.as_view(), name='qa-exclude'),
    path('qa/override/', QaOverrideView.as_view(), name='qa-override'),
    path('qa/spots/', QaSpotsView.as_view(), name='qa-spots'),
    path('qa/cross-checks/', QaCrossChecksView.as_view(), name='qa-cross-checks'),
    path('qa/flags/', QaFlagsView.as_view(), name='qa-flags'),
    path('qa/flags/<int:pk>/review/', QaFlagReviewView.as_view(), name='qa-flag-review'),
    path('qa/routines/', QaRoutinesView.as_view(), name='qa-routines'),
    path('qa/people/', QaPeopleView.as_view(), name='qa-people'),
    path('qa/people/<int:pk>/', QaPersonView.as_view(), name='qa-person'),
    path('qa/trends/', QaTrendsView.as_view(), name='qa-trends'),
    path('qa/mine/', QaMineView.as_view(), name='qa-mine'),
    path('qa/preview/', QaPreviewView.as_view(), name='qa-preview'),
    path('qa/history/', QaHistoryView.as_view(), name='qa-history'),
    path('', include(router.urls)),
]
