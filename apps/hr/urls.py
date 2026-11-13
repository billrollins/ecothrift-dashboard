from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet, TimeEntryViewSet, TimeEntryModificationRequestViewSet,
    ShiftViewSet, ShiftAssignmentViewSet,
    pay_period_numbers_view, pay_period_close_view, pay_period_reopen_view,
)
from . import schedule_views as sched
from . import question_views
from . import incident_views

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'time-entries', TimeEntryViewSet, basename='timeentry')
router.register(r'modification-requests', TimeEntryModificationRequestViewSet, basename='modrequest')
router.register(r'shifts', ShiftViewSet, basename='shift')
router.register(r'shift-assignments', ShiftAssignmentViewSet, basename='shiftassignment')
# The week schedule and call-ins (owner 2026-10-21).
router.register(r'schedule/shifts', sched.ScheduledShiftViewSet, basename='scheduledshift')
router.register(r'schedule/requests', sched.ScheduleRequestViewSet, basename='schedulerequest')
router.register(r'call-ins', sched.CallInViewSet, basename='callin')
# HR questions in the HR app's Requests tab (#59).
router.register(r'questions', question_views.HrQuestionViewSet, basename='hrquestion')
# Incident reports in the HR app's Incidents tab (#131).
router.register(r'incidents', incident_views.IncidentReportViewSet, basename='incident')

urlpatterns = [
    # Pay numbers for QuickBooks and the period lock (superuser): ?date_from= any day in the period.
    path('pay-periods/numbers/', pay_period_numbers_view, name='pay-period-numbers'),
    path('pay-periods/close/', pay_period_close_view, name='pay-period-close'),
    path('pay-periods/reopen/', pay_period_reopen_view, name='pay-period-reopen'),
    path('schedule/week/', sched.schedule_week_view, name='schedule-week'),
    path('schedule/copy-week/', sched.schedule_copy_week_view, name='schedule-copy-week'),
    path('schedule/fill-usual/', sched.schedule_fill_usual_view, name='schedule-fill-usual'),
    path('schedule/clear-week/', sched.schedule_clear_week_view, name='schedule-clear-week'),
    path('schedule/my-week/', sched.my_week_view, name='schedule-my-week'),
    # Wi-Fi time clock pilot (D23): store PC helper (device token), email answers, setup request
    path('', include(router.urls)),
]
