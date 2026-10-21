from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet, TimeEntryViewSet, TimeEntryModificationRequestViewSet,
    ShiftViewSet, ShiftAssignmentViewSet,
    pay_period_numbers_view, pay_period_close_view, pay_period_reopen_view,
)
from . import kiosk_views as kiosk

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'time-entries', TimeEntryViewSet, basename='timeentry')
router.register(r'modification-requests', TimeEntryModificationRequestViewSet, basename='modrequest')
router.register(r'shifts', ShiftViewSet, basename='shift')
router.register(r'shift-assignments', ShiftAssignmentViewSet, basename='shiftassignment')

urlpatterns = [
    # Pay numbers for QuickBooks and the period lock (superuser): ?date_from= any day in the period.
    path('pay-periods/numbers/', pay_period_numbers_view, name='pay-period-numbers'),
    path('pay-periods/close/', pay_period_close_view, name='pay-period-close'),
    path('pay-periods/reopen/', pay_period_reopen_view, name='pay-period-reopen'),
    # Hosted kiosk: staff JWT host, hr.kiosk:use
    path('kiosk/board/', kiosk.KioskBoardView.as_view(), name='kiosk-board'),
    path('kiosk/identify/', kiosk.KioskIdentifyView.as_view(), name='kiosk-identify'),
    path('kiosk/clock-in/', kiosk.KioskClockInView.as_view(), name='kiosk-clock-in'),
    path('kiosk/clock-out/', kiosk.KioskClockOutView.as_view(), name='kiosk-clock-out'),
    path('kiosk/break/', kiosk.KioskBreakView.as_view(), name='kiosk-break'),
    path('kiosk/set-shift/', kiosk.KioskSetShiftView.as_view(), name='kiosk-set-shift'),
    path('kiosk/request-edit/', kiosk.KioskRequestEditView.as_view(), name='kiosk-request-edit'),
    path('kiosk/fix-stale/', kiosk.KioskFixStaleView.as_view(), name='kiosk-fix-stale'),
    path('kiosk/exit/', kiosk.KioskExitView.as_view(), name='kiosk-exit'),
    # Public clock: AllowAny, card only
    path('clock/board/', kiosk.ClockBoardView.as_view(), name='clock-board'),
    path('clock/identify/', kiosk.ClockIdentifyView.as_view(), name='clock-identify'),
    path('clock/clock-in/', kiosk.ClockClockInView.as_view(), name='clock-clock-in'),
    path('clock/clock-out/', kiosk.ClockClockOutView.as_view(), name='clock-clock-out'),
    path('clock/break/', kiosk.ClockBreakView.as_view(), name='clock-break'),
    path('clock/fix-stale/', kiosk.ClockFixStaleView.as_view(), name='clock-fix-stale'),
    path('', include(router.urls)),
]
